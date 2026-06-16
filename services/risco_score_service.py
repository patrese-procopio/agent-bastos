# -*- coding: utf-8 -*-
"""
services/risco_score_service.py — Score de Risco Dinâmico (Missão 28)
─────────────────────────────────────────────────────────────────────────────
Cada entidade monitorada possui um score 0–100 que:
  ↑ SOBE com eventos: correlação confirmada, alerta criado, menção em extrato
  ↓ CAI com o tempo: decaimento exponencial de 3% ao dia (lazy, sem cron)

COMO FUNCIONA — DECAIMENTO LAZY:
  score_atual = score_base × FATOR_DECAIMENTO ^ dias_sem_evento

  Com FATOR=0.97 (padrão):
    7  dias → ×0.81  (-19%)
    30 dias → ×0.40  (-60%)
    90 dias → ×0.06  (-94%)

  O banco armazena APENAS o score_base no instante do último evento.
  O score_atual é recalculado on-the-fly no momento da leitura.
  Vantagem: zero cron jobs, zero drift entre processos.

TABELAS (auth.db):
  risco_scores  — uma linha por entidade, score_base + timestamp
  risco_eventos — histórico auditável de cada incremento (LGPD: rastro)

INTEGRAÇÃO:
  • Chamado por human_loop_router._registrar_feedback() após HITL confirmado
  • Pode ser chamado por extrato_router e alertas_router (opcional/futuro)

CONFIGURAÇÃO (.env):
  RISCO_FATOR_DECAIMENTO=0.97   # taxa de decaimento diário (0.97 = -3%/dia)
  RISCO_SCORE_MAX=100            # teto do score
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import unicodedata
import uuid
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger("bastos.risco_score")

# ── Configuração via .env ─────────────────────────────────────────────────────
_FATOR_DECAIMENTO: float = float(os.getenv("RISCO_FATOR_DECAIMENTO", "0.97"))
_SCORE_MAX: float        = float(os.getenv("RISCO_SCORE_MAX", "100.0"))

# Deltas por nível de risco (HITL confirmado)
_DELTA_RISCO: dict[str, float] = {
    "BAIXO":   5.0,
    "MEDIO":  15.0,
    "MÉDIO":  15.0,
    "ALTO":   25.0,
    "CRITICO": 40.0,
    "CRÍTICO": 40.0,
}

# Deltas por tipo de evento avulso (para hooks futuros)
DELTA_EVENTO: dict[str, float] = {
    "mencao_extrato": 3.0,
    "alerta_criado":  10.0,
}


# ── DB helpers ────────────────────────────────────────────────────────────────

def _db_path() -> str:
    return os.getenv(
        "AUTH_DB",
        os.path.join(os.path.dirname(__file__), "..", "data", "auth.db"),
    )


def _conn():
    import sqlite3
    con = sqlite3.connect(_db_path())
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    return con


def _agora() -> str:
    return datetime.now(timezone.utc).isoformat()


def _init_db() -> None:
    with _conn() as con:
        con.executescript("""
            CREATE TABLE IF NOT EXISTS risco_scores (
                entidade_id    TEXT    PRIMARY KEY,
                entidade_nome  TEXT    NOT NULL,
                score_base     REAL    NOT NULL DEFAULT 0.0,
                ultimo_evento  TEXT,
                criado_em      TEXT    NOT NULL,
                atualizado_em  TEXT    NOT NULL
            );

            CREATE TABLE IF NOT EXISTS risco_eventos (
                id           TEXT PRIMARY KEY,
                entidade_id  TEXT NOT NULL,
                tipo_evento  TEXT NOT NULL,
                delta        REAL NOT NULL,
                motivo       TEXT,
                criado_em    TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_risco_eventos_entidade
                ON risco_eventos (entidade_id, criado_em DESC);
        """)


_init_db()


# ── Helpers internos ──────────────────────────────────────────────────────────

def _norm(txt: str) -> str:
    """Minúsculo, sem acento, espaços colapsados."""
    if not txt:
        return ""
    t = unicodedata.normalize("NFKD", str(txt))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t.strip().lower())


def _id_entidade(nome: str) -> str:
    """
    ID estável para entidades.
    MESMO esquema do grafo.py (_id_pessoa) e grafo_auto_service.py —
    garante que os scores se fundem com nós já existentes no grafo.
    Chave: md5(nome_normalizado + "|")
    """
    chave = f"{_norm(nome)}|"
    return "p_" + hashlib.md5(chave.encode()).hexdigest()[:12]


def _aplicar_decaimento(score_base: float, ultimo_evento: Optional[str]) -> float:
    """
    Calcula score_atual aplicando decaimento exponencial lazy.
    score_atual = score_base × FATOR_DECAIMENTO ^ dias_sem_evento
    """
    if not ultimo_evento or score_base <= 0:
        return max(0.0, score_base)
    try:
        dt_ultimo = datetime.fromisoformat(ultimo_evento)
        agora = datetime.now(timezone.utc)
        if dt_ultimo.tzinfo is None:
            dt_ultimo = dt_ultimo.replace(tzinfo=timezone.utc)
        dias = (agora - dt_ultimo).total_seconds() / 86400.0
        if dias <= 0:
            return min(_SCORE_MAX, score_base)
        score = score_base * (_FATOR_DECAIMENTO ** dias)
        return max(0.0, min(_SCORE_MAX, score))
    except Exception:
        return min(_SCORE_MAX, score_base)


def _classificar_nivel(score: float) -> str:
    """Converte score numérico em nível semântico."""
    if score >= 70:
        return "CRÍTICO"
    if score >= 40:
        return "ALTO"
    if score >= 15:
        return "MÉDIO"
    if score > 0:
        return "BAIXO"
    return "INATIVO"


# ── Interface pública ─────────────────────────────────────────────────────────

def registrar_evento(
    entidade_nome: str,
    tipo_evento:   str,
    delta:         float,
    motivo:        str = "",
    entidade_id:   Optional[str] = None,
) -> dict:
    """
    Registra um evento que impacta o score de risco de uma entidade.

    Fluxo:
      1. Busca score_base atual no banco.
      2. Aplica decaimento (score_decaido = score_base × FATOR^dias).
      3. Soma o delta: novo_score = score_decaido + delta (clamped a 0–100).
      4. Persiste novo_score como score_base + atualiza ultimo_evento.
      5. Grava linha em risco_eventos (auditoria LGPD).

    O decaimento é aplicado ANTES do delta — entidade inativa há 30 dias
    terá seu score reduzido 60% antes de somar o novo evento.

    Parâmetros:
      entidade_nome : nome legível da entidade (ex: "Rubinho")
      tipo_evento   : chave do evento (ex: "hitl_confirmado_alto")
      delta         : pontos a somar (pode ser negativo para penalizar)
      motivo        : texto livre para auditoria
      entidade_id   : opcional; se None, calculado via _id_entidade(nome)

    Retorna: {ok, entidade_id, score_anterior, score_novo}
    """
    if not entidade_nome or not entidade_nome.strip():
        return {"ok": False, "motivo": "entidade_nome vazio"}

    eid   = entidade_id or _id_entidade(entidade_nome)
    agora = _agora()

    try:
        with _conn() as con:
            row = con.execute(
                "SELECT score_base, ultimo_evento FROM risco_scores WHERE entidade_id = ?",
                (eid,),
            ).fetchone()

            if row:
                score_decaido = _aplicar_decaimento(row["score_base"], row["ultimo_evento"])
                novo_score    = min(_SCORE_MAX, max(0.0, score_decaido + delta))
            else:
                # Primeira aparição desta entidade
                score_decaido = 0.0
                novo_score    = min(_SCORE_MAX, max(0.0, delta))
                con.execute(
                    "INSERT INTO risco_scores "
                    "(entidade_id, entidade_nome, score_base, criado_em, atualizado_em) "
                    "VALUES (?, ?, 0.0, ?, ?)",
                    (eid, entidade_nome, agora, agora),
                )

            con.execute(
                "UPDATE risco_scores "
                "SET score_base=?, ultimo_evento=?, atualizado_em=? "
                "WHERE entidade_id=?",
                (novo_score, agora, agora, eid),
            )
            con.execute(
                "INSERT INTO risco_eventos "
                "(id, entidade_id, tipo_evento, delta, motivo, criado_em) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), eid, tipo_evento, delta, motivo, agora),
            )

        logger.info(
            "[risco_score] %-30s  %.1f → %.1f  (Δ+%.1f, %s)",
            entidade_nome, score_decaido, novo_score, delta, tipo_evento,
        )
        return {
            "ok":            True,
            "entidade_id":   eid,
            "score_anterior": round(score_decaido, 1),
            "score_novo":    round(novo_score, 1),
        }

    except Exception as exc:
        logger.error("[risco_score] Erro ao registrar evento para '%s': %s", entidade_nome, exc)
        return {"ok": False, "motivo": str(exc)}


def registrar_hitl_confirmado(
    hits:   list[dict],
    risco:  str,
    motivo: str = "",
) -> int:
    """
    Atalho: dispara registrar_evento para cada entidade num HITL confirmado.
    O delta é determinado pelo nível de risco do HITL.

    Parâmetros:
      hits   : lista de dicts com chave "nome" (vinda de detalhes["hits"])
      risco  : "BAIXO" | "MEDIO" | "ALTO" | "CRITICO"
      motivo : texto para auditoria

    Retorna: número de entidades atualizadas com sucesso.
    """
    delta  = _DELTA_RISCO.get(risco.upper().strip(), 10.0)
    count  = 0
    for hit in hits:
        nome = (hit.get("nome") or "").strip()
        if not nome:
            continue
        result = registrar_evento(
            entidade_nome = nome,
            tipo_evento   = f"hitl_confirmado_{risco.lower()}",
            delta         = delta,
            motivo        = motivo or f"HITL confirmado — risco {risco}",
        )
        if result.get("ok"):
            count += 1
    return count


def obter_score(entidade_id: str) -> Optional[dict]:
    """
    Retorna o score atual (com decaimento aplicado) de uma entidade.
    Retorna None se a entidade não existir.
    """
    try:
        with _conn() as con:
            row = con.execute(
                "SELECT * FROM risco_scores WHERE entidade_id = ?",
                (entidade_id,),
            ).fetchone()
        if not row:
            return None
        score_atual = _aplicar_decaimento(row["score_base"], row["ultimo_evento"])
        return {
            "entidade_id":   row["entidade_id"],
            "entidade_nome": row["entidade_nome"],
            "score_atual":   round(score_atual, 1),
            "score_base":    round(row["score_base"], 1),
            "ultimo_evento": row["ultimo_evento"],
            "nivel":         _classificar_nivel(score_atual),
            "criado_em":     row["criado_em"],
        }
    except Exception as exc:
        logger.error("[risco_score] Erro ao obter score %s: %s", entidade_id, exc)
        return None


def listar_scores(min_score: float = 0.0, limite: int = 100) -> list[dict]:
    """
    Lista entidades com score_atual >= min_score, ordenadas por score desc.
    Aplica decaimento lazy em todas antes de retornar.

    Nota: busca 3× o limite no banco (muitas podem cair abaixo de min_score
    após o decaimento), depois filtra e ordena.
    """
    try:
        with _conn() as con:
            rows = con.execute(
                "SELECT * FROM risco_scores ORDER BY score_base DESC LIMIT ?",
                (limite * 3,),
            ).fetchall()

        result = []
        for row in rows:
            score_atual = _aplicar_decaimento(row["score_base"], row["ultimo_evento"])
            if score_atual >= min_score:
                result.append({
                    "entidade_id":   row["entidade_id"],
                    "entidade_nome": row["entidade_nome"],
                    "score_atual":   round(score_atual, 1),
                    "ultimo_evento": row["ultimo_evento"],
                    "nivel":         _classificar_nivel(score_atual),
                })

        result.sort(key=lambda x: x["score_atual"], reverse=True)
        return result[:limite]

    except Exception as exc:
        logger.error("[risco_score] Erro ao listar scores: %s", exc)
        return []


def historico_entidade(entidade_id: str, limite: int = 20) -> list[dict]:
    """Retorna os últimos N eventos de uma entidade (ordem cronológica inversa)."""
    try:
        with _conn() as con:
            rows = con.execute(
                "SELECT id, tipo_evento, delta, motivo, criado_em "
                "FROM risco_eventos "
                "WHERE entidade_id = ? "
                "ORDER BY criado_em DESC LIMIT ?",
                (entidade_id, limite),
            ).fetchall()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("[risco_score] Erro ao buscar histórico de %s: %s", entidade_id, exc)
        return []
