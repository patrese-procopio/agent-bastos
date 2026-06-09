"""
collectors/cnpj_ws.py — Vínculos corporativos via CNPJ.ws
Agent Bastos | Segurança Pública/Corporativa

Fonte: publica.cnpj.ws (espelho gratuito da Receita Federal)
Auth:  sem autenticação — completamente aberta
Docs:  https://publica.cnpj.ws

Por que essa fonte é poderosa para OSINT?
  Cada empresa tem um quadro societário (QSA).
  Se a pessoa pesquisada é sócia de uma empresa,
  podemos pegar os outros sócios — e pesquisá-los também.
  Isso cria o grafo: pessoa → empresa → sócio → outra empresa...

Limitação:
  - Exige CNPJ para consulta direta
  - Para buscar por nome, usamos o Brasil.io como índice
  - Aqui consultamos os detalhes após ter o CNPJ

Fluxo real:
  Brasil.io → CNPJs vinculados ao nome
  CNPJ.ws   → detalhes de cada CNPJ (sócios, atividade, endereço)
"""

from __future__ import annotations

from ..models import OsintRequest, SourceName, SourceResult
from .base import BaseCollector

CNPJ_WS_BASE = "https://publica.cnpj.ws/cnpj"


class CnpjWsCollector(BaseCollector):
    """
    Collector para dados corporativos via CNPJ.ws.

    Recebe CNPJs (vindos do Brasil.io ou informados manualmente)
    e retorna dados completos: sócios, endereço, atividade, situação.

    Nota: este collector é chamado pelo pipeline após o Brasil.io
    retornar a lista de CNPJs vinculados ao nome pesquisado.
    """

    source_name = SourceName.CNPJ_WS

    async def _fetch(self, request: OsintRequest) -> SourceResult:
        """
        Busca detalhes de CNPJs vinculados à pessoa.
        Os CNPJs vêm do request.properties (passados pelo pipeline)
        ou podemos buscar direto pelo nome via Brasil.io primeiro.
        """
        # CNPJs podem vir de duas formas:
        # 1. Passados explicitamente na requisição
        # 2. Descobertos pelo BrasilIoCollector anteriormente
        # Por ora, buscamos pelo nome como sócio
        if not request.nome:
            return SourceResult(
                source=self.source_name,
                success=False,
                error_message="Nome obrigatório para busca de vínculos CNPJ",
            )

        client = await self._get_client()

        # Estratégia: busca CNPJs onde o nome aparece como sócio
        # via endpoint de busca do publica.cnpj.ws
        try:
            response = await client.get(
                "https://www.receitaws.com.br/v1/cnpj",
                params={"nome": request.nome, "pagina": 1},
            )

            if response.status_code == 404:
                return SourceResult(
                    source=self.source_name,
                    success=True,
                    raw_data=[],
                    items_found=0,
                )

            response.raise_for_status()
            data = response.json()
            socios = data if isinstance(data, list) else data.get("socios", [])

            # Para cada CNPJ encontrado, busca detalhes completos
            empresas = []
            for socio in socios[:10]:  # limita a 10 empresas
                cnpj = socio.get("cnpj", "").replace("/", "").replace("-", "").replace(".", "")
                if cnpj:
                    detalhes = await self._get_empresa_detalhes(client, cnpj)
                    if detalhes:
                        detalhes["vinculo_socio"] = socio
                        empresas.append(detalhes)

            return SourceResult(
                source=self.source_name,
                success=True,
                raw_data=empresas,
                items_found=len(empresas),
            )

        except Exception as exc:
            return SourceResult(
                source=self.source_name,
                success=False,
                error_message=str(exc),
            )

    async def _get_empresa_detalhes(self, client, cnpj_limpo: str) -> dict | None:
        """
        Busca detalhes completos de uma empresa pelo CNPJ.
        Retorna: razão social, sócios, endereço, atividade, situação.
        """
        try:
            response = await client.get(f"{CNPJ_WS_BASE}/{cnpj_limpo}")
            if response.status_code != 200:
                return None

            raw = response.json()
            return self._normalize_empresa(raw)
        except Exception:
            return None

    def _normalize_empresa(self, raw: dict) -> dict:
        """Extrai campos relevantes para o OSINT."""
        qsa = raw.get("qsa", [])
        socios = [
            {
                "nome": s.get("nome_socio", ""),
                "qualificacao": s.get("qualificacao_socio", {}).get("descricao", ""),
                "entrada": s.get("data_entrada_sociedade", ""),
                "cpf_cnpj_representante": s.get("cpf_representante_legal", ""),
            }
            for s in qsa
        ]

        return {
            "cnpj": raw.get("cnpj", ""),
            "razao_social": raw.get("razao_social", ""),
            "nome_fantasia": raw.get("nome_fantasia", ""),
            "situacao": raw.get("descricao_situacao_cadastral", ""),
            "data_abertura": raw.get("data_inicio_atividade", ""),
            "atividade_principal": raw.get("cnae_fiscal_descricao", ""),
            "uf": raw.get("uf", ""),
            "municipio": raw.get("municipio", ""),
            "capital_social": raw.get("capital_social", 0),
            "socios": socios,
            "porte": raw.get("descricao_porte", ""),
            "source": "cnpj_ws",
        }
