# -*- coding: utf-8 -*-
"""
llm_extracao.py — Provedor abstrato de extração de inteligência (Módulo Extrato)
Agent Bastos | AIPEN

Recebe o corpo bruto de um EXTRATO de campo e devolve inteligência estruturada
(entidades, vínculos, jargões, risco) pronta para o grafo i2 e para o RAE.

Pilares:
  1. PLUGÁVEL  — três backends: 'ollama' (local/soberano), 'groq', 'claude'.
                 Selecionado por EXTRATO_PROVIDER (default 'groq' p/ dev).
  2. SOBERANIA — guardrail de classificação: dado classificado como sensível
                 SÓ pode ser processado pelo provedor LOCAL. Se a configuração
                 apontar para nuvem, o sistema FORÇA o local; se o local estiver
                 indisponível, RECUSA o processamento (nunca vaza p/ nuvem).
  3. AUDITÁVEL — toda extração carrega provedor, modelo e versão do prompt.

O JSON pedido ao modelo já sai no formato do grafo (12 tipos de nó) e com
PROVENIÊNCIA (trecho literal que originou cada entidade/vínculo), o que permite
checagem determinística contra a fonte (Alucinação Zero auditável).
"""

import os
import re
import json
import unicodedata
import urllib.request
import urllib.error

# ── Versão do prompt (gravada no log de auditoria de cada extração) ───────────
PROMPT_VERSAO = "rae-v1"

# Modelos por provedor (sobrescrevíveis por env)
GROQ_MODEL   = os.getenv("EXTRATO_GROQ_MODEL", "llama-3.3-70b-versatile")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3:latest")
OLLAMA_URL   = os.getenv("OLLAMA_URL", "http://localhost:11434")
CLAUDE_MODEL = os.getenv("EXTRATO_CLAUDE_MODEL", "claude-sonnet-4-6")
DEEPSEEK_MODEL = os.getenv("EXTRATO_DEEPSEEK_MODEL", "deepseek-chat")
DEEPSEEK_URL   = os.getenv("DEEPSEEK_URL", "https://api.deepseek.com")

# Provedor configurado (dev=groq; produção soberana deve usar 'ollama')
PROVEDOR_PADRAO = (os.getenv("EXTRATO_PROVIDER") or "groq").strip().lower()

# ── Classificação do dado (guardrail de soberania) ───────────────────────────
# Qualquer classificação que NÃO esteja em PUBLICOS é tratada como sensível →
# só pode ir para o provedor local. Default (vazio/desconhecido) = sensível.
CLASSIF_PUBLICAS = {"teste", "sintetico", "sintético", "publico", "público", "demo"}
CLASSIF_VALIDAS  = {
    "teste", "sintetico", "publico",            # liberadas p/ nuvem
    "interno", "reservado", "sigiloso", "secreto",  # só local
}


def _norm(txt: str) -> str:
    if not txt:
        return ""
    t = unicodedata.normalize("NFKD", str(txt))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t.strip().lower())


def classificacao_sensivel(classificacao: str) -> bool:
    """True se o dado deve ficar restrito ao provedor local."""
    return _norm(classificacao) not in CLASSIF_PUBLICAS


def ollama_disponivel() -> bool:
    try:
        req = urllib.request.Request(f"{OLLAMA_URL}/api/tags")
        with urllib.request.urlopen(req, timeout=4) as r:
            return r.status == 200
    except Exception:
        return False


def resolver_provedor(classificacao: str) -> dict:
    """
    Decide qual provedor usar respeitando o guardrail.
    Retorna {"provedor", "forcado_local", "bloqueado", "motivo"}.
    """
    sensivel = classificacao_sensivel(classificacao)
    configurado = PROVEDOR_PADRAO if PROVEDOR_PADRAO in ("ollama", "groq", "claude", "deepseek") else "groq"

    if not sensivel:
        return {"provedor": configurado, "forcado_local": False,
                "bloqueado": False, "motivo": None}

    # Dado sensível → exige local
    if configurado == "ollama":
        if ollama_disponivel():
            return {"provedor": "ollama", "forcado_local": False,
                    "bloqueado": False, "motivo": None}
        return {"provedor": "ollama", "forcado_local": False, "bloqueado": True,
                "motivo": "Provedor local (Ollama) indisponível — processamento "
                          "de dado sensível recusado para não vazar à nuvem."}

    # Configuração aponta p/ nuvem, mas o dado é sensível → força local
    if ollama_disponivel():
        return {"provedor": "ollama", "forcado_local": True, "bloqueado": False,
                "motivo": f"Dado sensível: provedor '{configurado}' bloqueado, "
                          "forçado para o local soberano (Ollama)."}
    return {"provedor": "ollama", "forcado_local": True, "bloqueado": True,
            "motivo": "Dado sensível e provedor local indisponível — "
                      "processamento recusado (guardrail de soberania)."}


# ── System prompt (engine de inteligência) ───────────────────────────────────

_TIPOS_NO = (
    "pessoa, local, faccao, crime, juridico, documento, social, "
    "geografia, financeiro, organizacao, evento, generico"
)

SYSTEM_PROMPT = f"""Você é o motor de inteligência criminal do AGENT BASTOS, sistema de \
segurança do sistema prisional (AIPEN/SEAP-AM). Recebe um EXTRATO de campo \
desestruturado e extrai inteligência tática para um banco de grafos.

REGRAS:
1. Responda EXCLUSIVAMENTE com um objeto JSON válido. Sem markdown, sem comentários.
2. NÃO altere vulgos/codinomes — mantenha a grafia exata do texto.
3. ALUCINAÇÃO ZERO: não invente entidade, vínculo ou jargão que não esteja no \
texto. Para CADA entidade, vínculo e jargão, copie em "evidencia" o TRECHO LITERAL \
do extrato que o sustenta (cópia exata, sem parafrasear).
4. Use APENAS estes tipos de nó: {_TIPOS_NO}.

ESQUEMA DE SAÍDA (exato):
{{
  "extrato_analisado": {{
    "assunto_sintetizado": "resumo curto da ameaça real",
    "risk_score": <inteiro 1-10: 1-3 rotina, 4-7 alerta médio, 8-10 crise/ação imediata>,
    "justificativa_risco": "por que essa nota"
  }},
  "entidades_chave": [
    {{
      "ref": "ID curto e único dentro deste JSON (ex: E1, E2) para referenciar nos vínculos",
      "tipo": "um dos tipos válidos",
      "nome": "nome civil se houver, senão vazio",
      "vulgo": "vulgo/codinome se houver, senão vazio",
      "rotulo": "como exibir o nó (vulgo de preferência, senão nome)",
      "papel_no_contexto": "atuação da entidade neste relato",
      "evidencia": "trecho literal do extrato"
    }}
  ],
  "conexoes_grafo": [
    {{
      "source": "ref da entidade origem",
      "target": "ref da entidade destino",
      "relation": "TIPO_DE_VINCULO_EM_CAIXA_ALTA (ex: CO_CONSPIRADOR, SUBORDINADO_A, CUSTODIADO_EM)",
      "weight": <1 fraco/indireto, 2 médio/mencionado, 3 forte/flagrado>,
      "evidencia": "trecho literal do extrato"
    }}
  ],
  "jargoes_e_codigos": [
    {{
      "termo": "termo suspeito detectado",
      "significado_provavel": "tradução contextual para inteligência",
      "evidencia": "trecho literal do extrato"
    }}
  ],
  "tags_indexacao": ["termos-chave para busca"]
}}

Se uma seção não tiver itens, devolva lista vazia. Nunca devolva texto fora do JSON."""


def _montar_user(texto: str, lexico_contexto: str = "") -> str:
    partes = []
    if lexico_contexto:
        partes.append(
            "LÉXICO DE SINAIS FRACOS já validado por analistas (use como apoio "
            "para traduzir jargões recorrentes; só aplique se couber no contexto):\n"
            + lexico_contexto
        )
    partes.append("EXTRATO DE CAMPO (corpo bruto):\n" + (texto or ""))
    return "\n\n".join(partes)


# ── Backends ─────────────────────────────────────────────────────────────────

def _extrair_groq(texto: str, lexico: str) -> tuple[str | None, str]:
    from groq import Groq
    from config.settings import GROQ_API_KEY
    if not GROQ_API_KEY:
        return None, "GROQ_API_KEY ausente"
    client = Groq(api_key=GROQ_API_KEY)
    resp = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _montar_user(texto, lexico)},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
        max_tokens=4000,
    )
    return resp.choices[0].message.content, GROQ_MODEL


def _extrair_ollama(texto: str, lexico: str) -> tuple[str | None, str]:
    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.2},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _montar_user(texto, lexico)},
        ],
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat", data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            body = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        # Ollama devolve o motivo real no corpo (ex.: sem memória p/ o modelo)
        detalhe = ""
        try:
            detalhe = (json.loads(e.read().decode("utf-8")) or {}).get("error", "")
        except Exception:
            detalhe = getattr(e, "reason", "") or ""
        raise RuntimeError(f"Ollama HTTP {e.code}: {detalhe}")
    if body.get("error"):
        raise RuntimeError(f"Ollama: {body['error']}")
    return (body.get("message") or {}).get("content"), OLLAMA_MODEL


def _extrair_claude(texto: str, lexico: str) -> tuple[str | None, str]:
    import anthropic
    from config.settings import ANTHROPIC_API_KEY
    if not ANTHROPIC_API_KEY:
        return None, "ANTHROPIC_API_KEY ausente"
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    # System prompt como bloco com cache_control: ele é constante e reusado a cada
    # extração → o prompt caching serve ~90% mais barato a parte cacheada. O conteúdo
    # volátil (léxico + corpo do extrato) fica nas messages, DEPOIS do breakpoint.
    msg = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=4000,
        temperature=0.2,
        system=[{
            "type": "text",
            "text": SYSTEM_PROMPT + "\n\nResponda apenas com o objeto JSON, sem texto fora dele.",
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": _montar_user(texto, lexico)}],
    )
    txt = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
    return txt, CLAUDE_MODEL


def _extrair_deepseek(texto: str, lexico: str) -> tuple[str | None, str]:
    """DeepSeek — API OpenAI-compatible (deepseek-chat = DeepSeek-V3). JSON mode."""
    import requests
    from config.settings import DEEPSEEK_API_KEY
    if not DEEPSEEK_API_KEY:
        return None, "DEEPSEEK_API_KEY ausente"
    resp = requests.post(
        f"{DEEPSEEK_URL}/chat/completions",
        headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                 "Content-Type": "application/json"},
        json={
            "model": DEEPSEEK_MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": _montar_user(texto, lexico)},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
            "max_tokens": 4000,
            "stream": False,
        },
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"], DEEPSEEK_MODEL


_BACKENDS = {"groq": _extrair_groq, "ollama": _extrair_ollama,
             "claude": _extrair_claude, "deepseek": _extrair_deepseek}


# ── Parsing tolerante ────────────────────────────────────────────────────────

def _extrair_json(raw: str) -> dict | None:
    if not raw:
        return None
    raw = raw.strip()
    # Remove cercas de markdown se o modelo desobedecer
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw).strip()
    try:
        return json.loads(raw)
    except Exception:
        pass
    # Última tentativa: maior bloco {...}
    i, j = raw.find("{"), raw.rfind("}")
    if 0 <= i < j:
        try:
            return json.loads(raw[i:j + 1])
        except Exception:
            return None
    return None


# ── API pública ──────────────────────────────────────────────────────────────

def extrair(texto: str, classificacao: str = "", lexico_contexto: str = "") -> dict:
    """
    Extrai inteligência do extrato respeitando o guardrail de classificação.

    Retorna:
      {
        "ok": bool,
        "provedor": str, "modelo": str, "prompt_versao": str,
        "forcado_local": bool, "bloqueado": bool,
        "dados": dict | None,    # JSON estruturado parseado
        "bruto": str | None,     # resposta crua (auditoria)
        "erro": str | None,
      }
    """
    rota = resolver_provedor(classificacao)
    base = {
        "provedor": rota["provedor"], "modelo": None,
        "prompt_versao": PROMPT_VERSAO,
        "forcado_local": rota["forcado_local"], "bloqueado": rota["bloqueado"],
        "dados": None, "bruto": None,
    }

    if rota["bloqueado"]:
        return {**base, "ok": False, "erro": rota["motivo"]}

    backend = _BACKENDS.get(rota["provedor"])
    if not backend:
        return {**base, "ok": False, "erro": f"Provedor desconhecido: {rota['provedor']}"}

    try:
        raw, modelo = backend(texto, lexico_contexto)
        base["modelo"] = modelo
        base["bruto"] = raw
        if not raw:
            return {**base, "ok": False, "erro": "Modelo não retornou conteúdo."}
        dados = _extrair_json(raw)
        if not dados:
            return {**base, "ok": False, "erro": "JSON inválido na resposta do modelo."}
        return {**base, "ok": True, "dados": dados, "erro": None}
    except urllib.error.URLError as e:
        return {**base, "ok": False, "erro": _erro_amigavel(str(e), rota["provedor"])}
    except Exception as e:
        return {**base, "ok": False, "erro": _erro_amigavel(f"{type(e).__name__}: {e}", rota["provedor"])}


def _erro_amigavel(msg: str, provedor: str) -> str:
    low = msg.lower()
    if provedor == "ollama" and ("memory" in low or "out of memory" in low):
        return (f"Provedor local (Ollama) sem memória para o modelo '{OLLAMA_MODEL}'. "
                "Opções: (1) usar um modelo menor — defina OLLAMA_MODEL (ex.: llama3.2:1b); "
                "(2) liberar RAM; ou (3) classificar o extrato como 'teste' para processar via nuvem. "
                f"[detalhe: {msg}]")
    if "refused" in low or "urlopen error" in low or "connection" in low:
        return (f"Provedor '{provedor}' indisponível. Se for local, suba o Ollama; "
                f"caso contrário, verifique a chave de API. [detalhe: {msg}]")
    return f"Falha no provedor '{provedor}': {msg}"
