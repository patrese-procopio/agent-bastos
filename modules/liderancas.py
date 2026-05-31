# -*- coding: utf-8 -*-
"""
liderancas.py — Módulo de Lideranças de Pavilhões
Agent Bastos | AIPEN

Hierarquia: Unidade → Pavilhão → Ala → Cela → Líder
Histórico:  cada líder tem competencia (AAAA-MM) + criado_em (timestamp automático)

Regra de celas:
  - Alas "Berçário" e "Triagem" → Celas 01 a 05
  - Todas as demais              → Celas 01 a 15
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

# ── Alas com limite reduzido de celas ─────────────────────────────────────────
_ALAS_REDUZIDAS = {"Berçário", "Triagem"}

def _gerar_celas(ala: str) -> list[str]:
    limite = 5 if ala in _ALAS_REDUZIDAS else 15
    return [f"Cela {i:02d}" for i in range(1, limite + 1)]

# ── Estrutura física ──────────────────────────────────────────────────────────
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
            **{f"Galeria {i:02d}": ["Ala única"] for i in range(1, 12)},
        },
    },
    "COMPAJ": {
        "label": "COMPAJ",
        "pavilhoes": {
            **{f"Pavilhão {i:02d}": ["Ala 01", "Ala 02"] for i in range(1, 6)},
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
    resultado = {}
    for unidade, meta in ESTRUTURA.items():
        resultado[unidade] = {"label": meta["label"], "pavilhoes": {}}
        for pavilhao, alas in meta["pavilhoes"].items():
            resultado[unidade]["pavilhoes"][pavilhao] = {
                ala: _gerar_celas(ala) for ala in alas
            }
    return resultado

# ── Cargos por facção ──────────────────────────────────────────────────────────
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
    "PCC":            ["Jet", "Disciplina", "Liderança dos Gravatas", "Liderança", "Jet Geral", "Disciplina Geral"],
    "RDA":            ["Representante", "Representante Geral"],
    "NEUTROS":        ["Conselheiro", "Presidente", "Vice-presidente", "Porta voz"],
    "CRIMES SEXUAIS": ["Liderança", "Porta voz", "Subordinado"],
    "JACK/TDA":       ["Representante"],
    "AMARELINHOS":    ["Representante"],
    "ISOLAMENTO":     ["Interno"],
    "MED. SEGURANÇA": ["Interno"],
}

FACCOES = list(CARGOS_POR_FACCAO.keys())

# ── Banco de dados ─────────────────────────────────────────────────────────────

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
    """Cria tabela e índices. Idempotente — aplica migrações seguras."""
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
                competencia   TEXT NOT NULL DEFAULT '',
                criado_em     TEXT NOT NULL,
                atualizado_em TEXT NOT NULL
            )
        """)

        # Migrações seguras para versões anteriores do banco
        cols = [r[1] for r in con.execute("PRAGMA table_info(liderancas)").fetchall()]
        if "cela" not in cols:
            con.execute("ALTER TABLE liderancas ADD COLUMN cela TEXT NOT NULL DEFAULT ''")
        if "competencia" not in cols:
            # Preenche competência existente com o mês de criação do registro
            con.execute("ALTER TABLE liderancas ADD COLUMN competencia TEXT NOT NULL DEFAULT ''")
            con.execute("""
                UPDATE liderancas
                SET competencia = substr(criado_em, 1, 7)
                WHERE competencia = ''
            """)

        con.execute("CREATE INDEX IF NOT EXISTS idx_unidade     ON liderancas(unidade)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_competencia ON liderancas(competencia)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_loc         ON liderancas(unidade, pavilhao, ala, cela)")


# ── Helpers ────────────────────────────────────────────────────────────────────

def _competencia_atual() -> str:
    """Retorna competência do mês atual no formato AAAA-MM."""
    return datetime.now().strftime("%Y-%m")


def listar_competencias() -> list[str]:
    """Retorna todas as competências distintas ordenadas do mais recente."""
    with _conn() as con:
        rows = con.execute(
            "SELECT DISTINCT competencia FROM liderancas ORDER BY competencia DESC"
        ).fetchall()
    return [r[0] for r in rows if r[0]]


def listar_competencias_unidade(unidade: str) -> list[str]:
    """Competências disponíveis para uma unidade específica."""
    with _conn() as con:
        rows = con.execute(
            "SELECT DISTINCT competencia FROM liderancas WHERE unidade = ? ORDER BY competencia DESC",
            (unidade,),
        ).fetchall()
    return [r[0] for r in rows if r[0]]


# ── CRUD ───────────────────────────────────────────────────────────────────────

def criar_lider(dados: dict) -> dict:
    agora    = datetime.now(timezone.utc).isoformat()
    lider_id = str(uuid.uuid4())
    comp     = dados.get("competencia") or _competencia_atual()
    with _conn() as con:
        con.execute("""
            INSERT INTO liderancas
              (id, unidade, pavilhao, ala, cela, faccao, cargo,
               nome, vulgo, foto_ext, observacao, competencia, criado_em, atualizado_em)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            lider_id,
            dados["unidade"], dados["pavilhao"], dados["ala"], dados.get("cela", ""),
            dados["faccao"],  dados["cargo"],
            dados.get("nome"), dados.get("vulgo"),
            dados.get("foto_ext"),
            dados.get("observacao"),
            comp, agora, agora,
        ))
    return buscar_lider(lider_id)


def atualizar_lider(lider_id: str, dados: dict) -> dict:
    agora  = datetime.now(timezone.utc).isoformat()
    campos = {k: v for k, v in dados.items() if k in (
        "unidade", "pavilhao", "ala", "cela",
        "faccao", "cargo", "nome", "vulgo", "foto_ext", "observacao", "competencia",
    )}
    campos["atualizado_em"] = agora
    sets    = ", ".join(f"{k} = ?" for k in campos)
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


def listar_por_unidade(unidade: str, competencia: str | None = None) -> dict:
    """
    Retorna { pavilhao: { ala: { cela: [lideres] } } }
    Filtrado por competência se fornecida, senão mostra a mais recente.
    """
    # Determina competência alvo
    if not competencia:
        comps = listar_competencias_unidade(unidade)
        competencia = comps[0] if comps else _competencia_atual()

    with _conn() as con:
        rows = con.execute(
            """SELECT * FROM liderancas
               WHERE unidade = ? AND competencia = ?
               ORDER BY pavilhao, ala, cela, cargo""",
            (unidade, competencia),
        ).fetchall()

    estrutura_unidade = ESTRUTURA.get(unidade, {}).get("pavilhoes", {})
    resultado: dict = {}

    for pavilhao, alas in estrutura_unidade.items():
        resultado[pavilhao] = {}
        for ala in alas:
            resultado[pavilhao][ala] = {cela: [] for cela in _gerar_celas(ala)}

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


def listar_todas_unidades(competencia: str | None = None) -> dict:
    """
    Retorna dados de TODAS as unidades para exportação PDF geral.
    { unidade_label: { pavilhao: { ala: [lideres] } } }
    """
    if not competencia:
        comps = listar_competencias()
        competencia = comps[0] if comps else _competencia_atual()

    resultado = {}
    for key, meta in ESTRUTURA.items():
        pavilhoes = listar_por_unidade(key, competencia)
        resultado[meta["label"]] = pavilhoes

    return resultado


def _serializar(row: dict) -> dict:
    foto_url = f"/api/liderancas/foto/{row['id']}" if row.get("foto_ext") else None
    return {**row, "foto_url": foto_url}


# ── Fotos ──────────────────────────────────────────────────────────────────────

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

# ── Facções de rua ────────────────────────────────────────────────────────────
# Facções fixas predefinidas. Novas podem ser criadas via API.
FACCOES_RUA_FIXAS = [
    "CV/AM",   # Comando Vermelho
    "PCC/AM",  # Primeiro Comando da Capital
    "RDA",     # Revolucionários do Amazonas
    "TDA",     # Taradinhos do Amazonas
    "Neutros",
    "CDN",     # Cartel do Norte
]

CARGOS_RUA = ["Presidente", "Vice-Presidente"]

STATUS_LIDER_RUA = ["Ativo", "Preso", "Foragido", "Morto"]


def init_db_faccoes():
    """Cria tabelas de facções e líderes de rua. Idempotente."""
    with _conn() as con:
        # Tabela de facções — permite adicionar/remover grupos dinamicamente
        con.execute("""
            CREATE TABLE IF NOT EXISTS faccoes_rua (
                id         TEXT PRIMARY KEY,
                nome       TEXT NOT NULL UNIQUE,
                sigla      TEXT NOT NULL,
                ativa      INTEGER NOT NULL DEFAULT 1,
                criado_em  TEXT NOT NULL
            )
        """)

        # Tabela de líderes de rua
        con.execute("""
            CREATE TABLE IF NOT EXISTS lideres_rua (
                id            TEXT PRIMARY KEY,
                faccao_id     TEXT NOT NULL,
                cargo         TEXT NOT NULL,
                nome          TEXT,
                vulgo         TEXT,
                status        TEXT NOT NULL DEFAULT 'Ativo',
                observacao    TEXT,
                foto_ext      TEXT,
                criado_em     TEXT NOT NULL,
                atualizado_em TEXT NOT NULL,
                FOREIGN KEY (faccao_id) REFERENCES faccoes_rua(id)
            )
        """)

        con.execute("CREATE INDEX IF NOT EXISTS idx_faccao_id ON lideres_rua(faccao_id)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_status_rua ON lideres_rua(status)")

        # Popula facções fixas se ainda não existem
        agora = datetime.now(timezone.utc).isoformat()
        fixas = [
            ("CV/AM",  "CV/AM"),
            ("PCC/AM", "PCC/AM"),
            ("RDA",    "RDA"),
            ("TDA",    "TDA"),
            ("Neutros","Neutros"),
            ("CDN",    "CDN"),
        ]
        for nome, sigla in fixas:
            existe = con.execute(
                "SELECT id FROM faccoes_rua WHERE nome = ?", (nome,)
            ).fetchone()
            if not existe:
                con.execute(
                    "INSERT INTO faccoes_rua (id, nome, sigla, ativa, criado_em) VALUES (?,?,?,1,?)",
                    (str(uuid.uuid4()), nome, sigla, agora),
                )


# ── CRUD Facções ──────────────────────────────────────────────────────────────

def listar_faccoes_rua(apenas_ativas: bool = True) -> list[dict]:
    filtro = "WHERE ativa = 1" if apenas_ativas else ""
    with _conn() as con:
        rows = con.execute(
            f"SELECT * FROM faccoes_rua {filtro} ORDER BY nome"
        ).fetchall()
    return [dict(r) for r in rows]


def criar_faccao_rua(nome: str, sigla: str) -> dict:
    """Cria nova facção customizada. Levanta ValueError se já existir."""
    with _conn() as con:
        existe = con.execute(
            "SELECT id FROM faccoes_rua WHERE nome = ?", (nome,)
        ).fetchone()
        if existe:
            raise ValueError(f"Facção '{nome}' já existe.")
        fid   = str(uuid.uuid4())
        agora = datetime.now(timezone.utc).isoformat()
        con.execute(
            "INSERT INTO faccoes_rua (id, nome, sigla, ativa, criado_em) VALUES (?,?,?,1,?)",
            (fid, nome, sigla, agora),
        )
    return buscar_faccao_rua(fid)


def buscar_faccao_rua(faccao_id: str) -> dict | None:
    with _conn() as con:
        row = con.execute(
            "SELECT * FROM faccoes_rua WHERE id = ?", (faccao_id,)
        ).fetchone()
    return dict(row) if row else None


def deletar_faccao_rua(faccao_id: str) -> bool:
    """
    Deleta facção e todos os líderes vinculados.
    Facções fixas também podem ser deletadas conforme regra do negócio
    (facções podem acabar, como já aconteceu no AM).
    """
    faccao = buscar_faccao_rua(faccao_id)
    if not faccao:
        return False
    # Remove fotos dos líderes vinculados
    with _conn() as con:
        lideres = con.execute(
            "SELECT id, foto_ext FROM lideres_rua WHERE faccao_id = ?", (faccao_id,)
        ).fetchall()
        for lider in lideres:
            if lider["foto_ext"]:
                path = os.path.join(FOTOS_DIR, f"rua_{lider['id']}{lider['foto_ext']}")
                if os.path.exists(path):
                    os.remove(path)
        con.execute("DELETE FROM lideres_rua WHERE faccao_id = ?", (faccao_id,))
        con.execute("DELETE FROM faccoes_rua WHERE id = ?", (faccao_id,))
    return True


# ── CRUD Líderes de Rua ───────────────────────────────────────────────────────

def criar_lider_rua(dados: dict) -> dict:
    agora  = datetime.now(timezone.utc).isoformat()
    lid_id = str(uuid.uuid4())
    with _conn() as con:
        con.execute("""
            INSERT INTO lideres_rua
              (id, faccao_id, cargo, nome, vulgo, status, observacao, foto_ext,
               criado_em, atualizado_em)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        """, (
            lid_id,
            dados["faccao_id"],
            dados["cargo"],
            dados.get("nome"),
            dados.get("vulgo"),
            dados.get("status", "Ativo"),
            dados.get("observacao"),
            dados.get("foto_ext"),
            agora, agora,
        ))
    return buscar_lider_rua(lid_id)


def atualizar_lider_rua(lider_id: str, dados: dict) -> dict:
    agora  = datetime.now(timezone.utc).isoformat()
    campos = {k: v for k, v in dados.items() if k in (
        "faccao_id", "cargo", "nome", "vulgo",
        "status", "observacao", "foto_ext",
    )}
    campos["atualizado_em"] = agora
    sets   = ", ".join(f"{k} = ?" for k in campos)
    valores = list(campos.values()) + [lider_id]
    with _conn() as con:
        con.execute(f"UPDATE lideres_rua SET {sets} WHERE id = ?", valores)
    return buscar_lider_rua(lider_id)


def deletar_lider_rua(lider_id: str) -> bool:
    lider = buscar_lider_rua(lider_id)
    if not lider:
        return False
    if lider.get("foto_ext"):
        path = os.path.join(FOTOS_DIR, f"rua_{lider_id}{lider['foto_ext']}")
        if os.path.exists(path):
            os.remove(path)
    with _conn() as con:
        con.execute("DELETE FROM lideres_rua WHERE id = ?", (lider_id,))
    return True


def buscar_lider_rua(lider_id: str) -> dict | None:
    with _conn() as con:
        row = con.execute(
            """SELECT l.*, f.nome as faccao_nome, f.sigla as faccao_sigla
               FROM lideres_rua l
               JOIN faccoes_rua f ON f.id = l.faccao_id
               WHERE l.id = ?""",
            (lider_id,),
        ).fetchone()
    return dict(row) if row else None


def listar_lideres_por_faccao(faccao_id: str | None = None) -> list[dict]:
    """
    Retorna líderes agrupados por facção.
    Se faccao_id fornecido, filtra por ela.
    """
    filtro = "WHERE l.faccao_id = ?" if faccao_id else ""
    params = (faccao_id,) if faccao_id else ()
    with _conn() as con:
        rows = con.execute(
            f"""SELECT l.*, f.nome as faccao_nome, f.sigla as faccao_sigla
                FROM lideres_rua l
                JOIN faccoes_rua f ON f.id = l.faccao_id
                {filtro}
                ORDER BY f.nome, l.cargo, l.vulgo""",
            params,
        ).fetchall()
    return [_serializar_rua(dict(r)) for r in rows]


def listar_lideres_agrupados() -> list[dict]:
    """
    Retorna lista de facções com seus líderes embutidos.
    Formato ideal para o frontend renderizar a aba Líderes Gerais.
    """
    faccoes = listar_faccoes_rua(apenas_ativas=False)
    resultado = []
    for f in faccoes:
        lideres = listar_lideres_por_faccao(f["id"])
        resultado.append({
            "id":       f["id"],
            "nome":     f["nome"],
            "sigla":    f["sigla"],
            "ativa":    bool(f["ativa"]),
            "lideres":  lideres,
        })
    return resultado


def _serializar_rua(row: dict) -> dict:
    foto_url = f"/api/liderancas/rua/foto/{row['id']}" if row.get("foto_ext") else None
    return {**row, "foto_url": foto_url}


def salvar_foto_rua(lider_id: str, conteudo: bytes, ext: str) -> str:
    ext = ext.lower() if ext.startswith(".") else f".{ext.lower()}"
    for old in (".jpg", ".jpeg", ".png", ".webp"):
        old_path = os.path.join(FOTOS_DIR, f"rua_{lider_id}{old}")
        if os.path.exists(old_path):
            os.remove(old_path)
    path = os.path.join(FOTOS_DIR, f"rua_{lider_id}{ext}")
    with open(path, "wb") as f:
        f.write(conteudo)
    return ext


def carregar_foto_rua(lider_id: str, foto_ext: str) -> bytes | None:
    path = os.path.join(FOTOS_DIR, f"rua_{lider_id}{foto_ext}")
    if not os.path.exists(path):
        return None
    with open(path, "rb") as f:
        return f.read()
    
# Inicializa banco ao importar
init_db()
