# -*- coding: utf-8 -*-
"""
modules/rag_formato.py — Qualidade da resposta do Chat RAG
==========================================================
Três peças, todas sem dependências pesadas (testáveis isoladamente):

  REGRAS_FORMATO        instruções de estilo injetadas nos prompts (texto fluido, objetivo,
                        sem markdown, sem citar "Trecho N", sem repetição)
  deduplicar_trechos()  tira do CONTEXTO os trechos quase idênticos (o modelo repetia o
                        mesmo conteúdo quando recebia 4 versões do mesmo parágrafo)
  limpar_resposta()     rede de segurança: remove resquícios de markdown, referências soltas
                        a "Trecho N" e frases/parágrafos repetidos
"""

import re
import unicodedata
from difflib import SequenceMatcher

REGRAS_FORMATO = (
    "### FORMATO DA RESPOSTA (obrigatório)\n"
    "- Escreva em português, em texto corrido e fluido, como um analista experiente explicando a um colega.\n"
    "- Comece pela resposta direta, em 1 ou 2 frases. Depois acrescente só o que for necessário, em até 3 "
    "parágrafos curtos. Respostas longas só se a pergunta pedir aprofundamento.\n"
    "- Se a pergunta pedir etapas, critérios ou itens, use uma lista simples: uma linha por item, começando "
    "com hífen (-) ou número (1., 2.).\n"
    "- NÃO use markdown: nada de asteriscos (*), negrito, títulos com #, tabelas ou blocos de código.\n"
    "- NÃO repita a mesma ideia com outras palavras e NÃO copie os trechos: sintetize com suas palavras.\n"
    "- NÃO cite \"Trecho 1\", \"Trecho 2\", percentuais de relevância nem nomes de arquivo no texto; as fontes "
    "são mostradas à parte pelo sistema.\n"
    "- Se a doutrina não cobrir algum ponto, diga isso em uma frase curta e complemente com conhecimento técnico.\n"
)


# ── contexto ─────────────────────────────────────────────────────────────────

def _tokens(txt: str) -> set:
    t = unicodedata.normalize("NFKD", txt or "")
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    return {w for w in re.findall(r"[a-z0-9]+", t) if len(w) > 3}


def deduplicar_trechos(resultados, limiar: float = 0.6):
    """resultados: lista de (doc, score). Mantém a ordem e descarta trecho cujo vocabulário se
    sobrepõe em >= `limiar` (Jaccard) a um trecho já aceito."""
    aceitos, tokens_aceitos = [], []
    for doc, score in resultados:
        tk = _tokens(getattr(doc, "page_content", ""))
        if tk and any(len(tk & o) / len(tk | o) >= limiar for o in tokens_aceitos):
            continue
        aceitos.append((doc, score))
        tokens_aceitos.append(tk)
    return aceitos


# ── resposta ─────────────────────────────────────────────────────────────────

_RX_CODE = re.compile(r"```.*?```", re.S)
_RX_BOLD = re.compile(r"(\*\*|__)(.+?)\1", re.S)
_RX_ITAL = re.compile(r"(?<![\*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\*\w])")
_RX_HEAD = re.compile(r"^\s{0,3}#{1,6}\s*", re.M)
_RX_BUL = re.compile(r"^\s*(?:[*•–—]|-)\s+", re.M)
_RX_NUMP = re.compile(r"^\s*(\d{1,2})[)\]]\s+", re.M)
_RX_REF_PAREN = re.compile(r"\s*[\(\[]\s*(?:trechos?|fonte)s?\s*\d+(?:\s*(?:,|e|a|-)\s*\d+)*\s*[\)\]]", re.I)
_RX_REF_TAG = re.compile(r"\s*\[\s*TRECHO[^\]]*\]", re.I)
_RX_SENT = re.compile(r"(?<=[.!?])\s+")


def _norm_frase(s: str) -> str:
    t = unicodedata.normalize("NFKD", s or "")
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def _repetida(norm: str, vistas: list) -> bool:
    if not norm:
        return False
    if norm in vistas:
        return True
    if len(norm) < 40:
        return False
    for v in vistas:
        if len(v) < 40:
            continue
        if norm in v or v in norm:                       # uma frase contida na outra
            return True
        if SequenceMatcher(None, norm, v).ratio() >= 0.82:   # paráfrase quase igual
            return True
    return False


def limpar_resposta(texto: str) -> str:
    if not texto:
        return texto
    t = texto.replace("\r\n", "\n").replace("\r", "\n")
    t = _RX_CODE.sub(lambda m: m.group(0).strip("`").strip(), t)
    t = _RX_BOLD.sub(r"\2", t)
    t = _RX_ITAL.sub(r"\1", t)
    t = _RX_HEAD.sub("", t)
    t = _RX_BUL.sub("- ", t)
    t = _RX_NUMP.sub(lambda m: f"{m.group(1)}. ", t)
    t = _RX_REF_PAREN.sub("", t)
    t = _RX_REF_TAG.sub("", t)
    t = t.replace("`", "").replace("*", "")                    # asteriscos que sobraram

    # remove frases e parágrafos repetidos (mantém a 1ª ocorrência)
    vistas: list = []
    paragrafos = []
    for par in re.split(r"\n\s*\n", t.strip()):
        linhas_saida = []
        for linha in par.split("\n"):
            eh_item = bool(re.match(r"^(?:- |\d{1,2}\. )", linha))
            prefixo = re.match(r"^(?:- |\d{1,2}\. )", linha).group(0) if eh_item else ""
            corpo = linha[len(prefixo):]
            frases_ok = []
            for fr in _RX_SENT.split(corpo.strip()):
                n = _norm_frase(fr)
                if _repetida(n, vistas):
                    continue
                if n:
                    vistas.append(n)
                frases_ok.append(fr)
            if frases_ok:
                linhas_saida.append(prefixo + " ".join(frases_ok))
        if linhas_saida:
            paragrafos.append("\n".join(linhas_saida))
    t = "\n\n".join(paragrafos)
    t = re.sub(r"[ \t]+\n", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()
