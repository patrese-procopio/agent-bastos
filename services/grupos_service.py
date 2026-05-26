# -*- coding: utf-8 -*-
"""
grupos_service.py — Ocupação de grupos por unidade/pavilhão, por MÊS (SQLite)
Agent Bastos | AIPEN

Substitui a dependência do Drive para a distribuição de grupos:
  - Banco local data/grupos/grupos_ocupacao.db
  - Um registro por (ano_mes, unidade, pavilhão) com o grupo atribuído
  - Edição manual pela tela Controle de Grupos (POST /grupos/ocupacao)
  - Histórico mensal: cada mês fica salvo; meses novos COPIAM o mês anterior
  - Inteligência de Grupos lê deste banco (/grupos/ocupacao, /grupos/kpis)
"""

import os
import sqlite3
from datetime import datetime
from contextlib import contextmanager

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH  = os.path.join(BASE_DIR, "data", "grupos", "grupos_ocupacao.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

# ── Estrutura física padrão (unidades → pavilhões + posição no mapa) ───────────
# Usada para semear o PRIMEIRO mês. 'g' = grupo inicial (a distribuição que o
# operador já via na tela). Depois é tudo editável e meses novos copiam o anterior.
ESTRUTURA_PADRAO = {
    "CDPM1": {"img": "CDPM1.jpg", "pavs": {
        "P01":    {"l": "Pavilhão 01",    "g": "RDA",            "x": 41, "y": 43},
        "PANEXO": {"l": "Pavilhão Anexo", "g": "AMARELINHOS",    "x": 21, "y": 47},
        "P02A1":  {"l": "Pav. 02 Ala 01", "g": "MED. SEGURANÇA", "x": 60, "y": 40},
        "P02A2":  {"l": "Pav. 02 Ala 02", "g": "LIDERANÇAS CV",  "x": 60, "y": 51},
        "P03":    {"l": "Pavilhão 03",    "g": "CRIMES SEXUAIS", "x": 30, "y": 30},
        "P04":    {"l": "Pavilhão 04",    "g": "CV/AM",          "x": 67, "y": 29},
        "P05":    {"l": "Pavilhão 05",    "g": "JACK/TDA",       "x": 30, "y": 10},
        "P06":    {"l": "Pavilhão 06",    "g": "JACK/TDA",       "x": 68, "y": 9},
    }},
    "CDPM2": {"img": "CDPM2.jpg", "pavs": {
        "P01": {"l": "Pavilhão 01", "g": "PCC",            "x": 55, "y": 46},
        "P02": {"l": "Pavilhão 02", "g": "CV/AM",          "x": 35, "y": 46},
        "P03": {"l": "Pavilhão 03", "g": "AMARELINHOS",    "x": 72, "y": 30},
        "P04": {"l": "Pavilhão 04", "g": "CV/AM",          "x": 36, "y": 30},
        "P05": {"l": "Pavilhão 05", "g": "AMARELINHOS",    "x": 70, "y": 11},
        "P06": {"l": "Pavilhão 06", "g": "CV/AM",          "x": 33, "y": 11},
        "P07": {"l": "Pavilhão 07", "g": "LIDERANÇAS PCC", "x": 74, "y": 80},
    }},
    "IPAT": {"img": "IPAT.jpg", "pavs": {
        "PA": {"l": "Pavilhão A", "g": "CV/AM",         "x": 30, "y": 34},
        "PB": {"l": "Pavilhão B", "g": "AMARELINHOS",   "x": 51, "y": 19},
        "PC": {"l": "Pavilhão C", "g": "CV/AM",         "x": 70, "y": 34},
        "PD": {"l": "Pavilhão D", "g": "LIDERANÇAS CV", "x": 67, "y": 71},
    }},
    "UPP": {"img": "UPP.jpg", "pavs": {
        "G0102": {"l": "Galerias 01 e 02", "g": "AMARELINHOS", "x": 71, "y": 61},
        "G0304": {"l": "Galerias 03 e 04", "g": "NEUTROS",     "x": 68, "y": 47},
        "G0607": {"l": "Galerias 06 e 07", "g": "NEUTROS",     "x": 70, "y": 37},
        "G05":   {"l": "Galeria 05",       "g": "NEUTROS",     "x": 43, "y": 45},
        "G08":   {"l": "Galeria 08",       "g": "ISOLAMENTO",  "x": 43, "y": 37},
        "G11":   {"l": "Galeria 11",       "g": "LGBTQIAPN+",  "x": 43, "y": 23},
        "G0910": {"l": "Galerias 09 e 10", "g": "JACK/TDA",    "x": 73, "y": 22},
    }},
    "COMPAJ": {"img": "COMPAJ.jpg", "pavs": {
        "P01": {"l": "Pavilhão 01", "g": "CV/AM",       "x": 43, "y": 16},
        "P02": {"l": "Pavilhão 02", "g": "CV/AM",       "x": 46, "y": 32},
        "P03": {"l": "Pavilhão 03", "g": "CV/AM",       "x": 46, "y": 49},
        "P05": {"l": "Pavilhão 05", "g": "CV/AM",       "x": 46, "y": 79},
        "P07": {"l": "Pavilhão 07", "g": "AMARELINHOS", "x": 20, "y": 62},
    }},
    "CDF": {"img": "CDF.jpg", "pavs": {
        "P01A": {"l": "Pav. 01-A",          "g": "CV/AM",          "x": 51, "y": 32},
        "P01B": {"l": "Pav. 01-B",          "g": "AMARELINHOS",    "x": 25, "y": 28},
        "P02":  {"l": "Pav. 02 Condenadas", "g": "CV/AM",          "x": 74, "y": 27},
        "P03":  {"l": "Pavilhão 03",        "g": "ISOLAMENTO",     "x": 74, "y": 37},
        "BERC": {"l": "Berçário",           "g": "MED. SEGURANÇA", "x": 64, "y": 62},
    }},
}

GRUPOS_DISPONIVEIS = [
    "CV/AM", "LIDERANÇAS CV", "PCC", "LIDERANÇAS PCC", "JACK/TDA", "AMARELINHOS",
    "RDA", "NEUTROS", "LGBTQIAPN+", "CRIMES SEXUAIS", "ISOLAMENTO", "MED. SEGURANÇA",
]


@contextmanager
def _conn():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()


def init_db():
    with _conn() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS ocupacao (
                ano_mes       TEXT NOT NULL,
                unidade       TEXT NOT NULL,
                pavilhao_id   TEXT NOT NULL,
                label         TEXT NOT NULL,
                grupo         TEXT NOT NULL DEFAULT '',
                x             REAL,
                y             REAL,
                atualizado_em TEXT NOT NULL,
                PRIMARY KEY (ano_mes, unidade, pavilhao_id)
            )
        """)
        con.execute("CREATE INDEX IF NOT EXISTS idx_ocup_mes ON ocupacao(ano_mes)")


def _mes_atual() -> str:
    return datetime.now().strftime("%Y-%m")


def listar_meses() -> list:
    with _conn() as con:
        rows = con.execute("SELECT DISTINCT ano_mes FROM ocupacao ORDER BY ano_mes DESC").fetchall()
    return [r[0] for r in rows]


def _tem_dados(con, ano_mes: str) -> bool:
    return con.execute("SELECT 1 FROM ocupacao WHERE ano_mes=? LIMIT 1", (ano_mes,)).fetchone() is not None


def _mes_anterior_com_dados(con, ano_mes: str) -> str | None:
    row = con.execute(
        "SELECT ano_mes FROM ocupacao WHERE ano_mes < ? ORDER BY ano_mes DESC LIMIT 1", (ano_mes,)
    ).fetchone()
    return row[0] if row else None


def garantir_mes(ano_mes: str) -> None:
    """Garante que o mês exista: copia o mês anterior com dados; senão semeia do padrão."""
    agora = datetime.now().isoformat()
    with _conn() as con:
        if _tem_dados(con, ano_mes):
            return
        anterior = _mes_anterior_com_dados(con, ano_mes)
        if anterior:
            rows = con.execute("SELECT unidade,pavilhao_id,label,grupo,x,y FROM ocupacao WHERE ano_mes=?", (anterior,)).fetchall()
            con.executemany(
                "INSERT INTO ocupacao (ano_mes,unidade,pavilhao_id,label,grupo,x,y,atualizado_em) VALUES (?,?,?,?,?,?,?,?)",
                [(ano_mes, r["unidade"], r["pavilhao_id"], r["label"], r["grupo"], r["x"], r["y"], agora) for r in rows],
            )
        else:
            registros = []
            for unidade, meta in ESTRUTURA_PADRAO.items():
                for pid, p in meta["pavs"].items():
                    registros.append((ano_mes, unidade, pid, p["l"], p["g"], p["x"], p["y"], agora))
            con.executemany(
                "INSERT INTO ocupacao (ano_mes,unidade,pavilhao_id,label,grupo,x,y,atualizado_em) VALUES (?,?,?,?,?,?,?,?)",
                registros,
            )


def ler_ocupacao(ano_mes: str | None = None) -> dict:
    """Retorna {atualizado, unidades:{UNID:{img, pavilhoes:{id:{label,grupo,x,y}}}}}."""
    ano_mes = ano_mes or _mes_atual()
    garantir_mes(ano_mes)
    with _conn() as con:
        rows = con.execute(
            "SELECT unidade,pavilhao_id,label,grupo,x,y FROM ocupacao WHERE ano_mes=? ORDER BY unidade,pavilhao_id",
            (ano_mes,),
        ).fetchall()
    unidades: dict = {}
    for r in rows:
        u = r["unidade"]
        if u not in unidades:
            img = ESTRUTURA_PADRAO.get(u, {}).get("img", f"{u}.jpg")
            unidades[u] = {"img": img, "pavilhoes": {}}
        unidades[u]["pavilhoes"][r["pavilhao_id"]] = {
            "label": r["label"], "grupo": r["grupo"], "x": r["x"], "y": r["y"],
        }
    return {"atualizado": ano_mes, "unidades": unidades}


def salvar_grupo(ano_mes: str, unidade: str, pavilhao_id: str, grupo: str) -> dict:
    """Atualiza o grupo de um pavilhão no mês (upsert). Garante o mês antes."""
    ano_mes = ano_mes or _mes_atual()
    garantir_mes(ano_mes)
    agora = datetime.now().isoformat()
    with _conn() as con:
        cur = con.execute(
            "UPDATE ocupacao SET grupo=?, atualizado_em=? WHERE ano_mes=? AND unidade=? AND pavilhao_id=?",
            (grupo, agora, ano_mes, unidade, pavilhao_id),
        )
        if cur.rowcount == 0:
            # pavilhão inexistente no mês — insere usando label/posição do padrão se houver
            base = ESTRUTURA_PADRAO.get(unidade, {}).get("pavs", {}).get(pavilhao_id, {})
            con.execute(
                "INSERT INTO ocupacao (ano_mes,unidade,pavilhao_id,label,grupo,x,y,atualizado_em) VALUES (?,?,?,?,?,?,?,?)",
                (ano_mes, unidade, pavilhao_id, base.get("l", pavilhao_id), grupo, base.get("x"), base.get("y"), agora),
            )
    return {"ok": True, "ano_mes": ano_mes, "unidade": unidade, "pavilhao_id": pavilhao_id, "grupo": grupo}


def _contagem_mes(con, ano_mes: str) -> dict:
    rows = con.execute(
        "SELECT grupo, COUNT(*) n FROM ocupacao WHERE ano_mes=? AND grupo<>'' GROUP BY grupo", (ano_mes,)
    ).fetchall()
    return {r["grupo"]: r["n"] for r in rows}


def computar_kpis() -> dict:
    """Série histórica {mês:{grupo:qtd}} + alertas de variação ≥20% (espelha o /kpis antigo).

    Anti-N+1: a série inteira sai em UMA query (antes era 1 query por mês).
    """
    with _conn() as con:
        rows = con.execute(
            "SELECT ano_mes, grupo, COUNT(*) n FROM ocupacao "
            "WHERE grupo <> '' GROUP BY ano_mes, grupo ORDER BY ano_mes"
        ).fetchall()
    series: dict[str, dict] = {}
    for r in rows:
        series.setdefault(r["ano_mes"], {})[r["grupo"]] = r["n"]
    meses = sorted(series.keys())
    alertas = []
    if len(meses) >= 2:
        atual, anterior = series[meses[-1]], series[meses[-2]]
        for grupo, qtd in atual.items():
            qa = anterior.get(grupo, 0)
            if qa > 0:
                v = ((qtd - qa) / qa) * 100
                if abs(v) >= 20:
                    alertas.append({"grupo": grupo, "variacao": round(v, 1), "atual": qtd, "anterior": qa})
    return {"series": series, "alertas": alertas, "meses": meses}


# Inicializa o banco ao importar
init_db()
