"""
human_loop_service.py — Lógica de negócio para aprovações Human-in-the-Loop
─────────────────────────────────────────────────────────────────────────────
Gerencia o ciclo de vida de uma AprovacaoPendente:

  PENDENTE → CONFIRMADA  (analista aprova via WhatsApp)
  PENDENTE → REJEITADA   (analista rejeita via WhatsApp)
  PENDENTE → EXPIRADA    (ninguém respondeu dentro do timeout)

Por que SQLite e não só memória?
  Se o backend reiniciar enquanto há aprovações pendentes, elas não se
  perdem. O chefe pode responder no WhatsApp horas depois e o sistema
  ainda processa corretamente.

Schema da tabela `aprovacoes_pendentes`:
  id             TEXT PRIMARY KEY     — UUID v4
  tipo_evento    TEXT NOT NULL        — ex: "transcricao_risco_alto"
  descricao      TEXT NOT NULL        — descrição curta para o WhatsApp
  risco          TEXT NOT NULL        — ALTO | CRÍTICO
  operador       TEXT NOT NULL        — quem gerou o evento
  status         TEXT NOT NULL        — pendente | confirmada | rejeitada | expirada
  detalhes_json  TEXT                 — JSON com contexto livre (alvo, chunk, etc.)
  notificado     INTEGER DEFAULT 0    — 1 se o WhatsApp foi alcançado com sucesso
  criado_em      TEXT NOT NULL        — ISO UTC
  respondido_em  TEXT                 — ISO UTC | NULL
  resposta_por   TEXT                 — identificador do respondente | NULL
  observacao     TEXT                 — texto livre opcional da resposta
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger("bastos.human_loop")

# Banco compartilhado com auth (já existe) — tabela nova, sem conflito
_DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data", "auth.db",
)

# Aprovações sem resposta após este prazo são marcadas como expiradas
_TIMEOUT_MINUTOS = int(os.getenv("HITL_TIMEOUT_MINUTOS", "60"))


# ── Banco ─────────────────────────────────────────────────────────────────────

def _conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
    c = sqlite3.connect(_DB_PATH, check_same_thread=False)
    c.execute("PRAGMA journal_mode=WAL")
    return c


def _init_db() -> None:
    """Cria a tabela se não existir. Idempotente."""
    with _conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS aprovacoes_pendentes (
                id             TEXT PRIMARY KEY,
                tipo_evento    TEXT NOT NULL,
                descricao      TEXT NOT NULL,
                risco          TEXT NOT NULL,
                operador       TEXT NOT NULL,
                status         TEXT NOT NULL DEFAULT 'pendente',
                detalhes_json  TEXT,
                notificado     INTEGER NOT NULL DEFAULT 0,
                criado_em      TEXT NOT NULL,
                respondido_em  TEXT,
                resposta_por   TEXT,
                observacao     TEXT
            )
        """)
        # Índices para consultas frequentes
        c.execute("CREATE INDEX IF NOT EXISTS idx_ap_status ON aprovacoes_pendentes(status)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_ap_criado ON aprovacoes_pendentes(criado_em)")


_init_db()


# ── CRUD ──────────────────────────────────────────────────────────────────────

def criar_aprovacao(
    tipo_evento: str,
    descricao:   str,
    risco:       str,
    operador:    str,
    detalhes:    dict | None = None,
) -> str:
    """
    Registra uma nova aprovação pendente e retorna o UUID gerado.

    Esse UUID é o elo entre o backend, o n8n e o WhatsApp:
    - O n8n o inclui na mensagem (ex: "ID: abc123")
    - A resposta do WhatsApp traz esse ID de volta
    - O endpoint /responder/{id} usa esse ID para fechar o loop
    """
    aprov_id  = str(uuid.uuid4())
    agora     = datetime.now(timezone.utc).isoformat()
    det_json  = json.dumps(detalhes or {}, ensure_ascii=False)

    with _conn() as c:
        c.execute(
            """
            INSERT INTO aprovacoes_pendentes
              (id, tipo_evento, descricao, risco, operador,
               status, detalhes_json, notificado, criado_em)
            VALUES (?, ?, ?, ?, ?, 'pendente', ?, 0, ?)
            """,
            (aprov_id, tipo_evento, descricao, risco, operador, det_json, agora),
        )

    logger.info(
        "Aprovação HITL criada.",
        extra={
            "aprovacao_id": aprov_id,
            "tipo_evento": tipo_evento,
            "risco": risco,
            "operador": operador,
        },
    )
    return aprov_id


def marcar_notificado(aprovacao_id: str, sucesso: bool) -> None:
    """Registra se o WhatsApp foi alcançado com sucesso."""
    with _conn() as c:
        c.execute(
            "UPDATE aprovacoes_pendentes SET notificado = ? WHERE id = ?",
            (1 if sucesso else 0, aprovacao_id),
        )


def responder_aprovacao(
    aprovacao_id: str,
    decisao:      str,   # "confirmada" | "rejeitada"
    resposta_por: str = "whatsapp",
    observacao:   str = "",
) -> dict:
    """
    Processa a resposta do Chefe de Inteligência.

    Retorna o registro atualizado ou lança ValueError se inválido.

    Conceito importante — idempotência:
      Se o mesmo ID chegar duas vezes (clique duplo no botão WA), a segunda
      chamada retorna o registro já resolvido sem erro e sem reprocessar.
    """
    decisao = decisao.strip().lower()
    if decisao not in ("confirmada", "rejeitada"):
        raise ValueError(f"Decisão inválida: '{decisao}'. Use 'confirmada' ou 'rejeitada'.")

    agora = datetime.now(timezone.utc).isoformat()

    with _conn() as c:
        row = c.execute(
            "SELECT status FROM aprovacoes_pendentes WHERE id = ?",
            (aprovacao_id,),
        ).fetchone()

        if not row:
            raise ValueError(f"Aprovação '{aprovacao_id}' não encontrada.")

        # Idempotência: já resolvida → retorna sem reprocessar
        if row[0] != "pendente":
            return buscar_aprovacao(aprovacao_id)  # type: ignore

        c.execute(
            """
            UPDATE aprovacoes_pendentes
            SET status = ?, respondido_em = ?, resposta_por = ?, observacao = ?
            WHERE id = ?
            """,
            (decisao, agora, resposta_por, observacao, aprovacao_id),
        )

    logger.info(
        "Aprovação HITL respondida.",
        extra={
            "aprovacao_id": aprovacao_id,
            "decisao": decisao,
            "resposta_por": resposta_por,
        },
    )
    return buscar_aprovacao(aprovacao_id)  # type: ignore


def buscar_aprovacao(aprovacao_id: str) -> dict | None:
    """Retorna o registro completo de uma aprovação."""
    with _conn() as c:
        row = c.execute(
            """
            SELECT id, tipo_evento, descricao, risco, operador,
                   status, detalhes_json, notificado, criado_em,
                   respondido_em, resposta_por, observacao
            FROM aprovacoes_pendentes WHERE id = ?
            """,
            (aprovacao_id,),
        ).fetchone()

    if not row:
        return None

    return {
        "id":            row[0],
        "tipo_evento":   row[1],
        "descricao":     row[2],
        "risco":         row[3],
        "operador":      row[4],
        "status":        row[5],
        "detalhes":      json.loads(row[6] or "{}"),
        "notificado":    bool(row[7]),
        "criado_em":     row[8],
        "respondido_em": row[9],
        "resposta_por":  row[10],
        "observacao":    row[11],
    }


def listar_aprovacoes(
    status: str | None = None,
    limite: int = 50,
) -> list[dict]:
    """Lista aprovações, opcionalmente filtrando por status."""
    sql    = "SELECT id, tipo_evento, descricao, risco, operador, status, detalhes_json, notificado, criado_em, respondido_em FROM aprovacoes_pendentes"
    params: list = []
    if status:
        sql   += " WHERE status = ?"
        params.append(status)
    sql += " ORDER BY criado_em DESC LIMIT ?"
    params.append(limite)

    with _conn() as c:
        rows = c.execute(sql, params).fetchall()

    return [
        {
            "id":            r[0],
            "tipo_evento":   r[1],
            "descricao":     r[2],
            "risco":         r[3],
            "operador":      r[4],
            "status":        r[5],
            "detalhes":      json.loads(r[6] or "{}"),
            "notificado":    bool(r[7]),
            "criado_em":     r[8],
            "respondido_em": r[9],
        }
        for r in rows
    ]


def expirar_pendentes() -> int:
    """
    Marca como 'expirada' toda aprovação pendente além do timeout.
    Deve ser chamada periodicamente (ex: via startup.py ou endpoint de manutenção).
    Retorna a quantidade de registros expirados.
    """
    limite = (datetime.now(timezone.utc) - timedelta(minutes=_TIMEOUT_MINUTOS)).isoformat()
    with _conn() as c:
        result = c.execute(
            "UPDATE aprovacoes_pendentes SET status = 'expirada' "
            "WHERE status = 'pendente' AND criado_em < ?",
            (limite,),
        )
    count = result.rowcount
    if count:
        logger.info("Aprovações expiradas: %d", count, extra={"expiradas": count})
    return count
