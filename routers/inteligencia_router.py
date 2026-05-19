"""
routers/inteligencia_router.py
─────────────────────────────────────────────────────────────────────────────
Rotas HTTP de Inteligência de Grupos — ocupação, snapshots, KPIs e histórico.

Rotas registradas:
  GET  /ocupacao              → dados atuais de ocupação por unidade (Drive)
  GET  /historico/indice      → lista de meses com snapshot disponível
  GET  /historico/{mes}       → snapshot de um mês específico
  GET  /kpis                  → série histórica + alertas de variação ≥20%
  POST /snapshot/forcar       → força geração do snapshot do mês atual
  GET  /debug/drive           → lista arquivos na pasta de histórico do Drive
  GET  /debug/snapshot-erro   → testa geração de snapshot e retorna traceback
"""

import json
import os
import traceback
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends

from services.drive_service import (
    upload_json   as _upload_json_drive,
    download_json as _baixar_json_drive,
    get_service   as _gdrive_service,
)
from dependencies import get_current_user, require_module

router = APIRouter(tags=["inteligencia"])

# ─── Constantes ──────────────────────────────────────────────────────────────

BASE_DIR             = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_HISTORICO_FOLDER_ID = "1-hQE2t9P7Kpk31V5oKCUoylM03nCNhT_"
_SNAPSHOTS_DIR       = os.path.join(BASE_DIR, "data", "snapshots")
os.makedirs(_SNAPSHOTS_DIR, exist_ok=True)


# ─── Helper: dados de ocupação ────────────────────────────────────────────────

def _baixar_ocupacao_drive():
    try:
        import importlib
        api_mod = importlib.import_module("api")
        fn = getattr(api_mod, "_baixar_ocupacao_drive", None)
        if fn:
            return fn()
    except Exception:
        pass
    return {"unidades": {}, "aviso": "_baixar_ocupacao_drive nao encontrada"}


# ─── Helper: série de KPIs ────────────────────────────────────────────────────

def _computar_series_kpis(meses_snaps: list) -> dict:
    series = {}
    for item in meses_snaps:
        mes      = item["mes"]
        contagem = {}
        for u_dados in item.get("dados", {}).get("unidades", {}).values():
            for p in (u_dados.get("pavilhoes") or u_dados.get("pavs") or {}).values():
                g = p.get("grupo") or p.get("g", "")
                if g:
                    contagem[g] = contagem.get(g, 0) + 1
        series[mes] = contagem

    alertas    = []
    meses_list = sorted(series.keys())
    if len(meses_list) >= 2:
        atual    = series[meses_list[-1]]
        anterior = series[meses_list[-2]]
        for grupo, qtd in atual.items():
            qtd_ant = anterior.get(grupo, 0)
            if qtd_ant > 0:
                variacao = ((qtd - qtd_ant) / qtd_ant) * 100
                if abs(variacao) >= 20:
                    alertas.append({
                        "grupo":    grupo,
                        "variacao": round(variacao, 1),
                        "atual":    qtd,
                        "anterior": qtd_ant,
                    })
    return {"series": series, "alertas": alertas, "meses": meses_list}


# ─── Rotas ───────────────────────────────────────────────────────────────────

@router.get("/ocupacao")
def get_ocupacao(user: dict = Depends(require_module("inteligencia_grupos"))):
    try:
        return _baixar_ocupacao_drive()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/historico/indice")
def get_indice(user: dict = Depends(require_module("inteligencia_grupos"))):
    try:
        indice = _baixar_json_drive("indice.json", _HISTORICO_FOLDER_ID)
        return indice or {"meses": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/historico/{mes}")
def get_historico_mes(mes: str, user: dict = Depends(require_module("inteligencia_grupos"))):
    try:
        snap = _baixar_json_drive(f"snapshot_{mes}.json", _HISTORICO_FOLDER_ID)
        if not snap:
            raise HTTPException(status_code=404, detail=f"Snapshot {mes} nao encontrado")
        return snap
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/kpis")
def get_kpis(user: dict = Depends(require_module("inteligencia_grupos"))):
    try:
        indice    = _baixar_json_drive("indice.json", _HISTORICO_FOLDER_ID) or {"meses": []}
        meses     = sorted(indice.get("meses", []))
        historico = []
        for mes in meses[-6:]:
            snap = _baixar_json_drive(f"snapshot_{mes}.json", _HISTORICO_FOLDER_ID)
            if snap:
                historico.append({"mes": mes, "dados": snap.get("dados", {})})
        return _computar_series_kpis(historico)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/snapshot/forcar")
def forcar_snapshot(user: dict = Depends(require_module("inteligencia_grupos"))):
    try:
        mes_atual = datetime.now().strftime("%Y-%m")
        ocupacao  = _baixar_ocupacao_drive()
        snapshot  = {"mes": mes_atual, "gerado_em": datetime.now().isoformat(), "dados": ocupacao}
        _upload_json_drive(f"snapshot_{mes_atual}.json", snapshot, _HISTORICO_FOLDER_ID)
        indice = _baixar_json_drive("indice.json", _HISTORICO_FOLDER_ID) or {"meses": []}
        if mes_atual not in indice["meses"]:
            indice["meses"].append(mes_atual)
            indice["meses"].sort()
        _upload_json_drive("indice.json", indice, _HISTORICO_FOLDER_ID)
        return {"ok": True, "mes": mes_atual}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/debug/drive")
def debug_drive(user: dict = Depends(require_module("inteligencia_grupos"))):
    try:
        service = _gdrive_service()
        results = service.files().list(
            q=f"'{_HISTORICO_FOLDER_ID}' in parents and trashed=false",
            fields="files(id, name)",
        ).execute()
        return {"ok": True, "arquivos": results.get("files", [])}
    except Exception as e:
        return {"ok": False, "erro": str(e), "trace": traceback.format_exc()}


@router.get("/debug/snapshot-erro")
def debug_snapshot_erro(user: dict = Depends(require_module("inteligencia_grupos"))):
    try:
        mes_atual = datetime.now().strftime("%Y-%m")
        ocupacao  = _baixar_ocupacao_drive()
        snapshot  = {"mes": mes_atual, "gerado_em": datetime.now().isoformat(), "dados": ocupacao}
        _upload_json_drive(f"snapshot_{mes_atual}.json", snapshot, _HISTORICO_FOLDER_ID)
        return {"ok": True, "mes": mes_atual}
    except Exception as e:
        return {"ok": False, "erro": str(e), "trace": traceback.format_exc()}