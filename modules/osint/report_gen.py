"""
report_gen.py — Gerador de PDF profissional
Agent Bastos | Segurança Pública/Corporativa

Gera relatório em dois perfis:
  - OPERACIONAL: interno, denso, técnico
  - CORPORATIVO:  cliente externo, visual, executivo

Seções:
  1. Capa — cabeçalho institucional + nível de risco
  2. Sumário executivo — resumo IA + indicadores
  3. Processos e mandados — tabela detalhada
  4. Vínculos empresariais — tabela de empresas/sócios
  5. Linha do tempo — eventos ordenados por data
  6. Grafo de vínculos — representação visual ASCII/textual
  7. Rodapé — operador, data, número do relatório, aviso LGPD
"""

from __future__ import annotations

import io
from datetime import datetime
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from .models import OsintReport, RiskLevel

# ── Paleta de cores institucional ─────────────────────────────────────────────
AZUL_ESCURO   = colors.HexColor("#0D2137")   # cabeçalho, títulos
AZUL_MEDIO    = colors.HexColor("#1A3A5C")   # subtítulos, bordas
AZUL_CLARO    = colors.HexColor("#E8F0F7")   # fundo de células de cabeçalho
CINZA_TEXTO   = colors.HexColor("#2C2C2A")   # corpo do texto
CINZA_LINHA   = colors.HexColor("#D3D1C7")   # linhas de tabela
BRANCO        = colors.white

# Cores de risco
RISCO_CORES = {
    RiskLevel.CRITICO:  colors.HexColor("#A32D2D"),  # vermelho escuro
    RiskLevel.ALTO:     colors.HexColor("#D85A30"),  # laranja
    RiskLevel.MEDIO:    colors.HexColor("#BA7517"),  # âmbar
    RiskLevel.BAIXO:    colors.HexColor("#3B6D11"),  # verde
    RiskLevel.SEM_DADO: colors.HexColor("#5F5E5A"),  # cinza
}

RISCO_LABELS = {
    RiskLevel.CRITICO:  "⚠ CRÍTICO",
    RiskLevel.ALTO:     "▲ ALTO",
    RiskLevel.MEDIO:    "● MÉDIO",
    RiskLevel.BAIXO:    "✓ BAIXO",
    RiskLevel.SEM_DADO: "— SEM DADOS",
}

W, H = A4  # 595 x 842 pts


class OsintReportGenerator:
    """
    Gera PDF profissional a partir de um OsintReport.

    Uso:
        gen = OsintReportGenerator()
        pdf_bytes = gen.generate(report)
        Path("relatorio.pdf").write_bytes(pdf_bytes)
    """

    def __init__(self) -> None:
        self.styles = self._build_styles()

    def generate(self, report: OsintReport) -> bytes:
        """
        Ponto de entrada — retorna bytes do PDF.
        Usa BytesIO para não depender de arquivo em disco.
        """
        buffer = io.BytesIO()

        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=2*cm,
            rightMargin=2*cm,
            topMargin=2.5*cm,
            bottomMargin=2.5*cm,
            title=f"Relatório OSINT — {report.subject_name or 'Pessoa Pesquisada'}",
            author="Agent Bastos — Sistema de Inteligência",
            subject="Relatório de Inteligência de Pessoas",
        )

        story = []

        # ── Seções ──────────────────────────────────────────────────────────
        story += self._secao_capa(report)
        story += self._secao_sumario(report)
        story += self._secao_processos(report)
        story += self._secao_empresas(report)
        story += self._secao_timeline(report)
        story += self._secao_grafo(report)
        story += self._secao_rodape_lgpd(report)

        doc.build(
            story,
            onFirstPage=self._header_footer,
            onLaterPages=self._header_footer,
        )

        buffer.seek(0)
        return buffer.read()

    # ── SEÇÕES ────────────────────────────────────────────────────────────────

    def _secao_capa(self, report: OsintReport) -> list:
        """Capa: cabeçalho institucional + badge de risco + metadados."""
        s = self.styles
        items = []

        # Faixa de cabeçalho
        items.append(Table(
            [[Paragraph("AGENT BASTOS", s["titulo_capa"]),
              Paragraph("SISTEMA DE INTELIGÊNCIA<br/>SEGURANÇA PÚBLICA E CORPORATIVA", s["subtitulo_capa"])]],
            colWidths=[9*cm, 8*cm],
            style=TableStyle([
                ("BACKGROUND", (0,0), (-1,-1), AZUL_ESCURO),
                ("TEXTCOLOR",  (0,0), (-1,-1), BRANCO),
                ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
                ("LEFTPADDING",(0,0), (-1,-1), 12),
                ("TOPPADDING", (0,0), (-1,-1), 14),
                ("BOTTOMPADDING",(0,0),(-1,-1), 14),
            ])
        ))
        items.append(Spacer(1, 0.5*cm))

        # Tipo do documento
        items.append(Paragraph(
            "RELATÓRIO DE INTELIGÊNCIA DE PESSOAS — OSINT",
            s["tipo_documento"]
        ))
        items.append(HRFlowable(width="100%", thickness=2, color=AZUL_ESCURO))
        items.append(Spacer(1, 0.8*cm))

        # Badge de risco
        cor_risco = RISCO_CORES.get(report.risk_level, CINZA_TEXTO)
        label_risco = RISCO_LABELS.get(report.risk_level, "—")
        items.append(Table(
            [[Paragraph(f"NÍVEL DE RISCO: {label_risco}", s["badge_risco"])]],
            colWidths=[17*cm],
            style=TableStyle([
                ("BACKGROUND",    (0,0), (-1,-1), cor_risco),
                ("TEXTCOLOR",     (0,0), (-1,-1), BRANCO),
                ("ALIGN",         (0,0), (-1,-1), "CENTER"),
                ("TOPPADDING",    (0,0), (-1,-1), 10),
                ("BOTTOMPADDING", (0,0), (-1,-1), 10),
                ("ROUNDEDCORNERS",(0,0), (-1,-1), [4,4,4,4]),
            ])
        ))
        items.append(Spacer(1, 0.8*cm))

        # Metadados do sujeito
        dados_meta = [
            ["SUJEITO PESQUISADO", report.subject_name or "Não identificado"],
            ["CPF (mascarado)",    report.subject_cpf_masked or "N/A"],
            ["FINALIDADE LGPD",   report.lgpd_purpose.value.replace("_", " ").upper()],
            ["OPERADOR",          report.operator_id],
            ["N° DO RELATÓRIO",   str(report.report_id)[:8].upper()],
            ["DATA DE GERAÇÃO",   report.generated_at.strftime("%d/%m/%Y às %H:%M UTC")],
        ]
        if report.execution_time_ms:
            dados_meta.append(["TEMPO DE EXECUÇÃO", f"{report.execution_time_ms/1000:.1f}s"])

        items.append(Table(
            dados_meta,
            colWidths=[5*cm, 12*cm],
            style=TableStyle([
                ("BACKGROUND",    (0,0), (0,-1), AZUL_CLARO),
                ("FONTNAME",      (0,0), (0,-1), "Helvetica-Bold"),
                ("FONTSIZE",      (0,0), (-1,-1), 9),
                ("TEXTCOLOR",     (0,0), (0,-1), AZUL_ESCURO),
                ("TEXTCOLOR",     (1,0), (1,-1), CINZA_TEXTO),
                ("GRID",          (0,0), (-1,-1), 0.5, CINZA_LINHA),
                ("TOPPADDING",    (0,0), (-1,-1), 6),
                ("BOTTOMPADDING", (0,0), (-1,-1), 6),
                ("LEFTPADDING",   (0,0), (-1,-1), 8),
            ])
        ))

        items.append(PageBreak())
        return items

    def _secao_sumario(self, report: OsintReport) -> list:
        """Sumário executivo — resumo IA + indicadores de risco."""
        s = self.styles
        items = [Paragraph("1. SUMÁRIO EXECUTIVO", s["titulo_secao"])]
        items.append(HRFlowable(width="100%", thickness=1, color=AZUL_MEDIO))
        items.append(Spacer(1, 0.3*cm))

        # Resumo gerado pela IA
        resumo = report.risk_summary or "Não foi possível gerar resumo automático."
        items.append(Paragraph(resumo, s["corpo"]))
        items.append(Spacer(1, 0.4*cm))

        # Indicadores de risco
        if report.risk_indicators:
            items.append(Paragraph("Indicadores identificados:", s["subtitulo"]))
            for ind in report.risk_indicators:
                items.append(Paragraph(f"• {ind}", s["bullet"]))
            items.append(Spacer(1, 0.4*cm))

        # Painel de contadores
        contadores = [
            ["PROCESSOS CRIMINAIS", "PROCESSOS CÍVEIS", "MANDADOS ATIVOS", "EMPRESAS", "NOTÍCIAS"],
            [
                str(len(report.processos_criminais)),
                str(len(report.processos_civeis)),
                str(len(report.mandados_prisao)),
                str(len(report.vinculos_empresariais)),
                str(len(report.mencoes_midia)),
            ]
        ]
        items.append(Table(
            contadores,
            colWidths=[3.4*cm]*5,
            style=TableStyle([
                ("BACKGROUND",    (0,0), (-1,0), AZUL_ESCURO),
                ("TEXTCOLOR",     (0,0), (-1,0), BRANCO),
                ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
                ("FONTSIZE",      (0,0), (-1,0), 7),
                ("ALIGN",         (0,0), (-1,-1), "CENTER"),
                ("FONTNAME",      (0,1), (-1,1), "Helvetica-Bold"),
                ("FONTSIZE",      (0,1), (-1,1), 18),
                ("TEXTCOLOR",     (0,1), (-1,1), AZUL_ESCURO),
                ("GRID",          (0,0), (-1,-1), 0.5, CINZA_LINHA),
                ("TOPPADDING",    (0,0), (-1,-1), 8),
                ("BOTTOMPADDING", (0,0), (-1,-1), 8),
            ])
        ))
        items.append(Spacer(1, 0.6*cm))

        # Fontes com erro
        if report.fontes_com_erro:
            items.append(Paragraph(
                f"<b>Fontes indisponíveis:</b> {', '.join(report.fontes_com_erro)}",
                s["aviso"]
            ))

        return items

    def _secao_processos(self, report: OsintReport) -> list:
        """Tabela de processos criminais, cíveis e mandados."""
        s = self.styles
        items = [Spacer(1, 0.5*cm)]

        cabecalho = [
            Paragraph("2. PROCESSOS E MANDADOS", s["titulo_secao"]),
            HRFlowable(width="100%", thickness=1, color=AZUL_MEDIO),
            Spacer(1, 0.3*cm),
        ]

        # Mandados de prisão
        if report.mandados_prisao:
            bloco = [Paragraph("Mandados de Prisão", s["subtitulo"])]
            header = [["Nº MANDADO", "TIPO", "STATUS", "DATA EXPEDIÇÃO"]]
            rows = [
                [
                    m.get("numero", "—"),
                    m.get("tipo", "—"),
                    m.get("status", "—").upper(),
                    m.get("data_expedicao", "—"),
                ]
                for m in report.mandados_prisao
            ]
            bloco.append(self._tabela_padrao(header + rows, [4*cm, 4*cm, 3*cm, 4*cm]))
            items.append(KeepTogether(cabecalho + bloco))
            items.append(Spacer(1, 0.4*cm))
        else:
            items += cabecalho

        # Processos criminais
        if report.processos_criminais:
            bloco = [Paragraph("Processos Criminais", s["subtitulo"])]
            header = [["Nº PROCESSO", "TRIBUNAL", "CLASSE/CRIME", "DATA", "STATUS"]]
            rows = [
                [
                    p.get("numero", "—"),
                    p.get("tribunal", "—"),
                    ", ".join(p.get("assuntos", [p.get("classe", "—")]))[:40],
                    p.get("data_ajuizamento", p.get("data", "—")),
                    p.get("status", "Em curso"),
                ]
                for p in report.processos_criminais
            ]
            bloco.append(self._tabela_padrao(header + rows, [4.5*cm, 2.5*cm, 5*cm, 2.5*cm, 2.5*cm]))
            items.append(KeepTogether(bloco))
            items.append(Spacer(1, 0.4*cm))

        # Processos cíveis
        if report.processos_civeis:
            bloco = [Paragraph("Processos Cíveis", s["subtitulo"])]
            header = [["Nº PROCESSO", "TRIBUNAL", "ASSUNTO", "DATA"]]
            rows = [
                [
                    p.get("numero", "—"),
                    p.get("tribunal", "—"),
                    ", ".join(p.get("assuntos", [p.get("classe", "—")]))[:50],
                    p.get("data_ajuizamento", p.get("data", "—")),
                ]
                for p in report.processos_civeis
            ]
            bloco.append(self._tabela_padrao(header + rows, [4.5*cm, 2.5*cm, 6.5*cm, 3.5*cm]))
            items.append(KeepTogether(bloco))

        if not report.processos_criminais and not report.processos_civeis and not report.mandados_prisao:
            items += cabecalho
            items.append(Paragraph("Nenhum processo ou mandado identificado nas fontes consultadas.", s["sem_dados"]))

        return items

    def _secao_empresas(self, report: OsintReport) -> list:
        """Tabela de vínculos empresariais."""
        s = self.styles
        items = [Spacer(1, 0.5*cm)]
        items.append(Paragraph("3. VÍNCULOS EMPRESARIAIS", s["titulo_secao"]))
        items.append(HRFlowable(width="100%", thickness=1, color=AZUL_MEDIO))
        items.append(Spacer(1, 0.3*cm))

        if not report.vinculos_empresariais:
            items.append(Paragraph("Nenhum vínculo empresarial identificado.", s["sem_dados"]))
            return items

        header = [["CNPJ", "RAZÃO SOCIAL", "QUALIFICAÇÃO", "SITUAÇÃO", "UF"]]
        rows = [
            [
                e.get("cnpj", "—"),
                e.get("razao_social", "—")[:35],
                e.get("qualificacao", e.get("vinculo_socio", {}).get("qualificacao", "—"))[:20],
                e.get("situacao", "—"),
                e.get("uf", "—"),
            ]
            for e in report.vinculos_empresariais
        ]
        items.append(self._tabela_padrao(header + rows, [3.5*cm, 6*cm, 3.5*cm, 2.5*cm, 1.5*cm]))

        return items

    def _secao_timeline(self, report: OsintReport) -> list:
        """Linha do tempo de eventos ordenados por data."""
        s = self.styles
        items = [Spacer(1, 0.5*cm)]
        items.append(Paragraph("4. LINHA DO TEMPO", s["titulo_secao"]))
        items.append(HRFlowable(width="100%", thickness=1, color=AZUL_MEDIO))
        items.append(Spacer(1, 0.3*cm))

        # Coleta todos os eventos com data
        eventos: list[dict] = []

        for p in report.processos_criminais:
            data = p.get("data_ajuizamento", p.get("data", ""))
            if data:
                eventos.append({
                    "data": data[:10],
                    "tipo": "PROCESSO CRIMINAL",
                    "descricao": f"{p.get('classe', '')} — {p.get('tribunal', '')}",
                    "cor": RISCO_CORES[RiskLevel.ALTO],
                })

        for m in report.mandados_prisao:
            data = m.get("data_expedicao", "")
            if data:
                eventos.append({
                    "data": data[:10],
                    "tipo": "MANDADO DE PRISÃO",
                    "descricao": f"{m.get('tipo', '')} — {m.get('status', '')}",
                    "cor": RISCO_CORES[RiskLevel.CRITICO],
                })

        for n in report.mencoes_midia:
            data = n.get("data", "")[:10] if n.get("data") else ""
            if data:
                eventos.append({
                    "data": data,
                    "tipo": "MÍDIA",
                    "descricao": n.get("titulo", "")[:60],
                    "cor": AZUL_MEDIO,
                })

        for d in report.mencoes_dou:
            data = d.get("data", "")
            if data:
                eventos.append({
                    "data": data[:10],
                    "tipo": f"DOU — {d.get('tipo', 'publicação').upper()}",
                    "descricao": d.get("titulo", "")[:60],
                    "cor": CINZA_TEXTO,
                })

        if not eventos:
            items.append(Paragraph("Nenhum evento com data identificado nas fontes.", s["sem_dados"]))
            return items

        # Ordena por data
        eventos.sort(key=lambda x: x["data"], reverse=True)

        header = [["DATA", "TIPO", "DESCRIÇÃO"]]
        rows = [[e["data"], e["tipo"], e["descricao"]] for e in eventos]
        items.append(self._tabela_padrao(header + rows, [2.5*cm, 4*cm, 10.5*cm]))

        return items

    def _secao_grafo(self, report: OsintReport) -> list:
        """Representação textual do grafo de vínculos."""
        s = self.styles

        graph = report.graph
        if not graph.nodes:
            return [
                Spacer(1, 0.5*cm),
                Paragraph("5. GRAFO DE VÍNCULOS", s["titulo_secao"]),
                HRFlowable(width="100%", thickness=1, color=AZUL_MEDIO),
                Spacer(1, 0.3*cm),
                Paragraph("Grafo não disponível.", s["sem_dados"]),
            ]

        root = next((n for n in graph.nodes if n.is_subject), graph.nodes[0])
        node_map = {n.node_id: n for n in graph.nodes}

        rows = []
        for edge in graph.edges:
            target = node_map.get(edge.target_id)
            if target and not target.is_subject:
                rows.append([
                    target.label[:35],
                    target.node_type.value.upper(),
                    edge.edge_type.value.replace("_", " ").upper(),
                    edge.data_source.value if edge.data_source else "—",
                ])

        # Monta bloco inteiro — KeepTogether evita quebra no meio
        bloco = [
            Spacer(1, 0.5*cm),
            Paragraph("5. GRAFO DE VÍNCULOS", s["titulo_secao"]),
            HRFlowable(width="100%", thickness=1, color=AZUL_MEDIO),
            Spacer(1, 0.3*cm),
            Paragraph(
                f"Nó central: <b>{root.label}</b> — Risco: {root.risk_level.value.upper()}",
                s["subtitulo"]
            ),
            Spacer(1, 0.2*cm),
        ]

        if rows:
            header = [["ENTIDADE", "TIPO", "RELAÇÃO", "FONTE"]]
            bloco.append(self._tabela_padrao(header + rows, [6*cm, 3*cm, 5*cm, 3*cm]))
        else:
            bloco.append(Paragraph("Nenhum vínculo mapeado no grafo.", s["sem_dados"]))

        bloco.append(Spacer(1, 0.3*cm))
        bloco.append(Paragraph(
            f"Total: {len(graph.nodes)} nós | {len(graph.edges)} arestas",
            s["rodape_info"]
        ))

        return [KeepTogether(bloco)]

    def _secao_rodape_lgpd(self, report: OsintReport) -> list:
        """Aviso LGPD e metadados finais."""
        s = self.styles
        bloco = [
            HRFlowable(width="100%", thickness=1, color=CINZA_LINHA),
            Spacer(1, 0.3*cm),
            Paragraph("AVISO DE CONFIDENCIALIDADE E PROTEÇÃO DE DADOS", s["titulo_aviso"]),
            Paragraph(
                "Este relatório foi gerado exclusivamente para a finalidade declarada e contém informações "
                "protegidas pela Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018). "
                "É vedada a reprodução, compartilhamento ou utilização para finalidade diversa da declarada. "
                "Todas as operações de tratamento de dados realizadas nesta pesquisa foram registradas "
                "em audit log conforme Art. 37 da LGPD. "
                f"Operador responsável: {report.operator_id} | "
                f"Finalidade: {report.lgpd_purpose.value} | "
                f"Gerado em: {report.generated_at.strftime('%d/%m/%Y %H:%M UTC')}",
                s["lgpd"]
            ),
        ]
        return [Spacer(1, 0.6*cm), KeepTogether(bloco)]

    # ── HELPERS ───────────────────────────────────────────────────────────────

    def _tabela_padrao(self, data: list, col_widths: list) -> Table:
        """Cria tabela com estilo padrão do relatório."""
        t = Table(data, colWidths=col_widths)
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,0), AZUL_ESCURO),
            ("TEXTCOLOR",     (0,0), (-1,0), BRANCO),
            ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE",      (0,0), (-1,0), 8),
            ("FONTNAME",      (0,1), (-1,-1), "Helvetica"),
            ("FONTSIZE",      (0,1), (-1,-1), 8),
            ("TEXTCOLOR",     (0,1), (-1,-1), CINZA_TEXTO),
            ("ROWBACKGROUNDS",(0,1), (-1,-1), [BRANCO, AZUL_CLARO]),
            ("GRID",          (0,0), (-1,-1), 0.5, CINZA_LINHA),
            ("ALIGN",         (0,0), (-1,-1), "LEFT"),
            ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
            ("TOPPADDING",    (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
            ("LEFTPADDING",   (0,0), (-1,-1), 6),
        ]))
        return t

    def _header_footer(self, canvas, doc) -> None:
        """Cabeçalho e rodapé em todas as páginas."""
        canvas.saveState()

        # Valores fixos que espelham exatamente o SimpleDocTemplate
        # leftMargin=2cm, rightMargin=2cm, topMargin=2.5cm, bottomMargin=2.5cm
        LM = 2 * cm        # margem esquerda
        RM = 2 * cm        # margem direita
        TM = 2.5 * cm      # margem superior
        CW = W - LM - RM   # largura do conteúdo: 595 - 4cm = ~481pt

        # Faixa azul — começa em LM, vai até LM+CW, fica logo abaixo da margem superior
        FAIXA_H = 0.52 * cm
        FAIXA_Y = H - TM + 0.1 * cm  # logo acima do topo do conteúdo

        canvas.setFillColor(AZUL_ESCURO)
        canvas.rect(LM, FAIXA_Y, CW, FAIXA_H, fill=1, stroke=0)

        canvas.setFillColor(BRANCO)
        canvas.setFont("Helvetica-Bold", 7)
        texto_y = FAIXA_Y + FAIXA_H / 2 - 2.5
        canvas.drawString(LM + 5, texto_y, "AGENT BASTOS — INTELIGÊNCIA DE SEGURANÇA")
        canvas.drawRightString(LM + CW - 5, texto_y, "CONFIDENCIAL")

        # Rodapé
        canvas.setStrokeColor(CINZA_LINHA)
        canvas.setLineWidth(0.5)
        canvas.line(LM, 1.8 * cm, LM + CW, 1.8 * cm)

        canvas.setFillColor(CINZA_TEXTO)
        canvas.setFont("Helvetica", 7)
        canvas.drawString(LM, 1.3 * cm, f"Gerado em {datetime.utcnow().strftime('%d/%m/%Y %H:%M')} UTC")
        canvas.drawCentredString(W / 2, 1.3 * cm, "USO RESTRITO — LGPD Art. 37")
        canvas.drawRightString(LM + CW, 1.3 * cm, f"Página {doc.page}")
        canvas.restoreState()

    def _build_styles(self) -> dict[str, ParagraphStyle]:
        """Define todos os estilos tipográficos do documento."""
        base = getSampleStyleSheet()
        return {
            "titulo_capa": ParagraphStyle(
                "titulo_capa", fontName="Helvetica-Bold",
                fontSize=16, textColor=BRANCO, leading=20,
            ),
            "subtitulo_capa": ParagraphStyle(
                "subtitulo_capa", fontName="Helvetica",
                fontSize=8, textColor=colors.HexColor("#B5D4F4"),
                leading=12, alignment=TA_RIGHT, spaceAfter=0,
            ),
            "tipo_documento": ParagraphStyle(
                "tipo_documento", fontName="Helvetica-Bold",
                fontSize=10, textColor=AZUL_ESCURO,
                alignment=TA_CENTER, spaceAfter=4,
            ),
            "badge_risco": ParagraphStyle(
                "badge_risco", fontName="Helvetica-Bold",
                fontSize=14, textColor=BRANCO, alignment=TA_CENTER,
            ),
            "titulo_secao": ParagraphStyle(
                "titulo_secao", fontName="Helvetica-Bold",
                fontSize=11, textColor=AZUL_ESCURO,
                spaceBefore=8, spaceAfter=4,
            ),
            "subtitulo": ParagraphStyle(
                "subtitulo", fontName="Helvetica-Bold",
                fontSize=9, textColor=AZUL_MEDIO, spaceAfter=4,
            ),
            "corpo": ParagraphStyle(
                "corpo", fontName="Helvetica",
                fontSize=9, textColor=CINZA_TEXTO,
                leading=14, spaceAfter=6,
            ),
            "bullet": ParagraphStyle(
                "bullet", fontName="Helvetica",
                fontSize=9, textColor=CINZA_TEXTO,
                leftIndent=12, leading=13,
            ),
            "sem_dados": ParagraphStyle(
                "sem_dados", fontName="Helvetica-Oblique",
                fontSize=9, textColor=colors.HexColor("#888780"),
                spaceAfter=6,
            ),
            "aviso": ParagraphStyle(
                "aviso", fontName="Helvetica",
                fontSize=8, textColor=colors.HexColor("#854F0B"),
                backColor=colors.HexColor("#FAEEDA"),
                borderPadding=6, spaceAfter=6,
            ),
            "rodape_info": ParagraphStyle(
                "rodape_info", fontName="Helvetica",
                fontSize=8, textColor=colors.HexColor("#888780"),
                alignment=TA_RIGHT,
            ),
            "titulo_aviso": ParagraphStyle(
                "titulo_aviso", fontName="Helvetica-Bold",
                fontSize=8, textColor=AZUL_ESCURO, spaceAfter=4,
            ),
            "lgpd": ParagraphStyle(
                "lgpd", fontName="Helvetica",
                fontSize=7.5, textColor=colors.HexColor("#5F5E5A"),
                leading=11,
            ),
        }
