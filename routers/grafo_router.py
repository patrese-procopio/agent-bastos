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

# ── Validação MIME (magic bytes) ─────────────────────────────────────────────
# Bloqueia uploads mascarados: um .exe renomeado para .jpg passa pelo content-type
# mas falha aqui porque os primeiros bytes revelam o formato real.
_MAGIC_FOTO = {
    b"\xff\xd8\xff": "image/jpeg",   # JPEG
    b"\x89PNG":      "image/png",    # PNG
    b"GIF8":         "image/gif",    # GIF87a / GIF89a
    b"RIFF":         "image/webp",   # WEBP (header RIFF....WEBP)
}

def _validar_mime_foto(conteudo: bytes, max_mb: int = 5) -> None:
    """
    Lança HTTPException 400/413 se:
      - arquivo vazio
      - tamanho > max_mb MB
      - magic bytes não correspondem a imagem suportada

    Por que magic bytes e não content-type?
    O header Content-Type vem do cliente e pode ser falsificado.
    Os primeiros bytes do arquivo são determinísticos e não mentirosos.
    """
    if not conteudo:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    if len(conteudo) > max_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Foto maior que {max_mb} MB.")
    header = conteudo[:8]
    if not any(header.startswith(magic) for magic in _MAGIC_FOTO):
        raise HTTPException(
            status_code=415,
            detail="Formato inválido. Envie JPEG, PNG, GIF ou WEBP.",
        )

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


@router.get("/recentes", summary="Nós/arestas adicionados via HITL (ORÁCULO LIVE)")
def get_recentes(
    limite: int = Query(default=20, ge=1, le=100),
    user: dict = Depends(_GATE),
):
    """
    Retorna os nós e arestas mais recentes criados automaticamente
    após confirmações de HITL (origem: auto:correlacao:*).

    Usado pelo painel ORÁCULO LIVE do GrafoVinculos para mostrar
    o que o sistema materializou sem intervenção manual.
    """
    return grafo.recentes_auto(limite=limite)


@router.get("/stats", summary="Estatísticas do grafo de vínculos")
def get_stats(user: dict = Depends(_GATE)):
    """Contagens rápidas: total de nós/arestas, auto vs manual, última atualização."""
    return grafo.stats_grafo()


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
    _validar_mime_foto(conteudo)          # valida magic bytes + tamanho
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
def put_aresta(aresta_id: str, body: ArestaUpdate, u