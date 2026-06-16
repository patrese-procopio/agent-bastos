# -*- coding: utf-8 -*-
"""
services/briefing_service.py — Boletim Diário de Inteligência (Missão 24)
─────────────────────────────────────────────────────────────────────────────
Gera e envia o Boletim Diário de Inteligência (BDI) via WhatsApp (n8n).

FUNCIONAMENTO:
  1. Coleta eventos das últimas 24h: HITLs, correlações, alertas e extratos.
  2. Se não houver nenhum evento relevante → não envia (briefing condicional).
  3. Gera PDF com ReportLab (disponível no container).
  4. Salva o PDF em data/relatorios/briefing_YYYYMMDD.pdf (último por dia).
  5. Envia payload JSON para N8N_WEBHOOK_BRIEFING com PDF em base64.
     O n8n dispara sendText + sendFile para cada número em WA_NUMEROS_HITL.

CONFIGURAÇÃO (.env):
  N8N_WEBHOOK_BRIEFING=http://host.docker.internal:5678/webhook/bdi
  BRIEFING_HORA=6          # hora UTC do envio automático (padrão: 6)
  BRIEFING_ATIVO=true      # false desabilita o scheduler sem remover o código

ARQUITETURA:
  - Zero dependências extras (usa reportlab já instalado + threading do stdlib)
  - Mesmo padrão de thread daemon do modules/monitor.py
  - Nunca propaga exceção para o caller (try/except global em gerar_e_enviar)
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import sqlite3
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger("bastos.briefing")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_AUTH_DB    = os.path.join(BASE_DIR, "data", "auth.db")
_EXTRATO_DB = os.path.join(BASE_DIR, "data", "extrato", "extrato.db")
_ALERTAS_DB = os.path.join(BASE_DIR, "data", "alertas.db")
_RELATORIOS = os.path.join(BASE_DIR, "data", "relatorios")

N8N_WEBHOOK_BRIEFING = os.getenv("N8N_WEBHOOK_BRIEFING", "")


# ── Helpers de banco ─────────────────────────────────────────────────────────

def _query(db_path: str, sql: str, params: tuple = ()) -> list[dict]:
    """Executa query SQLite e retorna lista de dicts. Retorna [] se DB não existe."""
    if not os.path.exists(db_path):
        return []
    try:
        con = sqlite3.connect(db_path, timeout=5)
        con.row_factory = sqlite3.Row
        rows = con.execute(sql, params).fetchall()
        con.close()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.warning("[briefing] query falhou (%s): %s", db_path, exc)
        return []


# ── Coleta de dados ──────────────────────────────────────────────────────────

def _coletar_dados_24h() -> dict[str, Any]:
    """Coleta eventos das últimas 24h de todos os módulos monitorados."""
    agora   = datetime.now(timezone.utc)
    corte   = (agora - timedelta(hours=24)).isoformat()
    hoje_br = agora.strftime("%d/%m/%Y %H:%M UTC")

    # 1. HITLs pendentes criados nas últimas 24h
    hitls = _query(
        _AUTH_DB,
        "SELECT id, tipo_evento, descricao, risco, operador, status, criado_em "
        "FROM aprovacoes_pendentes "
        "WHERE criado_em >= ? ORDER BY criado_em DESC LIMIT 50",
        (corte,),
    )

    # 2. Correlações registradas nas últimas 24h
    correlacoes = _query(
        _AUTH_DB,
        "SELECT fonte_tipo, fonte_id, alvo_nome_norm, alvo_fonte, criado_em "
        "FROM correlacoes_registradas "
        "WHERE criado_em >= ? ORDER BY criado_em DESC LIMIT 50",
        (corte,),
    )

    # 3. Alertas ativos (sem filtro de 24h — são alertas em aberto)
    alertas = _query(
        _ALERTAS_DB,
        "SELECT titulo, descricao, nivel, criado_em "
        "FROM alertas WHERE ativo = 1 ORDER BY nivel DESC, criado_em DESC LIMIT 20",
    )

    # 4. Extratos novos nas últimas 24h
    extratos = _query(
        _EXTRATO_DB,
        "SELECT id, assunto, unidade, risco, criado_em "
        "FROM extratos WHERE criado_em >= ? ORDER BY criado_em DESC LIMIT 20",
        (corte,),
    )

    return {
        "hitls":       hitls,
        "correlacoes": correlacoes,
        "alertas":     alertas,
        "extratos":    extratos,
        "periodo":     f"Últimas 24h até {hoje_br}",
        "gerado_em":   agora.isoformat(),
    }


# ── Geração do PDF ───────────────────────────────────────────────────────────

def _gerar_pdf(dados: dict) -> bytes:
    """Gera o BDI em PDF usando ReportLab. Retorna bytes do PDF."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import cm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
    )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
        title="Boletim Diário de Inteligência — Agent Bastos",
    )

    styles = getSampleStyleSheet()
    AZUL_ESCURO = colors.HexColor("#0d1b2a")
    AZUL_MEDIO  = colors.HexColor("#1b3a5c")
    AMARELO     = colors.HexColor("#f5a623")
    CINZA_CLARO = colors.HexColor("#f2f2f2")
    VERMELHO    = colors.HexColor("#c0392b")
    LARANJA     = colors.HexColor("#e67e22")
    VERDE       = colors.HexColor("#27ae60")

    def _style(name, **kw):
        s = ParagraphStyle(name, parent=styles["Normal"], **kw)
        return s

    titulo_style  = _style("Titulo",  fontSize=16, textColor=colors.white,
                            alignment=TA_CENTER, fontName="Helvetica-Bold", spaceAfter=4)
    sub_style     = _style("Sub",     fontSize=9,  textColor=colors.white,
                            alignment=TA_CENTER, fontName="Helvetica")
    secao_style   = _style("Secao",   fontSize=11, textColor=AZUL_ESCURO,
                            fontName="Helvetica-Bold", spaceBefore=10, spaceAfter=4)
    corpo_style   = _style("Corpo",   fontSize=8,  textColor=colors.black,
                            fontName="Helvetica", leading=12)
    rodape_style  = _style("Rodape",  fontSize=7,  textColor=colors.grey,
                            alignment=TA_CENTER)

    elems = []

    # ── Cabeçalho ──────────────────────────────────────────────────────────
    header_data = [[
        Paragraph("BOLETIM DIARIO DE INTELIGENCIA", titulo_style),
    ], [
        Paragraph(f"AIPEN · Agent Bastos · {dados['periodo']}", sub_style),
    ]]
    header_table = Table(header_data, colWidths=[17*cm])
    header_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), AZUL_ESCURO),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING",   (0, 0), (-1, -1), 12),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
    ]))
    elems.append(header_table)
    elems.append(Spacer(1, 0.5*cm))

    # ── Resumo executivo ───────────────────────────────────────────────────
    total_hitls  = len(dados["hitls"])
    total_corr   = len(dados["correlacoes"])
    total_alert  = len(dados["alertas"])
    total_extr   = len(dados["extratos"])

    resumo_data = [
        ["Indicador", "Quantidade", "Status"],
        ["HITLs Pendentes (24h)",    str(total_hitls),  "! Atencao" if total_hitls else "OK"],
        ["Correlacoes Detectadas (24h)", str(total_corr),  "Cruzamento" if total_corr else "OK"],
        ["Alertas Ativos",           str(total_alert), "Ativo" if total_alert else "OK"],
        ["Extratos de Campo (24h)",  str(total_extr),  "Novo" if total_extr else "OK"],
    ]
    resumo_table = Table(resumo_data, colWidths=[8*cm, 3.5*cm, 5.5*cm])
    resumo_table.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), AZUL_MEDIO),
        ("TEXTCOLOR",    (0, 0), (-1, 0), colors.white),
        ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [CINZA_CLARO, colors.white]),
        ("ALIGN",        (1, 0), (1, -1), "CENTER"),
        ("GRID",         (0, 0), (-1, -1), 0.25, colors.grey),
        ("TOPPADDING",   (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
        ("LEFTPADDING",  (0, 0), (-1, -1), 6),
    ]))
    elems.append(Paragraph("RESUMO EXECUTIVO", secao_style))
    elems.append(resumo_table)
    elems.append(Spacer(1, 0.4*cm))

    def _nivel_cor(n: str) -> Any:
        n = (n or "").upper()
        if n in ("CRÍTICO", "CRITICO"):
            return VERMELHO
        if n == "ALTO":
            return LARANJA
        return VERDE

    # ── Seção HITLs ────────────────────────────────────────────────────────
    if dados["hitls"]:
        elems.append(HRFlowable(width="100%", thickness=1, color=AZUL_MEDIO))
        elems.append(Paragraph(f"CONTROLE HITL — {total_hitls} evento(s)", secao_style))
        hitl_data = [["ID", "Tipo", "Descrição", "Risco", "Status", "Criado em"]]
        for h in dados["hitls"]:
            hitl_data.append([
                str(h.get("id", ""))[:8] + "…",
                str(h.get("tipo_evento", ""))[:20],
                str(h.get("descricao", ""))[:45],
                str(h.get("risco", "")),
                str(h.get("status", "")),
                str(h.get("criado_em", ""))[:16],
            ])
        t = Table(hitl_data, colWidths=[1.5*cm, 3*cm, 5.5*cm, 2*cm, 2*cm, 3*cm])
        t.setStyle(TableStyle([
            ("BACKGROUND",   (0, 0), (-1, 0), AZUL_MEDIO),
            ("TEXTCOLOR",    (0, 0), (-1, 0), colors.white),
            ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",     (0, 0), (-1, -1), 7),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [CINZA_CLARO, colors.white]),
            ("GRID",         (0, 0), (-1, -1), 0.25, colors.grey),
            ("TOPPADDING",   (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
            ("LEFTPADDING",  (0, 0), (-1, -1), 4),
            ("WORDWRAP",     (0, 0), (-1, -1), True),
        ]))
        elems.append(t)
        elems.append(Spacer(1, 0.3*cm))

    # ── Seção Correlações ─────────────────────────────────────────────────
    if dados["correlacoes"]:
        elems.append(HRFlowable(width="100%", thickness=1, color=AZUL_MEDIO))
        elems.append(Paragraph(f"CORRELAÇÕES CRUZADAS — {total_corr} par(es)", secao_style))
        corr_data = [["Módulo", "Fonte ID", "Entidade Detectada", "Origem", "Detectado em"]]
        for c in dados["correlacoes"]:
            corr_data.append([
                str(c.get("fonte_tipo", "")),
                str(c.get("fonte_id", ""))[:14],
                str(c.get("alvo_nome_norm", "")).title()[:30],
                str(c.get("alvo_fonte", ""))[:20],
                str(c.get("criado_em", ""))[:16],
            ])
        t = Table(corr_data, colWidths=[2.5*cm, 2.5*cm, 5*cm, 3.5*cm, 3.5*cm])
        t.setStyle(TableStyle([
            ("BACKGROUND",   (0, 0), (-1, 0), AZUL_MEDIO),
            ("TEXTCOLOR",    (0, 0), (-1, 0), colors.white),
            ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",     (0, 0), (-1, -1), 7),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [CINZA_CLARO, colors.white]),
            ("GRID",         (0, 0), (-1, -1), 0.25, colors.grey),
            ("TOPPADDING",   (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
            ("LEFTPADDING",  (0, 0), (-1, -1), 4),
        ]))
        elems.append(t)
        elems.append(Spacer(1, 0.3*cm))

    # ── Seção Alertas ─────────────────────────────────────────────────────
    if dados["alertas"]:
        elems.append(HRFlowable(width="100%", thickness=1, color=AZUL_MEDIO))
        elems.append(Paragraph(f"ALERTAS ATIVOS — {total_alert} alerta(s)", secao_style))
        alert_data = [["Nível", "Título", "Descrição", "Criado em"]]
        for a in dados["alertas"]:
            alert_data.append([
                str(a.get("nivel", "")),
                str(a.get("titulo", ""))[:30],
                str(a.get("descricao", ""))[:50],
                str(a.get("criado_em", ""))[:16],
            ])
        t = Table(alert_data, colWidths=[2*cm, 4*cm, 7*cm, 4*cm])
        t.setStyle(TableStyle([
            ("BACKGROUND",   (0, 0), (-1, 0), AZUL_MEDIO),
            ("TEXTCOLOR",    (0, 0), (-1, 0), colors.white),
            ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",     (0, 0), (-1, -1), 7),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [CINZA_CLARO, colors.white]),
            ("GRID",         (0, 0), (-1, -1), 0.25, colors.grey),
            ("TOPPADDING",   (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
            ("LEFTPADDING",  (0, 0), (-1, -1), 4),
        ]))
        elems.append(t)
        elems.append(Spacer(1, 0.3*cm))

    # ── Seção Extratos ────────────────────────────────────────────────────
    if dados["extratos"]:
        elems.append(HRFlowable(width="100%", thickness=1, color=AZUL_MEDIO))
        elems.append(Paragraph(f"EXTRATOS DE CAMPO — {total_extr} novo(s)", secao_style))
        extr_data = [["ID", "Assunto", "Unidade", "Risco", "Criado em"]]
        for e in dados["extratos"]:
            extr_data.append([
                str(e.get("id", ""))[:10],
                str(e.get("assunto", ""))[:35],
                str(e.get("unidade", ""))[:15],
                str(e.get("risco", "")),
                str(e.get("criado_em", ""))[:16],
            ])
        t = Table(extr_data, colWidths=[2*cm, 6*cm, 3*cm, 2*cm, 4*cm])
        t.setStyle(TableStyle([
            ("BACKGROUND",   (0, 0), (-1, 0), AZUL_MEDIO),
            ("TEXTCOLOR",    (0, 0), (-1, 0), colors.white),
            ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",     (0, 0), (-1, -1), 7),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [CINZA_CLARO, colors.white]),
            ("GRID",         (0, 0), (-1, -1), 0.25, colors.grey),
            ("TOPPADDING",   (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
            ("LEFTPADDING",  (0, 0), (-1, -1), 4),
        ]))
        elems.append(t)
        elems.append(Spacer(1, 0.3*cm))

    # ── Rodapé ─────────────────────────────────────────────────────────────
    elems.append(Spacer(1, 0.5*cm))
    elems.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
    elems.append(Spacer(1, 0.2*cm))
    elems.append(Paragraph(
        f"Gerado automaticamente pelo Agent Bastos | AIPEN · {dados['gerado_em'][:19]} UTC · "
        "DOCUMENTO DE USO RESTRITO — NÃO COMPARTILHAR",
        rodape_style,
    ))

    doc.build(elems)
    return buf.getvalue()


# ── Persistência local ────────────────────────────────────────────────────────

def _caminho_pdf_hoje() -> str:
    hoje = datetime.now(timezone.utc).strftime("%Y%m%d")
    os.makedirs(_RELATORIOS, exist_ok=True)
    return os.path.join(_RELATORIOS, f"briefing_{hoje}.pdf")


def _salvar_pdf(pdf_bytes: bytes) -> str:
    """Salva o PDF em data/relatorios/briefing_YYYYMMDD.pdf. Retorna o caminho."""
    path = _caminho_pdf_hoje()
    with open(path, "wb") as f:
        f.write(pdf_bytes)
    logger.info("[briefing] PDF salvo: %s (%d bytes)", path, len(pdf_bytes))
    return path


# ── Envio WhatsApp via n8n ────────────────────────────────────────────────────

def _enviar_whatsapp(pdf_bytes: bytes, dados: dict, operador: str) -> bool:
    """
    Envia o BDI para o n8n via webhook.

    Payload esperado pelo n8n:
      tipo          → "briefing_diario"
      pdf_base64    → PDF em base64 para enviar como documento
      resumo        → texto curto para enviar como mensagem prévia
      numeros_destino → lista de números WhatsApp
      gerado_em     → ISO timestamp
    """
    if not N8N_WEBHOOK_BRIEFING:
        logger.warning("[briefing] N8N_WEBHOOK_BRIEFING não configurado — PDF salvo mas não enviado.")
        return False

    from services.notification_service import get_numeros_hitl
    numeros = get_numeros_hitl()
    if not numeros:
        logger.warning("[briefing] WA_NUMEROS_HITL não configurado — briefing não enviado.")
        return False

    pdf_b64  = base64.b64encode(pdf_bytes).decode()
    total_ev = (
        len(dados["hitls"]) + len(dados["correlacoes"]) +
        len(dados["alertas"]) + len(dados["extratos"])
    )
    resumo = (
        f"📊 *BOLETIM DIÁRIO DE INTELIGÊNCIA*\n"
        f"Agent Bastos | AIPEN\n"
        f"📅 {dados['periodo']}\n\n"
        f"[HITL] {len(dados['hitls'])} pendente(s)\n"
        f"[CORR] {len(dados['correlacoes'])} correlacao(oes) nova(s)\n"
        f"[ALERT] {len(dados['alertas'])} alerta(s) ativo(s)\n"
        f"[EXTR] {len(dados['extratos'])} extrato(s) novo(s)\n\n"
        f"Total: {total_ev} evento(s). Ver PDF em anexo."
    )

    payload = {
        "tipo":            "briefing_diario",
        "pdf_base64":      pdf_b64,
        "pdf_filename":    f"BDI_{datetime.now(timezone.utc).strftime('%Y%m%d')}.pdf",
        "resumo":          resumo,
        "numeros_destino": numeros,
        "gerado_em":       dados["gerado_em"],
        "operador":        operador,
        "callback_url":    os.getenv("BASTOS_CALLBACK_URL", "http://127.0.0.1:8000"),
    }

    try:
        import httpx
        resp = httpx.post(N8N_WEBHOOK_BRIEFING, json=payload, timeout=15.0)
        if resp.status_code < 300:
            logger.info("[briefing] BDI enviado ao n8n para %d destinatário(s).", len(numeros))
            return True
        else:
            logger.warning("[briefing] n8n retornou %d.", resp.status_code)
            return False
    except Exception as exc:
        logger.error("[briefing] Falha ao enviar para n8n: %s", exc)
        return False


# ── Ponto de entrada principal ────────────────────────────────────────────────

def gerar_e_enviar(operador: str = "sistema") -> dict:
    """
    Coleta dados, gera PDF e envia via WhatsApp SE houver eventos relevantes.

    Retorna dict com resultado da operação:
      {"enviado": True/False, "motivo": str, "total_eventos": int, "pdf_path": str}
    """
    try:
        logger.info("[briefing] Iniciando geração do BDI | operador=%s", operador)
        dados = _coletar_dados_24h()

        total_eventos = (
            len(dados["hitls"])       +
            len(dados["correlacoes"]) +
            len(dados["alertas"])     +
            len(dados["extratos"])
        )

        if total_eventos == 0:
            logger.info("[briefing] Sem eventos nas últimas 24h — BDI não enviado.")
            return {"enviado": False, "motivo": "sem_eventos", "total_eventos": 0}

        pdf_bytes = _gerar_pdf(dados)
        pdf_path  = _salvar_pdf(pdf_bytes)
        enviado   = _enviar_whatsapp(pdf_bytes, dados, operador)

        logger.info(
            "[briefing] BDI gerado | eventos=%d | enviado=%s | path=%s",
            total_eventos, enviado, pdf_path,
        )
        return {
            "enviado":       enviado,
            "motivo":        "ok" if enviado else "n8n_indisponivel",
            "total_eventos": total_eventos,
            "pdf_path":      pdf_path,
            "detalhes": {
                "hitls":       len(dados["hitls"]),
                "correlacoes": len(dados["correlacoes"]),
                "alertas":     len(dados["alertas"]),
                "extratos":    len(dados["extratos"]),
            },
        }

    except Exception as exc:
        logger.error("[briefing] Erro inesperado na geração do BDI: %s", exc, exc_info=True)
        return {"enviado": False, "motivo": str(exc), "total_eventos": 0}


# ── Scheduler automático ──────────────────────────────────────────────────────

_scheduler_iniciado = False


def iniciar_scheduler() -> None:
    """
    Inicia thread daemon que dispara o BDI todo dia na hora configurada.

    Variáveis de ambiente:
      BRIEFING_ATIVO=true      → habilita/desabilita (padrão: true)
      BRIEFING_HORA=6          → hora UTC do disparo (padrão: 6)

    Por que thread e não asyncio?
      gerar_e_enviar usa I/O síncrono (SQLite + httpx síncrono).
      Thread daemon encerra junto com o processo — sem vazamento.
    """
    global _scheduler_iniciado
    if _scheduler_iniciado:
        return

    ativo = os.getenv("BRIEFING_ATIVO", "true").lower() == "true"
    if not ativo:
        logger.info("[briefing] Scheduler desabilitado (BRIEFING_ATIVO=false).")
        return

    try:
        hora_alvo = int(os.getenv("BRIEFING_HORA", "6"))
    except ValueError:
        hora_alvo = 6

    def _loop():
        logger.info("[briefing] Scheduler iniciado — disparo diário às %02d:00 UTC.", hora_alvo)
        while True:
            agora     = datetime.now(timezone.utc)
            prox_run  = agora.replace(hour=hora_alvo, minute=0, second=0, microsecond=0)
            if agora >= prox_run:
                prox_run += timedelta(days=1)
            espera_s  = (prox_run - agora).total_seconds()
            logger.info(
                "[briefing] Próximo BDI em %.0fh (%.0f min).",
                espera_s / 3600, espera_s / 60,
            )
            time.sleep(espera_s)
            gerar_e_enviar(operador="sistema/cron")

    t = threading.Thread(target=_loop, daemon=True, name="briefing-scheduler")
    t.start()
    _scheduler_iniciado = True
