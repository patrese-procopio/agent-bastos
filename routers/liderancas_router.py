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
from fastapi import APIRouter, Form, File, UploadFile, HTTPException, Query, Depends
from fastapi.responses import Response

from modules.liderancas import (
    ESTRUTURA, FACCOES, CARGOS_POR_FACCAO, estrutura_com_celas,
    criar_lider, atualizar_lider, deletar_lider,
    buscar_lider, listar_por_unidade, listar_todas_unidades,
    listar_competencias, listar_competencias_unidade,
    salvar_foto, carregar_foto, FOTOS_DIR,
    _competencia_atual,
)
from dependencies import get_current_user, get_current_user_media, require_module

router = APIRouter(prefix="/api/liderancas", tags=["liderancas"])
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
    foto: UploadFile = File(None),
    user: dict = Depends(require_module("alertas")),
):
    dados = {
        "unidade": unidade, "pavilhao": pavilhao, "ala": ala, "cela": cela,
        "faccao": faccao, "cargo": cargo,
        "nome": nome or None, "vulgo": vulgo or None,
        "observacao": observacao or None,
        "competencia": competencia or _competencia_atual(),
        "foto_ext": None,
    }
    lider = criar_lider(dados)
    if foto and foto.filename:
        ext = os.path.splitext(foto.filename)[1] or ".jpg"
        conteudo = await foto.read()
        if len(conteudo) > 5 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Foto maior que 5 MB.")
        lider = atualizar_lider(lider["id"], {"foto_ext": salvar_foto(lider["id"], conteudo, ext)})
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
        if len(conteudo) > 5 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Foto maior que 5 MB.")
        dados["foto_ext"] = salvar_foto(lider_id, conteudo, ext)
    return atualizar_lider(lider_id, dados)


@liderancas_router.delete("/{lider_id}")
def delete_lider(lider_id: str, user: dict = Depends(require_module("alertas"))):
    if not deletar_lider(lider_id):
        raise HTTPException(status_code=404, detail="Líder não encontrado.")
    return {"ok": True}


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


# ── Geração de PDF ────────────────────────────────────────────────────────────

def _gerar_pdf_unidade(unidade_key: str, competencia: str) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        HRFlowable, Image as RLImage,
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
        "sec":     ParagraphStyle("sec",     fontSize=11, fontName="Helvetica-Bold", textColor=BRANCO),
        "ala":     ParagraphStyle("ala",     fontSize=9,  fontName="Helvetica-Bold", textColor=AZUL),
        "vulgo":   ParagraphStyle("vulgo",   fontSize=13, fontName="Helvetica-Bold", textColor=GOLD),
        "nome":    ParagraphStyle("nome",    fontSize=10, fontName="Helvetica-Bold", textColor=AZUL),
        "campo":   ParagraphStyle("campo",   fontSize=8,  fontName="Helvetica",      textColor=CINZA),
        "data":    ParagraphStyle("data",    fontSize=7,  fontName="Helvetica",      textColor=colors.HexColor("#94A3B8")),
        "rodape":  ParagraphStyle("rodape",  fontSize=7,  fontName="Helvetica",      textColor=CINZA, alignment=TA_CENTER),
        "sfoto":   ParagraphStyle("sfoto",   fontSize=6,  fontName="Helvetica",      textColor=CINZA, alignment=TA_CENTER),
        "cnt":     ParagraphStyle("cnt",     fontSize=8,  fontName="Helvetica",      textColor=CINZA, alignment=TA_RIGHT),
        "h1":      ParagraphStyle("h1",      fontSize=10, fontName="Helvetica-Bold", textColor=AZUL),
        "h2":      ParagraphStyle("h2",      fontSize=8,  fontName="Helvetica",      textColor=CINZA, alignment=TA_RIGHT),
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
    ]], colWidths=[10*cm, 7*cm])
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
            elements.append(ala_row)

            for lider in lideres:
                faccao  = lider.get("faccao", "")
                cargo   = lider.get("cargo", "")
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

                foto_cell = Paragraph("S/FOTO", S["sfoto"])
                if lider.get("foto_ext"):
                    try:
                        fb = carregar_foto(lider["id"], lider["foto_ext"])
                        if fb:
                            foto_cell = RLImage(io.BytesIO(fb), width=1.6*cm, height=2*cm)
                    except Exception:
                        pass

                badge_faccao = Table(
                    [[Paragraph(faccao, ParagraphStyle(
                        "bf", fontSize=7, fontName="Helvetica-Bold", textColor=cor_txt))]],
                    colWidths=[3.5*cm]
                )
                badge_faccao.setStyle(TableStyle([
                    ("BACKGROUND", (0,0), (-1,-1), cor_bg),
                    ("TOPPADDING", (0,0), (-1,-1), 2),
                    ("BOTTOMPADDING", (0,0), (-1,-1), 2),
                    ("LEFTPADDING", (0,0), (-1,-1), 5),
                    ("RIGHTPADDING", (0,0), (-1,-1), 5),
                    ("BOX", (0,0), (-1,-1), 0.5, cor_dot),
                    ("ROUNDEDCORNERS", [3,3,3,3]),
                ]))

                cargo_cela = cargo
                if lider.get("cela"):
                    cargo_cela += f"  ·  Custódia: {lider['cela']}"

                dados_inner = [
                    [Paragraph(lider.get("vulgo") or "—", S["vulgo"])],
                    [Paragraph(lider.get("nome") or "", S["nome"])],
                    [badge_faccao],
                    [Paragraph(cargo_cela, S["campo"])],
                ]
                if lider.get("observacao"):
                    obs = lider["observacao"]
                    if len(obs) > 120: obs = obs[:120] + "..."
                    dados_inner.append([Paragraph(f"Obs: {obs}", S["campo"])])

                dados_inner.append([Paragraph(f"Cadastrado em: {data_fmt}", S["data"])])

                dados_tbl = Table(dados_inner, colWidths=[14*cm])
                dados_tbl.setStyle(TableStyle([
                    ("TOPPADDING", (0,0), (-1,-1), 1),
                    ("BOTTOMPADDING", (0,0), (-1,-1), 2),
                    ("LEFTPADDING", (0,0), (-1,-1), 0),
                ]))

                row_tbl = Table([[foto_cell, dados_tbl]], colWidths=[2.2*cm, 14.8*cm])
                row_tbl.setStyle(TableStyle([
                    ("VALIGN", (0,0), (-1,-1), "TOP"),
                    ("TOPPADDING", (0,0), (-1,-1), 8),
                    ("BOTTOMPADDING", (0,0), (-1,-1), 8),
                    ("LEFTPADDING", (0,0), (-1,-1), 8),
                    ("BOX", (0,0), (-1,-1), 0.3, colors.HexColor("#E2E8F0")),
                    ("BACKGROUND", (0,0), (-1,-1), colors.white),
                ]))
                elements.append(row_tbl)

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


# ── Endpoints de exportação ───────────────────────────────────────────────────

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