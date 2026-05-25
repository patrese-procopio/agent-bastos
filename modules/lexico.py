# -*- coding: utf-8 -*-
"""
lexico.py — Léxico de Sinais Fracos (Dicionário de Jargões)
Agent Bastos | AIPEN

Mantém um DICIONÁRIO PERSISTENTE de termos de campo aparentemente inocentes que
a IA traduziu (ex.: "futebol" → "execução do plano de fuga"), com loop de
validação humana. Termos validados voltam como contexto do prompt de extração,
de modo que a detecção fica consistente entre unidades e melhora com o uso.

Fluxo:
  IA propõe (candidato) → analista valida/rejeita → validados viram contexto.

Banco: data/extrato/extrato.db (compartilhado com o motor de extrato).
"""

import os
import re
import sqlite3
import unicodedata
from datetime import datetime, timezone, timedelta
from contextlib import contextmanager

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH  = os.path.join(BASE_DIR, "data", "extrato", "extrato.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

# Palavras que, no significado traduzido, indicam ameaça grave → nível ALTO
_CRITICAS = [
    "fuga", "fugir", "tunel", "motim", "rebeliao", "arma", "armamento", "refem",
    "resgate", "drone", "granada", "explosivo", "sequestro", "morte", "execucao",
    "matar", "assassinato", "homicidio", "atentado",
]


@contextmanager
def _conn():
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA busy_timeout = 8000")
    try:
        yield con
        con.commit()
    finally:
        con.close()


def init_db():
    with _conn() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS lexico (
                termo            TEXT PRIMARY KEY,   -- normalizado (chave)
                termo_original   TEXT NOT NULL,
                significado      TEXT,
                status           TEXT NOT NULL DEFAULT 'candidato',  -- candidato|validado|rejeitado
                nivel            TEXT NOT NULL DEFAULT 'MÉDIO',       -- ALTO|MÉDIO|BAIXO
                confianca        REAL NOT NULL DEFAULT 0.4,
                ocorrencias      INTEGER NOT NULL DEFAULT 0,
                validado_por     TEXT,
                primeira_deteccao TEXT,
                ultima_deteccao   TEXT
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS lexico_ocorrencias (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                termo       TEXT NOT NULL,
                extrato_id  TEXT,
                unidade     TEXT,
                evidencia   TEXT,
                criado_em   TEXT NOT NULL
            )
        """)
        con.execute("CREATE INDEX IF NOT EXISTS idx_lexoc_termo ON lexico_ocorrencias(termo)")


def _agora() -> str:
    return datetime.now(timezone.utc).isoformat()


def _norm(txt: str) -> str:
    if not txt:
        return ""
    t = unicodedata.normalize("NFKD", str(txt))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t.strip().lower())


def _nivel_por_significado(significado: str) -> str:
    s = _norm(significado)
    if any(c in s for c in _CRITICAS):
        return "ALTO"
    return "MÉDIO"


def registrar_candidatos(jargoes: list[dict], extrato_id: str = "",
                         unidade: str = "") -> int:
    """Registra/atualiza os jargões propostos pela IA num extrato."""
    if not jargoes:
        return 0
    n = 0
    with _conn() as con:
        for j in jargoes:
            termo_orig = (j.get("termo") or "").strip()
            termo = _norm(termo_orig)
            if not termo:
                continue
            significado = (j.get("significado_provavel") or "").strip()
            ev = (j.get("evidencia") or "").strip()
            row = con.execute("SELECT * FROM lexico WHERE termo = ?", (termo,)).fetchone()
            if row:
                # Não rebaixa termo validado; só atualiza contagem/última detecção.
                novo_signif = row["significado"] or significado
                nivel = row["nivel"] if row["status"] == "validado" else _nivel_por_significado(novo_signif)
                con.execute(
                    """UPDATE lexico SET ocorrencias = ocorrencias + 1,
                       ultima_deteccao = ?, significado = ?, nivel = ? WHERE termo = ?""",
                    (_agora(), novo_signif, nivel, termo),
                )
            else:
                con.execute(
                    """INSERT INTO lexico (termo, termo_original, significado, status,
                            nivel, confianca, ocorrencias, primeira_deteccao, ultima_deteccao)
                       VALUES (?,?,?,?,?,?,?,?,?)""",
                    (termo, termo_orig, significado, "candidato",
                     _nivel_por_significado(significado), 0.4, 1, _agora(), _agora()),
                )
                n += 1
            con.execute(
                """INSERT INTO lexico_ocorrencias (termo, extrato_id, unidade, evidencia, criado_em)
                   VALUES (?,?,?,?,?)""",
                (termo, extrato_id, unidade, ev, _agora()),
            )
    return n


def _unidades_e_recencia(con, termo: str) -> tuple[list, int]:
    rows = con.execute(
        "SELECT unidade, criado_em FROM lexico_ocorrencias WHERE termo = ?", (termo,)
    ).fetchall()
    unidades = sorted({r["unidade"] for r in rows if r["unidade"]})
    corte = datetime.now(timezone.utc) - timedelta(days=7)
    rec = 0
    for r in rows:
        try:
            if datetime.fromisoformat(r["criado_em"]) >= corte:
                rec += 1
        except Exception:
            pass
    return unidades, rec


def listar(status: str = None) -> list[dict]:
    """Para o painel Dicionário de Sinais Fracos."""
    with _conn() as con:
        if status:
            rows = con.execute(
                "SELECT * FROM lexico WHERE status = ? ORDER BY ocorrencias DESC", (status,)
            ).fetchall()
        else:
            rows = con.execute("SELECT * FROM lexico ORDER BY ocorrencias DESC").fetchall()
        out = []
        for r in rows:
            unidades, rec7 = _unidades_e_recencia(con, r["termo"])
            d = dict(r)
            d["unidades"] = unidades
            d["ocorrencias_7d"] = rec7
            out.append(d)
    return out


def validar(termo: str, significado: str = None, nivel: str = None,
            usuario: str = "analista") -> dict | None:
    chave = _norm(termo)
    with _conn() as con:
        row = con.execute("SELECT * FROM lexico WHERE termo = ?", (chave,)).fetchone()
        if not row:
            return None
        novo_signif = significado if significado is not None else row["significado"]
        novo_nivel = nivel or row["nivel"] or _nivel_por_significado(novo_signif)
        con.execute(
            """UPDATE lexico SET status='validado', significado=?, nivel=?,
               confianca=0.9, validado_por=? WHERE termo=?""",
            (novo_signif, novo_nivel, usuario, chave),
        )
        return dict(con.execute("SELECT * FROM lexico WHERE termo = ?", (chave,)).fetchone())


def rejeitar(termo: str, usuario: str = "analista") -> bool:
    chave = _norm(termo)
    with _conn() as con:
        cur = con.execute(
            "UPDATE lexico SET status='rejeitado', validado_por=? WHERE termo=?",
            (usuario, chave),
        )
        return cur.rowcount > 0


def contexto_para_prompt(limite: int = 40) -> str:
    """Termos validados, formatados para alimentar o prompt de extração."""
    with _conn() as con:
        rows = con.execute(
            """SELECT termo_original, significado FROM lexico
               WHERE status='validado' AND significado IS NOT NULL AND significado != ''
               ORDER BY ocorrencias DESC LIMIT ?""",
            (limite,),
        ).fetchall()
    if not rows:
        return ""
    return "\n".join(f"- «{r['termo_original']}» ≈ {r['significado']}" for r in rows)


init_db()
