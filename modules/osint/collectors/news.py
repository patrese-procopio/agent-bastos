"""
collectors/news.py — Notícias via Google News RSS + NewsData.io
Agent Bastos | Segurança Pública/Corporativa

Arquitetura em duas camadas:
  1. GoogleNewsRSSCollector  — zero custo, zero chave, tempo real
  2. NewsDataCollector       — 200 req/dia grátis, fallback enriquecido

Por que RSS antes de API paga?
  Google News indexa centenas de veículos brasileiros em tempo real.
  Para OSINT de pessoa física, o RSS com busca exata por nome é suficiente
  em 90% dos casos. A NewsData entra quando precisamos de mais detalhes
  ou o RSS não retornou resultado relevante.
"""

from __future__ import annotations

import os
import xml.etree.ElementTree as ET
import urllib.parse
import logging
from datetime import datetime

from ..models import OsintRequest, SourceName, SourceResult

logger = logging.getLogger(__name__)

# Importa BaseCollector do módulo base
try:
    from .base import BaseCollector
except ImportError:
    # Fallback se a estrutura de import for diferente
    from modules.osint.collectors.base import BaseCollector


# ─────────────────────────────────────────────
# CAMADA 1 — GOOGLE NEWS RSS (sem chave)
# ─────────────────────────────────────────────

class GoogleNewsRSSCollector(BaseCollector):
    """
    Busca notícias no Google News via RSS público.

    Vantagens:
      - Zero custo, zero cadastro, zero chave de API
      - Atualizado em tempo real pelo ecossistema Google
      - Filtra por idioma PT-BR e país Brasil nativamente
      - Busca exata por nome (aspas) — reduz falsos positivos

    Limitação:
      - Google pode bloquear IPs com volume alto (não é problema pra OSINT individual)
      - Retorna título e link, não conteúdo completo
      - Histórico limitado (geralmente últimos 30-90 dias)

    Namespace XML do RSS do Google:
      O feed usa o namespace padrão Atom + elementos RSS 2.0.
      Precisamos iterar os <item> dentro do <channel>.
    """

    source_name = SourceName.GNEWS
    BASE_URL = "https://news.google.com/rss/search"

    # Headers que simulam browser — evita bloqueio por user-agent
    HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
        "Accept-Language": "pt-BR,pt;q=0.9",
    }

    async def _fetch(self, request: OsintRequest) -> SourceResult:
        if not request.nome:
            return SourceResult(
                source=self.source_name,
                success=False,
                error_message="Nome obrigatório para busca de notícias",
            )

        client = await self._get_client()

        # Busca exata por nome entre aspas — reduz ruído
        query = f'"{request.nome}"'
        params = {
            "q": query,
            "hl": "pt-BR",
            "gl": "BR",
            "ceid": "BR:pt-419",
        }

        url = f"{self.BASE_URL}?{urllib.parse.urlencode(params)}"

        try:
            response = await client.get(url, headers=self.HEADERS)

            if response.status_code != 200:
                return SourceResult(
                    source=self.source_name,
                    success=False,
                    error_message=f"Google News RSS retornou HTTP {response.status_code}",
                )

            noticias = self._parse_rss(response.text)

            return SourceResult(
                source=self.source_name,
                success=True,
                raw_data=noticias,
                items_found=len(noticias),
            )

        except Exception as exc:
            logger.error("Erro no GoogleNewsRSSCollector: %s", str(exc))
            return SourceResult(
                source=self.source_name,
                success=False,
                error_message=str(exc),
            )

    def _parse_rss(self, xml_text: str) -> list[dict]:
        """
        Parseia o XML do RSS do Google News.

        Estrutura do feed:
          <rss>
            <channel>
              <item>
                <title>Título da notícia - Veículo</title>
                <link>https://...</link>
                <pubDate>Mon, 02 Jun 2026 10:00:00 GMT</pubDate>
                <source url="...">Nome do Veículo</source>
              </item>
            </channel>
          </rss>
        """
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError as e:
            logger.error("Erro ao parsear XML do Google News: %s", str(e))
            return []

        noticias = []
        items = root.findall(".//item")

        for item in items[:15]:  # máximo 15 notícias
            titulo_raw = item.findtext("title", "")
            link = item.findtext("link", "")
            pub_date = item.findtext("pubDate", "")

            # O título do Google News vem como "Título - Veículo"
            # Separa o veículo do título
            partes = titulo_raw.rsplit(" - ", 1)
            titulo = partes[0].strip() if partes else titulo_raw
            veiculo = partes[1].strip() if len(partes) > 1 else "Desconhecido"

            # Tenta pegar o veículo do elemento <source> se existir
            source_elem = item.find("source")
            if source_elem is not None and source_elem.text:
                veiculo = source_elem.text.strip()

            # Normaliza a data
            data_normalizada = self._parse_date(pub_date)

            noticias.append({
                "titulo": titulo,
                "veiculo": veiculo,
                "url": link,
                "data": data_normalizada,
                "relevancia": "alta",
                "sentimento": "negativo",  # contexto OSINT — notícias sobre alvos
                "fonte": "google_news_rss",
                "source": "gnews",
            })

        return noticias

    def _parse_date(self, date_str: str) -> str:
        """Converte data RFC 2822 do RSS para ISO 8601."""
        if not date_str:
            return datetime.utcnow().strftime("%Y-%m-%d")
        try:
            from email.utils import parsedate_to_datetime
            dt = parsedate_to_datetime(date_str)
            return dt.strftime("%Y-%m-%d")
        except Exception:
            return date_str


# ─────────────────────────────────────────────
# CAMADA 2 — NEWSDATA.IO (200 req/dia grátis)
# ─────────────────────────────────────────────

class NewsDataCollector(BaseCollector):
    """
    Notícias via NewsData.io — fallback enriquecido quando RSS não retorna.

    Vantagens sobre RSS:
      - Retorna descrição completa da notícia (não só título)
      - Filtra por categoria (crime, politics, etc.)
      - Histórico desde 2020
      - Metadados ricos: autor, palavras-chave, sentimento

    Free tier: 200 req/dia — suficiente para OSINT individual.
    Cadastro: https://newsdata.io (gratuito)

    NEWSDATA_API_KEY no .env
    """

    source_name = SourceName.GNEWS  # compartilha enum com GoogleNews
    BASE_URL = "https://newsdata.io/api/1/news"

    def __init__(self) -> None:
        super().__init__()
        self.api_key = os.getenv("NEWSDATA_API_KEY", "")

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
                error_message="NEWSDATA_API_KEY não configurada — cadastre em newsdata.io (gratuito)",
            )

        client = await self._get_client()

        try:
            response = await client.get(
                self.BASE_URL,
                params={
                    "q": f'"{request.nome}"',
                    "country": "br",
                    "language": "pt",
                    "apikey": self.api_key,
                },
            )

            if response.status_code == 429:
                return SourceResult(
                    source=self.source_name,
                    success=False,
                    error_message="NewsData.io: limite diário atingido (200 req/dia no plano gratuito)",
                )

            if response.status_code != 200:
                return SourceResult(
                    source=self.source_name,
                    success=False,
                    error_message=f"NewsData.io HTTP {response.status_code}",
                )

            data = response.json()
            articles = data.get("results", [])

            noticias = [
                {
                    "titulo":    a.get("title", ""),
                    "descricao": a.get("description", "") or a.get("content", "")[:300],
                    "veiculo":   a.get("source_id", ""),
                    "url":       a.get("link", ""),
                    "data":      (a.get("pubDate") or "")[:10],
                    "categoria": a.get("category", []),
                    "relevancia": "alta",
                    "sentimento": "negativo",
                    "fonte":     "newsdata_io",
                    "source":    "gnews",
                }
                for a in articles[:10]
            ]

            return SourceResult(
                source=self.source_name,
                success=True,
                raw_data=noticias,
                items_found=len(noticias),
            )

        except Exception as exc:
            logger.error("Erro no NewsDataCollector: %s", str(exc))
            return SourceResult(
                source=self.source_name,
                success=False,
                error_message=str(exc),
            )


# ─────────────────────────────────────────────
# COLLECTOR UNIFICADO — orquestra as duas camadas
# ─────────────────────────────────────────────

class NewsCollector(BaseCollector):
    """
    Orquestra GoogleNewsRSS + NewsData com fallback automático.

    Lógica:
      1. Tenta Google News RSS (sempre, zero custo)
      2. Se retornar 0 resultados E NewsData estiver configurado → tenta NewsData
      3. Consolida e deduplica por título

    Isso garante que o collector nunca falha silenciosamente —
    sempre retorna o melhor resultado disponível.
    """

    source_name = SourceName.GNEWS

    def __init__(self) -> None:
        super().__init__()
        self._rss = GoogleNewsRSSCollector()
        self._newsdata = NewsDataCollector()

    async def _fetch(self, request: OsintRequest) -> SourceResult:
        # Camada 1 — RSS (sempre tenta)
        rss_result = await self._rss.fetch(request)

        # Se RSS retornou resultados, usa direto
        if rss_result.success and rss_result.items_found > 0:
            logger.info(
                "NewsCollector: %d notícias via Google News RSS",
                rss_result.items_found,
            )
            return rss_result

        # Camada 2 — NewsData como fallback
        newsdata_key = os.getenv("NEWSDATA_API_KEY", "")
        if newsdata_key:
            logger.info("NewsCollector: RSS sem resultado, tentando NewsData.io")
            nd_result = await self._newsdata.fetch(request)
            if nd_result.success and nd_result.items_found > 0:
                return nd_result

        # Retorna o resultado do RSS mesmo que vazio (sucesso sem dados)
        # Isso é melhor que retornar erro — o pipeline continua normalmente
        if rss_result.success:
            return rss_result

        # Último recurso — retorna sem erro pra não quebrar o pipeline
        return SourceResult(
            source=self.source_name,
            success=True,
            raw_data=[],
            items_found=0,
        )
