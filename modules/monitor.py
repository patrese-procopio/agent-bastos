# -*- coding: utf-8 -*-
"""
monitor.py — Monitor de Alertas OSINT
Agent Bastos | AIPEN

Lê alvos.json, busca menções via Google News RSS e salva
alertas no Firestore (com fallback local em alertas.json).

Chamado pelos endpoints:
  POST /alertas/varrer       → varrer_realtime()
  POST /alertas/osint/varrer → varrer_osint()
"""

import json
import os
import re
import uuid
import hashlib
import socket
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from xml.etree import ElementTree as ET

# Timeout global: cobre conexão E leitura de dados
# urllib.request.urlopen(timeout=N) só cobre conexão — socket cobre os dois
socket.setdefaulttimeout(5)

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALVOS_PATH  = os.path.join(BASE_DIR, "data", "alvos.json")
ALERTAS_RT  = os.path.join(BASE_DIR, "data", "relatorios", "alertas.json")
ALERTAS_OST = os.path.join(BASE_DIR, "data", "relatorios", "alertas_osint.json")

# ─── Helpers ─────────────────────────────────────────────────────────────────

def _carregar_alvos() -> list:
    if not os.path.exists(ALVOS_PATH):
        return []
    with open(ALVOS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _ler_alertas(caminho: str) -> list:
    if not os.path.exists(caminho):
        return []
    try:
        with open(caminho, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _salvar_alertas(caminho: str, alertas: list) -> None:
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(alertas, f, ensure_ascii=False, indent=2)


def _gerar_id(texto: str) -> str:
    """ID determinístico baseado no conteúdo — evita duplicatas."""
    return hashlib.md5(texto.encode("utf-8")).hexdigest()[:12]


def _normalizar(texto: str) -> str:
    return re.sub(r"\s+", " ", texto or "").strip().lower()


def _classificar_risco(titulo: str, resumo: str) -> str:
    texto = (titulo + " " + resumo).lower()
    alto  = ["preso", "detido", "operação", "tráfico", "homicídio", "assassinato",
             "apreensão", "fugiu", "foragido", "morte", "baleado", "arma"]
    medio = ["suspeito", "investigado", "monitorado", "flagrante", "drogas", "procurado"]
    for p in alto:
        if p in texto:
            return "ALTO"
    for p in medio:
        if p in texto:
            return "MÉDIO"
    return "BAIXO"


def _salvar_firestore(alerta: dict, colecao: str = "alertas") -> bool:
    """Tenta salvar no Firestore. Retorna False se falhar (sem Firebase)."""
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
        SA_PATH = os.path.join(BASE_DIR, "serviceAccountKey.json")
        if not firebase_admin._apps:
            cred = credentials.Certificate(SA_PATH)
            firebase_admin.initialize_app(cred)
        db = firestore.client()
        db.collection(colecao).document(alerta["id"]).set(alerta)
        return True
    except Exception:
        return False


# ─── Google News RSS ──────────────────────────────────────────────────────────

def _buscar_google_news(termo: str, max_resultados: int = 5) -> list:
    """
    Busca no Google News RSS por termo.
    Retorna lista de dicts: {titulo, resumo, link, fonte, data_pub}
    """
    query = urllib.parse.quote(f'"{termo}" Manaus OR Amazonas OR AM')
    url   = f"https://news.google.com/rss/search?q={query}&hl=pt-BR&gl=BR&ceid=BR:pt-419"

    headers = {"User-Agent": "Mozilla/5.0 (compatible; AgentBastos/1.0)"}
    req     = urllib.request.Request(url, headers=headers)

    try:
        with urllib.request.urlopen(req) as resp:
            xml = resp.read()
    except Exception:
        return []

    resultados = []
    try:
        root  = ET.fromstring(xml)
        items = root.findall(".//item")[:max_resultados]
        for item in items:
            titulo  = item.findtext("title", "").strip()
            link    = item.findtext("link",  "").strip()
            desc    = item.findtext("description", "").strip()
            fonte   = item.findtext("source", "").strip() or "Google News"
            pub_raw = item.findtext("pubDate", "").strip()

            # Remove tags HTML do resumo
            resumo = re.sub(r"<[^>]+>", "", desc).strip()[:400]

            resultados.append({
                "titulo":   titulo,
                "resumo":   resumo,
                "link":     link,
                "fonte":    fonte,
                "data_pub": pub_raw,
            })
    except ET.ParseError:
        pass

    return resultados


# ─── Varredura Tempo Real (Google News) ──────────────────────────────────────

def varrer_realtime() -> dict:
    """
    Busca menções a alvos e vulgos no Google News.
    Salva alertas novos no Firestore + fallback local.
    """
    alvos        = _carregar_alvos()
    alertas_atuais = _ler_alertas(ALERTAS_RT)
    ids_existentes = {a.get("id") for a in alertas_atuais}
    novos          = []

    for alvo in alvos:
        termos = [alvo["nome"]] + alvo.get("vulgos", [])

        for termo in termos:
            noticias = _buscar_google_news(termo, max_resultados=3)

            for n in noticias:
                id_alerta = _gerar_id(n["link"] + termo)
                if id_alerta in ids_existentes:
                    continue

                risco = _classificar_risco(n["titulo"], n["resumo"])

                alerta = {
                    "id":              id_alerta,
                    "tipo":            "noticia",
                    "fonte":           n["fonte"],
                    "link":            n["link"],
                    "titulo":          n["titulo"],
                    "resumo":          n["resumo"],
                    "risco":           risco,
                    "timestamp":       datetime.now(timezone.utc).isoformat(),
                    "lido":            False,
                    "categoria":       "realtime",
                    "alvo_id":         alvo["id"],
                    "alvo_nome":       alvo["nome"],
                    "alvo_vulgos":     alvo["vulgos"],
                    "termo_encontrado": termo,
                    "analise_ia":      None,
                }

                _salvar_firestore(alerta)
                novos.append(alerta)
                ids_existentes.add(id_alerta)

    if novos:
        alertas_atualizados = novos + alertas_atuais
        _salvar_alertas(ALERTAS_RT, alertas_atualizados[:200])

    return {"ok": True, "novos": len(novos), "alvos_varridos": len(alvos)}


# ─── Varredura OSINT (Google Dork) ───────────────────────────────────────────

_DORK_SITES = [
    "site:facebook.com",
    "site:instagram.com",
    "site:twitter.com",
    "site:tiktok.com",
    "site:youtube.com",
    "site:pastebin.com",
    "site:t.me",
]

def varrer_osint() -> dict:
    """
    Executa Google Dorks para cada alvo nas principais redes sociais.
    Salva alertas OSINT novos no Firestore + fallback local.
    """
    alvos           = _carregar_alvos()
    alertas_atuais  = _ler_alertas(ALERTAS_OST)
    ids_existentes  = {a.get("id") for a in alertas_atuais}
    novos           = []

    for alvo in alvos:
        termos = alvo.get("vulgos", [])[:3]  # Máx 3 vulgos por alvo para não sobrecarregar

        for termo in termos:
            for site in _DORK_SITES[:3]:  # Máx 3 sites por termo
                dork     = f'{site} "{termo}"'
                query    = urllib.parse.quote(f'{dork} Manaus')
                url      = f"https://news.google.com/rss/search?q={query}&hl=pt-BR&gl=BR&ceid=BR:pt-419"
                headers  = {"User-Agent": "Mozilla/5.0 (compatible; AgentBastos/1.0)"}
                req      = urllib.request.Request(url, headers=headers)

                try:
                    with urllib.request.urlopen(req) as resp:
                        xml = resp.read()
                    root  = ET.fromstring(xml)
                    items = root.findall(".//item")[:2]
                except Exception:
                    continue

                for item in items:
                    titulo   = item.findtext("title", "").strip()
                    link     = item.findtext("link",  "").strip()
                    desc     = item.findtext("description", "").strip()
                    resumo   = re.sub(r"<[^>]+>", "", desc).strip()[:400]
                    id_alerta = _gerar_id(link + termo + site)

                    if id_alerta in ids_existentes:
                        continue

                    # Detecta plataforma pelo site do dork
                    plataforma_map = {
                        "facebook":   "Facebook",
                        "instagram":  "Instagram",
                        "twitter":    "Twitter/X",
                        "tiktok":     "TikTok",
                        "youtube":    "YouTube",
                        "pastebin":   "Pastebin",
                        "t.me":       "Telegram",
                    }
                    plataforma = next(
                        (v for k, v in plataforma_map.items() if k in site), "Web"
                    )

                    alerta = {
                        "id":              id_alerta,
                        "tipo":            "google_dork",
                        "fonte":           f"Google Dork — {plataforma}",
                        "link":            link,
                        "titulo":          titulo,
                        "resumo":          resumo,
                        "risco":           "MÉDIO",
                        "timestamp":       datetime.now(timezone.utc).isoformat(),
                        "lido":            False,
                        "categoria":       "osint",
                        "alvo_id":         alvo["id"],
                        "alvo_nome":       alvo["nome"],
                        "alvo_vulgos":     alvo["vulgos"],
                        "termo_encontrado": termo,
                        "dork":            dork,
                        "plataforma":      plataforma,
                        "analise_ia":      None,
                    }

                    _salvar_firestore(alerta)
                    novos.append(alerta)
                    ids_existentes.add(id_alerta)

    if novos:
        alertas_atualizados = novos + alertas_atuais
        _salvar_alertas(ALERTAS_OST, alertas_atualizados[:200])

    return {"ok": True, "novos": len(novos), "alvos_varridos": len(alvos)}


# ─── Execução direta (teste) ──────────────────────────────────────────────────
if __name__ == "__main__":
    print("Testando varredura Tempo Real...")
    r = varrer_realtime()
    print(f"  Novos alertas RT: {r['novos']} / {r['alvos_varridos']} alvos varridos")

    print("Testando varredura OSINT...")
    r = varrer_osint()
    print(f"  Novos alertas OSINT: {r['novos']} / {r['alvos_varridos']} alvos varridos")
