# -*- coding: utf-8 -*-
"""
modules/audio_acervo.py — Acervo de Áudios (Fase 1 do Extrator de Áudio)
Agent Bastos

Transforma o extrator de áudio (antes: 1 arquivo → 1 laudo descartável) em um
ACERVO: toda gravação entra numa fila, é transcrita com timestamps, analisada,
guardada com cadeia de custódia e fica pesquisável.

O que faz:
  - Ingestão com SHA-256 do arquivo ORIGINAL (guardado sem alteração, somente
    leitura) e deduplicação por hash.
  - Fila persistente em SQLite + worker em thread única (1 áudio por vez — o
    servidor atual tem pouca RAM). Sobrevive a reinício do backend.
  - Áudios longos: decodifica em blocos, corta em pausas de fala (silêncio) e
    reencoda em FLAC 16 kHz mono (cada pedaço << 25 MB). Timestamps absolutos.
  - Transcrição por provedor: "groq" (nuvem) ou "local" (faster-whisper).
    GUARDRAIL DE SOBERANIA: classificação sensível NUNCA vai para a nuvem; se não
    houver transcrição local, a gravação fica 'bloqueado' (não vaza).
  - Análise: piso de risco determinístico (palavras críticas) + cruzamento com
    alvos/lideranças + resumo/flags por LLM (só p/ dado não sensível). Cada flag do
    LLM só vale com proveniência (trecho literal que bate com a transcrição).
  - Busca em texto integral (SQLite FTS5, sem acento), correção humana de
    segmentos e trilha de custódia com hash encadeado (tamper-evident).

Banco: data/audio/audio.db   Originais: data/audio/originais/
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import re
import shutil
import sqlite3
import stat
import tempfile
import threading
import time
import unicodedata
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from config.paths import DATA_DIR

log = logging.getLogger("bastos.audio")

DIR_AUDIO = DATA_DIR / "audio"
DB_PATH   = str(DIR_AUDIO / "audio.db")
DIR_ORIG  = str(DIR_AUDIO / "originais")

# ── Parâmetros ───────────────────────────────────────────────────────────────
ALVO_CHUNK_S      = 480        # pedaços de ~8 min (FLAC 16k mono ≈ 4–6 MB)
JANELA_SILENCIO_S = 20         # procura o corte numa pausa dos últimos 20 s
LIMITE_ORIGINAL   = 20 * 1024 * 1024   # abaixo disso e <10 min, envia o original
LIMITE_API        = 24 * 1024 * 1024   # limite do provedor (25 MB) com folga
JANELA_ANALISE    = 12000      # caracteres por janela de análise por LLM
EXTS_AUDIO = {".wav", ".mp3", ".mp4", ".ogg", ".webm", ".flac", ".m4a", ".mpga", ".mpeg", ".opus"}

CLASSIF_PUBLICAS = {"teste", "sintetico", "publico", "demo"}
CLASSIF_VALIDAS  = ["teste", "sintetico", "publico", "interno", "reservado", "sigiloso", "secreto"]
CLASSIF_PADRAO   = (os.getenv("AUDIO_CLASSIF_PADRAO") or "reservado").strip().lower()
STT_PROVEDOR     = (os.getenv("AUDIO_STT_PROVIDER") or "groq").strip().lower()
STT_MODELO_LOCAL = os.getenv("AUDIO_STT_MODELO_LOCAL") or "small"

_PALAVRAS_CRITICAS = [
    "fuga", "fugir", "fugiu", "tunel", "motim", "rebeliao", "arma", "armamento",
    "refem", "resgate", "drone", "granada", "explosivo", "sequestro", "execucao",
    "matar", "homicidio", "atentado", "chacina", "guerra",
]

_ws = threading.Lock()


# ── Utilidades ───────────────────────────────────────────────────────────────

def _agora() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _norm(txt: str) -> str:
    if not txt:
        return ""
    t = unicodedata.normalize("NFKD", str(txt))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t.strip().lower())


def _mmss(seg: float) -> str:
    seg = max(0, int(seg))
    h, r = divmod(seg, 3600)
    m, s = divmod(r, 60)
    return f"{h:02d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def classificacao_sensivel(c: str) -> bool:
    """Qualquer classificação fora da lista pública é tratada como sensível."""
    return _norm(c) not in CLASSIF_PUBLICAS


@contextmanager
def _conn():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA busy_timeout = 10000")
    con.execute("PRAGMA journal_mode = WAL")
    try:
        yield con
        con.commit()
    finally:
        con.close()


def init_db() -> None:
    os.makedirs(DIR_ORIG, exist_ok=True)
    with _conn() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS audios (
            id TEXT PRIMARY KEY,
            sha256 TEXT NOT NULL UNIQUE,
            nome_original TEXT NOT NULL,
            arquivo TEXT NOT NULL,
            tamanho INTEGER NOT NULL,
            formato TEXT,
            duracao_s REAL,
            unidade TEXT, local TEXT, data_gravacao TEXT,
            custodiado TEXT, interlocutor TEXT, observacoes TEXT,
            classificacao TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pendente',
            etapa TEXT, progresso INTEGER NOT NULL DEFAULT 0, erro TEXT,
            tentativas INTEGER NOT NULL DEFAULT 0,
            stt_provedor TEXT, stt_modelo TEXT,
            risco TEXT, resumo TEXT, classificacao_conteudo TEXT,
            analise_ok INTEGER NOT NULL DEFAULT 0,
            flags_json TEXT, cruzamentos_json TEXT,
            criado_em TEXT NOT NULL, criado_por TEXT,
            iniciado_em TEXT, finalizado_em TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_audios_status ON audios(status, criado_em);
        CREATE INDEX IF NOT EXISTS idx_audios_criado ON audios(criado_em DESC);

        CREATE TABLE IF NOT EXISTS segmentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            audio_id TEXT NOT NULL,
            idx INTEGER NOT NULL,
            inicio REAL NOT NULL, fim REAL NOT NULL,
            locutor TEXT,
            texto TEXT NOT NULL,
            texto_corrigido TEXT,
            confianca REAL,
            revisado_por TEXT, revisado_em TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_seg_audio ON segmentos(audio_id, idx);

        CREATE VIRTUAL TABLE IF NOT EXISTS segmentos_fts USING fts5(
            texto, content='segmentos', content_rowid='id',
            tokenize='unicode61 remove_diacritics 2'
        );
        CREATE TRIGGER IF NOT EXISTS seg_ai AFTER INSERT ON segmentos BEGIN
            INSERT INTO segmentos_fts(rowid, texto) VALUES (new.id, COALESCE(new.texto_corrigido, new.texto));
        END;
        CREATE TRIGGER IF NOT EXISTS seg_ad AFTER DELETE ON segmentos BEGIN
            INSERT INTO segmentos_fts(segmentos_fts, rowid, texto) VALUES ('delete', old.id, COALESCE(old.texto_corrigido, old.texto));
        END;
        CREATE TRIGGER IF NOT EXISTS seg_au AFTER UPDATE ON segmentos BEGIN
            INSERT INTO segmentos_fts(segmentos_fts, rowid, texto) VALUES ('delete', old.id, COALESCE(old.texto_corrigido, old.texto));
            INSERT INTO segmentos_fts(rowid, texto) VALUES (new.id, COALESCE(new.texto_corrigido, new.texto));
        END;

        CREATE TABLE IF NOT EXISTS custodia (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL, audio_id TEXT, usuario TEXT, acao TEXT NOT NULL,
            detalhe TEXT, hash_anterior TEXT NOT NULL, hash TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cust_audio ON custodia(audio_id, id);
        """)


# ── Custódia (hash encadeado) ────────────────────────────────────────────────

def _ultimo_hash(con) -> str:
    r = con.execute("SELECT hash FROM custodia ORDER BY id DESC LIMIT 1").fetchone()
    return r["hash"] if r else "GENESIS"


def _registrar(con, audio_id: str | None, usuario: str, acao: str, detalhe: str = "") -> None:
    ts = _agora()
    ant = _ultimo_hash(con)
    h = hashlib.sha256(f"{ant}|{ts}|{audio_id}|{usuario}|{acao}|{detalhe}".encode("utf-8")).hexdigest()
    con.execute(
        "INSERT INTO custodia (ts, audio_id, usuario, acao, detalhe, hash_anterior, hash) VALUES (?,?,?,?,?,?,?)",
        (ts, audio_id, usuario, acao, detalhe, ant, h),
    )


def registrar_evento(audio_id: str, usuario: str, acao: str, detalhe: str = "") -> None:
    with _ws, _conn() as con:
        _registrar(con, audio_id, usuario, acao, detalhe)


def verificar_cadeia() -> dict:
    """Confere toda a trilha de custódia. Qualquer alteração/remoção quebra a cadeia."""
    with _conn() as con:
        rows = con.execute("SELECT * FROM custodia ORDER BY id ASC").fetchall()
    ant = "GENESIS"
    for r in rows:
        h = hashlib.sha256(
            f"{ant}|{r['ts']}|{r['audio_id']}|{r['usuario']}|{r['acao']}|{r['detalhe']}".encode("utf-8")
        ).hexdigest()
        if h != r["hash"] or r["hash_anterior"] != ant:
            return {"ok": False, "rompido_em_id": r["id"], "total": len(rows)}
        ant = r["hash"]
    return {"ok": True, "total": len(rows)}


def custodia_do_audio(audio_id: str) -> list[dict]:
    with _conn() as con:
        rows = con.execute(
            "SELECT id, ts, usuario, acao, detalhe, hash FROM custodia WHERE audio_id=? ORDER BY id", (audio_id,)
        ).fetchall()
    return [dict(r) for r in rows]


# ── Ingestão ─────────────────────────────────────────────────────────────────

def _sha256_arquivo(caminho: str) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(1024 * 1024), b""):
            h.update(bloco)
    return h.hexdigest()


def _meta_limpa(meta: dict | None) -> dict:
    m = meta or {}
    campos = ("unidade", "local", "data_gravacao", "custodiado", "interlocutor", "observacoes")
    out = {c: (str(m.get(c)).strip()[:300] if m.get(c) else None) for c in campos}
    classif = _norm(m.get("classificacao") or CLASSIF_PADRAO)
    out["classificacao"] = classif if classif in CLASSIF_VALIDAS else "reservado"
    return out


def ingerir_arquivo(caminho: str, nome: str, meta: dict | None = None, usuario: str = "sistema") -> dict:
    """
    Copia o arquivo para o acervo (original intocado, somente leitura), registra o SHA-256 e
    enfileira. Se o mesmo conteúdo já existe, não duplica: devolve o registro existente.
    """
    init_db()
    ext = os.path.splitext(nome)[1].lower()
    if ext not in EXTS_AUDIO:
        raise ValueError(f"Formato não suportado: '{ext}'. Use: {', '.join(sorted(EXTS_AUDIO))}")
    tamanho = os.path.getsize(caminho)
    if tamanho == 0:
        raise ValueError("Arquivo de áudio vazio.")

    sha = _sha256_arquivo(caminho)
    with _ws, _conn() as con:
        ex = con.execute("SELECT id, status FROM audios WHERE sha256=?", (sha,)).fetchone()
        if ex:
            _registrar(con, ex["id"], usuario, "reenvio_duplicado", f"arquivo '{nome}' já existe (sha256 {sha[:16]})")
            return {"id": ex["id"], "duplicado": True, "status": ex["status"], "sha256": sha}

        rel = os.path.join(sha[:2], sha + ext)
        destino = os.path.join(DIR_ORIG, rel)
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        shutil.copyfile(caminho, destino)
        try:
            os.chmod(destino, stat.S_IREAD)   # original somente leitura
        except OSError:
            pass

        aid = uuid.uuid4().hex
        m = _meta_limpa(meta)
        con.execute(
            """INSERT INTO audios (id, sha256, nome_original, arquivo, tamanho, formato,
                   unidade, local, data_gravacao, custodiado, interlocutor, observacoes,
                   classificacao, status, criado_em, criado_por)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'pendente', ?, ?)""",
            (aid, sha, os.path.basename(nome)[:200], rel.replace("\\", "/"), tamanho, ext.lstrip("."),
             m["unidade"], m["local"], m["data_gravacao"], m["custodiado"], m["interlocutor"], m["observacoes"],
             m["classificacao"], _agora(), usuario),
        )
        _registrar(con, aid, usuario, "ingestao",
                   f"nome='{os.path.basename(nome)[:120]}' tamanho={tamanho} sha256={sha} classificacao={m['classificacao']}")
    return {"id": aid, "duplicado": False, "status": "pendente", "sha256": sha}


def ingerir_stream(fileobj, nome: str, meta: dict | None = None, usuario: str = "sistema",
                   limite_bytes: int = 2 * 1024 * 1024 * 1024) -> dict:
    """Grava um upload em arquivo temporário (com limite) e chama ingerir_arquivo."""
    ext = os.path.splitext(nome)[1].lower()
    fd, tmp = tempfile.mkstemp(suffix=ext)
    total = 0
    try:
        with os.fdopen(fd, "wb") as out:
            for bloco in iter(lambda: fileobj.read(1024 * 1024), b""):
                total += len(bloco)
                if total > limite_bytes:
                    raise ValueError("Arquivo excede o limite de 2 GB.")
                out.write(bloco)
        return ingerir_arquivo(tmp, nome, meta, usuario)
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass


def caminho_original(audio_id: str) -> str | None:
    with _conn() as con:
        r = con.execute("SELECT arquivo FROM audios WHERE id=?", (audio_id,)).fetchone()
    if not r:
        return None
    p = os.path.join(DIR_ORIG, r["arquivo"])
    return p if os.path.exists(p) else None


def verificar_integridade(audio_id: str, usuario: str = "sistema") -> dict:
    """Recalcula o SHA-256 do original e compara com o registrado na ingestão."""
    with _conn() as con:
        r = con.execute("SELECT sha256 FROM audios WHERE id=?", (audio_id,)).fetchone()
    if not r:
        return {"ok": False, "motivo": "gravação não encontrada"}
    p = caminho_original(audio_id)
    if not p:
        res = {"ok": False, "motivo": "arquivo original ausente no acervo"}
    else:
        atual = _sha256_arquivo(p)
        res = {"ok": atual == r["sha256"], "sha256_registrado": r["sha256"], "sha256_atual": atual}
    registrar_evento(audio_id, usuario, "verificacao_integridade", f"ok={res['ok']}")
    return res


# ── Consulta ─────────────────────────────────────────────────────────────────

def _row(r) -> dict:
    d = dict(r)
    for k in ("flags_json", "cruzamentos_json"):
        try:
            d[k.replace("_json", "")] = json.loads(d.pop(k) or "[]")
        except Exception:
            d[k.replace("_json", "")] = []
    return d


def obter(audio_id: str) -> dict | None:
    with _conn() as con:
        r = con.execute("SELECT * FROM audios WHERE id=?", (audio_id,)).fetchone()
    return _row(r) if r else None


def segmentos(audio_id: str) -> list[dict]:
    with _conn() as con:
        rows = con.execute(
            "SELECT id, idx, inicio, fim, locutor, texto, texto_corrigido, confianca, revisado_por, revisado_em "
            "FROM segmentos WHERE audio_id=? ORDER BY idx", (audio_id,)
        ).fetchall()
    return [dict(r) for r in rows]


def listar(status: str | None = None, risco: str | None = None, unidade: str | None = None,
           q: str | None = None, limite: int = 50, offset: int = 0) -> dict:
    where, params = [], []
    if status:
        where.append("a.status = ?"); params.append(status)
    if risco:
        where.append("a.risco = ?"); params.append(risco.upper())
    if unidade:
        where.append("a.unidade = ?"); params.append(unidade)
    if q:
        where.append("(a.nome_original LIKE ? OR a.custodiado LIKE ? OR a.interlocutor LIKE ?)")
        params += [f"%{q}%"] * 3
    sql_w = (" WHERE " + " AND ".join(where)) if where else ""
    with _conn() as con:
        total = con.execute(f"SELECT COUNT(*) c FROM audios a{sql_w}", params).fetchone()["c"]
        rows = con.execute(
            f"SELECT a.id, a.nome_original, a.formato, a.tamanho, a.duracao_s, a.unidade, a.local, a.data_gravacao, "
            f"a.custodiado, a.interlocutor, a.classificacao, a.status, a.etapa, a.progresso, a.erro, a.risco, "
            f"a.resumo, a.criado_em, a.criado_por, a.finalizado_em, a.sha256 FROM audios a{sql_w} "
            f"ORDER BY a.criado_em DESC LIMIT ? OFFSET ?",
            params + [max(1, min(limite, 200)), max(0, offset)],
        ).fetchall()
    return {"total": total, "itens": [dict(r) for r in rows]}


def _fts_query(q: str) -> str:
    """Transforma a busca do usuário em consulta FTS5 segura (todos os termos, prefixo no último)."""
    termos = re.findall(r"\w+", _norm(q))
    if not termos:
        return ""
    partes = [f'"{t}"' for t in termos[:12]]
    partes[-1] += "*"
    return " ".join(partes)


def _sem_acento_1a1(texto: str) -> str:
    """Minúsculas e sem acento, MANTENDO o comprimento (índice a índice) para mapear o destaque."""
    out = []
    for ch in texto:
        base = "".join(c for c in unicodedata.normalize("NFKD", ch) if not unicodedata.combining(c)).lower()
        out.append(base if len(base) == 1 else ch.lower())
    return "".join(out)


def _destacar(texto: str, q: str, contexto: int = 70) -> str:
    """Marca com [[ ]] os termos buscados (sem acento; o último casa por prefixo) e recorta o trecho."""
    termos = re.findall(r"\w+", _norm(q))
    if not termos:
        return texto[: contexto * 2]
    base = _sem_acento_1a1(texto)
    marcas: list[tuple[int, int]] = []
    for i, t in enumerate(termos):
        padrao = rf"\b{re.escape(t)}" + (r"\w*" if i == len(termos) - 1 else r"\b")
        marcas += [(m.start(), m.end()) for m in re.finditer(padrao, base)]
    if not marcas:
        return texto[: contexto * 2]
    marcas.sort()
    fund: list[list[int]] = []
    for a, b in marcas:
        if fund and a <= fund[-1][1]:
            fund[-1][1] = max(fund[-1][1], b)
        else:
            fund.append([a, b])
    ini = max(0, fund[0][0] - contexto)
    fim = min(len(texto), fund[-1][1] + contexto)
    partes, pos = [], ini
    for a, b in fund:
        if b <= ini or a >= fim:
            continue
        a, b = max(a, ini), min(b, fim)
        partes += [texto[pos:a], "[[", texto[a:b], "]]"]
        pos = b
    partes.append(texto[pos:fim])
    return ("…" if ini > 0 else "") + "".join(partes) + ("…" if fim < len(texto) else "")


def buscar(q: str, unidade: str | None = None, limite: int = 50) -> list[dict]:
    consulta = _fts_query(q)
    if not consulta:
        return []
    sql = ("SELECT s.id seg_id, s.audio_id, s.inicio, s.fim, COALESCE(s.texto_corrigido, s.texto) texto, "
           "a.nome_original, a.unidade, a.custodiado, a.data_gravacao, a.risco "
           "FROM segmentos_fts f JOIN segmentos s ON s.id = f.rowid JOIN audios a ON a.id = s.audio_id "
           "WHERE segmentos_fts MATCH ?")
    params: list = [consulta]
    if unidade:
        sql += " AND a.unidade = ?"; params.append(unidade)
    sql += " ORDER BY rank LIMIT ?"; params.append(max(1, min(limite, 200)))
    with _conn() as con:
        rows = [dict(r) for r in con.execute(sql, params).fetchall()]
    for r in rows:   # destaque feito sobre o texto FINAL (corrigido, se houver), nunca sobre o original
        r["trecho"] = _destacar(r["texto"], q)
    return rows


def painel() -> dict:
    with _conn() as con:
        por_status = {r["status"]: r["c"] for r in con.execute("SELECT status, COUNT(*) c FROM audios GROUP BY status")}
        por_risco = {(r["risco"] or "SEM ANÁLISE"): r["c"] for r in con.execute(
            "SELECT risco, COUNT(*) c FROM audios WHERE status='concluido' GROUP BY risco")}
        horas = con.execute(
            "SELECT COALESCE(SUM(duracao_s),0)/3600.0 h FROM audios WHERE status='concluido'").fetchone()["h"]
        fila_s = con.execute(
            "SELECT COALESCE(SUM(duracao_s),0) s, SUM(CASE WHEN duracao_s IS NULL THEN 1 ELSE 0 END) sem "
            "FROM audios WHERE status IN ('pendente','processando')").fetchone()
        corte24 = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(timespec="seconds")
        ult24 = con.execute("SELECT COUNT(*) c FROM audios WHERE criado_em >= ?", (corte24,)).fetchone()["c"]
        por_unidade = [dict(r) for r in con.execute(
            "SELECT COALESCE(unidade,'(sem unidade)') unidade, COUNT(*) total, "
            "SUM(CASE WHEN risco='ALTO' THEN 1 ELSE 0 END) alto, "
            "ROUND(COALESCE(SUM(duracao_s),0)/3600.0,2) horas FROM audios GROUP BY 1 ORDER BY total DESC LIMIT 20")]
        revisar = con.execute(
            "SELECT COUNT(DISTINCT audio_id) c FROM segmentos WHERE confianca IS NOT NULL AND confianca < 0.5 "
            "AND texto_corrigido IS NULL").fetchone()["c"]
    return {
        "total": sum(por_status.values()), "por_status": por_status, "por_risco": por_risco,
        "horas_transcritas": round(horas or 0, 2),
        "fila_horas": round((fila_s["s"] or 0) / 3600.0, 2), "fila_sem_duracao": fila_s["sem"] or 0,
        "ultimas_24h": ult24, "por_unidade": por_unidade, "gravacoes_com_baixa_confianca": revisar,
        "stt_provedor": STT_PROVEDOR, "cadeia_custodia": verificar_cadeia(),
    }


# ── Edição humana ────────────────────────────────────────────────────────────

def corrigir_segmento(audio_id: str, seg_id: int, texto: str, usuario: str) -> dict | None:
    texto = (texto or "").strip()
    if not texto:
        raise ValueError("Texto corrigido vazio.")
    with _ws, _conn() as con:
        r = con.execute("SELECT texto, texto_corrigido FROM segmentos WHERE id=? AND audio_id=?",
                        (seg_id, audio_id)).fetchone()
        if not r:
            return None
        anterior = r["texto_corrigido"] or r["texto"]
        con.execute("UPDATE segmentos SET texto_corrigido=?, revisado_por=?, revisado_em=? WHERE id=?",
                    (texto[:4000], usuario, _agora(), seg_id))
        h_ant = hashlib.sha256(anterior.encode("utf-8")).hexdigest()[:16]
        h_novo = hashlib.sha256(texto.encode("utf-8")).hexdigest()[:16]
        _registrar(con, audio_id, usuario, "segmento_corrigido", f"seg={seg_id} {h_ant}->{h_novo}")
    return {"ok": True, "seg_id": seg_id}


def reclassificar(audio_id: str, classificacao: str, usuario: str) -> dict:
    c = _norm(classificacao)
    if c not in CLASSIF_VALIDAS:
        raise ValueError(f"Classificação inválida. Use: {', '.join(CLASSIF_VALIDAS)}")
    with _ws, _conn() as con:
        r = con.execute("SELECT classificacao FROM audios WHERE id=?", (audio_id,)).fetchone()
        if not r:
            raise LookupError("Gravação não encontrada.")
        con.execute("UPDATE audios SET classificacao=? WHERE id=?", (c, audio_id))
        _registrar(con, audio_id, usuario, "reclassificacao", f"{r['classificacao']} -> {c}")
    return {"ok": True, "classificacao": c}


def reprocessar(audio_id: str, usuario: str) -> dict:
    with _ws, _conn() as con:
        r = con.execute("SELECT status FROM audios WHERE id=?", (audio_id,)).fetchone()
        if not r:
            raise LookupError("Gravação não encontrada.")
        if r["status"] == "processando":
            raise ValueError("Gravação em processamento.")
        con.execute("DELETE FROM segmentos WHERE audio_id=?", (audio_id,))
        con.execute("UPDATE audios SET status='pendente', erro=NULL, etapa=NULL, progresso=0, risco=NULL, resumo=NULL, "
                    "classificacao_conteudo=NULL, analise_ok=0, flags_json=NULL, cruzamentos_json=NULL, "
                    "finalizado_em=NULL WHERE id=?", (audio_id,))
        _registrar(con, audio_id, usuario, "reprocessamento", "reenfileirado")
    return {"ok": True, "status": "pendente"}


# ── Decodificação e divisão de áudios longos ─────────────────────────────────

class FormatoNaoSuportado(Exception):
    pass


def duracao_s(caminho: str) -> float | None:
    try:
        import soundfile as sf
        return float(sf.info(caminho).duration)
    except Exception:
        return None


def _ponto_de_corte(mono, sr: int, janela_s: int) -> int:
    """Índice (em amostras) do trecho mais silencioso nos últimos `janela_s` segundos do bloco."""
    import numpy as np
    n = len(mono)
    quadro = max(1, int(sr * 0.02))
    ini = max(int(n - janela_s * sr), int(sr * 30))
    if ini >= n - quadro:
        return n
    seg = mono[ini:n].astype("float32")
    nq = len(seg) // quadro
    if nq < 2:
        return n
    rms = np.sqrt((seg[: nq * quadro].reshape(nq, quadro) ** 2).mean(axis=1))
    # suaviza (média de ~0,3 s) para não cortar em uma pausa entre fonemas
    k = 15
    if nq > k:
        rms = np.convolve(rms, np.ones(k) / k, mode="same")
    return ini + int(rms.argmin()) * quadro


def dividir(caminho: str, tmpdir: str, alvo_s: int = ALVO_CHUNK_S, janela_s: int = JANELA_SILENCIO_S):
    """
    Gera (arquivo_do_pedaco, offset_s, duracao_s_do_pedaco) cortando em pausas de fala.
    Pedaços em FLAC 16 kHz mono. Áudio curto e pequeno segue como está (sem reencode).
    Formato que o soundfile não decodifica (m4a/webm/mp4): vai inteiro se couber no limite
    do provedor; senão levanta FormatoNaoSuportado (precisa converter com ffmpeg).
    """
    import numpy as np
    import soundfile as sf
    from math import gcd
    from scipy.signal import resample_poly

    tam = os.path.getsize(caminho)
    try:
        info = sf.info(caminho)
    except Exception:
        if tam > LIMITE_API:
            raise FormatoNaoSuportado(
                "Formato não decodificável localmente e arquivo maior que 24 MB — converta para WAV/MP3/FLAC "
                "(instalar ffmpeg habilita a conversão automática)."
            )
        yield (caminho, 0.0, None)
        return

    sr, total = info.samplerate, info.frames
    if info.duration <= 600 and tam <= LIMITE_ORIGINAL:
        yield (caminho, 0.0, float(info.duration))
        return

    alvo_n = int(alvo_s * sr)
    with sf.SoundFile(caminho) as f:
        pos, i = 0, 0
        while pos < total:
            f.seek(pos)
            bloco = f.read(min(alvo_n, total - pos), dtype="int16", always_2d=True)
            if bloco.shape[0] == 0:
                break
            mono = bloco.mean(axis=1).astype("float32")
            n = len(mono)
            corte = n if (pos + n) >= total else _ponto_de_corte(mono, sr, janela_s)
            corte = max(corte, min(n, sr))   # nunca menos de 1 s
            parte = mono[:corte]
            if sr != 16000:
                g = gcd(16000, sr)
                parte = resample_poly(parte, 16000 // g, sr // g)
            saida = os.path.join(tmpdir, f"parte_{i:04d}.flac")
            sf.write(saida, np.clip(parte, -32768, 32767).astype("int16"), 16000, format="FLAC", subtype="PCM_16")
            yield (saida, pos / sr, corte / sr)
            pos += corte
            i += 1


# ── Transcrição (provedores) ─────────────────────────────────────────────────

def _prompt_glossario() -> str:
    base = "Áudio operacional do sistema prisional. Terminologia policial e penitenciária brasileira, gírias e vulgos."
    try:
        from modules import lexico
        termos = lexico.contexto_para_prompt(limite=25)
        if termos:
            nomes = re.findall(r"«([^»]+)»", termos)
            if nomes:
                base += " Termos frequentes: " + ", ".join(nomes)[:500] + "."
    except Exception:
        pass
    return base[:800]


def _seg_dict(s) -> dict:
    g = (lambda k, d=None: s.get(k, d)) if isinstance(s, dict) else (lambda k, d=None: getattr(s, k, d))
    return {"start": float(g("start", 0) or 0), "end": float(g("end", 0) or 0),
            "text": (g("text", "") or "").strip(),
            "avg_logprob": g("avg_logprob", None), "no_speech_prob": g("no_speech_prob", None)}


def _transcrever_groq(caminho: str) -> list[dict]:
    from groq import Groq
    chave = os.getenv("GROQ_API_KEY")
    if not chave:
        raise RuntimeError("GROQ_API_KEY não configurada.")
    cli = Groq(api_key=chave)
    ultimo = None
    for tentativa in range(3):
        try:
            with open(caminho, "rb") as fh:
                r = cli.audio.transcriptions.create(
                    file=(os.path.basename(caminho), fh), model="whisper-large-v3-turbo", language="pt",
                    response_format="verbose_json", temperature=0, prompt=_prompt_glossario(),
                )
            segs = getattr(r, "segments", None) or (r.get("segments") if isinstance(r, dict) else None) or []
            return [_seg_dict(s) for s in segs]
        except Exception as e:   # 429 / rede: espera e tenta de novo
            ultimo = e
            if tentativa < 2:
                time.sleep(20 * (tentativa + 1))
    raise RuntimeError(f"Transcrição falhou após 3 tentativas: {ultimo}")


_modelo_local = None


def _transcrever_local(caminho: str) -> list[dict]:
    """faster-whisper no próprio servidor (áudio nunca sai da máquina). Requer `pip install faster-whisper`."""
    global _modelo_local
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise RuntimeError("Transcrição local indisponível: faster-whisper não está instalado neste servidor.")
    if _modelo_local is None:
        _modelo_local = WhisperModel(STT_MODELO_LOCAL, device="cpu", compute_type="int8")
    segs, _info = _modelo_local.transcribe(
        caminho, language="pt", vad_filter=True, temperature=0, initial_prompt=_prompt_glossario())
    return [_seg_dict(s) for s in segs]


def local_disponivel() -> bool:
    try:
        import faster_whisper  # noqa: F401
        return True
    except ImportError:
        return False


def resolver_stt(classificacao: str) -> dict:
    """
    Guardrail de soberania. Dado sensível só pode ser transcrito localmente; sem faster-whisper,
    BLOQUEIA em vez de enviar à nuvem. Dado público segue o provedor configurado.
    """
    if classificacao_sensivel(classificacao):
        if local_disponivel():
            return {"provedor": "local", "bloqueado": False, "motivo": None}
        return {"provedor": "local", "bloqueado": True,
                "motivo": "Classificação sensível exige transcrição local e o servidor não tem faster-whisper "
                          "instalado. O áudio não foi enviado à nuvem."}
    if STT_PROVEDOR == "local":
        if local_disponivel():
            return {"provedor": "local", "bloqueado": False, "motivo": None}
        return {"provedor": "local", "bloqueado": True, "motivo": "AUDIO_STT_PROVIDER=local, mas faster-whisper não está instalado."}
    return {"provedor": "groq", "bloqueado": False, "motivo": None}


def _transcrever(provedor: str, caminho: str) -> list[dict]:
    return _transcrever_local(caminho) if provedor == "local" else _transcrever_groq(caminho)


# ── Análise ──────────────────────────────────────────────────────────────────

_SYS_ANALISE = (
    "Você é analista de inteligência penitenciária. Recebe a transcrição (com tempos) de uma gravação de "
    "parlatório/ligação. Responda SOMENTE um JSON: "
    '{"risk_level":"ALTO|MEDIO|BAIXO","classification":"tema em poucas palavras","summary":"2-4 frases objetivas",'
    '"red_flags":[{"title":"...","text":"por que importa","trecho":"TRECHO LITERAL copiado da transcrição"}]}. '
    "REGRAS: não invente fatos nem identifique falantes; cada red_flag precisa de um trecho LITERAL que exista na "
    "transcrição; se nada relevante, risk_level BAIXO e red_flags []."
)


def _parse_json(txt: str) -> dict:
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", txt)
    if m:
        txt = m.group(1).strip()
    else:
        a, b = txt.find("{"), txt.rfind("}")
        if a != -1 and b != -1:
            txt = txt[a:b + 1]
    return json.loads(txt)


def _llm_analise(texto: str) -> dict:
    from groq import Groq
    from config.settings import GROQ_MODEL_CHAT
    chave = os.getenv("GROQ_API_KEY")
    if not chave:
        raise RuntimeError("GROQ_API_KEY não configurada.")
    r = Groq(api_key=chave).chat.completions.create(
        model=GROQ_MODEL_CHAT, temperature=0.1, max_tokens=1500,
        messages=[{"role": "system", "content": _SYS_ANALISE}, {"role": "user", "content": texto}],
    )
    return _parse_json(r.choices[0].message.content)


def _localizar_trecho(segs: list[dict], trecho: str) -> dict | None:
    """Acha o segmento cujo texto contém o trecho citado (proveniência). None = não confere."""
    alvo = _norm(trecho)
    if len(alvo) < 6:
        return None
    for s in segs:
        if alvo in _norm(s.get("texto_corrigido") or s["texto"]):
            return s
    # trecho pode cruzar dois segmentos: tenta pares consecutivos
    for a, b in zip(segs, segs[1:]):
        junto = _norm((a.get("texto_corrigido") or a["texto"]) + " " + (b.get("texto_corrigido") or b["texto"]))
        if alvo in junto:
            return a
    return None


def _flags_criticas(segs: list[dict]) -> list[dict]:
    """Piso determinístico: palavra crítica na transcrição vira flag com timestamp (não depende de IA)."""
    flags, vistos = [], set()
    for s in segs:
        t = _norm(s.get("texto_corrigido") or s["texto"])
        for p in _PALAVRAS_CRITICAS:
            if re.search(rf"\b{p}s?\b", t) and p not in vistos:
                vistos.add(p)
                flags.append({"title": f"Termo crítico: {p}", "text": "Termo da lista de atenção citado na gravação.",
                              "trecho": (s.get("texto_corrigido") or s["texto"])[:200],
                              "inicio": s["inicio"], "origem": "regra", "verificado": True})
    return flags


def _nivel(a: str, b: str) -> str:
    ordem = {"BAIXO": 0, "MEDIO": 1, "MÉDIO": 1, "ALTO": 2}
    return a if ordem.get((a or "BAIXO").upper(), 0) >= ordem.get((b or "BAIXO").upper(), 0) else b


def analisar_texto(segs: list[dict], usar_llm: bool) -> dict:
    """Combina regras + (opcional) LLM em janelas. Retorna risco/resumo/flags/analise_ok."""
    flags = _flags_criticas(segs)
    risco = "ALTO" if flags else "BAIXO"
    resumo, classif, analise_ok = None, None, False

    if usar_llm and segs:
        linhas = [f"[{_mmss(s['inicio'])}] {s.get('texto_corrigido') or s['texto']}" for s in segs]
        janelas, atual, tam = [], [], 0
        for ln in linhas:
            if tam + len(ln) > JANELA_ANALISE and atual:
                janelas.append("\n".join(atual)); atual, tam = [], 0
            atual.append(ln); tam += len(ln) + 1
        if atual:
            janelas.append("\n".join(atual))
        resumos, classifs = [], []
        try:
            for j in janelas[:12]:
                d = _llm_analise(j)
                risco = _nivel(risco, str(d.get("risk_level") or "BAIXO").upper())
                if d.get("summary"):
                    resumos.append(str(d["summary"]).strip())
                if d.get("classification"):
                    classifs.append(str(d["classification"]).strip())
                for f in d.get("red_flags") or []:
                    seg = _localizar_trecho(segs, f.get("trecho", ""))
                    flags.append({"title": str(f.get("title", ""))[:120], "text": str(f.get("text", ""))[:400],
                                  "trecho": str(f.get("trecho", ""))[:300],
                                  "inicio": seg["inicio"] if seg else None, "origem": "ia", "verificado": bool(seg)})
            analise_ok = True
        except Exception as e:
            log.warning("análise por LLM falhou (transcrição preservada): %s", e)
        resumo = " ".join(resumos[:4]) or None
        classif = classifs[0] if classifs else None

    if risco == "ALTO" and not resumo and flags:
        resumo = "Gravação com termos críticos: " + ", ".join(f["title"].replace("Termo crítico: ", "") for f in flags[:5]) + "."
    return {"risco": "MÉDIO" if risco == "MEDIO" else risco, "resumo": resumo,
            "classificacao_conteudo": classif, "flags": flags[:40], "analise_ok": analise_ok}


# ── Worker ───────────────────────────────────────────────────────────────────

def _set(audio_id: str, **campos) -> None:
    if not campos:
        return
    cols = ", ".join(f"{k}=?" for k in campos)
    with _conn() as con:
        con.execute(f"UPDATE audios SET {cols} WHERE id=?", [*campos.values(), audio_id])


def _reivindicar() -> str | None:
    """Pega o próximo 'pendente' de forma atômica."""
    with _ws, _conn() as con:
        r = con.execute("SELECT id FROM audios WHERE status='pendente' ORDER BY criado_em LIMIT 1").fetchone()
        if not r:
            return None
        con.execute("UPDATE audios SET status='processando', iniciado_em=?, etapa='iniciando', progresso=1, "
                    "erro=NULL, tentativas=tentativas+1 WHERE id=?", (_agora(), r["id"]))
        _registrar(con, r["id"], "sistema", "processamento_iniciado", "")
        return r["id"]


def processar(audio_id: str) -> None:
    """Executa o pipeline completo de UMA gravação. Nunca propaga exceção."""
    a = obter(audio_id)
    if not a:
        return
    try:
        stt = resolver_stt(a["classificacao"])
        if stt["bloqueado"]:
            _set(audio_id, status="bloqueado", erro=stt["motivo"], etapa=None, progresso=0)
            registrar_evento(audio_id, "sistema", "bloqueado_soberania", stt["motivo"][:200])
            return

        origem = caminho_original(audio_id)
        if not origem:
            raise RuntimeError("Arquivo original ausente no acervo.")
        dur = duracao_s(origem)
        _set(audio_id, stt_provedor=stt["provedor"],
             stt_modelo=("faster-whisper:" + STT_MODELO_LOCAL) if stt["provedor"] == "local" else "whisper-large-v3-turbo",
             duracao_s=dur, etapa="transcrevendo")

        todos: list[dict] = []
        with tempfile.TemporaryDirectory(prefix="bastos_audio_") as tmp:
            for caminho, offset, d in dividir(origem, tmp):
                try:
                    segs = _transcrever(stt["provedor"], caminho)
                finally:
                    if caminho != origem:
                        try:
                            os.unlink(caminho)
                        except OSError:
                            pass
                for s in segs:
                    if not s["text"]:
                        continue
                    lp = s.get("avg_logprob")
                    conf = max(0.0, min(1.0, math.exp(lp))) if isinstance(lp, (int, float)) else None
                    todos.append({"inicio": offset + s["start"], "fim": offset + s["end"], "texto": s["text"], "confianca": conf})
                if dur and d is not None:
                    _set(audio_id, progresso=min(85, int(5 + 80 * (offset + d) / dur)))

        with _conn() as con:
            con.execute("DELETE FROM segmentos WHERE audio_id=?", (audio_id,))
            con.executemany(
                "INSERT INTO segmentos (audio_id, idx, inicio, fim, texto, confianca) VALUES (?,?,?,?,?,?)",
                [(audio_id, i, s["inicio"], s["fim"], s["texto"], s["confianca"]) for i, s in enumerate(todos)],
            )
        if dur is None and todos:
            _set(audio_id, duracao_s=todos[-1]["fim"])

        _set(audio_id, etapa="analisando", progresso=90)
        segs_db = segmentos(audio_id)
        sensivel = classificacao_sensivel(a["classificacao"])
        res = analisar_texto(segs_db, usar_llm=not sensivel)

        cruz = _cruzar(segs_db)
        _set(audio_id, status="concluido", etapa=None, progresso=100, finalizado_em=_agora(),
             risco=res["risco"], resumo=res["resumo"], classificacao_conteudo=res["classificacao_conteudo"],
             analise_ok=1 if res["analise_ok"] else 0, flags_json=json.dumps(res["flags"], ensure_ascii=False),
             cruzamentos_json=json.dumps(cruz, ensure_ascii=False))
        registrar_evento(audio_id, "sistema", "processamento_concluido",
                         f"segmentos={len(todos)} risco={res['risco']} provedor={stt['provedor']} cruzamentos={len(cruz)}")
        _notificar(audio_id, a, res, cruz, sensivel)
        if not sensivel:
            _escrever_relatorio_txt(a, res, segs_db)
    except FormatoNaoSuportado as e:
        _set(audio_id, status="erro", erro=str(e), etapa=None)
        registrar_evento(audio_id, "sistema", "erro", str(e)[:200])
    except Exception as e:
        log.error("falha ao processar %s: %s", audio_id, e, exc_info=True)
        _set(audio_id, status="erro", erro=str(e)[:500], etapa=None)
        registrar_evento(audio_id, "sistema", "erro", str(e)[:200])


def _cruzar(segs: list[dict]) -> list[dict]:
    """Cruzamento determinístico (local) com alvos, lideranças e entidades de extratos."""
    try:
        from services.pipeline_transcricao import _buscar_hits
        texto = "\n".join(s.get("texto_corrigido") or s["texto"] for s in segs)
        return [{"nome": h["nome"], "fonte": h["fonte"], "detalhe": h["detalhe"]} for h in _buscar_hits(texto)][:30]
    except Exception as e:
        log.debug("cruzamento indisponível: %s", e)
        return []


def _notificar(audio_id: str, a: dict, res: dict, cruz: list[dict], sensivel: bool) -> None:
    """Abre aprovação HITL para risco ALTO ou cruzamento. Dado sensível: só registro interno, sem WhatsApp."""
    if res["risco"] != "ALTO" and not cruz:
        return
    try:
        import asyncio
        from services.human_loop_service import criar_aprovacao, marcar_notificado
        desc = f"Gravação {a['nome_original'][:60]} — risco {res['risco']}" + (f", {len(cruz)} cruzamento(s)" if cruz else "")
        detalhes = {"audio_id": audio_id, "risco": res["risco"], "cruzamentos": len(cruz)}
        if not sensivel:
            detalhes["summary"] = (res["resumo"] or "")[:200]
        aprov = criar_aprovacao(tipo_evento="audio_acervo", descricao=desc, risco="ALTO" if res["risco"] == "ALTO" else "MEDIO",
                                operador="acervo_audio", detalhes=detalhes)
        if sensivel:
            return   # conteúdo sensível não é empurrado a canais externos (WhatsApp)
        from services.notification_service import notificar_aprovacao_pendente
        ok = asyncio.run(notificar_aprovacao_pendente(
            aprovacao_id=aprov, tipo_evento="audio_acervo", descricao=desc, risco="ALTO",
            operador="acervo_audio", detalhes=detalhes))
        marcar_notificado(aprov, ok)
    except Exception as e:
        log.warning("HITL/notificação do áudio falhou: %s", e)


def _escrever_relatorio_txt(a: dict, res: dict, segs: list[dict]) -> None:
    """Compatibilidade: mantém o .txt em data/relatorios (só para dado não sensível)."""
    try:
        from config.paths import DIR_RELATORIOS
        base = os.path.splitext(re.sub(r"[^A-Za-z0-9._-]", "_", a["nome_original"]))[0][:80]
        nome = f"relatorio_audio_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}_{base}.txt"
        linhas = ["RELATÓRIO DE INTELIGÊNCIA — TRANSCRIÇÃO DE ÁUDIO", f"Arquivo: {a['nome_original']}",
                  f"SHA-256: {a['sha256']}", f"Risco: {res['risco']}", "", "RESUMO", res["resumo"] or "(sem resumo)", "",
                  "TRANSCRIÇÃO"]
        linhas += [f"[{_mmss(s['inicio'])}] {s.get('texto_corrigido') or s['texto']}" for s in segs]
        with open(os.path.join(str(DIR_RELATORIOS), nome), "w", encoding="utf-8") as f:
            f.write("\n".join(linhas) + "\n")
    except Exception:
        pass


# ── Laudo (reaproveita os exportadores existentes) ───────────────────────────

def dados_laudo(audio_id: str) -> dict | None:
    a = obter(audio_id)
    if not a:
        return None
    segs = segmentos(audio_id)
    return {
        "laudo_number": "AUD-" + a["id"][:8].upper(),
        "date": (a.get("finalizado_em") or a["criado_em"])[:10],
        "filename": f"{a['nome_original']} (SHA-256 {a['sha256'][:16]}…)",
        "duration": _mmss(a.get("duracao_s") or 0),
        "risk_level": (a.get("risco") or "BAIXO").replace("MÉDIO", "MEDIO"),
        "classification": a.get("classificacao_conteudo") or "Gravação de áudio",
        "summary": a.get("resumo") or "Sem resumo.",
        "speakers": [],   # Fase 1 não identifica falantes (diarização real vem na Fase 2)
        "segments": [{"ts": _mmss(s["inicio"]), "speaker": "", "text": s.get("texto_corrigido") or s["texto"]} for s in segs],
        "red_flags": [{"id": i + 1, "title": f["title"],
                       "text": f"{f['text']} [{_mmss(f['inicio']) if f.get('inicio') is not None else 'sem tempo'}] «{f.get('trecho', '')}»"}
                      for i, f in enumerate(a.get("flags") or [])],
    }


# ── Worker em thread ─────────────────────────────────────────────────────────

_worker_iniciado = False


def _loop_worker() -> None:
    while True:
        try:
            aid = _reivindicar()
        except Exception as e:
            log.error("worker: erro ao reivindicar: %s", e)
            aid = None
        if aid:
            processar(aid)
        else:
            time.sleep(3)


def iniciar_worker() -> None:
    """Chamado no startup do backend. Reenfileira o que ficou 'processando' num desligamento."""
    global _worker_iniciado
    if _worker_iniciado or os.getenv("AUDIO_WORKER_ATIVO", "true").lower() != "true":
        return
    init_db()
    with _conn() as con:
        con.execute("UPDATE audios SET status='pendente', etapa=NULL, progresso=0 WHERE status='processando'")
    threading.Thread(target=_loop_worker, daemon=True, name="audio-acervo-worker").start()
    _worker_iniciado = True
    log.info("Acervo de áudio: worker iniciado (provedor STT=%s)", STT_PROVEDOR)


init_db()
