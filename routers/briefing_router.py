# -*- coding: utf-8 -*-
"""
routers/briefing_router.py — Boletim Diário de Inteligência (Missão 24)
─────────────────────────────────────────────────────────────────────────────
Rotas registradas:
  POST  /api/briefing/gerar   → (admin) dispara geração imediata do BDI
  GET   /api/briefing/hoje    → (admin) faz download do PDF do dia atual
  GET   /api/briefing/status  → (admin) retorna metadados do último BDI gerado
"""

import os
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import FileResponse

from dependencies import require_module
from services.logging_service import get_logger

_log = logger = get_logger("briefing.router")

router = APIRouter(prefix="/briefing", tags=["briefing"])

try:
    from services.briefing_service import gerar_e_enviar as _gerar, _caminho_pdf_hoje
    _SERVICE_OK = True
except ImportError as _e:
    _SERVICE_OK = False
    _log.warning("briefing_service indisponível: %s", _e)


# ── POST /briefing/gerar ─────────────────────────────────────────────────────

@router.post("/gerar", status_code=202)
async def gerar(
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_module("admin")),
):
    """
    Dispara a geração e envio imediato do BDI em background.

    Retorna 202 imediatamente. O PDF é gerado, salvo e (se houver eventos)
    enviado via WhatsApp sem bloquear o event-loop.

    Idempotente por dia: sobrescreve briefing_YYYYMMDD.pdf se já existir.
    """
    if not _SERVICE_OK:
        return {"ok": False, "detalhe": "briefing_service não disponível."}

    operador = user.get("sub", "sistema")
    _log.info("BDI manual solicitado", extra={"username": operador})

    background_tasks.add_task(_gerar, operador=operador)

    return {
        "ok":     True,
        "status": "geração do BDI iniciada em background",
        "operador": operador,
    }


# ── GET /briefing/hoje ───────────────────────────────────────────────────────

@router.get("/hoje")
def baixar_hoje(user: dict = Depends(require_module("admin"))):
    """
    Retorna o PDF do BDI gerado hoje (se existir).

    O arquivo fica em data/relatorios/briefing_YYYYMMDD.pdf.
    Se não foi gerado ainda retorna 404 com instrução de gerar.
    """
    if not _SERVICE_OK:
        from fastapi import HTTPException
        raise HTTPException(503, "briefing_service não disponível.")

    path = _caminho_pdf_hoje()
    if not os.path.exists(path):
        from fastapi import HTTPException
        hoje = datetime.now(timezone.utc).strftime("%d/%m/%Y")
        raise HTTPException(
            404,
            f"BDI de {hoje} ainda não gerado. "
            "Chame POST /api/briefing/gerar para gerar agora.",
        )

    nome_arquivo = os.path.basename(path)
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=nome_arquivo,
        headers={"Content-Disposition": f'attachment; filename="{nome_arquivo}"'},
    )


# ── GET /briefing/status ─────────────────────────────────────────────────────

@router.get("/status")
def status(user: dict = Depends(require_module("admin"))):
    """
    Retorna metadados do BDI de hoje: se existe, tamanho e data de modificação.
    Útil para o frontend mostrar se o briefing do dia já foi gerado.
    """
    if not _SERVICE_OK:
        return {"disponivel": False, "detalhe": "briefing_service não disponível."}

    path = _caminho_pdf_hoje()
    existe = os.path.exists(path)

    return {
        "disponivel":    existe,
        "pdf_path":      os.path.basename(path) if existe else None,
        "tamanho_bytes": os.path.getsize(path) if existe else None,
        "modificado_em": (
            datetime.fromtimestamp(
                os.path.getmtime(path), tz=timezone.utc
            ).isoformat()
            if existe else None
        ),
    }
