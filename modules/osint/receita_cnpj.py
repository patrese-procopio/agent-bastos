"""
receita_cnpj.py — Quadro societário da base aberta de CNPJ (Receita Federal), LOCAL
Agent Bastos | Segurança Pública/Corporativa

Por que local: busca por nome de sócio sem limite de taxa, sem depender de API
de terceiros e sem enviar o nome do alvo para fora.

O que fica no banco (data/receita/cnpj_socios.db) — só sócios PESSOA FÍSICA:
  chave        primeiro+último nome normalizado (índice de busca)
  nome         nome normalizado completo
  cpf_meio     6 dígitos do meio do CPF (a Receita publica ***ddddd d**,
               ou seja CPF[3:9]) — permite confirmar identidade quando o CPF é conhecido
  faixa_etaria código 0-9 da Receita (compara com a data de nascimento)
  cnpj_basico, qualificacao, data_entrada

Dados da empresa (razão social, situação, UF) NÃO são guardados: para os poucos
achados relevantes são consultados na BrasilAPI pelo CNPJ da matriz (0001 + DV).

Carga: scripts/carregar_cnpj_receita.py
"""

from __future__ import annotations

import os
import re
import sqlite3
import time
import unicodedata
from datetime import date
from pathlib import Path
from typing import Any

import httpx

from .models import OsintRequest

_STOP = {"DE", "DA", "DO", "DAS", "DOS", "E"}

try:
    from config.paths import DATA_DIR
    _DATA = Path(DATA_DIR)
except Exception:  # uso isolado (testes)
    _DATA = Path(__file__).resolve().parents[2] / "data"

DB_RECEITA = Path(os.getenv("BASTOS_RECEITA_DB") or (_DATA / "receita" / "cnpj_socios.db"))

# Acima disto, um nome sem CPF é "comum demais" para listar/enriquecer
LIMITE_HOMONIMOS = 40

QUALIFICACAO = {
    "05": "Administrador", "08": "Conselheiro de Administração", "10": "Diretor",
    "16": "Presidente", "17": "Procurador", "20": "Sociedade Consorciada",
    "21": "Sociedade Filiada", "22": "Sócio", "28": "Sócio Comanditado",
    "29": "Sócio Comanditário", "31": "Sócio Participante", "37": "Sócio Pessoa Física Residente",
    "49": "Sócio-Administrador", "52": "Sócio com Capital", "54": "Fundador",
    "65": "Titular Pessoa Física", "71": "Representante Legal", "73": "Administrador Judicial",
}

# Faixas etárias da Receita: código → (idade mín, idade máx)
FAIXAS = {"1": (0, 12), "2": (13, 20), "3": (21, 30), "4": (31, 40), "5": (41, 50),
          "6": (51, 60), "7": (61, 70), "8": (71, 80), "9": (81, 200)}


# ─────────────────────────────────────────────
# NORMALIZAÇÃO
# ─────────────────────────────────────────────

def norm(s: str | None) -> str:
    s = unicodedata.normalize("NFKD", str(s or ""))
    s = "".join(c for c in s if not unicodedata.combining(c)).upper()
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", " ", s)).strip()


def tokens(s: str | None) -> list[str]:
    return [t for t in norm(s).split() if t not in _STOP]


def chave_nome(s: str | None) -> str | None:
    """Primeiro + último token ('ALMIR NOBRE TELES' → 'ALMIR|TELES')."""
    t = tokens(s)
    return f"{t[0]}|{t[-1]}" if len(t) >= 2 else None


# ─────────────────────────────────────────────
# CNPJ
# ─────────────────────────────────────────────

def cnpj_matriz(basico: str) -> str:
    """CNPJ de 14 dígitos da matriz (ordem 0001) a partir dos 8 do básico."""
    base = f"{int(basico):08d}0001"

    def dv(num: str) -> str:
        pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        pesos = pesos[len(pesos) - len(num):]
        r = sum(int(d) * p for d, p in zip(num, pesos)) % 11
        return "0" if r < 2 else str(11 - r)

    d1 = dv(base)
    d2 = dv(base + d1)
    return base + d1 + d2


def fmt_cnpj(c: str) -> str:
    return f"{c[:2]}.{c[2:5]}.{c[5:8]}/{c[8:12]}-{c[12:]}"


# ─────────────────────────────────────────────
# BANCO
# ─────────────────────────────────────────────

def disponivel() -> bool:
    return DB_RECEITA.exists() and DB_RECEITA.stat().st_size > 0


def _conn() -> sqlite3.Connection:
    con = sqlite3.connect(f"file:{DB_RECEITA}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


def info_base() -> dict[str, Any]:
    if not disponivel():
        return {"carregada": False}
    con = _conn()
    try:
        meta = dict(con.execute("SELECT chave, valor FROM meta").fetchall())
    except sqlite3.Error:
        meta = {}
    finally:
        con.close()
    return {"carregada": True, **meta}


def _faixa_compativel(faixa: str, nascimento: str | None) -> bool | None:
    """True/False se a data de nascimento cabe na faixa; None se não dá p/ saber."""
    if faixa not in FAIXAS or not nascimento:
        return None
    try:
        y, m, d = (int(x) for x in nascimento.split("-"))
        hoje = date.today()
        idade = hoje.year - y - ((hoje.month, hoje.day) < (m, d))
    except Exception:
        return None
    lo, hi = FAIXAS[faixa]
    # tolerância de 1 ano: a base é mensal, a idade pode ter virado depois
    return lo - 1 <= idade <= hi + 1


def _nivel_nome(consulta: str, cand: str) -> tuple[str, int] | None:
    qt, ct = tokens(consulta), tokens(cand)
    if not qt or not ct:
        return None
    if qt == ct:
        return "nome idêntico", 70
    sq, sc = set(qt), set(ct)
    if sq <= sc or sc <= sq:
        return "nome contido (um contém o outro)", 55
    if qt[0] == ct[0] and qt[-1] == ct[-1]:
        return "primeiro e último nome iguais", 35
    return None


# ─────────────────────────────────────────────
# BUSCA
# ─────────────────────────────────────────────

def buscar_socios(req: OsintRequest) -> dict[str, Any]:
    """
    Procura o nome como sócio. Retorna {achados, descartados, total_nome, status}.
    Nunca devolve CPF (a base só tem o miolo mascarado).
    """
    if not disponivel():
        return {"status": "nao_carregada", "achados": [], "descartados": 0}
    chave = chave_nome(req.nome)
    if not chave:
        return {"status": "nao_aplicavel", "achados": [], "descartados": 0}

    cpf_meio = req.cpf[3:9] if req.cpf else None
    cols = "nome, cpf_meio, faixa_etaria, cnpj_basico, qualificacao, data_entrada"
    con = _conn()
    try:
        total_chave = con.execute("SELECT COUNT(*) FROM socios WHERE chave = ?", (chave,)).fetchone()[0]
        if cpf_meio:
            # Filtra o CPF no SQL: com 30 mil homônimos, um LIMIT genérico poderia
            # cortar justamente o sócio verdadeiro.
            rows = con.execute(f"SELECT {cols} FROM socios WHERE chave = ? AND cpf_meio = ? LIMIT 500",
                               (chave, cpf_meio)).fetchall()
        else:
            rows = con.execute(f"SELECT {cols} FROM socios WHERE chave = ? LIMIT 5000", (chave,)).fetchall()
    finally:
        con.close()

    brutos: list[dict[str, Any]] = []
    descartados = 0

    for r in rows:
        m = _nivel_nome(req.nome, r["nome"])
        if not m:
            continue
        rotulo, pontos = m
        motivos = [rotulo]

        if cpf_meio:
            if r["cpf_meio"] == cpf_meio:
                pontos = 100 if pontos == 70 else 95
                motivos.append("dígitos centrais do CPF idênticos")
            else:
                descartados += 1  # mesmo nome, CPF diferente = homônimo
                continue
        else:
            comp = _faixa_compativel(r["faixa_etaria"], req.data_nascimento)
            if comp is True:
                pontos += 10; motivos.append("faixa etária compatível")
            elif comp is False:
                pontos -= 25; motivos.append("faixa etária incompatível")

        brutos.append({"r": r, "pontos": pontos, "motivos": motivos})

    if cpf_meio:
        descartados = max(0, total_chave - len(rows))  # mesmo 1º+último nome, outro CPF
    total_nome = total_chave if not cpf_meio else len(brutos)
    comum = (not cpf_meio) and total_chave > LIMITE_HOMONIMOS
    if comum:
        for b in brutos:
            b["pontos"] = min(b["pontos"], 40)
            b["motivos"].append(f"nome comum: {total_nome:,} homônimos na base — informe o CPF".replace(",", "."))

    brutos.sort(key=lambda b: b["pontos"], reverse=True)
    brutos = brutos[:30]

    achados = []
    for b in brutos:
        r = b["r"]
        basico = r["cnpj_basico"]
        achados.append({
            "pontos": max(0, min(100, b["pontos"])),
            "motivos": b["motivos"],
            "nome": r["nome"],
            "cnpj_basico": basico,
            "cnpj_matriz": fmt_cnpj(cnpj_matriz(basico)),
            "qualificacao": QUALIFICACAO.get(r["qualificacao"], r["qualificacao"]),
            "data_entrada": _fmt_data(r["data_entrada"]),
        })
    return {"status": "ok" if achados else "vazio", "achados": achados,
            "descartados": descartados, "total_nome": total_nome, "comum": comum}


def _fmt_data(d: str | None) -> str:
    d = d or ""
    return f"{d[6:8]}/{d[4:6]}/{d[:4]}" if re.fullmatch(r"\d{8}", d) else ""


# ─────────────────────────────────────────────
# DETALHES DA EMPRESA (BrasilAPI, só p/ achados relevantes)
# ─────────────────────────────────────────────

_cache: dict[str, tuple[float, dict]] = {}
_TTL = 3600.0


def detalhes_empresa(cnpj14: str, timeout: float = 8.0) -> dict[str, Any] | None:
    hit = _cache.get(cnpj14)
    if hit and time.monotonic() - hit[0] < _TTL:
        return hit[1]
    try:
        r = httpx.get(f"https://brasilapi.com.br/api/cnpj/v1/{cnpj14}", timeout=timeout,
                      headers={"User-Agent": "AgentBastos/1.0"})
        if r.status_code != 200:
            return None
        j = r.json()
    except Exception:
        return None
    d = {
        "razao_social": j.get("razao_social"),
        "nome_fantasia": j.get("nome_fantasia"),
        "situacao": j.get("descricao_situacao_cadastral"),
        "data_abertura": j.get("data_inicio_atividade"),
        "atividade": j.get("cnae_fiscal_descricao"),
        "uf": j.get("uf"),
        "municipio": j.get("municipio"),
        "capital_social": j.get("capital_social"),
        "porte": j.get("porte") or j.get("descricao_porte"),
        "socios": [s.get("nome_socio") for s in (j.get("qsa") or []) if s.get("nome_socio")][:15],
    }
    _cache[cnpj14] = (time.monotonic(), d)
    return d
