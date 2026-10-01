"""
carregar_cnpj_receita.py — Carrega os SÓCIOS PESSOA FÍSICA da base aberta de CNPJ
(Receita Federal) em data/receita/cnpj_socios.db, para a busca local do OSINT.

Uso (a partir de Agent_Bastos/):
  # 1) a partir de uma pasta que já contém Socios0.zip … Socios9.zip
  .venv\\Scripts\\python.exe -X utf8 scripts\\carregar_cnpj_receita.py --dir D:\\receita\\2026-09

  # 2) direto do repositório público da Receita (mês mais recente; baixa 1 zip por vez
  #    e apaga após processar)
  .venv\\Scripts\\python.exe -X utf8 scripts\\carregar_cnpj_receita.py --receita
  .venv\\Scripts\\python.exe -X utf8 scripts\\carregar_cnpj_receita.py --receita --mes 2026-09

  # 3) qualquer outra URL base que sirva SocioN.zip
  .venv\\Scripts\\python.exe -X utf8 scripts\\carregar_cnpj_receita.py --url-base <URL_DO_MES>/

Opções:
  --db CAMINHO         banco de saída (padrão: data/receita/cnpj_socios.db ou $BASTOS_RECEITA_DB)
  --competencia AAAA-MM  rótulo gravado em meta (padrão: nome da pasta/ mês atual)
  --manter-zips        não apaga os zips baixados com --url-base

Espaço: o banco final fica em torno de 2-3 GB (≈20-25 milhões de sócios PF) e a
criação do índice usa ~1 GB temporário. Os zips NÃO são descompactados em disco.

Layout oficial dos Sócios (CSV ';', sem cabeçalho, latin-1):
  0 cnpj_basico | 1 identificador (1=PJ, 2=PF, 3=estrangeiro) | 2 nome | 3 cpf/cnpj mascarado
  4 qualificação | 5 data entrada | 6 país | 7 cpf rep. | 8 nome rep. | 9 qualif. rep. | 10 faixa etária
"""

from __future__ import annotations

import argparse
import csv
import io
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
from modules.osint.receita_cnpj import DB_RECEITA, chave_nome, norm  # noqa: E402

csv.field_size_limit(10_000_000)
LOTE = 200_000


def _linhas_zip(caminho: Path):
    """Gera linhas de todos os CSVs dentro do zip, sem extrair para o disco."""
    with zipfile.ZipFile(caminho) as z:
        for info in z.infolist():
            if info.is_dir():
                continue
            with z.open(info) as bruto:
                txt = io.TextIOWrapper(bruto, encoding="latin-1", newline="")
                yield from csv.reader(txt, delimiter=";", quotechar='"')


def _processar(con: sqlite3.Connection, caminho: Path) -> tuple[int, int]:
    lote, lidas, gravadas = [], 0, 0
    for row in _linhas_zip(caminho):
        lidas += 1
        if len(row) < 6 or row[1] != "2":  # só pessoa física
            continue
        nome = norm(row[2])
        chave = chave_nome(nome)
        miolo = re.sub(r"\D", "", row[3] or "")  # '***123456**' → '123456'
        if not chave or len(miolo) != 6:
            continue
        lote.append((chave, nome, miolo, (row[10] if len(row) > 10 else "") or "0",
                     row[0].zfill(8), row[4], row[5]))
        if len(lote) >= LOTE:
            con.executemany("INSERT INTO socios VALUES (?,?,?,?,?,?,?)", lote)
            gravadas += len(lote); lote = []
    if lote:
        con.executemany("INSERT INTO socios VALUES (?,?,?,?,?,?,?)", lote)
        gravadas += len(lote)
    con.commit()
    return lidas, gravadas


# Repositório público oficial (Nextcloud): o token do compartilhamento é o "usuário"
# do WebDAV, sem senha. Fonte: gov.br/receitafederal → Dados Públicos CNPJ.
RECEITA_HOST = "https://arquivos.receitafederal.gov.br"
RECEITA_TOKEN = "YggdBLfdninEJX9"
RECEITA_WEBDAV = f"{RECEITA_HOST}/public.php/webdav/"


def _ultimo_mes_receita() -> str:
    import httpx
    r = httpx.request("PROPFIND", RECEITA_WEBDAV, auth=(RECEITA_TOKEN, ""),
                      headers={"Depth": "1"}, timeout=60)
    r.raise_for_status()
    meses = sorted(set(re.findall(r"/webdav/(\d{4}-\d{2})/", r.text)))
    if not meses:
        sys.exit("Não consegui listar os meses no repositório da Receita.")
    return meses[-1]


def _baixar(url: str, destino: Path, auth: tuple[str, str] | None = None) -> None:
    import httpx
    with httpx.stream("GET", url, timeout=60, follow_redirects=True, auth=auth,
                      headers={"User-Agent": "AgentBastos/1.0"}) as r:
        r.raise_for_status()
        with open(destino, "wb") as f:
            for pedaco in r.iter_bytes(1 << 20):
                f.write(pedaco)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", type=Path)
    ap.add_argument("--url-base")
    ap.add_argument("--receita", action="store_true",
                    help="baixa do repositório público oficial da Receita")
    ap.add_argument("--mes", help="AAAA-MM (com --receita; padrão: o mais recente)")
    ap.add_argument("--db", type=Path, default=DB_RECEITA)
    ap.add_argument("--competencia")
    ap.add_argument("--manter-zips", action="store_true")
    a = ap.parse_args()
    if sum(map(bool, (a.dir, a.url_base, a.receita))) != 1:
        ap.error("informe exatamente um: --dir, --url-base ou --receita")
    auth = None
    if a.receita:
        mes = a.mes or _ultimo_mes_receita()
        a.url_base = f"{RECEITA_WEBDAV}{mes}/"
        a.competencia = a.competencia or mes
        auth = (RECEITA_TOKEN, "")
        print(f"Receita: mês {mes}", flush=True)

    a.db.parent.mkdir(parents=True, exist_ok=True)
    tmp = a.db.with_suffix(".db.tmp")
    if tmp.exists():
        tmp.unlink()

    con = sqlite3.connect(tmp)
    con.executescript("""
        PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA temp_store=FILE;
        CREATE TABLE socios (chave TEXT NOT NULL, nome TEXT NOT NULL, cpf_meio TEXT NOT NULL,
                             faixa_etaria TEXT, cnpj_basico TEXT NOT NULL,
                             qualificacao TEXT, data_entrada TEXT);
        CREATE TABLE meta (chave TEXT PRIMARY KEY, valor TEXT);
    """)

    t0, tot_lidas, tot_grav = time.time(), 0, 0
    if a.dir:
        fontes = sorted(a.dir.glob("Socios*.zip"))
        if not fontes:
            sys.exit(f"Nenhum Socios*.zip em {a.dir}")
        origem = str(a.dir)
    else:
        base = a.url_base.rstrip("/") + "/"
        fontes = [base + f"Socios{i}.zip" for i in range(10)]
        origem = base
    tempdir = Path(tempfile.mkdtemp(prefix="rfb_")) if a.url_base else None

    for f in fontes:
        if a.url_base:
            nome = f.rsplit("/", 1)[1]
            destino = tempdir / nome
            print(f"[{nome}] baixando…", flush=True)
            _baixar(f, destino, auth)
            caminho = destino
        else:
            caminho = f
        l, g = _processar(con, caminho)
        tot_lidas += l; tot_grav += g
        print(f"[{caminho.name}] lidas={l:,} sócios PF gravados={g:,} | total={tot_grav:,} "
              f"({time.time() - t0:.0f}s)", flush=True)
        if a.url_base and not a.manter_zips:
            caminho.unlink(missing_ok=True)

    print("Criando índice…", flush=True)
    con.execute("CREATE INDEX idx_socios_chave ON socios(chave)")
    comp = a.competencia or (a.dir.name if a.dir and re.fullmatch(r"\d{4}-\d{2}", a.dir.name)
                             else datetime.now().strftime("%Y-%m"))
    con.executemany("INSERT INTO meta VALUES (?,?)", [
        ("competencia", comp), ("origem", origem), ("socios_pf", str(tot_grav)),
        ("linhas_lidas", str(tot_lidas)), ("carregado_em", datetime.now().isoformat(timespec="seconds"))])
    con.commit()
    con.execute("ANALYZE")
    con.close()

    if a.db.exists():
        a.db.unlink()
    os.replace(tmp, a.db)  # troca atômica: a busca nunca vê banco pela metade
    print(f"OK — {tot_grav:,} sócios PF em {a.db} ({a.db.stat().st_size / 1e9:.2f} GB, {time.time() - t0:.0f}s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
