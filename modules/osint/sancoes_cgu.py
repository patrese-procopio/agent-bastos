"""
sancoes_cgu.py — PEPs e sanções administrativas (CGU, dados abertos), base LOCAL
Agent Bastos | Segurança Pública/Corporativa

Banco: data/sancoes/sancoes.db  (carga: scripts/carregar_sancoes_cgu.py)
  PEP   pessoas expostas politicamente (CPF mascarado ***.123.456-**)
  CEIS  empresas/pessoas inidôneas ou suspensas (CPF completo p/ PF, CNPJ p/ PJ)
  CNEP  empresas punidas pela Lei Anticorrupção
  CEAF  servidores expulsos da administração federal (CPF mascarado)

Identidade: CPF completo (CEIS) → 100; 6 dígitos centrais do CPF + nome (PEP/CEAF) → 95-100;
só nome → 35-70, com teto de 40 para nomes comuns. Mesmo nome com CPF diferente = homônimo
descartado. Além da pessoa, procura as EMPRESAS das quais ela é sócia (Receita) nas listas
CEIS/CNEP — vínculo forte para contrainteligência.
"""

from __future__ import annotations

import json
import os
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

DB_SANCOES = Path(os.getenv("BASTOS_SANCOES_DB") or (_DATA / "sancoes" / "sancoes.db"))
LIMITE_HOMONIMOS = 25
MAX_REGISTROS_POR_ACHADO = 6


def disponivel() -> bool:
    return DB_SANCOES.exists() and DB_SANCOES.stat().st_size > 0


def _conn() -> sqlite3.Connection:
    con = sqlite3.connect(f"file:{DB_SANCOES}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


def info_base() -> dict[str, Any]:
    if not disponivel():
        return {"carregada": False}
    con = _conn()
    try:
        m = dict(con.execute("SELECT chave, valor FROM meta").fetchall())
        return {"carregada": True, "carregado_em": m.get("carregado_em"),
                "arquivos": json.loads(m.get("arquivos") or "{}"), "totais": json.loads(m.get("totais") or "{}")}
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


def _linha(r: sqlite3.Row) -> str:
    """Texto de uma linha para exibir um registro (tela e PDF)."""
    e = json.loads(r["extra"] or "{}")
    lista = r["lista"].upper()
    if lista == "PEP":
        niv = f" (nível {e['nivel']})" if e.get("nivel") else ""
        per = f"{r['inicio'] or '?'} → {r['fim'] or 'em exercício'}"
        car = f"; carência até {e['fim_carencia']}" if e.get("fim_carencia") else ""
        return f"{r['categoria']}{niv} — {r['orgao']} | {per}{car}"
    if lista == "CEAF":
        return (f"{r['categoria']} — {e.get('cargo') or e.get('funcao') or 'cargo n/i'} — {r['orgao']} | "
                f"{r['inicio'] or '?'} → {r['fim'] or 'sem fim'}")
    mult = f" | multa R$ {e['multa']}" if e.get("multa") else ""
    return (f"[{lista}] {r['categoria']} — {r['orgao']}{'/' + r['uf'] if r['uf'] else ''} | "
            f"{r['inicio'] or '?'} → {r['fim'] or 'sem fim'}{mult}"
            + (f" | {e['fundamentacao'][:90]}" if e.get("fundamentacao") else ""))


def _achado_pessoa(rows: list[sqlite3.Row], pontos: int, motivos: list[str]) -> dict[str, Any]:
    r0 = rows[0]
    lista = r0["lista"].upper()
    return {
        "pontos": max(0, min(100, pontos)), "motivos": motivos, "lista": lista, "tipo": "pessoa",
        "nome": r0["nome"], "ufs": sorted({r["uf"] for r in rows if r["uf"]}),
        "linhas": [_linha(r) for r in rows[:MAX_REGISTROS_POR_ACHADO]],
        "total_registros": len(rows), "orgaos": sorted({r["orgao"] for r in rows if r["orgao"]})[:4],
    }


def buscar_pessoa(req: OsintRequest, listas: tuple[str, ...]) -> dict[str, Any]:
    if not disponivel():
        return {"status": "nao_carregada", "achados": [], "descartados": 0}
    ch = chave_nome(req.nome)
    if not req.cpf and not ch:
        return {"status": "nao_aplicavel", "achados": [], "descartados": 0}

    marc = ",".join("?" * len(listas))
    con = _conn()
    try:
        por_cpf = []
        if req.cpf:
            por_cpf = con.execute(f"SELECT * FROM registros WHERE pf=1 AND cpf=? AND lista IN ({marc})",
                                  (req.cpf, *listas)).fetchall()
        rows = []
        total_chave = 0
        if ch:
            total_chave = con.execute(
                f"SELECT COUNT(DISTINCT COALESCE(NULLIF(cpf,''), cpf_meio||nome_norm)) FROM registros "
                f"WHERE pf=1 AND chave=? AND lista IN ({marc})", (ch, *listas)).fetchone()[0]
            rows = con.execute(f"SELECT * FROM registros WHERE pf=1 AND chave=? AND lista IN ({marc}) LIMIT 5000",
                               (ch, *listas)).fetchall()
    finally:
        con.close()

    grupos: dict[tuple, dict[str, Any]] = {}
    descartados = 0

    def _add(r: sqlite3.Row, pontos: int, motivos: list[str]):
        k = (r["lista"], r["cpf"] or f"{r['cpf_meio']}|{r['nome_norm']}")
        g = grupos.setdefault(k, {"pontos": pontos, "motivos": motivos, "rows": []})
        g["rows"].append(r)

    for r in por_cpf:  # CPF completo idêntico (CEIS)
        _add(r, 100, ["CPF idêntico"])
    cpf_ids = {x["id"] for x in por_cpf}

    for r in rows:
        if r["id"] in cpf_ids:
            continue
        m = _nivel_nome(req.nome or "", r["nome"])
        if not m:
            continue
        pontos, motivos = m[1], [m[0]]
        if req.cpf:
            if r["cpf"]:
                if r["cpf"] != req.cpf:
                    descartados += 1; continue          # CPF completo diferente
            elif r["cpf_meio"]:
                if r["cpf_meio"] == req.cpf[3:9]:
                    pontos = 100 if pontos == 70 else 95
                    motivos.append("dígitos centrais do CPF idênticos")
                else:
                    descartados += 1; continue          # miolo diferente
        _add(r, pontos, motivos)

    comum = (not req.cpf) and total_chave > LIMITE_HOMONIMOS
    achados = []
    for (_, _), g in grupos.items():
        pontos, motivos = g["pontos"], list(g["motivos"])
        if comum and pontos < 90:
            pontos = min(pontos, 40)
            motivos.append(f"nome comum: {total_chave} pessoas nestas listas — informe o CPF")
        achados.append(_achado_pessoa(sorted(g["rows"], key=lambda r: r["inicio"] or "", reverse=True), pontos, motivos))
    achados.sort(key=lambda a: a["pontos"], reverse=True)
    return {"status": "ok" if achados else "vazio", "achados": achados[:25], "descartados": descartados,
            "total_nome": total_chave, "comum": comum}


def buscar_empresas(vinculos: list[dict[str, Any]]) -> dict[str, Any]:
    """
    vinculos: [{"cnpj_basico", "empresa", "nivel"}] das empresas das quais a pessoa é sócia (Receita).
    Procura essas empresas no CEIS/CNEP.
    """
    if not disponivel():
        return {"status": "nao_carregada", "achados": []}
    if not vinculos:
        return {"status": "vazio", "achados": []}
    con = _conn()
    achados = []
    try:
        for v in vinculos[:20]:
            rows = con.execute("SELECT * FROM registros WHERE pf=0 AND cnpj_basico=? AND lista IN ('ceis','cnep')",
                               (v["cnpj_basico"],)).fetchall()
            if not rows:
                continue
            forte = v.get("nivel") == "confirmado"
            achados.append({
                "pontos": 90 if forte else 60,
                "motivos": [f"empresa da qual a pessoa é sócia (Receita, vínculo {v.get('nivel')}) consta em "
                            f"{' e '.join(sorted({r['lista'].upper() for r in rows}))}"],
                "lista": "/".join(sorted({r["lista"].upper() for r in rows})), "tipo": "empresa",
                "nome": rows[0]["nome"], "cnpj": rows[0]["cnpj"], "ufs": sorted({r["uf"] for r in rows if r["uf"]}),
                "linhas": [_linha(r) for r in rows[:MAX_REGISTROS_POR_ACHADO]],
                "total_registros": len(rows), "orgaos": sorted({r["orgao"] for r in rows if r["orgao"]})[:4],
            })
    finally:
        con.close()
    return {"status": "ok" if achados else "vazio", "achados": achados}
