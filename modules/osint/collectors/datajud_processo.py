"""
collectors/datajud_processo.py — Detalhes de processo por número via DataJud
Agent Bastos | Segurança Pública/Corporativa

Endpoint separado do pipeline OSINT principal.
Usado quando o operador já tem o número do processo e quer
aprofundar a análise — movimentações, partes, andamento atual.

Fluxo:
  Operador vê relatório → identifica número de processo →
  chama este endpoint → recebe ficha completa do processo

Por que endpoint separado e não campo no OsintRequest?
  O OsintRequest é o input da pesquisa inicial sobre uma PESSOA.
  A busca por processo é um aprofundamento pontual — contexto diferente,
  payload diferente, resposta diferente. Separar evita que o modelo
  de dados principal fique poluído com casos de uso secundários.
  Princípio: Single Responsibility.
"""

from __future__ import annotations

import os
import logging
from datetime import datetime

import httpx
from pydantic import BaseModel, Field
from typing import Any

logger = logging.getLogger(__name__)

DATAJUD_BASE = "https://api-publica.datajud.cnj.jus.br"

# Mapa tribunal → sigla do índice DataJud
# O número do processo contém o código do tribunal (posições 16-19 do CNJ)
# Mas também aceitamos busca manual informando o tribunal
TRIBUNAL_MAP = {
    "tjam": "api_publica_tjam",
    "tjsp": "api_publica_tjsp",
    "tjrj": "api_publica_tjrj",
    "tjmg": "api_publica_tjmg",
    "tjrs": "api_publica_tjrs",
    "tjba": "api_publica_tjba",
    "tjpr": "api_publica_tjpr",
    "tjsc": "api_publica_tjsc",
    "tjce": "api_publica_tjce",
    "tjpe": "api_publica_tjpe",
    "tjgo": "api_publica_tjgo",
    "stj":  "api_publica_stj",
    "stf":  "api_publica_stf",
    "trf1": "api_publica_trf1",
    "trf2": "api_publica_trf2",
    "trf3": "api_publica_trf3",
    "trf4": "api_publica_trf4",
    "trf5": "api_publica_trf5",
    "tst":  "api_publica_tst",
}

# Código IBGE de tribunais por UF (posições 17-18 do número CNJ)
# Formato CNJ: NNNNNNN-DD.AAAA.J.TT.OOOO
# J=8 (Justiça Estadual), TT=código do tribunal
CODIGO_TRIBUNAL_CNJ = {
    "01": "tjac", "02": "tjal", "03": "tjap", "04": "tjam",
    "05": "tjba", "06": "tjce", "07": "tjdf", "08": "tjes",
    "09": "tjgo", "10": "tjma", "11": "tjmt", "12": "tjms",
    "13": "tjmg", "14": "tjpa", "15": "tjpb", "16": "tjpr",
    "17": "tjpe", "18": "tjpi", "19": "tjrj", "20": "tjrn",
    "21": "tjrs", "22": "tjro", "23": "tjrr", "24": "tjsc",
    "25": "tjse", "26": "tjsp", "27": "tjto",
}


# ─────────────────────────────────────────────
# MODELS DE RESPOSTA
# ─────────────────────────────────────────────

class MovimentoProcesso(BaseModel):
    codigo: int | None = None
    nome: str = ""
    data: str = ""
    orgao_julgador: str = ""


class ProcessoDetalhado(BaseModel):
    """
    Ficha completa de um processo judicial.
    Retornada pelo endpoint /api/osint/processo/{numero}
    """
    numero: str
    tribunal: str
    classe: str = ""
    classe_codigo: int | None = None
    grau: str = ""
    data_ajuizamento: str = ""
    ultima_atualizacao: str = ""
    orgao_julgador: str = ""
    assuntos: list[str] = Field(default_factory=list)
    movimentos: list[MovimentoProcesso] = Field(default_factory=list)
    nivel_sigilo: int = 0
    is_criminal: bool = False
    fonte: str = "datajud"
    consultado_em: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class ProcessoNaoEncontrado(BaseModel):
    numero: str
    mensagem: str = "Processo não encontrado no DataJud"
    tribunais_consultados: list[str] = Field(default_factory=list)


# ─────────────────────────────────────────────
# CLASSES CRIMINAIS CNJ
# ─────────────────────────────────────────────

CLASSES_CRIMINAIS = {
    "283", "7", "7670", "2", "441",   # originais
    "1641", "1643", "1644",            # execuções penais
    "12070", "12071",                  # crimes contra a vida
}


# ─────────────────────────────────────────────
# SERVIÇO DE BUSCA
# ─────────────────────────────────────────────

class DataJudProcessoService:
    """
    Busca detalhes de um processo judicial pelo número CNJ.

    Estratégia:
      1. Tenta inferir o tribunal pelo número CNJ (formato padrão)
      2. Se não conseguir inferir, tenta nos tribunais mais comuns
      3. Retorna o primeiro resultado encontrado
    """

    def __init__(self) -> None:
        self.api_key = os.getenv("DATAJUD_API_KEY", "")
        self.headers = {
            "Authorization": f"APIKey {self.api_key}",
            "Content-Type": "application/json",
        }

    def _inferir_tribunal(self, numero: str) -> str | None:
        """
        Infere o tribunal pelo número CNJ.

        Formato CNJ: NNNNNNN-DD.AAAA.J.TT.OOOO
          J  = ramo da justiça (8 = estadual, 4 = federal, 5 = trabalho)
          TT = código do tribunal

        Remove caracteres não numéricos e extrai posições.
        """
        digitos = "".join(c for c in numero if c.isdigit())
        if len(digitos) < 20:
            return None

        # Posições 13-14 = ramo (J) e tribunal (TT)
        ramo = digitos[13]
        codigo_tt = digitos[14:16]

        if ramo == "8":  # Justiça Estadual
            return CODIGO_TRIBUNAL_CNJ.get(codigo_tt)
        elif ramo == "4":  # Justiça Federal
            trf_map = {"01": "trf1", "02": "trf2", "03": "trf3", "04": "trf4", "05": "trf5"}
            return trf_map.get(codigo_tt)
        elif ramo == "5":  # Trabalho
            return "tst"
        elif ramo == "3":  # Militar
            return None
        elif ramo == "2":  # STJ/STF
            return "stj" if codigo_tt == "01" else "stf"

        return None

    async def buscar(self, numero: str, tribunal: str | None = None) -> ProcessoDetalhado | ProcessoNaoEncontrado:
        """
        Busca o processo pelo número.

        Se tribunal informado → busca direto nele.
        Se não → infere pelo número CNJ → tenta top 3 tribunais.
        """
        # Normaliza o número — remove pontos, traços, espaços
        numero_limpo = numero.strip()

        # Define lista de tribunais pra tentar
        if tribunal:
            tribunais = [tribunal.lower()]
        else:
            inferido = self._inferir_tribunal(numero_limpo)
            if inferido:
                tribunais = [inferido]
            else:
                # Fallback — tenta os mais comuns
                tribunais = ["tjam", "tjsp", "tjrj", "stj", "trf1"]

        tribunais_consultados = []

        async with httpx.AsyncClient(timeout=20.0) as client:
            for sigla in tribunais:
                indice = TRIBUNAL_MAP.get(sigla)
                if not indice:
                    continue

                tribunais_consultados.append(sigla)
                resultado = await self._buscar_no_tribunal(client, indice, numero_limpo)

                if resultado:
                    return resultado

        return ProcessoNaoEncontrado(
            numero=numero_limpo,
            tribunais_consultados=tribunais_consultados,
        )

    async def _buscar_no_tribunal(
        self,
        client: httpx.AsyncClient,
        indice: str,
        numero: str,
    ) -> ProcessoDetalhado | None:
        """
        Busca o processo num tribunal específico pelo número exato.
        Usa term query — busca exata, não full-text.
        """
        try:
            response = await client.post(
                f"{DATAJUD_BASE}/{indice}/_search",
                headers=self.headers,
                json={
                    "size": 1,
                    "query": {
                        "term": {
                            "numeroProcesso.keyword": numero
                        }
                    },
                    "_source": [
                        "numeroProcesso", "classe", "tribunal",
                        "dataAjuizamento", "dataHoraUltimaAtualizacao",
                        "assuntos", "grau", "orgaoJulgador",
                        "movimentos", "nivelSigilo",
                    ],
                },
            )

            if response.status_code in (400, 404):
                return None

            response.raise_for_status()
            data = response.json()
            hits = data.get("hits", {}).get("hits", [])

            if not hits:
                return None

            return self._normalizar(hits[0]["_source"])

        except Exception as exc:
            logger.error("Erro ao buscar processo %s: %s", numero, str(exc))
            return None

    def _normalizar(self, raw: dict) -> ProcessoDetalhado:
        classe_codigo = raw.get("classe", {}).get("codigo")
        is_criminal = str(classe_codigo) in CLASSES_CRIMINAIS

        # Normaliza movimentos — pega os 20 mais recentes
        movimentos_raw = raw.get("movimentos", [])
        movimentos = [
            MovimentoProcesso(
                codigo=m.get("codigo"),
                nome=m.get("nome", ""),
                data=(m.get("dataHora") or "")[:10],
                orgao_julgador=m.get("orgaoJulgador", {}).get("nome", ""),
            )
            for m in movimentos_raw[:20]
        ]
        # Ordena por data decrescente — mais recente primeiro
        movimentos.sort(key=lambda m: m.data, reverse=True)

        return ProcessoDetalhado(
            numero=raw.get("numeroProcesso", ""),
            tribunal=raw.get("tribunal", ""),
            classe=raw.get("classe", {}).get("nome", ""),
            classe_codigo=classe_codigo,
            grau=raw.get("grau", ""),
            data_ajuizamento=self._formatar_data_cnj(raw.get("dataAjuizamento", "")),
            ultima_atualizacao=(raw.get("dataHoraUltimaAtualizacao") or "")[:10],
            orgao_julgador=raw.get("orgaoJulgador", {}).get("nome", ""),
            assuntos=[a.get("nome", "") for a in raw.get("assuntos", [])],
            movimentos=movimentos,
            nivel_sigilo=raw.get("nivelSigilo", 0),
            is_criminal=is_criminal,
        )
    @staticmethod
    def _formatar_data_cnj(data_crua: str) -> str:
        """
        Converte data do DataJud (YYYYMMDDHHMMSS) → ISO (YYYY-MM-DD).
        Exemplo: '20260330124252' → '2026-03-30'.
        """
        if not data_crua or len(data_crua) < 8:
            return data_crua
        try:
            return f"{data_crua[0:4]}-{data_crua[4:6]}-{data_crua[6:8]}"
        except Exception:
            return data_crua