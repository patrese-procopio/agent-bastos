"""
collectors/datajud.py — Processos judiciais via API pública do CNJ
Agent Bastos | Segurança Pública/Corporativa

Fonte: DataJud — Base Nacional de Dados do Poder Judiciário
Docs:  https://datajud-wiki.cnj.jus.br/api-publica/
Auth:  API Key gratuita (cadastro em https://www.cnj.jus.br)

O DataJud indexa processos de TODOS os tribunais brasileiros.
Para OSINT de segurança, nos interessa principalmente:
  - Processos criminais (classe 283, 7, etc.)
  - Execuções penais
  - Processos de família (vínculos)
  - Patrimônio (inventários, partilhas)

Estrutura da API:
  POST /api_publica_{sigla_tribunal}/_search
  Body: ElasticSearch Query DSL
  → Sim, o DataJud usa Elasticsearch por baixo. Poderoso.
"""

from __future__ import annotations

import os

from ..models import OsintRequest, SourceName, SourceResult
from .base import BaseCollector

# Tribunais mais relevantes para busca nacional
TRIBUNAIS_PRIORITARIOS = [
    "tjam",  # Amazonas — prioritário para o contexto da agência
    "tjsp", "tjrj", "tjmg", "tjrs", "tjba",
    "tjpr", "tjsc", "tjce", "tjpe", "tjgo",
    "stj", "stf", "trf1", "trf2", "trf3",
]

# Classes processuais criminais no CNJ
CLASSES_CRIMINAIS = [
    "283",   # Ação Penal - Procedimento Ordinário
    "7",     # Ação Penal - Procedimento Sumário
    "7670",  # Execução Penal
    "2",     # Inquérito Policial
    "441",   # Habeas Corpus
]

DATAJUD_BASE = "https://api-publica.datajud.cnj.jus.br"


class DataJudCollector(BaseCollector):
    """
    Collector para processos judiciais via API pública CNJ/DataJud.

    Busca por nome da parte — CPF não é indexado publicamente
    para proteger dados pessoais (irônico para um sistema OSINT,
    mas é a regra do DataJud).

    Estratégia de busca:
      1. Busca pelo nome exato como parte
      2. Filtra classes criminais para risk assessment
      3. Extrai polo (ativo/passivo), classe, movimentações
    """

    source_name = SourceName.DATAJUD

    def __init__(self) -> None:
        super().__init__(timeout=20.0)  # DataJud pode ser lento
        self.api_key = os.getenv("DATAJUD_API_KEY", "")

    async def _fetch(self, request: OsintRequest) -> SourceResult:
        if not request.nome:
            return SourceResult(
                source=self.source_name,
                success=False,
                error_message="DataJud requer nome da parte para busca",
            )

        client = await self._get_client()
        all_processes: list[dict] = []
        errors: list[str] = []

        for tribunal in TRIBUNAIS_PRIORITARIOS[:5]:
            try:
                processos = await self._search_tribunal(client, tribunal, request.nome)
                all_processes.extend(processos)
            except Exception as e:
                errors.append(f"{tribunal}: {str(e)}")

        return SourceResult(
            source=self.source_name,
            success=True,
            raw_data=all_processes,
            items_found=len(all_processes),
            error_message="; ".join(errors) if errors else None,
        )

    async def _search_tribunal(
        self,
        client,
        tribunal: str,
        nome: str,
    ) -> list[dict]:
        url = f"{DATAJUD_BASE}/api_publica_{tribunal}/_search"
        headers = {"Authorization": f"APIKey {self.api_key}"} if self.api_key else {}

        query = {
            "size": 10,
            "_source": [
                "numeroProcesso", "classe", "tribunal",
                "dataAjuizamento", "assuntos", "grau",
                "orgaoJulgador", "movimentos",
            ],
            "query": {
                "nested": {
                    "path": "partes",
                    "query": {
                        "match": {
                            "partes.nome": {
                                "query": nome,
                                "operator": "and",
                            }
                        }
                    },
                }
            },
        }

        response = await client.post(url, json=query, headers=headers)

        if response.status_code == 404:
            return []

        response.raise_for_status()
        data = response.json()
        hits = data.get("hits", {}).get("hits", [])
        return [self._normalize_processo(hit["_source"], tribunal) for hit in hits]

    def _normalize_processo(self, raw: dict, tribunal: str) -> dict:
        classe_codigo = str(raw.get("classe", {}).get("codigo", ""))
        is_criminal = classe_codigo in CLASSES_CRIMINAIS

        return {
            "numero":            raw.get("numeroProcesso", ""),
            "tribunal":          raw.get("tribunal", tribunal.upper()),
            "classe":            raw.get("classe", {}).get("nome", ""),
            "classe_codigo":     classe_codigo,
            "is_criminal":       is_criminal,
            "data_ajuizamento":  raw.get("dataAjuizamento", ""),
            "assuntos":          [a.get("nome", "") for a in raw.get("assuntos", [])],
            "orgao_julgador":    raw.get("orgaoJulgador", {}).get("nome", ""),
            "grau":              raw.get("grau", ""),
            "source":            "datajud",
        }