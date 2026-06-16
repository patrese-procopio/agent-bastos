# -*- coding: utf-8 -*-
"""
routers/risco_score_router.py — Score de Risco Dinâmico (Missão 28)
─────────────────────────────────────────────────────────────────────────────
Endpoints:
  GET /api/risco/scores              → ranking de entidades por score (admin)
  GET /api/risco/scores/{entidade_id} → detalhe + histórico de eventos (admin)

Por que separar em router?
  Segue o padrão do projeto (um router por domínio funcional).
  Permite que o frontend exiba um painel de "Radar de Risco" sem tocar
  nos endpoints existentes de alertas ou lideranças.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from dependencies import require_module
from services import risco_score_service as _rs

router = APIRouter(prefix="/risco", tags=["risco-score"])


@router.get("/scores", summary="Ranking de risco dinâmico das entidades (admin)")
def listar_scores(
    min_score: float = 0.0,
    limite:    int   = 50,
    user: dict = Depends(require_module("admin")),
):
    """
    Retorna todas as entidades com score_atual >= min_score,
    ordenadas do mais perigoso para o menos.

    O score já vem com decaimento exponencial aplicado — entidades sem
    atividade recente aparecem com scores menores do que no momento
    do último evento.

    Query params:
      min_score : filtrar apenas entidades acima deste valor (padrão: 0)
      limite    : máximo de resultados (padrão: 50)
    """
    scores = _rs.listar_scores(min_score=min_score, limite=limite)
    return {
        "scores": scores,
        "total":  len(scores),
        "fator_decaimento": _rs._FATOR_DECAIMENTO,
    }


@router.get("/scores/{entidade_id}", summary="Score e histórico de uma entidade (admin)")
def obter_score(
    entidade_id: str,
    user: dict = Depends(require_module("admin")),
):
    """
    Retorna o score atual (com decaimento) e o histórico completo de
    eventos que afetaram o risco desta entidade.

    entidade_id: ID estável da entidade (mesmo esquema do grafo — p_<md5>)
    """
    score = _rs.obter_score(entidade_id)
    if not score:
        raise HTTPException(status_code=404, detail="Entidade não encontrada no radar de risco.")
    historico = _rs.historico_entidade(entidade_id, limite=30)
    return {
        "score":    score,
        "historico": historico,
    }
