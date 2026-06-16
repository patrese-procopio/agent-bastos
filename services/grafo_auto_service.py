# -*- coding: utf-8 -*-
"""
services/grafo_auto_service.py — Vínculo Automático no Grafo (Missão 27)
─────────────────────────────────────────────────────────────────────────────
Quando o operador CONFIRMA um HITL de correlação cruzada, este serviço
materializa os vínculos detectados diretamente no grafo de inteligência —
sem nenhuma interação manual no editor gráfico.

COMO FUNCIONA:
  1. Operador confirma HITL (WhatsApp ou Dashboard).
  2. human_loop_router chama _registrar_feedback().
  3. _registrar_feedback() detecta decisao="confirmada" e chama
     grafo_auto_service.registrar_correlacao_no_grafo().
  4. Para cada entidade nos hits do HITL:
       - Cria/atualiza nó "pessoa" (ou "generico") no grafo.
       - Cria aresta hit → CORRELACIONADO_EM → fonte (extrato/alerta).
  5. Se o HITL tinha múltiplas entidades, cria arestas entre elas:
       hit_A → CORRELACIONADO_COM → hit_B
  6. Todas as arestas/nós automáticos são marcados com
     origem='auto:correlacao:{hitl_id}' — preservam o manual intacto.

DEDUPLICAÇÃO:
  _upsert_aresta_auto() do grafo.py dedup por (origem_id, destino_id,
  rotulo, origem). Se o mesmo HITL for confirmado duas vezes, as arestas
  são atualizadas, não duplicadas.

LGPD / Auditoria:
  Nenhuma informação nova é criada — só são materializados vínculos que
  JÁ passaram pelo crivo humano do HITL. O operador que confirmou é
  registrado nas propriedades da aresta.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import unicodedata

logger = logging.getLogger("bastos.grafo_auto")


# ── Helpers locais ────────────────────────────────────────────────────────────

def _norm(txt: str) -> str:
    """Minúsculo, sem acento, espaços colapsados."""
    if not txt:
        return ""
    t = unicodedata.normalize("NFKD", str(txt))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t.strip().lower())


def _slug(txt: str) -> str:
    n = _norm(txt)
    return re.sub(r"[^a-z0-9]+", "_", n).strip("_")[:60] or "x"


def _id_pessoa(nome: str) -> str:
    """
    ID estável para pessoas — usa o mesmo esquema do grafo.py (_id_pessoa)
    para que entidades do corpus de correlação FUNDAM com lideranças já
    existentes no grafo ao invés de criar nós duplicados.
    """
    chave = f"{_norm(nome)}|"
    return "p_" + hashlib.md5(chave.encode()).hexdigest()[:12]


def _inferir_tipo_no(fonte: str) -> str:
    """
    Infere o tipo de nó a partir da 'fonte' vinda do hit.
      - "Alvo Monitorado", "Liderança*" → pessoa
      - Qualquer outro → generico
    """
    f = fonte.lower()
    if "lideran" in f or "alvo" in f or "pessoa" in f:
        return "pessoa"
    return "generico"


def _id_no_hit(fonte: str, nome: str) -> str:
    tipo = _inferir_tipo_no(fonte)
    if tipo == "pessoa":
        return _id_pessoa(nome)
    return f"corr_{_slug(nome)}_{hashlib.md5(_norm(nome).encode()).hexdigest()[:8]}"


def _id_fonte(fonte_tipo: str, fonte_id: str) -> str:
    """ID estável para o nó-hub da fonte (extrato, alerta, etc.)."""
    if fonte_tipo == "extrato":
        return f"extrato_{fonte_id}"
    return f"fonte_{_slug(fonte_tipo)}_{fonte_id[:12]}"


# ── Interface pública ─────────────────────────────────────────────────────────

def registrar_correlacao_no_grafo(
    hitl_id:    str,
    tipo_evento: str,
    hits:       list[dict],   # [{nome, fonte, detalhe}, ...] de detalhes["hits"]
    detalhes:   dict,         # detalhes completos do HITL
    operador:   str = "sistema",
) -> dict:
    """
    Materializa os vínculos de um HITL confirmado no grafo de inteligência.

    Parâmetros:
      hitl_id     : UUID do HITL confirmado
      tipo_evento : ex: "correlacao_cruzada"
      hits        : lista de entidades detectadas no HITL
      detalhes    : dict completo do campo detalhes do HITL
      operador    : quem confirmou

    Retorna: {"nos_criados": N, "arestas_criadas": N, "ok": True/False}
    """
    if not hits:
        return {"ok": False, "motivo": "sem_hits"}

    # Importações locais para evitar circular import e dependência de estado de boot
    try:
        from modules.grafo import (
            _conn, _upsert_no, _upsert_aresta_auto,
            ICONE_PADRAO, _agora,
        )
    except ImportError as exc:
        logger.warning("[grafo_auto] Módulo grafo indisponível: %s", exc)
        return {"ok": False, "motivo": str(exc)}

    origem_tag  = f"auto:correlacao:{hitl_id[:8]}"
    fonte_tipo  = detalhes.get("fonte_tipo", "desconhecido")
    fonte_id    = detalhes.get("fonte_id", hitl_id)
    summary     = (detalhes.get("summary") or "")[:200]
    risco       = detalhes.get("risco", "ALTO")

    nos_criados     = 0
    arestas_criadas = 0

    try:
        with _conn() as con:
            # 1. Nó-hub da fonte (extrato/alerta que originou a correlação)
            hub_id    = _id_fonte(fonte_tipo, fonte_id)
            hub_label = f"{fonte_tipo.capitalize()} {fonte_id[:8]}"
            hub_tipo  = "documento" if fonte_tipo == "extrato" else "evento"

            existia_hub = con.execute(
                "SELECT id FROM nos WHERE id = ?", (hub_id,)
            ).fetchone()
            _upsert_no(con, hub_id, hub_tipo, hub_label,
                       icone="📋" if fonte_tipo == "extrato" else "⚡",
                       detalhes={
                           "fonte_tipo": fonte_tipo,
                           "fonte_id":   fonte_id,
                           "summary":    summary,
                           "risco":      risco,
                           "hitl_id":    hitl_id,
                       },
                       origem=origem_tag)
            if not existia_hub:
                nos_criados += 1

            # 2. Nós das entidades detectadas + arestas → hub
            hit_ids: list[str] = []
            for h in hits[:10]:
                nome   = (h.get("nome") or "").strip()
                fonte  = h.get("fonte") or "desconhecida"
                detalhe = h.get("detalhe") or ""
                if not nome:
                    continue

                tipo_no  = _inferir_tipo_no(fonte)
                no_id    = _id_no_hit(fonte, nome)
                icone    = ICONE_PADRAO.get(tipo_no, "⚪")
                rotulo   = nome

                existia = con.execute(
                    "SELECT id FROM nos WHERE id = ?", (no_id,)
                ).fetchone()
                _upsert_no(con, no_id, tipo_no, rotulo,
                           icone=icone,
                           detalhes={
                               "nome":    nome,
                               "fonte":   fonte,
                               "detalhe": detalhe,
                           },
                           origem=origem_tag)
                if not existia:
                    nos_criados += 1

                # Aresta: entidade → CORRELACIONADO_EM → fonte
                _upsert_aresta_auto(
                    con, no_id, hub_id, "CORRELACIONADO_EM",
                    {
                        "hitl_id":   hitl_id,
                        "risco":     risco,
                        "operador":  operador,
                        "detalhe":   detalhe,
                    },
                    origem_tag,
                )
                arestas_criadas += 1
                hit_ids.append(no_id)

            # 3. Arestas entre entidades co-mencionadas (se múltiplos hits)
            for i in range(len(hit_ids)):
                for j in range(i + 1, len(hit_ids)):
                    _upsert_aresta_auto(
                        con, hit_ids[i], hit_ids[j], "CORRELACIONADO_COM",
                        {
                            "hitl_id":  hitl_id,
                            "risco":    risco,
                            "operador": operador,
                            "summary":  summary,
                        },
                        origem_tag,
                    )
                    arestas_criadas += 1

        logger.info(
            "[grafo_auto] HITL %s → grafo: +%d nós, +%d arestas | fonte=%s/%s",
            hitl_id[:8], nos_criados, arestas_criadas, fonte_tipo, fonte_id[:8],
        )
        return {
            "ok":             True,
            "nos_criados":    nos_criados,
            "arestas_criadas": arestas_criadas,
            "hub_id":         hub_id,
        }

    except Exception as exc:
        logger.error("[grafo_auto] Erro ao registrar HITL %s no grafo: %s",
                     hitl_id[:8], exc, exc_info=True)
        return {"ok": False, "motivo": str(exc)}
