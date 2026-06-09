"""
routers/processo_router.py — Endpoint de consulta de processo por número
Agent Bastos | Segurança Pública/Corporativa

Endpoints:
  GET  /api/osint/processo/{numero}
  POST /api/osint/processo/lote        (múltiplos números de uma vez)
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from modules.osint.collectors.datajud_processo import (
    DataJudProcessoService,
    ProcessoDetalhado,
    ProcessoNaoEncontrado,
)
from dependencies import get_current_user  # ajusta se o import for diferente no seu projeto

router = APIRouter(prefix="/api/osint", tags=["osint-processo"])


# ─────────────────────────────────────────────
# ENDPOINT ÚNICO
# ─────────────────────────────────────────────

@router.get(
    "/processo/{numero}",
    summary="Detalhes de processo por número CNJ",
    description=(
        "Busca a ficha completa de um processo judicial no DataJud (CNJ). "
        "O tribunal é inferido automaticamente pelo número CNJ. "
        "Informe o parâmetro `tribunal` para forçar a busca num tribunal específico."
    ),
)
async def consultar_processo(
    numero: str,
    tribunal: str | None = None,
    current_user: dict = Depends(get_current_user),
) -> ProcessoDetalhado | ProcessoNaoEncontrado:
    """
    Consulta um processo pelo número CNJ.

    Params:
      numero   — número do processo (formato CNJ ou livre)
      tribunal — sigla opcional: tjam, tjsp, stj, trf1, etc.

    Retorna:
      ProcessoDetalhado se encontrado
      ProcessoNaoEncontrado se não encontrado em nenhum tribunal
    """
    service = DataJudProcessoService()
    resultado = await service.buscar(numero=numero, tribunal=tribunal)
    return resultado


# ─────────────────────────────────────────────
# ENDPOINT EM LOTE
# ─────────────────────────────────────────────

class LoteRequest(BaseModel):
    numeros: list[str]
    tribunal: str | None = None


@router.post(
    "/processo/lote",
    summary="Consulta múltiplos processos de uma vez",
)
async def consultar_lote(
    payload: LoteRequest,
    current_user: dict = Depends(get_current_user),
) -> list[ProcessoDetalhado | ProcessoNaoEncontrado]:
    """
    Consulta até 10 processos em paralelo.
    Útil quando o operador tem uma lista de números extraída de outro sistema.
    """
    if len(payload.numeros) > 10:
        raise HTTPException(
            status_code=400,
            detail="Máximo de 10 processos por requisição",
        )

    import asyncio
    service = DataJudProcessoService()

    tasks = [
        service.buscar(numero=n, tribunal=payload.tribunal)
        for n in payload.numeros
    ]
    resultados = await asyncio.gather(*tasks)
    return list(resultados)
