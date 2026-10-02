"""
risco.py — Nível de risco da pessoa pesquisada (regras explícitas e ajustáveis)
Agent Bastos | Segurança Pública/Corporativa

O risco é calculado SÓ por três pilares (decisão do usuário, 02/10/2026):
  1. PROCESSOS   publicações judiciais (DJEN): processos criminais e demais.
  2. LIDERANÇAS  presença no cadastro de lideranças (unidades e rua).
  3. NOTÍCIAS    notícias/alertas sobre crimes em que a pessoa aparece como AUTOR/suspeito
                 (vítima e simples citação são informativas e não elevam o risco).

Só entram resultados com precisão >= LIMIAR (50%). O que ficar abaixo é "impreciso" e é contado à parte
(pode ser homônimo). Lista Negra, sanções, PEP, empresas, TSE e diários oficiais NÃO entram no nível.

Nível final = o MAIOR entre os pilares; se DOIS ou mais pilares chegam a ALTO, sobe para CRÍTICO
(convergência de fontes independentes). Um mandado de prisão ativo (fontes antigas) é sempre CRÍTICO.

Para mudar os critérios, edite as constantes abaixo.
"""

from __future__ import annotations

import re
from typing import Any

from .receita_cnpj import norm

VERSAO_REGRAS = "2026-10-02"
LIMIAR = 50

# ── PROCESSOS ────────────────────────────────────────────────────────────────
CRIMINAIS_CRITICO = 3          # nº de processos criminais que leva a CRÍTICO
OUTROS_PARA_MEDIO = 5          # nº de processos não criminais que leva a MÉDIO
_EXEC_PRISAO = re.compile(r"EXECUCAO|PRISAO|MANDADO|CUSTODIA")   # classe indicativa de pena/prisão → CRÍTICO

# ── LIDERANÇAS ───────────────────────────────────────────────────────────────
# Toda liderança = ALTO. Esta lista só ordena a exibição (cargos de comando e foragidos primeiro).
_CARGO_TOPO = re.compile(r"PRESIDENTE|VICE|FUNDADOR|CHEFE|GERAL|LIDER|CONSELHEIRO|PILAR")

# ── NOTÍCIAS ─────────────────────────────────────────────────────────────────
GRAVES_CRITICO = 3             # nº de notícias de crime GRAVE (autor) que leva a CRÍTICO

NIVEIS = ["sem_dado", "baixo", "medio", "alto", "critico"]
ROTULO = {"sem_dado": "sem dado", "baixo": "baixo", "medio": "médio", "alto": "alto", "critico": "crítico"}


def _max(*n: str | None) -> str:
    return max((x for x in n if x), key=NIVEIS.index, default="sem_dado")


def _pilar_processos(achados: list[dict]) -> dict[str, Any]:
    proc = [a for a in achados if a["fonte"] == "djen" and a["confianca"] >= LIMIAR]
    if not proc:
        return {"nivel": None, "n": 0, "motivos": []}
    crim = [a for a in proc if a["dados"].get("criminal")]
    outros = len(proc) - len(crim)
    exec_pen = [a for a in crim if _EXEC_PRISAO.search(norm(a["dados"].get("classe") or ""))]
    if exec_pen or len(crim) >= CRIMINAIS_CRITICO:
        nivel = "critico"
    elif crim:
        nivel = "alto"
    elif outros >= OUTROS_PARA_MEDIO:
        nivel = "medio"
    else:
        nivel = "baixo"
    motivos = []
    if crim:
        tribs = sorted({a["dados"].get("tribunal") or "?" for a in crim})
        motivos.append(f"{len(crim)} processo(s) de natureza criminal ({', '.join(tribs[:4])})")
    if exec_pen:
        motivos.append(f"{len(exec_pen)} ligado(s) a execução penal/prisão")
    if outros:
        motivos.append(f"{outros} outro(s) processo(s) (cíveis/administrativos)")
    return {"nivel": nivel, "n": len(proc), "criminais": len(crim), "motivos": motivos}


def _pilar_liderancas(achados: list[dict]) -> dict[str, Any]:
    lid = [a for a in achados if a["fonte"] == "liderancas" and a["confianca"] >= LIMIAR]
    if not lid:
        return {"nivel": None, "n": 0, "motivos": []}
    # Decisão do usuário (02/10/2026): TODA liderança cadastrada é nível ALTO, qualquer cargo.
    # O CRÍTICO só vem da convergência com outro pilar (ver avaliar()). Cargos de comando aparecem primeiro.
    nivel = "alto"
    ordem = sorted(lid, key=lambda a: not (_CARGO_TOPO.search(norm(a["dados"].get("cargo") or ""))
                                           or norm(a["dados"].get("status") or "") == "FORAGIDO"))
    motivos = []
    for a in ordem[:3]:
        d = a["dados"]
        local = (d.get("atual") or {}).get("unidade") or ("liderança de rua" if d.get("escopo") == "rua" else "")
        motivos.append(f"{d.get('faccao') or 'facção n/i'} — {d.get('cargo') or 'cargo n/i'}"
                       + (f" ({local})" if local else "") + (f" — {d['status']}" if d.get("status") else ""))
    return {"nivel": nivel, "n": len(lid), "motivos": motivos}


def _pilar_noticias(achados: list[dict]) -> dict[str, Any]:
    nots = [a for a in achados if a["fonte"] == "noticias" and a["confianca"] >= LIMIAR]
    if not nots:
        return {"nivel": None, "n": 0, "motivos": []}
    autor = [a for a in nots if a["dados"].get("papel") == "autor" and a["dados"].get("crime_tipos")]
    graves = [a for a in autor if a["dados"].get("grave")]
    alerta_alto = [a for a in nots if str(a["dados"].get("risco_monitor") or "").upper() == "ALTO"
                   and "alerta" in str(a["dados"].get("origem") or "")]
    if len(graves) >= GRAVES_CRITICO:
        nivel = "critico"
    elif graves or alerta_alto:
        nivel = "alto"
    elif autor:
        nivel = "medio"
    else:
        nivel = "baixo"
    motivos = []
    if graves:
        tipos = sorted({t for a in graves for t in a["dados"].get("crime_tipos", [])})
        motivos.append(f"{len(graves)} notícia(s) como autor/suspeito de crime grave ({', '.join(tipos[:4])})")
    elif autor:
        motivos.append(f"{len(autor)} notícia(s) como autor/suspeito de crime")
    if alerta_alto:
        motivos.append(f"{len(alerta_alto)} alerta(s) de risco ALTO gerado(s) pelo monitor")
    vit = len([a for a in nots if a["dados"].get("papel") == "vitima"])
    cit = len(nots) - len(autor) - vit
    if vit:
        motivos.append(f"{vit} notícia(s) como vítima (não elevam o risco)")
    if cit > 0 and not autor:
        motivos.append(f"{cit} notícia(s) apenas citando a pessoa")
    return {"nivel": nivel, "n": len(nots), "autor": len(autor), "motivos": motivos}


def avaliar(achados: list[dict], fontes: dict[str, dict], mandado_ativo: bool = False) -> dict[str, Any]:
    pil = {"processos": _pilar_processos(achados), "liderancas": _pilar_liderancas(achados),
           "noticias": _pilar_noticias(achados)}
    niveis = [p["nivel"] for p in pil.values() if p["nivel"]]
    nivel = _max(*niveis)
    convergencia = sum(1 for n in niveis if NIVEIS.index(n) >= NIVEIS.index("alto")) >= 2
    if convergencia:
        nivel = "critico"
    if mandado_ativo:
        nivel = "critico"

    consultou = any((fontes.get(k) or {}).get("status") in ("ok", "vazio") for k in ("djen", "liderancas", "noticias"))
    if not niveis and not mandado_ativo:
        nivel = "baixo" if consultou else "sem_dado"

    imprecisos = sum(1 for a in achados if a["fonte"] in ("djen", "liderancas", "noticias") and a["confianca"] < LIMIAR)
    rotulo = {"processos": "Processos", "liderancas": "Lideranças", "noticias": "Notícias"}
    motivos = [f"{rotulo[n]}: {m}" for n, p in pil.items() for m in p["motivos"]]
    if convergencia:
        motivos.append("Convergência: dois ou mais pilares em nível alto ou crítico")
    if mandado_ativo:
        motivos.append("Mandado de prisão ativo (fontes antigas)")

    if nivel == "sem_dado":
        resumo = "Sem dado: as fontes de risco (processos, lideranças e notícias) não responderam."
    elif not niveis and not mandado_ativo:
        resumo = (f"Risco baixo: nenhuma ocorrência com {LIMIAR}% ou mais de precisão em processos, lideranças ou notícias"
                  + (f" ({imprecisos} resultado(s) impreciso(s) não considerado(s))." if imprecisos else "."))
    else:
        resumo = f"Risco {ROTULO[nivel]}: " + "; ".join(motivos[:4]) + "."
        if imprecisos:
            resumo += f" ({imprecisos} resultado(s) impreciso(s) não considerado(s).)"
    return {"nivel": nivel, "pilares": pil, "motivos": motivos, "resumo": resumo, "convergencia": convergencia,
            "imprecisos_nao_considerados": imprecisos, "limiar": LIMIAR, "versao_regras": VERSAO_REGRAS}
