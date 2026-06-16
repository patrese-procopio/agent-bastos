# -*- coding: utf-8 -*-
"""
routers/feedback_router.py — API de administração do Feedback Loop (Missão 25)
─────────────────────────────────────────────────────────────────────────────
Endpoints:
  GET  /api/feedback/stats        — stats de feedback por par entidade×tipo
  GET  /api/feedback/suprimidos   — apenas os pares atualmente suprimidos
  DELETE /api/feedback/reset      — reseta aprendizado de um par específico

Todos exigem JWT admin.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from dependencies import require_module
import services.feedback_service as _fb

logger = logging.getLogger("bastos.feedback_router")

router = APIRouter(prefix="/feedback", tags=["feedback"])


# ── Modelos ───────────────────────────────────────────────────────────────────

class ResetPayload(BaseModel):
    alvo_nome_norm: str
    alvo_fonte:     str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/stats", summary="Estatísticas de feedback por par entidade×tipo (admin)")
def stats(
    limite: int = 100,
    user: dict = Depends(require_module("admin")),
):
    """
    Retorna todas as estatísticas de feedback, ordenadas por taxa de rejeição
    decrescente.

    Cada item inclui:
      - tipo_evento, entidade, fonte
      - total de decisões, confirmações, rejeições
      - taxa_rejeicao (0.0 a 1.0)
      - suprimido (bool) — se o par está atualmente sendo suprimido pelo motor
      - ultima_decisao (ISO 8601)

    Use para auditar o que o sistema está aprendendo.
    """
    return {"stats": _fb.listar_stats(limite=limite)}


@router.get("/suprimidos", summary="Pares atualmente suprimidos pelo feedback loop (admin)")
def suprimidos(user: dict = Depends(require_module("admin"))):
    """
    Retorna apenas os pares que estão atingindo o threshold de supressão:
      - Mínimo 3 decisões (FEEDBACK_MIN_AMOSTRAS)
      - Taxa de rejeição >= 75% (FEEDBACK_THRESHOLD)

    Se a lista não estiver vazia, significa que o sistema já está filtrando
    automaticamente correlações consideradas irrelevantes pelo operador.
    """
    itens = _fb.listar_suprimidos()
    return {
        "suprimidos": itens,
        "total": len(itens),
        "mensagem": (
            f"{len(itens)} par(es) atualmente suprimido(s) pelo feedback loop."
            if itens
            else "Nenhum par suprimido no momento."
        ),
    }


@router.delete("/reset", summary="Resetar aprendizado de um par específico (admin)")
def reset(
    payload: ResetPayload,
    user: dict = Depends(require_module("admin")),
):
    """
    Remove todos os registros de feedback do par (entidade × fonte) informado.

    Após o reset, o sistema voltará a abrir HITLs normalmente para esse par
    — como se nunca tivesse visto decisões anteriores.

    Use quando:
      - Contexto operacional mudou (ex: entidade antes irrelevante passou a ser alvo)
      - Operador cometeu erro ao rejeitar várias vezes por engano
      - Teste / desenvolvimento

    Auditável: o reset é registrado nos logs com quem executou e quando.
    """
    operador = user.get("username") or user.get("sub") or "admin"
    removidos = _fb.resetar_feedback(
        alvo_nome_norm = payload.alvo_nome_norm,
        alvo_fonte     = payload.alvo_fonte,
        operador       = operador,
    )

    if removidos == 0:
        return {
            "ok": True,
            "removidos": 0,
            "mensagem": "Nenhum registro encontrado para esse par. Nada a resetar.",
        }

    return {
        "ok":       True,
        "removidos": removidos,
        "mensagem": (
            f"{removidos} registro(s) de feedback removido(s) para "
            f"'{payload.alvo_nome_norm}' ({payload.alvo_fonte})."
        ),
    }
