# -*- coding: utf-8 -*-
"""
services/auto_response_service.py — Resposta Automática a Correlações de Baixo Risco (Missão 26)
─────────────────────────────────────────────────────────────────────────────
Problema que resolve:
  O operador estava recebendo WhatsApp para TODA correlação detectada,
  independente do nível de risco. Correlações de BAIXO/MÉDIO risco
  são ruído operacional — o chefe de inteligência se cansa e começa
  a ignorar os alertas (alert fatigue).

Solução:
  O motor de correlação faz um branch antes de disparar o WhatsApp:
    - Risco BAIXO ou MÉDIO  → sistema confirma automaticamente (sem WhatsApp)
    - Risco ALTO ou CRÍTICO → HITL normal (WhatsApp → operador decide)

  O auto-confirm ainda cria o registro de aprovação (trilha de auditoria
  completa) e dispara o feedback loop — o sistema continua aprendendo.

Configuração (.env):
  AUTO_RESPONSE_RISCOS=BAIXO,MEDIO   (padrão — separado por vírgula)

  Para desativar a resposta automática (tudo vai pro HITL):
    AUTO_RESPONSE_RISCOS=

  Para responder automaticamente até ALTO (não recomendado em produção):
    AUTO_RESPONSE_RISCOS=BAIXO,MEDIO,ALTO

LGPD / Auditoria:
  Todo auto-confirm é registrado com operador="auto_sistema" e
  observacao="Respondido automaticamente — risco {RISCO}".
  O admin pode listar essas aprovações via GET /api/human-loop/listar.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger("bastos.auto_response")

# Riscos que serão respondidos automaticamente (lidos do .env, uppercase)
_ENV_RISCOS = os.getenv("AUTO_RESPONSE_RISCOS", "BAIXO,MEDIO")
_RISCOS_AUTO: frozenset[str] = frozenset(
    r.strip().upper() for r in _ENV_RISCOS.split(",") if r.strip()
)


# ── Interface pública ─────────────────────────────────────────────────────────

def deve_responder_auto(risco: str) -> bool:
    """
    Retorna True se o risco é elegível para resposta automática.

    Exemplos:
      deve_responder_auto("BAIXO")   → True  (padrão)
      deve_responder_auto("MEDIO")   → True  (padrão)
      deve_responder_auto("ALTO")    → False (padrão)
      deve_responder_auto("CRÍTICO") → False (sempre)
    """
    # CRÍTICO nunca é automático, independente da config
    if risco.upper() in ("CRÍTICO", "CRITICO", "CRITICAL"):
        return False
    return risco.upper() in _RISCOS_AUTO


def responder_automaticamente(
    hitl_id:    str,
    risco:      str,
    hits:       list[dict],
    tipo_evento: str,
    fonte_tipo: str,
    fonte_id:   str,
) -> bool:
    """
    Confirma automaticamente uma aprovação de baixo risco.

    Fluxo:
      1. Chama responder_aprovacao() com decisao="confirmada", operador="auto_sistema"
      2. Chama registrar_feedback() → o aprendizado continua mesmo no auto-confirm
      3. Loga a ação para auditoria

    Retorna True se o auto-confirm foi executado com sucesso.
    Nunca propaga exceção.
    """
    try:
        from services.human_loop_service import responder_aprovacao
        from services.feedback_service  import registrar_feedback

        observacao = f"Respondido automaticamente — risco {risco.upper()}"

        responder_aprovacao(
            aprovacao_id = hitl_id,
            decisao      = "confirmada",
            resposta_por = "auto_sistema",
            observacao   = observacao,
        )

        # Feedback loop: auto-confirms contam como "confirmada" para aprendizado
        if hits:
            registrar_feedback(
                hitl_id     = hitl_id,
                tipo_evento = tipo_evento,
                hits        = hits,
                decisao     = "confirmada",
                operador    = "auto_sistema",
            )

        logger.info(
            "[auto_response] HITL %s auto-confirmado | risco=%s | fonte=%s/%s | hits=%d",
            hitl_id[:8], risco, fonte_tipo, fonte_id, len(hits),
        )
        return True

    except Exception as exc:
        logger.warning("[auto_response] Falha ao auto-confirmar HITL %s: %s", hitl_id[:8], exc)
        return False


def riscos_configurados() -> list[str]:
    """Retorna a lista de riscos configurados para auto-resposta (útil para /status)."""
    return sorted(_RISCOS_AUTO)
