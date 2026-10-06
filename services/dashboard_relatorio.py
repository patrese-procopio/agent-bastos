# -*- coding: utf-8 -*-
"""
dashboard_relatorio.py — Relatório de Produtividade (PDF corporativo)
Agent Bastos | AIPEN/SEAP-AM

Gera, a partir do dashboard_bastos.db, um relatório pensado para o setor de
auditoria: resumo executivo em linguagem simples, indicadores, evolução mensal,
produção por tipo / núcleo / unidade, pedidos de pesquisa social (SLA de
resposta) e anexo com a relação nominal dos documentos lançados.

Todo número do relatório vem direto do banco — nenhum valor é estimado.
"""

import io
import sqlite3
from datetime import datetime, date

MESES_FULL = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho",
              "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
MESES_ABR = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]


def _fmt_data(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        return datetime.strptime(iso[:10], "%Y-%m-%d").strftime("%d/%m/%Y")
    except Exception:
        return iso


def _pct(parte: float, total: float) -> str:
    return f"{(parte / total * 100):.1f}%".replace(".", ",") if total else "—"


def _num(n) -> str:
    return f"{int(n):,}".replace(",", ".")


def _esc(t) -> str:
    return (str(t if t is not None else "")
            .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


# ── Coleta de dados ──────────────────────────────────────────────────────────

def coletar(db_path: str, ano: int, mes: int | None) -> dict:
    """mes=None → relatório anual; mes=1..12 → relatório mensal."""
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    try:
        docs = [dict(r) for r in con.execute(
            "SELECT d.id, d.nome_arquivo, d.mes, d.ano, d.observacao, d.created_at, "
            "t.codigo AS tipo, t.nome AS tipo_nome, np.sigla AS nucleo, ur.sigla AS unidade "
            "FROM documentos d "
            "JOIN tipos_documento t ON t.id = d.tipo_id "
            "JOIN unidades np ON np.id = d.nucleo_produtor_id "
            "LEFT JOIN unidades ur ON ur.id = d.unidade_ref_id "
            "WHERE d.ano = ? ORDER BY d.mes, d.created_at", (ano,)).fetchall()]

        # Referência de comparação (mês anterior / ano anterior)
        if mes:
            m_ant, a_ant = (mes - 1, ano) if mes > 1 else (12, ano - 1)
            ant = con.execute("SELECT COUNT(*) n FROM documentos WHERE ano=? AND mes=?",
                              (a_ant, m_ant)).fetchone()["n"]
            ant_label = f"{MESES_FULL[m_ant]}/{a_ant}"
        else:
            # Ano em curso: compara só os meses já decorridos (evita comparar 4 meses com 12).
            hoje = datetime.now()
            m_lim = hoje.month if ano == hoje.year else 12
            # Só até o último mês com lançamento: meses ainda não lançados não entram na comparação.
            if docs:
                m_lim = min(m_lim, max(d["mes"] for d in docs))
            ant = con.execute("SELECT COUNT(*) n FROM documentos WHERE ano=? AND mes<=?",
                              (ano - 1, m_lim)).fetchone()["n"]
            ant_label = (f"{MESES_ABR[1]}–{MESES_ABR[m_lim]}/{ano - 1}" if m_lim < 12 else str(ano - 1))

        tipos = [dict(r) for r in con.execute(
            "SELECT codigo, nome FROM tipos_documento ORDER BY nome").fetchall()]

        try:
            pedidos = [dict(r) for r in con.execute(
                "SELECT * FROM pedidos_pesquisa ORDER BY data_pedido").fetchall()]
        except sqlite3.OperationalError:
            pedidos = []
    finally:
        con.close()

    # Pedidos no período (por data do pedido)
    def _no_periodo(p):
        try:
            d = datetime.strptime(p["data_pedido"][:10], "%Y-%m-%d")
        except Exception:
            return False
        return d.year == ano and (mes is None or d.month == mes)
    pedidos_p = [p for p in pedidos if _no_periodo(p)]

    docs_p = [d for d in docs if mes is None or d["mes"] == mes]
    m_lim = (datetime.now().month if ano == datetime.now().year else 12)
    if docs:
        m_lim = min(m_lim, max(d["mes"] for d in docs))
    docs_cmp = docs_p if mes else [d for d in docs if d["mes"] <= m_lim]
    return {"ano": ano, "mes": mes, "docs_ano": docs, "docs": docs_p, "docs_cmp": docs_cmp, "anterior": ant,
            "anterior_label": ant_label, "tipos": tipos, "pedidos": pedidos_p}


def _contar(rows, chave):
    out: dict = {}
    for r in rows:
        k = r.get(chave) or "—"
        out[k] = out.get(k, 0) + 1
    return out


def _resumo_pedidos(pedidos: list[dict]) -> dict:
    total = len(pedidos)
    resp = [p for p in pedidos if p.get("respondido")]
    prazos = []
    for p in resp:
        try:
            d1 = datetime.strptime(p["data_pedido"][:10], "%Y-%m-%d").date()
            d2 = datetime.strptime(p["data_resposta"][:10], "%Y-%m-%d").date()
            prazos.append(max((d2 - d1).days, 0))
        except Exception:
            pass
    hoje = date.today()
    abertos = []
    for p in pedidos:
        if not p.get("respondido"):
            try:
                abertos.append((hoje - datetime.strptime(p["data_pedido"][:10], "%Y-%m-%d").date()).days)
            except Exception:
                pass
    return {
        "total": total, "respondidos": len(resp), "pendentes": total - len(resp),
        "prazo_medio": (sum(prazos) / len(prazos)) if prazos else None,
        "prazo_max": max(prazos) if prazos else None,
        "mais_antigo_aberto": max(abertos) if abertos else None,
    }


# ── PDF ──────────────────────────────────────────────────────────────────────

def gerar_pdf(db_path: str, ano: int, mes: int | None, gerado_por: str = "") -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.platypus import (
        BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
        PageBreak, KeepTogether, HRFlowable,
    )
    from reportlab.graphics.shapes import Drawing, Rect, String
    from reportlab.graphics.charts.barcharts import VerticalBarChart

    dados = coletar(db_path, ano, mes)
    docs, docs_ano = dados["docs"], dados["docs_ano"]
    total = len(docs)
    periodo_label = f"{MESES_FULL[mes]} de {ano}" if mes else f"Ano de {ano}"
    gerado_em = datetime.now().strftime("%d/%m/%Y às %H:%M")

    NAVY = colors.HexColor("#0F2A4A")
    GOLD = colors.HexColor("#B45309")
    CINZA = colors.HexColor("#475569")
    CLARO = colors.HexColor("#F1F5F9")
    BORDA = colors.HexColor("#CBD5E1")
    VERDE = colors.HexColor("#15803D")
    VERM = colors.HexColor("#B91C1C")
    LARG = 17.4 * cm

    S = {
        "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=13, leading=16, textColor=NAVY,
                             spaceBefore=14, spaceAfter=6),
        "body": ParagraphStyle("body", fontName="Helvetica", fontSize=10.5, leading=15,
                               textColor=colors.HexColor("#1E293B"), alignment=TA_LEFT),
        "nota": ParagraphStyle("nota", fontName="Helvetica-Oblique", fontSize=9, leading=12, textColor=CINZA),
        "cel": ParagraphStyle("cel", fontName="Helvetica", fontSize=9.5, leading=12),
        "celb": ParagraphStyle("celb", fontName="Helvetica-Bold", fontSize=9.5, leading=12),
        "celm": ParagraphStyle("celm", fontName="Helvetica", fontSize=8.8, leading=11),
        "th": ParagraphStyle("th", fontName="Helvetica-Bold", fontSize=9.5, leading=12, textColor=colors.white),
        "thc": ParagraphStyle("thc", fontName="Helvetica-Bold", fontSize=9.5, leading=12,
                              textColor=colors.white, alignment=TA_CENTER),
        "kpi_v": ParagraphStyle("kv", fontName="Helvetica-Bold", fontSize=22, leading=26, textColor=NAVY,
                                alignment=TA_CENTER),
        "kpi_l": ParagraphStyle("kl", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=CINZA,
                                alignment=TA_CENTER),
        "kpi_s": ParagraphStyle("ks", fontName="Helvetica", fontSize=9, leading=11, textColor=CINZA,
                                alignment=TA_CENTER),
        "capa_t": ParagraphStyle("ct", fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=NAVY),
        "capa_s": ParagraphStyle("cs", fontName="Helvetica", fontSize=12, leading=16, textColor=CINZA),
    }

    # ── Página: faixa superior + rodapé numerado ──
    class _Canvas(rl_canvas.Canvas):
        def __init__(self, *a, **k):
            super().__init__(*a, **k)
            self._saved = []

        def showPage(self):
            self._saved.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            n = len(self._saved)
            for st in self._saved:
                self.__dict__.update(st)
                self._decor(n)
                super().showPage()
            super().save()

        def _decor(self, n):
            w, h = A4
            self.setFillColor(NAVY)
            self.rect(0, h - 1.15 * cm, w, 1.15 * cm, stroke=0, fill=1)
            self.setFillColor(GOLD)
            self.rect(0, h - 1.25 * cm, w, 0.1 * cm, stroke=0, fill=1)
            self.setFillColor(colors.white)
            self.setFont("Helvetica-Bold", 9.5)
            self.drawString(1.8 * cm, h - 0.75 * cm, "SEAP/AM  ·  AIPEN  ·  RELATÓRIO DE PRODUTIVIDADE")
            self.setFont("Helvetica", 9.5)
            self.drawRightString(w - 1.8 * cm, h - 0.75 * cm, periodo_label)
            self.setStrokeColor(BORDA)
            self.line(1.8 * cm, 1.5 * cm, w - 1.8 * cm, 1.5 * cm)
            self.setFillColor(CINZA)
            self.setFont("Helvetica", 8.5)
            self.drawString(1.8 * cm, 1.0 * cm,
                            f"Agent Bastos  ·  Documento de uso interno  ·  Gerado em {gerado_em}")
            self.drawRightString(w - 1.8 * cm, 1.0 * cm, f"Página {self._pageNumber} de {n}")

    buf = io.BytesIO()
    doc = BaseDocTemplate(buf, pagesize=A4, leftMargin=1.8 * cm, rightMargin=1.8 * cm,
                          topMargin=2.0 * cm, bottomMargin=2.0 * cm,
                          title=f"Relatório de Produtividade — {periodo_label}",
                          author="Agent Bastos — AIPEN/SEAP-AM")
    doc.addPageTemplates([PageTemplate(id="p", frames=[Frame(
        doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f",
        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)])])

    def P(t, st="cel"):
        return Paragraph(t, S[st])

    def tabela(cab, linhas, larguras, alinh_dir=(), total_row=False, repetir=True):
        data = [[Paragraph(_esc(c), S["thc" if i in alinh_dir else "th"]) for i, c in enumerate(cab)]]
        for l in linhas:
            data.append([c if hasattr(c, "wrap") else Paragraph(_esc(c), S["cel"]) for c in l])
        t = Table(data, colWidths=larguras, repeatRows=1 if repetir else 0)
        est = [
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("LINEBELOW", (0, 0), (-1, -1), 0.4, BORDA),
            ("BOX", (0, 0), (-1, -1), 0.6, BORDA),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CLARO]),
        ]
        for c in alinh_dir:
            est.append(("ALIGN", (c, 0), (c, -1), "RIGHT"))
        if total_row:
            est += [("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#E2E8F0")),
                    ("LINEABOVE", (0, -1), (-1, -1), 1, NAVY)]
        t.setStyle(TableStyle(est))
        return t

    def dir_(txt, bold=False):
        return Paragraph(_esc(txt), ParagraphStyle("r", parent=S["celb" if bold else "cel"], alignment=TA_RIGHT))

    def barras_h(itens, cor, largura=LARG, rotulo_w=5.2 * cm):
        """itens: [(rótulo, valor)] → Drawing de barras horizontais com valor."""
        if not itens:
            return Spacer(1, 1)
        mx = max(v for _, v in itens) or 1
        h_lin = 0.62 * cm
        d = Drawing(largura, h_lin * len(itens) + 4)
        area = largura - rotulo_w - 1.6 * cm
        for i, (rot, v) in enumerate(itens):
            y = d.height - (i + 1) * h_lin
            d.add(String(0, y + 4, (rot[:34] + "…") if len(rot) > 35 else rot,
                         fontName="Helvetica", fontSize=9.5, fillColor=colors.HexColor("#1E293B")))
            w = max(area * v / mx, 2 if v else 0)
            d.add(Rect(rotulo_w, y + 2, w, h_lin - 5, fillColor=cor, strokeColor=None))
            d.add(String(rotulo_w + w + 5, y + 4, _num(v), fontName="Helvetica-Bold", fontSize=9.5,
                         fillColor=NAVY))
        return d

    el = []

    # ── CAPA / identificação ──
    el += [Spacer(1, 0.4 * cm),
           P("SECRETARIA DE ESTADO DE ADMINISTRAÇÃO PENITENCIÁRIA — SEAP/AM", "capa_s"),
           P("Agência de Inteligência Penitenciária — AIPEN", "capa_s"), Spacer(1, 10),
           P("Relatório de Produtividade", "capa_t"),
           P(f"Produção documental e atendimento de pedidos · {periodo_label}", "capa_s"),
           Spacer(1, 8), HRFlowable(width="100%", thickness=1.2, color=GOLD), Spacer(1, 6)]
    meta = Table([
        [P("<b>Período analisado</b>"), P(periodo_label), P("<b>Gerado em</b>"), P(gerado_em)],
        [P("<b>Fonte dos dados</b>"), P("Sistema Agent Bastos — lançamentos registrados"),
         P("<b>Gerado por</b>"), P(_esc(gerado_por or "—"))],
    ], colWidths=[3.9 * cm, 5.6 * cm, 2.7 * cm, 5.2 * cm])
    meta.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), CLARO), ("BOX", (0, 0), (-1, -1), 0.6, BORDA),
                              ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                              ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    el += [meta, Spacer(1, 4)]

    # ── 1. Resumo executivo ──
    var = len(dados["docs_cmp"]) - dados["anterior"]
    var_txt = (f"{'+' if var >= 0 else '−'}{abs(var)}"
               + (f" ({'+' if var >= 0 else '−'}{abs(var) / dados['anterior'] * 100:.1f}%)".replace(".", ",")
                  if dados["anterior"] else ""))
    por_tipo = sorted(_contar(docs, "tipo_nome").items(), key=lambda x: -x[1])
    por_nuc = sorted(_contar(docs, "nucleo").items(), key=lambda x: -x[1])
    nuc_ativos = len({d["nucleo"] for d in docs})
    meses_com = len({d["mes"] for d in docs_ano})
    media_mensal = (len(docs_ano) / meses_com) if meses_com else 0

    el.append(P("1. Resumo executivo", "h1"))
    kpis = [
        ("DOCUMENTOS NO PERÍODO", _num(total), periodo_label),
        ("VARIAÇÃO", var_txt if dados["anterior"] or total else "—", f"vs. {dados['anterior_label']} ({_num(dados['anterior'])})"),
        ("NÚCLEOS PRODUTORES", str(nuc_ativos), "com produção no período"),
        ("MÉDIA MENSAL (ANO)", f"{media_mensal:.1f}".replace(".", ","), f"{_num(len(docs_ano))} docs em {meses_com} mês(es)"),
    ]
    celulas = [[[P(v, "kpi_v"), P(l, "kpi_l"), P(s, "kpi_s")] for l, v, s in kpis]]
    kt = Table(celulas, colWidths=[LARG / 4] * 4)
    kt.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, BORDA), ("INNERGRID", (0, 0), (-1, -1), 0.6, BORDA),
                            ("LINEABOVE", (0, 0), (-1, 0), 3, GOLD), ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                            ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                            ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    el += [kt, Spacer(1, 8)]

    if total:
        frases = [f"No período analisado (<b>{_esc(periodo_label)}</b>) foram registrados <b>{_num(total)}</b> documentos "
                  f"produzidos por <b>{nuc_ativos}</b> núcleo(s)."]
        if dados["anterior"]:
            frases.append(f"Em relação a {_esc(dados['anterior_label'])} ({_num(dados['anterior'])} documentos"
                          + ("; comparação feita apenas com os meses já lançados em " + str(ano) if mes is None and dados["anterior_label"] != str(ano - 1) else "")
                          + "), "
                          f"houve {'aumento' if var > 0 else 'redução' if var < 0 else 'estabilidade'}"
                          + (f" de {abs(var)} documento(s)." if var else "."))
        if por_tipo:
            frases.append(f"O tipo mais produzido foi <b>{_esc(por_tipo[0][0])}</b> "
                          f"({_num(por_tipo[0][1])}, {_pct(por_tipo[0][1], total)} do total).")
        if por_nuc:
            frases.append(f"O núcleo com maior produção foi <b>{_esc(por_nuc[0][0])}</b> "
                          f"({_num(por_nuc[0][1])}, {_pct(por_nuc[0][1], total)}).")
        el.append(P(" ".join(frases), "body"))
    else:
        el.append(P("Não há documentos lançados no período selecionado.", "body"))

    # ── 2. Evolução mensal ──
    el.append(P(f"2. Evolução mensal da produção — {ano}", "h1"))
    serie = [sum(1 for d in docs_ano if d["mes"] == m) for m in range(1, 13)]
    if any(serie):
        d = Drawing(LARG, 6.2 * cm)
        ch = VerticalBarChart()
        ch.x, ch.y, ch.width, ch.height = 30, 22, LARG - 45, 6.2 * cm - 40
        ch.data = [serie]
        ch.categoryAxis.categoryNames = MESES_ABR[1:]
        ch.categoryAxis.labels.fontName = "Helvetica"
        ch.categoryAxis.labels.fontSize = 9.5
        ch.valueAxis.valueMin = 0
        ch.valueAxis.valueMax = max(serie) * 1.18 or 1
        ch.valueAxis.labels.fontSize = 9
        ch.valueAxis.gridStrokeColor = BORDA
        ch.valueAxis.visibleGrid = True
        ch.bars[0].fillColor = NAVY
        ch.barWidth = 14
        ch.barLabelFormat = "%d"
        ch.barLabels.fontName = "Helvetica-Bold"
        ch.barLabels.fontSize = 9.5
        ch.barLabels.nudge = 7
        if mes and serie[mes - 1]:
            ch.bars[(0, mes - 1)].fillColor = GOLD
        d.add(ch)
        el.append(d)
        el.append(P("Barra dourada = mês analisado." if mes else
                    "Cada barra representa o total de documentos lançados no mês.", "nota"))
    linhas = [[MESES_FULL[m], dir_(_num(serie[m - 1])),
               dir_(_pct(serie[m - 1], len(docs_ano)) if docs_ano else "—")] for m in range(1, 13)]
    linhas.append([P("<b>Total do ano</b>"), dir_(_num(len(docs_ano)), True), dir_("100%" if docs_ano else "—", True)])
    el += [Spacer(1, 6), tabela(["Mês", "Documentos", "% do ano"], linhas,
                                [8 * cm, 4.7 * cm, 4.7 * cm], alinh_dir=(1, 2), total_row=True)]

    # ── 3. Por tipo ──
    el.append(P(f"3. Produção por tipo de documento — {periodo_label}", "h1"))
    if por_tipo:
        el.append(barras_h(por_tipo, NAVY))
        el.append(Spacer(1, 6))
        ano_por_tipo = _contar(docs_ano, "tipo_nome")
        linhas = [[n, dir_(_num(v)), dir_(_pct(v, total)), dir_(_num(ano_por_tipo.get(n, 0)))]
                  for n, v in por_tipo]
        linhas.append([P("<b>Total</b>"), dir_(_num(total), True), dir_("100%", True),
                       dir_(_num(len(docs_ano)), True)])
        el.append(tabela(["Tipo de documento", "No período", "% do período", f"Acumulado {ano}"],
                         linhas, [7.4 * cm, 3.2 * cm, 3.4 * cm, 3.4 * cm], alinh_dir=(1, 2, 3), total_row=True))
    else:
        el.append(P("Sem documentos no período.", "body"))

    if mes is None and docs_ano:
        el.append(P("Matriz mensal por tipo de documento", "h1"))
        tipos_nome = [n for n, _ in sorted(_contar(docs_ano, "tipo_nome").items(), key=lambda x: -x[1])]
        cab = ["Tipo"] + MESES_ABR[1:] + ["Total"]
        linhas = []
        for n in tipos_nome:
            linhas.append([Paragraph(_esc(n), S["celm"])] + [
                dir_(str(c) if (c := sum(1 for d in docs_ano if d["tipo_nome"] == n and d["mes"] == m)) else "·")
                for m in range(1, 13)] + [dir_(str(_contar(docs_ano, "tipo_nome")[n]), True)])
        linhas.append([Paragraph("<b>Total</b>", S["celm"])] + [dir_(str(serie[m - 1]), True) for m in range(1, 13)]
                      + [dir_(str(len(docs_ano)), True)])
        mt = tabela(cab, linhas, [3.9 * cm] + [0.97 * cm] * 12 + [1.86 * cm], alinh_dir=tuple(range(1, 14)),
                    total_row=True)
        mt.setStyle(TableStyle([("LEFTPADDING", (1, 0), (-1, -1), 2), ("RIGHTPADDING", (1, 0), (-1, -1), 3),
                                ("FONTSIZE", (0, 0), (-1, -1), 8.5)]))
        el.append(mt)

    # ── 4. Por núcleo ──
    el.append(P(f"4. Produção por núcleo — {periodo_label}", "h1"))
    if por_nuc:
        nomes_nuc = {}
        try:
            con = sqlite3.connect(db_path)
            nomes_nuc = {r[0]: r[1] for r in con.execute("SELECT sigla,nome FROM unidades WHERE tipo='nucleo'")}
            con.close()
        except Exception:
            pass
        el.append(barras_h([(f"{s}", v) for s, v in por_nuc], colors.HexColor("#1D4ED8")))
        el.append(Spacer(1, 6))
        linhas = [[f"{s} — {nomes_nuc.get(s, '')}".strip(" —"), dir_(_num(v)), dir_(_pct(v, total))] for s, v in por_nuc]
        linhas.append([P("<b>Total</b>"), dir_(_num(total), True), dir_("100%", True)])
        el.append(tabela(["Núcleo", "Documentos", "% do período"], linhas,
                         [10 * cm, 3.7 * cm, 3.7 * cm], alinh_dir=(1, 2), total_row=True))
        # matriz núcleo × tipo
        tipos_nome = [n for n, _ in por_tipo]
        if len(tipos_nome) > 1 and len(por_nuc) > 0:
            el.append(P("Núcleo × tipo de documento (período)", "h1"))
            cab = ["Núcleo"] + [(t[:16] + "…") if len(t) > 17 else t for t in tipos_nome] + ["Total"]
            larg_t = (LARG - 2.6 * cm - 1.6 * cm) / len(tipos_nome)
            linhas = []
            for s, v in por_nuc:
                linhas.append([s] + [dir_(str(c) if (c := sum(1 for d in docs if d["nucleo"] == s and d["tipo_nome"] == t)) else "·")
                                      for t in tipos_nome] + [dir_(str(v), True)])
            nt = tabela(cab, linhas, [2.6 * cm] + [larg_t] * len(tipos_nome) + [1.6 * cm],
                        alinh_dir=tuple(range(1, len(tipos_nome) + 2)))
            nt.setStyle(TableStyle([("LEFTPADDING", (1, 0), (-1, -1), 3), ("RIGHTPADDING", (1, 0), (-1, -1), 4)]))
            el.append(nt)
    else:
        el.append(P("Sem documentos no período.", "body"))

    # ── 5. Por unidade prisional ──
    por_uni = sorted(_contar([d for d in docs if d["unidade"]], "unidade").items(), key=lambda x: -x[1])
    sem_uni = sum(1 for d in docs if not d["unidade"])
    el.append(P(f"5. Documentos por unidade prisional de referência — {periodo_label}", "h1"))
    if por_uni:
        el.append(barras_h(por_uni, colors.HexColor("#7C3AED")))
        el.append(Spacer(1, 6))
        linhas = [[u, dir_(_num(v)), dir_(_pct(v, total))] for u, v in por_uni]
        if sem_uni:
            linhas.append(["Sem unidade específica", dir_(_num(sem_uni)), dir_(_pct(sem_uni, total))])
        linhas.append([P("<b>Total</b>"), dir_(_num(total), True), dir_("100%", True)])
        el.append(tabela(["Unidade prisional", "Documentos", "% do período"], linhas,
                         [10 * cm, 3.7 * cm, 3.7 * cm], alinh_dir=(1, 2), total_row=True))
    else:
        el.append(P("Nenhum documento do período está associado a uma unidade prisional específica.", "body"))

    # ── 6. Pedidos de pesquisa social ──
    pedidos = dados["pedidos"]
    rp = _resumo_pedidos(pedidos)
    el.append(P(f"6. Pedidos de pesquisa social recebidos — {periodo_label}", "h1"))
    if pedidos:
        pm = (f"{rp['prazo_medio']:.1f}".replace(".", ",") + " dia(s)") if rp["prazo_medio"] is not None else "—"
        k2 = [("RECEBIDOS", str(rp["total"]), "no período"),
              ("RESPONDIDOS", str(rp["respondidos"]), _pct(rp["respondidos"], rp["total"]) + " do total"),
              ("PENDENTES", str(rp["pendentes"]),
               f"mais antigo: {rp['mais_antigo_aberto']} dia(s)" if rp["mais_antigo_aberto"] is not None else "nenhum em aberto"),
              ("PRAZO MÉDIO DE RESPOSTA", pm, f"máximo: {rp['prazo_max']} dia(s)" if rp["prazo_max"] is not None else "—")]
        kt2 = Table([[[P(v, "kpi_v"), P(l, "kpi_l"), P(s, "kpi_s")] for l, v, s in k2]], colWidths=[LARG / 4] * 4)
        kt2.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, BORDA), ("INNERGRID", (0, 0), (-1, -1), 0.6, BORDA),
                                 ("LINEABOVE", (0, 0), (-1, 0), 3, GOLD),
                                 ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
        el += [kt2, Spacer(1, 8)]
        linhas = []
        for p in pedidos:
            if p.get("respondido"):
                try:
                    dias = (datetime.strptime(p["data_resposta"][:10], "%Y-%m-%d")
                            - datetime.strptime(p["data_pedido"][:10], "%Y-%m-%d")).days
                except Exception:
                    dias = None
                st = Paragraph(f'<font color="#15803D"><b>Respondido</b></font>', S["cel"])
                resp = f"{_fmt_data(p.get('data_resposta'))}" + (f" ({dias} d)" if dias is not None else "")
            else:
                st = Paragraph('<font color="#B91C1C"><b>Pendente</b></font>', S["cel"])
                resp = "—"
            linhas.append([_fmt_data(p["data_pedido"]), Paragraph(_esc(p.get("autor")), S["cel"]),
                           Paragraph(_esc(p.get("assunto")), S["cel"]), st, resp])
        el.append(tabela(["Data do pedido", "Solicitante", "Assunto", "Situação", "Respondido em"],
                         linhas, [2.6 * cm, 4.0 * cm, 5.6 * cm, 2.4 * cm, 2.8 * cm]))
    else:
        el.append(P("Nenhum pedido de pesquisa social registrado no período.", "body"))

    # ── Anexo: relação nominal ──
    el.append(PageBreak())
    el.append(P(f"Anexo — Relação nominal dos documentos lançados ({periodo_label})", "h1"))
    if docs:
        linhas = []
        for d in docs:
            ref = f"{MESES_ABR[d['mes']]}/{d['ano']}"
            linhas.append([_fmt_data(d.get("created_at")), d["tipo"], Paragraph(_esc(d["nome_arquivo"]), S["celm"]),
                           d["nucleo"], d.get("unidade") or "—", ref])
        el.append(tabela(["Lançado em", "Tipo", "Documento", "Núcleo", "Unidade", "Ref."],
                         linhas, [2.3 * cm, 2.7 * cm, 6.6 * cm, 1.7 * cm, 2.2 * cm, 1.9 * cm]))
        el.append(Spacer(1, 4))
        el.append(P(f"{_num(len(docs))} documento(s) listado(s).", "nota"))
    else:
        el.append(P("Sem documentos no período.", "body"))

    el += [Spacer(1, 14), HRFlowable(width="100%", thickness=0.6, color=BORDA), Spacer(1, 4),
           P("Metodologia: os números deste relatório são contagens diretas dos registros lançados no sistema "
             "Agent Bastos (um registro = um documento produzido). \"Período\" refere-se ao mês/ano de referência "
             "informado no lançamento. O prazo de resposta dos pedidos considera os dias corridos entre a data do "
             "pedido e a data da resposta.", "nota")]

    doc.build(el, canvasmaker=_Canvas)
    return buf.getvalue()
