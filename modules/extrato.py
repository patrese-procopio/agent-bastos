# -*- coding: utf-8 -*-
"""
extrato.py — Motor do Módulo Extrato
Agent Bastos | AIPEN

Recebe um EXTRATO de campo desestruturado e:
  1. Grava o BRUTO imediatamente (integridade do dado).
  2. Enriquece via LLM (provedor soberano/local ou nuvem — ver llm_extracao),
     respeitando o guardrail de classificação.
  3. Confere PROVENIÊNCIA (trecho literal de cada entidade/vínculo bate na fonte).
  4. Aplica PISO DE RISCO por palavra-crítica (fuga/túnel/motim/arma...).
  5. Materializa nós/vínculos no grafo i2 (origem auto:extrato:<id>).
  6. Alimenta o Léxico de Sinais Fracos.
  7. (Best-effort) indexa no ChromaDB para o Chat RAG / scanner de citações.
  8. Registra TUDO numa trilha de auditoria encadeada por hash (tamper-evident).

Produto de leitura: o RAE (Relatório Analítico de Extrato) — NÃO confundir com o
RELINT, que é o produto final consolidado da agência.

Banco: data/extrato/extrato.db
"""

import os
import re
import json
import uuid
import hashlib
import sqlite3
import unicodedata
from datetime import datetime, timezone
from contextlib import contextmanager

from modules import grafo, lexico
from services import llm_extracao

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH  = os.path.join(BASE_DIR, "data", "extrato", "extrato.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

# Piso de risco: presença destes termos no extrato força risk_score >= 8.
_PALAVRAS_CRITICAS = [
    "fuga", "fugir", "fugiu", "tunel", "motim", "rebeliao", "arma", "armamento",
    "refem", "resgate", "drone", "granada", "explosivo", "sequestro", "execucao",
    "matar", "homicidio", "atentado", "chacina", "guerra",
]


# ── Conexão / schema ─────────────────────────────────────────────────────────

@contextmanager
def _conn():
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA busy_timeout = 8000")
    try:
        yield con
        con.commit()
    finally:
        con.close()


def init_db():
    with _conn() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS extratos (
                id              TEXT PRIMARY KEY,
                data            TEXT,
                unidade         TEXT,
                nucleo          TEXT,
                autor           TEXT,
                assunto         TEXT,
                corpo           TEXT NOT NULL,
                topicos         TEXT,            -- JSON list
                nucleos_destino TEXT,            -- JSON list
                classificacao   TEXT DEFAULT 'reservado',
                status          TEXT NOT NULL DEFAULT 'recebido',  -- recebido|processado|erro
                criado_em       TEXT NOT NULL,
                processado_em   TEXT,
                -- enriquecimento
                provedor        TEXT,
                modelo          TEXT,
                prompt_versao   TEXT,
                forcado_local   INTEGER DEFAULT 0,
                bloqueado       INTEGER DEFAULT 0,
                assunto_sintetizado TEXT,
                risk_score      INTEGER,
                risk_nivel      TEXT,
                risco_forcado   INTEGER DEFAULT 0,
                justificativa_risco TEXT,
                tags            TEXT,            -- JSON list
                evidencias_ok    INTEGER DEFAULT 0,
                evidencias_total INTEGER DEFAULT 0,
                resultado_json  TEXT,            -- JSON cru estruturado
                rae_gerado      INTEGER DEFAULT 0,
                erro            TEXT
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS extrato_entidades (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                extrato_id  TEXT NOT NULL,
                ref         TEXT,
                tipo        TEXT,
                nome        TEXT,
                vulgo       TEXT,
                rotulo      TEXT,
                papel       TEXT,
                evidencia   TEXT,
                evidencia_ok INTEGER DEFAULT 0,
                no_id       TEXT
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS auditoria (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                ts            TEXT NOT NULL,
                extrato_id    TEXT,
                usuario       TEXT,
                acao          TEXT NOT NULL,
                detalhe       TEXT,
                hash_anterior TEXT,
                hash          TEXT NOT NULL
            )
        """)
        con.execute("CREATE INDEX IF NOT EXISTS idx_ent_extrato ON extrato_entidades(extrato_id)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_extr_unidade ON extratos(unidade)")


# ── Helpers ──────────────────────────────────────────────────────────────────

def _agora() -> str:
    return datetime.now(timezone.utc).isoformat()


def _norm(txt: str) -> str:
    if not txt:
        return ""
    t = unicodedata.normalize("NFKD", str(txt))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t.strip().lower())


def _loads(s, default=None):
    if not s:
        return default if default is not None else {}
    try:
        return json.loads(s)
    except Exception:
        return default if default is not None else {}


def _texto_analise(reg: dict) -> str:
    """Junta assunto + tópicos + corpo para a extração."""
    partes = []
    if reg.get("assunto"):
        partes.append(f"Assunto: {reg['assunto']}")
    tops = reg.get("topicos")
    if isinstance(tops, str):
        tops = _loads(tops, [])
    if tops:
        partes.append("Tópicos:\n" + "\n".join(f"- {t}" for t in tops))
    partes.append(reg.get("corpo") or "")
    return "\n\n".join(p for p in partes if p)


def _nivel_risco(score: int) -> str:
    if score >= 8:
        return "ALTO"
    if score >= 4:
        return "MÉDIO"
    return "BAIXO"


def _aplicar_piso(texto: str, score: int) -> tuple[int, bool]:
    t = _norm(texto)
    if any(p in t for p in _PALAVRAS_CRITICAS):
        return max(score, 8), True
    return score, False


def _evidencia_confere(corpo: str, evidencia: str) -> bool:
    if not evidencia:
        return False
    ev, cp = _norm(evidencia), _norm(corpo)
    if not ev:
        return False
    if ev in cp:
        return True
    # tolera paráfrase leve: confere o início da evidência
    return len(ev) > 20 and ev[:40] in cp


# ── Trilha de auditoria encadeada (hash-chain) ───────────────────────────────

def _ultimo_hash(con) -> str:
    row = con.execute("SELECT hash FROM auditoria ORDER BY id DESC LIMIT 1").fetchone()
    return row["hash"] if row else "GENESIS"


def _auditar(con, extrato_id: str, usuario: str, acao: str, detalhe: str = "") -> None:
    ts = _agora()
    anterior = _ultimo_hash(con)
    base = f"{anterior}|{ts}|{extrato_id}|{usuario}|{acao}|{detalhe}"
    h = hashlib.sha256(base.encode("utf-8")).hexdigest()
    con.execute(
        """INSERT INTO auditoria (ts, extrato_id, usuario, acao, detalhe, hash_anterior, hash)
           VALUES (?,?,?,?,?,?,?)""",
        (ts, extrato_id, usuario, acao, detalhe, anterior, h),
    )


def verificar_cadeia() -> dict:
    """Confere a integridade da trilha de auditoria (tamper-evident)."""
    with _conn() as con:
        rows = con.execute("SELECT * FROM auditoria ORDER BY id ASC").fetchall()
    anterior = "GENESIS"
    for r in rows:
        base = f"{anterior}|{r['ts']}|{r['extrato_id']}|{r['usuario']}|{r['acao']}|{r['detalhe']}"
        h = hashlib.sha256(base.encode("utf-8")).hexdigest()
        if h != r["hash"] or r["hash_anterior"] != anterior:
            return {"ok": False, "rompido_em_id": r["id"], "total": len(rows)}
        anterior = r["hash"]
    return {"ok": True, "total": len(rows)}


# ── CRUD / criação ───────────────────────────────────────────────────────────

def criar_extrato(payload: dict, usuario: str = "sistema") -> dict:
    """Grava o extrato bruto imediatamente (status 'recebido')."""
    eid = "ext_" + uuid.uuid4().hex[:12]
    corpo = (payload.get("corpo") or payload.get("texto") or "").strip()
    classif = (payload.get("classificacao") or "reservado").strip().lower()
    with _conn() as con:
        con.execute(
            """INSERT INTO extratos (id, data, unidade, nucleo, autor, assunto, corpo,
                    topicos, nucleos_destino, classificacao, status, criado_em)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (eid, payload.get("data"), payload.get("unidade"), payload.get("nucleo"),
             payload.get("autor"), payload.get("assunto"), corpo,
             json.dumps(payload.get("topicos") or [], ensure_ascii=False),
             json.dumps(payload.get("nucleos_destino") or [], ensure_ascii=False),
             classif, "recebido", _agora()),
        )
        _auditar(con, eid, usuario, "CRIADO",
                 f"unidade={payload.get('unidade')} classif={classif}")
    return obter(eid)


def _registrar_resultado(eid: str, corpo: str, reg: dict, extr: dict) -> dict:
    """Processa a saída do LLM: proveniência, risco, grafo, léxico.
    Faz as escritas em transações SEPARADAS por banco para evitar lock cruzado
    (grafo_vinculos.db, depois extrato.db via léxico, depois extrato.db próprio)."""
    dados = extr.get("dados") or {}
    ea = dados.get("extrato_analisado") or {}
    entidades = dados.get("entidades_chave") or []
    conexoes  = dados.get("conexoes_grafo") or []
    jargoes   = dados.get("jargoes_e_codigos") or []
    tags      = dados.get("tags_indexacao") or []

    # Proveniência (Alucinação Zero auditável)
    ev_total = ev_ok = 0
    for ent in entidades:
        ent["_ev_ok"] = _evidencia_confere(corpo, ent.get("evidencia"))
        ev_total += 1; ev_ok += 1 if ent["_ev_ok"] else 0
    for cx in conexoes:
        ev_total += 1; ev_ok += 1 if _evidencia_confere(corpo, cx.get("evidencia")) else 0

    # Risco: nota do modelo + piso por palavra-crítica
    try:
        score = int(ea.get("risk_score") or 0)
    except Exception:
        score = 0
    score = max(1, min(10, score)) if score else 5
    score, forcado = _aplicar_piso(corpo, score)
    nivel = _nivel_risco(score)

    # 1) Materializa no grafo i2 (banco próprio: grafo_vinculos.db)
    res_grafo = grafo.ingerir_extrato(
        eid, entidades, conexoes,
        rotulo_extrato=ea.get("assunto_sintetizado") or None)
    ref_para_id = res_grafo.get("ref_para_id", {})

    # 2) Léxico de sinais fracos (conexão própria ao extrato.db) — sem transação aberta
    lexico.registrar_candidatos(jargoes, eid, reg.get("unidade") or "")

    # 3) Persistência no extrato.db: entidades (staging p/ o RAE) + extrato
    with _conn() as con:
        con.execute("DELETE FROM extrato_entidades WHERE extrato_id = ?", (eid,))
        for ent in entidades:
            con.execute(
                """INSERT INTO extrato_entidades (extrato_id, ref, tipo, nome, vulgo,
                        rotulo, papel, evidencia, evidencia_ok, no_id)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (eid, ent.get("ref"), ent.get("tipo"), ent.get("nome"), ent.get("vulgo"),
                 ent.get("rotulo"), ent.get("papel_no_contexto"), ent.get("evidencia"),
                 1 if ent.get("_ev_ok") else 0, ref_para_id.get(str(ent.get("ref")))),
            )
        con.execute(
            """UPDATE extratos SET status='processado', processado_em=?, provedor=?,
                   modelo=?, prompt_versao=?, forcado_local=?, bloqueado=?,
                   assunto_sintetizado=?, risk_score=?, risk_nivel=?, risco_forcado=?,
                   justificativa_risco=?, tags=?, evidencias_ok=?, evidencias_total=?,
                   resultado_json=?, erro=NULL WHERE id=?""",
            (_agora(), extr.get("provedor"), extr.get("modelo"), extr.get("prompt_versao"),
             1 if extr.get("forcado_local") else 0, 1 if extr.get("bloqueado") else 0,
             ea.get("assunto_sintetizado"), score, nivel, 1 if forcado else 0,
             ea.get("justificativa_risco"),
             json.dumps(tags, ensure_ascii=False), ev_ok, ev_total,
             json.dumps(dados, ensure_ascii=False), eid),
        )
    return {
        "risk_score": score, "risk_nivel": nivel, "risco_forcado": forcado,
        "entidades": len(entidades), "conexoes": len(conexoes),
        "jargoes": len(jargoes), "evidencias_ok": ev_ok, "evidencias_total": ev_total,
        "nos_criados": res_grafo.get("nos_criados"),
        "arestas_criadas": res_grafo.get("arestas_criadas"),
    }


def processar(eid: str, usuario: str = "sistema") -> dict:
    """Enriquece um extrato já gravado. Idempotente (pode reprocessar)."""
    reg = obter(eid)
    if not reg:
        return {"ok": False, "erro": "extrato_nao_encontrado"}

    corpo = _texto_analise(reg)
    if not corpo.strip():
        return {"ok": False, "erro": "extrato_sem_corpo"}

    lex_ctx = lexico.contexto_para_prompt()
    extr = llm_extracao.extrair(corpo, classificacao=reg.get("classificacao"),
                                lexico_contexto=lex_ctx)

    if not extr.get("ok"):
        with _conn() as con:
            con.execute(
                """UPDATE extratos SET status='erro', erro=?, provedor=?, modelo=?,
                       forcado_local=?, bloqueado=? WHERE id=?""",
                (extr.get("erro"), extr.get("provedor"), extr.get("modelo"),
                 1 if extr.get("forcado_local") else 0,
                 1 if extr.get("bloqueado") else 0, eid),
            )
            _auditar(con, eid, usuario,
                     "BLOQUEADO" if extr.get("bloqueado") else "ERRO_EXTRACAO",
                     extr.get("erro") or "")
        return {"ok": False, "erro": extr.get("erro"), "bloqueado": extr.get("bloqueado"),
                "provedor": extr.get("provedor")}

    resumo = _registrar_resultado(eid, corpo, reg, extr)
    with _conn() as con:
        _auditar(con, eid, usuario, "PROCESSADO",
                 f"provedor={extr.get('provedor')} modelo={extr.get('modelo')} "
                 f"risco={resumo['risk_nivel']}({resumo['risk_score']}) "
                 f"forcado_local={extr.get('forcado_local')}")

    _indexar_chroma_best_effort(eid, corpo)

    resumo.update({"ok": True, "provedor": extr.get("provedor"),
                   "modelo": extr.get("modelo"), "forcado_local": extr.get("forcado_local")})
    return resumo


def criar_e_processar(payload: dict, usuario: str = "sistema") -> dict:
    """Atalho síncrono: grava o bruto e já enriquece."""
    reg = criar_extrato(payload, usuario)
    resumo = processar(reg["id"], usuario)
    return {"extrato": obter(reg["id"]), "processamento": resumo}


# ── Indexação ChromaDB (best-effort, sem forçar carga pesada) ────────────────

def _indexar_chroma_best_effort(eid: str, corpo: str) -> bool:
    """
    Indexa o extrato no ChromaDB SOMENTE se o RAG já estiver carregado em memória
    (evita carregar o modelo de embeddings — pesado neste hardware). Quando
    indexado, o extrato passa a ser encontrável pelo Chat RAG e pelo scanner de
    citações do grafo. Nunca quebra o processamento.
    """
    try:
        import sys
        rag = sys.modules.get("modules.rag")
        if rag is None or not hasattr(rag, "_db"):
            return False
        reg = obter(eid)
        meta = {"fonte": f"EXTRATO {eid}", "source": f"EXTRATO {eid}",
                "tipo": "extrato", "unidade": reg.get("unidade") or "",
                "assunto": reg.get("assunto") or ""}
        rag._db.add_texts([corpo], metadatas=[meta])
        return True
    except Exception:
        return False


# ── Leitura ──────────────────────────────────────────────────────────────────

def _extrato_dict(row) -> dict:
    d = dict(row)
    d["topicos"] = _loads(d.get("topicos"), [])
    d["nucleos_destino"] = _loads(d.get("nucleos_destino"), [])
    d["tags"] = _loads(d.get("tags"), [])
    d["resultado_json"] = _loads(d.get("resultado_json"), {})
    for b in ("forcado_local", "bloqueado", "risco_forcado", "rae_gerado"):
        d[b] = bool(d.get(b))
    return d


def obter(eid: str) -> dict | None:
    with _conn() as con:
        row = con.execute("SELECT * FROM extratos WHERE id = ?", (eid,)).fetchone()
        if not row:
            return None
        d = _extrato_dict(row)
        ents = con.execute(
            "SELECT * FROM extrato_entidades WHERE extrato_id = ? ORDER BY id", (eid,)
        ).fetchall()
        d["entidades"] = [dict(e) | {"evidencia_ok": bool(e["evidencia_ok"])} for e in ents]
    return d


def listar(limite: int = 200) -> list[dict]:
    with _conn() as con:
        rows = con.execute(
            """SELECT id, data, unidade, nucleo, autor, assunto, assunto_sintetizado,
                   classificacao, status, risk_score, risk_nivel, criado_em,
                   processado_em, provedor, forcado_local, bloqueado, rae_gerado
               FROM extratos ORDER BY criado_em DESC LIMIT ?""",
            (limite,),
        ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["forcado_local"] = bool(d["forcado_local"])
            d["bloqueado"] = bool(d["bloqueado"])
            d["rae_gerado"] = bool(d["rae_gerado"])
            out.append(d)
    return out


def marcar_rae_gerado(eid: str) -> None:
    with _conn() as con:
        con.execute("UPDATE extratos SET rae_gerado=1 WHERE id=?", (eid,))
        _auditar(con, eid, "sistema", "RAE_GERADO", "")


# ── Matriz de Calor dos NUCADIs (produtividade analítica) ────────────────────

def heatmap_nucadis() -> dict:
    with _conn() as con:
        rows = con.execute("SELECT * FROM extratos").fetchall()
    porund: dict[str, dict] = {}
    pormes: dict[str, int] = {}
    total = proc = alto = bloq = 0
    for r in rows:
        total += 1
        if r["status"] == "processado":
            proc += 1
        if r["risk_nivel"] == "ALTO":
            alto += 1
        if r["bloqueado"]:
            bloq += 1
        u = r["unidade"] or "—"
        d = porund.setdefault(u, {"unidade": u, "extratos": 0, "processados": 0,
                                  "risco_alto": 0, "rae": 0})
        d["extratos"] += 1
        if r["status"] == "processado":
            d["processados"] += 1
        if r["risk_nivel"] == "ALTO":
            d["risco_alto"] += 1
        if r["rae_gerado"]:
            d["rae"] += 1
        mes = (r["criado_em"] or "")[:7]
        if mes:
            pormes[mes] = pormes.get(mes, 0) + 1
    unidades = sorted(porund.values(), key=lambda x: x["extratos"], reverse=True)
    return {
        "kpi": {"total": total, "processados": proc, "risco_alto": alto, "bloqueados": bloq},
        "por_unidade": unidades,
        "por_mes": [{"mes": k, "total": pormes[k]} for k in sorted(pormes)],
    }


# ── Dados estruturados para o RAE ────────────────────────────────────────────

def rae_dados(eid: str) -> dict | None:
    reg = obter(eid)
    if not reg:
        return None
    res = reg.get("resultado_json") or {}
    return {
        "extrato": {k: reg.get(k) for k in (
            "id", "data", "unidade", "nucleo", "autor", "assunto", "corpo",
            "classificacao", "criado_em", "processado_em", "provedor", "modelo",
            "prompt_versao", "forcado_local")},
        "assunto_sintetizado": reg.get("assunto_sintetizado"),
        "risk_score": reg.get("risk_score"),
        "risk_nivel": reg.get("risk_nivel"),
        "risco_forcado": reg.get("risco_forcado"),
        "justificativa_risco": reg.get("justificativa_risco"),
        "entidades": reg.get("entidades", []),
        "conexoes": res.get("conexoes_grafo", []),
        "jargoes": res.get("jargoes_e_codigos", []),
        "tags": reg.get("tags", []),
        "evidencias_ok": reg.get("evidencias_ok"),
        "evidencias_total": reg.get("evidencias_total"),
    }


init_db()
