"""
recuperar_n8n_db.py — Reconstrói o banco do n8n (SQLite) quando ele corrompe.

Quando usar: o container do n8n entra em loop de falha com "SQLITE_IOERR" ou
"database disk image is malformed" (SQLite em modo WAL sobre pasta compartilhada do Windows).

Como funciona: copia para um banco NOVO todas as tabelas legíveis (workflows, credenciais,
usuários…) e descarta só o histórico de execuções (execution_entity/execution_data), que
costuma ser o que corrompe e não é essencial. O banco antigo NÃO é apagado.

Uso (n8n precisa estar PARADO: `docker stop agent-bastos-n8n`):
  .venv\\Scripts\\python.exe -X utf8 scripts\\recuperar_n8n_db.py              # só gera database.sqlite.rebuilt
  .venv\\Scripts\\python.exe -X utf8 scripts\\recuperar_n8n_db.py --trocar     # gera e troca (guarda o antigo)
Depois: `docker start agent-bastos-n8n`.
"""

import argparse
import os
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime

PASTA = r"C:\Users\Administrador\.n8n"
ORIG = os.path.join(PASTA, "database.sqlite")
NOVO = os.path.join(PASTA, "database.sqlite.rebuilt")
PULAR = {"execution_entity", "execution_data"}  # histórico de execuções: dispensável


def n8n_rodando() -> bool:
    try:
        out = subprocess.run(["docker", "ps", "--filter", "name=agent-bastos-n8n", "--format", "{{.Status}}"],
                             capture_output=True, text=True).stdout
        return bool(out.strip())
    except Exception:
        return False


def reconstruir() -> None:
    if os.path.exists(NOVO):
        os.remove(NOVO)
    old = sqlite3.connect(f"file:{ORIG}?mode=ro", uri=True)
    new = sqlite3.connect(NOVO)
    new.execute("PRAGMA journal_mode=DELETE")
    new.execute("PRAGMA foreign_keys=OFF")
    esquema = old.execute("select type, name, tbl_name, sql from sqlite_master "
                          "where sql is not null and name not like 'sqlite_%'").fetchall()
    tabelas = [e for e in esquema if e[0] == "table"]
    resto = [e for e in esquema if e[0] in ("index", "trigger", "view")]
    for _, _, _, sql in tabelas:
        new.execute(sql)

    resumo = []
    for _, nome, _, _ in tabelas:
        cols = [c[1] for c in old.execute(f'pragma table_info("{nome}")')]
        lista = ",".join(f'"{c}"' for c in cols)
        marc = ",".join("?" * len(cols))
        if nome in PULAR:
            resumo.append((nome, "pulada (histórico)", 0)); continue
        try:
            linhas = old.execute(f'select {lista} from "{nome}"').fetchall()
            new.executemany(f'insert into "{nome}" ({lista}) values ({marc})', linhas)
            resumo.append((nome, "ok", len(linhas)))
        except Exception as e:  # tabela danificada: salva linha a linha o que der
            salvas = 0
            try:
                mx = old.execute(f'select max(rowid) from "{nome}"').fetchone()[0] or 0
            except Exception:
                mx = 0
            for rid in range(1, min(mx, 200000) + 1):
                try:
                    r = old.execute(f'select {lista} from "{nome}" where rowid=?', (rid,)).fetchone()
                    if r:
                        new.execute(f'insert into "{nome}" ({lista}) values ({marc})', r); salvas += 1
                except Exception:
                    pass
            resumo.append((nome, f"parcial ({str(e)[:30]})", salvas))
    new.commit()
    for _, nome, _, sql in resto:
        try:
            new.execute(sql)
        except Exception as e:
            print("índice/gatilho ignorado:", nome, str(e)[:50])
    new.commit()

    print("integridade do banco novo:", new.execute("pragma integrity_check").fetchone()[0])
    for nome, estado, n in resumo:
        if estado != "ok":
            print(f"  {nome:28} {estado:34} {n} linhas")
    chaves = ("workflow_entity", "credentials_entity", "user", "shared_workflow", "project")
    for nome, estado, n in resumo:
        if nome in chaves:
            print(f"  {nome:28} {estado:34} {n} linhas")
    new.close(); old.close()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--trocar", action="store_true", help="troca o banco pelo reconstruído (guarda o antigo)")
    a = ap.parse_args()
    if n8n_rodando():
        sys.exit("O container agent-bastos-n8n está rodando. Pare antes: docker stop agent-bastos-n8n")
    reconstruir()
    if a.trocar:
        carimbo = datetime.now().strftime("%Y%m%d_%H%M%S")
        guardado = os.path.join(PASTA, f"database.sqlite.antes_da_recuperacao_{carimbo}")
        shutil.move(ORIG, guardado)
        for suf in ("-wal", "-shm"):
            if os.path.exists(ORIG + suf):
                shutil.move(ORIG + suf, guardado + suf)
        shutil.move(NOVO, ORIG)
        print(f"Banco trocado. O antigo ficou em {guardado}")
        print("Agora: docker start agent-bastos-n8n")
    else:
        print(f"Banco reconstruído em {NOVO} (nada foi trocado). Rode de novo com --trocar para aplicar.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
