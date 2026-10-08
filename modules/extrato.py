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
import threading
from datetime import datetime, timezone
from contextlib import contextmanager

from modules import grafo, lexico
from services import llm_extracao

from config.paths import DB_EXTRATO
DB_PATH  = str(DB_EXTRATO)
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
                autor           TEXT,             -- nome livre do formulario (ex: "Thiago Oderdenge")
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
        # Migracao 2026-09-17: separa "autor" (nome livre do form) de "criado_por"
        # (username do login, usado no scoping). O campo autor era usado pra ambos,
        # causando 404 no RAE quando o form tinha "THIAGO ODERDENGE" e o scoping
        # comparava com user.sub="vitor". Idempotente — ALTER falha silencioso se
        # coluna ja existe.
        _cols = [r[1] for r in con.execute("PRAGMA table_info(extratos)").fetchall()]
        if "criado_por" not in _cols:
            con.execute("ALTER TABLE extratos ADD COLUMN criado_por TEXT")
            # Backfill: registros antigos ficam do admin (que ve tudo mesmo).
            # Isso preserva historico visivel pra admin sem risco de vazamento
            # inter-analistas. Admin pode reatribuir manualmente via SQL se quiser.
            con.execute("UPDATE extratos SET criado_por='admin' WHERE criado_por IS NULL OR criado_por=''")
            con.execute("CREATE INDEX IF NOT EXISTS idx_extr_criado_por ON extratos(criado_por)")
        # Migração 2026-10-06: controle de edição/exclusão e estado de processamento.
        for col, ddl in (
            ("editado_em",            "TEXT"),
            ("editado_por",           "TEXT"),
            ("edicoes",               "INTEGER DEFAULT 0"),
            ("analise_desatualizada", "INTEGER DEFAULT 0"),
            ("processando_desde",     "TEXT"),
        ):
            if col not in _cols:
                con.execute(f"ALTER TABLE extratos ADD COLUMN {col} {ddl}")
        con.execute("""
            CREATE TABLE IF NOT EXISTS extrato_edicoes (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                extrato_id  TEXT NOT NULL,
                ts          TEXT NOT NULL,
                usuario     TEXT,
                campo       TEXT NOT NULL,
                anterior    TEXT,
                novo        TEXT
            )
        """)
        con.execute("CREATE INDEX IF NOT EXISTS idx_edic_extrato ON extrato_edicoes(extrato_id)")
        # Recuperação: o processamento roda em thread daemon — se o backend foi
        # reiniciado, nenhuma thread sobrevive. Extratos presos em
        # 'recebido'/'processando' nunca terminariam sozinhos; viram 'erro'
        # reprocessável em vez de ficar "processando…" para sempre.
        con.execute(
            """UPDATE extratos SET status='erro', processando_desde=NULL,
                   erro='Processamento interrompido (o sistema foi reiniciado antes de concluir). Use Reprocessar.'
               WHERE status IN ('recebido','processando')""")
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
    """Grava o extrato bruto imediatamente (status 'recebido').

    - `autor` (do form) = nome livre digitado pelo analista (ex: "Thiago Oderdenge")
    - `criado_por` (do token) = username do login, unico e usado no scoping
      (evita bug em que o RAE dava 404 pq o autor livre nao batia com user.sub)
    """
    eid = "ext_" + uuid.uuid4().hex[:12]
    corpo = (payload.get("corpo") or payload.get("texto") or "").strip()
    classif = (payload.get("classificacao") or "reservado").strip().lower()
    with _conn() as con:
        con.execute(
            """INSERT INTO extratos (id, data, unidade, nucleo, autor, assunto, corpo,
                    topicos, nucleos_destino, classificacao, status, criado_em, criado_por)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (eid, payload.get("data"), payload.get("unidade"), payload.get("nucleo"),
             payload.get("autor"), payload.get("assunto"), corpo,
             json.dumps(payload.get("topicos") or [], ensure_ascii=False),
             json.dumps(payload.get("nucleos_destino") or [], ensure_ascii=False),
             classif, "recebido", _agora(), usuario),
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
                   resultado_json=?, erro=NULL,
                   analise_desatualizada=0, processando_desde=NULL WHERE id=?""",
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
                       forcado_local=?, bloqueado=?, processando_desde=NULL WHERE id=?""",
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


_ATIVOS: set[str] = set()
_ATIVOS_LOCK = threading.Lock()


def em_processamento(eid: str) -> bool:
    with _ATIVOS_LOCK:
        return eid in _ATIVOS


def iniciar_processamento(eid: str, usuario: str = "sistema") -> dict:
    """Dispara processar() em thread daemon, marcando status 'processando'.
    Recusa se o mesmo extrato já estiver em processamento neste processo."""
    if not obter(eid):
        return {"ok": False, "erro": "extrato_nao_encontrado"}
    with _ATIVOS_LOCK:
        if eid in _ATIVOS:
            return {"ok": False, "erro": "ja_processando"}
        _ATIVOS.add(eid)
    with _conn() as con:
        con.execute("UPDATE extratos SET status='processando', processando_desde=?, erro=NULL WHERE id=?",
                    (_agora(), eid))

    def _rodar():
        try:
            processar(eid, usuario=usuario)
        except Exception as exc:  # nunca deixar preso em 'processando'
            try:
                with _conn() as con:
                    con.execute(
                        "UPDATE extratos SET status='erro', processando_desde=NULL, erro=? WHERE id=?",
                        (f"Falha inesperada no processamento: {exc}", eid))
                    _auditar(con, eid, usuario, "ERRO_EXTRACAO", str(exc)[:300])
            except Exception:
                pass
        finally:
            with _ATIVOS_LOCK:
                _ATIVOS.discard(eid)

    threading.Thread(target=_rodar, daemon=True, name=f"extrato-processar-{eid[:8]}").start()
    return {"ok": True, "status": "iniciado"}


# Campos editáveis pelo analista. Mudar qualquer um de _CAMPOS_ANALISE deixa a
# análise (entidades/risco/grafo) desatualizada em relação ao texto.
_CAMPOS_EDITAVEIS = ("data", "unidade", "nucleo", "autor", "assunto", "corpo",
                     "topicos", "nucleos_destino", "classificacao")
_CAMPOS_ANALISE = {"corpo", "assunto", "topicos", "classificacao"}
_CAMPOS_JSON = {"topicos", "nucleos_destino"}


def editar(eid: str, campos: dict, usuario: str = "sistema") -> dict:
    """Edita um extrato registrando QUEM/QUANDO/O QUÊ (valor anterior e novo) em
    extrato_edicoes + trilha de auditoria. `criado_em` nunca é alterado."""
    atual = obter(eid)
    if not atual:
        return {"ok": False, "erro": "extrato_nao_encontrado"}
    if em_processamento(eid):
        return {"ok": False, "erro": "processando",
                "detalhe": "Aguarde o processamento terminar para editar."}

    novos: dict = {}
    for k in _CAMPOS_EDITAVEIS:
        if campos.get(k) is None:
            continue
        v = campos[k]
        if k in _CAMPOS_JSON:
            v = [str(x).strip() for x in (v or []) if str(x).strip()]
        elif k == "classificacao":
            v = str(v).strip().lower()
        else:
            v = str(v).strip()
        if k == "corpo" and not v:
            return {"ok": False, "erro": "corpo_vazio",
                    "detalhe": "O corpo do extrato não pode ficar vazio."}
        antigo = atual.get(k) if k in _CAMPOS_JSON else (atual.get(k) or "")
        if v != antigo:
            novos[k] = v
    if not novos:
        return {"ok": True, "alterado": False, "extrato": atual}

    agora = _agora()
    with _conn() as con:
        sets, vals = [], []
        for k, v in novos.items():
            ant = atual.get(k)
            ant_s = json.dumps(ant, ensure_ascii=False) if k in _CAMPOS_JSON else (ant or "")
            novo_s = json.dumps(v, ensure_ascii=False) if k in _CAMPOS_JSON else v
            con.execute(
                "INSERT INTO extrato_edicoes (extrato_id, ts, usuario, campo, anterior, novo) "
                "VALUES (?,?,?,?,?,?)", (eid, agora, usuario, k, ant_s, novo_s))
            sets.append(f"{k}=?")
            vals.append(novo_s)
        sets += ["editado_em=?", "editado_por=?", "edicoes=COALESCE(edicoes,0)+1"]
        vals += [agora, usuario]
        desatualiza = bool(novos.keys() & _CAMPOS_ANALISE)
        if desatualiza:
            sets.append("analise_desatualizada=1")
        con.execute(f"UPDATE extratos SET {', '.join(sets)} WHERE id=?", vals + [eid])
        h_ant = hashlib.sha256((atual.get("corpo") or "").encode("utf-8")).hexdigest()[:16]
        h_novo = hashlib.sha256((novos.get("corpo", atual.get("corpo")) or "").encode("utf-8")).hexdigest()[:16]
        _auditar(con, eid, usuario, "EDITADO",
                 f"campos={','.join(sorted(novos))} corpo_sha {h_ant}->{h_novo}")
    return {"ok": True, "alterado": True, "campos": sorted(novos),
            "analise_desatualizada": desatualiza, "extrato": obter(eid)}


def historico_edicoes(eid: str, limite: int = 100) -> list[dict]:
    with _conn() as con:
        rows = con.execute(
            "SELECT ts, usuario, campo, anterior, novo FROM extrato_edicoes "
            "WHERE extrato_id=? ORDER BY id DESC LIMIT ?", (eid, limite)).fetchall()
    return [dict(r) for r in rows]


def excluir(eid: str, usuario: str = "sistema") -> dict:
    """Exclui o extrato e tudo que ele gerou (entidades, nós/vínculos auto no grafo,
    ocorrências do léxico, índice RAG). A trilha de auditoria é APPEND-ONLY e
    mantém o registro da exclusão (quem, quando e um resumo do que foi apagado)."""
    reg = obter(eid)
    if not reg:
        return {"ok": False, "erro": "extrato_nao_encontrado"}
    if em_processamento(eid):
        return {"ok": False, "erro": "processando",
                "detalhe": "Aguarde o processamento terminar para excluir."}

    sha = hashlib.sha256((reg.get("corpo") or "").encode("utf-8")).hexdigest()[:16]
    resumo = (f"assunto={(reg.get('assunto') or '')[:80]!r} unidade={reg.get('unidade')} "
              f"classif={reg.get('classificacao')} criado_em={reg.get('criado_em')} "
              f"criado_por={reg.get('criado_por')} corpo_sha={sha}")

    # 1) grafo (banco próprio) — em transação separada, antes de apagar o extrato
    try:
        grafo_res = grafo.remover_extrato(eid)
    except Exception as exc:
        grafo_res = {"erro": str(exc)}

    # 2) extrato.db
    with _conn() as con:
        con.execute("DELETE FROM extrato_entidades WHERE extrato_id=?", (eid,))
        try:
            con.execute("DELETE FROM lexico_ocorrencias WHERE extrato_id=?", (eid,))
        except sqlite3.OperationalError:
            pass  # léxico ainda não inicializado neste banco
        con.execute("DELETE FROM extrato_edicoes WHERE extrato_id=?", (eid,))
        con.execute("DELETE FROM extratos WHERE id=?", (eid,))
        _auditar(con, eid, usuario, "EXCLUIDO", resumo)

    # 3) índice RAG (best-effort, só se já carregado)
    try:
        import sys
        rag = sys.modules.get("modules.rag")
        if rag is not None and hasattr(rag, "_db"):
            rag._db.delete(where={"fonte": f"EXTRATO {eid}"})
    except Exception:
        pass
    return {"ok": True, "grafo": grafo_res}


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
    for b in ("forcado_local", "bloqueado", "risco_forcado", "rae_gerado", "analise_desatualizada"):
        d[b] = bool(d.get(b))
    return d


def obter(eid: str, user: dict | None = None) -> dict | None:
    """Le um extrato pelo ID.

    Regra do produto (piloto AIPEN): extrato e base compartilhada de ocorrencias
    — TODOS os usuarios autenticados veem TODOS os extratos, independente de
    quem criou. `criado_por` continua sendo gravado pra trilha de auditoria,
    mas nao restringe leitura. Se quiser reativar scoping estrito no futuro,
    basta descomentar o bloco abaixo.
    """
    # from services.scoping_service import pode_ver_registro  # scoping desativado
    with _conn() as con:
        row = con.execute("SELECT * FROM extratos WHERE id = ?", (eid,)).fetchone()
        if not row:
            return None
        d = _extrato_dict(row)
        # if user is not None and not pode_ver_registro(user, d, coluna="criado_por"):
        #     return None
        ents = con.execute(
            "SELECT * FROM extrato_entidades WHERE extrato_id = ? ORDER BY id", (eid,)
        ).fetchall()
        d["entidades"] = [dict(e) | {"evidencia_ok": bool(e["evidencia_ok"])} for e in ents]
    return d


def listar(limite: int = 200, user: dict | None = None) -> list[dict]:
    """Lista extratos recentes.

    Regra do produto: base compartilhada — todos veem tudo. `user` mantido
    na assinatura por compatibilidade / auditoria futura.
    """
    sql = (
        "SELECT id, data, unidade, nucleo, autor, assunto, assunto_sintetizado, "
        "       classificacao, status, risk_score, risk_nivel, criado_em, "
        "       processado_em, provedor, forcado_local, bloqueado, rae_gerado, "
        "       editado_em, editado_por, edicoes, analise_desatualizada, "
        "       processando_desde, criado_por "
        "FROM extratos "
        "ORDER BY criado_em DESC LIMIT ?"
    )
    with _conn() as con:
        rows = con.execute(sql, (limite,)).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["forcado_local"] = bool(d["forcado_local"])
            d["bloqueado"] = bool(d["bloqueado"])
            d["rae_gerado"] = bool(d["rae_gerado"])
            d["analise_desatualizada"] = bool(d.get("analise_desatualizada"))
            d["edicoes"] = d.get("edicoes") or 0
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
            "topicos", "nucleos_destino", "classificacao", "criado_em",
            "criado_por", "editado_em", "editado_por", "edicoes",
            "processado_em", "provedor", "modelo", "prompt_versao", "forcado_local")},
        "status": reg.get("status"),
        "erro": reg.get("erro"),
        "analise_desatualizada": reg.get("analise_desatualizada"),
        "historico_edicoes": historico_edicoes(eid),
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
