# -*- coding: utf-8 -*-
"""
liderancas.py — Módulo de Lideranças de Pavilhões
Agent Bastos | AIPEN

Hierarquia: Unidade → Pavilhão → Ala → Cela → Líder

Regra de celas:
  - Alas "Berçário" e "Triagem" → Celas 01 a 05
  - Todas as demais              → Celas 01 a 15

Armazena fotos em data/liderancas/fotos/ como arquivos binários (UUID + ext).
"""

import os
import sqlite3
import uuid
from datetime import datetime, timezone
from contextlib import contextmanager

BASE_DIR  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH   = os.path.join(BASE_DIR, "data", "liderancas", "liderancas.db")
FOTOS_DIR = os.path.join(BASE_DIR, "data", "liderancas", "fotos")

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
os.makedirs(FOTOS_DIR, exist_ok=True)

# ── Alas com limite reduzido de celas ────────────────────────────────────────
_ALAS_REDUZIDAS = {"Berçário", "Triagem"}

def _gerar_celas(ala: str) -> list[str]:
    """Retorna lista de celas de acordo com a regra da ala."""
    limite = 5 if ala in _ALAS_REDUZIDAS else 15
    return [f"Cela {i:02d}" for i in range(1, limite + 1)]

# ── Estrutura física das unidades ─────────────────────────────────────────────
# Formato: { unidade: { label, pavilhoes: { pavilhao: [alas] } } }
# As celas são geradas dinamicamente via _gerar_celas(ala).
ESTRUTURA = {
    "CDPM1": {
        "label": "CDPM I",
        "pavilhoes": {
            "Pavilhão 01": ["Ala única"],
            "Pavilhão 02": ["Ala única"],
            "Pavilhão 03": ["Ala inferior", "Ala superior"],
            "Pavilhão 04": ["Ala inferior", "Ala superior"],
            "Pavilhão 05": ["Ala inferior", "Ala superior"],
            "Pavilhão 06": ["Ala inferior", "Ala superior"],
        },
    },
    "CDPM2": {
        "label": "CDPM II",
        "pavilhoes": {
            "Pavilhão 01": ["Ala 01", "Ala 02"],
            "Pavilhão 02": ["Ala única"],
            "Pavilhão 04": ["Ala inferior", "Ala superior"],
            "Pavilhão 06": ["Ala inferior", "Ala superior"],
            "Pavilhão 07": ["Ala única"],
        },
    },
    "IPAT": {
        "label": "IPAT",
        "pavilhoes": {
            "Pavilhão A": ["Ala inferior", "Ala superior"],
            "Pavilhão B": ["Ala inferior", "Ala superior"],
            "Pavilhão C": ["Ala inferior", "Ala superior"],
            "Pavilhão D": ["Ala única"],
        },
    },
    "UPP": {
        "label": "UPP",
        "pavilhoes": {
            "Galeria 01":  ["Ala única"],
            "Galeria 02":  ["Ala única"],
            "Galeria 03":  ["Ala única"],
            "Galeria 04":  ["Ala única"],
            "Galeria 05":  ["Ala única"],
            "Galeria 06":  ["Ala única"],
            "Galeria 07":  ["Ala única"],
            "Galeria 08":  ["Ala única"],
            "Galeria 09":  ["Ala única"],
            "Galeria 10":  ["Ala única"],
            "Galeria 11":  ["Ala única"],
        },
    },
    "COMPAJ": {
        "label": "COMPAJ",
        "pavilhoes": {
            "Pavilhão 01": ["Ala 01", "Ala 02"],
            "Pavilhão 02": ["Ala 01", "Ala 02"],
            "Pavilhão 03": ["Ala 01", "Ala 02"],
            "Pavilhão 04": ["Ala 01", "Ala 02"],
            "Pavilhão 05": ["Ala 01", "Ala 02"],
        },
    },
    "CDF": {
        "label": "CDF",
        "pavilhoes": {
            "Pavilhão 01": ["Ala A", "Ala B"],
            "Pavilhão 02": ["Ala A", "Ala B"],
            "Pavilhão 03": ["Triagem", "Temporárias", "Ala única"],
            "Berçário":    ["Ala única"],
        },
    },
}

def estrutura_com_celas() -> dict:
    """
    Retorna ESTRUTURA expandida com a lista de celas por ala.
    Usado pelo endpoint /liderancas/estrutura para o frontend
    montar os dropdowns em cascata sem nenhuma lógica extra.
    """
    resultado = {}
    for unidade, meta in ESTRUTURA.items():
        resultado[unidade] = {
            "label": meta["label"],
            "pavilhoes": {},
        }
        for pavilhao, alas in meta["pavilhoes"].items():
            resultado[unidade]["pavilhoes"][pavilhao] = {
                ala: _gerar_celas(ala) for ala in alas
            }
    return resultado

# ── Cargos por facção ─────────────────────────────────────────────────────────
CARGOS_POR_FACCAO = {
    "CV/AM": [
        "Presidente", "Vice-presidente", "Porta-voz", "Tesoureiro",
        "Disciplina", "Progresso", "Sintonia", "Cadastro", "Prazo",
        "Arquivo", "Paiol", "Missão", "Disciplina apoio", "Paiol apoio",
        "Arquivo apoio", "Prazo apoio", "Sintonia apoio", "Missão apoio",
        "Esporte apoio", "Progresso apoio", "Tesoureiro apoio", "Apoio",
        "Biqueira", "Biqueira apoio", "Conselheiro", "Conselheiro apoio",
        "Representante",
    ],
    "PCC": [
        "Jet", "Disciplina", "Liderança dos Gravatas", "Liderança",
        "Jet Geral", "Disciplina Geral",
    ],
    "RDA": [
        "Representante", "Representante Geral",
    ],
    "NEUTROS": [
        "Conselheiro", "Presidente", "Vice-presidente", "Porta voz",
    ],
    "CRIMES SEXUAIS": [
        "Liderança", "Porta voz", "Subordinado",
    ],
    "JACK/TDA": [
        "Representante",
    ],
    "AMARELINHOS": [
        "Representante",
    ],
    "ISOLAMENTO": [
        "Interno",
    ],
    "MED. SEGURANÇA": [
        "Interno",
    ],
}

FACCOES = list(CARGOS_POR_FACCAO.keys())

# ── Banco de dados ────────────────────────────────────────────────────────────

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
    """Cria tabela e índices. Idempotente — seguro rodar mais de uma vez."""
    with _conn() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS liderancas (
                id            TEXT PRIMARY KEY,
                unidade       TEXT NOT NULL,
                pavilhao      TEXT NOT NULL,
                ala           TEXT NOT NULL,
                cela          TEXT NOT NULL DEFAULT '',
                faccao        TEXT NOT NULL,
                cargo         TEXT NOT NULL,
                nome          TEXT,
                vulgo         TEXT,
                foto_ext      TEXT,
                observacao    TEXT,
                criado_em     TEXT NOT NULL,
                atualizado_em TEXT NOT NULL
            )
        """)
        # Migração segura: adiciona coluna cela se vier de versão anterior
        cols = [r[1] for r in con.execute("PRAGMA table_info(liderancas)").fetchall()]
        if "cela" not in cols:
            con.execute("ALTER TABLE liderancas ADD COLUMN cela TEXT NOT NULL DEFAULT ''")

        con.execute("CREATE INDEX IF NOT EXISTS idx_unidade  ON liderancas(unidade)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_localizacao ON liderancas(unidade, pavilhao, ala, cela)")


# ── CRUD ──────────────────────────────────────────────────────────────────────

def criar_lider(dados: dict) -> dict:
    agora    = datetime.now(timezone.utc).isoformat()
    lider_id = str(uuid.uuid4())
    with _conn() as con:
        con.execute("""
            INSERT INTO liderancas
              (id, unidade, pavilhao, ala, cela, faccao, cargo,
               nome, vulgo, foto_ext, observacao, criado_em, atualizado_em)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            lider_id,
            dados["unidade"], dados["pavilhao"], dados["ala"], dados.get("cela", ""),
            dados["faccao"],  dados["cargo"],
            dados.get("nome"), dados.get("vulgo"),
            dados.get("foto_ext"),
            dados.get("observacao"),
            agora, agora,
        ))
    return buscar_lider(lider_id)


def atualizar_lider(lider_id: str, dados: dict) -> dict:
    agora  = datetime.now(timezone.utc).isoformat()
    campos = {k: v for k, v in dados.items() if k in (
        "unidade", "pavilhao", "ala", "cela",
        "faccao", "cargo", "nome", "vulgo", "foto_ext", "observacao",
    )}
    campos["atualizado_em"] = agora
    sets   = ", ".join(f"{k} = ?" for k in campos)
    valores = list(campos.values()) + [lider_id]
    with _conn() as con:
        con.execute(f"UPDATE liderancas SET {sets} WHERE id = ?", valores)
    return buscar_lider(lider_id)


def deletar_lider(lider_id: str) -> bool:
    lider = buscar_lider(lider_id)
    if not lider:
        return False
    if lider.get("foto_ext"):
        path = os.path.join(FOTOS_DIR, f"{lider_id}{lider['foto_ext']}")
        if os.path.exists(path):
            os.remove(path)
    with _conn() as con:
        con.execute("DELETE FROM liderancas WHERE id = ?", (lider_id,))
    return True


def buscar_lider(lider_id: str) -> dict | None:
    with _conn() as con:
        row = con.execute(
            "SELECT * FROM liderancas WHERE id = ?", (lider_id,)
        ).fetchone()
    return dict(row) if row else None


def listar_por_unidade(unidade: str) -> dict:
    """
    Retorna estrutura aninhada pronta para o frontend:
    { pavilhao: { ala: { cela: [lideres] } } }
    Inclui todas as combinações da estrutura física, mesmo vazias.
    """
    with _conn() as con:
        rows = con.execute(
            """SELECT * FROM liderancas
               WHERE unidade = ?
               ORDER BY pavilhao, ala, cela, cargo""",
            (unidade,),
        ).fetchall()

    estrutura_unidade = ESTRUTURA.get(unidade, {}).get("pavilhoes", {})
    resultado: dict = {}

    # Monta esqueleto completo com celas vazias
    for pavilhao, alas in estrutura_unidade.items():
        resultado[pavilhao] = {}
        for ala in alas:
            resultado[pavilhao][ala] = {
                cela: [] for cela in _gerar_celas(ala)
            }

    # Preenche com registros do banco
    for row in rows:
        r    = dict(row)
        pav  = r["pavilhao"]
        ala  = r["ala"]
        cela = r["cela"] or "Cela 01"

        if pav not in resultado:
            resultado[pav] = {}
        if ala not in resultado[pav]:
            resultado[pav][ala] = {}
        if cela not in resultado[pav][ala]:
            resultado[pav][ala][cela] = []

        resultado[pav][ala][cela].append(_serializar(r))

    return resultado


def _serializar(row: dict) -> dict:
    foto_url = f"/liderancas/foto/{row['id']}" if row.get("foto_ext") else None
    return {**row, "foto_url": foto_url}


# ── Fotos ─────────────────────────────────────────────────────────────────────

def salvar_foto(lider_id: str, conteudo: bytes, ext: str) -> str:
    ext = ext.lower() if ext.startswith(".") else f".{ext.lower()}"
    for old in (".jpg", ".jpeg", ".png", ".webp"):
        old_path = os.path.join(FOTOS_DIR, f"{lider_id}{old}")
        if os.path.exists(old_path):
            os.remove(old_path)
    path = os.path.join(FOTOS_DIR, f"{lider_id}{ext}")
    with open(path, "wb") as f:
        f.write(conteudo)
    return ext


def carregar_foto(lider_id: str, foto_ext: str) -> bytes | None:
    path = os.path.join(FOTOS_DIR, f"{lider_id}{foto_ext}")
    if not os.path.exists(path):
        return None
    with open(path, "rb") as f:
        return f.read()


# Inicializa banco ao importar o módulo
init_db()
