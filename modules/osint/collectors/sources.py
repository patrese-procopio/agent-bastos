"""
collectors/brasil_io.py — Dados eleitorais e empresariais via Brasil.io
collectors/dou.py       — Menções no Diário Oficial da União
collectors/gnews.py     — Menções em mídia via GNews API
Agent Bastos | Segurança Pública/Corporativa
"""

from __future__ import annotations
import re

import os

from ..models import OsintRequest, SourceName, SourceResult
from .base import BaseCollector


# ─────────────────────────────────────────────
# BRASIL.IO
# ─────────────────────────────────────────────

class BrasilIoCollector(BaseCollector):
    """
    Dados abertos via Brasil.io — agregador de dados públicos brasileiros.

    Datasets relevantes para OSINT:
      - socios-brasil: quadro societário de todas as empresas do Brasil
      - eleicoes-brasil: doações e candidaturas eleitorais
      - caged: vínculos empregatícios históricos

    Auth: token gratuito em https://brasil.io/auth/tokens-api/
    Docs: https://brasil.io/api/docs/
    """

    source_name = SourceName.BRASIL_IO
    BASE = "https://brasil.io/api/dataset"

    def __init__(self) -> None:
        super().__init__()
        self.token = os.getenv("BRASIL_IO_TOKEN", "")

    async def _fetch(self, request: OsintRequest) -> SourceResult:
        if not request.nome:
            return SourceResult(
                source=self.source_name,
                success=False,
                error_message="Nome obrigatório para busca no Brasil.io",
            )

        client = await self._get_client()
        headers = {}
        if self.token:
            headers["Authorization"] = f"Token {self.token}"

        results: list[dict] = []

        # Dataset 1: sócios de empresas
        socios = await self._fetch_socios(client, request.nome, headers)
        results.extend(socios)

        # Dataset 2: doações eleitorais (transparência política)
        doacoes = await self._fetch_doacoes(client, request.nome, headers)
        results.extend(doacoes)

        return SourceResult(
            source=self.source_name,
            success=True,
            raw_data=results,
            items_found=len(results),
        )

    async def _fetch_socios(self, client, nome: str, headers: dict) -> list[dict]:
        try:
            response = await client.get(
                f"{self.BASE}/socios-brasil/socios/data/",
                params={"nome_socio": nome, "format": "json"},
                headers=headers,
            )
            if response.status_code != 200:
                return []
            data = response.json()
            items = data.get("results", [])
            return [
                {**item, "_dataset": "socios_brasil", "_source": "brasil_io"}
                for item in items[:20]
            ]
        except Exception:
            return []

    async def _fetch_doacoes(self, client, nome: str, headers: dict) -> list[dict]:
        try:
            response = await client.get(
                f"{self.BASE}/eleicoes-brasil/candidatos/data/",
                params={"nome_candidato": nome, "format": "json"},
                headers=headers,
            )
            if response.status_code != 200:
                return []
            data = response.json()
            items = data.get("results", [])
            return [
                {**item, "_dataset": "candidatos_eleitorais", "_source": "brasil_io"}
                for item in items[:10]
            ]
        except Exception:
            return []


# ─────────────────────────────────────────────
# DIÁRIO OFICIAL DA UNIÃO
# ─────────────────────────────────────────────

class DouCollector(BaseCollector):
    """
    Mencoes em Diarios Oficiais via API do Querido Diario (OKFN Brasil).
    Cobre DOU federal + diarios municipais de todo o Brasil.
    API: https://api.queridodiario.ok.org.br
    """

    source_name = SourceName.DOU
    API_URL = "https://api.queridodiario.ok.org.br/gazettes"

    async def _fetch(self, request: OsintRequest) -> SourceResult:
        if not request.nome:
            return SourceResult(
                source=self.source_name,
                success=False,
                error_message="Nome obrigatorio para busca no DOU",
            )

        client = await self._get_client()

        try:
            response = await client.get(
                self.API_URL,
                params={
                    "querystring": request.nome,
                    "size": 10,
                    "sort_by": "relevance",
                },
                headers={"Accept": "application/json"},
            )

            if response.status_code != 200:
                return SourceResult(
                    source=self.source_name,
                    success=True,
                    raw_data=[],
                    items_found=0,
                )

            data = response.json()
            gazettes = data.get("gazettes", [])
            mencoes = [
                {
                    "titulo": (g.get("excerpts") or [""])[0][:200].strip(),
                    "data": g.get("date", ""),
                    "orgao": g.get("territory_name", "") + " - " + g.get("state_code", ""),
                    "url": g.get("url", ""),
                    "tipo": "diario_oficial",
                    "source": "dou",
                }
                for g in gazettes
                if g.get("excerpts")
            ]

            return SourceResult(
                source=self.source_name,
                success=True,
                raw_data=mencoes,
                items_found=len(mencoes),
            )

        except Exception as exc:
            return SourceResult(
                source=self.source_name,
                success=False,
                error_message=str(exc),
            )


# ─────────────────────────────────────────────
# GNEWS — MENÇÕES EM MÍDIA
# ─────────────────────────────────────────────

class GNewsCollector(BaseCollector):
    """
    Menções em mídia via GNews API.

    GNews agrega notícias de centenas de veículos brasileiros.
    Free tier: 100 requisições/dia — suficiente para MVP.
    Cadastro: https://gnews.io

    Para OSINT de segurança, notícias revelam:
      - Envolvimento em crimes reportados
      - Processos com repercussão pública
      - Vínculos políticos e empresariais
      - Histórico de atividade pública
    """

    source_name = SourceName.GNEWS
    BASE = "https://gnews.io/api/v4/search"

    def __init__(self) -> None:
        super().__init__()
        self.api_key = os.getenv("GNEWS_API_KEY", "")

    async def _fetch(self, request: OsintRequest) -> SourceResult:
        if not request.nome:
            return SourceResult(
                source=self.source_name,
                success=False,
                error_message="Nome obrigatório para busca de notícias",
            )

        if not self.api_key:
            return SourceResult(
                source=self.source_name,
                success=False,
                error_message="GNEWS_API_KEY não configurada — cadastre em gnews.io",
            )

        client = await self._get_client()

        try:
            response = await client.get(
                self.BASE,
                params={
                    "q": f'"{request.nome}"',  # busca exata pelo nome
                    "lang": "pt",
                    "country": "br",
                    "max": 10,
                    "apikey": self.api_key,
                },
            )
            response.raise_for_status()
            data = response.json()
            articles = data.get("articles", [])

            noticias = [
                {
                    "titulo": a.get("title", ""),
                    "descricao": a.get("description", ""),
                    "url": a.get("url", ""),
                    "data": a.get("publishedAt", ""),
                    "veiculo": a.get("source", {}).get("name", ""),
                    "source": "gnews",
                }
                for a in articles
            ]

            return SourceResult(
                source=self.source_name,
                success=True,
                raw_data=noticias,
                items_found=len(noticias),
            )

        except Exception as exc:
            return SourceResult(
                source=self.source_name,
                success=False,
                error_message=str(exc),
            )


class BuscaProcessosCollector(BaseCollector):
    """
    Collector para processos judiciais via BuscaProcessos.app.br.
    Busca por nome da parte e retorna resumo + quantidade de processos.
    API: https://buscaprocessos.app.br
    """

    source_name = SourceName.DATAJUD  # reutiliza o enum datajud
    API_URL = "https://api.buscaprocessos.app.br/v1/busca"

    def __init__(self) -> None:
        super().__init__()
        import os
        self.api_key = os.getenv("BUSCAPROCESSOS_API_KEY", "")

    async def _fetch(self, request: OsintRequest) -> SourceResult:
        if not request.nome:
            return SourceResult(
                source=self.source_name,
                success=False,
                error_message="Nome obrigatorio para busca de processos",
            )
        if not self.api_key:
            return SourceResult(
                source=self.source_name,
                success=False,
                error_message="BUSCAPROCESSOS_API_KEY nao configurada",
            )

        client = await self._get_client()

        try:
            response = await client.get(
                self.API_URL,
                params={"q": request.nome, "qo": "p"},
                headers={"Authorization": f"Bearer {self.api_key}"},
            )

            if response.status_code != 200:
                return SourceResult(
                    source=self.source_name,
                    success=False,
                    error_message=f"HTTP {response.status_code}",
                )

            data = response.json()
            items = data.get("items", [])

            # Filtra apenas resultados que sejam a pessoa pesquisada
            processos = []
            for item in items[:5]:
                if item.get("tem_processo") and item.get("quantidade_processos", 0) > 0:
                    resumo = item.get("resumo", "")
                    qtd = item.get("quantidade_processos", 0)

                    # Extrai envolvimento do MP do resumo
                    tem_mp = "minist" in resumo.lower() and "p" in resumo.lower()
                    qtd_mp = 0
                    match_mp = re.search(r"(\d+) ou mais processos.*?minist", resumo, re.IGNORECASE)
                    if match_mp:
                        qtd_mp = int(match_mp.group(1))

                    # Classifica risco baseado em dados objetivos
                    if qtd >= 15 or qtd_mp >= 10:
                        risco_sugerido = "critico"
                    elif qtd >= 8 or qtd_mp >= 5:
                        risco_sugerido = "alto"
                    elif qtd >= 3:
                        risco_sugerido = "medio"
                    else:
                        risco_sugerido = "baixo"

                    processos.append({
                        "nome": item.get("nome", ""),
                        "resumo": resumo,
                        "quantidade_processos": qtd,
                        "quantidade_processos_mp": qtd_mp,
                        "tem_ministerio_publico": tem_mp,
                        "risco_sugerido": risco_sugerido,
                        "link": item.get("link", ""),
                        "atualizado": item.get("updated_at", ""),
                        "classe": "processo_criminal" if tem_mp else "processo",
                        "tribunal": "TJAM" if "amazonas" in resumo.lower() else "Varios",
                        "assuntos": ["Ministerio Publico como parte"] if tem_mp else [],
                        "status": "Em curso",
                        "source": "buscaprocessos",
                    })

            return SourceResult(
                source=self.source_name,
                success=True,
                raw_data=processos,
                items_found=len(processos),
            )

        except Exception as exc:
            return SourceResult(
                source=self.source_name,
                success=False,
                error_message=str(exc),
            )
