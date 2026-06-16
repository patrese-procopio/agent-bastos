# -*- coding: utf-8 -*-
"""
services/correlacao_engine.py — Motor de Correlação Cruzada (Missão 23)
Agent Bastos | AIPEN

Detecta automaticamente quando um nome monitorado aparece em qualquer módulo
e abre HITL com contexto completo.

DOIS MODOS DE OPERAÇÃO:
  A) Reativo — texto chegou (extrato, alerta):
       correlacionar_texto(texto, fonte_tipo, fonte_id, metadados, operador)
       → cruza o texto contra corpus de entidades conhecidas

  B) Reativo — entidade chegou (nova liderança):
       correlacionar_entidade(nome, vulgo, fonte_tipo, fonte_id, metadados, operador)
       → busca o nome em textos históricos (extratos)

  C) Proativo — reprocessamento completo:
       reprocessar_todos(operador)
       → carrega todos os textos do histórico e reaplica o cruzamento

DEDUPLICAÇÃO:
  Tabela `correlacoes_registradas` com UNIQUE INDEX em
  (fonte_tipo, fonte_id, alvo_nome_norm) garante que o mesmo par
  texto × entidade nunca gere dois HITLs, mesmo se o job proativo
  rodar múltiplas vezes.

PRINCÍPIOS:
  - Nunca propaga exceção para o chamador (try/except global)
  - Zero LLM — matching determinístico por tokens (custo zero)
  - Mesmo algoritmo de normalização do pipeline_transcricao.py
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sqlite3
import unicodedata
import uuid
from datetime import datetime, timezone

logger = logging.getLogger("bastos.correlacao")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# BD central (mesmo arquivo que HITL usa — uma trilha de auditoria unificada)
_DB_PATH = os.path.join(BASE_DIR, "data", "auth.db")

# BD de extratos (fonte dos textos históricos)
_EXTRATO_DB = os.path.join(BASE_DIR, "data", "extrato", "extrato.db")

# Stop words para tokenização
_STOP = {
    "de", "da", "do", "dos", "das", "e", "em", "para", "por",
    "com", "os", "as", "um", "uma", "na", "no", "nos", "nas",
    "ao", "aos", "a", "o",
}


# ── Normalização (idêntica ao pipeline_transcricao) ───────────────────────────

def _norm(txt: str) -> str:
    if not txt:
        return ""
    t = unicodedata.normalize("NFKD", str(txt))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t.strip().lower())


def _tokens(nome_norm: str) -> list:
    return [t for t in nome_norm.split() if len(t) >= 4 and t not in _STOP]


def _tem_hit(texto_norm: str, entrada: dict) -> bool:
    nome_norm = entrada.get("nome_norm", "")
    if not nome_norm or len(nome_norm) < 4:
        return False
    if nome_norm in texto_norm:
        return True
    toks = _tokens(nome_norm)
    if not toks:
        return False
    if len(toks) == 1:
        return toks[0] in texto_norm
    if len(toks) == 2:
        return (toks[0] in texto_norm) and (toks[1] in texto_norm)
    return (toks[0] in texto_norm) and (toks[-1] in texto_norm)


# ── Banco de deduplicação ────────────────────────────────────────────────────

def _conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
    c = sqlite3.connect(_DB_PATH, check_same_thread=False)
    c.execute("PRAGMA journal_mode=WAL")
    return c


def _init_db() -> None:
    with _conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS correlacoes_registradas (
                id             TEXT PRIMARY KEY,
                fonte_tipo     TEXT NOT NULL,
                fonte_id       TEXT NOT NULL,
                alvo_nome_norm TEXT NOT NULL,
                alvo_fonte     TEXT NOT NULL,
                hitl_id        TEXT,
                criado_em      TEXT NOT NULL
            )
        """)
        c.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_corr_dedup
            ON correlacoes_registradas(fonte_tipo, fonte_id, alvo_nome_norm)
        """)


_init_db()


def _ja_registrada(fonte_tipo: str, fonte_id: str, alvo_nome_norm: str) -> bool:
    with _conn() as c:
        row = c.execute(
            "SELECT 1 FROM correlacoes_registradas "
            "WHERE fonte_tipo=? AND fonte_id=? AND alvo_nome_norm=?",
            (fonte_tipo, fonte_id, alvo_nome_norm),
        ).fetchone()
    return row is not None


def _registrar(fonte_tipo: str, fonte_id: str, alvo_nome_norm: str,
               alvo_fonte: str, hitl_id: str | None) -> bool:
    """Registra correlação. Retorna True se inseriu, False se já existia."""
    try:
        with _conn() as c:
            cur = c.execute(
                """INSERT OR IGNORE INTO correlacoes_registradas
                   (id, fonte_tipo, fonte_id, alvo_nome_norm, alvo_fonte, hitl_id, criado_em)
                   VALUES (?,?,?,?,?,?,?)""",
                (str(uuid.uuid4()), fonte_tipo, fonte_id, alvo_nome_norm,
                 alvo_fonte, hitl_id, datetime.now(timezone.utc).isoformat()),
            )
            return cur.rowcount > 0
    except Exception as exc:
        logger.warning("[correlacao] Falha ao registrar dedup: %s", exc)
        return False


# ── Corpus de entidades monitoradas ──────────────────────────────────────────

def _carregar_corpus() -> list[dict]:
    """Carrega alvos.json + liderancas.db + extrato_entidades."""
    corpus: list[dict] = []
    seen: set[str] = set()

    def _add(nome: str, fonte: str, detalhe: str) -> None:
        n = _norm(nome)
        if n and len(n) >= 4 and n not in seen:
            seen.add(n)
            corpus.append({"nome": nome, "nome_norm": n, "fonte": fonte, "detalhe": detalhe})

    # 1. alvos.json
    try:
        path = os.path.join(BASE_DIR, "data", "alvos.json")
        with open(path, encoding="utf-8") as f:
            for a in json.load(f):
                if a.get("tipo") == "termo":
                    _add(a.get("termo", ""), "Alvo Monitorado",
                         a.get("descricao") or "Termo monitorado")
                else:
                    _add(a.get("nome", ""), "Alvo Monitorado", "Alvo monitorado (pessoa)")
    except Exception as exc:
        logger.warning("[correlacao] alvos.json: %s", exc)

    # 2. liderancas.db — pavilhão
    try:
        db = os.path.join(BASE_DIR, "data", "liderancas", "liderancas.db")
        if os.path.exists(db):
            con = sqlite3.connect(db, timeout=5)
            con.row_factory = sqlite3.Row
            for r in con.execute(
                "SELECT nome, vulgo, cargo, faccao, unidade FROM liderancas"
                " WHERE nome IS NOT NULL AND nome != ''"
            ).fetchall():
                info = f"Cargo: {r['cargo']} | Facção: {r['faccao']} | Unidade: {r['unidade']}"
                _add(r["nome"], "Liderança (Pavilhão)", info)
                if r["vulgo"]:
                    _add(r["vulgo"], "Liderança (Pavilhão)", f"Vulgo de {r['nome']} | {info}")
            con.close()
    except Exception as exc:
        logger.warning("[correlacao] liderancas.db (pavilhao): %s", exc)

    # 3. liderancas.db — rua
    try:
        db = os.path.join(BASE_DIR, "data", "liderancas", "liderancas.db")
        if os.path.exists(db):
            con = sqlite3.connect(db, timeout=5)
            con.row_factory = sqlite3.Row
            tabelas = {r[0] for r in con.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()}
            if "lideres_rua" in tabelas and "faccoes_rua" in tabelas:
                for r in con.execute(
                    "SELECT l.nome, l.vulgo, l.cargo, f.nome AS faccao_nome"
                    " FROM lideres_rua l JOIN faccoes_rua f ON f.id = l.faccao_id"
                    " WHERE l.nome IS NOT NULL AND l.nome != ''"
                ).fetchall():
                    info = f"Cargo: {r['cargo']} | Facção: {r['faccao_nome']} (Rua)"
                    _add(r["nome"], "Liderança (Rua)", info)
                    if r["vulgo"]:
                        _add(r["vulgo"], "Liderança (Rua)", f"Vulgo de {r['nome']} | {info}")
            con.close()
    except Exception as exc:
        logger.warning("[correlacao] liderancas.db (rua): %s", exc)

    # 4. extrato_entidades
    try:
        db = os.path.join(BASE_DIR, "data", "extrato", "extrato.db")
        if os.path.exists(db):
            con = sqlite3.connect(db, timeout=5)
            con.row_factory = sqlite3.Row
            for r in con.execute(
                "SELECT DISTINCT nome, vulgo, papel, extrato_id FROM extrato_entidades"
                " WHERE nome IS NOT NULL AND nome != ''"
            ).fetchall():
                info = f"Papel: {r['papel'] or 'N/A'} | Extrato: {r['extrato_id']}"
                _add(r["nome"], "Extrato de Campo", info)
                if r["vulgo"]:
                    _add(r["vulgo"], "Extrato de Campo", f"Vulgo de {r['nome']} | {info}")
            con.close()
    except Exception as exc:
        logger.warning("[correlacao] extrato_entidades: %s", exc)

    return corpus


# ── Textos históricos (para modo proativo e correlacionar_entidade) ──────────

def _carregar_extratos_historicos() -> list[dict]:
    """Retorna lista de {id, corpo, unidade, assunto} de todos os extratos."""
    try:
        if not os.path.exists(_EXTRATO_DB):
            return []
        con = sqlite3.connect(_EXTRATO_DB, timeout=5)
        con.row_factory = sqlite3.Row
        rows = con.execute(
            "SELECT id, corpo, unidade, assunto, data FROM extratos"
            " WHERE corpo IS NOT NULL AND corpo != '' ORDER BY data DESC"
        ).fetchall()
        con.close()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.warning("[correlacao] Erro ao carregar extratos históricos: %s", exc)
        return []


# ── HITL ──────────────────────────────────────────────────────────────────────

def _abrir_hitl(hits: list[dict], fonte_tipo: str, fonte_id: str,
                metadados: dict, operador: str) -> str | None:
    """Cria aprovação HITL e dispara notificação. Retorna o ID criado ou None."""
    try:
        from services.human_loop_service import criar_aprovacao, marcar_notificado
        from services.notification_service import notificar_aprovacao_pendente
    except ImportError:
        logger.warning("[correlacao] HITL indisponível.")
        return None

    nomes = [h["nome"] for h in hits]
    sufixo = " ..." if len(hits) > 3 else ""
    desc_curta = (
        f"Correlação [{fonte_tipo}:{fonte_id[:12]}] "
        f"— {len(hits)} hit(s): {', '.join(nomes[:3])}{sufixo}"
    )

    risco = metadados.get("risco", "ALTO").upper()
    summary = (metadados.get("summary") or metadados.get("corpo") or "")[:300]
    n_flags = metadados.get("red_flags", 0)

    detalhes = {
        "fonte_tipo": fonte_tipo,
        "fonte_id":   fonte_id,
        "risco":      risco,
        "summary":    summary,
        "red_flags":  n_flags,
        "metadados":  {k: v for k, v in metadados.items()
                       if k not in ("summary", "corpo", "risco", "red_flags")},
        "hits": [
            {"nome": h["nome"], "fonte": h["fonte"], "detalhe": h["detalhe"]}
            for h in hits[:10]
        ],
    }

    aprov_id = criar_aprovacao(
        tipo_evento="correlacao_cruzada",
        descricao=desc_curta,
        risco=risco,
        operador=operador,
        detalhes=detalhes,
    )

    hits_linhas = "\n".join(
        f"  * [{h['fonte']}] {h['nome']}\n    {h['detalhe']}" for h in hits[:10]
    )
    descricao_longa = (
        f"CORRELAÇÃO AUTOMÁTICA\n"
        f"Módulo  : {fonte_tipo}\n"
        f"Origem  : {fonte_id[:40]}\n"
        f"Risco   : {risco}\n\n"
        f"NOMES ENCONTRADOS:\n{hits_linhas}\n\n"
        f"Contexto:\n{summary}"
    )

    loop = asyncio.new_event_loop()
    try:
        sucesso = loop.run_until_complete(
            notificar_aprovacao_pendente(
                aprovacao_id=aprov_id,
                tipo_evento="correlacao_cruzada",
                descricao=descricao_longa,
                risco=risco,
                operador=operador,
                detalhes=detalhes,
            )
        )
        marcar_notificado(aprov_id, sucesso)
    finally:
        loop.close()

    logger.info(
        "[correlacao] HITL aberto: %s | hits=%d | fonte=%s/%s",
        aprov_id, len(hits), fonte_tipo, fonte_id,
    )
    return aprov_id


# ── Modo A: texto novo → entidades conhecidas ─────────────────────────────────

def correlacionar_texto(
    texto: str,
    fonte_tipo: str,
    fonte_id: str,
    metadados: dict | None = None,
    operador: str = "sistema",
) -> None:
    """
    Chamado como BackgroundTask quando um novo texto chega (extrato, alerta).
    Cruza o texto contra o corpus de entidades monitoradas.
    Nunca propaga exceção.
    """
    try:
        if not texto or len(texto.strip()) < 10:
            return

        texto_norm = _norm(texto)
        corpus = _carregar_corpus()
        metadados = metadados or {}

        # Filtra apenas hits ainda não registrados para este (fonte_tipo, fonte_id)
        hits_novos: list[dict] = []
        for entrada in corpus:
            key = entrada["nome_norm"]
            if _ja_registrada(fonte_tipo, fonte_id, key):
                continue
            if _tem_hit(texto_norm, entrada):
                hits_novos.append(entrada)

        if not hits_novos:
            logger.info("[correlacao] %s/%s: sem hits novos.", fonte_tipo, fonte_id)
            return

        logger.info(
            "[correlacao] %s/%s: %d hit(s) → %s",
            fonte_tipo, fonte_id, len(hits_novos),
            [h["nome"] for h in hits_novos],
        )

        hitl_id = _abrir_hitl(hits_novos, fonte_tipo, fonte_id, metadados, operador)

        for h in hits_novos:
            _registrar(fonte_tipo, fonte_id, h["nome_norm"], h["fonte"], hitl_id)

    except Exception as exc:
        logger.error("[correlacao] Erro em correlacionar_texto: %s", exc, exc_info=True)


# ── Modo B: entidade nova → textos históricos ─────────────────────────────────

def correlacionar_entidade(
    nome: str,
    vulgo: str | None,
    fonte_tipo: str,
    fonte_id: str,
    metadados: dict | None = None,
    operador: str = "sistema",
) -> None:
    """
    Chamado quando uma nova liderança é cadastrada.
    Busca o nome/vulgo em extratos históricos.
    Nunca propaga exceção.
    """
    try:
        metadados = metadados or {}
        nomes_busca = [n for n in [nome, vulgo] if n and len(_norm(n)) >= 4]
        if not nomes_busca:
            return

        entidades = [
            {"nome": n, "nome_norm": _norm(n),
             "fonte": fonte_tipo, "detalhe": metadados.get("detalhe", "")}
            for n in nomes_busca
        ]

        extratos = _carregar_extratos_historicos()
        if not extratos:
            logger.debug("[correlacao] Nenhum extrato histórico para cruzar.")
            return

        # Para cada entidade, coleta extratos que a mencionam (e ainda não registrados)
        resultados: dict[str, list[dict]] = {}  # nome_norm → lista de extratos
        for ent in entidades:
            for ex in extratos:
                texto_norm = _norm(ex.get("corpo", ""))
                if _tem_hit(texto_norm, ent):
                    # Dedup: chave é (fonte_tipo=extrato, fonte_id=extrato_id, alvo=nome_norm)
                    if not _ja_registrada("extrato", ex["id"], ent["nome_norm"]):
                        resultados.setdefault(ent["nome_norm"], []).append(ex)

        if not resultados:
            logger.info("[correlacao] Entidade %s: sem matches em histórico.", nome)
            return

        # Cria UM HITL consolidado por entidade com lista de extratos onde aparece
        for nome_norm, extratos_match in resultados.items():
            ent_obj = next(e for e in entidades if e["nome_norm"] == nome_norm)
            n_ex = len(extratos_match)

            hits_para_hitl = [{
                "nome": ent_obj["nome"],
                "fonte": f"Encontrado em {n_ex} extrato(s) histórico(s)",
                "detalhe": " | ".join(
                    f"{e.get('assunto') or e.get('unidade') or e['id'][:8]}"
                    for e in extratos_match[:5]
                ),
            }]

            meta_hitl = {
                **metadados,
                "summary": (
                    f"Nova entidade '{ent_obj['nome']}' ({fonte_tipo}) encontrada "
                    f"em {n_ex} extrato(s) histórico(s)."
                ),
                "extratos_ids": [e["id"] for e in extratos_match[:10]],
            }

            hitl_id = _abrir_hitl(hits_para_hitl, fonte_tipo, fonte_id, meta_hitl, operador)

            for ex in extratos_match:
                _registrar("extrato", ex["id"], nome_norm, fonte_tipo, hitl_id)

        logger.info(
            "[correlacao] Entidade %s: matches em %d extrato(s).",
            nome, sum(len(v) for v in resultados.values()),
        )

    except Exception as exc:
        logger.error("[correlacao] Erro em correlacionar_entidade: %s", exc, exc_info=True)


# ── Modo C: reprocessamento proativo completo ────────────────────────────────

def reprocessar_todos(operador: str = "sistema") -> dict:
    """
    Reprocessa todos os textos históricos contra o corpus atual de entidades.
    Só abre HITL para pares (texto, entidade) ainda não registrados.
    Retorna estatísticas do processamento.
    """
    stats = {
        "extratos_verificados": 0,
        "novos_hits": 0,
        "hitls_abertos": 0,
        "erros": 0,
    }

    try:
        corpus = _carregar_corpus()
        if not corpus:
            logger.warning("[correlacao] Corpus vazio — nada a reprocessar.")
            return stats

        extratos = _carregar_extratos_historicos()
        stats["extratos_verificados"] = len(extratos)

        for ex in extratos:
            try:
                texto_norm = _norm(ex.get("corpo", ""))
                if not texto_norm or len(texto_norm) < 10:
                    continue

                hits_novos: list[dict] = []
                for entrada in corpus:
                    key = entrada["nome_norm"]
                    if _ja_registrada("extrato", ex["id"], key):
                        continue
                    if _tem_hit(texto_norm, entrada):
                        hits_novos.append(entrada)

                if not hits_novos:
                    continue

                stats["novos_hits"] += len(hits_novos)

                meta = {
                    "summary": (ex.get("assunto") or "")[:200],
                    "unidade": ex.get("unidade", ""),
                    "data":    ex.get("data", ""),
                    "risco":   "ALTO",
                }

                hitl_id = _abrir_hitl(
                    hits_novos, "extrato", ex["id"], meta, operador
                )
                if hitl_id:
                    stats["hitls_abertos"] += 1

                for h in hits_novos:
                    _registrar("extrato", ex["id"], h["nome_norm"], h["fonte"], hitl_id)

            except Exception as exc:
                stats["erros"] += 1
                logger.warning("[correlacao] Erro no extrato %s: %s", ex.get("id"), exc)

    except Exception as exc:
        logger.error("[correlacao] Erro em reprocessar_todos: %s", exc, exc_info=True)
        stats["erros"] += 1

    logger.info(
        "[correlacao] Reprocessamento concluído: %s",
        stats,
        extra={"stats": stats},
    )
    return stats
