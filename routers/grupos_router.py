"""
routers/grupos_router.py
─────────────────────────────────────────────────────────────────────────────
Ocupação de grupos por unidade/pavilhão, por mês (SQLite local).
Alimenta o Controle de Grupos (edição manual) e o Inteligência de Grupos.

Rotas:
  GET  /grupos/ocupacao?ano_mes=AAAA-MM  → mapa do mês (semeia se não existir)
  POST /grupos/ocupacao                  → salva o grupo de um pavilhão no mês
  GET  /grupos/meses                     → meses com dados (histórico)
  GET  /grupos/kpis                      → série histórica + alertas de variação
  GET  /grupos/catalogo                  → lista de grupos disponíveis
"""

from fastapi import APIRouter, Depends
from dependencies import get_current_user, require_module
from services.grupos_service import (
    ler_ocupacao, salvar_grupo, listar_meses, computar_kpis, GRUPOS_DISPONIVEIS,
)

router = APIRouter(tags=["grupos"])


@router.get("/grupos/ocupacao")
def get_ocupacao(ano_mes: str = None, user: dict = Depends(get_current_user)):
    return ler_ocupacao(ano_mes)


@router.post("/grupos/ocupacao")
def post_ocupacao(payload: dict, user: dict = Depends(require_module("grupos"))):
    return salvar_grupo(
        payload.get("ano_mes"),
        payload.get("unidade"),
        payload.get("pavilhao_id"),
        payload.get("grupo", ""),
    )


@router.get("/grupos/meses")
def get_meses(user: dict = Depends(get_current_user)):
    return {"meses": listar_meses()}


@router.get("/grupos/kpis")
def get_kpis(user: dict = Depends(get_current_user)):
    return computar_kpis()


@router.get("/grupos/catalogo")
def get_catalogo(user: dict = Depends(get_current_user)):
    return {"grupos": GRUPOS_DISPONIVEIS}
