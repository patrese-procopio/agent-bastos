# -*- coding: utf-8 -*-
"""
aplicar_indices.py - Migracao idempotente de indices SQLite
---------------------------------------------------------------------------
Adiciona indices que faltam para queries hot identificadas via EXPLAIN QUERY
PLAN. Remove indice duplicado em liderancas.

Pode ser rodado a qualquer momento (CREATE INDEX IF NOT EXISTS). Backend
PRECISA estar parado (SQLite bloqueia DDL com conexao aberta).

Uso:
    .venv\\Scripts\\python.exe scripts\\aplicar_indices.py
"""

import os
import sqlite3
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MIGRACOES = {
    os.path.join(BASE, "dashboard_bastos.db"): [
        # lancamentos recentes ORDER BY created_at DESC (era SCAN)
        ("idx_doc_created", "CREATE INDEX IF NOT EXISTS idx_doc_created "
                            "ON documentos(ano, created_at DESC)"),
    ],
    os.path.join(BASE, "data", "extrato", "extrato.db"): [
        # listar() ORDER BY criado_em DESC LIMIT N (era SCAN)
        ("idx_extr_criado", "CREATE INDEX IF NOT EXISTS idx_extr_criado "
                            "ON extratos(criado_em DESC)"),
        # auditoria por extrato (era SCAN)
        ("idx_audit_extrato", "CREATE INDEX IF NOT EXISTS idx_audit_extrato "
                              "ON auditoria(extrato_id)"),
        # ultimo hash (ORDER BY id DESC LIMIT 1 - inverter ajuda)
        ("idx_audit_id_desc", "CREATE INDEX IF NOT EXISTS idx_audit_id_desc "
                              "ON auditoria(id DESC)"),
    ],
    os.path.join(BASE, "data", "liderancas", "liderancas.db"): [
        # idx_localizacao e idx_loc cobrem mesmas colunas (heranca de migracao).
        # Mantem idx_loc (mais recente, definido em init_db). Drop seguro.
        ("__drop__idx_localizacao", "DROP INDEX IF EXISTS idx_localizacao"),
    ],
}


def aplicar():
    total_aplicadas = 0
    total_ja_existiam = 0
    for db_path, migrs in MIGRACOES.items():
        nome = os.path.basename(db_path)
        if not os.path.exists(db_path):
            print(f"[!] pulando (nao existe): {nome}")
            continue
        print(f"\n=== {nome} ===")
        con = sqlite3.connect(db_path)
        try:
            # Indices existentes antes
            antes = {r[0] for r in con.execute(
                "SELECT name FROM sqlite_master WHERE type='index'"
            )}
            for nome_idx, sql in migrs:
                try:
                    con.execute(sql)
                    con.commit()
                    depois = {r[0] for r in con.execute(
                        "SELECT name FROM sqlite_master WHERE type='index'"
                    )}
                    if nome_idx.startswith("__drop__"):
                        alvo = nome_idx.replace("__drop__", "")
                        if alvo in antes and alvo not in depois:
                            print(f"  [-] DROP {alvo}")
                            total_aplicadas += 1
                        else:
                            print(f"  [=] {alvo} ja nao existia")
                            total_ja_existiam += 1
                    else:
                        if nome_idx not in antes and nome_idx in depois:
                            print(f"  [+] CREATE {nome_idx}")
                            total_aplicadas += 1
                        else:
                            print(f"  [=] {nome_idx} ja existia")
                            total_ja_existiam += 1
                except sqlite3.OperationalError as e:
                    print(f"  [erro] {nome_idx}: {e}")
            # ANALYZE: atualiza estatisticas do query planner (rapido em DB pequeno)
            con.execute("ANALYZE")
            con.commit()
            print("  [.] ANALYZE concluido")
        finally:
            con.close()

    print(f"\nTotal: {total_aplicadas} alteradas, {total_ja_existiam} ja estavam ok")
    return total_aplicadas


if __name__ == "__main__":
    n = aplicar()
    sys.exit(0)
