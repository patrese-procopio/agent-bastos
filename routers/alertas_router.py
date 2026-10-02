"""
routers/alertas_router.py
─────────────────────────────────────────────────────────────────────────────
Rotas HTTP do domínio de Alertas.

Padrão de arquitetura:
  - Este arquivo só conhece FastAPI (Request, Response, APIRouter).
  - Lógica de negócio e persistência ficam em services/alertas_service.py.
  - Acesso ao Firestore fica centralizado no api.py via _get_firestore()
    e _serializar_alerta() — por enquanto importados de lá até extrairmos
    um firestore_service.py em passo futuro.

Rotas registradas:
  GET    /alertas
  GET    /alertas/osint
  POST   /alertas/salvar
  POST   /alertas/osint/salvar
  PATCH  /alertas/{alerta_id}/lido
  PATCH  /alertas/marcar-todos-lidos
  POST   /alertas/varrer
  POST   /alertas/osint/varrer
  POST   /alertas/analisar-pendentes
  POST   /alertas/telegram/varrer
  GET    /alertas/telegram/status
  GET    /alertas/alvos
  POST   /alertas/alvos
  PATCH  /alertas/alvos/{alvo_id}/variantes
  DELETE /alertas/alvos/{alvo_id}
"""

from fastapi import APIRouter, Depends, Request, HTTPException
from services.alertas_service import (
    ler_alertas,
    salvar_alertas,
    ALERTAS_PATH,
    ALERTAS_OSINT_PATH,
)
from fastapi import BackgroundTasks
from dependencies import get_current_user, require_module, require_module_or_scheduler
from services.rate_limit_service import limiter, LIMIT_VARREDURA, LIMIT_IA_PESADA, LIMIT_ESCRITA
from services.logging_service import get_logger
import services.alvos_service as alvos_service

_log_audit = get_logger("audit.alertas")

router = APIRouter(tags=["alertas"])

# ── Correlação automática: importação opcional ────────────────────────────────
try:
    from services.correlacao_engine import correlacionar_texto as _correlacionar
    _CORRELACAO_OK = True
except ImportError:
    _CORRELACAO_OK = False


# ─── Helpers Firestore ────────────────────────────────────────────────────────

def _get_firestore_safe():
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore as _fs
        import os
        sa_key = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "serviceAccountKey.json",
        )
        if not firebase_admin._apps:
            cred = credentials.Certificate(sa_key)
            firebase_admin.initialize_app(cred)
        return _fs.client()
    except Exception:
        return None


def _serializar(doc) -> dict:
    d       = doc.to_dict()
    d["id"] = doc.id
    ts      = d.get("timestamp")
    if ts and hasattr(ts, "isoformat"):
        d["timestamp"] = ts.isoformat()
    elif ts:
        d["timestamp"] = str(ts)
    return d


# ─── Rotas ───────────────────────────────────────────────────────────────────

@router.get("/alertas")
def listar_alertas(limite: int = 50, user: dict = Depends(get_current_user)):
    try:
        db   = _get_firestore_safe()
        docs = (
            db.collection("alertas")
            .where("categoria", "==", "realtime")
            .order_by("timestamp", direction="DESCENDING")
            .limit(limite)
            .stream()
        )
        return [_serializar(d) for d in docs]
    except Exception:
        return ler_alertas(ALERTAS_PATH)


@router.get("/alertas/osint")
def listar_alertas_osint(limite: int = 50, user: dict = Depends(get_current_user)):
    try:
        db   = _get_firestore_safe()
        docs = (
            db.collection("alertas")
            .where("categoria", "==", "osint")
            .order_by("timestamp", direction="DESCENDING")
            .limit(limite)
            .stream()
        )
        return [_serializar(d) for d in docs]
    except Exception:
        return ler_alertas(ALERTAS_OSINT_PATH)


@router.post("/alertas/salvar")
async def salvar_alerta(alerta: dict,
                        background_tasks: BackgroundTasks = BackgroundTasks(),
                        user: dict = Depends(require_module("alertas"))):
    alertas = ler_alertas(ALERTAS_PATH)
    ids     = {a.get("id") for a in alertas}
    novo    = alerta.get("id") not in ids
    if novo:
        alertas.insert(0, alerta)
    salvar_alertas(ALERTAS_PATH, alertas)
    # ── Correlação apenas em alertas novos ────────────────────────────────────
    if _CORRELACAO_OK and novo:
        texto = " ".join(filter(None, [
            alerta.get("titulo", ""), alerta.get("descricao", ""),
            alerta.get("conteudo", ""), alerta.get("texto", ""),
        ]))
        if texto.strip():
            background_tasks.add_task(
                _correlacionar,
                texto=texto,
                fonte_tipo="alerta",
                fonte_id=str(alerta.get("id", "sem-id")),
                metadados={"summary": alerta.get("titulo", "")[:200], "risco": "ALTO"},
                operador=user.get("sub", "sistema"),
            )
    return {"status": "salvo", "total": len(alertas)}


@router.post("/alertas/osint/salvar")
async def salvar_alerta_osint(alerta: dict, user: dict = Depends(require_module("alertas"))):
    alertas = ler_alertas(ALERTAS_OSINT_PATH)
    ids     = {a.get("id") for a in alertas}
    if alerta.get("id") not in ids:
        alertas.insert(0, alerta)
    salvar_alertas(ALERTAS_OSINT_PATH, alertas)
    return {"status": "salvo", "total": len(alertas)}


@router.patch("/alertas/{alerta_id}/lido")
def marcar_alerta_lido(alerta_id: str, user: dict = Depends(get_current_user)):
    try:
        db = _get_firestore_safe()
        db.collection("alertas").document(alerta_id).update({"lido": True})
        return {"ok": True}
    except Exception:
        for caminho in (ALERTAS_PATH, ALERTAS_OSINT_PATH):
            alertas = ler_alertas(caminho)
            for a in alertas:
                if a.get("id") == alerta_id:
                    a["lido"] = True
            salvar_alertas(caminho, alertas)
        return {"ok": True, "id": alerta_id}


@router.patch("/alertas/marcar-todos-lidos")
def marcar_todos_lidos(user: dict = Depends(require_module("alertas"))):
    try:
        db        = _get_firestore_safe()
        nao_lidos = db.collection("alertas").where("lido", "==", False).stream()
        batch     = db.batch()
        for doc in nao_lidos:
            batch.update(doc.reference, {"lido": True})
        batch.commit()
        return {"ok": True}
    except Exception:
        for caminho in (ALERTAS_PATH, ALERTAS_OSINT_PATH):
            alertas = ler_alertas(caminho)
            for a in alertas:
                a["lido"] = True
            salvar_alertas(caminho, alertas)
        return {"ok": True}


@router.post("/alertas/varrer")
@limiter.limit(LIMIT_VARREDURA)
def varrer_alertas_realtime(request: Request, alvo_id: str | None = None,
                             user: dict = Depends(require_module_or_scheduler("alertas"))):
    from modules.monitor import varrer_realtime
    _log_audit.info("varrer realtime", extra={"username": user.get("sub"), "alvo_id": alvo_id})
    return varrer_realtime(alvo_id=alvo_id)


@router.post("/alertas/osint/varrer")
@limiter.limit(LIMIT_VARREDURA)
def varrer_alertas_osint(request: Request, alvo_id: str | None = None,
                          user: dict = Depends(require_module_or_scheduler("osint"))):
    from modules.monitor import varrer_osint
    _log_audit.info("varrer osint", extra={"username": user.get("sub"), "alvo_id": alvo_id})
    return varrer_osint(alvo_id=alvo_id)


@router.post("/alertas/analisar-pendentes")
@limiter.limit(LIMIT_IA_PESADA)
def analisar_alertas_pendentes(request: Request, limite: int = 20,
                                user: dict = Depends(require_module("alertas"))):
    """Aplica análise por IA em alertas existentes sem analise_ia."""
    from modules.monitor import analisar_pendentes
    _log_audit.info("analisar pendentes", extra={"username": user.get("sub"), "limite": limite})
    return analisar_pendentes(limite)


@router.post("/alertas/telegram/varrer")
@limiter.limit(LIMIT_VARREDURA)
def varrer_alertas_telegram(request: Request, alvo_id: str | None = None,
                             user: dict = Depends(require_module_or_scheduler("osint"))):
    """Varre canais públicos do Telegram em busca de menções aos alvos (salva como OSINT)."""
    from modules.telegram_monitor import varrer_telegram
    _log_audit.info("varrer telegram", extra={"username": user.get("sub"), "alvo_id": alvo_id})
    return varrer_telegram(alvo_id=alvo_id)


@router.get("/alertas/telegram/status")
def status_alertas_telegram(user: dict = Depends(require_module("osint"))):
    """Verifica se as credenciais/sessão do Telegram estão válidas (sem varrer)."""
    from modules.telegram_monitor import status_telegram
    return status_telegram()


# ─── Watchlist de alvos/termos (CRUD) ─────────────────────────────────────────
# Alimenta as 3 varreduras acima (Tempo Real, OSINT/Dork, Telegram) a partir do
# mesmo data/alvos.json. Antes só era editável direto no arquivo pelo backend;
# agora qualquer agente com acesso ao módulo "alertas" cadastra/remove pela tela
# (ex: dar baixa num alvo que foi preso, morreu ou saiu da facção).

@router.get("/alertas/alvos")
def listar_alvos(user: dict = Depends(require_module("alertas"))):
    return alvos_service.listar_alvos()


@router.post("/alertas/alvos")
@limiter.limit(LIMIT_ESCRITA)
def criar_alvo(request: Request, payload: dict, user: dict = Depends(require_module("alertas"))):
    try:
        novo = alvos_service.criar_alvo(
            tipo=payload.get("tipo", "pessoa"),
            nome=payload.get("nome", ""),
            termo=payload.get("termo", ""),
            vulgos=payload.get("vulgos") or [],
            descricao=payload.get("descricao", ""),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    _log_audit.info("alvo criado", extra={"username": user.get("sub"), "alvo": novo})
    return novo


@router.patch("/alertas/alvos/{alvo_id}/variantes")
@limiter.limit(LIMIT_ESCRITA)
def editar_variantes_alvo(request: Request, alvo_id: str, payload: dict, user: dict = Depends(require_module("alertas"))):
    """
    Atualiza a lista de variantes/sinônimos de um termo já cadastrado (ex:
    CV-AM ganha "CVAM", "CV/AM", "Comando Vermelho do Amazonas") sem recriar
    o alvo — preserva o alvo_id e o histórico de alertas já vinculados a ele.
    """
    try:
        atualizado = alvos_service.editar_variantes(alvo_id, payload.get("variantes") or [])
    except ValueError as e:
        status = 404 if "não encontrado" in str(e) else 400
        raise HTTPException(status_code=status, detail=str(e))
    _log_audit.info("variantes de alvo atualizadas", extra={"username": user.get("sub"), "alvo": atualizado})
    return atualizado


@router.delete("/alertas/alvos/{alvo_id}")
@limiter.limit(LIMIT_ESCRITA)
def remover_alvo(request: Request, alvo_id: str, user: dict = Depends(require_module("alertas"))):
    ok = alvos_service.remover_alvo(alvo_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Alvo não encontrado")
    _log_audit.info("alvo removido", extra={"username": user.get("sub"), "alvo_id": alvo_id})
    return {"ok": True, "id": alvo_id}


# ─── Resolucao de redirect de links do Google News ────────────────────────────
# Links do OSINT sao do Google News RSS (news.google.com/rss/articles/...)
# que quando abertos direto no navegador precisam resolver via JS o redirect
# real. Google identifica isso como "requisicao automatizada" e bloqueia com
# a pagina "We're sorry" apos algumas chamadas. Solucao: resolver o redirect
# no backend (que aceita follow_redirects) e retornar a URL final. O
# frontend abre essa URL direto no navegador do sistema.
_LINK_CACHE: dict[str, str] = {}   # cache in-memory pra evitar re-resolver

@router.get("/alertas/resolver-link")
def resolver_link_externo(url: str, titulo: str = "",
                          user: dict = Depends(require_module("alertas"))):
    """
    Resolve URLs do Google News em ETAPAS, ate uma dar certo:

      1. Tenta decodificar via `googlenewsdecoder` (extrai o URL final do
         payload protobuf sem depender de request pro Google)
      2. Tenta seguir redirect HTTP (httpx follow_redirects)
      3. Fallback: retorna uma URL de busca do Google Search pelo TITULO da
         materia. O operador acha o link real no primeiro resultado.

    Sem essa cadeia, o link do Google News RSS abre no Chrome/Edge e cai na
    tela "We're sorry — automated queries" porque o Google detecta o padrao
    de acesso a URLs de RSS como bot.

    URLs que nao sao do Google News passam direto (nao viramos proxy aberto).
    """
    url = (url or "").strip()
    titulo = (titulo or "").strip()
    if not url.startswith(("http://", "https://")):
        return {"url": url, "resolvido": False, "motivo": "url_invalida"}

    e_google_news = "news.google.com" in url or "google.com/url?" in url
    if not e_google_news:
        return {"url": url, "resolvido": False, "motivo": "nao_precisa"}

    if url in _LINK_CACHE:
        return {"url": _LINK_CACHE[url], "resolvido": True, "cache": True}

    # ── Etapa 1: googlenewsdecoder (sem chamar Google diretamente) ───────────
    try:
        from googlenewsdecoder import gnewsdecoder
        r = gnewsdecoder(url)
        final = (r or {}).get("decoded_url")
        if final and final.startswith("http") and "news.google.com" not in final:
            _LINK_CACHE[url] = final
            if len(_LINK_CACHE) > 500:
                _LINK_CACHE.pop(next(iter(_LINK_CACHE)))
            return {"url": final, "resolvido": True, "metodo": "decoder"}
    except Exception:
        pass

    # ── Etapa 2: follow-redirects HTTP ───────────────────────────────────────
    try:
        import httpx
        UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        with httpx.Client(follow_redirects=True, timeout=8.0,
                          headers={"User-Agent": UA}) as c:
            r = c.get(url)
            final = str(r.url)
        if final and "news.google.com" not in final and final != url:
            _LINK_CACHE[url] = final
            if len(_LINK_CACHE) > 500:
                _LINK_CACHE.pop(next(iter(_LINK_CACHE)))
            return {"url": final, "resolvido": True, "metodo": "http"}
    except Exception:
        pass

    # ── Etapa 3: fallback — busca no Google pelo titulo ──────────────────────
    if titulo:
        from urllib.parse import quote
        # Aspas em volta do titulo restringem a busca — Google Search NAO
        # e bloqueado (so o Google News RSS/articles esta).
        busca = f'https://www.google.com/search?q={quote(titulo[:120])}'
        return {"url": busca, "resolvido": False, "metodo": "busca_titulo",
                "aviso": "Nao foi possivel resolver o link; abrindo busca no Google."}

    return {"url": url, "resolvido": False, "metodo": "nao_resolvido"}