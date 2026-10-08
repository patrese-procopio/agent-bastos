"""
carregar_sancoes_cgu.py — Carrega PEP, CEIS, CNEP e CEAF (dados abertos da CGU) em
data/sancoes/sancoes.db, para a busca local do OSINT.

Uso (a partir de Agent_Bastos/):
  .venv\\Scripts\\python.exe -X utf8 scripts\\carregar_sancoes_cgu.py            # baixa os mais recentes
  .venv\\Scripts\\python.exe -X utf8 scripts\\carregar_sancoes_cgu.py --dir D:\\cgu   # zips já baixados

Fonte: https://portaldatransparencia.gov.br/download-de-dados/{pep,ceis,cnep,ceaf}
(download aberto, sem chave). Cada página lista UM arquivo vigente (PEP mensal; CEIS, CNEP e
CEAF diários) — o nome é lido da própria página, então o script acompanha as datas.

  PEP   → pessoas expostas politicamente (CPF mascarado ***.123.456-**)
  CEIS  → empresas e pessoas inidôneas/suspensas (CPF completo p/ PF, CNPJ p/ PJ)
  CNEP  → empresas punidas pela Lei Anticorrupção (multas)
  CEAF  → servidores expulsos da administração federal (CPF mascarado)

Total aproximado: 7 MB baixados. Atualize com a frequência desejada (CEIS/CNEP/CEAF mudam
diariamente; PEP, mensalmente) — a troca do banco é atômica.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sqlite3
import sys
import tempfile
import time
import zipfile
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from modules.osint.receita_cnpj import chave_nome, norm  # noqa: E402
from modules.osint.sancoes_cgu import DB_SANCOES  # noqa: E402

csv.field_size_limit(10_000_000)
BASE = "https://portaldatransparencia.gov.br/download-de-dados"
LISTAS = ("pep", "ceis", "cnep", "ceaf")


def _arquivo_vigente(lista: str) -> str:
    """Lê da página da CGU o nome (data) do arquivo vigente: pep→202608, ceis→20261001…"""
    import httpx
    r = httpx.get(f"{BASE}/{lista}", timeout=60, follow_redirects=True, headers={"User-Agent": "AgentBastos/1.0"})
    r.raise_for_status()
    m = re.search(r'arquivos\.push\(\{"ano" : "(\d{4})", "mes" : "(\d{2})", "dia" : "(\d{0,2})"', r.text)
    if not m:
        sys.exit(f"Não achei o arquivo vigente de {lista} na página da CGU.")
    return "".join(m.groups())


def _baixar(lista: str, destino: Path) -> str:
    import httpx
    nome = _arquivo_vigente(lista)
    with httpx.stream("GET", f"{BASE}/{lista}/{nome}", timeout=180, follow_redirects=True,
                      headers={"User-Agent": "AgentBastos/1.0"}) as r:
        r.raise_for_status()
        with open(destino, "wb") as f:
            for pedaco in r.iter_bytes(1 << 20):
                f.write(pedaco)
    return nome


def _linhas(caminho: Path):
    with zipfile.ZipFile(caminho) as z:
        for info in z.infolist():
            if not info.filename.lower().endswith(".csv"):
                continue
            with z.open(info) as f:
                rd = csv.DictReader(io.TextIOWrapper(f, encoding="latin-1", newline=""), delimiter=";", quotechar='"')
                yield from rd


def _g(r: dict, *chaves: str) -> str:
    """Primeiro valor não vazio entre colunas com acentuação/espaços variáveis."""
    mapa = {re.sub(r"\s+", " ", k).strip().upper(): v for k, v in r.items() if k}
    for c in chaves:
        v = (mapa.get(c.upper()) or "").strip()
        if v and v.lower() not in ("sem informação", "não informada", "nao informada"):
            return v
    return ""


def _doc(d: str) -> tuple[str, str, str, str]:
    """(cpf11, cpf_meio6, cnpj14, cnpj_basico8) a partir de '12345678901', '***.123.456-**' ou CNPJ."""
    dig = re.sub(r"\D", "", d or "")
    if len(dig) == 14:
        return "", "", dig, dig[:8]
    if len(dig) == 11:
        return dig, dig[3:9], "", ""
    if len(dig) == 6 and "*" in (d or ""):  # ***.531.324-** → '531324'
        return "", dig, "", ""
    return "", "", "", ""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", type=Path, help="pasta com pep.zip, ceis.zip, cnep.zip, ceaf.zip")
    ap.add_argument("--db", type=Path, default=DB_SANCOES)
    ap.add_argument("--se-novo", action="store_true",
                    help="só recarrega se saiu PEP de mês novo ou se o banco tem mais de 30 dias")
    a = ap.parse_args()

    if a.se_novo and not a.dir and a.db.exists():
        try:
            _c = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True)
            _m = dict(_c.execute("SELECT chave, valor FROM meta").fetchall())
            _c.close()
            idade = (datetime.now() - datetime.fromisoformat(_m["carregado_em"])).days
            pep_atual = json.loads(_m["arquivos"]).get("pep")
            if idade < 30 and pep_atual == _arquivo_vigente("pep"):
                print(f"já atualizado — carga de {_m['carregado_em']} (PEP {pep_atual}, {idade} dia(s))")
                return 0
        except Exception:
            pass  # sem metadados confiáveis: recarrega

    a.db.parent.mkdir(parents=True, exist_ok=True)
    tmpdb = a.db.with_suffix(".db.tmp")
    tmpdb.unlink(missing_ok=True)
    con = sqlite3.connect(tmpdb)
    con.executescript("""
        PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
        CREATE TABLE registros (
            id INTEGER PRIMARY KEY, lista TEXT NOT NULL, pf INTEGER NOT NULL,
            cpf TEXT, cpf_meio TEXT, cnpj TEXT, cnpj_basico TEXT,
            nome TEXT NOT NULL, nome_norm TEXT, chave TEXT,
            categoria TEXT, orgao TEXT, uf TEXT, esfera TEXT, inicio TEXT, fim TEXT, extra TEXT);
        CREATE TABLE meta (chave TEXT PRIMARY KEY, valor TEXT);
    """)
    tmp = Path(tempfile.mkdtemp(prefix="cgu_"))
    totais, arquivos = {}, {}

    for lista in LISTAS:
        if a.dir:
            zp = a.dir / f"{lista}.zip"
            if not zp.exists():
                print(f"[{lista}] ausente em {a.dir} — pulando"); continue
            arquivos[lista] = zp.name
        else:
            zp = tmp / f"{lista}.zip"
            arquivos[lista] = _baixar(lista, zp)
        lote = []
        for r in _linhas(zp):
            if lista == "pep":
                nome = _g(r, "NOME_PEP")
                cpf, meio, cnpj, bas = _doc(_g(r, "CPF"))
                categoria = _g(r, "DESCRIÇÃO_FUNÇÃO", "DESCRICAO_FUNCAO")
                orgao = _g(r, "NOME_ÓRGÃO", "NOME_ORGAO")
                inicio = _g(r, "DATA_INÍCIO_EXERCÍCIO", "DATA_INICIO_EXERCICIO")
                fim = _g(r, "DATA_FIM_EXERCÍCIO", "DATA_FIM_EXERCICIO")
                uf, esfera = "", ""
                extra = {"sigla": _g(r, "SIGLA_FUNÇÃO", "SIGLA_FUNCAO"), "nivel": _g(r, "NÍVEL_FUNÇÃO", "NIVEL_FUNCAO"),
                         "fim_carencia": _g(r, "DATA_FIM_CARÊNCIA", "DATA_FIM_CARENCIA")}
                pf = 1
            else:
                tipo = _g(r, "TIPO DE PESSOA")
                pf = 1 if tipo.upper() == "F" else 0
                nome = _g(r, "NOME DO SANCIONADO", "NOME INFORMADO PELO ÓRGÃO SANCIONADOR", "RAZÃO SOCIAL - CADASTRO RECEITA")
                cpf, meio, cnpj, bas = _doc(_g(r, "CPF OU CNPJ DO SANCIONADO"))
                categoria = _g(r, "CATEGORIA DA SANÇÃO")
                orgao = _g(r, "ÓRGÃO SANCIONADOR")
                uf = _g(r, "UF ÓRGÃO SANCIONADOR")
                esfera = _g(r, "ESFERA ÓRGÃO SANCIONADOR")
                inicio, fim = _g(r, "DATA INÍCIO SANÇÃO"), _g(r, "DATA FINAL SANÇÃO")
                extra = {"fundamentacao": _g(r, "FUNDAMENTAÇÃO LEGAL")[:300], "processo": _g(r, "NÚMERO DO PROCESSO"),
                         "publicacao": _g(r, "PUBLICAÇÃO"), "abrangencia": _g(r, "ABRAGÊNCIA DA SANÇÃO"),
                         "origem": _g(r, "ORIGEM INFORMAÇÕES")}
                if lista == "cnep":
                    extra["multa"] = _g(r, "VALOR DA MULTA")
                if lista == "ceaf":
                    extra.update({"cargo": _g(r, "CARGO EFETIVO"), "funcao": _g(r, "FUNÇÃO OU CARGO DE CONFIANÇA"),
                                  "lotacao": _g(r, "ÓRGÃO DE LOTAÇÃO")})
                    orgao = orgao or extra.get("lotacao", "")
            if not nome:
                continue
            nn = norm(nome)
            lote.append((lista, pf, cpf, meio, cnpj, bas, nome, nn, chave_nome(nn) if pf else None,
                         categoria, orgao, uf, esfera, inicio, fim, json.dumps(extra, ensure_ascii=False)))
            if len(lote) >= 50_000:
                con.executemany("INSERT INTO registros (lista,pf,cpf,cpf_meio,cnpj,cnpj_basico,nome,nome_norm,chave,"
                                "categoria,orgao,uf,esfera,inicio,fim,extra) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", lote)
                totais[lista] = totais.get(lista, 0) + len(lote); lote = []
        if lote:
            con.executemany("INSERT INTO registros (lista,pf,cpf,cpf_meio,cnpj,cnpj_basico,nome,nome_norm,chave,"
                            "categoria,orgao,uf,esfera,inicio,fim,extra) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", lote)
            totais[lista] = totais.get(lista, 0) + len(lote)
        con.commit()
        print(f"[{lista}] arquivo {arquivos[lista]}: {totais.get(lista, 0):,} registros", flush=True)
        if not a.dir:
            zp.unlink(missing_ok=True)

    if not totais:
        con.close(); tmpdb.unlink(missing_ok=True); sys.exit("Nada carregado.")
    con.executescript("""
        CREATE INDEX idx_reg_chave ON registros(chave);
        CREATE INDEX idx_reg_cpf   ON registros(cpf);
        CREATE INDEX idx_reg_cnpjb ON registros(cnpj_basico);
    """)
    con.executemany("INSERT INTO meta VALUES (?,?)", [
        ("carregado_em", datetime.now().isoformat(timespec="seconds")),
        ("arquivos", json.dumps(arquivos)), ("totais", json.dumps(totais))])
    con.commit(); con.execute("ANALYZE"); con.close()
    for tentativa in range(8):  # a busca pode estar com o arquivo aberto por instantes
        try:
            os.replace(tmpdb, a.db)
            break
        except PermissionError:
            time.sleep(5)
    else:
        sys.exit("Não consegui trocar o banco (arquivo em uso). O novo ficou em " + str(tmpdb))
    print(f"OK — {sum(totais.values()):,} registros em {a.db} ({a.db.stat().st_size / 1e6:.0f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
