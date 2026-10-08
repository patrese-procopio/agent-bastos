# -*- coding: utf-8 -*-
"""
api_liderancas_router.py — Router isolado de lideranças
Prefixo: /api/liderancas

Ajustes PDF v2:
  - Alas vazias ocultadas no relatório
  - Badge colorido por facção
  - Data de cadastro formatada dd/mm/aaaa
"""

import io
import os
import base64
from datetime import datetime
from fastapi import APIRouter, BackgroundTasks, Form, File, UploadFile, HTTPException, Query, Depends
from fastapi.responses import Response

# ── Correlação automática: importação opcional ────────────────────────────────
try:
    from services.correlacao_engine import correlacionar_entidade as _correlacionar_ent
    _CORRELACAO_OK = True
except ImportError:
    _CORRELACAO_OK = False

from modules.liderancas import (
    ESTRUTURA, FACCOES, CARGOS_POR_FACCAO, CARGOS_RUA, STATUS_LIDER_RUA,
    estrutura_com_celas,
    criar_lider, atualizar_lider, deletar_lider,
    buscar_lider, listar_por_unidade, listar_todas_unidades,
    listar_competencias, listar_competencias_unidade,
    salvar_foto, carregar_foto, FOTOS_DIR,
    _competencia_atual,
    # Facções de rua
    listar_faccoes_rua, criar_faccao_rua, buscar_faccao_rua, deletar_faccao_rua,
    criar_lider_rua, atualizar_lider_rua, deletar_lider_rua, buscar_lider_rua,
    listar_lideres_agrupados, listar_lideres_por_faccao,
    salvar_foto_rua, carregar_foto_rua,
    previa_copia, copiar_competencia, listar_copias, desfazer_copia,
    detalhe_pessoa, registrar_saida, registrar_retorno, editar_passagem, remover_lider,
    buscar_pessoas, sugestoes_mesmo_lider, unir_pessoas, marcar_nao_iguais,
)
from dependencies import get_current_user, get_current_user_media, require_module

router = APIRouter(prefix="/liderancas", tags=["liderancas"])

# ── Validação MIME (magic bytes) ─────────────────────────────────────────────
_MAGIC_FOTO = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG":      "image/png",
    b"GIF8":         "image/gif",
    b"RIFF":         "image/webp",
}

def _validar_mime_foto(conteudo: bytes, max_mb: int = 5) -> None:
    """Rejeita arquivo vazio, > max_mb MB ou com magic bytes não reconhecidos."""
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
liderancas_router = router

_MESES_PT = ["","Janeiro","Fevereiro","Março","Abril","Maio","Junho",
             "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"]

def _fmt_competencia(comp: str) -> str:
    try:
        ano, mes = comp.split("-")
        return f"{_MESES_PT[int(mes)]} {ano}"
    except Exception:
        return comp

def _fmt_data(iso: str) -> str:
    try:
        return iso[:10].split("-")[::-1].__str__().strip("[]").replace("', '", "/").replace("'","")
    except Exception:
        return iso[:10] if iso else ""

_FACCAO_PDF_COR = {
    "CV/AM":          {"bg": (0.99, 0.95, 0.95), "text": (0.60, 0.10, 0.10), "dot": (0.86, 0.15, 0.15)},
    "PCC":            {"bg": (0.94, 0.97, 1.00), "text": (0.12, 0.25, 0.69), "dot": (0.23, 0.51, 0.96)},
    "RDA":            {"bg": (0.94, 0.99, 0.95), "text": (0.09, 0.39, 0.20), "dot": (0.13, 0.77, 0.37)},
    "NEUTROS":        {"bg": (0.97, 0.98, 0.99), "text": (0.28, 0.34, 0.41), "dot": (0.58, 0.64, 0.72)},
    "CRIMES SEXUAIS": {"bg": (1.00, 0.97, 0.93), "text": (0.60, 0.20, 0.07), "dot": (0.98, 0.60, 0.09)},
    "JACK/TDA":       {"bg": (0.96, 0.95, 1.00), "text": (0.36, 0.13, 0.71), "dot": (0.55, 0.36, 0.98)},
    "AMARELINHOS":    {"bg": (1.00, 0.98, 0.93), "text": (0.57, 0.25, 0.05), "dot": (0.96, 0.62, 0.04)},
    "ISOLAMENTO":     {"bg": (0.97, 0.97, 0.97), "text": (0.42, 0.44, 0.47), "dot": (0.42, 0.44, 0.47)},
    "MED. SEGURANÇA": {"bg": (0.97, 0.98, 0.99), "text": (0.28, 0.34, 0.41), "dot": (0.58, 0.64, 0.72)},
}

def _cor_faccao(faccao: str):
    return _FACCAO_PDF_COR.get(faccao, {
        "bg": (0.97, 0.98, 0.99), "text": (0.28, 0.34, 0.41), "dot": (0.58, 0.64, 0.72)
    })


# ── Cópia de lideranças entre meses ───────────────────────────────────────────
from pydantic import BaseModel
from typing import Optional


class CopiaIn(BaseModel):
    origem: str
    destino: str
    unidades: Optional[list[str]] = None      # None = todas


def _unidades_param(unidades: str):
    return None if (not unidades or unidades == "todas") else [u for u in unidades.split(",") if u]


@liderancas_router.get("/copia/previa")
def get_copia_previa(origem: str, destino: str, unidades: str = "todas",
                     user: dict = Depends(require_module("alertas"))):
    """Quantos líderes seriam copiados / já existem no destino. Não grava nada."""
    try:
        return previa_copia(origem, destino, _unidades_param(unidades))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@liderancas_router.post("/copia")
def post_copia(body: CopiaIn, user: dict = Depends(require_module("alertas"))):
    """Copia as lideranças de um mês para outro, pulando quem já existe no destino."""
    try:
        res = copiar_competencia(body.origem, body.destino, body.unidades, usuario=user.get("sub", "?"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    try:
        from services.audit_service import registrar as audit
        audit("liderancas_copiadas", "liderancas", usuario=user.get("sub", "?"), alvo=res.get("lote") or "-",
              detalhe=f"{body.origem} -> {body.destino} · {res['copiados']} copiados · {res['ignorados']} já existiam")
    except Exception:
        pass
    return res


@liderancas_router.get("/copia/lotes")
def get_copia_lotes(user: dict = Depends(require_module("alertas"))):
    return {"lotes": listar_copias()}


@liderancas_router.delete("/copia/lotes/{lote_id}")
def delete_copia_lote(lote_id: str, user: dict = Depends(require_module("alertas"))):
    """Desfaz uma cópia: remove só o que ela criou e não foi editado depois."""
    res = desfazer_copia(lote_id, usuario=user.get("sub", "?"))
    if not res.get("ok"):
        raise HTTPException(status_code=404, detail="Cópia não encontrada.")
    try:
        from services.audit_service import registrar as audit
        audit("liderancas_copia_desfeita", "liderancas", usuario=user.get("sub", "?"), alvo=lote_id,
              detalhe=f"{res['removidos']} removidos · {res['mantidos_por_edicao']} mantidos (editados)")
    except Exception:
        pass
    return res


# ── Tempo na liderança ────────────────────────────────────────────────────────

class SaidaIn(BaseModel):
    motivo: str
    data: Optional[str] = None


class RetornoIn(BaseModel):
    data: Optional[str] = None


class PassagemIn(BaseModel):
    inicio: Optional[str] = None
    fim: Optional[str] = None


class UniaoIn(BaseModel):
    manter: str
    unir: str


def _auditar(user, acao, alvo, detalhe):
    try:
        from services.audit_service import registrar as audit
        audit(acao, "liderancas", usuario=user.get("sub", "?"), alvo=alvo, detalhe=detalhe)
    except Exception:
        pass


@liderancas_router.get("/pessoa/{pessoa_id}")
def get_pessoa(pessoa_id: str, user: dict = Depends(require_module("alertas"))):
    d = detalhe_pessoa(pessoa_id)
    if not d:
        raise HTTPException(status_code=404, detail="Líder não encontrado.")
    return d


@liderancas_router.post("/pessoa/{pessoa_id}/saida")
def post_saida(pessoa_id: str, body: SaidaIn, user: dict = Depends(require_module("alertas"))):
    try:
        res = registrar_saida(pessoa_id, body.data, body.motivo, usuario=user.get("sub", "?"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    _auditar(user, "lideranca_saida", pessoa_id, f"{body.motivo} em {body.data or 'hoje'}")
    return res


@liderancas_router.post("/pessoa/{pessoa_id}/retorno")
def post_retorno(pessoa_id: str, body: RetornoIn, user: dict = Depends(require_module("alertas"))):
    try:
        res = registrar_retorno(pessoa_id, body.data, usuario=user.get("sub", "?"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    _auditar(user, "lideranca_retorno", pessoa_id, f"retorno em {body.data or 'hoje'}")
    return res


@liderancas_router.put("/passagem/{passagem_id}")
def put_passagem(passagem_id: str, body: PassagemIn, user: dict = Depends(require_module("alertas"))):
    try:
        res = editar_passagem(passagem_id, body.inicio, body.fim, usuario=user.get("sub", "?"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    _auditar(user, "lideranca_passagem_editada", passagem_id, f"inicio={body.inicio} fim={body.fim}")
    return res


@liderancas_router.get("/pessoas/buscar")
def get_buscar_pessoas(q: str, user: dict = Depends(require_module("alertas"))):
    """Líderes que já existiram com nome/vulgo parecido (para reaproveitar a identidade)."""
    return {"pessoas": buscar_pessoas(q)}


@liderancas_router.get("/pessoas/sugestoes")
def get_sugestoes(user: dict = Depends(require_module("alertas"))):
    return {"pares": sugestoes_mesmo_lider()}


@liderancas_router.post("/pessoas/unir")
def post_unir(body: UniaoIn, user: dict = Depends(require_module("alertas"))):
    try:
        res = unir_pessoas(body.manter, body.unir)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    _auditar(user, "lideranca_unida", body.manter, f"unida a {body.unir}")
    return res


@liderancas_router.post("/pessoas/nao-iguais")
def post_nao_iguais(body: UniaoIn, user: dict = Depends(require_module("alertas"))):
    return marcar_nao_iguais(body.manter, body.unir)


# ── Estrutura e metadados ─────────────────────────────────────────────────────

@liderancas_router.get("/estrutura")
def get_estrutura(user: dict = Depends(get_current_user)):
    return {
        "estrutura":          estrutura_com_celas(),
        "faccoes":            FACCOES,
        "cargos_por_faccao":  CARGOS_POR_FACCAO,
        "competencia_atual":  _competencia_atual(),
    }

@liderancas_router.get("/competencias")
def get_competencias_todas(user: dict = Depends(get_current_user)):
    return {"competencias": listar_competencias()}

@liderancas_router.get("/competencias/{unidade}")
def get_competencias_unidade(unidade: str, user: dict = Depends(get_current_user)):
    return {"competencias": listar_competencias_unidade(unidade)}


# ── Listagem ──────────────────────────────────────────────────────────────────

@liderancas_router.get("/{unidade}")
def get_liderancas_unidade(
    unidade: str,
    competencia: str = Query(default=None),
    user: dict = Depends(require_module("alertas")),
):
    if unidade not in ESTRUTURA:
        raise HTTPException(status_code=404, detail=f"Unidade '{unidade}' não encontrada.")
    comps     = listar_competencias_unidade(unidade)
    comp_alvo = competencia or (comps[0] if comps else _competencia_atual())
    return {
        "unidade":      unidade,
        "label":        ESTRUTURA[unidade]["label"],
        "competencia":  comp_alvo,
        "competencias": comps,
        "pavilhoes":    listar_por_unidade(unidade, comp_alvo),
    }


# ── CRUD ──────────────────────────────────────────────────────────────────────

@liderancas_router.post("")
async def post_lider(
    unidade:     str = Form(...), pavilhao:    str = Form(...),
    ala:         str = Form(...), cela:        str = Form(""),
    faccao:      str = Form(...), cargo:       str = Form(...),
    nome:        str = Form(""),  vulgo:       str = Form(""),
    observacao:  str = Form(""),  competencia: str = Form(""),
    pessoa_id:   str = Form(""),  inicio_lideranca: str = Form(""),
    foto: UploadFile = File(None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    user: dict = Depends(require_module("alertas")),
):
    dados = {
        "pessoa_id": pessoa_id or None, "inicio_lideranca": inicio_lideranca or None,
        "unidade": unidade, "pavilhao": pavilhao, "ala": ala, "cela": cela,
        "faccao": faccao, "cargo": cargo,
        "nome": nome or None, "vulgo": vulgo or None,
        "observacao": observacao or None,
        "competencia": competencia or _competencia_atual(),
        "foto_ext": None,
    }
    try:
        lider = criar_lider(dados)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if foto and foto.filename:
        ext = os.path.splitext(foto.filename)[1] or ".jpg"
        conteudo = await foto.read()
        _validar_mime_foto(conteudo)      # magic bytes + tamanho
        lider = atualizar_lider(lider["id"], {"foto_ext": salvar_foto(lider["id"], conteudo, ext)})
    try:
        from services.audit_service import registrar as audit
        audit("lideranca_cadastrada", "liderancas", usuario=user.get("sub","?"),
              alvo=lider.get("id","?"),
              detalhe=f"{nome or vulgo or '?'} · {cargo} · {faccao} · {unidade}")
    except Exception:
        pass
    # ── Correlação: nova liderança × textos históricos ────────────────────────
    if _CORRELACAO_OK and (nome or vulgo):
        background_tasks.add_task(
            _correlacionar_ent,
            nome=nome or vulgo,
            vulgo=vulgo if nome else None,
            fonte_tipo="Liderança (Pavilhão)",
            fonte_id=lider.get("id", "?"),
            metadados={"detalhe": f"Cargo: {cargo} | Facção: {faccao} | Unidade: {unidade}",
                       "risco": "ALTO"},
            operador=user.get("sub", "sistema"),
        )
    return lider


@liderancas_router.put("/{lider_id}")
async def put_lider(
    lider_id:    str,
    unidade:     str = Form(...), pavilhao:    str = Form(...),
    ala:         str = Form(...), cela:        str = Form(""),
    faccao:      str = Form(...), cargo:       str = Form(...),
    nome:        str = Form(""),  vulgo:       str = Form(""),
    observacao:  str = Form(""),  competencia: str = Form(""),
    foto: UploadFile = File(None),
    user: dict = Depends(require_module("alertas")),
):
    if not buscar_lider(lider_id):
        raise HTTPException(status_code=404, detail="Líder não encontrado.")
    dados = {
        "unidade": unidade, "pavilhao": pavilhao, "ala": ala, "cela": cela,
        "faccao": faccao, "cargo": cargo,
        "nome": nome or None, "vulgo": vulgo or None,
        "observacao": observacao or None,
        "competencia": competencia or _competencia_atual(),
    }
    if foto and foto.filename:
        ext = os.path.splitext(foto.filename)[1] or ".jpg"
        conteudo = await foto.read()
        _validar_mime_foto(conteudo)      # magic bytes + tamanho
        dados["foto_ext"] = salvar_foto(lider_id, conteudo, ext)
    resultado = atualizar_lider(lider_id, dados)
    try:
        from services.audit_service import registrar as audit
        audit("lideranca_editada", "liderancas", usuario=user.get("sub","?"),
              alvo=lider_id, detalhe=f"{nome or vulgo or '?'} · {cargo} · {faccao}")
    except Exception:
        pass
    return resultado


@liderancas_router.delete("/{lider_id}")
def delete_lider(lider_id: str, motivo: str = "engano", data: str = "",
                 user: dict = Depends(require_module("alertas"))):
    """Remove o cartão do mês. motivo: engano (só apaga) | saiu | transferido | alvara | falecido
    (os quatro últimos encerram o tempo na liderança na `data` informada, que pode ser retroativa)."""
    try:
        res = remover_lider(lider_id, motivo, data or None, usuario=user.get("sub", "?"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not res.get("ok"):
        raise HTTPException(status_code=404, detail="Líder não encontrado.")
    try:
        from services.audit_service import registrar as audit
        audit("lideranca_removida", "liderancas", usuario=user.get("sub", "?"), alvo=lider_id,
              detalhe=f"motivo={motivo} data={data or 'hoje'}")
    except Exception:
        pass
    return res


@liderancas_router.get("/foto/{lider_id}")
def get_foto_lider(lider_id: str, user: dict = Depends(get_current_user_media)):
    lider = buscar_lider(lider_id)
    if not lider or not lider.get("foto_ext"):
        raise HTTPException(status_code=404, detail="Foto não encontrada.")
    conteudo = carregar_foto(lider_id, lider["foto_ext"])
    if not conteudo:
        raise HTTPException(status_code=404, detail="Arquivo de foto ausente.")
    ext  = lider["foto_ext"].lstrip(".")
    mime = {"jpg":"image/jpeg","jpeg":"image/jpeg","png":"image/png","webp":"image/webp"}.get(ext,"image/jpeg")
    return Response(content=conteudo, media_type=mime)

# ── Líderes Gerais (facções de rua) ──────────────────────────────────────────

@liderancas_router.get("/rua/metadados")
def get_metadados_rua(user: dict = Depends(get_current_user)):
    """Retorna facções ativas, cargos e status disponíveis para o frontend."""
    return {
        "faccoes":  listar_faccoes_rua(apenas_ativas=False),
        "cargos":   CARGOS_RUA,
        "status":   STATUS_LIDER_RUA,
    }


@liderancas_router.get("/rua/lideres")
def get_lideres_agrupados(user: dict = Depends(require_module("alertas"))):
    """
    Retorna todas as facções com seus líderes embutidos.
    Formato pronto para renderizar a aba Líderes Gerais no frontend.
    """
    return {"faccoes": listar_lideres_agrupados()}


@liderancas_router.post("/rua/faccoes")
def post_faccao(
    nome:  str = Form(...),
    sigla: str = Form(...),
    user: dict = Depends(require_module("alertas")),
):
    """Cria nova facção customizada."""
    try:
        return criar_faccao_rua(nome.strip(), sigla.strip().upper())
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@liderancas_router.delete("/rua/faccoes/{faccao_id}")
def delete_faccao(
    faccao_id: str,
    user: dict = Depends(require_module("alertas")),
):
    """
    Deleta facção e todos os líderes vinculados.
    Funciona inclusive para facções fixas — facções podem acabar.
    """
    if not deletar_faccao_rua(faccao_id):
        raise HTTPException(status_code=404, detail="Facção não encontrada.")
    return {"ok": True}


@liderancas_router.post("/rua/lideres")
async def post_lider_rua(
    faccao_id:  str = Form(...),
    cargo:      str = Form(...),
    nome:       str = Form(""),
    vulgo:      str = Form(""),
    status:     str = Form("Ativo"),
    observacao: str = Form(""),
    foto: UploadFile = File(None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    user: dict = Depends(require_module("alertas")),
):
    dados = {
        "faccao_id":  faccao_id,
        "cargo":      cargo,
        "nome":       nome or None,
        "vulgo":      vulgo or None,
        "status":     status,
        "observacao": observacao or None,
    }
    lider = criar_lider_rua(dados)
    if foto and foto.filename:
        ext      = os.path.splitext(foto.filename)[1] or ".jpg"
        conteudo = await foto.read()
        _validar_mime_foto(conteudo)      # magic bytes + tamanho
        lider = atualizar_lider_rua(
            lider["id"], {"foto_ext": salvar_foto_rua(lider["id"], conteudo, ext)}
        )
    # ── Correlação: novo líder de rua × textos históricos ────────────────────
    if _CORRELACAO_OK and (nome or vulgo):
        background_tasks.add_task(
            _correlacionar_ent,
            nome=nome or vulgo,
            vulgo=vulgo if nome else None,
            fonte_tipo="Liderança (Rua)",
            fonte_id=lider.get("id", "?"),
            metadados={"detalhe": f"Cargo: {cargo} | Facção ID: {faccao_id}",
                       "risco": "ALTO"},
            operador=user.get("sub", "sistema"),
        )
    return lider


@liderancas_router.put("/rua/lideres/{lider_id}")
async def put_lider_rua(
    lider_id:   str,
    faccao_id:  str = Form(...),
    cargo:      str = Form(...),
    nome:       str = Form(""),
    vulgo:      str = Form(""),
    status:     str = Form("Ativo"),
    observacao: str = Form(""),
    foto: UploadFile = File(None),
    user: dict = Depends(require_module("alertas")),
):
    if not buscar_lider_rua(lider_id):
        raise HTTPException(status_code=404, detail="Líder não encontrado.")
    dados = {
        "faccao_id":  faccao_id,
        "cargo":      cargo,
        "nome":       nome or None,
        "vulgo":      vulgo or None,
        "status":     status,
        "observacao": observacao or None,
    }
    if foto and foto.filename:
        ext      = os.path.splitext(foto.filename)[1] or ".jpg"
        conteudo = await foto.read()
        _validar_mime_foto(conteudo)      # magic bytes + tamanho
        dados["foto_ext"] = salvar_foto_rua(lider_id, conteudo, ext)
    return atualizar_lider_rua(lider_id, dados)


@liderancas_router.delete("/rua/lideres/{lider_id}")
def delete_lider_rua_endpoint(
    lider_id: str,
    user: dict = Depends(require_module("alertas")),
):
    if not deletar_lider_rua(lider_id):
        raise HTTPException(status_code=404, detail="Líder não encontrado.")
    return {"ok": True}


@liderancas_router.get("/rua/foto/{lider_id}")
def get_foto_lider_rua(
    lider_id: str,
    user: dict = Depends(get_current_user_media),
):
    lider = buscar_lider_rua(lider_id)
    if not lider or not lider.get("foto_ext"):
        raise HTTPException(status_code=404, detail="Foto não encontrada.")
    conteudo = carregar_foto_rua(lider_id, lider["foto_ext"])
    if not conteudo:
        raise HTTPException(status_code=404, detail="Arquivo de foto ausente.")
    ext  = lider["foto_ext"].lstrip(".")
    mime = {
        "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "png": "image/png",  "webp": "image/webp",
    }.get(ext, "image/jpeg")
    return Response(content=conteudo, media_type=mime)

# ── Geração de PDF ────────────────────────────────────────────────────────────

def _foto_pdf(fb: bytes, largura, altura):
    """Retrato padronizado 4:5 (corte centralizado, ancorado no topo para pegar o rosto).
    As fotos originais são pequenas: amplia com suavização para não pixelar na impressão."""
    from PIL import Image
    from reportlab.platypus import Image as RLImage
    im = Image.open(io.BytesIO(fb)).convert("RGB")
    w, h = im.size
    alvo = 4 / 5
    if w / h > alvo:
        nw = int(h * alvo); x0 = (w - nw) // 2
        im = im.crop((x0, 0, x0 + nw, h))
    else:
        im = im.crop((0, 0, w, int(w / alvo)))
    im = im.resize((im.width * 3, im.height * 3), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=90)
    buf.seek(0)
    return RLImage(buf, width=largura, height=altura)


def _gerar_pdf_unidade(unidade_key: str, competencia: str) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        HRFlowable, Image as RLImage, KeepTogether, CondPageBreak,
    )

    label     = ESTRUTURA[unidade_key]["label"]
    pavilhoes = listar_por_unidade(unidade_key, competencia)
    comp_fmt  = _fmt_competencia(competencia)
    gerado_em = datetime.now().strftime("%d/%m/%Y às %H:%M")

    AZUL   = colors.HexColor("#0F172A")
    GOLD   = colors.HexColor("#B45309")
    CINZA  = colors.HexColor("#64748B")
    BRANCO = colors.white

    S = {
        "titulo":  ParagraphStyle("titulo",  fontSize=14, fontName="Helvetica-Bold",
                                  alignment=TA_CENTER, textColor=BRANCO),
        "sec":     ParagraphStyle("sec",     fontSize=12.5, fontName="Helvetica-Bold", textColor=BRANCO),
        "ala":     ParagraphStyle("ala",     fontSize=10.5, fontName="Helvetica-Bold", textColor=AZUL),
        "vulgo":   ParagraphStyle("vulgo",   fontSize=14.5, leading=17, fontName="Helvetica-Bold", textColor=GOLD),
        "nome":    ParagraphStyle("nome",    fontSize=10, leading=12.5, fontName="Helvetica-Bold", textColor=AZUL),
        "campo":   ParagraphStyle("campo",   fontSize=9, leading=11.5, fontName="Helvetica",      textColor=CINZA),
        "data":    ParagraphStyle("data",    fontSize=8,  fontName="Helvetica",      textColor=colors.HexColor("#94A3B8")),
        "rodape":  ParagraphStyle("rodape",  fontSize=8,  fontName="Helvetica",      textColor=CINZA, alignment=TA_CENTER),
        "sfoto":   ParagraphStyle("sfoto",   fontSize=6,  fontName="Helvetica",      textColor=CINZA, alignment=TA_CENTER),
        "cnt":     ParagraphStyle("cnt",     fontSize=9.5, fontName="Helvetica",      textColor=CINZA, alignment=TA_RIGHT),
        "h1":      ParagraphStyle("h1",      fontSize=11.5, fontName="Helvetica-Bold", textColor=AZUL),
        "h2":      ParagraphStyle("h2",      fontSize=8.5, fontName="Helvetica",      textColor=CINZA, alignment=TA_RIGHT),
    }

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
        topMargin=2*cm, bottomMargin=2*cm, leftMargin=2*cm, rightMargin=2*cm)

    elements = []

    cab = Table([[Paragraph("AGENT BASTOS", S["titulo"])]], colWidths=[17*cm])
    cab.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), AZUL),
        ("TOPPADDING", (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
    ]))
    elements.append(cab)
    elements.append(Spacer(1, 4))

    sub = Table([[
        Paragraph(f"MAPEAMENTO DE LIDERANÇAS — {label.upper()}", S["h1"]),
        Paragraph(f"Competência: {comp_fmt}  ·  {gerado_em}", S["h2"]),
    ]], colWidths=[9.3*cm, 7.7*cm])
    sub.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#F8FAFC")),
        ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("LEFTPADDING", (0,0), (0,-1), 10), ("RIGHTPADDING", (-1,0), (-1,-1), 10),
        ("BOX", (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
    ]))
    elements.append(sub)
    elements.append(Spacer(1, 12))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#E2E8F0")))
    elements.append(Spacer(1, 8))

    for pavilhao, alas in pavilhoes.items():
        total_pav = sum(len(l) for celas in alas.values() for l in celas.values())
        if total_pav == 0:
            continue

        ph = Table([[Paragraph(pavilhao.upper(), S["sec"])]], colWidths=[17*cm])
        ph.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), AZUL),
            ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
            ("LEFTPADDING", (0,0), (-1,-1), 10),
        ]))
        elements.append(CondPageBreak(7.4 * cm))
        elements.append(ph)
        elements.append(Spacer(1, 4))

        for ala, celas in alas.items():
            lideres = [l for lids in celas.values() for l in lids]
            if not lideres:
                continue

            ala_row = Table([[
                Paragraph(ala, S["ala"]),
                Paragraph(f"{len(lideres)} líder{'es' if len(lideres)!=1 else ''}", S["cnt"]),
            ]], colWidths=[13*cm, 4*cm])
            ala_row.setStyle(TableStyle([
                ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#F1F5F9")),
                ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
                ("LEFTPADDING", (0,0), (0,-1), 10), ("RIGHTPADDING", (-1,0), (-1,-1), 10),
                ("BOX", (0,0), (-1,-1), 0.3, colors.HexColor("#E2E8F0")),
            ]))
            elements.append(CondPageBreak(6.2 * cm))
            elements.append(ala_row)

            from xml.sax.saxutils import escape as _esc
            FW, FH = 2.9 * cm, 3.625 * cm          # retrato 4:5
            cards = []
            for lider in lideres:
                faccao  = lider.get("faccao", "")
                cor     = _cor_faccao(faccao)
                cor_bg  = colors.Color(*cor["bg"])
                cor_txt = colors.Color(*cor["text"])
                cor_dot = colors.Color(*cor["dot"])

                criado_iso = lider.get("criado_em", "")
                try:
                    partes = criado_iso[:10].split("-")
                    data_fmt = f"{partes[2]}/{partes[1]}/{partes[0]}"
                except Exception:
                    data_fmt = criado_iso[:10]

                foto_cell = None
                if lider.get("foto_ext"):
                    try:
                        fb = carregar_foto(lider["id"], lider["foto_ext"])
                        if fb:
                            foto_cell = _foto_pdf(fb, FW, FH)
                    except Exception:
                        foto_cell = None
                if foto_cell is None:                      # sem foto: monograma na cor da facção
                    inicial = ((lider.get("vulgo") or lider.get("nome") or "?").strip()[:1] or "?").upper()
                    foto_cell = Table([[Paragraph(_esc(inicial), ParagraphStyle(
                        "mono", fontSize=42, leading=46, fontName="Helvetica-Bold", textColor=cor_txt, alignment=TA_CENTER))]],
                        colWidths=[FW], rowHeights=[FH])
                    foto_cell.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), cor_bg),
                                                   ("VALIGN", (0,0), (-1,-1), "MIDDLE"), ("ALIGN", (0,0), (-1,-1), "CENTER")]))
                moldura = Table([[foto_cell]], colWidths=[FW], rowHeights=[FH])
                moldura.setStyle(TableStyle([("BOX", (0,0), (-1,-1), 1.1, GOLD),
                                             ("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 0),
                                             ("TOPPADDING", (0,0), (-1,-1), 0), ("BOTTOMPADDING", (0,0), (-1,-1), 0)]))

                larg_badge = min(4.7 * cm, max(1.9 * cm, (len(faccao) * 0.21 + 0.8) * cm))
                badge_faccao = Table(
                    [[Paragraph(_esc(faccao), ParagraphStyle("bf", fontSize=9, leading=11, fontName="Helvetica-Bold", textColor=cor_txt))]],
                    colWidths=[larg_badge], hAlign="LEFT")
                badge_faccao.setStyle(TableStyle([
                    ("BACKGROUND", (0,0), (-1,-1), cor_bg),
                    ("TOPPADDING", (0,0), (-1,-1), 2), ("BOTTOMPADDING", (0,0), (-1,-1), 3),
                    ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6),
                    ("BOX", (0,0), (-1,-1), 0.6, cor_dot),
                ]))

                cargo_cela = _esc(lider.get("cargo", ""))
                if lider.get("cela"):
                    cargo_cela += f"  ·  Cela {_esc(str(lider['cela']).replace('Cela ', ''))}"

                dados_inner = [
                    [Paragraph(_esc(lider.get("vulgo") or "—"), S["vulgo"])],
                    [Paragraph(_esc(lider.get("nome") or ""), S["nome"])],
                    [badge_faccao],
                    [Paragraph(cargo_cela, S["campo"])],
                ]
                if lider.get("observacao"):
                    obs = lider["observacao"]
                    if len(obs) > 90: obs = obs[:90] + "..."
                    dados_inner.append([Paragraph(f"Obs: {_esc(obs)}", S["campo"])])
                tp = lider.get("tempo")
                if tp:
                    dados_inner.append([Paragraph(
                        f"Na liderança: <b>{tp['dias']} dia(s)</b>" + (" (desde o registro)" if tp.get("estimado") else ""),
                        S["campo"])])
                dados_inner.append([Paragraph(f"Cadastrado em {data_fmt}", S["data"])])

                dados_tbl = Table(dados_inner, colWidths=[4.5 * cm])
                dados_tbl.setStyle(TableStyle([
                    ("TOPPADDING", (0,0), (-1,-1), 1), ("BOTTOMPADDING", (0,0), (-1,-1), 3),
                    ("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 0),
                ]))
                card = Table([[moldura, dados_tbl]], colWidths=[3.15 * cm, 4.5 * cm])
                card.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"),
                                          ("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 0),
                                          ("TOPPADDING", (0,0), (-1,-1), 0), ("BOTTOMPADDING", (0,0), (-1,-1), 0)]))
                cards.append((card, cor_dot))

            # dois cartões por linha; cada linha não se parte entre páginas
            for k in range(0, len(cards), 2):
                par = cards[k:k + 2]
                fila = [par[0][0], "", par[1][0] if len(par) > 1 else ""]
                linha = Table([fila], colWidths=[8.3 * cm, 0.4 * cm, 8.3 * cm])
                est = [("VALIGN", (0,0), (-1,-1), "TOP"),
                       ("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 0),
                       ("TOPPADDING", (0,0), (-1,-1), 0), ("BOTTOMPADDING", (0,0), (-1,-1), 0)]
                for col, (_, cdot) in zip((0, 2), par):
                    est += [("BOX", (col,0), (col,0), 0.6, colors.HexColor("#CBD5E1")),
                            ("BACKGROUND", (col,0), (col,0), colors.white),
                            ("LEFTPADDING", (col,0), (col,0), 8), ("RIGHTPADDING", (col,0), (col,0), 4),
                            ("TOPPADDING", (col,0), (col,0), 9), ("BOTTOMPADDING", (col,0), (col,0), 9)]
                linha.setStyle(TableStyle(est))
                elements.append(KeepTogether(linha))
                elements.append(Spacer(1, 7))

            elements.append(Spacer(1, 6))

        elements.append(Spacer(1, 10))

    elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#E2E8F0")))
    elements.append(Spacer(1, 4))
    elements.append(Paragraph(
        f"Agent Bastos — AIPEN/SEAP-AM  ·  CONFIDENCIAL  ·  Competência: {comp_fmt}  ·  {gerado_em}",
        S["rodape"]))

    doc.build(elements)
    buf.seek(0)
    return buf.read()


def _chave_cor_faccao_rua(nome: str) -> str:
    """Mapeia o nome de uma facção de rua para a chave de cor do PDF."""
    n = (nome or "").upper()
    if "CV" in n or "COMANDO VERMELHO" in n: return "CV/AM"
    if "PCC" in n:                            return "PCC"
    if "RDA" in n:                            return "RDA"
    if "TDA" in n or "JACK" in n:             return "JACK/TDA"
    return "NEUTROS"


def _gerar_pdf_lideres_rua(faccao_id: str | None = None) -> bytes:
    """Relatório de Líderes Gerais (facções de rua) — mesmo padrão do PDF por unidade."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        HRFlowable, Image as RLImage, KeepTogether,
    )

    if faccao_id:
        f = buscar_faccao_rua(faccao_id)
        if not f:
            raise ValueError("Facção não encontrada.")
        grupos = [{"nome": f["nome"], "sigla": f["sigla"],
                   "lideres": listar_lideres_por_faccao(faccao_id)}]
        escopo = f["nome"].upper()
    else:
        grupos = [g for g in listar_lideres_agrupados() if g["lideres"]]
        escopo = "TODOS OS GRUPOS"

    total     = sum(len(g["lideres"]) for g in grupos)
    gerado_em = datetime.now().strftime("%d/%m/%Y às %H:%M")

    AZUL   = colors.HexColor("#0F172A")
    GOLD   = colors.HexColor("#B45309")
    CINZA  = colors.HexColor("#64748B")
    BORDA  = colors.HexColor("#E2E8F0")
    BRANCO = colors.white

    S = {
        "titulo": ParagraphStyle("titulo", fontSize=14, fontName="Helvetica-Bold", alignment=TA_CENTER, textColor=BRANCO),
        "sec":    ParagraphStyle("sec",    fontSize=13, fontName="Helvetica-Bold", textColor=BRANCO),
        "vulgo":  ParagraphStyle("vulgo",  fontSize=17, leading=20, fontName="Helvetica-Bold", textColor=GOLD),
        "nome":   ParagraphStyle("nome",   fontSize=13, leading=16, fontName="Helvetica-Bold", textColor=AZUL),
        "campo":  ParagraphStyle("campo",  fontSize=10, leading=13, fontName="Helvetica",      textColor=CINZA),
        "data":   ParagraphStyle("data",   fontSize=8.5, fontName="Helvetica",      textColor=colors.HexColor("#94A3B8")),
        "rodape": ParagraphStyle("rodape", fontSize=8.5, fontName="Helvetica",      textColor=CINZA, alignment=TA_CENTER),
        "sfoto":  ParagraphStyle("sfoto",  fontSize=8,  fontName="Helvetica",      textColor=CINZA, alignment=TA_CENTER),
        "cnt":    ParagraphStyle("cnt",    fontSize=10, fontName="Helvetica",      textColor=colors.HexColor("#CBD5E1"), alignment=TA_RIGHT),
        "h1":     ParagraphStyle("h1",     fontSize=12, fontName="Helvetica-Bold", textColor=AZUL),
        "h2":     ParagraphStyle("h2",     fontSize=10, fontName="Helvetica",      textColor=CINZA, alignment=TA_RIGHT),
    }

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
        topMargin=2*cm, bottomMargin=2*cm, leftMargin=2*cm, rightMargin=2*cm)
    el = []

    cab = Table([[Paragraph("AGENT BASTOS", S["titulo"])]], colWidths=[17*cm])
    cab.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), AZUL),
        ("TOPPADDING", (0,0), (-1,-1), 10), ("BOTTOMPADDING", (0,0), (-1,-1), 10)]))
    el += [cab, Spacer(1, 4)]

    sub = Table([[
        Paragraph(f"MAPEAMENTO DE LIDERANÇAS GERAIS — {escopo}", S["h1"]),
        Paragraph(f"{total} líder{'es' if total != 1 else ''}  ·  {gerado_em}", S["h2"]),
    ]], colWidths=[10.5*cm, 6.5*cm])
    sub.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#F8FAFC")),
        ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("LEFTPADDING", (0,0), (0,-1), 10), ("RIGHTPADDING", (-1,0), (-1,-1), 10),
        ("BOX", (0,0), (-1,-1), 0.5, BORDA)]))
    el += [sub, Spacer(1, 12), HRFlowable(width="100%", thickness=0.5, color=BORDA), Spacer(1, 8)]

    if not grupos:
        el.append(Paragraph("Nenhum líder cadastrado.", S["campo"]))

    for g in grupos:
        cor = _cor_faccao(_chave_cor_faccao_rua(g["nome"]))
        cor_bg, cor_txt, cor_dot = (colors.Color(*cor[k]) for k in ("bg", "text", "dot"))

        ph = Table([[Paragraph(f"{g['nome'].upper()} ({g['sigla']})", S["sec"]),
                     Paragraph(f"{len(g['lideres'])} líder{'es' if len(g['lideres']) != 1 else ''}", S["cnt"])]],
                   colWidths=[13*cm, 4*cm])
        ph.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), AZUL),
            ("LINEBEFORE", (0,0), (0,-1), 4, cor_dot),
            ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
            ("LEFTPADDING", (0,0), (0,-1), 10), ("RIGHTPADDING", (-1,0), (-1,-1), 10)]))
        el += [ph, Spacer(1, 4)]

        for lider in g["lideres"]:
            try:
                p = (lider.get("criado_em") or "")[:10].split("-")
                data_fmt = f"{p[2]}/{p[1]}/{p[0]}"
            except Exception:
                data_fmt = (lider.get("criado_em") or "")[:10]

            foto_cell = Paragraph("S/FOTO", S["sfoto"])
            if lider.get("foto_ext"):
                try:
                    fb = carregar_foto_rua(lider["id"], lider["foto_ext"])
                    if fb:
                        foto_cell = RLImage(io.BytesIO(fb), width=2.4*cm, height=3.0*cm)
                except Exception:
                    pass

            badge = Table([[Paragraph(g["nome"], ParagraphStyle(
                "bf", fontSize=9, fontName="Helvetica-Bold", textColor=cor_txt))]], colWidths=[6.5*cm])
            badge.setStyle(TableStyle([
                ("BACKGROUND", (0,0), (-1,-1), cor_bg),
                ("TOPPADDING", (0,0), (-1,-1), 2), ("BOTTOMPADDING", (0,0), (-1,-1), 2),
                ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 5),
                ("BOX", (0,0), (-1,-1), 0.5, cor_dot)]))

            dados = [
                [Paragraph(lider.get("vulgo") or "—", S["vulgo"])],
                [Paragraph(lider.get("nome") or "", S["nome"])],
                [badge],
                [Paragraph(f"{lider.get('cargo') or ''}  ·  Status: {lider.get('status') or '—'}", S["campo"])],
            ]
            if lider.get("observacao"):
                obs = lider["observacao"]
                if len(obs) > 220: obs = obs[:220] + "..."
                dados.append([Paragraph(f"Obs: {obs}", S["campo"])])
            dados.append([Paragraph(f"Cadastrado em: {data_fmt}", S["data"])])

            dt = Table(dados, colWidths=[13.4*cm])
            dt.setStyle(TableStyle([("TOPPADDING", (0,0), (-1,-1), 2),
                ("BOTTOMPADDING", (0,0), (-1,-1), 3), ("LEFTPADDING", (0,0), (-1,-1), 0)]))
            row = Table([[foto_cell, dt]], colWidths=[3.2*cm, 13.8*cm])
            row.setStyle(TableStyle([
                ("VALIGN", (0,0), (-1,-1), "TOP"),
                ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
                ("LEFTPADDING", (0,0), (-1,-1), 8),
                ("BOX", (0,0), (-1,-1), 0.3, BORDA), ("BACKGROUND", (0,0), (-1,-1), BRANCO)]))
            el.append(KeepTogether(row))

        el.append(Spacer(1, 12))

    el += [HRFlowable(width="100%", thickness=0.5, color=BORDA), Spacer(1, 4),
           Paragraph(f"Agent Bastos — AIPEN/SEAP-AM  ·  CONFIDENCIAL  ·  Líderes Gerais  ·  {gerado_em}", S["rodape"])]
    doc.build(el)
    return buf.getvalue()


# ── Endpoints de exportação ───────────────────────────────────────────────────

@liderancas_router.get("/rua/pdf")
def exportar_pdf_lideres_rua(
    faccao_id: str = Query(default=None),
    user: dict = Depends(require_module("alertas")),
):
    """PDF dos Líderes Gerais — todos os grupos ou uma facção (faccao_id)."""
    try:
        pdf = _gerar_pdf_lideres_rua(faccao_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar PDF: {e}")
    if faccao_id:
        sufixo = (buscar_faccao_rua(faccao_id) or {}).get("sigla", "grupo")
    else:
        sufixo = "todos"
    sufixo = "".join(c if c.isalnum() else "_" for c in sufixo)
    ts = datetime.now().strftime("%Y_%m_%d")
    return Response(content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="lideres_gerais_{sufixo}_{ts}.pdf"'})


@liderancas_router.get("/pdf/{unidade}")
def exportar_pdf_unidade(
    unidade: str,
    competencia: str = Query(default=None),
    user: dict = Depends(require_module("alertas")),
):
    if unidade not in ESTRUTURA:
        raise HTTPException(status_code=404, detail="Unidade não encontrada.")
    comp = competencia or (listar_competencias_unidade(unidade) or [_competencia_atual()])[0]
    try:
        pdf     = _gerar_pdf_unidade(unidade, comp)
        label   = ESTRUTURA[unidade]["label"].replace(" ", "_")
        comp_fn = comp.replace("-", "_")
        return Response(content=pdf, media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="liderancas_{label}_{comp_fn}.pdf"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar PDF: {e}")


@liderancas_router.get("/pdf-geral/todas")
def exportar_pdf_geral(
    competencia: str = Query(default=None),
    user: dict = Depends(require_module("alertas")),
):
    comp = competencia or (listar_competencias() or [_competencia_atual()])[0]
    try:
        try:
            from pypdf import PdfWriter, PdfReader
        except ImportError:
            from PyPDF2 import PdfWriter, PdfReader

        writer = PdfWriter()
        for key in ESTRUTURA:
            reader = PdfReader(io.BytesIO(_gerar_pdf_unidade(key, comp)))
            for page in reader.pages:
                writer.add_page(page)

        buf = io.BytesIO()
        writer.write(buf)
        buf.seek(0)
        comp_fn = comp.replace("-", "_")
        return Response(content=buf.read(), media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="liderancas_geral_{comp_fn}.pdf"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar PDF geral: {e}")
