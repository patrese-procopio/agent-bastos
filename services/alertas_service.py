"""
services/alertas_service.py
─────────────────────────────────────────────────────────────────────────────
Lógica de negócio para alertas: leitura/escrita em JSON local e seed inicial.

Por que separar do router?
  - O router (alertas_router.py) cuida apenas do transporte HTTP.
  - Este módulo cuida da persistência — onde os dados ficam e como são
    lidos/escritos, com fallback do Firestore para JSON local.
  - Testável com pytest sem subir o servidor: basta chamar ler_alertas()
    apontando para um arquivo temporário.

Funções exportadas:
  ler_alertas(caminho)           → list
  salvar_alertas(caminho, lista) → None   (thread-safe via Lock)
  seed_alertas_iniciais()        → None   (idempotente)

Constantes exportadas:
  ALERTAS_PATH       → caminho do alertas.json local
  ALERTAS_OSINT_PATH → caminho do alertas_osint.json local
"""

import json
import os
import threading
from datetime import datetime, timedelta

# ─── Caminhos ────────────────────────────────────────────────────────────────

BASE_DIR         = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASTA_RELATORIOS = os.path.join(BASE_DIR, "data", "relatorios")

ALERTAS_PATH       = os.path.join(PASTA_RELATORIOS, "alertas.json")
ALERTAS_OSINT_PATH = os.path.join(PASTA_RELATORIOS, "alertas_osint.json")

# Lock global para escrita — evita corrida em requests simultâneas
_lock = threading.Lock()


# ─── CRUD local (JSON) ───────────────────────────────────────────────────────

def ler_alertas(caminho: str) -> list:
    """
    Lê alertas de um arquivo JSON local.
    Retorna lista vazia se o arquivo não existir ou estiver corrompido.
    Nunca lança exceção — usado como fallback do Firestore.
    """
    if not os.path.exists(caminho):
        return []
    try:
        with open(caminho, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def salvar_alertas(caminho: str, alertas: list) -> None:
    """
    Persiste lista de alertas em JSON local.
    Thread-safe: usa Lock global para evitar escrita simultânea.

    Por que Lock e não banco de dados?
      Para um sistema de inteligência operacional, JSON local é adequado
      como fallback/cache offline. O Lock garante que dois requests
      simultâneos (ex: dois n8n workflows disparando ao mesmo tempo)
      não corrompam o arquivo com escrita parcial.
    """
    with _lock:
        with open(caminho, "w", encoding="utf-8") as f:
            json.dump(alertas, f, ensure_ascii=False, indent=2)


# ─── Seed inicial ─────────────────────────────────────────────────────────────

def seed_alertas_iniciais() -> None:
    """
    Popula os arquivos JSON com dados de exemplo se ainda não existirem.
    Idempotente: não sobrescreve arquivos existentes.
    Chamada uma única vez na inicialização do servidor (via api.py).
    """
    now = datetime.now()

    if not os.path.exists(ALERTAS_PATH):
        alertas = [
            {
                "id": "a1", "tipo": "telegram", "fonte": "@manausnoticias",
                "link": "https://t.me/manausnoticias",
                "titulo": "Mencao via #CVAM",
                "resumo": "Movimentacao no bairro Compensa. Fonte relata presenca de elemento "
                          "conhecido como 'Carnauba' coordenando distribuicao de entorpecentes. #CVAM #Manaus",
                "risco": "ALTO",
                "timestamp": (now - timedelta(minutes=18)).isoformat(),
                "lido": False,
                "alvo_id": 1, "alvo_nome": "Gelson de Lima Carnauba", "alvo_vulgos": ["Carnauba"],
                "termo_encontrado": "carnauba", "hashtag": "#CVAM",
                "analise_ia": "Elemento identificado em area de distribuicao ativa - risco operacional "
                              "imediato. Verificacao de campo recomendada nas proximas 2h.",
            },
            {
                "id": "b2", "tipo": "noticia", "fonte": "G1 Amazonas",
                "link": "https://g1.globo.com/am/",
                "titulo": "Policia prende suspeito de trafico no Jorge Teixeira",
                "resumo": '"John Wick" foi detido com 3 kg de entorpecentes durante operacao da DENARC nesta manha.',
                "risco": "ALTO",
                "timestamp": (now - timedelta(minutes=45)).isoformat(),
                "lido": False,
                "alvo_id": 14, "alvo_nome": "Leandro Costa de Oliveira",
                "alvo_vulgos": ["John Wick", "Gaviao", "Leandrinho"],
                "termo_encontrado": "john wick",
                "analise_ia": "Confirmacao de prisao - atualizar status do alvo. Verificar mandados pendentes.",
            },
            {
                "id": "c3", "tipo": "telegram", "fonte": "@policiaamazonas",
                "link": "https://t.me/policiaamazonas",
                "titulo": 'Mencao: "El Diablo" em @policiaamazonas',
                "resumo": 'Alerta de fronteira: individuo colombiano "El Diablo" teria cruzado pelo municipio de Tabatinga.',
                "risco": "ALTO",
                "timestamp": (now - timedelta(hours=1, minutes=30)).isoformat(),
                "lido": True,
                "alvo_id": 30, "alvo_nome": "Nelson Gaviria Florez",
                "alvo_vulgos": ["El Diablo", "Diablo"],
                "termo_encontrado": "el diablo",
                "analise_ia": None,
            },
            {
                "id": "d4", "tipo": "noticia", "fonte": "Acritica AM",
                "link": "https://www.acritica.com/",
                "titulo": "Operacao desmantela ponto de venda no Morro da Liberdade",
                "resumo": '"Professor" foi preso com quatro pessoas durante operacao no bairro.',
                "risco": "MEDIO",
                "timestamp": (now - timedelta(hours=3)).isoformat(),
                "lido": False,
                "alvo_id": 6, "alvo_nome": "Adalberto Salomao Guedes da Silva",
                "alvo_vulgos": ["Professor", "Salomao"],
                "termo_encontrado": "professor",
                "analise_ia": None,
            },
        ]
        salvar_alertas(ALERTAS_PATH, alertas)

    if not os.path.exists(ALERTAS_OSINT_PATH):
        osint = [
            {
                "id": "o1", "tipo": "sherlock", "fonte": "Sherlock - TikTok",
                "link": "https://www.tiktok.com/",
                "titulo": "Perfil encontrado: @carnauba_am no TikTok",
                "resumo": "Username 'carnauba' identificado em conta ativa. Bio: 'Compensa'. "
                          "Ultimo post ha 3 dias. Possivel perfil operacional do alvo.",
                "risco": "ALTO",
                "timestamp": (now - timedelta(hours=2)).isoformat(),
                "lido": False,
                "alvo_id": 1, "alvo_nome": "Gelson de Lima Carnauba", "alvo_vulgos": ["Carnauba"],
                "termo_encontrado": "carnauba", "plataforma": "TikTok",
                "analise_ia": "Perfil ativo com simbologia de faccao na bio. "
                              "Recomenda-se monitoramento continuo e extracao de contatos/seguidores.",
            },
            {
                "id": "o2", "tipo": "google_dork", "fonte": "Google Dork - Pastebin",
                "link": "https://pastebin.com/",
                "titulo": '"Mao Branca" indexado no Pastebin',
                "resumo": 'Documento indexado contem o termo "Mao Branca" associado a coordenadas e '
                          "horarios de entrega. Possivel lista operacional vazada.",
                "risco": "ALTO",
                "timestamp": (now - timedelta(hours=4)).isoformat(),
                "lido": False,
                "alvo_id": 23, "alvo_nome": "Josias da Cruz Barroso",
                "alvo_vulgos": ["Mao Branca", "MB"],
                "termo_encontrado": "mao branca",
                "dork": 'site:pastebin.com "Mao Branca"',
                "analise_ia": "Possivel vazamento de dados operacionais. "
                              "Prioridade maxima - acionar equipe de analise digital.",
            },
            {
                "id": "o3", "tipo": "sherlock", "fonte": "Sherlock - Instagram",
                "link": "https://www.instagram.com/",
                "titulo": "Perfil encontrado: @rdk_manaus no Instagram",
                "resumo": "Username 'RDK' identificado em perfil privado. Foto de capa com referencias "
                          "a zona norte de Manaus. 847 seguidores.",
                "risco": "MEDIO",
                "timestamp": (now - timedelta(hours=6)).isoformat(),
                "lido": False,
                "alvo_id": 28, "alvo_nome": "Gilson Mattos Rodrigues",
                "alvo_vulgos": ["RDK", "Rei do Skunk"],
                "termo_encontrado": "rdk", "plataforma": "Instagram",
                "analise_ia": None,
            },
        ]
        salvar_alertas(ALERTAS_OSINT_PATH, osint)
