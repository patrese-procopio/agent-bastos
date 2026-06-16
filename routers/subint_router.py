# -*- coding: utf-8 -*-
"""
routers/subint_router.py — SUBINT Automatizado (Missão 29)
─────────────────────────────────────────────────────────────────────────────
Endpoints:
  POST /api/subint/gerar              → gera SUBINT para uma entidade
  GET  /api/subint/listar             → lista SUBINTs gerados
  GET  /api/subint/{id}               → metadados + texto de um SUBINT
  GET  /api/subint/{id}/pdf           → download PDF
  GET  /api/subint/{id}/docx          → download DOCX
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from dependencies import require_module
from services import subint_service as _ss

router = APIRouter(prefix="/subint", tags=["subint"])

_ORIGENS_VALIDAS = {"NI", "NCI", "NBE", "AIPEN"}


class GerarSubintPayload(BaseModel):
    entidade_nome: str
    origem:        str = "AIPEN"
    hitl_id:       Optional[str] = None


@router.post("/gerar", summary="Gerar SUBINT para uma entidade (admin)")
def gerar(
    payload: GerarSubintPayload,
    user: dict = Depends(require_module("admin")),
):
    """
    Dispara a geração de um Subsídio de Inteligência.

    O processo é síncrono (pode levar ~15s para o LLM responder).
    O documento gerado fica salvo — use os endpoints /pdf e /docx para download.

    Parâmetros:
      entidade_nome : nome da entidade (pessoa, organização, evento)
      origem        : NI | NCI | NBE | AIPEN (padrão: AIPEN)
      hitl_id       : opcional — HITL de correlação que originou a solicitação
    """
    origem = payload.origem.upper().strip()
    if origem not in _ORIGENS_VALIDAS:
        raise HTTPException(
            400,
            detail=f"Origem inválida. Use: {', '.join(sorted(_ORIGENS_VALIDAS))}",
        )

    operador = user.get("username", "admin")
    result   = _ss.gerar_subint(
        entidade_nome = payload.entidade_nome.strip(),
        origem        = origem,
        operador      = operador,
        hitl_id       = payload.hitl_id,
    )

    if not result.get("ok"):
        raise HTTPException(500, detail=result.get("motivo", "Erro interno ao gerar SUBINT."))

    return result


@router.get("/listar", summary="Listar SUBINTs gerados (admin)")
def listar(
    limite: int = 50,
    user: dict = Depends(require_module("admin")),
):
    """Lista os SUBINTs gerados, do mais recente para o mais antigo."""
    return {"subints": _ss.listar_subints(limite=limite), "total": limite}


@router.get("/{subint_id}", summary="Metadados e texto de um SUBINT (admin)")
def detalhe(
    subint_id: str,
    user: dict = Depends(require_module("admin")),
):
    doc = _ss.obter_texto(subint_id)
    if not doc:
        raise HTTPException(404, detail="SUBINT não encontrado.")
    return doc


@router.get("/{subint_id}/pdf", summary="Download PDF do SUBINT (admin)")
def download_pdf(
    subint_id: str,
    user: dict = Depends(require_module("admin")),
):
    """Retorna o arquivo PDF do SUBINT para download direto."""
    data = _ss.obter_bytes(subint_id, "pdf")
    if not data:
        raise HTTPException(404, detail="SUBINT ou PDF não encontrado.")

    doc  = _ss.obter_texto(subint_id)
    nome = f"SUBINT_{doc['numero'].replace('/', '-')}.pdf" if doc else f"SUBINT_{subint_id[:8]}.pdf"

    return Response(
        content      = data,
        media_type   = "application/pdf",
        headers      = {"Content-Disposition": f'attachment; filename="{nome}"'},
    )


@router.get("/{subint_id}/docx", summary="Download DOCX do SUBINT (admin)")
def download_docx(
    subint_id: str,
    user: dict = Depends(require_module("admin")),
):
    """Retorna o arquivo .docx do SUBINT para download e edição."""
    data = _ss.obter_bytes(subint_id, "docx")
    if not data:
        raise HTTPException(404, detail="SUBINT ou DOCX não encontrado.")

    doc  = _ss.obter_texto(subint_id)
    nome = f"SUBINT_{doc['numero'].replace('/', '-')}.docx" if doc else f"SUBINT_{subint_id[:8]}.docx"

    return Response(
        content    = data,
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers    = {"Content-Disposition": f'attachment; filename="{nome}"'},
    )
