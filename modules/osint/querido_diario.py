"""
querido_diario.py — Menções em Diários Oficiais municipais (Querido Diário / OKFN Brasil)
Agent Bastos | Segurança Pública/Corporativa

API pública: https://api.queridodiario.ok.org.br/gazettes  (busca textual nos diários).
Melhorias sobre o DouCollector antigo:
  - frase EXATA (nome entre aspas) em vez de palavras soltas;
  - confere o nome dentro de cada trecho devolvido (descarta casamentos soltos);
  - classifica o tipo de ato (nomeação, exoneração, penalidade, licitação…);
  - reforça com CPF / filiação quando aparecem no trecho, e limita nome comum;
  - 1 achado por edição de diário (município + data + edição).

Cobre só os municípios que o projeto raspa (não é todo o Brasil). O nome pesquisado é
enviado a um serviço externo.

STATUS DE VALIDAÇÃO: implementado conforme a documentação pública; testado com respostas
simuladas. Em 01/10/2026 o host da API recusava o handshake TLS (verificado de duas redes),
então ainda NÃO foi validado contra a API real. Falhas viram status "erro" na tela.
"""

from __future__ import annotations

import re
import time
from typing import Any

import httpx

from .models import OsintRequest
from .receita_cnpj import norm, tokens

URL = "https://api.queridodiario.ok.org.br/gazettes"
ORCAMENTO_S = 40.0
TAMANHO = 30
LIMITE_COMUM = 30  # diários com o nome acima disto sem evidência = nome comum
_HEADERS = {"Accept": "application/json", "User-Agent": "AgentBastos/1.0"}

# Tipo de ato → padrão (primeiro que casar vence). Útil p/ contrainteligência:
# vínculo com a máquina pública, penalidades, contratações.
_ATOS = [
    ("Penalidade / processo administrativo", r"PENALIDADE|PROCESSO ADMINISTRATIVO|SINDICANCIA|ADVERTENCIA|SUSPENSAO|DEMISSAO|CASSACAO|MULTA"),
    ("Exoneração / dispensa de servidor", r"EXONER|DISPENSA(R|D)? (DO|DA|DE) (CARGO|FUNCAO)|DESLIGAMENTO"),
    ("Nomeação / designação", r"NOMEAD|NOMEAR|NOMEACAO|DESIGNAD|DESIGNAR|DESIGNACAO|POSSE"),
    ("Contratação / licitação", r"CONTRATO|CONTRATACAO|LICITACAO|DISPENSA DE LICITACAO|PREGAO|INEXIGIBILIDADE|ATA DE REGISTRO"),
    ("Convênio / repasse / pagamento", r"CONVENIO|REPASSE|EMPENHO|PAGAMENTO|SUBVENCAO"),
    ("Concurso / seleção", r"CONCURSO|CLASSIFICAD|APROVAD|CONVOCAD|SELECAO"),
    ("Aposentadoria / pensão", r"APOSENTADORIA|PENSAO"),
]


def _limpa(t: str) -> str:
    t = re.sub(r"<[^>]+>", "", t or "")  # destaques <em>/<b> da busca
    return re.sub(r"\s+", " ", t).strip()


def _tipo_ato(texto_norm: str) -> str | None:
    for rotulo, pad in _ATOS:
        if re.search(pad, texto_norm):
            return rotulo
    return None


def _get(params: list[tuple[str, Any]], deadline: float) -> dict[str, Any]:
    ultimo = "sem resposta"
    for tentativa in range(3):
        restante = deadline - time.monotonic()
        if restante < 4:
            break
        try:
            r = httpx.get(URL, params=params, headers=_HEADERS, timeout=min(25.0, restante))
            if r.status_code == 200:
                return r.json()
            ultimo = f"HTTP {r.status_code}"
        except Exception as exc:
            ultimo = type(exc).__name__
        time.sleep(min(2 + 2 * tentativa, max(0.0, deadline - time.monotonic() - 4)))
    raise RuntimeError(f"Querido Diário indisponível ({ultimo})")


def buscar_diarios(req: OsintRequest) -> dict[str, Any]:
    if not req.nome or len(tokens(req.nome)) < 2:
        return {"status": "nao_aplicavel", "achados": [], "descartados": 0}

    deadline = time.monotonic() + ORCAMENTO_S
    nome_frase = " ".join(req.nome.split())
    params = [
        ("querystring", f'"{nome_frase}"'),  # frase exata
        ("size", TAMANHO), ("excerpt_size", 400), ("number_of_excerpts", 3),
        ("sort_by", "descending_date"),
    ]
    j = _get(params, deadline)
    total = j.get("total_gazettes") or 0
    gazettes = j.get("gazettes") or []

    alvo = norm(nome_frase)
    nm_mae, nm_pai = norm(req.nome_mae), norm(req.nome_pai)
    achados, fora, vistos = [], 0, set()

    for g in gazettes:
        trechos = [_limpa(e) for e in (g.get("excerpts") or [])]
        # confere o nome inteiro dentro de pelo menos um trecho
        confere = [t for t in trechos if alvo in norm(t)]
        if not confere:
            fora += 1
            continue
        chave = (g.get("territory_id"), g.get("date"), g.get("edition"), g.get("is_extra_edition"))
        if chave in vistos:
            continue
        vistos.add(chave)

        txt = " ".join(confere)
        tn = norm(txt)
        pontos, motivos = 55, ["nome completo (frase exata) citado no diário"]
        evidencia = False

        cpfs = {re.sub(r"\D", "", c) for c in re.findall(r"\d{3}\.?\d{3}\.?\d{3}-?\d{2}", txt)}
        if req.cpf and req.cpf in cpfs:
            pontos, evidencia = 100, True; motivos.append("CPF idêntico no trecho")
        elif req.cpf and cpfs:
            pontos -= 30; motivos.append("trecho traz outro CPF — possível homônimo")
        if nm_mae and nm_mae in tn:
            pontos += 25; evidencia = True; motivos.append("nome da mãe no trecho")
        if nm_pai and nm_pai in tn:
            pontos += 15; evidencia = True; motivos.append("nome do pai no trecho")

        achados.append({
            "pontos": pontos, "motivos": motivos, "evidencia": evidencia,
            "municipio": g.get("territory_name"), "uf": g.get("state_code"),
            "data": g.get("date"), "edicao": g.get("edition"), "extra": bool(g.get("is_extra_edition")),
            "ato": _tipo_ato(tn), "url": g.get("url"), "trecho": confere[0][:420],
        })

    comum = total > LIMITE_COMUM
    for a in achados:
        if comum and not a["evidencia"]:
            a["pontos"] = min(a["pontos"], 40)
            a["motivos"].append(f"nome comum: {total} diários citam este nome — informe CPF/filiação")
        a["pontos"] = max(0, min(100, a["pontos"]))

    achados.sort(key=lambda a: (a["pontos"], a["data"] or ""), reverse=True)
    return {"status": "ok" if achados else "vazio", "achados": achados, "descartados": fora,
            "total_api": total, "comum": comum}
