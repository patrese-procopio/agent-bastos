# -*- coding: utf-8 -*-
"""
grafo_router.py — Rotas do Motor de Grafo de Vínculos (mini i2)
Prefixo: /api/grafo

Leitura:
  GET  /api/grafo/meta                       → tipos de nó, ícones default, rótulos
  GET  /api/grafo/alvos                      → pessoas para focar
  GET  /api/grafo/rede-alvo/{alvo_id}        → ego-network do alvo
  GET  /api/grafo/completo                   → todos os nós e arestas

Escrita manual:
  POST   /api/grafo/no                       → cria nó
  PUT    /api/grafo/no/{no_id}               → edita nó
  DELETE /api/grafo/no/{no_id}               → remove nó (e vínculos)
  POST   /api/grafo/aresta                   → cria vínculo
  PUT    /api/grafo/aresta/{aresta_id}       → edita vínculo
  DELETE /api/grafo/aresta/{aresta_id}       → remove vínculo

Automático:
  POST /api/grafo/sincronizar                → semeia das lideranças
  POST /api/grafo/alvo/{alvo_id}/varrer-citacoes → varre documentos
"""

from typing import Any, Optional
from fastapi import APIRouter, HTTPException, Depends, Query, Request, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel

from modules import grafo
from dependencies import require_module, get_current_user_media
from services.rate_limit_service import limiter, LIMIT_VARREDURA
from services.logging_service import get_logger

_log_audit = get_logger("audit.grafo")

router = APIRouter(prefix="/grafo", tags=["grafo"])

_GATE = require_module("alertas")


# ── Schemas ─────────────────────────────────────────────────────────────────

class NoIn(BaseModel):
    tipo: str = "generico"
    rotulo: str
    icone: Optional[str] = None
    detalhes: Optional[dict[str, Any]] = None
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None
    fixado: Optional[bool] = None


class NoUpdate(BaseModel):
    tipo: Optional[str] = None
    rotulo: Optional[str] = None
    icone: Optional[str] = None
    detalhes: Optional[dict[str, Any]] = None
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None
    fixado: Optional[bool] = None


class ArestaIn(BaseModel):
    origem_id: str
    destino_id: str
    rotulo: Optional[str] = "VINCULADO_A"
    direcionada: Optional[bool] = True
    propriedades: Optional[dict[str, Any]] = None


class ArestaUpdate(BaseModel):
    rotulo: Optional[str] = None
    direcionada: Optional[bool] = None
    propriedades: Optional[dict[str, Any]] = None


# ── Leitura ─────────────────────────────────────────────────────────────────

@router.get("/meta")
def get_meta(user: dict = Depends(_GATE)):
    return {
        "tipos": grafo.TIPOS_NO,
        "icones_padrao": grafo.ICONE_PADRAO,
        "rotulos_vinculo": grafo.ROTULOS_VINCULO,
    }


@router.get("/alvos")
def get_alvos(user: dict = Depends(_GATE)):
    return {"alvos": grafo.listar_alvos()}


@router.get("/rede-alvo/{alvo_id}")
def get_rede_alvo(alvo_id: str, hops: int = Query(default=2, ge=1, le=4),
                  user: dict = Depends(_GATE)):
    rede = grafo.rede_alvo(alvo_id, hops=hops)
    if rede.get("erro"):
        raise HTTPException(status_code=404, detail="Alvo não encontrado.")
    return rede


@router.get("/completo")
def get_completo(user: dict = Depends(_GATE)):
    return grafo.grafo_completo()


# ── Escrita manual ──────────────────────────────────────────────────────────

@router.post("/no")
def post_no(body: NoIn, user: dict = Depends(_GATE)):
    return grafo.criar_no(body.model_dump(exclude_none=True))


@router.put("/no/{no_id}")
def put_no(no_id: str, body: NoUpdate, user: dict = Depends(_GATE)):
    no = grafo.atualizar_no(no_id, body.model_dump(exclude_unset=True))
    if not no:
        raise HTTPException(status_code=404, detail="Nó não encontrado.")
    return no


@router.delete("/no/{no_id}")
def delete_no(no_id: str, user: dict = Depends(_GATE)):
    if not grafo.deletar_no(no_id):
        raise HTTPException(status_code=404, detail="Nó não encontrado.")
    return {"ok": True}


# ── Foto de nó (upload individual por entidade) ──────────────────────────────

@router.post("/no/{no_id}/foto")
async def upload_foto_no(no_id: str, file: UploadFile = File(...),
                         user: dict = Depends(_GATE)):
    conteudo = await file.read()
    if not conteudo:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    ext = (file.filename or "foto.jpg").rsplit(".", 1)[-1]
    no = grafo.set_foto_no(no_id, conteudo, ext)
    if not no:
        raise HTTPException(status_code=404, detail="Nó não encontrado.")
    return no


@router.delete("/no/{no_id}/foto")
def delete_foto_no(no_id: str, user: dict = Depends(_GATE)):
    no = grafo.remover_foto_no(no_id)
    if not no:
        raise HTTPException(status_code=404, detail="Nó não encontrado.")
    return no


@router.get("/no/{no_id}/foto")
def get_foto_no(no_id: str, user: dict = Depends(get_current_user_media)):
    caminho = grafo.foto_path_no(no_id)
    if not caminho:
        raise HTTPException(status_code=404, detail="Sem foto.")
    return FileResponse(caminho)


@router.post("/aresta")
def post_aresta(body: ArestaIn, user: dict = Depends(_GATE)):
    aresta = grafo.criar_aresta(body.model_dump(exclude_none=True))
    if not aresta:
        raise HTTPException(status_code=400, detail="Origem/destino inválidos.")
    return aresta


@router.put("/aresta/{aresta_id}")
def put_aresta(aresta_id: str, body: ArestaUpdate, user: dict = Depends(_GATE)):
    aresta = grafo.atualizar_aresta(aresta_id, body.model_dump(exclude_unset=True))
    if not aresta:
        raise HTTPException(status_code=404, detail="Vínculo não encontrado.")
    return aresta


@router.delete("/aresta/{aresta_id}")
def delete_aresta(aresta_id: str, user: dict = Depends(_GATE)):
    if not grafo.deletar_aresta(aresta_id):
        raise HTTPException(status_code=404, detail="Vínculo não encontrado.")
    return {"ok": True}


# ── Automático ──────────────────────────────────────────────────────────────

@router.post("/sincronizar")
@limiter.limit(LIMIT_VARREDURA)
def post_sincronizar(request: Request, user: dict = Depends(_GATE)):
    _log_audit.info("grafo sincronizar", extra={"username": user.get("sub")})
    return grafo.sincronizar()


@router.post("/alvo/{alvo_id}/varrer-citacoes")
@limiter.limit(LIMIT_VARREDURA)
def post_varrer_citacoes(request: Request, alvo_id: str, user: dict = Depends(_GATE)):
    _log_audit.info("grafo varrer citacoes",
                    extra={"username": user.get("sub"), "alvo_id": alvo_id})
    res = grafo.varrer_citacoes(alvo_id)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("erro", "Falha na varredura."))
    return res
