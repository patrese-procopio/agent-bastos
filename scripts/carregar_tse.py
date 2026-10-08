"""
carregar_tse.py — Carrega candidaturas + bens declarados (dados abertos do TSE)
em data/tse/tse.db, para a busca local do OSINT.

Uso (a partir de Agent_Bastos/):
  .venv\\Scripts\\python.exe -X utf8 scripts\\carregar_tse.py                      # 2014…2024, baixando
  .venv\\Scripts\\python.exe -X utf8 scripts\\carregar_tse.py --anos 2022,2024
  .venv\\Scripts\\python.exe -X utf8 scripts\\carregar_tse.py --dir D:\\tse         # zips já baixados

Fonte: https://cdn.tse.jus.br/estatistica/sead/odsele/  (portal oficial de dados abertos do TSE)
  consulta_cand/consulta_cand_AAAA.zip e bem_candidato/bem_candidato_AAAA.zip

Cada zip traz um CSV por UF E um *_BRASIL.csv consolidado (duplicado): usa-se só o
consolidado quando existir. Os zips são lidos em streaming (nada é extraído em disco).
Guarda o e-mail público de campanha (DS_EMAIL), o código do município (SG_UE) e o código da eleição;
NÃO guarda título de eleitor. Bens são agregados por candidatura
(total, quantidade e os 10 maiores).
"""

from __future__ import annotations

import argparse
import csv
import heapq
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
from modules.osint.tse import DB_TSE  # noqa: E402

csv.field_size_limit(10_000_000)
CDN = "https://cdn.tse.jus.br/estatistica/sead/odsele"
ANOS_PADRAO = [2014, 2016, 2018, 2020, 2022, 2024]


def _leitores(caminho: Path):
    """Gera (nome_csv, DictReader) para o(s) CSV(s) que importam do zip."""
    with zipfile.ZipFile(caminho) as z:
        csvs = [i for i in z.infolist() if i.filename.lower().endswith(".csv")]
        consolidado = [i for i in csvs if i.filename.upper().endswith("_BRASIL.csv")]
        for info in (consolidado or csvs):
            with z.open(info) as f:
                txt = io.TextIOWrapper(f, encoding="latin-1", newline="")
                yield info.filename, csv.DictReader(txt, delimiter=";", quotechar='"')


def _nulo(v: str | None) -> str:
    v = (v or "").strip()
    return "" if v in ("-1", "-3", "-4", "#NULO#", "#NE#", "#NI#") else v


def _email(v: str | None) -> str:
    """E-mail público de campanha (publicado pelo TSE). Descarta valores nulos/mascarados/inválidos."""
    v = _nulo(v).strip().lower()
    return v if re.fullmatch(r"[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}", v) else ""


def _iso(d: str) -> str:
    m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", d or "")
    return f"{m[3]}-{m[2]}-{m[1]}" if m else ""


def _num(v: str) -> float:
    try:
        return float((v or "0").replace(".", "").replace(",", "."))
    except ValueError:
        return 0.0


def _cpf_ok(c: str) -> str:
    c = re.sub(r"\D", "", c or "")
    return c if len(c) == 11 and len(set(c)) > 1 else ""


def _baixar(url: str, destino: Path) -> bool:
    import httpx
    with httpx.stream("GET", url, timeout=120, follow_redirects=True,
                      headers={"User-Agent": "AgentBastos/1.0"}) as r:
        if r.status_code == 404:
            return False
        r.raise_for_status()
        with open(destino, "wb") as f:
            for pedaco in r.iter_bytes(1 << 20):
                f.write(pedaco)
    return True


def _obter(origem, tipo: str, ano: int, tmp: Path) -> Path | None:
    nome = f"{tipo}_{ano}.zip"
    if isinstance(origem, Path):
        p = origem / nome
        return p if p.exists() else None
    destino = tmp / nome
    return destino if _baixar(f"{CDN}/{tipo}/{nome}", destino) else None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--anos", default=",".join(map(str, ANOS_PADRAO)))
    ap.add_argument("--dir", type=Path)
    ap.add_argument("--db", type=Path, default=DB_TSE)
    ap.add_argument("--manter-zips", action="store_true")
    a = ap.parse_args()
    anos = sorted({int(x) for x in a.anos.split(",") if x.strip()})

    a.db.parent.mkdir(parents=True, exist_ok=True)
    tmpdb = a.db.with_suffix(".db.tmp")
    tmpdb.unlink(missing_ok=True)
    con = sqlite3.connect(tmpdb)
    con.executescript("""
        PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
        CREATE TABLE candidatos (
            ano INTEGER NOT NULL, sq TEXT NOT NULL, cpf TEXT, nome TEXT NOT NULL, chave TEXT,
            urna_norm TEXT, dt_nasc TEXT, cargo TEXT, uf TEXT, municipio TEXT, partido TEXT,
            situacao TEXT, resultado TEXT, ocupacao TEXT,
            email TEXT, sg_ue TEXT, cd_eleicao TEXT,
            patrimonio REAL DEFAULT 0, qtd_bens INTEGER DEFAULT 0, bens_top TEXT,
            PRIMARY KEY (ano, sq));
        CREATE TABLE meta (chave TEXT PRIMARY KEY, valor TEXT);
    """)

    origem = a.dir if a.dir else "cdn"
    tmpzip = Path(tempfile.mkdtemp(prefix="tse_"))
    t0, total_cand, anos_ok = time.time(), 0, []

    for ano in anos:
        zc = _obter(origem, "consulta_cand", ano, tmpzip)
        if not zc:
            print(f"[{ano}] consulta_cand ausente — pulando", flush=True)
            continue

        # ── candidaturas (dedup por ano+SQ; 2º turno substitui o 1º) ──
        cand: dict[str, tuple] = {}
        for _, rd in _leitores(zc):
            for r in rd:
                sq = r.get("SQ_CANDIDATO", "")
                nome = norm(r.get("NM_CANDIDATO"))
                if not sq or not nome:
                    continue
                cand[sq] = (
                    ano, sq, _cpf_ok(r.get("NR_CPF_CANDIDATO")), nome, chave_nome(nome),
                    norm(r.get("NM_URNA_CANDIDATO")), _iso(_nulo(r.get("DT_NASCIMENTO"))),
                    r.get("DS_CARGO", ""), r.get("SG_UF", ""), _nulo(r.get("NM_UE")),
                    r.get("SG_PARTIDO", ""), r.get("DS_SITUACAO_CANDIDATURA", ""),
                    _nulo(r.get("DS_SIT_TOT_TURNO")), _nulo(r.get("DS_OCUPACAO")),
                    _email(r.get("DS_EMAIL")), _nulo(r.get("SG_UE")), _nulo(r.get("CD_ELEICAO")),
                )
        if not a.manter_zips and not a.dir:
            zc.unlink(missing_ok=True)

        # ── bens, agregados por candidatura ──
        agg: dict[str, list] = {}
        zb = _obter(origem, "bem_candidato", ano, tmpzip)
        if zb:
            for _, rd in _leitores(zb):
                for r in rd:
                    sq = r.get("SQ_CANDIDATO", "")
                    if sq not in cand:
                        continue
                    v = _num(r.get("VR_BEM_CANDIDATO"))
                    g = agg.setdefault(sq, [0.0, 0, []])
                    g[0] += v; g[1] += 1
                    item = (v, f"{r.get('DS_TIPO_BEM_CANDIDATO', '')}: {(r.get('DS_BEM_CANDIDATO') or '')[:90]}")
                    if len(g[2]) < 10:
                        heapq.heappush(g[2], item)
                    else:
                        heapq.heappushpop(g[2], item)
            if not a.manter_zips and not a.dir:
                zb.unlink(missing_ok=True)

        lote = []
        for sq, row in cand.items():
            g = agg.get(sq)
            top = json.dumps([{"valor": v, "bem": d} for v, d in sorted(g[2], reverse=True)],
                             ensure_ascii=False) if g else "[]"
            lote.append(row + ((round(g[0], 2), g[1], top) if g else (0.0, 0, "[]")))
        con.executemany("INSERT OR REPLACE INTO candidatos VALUES (" + ",".join("?" * 20) + ")", lote)
        con.commit()
        total_cand += len(lote); anos_ok.append(ano)
        print(f"[{ano}] candidaturas={len(lote):,} com bens={len(agg):,} | total={total_cand:,} "
              f"({time.time() - t0:.0f}s)", flush=True)

    if not anos_ok:
        con.close(); tmpdb.unlink(missing_ok=True)
        sys.exit("Nada carregado.")

    print("Criando índices…", flush=True)
    con.executescript("""
        CREATE INDEX idx_cand_cpf   ON candidatos(cpf);
        CREATE INDEX idx_cand_chave ON candidatos(chave);
        CREATE INDEX idx_cand_urna  ON candidatos(urna_norm);
    """)
    con.executemany("INSERT INTO meta VALUES (?,?)", [
        ("anos", ",".join(map(str, anos_ok))), ("candidaturas", str(total_cand)),
        ("fonte", CDN if not a.dir else str(a.dir)),
        ("carregado_em", datetime.now().isoformat(timespec="seconds"))])
    con.commit(); con.execute("ANALYZE"); con.close()

    for _ in range(8):  # a busca pode estar com o arquivo aberto por instantes
        try:
            os.replace(tmpdb, a.db)
            break
        except PermissionError:
            time.sleep(5)
    else:
        sys.exit("Não consegui trocar o banco (arquivo em uso). O novo ficou em " + str(tmpdb))
    print(f"OK — {total_cand:,} candidaturas ({', '.join(map(str, anos_ok))}) em {a.db} "
          f"({a.db.stat().st_size / 1e6:.0f} MB, {time.time() - t0:.0f}s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
