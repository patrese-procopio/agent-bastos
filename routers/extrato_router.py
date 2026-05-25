# -*- coding: utf-8 -*-
"""
extrato_router.py — Rotas do Módulo Extrato
Prefixo: /api/extrato   |   Gate: require_module("alertas") (admin tem)

Submissão / processamento:
  POST   /api/extrato/submeter                 → grava bruto e já enriquece
  POST   /api/extrato/criar                     → só grava o bruto
  POST   /api/extrato/{eid}/processar           → (re)processa via LLM
  GET    /api/extrato/listar                     → lista de extratos
  GET    /api/extrato/{eid}                       → extrato completo
  GET    /api/extrato/{eid}/rae                   → dados estruturados do RAE
  GET    /api/extrato/{eid}/rae.pdf               → RAE em PDF timbrado

Vitrines:
  GET    /api/extrato/heatmap                     → matriz de calor dos NUCADIs
  GET    /api/extrato/lexico                      → dicionário de sinais fracos
  POST   /api/extrato/lexico/validar              → valida um jargão
  POST   /api/extrato/lexico/rejeitar             → rejeita um jargão

Homônimos (sugerir e confirmar — clique manual):
  GET    /api/extrato/fusao/candidatos            → pares sugeridos
  POST   /api/extrato/fusao/confirmar             → funde dois nós

Governança:
  GET    /api/extrato/meta                         → classificações + provedor
  GET    /api/extrato/auditoria/verificar          → integridade da trilha (hash-chain)
"""

from typing import Any, Optional
from fastapi import APIRouter, HTTPException, Depends, Query, Response
from pydantic import BaseModel

from modules import extrato, grafo, lexico
from services import llm_extracao, export_service
from dependencies import require_module

router = APIRouter(prefix="/api/extrato", tags=["extrato"])
_GATE = require_module("alertas")


# ── Schemas ──────────────────────────────────────────────────────────────────

class ExtratoIn(BaseModel):
    corpo: str
    data: Optional[str] = None
    unidade: Optional[str] = None
    nucleo: Optional[str] = None
    autor: Optional[str] = None
    assunto: Optional[str] = None
    topicos: Optional[list[str]] = None
    nucleos_destino: Optional[list[str]] = None
    classificacao: Optional[str] = "reservado"


class ValidarJargaoIn(BaseModel):
    termo: str
    significado: Optional[str] = None
    nivel: Optional[str] = None


class RejeitarJargaoIn(BaseModel):
    termo: str


class FusaoIn(BaseModel):
    manter_id: str
    fundir_id: str


# ── Submissão / processamento ────────────────────────────────────────────────

@router.post("/submeter")
def submeter(body: ExtratoIn, user: dict = Depends(_GATE)):
    if not (body.corpo or "").strip():
        raise HTTPException(status_code=400, detail="Corpo do extrato vazio.")
    return extrato.criar_e_processar(body.model_dump(), usuario=user.get("sub", "?"))


@router.post("/criar")
def criar(body: ExtratoIn, user: dict = Depends(_GATE)):
    return extrato.criar_extrato(body.model_dump(), usuario=user.get("sub", "?"))


@router.post("/{eid}/processar")
def processar(eid: str, user: dict = Depends(_GATE)):
    res = extrato.processar(eid, usuario=user.get("sub", "?"))
    if not res.get("ok"):
        raise HTTPException(status_code=422, detail=res)
    return res


@router.get("/listar")
def listar(limite: int = Query(default=200, ge=1, le=1000), user: dict = Depends(_GATE)):
    return {"extratos": extrato.listar(limite)}


# ── Vitrines ─────────────────────────────────────────────────────────────────

@router.get("/heatmap")
def heatmap(user: dict = Depends(_GATE)):
    return extrato.heatmap_nucadis()


@router.get("/lexico")
def get_lexico(status: Optional[str] = None, user: dict = Depends(_GATE)):
    return {"termos": lexico.listar(status)}


@router.post("/lexico/validar")
def validar_jargao(body: ValidarJargaoIn, user: dict = Depends(_GATE)):
    r = lexico.validar(body.termo, body.significado, body.nivel, user.get("sub", "?"))
    if not r:
        raise HTTPException(status_code=404, detail="Termo não encontrado.")
    return r


@router.post("/lexico/rejeitar")
def rejeitar_jargao(body: RejeitarJargaoIn, user: dict = Depends(_GATE)):
    if not lexico.rejeitar(body.termo, user.get("sub", "?")):
        raise HTTPException(status_code=404, detail="Termo não encontrado.")
    return {"ok": True}


# ── Homônimos ────────────────────────────────────────────────────────────────

@router.get("/fusao/candidatos")
def fusao_candidatos(user: dict = Depends(_GATE)):
    return {"candidatos": grafo.candidatos_fusao()}


@router.post("/fusao/confirmar")
def fusao_confirmar(body: FusaoIn, user: dict = Depends(_GATE)):
    r = grafo.fundir_nos(body.manter_id, body.fundir_id)
    if not r.get("ok"):
        raise HTTPException(status_code=400, detail=r.get("erro", "Falha na fusão."))
    return r


# ── Governança ───────────────────────────────────────────────────────────────

@router.get("/meta")
def meta(user: dict = Depends(_GATE)):
    return {
        "classificacoes": sorted(llm_extracao.CLASSIF_VALIDAS),
        "publicas": sorted(llm_extracao.CLASSIF_PUBLICAS),
        "provedor_configurado": llm_extracao.PROVEDOR_PADRAO,
        "ollama_disponivel": llm_extracao.ollama_disponivel(),
        "modelos": {
            "groq": llm_extracao.GROQ_MODEL,
            "ollama": llm_extracao.OLLAMA_MODEL,
            "claude": llm_extracao.CLAUDE_MODEL,
            "deepseek": llm_extracao.DEEPSEEK_MODEL,
        },
        "prompt_versao": llm_extracao.PROMPT_VERSAO,
    }


@router.get("/auditoria/verificar")
def auditoria_verificar(user: dict = Depends(_GATE)):
    return extrato.verificar_cadeia()


# ── RAE (rotas dinâmicas por último p/ não capturar /listar etc.) ────────────

@router.get("/{eid}")
def obter(eid: str, user: dict = Depends(_GATE)):
    reg = extrato.obter(eid)
    if not reg:
        raise HTTPException(status_code=404, detail="Extrato não encontrado.")
    return reg


@router.get("/{eid}/rae")
def rae(eid: str, user: dict = Depends(_GATE)):
    dados = extrato.rae_dados(eid)
    if not dados:
        raise HTTPException(status_code=404, detail="Extrato não encontrado.")
    return dados


@router.get("/{eid}/rae.pdf")
def rae_pdf(eid: str, user: dict = Depends(_GATE)):
    dados = extrato.rae_dados(eid)
    if not dados:
        raise HTTPException(status_code=404, detail="Extrato não encontrado.")
    pdf = export_service.build_rae_pdf(dados)
    extrato.marcar_rae_gerado(eid)
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="RAE_{eid}.pdf"'},
    )
