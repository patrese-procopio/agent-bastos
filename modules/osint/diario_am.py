"""
diario_am.py — Menções no Diário Oficial do Estado do Amazonas (Imprensa Oficial / DOE-AM)
Agent Bastos | Segurança Pública/Corporativa

Fonte: API JSON pública usada pelo próprio site de busca
  https://diario.imprensaoficial.am.gov.br/apibusca/multidiarios/busca
  parâmetros: q, exata=1 (frase), page (10 por página), data_init / data_end (dd-MM-yyyy)
Retorna, por matéria: trecho com o termo destacado, edição, página, caderno, título da
matéria e a hierarquia do órgão publicador. Cobre de 1956 até hoje (edições anteriores a
jul/2020 podem demorar a aparecer na busca por texto, segundo a própria Imprensa Oficial).

Por que importa para contrainteligência: nomeações, exonerações, contratos, penalidades e
gratificações de servidores estaduais — em especial atos da SEAP (sinalizados).

O nome pesquisado é enviado a um serviço externo (público).
"""

from __future__ import annotations

import re
import time
from typing import Any

import httpx

from .models import OsintRequest
from .querido_diario import _tipo_ato
from .receita_cnpj import norm, tokens

URL = "https://diario.imprensaoficial.am.gov.br/apibusca/multidiarios/busca"
PDF = "https://diario.imprensaoficial.am.gov.br/portal/edicoes/download/{edicao}/{pagina}"
ORCAMENTO_S = 50.0
POR_PAGINA = 10
MAX_PAGINAS = 4          # até 40 matérias por consulta
LIMITE_COMUM = 40        # mais matérias que isto, sem evidência = nome comum
_HEADERS = {"Accept": "application/json", "User-Agent": "Mozilla/5.0 (AgentBastos/1.0)"}

# níveis genéricos da hierarquia de órgãos (sobra o órgão específico)
_GENERICOS = {"PODER EXECUTIVO", "ADMINISTRACAO DIRETA", "ADMINISTRACAO INDIRETA", "SECRETARIAS DE ESTADO",
              "ATOS", "OUTROS", "PODER LEGISLATIVO", "PODER JUDICIARIO", "MUNICIPIOS", "ATOS ADMINISTRATIVOS"}


def _limpa(t: str) -> str:
    t = re.sub(r"</?strong>", "", t or "")
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", t).strip()


_ORGAO_RE = re.compile(r"SECRETARIA|FUNDACAO|INSTITUTO|AUTARQUIA|EMPRESA|TRIBUNAL|CONTROLADORIA|"
                       r"PROCURADORIA|UNIVERSIDADE|COMPANHIA|AGENCIA|DEPARTAMENTO|POLICIA|CORPO DE|"
                       r"ASSEMBLEIA|DEFENSORIA|MINISTERIO PUBLICO|PREFEITURA|CAMARA|GABINETE|CONSELHO")


def _orgao(categoria: str | None) -> str | None:
    """Órgão publicador: o nível mais específico que pareça um órgão (não o tipo de documento)."""
    partes = [p.strip() for p in (categoria or "").split(";") if p.strip()]
    especificos = [p for p in partes if norm(p) not in _GENERICOS]
    orgaos = [p for p in especificos if _ORGAO_RE.search(norm(p))]
    if orgaos:
        return orgaos[-1]
    return especificos[-1] if especificos else (partes[-1] if partes else None)


def _get(params: dict, deadline: float) -> dict[str, Any]:
    ultimo = "sem resposta"
    for tentativa in range(3):
        restante = deadline - time.monotonic()
        if restante < 4:
            break
        try:
            r = httpx.get(URL, params=params, headers=_HEADERS, timeout=min(35.0, restante),
                          follow_redirects=True)
            if r.status_code == 200:
                return r.json().get("data") or {}
            ultimo = f"HTTP {r.status_code}"
        except Exception as exc:
            ultimo = type(exc).__name__
        time.sleep(min(2 + 2 * tentativa, max(0.0, deadline - time.monotonic() - 4)))
    raise RuntimeError(f"Diário Oficial do AM indisponível ({ultimo})")


def buscar_diario_am(req: OsintRequest) -> dict[str, Any]:
    if not req.nome or len(tokens(req.nome)) < 2:
        return {"status": "nao_aplicavel", "achados": [], "descartados": 0}

    deadline = time.monotonic() + ORCAMENTO_S
    nome_frase = " ".join(req.nome.split())
    params = {"page": 1, "q": nome_frase, "exata": 1}
    d = _get(params, deadline)
    total = d.get("total") or 0
    itens = list(d.get("resultados") or [])

    if 0 < total <= POR_PAGINA * MAX_PAGINAS:
        for pg in range(2, -(-total // POR_PAGINA) + 1):
            try:
                itens += _get({**params, "page": pg}, deadline).get("resultados") or []
            except RuntimeError:
                break  # devolve o que já temos

    alvo = norm(nome_frase)
    nm_mae, nm_pai = norm(req.nome_mae), norm(req.nome_pai)
    toks = tokens(nome_frase)
    achados, fora, vistos = [], 0, set()

    for it in itens:
        trecho = _limpa(it.get("highlight"))
        tn = norm(trecho)
        titulo_m = it.get("materia_titulo") or ""
        # confere a frase inteira; se o trecho cortou o nome, exige ao menos todos os tokens
        if alvo in tn:
            pontos, motivos = 55, ["nome completo (frase exata) citado no diário"]
        elif all(t in tn.split() for t in toks):
            pontos, motivos = 45, ["todas as partes do nome no trecho (fora de ordem/cortado)"]
        else:
            fora += 1
            continue
        chave = it.get("materia_id") or it.get("id")
        if chave in vistos:
            continue
        vistos.add(chave)

        evidencia = False
        cpfs = {re.sub(r"\D", "", c) for c in re.findall(r"\d{3}\.?\d{3}\.?\d{3}-?\d{2}", trecho)}
        if req.cpf and req.cpf in cpfs:
            pontos, evidencia = 100, True; motivos.append("CPF idêntico no trecho")
        elif req.cpf and cpfs:
            pontos -= 30; motivos.append("trecho traz outro CPF — possível homônimo")
        if nm_mae and nm_mae in tn:
            pontos += 25; evidencia = True; motivos.append("nome da mãe no trecho")
        if nm_pai and nm_pai in tn:
            pontos += 15; evidencia = True; motivos.append("nome do pai no trecho")

        orgao = _orgao(it.get("materia_categoria"))
        seap = "PENITENCIARIA" in norm(f"{orgao} {it.get('materia_categoria')}")
        if seap:
            motivos.append("ato publicado pela SEAP")

        achados.append({
            "pontos": pontos, "motivos": motivos, "evidencia": evidencia,
            "data": it.get("edicao_data"), "publicado_em": it.get("publicado_em"),
            "edicao": it.get("edicao_numero"), "pagina": it.get("edicao_pagina"),
            "suplemento": bool(it.get("edicao_suplemento")), "caderno": it.get("materia_caderno"),
            "materia": titulo_m, "orgao": orgao, "seap": seap,
            "ato": _tipo_ato(norm(f"{titulo_m} {trecho}")),
            "url": PDF.format(edicao=it.get("edicao_id"), pagina=it.get("edicao_pagina") or ""),
            "trecho": trecho[:480],
        })

    comum = total > LIMITE_COMUM
    for a in achados:
        if comum and not a["evidencia"]:
            a["pontos"] = min(a["pontos"], 40)
            a["motivos"].append(f"nome comum: {total} matérias citam este nome — informe CPF/filiação")
        a["pontos"] = max(0, min(100, a["pontos"]))

    achados.sort(key=lambda a: (a["pontos"], a["publicado_em"] or ""), reverse=True)
    return {"status": "ok" if achados else "vazio", "achados": achados, "descartados": fora,
            "total_api": total, "comum": comum}
