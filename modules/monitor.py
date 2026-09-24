# -*- coding: utf-8 -*-
"""
monitor.py — Monitor de Alertas OSINT
Agent Bastos | AIPEN

Lê alvos.json, busca menções via GDELT DOC 2.0 (API gratuita e sem chave)
e salva alertas no Firestore (com fallback local em alertas.json).

Migrado do Google News RSS (scraping) em 2026-09: a rede desta agência foi
bloqueada pelo Google por "tráfego incomum" após meses de varredura
automática — o scraping devolvia HTTP 503 e o código antigo mascarava isso
como "0 resultados", indistinguível de uma busca genuína sem achados. O
GDELT é keyless, sem cota diária e sem esse risco de bloqueio (só exige
>=5s entre requisições do mesmo IP, controlado por `_throttle_gdelt`).

Chamado pelos endpoints:
  POST /alertas/varrer       → varrer_realtime()
  POST /alertas/osint/varrer → varrer_osint()
"""

import json
import os
import re
import time
import uuid
import hashlib
import socket
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone

# Timeout global: cobre conexão E leitura de dados
# urllib.request.urlopen(timeout=N) só cobre conexão — socket cobre os dois
socket.setdefaulttimeout(5)

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from config.paths import FILE_ALVOS, FILE_ALERTAS_RT, FILE_ALERTAS_OSINT
ALVOS_PATH  = str(FILE_ALVOS)
ALERTAS_RT  = str(FILE_ALERTAS_RT)
ALERTAS_OST = str(FILE_ALERTAS_OSINT)

# ─── Helpers ─────────────────────────────────────────────────────────────────

def _carregar_alvos(alvo_id: str | None = None) -> list:
    """
    Retorna a lista de alvos do alvos.json.
    Suporta dois tipos:
      {"id": 1, "nome": "João Silva"}           → tipo "pessoa" (nome completo, sem vulgos)
      {"id": "t1", "tipo": "termo", "termo": "CV-AM"}  → tipo "termo" (hashtag/expressão livre)
    Vulgos foram removidos da varredura — geram ruído excessivo sem contexto.

    Se `alvo_id` for informado, filtra pra varredura individualizada de um só
    alvo/termo (tela Alertas → dropdown "Alvo"); sem ele, varre todos (padrão
    usado pelo scheduler automático).
    """
    if not os.path.exists(ALVOS_PATH):
        return []
    with open(ALVOS_PATH, "r", encoding="utf-8") as f:
        alvos = json.load(f)
    if alvo_id is not None:
        alvos = [a for a in alvos if str(a.get("id")) == str(alvo_id)]
    return alvos


def _termos_de_busca(alvo: dict) -> list[str]:
    """
    Retorna a lista de termos a buscar para um alvo.
    - Pessoa: apenas o nome completo (vulgos excluídos — geram falsos positivos)
    - Termo:  o termo livre + variantes cadastradas (ex: "CV-AM" + ["CVAM", "CV/AM"])
    """
    if alvo.get("tipo") == "termo":
        t = (alvo.get("termo") or "").strip()
        variantes = [v.strip() for v in (alvo.get("variantes") or []) if v.strip()]
        return ([t] if t else []) + variantes
    # Tipo pessoa — só o nome, sem vulgos
    nome = (alvo.get("nome") or "").strip()
    return [nome] if nome else []


def _query_gdelt_do_alvo(alvo: dict) -> str | None:
    """
    Monta o núcleo da query GDELT pro alvo, JÁ entre aspas (uma frase exata
    pra pessoa, ou um grupo OR de frases exatas quando o termo tem variantes
    cadastradas). Siglas como "CV-AM" raramente aparecem escritas de forma
    idêntica em toda notícia — sem as variantes, uma busca de frase exata
    (o padrão de qualquer busca "entre aspas") acha muito pouco. Retorna
    None se o alvo não tiver nome/termo válido.
    """
    termos = _termos_de_busca(alvo)
    if not termos:
        return None
    if len(termos) == 1:
        return f'"{termos[0]}"'
    return "(" + " OR ".join(f'"{t}"' for t in termos) + ")"


def _ler_alertas(caminho: str) -> list:
    if not os.path.exists(caminho):
        return []
    try:
        with open(caminho, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


# Retenção máxima dos alertas — mesma janela da busca no GDELT (90 dias),
# pra ferramenta de OSINT ficar de fato "últimos 3 meses", sem acúmulo de
# meses de varredura antiga poluindo a tela. Alerta sem timestamp válido
# é mantido (não arrisca apagar dado por falha de parsing).
_RETENCAO_DIAS = 90


def _remover_antigos(alertas: list, dias: int = _RETENCAO_DIAS) -> list:
    from datetime import timedelta
    limite = datetime.now(timezone.utc) - timedelta(days=dias)
    def _recente(a: dict) -> bool:
        ts = a.get("timestamp")
        if not ts:
            return True
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            return dt >= limite
        except Exception:
            return True
    return [a for a in alertas if _recente(a)]


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
        from config.settings import GROQ_API_KEY, GROQ_MODEL_CHAT
        if not GROQ_API_KEY:
            return None
        client = Groq(api_key=GROQ_API_KEY)
        user = (
            f"Alvo monitorado: {alvo_nome}\n"
            f"Título: {titulo}\n"
            f"Resumo: {resumo}"
        )
        resp = client.chat.completions.create(
            model=GROQ_MODEL_CHAT,
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


# ─── GDELT DOC 2.0 (busca de notícias real, gratuita, sem chave) ─────────────

def _janela_dias() -> int:
    """Retorna quantos dias atrás considerar como 'atual'. Configurável via .env."""
    try:
        return int(os.getenv("WATCHLIST_JANELA_DIAS", "30"))
    except ValueError:
        return 30


class BuscaExternaIndisponivel(Exception):
    """
    Levantada quando a busca no GDELT falha (rede, timeout ou HTTP de erro).
    `bloqueio` sinaliza especificamente rate-limit (HTTP 429 — GDELT exige
    >=5s entre requisições do mesmo IP) pro chamador poder avisar o operador
    com uma mensagem acionável, em vez de mostrar "0 alertas" como se a busca
    tivesse rodado normal e não encontrado nada (foi assim que o bloqueio do
    Google passou despercebido antes desta migração).
    """
    def __init__(self, motivo: str, bloqueio: bool = False):
        super().__init__(motivo)
        self.bloqueio = bloqueio


# GDELT pede explicitamente >=1 requisição a cada 5s por IP (senão devolve
# texto simples "Please limit requests..." em vez de JSON, e pode entrar
# num cooldown mais longo se o limite for ignorado repetidas vezes).
# `_throttle_gdelt` garante esse espaçamento entre TODAS as chamadas do
# processo, sequencialmente — por isso uma varredura de muitos alvos fica
# mais lenta (é o preço de uma API gratuita e sem bloqueio de IP).
_GDELT_ULTIMA_CHAMADA = 0.0
_GDELT_INTERVALO_MIN  = 5.2


def _throttle_gdelt() -> None:
    global _GDELT_ULTIMA_CHAMADA
    espera = _GDELT_INTERVALO_MIN - (time.monotonic() - _GDELT_ULTIMA_CHAMADA)
    if espera > 0:
        time.sleep(espera)
    _GDELT_ULTIMA_CHAMADA = time.monotonic()


def _buscar_gdelt(query_alvo: str, max_resultados: int = 5, dias: int | None = None) -> list:
    """
    Busca notícias reais via GDELT DOC 2.0 (https://api.gdeltproject.org) —
    gratuita, sem chave de API, sem cota diária. Cobre uma janela rolante de
    até 3 meses de cobertura global; `dias` limita a busca a esse recorte
    (padrão: WATCHLIST_JANELA_DIAS).
    `query_alvo` já vem pronto e entre aspas — normalmente `_query_gdelt_do_alvo()`
    (frase exata, ou grupo OR de frases quando o alvo tem variantes).
    Retorna lista de dicts: {titulo, resumo, link, fonte, data_pub}.
    GDELT não devolve trecho/resumo do artigo (só metadados) — "resumo" fica
    vazio; a classificação de risco usa o título mesmo.
    Levanta BuscaExternaIndisponivel se a requisição falhar — NUNCA retorna
    lista vazia por falha de rede, pra não ser confundido com "sem resultado".
    """
    _throttle_gdelt()
    janela = min(dias or _janela_dias(), 90)  # DOC 2.0 só cobre ~3 meses

    query = urllib.parse.quote(f'{query_alvo} sourcecountry:brazil sourcelang:portuguese')
    url = (
        "https://api.gdeltproject.org/api/v2/doc/doc"
        f"?query={query}&mode=artlist&maxrecords={max_resultados}"
        f"&timespan={janela}d&format=json&sort=datedesc"
    )
    headers = {"User-Agent": "Mozilla/5.0 (compatible; AgentBastos/1.0)"}
    req     = urllib.request.Request(url, headers=headers)

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            corpo = resp.read()
    except urllib.error.HTTPError as e:
        raise BuscaExternaIndisponivel(f"GDELT HTTP {e.code}", bloqueio=(e.code == 429)) from e
    except Exception as e:
        raise BuscaExternaIndisponivel(f"GDELT {type(e).__name__}: {e}") from e

    texto = corpo.decode("utf-8", errors="replace").strip()
    if not texto.startswith("{"):
        # GDELT devolve texto plano (não JSON) quando o rate-limit é violado
        raise BuscaExternaIndisponivel("GDELT rate-limit (resposta não-JSON)", bloqueio=True)

    try:
        dados = json.loads(texto)
    except json.JSONDecodeError:
        return []  # corpo malformado isolado — trata como zero resultados

    resultados = []
    for art in (dados.get("articles") or [])[:max_resultados]:
        resultados.append({
            "titulo":   (art.get("title") or "").strip(),
            "resumo":   "",
            "link":     art.get("url") or "",
            "fonte":    art.get("domain") or "GDELT",
            "data_pub": art.get("seendate") or "",
        })
    return resultados


# ─── Varredura Tempo Real (Google News) ──────────────────────────────────────

def varrer_realtime(alvo_id: str | None = None) -> dict:
    """
    Busca menções a alvos e vulgos via GDELT (notícias).
    Salva alertas novos no Firestore + fallback local.
    `alvo_id`: se informado, varre só esse alvo/termo (varredura individualizada).
    """
    alvos        = _carregar_alvos(alvo_id)
    alertas_atuais = _ler_alertas(ALERTAS_RT)
    ids_existentes = {a.get("id") for a in alertas_atuais}
    novos          = []
    ia_orcamento   = _IA_MAX_POR_VARREDURA
    buscas_falhas  = 0
    bloqueio_busca = False

    for alvo in alvos:
        query_alvo = _query_gdelt_do_alvo(alvo)
        if not query_alvo:
            continue
        nome_ref = alvo.get("nome") or alvo.get("termo") or ""

        try:
            noticias = _buscar_gdelt(query_alvo, max_resultados=5)
        except BuscaExternaIndisponivel as e:
            buscas_falhas += 1
            if e.bloqueio:
                bloqueio_busca = True
            continue

        for n in noticias:
            id_alerta = _gerar_id(n["link"] + nome_ref)
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
                "termo_encontrado": nome_ref,
                "analise_ia":       None,
            }

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

    # Poda alertas com mais de 90 dias a CADA varredura (mesmo sem novos
    # achados) — sem isso, meses de scan antigo ficam acumulados no cache
    # local até serem empurrados pelo limite de 200 itens, poluindo a tela.
    limpos = _remover_antigos(alertas_atuais)
    if novos or len(limpos) != len(alertas_atuais):
        _salvar_alertas(ALERTAS_RT, (novos + limpos)[:200])
    if novos:
        _hitl_automatico(novos)

    return {
        "ok": True, "novos": len(novos), "alvos_varridos": len(alvos),
        "buscas_falhas": buscas_falhas, "bloqueio_busca": bloqueio_busca,
    }


# ─── Varredura OSINT (cobertura estendida via GDELT) ─────────────────────────
# ANTES: "Google Dork" — montava site:facebook.com/instagram.com/etc mas
# rodava tudo pelo Google News RSS, que ignorava o operador `site:` e só
# devolvia notícia mesmo (achado já registrado antes desta migração — nunca
# pesquisou rede social de verdade). Mantido honesto agora: mesma fonte do
# Tempo Real, mas com janela de cobertura mais ampla (90 dias, o máximo do
# GDELT) — pega menções mais antigas que a varredura de Tempo Real (30 dias)
# deixaria passar.

def varrer_osint(alvo_id: str | None = None) -> dict:
    """
    Busca menções a alvos numa janela mais ampla (90 dias) via GDELT.
    Salva alertas OSINT novos no Firestore + fallback local.
    `alvo_id`: se informado, varre só esse alvo/termo (varredura individualizada).
    """
    alvos           = _carregar_alvos(alvo_id)
    alertas_atuais  = _ler_alertas(ALERTAS_OST)
    ids_existentes  = {a.get("id") for a in alertas_atuais}
    novos           = []
    ia_orcamento    = _IA_MAX_POR_VARREDURA
    buscas_falhas   = 0
    bloqueio_busca  = False

    for alvo in alvos:
        query_alvo = _query_gdelt_do_alvo(alvo)
        if not query_alvo:
            continue
        nome_ref = alvo.get("nome") or alvo.get("termo") or ""

        try:
            noticias = _buscar_gdelt(query_alvo, max_resultados=5, dias=90)
        except BuscaExternaIndisponivel as e:
            buscas_falhas += 1
            if e.bloqueio:
                bloqueio_busca = True
            continue

        for n in noticias:
            id_alerta = _gerar_id(n["link"] + nome_ref + "osint")
            if id_alerta in ids_existentes:
                continue

            alerta = {
                "id":              id_alerta,
                "tipo":            "gdelt",
                "fonte":           n["fonte"],
                "link":            n["link"],
                "titulo":          n["titulo"],
                "resumo":          n["resumo"],
                "risco":           _classificar_risco(n["titulo"], n["resumo"]),
                "timestamp":       datetime.now(timezone.utc).isoformat(),
                "lido":            False,
                "categoria":       "osint",
                "alvo_id":          alvo["id"],
                "alvo_nome":        alvo.get("nome") or alvo.get("termo"),
                "alvo_tipo":        alvo.get("tipo", "pessoa"),
                "termo_encontrado": nome_ref,
                "analise_ia":      None,
            }

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

    # Poda alertas com mais de 90 dias a CADA varredura (mesmo sem novos
    # achados) — sem isso, meses de scan antigo ficam acumulados no cache
    # local até serem empurrados pelo limite de 200 itens, poluindo a tela.
    limpos = _remover_antigos(alertas_atuais)
    if novos or len(limpos) != len(alertas_atuais):
        _salvar_alertas(ALERTAS_OST, (novos + limpos)[:200])
    if novos:
        _hitl_automatico(novos)

    return {
        "ok": True, "novos": len(novos), "alvos_varridos": len(alvos),
        "buscas_falhas": buscas_falhas, "bloqueio_busca": bloqueio_busca,
    }


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
