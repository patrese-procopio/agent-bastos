# -*- coding: utf-8 -*-
"""
grafo.py — Motor de Grafo de Vínculos (mini i2)
Agent Bastos | AIPEN

Banco próprio e genérico (não toca em liderancas.db):
  data/grafo/grafo_vinculos.db

Tabelas:
  nos           — entidades tipadas (pessoa, local, faccao, crime, juridico,
                  documento, social, geografia, financeiro, organizacao,
                  evento, generico). Cada nó tem um ícone (emoji) opcional.
  arestas       — vínculos direcionados/não-direcionados entre nós.
  movimentacoes — linha do tempo de custódia/facção/cargo por pessoa
                  (derivada das lideranças, fonte do painel temporal).

Construção em dois modos:
  1. Manual  — o analista cria nós e vínculos pela tela (modo principal).
  2. Automático:
     - sincronizar()       → semeia pessoa/local/facção + movimentação a
                             partir de liderancas.db.
     - varrer_citacoes()   → varre o ChromaDB (texto integral) e o índice de
                             documentos procurando o nome/vulgo do alvo e cria
                             nós-documento (folha escrita) ligados por CITADO_EM.
"""

import os
import re
import json
import uuid
import hashlib
import sqlite3
import unicodedata
from datetime import datetime, timezone
from contextlib import contextmanager

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH  = os.path.join(BASE_DIR, "data", "grafo", "grafo_vinculos.db")
LIDER_DB = os.path.join(BASE_DIR, "data", "liderancas", "liderancas.db")
CHROMA_DIR    = os.path.join(BASE_DIR, "data", "chroma_db")
INDICE_DOCS   = os.path.join(BASE_DIR, "indice_documentos.json")
FOTOS_DIR     = os.path.join(BASE_DIR, "data", "grafo", "fotos")

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
os.makedirs(FOTOS_DIR, exist_ok=True)

_FOTO_EXTS = ("jpg", "jpeg", "png", "webp", "gif")

# Categorias válidas de nó (espelhadas na galeria de ícones do frontend)
TIPOS_NO = [
    "pessoa", "local", "faccao", "crime", "juridico", "documento",
    "social", "geografia", "financeiro", "organizacao", "evento", "generico",
]

# Ícone default por categoria (o usuário pode sobrescrever ao criar o nó)
ICONE_PADRAO = {
    "pessoa": "👤", "local": "🏛️", "faccao": "🏴", "crime": "🔫",
    "juridico": "⚖️", "documento": "📄", "social": "🤝", "geografia": "🌎",
    "financeiro": "💰", "organizacao": "🏢", "evento": "⚡", "generico": "⚪",
}

# Rótulos de vínculo sugeridos (o usuário pode digitar qualquer um)
ROTULOS_VINCULO = [
    "MANDA_EM", "SUBORDINADO_A", "VINCULADO_A", "SUBSTITUTO_DE",
    "APADRINHADO_POR", "ALIADO_DE", "RIVAL_DE", "FAMILIAR_DE",
    "CUSTODIADO_EM", "AFILIADO_A", "CITADO_EM", "RESPONSAVEL_POR",
    "PARTICIPOU_DE", "ORIGEM", "ATUOU_EM",
]


# ── Conexão ─────────────────────────────────────────────────────────────────

@contextmanager
def _conn():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    try:
        yield con
        con.commit()
    finally:
        con.close()


def init_db():
    """Cria as tabelas e índices. Idempotente."""
    with _conn() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS nos (
                id            TEXT PRIMARY KEY,
                tipo          TEXT NOT NULL,
                rotulo        TEXT NOT NULL,
                icone         TEXT,
                detalhes      TEXT,
                origem        TEXT NOT NULL DEFAULT 'manual',
                pos_x         REAL,
                pos_y         REAL,
                fixado        INTEGER NOT NULL DEFAULT 0,
                criado_em     TEXT NOT NULL,
                atualizado_em TEXT NOT NULL
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS arestas (
                id           TEXT PRIMARY KEY,
                origem_id    TEXT NOT NULL,
                destino_id   TEXT NOT NULL,
                rotulo       TEXT,
                direcionada  INTEGER NOT NULL DEFAULT 1,
                propriedades TEXT,
                origem       TEXT NOT NULL DEFAULT 'manual',
                criado_em    TEXT NOT NULL,
                FOREIGN KEY(origem_id)  REFERENCES nos(id) ON DELETE CASCADE,
                FOREIGN KEY(destino_id) REFERENCES nos(id) ON DELETE CASCADE
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS movimentacoes (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                pessoa_id   TEXT NOT NULL,
                unidade     TEXT,
                pavilhao    TEXT,
                ala         TEXT,
                cela        TEXT,
                cargo       TEXT,
                faccao      TEXT,
                competencia TEXT,
                FOREIGN KEY(pessoa_id) REFERENCES nos(id) ON DELETE CASCADE
            )
        """)
        con.execute("CREATE INDEX IF NOT EXISTS idx_no_tipo    ON nos(tipo)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_ar_origem  ON arestas(origem_id)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_ar_destino ON arestas(destino_id)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_mov_pessoa ON movimentacoes(pessoa_id)")


# ── Helpers ─────────────────────────────────────────────────────────────────

def _agora() -> str:
    return datetime.now(timezone.utc).isoformat()


def _norm(txt: str) -> str:
    """minúsculo, sem acento, espaços colapsados."""
    if not txt:
        return ""
    t = unicodedata.normalize("NFKD", str(txt))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t.strip().lower())


def _slug(txt: str) -> str:
    n = _norm(txt)
    return re.sub(r"[^a-z0-9]+", "_", n).strip("_")[:60] or "x"


def _id_pessoa(nome: str, vulgo: str) -> str:
    chave = f"{_norm(nome)}|{_norm(vulgo)}"
    return "p_" + hashlib.md5(chave.encode()).hexdigest()[:12]


def _loads(s):
    if not s:
        return {}
    try:
        return json.loads(s)
    except Exception:
        return {}


def _no_dict(row) -> dict:
    d = dict(row)
    d["detalhes"] = _loads(d.get("detalhes"))
    d["fixado"]   = bool(d.get("fixado"))
    return d


def _aresta_dict(row) -> dict:
    d = dict(row)
    d["propriedades"] = _loads(d.get("propriedades"))
    d["direcionada"]  = bool(d.get("direcionada"))
    # nomes que o react-force-graph espera
    d["source"] = d["origem_id"]
    d["target"] = d["destino_id"]
    return d


# ── Upsert internos ─────────────────────────────────────────────────────────

def _upsert_no(con, no_id, tipo, rotulo, *, icone=None, detalhes=None, origem="manual"):
    agora = _agora()
    existe = con.execute("SELECT id, detalhes FROM nos WHERE id = ?", (no_id,)).fetchone()
    det_json = json.dumps(detalhes or {}, ensure_ascii=False)
    if existe:
        # Atualiza rótulo/detalhes de nós automáticos; preserva ícone manual se houver
        con.execute(
            "UPDATE nos SET rotulo = ?, detalhes = ?, atualizado_em = ? WHERE id = ?",
            (rotulo, det_json, agora, no_id),
        )
        if icone:
            con.execute(
                "UPDATE nos SET icone = COALESCE(icone, ?) WHERE id = ?",
                (icone, no_id),
            )
    else:
        con.execute(
            """INSERT INTO nos (id, tipo, rotulo, icone, detalhes, origem,
                                criado_em, atualizado_em)
               VALUES (?,?,?,?,?,?,?,?)""",
            (no_id, tipo, rotulo, icone, det_json, origem, agora, agora),
        )
    return no_id


def _upsert_aresta_auto(con, origem_id, destino_id, rotulo, propriedades, origem):
    """Cria a aresta automática se ainda não existir (dedupe por trinca + origem)."""
    achou = con.execute(
        """SELECT id FROM arestas
           WHERE origem_id = ? AND destino_id = ? AND rotulo = ? AND origem = ?""",
        (origem_id, destino_id, rotulo, origem),
    ).fetchone()
    if achou:
        con.execute(
            "UPDATE arestas SET propriedades = ? WHERE id = ?",
            (json.dumps(propriedades or {}, ensure_ascii=False), achou["id"]),
        )
        return achou["id"]
    aid = "a_" + uuid.uuid4().hex[:12]
    con.execute(
        """INSERT INTO arestas (id, origem_id, destino_id, rotulo, direcionada,
                                propriedades, origem, criado_em)
           VALUES (?,?,?,?,?,?,?,?)""",
        (aid, origem_id, destino_id, rotulo, 1,
         json.dumps(propriedades or {}, ensure_ascii=False), origem, _agora()),
    )
    return aid


# ── CRUD manual de nós ──────────────────────────────────────────────────────

def criar_no(dados: dict) -> dict:
    tipo = dados.get("tipo") or "generico"
    if tipo not in TIPOS_NO:
        tipo = "generico"
    no_id = dados.get("id") or ("n_" + uuid.uuid4().hex[:12])
    icone = dados.get("icone") or ICONE_PADRAO.get(tipo, "⚪")
    agora = _agora()
    with _conn() as con:
        con.execute(
            """INSERT INTO nos (id, tipo, rotulo, icone, detalhes, origem,
                                pos_x, pos_y, fixado, criado_em, atualizado_em)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (no_id, tipo, dados.get("rotulo") or "Sem rótulo", icone,
             json.dumps(dados.get("detalhes") or {}, ensure_ascii=False),
             "manual", dados.get("pos_x"), dados.get("pos_y"),
             1 if dados.get("fixado") else 0, agora, agora),
        )
    return buscar_no(no_id)


def atualizar_no(no_id: str, dados: dict) -> dict | None:
    if not buscar_no(no_id):
        return None
    campos, valores = [], []
    for k in ("tipo", "rotulo", "icone"):
        if k in dados and dados[k] is not None:
            campos.append(f"{k} = ?"); valores.append(dados[k])
    if "detalhes" in dados:
        campos.append("detalhes = ?")
        valores.append(json.dumps(dados["detalhes"] or {}, ensure_ascii=False))
    for k in ("pos_x", "pos_y"):
        if k in dados:
            campos.append(f"{k} = ?"); valores.append(dados[k])
    if "fixado" in dados:
        campos.append("fixado = ?"); valores.append(1 if dados["fixado"] else 0)
    campos.append("atualizado_em = ?"); valores.append(_agora())
    valores.append(no_id)
    with _conn() as con:
        con.execute(f"UPDATE nos SET {', '.join(campos)} WHERE id = ?", valores)
    return buscar_no(no_id)


def deletar_no(no_id: str) -> bool:
    with _conn() as con:
        achou = con.execute("SELECT id FROM nos WHERE id = ?", (no_id,)).fetchone()
        if not achou:
            return False
        con.execute("DELETE FROM arestas WHERE origem_id = ? OR destino_id = ?", (no_id, no_id))
        con.execute("DELETE FROM movimentacoes WHERE pessoa_id = ?", (no_id,))
        con.execute("DELETE FROM nos WHERE id = ?", (no_id,))
    return True


def buscar_no(no_id: str) -> dict | None:
    with _conn() as con:
        row = con.execute("SELECT * FROM nos WHERE id = ?", (no_id,)).fetchone()
    return _no_dict(row) if row else None


# ── CRUD manual de arestas ──────────────────────────────────────────────────

def criar_aresta(dados: dict) -> dict | None:
    origem_id  = dados.get("origem_id")  or dados.get("source")
    destino_id = dados.get("destino_id") or dados.get("target")
    if not origem_id or not destino_id:
        return None
    with _conn() as con:
        ok = con.execute(
            "SELECT COUNT(*) c FROM nos WHERE id IN (?,?)", (origem_id, destino_id)
        ).fetchone()["c"]
        if ok < 2:
            return None
        aid = "a_" + uuid.uuid4().hex[:12]
        con.execute(
            """INSERT INTO arestas (id, origem_id, destino_id, rotulo, direcionada,
                                    propriedades, origem, criado_em)
               VALUES (?,?,?,?,?,?,?,?)""",
            (aid, origem_id, destino_id, dados.get("rotulo") or "VINCULADO_A",
             0 if dados.get("direcionada") is False else 1,
             json.dumps(dados.get("propriedades") or {}, ensure_ascii=False),
             "manual", _agora()),
        )
        row = con.execute("SELECT * FROM arestas WHERE id = ?", (aid,)).fetchone()
    return _aresta_dict(row)


def atualizar_aresta(aresta_id: str, dados: dict) -> dict | None:
    campos, valores = [], []
    if "rotulo" in dados:
        campos.append("rotulo = ?"); valores.append(dados["rotulo"])
    if "direcionada" in dados:
        campos.append("direcionada = ?"); valores.append(1 if dados["direcionada"] else 0)
    if "propriedades" in dados:
        campos.append("propriedades = ?")
        valores.append(json.dumps(dados["propriedades"] or {}, ensure_ascii=False))
    if not campos:
        return None
    valores.append(aresta_id)
    with _conn() as con:
        con.execute(f"UPDATE arestas SET {', '.join(campos)} WHERE id = ?", valores)
        row = con.execute("SELECT * FROM arestas WHERE id = ?", (aresta_id,)).fetchone()
    return _aresta_dict(row) if row else None


def deletar_aresta(aresta_id: str) -> bool:
    with _conn() as con:
        cur = con.execute("DELETE FROM arestas WHERE id = ?", (aresta_id,))
        return cur.rowcount > 0


# ── Consulta / Rede ─────────────────────────────────────────────────────────

def listar_alvos() -> list[dict]:
    """Pessoas disponíveis para focar (auto + manuais), com contagem de vínculos.

    Otimização anti-N+1: contagem de vínculos é feita em UMA query agregada
    (antes era 1 query por pessoa → 75+ round-trips em bases grandes).
    """
    with _conn() as con:
        rows = con.execute(
            "SELECT * FROM nos WHERE tipo = 'pessoa' ORDER BY rotulo"
        ).fetchall()

        # Contagem agregada de vínculos por nó em uma única query.
        # UNION ALL é mais barato que OR aqui (cada lado usa seu índice nativo).
        contagens = dict(con.execute("""
            SELECT no_id, SUM(c) FROM (
                SELECT origem_id  AS no_id, COUNT(*) AS c FROM arestas GROUP BY origem_id
                UNION ALL
                SELECT destino_id AS no_id, COUNT(*) AS c FROM arestas GROUP BY destino_id
            )
            GROUP BY no_id
        """).fetchall())

        alvos = []
        for r in rows:
            d = _no_dict(r)
            det = d.get("detalhes", {})
            alvos.append({
                "id": d["id"], "rotulo": d["rotulo"], "icone": d.get("icone"),
                "vulgo": det.get("vulgo"), "nome": det.get("nome"),
                "faccao": det.get("faccao_atual"), "unidade": det.get("unidade_atual"),
                "origem": d["origem"], "vinculos": int(contagens.get(d["id"], 0) or 0),
            })
    return alvos


def _movimentacoes(con, pessoa_id) -> list[dict]:
    rows = con.execute(
        """SELECT unidade, pavilhao, ala, cela, cargo, faccao, competencia
           FROM movimentacoes WHERE pessoa_id = ?
           ORDER BY competencia DESC""",
        (pessoa_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def rede_alvo(alvo_id: str, hops: int = 2) -> dict:
    """Ego-network do alvo: nós alcançáveis em até `hops` saltos + arestas entre eles."""
    with _conn() as con:
        if not con.execute("SELECT id FROM nos WHERE id = ?", (alvo_id,)).fetchone():
            return {"nodes": [], "edges": [], "erro": "alvo_nao_encontrado"}

        visiveis = {alvo_id}
        fronteira = {alvo_id}
        for _ in range(max(1, hops)):
            if not fronteira:
                break
            qmarks = ",".join("?" * len(fronteira))
            vizinhos = con.execute(
                f"""SELECT origem_id, destino_id FROM arestas
                    WHERE origem_id IN ({qmarks}) OR destino_id IN ({qmarks})""",
                tuple(fronteira) * 2,
            ).fetchall()
            nova = set()
            for v in vizinhos:
                for nid in (v["origem_id"], v["destino_id"]):
                    if nid not in visiveis:
                        nova.add(nid); visiveis.add(nid)
            fronteira = nova

        qmarks = ",".join("?" * len(visiveis))
        nos = con.execute(
            f"SELECT * FROM nos WHERE id IN ({qmarks})", tuple(visiveis)
        ).fetchall()
        arestas = con.execute(
            f"""SELECT * FROM arestas
                WHERE origem_id IN ({qmarks}) AND destino_id IN ({qmarks})""",
            tuple(visiveis) * 2,
        ).fetchall()

        nodes = []
        for r in nos:
            d = _no_dict(r)
            if d["id"] == alvo_id:
                d["alvo"] = True
                d["detalhes"]["movimentacoes"] = _movimentacoes(con, alvo_id)
            nodes.append(d)
        edges = [_aresta_dict(r) for r in arestas]
    return {"nodes": nodes, "edges": edges}


def grafo_completo() -> dict:
    with _conn() as con:
        nos = [_no_dict(r) for r in con.execute("SELECT * FROM nos").fetchall()]
        edges = [_aresta_dict(r) for r in con.execute("SELECT * FROM arestas").fetchall()]
    return {"nodes": nos, "edges": edges}


def recentes_auto(limite: int = 20) -> dict:
    """
    Nós e arestas adicionados automaticamente via HITL (origem LIKE 'auto:correlacao:%')
    ordenados do mais recente para o mais antigo.

    Útil para o painel ORÁCULO LIVE do frontend — mostra o que o sistema
    materializou no grafo sem intervenção manual.
    """
    with _conn() as con:
        nos = [
            _no_dict(r)
            for r in con.execute(
                """SELECT * FROM nos
                   WHERE origem LIKE 'auto:correlacao:%'
                   ORDER BY criado_em DESC
                   LIMIT ?""",
                (limite,),
            ).fetchall()
        ]
        arestas = [
            _aresta_dict(r)
            for r in con.execute(
                """SELECT * FROM arestas
                   WHERE origem LIKE 'auto:correlacao:%'
                   ORDER BY criado_em DESC
                   LIMIT ?""",
                (limite,),
            ).fetchall()
        ]
    return {"nos": nos, "arestas": arestas, "total_nos": len(nos), "total_arestas": len(arestas)}


def stats_grafo() -> dict:
    """Contagens rápidas para o painel de status do frontend."""
    with _conn() as con:
        total_nos    = con.execute("SELECT COUNT(*) FROM nos").fetchone()[0]
        total_arestas = con.execute("SELECT COUNT(*) FROM arestas").fetchone()[0]
        auto_nos     = con.execute(
            "SELECT COUNT(*) FROM nos WHERE origem LIKE 'auto:%'"
        ).fetchone()[0]
        auto_arestas = con.execute(
            "SELECT COUNT(*) FROM arestas WHERE origem LIKE 'auto:%'"
        ).fetchone()[0]
        hitl_nos     = con.execute(
            "SELECT COUNT(*) FROM nos WHERE origem LIKE 'auto:correlacao:%'"
        ).fetchone()[0]
        ultima_auto  = con.execute(
            "SELECT MAX(criado_em) FROM nos WHERE origem LIKE 'auto:%'"
        ).fetchone()[0]
    return {
        "total_nos":     total_nos,
        "total_arestas": total_arestas,
        "auto_nos":      auto_nos,
        "auto_arestas":  auto_arestas,
        "hitl_nos":      hitl_nos,       # nós que vieram de HITLs confirmados
        "manual_nos":    total_nos - auto_nos,
        "ultima_auto":   ultima_auto,
    }


# ── Sincronização com lideranças ────────────────────────────────────────────

def sincronizar() -> dict:
    """
    Semeia o grafo a partir de liderancas.db:
      pessoa → CUSTODIADO_EM → local
      pessoa → AFILIADO_A    → facção
    e reconstrói a linha do tempo (movimentacoes) de cada pessoa.
    Só mexe em nós/arestas com origem 'auto:liderancas'. Manuais ficam intactos.
    """
    if not os.path.exists(LIDER_DB):
        return {"ok": False, "erro": "liderancas_db_ausente"}

    lcon = sqlite3.connect(LIDER_DB)
    lcon.row_factory = sqlite3.Row
    try:
        regs = lcon.execute("SELECT * FROM liderancas").fetchall()
    finally:
        lcon.close()

    # Agrupa registros por pessoa (nome+vulgo)
    pessoas: dict[str, list] = {}
    for r in regs:
        rd = dict(r)
        if not (rd.get("nome") or rd.get("vulgo")):
            continue
        pid = _id_pessoa(rd.get("nome") or "", rd.get("vulgo") or "")
        pessoas.setdefault(pid, []).append(rd)

    criados_pessoa = criados_local = criados_faccao = 0
    with _conn() as con:
        for pid, lista in pessoas.items():
            # Registro mais recente = estado atual da pessoa
            lista_ord = sorted(lista, key=lambda x: x.get("competencia") or "", reverse=True)
            atual = lista_ord[0]
            foto_lider = next((x for x in lista_ord if x.get("foto_ext")), None)

            det = {
                "nome": atual.get("nome"), "vulgo": atual.get("vulgo"),
                "faccao_atual": atual.get("faccao"), "cargo_atual": atual.get("cargo"),
                "unidade_atual": atual.get("unidade"), "pavilhao_atual": atual.get("pavilhao"),
                "cela_atual": atual.get("cela"), "observacao": atual.get("observacao"),
            }
            if foto_lider:
                det["foto_lider_id"] = foto_lider["id"]
                det["foto_url"] = f"/api/liderancas/foto/{foto_lider['id']}"

            rotulo = atual.get("vulgo") or atual.get("nome") or "Alvo"
            existia = con.execute("SELECT id FROM nos WHERE id = ?", (pid,)).fetchone()
            _upsert_no(con, pid, "pessoa", rotulo, icone="👤",
                       detalhes=det, origem="auto:liderancas")
            if not existia:
                criados_pessoa += 1

            # Reconstrói a linha do tempo
            con.execute("DELETE FROM movimentacoes WHERE pessoa_id = ?", (pid,))
            locais_vistos, faccoes_vistas = {}, {}
            for rd in lista_ord:
                con.execute(
                    """INSERT INTO movimentacoes
                       (pessoa_id, unidade, pavilhao, ala, cela, cargo, faccao, competencia)
                       VALUES (?,?,?,?,?,?,?,?)""",
                    (pid, rd.get("unidade"), rd.get("pavilhao"), rd.get("ala"),
                     rd.get("cela"), rd.get("cargo"), rd.get("faccao"), rd.get("competencia")),
                )
                if rd.get("unidade"):
                    chave = f"{rd.get('unidade')}|{rd.get('pavilhao')}"
                    locais_vistos.setdefault(chave, rd)
                if rd.get("faccao"):
                    faccoes_vistas.setdefault(rd["faccao"], rd)

            # Limpa vínculos automáticos anteriores desta pessoa (rebuild limpo)
            con.execute(
                "DELETE FROM arestas WHERE origem_id = ? AND origem = 'auto:liderancas'",
                (pid,),
            )

            for chave, rd in locais_vistos.items():
                local_id = "local_" + _slug(f"{rd.get('unidade')}_{rd.get('pavilhao')}")
                local_label = f"{rd.get('unidade')} · {rd.get('pavilhao')}"
                ex = con.execute("SELECT id FROM nos WHERE id = ?", (local_id,)).fetchone()
                _upsert_no(con, local_id, "local", local_label, icone="🏛️",
                           detalhes={"unidade": rd.get("unidade"), "pavilhao": rd.get("pavilhao")},
                           origem="auto:liderancas")
                if not ex:
                    criados_local += 1
                _upsert_aresta_auto(con, pid, local_id, "CUSTODIADO_EM", {
                    "cargo": rd.get("cargo"), "faccao_epoca": rd.get("faccao"),
                    "competencia": rd.get("competencia"), "cela": rd.get("cela"),
                }, "auto:liderancas")

            for faccao, rd in faccoes_vistas.items():
                faccao_id = "faccao_" + _slug(faccao)
                ex = con.execute("SELECT id FROM nos WHERE id = ?", (faccao_id,)).fetchone()
                _upsert_no(con, faccao_id, "faccao", faccao, icone="🏴",
                           detalhes={"faccao": faccao}, origem="auto:liderancas")
                if not ex:
                    criados_faccao += 1
                _upsert_aresta_auto(con, pid, faccao_id, "AFILIADO_A",
                                    {"cargo": rd.get("cargo")}, "auto:liderancas")

    return {
        "ok": True,
        "pessoas": len(pessoas),
        "novos_nos_pessoa": criados_pessoa,
        "novos_nos_local": criados_local,
        "novos_nos_faccao": criados_faccao,
    }


# ── Scanner de citações (ChromaDB + índice de documentos) ───────────────────

_TIPOS_DOC = [
    "RELINT", "RELTEC", "REPEN", "RELATÓRIO", "RELATORIO", "INFORME",
    "CATATAU", "MISSIVA", "BILHETE", "OFÍCIO", "OFICIO", "PEDIDO DE BUSCA",
    "MINUTA", "DESPACHO", "B.O", "BOLETIM", "DECISÃO", "DECISAO", "SENTENÇA",
]


def _inferir_doc(fonte: str, assunto: str = "") -> dict:
    base = os.path.basename(fonte or "")
    alvo_txt = f"{base} {assunto}".upper()
    tipo_doc = next((t for t in _TIPOS_DOC if t in alvo_txt), "DOCUMENTO")
    m_cod = re.search(r"(\d{1,4})\s*[/\-_]\s*(20\d{2})", base)
    codigo = f"{tipo_doc} {m_cod.group(1)}/{m_cod.group(2)}" if m_cod else tipo_doc
    m_data = re.search(r"(\d{2})[/\-.](\d{2})[/\-.](20\d{2})", alvo_txt)
    data = f"{m_data.group(1)}/{m_data.group(2)}/{m_data.group(3)}" if m_data else None
    return {"tipo_doc": tipo_doc, "codigo": codigo, "data": data, "fonte": base or fonte}


def _abrir_chroma_collection():
    """Abre a coleção do ChromaDB sem carregar embeddings nem exigir GROQ."""
    try:
        import chromadb
    except Exception:
        return None
    if not os.path.isdir(CHROMA_DIR):
        return None
    try:
        client = chromadb.PersistentClient(path=CHROMA_DIR)
        cols = client.list_collections()
        if not cols:
            return None
        # langchain-chroma usa 'langchain' por padrão; senão pega a maior
        nomes = [c.name for c in cols]
        nome = "langchain" if "langchain" in nomes else nomes[0]
        return client.get_collection(nome)
    except Exception:
        return None


def _varrer_chroma(termos: list[str], limite: int = 40) -> list[dict]:
    col = _abrir_chroma_collection()
    if col is None:
        return []
    achados, vistos = [], set()
    for termo in termos:
        if not termo or len(termo) < 3:
            continue
        try:
            res = col.get(where_document={"$contains": termo},
                          include=["documents", "metadatas"], limit=limite)
        except Exception:
            continue
        docs  = res.get("documents") or []
        metas = res.get("metadatas") or []
        for doc, meta in zip(docs, metas):
            meta = meta or {}
            fonte = meta.get("fonte") or meta.get("source") or "documento"
            if fonte in vistos:
                continue
            vistos.add(fonte)
            info = _inferir_doc(fonte)
            idx = (doc or "").upper().find(termo.upper())
            trecho = (doc or "")[max(0, idx - 80): idx + 160].strip() if idx >= 0 else (doc or "")[:200]
            achados.append({**info, "trecho": trecho, "termo": termo})
    return achados


def _varrer_indice(termos: list[str]) -> list[dict]:
    if not os.path.exists(INDICE_DOCS):
        return []
    try:
        with open(INDICE_DOCS, encoding="utf-8") as f:
            docs = json.load(f).get("documentos", [])
    except Exception:
        return []
    achados = []
    termos_n = [_norm(t) for t in termos if t]
    for d in docs:
        assunto = _norm(d.get("assunto", ""))
        if any(t in assunto for t in termos_n):
            tipo_doc = (d.get("tipo") or "DOCUMENTO").upper()
            numero = d.get("numero", ""); ano = d.get("ano", "")
            codigo = f"{tipo_doc} {numero}/{ano}".strip()
            achados.append({
                "tipo_doc": tipo_doc, "codigo": codigo, "data": None,
                "fonte": d.get("assunto") or codigo,
                "trecho": d.get("assunto", ""), "termo": "",
                "file_id": d.get("file_id"),
            })
    return achados


def varrer_citacoes(alvo_id: str) -> dict:
    """Acha menções ao nome/vulgo do alvo e cria nós-documento ligados por CITADO_EM."""
    alvo = buscar_no(alvo_id)
    if not alvo:
        return {"ok": False, "erro": "alvo_nao_encontrado"}
    det = alvo.get("detalhes", {})
    termos = [(t or "").strip() for t in [det.get("nome"), det.get("vulgo"), alvo.get("rotulo")]]
    termos = [t for t in termos if len(t) >= 3]
    # remove duplicatas preservando ordem
    termos = list(dict.fromkeys(termos))
    if not termos:
        return {"ok": False, "erro": "alvo_sem_nome"}

    achados = _varrer_chroma(termos) + _varrer_indice(termos)
    if not achados:
        return {"ok": True, "criados": 0, "termos": termos}

    criados = 0
    with _conn() as con:
        for a in achados:
            doc_id = "doc_" + _slug(a.get("codigo") or a.get("fonte") or "doc") + "_" + \
                     hashlib.md5((a.get("fonte") or "").encode()).hexdigest()[:6]
            rotulo = a.get("codigo") or a.get("fonte") or "Documento"
            ex = con.execute("SELECT id FROM nos WHERE id = ?", (doc_id,)).fetchone()
            _upsert_no(con, doc_id, "documento", rotulo, icone="📄", detalhes={
                "tipo_doc": a.get("tipo_doc"), "data": a.get("data"),
                "fonte": a.get("fonte"), "trecho": a.get("trecho"),
                "file_id": a.get("file_id"),
            }, origem="auto:citacao")
            aid = _upsert_aresta_auto(con, alvo_id, doc_id, "CITADO_EM", {
                "data": a.get("data"), "fonte": a.get("fonte"),
                "trecho": a.get("trecho"), "termo": a.get("termo"),
            }, "auto:citacao")
            if not ex:
                criados += 1
    return {"ok": True, "criados": criados, "encontrados": len(achados), "termos": termos}


# ── Ingestão a partir do Módulo Extrato ─────────────────────────────────────

def _id_entidade(tipo: str, nome: str, vulgo: str, rotulo: str) -> str:
    """
    ID estável de uma entidade extraída de um extrato.
    Pessoa usa o MESMO esquema das lideranças (md5 nome+vulgo) → mescla
    automaticamente com a pessoa já existente no grafo. Demais tipos usam slug
    estável por (tipo+rótulo) para que menções repetidas convirjam no mesmo nó.
    """
    if tipo == "pessoa":
        return _id_pessoa(nome or rotulo or "", vulgo or "")
    if tipo == "faccao":
        return "faccao_" + _slug(rotulo or nome)
    if tipo == "local":
        return "local_" + _slug(rotulo or nome)
    return f"ext_{tipo}_" + _slug(rotulo or nome or "x")


def limpar_extrato(extrato_id: str) -> None:
    """Remove os nós/arestas AUTO deste extrato (reprocessamento limpo).
    Preserva pessoas (nós de identidade compartilhados) e tudo que for manual."""
    origem = f"auto:extrato:{extrato_id}"
    with _conn() as con:
        con.execute("DELETE FROM arestas WHERE origem = ?", (origem,))
        con.execute(
            "DELETE FROM nos WHERE origem = ? AND tipo != 'pessoa'", (origem,)
        )


def ingerir_extrato(extrato_id: str, entidades: list[dict],
                    conexoes: list[dict], rotulo_extrato: str = None) -> dict:
    """
    Materializa entidades e vínculos extraídos no grafo de vínculos, marcados
    com origem 'auto:extrato:<id>'. Nós já existentes (ex.: pessoa de liderança)
    são REUTILIZADOS sem sobrescrever seus detalhes.

    Cria também um NÓ-HUB do próprio extrato e liga TODAS as entidades a ele
    (relação CITADO_NO_EXTRATO), de modo que o grafo sempre mostre o extrato
    conectado aos envolvidos — mesmo que nenhum nome bata com as lideranças
    (nesse caso a pessoa entra como nó de ícone padrão, sem foto).

    `entidades`: [{ref, tipo, nome, vulgo, rotulo, papel_no_contexto, evidencia}]
    `conexoes` : [{source(ref), target(ref), relation, weight, evidencia}]

    Retorna {ref_para_id, nos_criados, arestas_criadas, hub_id}.
    """
    limpar_extrato(extrato_id)
    origem = f"auto:extrato:{extrato_id}"
    ref_para_id: dict[str, str] = {}
    nos_criados = 0
    hub_id = "extrato_" + extrato_id

    with _conn() as con:
        # Nó-hub do extrato (sempre criado)
        _upsert_no(con, hub_id, "documento",
                   (rotulo_extrato or f"Extrato {extrato_id}")[:80],
                   icone="📋",
                   detalhes={"extrato_id": extrato_id, "tipo_no": "extrato"},
                   origem=origem)
        nos_criados += 1

        for ent in entidades:
            tipo = ent.get("tipo") or "generico"
            if tipo not in TIPOS_NO:
                tipo = "generico"
            nome  = (ent.get("nome") or "").strip()
            vulgo = (ent.get("vulgo") or "").strip()
            rotulo = (ent.get("rotulo") or vulgo or nome or "Entidade").strip()
            no_id = _id_entidade(tipo, nome, vulgo, rotulo)
            ref = ent.get("ref") or no_id
            ref_para_id[str(ref)] = no_id

            existe = con.execute("SELECT id FROM nos WHERE id = ?", (no_id,)).fetchone()
            if existe:
                # Não clobberar nó existente; apenas registra a menção neste extrato.
                _registrar_mencao(con, no_id, extrato_id, ent)
                continue
            det = {
                "nome": nome or None, "vulgo": vulgo or None,
                "papel_no_contexto": ent.get("papel_no_contexto"),
                "extratos": [{"extrato_id": extrato_id,
                              "papel": ent.get("papel_no_contexto"),
                              "evidencia": ent.get("evidencia")}],
            }
            _upsert_no(con, no_id, tipo, rotulo,
                       icone=ICONE_PADRAO.get(tipo, "⚪"), detalhes=det, origem=origem)
            nos_criados += 1

        arestas_criadas = 0
        for cx in conexoes:
            sid = ref_para_id.get(str(cx.get("source")))
            tid = ref_para_id.get(str(cx.get("target")))
            if not sid or not tid or sid == tid:
                continue
            rel = (cx.get("relation") or "VINCULADO_A").strip().upper().replace(" ", "_")
            try:
                weight = int(cx.get("weight") or 2)
            except Exception:
                weight = 2
            _upsert_aresta_auto(con, sid, tid, rel, {
                "weight": max(1, min(3, weight)),
                "evidencia": cx.get("evidencia"),
                "extrato_id": extrato_id,
            }, origem)
            arestas_criadas += 1

        # Liga o hub do extrato a TODAS as entidades (garante grafo conectado)
        for ent in entidades:
            eid_no = ref_para_id.get(str(ent.get("ref")))
            if not eid_no or eid_no == hub_id:
                continue
            _upsert_aresta_auto(con, hub_id, eid_no, "CITADO_NO_EXTRATO", {
                "papel": ent.get("papel_no_contexto"),
                "evidencia": ent.get("evidencia"),
                "extrato_id": extrato_id,
            }, origem)
            arestas_criadas += 1

    return {"ref_para_id": ref_para_id, "nos_criados": nos_criados,
            "arestas_criadas": arestas_criadas, "hub_id": hub_id}


def _registrar_mencao(con, no_id: str, extrato_id: str, ent: dict) -> None:
    """Anexa a menção deste extrato ao detalhe de um nó já existente."""
    row = con.execute("SELECT detalhes FROM nos WHERE id = ?", (no_id,)).fetchone()
    det = _loads(row["detalhes"]) if row else {}
    mencoes = det.get("extratos") or []
    if not any(m.get("extrato_id") == extrato_id for m in mencoes):
        mencoes.append({"extrato_id": extrato_id,
                        "papel": ent.get("papel_no_contexto"),
                        "evidencia": ent.get("evidencia")})
        det["extratos"] = mencoes
        con.execute("UPDATE nos SET detalhes = ?, atualizado_em = ? WHERE id = ?",
                    (json.dumps(det, ensure_ascii=False), _agora(), no_id))


# ── Resolução de homônimos (sugerir e confirmar) ─────────────────────────────

def candidatos_fusao() -> list[dict]:
    """
    Sugere pares de PESSOAS que provavelmente são a mesma (homônimos/variações),
    para fusão MANUAL pelo analista. Nunca funde nada sozinho.

    Heurísticas (com score):
      - mesmo vulgo normalizado (forte)
      - um nome contido no outro (médio)
      - alta sobreposição de tokens do nome (médio)
    """
    with _conn() as con:
        rows = [_no_dict(r) for r in
                con.execute("SELECT * FROM nos WHERE tipo = 'pessoa'").fetchall()]
        contagem = {}
        for r in rows:
            c = con.execute(
                "SELECT COUNT(*) c FROM arestas WHERE origem_id = ? OR destino_id = ?",
                (r["id"], r["id"]),
            ).fetchone()["c"]
            contagem[r["id"]] = c

    def info(r):
        det = r.get("detalhes", {})
        return {
            "id": r["id"], "rotulo": r["rotulo"],
            "nome": det.get("nome"), "vulgo": det.get("vulgo"),
            "faccao": det.get("faccao_atual"), "unidade": det.get("unidade_atual"),
            "origem": r["origem"], "vinculos": contagem.get(r["id"], 0),
        }

    pares, vistos = [], set()
    for i in range(len(rows)):
        for j in range(i + 1, len(rows)):
            a, b = rows[i], rows[j]
            da, db = a.get("detalhes", {}), b.get("detalhes", {})
            va, vb = _norm(da.get("vulgo")), _norm(db.get("vulgo"))
            na, nb = _norm(da.get("nome")), _norm(db.get("nome"))
            score, motivos = 0.0, []
            if va and vb and va == vb:
                score += 0.6; motivos.append(f"mesmo vulgo «{da.get('vulgo')}»")
            if na and nb:
                if na == nb:
                    score += 0.6; motivos.append("mesmo nome")
                elif na in nb or nb in na:
                    score += 0.35; motivos.append("nome contido")
                else:
                    ta, tb = set(na.split()), set(nb.split())
                    if ta and tb:
                        inter = len(ta & tb) / len(ta | tb)
                        if inter >= 0.5:
                            score += 0.3; motivos.append("nomes semelhantes")
            if score < 0.45:
                continue
            chave = tuple(sorted([a["id"], b["id"]]))
            if chave in vistos:
                continue
            vistos.add(chave)
            pares.append({
                "a": info(a), "b": info(b),
                "score": round(min(1.0, score), 2), "motivo": "; ".join(motivos),
            })
    pares.sort(key=lambda p: p["score"], reverse=True)
    return pares


def fundir_nos(manter_id: str, fundir_id: str) -> dict:
    """Funde `fundir_id` em `manter_id` (após confirmação manual)."""
    if manter_id == fundir_id:
        return {"ok": False, "erro": "ids_iguais"}
    with _conn() as con:
        manter = con.execute("SELECT * FROM nos WHERE id = ?", (manter_id,)).fetchone()
        fundir = con.execute("SELECT * FROM nos WHERE id = ?", (fundir_id,)).fetchone()
        if not manter or not fundir:
            return {"ok": False, "erro": "no_inexistente"}

        # Religa arestas evitando self-loop e duplicatas exatas
        for col in ("origem_id", "destino_id"):
            outras = con.execute(
                f"SELECT * FROM arestas WHERE {col} = ?", (fundir_id,)
            ).fetchall()
            for ar in outras:
                novo_o = manter_id if ar["origem_id"] == fundir_id else ar["origem_id"]
                novo_d = manter_id if ar["destino_id"] == fundir_id else ar["destino_id"]
                if novo_o == novo_d:
                    con.execute("DELETE FROM arestas WHERE id = ?", (ar["id"],))
                    continue
                dup = con.execute(
                    """SELECT id FROM arestas WHERE origem_id = ? AND destino_id = ?
                       AND rotulo IS ? AND id != ?""",
                    (novo_o, novo_d, ar["rotulo"], ar["id"]),
                ).fetchone()
                if dup:
                    con.execute("DELETE FROM arestas WHERE id = ?", (ar["id"],))
                else:
                    con.execute(
                        "UPDATE arestas SET origem_id = ?, destino_id = ? WHERE id = ?",
                        (novo_o, novo_d, ar["id"]),
                    )

        con.execute("UPDATE movimentacoes SET pessoa_id = ? WHERE pessoa_id = ?",
                    (manter_id, fundir_id))

        # Mescla detalhes (mantém o principal; preenche lacunas; guarda alias)
        dm = _loads(manter["detalhes"]); df = _loads(fundir["detalhes"])
        for k, v in df.items():
            if v and not dm.get(k):
                dm[k] = v
        aliases = set(dm.get("aliases") or [])
        if fundir["rotulo"] and fundir["rotulo"] != manter["rotulo"]:
            aliases.add(fundir["rotulo"])
        if df.get("vulgo") and df.get("vulgo") != dm.get("vulgo"):
            aliases.add(df.get("vulgo"))
        if aliases:
            dm["aliases"] = sorted(aliases)
        dm.setdefault("extratos", [])
        for m in (df.get("extratos") or []):
            if m not in dm["extratos"]:
                dm["extratos"].append(m)
        con.execute("UPDATE nos SET detalhes = ?, atualizado_em = ? WHERE id = ?",
                    (json.dumps(dm, ensure_ascii=False), _agora(), manter_id))

        con.execute("DELETE FROM nos WHERE id = ?", (fundir_id,))
    return {"ok": True, "manter_id": manter_id, "fundido": fundir_id}


# ── Foto de nó (upload manual, individual por entidade) ──────────────────────

def set_foto_no(no_id: str, conteudo: bytes, ext: str = "jpg") -> dict | None:
    """Anexa/atualiza a foto de QUALQUER nó (manual ou automático)."""
    no = buscar_no(no_id)
    if not no:
        return None
    ext = (ext or "jpg").lower().lstrip(".")
    if ext == "jpeg":
        ext = "jpg"
    if ext not in _FOTO_EXTS:
        ext = "jpg"
    # remove fotos anteriores (qualquer extensão)
    for e in _FOTO_EXTS:
        p = os.path.join(FOTOS_DIR, f"{no_id}.{e}")
        if os.path.exists(p):
            try:
                os.remove(p)
            except Exception:
                pass
    with open(os.path.join(FOTOS_DIR, f"{no_id}.{ext}"), "wb") as f:
        f.write(conteudo)
    det = no.get("detalhes") or {}
    det["foto"] = f"{no_id}.{ext}"
    det["foto_url"] = f"/api/grafo/no/{no_id}/foto"
    return atualizar_no(no_id, {"detalhes": det})


def remover_foto_no(no_id: str) -> dict | None:
    no = buscar_no(no_id)
    if not no:
        return None
    for e in _FOTO_EXTS:
        p = os.path.join(FOTOS_DIR, f"{no_id}.{e}")
        if os.path.exists(p):
            try:
                os.remove(p)
            except Exception:
                pass
    det = no.get("detalhes") or {}
    det.pop("foto", None)
    det.pop("foto_url", None)
    return atualizar_no(no_id, {"detalhes": det})


def foto_path_no(no_id: str) -> str | None:
    for e in _FOTO_EXTS:
        p = os.path.join(FOTOS_DIR, f"{no_id}.{e}")
        if os.path.exists(p):
            return p
    return None


# Inicializa o banco ao importar
init_db()
