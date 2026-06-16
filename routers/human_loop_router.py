"""
human_loop_router.py — Endpoints do sistema Human-in-the-Loop
─────────────────────────────────────────────────────────────────────────────
Responsabilidades:
  POST /human-loop/criar         → analista ou módulo interno cria aprovação
  POST /human-loop/responder/{id} → n8n chama aqui quando chefe responde no WA
  GET  /human-loop/listar        → painel admin lista aprovações
  GET  /human-loop/{id}          → detalhe de uma aprovação
  POST /human-loop/expirar       → força expiração de pendentes (manutenção)

Segurança:
  - /criar e /listar exigem JWT válido com módulo "admin"
  - /responder aceita uma API key simples (HITL_CALLBACK_KEY) porque quem
    chama é o n8n — não tem JWT de usuário humano.
    A key fica no .env e é injetada no workflow n8n como header.
  - /expirar só admin
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel

from dependencies import require_module
from services.human_loop_service import (
    buscar_aprovacao,
    criar_aprovacao,
    expirar_pendentes,
    listar_aprovacoes,
    marcar_notificado,
    responder_aprovacao,
)
from services.notification_service import notificar_aprovacao_pendente
from services.audit_service import registrar as audit
import services.feedback_service as _fb

logger = logging.getLogger("bastos.human_loop")


def _registrar_feedback(aprovacao_id: str, registro: dict, decisao: str, operador: str) -> None:
    """
    Registra feedback de correlação após decisão HITL.
    Se confirmado, também materializa os vínculos no grafo (Missão 27).
    Wrapper seguro: nunca lança exceção para não quebrar o endpoint.
    """
    try:
        import json
        tipo_evento = registro.get("tipo_evento", "")
        detalhes = registro.get("detalhes") or {}
        if isinstance(detalhes, str):
            try:
                detalhes = json.loads(detalhes)
            except Exception:
                detalhes = {}
        hits = detalhes.get("hits", [])
        if hits:
            _fb.registrar_feedback(
                hitl_id    = aprovacao_id,
                tipo_evento = tipo_evento,
                hits        = hits,
                decisao     = decisao,
                operador    = operador,
            )
    except Exception as exc:
        logger.warning("[human_loop] Falha ao registrar feedback: %s", exc)

    # Missão 27 — Grafo Automático: confirmar = materializar vínculos no grafo
    if decisao == "confirmada":
        try:
            import json
            from services.grafo_auto_service import registrar_correlacao_no_grafo
            tipo_evento = registro.get("tipo_evento", "")
            detalhes = registro.get("detalhes") or {}
            if isinstance(detalhes, str):
                try:
                    detalhes = json.loads(detalhes)
                except Exception:
                    detalhes = {}
            hits = detalhes.get("hits", [])
            if hits:
                registrar_correlacao_no_grafo(
                    hitl_id     = aprovacao_id,
                    tipo_evento = tipo_evento,
                    hits        = hits,
                    detalhes    = detalhes,
                    operador    = operador,
                )
        except Exception as exc:
            logger.warning("[human_loop] Falha ao atualizar grafo: %s", exc)

    # Missão 28 — Score de Risco Dinâmico: confirmar HITL eleva score das entidades
    if decisao == "confirmada":
        try:
            import json as _json
            from services.risco_score_service import registrar_hitl_confirmado
            _det28 = registro.get("detalhes") or {}
            if isinstance(_det28, str):
                try:
                    _det28 = _json.loads(_det28)
                except Exception:
                    _det28 = {}
            _hits28  = _det28.get("hits", [])
            _risco28 = _det28.get("risco", registro.get("risco", "ALTO"))
            if _hits28:
                _n = registrar_hitl_confirmado(
                    hits   = _hits28,
                    risco  = _risco28,
                    motivo = f"HITL {aprovacao_id[:8]} confirmado por {operador}",
                )
                logger.debug("[human_loop] M28: score atualizado para %d entidade(s).", _n)
        except Exception as exc:
            logger.warning("[human_loop] Falha ao atualizar score de risco: %s", exc)

router = APIRouter(prefix="/human-loop", tags=["human-loop"])

# Chave simples para autenticar o callback do n8n
_CALLBACK_KEY = os.getenv("HITL_CALLBACK_KEY", "")


# ── Modelos ───────────────────────────────────────────────────────────────────

class CriarAprovacaoPayload(BaseModel):
    tipo_evento: str
    descricao:   str
    risco:       str              # ALTO | CRÍTICO
    operador:    str
    detalhes:    dict | None = None


class ResponderPayload(BaseModel):
    decisao:     str              # "confirmada" | "rejeitada"
    resposta_por: str = "whatsapp"
    observacao:  str = ""


# ── Dependência — valida a callback key do n8n ────────────────────────────────

def _validar_callback_key(x_hitl_key: str = Header(default="")) -> None:
    """
    Verifica se o header X-Hitl-Key bate com o HITL_CALLBACK_KEY do .env.

    Por que header em vez de query param?
      Headers não aparecem em logs de acesso de proxies/CDN.
      Query params ficam no URL e podem ser logados.

    Por que não JWT?
      O chamador é o n8n — um processo de automação sem usuário humano.
      JWT exigiria um refresh_token rodando no n8n, o que complica sem
      ganho real de segurança para este fluxo interno.
    """
    if not _CALLBACK_KEY:
        # Se não configurado, aceita qualquer coisa (dev mode)
        logger.warning("HITL_CALLBACK_KEY não configurado — callback sem autenticação.")
        return
    if x_hitl_key != _CALLBACK_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chave de callback inválida.",
        )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/criar", summary="Criar aprovação pendente e notificar via WhatsApp")
async def criar(
    payload: CriarAprovacaoPayload,
    user: dict = Depends(require_module("admin")),
):
    """
    Cria um registro de aprovação pendente e dispara a notificação
    para o n8n → WhatsApp.

    Fluxo esperado:
      1. Módulo interno (transcricao_router, osint, grafoscopia) chama aqui.
      2. Este endpoint registra no banco e aciona o n8n.
      3. O n8n manda mensagem com botões para o Chefe de Inteligência.
      4. O Chefe clica → n8n chama /responder/{id}.
    """
    aprov_id = criar_aprovacao(
        tipo_evento = payload.tipo_evento,
        descricao   = payload.descricao,
        risco       = payload.risco,
        operador    = payload.operador,
        detalhes    = payload.detalhes,
    )

    # Notifica o n8n de forma assíncrona (não bloqueia a resposta)
    sucesso_notif = await notificar_aprovacao_pendente(
        aprovacao_id = aprov_id,
        tipo_evento  = payload.tipo_evento,
        descricao    = payload.descricao,
        risco        = payload.risco,
        operador     = payload.operador,
        detalhes     = payload.detalhes,
    )

    # Registra se o WA foi alcançado
    marcar_notificado(aprov_id, sucesso_notif)

    return {
        "aprovacao_id":   aprov_id,
        "status":         "pendente",
        "notificado_wa":  sucesso_notif,
        "mensagem": (
            "Aprovação criada e notificação enviada ao WhatsApp."
            if sucesso_notif
            else "Aprovação criada, mas falha ao notificar o WhatsApp. "
                 "Verifique N8N_WEBHOOK_HITL no .env."
        ),
    }


@router.post(
    "/responder/{aprovacao_id}",
    summary="Callback do n8n com a resposta do Chefe de Inteligência",
)
def responder(
    aprovacao_id: str,
    payload: ResponderPayload,
    _: None = Depends(_validar_callback_key),
):
    """
    Endpoint chamado pelo n8n quando o Chefe clica em Confirmar ou Rejeitar
    no WhatsApp.

    Este endpoint é o fechamento do loop:
      n8n (recebe clique no botão WA) → POST aqui → banco atualizado

    Não exige JWT de usuário — usa a HITL_CALLBACK_KEY no header.

    Idempotente: chamar duas vezes com o mesmo ID é seguro.
    """
    try:
        registro = responder_aprovacao(
            aprovacao_id = aprovacao_id,
            decisao      = payload.decisao,
            resposta_por = payload.resposta_por,
            observacao   = payload.observacao,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    logger.info(
        "Callback HITL processado.",
        extra={
            "aprovacao_id": aprovacao_id,
            "decisao": payload.decisao,
        },
    )
    audit(f"hitl_{payload.decisao}", "hitl", usuario=payload.resposta_por,
          alvo=aprovacao_id, detalhe=f"via whatsapp · {payload.observacao or ''}")
    _registrar_feedback(aprovacao_id, registro, payload.decisao, payload.resposta_por)
    return {"ok": True, "aprovacao": registro}


@router.get("/listar", summary="Listar aprovações (admin)")
def listar(
    status_filtro: Optional[str] = None,
    limite: int = 50,
    user: dict = Depends(require_module("admin")),
):
    """
    Lista aprovações com filtro opcional por status.

    status_filtro: pendente | confirmada | rejeitada | expirada | None (todos)
    """
    return {"aprovacoes": listar_aprovacoes(status=status_filtro, limite=limite)}


@router.post("/decidir/{aprovacao_id}", summary="Confirmar ou rejeitar aprovação via Dashboard (admin JWT)")
def decidir(
    aprovacao_id: str,
    payload: ResponderPayload,
    user: dict = Depends(require_module("admin")),
):
    """
    Permite que um analista admin decida uma aprovação diretamente pelo
    Dashboard do Agent Bastos — sem precisar responder via WhatsApp.

    Usa autenticação JWT (Bearer token) em vez da HITL_CALLBACK_KEY,
    pois o chamador é um humano autenticado no app, não o n8n.

    Idempotente: chamar duas vezes com o mesmo ID é seguro.
    """
    try:
        registro = responder_aprovacao(
            aprovacao_id = aprovacao_id,
            decisao      = payload.decisao,
            resposta_por = f"dashboard:{user.get('username', 'admin')}",
            observacao   = payload.observacao or "Respondido via Dashboard",
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    logger.info(
        "Decisão HITL via Dashboard.",
        extra={"aprovacao_id": aprovacao_id, "decisao": payload.decisao, "usuario": user.get("username")},
    )
    audit(f"hitl_{payload.decisao}", "hitl", usuario=user.get("sub","?"),
          alvo=aprovacao_id, detalhe=f"via dashboard · {payload.observacao or ''}")
    _registrar_feedback(aprovacao_id, registro, payload.decisao, user.get("username", "admin"))
    return {"ok": True, "aprovacao": registro}


@router.get("/{aprovacao_id}", summary="Detalhe de uma aproção (admin)")
def detalhe(
    aprovacao_id: str,
    user: dict = Depends(require_module("admin")),
):
    registro = buscar_aprovacao(aprovacao_id)
    if not registro:
        raise HTTPException(status_code=404, detail="Aproção não encontrada.")
    return registro


@router.post("/expirar", summary="Forçar expiração de pendentes (admin)")
def expirar(user: dict = Depends(require_module("admin"))):
    """
    Marca como 'expirada' toda aproção pendente além do timeout configurado
    em HITL_TIMEOUT_MINUTOS (padrão: 60 minutos).

    Use para manutenção ou em caso de mensagem WA não entregue.
    """
    expiradas = expirar_pendentes()
    return {"expiradas": expiradas, "mensagem": f"{expiradas} aproção(ões) expirada(s)."}
