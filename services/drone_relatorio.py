# -*- coding: utf-8 -*-
"""
services/drone_relatorio.py — Relatório de Voo (Missão 31, Fase 2)
─────────────────────────────────────────────────────────────────────────────
Gera o Relatório de Voo em DOCX (editável) e PDF (referência), no mesmo
padrão visual dos laudos do export_service (cabeçalho SEAP/AM, Table Grid).

CONTEÚDO:
  1. Metadados da missão (piloto, drone, SARPAS, perímetro...)
  2. Checklist pré-voo (conformidade documentada)
  3. Estatísticas do voo — calculadas do EXIF (distância, duração, altitude, área)
  4. Croqui do trajeto — desenhado com Pillow (sem dependência de tiles/internet)
  5. Registros fotográficos selecionados (thumbnails já gerados na importação)
  6. Parecer do analista
  7. Rodapé de rastreabilidade: ID do relatório + autor + data/hora

INTEGRIDADE (LGPD/cadeia de custódia):
  O SHA-256 dos bytes finais do arquivo é registrado no log de auditoria
  junto do ID. Qualquer alteração posterior no arquivo quebra o hash —
  dá para provar que o relatório entregue é o que o sistema gerou.
  (O hash não vai DENTRO do documento: seria circular — o hash mudaria
   o conteúdo que ele mesmo mede.)
"""

from __future__ import annotations

import hashlib
import io
import math
import uuid
from datetime import datetime, timezone
from typing import Optional

from services import drone_service
from services.drone_service import _audit  # mesmo fallback seguro do módulo

CHECKLIST_LABELS = {
    "sarpas":  "Autorização SARPAS/DECEA emitida",
    "bateria": "Baterias carregadas e inspecionadas",
    "helices": "Hélices e gimbal verificados",
    "clima":   "Condições meteorológicas avaliadas",
    "area":    "Área de decolagem/pouso isolada",
    "cartao":  "Cartão SD formatado e com espaço",
}

FINALIDADE_LABELS = {
    "vigilancia_perimetro": "Vigilância de Perímetro",
    "cobertura_vegetal":    "Cobertura Vegetal",
    "apoio_operacao":       "Apoio a Operação",
    "outra":                "Outra",
}

_MAX_FOTOS = 6


# ══════════════════════════════════════════════════════════════════════════════
# Estatísticas (mesma matemática do frontend — Haversine)
# ══════════════════════════════════════════════════════════════════════════════

def _haversine(a: dict, b: dict) -> float:
    R = 6371000.0
    rad = math.radians
    dlat, dlon = rad(b["lat"] - a["lat"]), rad(b["lon"] - a["lon"])
    s = math.sin(dlat / 2) ** 2 + \
        math.cos(rad(a["lat"])) * math.cos(rad(b["lat"])) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(s))


def _stats(pontos: list[dict]) -> Optional[dict]:
    if len(pontos) < 2:
        return None
    dist = sum(_haversine(pontos[i - 1], pontos[i]) for i in range(1, len(pontos)))
    lats = [p["lat"] for p in pontos]
    lons = [p["lon"] for p in pontos]
    alts = [p["alt"] for p in pontos if p.get("alt") is not None]
    try:
        t0 = datetime.fromisoformat(pontos[0]["capturado_em"])
        t1 = datetime.fromisoformat(pontos[-1]["capturado_em"])
        dur_min = max(0.0, (t1 - t0).total_seconds() / 60)
    except (TypeError, ValueError):
        dur_min = 0.0
    larg = _haversine({"lat": min(lats), "lon": min(lons)},
                      {"lat": min(lats), "lon": max(lons)})
    altu = _haversine({"lat": min(lats), "lon": min(lons)},
                      {"lat": max(lats), "lon": min(lons)})
    return {
        "n": len(pontos),
        "dist_m": dist,
        "dur_min": dur_min,
        "alt_min": min(alts) if alts else None,
        "alt_max": max(alts) if alts else None,
        "area_ha": larg * altu / 10000.0,
    }


def _fmt_dist(m: float) -> str:
    return f"{m/1000:.2f} km" if m >= 1000 else f"{m:.0f} m"


def _fmt_dur(mn: float) -> str:
    return f"{int(mn//60)}h{int(mn%60):02d}" if mn >= 60 else f"{mn:.0f} min"


# ══════════════════════════════════════════════════════════════════════════════
# Croqui do trajeto (Pillow — funciona em rede fechada, sem tiles)
# ══════════════════════════════════════════════════════════════════════════════

def _croqui_png(pontos: list[dict]) -> Optional[bytes]:
    """Desenha o trajeto em PNG fundo branco (para impressão)."""
    if len(pontos) < 2:
        return None
    from PIL import Image, ImageDraw

    W, H, PAD = 900, 500, 50
    img = Image.new("RGB", (W, H), "white")
    dr = ImageDraw.Draw(img)

    lats = [p["lat"] for p in pontos]
    lons = [p["lon"] for p in pontos]
    min_lat, max_lat = min(lats), max(lats)
    min_lon, max_lon = min(lons), max(lons)
    span_lat = (max_lat - min_lat) or 1e-6
    span_lon = (max_lon - min_lon) or 1e-6

    def x(lon): return PAD + (lon - min_lon) / span_lon * (W - 2 * PAD)
    def y(lat): return H - PAD - (lat - min_lat) / span_lat * (H - 2 * PAD)

    # grade de referência
    for f in (0.25, 0.5, 0.75):
        gx, gy = PAD + f * (W - 2 * PAD), PAD + f * (H - 2 * PAD)
        dr.line([(gx, PAD), (gx, H - PAD)], fill=(226, 232, 240), width=1)
        dr.line([(PAD, gy), (W - PAD, gy)], fill=(226, 232, 240), width=1)
    dr.rectangle([PAD, PAD, W - PAD, H - PAD], outline=(148, 163, 184), width=1)

    # linha do trajeto
    xy = [(x(p["lon"]), y(p["lat"])) for p in pontos]
    dr.line(xy, fill=(217, 119, 6), width=3, joint="curve")
    for i, (px, py) in enumerate(xy):
        cor = (22, 163, 74) if i == 0 else (220, 38, 38) if i == len(xy) - 1 else (217, 119, 6)
        r = 7 if i in (0, len(xy) - 1) else 4
        dr.ellipse([px - r, py - r, px + r, py + r], fill=cor, outline="white", width=2)

    # escala e legenda
    larg_m = _haversine({"lat": min_lat, "lon": min_lon}, {"lat": min_lat, "lon": max_lon})
    dr.text((PAD, H - PAD + 10),
            f"largura da area = {_fmt_dist(larg_m)}  |  "
            f"{min_lat:.5f},{min_lon:.5f} a {max_lat:.5f},{max_lon:.5f}",
            fill=(71, 85, 105))
    dr.text((PAD, 18), "verde = decolagem   vermelho = final   "
            f"{len(pontos)} pontos GPS (EXIF)", fill=(71, 85, 105))

    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def _fotos_para_relatorio(missao: dict, midia_ids: Optional[list[str]]) -> list[dict]:
    """Seleciona as fotos: as pedidas pelo analista, ou as com GPS (até o limite)."""
    midias = missao.get("midias", [])
    if midia_ids:
        sel = [m for m in midias if m["id"] in set(midia_ids)]
    else:
        sel = [m for m in midias if m["tipo"] == "foto" and m.get("lat") is not None]
    return sel[:_MAX_FOTOS]


def _rodape_meta(missao: dict, usuario: str, rel_id: str) -> str:
    agora = datetime.now(timezone.utc).astimezone().strftime("%d/%m/%Y %H:%M")
    return (f"Relatorio {rel_id} | Missao {missao['id'][:8]} | "
            f"Gerado por {usuario} em {agora} | Agent Bastos")


# ══════════════════════════════════════════════════════════════════════════════
# DOCX
# ══════════════════════════════════════════════════════════════════════════════

def _build_docx(missao: dict, stats: Optional[dict], croqui: Optional[bytes],
                fotos: list[dict], parecer: str, usuario: str, rel_id: str) -> bytes:
    from docx import Document
    from docx.shared import Pt, RGBColor, Cm
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    grey = RGBColor(0x6B, 0x72, 0x80)
    doc = Document()
    for section in doc.sections:
        section.top_margin = section.bottom_margin = Cm(2)
        section.left_margin = section.right_margin = Cm(2.5)

    h = doc.add_heading("SEAP/AM - AGENCIA DE INTELIGENCIA PENITENCIARIA", 0)
    h.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub = doc.add_paragraph("RELATORIO DE VOO - OPERACOES DRONE - USO INTERNO")
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub.runs[0].font.color.rgb = grey
    sub.runs[0].font.size = Pt(10)
    doc.add_paragraph()

    # ── Metadados ────────────────────────────────────────────────────────────
    linhas = [
        ("Missao",       missao["nome"],                                  "Data do voo", missao["data_voo"]),
        ("Perimetro",    missao["perimetro"] or "N/A",                    "Finalidade",
         FINALIDADE_LABELS.get(missao["finalidade"], missao["finalidade"])),
        ("Piloto",       missao["piloto"] or "N/A",                       "Drone",       missao["drone_modelo"] or "N/A"),
        ("SARPAS",       missao["sarpas_protocolo"] or "NAO INFORMADO",   "Status",      missao["status"].upper()),
    ]
    table = doc.add_table(rows=len(linhas), cols=4)
    table.style = "Table Grid"
    for i, (k1, v1, k2, v2) in enumerate(linhas):
        for j, (txt, bold) in enumerate([(k1, True), (str(v1), False), (k2, True), (str(v2), False)]):
            cell = table.rows[i].cells[j]
            cell.text = txt
            run = cell.paragraphs[0].runs[0]
            run.bold = bold
            run.font.size = Pt(9)
    doc.add_paragraph()

    # ── Checklist ────────────────────────────────────────────────────────────
    doc.add_heading("CHECKLIST PRE-VOO", 2)
    chk = missao.get("checklist") or {}
    for key, label in CHECKLIST_LABELS.items():
        p = doc.add_paragraph(style="List Bullet")
        ok = bool(chk.get(key))
        r = p.add_run(("[OK] " if ok else "[PENDENTE] ") + label)
        r.font.size = Pt(9)
        if not ok:
            r.font.color.rgb = RGBColor(0xDC, 0x26, 0x26)

    # ── Estatísticas ─────────────────────────────────────────────────────────
    doc.add_heading("DADOS DO VOO (EXTRAIDOS DO EXIF)", 2)
    if stats:
        alt_txt = (f"{stats['alt_min']:.0f} a {stats['alt_max']:.0f} m"
                   if stats["alt_min"] is not None else "N/A")
        pares = [("Pontos GPS", str(stats["n"])),
                 ("Distancia percorrida", _fmt_dist(stats["dist_m"])),
                 ("Duracao", _fmt_dur(stats["dur_min"])),
                 ("Altitude", alt_txt),
                 ("Area varrida (aprox.)", f"{stats['area_ha']:.2f} ha")]
        t2 = doc.add_table(rows=len(pares), cols=2)
        t2.style = "Table Grid"
        for i, (k, v) in enumerate(pares):
            t2.rows[i].cells[0].text = k
            t2.rows[i].cells[1].text = v
            t2.rows[i].cells[0].paragraphs[0].runs[0].bold = True
            for c in t2.rows[i].cells:
                c.paragraphs[0].runs[0].font.size = Pt(9)
    else:
        doc.add_paragraph("Sem dados GPS suficientes nesta missao.").runs[0].font.size = Pt(9)
    doc.add_paragraph()

    # ── Croqui ───────────────────────────────────────────────────────────────
    if croqui:
        doc.add_heading("CROQUI DO TRAJETO", 2)
        doc.add_picture(io.BytesIO(croqui), width=Cm(15.5))

    # ── Fotos ────────────────────────────────────────────────────────────────
    if fotos:
        doc.add_heading("REGISTROS FOTOGRAFICOS", 2)
        for m in fotos:
            thumb = drone_service.caminho_midia(m["id"], thumb=True)
            if not thumb:
                continue
            doc.add_picture(str(thumb), width=Cm(11))
            legenda = doc.add_paragraph(
                f"{m['nome_original']} - {m.get('capturado_em') or 's/ data'}"
                + (f" - {m['lat']:.5f}, {m['lon']:.5f}" if m.get("lat") is not None else "")
                + (f" - alt {m['alt']:.0f} m" if m.get("alt") is not None else ""))
            legenda.runs[0].font.size = Pt(8)
            legenda.runs[0].font.color.rgb = grey

    # ── Parecer ──────────────────────────────────────────────────────────────
    doc.add_heading("PARECER DO ANALISTA", 2)
    p = doc.add_paragraph(parecer.strip() or missao.get("observacoes") or
                          "(sem parecer registrado)")
    p.runs[0].font.size = Pt(10)

    # ── Rodapé ───────────────────────────────────────────────────────────────
    doc.add_paragraph()
    rod = doc.add_paragraph(_rodape_meta(missao, usuario, rel_id))
    rod.runs[0].font.size = Pt(7.5)
    rod.runs[0].font.color.rgb = grey

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ══════════════════════════════════════════════════════════════════════════════
# PDF
# ══════════════════════════════════════════════════════════════════════════════

def _build_pdf(missao: dict, stats: Optional[dict], croqui: Optional[bytes],
               fotos: list[dict], parecer: str, usuario: str, rel_id: str) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib.enums import TA_CENTER
    from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer,
                                    Table, TableStyle, Image as RLImage)

    styles = getSampleStyleSheet()
    st_titulo = ParagraphStyle("t", parent=styles["Title"], fontSize=13, alignment=TA_CENTER)
    st_sub    = ParagraphStyle("s", parent=styles["Normal"], fontSize=8.5,
                               alignment=TA_CENTER, textColor=colors.HexColor("#6B7280"))
    st_h      = ParagraphStyle("h", parent=styles["Heading2"], fontSize=10.5)
    st_txt    = ParagraphStyle("n", parent=styles["Normal"], fontSize=8.5, leading=12)
    st_rod    = ParagraphStyle("r", parent=styles["Normal"], fontSize=6.5,
                               textColor=colors.HexColor("#6B7280"))

    grade = TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#94A3B8")),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ])

    fl = [
        Paragraph("SEAP/AM - AGENCIA DE INTELIGENCIA PENITENCIARIA", st_titulo),
        Paragraph("RELATORIO DE VOO - OPERACOES DRONE - USO INTERNO", st_sub),
        Spacer(1, 12),
        Table([
            ["Missao", missao["nome"], "Data do voo", missao["data_voo"]],
            ["Perimetro", missao["perimetro"] or "N/A", "Finalidade",
             FINALIDADE_LABELS.get(missao["finalidade"], missao["finalidade"])],
            ["Piloto", missao["piloto"] or "N/A", "Drone", missao["drone_modelo"] or "N/A"],
            ["SARPAS", missao["sarpas_protocolo"] or "NAO INFORMADO", "Status", missao["status"].upper()],
        ], colWidths=[2.4 * cm, 6.1 * cm, 2.6 * cm, 5.4 * cm], style=grade),
        Spacer(1, 10),
        Paragraph("CHECKLIST PRE-VOO", st_h),
    ]
    chk = missao.get("checklist") or {}
    for key, label in CHECKLIST_LABELS.items():
        ok = bool(chk.get(key))
        cor = "" if ok else " color='#DC2626'"
        fl.append(Paragraph(f"<font{cor}>{'[OK]' if ok else '[PENDENTE]'} {label}</font>", st_txt))

    fl += [Spacer(1, 10), Paragraph("DADOS DO VOO (EXTRAIDOS DO EXIF)", st_h)]
    if stats:
        alt_txt = (f"{stats['alt_min']:.0f} a {stats['alt_max']:.0f} m"
                   if stats["alt_min"] is not None else "N/A")
        fl.append(Table([
            ["Pontos GPS", str(stats["n"]), "Distancia", _fmt_dist(stats["dist_m"])],
            ["Duracao", _fmt_dur(stats["dur_min"]), "Altitude", alt_txt],
            ["Area varrida", f"{stats['area_ha']:.2f} ha", "", ""],
        ], colWidths=[3 * cm, 5.5 * cm, 3 * cm, 5 * cm], style=grade))
    else:
        fl.append(Paragraph("Sem dados GPS suficientes nesta missao.", st_txt))

    if croqui:
        fl += [Spacer(1, 12), Paragraph("CROQUI DO TRAJETO", st_h),
               RLImage(io.BytesIO(croqui), width=16 * cm, height=16 * cm * 500 / 900)]

    if fotos:
        fl += [Spacer(1, 12), Paragraph("REGISTROS FOTOGRAFICOS", st_h)]
        for m in fotos:
            thumb = drone_service.caminho_midia(m["id"], thumb=True)
            if not thumb:
                continue
            fl.append(Spacer(1, 6))
            fl.append(RLImage(str(thumb), width=11 * cm, height=11 * cm * 0.66))
            legenda = (f"{m['nome_original']} - {m.get('capturado_em') or 's/ data'}"
                       + (f" - {m['lat']:.5f}, {m['lon']:.5f}" if m.get("lat") is not None else ""))
            fl.append(Paragraph(legenda, st_rod))

    fl += [Spacer(1, 12), Paragraph("PARECER DO ANALISTA", st_h),
           Paragraph((parecer.strip() or missao.get("observacoes") or
                      "(sem parecer registrado)").replace("\n", "<br/>"), st_txt),
           Spacer(1, 16),
           Paragraph(_rodape_meta(missao, usuario, rel_id), st_rod)]

    buf = io.BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, topMargin=1.8 * cm, bottomMargin=1.8 * cm,
                      leftMargin=2 * cm, rightMargin=2 * cm).build(fl)
    return buf.getvalue()


# ══════════════════════════════════════════════════════════════════════════════
# API pública do módulo
# ══════════════════════════════════════════════════════════════════════════════

def gerar_relatorio(mid: str, formato: str = "docx", parecer: str = "",
                    midia_ids: Optional[list[str]] = None,
                    usuario: str = "sistema") -> tuple[bytes, str]:
    """
    Gera o relatório e registra o SHA-256 no log de auditoria.
    Retorna (bytes, nome_do_arquivo). Levanta ValueError se a missão não existir.
    """
    if formato not in ("docx", "pdf"):
        raise ValueError("Formato deve ser docx ou pdf")

    missao = drone_service.obter_missao(mid)
    if not missao:
        raise ValueError("Missão não encontrada")

    pontos = drone_service.trajeto_missao(mid)
    stats = _stats(pontos)
    croqui = _croqui_png(pontos)
    fotos = _fotos_para_relatorio(missao, midia_ids)
    rel_id = str(uuid.uuid4())[:8].upper()

    builder = _build_docx if formato == "docx" else _build_pdf
    dados = builder(missao, stats, croqui, fotos, parecer, usuario, rel_id)

    digest = hashlib.sha256(dados).hexdigest()
    _audit(evento="relatorio_voo_gerado", categoria="drone", usuario=usuario,
           alvo=mid, detalhe=f"rel {rel_id} ({formato}, {len(fotos)} fotos, sha256={digest[:16]}...)")

    slug = "".join(c if c.isalnum() else "_" for c in missao["nome"])[:40]
    nome = f"Relatorio_Voo_{slug}_{rel_id}.{formato}"
    return dados, nome
