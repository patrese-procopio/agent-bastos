# -*- coding: utf-8 -*-
"""
api_liderancas_router.py — Router isolado para endpoints de lideranças
Registrado no api.py via: app.include_router(liderancas_router)
"""

import os
from fastapi import APIRouter, Form, File, UploadFile, HTTPException
from fastapi.responses import Response

from modules.liderancas import (
    ESTRUTURA, FACCOES, CARGOS_POR_FACCAO, estrutura_com_celas,
    criar_lider, atualizar_lider, deletar_lider,
    buscar_lider, listar_por_unidade,
    salvar_foto, carregar_foto,
)

liderancas_router = APIRouter(prefix="/api/liderancas", tags=["liderancas"])


@liderancas_router.get("/estrutura")
def get_estrutura():
    return {
        "estrutura":         estrutura_com_celas(),
        "faccoes":           FACCOES,
        "cargos_por_faccao": CARGOS_POR_FACCAO,
    }


@liderancas_router.get("/{unidade}")
def get_liderancas_unidade(unidade: str):
    if unidade not in ESTRUTURA:
        raise HTTPException(status_code=404, detail=f"Unidade '{unidade}' não encontrada.")
    return {
        "unidade":  unidade,
        "label":    ESTRUTURA[unidade]["label"],
        "pavilhoes": listar_por_unidade(unidade),
    }


@liderancas_router.post("")
async def post_lider(
    unidade:    str = Form(...),
    pavilhao:   str = Form(...),
    ala:        str = Form(...),
    cela:       str = Form(""),
    faccao:     str = Form(...),
    cargo:      str = Form(...),
    nome:       str = Form(""),
    vulgo:      str = Form(""),
    observacao: str = Form(""),
    foto: UploadFile = File(None),
):
    dados = {
        "unidade": unidade, "pavilhao": pavilhao, "ala": ala, "cela": cela,
        "faccao": faccao,   "cargo": cargo,
        "nome": nome or None, "vulgo": vulgo or None,
        "observacao": observacao or None,
        "foto_ext": None,
    }
    lider = criar_lider(dados)
    if foto and foto.filename:
        ext      = os.path.splitext(foto.filename)[1] or ".jpg"
        conteudo = await foto.read()
        if len(conteudo) > 5 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Foto maior que 5 MB.")
        lider = atualizar_lider(lider["id"], {"foto_ext": salvar_foto(lider["id"], conteudo, ext)})
    return lider


@liderancas_router.put("/{lider_id}")
async def put_lider(
    lider_id:   str,
    unidade:    str = Form(...),
    pavilhao:   str = Form(...),
    ala:        str = Form(...),
    cela:       str = Form(""),
    faccao:     str = Form(...),
    cargo:      str = Form(...),
    nome:       str = Form(""),
    vulgo:      str = Form(""),
    observacao: str = Form(""),
    foto: UploadFile = File(None),
):
    if not buscar_lider(lider_id):
        raise HTTPException(status_code=404, detail="Líder não encontrado.")
    dados = {
        "unidade": unidade, "pavilhao": pavilhao, "ala": ala, "cela": cela,
        "faccao": faccao,   "cargo": cargo,
        "nome": nome or None, "vulgo": vulgo or None,
        "observacao": observacao or None,
    }
    if foto and foto.filename:
        ext      = os.path.splitext(foto.filename)[1] or ".jpg"
        conteudo = await foto.read()
        if len(conteudo) > 5 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Foto maior que 5 MB.")
        dados["foto_ext"] = salvar_foto(lider_id, conteudo, ext)
    return atualizar_lider(lider_id, dados)


@liderancas_router.delete("/{lider_id}")
def delete_lider(lider_id: str):
    if not deletar_lider(lider_id):
        raise HTTPException(status_code=404, detail="Líder não encontrado.")
    return {"ok": True}


@liderancas_router.get("/foto/{lider_id}")
def get_foto_lider(lider_id: str):
    lider = buscar_lider(lider_id)
    if not lider or not lider.get("foto_ext"):
        raise HTTPException(status_code=404, detail="Foto não encontrada.")
    conteudo = carregar_foto(lider_id, lider["foto_ext"])
    if not conteudo:
        raise HTTPException(status_code=404, detail="Arquivo de foto ausente no disco.")
    ext  = lider["foto_ext"].lstrip(".")
    mime = {"jpg":"image/jpeg","jpeg":"image/jpeg","png":"image/png","webp":"image/webp"}.get(ext,"image/jpeg")
    return Response(content=conteudo, media_type=mime)
