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
  diario_am       → Diário Oficial do Estado do Amazonas (EXT.)   módulo "osint"
  pep_cgu         → PEPs (CGU, local)                              módulo "osint"
  sancoes_cgu     → CEIS/CNEP/CEAF (CGU, local) + empresas da pessoa  módulo "osint"

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
    "diario_am": "osint",
    "pep_cgu": "osint",
    "sancoes_cgu": "osint",
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

def _buscar_djen(req: OsintRequest, ctx: dict | None = None):
    from . import djen as D
    r = D.buscar_publicacoes(req, ufs=(ctx or {}).get("principais") or None)
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

def _buscar_querido_diario(req: OsintRequest, ctx: dict | None = None):
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
# DOE-AM — Diário Oficial do Estado do Amazonas (fonte externa)
# ─────────────────────────────────────────────

def _buscar_diario_am(req: OsintRequest, ctx: dict | None = None):
    from . import diario_am as DA
    r = DA.buscar_diario_am(req)
    if r["status"] == "nao_aplicavel":
        return [], 0, "nao_aplicavel"
    achados = []
    for h in r["achados"]:
        achados.append(_achado(
            "diario_am", f"DOE-AM {h['data']} — {h['materia'] or 'matéria'}",
            h["pontos"], h["motivos"],
            {k: h[k] for k in ("data", "edicao", "pagina", "caderno", "materia", "orgao",
                               "ato", "seap", "url", "trecho")}))
    return achados, r["descartados"], None


# ─────────────────────────────────────────────
# PEP e SANÇÕES (CGU) — bases locais
# ─────────────────────────────────────────────

def _achado_cgu(fonte: str, h: dict, titulo: str) -> dict:
    return _achado(fonte, titulo, h["pontos"], h["motivos"],
                   {k: h.get(k) for k in ("lista", "tipo", "nome", "cnpj", "linhas", "total_registros", "orgaos", "ufs")})


def _buscar_pep(req: OsintRequest):
    from . import sancoes_cgu as S
    r = S.buscar_pessoa(req, ("pep",))
    if r["status"] in ("nao_carregada", "nao_aplicavel"):
        return [], 0, r["status"]
    return [_achado_cgu("pep_cgu", h, f"PEP — {h['nome']}") for h in r["achados"]], r["descartados"], None


def _buscar_sancoes(req: OsintRequest, vinculos: list[dict] | None = None):
    """CEIS/CNEP/CEAF da pessoa + CEIS/CNEP das empresas em que ela é sócia (vínculos vindos da Receita)."""
    from . import sancoes_cgu as S
    r = S.buscar_pessoa(req, ("ceis", "cnep", "ceaf"))
    if r["status"] == "nao_carregada":
        return [], 0, "nao_carregada"
    achados = [] if r["status"] == "nao_aplicavel" else \
        [_achado_cgu("sancoes_cgu", h, f"{h['lista']} — {h['nome']}") for h in r["achados"]]
    for h in S.buscar_empresas(vinculos or [])["achados"]:
        achados.append(_achado_cgu("sancoes_cgu", h, f"{h['lista']} (empresa vinculada) — {h['nome']}"))
    status = "nao_aplicavel" if (r["status"] == "nao_aplicavel" and not achados) else None
    return achados, r.get("descartados", 0), status


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
    "diario_am": _buscar_diario_am,
    "pep_cgu": _buscar_pep,
    "sancoes_cgu": _buscar_sancoes,
}


# Fontes externas: rodam DEPOIS das locais, já com o contexto cruzado
_EXTERNAS = {"djen", "querido_diario", "diario_am"}
# Local que depende do resultado de outra fonte local (empresas da Receita)
_DEPENDENTES = {"sancoes_cgu"}
UF_AGENCIA = (os.getenv("OSINT_UF_AGENCIA") or "AM").upper()


def _rodar(nome: str, fn, req: OsintRequest, user_modules: list[str], ctx: Any = None):
    if MODULO_FONTE[nome] not in user_modules:
        return nome, [], {"status": "sem_permissao", "total": 0, "descartados_homonimo": 0}
    t0 = time.monotonic()
    try:
        saida = fn(req, ctx) if (nome in _EXTERNAS or nome in _DEPENDENTES) else fn(req)
        res, desc = saida[0], saida[1]
        override = saida[2] if len(saida) > 2 else None  # ex.: base não carregada
        return nome, res, {"status": override or ("ok" if res else "vazio"), "total": len(res),
                           "descartados_homonimo": desc,
                           "ms": round((time.monotonic() - t0) * 1000)}
    except Exception as exc:  # fonte quebrada não pode parecer "sem registro"
        return nome, [], {"status": "erro", "total": 0, "descartados_homonimo": 0,
                          "erro": str(exc)[:200], "ms": round((time.monotonic() - t0) * 1000)}


# ─────────────────────────────────────────────
# CONTEXTO CRUZADO ENTRE FONTES
# ─────────────────────────────────────────────

def derivar_contexto(achados: list[dict]) -> dict[str, Any]:
    """
    Deduz onde a pessoa atua a partir dos achados locais JÁ identificados
    (confirmado=peso 3, provável=2; "possível" não conta, pode ser homônimo):
      TSE → UF das candidaturas · Receita → UF das empresas · Lista Negra/Lideranças → UF da agência.
    Se UM único achado do TSE for "confirmado", adota o nascimento dele.
    """
    from .geo import UFS
    pesos: dict[str, int] = {}
    fontes: list[str] = []
    nasc_tse: list[str] = []

    def somar(uf: str | None, w: int, fonte: str):
        if uf and uf.upper() in UFS:
            pesos[uf.upper()] = pesos.get(uf.upper(), 0) + w
            if fonte not in fontes:
                fontes.append(fonte)

    for a in achados:
        w = {"confirmado": 3, "provavel": 2}.get(a["nivel"], 0)
        if not w:
            continue
        d = a["dados"]
        if a["fonte"] == "tse":
            for uf in {c.get("uf") for c in d.get("candidaturas", [])}:
                somar(uf, w, "TSE")
            if a["nivel"] == "confirmado" and d.get("nascimento"):
                nasc_tse.append(d["nascimento"])
        elif a["fonte"] == "receita_cnpj":
            somar(d.get("uf"), w, "Receita")
        elif a["fonte"] in ("lista_negra", "liderancas"):
            somar(UF_AGENCIA, w, "Lista Negra" if a["fonte"] == "lista_negra" else "Lideranças")

    maximo = max(pesos.values(), default=0)
    principais = sorted((uf for uf, w in pesos.items() if w >= max(2, maximo / 2)), key=lambda u: -pesos[u])
    return {
        "ufs": pesos, "principais": principais, "forte": maximo >= 3, "fontes": fontes,
        "nascimento": nasc_tse[0] if len(nasc_tse) == 1 else None,
    }


def _ufs_do_achado(a: dict) -> set[str]:
    d = a["dados"]
    if a["fonte"] == "djen":
        from .geo import ufs_do_tribunal
        return ufs_do_tribunal(d.get("tribunal"))
    if a["fonte"] == "querido_diario":
        return {d["uf"]} if d.get("uf") else set()
    if a["fonte"] == "diario_am":
        return {"AM"}
    return set()


def _ajustar_por_contexto(a: dict, ctx: dict) -> None:
    """Sobe a confiança de achados na mesma UF do contexto e desce a dos de outra UF."""
    princ = set(ctx.get("principais") or [])
    uf_a = _ufs_do_achado(a)
    if not princ or not uf_a:
        return
    via = ", ".join(ctx.get("fontes") or [])
    if uf_a & princ:
        novo = a["confianca"] + 15
        if any("nome comum" in m for m in a["motivos"]):
            novo = min(novo, 50)  # UF ajuda a ordenar, mas não prova identidade de nome comum
        a["motivos"].append(f"mesma UF do contexto ({'/'.join(sorted(uf_a & princ))}, via {via})")
    elif ctx.get("forte"):
        novo = a["confianca"] - 15
        a["motivos"].append(f"UF diferente do contexto confirmado ({'/'.join(sorted(princ))}, via {via})")
    else:
        return
    a["confianca"] = max(0, min(100, novo))
    a["nivel"] = _classificar(a["confianca"])


def buscar_internas(req: OsintRequest, user_modules: list[str]) -> dict[str, Any]:
    """
    Executa as buscas permitidas ao usuário (síncrono — chamar via asyncio.to_thread).
    Fase 1: bases LOCAIS em paralelo → deriva o contexto (UF, nascimento).
    Fase 2: fontes EXTERNAS em paralelo, já com o contexto → ajusta a confiança.
    Nunca levanta: falha de uma fonte vira status "erro".
    """
    from concurrent.futures import ThreadPoolExecutor
    locais = {n: f for n, f in _BUSCADORES.items() if n not in _EXTERNAS and n not in _DEPENDENTES}
    dependentes = {n: f for n, f in _BUSCADORES.items() if n in _DEPENDENTES}
    externas = {n: f for n, f in _BUSCADORES.items() if n in _EXTERNAS}

    with ThreadPoolExecutor(max_workers=len(locais)) as ex:
        fase1 = [f.result() for f in [ex.submit(_rodar, n, fn, req, user_modules) for n, fn in locais.items()]]
    # Fase 1b: usa as empresas (Receita) já identificadas — só vínculos confirmados/prováveis
    vinculos = [{"cnpj_basico": a["dados"].get("cnpj_basico"), "empresa": a["dados"].get("empresa"), "nivel": a["nivel"]}
                for _, res, _ in fase1 for a in res
                if a["fonte"] == "receita_cnpj" and a["nivel"] in ("confirmado", "provavel")
                and a["dados"].get("cnpj_basico")]
    fase1 += [_rodar(n, fn, req, user_modules, vinculos) for n, fn in dependentes.items()]
    achados_locais = [a for _, res, _ in fase1 for a in res]
    ctx = derivar_contexto(achados_locais)

    req2, adotado = req, None
    if ctx["nascimento"] and not req.data_nascimento:
        req2 = req.model_copy(update={"data_nascimento": ctx["nascimento"]})
        adotado = ctx["nascimento"]
    ctx["nascimento_adotado"] = adotado

    with ThreadPoolExecutor(max_workers=len(externas)) as ex:
        fase2 = [f.result() for f in [ex.submit(_rodar, n, fn, req2, user_modules, ctx) for n, fn in externas.items()]]
    for _, res, _ in fase2:
        for a in res:
            _ajustar_por_contexto(a, ctx)

    saidas = {n: (res, st) for n, res, st in fase1 + fase2}
    achados: list[dict] = []
    fontes: dict[str, dict] = {}
    for nome in _BUSCADORES:  # ordem estável das fontes
        res, st = saidas[nome]
        achados.extend(res)
        fontes[nome] = st
    achados.sort(key=lambda a: a["confianca"], reverse=True)
    return {"achados": achados, "fontes": fontes, "contexto": ctx}
