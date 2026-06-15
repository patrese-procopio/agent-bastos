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
    """
    Retorna a lista de alvos do alvos.json.
    Suporta dois tipos:
      {"id": 1, "nome": "João Silva"}           → tipo "pessoa" (nome completo, sem vulgos)
      {"id": "t1", "tipo": "termo", "termo": "CV-AM"}  → tipo "termo" (hashtag/expressão livre)
    Vulgos foram removidos da varredura — geram ruído excessivo sem contexto.
    """
    if not os.path.exists(ALVOS_PATH):
        return []
    with open(ALVOS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _termos_de_busca(alvo: dict) -> list[str]:
    """
    Retorna a lista de termos a buscar para um alvo.
    - Pessoa: apenas o nome completo (vulgos excluídos — geram falsos positivos)
    - Termo:  o próprio termo livre (ex: "CV-AM", "Tropa de Manaus")
    """
    if alvo.get("tipo") == "termo":
        t = (alvo.get("termo") or "").strip()
        return [t] if t else []
    # Tipo pessoa — só o nome, sem vulgos
    nome = (alvo.get("nome") or "").strip()
    return [nome] if nome else []


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


_IA_MAX_POR_VARREDURA = 20  # teto de análises via LLM por varredura (controla custo/tempo)

_IA_SYS = (
    "Você é um analista de inteligência policial da AIPEN/SEAP-AM. "
    "Recebe uma menção (notícia ou perfil online) ligada a um alvo monitorado "
    "e produz uma avaliação tática objetiva, sem floreio. "
    "Responda SOMENTE em JSON com as chaves: "
    '"risco" (um de: ALTO, MÉDIO, BAIXO) e '
    '"analise" (1 a 2 frases, foco operacional: o que significa e a ação sugerida). '
    "Se a menção for irrelevante ou homônimo provável, risco BAIXO e diga isso."
)


def _analisar_ia(titulo: str, resumo: str, alvo_nome: str) -> dict | None:
    """
    Analisa um alerta via LLM (Groq). Retorna {"risco", "analise"} ou None se falhar.
    Nunca lança exceção — IA é complemento, não pode quebrar a varredura.
    """
    try:
        from groq import Groq
        from config.settings import GROQ_API_KEY
        if not GROQ_API_KEY:
            return None
        client = Groq(api_key=GROQ_API_KEY)
        user = (
            f"Alvo monitorado: {alvo_nome}\n"
            f"Título: {titulo}\n"
            f"Resumo: {resumo}"
        )
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": _IA_SYS},
                {"role": "user", "content": user},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=300,
        )
        data    = json.loads(resp.choices[0].message.content)
        risco   = str(data.get("risco", "")).strip().upper()
        if risco not in ("ALTO", "MÉDIO", "BAIXO"):
            risco = None
        analise = (data.get("analise") or "").strip() or None
        if not analise:
            return None
        return {"risco": risco, "analise": analise}
    except Exception:
        return None


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
    ia_orcamento   = _IA_MAX_POR_VARREDURA

    for alvo in alvos:
        termos = _termos_de_busca(alvo)

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
                    "alvo_id":          alvo["id"],
                    "alvo_nome":        alvo.get("nome") or alvo.get("termo"),
                    "alvo_tipo":        alvo.get("tipo", "pessoa"),
                    "termo_encontrado": termo,
                    "analise_ia":       None,
                }

                nome_ref = alvo.get("nome") or alvo.get("termo") or termo
                if ia_orcamento > 0:
                    ia = _analisar_ia(n["titulo"], n["resumo"], nome_ref)
                    if ia:
                        if ia["risco"]:
                            alerta["risco"] = ia["risco"]
                        alerta["analise_ia"] = ia["analise"]
                        ia_orcamento -= 1

                _salvar_firestore(alerta)
                novos.append(alerta)
                ids_existentes.add(id_alerta)

    if novos:
        alertas_atualizados = novos + alertas_atuais
        _salvar_alertas(ALERTAS_RT, alertas_atualizados[:200])
        _hitl_automatico(novos)

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
    ia_orcamento    = _IA_MAX_POR_VARREDURA

    for alvo in alvos:
        termos = _termos_de_busca(alvo)

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
                        "alvo_id":          alvo["id"],
                        "alvo_nome":        alvo.get("nome") or alvo.get("termo"),
                        "alvo_tipo":        alvo.get("tipo", "pessoa"),
                        "termo_encontrado": termo,
                        "dork":            dork,
                        "plataforma":      plataforma,
                        "analise_ia":      None,
                    }

                    if ia_orcamento > 0:
                        ia = _analisar_ia(titulo, resumo, alvo["nome"])
                        if ia:
                            if ia["risco"]:
                                alerta["risco"] = ia["risco"]
                            alerta["analise_ia"] = ia["analise"]
                            ia_orcamento -= 1

                    _salvar_firestore(alerta)
                    novos.append(alerta)
                    ids_existentes.add(id_alerta)

    if novos:
        alertas_atualizados = novos + alertas_atuais
        _salvar_alertas(ALERTAS_OST, alertas_atualizados[:200])
        _hitl_automatico(novos)

    return {"ok": True, "novos": len(novos), "alvos_varridos": len(alvos)}


# ─── Backfill de análise por IA ───────────────────────────────────────────────

def _get_db():
    """Cliente Firestore ou None se indisponível."""
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
        SA_PATH = os.path.join(BASE_DIR, "serviceAccountKey.json")
        if not firebase_admin._apps:
            cred = credentials.Certificate(SA_PATH)
            firebase_admin.initialize_app(cred)
        return firestore.client()
    except Exception:
        return None


def analisar_pendentes(limite: int = 20) -> dict:
    """
    Aplica análise por IA em alertas que ainda não têm `analise_ia`.
    Atualiza os JSON locais (fonte servida pela UI) e espelha no Firestore.
    """
    analisados = 0
    db = _get_db()

    for caminho in (ALERTAS_RT, ALERTAS_OST):
        if analisados >= limite:
            break
        alertas = _ler_alertas(caminho)
        mudou   = False
        for a in alertas:
            if analisados >= limite:
                break
            if a.get("analise_ia"):
                continue
            ia = _analisar_ia(a.get("titulo", ""), a.get("resumo", ""), a.get("alvo_nome", ""))
            if not ia:
                continue
            if ia["risco"]:
                a["risco"] = ia["risco"]
            a["analise_ia"] = ia["analise"]
            analisados += 1
            mudou = True
            if db is not None and a.get("id"):
                try:
                    upd = {"analise_ia": ia["analise"]}
                    if ia["risco"]:
                        upd["risco"] = ia["risco"]
                    db.collection("alertas").document(a["id"]).update(upd)
                except Exception:
                    pass
        if mudou:
            _salvar_alertas(caminho, alertas)

    return {"ok": True, "analisados": analisados}


# ─── HITL Automático ─────────────────────────────────────────────────────────

def _hitl_automatico(alertas: list) -> None:
    """
    Para cada alerta novo com risco ALTO, abre automaticamente um HITL
    sem nenhuma intervenção humana.

    Por que só ALTO?
      MÉDIO e BAIXO geram volume demais — o chefe ia ignorar tudo.
      ALTO significa que o LLM ou o léxico já confirmaram relevância operacional.
      Se não houver LLM configurado, apenas os do léxico chegam aqui.

    Falha silenciosa: se o HITL não puder ser criado (sem n8n, sem WhatsApp),
    o alerta já está salvo localmente — não é perdido.
    """
    try:
        from services.human_loop_service import criar_aprovacao
        from services.notification_service import notificar_aprovacao_pendente
        from services.human_loop_service import marcar_notificado
        import asyncio

        altos = [a for a in alertas if a.get("risco") == "ALTO"]
        for a in altos[:3]:  # máx 3 HITLs por varredura — evita spam
            alvo   = a.get("alvo_nome", "Alvo desconhecido")
            titulo = a.get("titulo", "")
            fonte  = a.get("fonte", "")
            analise = a.get("analise_ia") or ""
            tipo_alvo = "TERMO" if a.get("alvo_tipo") == "termo" else "PESSOA"

            descricao = (
                f"[{tipo_alvo}] {alvo}\n"
                f"Fonte: {fonte}\n"
                f"Título: {titulo[:200]}\n"
                + (f"Análise IA: {analise}" if analise else "")
            ).strip()

            aprov_id = criar_aprovacao(
                tipo_evento = "alerta_watchlist",
                descricao   = descricao,
                risco       = "ALTO",
                operador    = "watchlist_engine",
                detalhes    = {
                    "alerta_id":  a.get("id"),
                    "alvo_nome":  alvo,
                    "alvo_tipo":  a.get("alvo_tipo", "pessoa"),
                    "link":       a.get("link", ""),
                    "analise_ia": analise,
                },
            )

            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    import concurrent.futures
                    with concurrent.futures.ThreadPoolExecutor() as pool:
                        fut = pool.submit(
                            asyncio.run,
                            notificar_aprovacao_pendente(
                                aprovacao_id=aprov_id, tipo_evento="alerta_watchlist",
                                descricao=descricao, risco="ALTO",
                                operador="watchlist_engine", detalhes=a,
                            )
                        )
                        sucesso = fut.result(timeout=10)
                else:
                    sucesso = loop.run_until_complete(
                        notificar_aprovacao_pendente(
                            aprovacao_id=aprov_id, tipo_evento="alerta_watchlist",
                            descricao=descricao, risco="ALTO",
                            operador="watchlist_engine", detalhes=a,
                        )
                    )
            except Exception:
                sucesso = False

            marcar_notificado(aprov_id, sucesso)

    except Exception:
        pass  # nunca quebra a varredura


# ─── Scheduler Automático ─────────────────────────────────────────────────────

_scheduler_iniciado = False


def iniciar_scheduler() -> None:
    """
    Inicia thread de varredura automática em background.
    Chamado uma única vez pelo lifespan do FastAPI (api.py).

    Intervalo configurável via .env:
      WATCHLIST_INTERVALO_HORAS=6   (padrão: 6 horas)
      WATCHLIST_ATIVO=true          (padrão: true — setar false para desabilitar)

    Por que thread e não asyncio?
      varrer_realtime/osint usam urllib síncrono e socket blocking.
      Rodar num executor asyncio seria mais correto, mas thread é mais simples
      e o overhead é mínimo (só 1 thread extra rodando a cada N horas).
    """
    global _scheduler_iniciado
    if _scheduler_iniciado:
        return

    ativo = os.getenv("WATCHLIST_ATIVO", "true").lower() == "true"
    if not ativo:
        return

    try:
        intervalo_h = float(os.getenv("WATCHLIST_INTERVALO_HORAS", "6"))
    except ValueError:
        intervalo_h = 6.0

    import threading
    import time

    def _loop():
        import logging
        log = logging.getLogger("bastos.watchlist")
        log.info(f"Watchlist Engine iniciado — varredura a cada {intervalo_h}h")
        while True:
            time.sleep(intervalo_h * 3600)
            try:
                log.info("Watchlist: iniciando varredura automática")
                rt  = varrer_realtime()
                ost = varrer_osint()
                log.info(
                    f"Watchlist: RT={rt['novos']} novos | OSINT={ost['novos']} novos | "
                    f"alvos={rt['alvos_varridos']}"
                )
            except Exception as e:
                log.error(f"Watchlist: erro na varredura automática: {e}")

    t = threading.Thread(target=_loop, daemon=True, name="watchlist-scheduler")
    t.start()
    _scheduler_iniciado = True


# ─── Execução direta (teste) ──────────────────────────────────────────────────
if __name__ == "__main__":
    print("Testando varredura Tempo Real...")
    r = varrer_realtime()
    print(f"  Novos alertas RT: {r['novos']} / {r['alvos_varridos']} alvos varridos")

    print("Testando varredura OSINT...")
    r = varrer_osint()
    print(f"  Novos alertas OSINT: {r['novos']} / {r['alvos_varridos']} alvos varridos")
