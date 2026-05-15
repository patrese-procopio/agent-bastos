# -*- coding: utf-8 -*-
"""
patch_liderancas.py — Injeta endpoints de lideranças no api.py
Execute UMA VEZ:  python patch_liderancas.py
"""

import os, sys

API_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "api.py")

IMPORT_PATCH = (
    "from modules.liderancas import (\n"
    "    ESTRUTURA, FACCOES, CARGOS_POR_FACCAO, estrutura_com_celas,\n"
    "    criar_lider, atualizar_lider, deletar_lider,\n"
    "    buscar_lider, listar_por_unidade,\n"
    "    salvar_foto, carregar_foto,\n"
    ")\n"
)

ENDPOINTS = '''

# ═══════════════════════════════════════════════════════════════════════════════
# LIDERANÇAS DE PAVILHÕES
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/liderancas/estrutura")
def get_estrutura():
    """Estrutura física completa com celas + facções + cargos por facção."""
    return {
        "estrutura":         estrutura_com_celas(),
        "faccoes":           FACCOES,
        "cargos_por_faccao": CARGOS_POR_FACCAO,
    }


@app.get("/liderancas/{unidade}")
def get_liderancas_unidade(unidade: str):
    """Líderes de uma unidade agrupados por pavilhão → ala → cela."""
    if unidade not in ESTRUTURA:
        raise HTTPException(status_code=404, detail=f"Unidade '{unidade}' não encontrada.")
    return {
        "unidade":  unidade,
        "label":    ESTRUTURA[unidade]["label"],
        "pavilhoes": listar_por_unidade(unidade),
    }


@app.post("/liderancas")
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
    """Cria um novo líder. Foto é opcional."""
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
        ext_salva = salvar_foto(lider["id"], conteudo, ext)
        lider     = atualizar_lider(lider["id"], {"foto_ext": ext_salva})

    return lider


@app.put("/liderancas/{lider_id}")
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
    """Atualiza líder. Nova foto substitui a anterior."""
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
        ext_salva      = salvar_foto(lider_id, conteudo, ext)
        dados["foto_ext"] = ext_salva

    return atualizar_lider(lider_id, dados)


@app.delete("/liderancas/{lider_id}")
def delete_lider(lider_id: str):
    """Remove líder e sua foto do disco."""
    if not deletar_lider(lider_id):
        raise HTTPException(status_code=404, detail="Líder não encontrado.")
    return {"ok": True}


@app.get("/liderancas/foto/{lider_id}")
def get_foto_lider(lider_id: str):
    """Serve a foto binária do líder com mime type correto."""
    lider = buscar_lider(lider_id)
    if not lider or not lider.get("foto_ext"):
        raise HTTPException(status_code=404, detail="Foto não encontrada.")
    conteudo = carregar_foto(lider_id, lider["foto_ext"])
    if not conteudo:
        raise HTTPException(status_code=404, detail="Arquivo de foto ausente no disco.")
    ext  = lider["foto_ext"].lstrip(".")
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg",
            "png": "image/png",  "webp": "image/webp"}.get(ext, "image/jpeg")
    return Response(content=conteudo, media_type=mime)
'''


def main():
    with open(API_PATH, "r", encoding="utf-8-sig") as f:
        conteudo = f.read()

    if "LIDERANÇAS DE PAVILHÕES" in conteudo:
        print("✓ Patch já aplicado — nada a fazer.")
        return

    MARCADOR = "from modules.decifrar import transcrever_documento_bytes, TipoDocumento"
    if MARCADOR not in conteudo:
        print("✗ Marcador de import não encontrado no api.py.")
        sys.exit(1)

    conteudo = conteudo.replace(MARCADOR, MARCADOR + "\n" + IMPORT_PATCH)
    conteudo = conteudo.rstrip() + "\n" + ENDPOINTS + "\n"

    with open(API_PATH, "w", encoding="utf-8") as f:
        f.write(conteudo)

    print("✓ Endpoints injetados com sucesso.")
    print("  Próximo passo: python api.py")


if __name__ == "__main__":
    main()
