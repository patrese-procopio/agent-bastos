# -*- coding: utf-8 -*-
"""
services/historico_service.py — Extração de IA do "Histórico do Interno"
Agent Bastos | AIPEN

Reaproveita o pipeline de extração do Módulo Extrato (services/llm_extracao.py)
para um texto livre escrito diretamente num nó "pessoa" do grafo de vínculos
(campo detalhes.historico da Análise de Vínculo), em vez do corpo de um
Extrato de campo.

Diferenças pro fluxo do Extrato:
  - Não existe um "extrato_id"/tabela própria — o próprio nó do grafo (no_id)
    já é o registro; a extração só cria/atualiza ENTIDADES E VÍNCULOS ao redor
    dele (modules.grafo.ingerir_historico), nunca duplica o sujeito.
  - Prompt próprio ("historico-v1"): a pessoa descrita já é conhecida do
    sistema, então o texto usa o ref especial "self" para vínculos que saem
    dela mesma (ex.: "NENÉM --MANDA_EM--> CV/AM").
  - Classificação default "reservado" (nunca "publico"): histórico de um
    interno é dado sensível por natureza — o guardrail de soberania de
    services/llm_extracao.py força processamento local (Ollama), nunca vaza
    pra nuvem por omissão.

Depois de ingerir no grafo, o chamador (routers/grafo_router.py) é quem
dispara a correlação cruzada (Oráculo) em BackgroundTask — mesmo padrão do
routers/extrato_router.py.
"""

from __future__ import annotations

import re
import unicodedata

from services import llm_extracao
from modules import grafo

PROMPT_VERSAO = "historico-v1"

_TIPOS_NO = (
    "pessoa, local, faccao, crime, juridico, documento, social, "
    "geografia, financeiro, organizacao, evento, generico"
)


def _montar_system_prompt(rotulo: str) -> str:
    return f"""Você é o motor de inteligência criminal do AGENT BASTOS, sistema de \
segurança do sistema prisional (AIPEN/SEAP-AM). Recebe um HISTÓRICO — uma narrativa \
livre escrita por um analista sobre uma pessoa JÁ CADASTRADA no grafo de vínculos, \
chamada "{rotulo}" — e extrai inteligência estruturada para enriquecer o grafo.

REGRAS:
1. Responda EXCLUSIVAMENTE com um objeto JSON válido. Sem markdown, sem comentários.
2. NÃO altere vulgos/codinomes — mantenha a grafia exata do texto.
3. "{rotulo}" já existe no grafo — NÃO crie uma entidade nova pra ela. Quando o \
texto descrever algo que ELA MESMA fez, é ou participou, use o ref especial \
"self" (não crie um "ref" novo pra ela, nem repita o nome como entidade).
4. ALUCINAÇÃO ZERO: não invente entidade, vínculo ou jargão que não esteja no \
texto. Para CADA entidade e vínculo, copie em "evidencia" o TRECHO LITERAL do \
histórico que o sustenta (cópia exata, sem parafrasear).
5. Use APENAS estes tipos de nó: {_TIPOS_NO}.

ESQUEMA DE SAÍDA (exato):
{{
  "entidades_chave": [
    {{
      "ref": "ID curto e único dentro deste JSON (ex: E1, E2) para referenciar nos vínculos — NUNCA \"self\"",
      "tipo": "um dos tipos válidos",
      "nome": "nome civil se houver, senão vazio",
      "vulgo": "vulgo/codinome se houver, senão vazio",
      "rotulo": "como exibir o nó (vulgo de preferência, senão nome)",
      "papel_no_contexto": "atuação da entidade neste histórico",
      "evidencia": "trecho literal do histórico"
    }}
  ],
  "conexoes_grafo": [
    {{
      "source": "ref da entidade origem, ou \"self\" se for {rotulo}",
      "target": "ref da entidade destino, ou \"self\" se for {rotulo}",
      "relation": "TIPO_DE_VINCULO_EM_CAIXA_ALTA (ex: MANDA_EM, SUBORDINADO_A, ALIADO_DE, RIVAL_DE, CUSTODIADO_EM)",
      "weight": <1 fraco/indireto, 2 médio/mencionado, 3 forte/confirmado>,
      "evidencia": "trecho literal do histórico"
    }}
  ]
}}

Se uma seção não tiver itens, devolva lista vazia. Nunca devolva texto fora do JSON."""


def _norm(txt: str) -> str:
    if not txt:
        return ""
    t = unicodedata.normalize("NFKD", str(txt))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t.strip().lower())


def _evidencia_confere(corpo: str, evidencia: str) -> bool:
    if not evidencia:
        return False
    ev, cp = _norm(evidencia), _norm(corpo)
    if not ev:
        return False
    if ev in cp:
        return True
    return len(ev) > 20 and ev[:40] in cp


def analisar(no_id: str, historico: str, rotulo: str, classificacao: str = "reservado") -> dict:
    """
    Extrai entidades/vínculos do histórico de um nó e materializa no grafo.

    Retorna:
      {ok, entidades_criadas, arestas_criadas, provedor, modelo, prompt_versao,
       forcado_local, bloqueado, evidencias_ok, evidencias_total, motivo?}
    """
    if not historico or not historico.strip():
        return {"ok": False, "motivo": "Histórico vazio."}

    extr = llm_extracao.extrair(
        historico, classificacao=classificacao,
        system_prompt=_montar_system_prompt(rotulo),
        prompt_versao=PROMPT_VERSAO,
    )

    base = {
        "provedor": extr.get("provedor"), "modelo": extr.get("modelo"),
        "prompt_versao": extr.get("prompt_versao"),
        "forcado_local": extr.get("forcado_local"), "bloqueado": extr.get("bloqueado"),
    }

    if extr.get("bloqueado") or not extr.get("ok"):
        return {**base, "ok": False, "motivo": extr.get("erro") or "Falha na extração."}

    dados = extr.get("dados") or {}
    entidades = dados.get("entidades_chave") or []
    conexoes = dados.get("conexoes_grafo") or []

    evidencias_total = len(entidades) + len(conexoes)
    evidencias_ok = sum(
        1 for item in (entidades + conexoes)
        if _evidencia_confere(historico, item.get("evidencia"))
    )

    resultado = grafo.ingerir_historico(no_id, entidades, conexoes)
    if resultado.get("erro"):
        return {**base, "ok": False, "motivo": f"Grafo: {resultado['erro']}"}

    return {
        **base, "ok": True,
        "entidades_criadas": resultado.get("nos_criados", 0),
        "arestas_criadas": resultado.get("arestas_criadas", 0),
        "evidencias_ok": evidencias_ok, "evidencias_total": evidencias_total,
    }
