# -*- coding: utf-8 -*-
"""
services/drone_mosaico.py — Mosaico Rápido da Varredura (Missão 31, Fase 4)
─────────────────────────────────────────────────────────────────────────────
Monta a visão geral da varredura colando cada foto no seu lugar geográfico —
SEM fotogrametria. É a técnica de "georreferenciamento direto" usada por
ferramentas de resposta rápida (Pix4Dreact, DJI Terra quick-map).

POR QUE O ODM DEMORA DIAS E ISTO DEMORA MINUTOS:
  Fotogrametria completa (ODM/DroneDeploy) descobre a posição de cada foto
  comparando milhões de pontos visuais entre pares de imagens (custo ~O(n²))
  e reconstrói a cena em 3D antes de gerar o ortomosaico.
  Aqui nós JÁ SABEMOS onde cada foto está: o EXIF/XMP da DJI traz GPS,
  altitude relativa e rumo. Calculamos a pegada de solo de cada foto e
  colamos direto num canvas georreferenciado. Custo O(n): 5.000 fotos
  viram mosaico em minutos.

O TRADE-OFF (documentado com honestidade):
  • Emendas visíveis entre fotos e desalinhamento de poucos metros
  • Sem correção de relevo (não é ortomosaico topográfico de medição)
  → Perfeito para consciência situacional do perímetro; não substitui
    o ODM --fast-orthophoto quando precisar do produto cartográfico.

GEOMETRIA (por foto):
  largura_no_solo = 2 · AGL · tan(FOV_horizontal / 2)
  AGL (altura sobre o solo): XMP RelativeAltitude da DJI (preferido),
  senão altitude do EXIF GPS, senão parâmetro padrão.
  Rumo: XMP FlightYawDegree/GimbalYawDegree; fallback = direção do voo
  (vetor entre pontos GPS consecutivos — funciona bem em voo de grade).
"""

from __future__ import annotations

import json
import logging
import math
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from services import drone_service
from services.drone_service import _audit, _conn, DRONE_DIR

logger = logging.getLogger("bastos.drone.mosaico")

MOSAICO_DIR = DRONE_DIR / "mosaicos"

# FOV horizontal típico de câmera DJI grande-angular (24 mm equiv. ≈ 71°).
# Se o EXIF trouxer FocalLengthIn35mmFilm, o FOV real é calculado.
_FOV_H_PADRAO_GRAUS = 71.0
_AGL_PADRAO_M       = 60.0

# Qualidade → (lado máx. da foto usada, GSD alvo cm/px, usa original?)
QUALIDADES = {
    "rapida": {"foto_px": 480,  "gsd_cm": 30, "original": False},  # usa thumbs
    "media":  {"foto_px": 1280, "gsd_cm": 12, "original": True},
    "alta":   {"foto_px": 2400, "gsd_cm": 6,  "original": True},
}
_CANVAS_LADO_MAX  = 12000  # px — acima disso o GSD é degradado p/ caber na RAM
_PREVIEW_LADO_MAX = 4096   # px — preview PNG transparente p/ overlay no Leaflet

# Política de retenção: mosaicos são os artefatos mais pesados do módulo
# (dezenas de MB cada). Mantemos os N mais recentes por missão; o resto é
# expurgado automaticamente ao concluir um novo — com registro na auditoria.
_MANTER_MOSAICOS = 3

_M_POR_GRAU_LAT = 110540.0


def _init() -> None:
    with _conn() as con:
        con.execute("""
        CREATE TABLE IF NOT EXISTS mosaico_jobs (
            id            TEXT PRIMARY KEY,
            missao_id     TEXT NOT NULL,
            qualidade     TEXT NOT NULL,
            status        TEXT NOT NULL DEFAULT 'executando',
            total         INTEGER NOT NULL DEFAULT 0,
            processados   INTEGER NOT NULL DEFAULT 0,
            msg           TEXT NOT NULL DEFAULT '',
            gsd_cm        REAL,
            arquivo       TEXT,
            bounds        TEXT,
            iniciado_em   TEXT NOT NULL,
            finalizado_em TEXT
        )""")


_init()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ══════════════════════════════════════════════════════════════════════════════
# Metadados por foto: XMP da DJI + EXIF
# ══════════════════════════════════════════════════════════════════════════════

def _xmp_dji(path: Path) -> dict:
    """
    A DJI grava um bloco XMP (XML em texto puro) no início do JPEG com
    RelativeAltitude (AGL real!), FlightYawDegree e GimbalPitchDegree.
    Lemos só os primeiros 128 KB — sem decodificar a imagem. GPSAltitude
    do EXIF é altitude sobre o NÍVEL DO MAR, que superestimaria a pegada;
    o XMP é o correto.
    """
    out = {"agl": None, "yaw": None, "pitch": None}
    try:
        head = path.open("rb").read(131072).decode("latin-1", errors="ignore")
        m = re.search(r'RelativeAltitude\s*[=:]\s*"?\+?(-?[\d.]+)', head)
        if m:
            out["agl"] = float(m.group(1))
        m = (re.search(r'FlightYawDegree\s*[=:]\s*"?\+?(-?[\d.]+)', head) or
             re.search(r'GimbalYawDegree\s*[=:]\s*"?\+?(-?[\d.]+)', head))
        if m:
            out["yaw"] = float(m.group(1))
        m = re.search(r'GimbalPitchDegree\s*[=:]\s*"?\+?(-?[\d.]+)', head)
        if m:
            out["pitch"] = float(m.group(1))
    except OSError:
        pass
    return out


# Nadir = câmera reto p/ baixo (pitch -90°). Toleramos até -60°: acima disso
# a foto é oblíqua — cobre um trapézio até o horizonte, não um retângulo —
# e colada como nadir borraria o mosaico. Pitch ausente (não-DJI/teste) passa.
_PITCH_NADIR_MAX = -60.0


def _e_nadir(pitch) -> bool:
    return pitch is None or pitch <= _PITCH_NADIR_MAX


def _fov_h_graus(path: Path) -> float:
    """FOV horizontal real via FocalLengthIn35mmFilm (tag 0xA405), se houver."""
    try:
        from PIL import Image
        with Image.open(path) as img:
            f35 = img.getexif().get_ifd(0x8769).get(0xA405)
        if f35:
            # largura do filme 35mm = 36 mm → FOV_h = 2·atan(18/f35)
            return math.degrees(2 * math.atan(18.0 / float(f35)))
    except Exception:
        pass
    return _FOV_H_PADRAO_GRAUS


def _rumo_pelo_voo(fotos: list[dict], i: int) -> float:
    """Bearing (graus a partir do norte) do ponto i para o próximo."""
    j = i + 1 if i + 1 < len(fotos) else i - 1
    a, b = fotos[min(i, j)], fotos[max(i, j)]
    lat0 = math.radians(a["lat"])
    d_e = (b["lon"] - a["lon"]) * _M_POR_GRAU_LAT * math.cos(lat0)
    d_n = (b["lat"] - a["lat"]) * _M_POR_GRAU_LAT
    if d_e == 0 and d_n == 0:
        return 0.0
    rumo = math.degrees(math.atan2(d_e, d_n))
    # Se calculamos "de trás pra frente" (último ponto), o rumo é o mesmo da linha
    return rumo


# ══════════════════════════════════════════════════════════════════════════════
# Montagem do mosaico
# ══════════════════════════════════════════════════════════════════════════════

def iniciar_mosaico(mid: str, qualidade: str = "rapida",
                    agl_padrao_m: float = _AGL_PADRAO_M,
                    usuario: str = "sistema") -> dict:
    if qualidade not in QUALIDADES:
        raise ValueError("Qualidade deve ser rapida, media ou alta")
    missao = drone_service.obter_missao(mid)
    if not missao:
        raise ValueError("Missão não encontrada")

    fotos = [m for m in missao["midias"]
             if m["tipo"] == "foto" and m.get("lat") is not None]
    if len(fotos) < 2:
        raise ValueError("A missão precisa de 2+ fotos com GPS")
    fotos.sort(key=lambda f: (f.get("capturado_em") or "", f["nome_original"]))

    job_id = str(uuid.uuid4())
    with _conn() as con:
        con.execute(
            "INSERT INTO mosaico_jobs (id, missao_id, qualidade, total, iniciado_em) "
            "VALUES (?,?,?,?,?)", (job_id, mid, qualidade, len(fotos), _now()))
    _audit(evento="mosaico_iniciado", categoria="drone", usuario=usuario,
           alvo=mid, detalhe=f"{len(fotos)} fotos, qualidade {qualidade}")

    t = threading.Thread(target=_executar,
                         args=(job_id, mid, fotos, qualidade, agl_padrao_m),
                         daemon=True)
    t.start()
    return {"job_id": job_id, "total": len(fotos)}


def _executar(job_id: str, mid: str, fotos: list[dict],
              qualidade: str, agl_padrao: float) -> None:
    try:
        _montar(job_id, mid, fotos, qualidade, agl_padrao)
    except Exception as exc:                       # nunca deixa o job zumbi
        logger.exception("mosaico %s falhou", job_id)
        with _conn() as con:
            con.execute("UPDATE mosaico_jobs SET status='erro', msg=?, "
                        "finalizado_em=? WHERE id=?", (str(exc), _now(), job_id))


def _montar(job_id: str, mid: str, fotos: list[dict],
            qualidade: str, agl_padrao: float) -> None:
    from PIL import Image
    cfg = QUALIDADES[qualidade]

    # ── 1. Metadados por foto: caminho, AGL, rumo, FOV ───────────────────────
    lat0 = fotos[0]["lat"]
    m_por_grau_lon = _M_POR_GRAU_LAT * math.cos(math.radians(lat0))

    prontas, obliquas = [], 0
    for i, f in enumerate(fotos):
        caminho = drone_service.caminho_midia(f["id"], thumb=not cfg["original"])
        if not caminho:
            continue
        original = drone_service.caminho_midia(f["id"], thumb=False)
        xmp = _xmp_dji(original or caminho)
        if not _e_nadir(xmp["pitch"]):
            obliquas += 1        # câmera inclinada: fora do mosaico, fica no acervo
            continue
        agl = xmp["agl"] or f.get("alt") or agl_padrao
        rumo = xmp["yaw"] if xmp["yaw"] is not None else _rumo_pelo_voo(fotos, i)
        fov = _fov_h_graus(original or caminho)
        larg_solo = 2.0 * agl * math.tan(math.radians(fov / 2))
        prontas.append({**f, "caminho": caminho, "agl": agl, "rumo": rumo,
                        "larg_solo": larg_solo})
    if not prontas:
        raise ValueError(
            "Nenhuma foto nadir acessível para o mosaico "
            f"({obliquas} oblíquas ignoradas — câmera inclinada acima de {_PITCH_NADIR_MAX}°)")

    # ── 2. Canvas georreferenciado ───────────────────────────────────────────
    # Meia diagonal de folga em cada extremo p/ a pegada não vazar do canvas
    folga = max(p["larg_solo"] for p in prontas)
    min_lat = min(p["lat"] for p in prontas) - folga / _M_POR_GRAU_LAT
    max_lat = max(p["lat"] for p in prontas) + folga / _M_POR_GRAU_LAT
    min_lon = min(p["lon"] for p in prontas) - folga / m_por_grau_lon
    max_lon = max(p["lon"] for p in prontas) + folga / m_por_grau_lon

    larg_m = (max_lon - min_lon) * m_por_grau_lon
    alt_m  = (max_lat - min_lat) * _M_POR_GRAU_LAT

    gsd_m = cfg["gsd_cm"] / 100.0
    lado = max(larg_m, alt_m) / gsd_m
    if lado > _CANVAS_LADO_MAX:                    # protege a RAM
        gsd_m = max(larg_m, alt_m) / _CANVAS_LADO_MAX
    W = max(64, int(larg_m / gsd_m))
    H = max(64, int(alt_m / gsd_m))
    # RGBA: onde não há foto fica TRANSPARENTE — o overlay no mapa só
    # mostra as fotos, sem "tapar" o OSM ao redor com fundo escuro.
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    def px(lat, lon):
        x = (lon - min_lon) * m_por_grau_lon / gsd_m
        y = (max_lat - lat) * _M_POR_GRAU_LAT / gsd_m   # norte p/ cima
        return x, y

    # ── 3. Colagem O(n), em ordem de captura (recentes por cima) ─────────────
    for i, p in enumerate(prontas):
        try:
            with Image.open(p["caminho"]) as foto:
                foto = foto.convert("RGB")
                if max(foto.size) > cfg["foto_px"]:
                    foto.thumbnail((cfg["foto_px"], cfg["foto_px"]))
                w_px = max(8, int(p["larg_solo"] / gsd_m))
                h_px = max(8, int(w_px * foto.height / foto.width))
                foto = foto.resize((w_px, h_px))
                # rumo em graus horários a partir do norte → PIL gira anti-horário
                foto = foto.convert("RGBA").rotate(-p["rumo"], expand=True)
                cx, cy = px(p["lat"], p["lon"])
                canvas.paste(foto, (int(cx - foto.width / 2),
                                    int(cy - foto.height / 2)), foto)
        except Exception as exc:
            logger.warning("mosaico %s: foto %s pulada: %s",
                           job_id, p["nome_original"], exc)
        if (i + 1) % 25 == 0 or i + 1 == len(prontas):
            with _conn() as con:
                con.execute("UPDATE mosaico_jobs SET processados=? WHERE id=?",
                            (i + 1, job_id))

    # ── 4. Salvar produtos + world files + bounds p/ Leaflet ────────────────
    dest_dir = MOSAICO_DIR / mid
    dest_dir.mkdir(parents=True, exist_ok=True)

    # Produto principal JPEG (compacto, p/ download e QGIS via world file).
    # JPEG não tem alfa — composita sobre fundo escuro.
    dest = dest_dir / f"{job_id}.jpg"
    fundo = Image.new("RGB", canvas.size, (14, 20, 33))
    fundo.paste(canvas, (0, 0), canvas)
    fundo.save(dest, "JPEG", quality=82)

    # Produto secundário TIFF (LZW comprimido, mesmo canvas).
    # Aceito pelo Google Earth Pro via "Add > Image Overlay" com o .tfw ao
    # lado, e pelo QGIS/ArcGIS como raster. LZW mantem qualidade sem perda.
    tif_path = dest_dir / f"{job_id}.tif"
    fundo.save(tif_path, "TIFF", compression="tiff_lzw")
    del fundo

    # Preview web: PNG COM TRANSPARÊNCIA, reduzido — é o que o Leaflet exibe
    preview = canvas
    if max(preview.size) > _PREVIEW_LADO_MAX:
        preview = canvas.copy()
        preview.thumbnail((_PREVIEW_LADO_MAX, _PREVIEW_LADO_MAX))
    preview.save(dest_dir / f"{job_id}_preview.png", "PNG", optimize=True)

    # World files: 6 linhas — tamanho do pixel em graus + canto sup. esq.
    # .jgw ao lado do .jpg, .tfw ao lado do .tif. Mesmo conteudo, extensoes
    # diferentes que o GIS reconhece automaticamente.
    world_lines = "\n".join(map(str, [
        gsd_m / m_por_grau_lon, 0, 0, -gsd_m / _M_POR_GRAU_LAT,
        min_lon, max_lat]))
    (dest_dir / f"{job_id}.jgw").write_text(world_lines, encoding="ascii")
    (dest_dir / f"{job_id}.tfw").write_text(world_lines, encoding="ascii")

    # KML de acompanhamento: apontando pro TIFF na mesma pasta. Usuario baixa
    # o zip, extrai, da duplo clique no KML → Google Earth abre no lugar
    # exato automaticamente, sem posicionar overlay manualmente.
    kml_body = f'''<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <GroundOverlay>
    <name>Mosaico Agent Bastos — {mid}</name>
    <description>Ortomosaico gerado em {_now()} — {W}x{H} px, {gsd_m*100:.0f} cm/px</description>
    <Icon><href>{job_id}.tif</href></Icon>
    <LatLonBox>
      <north>{max_lat}</north>
      <south>{min_lat}</south>
      <east>{max_lon}</east>
      <west>{min_lon}</west>
    </LatLonBox>
  </GroundOverlay>
</kml>
'''
    (dest_dir / f"{job_id}.kml").write_text(kml_body, encoding="utf-8")

    bounds = [[min_lat, min_lon], [max_lat, max_lon]]
    with _conn() as con:
        con.execute(
            "UPDATE mosaico_jobs SET status='concluido', msg=?, gsd_cm=?, "
            "arquivo=?, bounds=?, finalizado_em=? WHERE id=?",
            (f"{len(prontas)} fotos, {W}x{H}px, {gsd_m*100:.0f} cm/px"
             + (f", {obliquas} obliquas ignoradas" if obliquas else ""),
             round(gsd_m * 100, 1), str(dest.relative_to(DRONE_DIR)),
             json.dumps(bounds), _now(), job_id))
    logger.info("mosaico %s concluido: %dx%d px", job_id, W, H)

    # Retenção: expurga mosaicos antigos desta missão (mantém os últimos N)
    removidos = _limpar_antigos(mid)
    if removidos:
        _audit(evento="mosaicos_expurgados", categoria="drone", usuario="sistema",
               alvo=mid, detalhe=f"{removidos} mosaico(s) antigo(s) removido(s) "
                                 f"(retencao: {_MANTER_MOSAICOS} por missao)")


def _limpar_antigos(mid: str) -> int:
    """
    Mantém os _MANTER_MOSAICOS concluídos mais recentes; apaga arquivos
    (jpg + jgw + preview) e registros dos demais. Jobs com erro também saem.
    """
    with _conn() as con:
        rows = con.execute(
            "SELECT id, arquivo FROM mosaico_jobs "
            "WHERE missao_id=? AND status='concluido' "
            "ORDER BY finalizado_em DESC", (mid,)).fetchall()
    removidos = 0
    for row in rows[_MANTER_MOSAICOS:]:
        if row["arquivo"]:
            caminho = DRONE_DIR / row["arquivo"]
            # Apaga todos os subprodutos: JPG, world files, TIFF, KML, preview.
            for p in (caminho,
                      caminho.with_suffix(".jgw"),
                      caminho.with_suffix(".tif"),
                      caminho.with_suffix(".tfw"),
                      caminho.with_suffix(".kml"),
                      caminho.with_name(caminho.stem + "_preview.png")):
                p.unlink(missing_ok=True)
        with _conn() as con:
            con.execute("DELETE FROM mosaico_jobs WHERE id=?", (row["id"],))
        removidos += 1
    with _conn() as con:
        con.execute("DELETE FROM mosaico_jobs WHERE missao_id=? AND status='erro'",
                    (mid,))
    return removidos


# ══════════════════════════════════════════════════════════════════════════════
# Consulta
# ══════════════════════════════════════════════════════════════════════════════

def obter_job(job_id: str) -> Optional[dict]:
    with _conn() as con:
        row = con.execute("SELECT * FROM mosaico_jobs WHERE id=?",
                          (job_id,)).fetchone()
    if not row:
        return None
    d = dict(row)
    if d.get("bounds"):
        d["bounds"] = json.loads(d["bounds"])
    return d


def listar_mosaicos(mid: str) -> list[dict]:
    with _conn() as con:
        rows = con.execute(
            "SELECT id, qualidade, status, gsd_cm, bounds, msg, finalizado_em "
            "FROM mosaico_jobs WHERE missao_id=? AND status='concluido' "
            "ORDER BY finalizado_em DESC", (mid,)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["bounds"] = json.loads(d["bounds"]) if d.get("bounds") else None
        out.append(d)
    return out


def caminho_imagem(job_id: str, preview: bool = False) -> Optional[Path]:
    job = obter_job(job_id)
    if not job or not job.get("arquivo"):
        return None
    path = (DRONE_DIR / job["arquivo"]).resolve()
    if preview:
        path = path.with_name(path.stem + "_preview.png")
    if not str(path).startswith(str(DRONE_DIR.resolve())):
        return None
    return path if path.exists() else None


def montar_pacote_geotiff(job_id: str) -> Optional[bytes]:
    """
    Retorna um ZIP em memoria contendo .tif + .tfw + .kml do mosaico.
    O usuario extrai o zip, da duplo clique no .kml e o Google Earth Pro
    abre o mosaico no lugar exato — sem posicionar overlay manualmente.
    Se algum arquivo estiver faltando (mosaico antigo, pre-tiff), retorna
    None e o router responde 404.
    """
    import io, zipfile
    jpg = caminho_imagem(job_id)
    if not jpg:
        return None
    tif  = jpg.with_suffix(".tif")
    tfw  = jpg.with_suffix(".tfw")
    kml  = jpg.with_suffix(".kml")
    if not (tif.exists() and tfw.exists() and kml.exists()):
        return None
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(tif, arcname=tif.name)
        zf.write(tfw, arcname=tfw.name)
        zf.write(kml, arcname=kml.name)
    return buf.getvalue()
