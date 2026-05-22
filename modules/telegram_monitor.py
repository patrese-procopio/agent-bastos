# -*- coding: utf-8 -*-
"""
telegram_monitor.py — Monitor OSINT via Telegram (Telethon)
Agent Bastos | AIPEN

Varre canais/grupos públicos do Telegram em busca de menções aos alvos
(nome + vulgos) e salva os achados como alertas OSINT (mesma coleção/arquivo
que a varredura de Google Dork, categoria "osint").

Autenticação: usa uma StringSession gerada UMA única vez por
scripts/telegram_login.py e guardada em .env (TELEGRAM_SESSION) — a varredura
roda de forma totalmente não-interativa.

Chamado pelo endpoint:
  POST /alertas/telegram/varrer → varrer_telegram()
"""

import os
import re
import json
import asyncio
from datetime import datetime, timezone
from urllib.parse import urlparse, unquote

# Reaproveita os helpers já testados da varredura de notícias/dork
from modules.monitor import (
    _carregar_alvos,
    _ler_alertas,
    _salvar_alertas,
    _gerar_id,
    _classificar_risco,
    _analisar_ia,
    _salvar_firestore,
    ALERTAS_OST,
    _IA_MAX_POR_VARREDURA,
)

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CANAIS_PATH = os.path.join(BASE_DIR, "data", "telegram_canais.json")

# Limites para controlar custo/tempo e evitar FloodWait do Telegram
_TG_POR_TERMO        = 5    # máx de mensagens por (canal × alvo nominado)
_TG_GLOBAL_POR_TERMO = 2    # máx de mensagens por (canal × termo de facção)
_TG_MAX_BUSCAS       = 300  # teto de buscas por varredura
_TG_PAUSA_SEG        = 0.4  # respiro entre buscas

# Rótulo do "alvo" sintético usado nos alertas de contexto (busca por termo de facção)
_TEMA_FACCAO = "CV-AM / Crime Organizado"


# ─── Config de canais ─────────────────────────────────────────────────────────

def _carregar_config_canais() -> dict:
    """Lê a lista curada de canais públicos a monitorar. Estrutura tolerante a faltas."""
    if not os.path.exists(CANAIS_PATH):
        return {"canais": [], "descobrir_automatico": False, "termos_globais": []}
    try:
        with open(CANAIS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):           # aceita também um array simples de canais
            return {"canais": data, "descobrir_automatico": False, "termos_globais": []}
        data.setdefault("canais", [])
        data.setdefault("descobrir_automatico", False)
        data.setdefault("termos_globais", [])
        return data
    except Exception:
        return {"canais": [], "descobrir_automatico": False, "termos_globais": []}


def _creds() -> tuple | None:
    """Retorna (api_id:int, api_hash:str, session:str) ou None se incompleto."""
    from config.settings import TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION
    if not (TELEGRAM_API_ID and TELEGRAM_API_HASH and TELEGRAM_SESSION):
        return None
    try:
        return int(str(TELEGRAM_API_ID).strip()), str(TELEGRAM_API_HASH).strip(), str(TELEGRAM_SESSION).strip()
    except ValueError:
        return None


# ─── Extração de título legível ───────────────────────────────────────────────

_URL_RE = re.compile(r"https?://\S+")


def _slug_para_titulo(url: str) -> str:
    """Deriva um título legível do último segmento textual do caminho da URL."""
    try:
        partes = [unquote(s) for s in urlparse(url).path.split("/") if s]
    except Exception:
        return ""
    for seg in reversed(partes):
        seg = re.sub(r"\.(html?|php|aspx?)$", "", seg, flags=re.I)
        if len(re.sub(r"[^0-9A-Za-zÀ-ÿ]", "", seg)) >= 4:   # ignora ids numéricos/curtos
            t = re.sub(r"[-_]+", " ", seg).strip()
            return (t[:1].upper() + t[1:])[:120]
    return ""


def _extrair_titulo(texto: str, canal_label: str) -> str:
    """
    Primeira linha com texto real (ignora linhas só de emoji/pontuação/URL).
    Se a mensagem for só um link, deriva o título do slug da URL.
    """
    for linha in texto.split("\n"):
        s = _URL_RE.sub("", linha)               # remove URLs
        s = re.sub(r"^[\W_]+", "", s)             # tira emoji/pontuação/asteriscos do início
        s = re.sub(r"\s+", " ", s).strip()
        if len(re.sub(r"[^0-9A-Za-zÀ-ÿ]", "", s)) >= 3:
            return s[:120]
    m = _URL_RE.search(texto)
    if m:
        slug = _slug_para_titulo(m.group(0))
        if slug:
            return slug
    return f"Mensagem em {canal_label}"


# ─── Montagem de alerta a partir de uma mensagem ──────────────────────────────

def _alerta_de_mensagem(msg, canal_label: str, username: str | None,
                        alvo: dict, termo: str) -> dict | None:
    texto = (getattr(msg, "message", None) or "").strip()
    if not texto:
        return None
    resumo  = texto[:400]
    titulo  = _extrair_titulo(texto, canal_label)
    link    = f"https://t.me/{username}/{msg.id}" if username else ""
    data_pub = msg.date.isoformat() if getattr(msg, "date", None) else ""

    return {
        "id":              _gerar_id(f"tg:{canal_label}:{msg.id}:{termo}"),
        "tipo":            "telegram",
        "fonte":           f"Telegram — {canal_label}",
        "link":            link,
        "titulo":          titulo,
        "resumo":          resumo,
        "risco":           _classificar_risco(titulo, resumo),
        "timestamp":       datetime.now(timezone.utc).isoformat(),
        "data_pub":        data_pub,
        "lido":            False,
        "categoria":       "osint",
        "alvo_id":         alvo.get("id"),
        "alvo_nome":       alvo.get("nome"),
        "alvo_vulgos":     alvo.get("vulgos", []),
        "termo_encontrado": termo,
        "plataforma":      "Telegram",
        "canal":           canal_label,
        "analise_ia":      None,
    }


# ─── Núcleo assíncrono ────────────────────────────────────────────────────────

async def _varrer_async(api_id: int, api_hash: str, session: str) -> dict:
    from telethon import TelegramClient
    from telethon.sessions import StringSession
    from telethon.errors import FloodWaitError

    alvos          = _carregar_alvos()
    cfg            = _carregar_config_canais()
    canais         = [c for c in cfg.get("canais", []) if c]
    termos_globais = [t for t in cfg.get("termos_globais", []) if t]
    alvo_tema      = {"id": None, "nome": _TEMA_FACCAO, "vulgos": []}

    alertas_atuais = _ler_alertas(ALERTAS_OST)
    ids_existentes = {a.get("id") for a in alertas_atuais}
    novos          = []
    estado         = {"ia": _IA_MAX_POR_VARREDURA, "buscas": 0}
    canais_ok      = 0
    erros          = []

    client = TelegramClient(StringSession(session), api_id, api_hash)
    await client.connect()
    try:
        if not await client.is_user_authorized():
            return {"ok": False, "erro": "sessao_invalida",
                    "detalhe": "Sessão Telegram inválida/expirada — rode scripts/telegram_login.py"}

        async def processar(entity, label, username, alvo, termo, por_termo):
            """Busca um termo num canal, monta/analisa/salva alertas novos. Re-raise em FloodWait."""
            if estado["buscas"] >= _TG_MAX_BUSCAS:
                return
            estado["buscas"] += 1
            try:
                async for msg in client.iter_messages(entity, search=termo, limit=por_termo):
                    alerta = _alerta_de_mensagem(msg, label, username, alvo, termo)
                    if not alerta or alerta["id"] in ids_existentes:
                        continue
                    if estado["ia"] > 0:
                        ia = _analisar_ia(alerta["titulo"], alerta["resumo"], alvo.get("nome", ""))
                        if ia:
                            if ia["risco"]:
                                alerta["risco"] = ia["risco"]
                            alerta["analise_ia"] = ia["analise"]
                            estado["ia"] -= 1
                    _salvar_firestore(alerta)
                    novos.append(alerta)
                    ids_existentes.add(alerta["id"])
            except FloodWaitError:
                raise
            except Exception as e:
                erros.append(f"{label}/{termo}: {type(e).__name__}")
            await asyncio.sleep(_TG_PAUSA_SEG)

        # Descoberta opcional: encontra canais públicos cujo nome/título casa com o alvo
        if cfg.get("descobrir_automatico"):
            descobertos = await _descobrir_canais(client, alvos)
            for d in descobertos:
                if d not in canais:
                    canais.append(d)

        for canal in canais:
            try:
                entity = await client.get_entity(canal)
            except Exception as e:
                erros.append(f"{canal}: {type(e).__name__}")
                continue

            canais_ok += 1
            username   = getattr(entity, "username", None)
            label      = getattr(entity, "title", None) or username or str(canal)

            # 1) Menções a alvos nominados (nome + vulgos)
            for alvo in alvos:
                if estado["buscas"] >= _TG_MAX_BUSCAS:
                    break
                for termo in [alvo.get("nome", "")] + alvo.get("vulgos", []):
                    if not termo or estado["buscas"] >= _TG_MAX_BUSCAS:
                        continue
                    await processar(entity, label, username, alvo, termo, _TG_POR_TERMO)

            # 2) Contexto de facção / crime organizado (termos globais)
            for termo in termos_globais:
                if estado["buscas"] >= _TG_MAX_BUSCAS:
                    break
                await processar(entity, label, username, alvo_tema, termo, _TG_GLOBAL_POR_TERMO)

            if estado["buscas"] >= _TG_MAX_BUSCAS:
                break
    except FloodWaitError as e:
        erros.append(f"flood_wait:{e.seconds}s")
    finally:
        await client.disconnect()

    if novos:
        _salvar_alertas(ALERTAS_OST, (novos + alertas_atuais)[:200])

    return {
        "ok": True,
        "novos": len(novos),
        "canais_varridos": canais_ok,
        "buscas": estado["buscas"],
        "alvos": len(alvos),
        "termos_globais": len(termos_globais),
        "erros": erros[:20],
    }


async def _descobrir_canais(client, alvos: list) -> list:
    """Busca pública por nome do alvo → retorna usernames de canais/grupos encontrados."""
    from telethon import functions
    achados = set()
    for alvo in alvos:
        nome = alvo.get("nome", "").strip()
        if not nome:
            continue
        try:
            res = await client(functions.contacts.SearchRequest(q=nome, limit=5))
            for chat in getattr(res, "chats", []):
                uname = getattr(chat, "username", None)
                if uname:
                    achados.add(uname)
        except Exception:
            continue
        await asyncio.sleep(_TG_PAUSA_SEG)
        if len(achados) >= 20:
            break
    return list(achados)


# ─── Entrada síncrona (chamada pelo router FastAPI) ───────────────────────────

def varrer_telegram() -> dict:
    """
    Varre o Telegram em busca de menções aos alvos e salva alertas OSINT.
    Wrapper síncrono — roda o núcleo async num event loop próprio.
    """
    creds = _creds()
    if not creds:
        return {"ok": False, "erro": "sem_credenciais",
                "detalhe": "Defina TELEGRAM_API_ID, TELEGRAM_API_HASH e TELEGRAM_SESSION no .env "
                           "(gere a session com scripts/telegram_login.py)"}
    api_id, api_hash, session = creds
    try:
        return asyncio.run(_varrer_async(api_id, api_hash, session))
    except Exception as e:
        return {"ok": False, "erro": "falha", "detalhe": f"{type(e).__name__}: {e}"}


def status_telegram() -> dict:
    """Verifica credenciais + validade da sessão (sem varrer)."""
    creds = _creds()
    if not creds:
        return {"ok": False, "configurado": False,
                "detalhe": "Credenciais ausentes ou inválidas no .env"}
    api_id, api_hash, session = creds

    async def _check():
        from telethon import TelegramClient
        from telethon.sessions import StringSession
        client = TelegramClient(StringSession(session), api_id, api_hash)
        await client.connect()
        try:
            if not await client.is_user_authorized():
                return {"ok": False, "configurado": True, "sessao_valida": False,
                        "detalhe": "Sessão expirada — rode scripts/telegram_login.py"}
            me = await client.get_me()
            return {"ok": True, "configurado": True, "sessao_valida": True,
                    "conta": getattr(me, "username", None) or getattr(me, "first_name", None)}
        finally:
            await client.disconnect()

    try:
        return asyncio.run(_check())
    except Exception as e:
        return {"ok": False, "configurado": True, "detalhe": f"{type(e).__name__}: {e}"}


if __name__ == "__main__":
    print("Status Telegram:", json.dumps(status_telegram(), ensure_ascii=False))
    print("Varredura:", json.dumps(varrer_telegram(), ensure_ascii=False))
