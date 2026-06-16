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
"""

from fastapi import APIRouter, Depends, Request
from services.alertas_service import (
    ler_alertas,
    salvar_alertas,
    ALERTAS_PATH,
    ALERTAS_OSINT_PATH,
)
from fastapi import BackgroundTasks
from dependencies import get_current_user, require_module
from services.rate_limit_service import limiter, LIMIT_VARREDURA, LIMIT_IA_PESADA
from services.logging_service import get_logger

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
def varrer_alertas_realtime(request: Request, user: dict = Depends(require_module("alertas"))):
    from modules.monitor import varrer_realtime
    _log_audit.info("varrer realtime", extra={"username": user.get("sub")})
    return varrer_realtime()


@router.post("/alertas/osint/varrer")
@limiter.limit(LIMIT_VARREDURA)
def varrer_alertas_osint(request: Request, user: dict = Depends(require_module("osint"))):
    from modules.monitor import varrer_osint
    _log_audit.info("varrer osint", extra={"username": user.get("sub")})
    return varrer_osint()


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
def varrer_alertas_telegram(request: Request, user: dict = Depends(require_module("osint"))):
    """Varre canais públicos do Telegram em busca de menções aos alvos (salva como OSINT)."""
    from modules.telegram_monitor import varrer_telegram
    _log_audit.info("varrer telegram", extra={"username": user.get("sub")})
    return varrer_telegram()


@router.get("/alertas/telegram/status")
def status_alertas_telegram(user: dict = Depends(require_module("osint"))):
    """Verifica se as credenciais/sessão do Telegram estão válidas (sem varrer)."""
    from modules.telegram_monitor import status_telegram
    return status_telegram()