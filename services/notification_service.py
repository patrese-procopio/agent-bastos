"""
notification_service.py — Dispatcher de notificações Human-in-the-Loop
─────────────────────────────────────────────────────────────────────────────
Responsabilidade única: enviar o payload de uma aprovação pendente para o
n8n, que por sua vez aciona o WhatsApp via Evolution API.

Por que separar esse serviço do router?
  - O router não deve conhecer detalhes de integração externa (n8n/WA).
  - Essa separação permite trocar o canal (Telegram, SMS, e-mail) sem
    tocar na lógica de negócio de aprovação.
  - Facilita testes unitários: basta mockar esta função.

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

# Timeout para chamada ao n8n (não pode bloquear a resposta do endpoint)
_TIMEOUT_S = 8.0


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

    Parâmetros:
      aprovacao_id : UUID gerado no banco — serve como chave de retorno
      tipo_evento  : ex: "transcricao_risco_alto", "osint_mandado_ativo"
      descricao    : texto curto para exibir no WhatsApp (ex: nome do alvo)
      risco        : "ALTO" | "CRÍTICO"
      operador     : username do analista que gerou o evento
      detalhes     : dict livre com contexto adicional (opcional)

    Retorna:
      True  → n8n aceitou o webhook (HTTP 2xx)
      False → falha de conexão ou n8n indisponível (não levanta exceção)
    """
    if not N8N_WEBHOOK_HITL:
        logger.warning(
            "N8N_WEBHOOK_HITL não configurado — aprovação %s criada mas "
            "notificação WhatsApp não disparada.", aprovacao_id,
            extra={"aprovacao_id": aprovacao_id},
        )
        return False

    payload = {
        "aprovacao_id": aprovacao_id,
        "tipo_evento":  tipo_evento,
        "descricao":    descricao,
        "risco":        risco,
        "operador":     operador,
        "timestamp":    datetime.now(timezone.utc).isoformat(),
        "detalhes":     detalhes or {},
        # URL de retorno que o n8n usará para confirmar/rejeitar
        "callback_url": os.getenv("BASTOS_CALLBACK_URL", "http://127.0.0.1:8000")
                        + f"/api/human-loop/responder/{aprovacao_id}",
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_S) as client:
            resp = await client.post(N8N_WEBHOOK_HITL, json=payload)

        if resp.status_code < 300:
            logger.info(
                "Notificação HITL enviada ao n8n.",
                extra={"aprovacao_id": aprovacao_id, "status": resp.status_code},
            )
            return True
        else:
            logger.warning(
                "n8n retornou status inesperado para aprovação %s: %s",
                aprovacao_id, resp.status_code,
                extra={"aprovacao_id": aprovacao_id, "status": resp.status_code},
            )
            return False

    except httpx.TimeoutException:
        logger.error(
            "Timeout ao notificar n8n para aprovação %s — "
            "n8n pode estar fora do ar.", aprovacao_id,
            extra={"aprovacao_id": aprovacao_id},
        )
        return False

    except Exception as exc:
        logger.error(
            "Falha inesperada ao notificar n8n para aprovação %s: %s",
            aprovacao_id, exc,
            extra={"aprovacao_id": aprovacao_id},
        )
        return False
