"""
tse.py — Candidaturas e bens declarados (dados abertos do TSE), base LOCAL
Agent Bastos | Segurança Pública/Corporativa

Banco: data/tse/tse.db  (carga: scripts/carregar_tse.py)
  candidatos   1 linha por candidatura (ano + SQ_CANDIDATO): nome, CPF completo,
               nascimento, cargo, UF/município, partido, situação, resultado,
               ocupação e patrimônio declarado (total, qtd e os 10 maiores bens)

Diferente da base da Receita, aqui o CPF vem COMPLETO → dá para confirmar a identidade
por CPF e até buscar só pelo CPF. Sem CPF, a data de nascimento separa homônimos.

Atenção: a partir de 2024 o TSE NÃO publica mais o CPF (só a data de nascimento).
Essas candidaturas são vinculadas à pessoa por nome + data de nascimento idênticos.

Nunca devolve o CPF inteiro à tela (mascarado como nas demais fontes). Não guarda
e-mail nem título de eleitor.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
from pathlib import Path
from typing import Any

from .models import OsintRequest
from .receita_cnpj import chave_nome, norm, tokens

try:
    from config.paths import DATA_DIR
    _DATA = Path(DATA_DIR)
except Exception:
    _DATA = Path(__file__).resolve().parents[2] / "data"

DB_TSE = Path(os.getenv("BASTOS_TSE_DB") or (_DATA / "tse" / "tse.db"))
LIMITE_HOMONIMOS = 25


def disponivel() -> bool:
    return DB_TSE.exists() and DB_TSE.stat().st_size > 0


def _conn() -> sqlite3.Connection:
    con = sqlite3.connect(f"file:{DB_TSE}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


def info_base() -> dict[str, Any]:
    if not disponivel():
        return {"carregada": False}
    con = _conn()
    try:
        return {"carregada": True, **dict(con.execute("SELECT chave, valor FROM meta").fetchall())}
    except sqlite3.Error:
        return {"carregada": True}
    finally:
        con.close()


def _nivel_nome(consulta: str, cand: str) -> tuple[str, int] | None:
    qt, ct = tokens(consulta), tokens(cand)
    if not qt or not ct:
        return None
    if qt == ct:
        return "nome idêntico", 70
    sq, sc = set(qt), set(ct)
    if len(qt) >= 2 and len(ct) >= 2 and (sq <= sc or sc <= sq):
        return "nome contido (um contém o outro)", 55
    if len(qt) >= 2 and len(ct) >= 2 and qt[0] == ct[0] and qt[-1] == ct[-1]:
        return "primeiro e último nome iguais", 35
    return None


def _mascara(cpf: str | None) -> str:
    return f"{cpf[:3]}.***.***-**" if cpf and len(cpf) == 11 else ""


def _cand_dict(r: sqlite3.Row) -> dict[str, Any]:
    return {
        "ano": r["ano"], "cargo": r["cargo"], "uf": r["uf"], "municipio": r["municipio"],
        "partido": r["partido"], "situacao": r["situacao"], "resultado": r["resultado"],
        "ocupacao": r["ocupacao"], "patrimonio": r["patrimonio"], "qtd_bens": r["qtd_bens"],
        "bens_top": json.loads(r["bens_top"] or "[]"),
    }


def buscar_candidaturas(req: OsintRequest) -> dict[str, Any]:
    """Retorna {status, achados (1 por pessoa), descartados, total_nome, comum}."""
    if not disponivel():
        return {"status": "nao_carregada", "achados": [], "descartados": 0}
    if not req.cpf and not chave_nome(req.nome):
        return {"status": "nao_aplicavel", "achados": [], "descartados": 0}

    con = _conn()
    try:
        # 1) por CPF (completo) — prova de identidade
        por_cpf: list[sqlite3.Row] = []
        extras_sem_cpf: list[sqlite3.Row] = []
        if req.cpf:
            por_cpf = con.execute("SELECT * FROM candidatos WHERE cpf = ? ORDER BY ano DESC",
                                  (req.cpf,)).fetchall()
            # candidaturas sem CPF publicado (2024+): mesma pessoa se nome e nascimento batem
            for nome_p, nasc_p, chave_p in {(r["nome"], r["dt_nasc"], r["chave"]) for r in por_cpf if r["dt_nasc"]}:
                extras_sem_cpf += con.execute(
                    "SELECT * FROM candidatos WHERE chave = ? AND nome = ? AND dt_nasc = ? AND cpf = ''",
                    (chave_p, nome_p, nasc_p)).fetchall()

        # 2) por nome (só se não achou por CPF)
        por_nome: list[sqlite3.Row] = []
        total_chave = 0
        if not por_cpf and chave_nome(req.nome):
            ch = chave_nome(req.nome)
            total_chave = con.execute("SELECT COUNT(DISTINCT COALESCE(NULLIF(cpf,''), nome||dt_nasc)) "
                                      "FROM candidatos WHERE chave = ?", (ch,)).fetchone()[0]
            por_nome = con.execute("SELECT * FROM candidatos WHERE chave = ? ORDER BY ano DESC LIMIT 3000",
                                   (ch,)).fetchall()
            # apelido de urna igual ao texto buscado (vulgo)
            urna = norm(req.nome)
            por_nome += con.execute("SELECT * FROM candidatos WHERE urna_norm = ? AND chave != ? LIMIT 200",
                                    (urna, ch)).fetchall()
    finally:
        con.close()

    pessoas: dict[str, dict[str, Any]] = {}
    descartados = 0

    def _pessoa(r: sqlite3.Row) -> str:
        # nome+nascimento unifica candidaturas com e sem CPF publicado (2024+)
        return f"{r['nome']}|{r['dt_nasc']}" if r["dt_nasc"] else (r["cpf"] or r["nome"])

    def _add(r: sqlite3.Row, pontos: int, motivos: list[str]):
        chave_p = _pessoa(r)
        p = pessoas.setdefault(chave_p, {"pontos": pontos, "motivos": motivos, "linhas": []})
        p["linhas"].append(r)

    if por_cpf:
        for r in por_cpf:
            _add(r, 100, ["CPF idêntico"] + ([] if not req.nome or _nivel_nome(req.nome, r["nome"]) or
                                              norm(req.nome) == r["urna_norm"]
                                              else ["atenção: nome diferente do informado"]))
        for r in extras_sem_cpf:
            _add(r, 100, ["CPF idêntico"])
            pessoas[_pessoa(r)]["motivos"] = ["CPF idêntico (candidaturas de 2024 vinculadas por nome + nascimento)"]
    else:
        for r in por_nome:
            m = _nivel_nome(req.nome or "", r["nome"])
            if not m and r["urna_norm"] == norm(req.nome):
                m = ("nome de urna idêntico ao informado", 45)
            if not m:
                continue
            pontos, motivos = m[1], [m[0]]
            if req.data_nascimento and r["dt_nasc"]:
                if r["dt_nasc"] == req.data_nascimento:
                    pontos += 30; motivos.append("data de nascimento idêntica")
                else:
                    if _pessoa(r) not in pessoas:
                        descartados += 1  # data de nascimento diferente = outra pessoa
                    continue
            _add(r, pontos, motivos)

    # nome comum sem identificador forte → teto de confiança
    comum = (not por_cpf) and (not req.data_nascimento) and total_chave > LIMITE_HOMONIMOS
    achados = []
    for chave_p, p in pessoas.items():
        linhas = sorted(p["linhas"], key=lambda r: r["ano"], reverse=True)
        # remove duplicatas ano+cargo (2º turno etc.)
        vistos, cands = set(), []
        for r in linhas:
            k = (r["ano"], r["cargo"], r["municipio"])
            if k not in vistos:
                vistos.add(k); cands.append(_cand_dict(r))
        base = linhas[0]
        pontos, motivos = p["pontos"], list(p["motivos"])
        if comum:
            pontos = min(pontos, 40)
            motivos.append(f"nome comum: {total_chave} pessoas na base — informe CPF ou data de nascimento")
        achados.append({
            "pontos": max(0, min(100, pontos)), "motivos": motivos,
            "nome": base["nome"], "cpf": _mascara(next((r["cpf"] for r in linhas if r["cpf"]), "")),
            "dt_nasc": base["dt_nasc"], "candidaturas": cands,
        })
    achados.sort(key=lambda a: a["pontos"], reverse=True)
    return {"status": "ok" if achados else "vazio", "achados": achados[:25],
            "descartados": descartados, "total_nome": total_chave, "comum": comum}
