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

from config.paths import DB_LIDERANCAS, DATA_DIR
DB_PATH   = str(DB_LIDERANCAS)
FOTOS_DIR = str(DATA_DIR / "liderancas" / "fotos")

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

        # Cópia de mês: marca de origem (some ao editar) e lote da cópia (para desfazer)
        if "copiado_de" not in cols:
            con.execute("ALTER TABLE liderancas ADD COLUMN copiado_de TEXT")
        if "lote_copia" not in cols:
            con.execute("ALTER TABLE liderancas ADD COLUMN lote_copia TEXT")
        # Tempo na liderança: identidade fixa da pessoa + "passagens" (início/fim)
        if "pessoa_id" not in cols:
            con.execute("ALTER TABLE liderancas ADD COLUMN pessoa_id TEXT")
        con.execute("""
            CREATE TABLE IF NOT EXISTS lideranca_passagens (
                id              TEXT PRIMARY KEY,
                pessoa_id       TEXT NOT NULL,
                inicio          TEXT NOT NULL,          -- AAAA-MM-DD
                fim             TEXT,                   -- NULL = em andamento
                motivo_saida    TEXT,
                inicio_estimado INTEGER NOT NULL DEFAULT 0,
                criado_em       TEXT NOT NULL,
                criado_por      TEXT,
                fechado_por     TEXT,
                atualizado_em   TEXT
            )
        """)
        con.execute("CREATE INDEX IF NOT EXISTS idx_pass_pessoa ON lideranca_passagens(pessoa_id)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_lid_pessoa  ON liderancas(pessoa_id)")
        con.execute("""
            CREATE TABLE IF NOT EXISTS liderancas_nao_iguais (
                a TEXT NOT NULL, b TEXT NOT NULL, PRIMARY KEY (a, b)
            )
        """)
        _backfill_pessoas(con)
        _recalcular_inicios_estimados(con)

        con.execute("""
            CREATE TABLE IF NOT EXISTS liderancas_copias (
                id          TEXT PRIMARY KEY,
                criado_em   TEXT NOT NULL,
                usuario     TEXT,
                origem      TEXT NOT NULL,
                destino     TEXT NOT NULL,
                unidades    TEXT,
                copiados    INTEGER NOT NULL DEFAULT 0,
                ignorados   INTEGER NOT NULL DEFAULT 0,
                desfeito_em TEXT,
                desfeito_por TEXT
            )
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
    pessoa_id = dados.get("pessoa_id") or str(uuid.uuid4())
    informado = (dados.get("inicio_lideranca") or "")[:10]
    hoje_s    = _date.today().isoformat()
    if informado:
        inicio, estimado = informado, 0
    elif _RX_COMP.match(comp) and comp < hoje_s[:7]:
        inicio, estimado = f"{comp}-01", 1       # lançado depois do mês que representa: desde o 1º dia daquele mês
    else:
        inicio, estimado = hoje_s, 0
    _validar_data(inicio, "Data de início")
    with _conn() as con:
        _preparar_passagem_nova(con, pessoa_id, inicio, estimado=estimado)
        con.execute("""
            INSERT INTO liderancas
              (id, unidade, pavilhao, ala, cela, faccao, cargo,
               nome, vulgo, foto_ext, observacao, competencia, criado_em, atualizado_em, pessoa_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            lider_id,
            dados["unidade"], dados["pavilhao"], dados["ala"], dados.get("cela", ""),
            dados["faccao"],  dados["cargo"],
            dados.get("nome"), dados.get("vulgo"),
            dados.get("foto_ext"),
            dados.get("observacao"),
            comp, agora, agora, pessoa_id,
        ))
    return buscar_lider(lider_id)


def atualizar_lider(lider_id: str, dados: dict) -> dict:
    agora  = datetime.now(timezone.utc).isoformat()
    campos = {k: v for k, v in dados.items() if k in (
        "unidade", "pavilhao", "ala", "cela",
        "faccao", "cargo", "nome", "vulgo", "foto_ext", "observacao", "competencia",
    )}
    campos["atualizado_em"] = agora
    campos["copiado_de"] = None      # editado por uma pessoa: deixa de ser "cópia pura"
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

    with _conn() as con:
        tempos = _tempo_map(con, {r["pessoa_id"] for r in rows if r["pessoa_id"]},
                            min(_date.today(), _ult_dia_comp(competencia)))

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
        item = _serializar(r)
        item["tempo"] = tempos.get(r.get("pessoa_id"))
        resultado[pav][ala][cela].append(item)

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

CARGOS_RUA = ["Presidente", "Vice-Presidente", "Pilar", "Conselheiro", "Liderança", "Sintonia", "Representante"]
_CARGO_RUA_LEGADO = "Vice-Presidente, Pilar, Conselheiro, Liderança, Sintonia, Representante"

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

        # Migrações: CV/AM virou "Conselho Permanente CVAM" (mantém id e líderes);
        # cargo legado com vários cargos num só valor vira "Vice-Presidente".
        con.execute(
            "UPDATE faccoes_rua SET nome='Conselho Permanente CVAM', sigla='CVAM' "
            "WHERE nome='CV/AM' AND NOT EXISTS "
            "(SELECT 1 FROM faccoes_rua WHERE nome='Conselho Permanente CVAM')"
        )
        con.execute(
            "UPDATE lideres_rua SET cargo='Vice-Presidente' WHERE cargo=?",
            (_CARGO_RUA_LEGADO,),
        )

        # Popula facções fixas se ainda não existem
        agora = datetime.now(timezone.utc).isoformat()
        fixas = [
            ("Conselho Permanente CVAM", "CVAM"),
            ("Conselho Rotativo CVAM",   "CVAM"),
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
    
# ── Cópia de lideranças entre competências (meses) ───────────────────────────
# Regras:
#  • Quem já existe no destino é PULADO (nunca duplica). "Mesma pessoa" = unidade + facção +
#    vulgo + nome (normalizados). Sem vulgo e sem nome, vale a posição (pavilhão/ala/cela/cargo).
#  • A foto é duplicada junto (arquivo próprio para o novo registro).
#  • Cada cópia vira um LOTE: dá para desfazer. Registros que alguém editou depois ficam.

import re as _re
import shutil as _shutil
import unicodedata as _ud

_RX_COMP = _re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def _nk(s) -> str:
    t = "".join(c for c in _ud.normalize("NFKD", str(s or "")) if not _ud.combining(c))
    return _re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()


def _chave_lider(r: dict) -> tuple:
    v, n = _nk(r.get("vulgo")), _nk(r.get("nome"))
    if v or n:
        return ("p", r["unidade"], _nk(r["faccao"]), v, n)
    return ("l", r["unidade"], r["pavilhao"], r["ala"], r.get("cela") or "", _nk(r["faccao"]), _nk(r["cargo"]))


def _validar_copia(origem: str, destino: str, unidades) -> list[str]:
    if not _RX_COMP.match(origem or "") or not _RX_COMP.match(destino or ""):
        raise ValueError("Mês inválido (use AAAA-MM).")
    if origem == destino:
        raise ValueError("Origem e destino são o mesmo mês.")
    if not unidades or unidades == "todas":
        return list(ESTRUTURA.keys())
    inval = [u for u in unidades if u not in ESTRUTURA]
    if inval:
        raise ValueError(f"Unidade inválida: {', '.join(inval)}")
    return list(unidades)


def _rows_comp(con, comp: str, unidades: list[str]) -> list[dict]:
    q = ",".join("?" * len(unidades))
    return [dict(r) for r in con.execute(
        f"SELECT * FROM liderancas WHERE competencia = ? AND unidade IN ({q}) "
        f"ORDER BY unidade, pavilhao, ala, cela, cargo", (comp, *unidades)).fetchall()]


def previa_copia(origem: str, destino: str, unidades=None) -> dict:
    uns = _validar_copia(origem, destino, unidades)
    with _conn() as con:
        src = _rows_comp(con, origem, uns)
        dst = {_chave_lider(r) for r in _rows_comp(con, destino, uns)}
    por: dict = {}
    for r in src:
        d = por.setdefault(r["unidade"], {"unidade": r["unidade"], "label": ESTRUTURA[r["unidade"]]["label"],
                                          "na_origem": 0, "a_copiar": 0, "ja_existem": 0, "pavilhoes": {}})
        pv = d["pavilhoes"].setdefault(r["pavilhao"], {"a_copiar": 0, "ja_existem": 0})
        d["na_origem"] += 1
        if _chave_lider(r) in dst:
            d["ja_existem"] += 1; pv["ja_existem"] += 1
        else:
            d["a_copiar"] += 1; pv["a_copiar"] += 1
    lista = sorted(por.values(), key=lambda x: x["label"])
    return {"origem": origem, "destino": destino, "unidades": uns,
            "na_origem": sum(d["na_origem"] for d in lista),
            "a_copiar": sum(d["a_copiar"] for d in lista),
            "ja_existem": sum(d["ja_existem"] for d in lista),
            "por_unidade": lista}


def copiar_competencia(origem: str, destino: str, unidades=None, usuario: str = "") -> dict:
    uns = _validar_copia(origem, destino, unidades)
    lote = datetime.now().strftime("%Y%m%d%H%M%S%f")[:17]
    agora = datetime.now(timezone.utc).isoformat()
    copiados = ignorados = fotos = 0
    fotos_criadas: list[str] = []
    try:
        with _conn() as con:
            src = _rows_comp(con, origem, uns)
            dst = {_chave_lider(r) for r in _rows_comp(con, destino, uns)}
            for r in src:
                if _chave_lider(r) in dst:
                    ignorados += 1
                    continue
                novo_id = str(uuid.uuid4())
                foto_ext = None
                if r.get("foto_ext"):
                    origem_p = os.path.join(FOTOS_DIR, f"{r['id']}{r['foto_ext']}")
                    if os.path.exists(origem_p):
                        dest_p = os.path.join(FOTOS_DIR, f"{novo_id}{r['foto_ext']}")
                        _shutil.copy2(origem_p, dest_p)
                        fotos_criadas.append(dest_p)
                        foto_ext = r["foto_ext"]; fotos += 1
                con.execute("""
                    INSERT INTO liderancas
                      (id, unidade, pavilhao, ala, cela, faccao, cargo, nome, vulgo, foto_ext,
                       observacao, competencia, criado_em, atualizado_em, copiado_de, lote_copia, pessoa_id)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, (novo_id, r["unidade"], r["pavilhao"], r["ala"], r.get("cela") or "", r["faccao"], r["cargo"],
                      r.get("nome"), r.get("vulgo"), foto_ext, r.get("observacao"), destino, agora, agora,
                      origem, lote, r.get("pessoa_id")))
                copiados += 1
            if copiados:
                con.execute("""INSERT INTO liderancas_copias
                    (id, criado_em, usuario, origem, destino, unidades, copiados, ignorados)
                    VALUES (?,?,?,?,?,?,?,?)""",
                    (lote, agora, usuario, origem, destino, ",".join(uns), copiados, ignorados))
    except Exception:
        for f in fotos_criadas:          # nada pela metade: desfaz as fotos já duplicadas
            try:
                os.remove(f)
            except OSError:
                pass
        raise
    return {"ok": True, "lote": lote if copiados else None, "copiados": copiados,
            "ignorados": ignorados, "fotos": fotos, "destino": destino}


def listar_copias(limite: int = 8) -> list[dict]:
    with _conn() as con:
        rows = con.execute("""
            SELECT c.*,
              (SELECT COUNT(*) FROM liderancas l WHERE l.lote_copia = c.id AND l.copiado_de IS NOT NULL) AS intactos,
              (SELECT COUNT(*) FROM liderancas l WHERE l.lote_copia = c.id AND l.copiado_de IS NULL)     AS editados
            FROM liderancas_copias c ORDER BY c.criado_em DESC LIMIT ?""", (limite,)).fetchall()
    return [dict(r) for r in rows]


def desfazer_copia(lote_id: str, usuario: str = "") -> dict:
    """Remove só o que a cópia criou e ninguém mexeu depois; o que foi editado permanece."""
    with _conn() as con:
        lote = con.execute("SELECT * FROM liderancas_copias WHERE id = ?", (lote_id,)).fetchone()
        if not lote:
            return {"ok": False, "erro": "lote_nao_encontrado"}
        alvo = con.execute("SELECT id, foto_ext FROM liderancas WHERE lote_copia = ? AND copiado_de IS NOT NULL",
                           (lote_id,)).fetchall()
        mantidos = con.execute("SELECT COUNT(*) FROM liderancas WHERE lote_copia = ? AND copiado_de IS NULL",
                               (lote_id,)).fetchone()[0]
        for r in alvo:
            if r["foto_ext"]:
                p = os.path.join(FOTOS_DIR, f"{r['id']}{r['foto_ext']}")
                if os.path.exists(p):
                    os.remove(p)
        con.execute("DELETE FROM liderancas WHERE lote_copia = ? AND copiado_de IS NOT NULL", (lote_id,))
        con.execute("UPDATE liderancas_copias SET desfeito_em = ?, desfeito_por = ? WHERE id = ?",
                    (datetime.now(timezone.utc).isoformat(), usuario, lote_id))
    return {"ok": True, "removidos": len(alvo), "mantidos_por_edicao": mantidos}


# ══ Tempo na liderança (passagens) ═══════════════════════════════════════════
# Cada PESSOA tem identidade fixa (pessoa_id) que a cópia de mês herda. O tempo vem das
# "passagens" (início → fim). Copiar um mês não inicia nem encerra nada; a contagem só
# para quando alguém REGISTRA a saída (com data, inclusive retroativa).
# Dias corridos, contando o dia de início e o dia da saída.

import calendar as _cal
from datetime import date as _date
from difflib import SequenceMatcher as _SM

MOTIVOS_SAIDA = {"saiu": "Saiu da liderança", "transferido": "Transferido",
                 "alvara": "Alvará", "falecido": "Falecido"}


def _d(s: str) -> _date:
    return _date.fromisoformat(str(s)[:10])


def _fmt_br(s: str) -> str:
    try:
        return _d(s).strftime("%d/%m/%Y")
    except Exception:
        return str(s)


def _validar_data(s: str, rotulo: str = "Data") -> None:
    try:
        d = _d(s)
    except Exception:
        raise ValueError(f"{rotulo} inválida (use AAAA-MM-DD).")
    if d > _date.today():
        raise ValueError(f"{rotulo} não pode ser no futuro.")


def _ult_dia_comp(comp: str) -> _date:
    try:
        y, m = (int(x) for x in comp.split("-"))
        return _date(y, m, _cal.monthrange(y, m)[1])
    except Exception:
        return _date.today()


def _dias(ini: str, fim, ate: _date | None = None) -> int:
    a = _d(ini)
    b = _d(fim) if fim else (ate or _date.today())
    if ate and b > ate:
        b = ate
    return (b - a).days + 1 if b >= a else 0


def _local_date(iso: str) -> str:
    try:
        return datetime.fromisoformat(iso).astimezone().date().isoformat()
    except Exception:
        return str(iso)[:10]


def _backfill_pessoas(con) -> None:
    """Dá identidade aos registros antigos e abre uma passagem 'desde o registro'.
    Só agrupa sozinho quando o NOME COMPLETO (2+ palavras), a facção e a unidade coincidem;
    o resto vira pessoa própria e pode ser unido depois, por confirmação."""
    rows = con.execute("SELECT id, unidade, faccao, nome FROM liderancas "
                       "WHERE pessoa_id IS NULL OR pessoa_id = '' ORDER BY criado_em").fetchall()
    grupos: dict = {}
    for r in rows:
        nome = _nk(r["nome"])
        chave = ("n", r["unidade"], _nk(r["faccao"]), nome) if len(nome.split()) >= 2 else None
        if chave and chave in grupos:
            pid = grupos[chave]
        else:
            pid = str(uuid.uuid4())
            if chave:
                grupos[chave] = pid
        con.execute("UPDATE liderancas SET pessoa_id = ? WHERE id = ?", (pid, r["id"]))
    sem = con.execute("""SELECT pessoa_id, MIN(criado_em) AS primeiro FROM liderancas
                         WHERE pessoa_id IS NOT NULL AND pessoa_id != ''
                         GROUP BY pessoa_id
                         HAVING pessoa_id NOT IN (SELECT pessoa_id FROM lideranca_passagens)""").fetchall()
    agora = datetime.now(timezone.utc).isoformat()
    for r in sem:
        inicio = _inicio_sugerido(con, r["pessoa_id"]) or _local_date(r["primeiro"])
        con.execute("""INSERT INTO lideranca_passagens
                       (id, pessoa_id, inicio, fim, inicio_estimado, criado_em, criado_por, atualizado_em)
                       VALUES (?,?,?,NULL,1,?,?,?)""",
                    (str(uuid.uuid4()), r["pessoa_id"], inicio, agora, "migracao", agora))


def _inicio_sugerido(con, pessoa_id: str) -> str | None:
    """Início estimado de quem não tem data real: o dia do 1º cadastro, mas nunca DEPOIS do mês
    em que a pessoa já aparece (cadastro feito depois do mês que representa => 1º dia daquele mês).
    Cópias de mês não entram na conta (uma cópia para o passado não muda o início sozinha)."""
    r = con.execute("SELECT MIN(criado_em) AS reg, MIN(competencia) AS comp FROM liderancas "
                    "WHERE pessoa_id = ? AND copiado_de IS NULL", (pessoa_id,)).fetchone()
    if not r or not r["reg"]:
        return None
    reg, comp = _local_date(r["reg"]), r["comp"]
    if comp and _RX_COMP.match(comp) and _d(reg) > _ult_dia_comp(comp):
        return f"{comp}-01"
    return reg


def _recalcular_inicios_estimados(con) -> None:
    """Corrige, só para trás, inícios que ainda são estimativa (nunca mexe em data que alguém informou)."""
    agora = datetime.now(timezone.utc).isoformat()
    for p in con.execute("SELECT id, pessoa_id, inicio FROM lideranca_passagens WHERE inicio_estimado = 1").fetchall():
        novo = _inicio_sugerido(con, p["pessoa_id"])
        if not novo or novo >= p["inicio"]:
            continue
        ant = con.execute("SELECT MAX(fim) FROM lideranca_passagens WHERE pessoa_id = ? AND id != ? AND fim IS NOT NULL AND fim < ?",
                          (p["pessoa_id"], p["id"], p["inicio"])).fetchone()[0]
        if ant and novo <= ant:
            continue
        con.execute("UPDATE lideranca_passagens SET inicio = ?, atualizado_em = ? WHERE id = ?", (novo, agora, p["id"]))


def _preparar_passagem_nova(con, pessoa_id: str, inicio: str, usuario: str = "", estimado: int = 0) -> None:
    """Ao cadastrar um líder: se a pessoa não tem passagem aberta, abre uma (retorno ou 1ª vez)."""
    aberta = con.execute("SELECT 1 FROM lideranca_passagens WHERE pessoa_id = ? AND fim IS NULL", (pessoa_id,)).fetchone()
    if aberta:
        return
    ult = con.execute("SELECT MAX(fim) FROM lideranca_passagens WHERE pessoa_id = ?", (pessoa_id,)).fetchone()[0]
    if ult and _d(inicio) <= _d(ult):
        raise ValueError(f"O início precisa ser depois da última saída ({_fmt_br(ult)}).")
    agora = datetime.now(timezone.utc).isoformat()
    con.execute("""INSERT INTO lideranca_passagens (id, pessoa_id, inicio, fim, inicio_estimado, criado_em, criado_por, atualizado_em)
                   VALUES (?,?,?,NULL,?,?,?,?)""", (str(uuid.uuid4()), pessoa_id, inicio, estimado, agora, usuario, agora))


def _tempo_map(con, pessoa_ids, ate: _date) -> dict:
    ids = [p for p in pessoa_ids if p]
    if not ids:
        return {}
    q = ",".join("?" * len(ids))
    rows = con.execute(f"SELECT * FROM lideranca_passagens WHERE pessoa_id IN ({q}) ORDER BY inicio", ids).fetchall()
    out: dict = {}
    hoje = _date.today()
    for r in rows:
        t = out.setdefault(r["pessoa_id"], {"dias": 0, "dias_hoje": 0, "passagens": 0, "ativo": False, "desde": r["inicio"],
                                           "estimado": bool(r["inicio_estimado"]), "ultima_saida": None, "motivo": None})
        t["dias"] += _dias(r["inicio"], r["fim"], ate)
        t["dias_hoje"] += _dias(r["inicio"], r["fim"], hoje)
        t["passagens"] += 1
        if r["fim"] is None:
            t["ativo"] = True
        else:
            t["ultima_saida"], t["motivo"] = r["fim"], r["motivo_saida"]
    return out


def _passagens(con, pessoa_id: str) -> list[dict]:
    hoje = _date.today()
    return [dict(r) | {"dias": _dias(r["inicio"], r["fim"], hoje), "inicio_estimado": bool(r["inicio_estimado"])}
            for r in con.execute("SELECT * FROM lideranca_passagens WHERE pessoa_id = ? ORDER BY inicio", (pessoa_id,))]


def detalhe_pessoa(pessoa_id: str) -> dict | None:
    with _conn() as con:
        ult = con.execute("SELECT * FROM liderancas WHERE pessoa_id = ? ORDER BY competencia DESC, criado_em DESC LIMIT 1",
                          (pessoa_id,)).fetchone()
        if not ult:
            return None
        pas = _passagens(con, pessoa_id)
        meses = [r[0] for r in con.execute("SELECT DISTINCT competencia FROM liderancas WHERE pessoa_id = ? ORDER BY competencia",
                                           (pessoa_id,))]
    u = dict(ult)
    ativo = any(p["fim"] is None for p in pas)
    return {"pessoa_id": pessoa_id, "vulgo": u.get("vulgo"), "nome": u.get("nome"), "unidade": u["unidade"],
            "faccao": u["faccao"], "cargo": u["cargo"], "lider_id": u["id"], "foto_url": f"/api/liderancas/foto/{u['id']}" if u.get("foto_ext") else None,
            "passagens": pas, "total_dias": sum(p["dias"] for p in pas), "ativo": ativo, "meses": meses,
            "motivos": MOTIVOS_SAIDA}


def registrar_saida(pessoa_id: str, data: str | None, motivo: str, usuario: str = "", se_ja_fechada_ignora: bool = False) -> dict:
    if motivo not in MOTIVOS_SAIDA:
        raise ValueError("Motivo de saída inválido.")
    data = (data or _date.today().isoformat())[:10]
    _validar_data(data, "Data da saída")
    with _conn() as con:
        p = con.execute("SELECT * FROM lideranca_passagens WHERE pessoa_id = ? AND fim IS NULL", (pessoa_id,)).fetchone()
        if not p:
            if se_ja_fechada_ignora:
                return {"ok": True, "ja_fechada": True}
            raise ValueError("Este líder já está com a saída registrada.")
        if _d(data) < _d(p["inicio"]):
            raise ValueError(f"A saída não pode ser anterior ao início ({_fmt_br(p['inicio'])}).")
        con.execute("UPDATE lideranca_passagens SET fim = ?, motivo_saida = ?, fechado_por = ?, atualizado_em = ? WHERE id = ?",
                    (data, motivo, usuario, datetime.now(timezone.utc).isoformat(), p["id"]))
        dias = _dias(p["inicio"], data)
    return {"ok": True, "fim": data, "dias_passagem": dias}


def registrar_retorno(pessoa_id: str, data: str | None, usuario: str = "") -> dict:
    data = (data or _date.today().isoformat())[:10]
    _validar_data(data, "Data do retorno")
    with _conn() as con:
        if not con.execute("SELECT 1 FROM lideranca_passagens WHERE pessoa_id = ?", (pessoa_id,)).fetchone():
            raise ValueError("Líder não encontrado.")
        if con.execute("SELECT 1 FROM lideranca_passagens WHERE pessoa_id = ? AND fim IS NULL", (pessoa_id,)).fetchone():
            raise ValueError("Este líder já está ativo.")
        _preparar_passagem_nova(con, pessoa_id, data, usuario)
    return {"ok": True}


def editar_passagem(passagem_id: str, inicio: str | None = None, fim: str | None = None, usuario: str = "") -> dict:
    with _conn() as con:
        p = con.execute("SELECT * FROM lideranca_passagens WHERE id = ?", (passagem_id,)).fetchone()
        if not p:
            raise ValueError("Passagem não encontrada.")
        novo_ini = (inicio or p["inicio"])[:10]
        novo_fim = (fim[:10] if fim else p["fim"])
        _validar_data(novo_ini, "Data de início")
        if novo_fim:
            _validar_data(novo_fim, "Data da saída")
            if _d(novo_fim) < _d(novo_ini):
                raise ValueError("A saída não pode ser anterior ao início.")
        for o in con.execute("SELECT * FROM lideranca_passagens WHERE pessoa_id = ? AND id != ?", (p["pessoa_id"], passagem_id)):
            o_fim = _d(o["fim"]) if o["fim"] else _date.max
            n_fim = _d(novo_fim) if novo_fim else _date.max
            if _d(novo_ini) <= o_fim and _d(o["inicio"]) <= n_fim:
                raise ValueError("As datas se sobrepõem a outra passagem deste líder.")
        estimado = 0 if (inicio and inicio[:10] != p["inicio"]) else p["inicio_estimado"]
        con.execute("UPDATE lideranca_passagens SET inicio = ?, fim = ?, inicio_estimado = ?, atualizado_em = ? WHERE id = ?",
                    (novo_ini, novo_fim, estimado, datetime.now(timezone.utc).isoformat(), passagem_id))
    return {"ok": True}


def remover_lider(lider_id: str, motivo: str | None = None, data: str | None = None, usuario: str = "") -> dict:
    """Remove o cartão do mês. 'engano' = só apaga (sem tempo); os demais motivos encerram a passagem."""
    lider = buscar_lider(lider_id)
    if not lider:
        return {"ok": False, "erro": "nao_encontrado"}
    motivo = motivo or "engano"
    if motivo != "engano" and motivo not in MOTIVOS_SAIDA:
        raise ValueError("Motivo inválido.")
    pid = lider.get("pessoa_id")
    if motivo != "engano" and pid:
        registrar_saida(pid, data, motivo, usuario, se_ja_fechada_ignora=True)
    deletar_lider(lider_id)
    if motivo == "engano" and pid:
        with _conn() as con:
            if not con.execute("SELECT 1 FROM liderancas WHERE pessoa_id = ?", (pid,)).fetchone():
                con.execute("DELETE FROM lideranca_passagens WHERE pessoa_id = ?", (pid,))   # cadastro errado: não conta
    return {"ok": True, "motivo": motivo}


def _ultimo_registro_por_pessoa(con) -> list[dict]:
    rows = con.execute("""SELECT l.* FROM liderancas l
        WHERE l.pessoa_id IS NOT NULL AND l.id = (SELECT l2.id FROM liderancas l2 WHERE l2.pessoa_id = l.pessoa_id
                                                  ORDER BY l2.competencia DESC, l2.criado_em DESC LIMIT 1)""").fetchall()
    return [dict(r) for r in rows]


def buscar_pessoas(q: str, limite: int = 6) -> list[dict]:
    qn = _nk(q)
    if len(qn) < 3:
        return []
    with _conn() as con:
        ultimos = _ultimo_registro_por_pessoa(con)
        tempos = _tempo_map(con, [u["pessoa_id"] for u in ultimos], _date.today())
    res = []
    for u in ultimos:
        alvos = [_nk(u.get("vulgo")), _nk(u.get("nome"))] + [_nk(x) for x in (u.get("vulgo") or "").split("/")]
        if any(a and (qn in a or a in qn or _SM(None, qn, a).ratio() >= 0.8) for a in alvos):
            t = tempos.get(u["pessoa_id"]) or {}
            res.append({"pessoa_id": u["pessoa_id"], "vulgo": u.get("vulgo"), "nome": u.get("nome"), "unidade": u["unidade"],
                        "faccao": u["faccao"], "cargo": u["cargo"], "ativo": t.get("ativo", False),
                        "ultima_saida": t.get("ultima_saida"), "motivo": t.get("motivo"), "total_dias": t.get("dias_hoje", 0),
                        "foto_url": f"/api/liderancas/foto/{u['id']}" if u.get("foto_ext") else None})
    return sorted(res, key=lambda x: (not x["ativo"], x["vulgo"] or ""))[:limite]


def sugestoes_mesmo_lider() -> list[dict]:
    """Pares de identidades que PARECEM a mesma pessoa. Só sugere: quem une é o usuário."""
    with _conn() as con:
        ultimos = _ultimo_registro_por_pessoa(con)
        recusados = {(r[0], r[1]) for r in con.execute("SELECT a, b FROM liderancas_nao_iguais")}
        comps: dict = {}
        for r in con.execute("SELECT pessoa_id, unidade, competencia FROM liderancas WHERE pessoa_id IS NOT NULL"):
            comps.setdefault(r[0], set()).add((r[1], r[2]))
        tempos = _tempo_map(con, [u["pessoa_id"] for u in ultimos], _date.today())

    def vulgos(u):
        return {_nk(x) for x in (u.get("vulgo") or "").split("/") if _nk(x)}
    pares = []
    for i, a in enumerate(ultimos):
        for b in ultimos[i + 1:]:
            if a["unidade"] != b["unidade"] or _nk(a["faccao"]) != _nk(b["faccao"]):
                continue
            if comps.get(a["pessoa_id"], set()) & comps.get(b["pessoa_id"], set()):
                continue            # aparecem no mesmo mês/unidade: são pessoas diferentes
            par = tuple(sorted((a["pessoa_id"], b["pessoa_id"])))
            if par in recusados:
                continue
            motivo = None
            if vulgos(a) & vulgos(b):
                motivo = "mesmo vulgo"
            else:
                na, nb = _nk(a.get("nome")), _nk(b.get("nome"))
                if na and nb and _SM(None, na, nb).ratio() >= 0.88:
                    motivo = "nome parecido"
            if motivo:
                def ficha(x):
                    t = tempos.get(x["pessoa_id"]) or {}
                    return {"pessoa_id": x["pessoa_id"], "vulgo": x.get("vulgo"), "nome": x.get("nome"), "cargo": x["cargo"],
                            "unidade": x["unidade"], "faccao": x["faccao"], "competencia": x["competencia"],
                            "desde": t.get("desde"), "foto_url": f"/api/liderancas/foto/{x['id']}" if x.get("foto_ext") else None}
                pares.append({"motivo": motivo, "a": ficha(a), "b": ficha(b)})
    return pares


def _normalizar_passagens(con, pessoa_id: str) -> None:
    pas = [dict(r) for r in con.execute("SELECT * FROM lideranca_passagens WHERE pessoa_id = ? ORDER BY inicio", (pessoa_id,))]
    unidas: list[dict] = []
    for p in pas:
        if unidas:
            u = unidas[-1]
            u_fim = _d(u["fim"]) if u["fim"] else _date.max
            if _d(p["inicio"]) <= u_fim:                 # sobreposta ou contínua: junta
                if u["fim"] is None or p["fim"] is None:
                    u["fim"], u["motivo_saida"] = None, None
                elif _d(p["fim"]) > _d(u["fim"]):
                    u["fim"], u["motivo_saida"] = p["fim"], p["motivo_saida"]
                con.execute("DELETE FROM lideranca_passagens WHERE id = ?", (p["id"],))
                continue
        unidas.append(p)
    for u in unidas:
        con.execute("UPDATE lideranca_passagens SET fim = ?, motivo_saida = ? WHERE id = ?", (u["fim"], u["motivo_saida"], u["id"]))


def unir_pessoas(manter: str, unir: str) -> dict:
    if manter == unir:
        raise ValueError("Escolha duas pessoas diferentes.")
    with _conn() as con:
        if not con.execute("SELECT 1 FROM liderancas WHERE pessoa_id = ?", (manter,)).fetchone() or \
           not con.execute("SELECT 1 FROM liderancas WHERE pessoa_id = ?", (unir,)).fetchone():
            raise ValueError("Líder não encontrado.")
        con.execute("UPDATE liderancas SET pessoa_id = ? WHERE pessoa_id = ?", (manter, unir))
        con.execute("UPDATE lideranca_passagens SET pessoa_id = ? WHERE pessoa_id = ?", (manter, unir))
        con.execute("DELETE FROM liderancas_nao_iguais WHERE a IN (?,?) OR b IN (?,?)", (unir, unir, unir, unir))
        _normalizar_passagens(con, manter)
    return {"ok": True}


def marcar_nao_iguais(a: str, b: str) -> dict:
    a, b = sorted((a, b))
    with _conn() as con:
        con.execute("INSERT OR IGNORE INTO liderancas_nao_iguais (a, b) VALUES (?,?)", (a, b))
    return {"ok": True}


# Inicializa banco ao importar
init_db()
init_db_faccoes()
