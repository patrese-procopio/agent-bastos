"""
djen.py — Publicações judiciais por NOME DA PARTE (DJEN / CNJ)
Agent Bastos | Segurança Pública/Corporativa

API pública do Diário da Justiça Eletrônico Nacional (comunicaapi.pje.jus.br).
Ao contrário do DataJud, permite buscar por nome da parte. Cobre as comunicações
publicadas a partir de mai/2022 (início do DJEN) — não é histórico completo.

Cuidados que esta implementação toma (a API é lenta e instável):
  - sempre envia janela de datas (sem ela a API responde "sistema ocupado");
  - retentativas com recuo e orçamento total de tempo (a busca não trava a tela);
  - o filtro `nomeParte` também casa nomes dentro do TEXTO e de advogados; por isso
    cada item é conferido localmente contra as PARTES (destinatários) e o resto é descartado;
  - agrupa as publicações por processo (1 achado por processo);
  - nome comum sem CPF/filiação no texto → confiança limitada (a API não busca por CPF).

O nome pesquisado é enviado ao CNJ (fonte pública externa), diferente das bases locais.
"""

from __future__ import annotations

import re
import time
from datetime import date
from typing import Any

import httpx

from .models import OsintRequest
from .receita_cnpj import norm, tokens

URL = "https://comunicaapi.pje.jus.br/api/v1/comunicacao"
INICIO_DJEN = "2022-05-01"
ORCAMENTO_S = 55.0       # tempo total máximo desta fonte
POR_PAGINA = 100
MAX_PAGINAS = 4
LIMITE_COMUM = 15        # processos com o nome exato acima disto = nome comum
_HEADERS = {"Accept": "application/json", "User-Agent": "Mozilla/5.0 (AgentBastos/1.0)"}

_CRIMINAL = re.compile(
    r"\b(PENAL|CRIMINAL|INQUERITO|HABEAS|PRISAO|FLAGRANTE|TERMO CIRCUNSTANCIADO|"
    r"MEDIDAS? PROTETIVAS?|CUSTODIA|LIBERDADE PROVISORIA|EXECUCAO DA PENA|TRAFICO|CRIME)\b")
_POLO = {"A": "Polo ativo (autor/requerente)", "P": "Polo passivo (réu/requerido)",
         "T": "Terceiro interessado"}


def _nivel_nome(consulta: str, cand: str) -> tuple[str, int] | None:
    qt, ct = tokens(consulta), tokens(cand)
    if not qt or not ct:
        return None
    if qt == ct:
        return "nome idêntico a uma das partes", 70
    sq, sc = set(qt), set(ct)
    if len(qt) >= 2 and len(ct) >= 2 and (sq <= sc or sc <= sq):
        return "nome contido (um contém o outro)", 55
    return None


def _limpa(html: str) -> str:
    t = re.sub(r"(?is)<(style|script).*?</>", " ", html or "")
    t = re.sub(r"<[^>]+>", " ", t)
    t = t.replace("�", "")
    return re.sub(r"\s+", " ", t).strip()


def _get(params: dict, deadline: float) -> dict[str, Any]:
    """GET com retentativas; levanta RuntimeError com mensagem clara se esgotar."""
    ultimo = "sem resposta"
    for tentativa in range(4):
        restante = deadline - time.monotonic()
        if restante < 5:
            break
        try:
            r = httpx.get(URL, params=params, headers=_HEADERS, timeout=min(40.0, restante))
            j = r.json()
            if j.get("status") == "success":
                return j
            ultimo = j.get("message") or f"HTTP {r.status_code}"
        except Exception as exc:
            ultimo = type(exc).__name__
        time.sleep(min(2 + 2 * tentativa, max(0.0, deadline - time.monotonic() - 5)))
    raise RuntimeError(f"DJEN indisponível ({ultimo}) — tente de novo em alguns minutos")


def buscar_publicacoes(req: OsintRequest) -> dict[str, Any]:
    if not req.nome or len(tokens(req.nome)) < 2:
        return {"status": "nao_aplicavel", "achados": [], "descartados": 0}

    deadline = time.monotonic() + ORCAMENTO_S
    params = {
        "nomeParte": req.nome.strip(), "itensPorPagina": POR_PAGINA, "pagina": 1,
        "dataDisponibilizacaoInicio": INICIO_DJEN,
        "dataDisponibilizacaoFim": date.today().isoformat(),
    }
    j = _get(params, deadline)
    total_api = j.get("count") or 0
    itens = list(j.get("items") or [])

    # nomes raros: busca mais páginas; nome comum (ou teto da API): só a 1ª, sem varrer tudo
    if 0 < total_api <= POR_PAGINA * MAX_PAGINAS:
        for pg in range(2, -(-total_api // POR_PAGINA) + 1):
            try:
                itens += _get({**params, "pagina": pg}, deadline).get("items") or []
            except RuntimeError:
                break  # devolve o que já temos

    # ── confere contra as PARTES e agrupa por processo ──
    procs: dict[str, dict[str, Any]] = {}
    fora = 0
    for it in itens:
        melhor = None
        for d in it.get("destinatarios") or []:
            m = _nivel_nome(req.nome, d.get("nome", ""))
            if m and (melhor is None or m[1] > melhor[0][1]):
                melhor = (m, d)
        if not melhor:
            fora += 1  # nome só aparece no texto/advogado, não é parte
            continue
        (rotulo, pontos), parte = melhor
        num = it.get("numeroprocessocommascara") or it.get("numero_processo") or str(it.get("id"))
        p = procs.setdefault(num, {"num": num, "pontos": pontos, "motivos": [rotulo], "its": [],
                                   "polo": parte.get("polo"), "nome_parte": parte.get("nome")})
        p["its"].append(it)

    achados = []
    comum = len(procs) > LIMITE_COMUM
    nm_mae, nm_pai = norm(req.nome_mae), norm(req.nome_pai)
    nasc = f"{req.data_nascimento[8:10]}/{req.data_nascimento[5:7]}/{req.data_nascimento[:4]}" if req.data_nascimento else None

    for num, p in procs.items():
        its = sorted(p["its"], key=lambda i: i.get("data_disponibilizacao") or "")
        texto = " ".join(_limpa(i.get("texto")) for i in its)
        tn = norm(texto)
        pontos, motivos = p["pontos"], list(p["motivos"])
        evidencia = False

        cpfs = {re.sub(r"\D", "", c) for c in re.findall(r"\d{3}\.?\d{3}\.?\d{3}-?\d{2}", texto)}
        if req.cpf and req.cpf in cpfs:
            pontos, evidencia = 100, True; motivos.append("CPF idêntico no texto da publicação")
        elif req.cpf and cpfs:
            pontos -= 30; motivos.append("publicação traz outro CPF — possível homônimo")
        if nm_mae and nm_mae in tn:
            pontos += 25; evidencia = True; motivos.append("nome da mãe no texto")
        if nm_pai and nm_pai in tn:
            pontos += 15; evidencia = True; motivos.append("nome do pai no texto")
        if nasc and nasc in texto:
            pontos += 20; evidencia = True; motivos.append("data de nascimento no texto")

        if comum and not evidencia:
            pontos = min(pontos, 40)
            motivos.append(f"nome comum: {len(procs)}+ processos com este nome — informe CPF/filiação")

        ultimo = its[-1]
        classe_norm = norm(f"{ultimo.get('nomeClasse', '')} {ultimo.get('tipoDocumento', '')}")
        brutos = _limpa(ultimo.get("texto"))
        m = re.search(re.escape(p["nome_parte"]), brutos, re.I)
        ini = max(0, m.start() - 120) if m else 0
        trecho = brutos[ini:ini + 320]
        advs = []
        for d in ultimo.get("destinatarioadvogados") or []:
            a = d.get("advogado") or {}
            if a.get("nome") and "SISTEMA DE CITA" not in (a["nome"] or "").upper():
                advs.append(f"{a['nome']} (OAB/{a.get('uf_oab', '')} {a.get('numero_oab', '')})")
        outras = [d["nome"] for d in (ultimo.get("destinatarios") or [])
                  if norm(d.get("nome")) != norm(p["nome_parte"])][:3]

        achados.append({
            "pontos": max(0, min(100, pontos)), "motivos": motivos, "processo": num,
            "tribunal": ultimo.get("siglaTribunal"), "orgao": ultimo.get("nomeOrgao"),
            "classe": ultimo.get("nomeClasse"), "polo": _POLO.get(p["polo"], p["polo"]),
            "parte": p["nome_parte"], "criminal": bool(_CRIMINAL.search(classe_norm)),
            "primeira": its[0].get("data_disponibilizacao"), "ultima": ultimo.get("data_disponibilizacao"),
            "publicacoes": len(its), "tipos": sorted({i.get("tipoComunicacao") for i in its if i.get("tipoComunicacao")}),
            "advogados": "; ".join(advs[:3]) or None, "outras_partes": ", ".join(outras) or None,
            "trecho": trecho,
        })

    achados.sort(key=lambda a: (a["pontos"], a["ultima"] or ""), reverse=True)
    return {"status": "ok" if achados else "vazio", "achados": achados[:25], "descartados": fora,
            "total_api": total_api, "comum": comum, "processos": len(procs)}
