"""
notification_service.py — Dispatcher de notificações Human-in-the-Loop
─────────────────────────────────────────────────────────────────────────────
Responsabilidade única: enviar o payload de uma aprovação pendente para o
n8n, que por sua vez aciona o WhatsApp via Evolution API.

Suporte a múltiplos destinatários:
  WA_NUMEROS_HITL aceita uma lista separada por vírgula.
  O n8n recebe a lista completa e dispara sendText para cada número
  em paralelo — todos recebem o alerta simultaneamente.
  Qualquer um deles pode responder CONFIRMAR/REJEITAR.

Fail-safe: se a notificação falhar (n8n fora do ar, WA bloqueado), o
  registro de aprovação fica em estado "pendente" no banco e pode ser
  resolvido manualmente pelo painel admin. O sistema NÃO trava.
"""

from __future__ import annotations

import os
import logging
import httpx
from datetime import datetime, timezone

logger = logging.getLogger("bastos.notification")

# URL do webhook n8n — configurada no .env
N8N_WEBHOOK_HITL = os.getenv("N8N_WEBHOOK_HITL", "")

# Números autorizados a receber alertas HITL
# Suporta lista separada por vírgula: 5592999990000,5592888880000
_NUMEROS_RAW = os.getenv("WA_NUMEROS_HITL", os.getenv("WA_NUMERO_CHEFE", ""))


def get_numeros_hitl() -> list[str]:
    """
    Retorna a lista de números autorizados, lendo do ambiente em runtime.
    Suporta tanto WA_NUMEROS_HITL (novo, lista) quanto WA_NUMERO_CHEFE
    (legado, único número) — compatibilidade retroativa garantida.
    """
    raw = os.getenv("WA_NUMEROS_HITL", os.getenv("WA_NUMERO_CHEFE", ""))
    numeros = [n.strip() for n in raw.split(",") if n.strip()]
    return numeros


# Timeout para chamada ao n8n (não pode bloquear a resposta do endpoint)
_TIMEOUT_S = 8.0


def notificar_aprovacao_pendente_sync(
    aprovacao_id: str,
    tipo_evento: str,
    descricao: str,
    risco: str,
    operador: str,
    detalhes: dict | None = None,
) -> bool:
    """
    Versão SÍNCRONA do notificador — usa httpx.Client em vez de AsyncClient.

    Por que existe?
    O correlacao_engine._abrir_hitl é chamado como BackgroundTask dentro do
    event loop do FastAPI. Criar asyncio.new_event_loop() nesse contexto
    causa RuntimeError ("Cannot send a request, as the client has been closed")
    porque o AsyncClient está amarrado ao loop principal.

    Usando httpx.Client (síncrono), não há conflito de loops.
    O comportamento externo é idêntico: dispara o webhook para o n8n.
    """
    if not N8N_WEBHOOK_HITL:
        logger.warning(
            "N8N_WEBHOOK_HITL não configurado — aprovação %s criada mas "
            "notificação WhatsApp não disparada.", aprovacao_id,
        )
        return False

    numeros = get_numeros_hitl()
    if not numeros:
        logger.warning(
            "WA_NUMEROS_HITL não configurado — aprovação %s sem destinatários.",
            aprovacao_id,
        )
        return False

    payload = {
        "aprovacao_id":    aprovacao_id,
        "tipo_evento":     tipo_evento,
        "descricao":       descricao,
        "risco":           risco,
        "operador":        operador,
        "timestamp":       datetime.now(timezone.utc).isoformat(),
        "detalhes":        detalhes or {},
        "numeros_destino": numeros,
        "callback_url":    os.getenv("BASTOS_CALLBACK_URL", "http://127.0.0.1:8000")
                           + f"/api/human-loop/responder/{aprovacao_id}",
    }

    logger.info(
        "Disparando HITL (sync) para %d número(s): %s",
        len(numeros), numeros,
    )

    try:
        with httpx.Client(timeout=_TIMEOUT_S) as client:
            resp = client.post(N8N_WEBHOOK_HITL, json=payload)

        if resp.status_code < 300:
            logger.info(
                "Notificação HITL (sync) enviada ao n8n para %d destinatário(s).",
                len(numeros),
            )
            return True

        logger.warning(
            "n8n retornou status inesperado para aprovação %s: %s",
            aprovacao_id, resp.status_code,
        )
        return False

    except httpx.TimeoutException:
        logger.error(
            "Timeout ao notificar n8n (sync) para aprovação %s.", aprovacao_id,
        )
        return False

    except Exception as exc:
        logger.error(
            "Falha inesperada ao notificar n8n (sync) para aprovação %s: %s",
            aprovacao_id, exc,
        )
        return False


async def notificar_aprovacao_pendente(
    aprovacao_id: str,
    tipo_evento: str,
    descricao: str,
    risco: str,
    operador: str,
    detalhes: dict | None = None,
) -> bool:
    """
    Dispara notificação para o n8n com os dados da aprovação pendente.
    O n8n envia o alerta para TODOS os números em WA_NUMEROS_HITL em paralelo.

    Parâmetros:
      aprovacao_id : UUID gerado no banco — serve como chave de retorno
      tipo_evento  : ex: "transcricao_risco_alto", "osint_mandado_ativo"
      descricao    : texto curto para exibir no WhatsApp (ex: nome do alvo)
      risco        : "ALTO" | "CRÍTICO"
      operador     : username do analista que gerou o evento
      detalhes     : dict livre com contexto adicional (opcional)

    Retorna:
      True  → n8