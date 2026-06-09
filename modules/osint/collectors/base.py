"""
collectors/base.py — Interface comum para todos os collectors
Agent Bastos | Segurança Pública/Corporativa

Por que Abstract Base Class?
  - Garante que todo collector implemente fetch()
  - Permite trocar/adicionar fontes sem mudar o pipeline
  - Facilita testes: MockCollector implementa a mesma interface
  - Padrão de mercado: Strategy + Adapter pattern combinados

Todo collector recebe OsintRequest e retorna SourceResult.
O pipeline não sabe — nem precisa saber — de onde vêm os dados.
"""

from __future__ import annotations

import asyncio
import logging
import time
from abc import ABC, abstractmethod

import httpx

from ..models import OsintRequest, SourceName, SourceResult

logger = logging.getLogger(__name__)

# Timeout padrão para todas as requisições externas
DEFAULT_TIMEOUT = 15.0


class BaseCollector(ABC):
    """
    Classe base para todos os collectors OSINT.

    Subclasses devem implementar apenas `_fetch()`.
    O método público `fetch()` cuida de:
      - Medir latência
      - Capturar exceções sem derrubar o pipeline
      - Logar erros sem expor dados sensíveis
    """

    source_name: SourceName  # cada subclasse define o seu

    def __init__(self, timeout: float = DEFAULT_TIMEOUT) -> None:
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def fetch(self, request: OsintRequest) -> SourceResult:
        """
        Método público — chame este, não `_fetch()` diretamente.
        Garante que erros nunca derrubam o pipeline inteiro.
        """
        start = time.monotonic()
        try:
            result = await self._fetch(request)
            result.latency_ms = (time.monotonic() - start) * 1000
            return result
        except httpx.TimeoutException:
            logger.warning("[%s] Timeout após %.0fms", self.source_name.value, self.timeout * 1000)
            return SourceResult(
                source=self.source_name,
                success=False,
                error_message=f"Timeout após {self.timeout}s",
                latency_ms=(time.monotonic() - start) * 1000,
            )
        except Exception as exc:
            logger.error("[%s] Erro inesperado: %s", self.source_name.value, str(exc))
            return SourceResult(
                source=self.source_name,
                success=False,
                error_message=str(exc),
                latency_ms=(time.monotonic() - start) * 1000,
            )

    @abstractmethod
    async def _fetch(self, request: OsintRequest) -> SourceResult:
        """Implementação específica de cada fonte. Subclasses implementam isto."""
        ...

    async def _get_client(self) -> httpx.AsyncClient:
        """Client HTTP compartilhado com headers padrão."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=self.timeout,
                headers={
                    "User-Agent": "AgentBastos/1.0",
                    "Accept": "application/json",
                },
                follow_redirects=True,
            )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()


async def run_collectors_parallel(
    collectors: list[BaseCollector],
    request: OsintRequest,
) -> list[SourceResult]:
    """
    Executa todos os collectors em paralelo com asyncio.gather.

    Por que paralelo?
      Cada collector faz I/O (chamada HTTP). Com asyncio, enquanto
      um aguarda resposta, os outros já estão executando.
      5 fontes em série: ~15s. Em paralelo: ~3s (tempo do mais lento).

    return_exceptions=True garante que um collector com erro
    não cancela os outros.
    """
    tasks = [collector.fetch(request) for collector in collectors]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Converte exceções não tratadas em SourceResult de erro
    clean_results = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            clean_results.append(SourceResult(
                source=collectors[i].source_name,
                success=False,
                error_message=f"Exceção não tratada: {str(result)}",
            ))
        else:
            clean_results.append(result)

    return clean_results
