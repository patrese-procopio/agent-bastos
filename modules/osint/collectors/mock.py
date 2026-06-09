"""
collectors/mock.py — Dados simulados para desenvolvimento
Agent Bastos | Segurança Pública/Corporativa

Por que ter um MockCollector?
  - Desenvolve todo o pipeline sem depender de APIs externas
  - Testes unitários determinísticos (sem I/O real)
  - Demo para portfólio sem expor dados reais
  - CI/CD não depende de credenciais

Ativa com: OSINT_USE_MOCK=true no .env
"""

from __future__ import annotations

from ..models import OsintRequest, SourceName, SourceResult
from .base import BaseCollector


class MockCollector(BaseCollector):
    """
    Retorna dados simulados realistas para desenvolvimento.
    Os dados são estruturados exatamente como as fontes reais retornariam.
    """

    source_name = SourceName.MOCK

    MOCK_DATA = {
        "processos": [
            {
                "numero": "0001234-56.2022.8.26.0100",
                "tribunal": "TJSP",
                "classe": "Ação Penal - Procedimento Ordinário",
                "classe_codigo": "283",
                "is_criminal": True,
                "data_ajuizamento": "2022-03-15",
                "ultima_movimentacao": "2024-01-10",
                "assuntos": ["Tráfico de Drogas", "Associação Criminosa"],
                "polo_passivo": ["NOME PESQUISADO DA SILVA"],
                "orgao_julgador": "1ª Vara Criminal da Capital",
                "grau": "G1",
                "source": "mock_datajud",
            }
        ],
        "empresas": [
            {
                "cnpj": "12.345.678/0001-90",
                "razao_social": "EMPRESA EXEMPLO LTDA",
                "situacao": "ATIVA",
                "data_abertura": "2018-06-01",
                "atividade_principal": "Consultoria em TI",
                "uf": "SP",
                "municipio": "São Paulo",
                "capital_social": 100000.0,
                "socios": [
                    {"nome": "NOME PESQUISADO DA SILVA", "qualificacao": "Sócio-Administrador"},
                    {"nome": "FULANO DE TAL SANTOS", "qualificacao": "Sócio"},
                ],
                "source": "mock_cnpj_ws",
            }
        ],
        "noticias": [
            {
                "titulo": "Operação policial prende suspeitos em São Paulo",
                "descricao": "Nome Pesquisado da Silva foi indiciado...",
                "url": "https://example.com/noticia",
                "data": "2023-11-20T10:00:00Z",
                "veiculo": "G1",
                "source": "mock_gnews",
            }
        ],
        "dou": [
            {
                "titulo": "EXONERAÇÃO — Nome Pesquisado da Silva",
                "data": "2021-04-01",
                "secao": "Seção 2",
                "orgao": "Ministério da Justiça",
                "url": "",
                "resumo": "Exonerado do cargo de Assistente Técnico...",
                "source": "mock_dou",
            }
        ],
    }

    async def _fetch(self, request: OsintRequest) -> SourceResult:
        """Retorna todos os dados mock combinados."""
        all_data = (
            self.MOCK_DATA["processos"]
            + self.MOCK_DATA["empresas"]
            + self.MOCK_DATA["noticias"]
            + self.MOCK_DATA["dou"]
        )
        return SourceResult(
            source=self.source_name,
            success=True,
            raw_data=all_data,
            items_found=len(all_data),
        )
