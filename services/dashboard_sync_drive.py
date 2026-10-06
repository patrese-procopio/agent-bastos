# -*- coding: utf-8 -*-
"""
dashboard_sync_drive.py — Alimenta o Dashboard a partir das pastas anuais do Drive.

Fonte: scripts/indice_documentos.json (gerado por drive_indexer a partir das pastas
de RELINTs/RELTECs de cada ano).

REGRA ANTI-DUPLICIDADE
  Identidade do documento = (tipo, ano, número).  Ex.: RELINT 084-2025.
  O assunto NUNCA decide identidade. No Drive o mesmo relatório aparece como
  .docx + várias cópias .pdf (uma por destinatário); tudo isso vira UM documento.
  No banco existe índice ÚNICO parcial (tipo_id, ano, numero_doc), então mesmo
  uma corrida/reexecução não consegue gravar o mesmo número duas vezes.

REGRA DE ATRIBUIÇÃO
  RELINT → núcleo NI    |    RELTEC → núcleo NCI   (definido pelo usuário).

O que NÃO é importado automaticamente (vai para "revisar"):
  - mesmo número com assuntos realmente diferentes (possível colisão de numeração);
  - documento sem mês identificável.
"""

import json
import re
import sqlite3
import subprocess
import sys
import threading
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
INDICE_PATH = BASE_DIR / "scripts" / "indice_documentos.json"

TIPOS_SYNC = ("RELINT", "RELTEC")
NUCLEO_POR_TIPO = {"RELINT": "NI", "RELTEC": "NCI"}

_MESES = {"janeiro": 1, "fevereiro": 2, "marco": 3, "abril": 4, "maio": 5, "junho": 6, "julho": 7,
          "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12}

_RX_NUM_ANO = re.compile(r"(\d{1,4})\s*[-/]\s*(20\d{2})")


def _sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s or "") if not unicodedata.combining(c))


def _norm_txt(s: str) -> str:
    s = _sem_acento(s).lower()
    s = re.sub(r"^(aipen[\s_-]*seap[\s_-]*am|ni[\s_-]*dipen|dipen[\s_-]*seap|seap[\s_-]*am)\s*[-–]?\s*", "", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _mes_de_nome(nome: str | None) -> int | None:
    if not nome:
        return None
    return _MESES.get(_sem_acento(nome).strip().lower())


def _mes_de_data(dm: str | None) -> int | None:
    try:
        return datetime.strptime((dm or "")[:10], "%d/%m/%Y").month
    except Exception:
        return None


# ── Schema (idempotente) ─────────────────────────────────────────────────────

def numero_chave(nome_arquivo: str, tipo_codigo: str, ano: int) -> str | None:
    """Extrai o número (3 dígitos) de nomes como 'RELINT Nº 084-2025-AIPEN-SEAP-AM'.
    Só vale se o ano do nome coincide com o ano informado."""
    if tipo_codigo not in TIPOS_SYNC:
        return None
    m = _RX_NUM_ANO.search(nome_arquivo or "")
    if not m or int(m.group(2)) != int(ano):
        return None
    return m.group(1).zfill(3)


def garantir_schema(conn: sqlite3.Connection) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(documentos)").fetchall()}
    for col, ddl in (("numero_doc", "TEXT"), ("origem", "TEXT DEFAULT 'manual'"), ("drive_file_id", "TEXT"),
                     ("lote_sync", "TEXT")):
        if col not in cols:
            conn.execute(f"ALTER TABLE documentos ADD COLUMN {col} {ddl}")
    # Backfill do número para lançamentos manuais antigos
    rows = conn.execute(
        "SELECT d.id, d.nome_arquivo, d.ano, t.codigo FROM documentos d "
        "JOIN tipos_documento t ON t.id = d.tipo_id WHERE d.numero_doc IS NULL").fetchall()
    vistos = {(r[0], r[1], r[2]) for r in conn.execute(
        "SELECT tipo_id, ano, numero_doc FROM documentos WHERE numero_doc IS NOT NULL")}
    tipo_id = {r[1]: r[0] for r in conn.execute("SELECT id, codigo FROM tipos_documento")}
    for did, nome, ano, cod in rows:
        num = numero_chave(nome, cod, ano)
        if not num:
            continue
        chave = (tipo_id[cod], ano, num)
        if chave in vistos:        # duplicata antiga: não marca, para não quebrar o índice único
            continue
        vistos.add(chave)
        conn.execute("UPDATE documentos SET numero_doc=? WHERE id=?", (num, did))
    conn.execute("UPDATE documentos SET origem='manual' WHERE origem IS NULL")
    conn.execute("""CREATE TABLE IF NOT EXISTS sync_lotes (
        id TEXT PRIMARY KEY, criado_em TEXT NOT NULL, usuario TEXT, anos TEXT,
        inseridos INTEGER NOT NULL DEFAULT 0, desfeito_em TEXT, desfeito_por TEXT)""")
    # Números excluídos à mão depois de importados: a sincronização não os traz de volta.
    conn.execute("""CREATE TABLE IF NOT EXISTS sync_ignorados (
        tipo_id INTEGER NOT NULL, ano INTEGER NOT NULL, numero_doc TEXT NOT NULL,
        excluido_em TEXT NOT NULL, usuario TEXT, PRIMARY KEY (tipo_id, ano, numero_doc))""")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_doc_tipo_num_ano "
                 "ON documentos(tipo_id, ano, numero_doc) WHERE numero_doc IS NOT NULL")
    conn.commit()


# ── Leitura e consolidação do índice ─────────────────────────────────────────

def ler_indice() -> dict:
    if not INDICE_PATH.exists():
        return {"gerado_em": None, "documentos": []}
    return json.loads(INDICE_PATH.read_text(encoding="utf-8"))


def anos_disponiveis(indice: dict | None = None) -> list[int]:
    indice = indice or ler_indice()
    return sorted({int(d["ano"]) for d in indice.get("documentos", [])
                   if d.get("classificado") and d.get("tipo") in TIPOS_SYNC and str(d.get("ano", "")).isdigit()})


def _consolidar(indice: dict, anos: list[int]) -> dict:
    """{(tipo, ano, numero): {...documento único...}} — uma entrada por número."""
    grupos: dict = defaultdict(list)
    for d in indice.get("documentos", []):
        if not d.get("classificado") or d.get("tipo") not in TIPOS_SYNC:
            continue
        try:
            ano = int(d["ano"])
        except Exception:
            continue
        if ano not in anos or not d.get("numero"):
            continue
        grupos[(d["tipo"], ano, str(d["numero"]).zfill(3))].append(d)

    out = {}
    for (tipo, ano, num), arqs in grupos.items():
        docx = [a for a in arqs if (a.get("formato") or "").lower() in ("docx", "doc")]
        base = (docx or sorted(arqs, key=lambda a: len(a.get("assunto") or "")))[0]
        canon = _norm_txt(base.get("assunto"))[:40]

        divergentes = []
        for a in arqs:
            n = _norm_txt(a.get("assunto"))[:40]
            if canon and n and SequenceMatcher(None, canon, n).ratio() < 0.8 \
               and not n.startswith(canon[:20]) and not canon.startswith(n[:20]):
                divergentes.append(a.get("assunto"))

        meses = [m for m in (_mes_de_nome(a.get("mes")) for a in arqs) if m]
        mes = _mes_de_nome(base.get("mes")) or (Counter(meses).most_common(1)[0][0] if meses else None)
        datas = [a.get("data_modificacao") for a in arqs if a.get("data_modificacao")]
        out[(tipo, ano, num)] = {
            "tipo": tipo, "ano": ano, "numero": num,
            "assunto": _limpar_assunto(base.get("assunto")),
            "mes": mes, "mes_estimado": False,
            "data_arquivo": base.get("data_modificacao") or (datas[0] if datas else None),
            "copias": len(arqs), "file_id": base.get("file_id"),
            "divergentes": divergentes,
        }

    # Fallback de mês pela data do arquivo — só quando a data é confiável
    # (se mais da metade das datas do ano cai no mesmo dia, foi upload em massa).
    for (tipo, ano), _ in {(k[0], k[1]): 1 for k in out}.items():
        sem = [v for k, v in out.items() if k[0] == tipo and k[1] == ano and not v["mes"]]
        if not sem:
            continue
        moda = Counter(v["data_arquivo"] for v in sem).most_common(1)[0]
        confiavel = not (len(sem) >= 5 and moda[1] / len(sem) > 0.5)
        for v in sem:
            m = _mes_de_data(v["data_arquivo"])
            if confiavel and m:
                v["mes"], v["mes_estimado"] = m, True
    return out


def _limpar_assunto(t: str | None) -> str:
    """Tira o prefixo de órgão do nome do arquivo ('Aipen-Seap-Am - ...') e espaços repetidos."""
    t = re.sub(r"\s+", " ", t or "").strip()
    t = re.sub(r"^(aipen[\s_-]*seap[\s_-]*am|ni[\s_-]*dipen|dipen[\s_-]*seap|seap[\s_-]*am)\s*[-–]?\s*", "", t,
               flags=re.IGNORECASE)
    return t.strip(" -–")


def _nome_padrao(tipo: str, num: str, ano: int) -> str:
    return f"{tipo} Nº {num}-{ano}-AIPEN-SEAP-AM"


def _db(db_path: str) -> sqlite3.Connection:
    c = sqlite3.connect(db_path)
    c.row_factory = sqlite3.Row
    return c


# ── Prévia (não grava nada) ──────────────────────────────────────────────────

def previa(db_path: str, anos: list[int]) -> dict:
    indice = ler_indice()
    unicos = _consolidar(indice, anos)
    con = _db(db_path)
    try:
        garantir_schema(con)
        tipo_id = {r["codigo"]: r["id"] for r in con.execute("SELECT id, codigo FROM tipos_documento")}
        lancados = defaultdict(set)
        for r in con.execute("SELECT tipo_id, ano, numero_doc FROM documentos WHERE numero_doc IS NOT NULL"):
            lancados[(r["tipo_id"], r["ano"])].add(r["numero_doc"])
        ignorados = defaultdict(set)
        for r in con.execute("SELECT tipo_id, ano, numero_doc FROM sync_ignorados"):
            ignorados[(r["tipo_id"], r["ano"])].add(r["numero_doc"])
    finally:
        con.close()

    resumo, novos, revisar, lacunas = [], [], [], []
    for tipo in TIPOS_SYNC:
        for ano in sorted(anos):
            chaves = sorted(k for k in unicos if k[0] == tipo and k[1] == ano)
            if not chaves:
                continue
            ja = lancados.get((tipo_id.get(tipo), ano), set())
            ign = ignorados.get((tipo_id.get(tipo), ano), set())
            n_novos = n_rev = n_ja = n_ign = 0
            for k in chaves:
                v = unicos[k]
                if v["numero"] in ja:
                    n_ja += 1
                    continue
                if v["numero"] in ign:
                    n_ign += 1
                    continue
                item = {k_: v[k_] for k_ in ("tipo", "ano", "numero", "assunto", "mes", "mes_estimado", "copias")}
                item["nome"] = _nome_padrao(tipo, v["numero"], ano)
                item["nucleo"] = NUCLEO_POR_TIPO[tipo]
                if v["divergentes"]:
                    item["motivo"] = "Assuntos diferentes para o mesmo número: " + " | ".join(
                        [v["assunto"]] + v["divergentes"][:2])
                    revisar.append(item); n_rev += 1
                elif not v["mes"]:
                    item["motivo"] = "Mês não identificável no Drive"
                    revisar.append(item); n_rev += 1
                else:
                    novos.append(item); n_novos += 1
            nums = sorted(int(k[2]) for k in chaves)
            falt = [n for n in range(1, nums[-1] + 1) if n not in set(nums)]
            if falt:
                lacunas.append({"tipo": tipo, "ano": ano, "numeros": falt, "maior": nums[-1]})
            fora = sorted(n for n in ja if (tipo, ano, n) not in unicos)
            resumo.append({"tipo": tipo, "ano": ano, "nucleo": NUCLEO_POR_TIPO[tipo],
                           "no_drive": len(chaves), "ja_lancados": n_ja, "novos": n_novos,
                           "revisar": n_rev, "ignorados": n_ign, "lancados_fora_do_drive": fora})
    return {"gerado_em_indice": indice.get("gerado_em"), "anos": sorted(anos), "resumo": resumo,
            "novos": novos, "revisar": revisar, "lacunas": lacunas,
            "mes_estimado": sum(1 for n in novos if n["mes_estimado"])}


# ── Aplicação ────────────────────────────────────────────────────────────────

def aplicar(db_path: str, anos: list[int], usuario: str = "", permitir_mes_estimado: bool = True) -> dict:
    """Grava somente documentos NOVOS e SEM divergência. Idempotente."""
    indice = ler_indice()
    unicos = _consolidar(indice, anos)
    con = _db(db_path)
    inseridos = pulados_existentes = pulados_mes = pulados_revisao = pulados_ignorados = 0
    lote = datetime.now().strftime("%Y%m%d%H%M%S%f")[:17]
    try:
        garantir_schema(con)
        tipo_id = {r["codigo"]: r["id"] for r in con.execute("SELECT id, codigo FROM tipos_documento")}
        nuc_id = {r["sigla"]: r["id"] for r in con.execute("SELECT id, sigla FROM unidades WHERE tipo='nucleo'")}
        ja = {(r["tipo_id"], r["ano"], r["numero_doc"]) for r in con.execute(
            "SELECT tipo_id, ano, numero_doc FROM documentos WHERE numero_doc IS NOT NULL")}
        ign = {(r["tipo_id"], r["ano"], r["numero_doc"]) for r in con.execute(
            "SELECT tipo_id, ano, numero_doc FROM sync_ignorados")}
        for k in sorted(unicos, key=lambda x: (x[0], x[1], x[2])):
            v = unicos[k]
            if (tipo_id[v["tipo"]], v["ano"], v["numero"]) in ja:
                pulados_existentes += 1
                continue
            if (tipo_id[v["tipo"]], v["ano"], v["numero"]) in ign:
                pulados_ignorados += 1
                continue
            if v["divergentes"]:
                pulados_revisao += 1
                continue
            if not v["mes"] or (v["mes_estimado"] and not permitir_mes_estimado):
                pulados_mes += 1
                continue
            cur = con.execute(
                "INSERT OR IGNORE INTO documentos (nome_arquivo, tipo_id, nucleo_produtor_id, unidade_ref_id, "
                "ano, mes, observacao, registrado_por, numero_doc, origem, drive_file_id, lote_sync) "
                "VALUES (?,?,?,NULL,?,?,?,?,?,?,?,?)",
                (_nome_padrao(v["tipo"], v["numero"], v["ano"]), tipo_id[v["tipo"]],
                 nuc_id[NUCLEO_POR_TIPO[v["tipo"]]], v["ano"], v["mes"],
                 (v["assunto"] or "").upper(), usuario or "sync-drive", v["numero"], "drive", v["file_id"], lote))
            if cur.rowcount:
                inseridos += 1
            else:
                pulados_existentes += 1
        if inseridos:
            con.execute("INSERT INTO sync_lotes (id, criado_em, usuario, anos, inseridos) VALUES (?,?,?,?,?)",
                        (lote, datetime.now().isoformat(timespec="seconds"), usuario or "sync-drive",
                         ",".join(map(str, anos)), inseridos))
        con.commit()
    finally:
        con.close()
    return {"inseridos": inseridos, "lote": lote if inseridos else None, "ja_existiam": pulados_existentes,
            "pulados_sem_mes": pulados_mes, "pulados_para_revisao": pulados_revisao,
            "ignorados": pulados_ignorados}


# ── Desfazer / controle de lotes e exclusões ─────────────────────────────────

def listar_lotes(db_path: str, limite: int = 10) -> list[dict]:
    con = _db(db_path)
    try:
        garantir_schema(con)
        rows = con.execute(
            "SELECT l.*, (SELECT COUNT(*) FROM documentos d WHERE d.lote_sync = l.id) AS restantes "
            "FROM sync_lotes l ORDER BY l.criado_em DESC LIMIT ?", (limite,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        con.close()


def desfazer_lote(db_path: str, lote_id: str, usuario: str = "") -> dict:
    """Apaga TODOS os documentos que aquele lote lançou. Não mexe em lançamentos manuais
    nem em outros lotes. Os números voltam a aparecer como 'novos' na próxima prévia."""
    con = _db(db_path)
    try:
        garantir_schema(con)
        lote = con.execute("SELECT * FROM sync_lotes WHERE id=?", (lote_id,)).fetchone()
        if not lote:
            return {"ok": False, "erro": "lote_nao_encontrado"}
        cur = con.execute("DELETE FROM documentos WHERE lote_sync=?", (lote_id,))
        con.execute("UPDATE sync_lotes SET desfeito_em=?, desfeito_por=? WHERE id=?",
                    (datetime.now().isoformat(timespec="seconds"), usuario, lote_id))
        con.commit()
        return {"ok": True, "removidos": cur.rowcount}
    finally:
        con.close()


def registrar_exclusao(conn: sqlite3.Connection, doc_id: int, usuario: str = "") -> None:
    """Chamado ao excluir um lançamento: se veio do Drive, não será reimportado."""
    r = conn.execute("SELECT tipo_id, ano, numero_doc, origem FROM documentos WHERE id=?", (doc_id,)).fetchone()
    if r and r["origem"] == "drive" and r["numero_doc"]:
        conn.execute("INSERT OR IGNORE INTO sync_ignorados (tipo_id, ano, numero_doc, excluido_em, usuario) "
                     "VALUES (?,?,?,?,?)",
                     (r["tipo_id"], r["ano"], r["numero_doc"], datetime.now().isoformat(timespec="seconds"), usuario))


def restaurar_ignorados(db_path: str, anos: list[int]) -> int:
    con = _db(db_path)
    try:
        garantir_schema(con)
        cur = con.execute(f"DELETE FROM sync_ignorados WHERE ano IN ({','.join('?' * len(anos))})", anos)
        con.commit()
        return cur.rowcount
    finally:
        con.close()


# ── Atualização do índice do Drive (em segundo plano) ────────────────────────

_ST = {"rodando": False, "inicio": None, "fim": None, "erro": None}
_LOCK = threading.Lock()


def status_indice() -> dict:
    return {**_ST, "gerado_em": ler_indice().get("gerado_em")}


def atualizar_indice_async() -> dict:
    """Roda o indexer do Drive em subprocesso (minutos) sem travar a requisição."""
    with _LOCK:
        if _ST["rodando"]:
            return {"ok": False, "erro": "ja_rodando"}
        _ST.update(rodando=True, inicio=datetime.now().isoformat(timespec="seconds"), fim=None, erro=None)

    def _rodar():
        py = BASE_DIR / ".venv" / "Scripts" / "python.exe"
        py = str(py) if py.exists() else sys.executable
        try:
            proc = subprocess.run([py, "-X", "utf8", "-m", "drive_indexer.indexer"], cwd=str(BASE_DIR),
                                  capture_output=True, encoding="utf-8", errors="replace", timeout=1800)
            if proc.returncode != 0:
                _ST["erro"] = (proc.stderr or "")[-300:] or "falha na indexação"
        except subprocess.TimeoutExpired:
            _ST["erro"] = "tempo limite (30 min) excedido"
        except Exception as exc:
            _ST["erro"] = str(exc)
        finally:
            _ST["rodando"] = False
            _ST["fim"] = datetime.now().isoformat(timespec="seconds")

    threading.Thread(target=_rodar, daemon=True, name="dash-sync-indice").start()
    return {"ok": True}
