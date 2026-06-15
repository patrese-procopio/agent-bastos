"""
audit_router.py — Endpoints de auditoria
─────────────────────────────────────────────────────────────────────────────
GET  /audit/logs           → lista paginada com filtros
GET  /audit/stats          → contagens por categoria (para cards do dashboard)
GET  /audit/exportar/csv   → download CSV
GET  /audit/exportar/pdf   → download PDF
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from dependencies import require_module
from services.audit_service import listar, contar, exportar_csv, exportar_pdf

router = APIRouter(prefix="/audit", tags=["auditoria"])

_GATE = require_module("auditoria")


@router.get("/logs")
def get_logs(
    categoria:   Optional[str] = Query(default=None),
    usuario:     Optional[str] = Query(default=None),
    data_inicio: Optional[str] = Query(default=None),
    data_fim:    Optional[str] = Query(default=None),
    limite:      int            = Query(default=100, ge=1, le=500),
    offset:      int            = Query(default=0, ge=0),
    user: dict = Depends(_GATE),
):
    registros = listar(
        categoria=categoria,
        usuario=usuario,
        data_inicio=data_inicio,
        data_fim=data_fim,
        limite=limite,
        offset=offset,
    )
    total = contar(categoria=categoria, usuario=usuario,
                   data_inicio=data_inicio, data_fim=data_fim)
    return {"total": total, "offset": offset, "registros": registros}


@router.get("/stats")
def get_stats(user: dict = Depends(_GATE)):
    """Contagem por categoria para os cards do dashboard."""
    cats = ["autenticacao", "hitl", "usuario", "consulta", "liderancas"]
    return {c: contar(categoria=c) for c in cats}


@router.get("/exportar/csv")
def exportar_csv_endpoint(
    categoria:   Optional[str] = Query(default=None),
    usuario:     Optional[str] = Query(default=None),
    data_inicio: Optional[str] = Query(default=None),
    data_fim:    Optional[str] = Query(default=None),
    user: dict = Depends(_GATE),
):
    from services.audit_service import registrar
    registrar(
        evento="exportacao_csv",
        categoria="auditoria",
        usuario=user.get("sub", "?"),
        detalhe=f"filtros: categoria={categoria} usuario={usuario} de={data_inicio} ate={data_fim}",
    )
    data = exportar_csv(categoria=categoria, usuario=usuario,
                        data_inicio=data_inicio, data_fim=data_fim)
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=auditoria.csv"},
    )


@router.get("/exportar/pdf")
def exportar_pdf_endpoint(
    categoria:   Optional[str] = Query(default=None),
    usuario:     Optional[str] = Query(default=None),
    data_inicio: Optional[str] = Query(default=None),
    data_fim:    Optional[str] = Query(default=None),
    user: dict = Depends(_GATE),
):
    from services.audit_service import registrar
    registrar(
        evento="exportacao_pdf",
        categoria="auditoria",
        usuario=user.get("sub", "?"),
        detalhe=f"filtros: categoria={categoria} usuario={usuario} de={data_inicio} ate={data_fim}",
    )
    data = exportar_pdf(categoria=categoria, usuario=usuario,
                        data_inicio=data_inicio, data_fim=data_fim)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=auditoria.pdf"},
    )
