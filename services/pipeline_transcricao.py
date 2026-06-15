# -*- coding: utf-8 -*-
"""
services/pipeline_transcricao.py - Pipeline de Cruzamento Pos-Transcricao
Agent Bastos | AIPEN

Executa automaticamente em BackgroundTask apos cada transcricao.

Fluxo:
  1. Recebe o texto bruto + metadados da transcricao
  2. Carrega corpus de nomes monitorados de 3 fontes:
       alvos.json       -> lista de vigilancia ativa
       liderancas.db    -> lideres de pavilhao + lideres de rua
       extrato.db       -> entidades ja citadas em extratos de campo
  3. Compara o texto normalizado contra cada nome do corpus
  4. Se houver hit(s) -> abre aprovacao HITL com contexto completo

Principios de design:
  - Nunca levanta excecao para o chamador (try/except global)
  - Sem chamadas LLM - matching deterministico por tokens (zero custo)
  - Deduplicacao de nomes no corpus (nome_norm como chave de set)

Estrategia de match (2 camadas):
  Camada 1: match exato da string normalizada completa no texto.
  Camada 2: match por tokens significativos (>=4 chars, sem preposicoes):
    - 1 token : deve aparecer no texto
    - 2 tokens: ambos devem aparecer (AND)
    - 3+ tokens: primeiro E ultimo token (captura "Gelson Carnauba"
                 mesmo sem o sobrenome do meio "Lima")
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sqlite3
import unicodedata

logger = logging.getLogger("bastos.pipeline_transcricao")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_STOP = {
    "de", "da", "do", "dos", "das", "e", "em", "para", "por",
    "com", "os", "as", "um", "uma", "na", "no", "nos", "nas",
    "ao", "aos", "a", "o",
}


# -- Normalizacao --------------------------------------------------------------

def _norm(txt: str) -> str:
    """Remove acentos, caixa e espacos extras."""
    if not txt:
        return ""
    t = unicodedata.normalize("NFKD", str(txt))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t.strip().lower())


def _tokens(nome_norm: str) -> list:
    """Tokens significativos: comprimento >= 4 chars e nao stop word."""
    return [t for t in nome_norm.split() if len(t) >= 4 and t not in _STOP]


# -- Fontes de dados ----------------------------------------------------------

def _carregar_alvos() -> list:
    path = os.path.join(BASE_DIR, "data", "alvos.json")
    try:
        with open(path, encoding="utf-8") as f:
            alvos = json.load(f)
    except Exception as exc:
        logger.warning("[pipeline] Falha ao ler alvos.json: %s", exc)
        return []

    resultado = []
    for a in alvos:
        if a.get("tipo") == "termo":
            nome = (a.get("termo") or "").strip()
            detalhe = a.get("descricao") or "Termo monitorado"
        else:
            nome = (a.get("nome") or "").strip()
            detalhe = "Alvo monitorado (pessoa)"
        if nome:
            resultado.append({
                "fonte": "Alvo Monitorado",
                "nome": nome,
                "nome_norm": _norm(nome),
                "detalhe": detalhe,
            })
    return resultado


def _carregar_lideres() -> list:
    db_path = os.path.join(BASE_DIR, "data", "liderancas", "liderancas.db")
    if not os.path.exists(db_path):
        return []

    resultado = []
    try:
        con = sqlite3.connect(db_path, timeout=5)
        con.row_factory = sqlite3.Row

        rows = con.execute(
            "SELECT nome, vulgo, cargo, faccao, unidade FROM liderancas"
            " WHERE nome IS NOT NULL AND nome != ''"
        ).fetchall()
        for r in rows:
            nome  = (r["nome"]  or "").strip()
            vulgo = (r["vulgo"] or "").strip()
            info  = "Cargo: %s | Faccao: %s | Unidade: %s" % (r["cargo"], r["faccao"], r["unidade"])
            if nome:
                resultado.append({"fonte": "Lideranca (Pavilhao)", "nome": nome,
                                   "nome_norm": _norm(nome), "detalhe": info})
            if vulgo:
                resultado.append({"fonte": "Lideranca (Pavilhao)", "nome": vulgo,
                                   "nome_norm": _norm(vulgo),
                                   "detalhe": "Vulgo de %s | %s" % (nome, info)})

        tabelas = {r[0] for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}
        if "lideres_rua" in tabelas and "faccoes_rua" in tabelas:
            rows = con.execute(
                "SELECT l.nome, l.vulgo, l.cargo, f.nome AS faccao_nome"
                " FROM lideres_rua l"
                " JOIN faccoes_rua f ON f.id = l.faccao_id"
                " WHERE l.nome IS NOT NULL AND l.nome != ''"
            ).fetchall()
            for r in rows:
                nome  = (r["nome"]  or "").strip()
                vulgo = (r["vulgo"] or "").strip()
                info  = "Cargo: %s | Faccao: %s" % (r["cargo"], r["faccao_nome"])
                if nome:
                    resultado.append({"fonte": "Lideranca (Rua)", "nome": nome,
                                       "nome_norm": _norm(nome), "detalhe": info})
                if vulgo:
                    resultado.append({"fonte": "Lideranca (Rua)", "nome": vulgo,
                                       "nome_norm": _norm(vulgo),
                                       "detalhe": "Vulgo de %s | %s" % (nome, info)})
        con.close()
    except Exception as exc:
        logger.warning("[pipeline] Falha ao ler liderancas.db: %s", exc)

    return resultado


def _carregar_entidades_extrato() -> list:
    db_path = os.path.join(BASE_DIR, "data", "extrato", "extrato.db")
    if not os.path.exists(db_path):
        return []

    resultado = []
    seen = set()
    try:
        con = sqlite3.connect(db_path, timeout=5)
        con.row_factory = sqlite3.Row
        rows = con.execute(
            "SELECT DISTINCT nome, vulgo, papel, extrato_id"
            " FROM extrato_entidades"
            " WHERE nome IS NOT NULL AND nome != ''"
        ).fetchall()
        for r in rows:
            nome  = (r["nome"]  or "").strip()
            vulgo = (r["vulgo"] or "").strip()
            info  = "Papel: %s | Extrato: %s" % (r["papel"] or "N/A", r["extrato_id"])

            key = _norm(nome)
            if nome and key not in seen:
                seen.add(key)
                resultado.append({"fonte": "Extrato de Campo", "nome": nome,
                                   "nome_norm": key, "detalhe": info})

            vkey = _norm(vulgo)
            if vulgo and vkey not in seen:
                seen.add(vkey)
                resultado.append({"fonte": "Extrato de Campo", "nome": vulgo,
                                   "nome_norm": vkey,
                                   "detalhe": "Vulgo de %s | %s" % (nome, info)})
        con.close()
    except Exception as exc:
        logger.warning("[pipeline] Falha ao ler extrato.db: %s", exc)

    return resultado


# -- Motor de correspondencia -------------------------------------------------

def _tem_hit(texto_norm: str, entrada: dict) -> bool:
    """
    Verifica se o nome aparece no texto normalizado.

    Camada 1: match exato da string completa.
    Camada 2: match por tokens (>=4 chars, sem stop words):
      1 token  -> deve aparecer no texto
      2 tokens -> ambos devem aparecer
      3+ tokens -> primeiro E ultimo token devem aparecer
    """
    nome_norm = entrada.get("nome_norm", "")
    if not nome_norm or len(nome_norm) < 4:
        return False

    if nome_norm in texto_norm:
        return True

    toks = _tokens(nome_norm)
    if not toks:
        return False

    if len(toks) == 1:
        return toks[0] in texto_norm
    if len(toks) == 2:
        return (toks[0] in texto_norm) and (toks[1] in texto_norm)
    # 3+ tokens: primeiro E ultimo
    return (toks[0] in texto_norm) and (toks[-1] in texto_norm)


def _buscar_hits(texto: str) -> list:
    """Constroi corpus e retorna entradas com match, sem duplicatas."""
    texto_norm = _norm(texto)
    corpus = _carregar_alvos() + _carregar_lideres() + _carregar_entidades_extrato()

    hits = []
    seen = set()
    for entrada in corpus:
        key = entrada.get("nome_norm", "")
        if key in seen:
            continue
        if _tem_hit(texto_norm, entrada):
            seen.add(key)
            hits.append(entrada)
    return hits


# -- Ponto de entrada publico -------------------------------------------------

def executar(texto, resultado, filename, operador):
    """
    Chamado como BackgroundTask apos a transcricao ser concluida.
    Nunca propaga excecao para o chamador.
    """
    try:
        if not texto or len(texto.strip()) < 10:
            logger.debug("[pipeline] Texto muito curto - cruzamento ignorado.")
            return

        hits = _buscar_hits(texto)

        if not hits:
            logger.info("[pipeline] '%s': nenhum cruzamento encontrado.", filename)
            return

        nomes = [h["nome"] for h in hits]
        logger.info("[pipeline] '%s': %d hit(s) -> %s", filename, len(hits), nomes)

        risco   = (resultado.get("risk_level") or "MEDIO").upper()
        summary = (resultado.get("summary") or "")[:300]
        n_flags = len(resultado.get("red_flags") or [])

        hits_linhas = "\n".join(
            "  * [%s] %s\n    %s" % (h["fonte"], h["nome"], h["detalhe"])
            for h in hits[:10]
        )

        descricao_hitl = (
            "CRUZAMENTO AUTOMATICO DE TRANSCRICAO\n"
            "Arquivo : %s\n"
            "Risco   : %s\n"
            "Red Flags: %d\n\n"
            "NOMES ENCONTRADOS NAS BASES:\n"
            "%s\n\n"
            "Resumo:\n%s"
        ) % (filename[:60], risco, n_flags, hits_linhas, summary)

        detalhes = {
            "filename":  filename,
            "risco":     risco,
            "summary":   summary,
            "red_flags": n_flags,
            "hits": [
                {"nome": h["nome"], "fonte": h["fonte"], "detalhe": h["detalhe"]}
                for h in hits[:10]
            ],
        }

        try:
            from services.human_loop_service import criar_aprovacao, marcar_notificado
            from services.notification_service import notificar_aprovacao_pendente
        except ImportError:
            logger.warning("[pipeline] HITL indisponivel - hits registrados apenas em log.")
            return

        sufixo = ""
        if len(hits) > 3:
            sufixo = " ..."
        desc_curta = "Cruzamento: %s - %d hit(s): %s%s" % (
            filename[:60], len(hits), ", ".join(nomes[:3]), sufixo
        )

        aprov_id = criar_aprovacao(
            tipo_evento="transcricao_cruzamento",
            descricao=desc_curta,
            risco=risco,
            operador=operador,
            detalhes=detalhes,
        )

        loop = asyncio.new_event_loop()
        try:
            sucesso = loop.run_until_complete(
                notificar_aprovacao_pendente(
                    aprovacao_id=aprov_id,
                    tipo_evento="transcricao_cruzamento",
                    descricao=descricao_hitl,
                    risco=risco,
                    operador=operador,
                    detalhes=detalhes,
                )
            )
            marcar_notificado(aprov_id, sucesso)
        finally:
            loop.close()

        logger.info(
            "[pipeline] HITL aberto: %s | notificado=%s | hits=%d",
            aprov_id, sucesso, len(hits)
        )

    except Exception as exc:
        logger.error("[pipeline] Erro inesperado no cruzamento: %s", exc, exc_info=True)
