# -*- coding: utf-8 -*-
"""
services/feedback_service.py — Feedback Loop de Correlação (Missão 25)
─────────────────────────────────────────────────────────────────────────────
Registra e processa o feedback do operador sobre HITLs de correlação.

COMO FUNCIONA:
  1. Operador responde um HITL (CONFIRMAR ou REJEITAR) no app ou WhatsApp.
  2. human_loop_router.py chama registrar_feedback() com os hits do HITL.
  3. Para cada hit (entidade detectada), salva uma linha em correlacao_feedback.
  4. Antes de abrir um novo HITL, correlacao_engine.py chama verificar_supressao().
  5. Se a taxa de rejeição de um par (tipo_evento × entidade × fonte) ultrapassar
     o threshold, o sistema suprime o HITL silenciosamente — sem incomodar o
     operador com um alerta que já foi considerado irrelevante.

THRESHOLD DE SUPRESSÃO (configurável):
  FEEDBACK_MIN_AMOSTRAS=3    → mínimo de decisões antes de suprimir (padrão: 3)
  FEEDBACK_THRESHOLD=0.75    → taxa de rejeição para suprimir (padrão: 75%)

  Exemplo: se o par (correlacao_cruzada, silvio andrade costa, Alvo Monitorado)
  foi rejeitado 3x em 4 decisões (75%) → próximas ocorrências são suprimidas.

ADMINISTRAÇÃO:
  O admin pode ver o que está sendo suprimido via GET /api/feedback/suprimidos
  e resetar o aprendizado de qualquer par via DELETE /api/feedback/reset.

LGPD:
  Feedback é auditável (criado_em, operador registrados).
  Reset de feedback registra quem resetou e quando.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import uuid
from datetime import datetime, timezone

logger = logging.getLogger("bastos.feedback")

BASE_DIR  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DB_PATH  = os.path.join(BASE_DIR, "data", "auth.db")

# Configuração de supressão (sobrescrita por .env)
_MIN_AMOSTRAS = int(os.getenv("FEEDBACK_MIN_AMOSTRAS", "3"))
_THRESHOLD    = float(os.getenv("FEEDBACK_THRESHOLD", "0.75"))


# ── Banco ─────────────────────────────────────────────────────────────────────

def _conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
    c = sqlite3.connect(_DB_PATH, check_same_thread=False)
    c.execute("PRAGMA journal_mode=WAL")
    return c


def _init_db() -> None:
    with _conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS correlacao_feedback (
                id             TEXT PRIMARY KEY,
                hitl_id        TEXT NOT NULL,
                tipo_evento    TEXT NOT NULL,
                alvo_nome_norm TEXT NOT NULL,
                alvo_fonte     TEXT NOT NULL,
                decisao        TEXT NOT NULL,   -- 'confirmada' | 'rejeitada'
                operador       TEXT NOT NULL,
                criado_em      TEXT NOT NULL
            )
        """)
        # Index para lookup rápido por par (tipo × entidade × fonte)
        c.execute("""
            CREATE INDEX IF NOT EXISTS idx_feedback_par
            ON correlacao_feedback(tipo_evento, alvo_nome_norm, alvo_fonte)
        """)
        # Index para dedup: um HITL não gera feedback duas vezes para o mesmo hit
        c.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_hitl_hit
            ON correlacao_feedback(hitl_id, alvo_nome_norm, alvo_fonte)
        """)


_init_db()


# ── Registro de feedback ──────────────────────────────────────────────────────

def registrar_feedback(
    hitl_id:    str,
    tipo_evento: str,
    hits:       list[dict],
    decisao:    str,
    operador:   str,
) -> int:
    """
    Registra o feedback do operador para cada hit de um HITL respondido.

    Parâmetros:
      hitl_id     : UUID do HITL respondido
      tipo_evento : ex: "correlacao_cruzada", "transcricao_cruzamen"
      hits        : lista de dicts com 'nome', 'fonte', (opcional) 'nome_norm'
                    — vem de detalhes_json['hits'] do HITL
      decisao     : "confirmada" | "rejeitada"
      operador    : username de quem decidiu

    Retorna: número de registros inseridos (0 se já existiam — idempotente)
    """
    if not hits:
        return 0

    agora    = datetime.now(timezone.utc).isoformat()
    inseridos = 0

    with _conn() as c:
        for h in hits:
            nome_norm = h.get("nome_norm") or _norm_simples(h.get("nome", ""))
            fonte     = h.get("fonte", "desconhecida")
            if not nome_norm:
                continue
            try:
                cur = c.execute(
                    """INSERT OR IGNORE INTO correlacao_feedback
                       (id, hitl_id, tipo_evento, alvo_nome_norm, alvo_fonte,
                        decisao, operador, criado_em)
                       VALUES (?,?,?,?,?,?,?,?)""",
                    (str(uuid.uuid4()), hitl_id, tipo_evento, nome_norm,
                     fonte, decisao, operador, agora),
                )
                inseridos += cur.rowcount
            except Exception as exc:
                logger.warning("[feedback] Falha ao inserir hit '%s': %s", nome_norm, exc)

    logger.info(
        "[feedback] HITL %s | decisao=%s | hits=%d | inseridos=%d | op=%s",
        hitl_id[:8], decisao, len(hits), inseridos, operador,
    )
    return inseridos


def _norm_simples(nome: str) -> str:
    """Normalização básica sem unicodedata (fallback se nome_norm não vier no hit)."""
    import unicodedata, re
    t = unicodedata.normalize("NFKD", str(nome))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t.strip().lower())


# ── Verificação de supressão ──────────────────────────────────────────────────

def verificar_supressao(
    tipo_evento:    str,
    alvo_nome_norm: str,
    alvo_fonte:     str,
) -> bool:
    """
    Verifica se um par (tipo_evento × entidade × fonte) deve ser suprimido
    com base no histórico de feedback.

    Retorna True se o HITL deve ser SUPRIMIDO (não abrir).
    Retorna False se deve abrir normalmente.

    Lógica:
      - Precisa de pelo menos FEEDBACK_MIN_AMOSTRAS decisões
      - Taxa de rejeição >= FEEDBACK_THRESHOLD → suprimir
    """
    try:
        with _conn() as c:
            row = c.execute(
                """SELECT
                     COUNT(*) AS total,
                     SUM(CASE WHEN decisao = 'rejeitada' THEN 1 ELSE 0 END) AS rejeicoes
                   FROM correlacao_feedback
                   WHERE tipo_evento = ? AND alvo_nome_norm = ? AND alvo_fonte = ?""",
                (tipo_evento, alvo_nome_norm, alvo_fonte),
            ).fetchone()

        if not row or row[0] < _MIN_AMOSTRAS:
            return False   # amostras insuficientes → não suprimir

        total     = row[0]
        rejeicoes = row[1] or 0
        taxa      = rejeicoes / total

        if taxa >= _THRESHOLD:
            logger.info(
                "[feedback] Suprimindo hit '%s' (%s/%s) — taxa_rejeicao=%.0f%% >= %.0f%%",
                alvo_nome_norm, tipo_evento, alvo_fonte,
                taxa * 100, _THRESHOLD * 100,
            )
            return True

        return False

    except Exception as exc:
        logger.warning("[feedback] Erro em verificar_supressao: %s", exc)
        return False   # em caso de erro, nunca suprimir (fail-safe)


# ── Estatísticas ──────────────────────────────────────────────────────────────

def listar_stats(limite: int = 100) -> list[dict]:
    """
    Retorna estatísticas de feedback por par (tipo × entidade × fonte).
    Ordenado por taxa de rejeição decrescente.
    """
    try:
        with _conn() as c:
            rows = c.execute(
                """SELECT
                     tipo_evento,
                     alvo_nome_norm,
                     alvo_fonte,
                     COUNT(*) AS total,
                     SUM(CASE WHEN decisao = 'confirmada' THEN 1 ELSE 0 END) AS confirmacoes,
                     SUM(CASE WHEN decisao = 'rejeitada'  THEN 1 ELSE 0 END) AS rejeicoes,
                     MAX(criado_em) AS ultima_decisao
                   FROM correlacao_feedback
                   GROUP BY tipo_evento, alvo_nome_norm, alvo_fonte
                   ORDER BY (rejeicoes * 1.0 / total) DESC, total DESC
                   LIMIT ?""",
                (limite,),
            ).fetchall()

        return [
            {
                "tipo_evento":    r[0],
                "entidade":       r[1],
                "fonte":          r[2],
                "total":          r[3],
                "confirmacoes":   r[4],
                "rejeicoes":      r[5],
                "taxa_rejeicao":  round(r[5] / r[3], 3) if r[3] else 0,
                "suprimido":      (r[3] >= _MIN_AMOSTRAS and
                                   (r[5] / r[3]) >= _THRESHOLD),
                "ultima_decisao": r[6],
            }
            for r in rows
        ]
    except Exception as exc:
        logger.warning("[feedback] Erro em listar_stats: %s", exc)
        return []


def listar_suprimidos() -> list[dict]:
    """Retorna apenas os pares que estão atualmente sendo suprimidos."""
    return [s for s in listar_stats() if s["suprimido"]]


def resetar_feedback(
    alvo_nome_norm: str,
    alvo_fonte:     str,
    operador:       str = "sistema",
) -> int:
    """
    Remove todo o histórico de feedback de um par (entidade × fonte).
    Após reset, o sistema volta a abrir HITLs para esse par normalmente.

    Retorna o número de registros removidos.
    """
    try:
        with _conn() as c:
            cur = c.execute(
                "DELETE FROM correlacao_feedback "
                "WHERE alvo_nome_norm = ? AND alvo_fonte = ?",
                (alvo_nome_norm, alvo_fonte),
            )
            removidos = cur.rowcount

        logger.info(
            "[feedback] Reset: '%s' (%s) | %d registros removidos | op=%s",
            alvo_nome_norm, alvo_fonte, removidos, operador,
        )
        return removidos
    except Exception as exc:
        logger.warning("[feedback] Erro em resetar_feedback: %s", exc)
        return 0
