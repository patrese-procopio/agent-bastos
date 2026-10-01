"""
internal_search.py — Busca de pessoa nas bases INTERNAS do Agent Bastos
Agent Bastos | Segurança Pública/Corporativa

Fontes consultadas (cada uma só se o usuário tiver o módulo correspondente):
  lista_negra     → planilha da Lista Negra (Drive)         módulo "lista_negra"
  liderancas      → liderancas.db (unidades + líderes rua)  módulo "alertas"
  referencias     → índice de documentos + texto integral    módulo "referencias"
                    dos documentos indexados (ChromaDB)
  receita_cnpj    → sócios PF da base aberta de CNPJ (local)  módulo "osint"
  tse             → candidaturas e bens declarados (local)    módulo "osint"
  djen            → publicações judiciais por nome (CNJ, EXTERNA) módulo "osint"
  querido_diario  → menções em diários oficiais municipais (EXT.)  módulo "osint"

NÃO escreve em nenhuma base e NÃO cria nós/arestas no grafo de vínculos —
o grafo é reservado a alvos criminais.

Cada achado traz `confianca` (0-100), `nivel` (confirmado/provavel/possivel)
e `motivos` explicando por que foi considerado. Achados cujo CPF CONFLITA com o
CPF pesquisado são descartados (homônimo comprovado) e só contabilizados.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import time
import unicodedata
from typing import Any

from .models import OsintRequest

_STOP = {"DE", "DA", "DO", "DAS", "DOS", "E"}

# Módulo exigido de cada fonte (mesmos gates dos routers de origem)
MODULO_FONTE = {
    "lista_negra": "lista_negra",
    "liderancas": "alertas",
    "referencias": "referencias",
    "receita_cnpj": "osint",
    "tse": "osint",
    "djen": "osint",
    "querido_diario": "osint",
}


# ─────────────────────────────────────────────
# NORMALIZAÇÃO E MATCH DE NOME
# ─────────────────────────────────────────────

def _norm(s: str | None) -> str:
    s = unicodedata.normalize("NFKD", str(s or ""))
    s = "".join(c for c in s if not unicodedata.combining(c)).upper()
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", " ", s)).strip()


def _tokens(s: str | None) -> list[str]:
    return [t for t in _norm(s).split() if t not in _STOP]


def _digitos(s: str | None) -> str:
    return re.sub(r"\D", "", str(s or ""))


def _nivel_nome(consulta: str, candidato: str) -> tuple[str, int] | None:
    """Compara dois nomes. Retorna (rótulo, pontos) ou None se não casam."""
    qt, ct = _tokens(consulta), _tokens(candidato)
    if not qt or not ct:
        return None
    if qt == ct:
        return "nome idêntico", 70
    if len(qt) >= 2 and len(ct) >= 2:
        sq, sc = set(qt), set(ct)
        if sq <= sc or sc <= sq:
            return "nome contido (um contém o outro)", 55
        if qt[0] == ct[0] and qt[-1] == ct[-1]:
            return "primeiro e último nome iguais", 35
    return None


def _classificar(pontos: int) -> str:
    if pontos >= 90:
        return "confirmado"
    if pontos >= 55:
        return "provavel"
    return "possivel"


def _achado(fonte: str, titulo: str, pontos: int, motivos: list[str],
            dados: dict[str, Any]) -> dict[str, Any]:
    pontos = max(0, min(100, pontos))
    return {
        "fonte": fonte,
        "titulo": titulo,
        "confianca": pontos,
        "nivel": _classificar(pontos),
        "motivos": motivos,
        "dados": dados,
    }


def _mascarar_cpf(cpf: str) -> str:
    d = _digitos(cpf)
    return f"{d[:3]}.***.***-**" if len(d) >= 3 else ""


# ─────────────────────────────────────────────
# LISTA NEGRA
# ─────────────────────────────────────────────

_LN_TTL = 600.0
_ln_cache: dict[str, Any] = {"ts": 0.0, "regs": []}


def _lista_negra_bruta() -> list[dict]:
    """Registros com CPF completo — uso EXCLUSIVO interno; nunca devolver cru."""
    agora = time.monotonic()
    if _ln_cache["regs"] and agora - _ln_cache["ts"] < _LN_TTL:
        return _ln_cache["regs"]
    from routers.referencias_router import _ler_lista_negra
    regs = _ler_lista_negra(mascarar=False)
    _ln_cache.update(ts=agora, regs=regs)
    return regs


def _buscar_lista_negra(req: OsintRequest) -> tuple[list[dict], int]:
    achados, descartados = [], 0
    cpf_q = req.cpf or ""
    for r in _lista_negra_bruta():
        cpf_r = _digitos(r.get("cpf"))
        pontos, motivos = 0, []

        if cpf_q and len(cpf_r) == 11:
            if cpf_r == cpf_q:
                pontos, motivos = 100, ["CPF idêntico"]
            else:
                if req.nome and _nivel_nome(req.nome, r.get("nome", "")):
                    descartados += 1  # mesmo nome, CPF diferente = homônimo
                continue
        if not pontos:
            if not req.nome:
                continue
            m = _nivel_nome(req.nome, r.get("nome", ""))
            if not m:
                continue
            pontos, motivos = m[1], [m[0]]
            if cpf_q and len(cpf_r) != 11:
                motivos.append("registro sem CPF — não foi possível confirmar")

        achados.append(_achado(
            "lista_negra",
            f"Lista Negra — {r.get('nome', '')}",
            pontos, motivos,
            {
                "nome": r.get("nome"), "cpf": _mascarar_cpf(cpf_r),
                "situacao": r.get("situacao"), "unidade": r.get("unidade"),
                "empresa": r.get("empresa"), "data": r.get("data"),
                "numero": r.get("numero"), "referencia": r.get("referencia"),
                "descricao": r.get("descricao"), "ano": r.get("ano"),
            },
        ))
    return achados, descartados


# ─────────────────────────────────────────────
# LIDERANÇAS (unidades prisionais + líderes de rua)
# ─────────────────────────────────────────────

def _buscar_liderancas(req: OsintRequest) -> tuple[list[dict], int]:
    from config.paths import DB_LIDERANCAS
    if not req.nome or not os.path.exists(DB_LIDERANCAS):
        return [], 0

    con = sqlite3.connect(f"file:{DB_LIDERANCAS}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    try:
        unidade = con.execute(
            "SELECT unidade, pavilhao, ala, cela, faccao, cargo, nome, vulgo, "
            "observacao, competencia FROM liderancas "
            "WHERE nome IS NOT NULL AND nome != '' ORDER BY competencia DESC"
        ).fetchall()
        try:
            rua = con.execute(
                "SELECT l.cargo, l.nome, l.vulgo, l.status, l.observacao, f.nome AS faccao "
                "FROM lideres_rua l LEFT JOIN faccoes_rua f ON f.id = l.faccao_id "
                "WHERE l.nome IS NOT NULL AND l.nome != ''"
            ).fetchall()
        except sqlite3.Error:
            rua = []
    finally:
        con.close()

    achados: list[dict] = []
    vistos: dict[tuple, dict] = {}

    def _casar(nome_r, vulgo_r):
        m = _nivel_nome(req.nome, nome_r)
        if m:
            return m
        if vulgo_r and _norm(vulgo_r) == _norm(req.nome):
            return "coincide com o vulgo", 45
        return None

    for r in unidade:
        m = _casar(r["nome"], r["vulgo"])
        if not m:
            continue
        # um achado por pessoa; competências antigas viram histórico
        chave = ("u", _norm(r["nome"]), _norm(r["vulgo"]))
        loc = {k: r[k] for k in ("unidade", "pavilhao", "ala", "cela", "competencia")}
        if chave in vistos:
            vistos[chave]["dados"]["historico"].append(loc)
            continue
        a = _achado(
            "liderancas", f"Liderança (unidade) — {r['nome']}", m[1], [m[0]],
            {"nome": r["nome"], "vulgo": r["vulgo"], "faccao": r["faccao"],
             "cargo": r["cargo"], "observacao": r["observacao"],
             "atual": loc, "historico": []},
        )
        vistos[chave] = a
        achados.append(a)

    for r in rua:
        m = _casar(r["nome"], r["vulgo"])
        if not m:
            continue
        achados.append(_achado(
            "liderancas", f"Liderança (rua) — {r['nome']}", m[1], [m[0]],
            {"nome": r["nome"], "vulgo": r["vulgo"], "faccao": r["faccao"],
             "cargo": r["cargo"], "status": r["status"],
             "observacao": r["observacao"]},
        ))
    # Lideranças não guardam CPF/filiação: só dá para casar por nome/vulgo.
    if req.cpf or req.nome_mae or req.data_nascimento:
        for a in achados:
            a["motivos"].append("base sem CPF/filiação — confirmar manualmente")
    return achados, 0


# ─────────────────────────────────────────────
# REFERÊNCIAS (índice + texto integral)
# ─────────────────────────────────────────────

_chroma_col: Any = None


def _colecao_chroma():
    global _chroma_col
    if _chroma_col is not None:
        return _chroma_col
    from config.paths import DATA_DIR
    chroma_dir = str(DATA_DIR / "chroma_db")
    if not os.path.isdir(chroma_dir):
        return None
    try:
        import chromadb
        client = chromadb.PersistentClient(path=chroma_dir)
        nomes = [c.name for c in client.list_collections()]
        if not nomes:
            return None
        _chroma_col = client.get_collection("langchain" if "langchain" in nomes else nomes[0])
    except Exception:
        return None
    return _chroma_col


def _indice_docs() -> list[dict]:
    from config.paths import BASE_DIR
    for p in (BASE_DIR / "scripts" / "indice_documentos.json", BASE_DIR / "indice_documentos.json"):
        if p.exists():
            try:
                with open(p, encoding="utf-8") as f:
                    return json.load(f).get("documentos", [])
            except Exception:
                return []
    return []


def _fmt_cpf(d: str) -> str:
    return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}"


def _variantes_data(iso: str) -> list[str]:
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", iso or "")
    return [f"{m[3]}/{m[2]}/{m[1]}", f"{m[3]}.{m[2]}.{m[1]}"] if m else []


def _buscar_referencias(req: OsintRequest) -> tuple[list[dict], int]:
    achados: list[dict] = []

    # 1) Índice (assunto do documento)
    if req.nome:
        alvo = _norm(req.nome)
        if len(alvo) >= 5:
            for d in _indice_docs():
                if f" {alvo} " in f" {_norm(d.get('assunto'))} ":
                    achados.append(_achado(
                        "referencias",
                        f"{(d.get('tipo') or 'Documento').upper()} {d.get('numero', '')}/{d.get('ano', '')}".strip(),
                        50, ["nome citado no assunto do documento"],
                        {"tipo": d.get("tipo"), "numero": d.get("numero"),
                         "ano": d.get("ano"), "assunto": d.get("assunto"),
                         "origem": "indice"},
                    ))

    # 2) Texto integral (ChromaDB). $contains diferencia maiúsculas → variantes.
    col = _colecao_chroma()
    if col is None:
        return achados, 0

    termos: list[tuple[str, str]] = []  # (termo, tipo)
    if req.cpf:
        termos += [(_fmt_cpf(req.cpf), "cpf"), (req.cpf, "cpf")]
    if req.nome and len(_norm(req.nome)) >= 5:
        base = req.nome.strip()
        for v in dict.fromkeys([base, base.upper(), base.title()]):
            termos.append((v, "nome"))

    vistos: set[str] = set()
    for termo, tipo in termos:
        try:
            res = col.get(where_document={"$contains": termo},
                          include=["documents", "metadatas"], limit=25)
        except Exception:
            continue
        for texto, meta in zip(res.get("documents") or [], res.get("metadatas") or []):
            meta = meta or {}
            fonte = meta.get("fonte") or meta.get("source") or "documento"
            texto = texto or ""
            chave = f"{fonte}|{tipo}"
            if chave in vistos:
                continue
            vistos.add(chave)

            pontos, motivos = (95, ["CPF encontrado no texto"]) if tipo == "cpf" else (45, ["nome citado no texto"])
            low = _norm(texto)
            if tipo == "nome":
                if req.nome_mae and _norm(req.nome_mae) in low:
                    pontos += 25; motivos.append("nome da mãe no mesmo trecho")
                if req.nome_pai and _norm(req.nome_pai) in low:
                    pontos += 15; motivos.append("nome do pai no mesmo trecho")
                for v in _variantes_data(req.data_nascimento or ""):
                    if v in texto:
                        pontos += 25; motivos.append("data de nascimento no mesmo trecho"); break
                if req.cpf:
                    cpf_txt = re.findall(r"\d{3}\.?\d{3}\.?\d{3}-?\d{2}", texto)
                    if any(_digitos(c) != req.cpf for c in cpf_txt):
                        pontos -= 20; motivos.append("trecho traz outro CPF — possível homônimo")

            idx = texto.upper().find(termo.upper())
            trecho = texto[max(0, idx - 100): idx + 220].strip() if idx >= 0 else texto[:260]
            achados.append(_achado(
                "referencias", os.path.basename(str(fonte)), pontos, motivos,
                {"arquivo": os.path.basename(str(fonte)), "trecho": trecho,
                 "termo": termo if tipo == "nome" else "CPF", "origem": "texto"},
            ))
    return achados, 0


# ─────────────────────────────────────────────
# RECEITA FEDERAL — sócios PF (base aberta local)
# ─────────────────────────────────────────────

def _buscar_receita(req: OsintRequest):
    from . import receita_cnpj as R
    r = R.buscar_socios(req)
    if r["status"] in ("nao_carregada", "nao_aplicavel"):
        return [], 0, r["status"]

    achados = []
    for h in r["achados"]:
        achados.append(_achado(
            "receita_cnpj",
            f"Sócio — CNPJ {h['cnpj_matriz']}",
            h["pontos"], h["motivos"],
            {"nome": h["nome"], "cnpj": h["cnpj_matriz"], "qualificacao": h["qualificacao"],
             "data_entrada": h["data_entrada"], "cnpj_basico": h["cnpj_basico"]},
        ))

    # Detalhes da empresa só para quem vale a pena (e nunca p/ nome comum sem CPF,
    # senão enumeraríamos empresas de homônimos)
    if not r.get("comum"):
        alvos = [a for a in achados if a["confianca"] >= 55][:8]
        if alvos:
            from concurrent.futures import ThreadPoolExecutor
            with ThreadPoolExecutor(max_workers=4) as ex:
                dets = list(ex.map(lambda a: R.detalhes_empresa(R.cnpj_matriz(a["dados"]["cnpj_basico"])), alvos))
            for a, d in zip(alvos, dets):
                if d:
                    a["dados"].update({
                        "empresa": d.get("razao_social"), "situacao": d.get("situacao"),
                        "uf": d.get("uf"), "municipio": d.get("municipio"),
                        "atividade": d.get("atividade"), "abertura": d.get("data_abertura"),
                        "capital_social": d.get("capital_social"),
                        "outros_socios": ", ".join(x for x in d.get("socios", [])
                                                   if R.norm(x) != R.norm(a["dados"]["nome"]))[:300] or None,
                    })
                    a["titulo"] = f"Sócio — {d.get('razao_social') or a['titulo']}"
    return achados, r["descartados"], None


# ─────────────────────────────────────────────
# TSE — candidaturas e bens declarados (base aberta local)
# ─────────────────────────────────────────────

def _buscar_tse(req: OsintRequest):
    from . import tse as T
    r = T.buscar_candidaturas(req)
    if r["status"] in ("nao_carregada", "nao_aplicavel"):
        return [], 0, r["status"]
    achados = [
        _achado("tse", f"TSE — {h['nome']}", h["pontos"], h["motivos"],
                {"nome": h["nome"], "cpf": h["cpf"], "nascimento": h["dt_nasc"],
                 "candidaturas": h["candidaturas"]})
        for h in r["achados"]
    ]
    return achados, r["descartados"], None


# ─────────────────────────────────────────────
# DJEN — publicações judiciais por nome (CNJ; fonte externa)
# ─────────────────────────────────────────────

def _buscar_djen(req: OsintRequest):
    from . import djen as D
    r = D.buscar_publicacoes(req)
    if r["status"] == "nao_aplicavel":
        return [], 0, "nao_aplicavel"
    achados = []
    for h in r["achados"]:
        achados.append(_achado(
            "djen", f"{h['tribunal']} — {h['classe'] or 'Processo'} {h['processo']}",
            h["pontos"], h["motivos"],
            {k: h[k] for k in ("processo", "tribunal", "orgao", "classe", "polo", "parte",
                               "criminal", "primeira", "ultima", "publicacoes", "tipos",
                               "advogados", "outras_partes", "trecho")}))
    return achados, r["descartados"], None


# ─────────────────────────────────────────────
# QUERIDO DIÁRIO — diários oficiais municipais (fonte externa)
# ─────────────────────────────────────────────

def _buscar_querido_diario(req: OsintRequest):
    from . import querido_diario as Q
    r = Q.buscar_diarios(req)
    if r["status"] == "nao_aplicavel":
        return [], 0, "nao_aplicavel"
    achados = []
    for h in r["achados"]:
        achados.append(_achado(
            "querido_diario",
            f"Diário Oficial — {h['municipio']}/{h['uf']} · {h['data']}",
            h["pontos"], h["motivos"],
            {k: h[k] for k in ("municipio", "uf", "data", "edicao", "ato", "url", "trecho")}))
    return achados, r["descartados"], None


# ─────────────────────────────────────────────
# ORQUESTRAÇÃO
# ─────────────────────────────────────────────

_BUSCADORES = {
    "lista_negra": _buscar_lista_negra,
    "liderancas": _buscar_liderancas,
    "referencias": _buscar_referencias,
    "receita_cnpj": _buscar_receita,
    "tse": _buscar_tse,
    "djen": _buscar_djen,
    "querido_diario": _buscar_querido_diario,
}


def _rodar(nome: str, fn, req: OsintRequest, user_modules: list[str]) -> tuple[str, list, dict]:
    if MODULO_FONTE[nome] not in user_modules:
        return nome, [], {"status": "sem_permissao", "total": 0, "descartados_homonimo": 0}
    t0 = time.monotonic()
    try:
        saida = fn(req)
        res, desc = saida[0], saida[1]
        override = saida[2] if len(saida) > 2 else None  # ex.: base não carregada
        return nome, res, {"status": override or ("ok" if res else "vazio"), "total": len(res),
                           "descartados_homonimo": desc,
                           "ms": round((time.monotonic() - t0) * 1000)}
    except Exception as exc:  # fonte quebrada não pode parecer "sem registro"
        return nome, [], {"status": "erro", "total": 0, "descartados_homonimo": 0,
                          "erro": str(exc)[:200], "ms": round((time.monotonic() - t0) * 1000)}


def buscar_internas(req: OsintRequest, user_modules: list[str]) -> dict[str, Any]:
    """
    Executa as buscas permitidas ao usuário, em paralelo (síncrono — chamar via
    asyncio.to_thread). Nunca levanta: falha de uma fonte vira status "erro".
    """
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=len(_BUSCADORES)) as ex:
        futs = [ex.submit(_rodar, n, fn, req, user_modules) for n, fn in _BUSCADORES.items()]
        saidas = [f.result() for f in futs]
    achados: list[dict] = []
    fontes: dict[str, dict] = {}
    for nome, res, st in saidas:  # ordem estável das fontes
        achados.extend(res)
        fontes[nome] = st
    achados.sort(key=lambda a: a["confianca"], reverse=True)
    return {"achados": achados, "fontes": fontes}
