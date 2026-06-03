"""
collectors/factory.py — Instancia os collectors conforme configuração
Agent Bastos | Segurança Pública/Corporativa

O factory lê o .env e decide quais collectors ativar.
Isso significa que você troca de modo (mock ↔ real)
sem mudar uma linha de código — só muda o .env.
"""

from __future__ import annotations

import os

from ..models import OsintRequest, SourceName
from .base import BaseCollector
from .mock import MockCollector
from .datajud import DataJudCollector
from .cnpj_ws import CnpjWsCollector
from .sources import BrasilIoCollector, DouCollector, BuscaProcessosCollector
from .news import NewsCollector


def build_collectors(request: OsintRequest) -> list[BaseCollector]:
    """
    Retorna a lista de collectors ativos para esta requisição.

    Lógica:
      1. Se OSINT_USE_MOCK=true → retorna só o MockCollector (dev mode)
      2. Caso contrário → instancia cada collector das fontes_ativas
    """
    if os.getenv("OSINT_USE_MOCK", "false").lower() == "true":
        return [MockCollector()]

    collector_map: dict[SourceName, type[BaseCollector]] = {
        SourceName.DATAJUD:   BuscaProcessosCollector,
        SourceName.CNPJ_WS:   CnpjWsCollector,
        SourceName.BRASIL_IO: BrasilIoCollector,
        SourceName.DOU:       DouCollector,
        SourceName.GNEWS:     NewsCollector,
    }

    return [
        collector_map[fonte]()
        for fonte in request.fontes_ativas
        if fonte in collector_map
    ]
