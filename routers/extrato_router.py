# -*- coding: utf-8 -*-
"""
extrato_router.py — Rotas do Módulo Extrato
Prefixo: /api/extrato   |   Gate: require_module("alertas") (admin tem)

Submissão / processamento:
  POST   /api/extrato/submeter                 → grava bruto e já enriquece
  POST   /api/extrato/criar                     → só grava o bruto
  POST   /api/extrato/{eid}/processar           → (re)processa via LLM (em background)
  PUT    /api/extrato/{eid}                      → edita (registra quem/quando/o quê)
  DELETE /api/extrato/{eid}                      → exclui extrato + derivados (auditado)
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
from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends, Query, Request, Response
from pydantic import BaseModel

from modules import extrato, grafo, lexico
from services import llm_extracao, export_service
from dependencies import require_module
from services.rate_limit_service import limiter, LIMIT_IA_PESADA, LIMIT_ESCRITA
from services.scoping_service import is_admin
from services.logging_service import get_logger

# ── Correlação automática: importação opcional ────────────────────────────────
try:
    from services.correlacao_engine import correlacionar_texto as _correlacionar
    _CORRELACAO_OK = True
except ImportError:
    _CORRELACAO_OK = False

_log_audit = get_logger("audit.extrato")

router = APIRouter(prefix="/extrato", tags=["extrato"])
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


class ExtratoEdit(BaseModel):
    """Edição parcial — só os campos enviados (não nulos) são considerados."""
    corpo: Optional[str] = None
    data: Optional[str] = None
    unidade: Optional[str] = None
    nucleo: Optional[str] = None
    autor: Optional[str] = None
    assunto: Optional[str] = None
    topicos: Optional[list[str]] = None
    nucleos_destino: Optional[list[str]] = None
    classificacao: Optional[str] = None
    reprocessar: bool = False


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
@limiter.limit(LIMIT_IA_PESADA)
def submeter(request: Request, body: ExtratoIn,
             background_tasks: BackgroundTasks = BackgroundTasks(),
             user: dict = Depends(_GATE)):
    """
    Grava o extrato bruto IMEDIATAMENTE e retorna 202 (Accepted). O
    processamento LLM (extracao de entidades, grafo, RAE) roda em thread
    daemon separada e demora 30s-8min dependendo do provedor/tamanho.

    Antes: request sincrono ficava pendurado ate o LLM terminar; o cliente
    ou o proxy (ngrok grátis, 10min limite) timeoutavam ou o operador
    achava que travou e re-submetia. Agora o operador ve o item aparecer
    na lista com status "recebido" -> "processando" -> "processado"
    (frontend faz polling ate estabilizar).
    """
    if not (body.corpo or "").strip():
        raise HTTPException(status_code=400, detail="Corpo do extrato vazio.")
    _log_audit.info("extrato submetido",
                    extra={"username": user.get("sub"), "classif": body.classificacao,
                           "unidade": body.unidade, "bytes": len(body.corpo)})
    usuario = user.get("sub", "?")

    # 1. Grava bruto (rapido — instantaneo)
    reg = extrato.criar_extrato(body.model_dump(), usuario=usuario)
    eid = reg["id"]

    # 2. Processa em thread daemon (LLM, grafo, RAE) — nao bloqueia a request
    extrato.iniciar_processamento(eid, usuario=usuario)

    # 3. Correlacao tambem em background (nao impacta o cliente)
    if _CORRELACAO_OK:
        background_tasks.add_task(
            _correlacionar,
            texto=body.corpo,
            fonte_tipo="extrato",
            fonte_id=eid,
            metadados={"summary": body.assunto or "", "unidade": body.unidade or "",
                       "risco": "ALTO"},
            operador=usuario,
        )

    # 4. Retorna 202 — cliente faz polling em GET /extrato/{eid} pra ver status
    return {
        "extrato": reg,
        "processamento": {"ok": True, "status": "iniciado",
                          "aviso": "Processamento LLM roda em background. "
                                   "Acompanhe pela lista (status vira 'processado')."},
    }


@router.post("/criar")
@limiter.limit(LIMIT_ESCRITA)
def criar(request: Request, body: ExtratoIn,
          background_tasks: BackgroundTasks = BackgroundTasks(),
          user: dict = Depends(_GATE)):
    resultado = extrato.criar_extrato(body.model_dump(), usuario=user.get("sub", "?"))
    # ── Correlação automática em background ───────────────────────────────────
    if _CORRELACAO_OK:
        eid = resultado.get("id") or resultado.get("extrato_id", "?")
        background_tasks.add_task(
            _correlacionar,
            texto=body.corpo,
            fonte_tipo="extrato",
            fonte_id=eid,
            metadados={"summary": body.assunto or "", "unidade": body.unidade or "",
                       "risco": "ALTO"},
            operador=user.get("sub", "sistema"),
        )
    return resultado


@router.post("/{eid}/processar")
@limiter.limit(LIMIT_IA_PESADA)
def processar(request: Request, eid: str, user: dict = Depends(_GATE)):
    """Reprocessa em BACKGROUND (LLM pode levar minutos, principalmente no provedor
    local): responde na hora e o front acompanha o status pela lista."""
    _log_audit.info("extrato reprocessado", extra={"username": user.get("sub"), "eid": eid})
    reg = extrato.obter(eid, user=user)
    if not reg:
        raise HTTPException(status_code=404, detail="Extrato não encontrado.")
    res = extrato.iniciar_processamento(eid, usuario=user.get("sub", "?"))
    if not res.get("ok"):
        if res.get("erro") == "ja_processando":
            raise HTTPException(status_code=409, detail={"erro": "Este extrato já está sendo processado."})
        raise HTTPException(status_code=422, detail=res)
    return res


def _exigir_dono_ou_admin(reg: dict, user: dict) -> None:
    """Editar/excluir: só quem criou o extrato ou admin."""
    if not (is_admin(user) or reg.get("criado_por") == user.get("sub")):
        raise HTTPException(status_code=403,
                            detail="Apenas o autor do registro ou um administrador pode alterar este extrato.")


@router.put("/{eid}")
@limiter.limit(LIMIT_ESCRITA)
def editar(request: Request, eid: str, body: ExtratoEdit, user: dict = Depends(_GATE)):
    """Edita o extrato registrando data/hora, usuário e valores anterior/novo."""
    reg = extrato.obter(eid, user=user)
    if not reg:
        raise HTTPException(status_code=404, detail="Extrato não encontrado.")
    _exigir_dono_ou_admin(reg, user)
    usuario = user.get("sub", "?")
    campos = body.model_dump(exclude={"reprocessar"})
    res = extrato.editar(eid, campos, usuario=usuario)
    if not res.get("ok"):
        code = 409 if res.get("erro") == "processando" else 400
        raise HTTPException(status_code=code, detail=res.get("detalhe") or res.get("erro"))
    _log_audit.info("extrato editado", extra={"username": usuario, "eid": eid,
                                              "campos": res.get("campos")})
    if body.reprocessar and res.get("alterado"):
        res["reprocessamento"] = extrato.iniciar_processamento(eid, usuario=usuario)
        res["extrato"] = extrato.obter(eid)
    return res


@router.delete("/{eid}")
@limiter.limit(LIMIT_ESCRITA)
def excluir(request: Request, eid: str, user: dict = Depends(_GATE)):
    """Exclui o extrato e seus derivados (grafo, léxico, índice). A exclusão
    fica registrada na trilha de auditoria (append-only)."""
    reg = extrato.obter(eid, user=user)
    if not reg:
        raise HTTPException(status_code=404, detail="Extrato não encontrado.")
    _exigir_dono_ou_admin(reg, user)
    usuario = user.get("sub", "?")
    res = extrato.excluir(eid, usuario=usuario)
    if not res.get("ok"):
        code = 409 if res.get("erro") == "processando" else 400
        raise HTTPException(status_code=code, detail=res.get("detalhe") or res.get("erro"))
    _log_audit.info("extrato excluido", extra={"username": usuario, "eid": eid})
    return res


@router.get("/listar")
def listar(limite: int = Query(default=200, ge=1, le=1000), user: dict = Depends(_GATE)):
    # Scoping: admin ve tudo; demais veem so os proprios (autor=user.sub)
    return {"extratos": extrato.listar(limite, user=user)}


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
    reg = extrato.obter(eid, user=user)
    if not reg:
        # 404 (nao 403) intencional: nao revelar existencia de extrato de outro autor
        raise HTTPException(status_code=404, detail="Extrato não encontrado.")
    return reg


@router.get("/{eid}/rae")
def rae(eid: str, user: dict = Depends(_GATE)):
    # Garante scoping: so retorna RAE se o usuario puder ver o extrato
    if not extrato.obter(eid, user=user):
        raise HTTPException(status_code=404, detail="Extrato não encontrado.")
    dados = extrato.rae_dados(eid)
    if not dados:
        raise HTTPException(status_code=404, detail="Extrato não encontrado.")
    return dados


@router.get("/{eid}/rae.pdf")
def rae_pdf(eid: str, user: dict = Depends(_GATE)):
    if not extrato.obter(eid, user=user):
        raise HTTPException(status_code=404, detail="Extrato não encontrado.")
    dados = extrato.rae_dados(eid)
    if not dados:
        raise HTTPException(status_code=404, detail="Extrato não encontrado.")
    pdf = export_service.build_rae_pdf(dados)
    extrato.marcar_rae_gerado(eid)
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="RAE_{eid}.pdf"'},
    )
