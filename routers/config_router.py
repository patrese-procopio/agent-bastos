"""
routers/config_router.py
─────────────────────────────────────────────────────────────────────────────
Configurações persistidas no servidor (admin / módulo "configuracoes").

Rotas:
  GET  /config   → ajustes gerais + status (mascarado) das chaves de API
  POST /config   → salva ajustes gerais e/ou chaves de API

Lógica e persistência em services/config_service.py.
"""

from fastapi import APIRouter, Depends
from dependencies import require_module
from services.config_service import (
    ler_gerais,
    salvar_gerais,
    status_chaves,
    salvar_chaves,
)

router = APIRouter(tags=["config"])


@router.get("/config")
def obter_config(user: dict = Depends(require_module("configuracoes"))):
    return {"gerais": ler_gerais(), "chaves": status_chaves()}


@router.post("/config")
def salvar_config(payload: dict, user: dict = Depends(require_module("configuracoes"))):
    gerais = payload.get("gerais") or {}
    chaves = payload.get("chaves") or {}
    gerais_salvas = salvar_gerais(gerais) if gerais else ler_gerais()
    chaves_atualizadas = salvar_chaves(chaves) if chaves else []
    return {
        "ok": True,
        "gerais": gerais_salvas,
        "chaves_atualizadas": chaves_atualizadas,
        "chaves": status_chaves(),
    }
