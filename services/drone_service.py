# -*- coding: utf-8 -*-
"""
services/drone_service.py — Operações Drone (Missão 31)
─────────────────────────────────────────────────────────────────────────────
Gestão de missões de voo, importação de mídia e acervo aéreo do Agent Bastos.

POR QUE NÃO CLONAR O DRONEDEPLOY:
  O core caro do DroneDeploy é fotogrametria (ortomosaico/3D). O que a
  operação precisa é gestão de voos + acervo georreferenciado + relatório.
  O truque: fotos de drone DJI carregam EXIF rico (GPS, altitude, timestamp).
  Importando a pasta do cartão SD, o sistema RECONSTRÓI o voo sozinho —
  trajeto, horários e área coberta — sem nenhuma integração com o drone.

DECISÃO DE ARQUITETURA — importação por CAMINHO, não por upload:
  Voos geram 5-30 GB de mídia. Subir isso via HTTP multipart estouraria
  timeout e memória. Como backend e usuário estão na MESMA máquina,
  o endpoint recebe o caminho da pasta (ex.: E:\\DCIM\\100MEDIA) e o
  serviço copia direto do cartão SD em uma thread de background,
  reportando progresso. Padrão de mercado para ingestão local de volume.

LGPD:
  Imagens aéreas capturam pessoas e propriedades. Por isso:
  • Todo acesso/importação/exclusão gera evento no log imutável de auditoria
  • Acesso restrito ao módulo "drone" (concessão explícita por usuário)
  • Mídia fica em DATA_DIR (sobrevive a updates; ver config/paths.py)
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger("bastos.drone")

# ── Auditoria (opcional — não quebra o boot se indisponível) ─────────────────
try:
    from services.audit_service import registrar as _audit
except ImportError:  # pragma: no cover
    def _audit(**kwargs):  # type: ignore
        logger.warning("audit_service indisponivel: %s", kwargs)
        return ""

# ── Caminhos ──────────────────────────────────────────────────────────────────
from config.paths import DATA_DIR

DRONE_DIR    = Path(DATA_DIR) / "drone"
MISSIONS_DIR = DRONE_DIR / "missoes"
DB_PATH      = DRONE_DIR / "drone.db"

# Extensões aceitas (DJI: JPG/DNG para foto, MP4/MOV para vídeo)
_FOTO_EXTS  = {".jpg", ".jpeg", ".png", ".dng", ".tif", ".tiff"}
_VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv"}

_THUMB_MAX  = 480           # px, lado maior do thumbnail
_HASH_CHUNK = 1024 * 1024   # 1 MB por leitura — hash de vídeo de GBs sem estourar RAM


# ══════════════════════════════════════════════════════════════════════════════
# DB
# ══════════════════════════════════════════════════════════════════════════════

def _conn() -> sqlite3.Connection:
    DRONE_DIR.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(DB_PATH))
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    return con


def _init() -> None:
    with _conn() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS missoes (
            id                TEXT PRIMARY KEY,
            nome              TEXT NOT NULL,
            perimetro         TEXT NOT NULL DEFAULT '',
            finalidade        TEXT NOT NULL DEFAULT 'vigilancia_perimetro',
            piloto            TEXT NOT NULL DEFAULT '',
            drone_modelo      TEXT NOT NULL DEFAULT '',
            data_voo          TEXT NOT NULL,
            status            TEXT NOT NULL DEFAULT 'planejada',
            sarpas_protocolo  TEXT NOT NULL DEFAULT '',
            checklist         TEXT NOT NULL DEFAULT '{}',
            observacoes       TEXT NOT NULL DEFAULT '',
            criado_por        TEXT NOT NULL,
            criado_em         TEXT NOT NULL,
            atualizado_em     TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS midias (
            id             TEXT PRIMARY KEY,
            missao_id      TEXT NOT NULL REFERENCES missoes(id) ON DELETE CASCADE,
            arquivo        TEXT NOT NULL,
            nome_original  TEXT NOT NULL,
            tipo           TEXT NOT NULL,
            sha256         TEXT NOT NULL,
            tamanho        INTEGER NOT NULL,
            capturado_em   TEXT,
            lat            REAL,
            lon            REAL,
            alt            REAL,
            largura        INTEGER,
            altura         INTEGER,
            thumb          TEXT,
            criado_em      TEXT NOT NULL,
            UNIQUE (missao_id, sha256)
        );
        CREATE INDEX IF NOT EXISTS idx_midias_missao ON midias(missao_id);

        CREATE TABLE IF NOT EXISTS import_jobs (
            id            TEXT PRIMARY KEY,
            missao_id     TEXT NOT NULL,
            origem        TEXT NOT NULL,
            status        TEXT NOT NULL DEFAULT 'executando',
            total         INTEGER NOT NULL DEFAULT 0,
            processados   INTEGER NOT NULL DEFAULT 0,
            duplicados    INTEGER NOT NULL DEFAULT 0,
            erros         INTEGER NOT NULL DEFAULT 0,
            msg           TEXT NOT NULL DEFAULT '',
            iniciado_em   TEXT NOT NULL,
            finalizado_em TEXT
        );
        """)


_init()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ══════════════════════════════════════════════════════════════════════════════
# EXIF — o coração do módulo
# ══════════════════════════════════════════════════════════════════════════════

def _rational(v) -> float:
    """EXIF guarda números como frações (IFDRational ou tupla). Normaliza p/ float."""
    try:
        return float(v)
    except TypeError:
        num, den = v
        return float(num) / float(den or 1)


def _gps_to_decimal(dms, ref: str) -> Optional[float]:
    """
    Converte (graus, minutos, segundos) + hemisfério em grau decimal.
    Ex.: ((3,1),(6,1),(2916,100)) + 'S'  →  -3.10810
    Sul e Oeste são negativos — Manaus fica em (-3.1, -60.0).
    """
    try:
        deg = _rational(dms[0]) + _rational(dms[1]) / 60.0 + _rational(dms[2]) / 3600.0
        if ref in ("S", "W"):
            deg = -deg
        return round(deg, 7)
    except Exception:
        return None


def extrair_exif(path: Path) -> dict:
    """
    Extrai metadados de uma foto: GPS, altitude, timestamp e dimensões.
    Retorna dict com chaves possivelmente None — foto sem GPS ainda é aceita.

    Tags relevantes (padrão EXIF 2.3, usado pela DJI):
      0x8825 = GPSInfo IFD | 0x9003 = DateTimeOriginal
      GPS IFD: 1/2 = LatRef/Lat | 3/4 = LonRef/Lon | 5/6 = AltRef/Alt
    """
    out = {"capturado_em": None, "lat": None, "lon": None, "alt": None,
           "largura": None, "altura": None}
    try:
        from PIL import Image
        with Image.open(path) as img:
            out["largura"], out["altura"] = img.size
            exif = img.getexif()
            if not exif:
                return out

            dt = exif.get(0x9003) or exif.get_ifd(0x8769).get(0x9003) or exif.get(0x0132)
            if dt:
                # EXIF usa "YYYY:MM:DD HH:MM:SS" — converte p/ ISO 8601
                try:
                    out["capturado_em"] = datetime.strptime(
                        str(dt).strip(), "%Y:%m:%d %H:%M:%S"
                    ).isoformat()
                except ValueError:
                    pass

            gps = exif.get_ifd(0x8825)
            if gps:
                lat_ref = str(gps.get(1, "N"))
                lon_ref = str(gps.get(3, "E"))
                if gps.get(2):
                    out["lat"] = _gps_to_decimal(gps[2], lat_ref)
                if gps.get(4):
                    out["lon"] = _gps_to_decimal(gps[4], lon_ref)
                if gps.get(6) is not None:
                    alt = _rational(gps[6])
                    # AltRef 1 = abaixo do nível do mar
                    if gps.get(5) == 1 or gps.get(5) == b"\x01":
                        alt = -alt
                    out["alt"] = round(alt, 2)
    except Exception as exc:
        logger.debug("EXIF ilegivel em %s: %s", path.name, exc)
    return out


def _sha256_arquivo(path: Path) -> str:
    """Hash em streaming — vídeo de 10 GB usa 1 MB de RAM, não 10 GB."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(_HASH_CHUNK):
            h.update(chunk)
    return h.hexdigest()


def _gerar_thumb(src: Path, dest: Path) -> Optional[str]:
    """Thumbnail JPEG p/ galeria — a foto original 20MP nunca trafega na UI."""
    try:
        from PIL import Image
        with Image.open(src) as img:
            img = img.convert("RGB")
            img.thumbnail((_THUMB_MAX, _THUMB_MAX))
            dest.parent.mkdir(parents=True, exist_ok=True)
            img.save(dest, "JPEG", quality=72)
        return str(dest.relative_to(DRONE_DIR))
    except Exception as exc:
        logger.debug("thumb falhou p/ %s: %s", src.name, exc)
        return None


# ══════════════════════════════════════════════════════════════════════════════
# CRUD de missões
# ══════════════════════════════════════════════════════════════════════════════

def criar_missao(dados: dict, usuario: str) -> dict:
    mid = str(uuid.uuid4())
    now = _now()
    with _conn() as con:
        con.execute(
            "INSERT INTO missoes (id, nome, perimetro, finalidade, piloto, "
            "drone_modelo, data_voo, status, sarpas_protocolo, checklist, "
            "observacoes, criado_por, criado_em, atualizado_em) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                mid,
                dados["nome"].strip(),
                dados.get("perimetro", "").strip(),
                dados.get("finalidade", "vigilancia_perimetro"),
                dados.get("piloto", "").strip(),
                dados.get("drone_modelo", "").strip(),
                dados.get("data_voo") or now[:10],
                dados.get("status", "planejada"),
                dados.get("sarpas_protocolo", "").strip(),
                json.dumps(dados.get("checklist") or {}, ensure_ascii=False),
                dados.get("observacoes", "").strip(),
                usuario, now, now,
            ),
        )
    _audit(evento="missao_criada", categoria="drone", usuario=usuario,
           alvo=mid, detalhe=dados["nome"])
    return obter_missao(mid)


def listar_missoes(status: Optional[str] = None) -> list[dict]:
    sql, params = "SELECT * FROM missoes", []
    if status:
        sql += " WHERE status = ?"
        params.append(status)
    sql += " ORDER BY data_voo DESC, criado_em DESC"
    with _conn() as con:
        rows = con.execute(sql, params).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["checklist"] = json.loads(d["checklist"] or "{}")
            stats = con.execute(
                "SELECT COUNT(*) n, COALESCE(SUM(tamanho),0) bytes, "
                "SUM(tipo='foto') fotos, SUM(tipo='video') videos "
                "FROM midias WHERE missao_id=?", (d["id"],)
            ).fetchone()
            d["midia"] = {"total": stats["n"], "fotos": stats["fotos"] or 0,
                          "videos": stats["videos"] or 0, "bytes": stats["bytes"]}
            out.append(d)
        return out


def obter_missao(mid: str) -> Optional[dict]:
    with _conn() as con:
        row = con.execute("SELECT * FROM missoes WHERE id=?", (mid,)).fetchone()
        if not row:
            return None
        d = dict(row)
        d["checklist"] = json.loads(d["checklist"] or "{}")
        d["midias"] = [dict(m) for m in con.execute(
            "SELECT id, nome_original, tipo, tamanho, capturado_em, lat, lon, "
            "alt, largura, altura, thumb IS NOT NULL AS tem_thumb "
            "FROM midias WHERE missao_id=? "
            "ORDER BY capturado_em, nome_original", (mid,)
        ).fetchall()]
        return d


def atualizar_missao(mid: str, dados: dict, usuario: str) -> Optional[dict]:
    permitidos = {"nome", "perimetro", "finalidade", "piloto", "drone_modelo",
                  "data_voo", "status", "sarpas_protocolo", "checklist",
                  "observacoes"}
    campos, valores = [], []
    for k, v in dados.items():
        if k not in permitidos or v is None:
            continue
        campos.append(f"{k} = ?")
        valores.append(json.dumps(v, ensure_ascii=False) if k == "checklist" else v)
    if not campos:
        return obter_missao(mid)
    campos.append("atualizado_em = ?")
    valores += [_now(), mid]
    with _conn() as con:
        con.execute(f"UPDATE missoes SET {', '.join(campos)} WHERE id=?", valores)
    _audit(evento="missao_atualizada", categoria="drone", usuario=usuario, alvo=mid)
    return obter_missao(mid)


def excluir_missao(mid: str, usuario: str) -> bool:
    """Exclui missão + mídia física + mosaicos. Auditado — LGPD exige descarte completo."""
    missao = obter_missao(mid)
    if not missao:
        return False
    with _conn() as con:
        con.execute("DELETE FROM missoes WHERE id=?", (mid,))
        # Mosaicos da missão: registros (try/except — tabela é de outro módulo
        # e pode não existir em bancos antigos; não pode travar a exclusão)
        try:
            con.execute("DELETE FROM mosaico_jobs WHERE missao_id=?", (mid,))
        except Exception:
            pass
    pasta = MISSIONS_DIR / mid
    if pasta.exists():
        shutil.rmtree(pasta, ignore_errors=True)
    pasta_mosaicos = DRONE_DIR / "mosaicos" / mid
    if pasta_mosaicos.exists():
        shutil.rmtree(pasta_mosaicos, ignore_errors=True)
    _audit(evento="missao_excluida", categoria="drone", usuario=usuario,
           alvo=mid,
           detalhe=f"{missao['nome']} ({len(missao.get('midias', []))} midias descartadas)")
    return True


# ══════════════════════════════════════════════════════════════════════════════
# Importação de mídia (background — volumes de 5-30 GB)
# ══════════════════════════════════════════════════════════════════════════════

def iniciar_importacao(mid: str, origem: str, usuario: str) -> dict:
    """
    Valida e dispara a importação em thread separada.
    Retorna imediatamente o job — a UI acompanha via obter_job().
    """
    src = Path(origem)
    if not src.is_dir():
        raise ValueError(f"Pasta de origem nao encontrada: {origem}")
    if not obter_missao(mid):
        raise ValueError("Missao nao encontrada")

    arquivos = [p for p in sorted(src.rglob("*"))
                if p.is_file() and p.suffix.lower() in (_FOTO_EXTS | _VIDEO_EXTS)]
    if not arquivos:
        raise ValueError("Nenhuma foto/video suportado na pasta informada")

    job_id = str(uuid.uuid4())
    with _conn() as con:
        con.execute(
            "INSERT INTO import_jobs (id, missao_id, origem, total, iniciado_em) "
            "VALUES (?,?,?,?,?)",
            (job_id, mid, str(src), len(arquivos), _now()),
        )
    _audit(evento="importacao_iniciada", categoria="drone", usuario=usuario,
           alvo=mid, detalhe=f"{len(arquivos)} arquivos de {src}")

    t = threading.Thread(target=_executar_importacao,
                         args=(job_id, mid, arquivos), daemon=True)
    t.start()
    return {"job_id": job_id, "total": len(arquivos)}


def _executar_importacao(job_id: str, mid: str, arquivos: list[Path]) -> None:
    media_dir = MISSIONS_DIR / mid / "media"
    thumb_dir = MISSIONS_DIR / mid / "thumbs"
    media_dir.mkdir(parents=True, exist_ok=True)

    processados = duplicados = erros = 0
    for src in arquivos:
        try:
            tipo = "foto" if src.suffix.lower() in _FOTO_EXTS else "video"
            digest = _sha256_arquivo(src)

            with _conn() as con:
                ja_existe = con.execute(
                    "SELECT 1 FROM midias WHERE missao_id=? AND sha256=?",
                    (mid, digest),
                ).fetchone()
            if ja_existe:
                duplicados += 1
            else:
                # Nome final = hash curto + nome original → sem colisão, rastreável
                dest = media_dir / f"{digest[:12]}_{src.name}"
                shutil.copy2(src, dest)

                meta = extrair_exif(dest) if tipo == "foto" else {
                    "capturado_em": datetime.fromtimestamp(
                        src.stat().st_mtime).isoformat(),
                    "lat": None, "lon": None, "alt": None,
                    "largura": None, "altura": None,
                }
                thumb_rel = None
                if tipo == "foto":
                    thumb_rel = _gerar_thumb(
                        dest, thumb_dir / f"{digest[:12]}.jpg")

                with _conn() as con:
                    con.execute(
                        "INSERT INTO midias (id, missao_id, arquivo, "
                        "nome_original, tipo, sha256, tamanho, capturado_em, "
                        "lat, lon, alt, largura, altura, thumb, criado_em) "
                        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (
                            str(uuid.uuid4()), mid,
                            str(dest.relative_to(DRONE_DIR)),
                            src.name, tipo, digest, dest.stat().st_size,
                            meta["capturado_em"], meta["lat"], meta["lon"],
                            meta["alt"], meta["largura"], meta["altura"],
                            thumb_rel, _now(),
                        ),
                    )
            processados += 1
        except Exception as exc:
            erros += 1
            logger.error("importacao %s: falha em %s: %s", job_id, src.name, exc)

        with _conn() as con:
            con.execute(
                "UPDATE import_jobs SET processados=?, duplicados=?, erros=? "
                "WHERE id=?", (processados, duplicados, erros, job_id),
            )

    status = "concluido" if erros == 0 else "concluido_com_erros"
    with _conn() as con:
        con.execute(
            "UPDATE import_jobs SET status=?, finalizado_em=?, "
            "msg=? WHERE id=?",
            (status, _now(),
             f"{processados} processados, {duplicados} duplicados, {erros} erros",
             job_id),
        )
        # Missão com mídia importada avança automaticamente para 'realizada'
        con.execute(
            "UPDATE missoes SET status='realizada', atualizado_em=? "
            "WHERE id=? AND status='planejada'", (_now(), mid),
        )
    logger.info("importacao %s finalizada: %s", job_id, status)


def obter_job(job_id: str) -> Optional[dict]:
    with _conn() as con:
        row = con.execute("SELECT * FROM import_jobs WHERE id=?",
                          (job_id,)).fetchone()
        return dict(row) if row else None


# ══════════════════════════════════════════════════════════════════════════════
# Acesso a arquivos (galeria e trajeto)
# ══════════════════════════════════════════════════════════════════════════════

def caminho_midia(midia_id: str, thumb: bool = False) -> Optional[Path]:
    """Resolve o caminho físico de uma mídia/thumb. None se não existir."""
    with _conn() as con:
        row = con.execute("SELECT arquivo, thumb FROM midias WHERE id=?",
                          (midia_id,)).fetchone()
    if not row:
        return None
    rel = row["thumb"] if thumb else row["arquivo"]
    if not rel:
        return None
    path = (DRONE_DIR / rel).resolve()
    # Anti path-traversal: o arquivo resolvido TEM que estar dentro de DRONE_DIR
    if not str(path).startswith(str(DRONE_DIR.resolve())):
        return None
    return path if path.exists() else None


def trajeto_missao(mid: str) -> list[dict]:
    """
    Pontos GPS ordenados por horário de captura — o trajeto do voo
    reconstruído só com EXIF, sem telemetria do drone.
    """
    with _conn() as con:
        rows = con.execute(
            "SELECT id, capturado_em, lat, lon, alt FROM midias "
            "WHERE missao_id=? AND lat IS NOT NULL AND lon IS NOT NULL "
            "ORDER BY capturado_em", (mid,),
        ).fetchall()
    return [dict(r) for r in rows]
