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

from fastapi import APIRouter, Depends
from services.alertas_service import (
    ler_alertas,
    salvar_alertas,
    ALERTAS_PATH,
    ALERTAS_OSINT_PATH,
)
from dependencies import get_current_user, require_module

router = APIRouter(tags=["alertas"])


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
async def salvar_alerta(alerta: dict, user: dict = Depends(require_module("alertas"))):
    alertas = ler_alertas(ALERTAS_PATH)
    ids     = {a.get("id") for a in alertas}
    if alerta.get("id") not in ids:
        alertas.insert(0, alerta)
    salvar_alertas(ALERTAS_PATH, alertas)
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
def varrer_alertas_realtime(user: dict = Depends(require_module("alertas"))):
    from modules.monitor import varrer_realtime
    return varrer_realtime()


@router.post("/alertas/osint/varrer")
def varrer_alertas_osint(user: dict = Depends(require_module("osint"))):
    from modules.monitor import varrer_osint
    return varrer_osint()


@router.post("/alertas/analisar-pendentes")
def analisar_alertas_pendentes(limite: int = 20, user: dict = Depends(require_module("alertas"))):
    """Aplica análise por IA em alertas existentes sem analise_ia."""
    from modules.monitor import analisar_pendentes
    return analisar_pendentes(limite)


@router.post("/alertas/telegram/varrer")
def varrer_alertas_telegram(user: dict = Depends(require_module("osint"))):
    """Varre canais públicos do Telegram em busca de menções aos alvos (salva como OSINT)."""
    from modules.telegram_monitor import varrer_telegram
    return varrer_telegram()


@router.get("/alertas/telegram/status")
def status_alertas_telegram(user: dict = Depends(require_module("osint"))):
    """Verifica se as credenciais/sessão do Telegram estão válidas (sem varrer)."""
    from modules.telegram_monitor import status_telegram
    return status_telegram()