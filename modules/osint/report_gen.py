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

from xml.sax.saxutils import escape

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
        story += self._secao_bases(report)
        story += self._secao_pegada(report)
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

        # Avaliação de risco por pilar (processos, lideranças e notícias)
        pil = report.risco_pilares or {}
        if pil:
            items.append(Paragraph("Avaliação de risco (processos, lideranças e notícias de crime)", s["subtitulo"]))
            if report.resumo_risco:
                items.append(Paragraph(escape(report.resumo_risco), s["corpo"]))
            rot = {"processos": "PROCESSOS", "liderancas": "LIDERANÇAS", "noticias": "NOTÍCIAS DE CRIME"}
            niv = {"critico": ("CRÍTICO", "#A32D2D"), "alto": ("ALTO", "#D85A30"), "medio": ("MÉDIO", "#BA7517"),
                   "baixo": ("BAIXO", "#3B6D11")}
            cab = [[self._cel(h, "cel_cab") for h in ("PILAR", "NÍVEL", "BASE (resultados com 50% ou mais)")]]
            linhas = []
            for k in ("processos", "liderancas", "noticias"):
                p = pil.get(k) or {}
                n, cor = niv.get(p.get("nivel"), ("sem ocorrência", "#5F5E5A"))
                linhas.append([self._cel(rot[k]),
                               Paragraph(f'<font color="{cor}"><b>{n}</b></font>', s["cel"]),
                               self._cel("; ".join(p.get("motivos") or []) or "—")])
            t = self._tabela_padrao(cab + linhas, [3.6*cm, 2.6*cm, 10.8*cm])
            t.repeatRows = 1
            items += [t, Spacer(1, 0.2*cm)]
            nota = ("Convergência: dois ou mais pilares em nível alto ou crítico elevam o risco a CRÍTICO. " if pil.get("convergencia") else "")
            nota += (f"{pil.get('imprecisos_nao_considerados', 0)} resultado(s) impreciso(s) (< 50%) não entram no cálculo. "
                     "Lista Negra, sanções, PEP, empresas, TSE e diários oficiais são informativos.")
            items += [Paragraph(escape(nota), s["lgpd"]), Spacer(1, 0.3*cm)]

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
            Paragraph("4. PROCESSOS E MANDADOS", s["titulo_secao"]),
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
            # o cabeçalho já foi incluído acima (ramo sem mandados)
            items.append(Paragraph("Nenhum processo ou mandado identificado nas fontes consultadas.", s["sem_dados"]))

        return items

    def _secao_empresas(self, report: OsintReport) -> list:
        """Tabela de vínculos empresariais."""
        s = self.styles
        items = [Spacer(1, 0.5*cm)]
        items.append(Paragraph("5. VÍNCULOS EMPRESARIAIS", s["titulo_secao"]))
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
        items.append(Paragraph("6. LINHA DO TEMPO", s["titulo_secao"]))
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
                Paragraph("7. GRAFO DE VÍNCULOS", s["titulo_secao"]),
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
            Paragraph("7. GRAFO DE VÍNCULOS", s["titulo_secao"]),
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

    # ── BASES CONSULTADAS E ACHADOS ───────────────────────────────────────────

    _FONTE_ROTULO = {
        "lista_negra": "Lista Negra", "liderancas": "Lideranças", "referencias": "Referências (documentos)",
        "receita_cnpj": "Receita Federal — sócios", "tse": "TSE — candidaturas e bens",
        "djen": "DJEN (CNJ) — publicações judiciais", "querido_diario": "Diários Oficiais municipais",
        "diario_am": "Diário Oficial do Estado do AM",
        "noticias": "Notícias e alertas (por tipo de crime e papel)",
        "pep_cgu": "PEP — Pessoas Expostas Politicamente (CGU)",
        "sancoes_cgu": "Sanções — CEIS / CNEP / CEAF (CGU)",
    }
    _STATUS_ROTULO = {
        "ok": "consultada", "vazio": "sem registro", "erro": "ERRO", "sem_permissao": "sem permissão",
        "nao_carregada": "base não carregada", "nao_aplicavel": "requer nome",
    }
    _NIVEL = {"confirmado": ("CONFIRMADO", "#3B6D11"), "provavel": ("PROVÁVEL", "#BA7517"),
              "possivel": ("POSSÍVEL", "#5F5E5A")}
    MAX_POR_FONTE = 10
    LIMIAR = 50   # abaixo disto o resultado é "impreciso" e só é contado no PDF (não listado)

    def _cel(self, txt: Any, estilo: str = "cel") -> Paragraph:
        """Parágrafo seguro (escapa &, <, >) para uso em células de tabela."""
        return Paragraph(escape(str(txt if txt is not None else "—")), self.styles[estilo])

    def _descricao_achado(self, a: dict) -> str:
        """Resumo textual (várias linhas separadas por \\n) de um achado, por fonte."""
        d, f = a.get("dados") or {}, a.get("fonte")
        brl = lambda v: f"R$ {v:,.0f}".replace(",", ".") if v else "não declarado"
        L: list[str] = []
        if f == "lista_negra":
            L = [f"{d.get('nome', '')} — {d.get('situacao') or 'sem situação'}",
                 f"Unidade: {d.get('unidade') or '—'} | Empresa: {d.get('empresa') or '—'} | Data: {d.get('data') or '—'}",
                 f"CPF: {d.get('cpf') or '—'} | Ref.: {d.get('referencia') or '—'}"]
            if d.get("descricao"):
                L.append(str(d["descricao"])[:220])
        elif f == "liderancas":
            at = d.get("atual") or {}
            L = [f"{d.get('nome', '')}" + (f' (vulgo "{d["vulgo"]}")' if d.get("vulgo") else ""),
                 f"{d.get('faccao') or '—'} — {d.get('cargo') or '—'}" + (f" | {d['status']}" if d.get("status") else "")]
            if at:
                L.append("Local: " + " / ".join(str(at.get(k)) for k in ("unidade", "pavilhao", "ala", "cela") if at.get(k))
                         + f" ({at.get('competencia')})")
        elif f == "referencias":
            L = [a.get("titulo", "")]
            if d.get("assunto"):
                L.append(str(d["assunto"])[:200])
            if d.get("trecho"):
                L.append("“" + str(d["trecho"])[:230] + "”")
        elif f == "receita_cnpj":
            L = [f"{d.get('empresa') or 'Empresa'} — CNPJ {d.get('cnpj')}",
                 f"{d.get('qualificacao') or '—'} desde {d.get('data_entrada') or '—'} | situação: {d.get('situacao') or '—'}"
                 f" | {d.get('municipio') or ''}/{d.get('uf') or ''}"]
            if d.get("atividade"):
                L.append(str(d["atividade"])[:110])
            if d.get("outros_socios"):
                L.append("Outros sócios: " + str(d["outros_socios"])[:160])
        elif f == "tse":
            L = [f"{d.get('nome', '')} — nascimento {d.get('nascimento') or '—'} — CPF {d.get('cpf') or '—'}"]
            for c in (d.get("candidaturas") or [])[:6]:
                L.append(f"{c.get('ano')} {c.get('cargo')} — {c.get('partido')}/{c.get('uf')} — "
                         f"{c.get('resultado') or c.get('situacao') or '—'} — patrimônio {brl(c.get('patrimonio'))}")
        elif f == "djen":
            L = [f"Processo {d.get('processo')} — {d.get('tribunal')} — {d.get('classe') or '—'}"
                 + ("  [CRIMINAL]" if d.get("criminal") else ""),
                 f"{d.get('polo') or '—'} | {d.get('orgao') or '—'}",
                 f"{d.get('publicacoes')} publicação(ões): {d.get('primeira')} a {d.get('ultima')}"]
            if d.get("advogados"):
                L.append("Adv.: " + str(d["advogados"])[:120])
        elif f == "querido_diario":
            L = [f"{d.get('municipio')}/{d.get('uf')} — {d.get('data')} — {d.get('ato') or 'ato não classificado'}",
                 "“" + str(d.get("trecho") or "")[:240] + "”"]
        elif f == "noticias":
            L = [str(d.get("titulo") or "")[:170],
                 f"{d.get('fonte') or ''} · {d.get('data') or ''} · papel: {d.get('papel') or '—'}"
                 + (f" · crime: {', '.join(d.get('crime_tipos') or [])}" if d.get("crime_tipos") else "")
                 + (f" · risco do monitor: {d['risco_monitor']}" if d.get("risco_monitor") else "")]
            if d.get("link"):
                L.append(str(d["link"])[:120])
        elif f in ("pep_cgu", "sancoes_cgu"):
            tipo = "EMPRESA VINCULADA — " if d.get("tipo") == "empresa" else ""
            L = [f"{tipo}{d.get('nome', '')}" + (f" (CNPJ {d['cnpj']})" if d.get("cnpj") else "")]
            L += [str(x)[:230] for x in (d.get("linhas") or [])]
            if (d.get("total_registros") or 0) > len(d.get("linhas") or []):
                L.append(f"(+{d['total_registros'] - len(d['linhas'])} registro(s) não listados)")
        elif f == "diario_am":
            L = [f"DOE-AM {d.get('data')} ed. {d.get('edicao')} p. {d.get('pagina')} — {d.get('materia') or '—'}"
                 + ("  [SEAP]" if d.get("seap") else ""),
                 f"{d.get('orgao') or '—'} | {d.get('ato') or '—'}",
                 "“" + str(d.get("trecho") or "")[:230] + "”"]
        else:
            L = [a.get("titulo", "")]
        return "\n".join(x for x in L if x)

    def _secao_bases(self, report: OsintReport) -> list:
        """Resultado das bases internas/locais e fontes externas: contexto, status e achados por fonte."""
        s = self.styles
        items = [Spacer(1, 0.5*cm), Paragraph("2. BASES CONSULTADAS E ACHADOS", s["titulo_secao"]),
                 HRFlowable(width="100%", thickness=1, color=AZUL_MEDIO), Spacer(1, 0.3*cm)]

        fontes = report.fontes_internas or {}
        achados = report.achados_internos or []
        if not fontes:
            items.append(Paragraph("As bases internas não foram consultadas nesta pesquisa.", s["sem_dados"]))
            return items

        # contexto cruzado
        ctx = report.contexto_busca or {}
        if ctx.get("principais"):
            txt = (f"<b>Contexto cruzado:</b> UF provável <b>{escape(', '.join(ctx['principais']))}</b> "
                   f"(via {escape(', '.join(ctx.get('fontes') or []))}). Achados de fontes externas na mesma UF "
                   f"tiveram a confiança aumentada; em UF diferente, reduzida.")
            if ctx.get("nascimento_adotado"):
                nasc = "/".join(reversed(str(ctx["nascimento_adotado"]).split("-")))
                txt += f" Data de nascimento obtida do TSE: {escape(nasc)}."
            items += [Paragraph(txt, s["aviso"]), Spacer(1, 0.2*cm)]

        # status por fonte
        header = [[self._cel(h, "cel_cab") for h in ("FONTE", "STATUS", "ACHADOS", "OBSERVAÇÃO")]]
        linhas = []
        for chave, rot in self._FONTE_ROTULO.items():
            st = fontes.get(chave)
            if not st:
                continue
            obs = st.get("erro") or ""
            if st.get("descartados_homonimo"):
                obs = (obs + " " if obs else "") + f"{st['descartados_homonimo']} homônimo(s) descartado(s)"
            linhas.append([self._cel(rot), self._cel(self._STATUS_ROTULO.get(st.get("status"), st.get("status"))),
                           self._cel(st.get("total", 0)), self._cel(obs or "—")])
        t = self._tabela_padrao(header + linhas, [5.2*cm, 3*cm, 1.8*cm, 7*cm])
        t.repeatRows = 1
        items += [t, Spacer(1, 0.3*cm)]

        items.append(Paragraph(
            "Níveis de confiança: <b>CONFIRMADO</b> (≥ 90%: identidade comprovada por CPF ou equivalente), "
            "<b>PROVÁVEL</b> (55–89%), <b>POSSÍVEL</b> (&lt; 55%: pode ser homônimo — verificar antes de usar).",
            s["lgpd"]))
        items.append(Spacer(1, 0.3*cm))

        # achados por fonte
        for chave, rot in self._FONTE_ROTULO.items():
            todos = [a for a in achados if a.get("fonte") == chave]
            if not todos:
                continue
            lista = sorted((a for a in todos if (a.get("confianca") or 0) >= self.LIMIAR),
                           key=lambda a: a.get("confianca") or 0, reverse=True)
            imprecisos = len(todos) - len(lista)
            if not lista:
                items.append(Paragraph(f"<b>{escape(rot)}</b>: nenhum resultado com {self.LIMIAR}% ou mais de precisão "
                                       f"({imprecisos} impreciso(s) omitido(s)).", s["sem_dados"]))
                continue
            bloco = [Paragraph(f"{escape(rot)} — {len(lista)} achado(s) com {self.LIMIAR}% ou mais", s["subtitulo"])]
            cab = [[self._cel(h, "cel_cab") for h in ("CONFIANÇA", "DESCRIÇÃO", "POR QUE FOI CONSIDERADO")]]
            rows = []
            for a in lista[: self.MAX_POR_FONTE]:
                rotulo, cor = self._NIVEL.get(a.get("nivel"), ("—", "#5F5E5A"))
                conf = Paragraph(f'<font color="{cor}"><b>{rotulo}</b></font><br/>{a.get("confianca")}%', s["cel"])
                desc = Paragraph("<br/>".join(escape(l) for l in self._descricao_achado(a).split("\n")), s["cel"])
                mot = Paragraph("<br/>".join("• " + escape(str(m)) for m in (a.get("motivos") or [])), s["cel"])
                rows.append([conf, desc, mot])
            t2 = self._tabela_padrao(cab + rows, [2.3*cm, 8.7*cm, 6*cm])
            t2.repeatRows = 1
            bloco.append(t2)
            omitidos = max(0, len(lista) - self.MAX_POR_FONTE) + imprecisos
            if omitidos:
                partes = []
                if len(lista) > self.MAX_POR_FONTE:
                    partes.append(f"{len(lista) - self.MAX_POR_FONTE} acima de {self.LIMIAR}% não listado(s)")
                if imprecisos:
                    partes.append(f"{imprecisos} impreciso(s) (< {self.LIMIAR}%)")
                bloco.append(Paragraph("+ " + "; ".join(partes) + " — disponíveis na tela.", s["sem_dados"]))
            items += [KeepTogether(bloco[:2]), *bloco[2:], Spacer(1, 0.3*cm)]

        if not achados:
            items.append(Paragraph("Nenhum registro encontrado nas bases consultadas para os dados informados.",
                                   s["sem_dados"]))
        return items

    # ── FOTOS E PEGADA DIGITAL ────────────────────────────────────────────────

    def _secao_pegada(self, report: OsintReport) -> list:
        """Galeria de fotos (com a origem de cada uma) e resultado da pegada digital (redes, e-mail, telefone)."""
        from io import BytesIO

        from reportlab.lib.utils import ImageReader
        from reportlab.platypus import Image

        from . import fotos as fotos_mod
        s = self.styles
        fotos = report.fotos or []
        pd = report.pegada_digital or {}
        if not fotos and not pd:
            return []
        items = [Spacer(1, 0.5*cm), Paragraph("3. FOTOS E PEGADA DIGITAL", s["titulo_secao"]),
                 HRFlowable(width="100%", thickness=1, color=AZUL_MEDIO), Spacer(1, 0.3*cm)]

        # ── fotos
        if fotos:
            items.append(Paragraph(
                "Fotos de fontes oficiais/internas e de perfis confirmados pelo analista. O nível indica a "
                "confiança na IDENTIDADE da pessoa, não uma comparação facial. Não foi usado reconhecimento facial.",
                s["lgpd"]))
            items.append(Spacer(1, 0.2*cm))
            celulas = []
            for f in fotos[:12]:
                dado = fotos_mod.obter(f.get("id", ""))
                if not dado:
                    continue
                try:
                    w, h = ImageReader(BytesIO(dado["bytes"])).getSize()
                    img = Image(BytesIO(dado["bytes"]), width=3.0*cm, height=3.0*cm * h / w)
                except Exception:
                    continue
                rot = {"confirmado": "CONFIRMADO", "provavel": "PROVÁVEL", "confirmado_analista": "CONFIRMADO PELO ANALISTA"}.get(f.get("nivel"), "")
                legenda = Paragraph(f"<b>{escape(str(f.get('fonte', '')))[:60]}</b><br/>{escape(str(f.get('legenda', '')))[:70]}"
                                    + (f"<br/>{rot}" if rot else ""), s["cel"])
                celulas.append([img, legenda])
            if celulas:
                linhas = []
                for i in range(0, len(celulas), 3):
                    grupo = celulas[i:i + 3]
                    while len(grupo) < 3:
                        grupo.append(["", ""])
                    linhas.append([c[0] for c in grupo])
                    linhas.append([c[1] for c in grupo])
                t = Table(linhas, colWidths=[5.6*cm] * 3)
                t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 3),
                                       ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
                items += [t, Spacer(1, 0.3*cm)]

        # ── pegada digital
        if pd:
            et = pd.get("etapas") or {}
            mg = et.get("maigret") or {}
            ent = pd.get("entrada") or {}
            usados = [f"{x.get('valor')} ({x.get('origem')})" for k in ("usernames", "emails", "telefones") for x in (ent.get(k) or [])]
            if usados:
                items.append(Paragraph("Identificadores usados", s["subtitulo"]))
                items.append(Paragraph(escape("; ".join(usados)), s["corpo"]))
            for tel in et.get("telefones") or []:
                items.append(Paragraph("Telefone (análise offline)", s["subtitulo"]))
                items.append(Paragraph(escape(
                    f"{tel.get('formatado') or ''} — {'válido' if tel.get('valido') else 'inválido'}; {tel.get('tipo') or ''}; "
                    f"região {tel.get('regiao') or '—'} ({tel.get('uf') or '—'}); operadora de origem {tel.get('operadora_origem') or '—'} "
                    f"({tel.get('nota_operadora') or ''}) — origem: {tel.get('origem') or '—'}"), s["corpo"]))
            for em in et.get("emails") or []:
                gv = em.get("gravatar") or {}
                items.append(Paragraph("E-mail", s["subtitulo"]))
                items.append(Paragraph(escape(
                    f"{em.get('email_mascarado') or ''} — {em.get('tipo') or ''}; domínio {em.get('dominio') or ''}; Gravatar: "
                    f"{'perfil/avatar público encontrado' if gv.get('existe') else 'nenhum'}"
                    + (f" — {gv.get('nome')}" if gv.get("nome") else "") + f" — origem: {em.get('origem') or '—'}"), s["corpo"]))
            contas = mg.get("contas") or []
            if contas:
                relevantes = [c for c in contas if c.get("confirmada") or c.get("confianca", 0) >= self.LIMIAR]
                restantes = len(contas) - len(relevantes)
                items.append(Paragraph(f"Contas encontradas pelo username ({len(contas)}) — "
                                       f"{len(relevantes)} relevante(s)", s["subtitulo"]))
                cab = [[self._cel(h, "cel_cab") for h in ("CONFIANÇA", "SITE / PERFIL", "POR QUE", "STATUS")]]
                rows = []
                for c in relevantes[:15]:
                    rotulo, cor = self._NIVEL.get(c.get("nivel"), ("—", "#5F5E5A"))
                    conf = Paragraph(f'<font color="{cor}"><b>{rotulo}</b></font><br/>{c.get("confianca")}%', s["cel"])
                    perfil = Paragraph(f"<b>{escape(str(c.get('site')))}</b><br/>{escape(str(c.get('nome_perfil') or c.get('username') or ''))}"
                                       f"<br/>{escape(str(c.get('url') or ''))[:70]}", s["cel"])
                    motivos = Paragraph("<br/>".join("• " + escape(str(m)) for m in (c.get("motivos") or [])), s["cel"])
                    status = "CONFIRMADA pelo analista" if c.get("confirmada") else "a confirmar"
                    rows.append([conf, perfil, motivos, self._cel(status)])
                if rows:
                    t2 = self._tabela_padrao(cab + rows, [2.3*cm, 6.2*cm, 5.5*cm, 3.0*cm])
                    t2.repeatRows = 1
                    items.append(t2)
                if restantes:
                    items.append(Paragraph(f"+ {restantes} conta(s) apenas com username igual (sem outro indício) — "
                                           f"não listadas; podem ser de outras pessoas.", s["sem_dados"]))
            for av in pd.get("avisos") or []:
                items.append(Paragraph(escape(str(av)), s["aviso"]))
        return items

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
            "cel": ParagraphStyle(
                "cel", fontName="Helvetica", fontSize=7.5, leading=9.5, textColor=CINZA_TEXTO,
            ),
            "cel_cab": ParagraphStyle(
                "cel_cab", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=BRANCO,
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
