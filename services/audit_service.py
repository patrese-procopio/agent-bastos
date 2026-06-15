"""
audit_service.py — Log imutável de auditoria
─────────────────────────────────────────────────────────────────────────────
Registra todos os eventos sensíveis do sistema para fins de compliance (LGPD)
e rastreabilidade operacional.

Categorias:
  autenticacao  — login ok/falhou, logout, token renovado
  hitl          — decisões HITL (confirmada, rejeitada, criada)
  usuario       — criação, edição, desativação de usuários
  consulta      — acesso a módulos sensíveis (OSINT, Lista Negra, Grafoscopia)
  liderancas    — inserção, edição, exclusão de lideranças

Design:
  - Tabela append-only em data/auth.db (nunca UPDATE, nunca DELETE)
  - ID UUID v4 gerado localmente — não reutilizável
  - Timestamp sempre UTC ISO 8601
"""

from __future__ import annotations

import csv
import io
import json
import logging
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Optional

_log = logging.getLogger("bastos.audit")

_DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data", "audit.db"
)


# ── DB ────────────────────────────────────────────────────────────────────────

def _conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
    c = sqlite3.connect(_DB_PATH, check_same_thread=False)
    c.execute("PRAGMA journal_mode=WAL")
    return c


def _init() -> None:
    with _conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS audit_log (
                id         TEXT PRIMARY KEY,
                evento     TEXT NOT NULL,
                categoria  TEXT NOT NULL,
                usuario    TEXT NOT NULL DEFAULT 'sistema',
                alvo       TEXT,
                detalhe    TEXT,
                ip         TEXT,
                timestamp  TEXT NOT NULL
            )
        """)
        c.execute("CREATE INDEX IF NOT EXISTS idx_audit_ts       ON audit_log(timestamp)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_audit_categoria ON audit_log(categoria)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_audit_usuario   ON audit_log(usuario)")


_init()


# ── Write ─────────────────────────────────────────────────────────────────────

def registrar(
    evento:    str,
    categoria: str,
    usuario:   str = "sistema",
    alvo:      Optional[str] = None,
    detalhe:   Optional[str] = None,
    ip:        Optional[str] = None,
) -> str:
    """
    Insere um evento de auditoria. Retorna o ID gerado.

    Exemplo:
        registrar(
            evento="login_ok",
            categoria="autenticacao",
            usuario="admin",
            ip="192.168.1.10",
        )
    """
    eid = str(uuid.uuid4())
    ts  = datetime.now(timezone.utc).isoformat()
    with _conn() as c:
        c.execute(
            "INSERT INTO audit_log (id, evento, categoria, usuario, alvo, detalhe, ip, timestamp) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (eid, evento, categoria, usuario, alvo, detalhe, ip, ts),
        )
    return eid


# ── Read ──────────────────────────────────────────────────────────────────────

def listar(
    categoria:   Optional[str] = None,
    usuario:     Optional[str] = None,
    data_inicio: Optional[str] = None,
    data_fim:    Optional[str] = None,
    limite:      int = 200,
    offset:      int = 0,
) -> list[dict]:
    """
    Lista eventos com filtros opcionais. Ordem: mais recente primeiro.
    data_inicio / data_fim: ISO date string "YYYY-MM-DD"
    """
    q      = "SELECT id, evento, categoria, usuario, alvo, detalhe, ip, timestamp FROM audit_log WHERE 1=1"
    params = []

    if categoria:
        q += " AND categoria = ?"
        params.append(categoria)
    if usuario:
        q += " AND usuario LIKE ?"
        params.append(f"%{usuario}%")
    if data_inicio:
        q += " AND timestamp >= ?"
        params.append(data_inicio)
    if data_fim:
        # data_fim inclusive: pega até o final do dia
        q += " AND timestamp <= ?"
        params.append(data_fim + "T23:59:59")
    q += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
    params += [limite, offset]

    with _conn() as c:
        rows = c.execute(q, params).fetchall()

    cols = ["id", "evento", "categoria", "usuario", "alvo", "detalhe", "ip", "timestamp"]
    return [dict(zip(cols, r)) for r in rows]


def contar(
    categoria:   Optional[str] = None,
    usuario:     Optional[str] = None,
    data_inicio: Optional[str] = None,
    data_fim:    Optional[str] = None,
) -> int:
    q      = "SELECT COUNT(*) FROM audit_log WHERE 1=1"
    params = []
    if categoria:
        q += " AND categoria = ?"; params.append(categoria)
    if usuario:
        q += " AND usuario LIKE ?"; params.append(f"%{usuario}%")
    if data_inicio:
        q += " AND timestamp >= ?"; params.append(data_inicio)
    if data_fim:
        q += " AND timestamp <= ?"; params.append(data_fim + "T23:59:59")
    with _conn() as c:
        return c.execute(q, params).fetchone()[0]


# ── Exportação CSV ────────────────────────────────────────────────────────────

def exportar_csv(
    categoria:   Optional[str] = None,
    usuario:     Optional[str] = None,
    data_inicio: Optional[str] = None,
    data_fim:    Optional[str] = None,
) -> bytes:
    """Retorna bytes de um arquivo CSV com todos os registros filtrados."""
    registros = listar(categoria=categoria, usuario=usuario,
                       data_inicio=data_inicio, data_fim=data_fim, limite=10_000)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=["id","evento","categoria","usuario","alvo","detalhe","ip","timestamp"],
                            extrasaction="ignore")
    writer.writeheader()
    writer.writerows(registros)
    return buf.getvalue().encode("utf-8-sig")  # BOM para Excel abrir corretamente


# ── Exportação PDF ────────────────────────────────────────────────────────────

def exportar_pdf(
    categoria:   Optional[str] = None,
    usuario:     Optional[str] = None,
    data_inicio: Optional[str] = None,
    data_fim:    Optional[str] = None,
) -> bytes:
    """
    Gera PDF de auditoria com ReportLab.
    Layout: cabeçalho institucional, filtros aplicados, tabela de eventos.
    """
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        SimpleDocTemplate, Table, TableStyle, Paragraph,
        Spacer, HRFlowable,
    )

    registros = listar(categoria=categoria, usuario=usuario,
                       data_inicio=data_inicio, data_fim=data_fim, limite=10_000)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=1.5*cm, rightMargin=1.5*cm,
        topMargin=2*cm,    bottomMargin=2*cm,
        title="Relatório de Auditoria — Agent Bastos",
    )

    styles = getSampleStyleSheet()
    cor_titulo  = colors.HexColor("#E8A020")
    cor_header  = colors.HexColor("#0B1120")
    cor_linha_a = colors.HexColor("#111827")
    cor_linha_b = colors.HexColor("#1A2236")
    cor_texto   = colors.HexColor("#F1F5F9")
    cor_mid     = colors.HexColor("#94A3B8")

    CATEGORIA_CORES = {
        "autenticacao": colors.HexColor("#60A5FA"),
        "hitl":         colors.HexColor("#F59E0B"),
        "usuario":      colors.HexColor("#F87171"),
        "consulta":     colors.HexColor("#A78BFA"),
        "liderancas":   colors.HexColor("#34D399"),
    }

    titulo_style = ParagraphStyle("titulo", fontSize=16, fontName="Helvetica-Bold",
                                  textColor=cor_titulo, spaceAfter=4)
    sub_style    = ParagraphStyle("sub",    fontSize=9,  fontName="Helvetica",
                                  textColor=cor_mid,    spaceAfter=2)
    cell_style   = ParagraphStyle("cell",   fontSize=7.5, fontName="Helvetica",
                                  textColor=cor_texto,  leading=10)

    gerado_em = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")
    filtros   = []
    if categoria:   filtros.append(f"Categoria: {categoria}")
    if usuario:     filtros.append(f"Usuário: {usuario}")
    if data_inicio: filtros.append(f"De: {data_inicio}")
    if data_fim:    filtros.append(f"Até: {data_fim}")
    filtros_str = "  |  ".join(filtros) if filtros else "Sem filtros — exibindo todos os registros"

    story = [
        Paragraph("AGENT BASTOS — Relatório de Auditoria", titulo_style),
        Paragraph(f"Gerado em: {gerado_em}   ·   {len(registros)} registro(s)   ·   {filtros_str}", sub_style),
        HRFlowable(width="100%", thickness=1, color=cor_titulo, spaceAfter=12),
    ]

    if not registros:
        story.append(Paragraph("Nenhum registro encontrado para os filtros aplicados.", sub_style))
    else:
        headers = ["Timestamp", "Categoria", "Evento", "Usuário", "Alvo", "Detalhe", "IP"]
        col_ws  = [3.8*cm, 2.5*cm, 3.5*cm, 2.5*cm, 3.5*cm, 7*cm, 2.5*cm]

        data = [headers]
        for r in registros:
            ts_fmt = r["timestamp"][:16].replace("T", " ") if r["timestamp"] else "—"
            data.append([
                ts_fmt,
                r["categoria"] or "—",
                r["evento"]    or "—",
                r["usuario"]   or "—",
                r["alvo"]      or "—",
                (r["detalhe"] or "—")[:120],
                r["ip"]        or "—",
            ])

        t = Table(data, colWidths=col_ws, repeatRows=1)
        style = TableStyle([
            # Header
            ("BACKGROUND",   (0,0), (-1,0), cor_header),
            ("TEXTCOLOR",    (0,0), (-1,0), cor_titulo),
            ("FONTNAME",     (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE",     (0,0), (-1,0), 8),
            ("BOTTOMPADDING",(0,0), (-1,0), 7),
            ("TOPPADDING",   (0,0), (-1,0), 7),
            # Body
            ("FONTNAME",     (0,1), (-1,-1), "Helvetica"),
            ("FONTSIZE",     (0,1), (-1,-1), 7.5),
            ("TOPPADDING",   (0,1), (-1,-1), 5),
            ("BOTTOMPADDING",(0,1), (-1,-1), 5),
            ("TEXTCOLOR",    (0,1), (-1,-1), cor_texto),
            ("ROWBACKGROUNDS",(0,1),(-1,-1),[cor_linha_a, cor_linha_b]),
            ("GRID",         (0,0), (-1,-1), 0.3, colors.HexColor("#1E2D40")),
            ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
            ("WORDWRAP",     (0,0), (-1,-1), True),
        ])
        # Colorir coluna categoria por tipo
        for i, row in enumerate(data[1:], start=1):
            cat = row[1]
            cor = CATEGORIA_CORES.get(cat, cor_mid)
            style.add("TEXTCOLOR", (1,i), (1,i), cor)
            style.add("FONTNAME",  (1,i), (1,i), "Helvetica-Bold")

        t.setStyle(style)
        story.append(t)

    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph(
        "RESERVADO — USO INTERNO — Agent Bastos Intelligence System © 2026",
        ParagraphStyle("rodape", fontSize=7, fontName="Helvetica",
                       textColor=cor_mid, alignment=1),
    ))

    doc.build(story)
    return buf.getvalue()
