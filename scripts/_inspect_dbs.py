# -*- coding: utf-8 -*-
"""Inspector temporario de schema de todos os SQLite do Agent Bastos.
Roda EXPLAIN QUERY PLAN nas queries hot para identificar onde faltam indices."""

import os
import sqlite3

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DBS = {
    "dashboard": os.path.join(BASE, "dashboard_bastos.db"),
    "grupos":    os.path.join(BASE, "data", "grupos", "grupos_ocupacao.db"),
    "grafo":     os.path.join(BASE, "data", "grafo", "grafo_vinculos.db"),
    "liderancas":os.path.join(BASE, "data", "liderancas", "liderancas.db"),
    "extrato":   os.path.join(BASE, "data", "extrato", "extrato.db"),
}

# Queries hot por banco (extraidas dos routers/services)
QUERIES = {
    "dashboard": [
        ("kpi atual",
         "SELECT COUNT(*) FROM documentos WHERE ano=? AND mes=?", (2026, 5)),
        ("kpi acumulado",
         "SELECT COUNT(*) FROM documentos WHERE ano=?", (2026,)),
        ("por tipo do mes",
         "SELECT t.codigo,t.nome,COUNT(*) FROM documentos d "
         "JOIN tipos_documento t ON t.id=d.tipo_id "
         "WHERE d.ano=? AND d.mes=? GROUP BY t.id", (2026, 5)),
        ("ranking unidades RELINT",
         "SELECT u.sigla,COUNT(*) FROM documentos d "
         "JOIN unidades u ON u.id=d.unidade_ref_id "
         "JOIN tipos_documento t ON t.id=d.tipo_id "
         "WHERE d.ano=? AND t.codigo=? GROUP BY u.id ORDER BY COUNT(*) DESC",
         (2026, "REL_INTERNO")),
        ("lancamentos recentes",
         "SELECT d.id FROM documentos d JOIN tipos_documento t ON t.id=d.tipo_id "
         "JOIN unidades np ON np.id=d.nucleo_produtor_id "
         "LEFT JOIN unidades ur ON ur.id=d.unidade_ref_id "
         "WHERE d.ano=? ORDER BY d.created_at DESC LIMIT 100", (2026,)),
    ],
    "grupos": [
        ("ocupacao do mes",
         "SELECT * FROM ocupacao WHERE ano_mes=? ORDER BY unidade,pavilhao_id",
         ("2026-05",)),
        ("contagem por grupo",
         "SELECT grupo,COUNT(*) FROM ocupacao WHERE ano_mes=? AND grupo<>'' GROUP BY grupo",
         ("2026-05",)),
        ("meses distintos",
         "SELECT DISTINCT ano_mes FROM ocupacao ORDER BY ano_mes DESC", ()),
    ],
    "grafo": [
        ("alvos pessoa",
         "SELECT * FROM nos WHERE tipo='pessoa' ORDER BY rotulo", ()),
        ("count vinculos por no (N+1 atual!)",
         "SELECT COUNT(*) FROM arestas WHERE origem_id=? OR destino_id=?",
         ("p_xxx", "p_xxx")),
        ("movimentacoes de pessoa",
         "SELECT * FROM movimentacoes WHERE pessoa_id=? ORDER BY competencia DESC",
         ("p_xxx",)),
    ],
    "liderancas": [
        ("por unidade e competencia",
         "SELECT * FROM liderancas WHERE unidade=? AND competencia=? "
         "ORDER BY pavilhao,ala,cela,cargo", ("CDPM1", "2026-05")),
        ("competencias distintas",
         "SELECT DISTINCT competencia FROM liderancas ORDER BY competencia DESC", ()),
        ("competencias por unidade",
         "SELECT DISTINCT competencia FROM liderancas WHERE unidade=?",
         ("CDPM1",)),
    ],
    "extrato": [
        ("listar recentes",
         "SELECT id FROM extratos ORDER BY criado_em DESC LIMIT ?", (200,)),
        ("entidades por extrato",
         "SELECT * FROM extrato_entidades WHERE extrato_id=? ORDER BY id",
         ("ext_xxx",)),
        ("auditoria por extrato",
         "SELECT * FROM auditoria WHERE extrato_id=? ORDER BY id", ("ext_xxx",)),
        ("ultimo hash auditoria",
         "SELECT hash FROM auditoria ORDER BY id DESC LIMIT 1", ()),
    ],
}


def inspecionar(nome, path):
    print(f"\n{'='*70}\n  {nome.upper()} - {path}\n{'='*70}")
    if not os.path.exists(path):
        print("  [!] banco nao encontrado")
        return
    con = sqlite3.connect(path)
    print("\n--- TABELAS ---")
    for r in con.execute(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ):
        print(f"  {r[0]}")
    print("\n--- INDICES ---")
    for r in con.execute(
        "SELECT name, tbl_name FROM sqlite_master WHERE type='index' "
        "AND name NOT LIKE 'sqlite_%' ORDER BY tbl_name, name"
    ):
        print(f"  {r[1]:25s} -> {r[0]}")
    print("\n--- EXPLAIN QUERY PLAN ---")
    for desc, sql, params in QUERIES.get(nome, []):
        print(f"\n  > {desc}")
        try:
            for r in con.execute(f"EXPLAIN QUERY PLAN {sql}", params):
                detail = r[3] if len(r) > 3 else str(r)
                marker = "  [!] SCAN" if "SCAN" in str(detail) else "  [+]"
                print(f"    {marker} {detail}")
        except Exception as e:
            print(f"    [erro] {e}")
    con.close()


for nome, path in DBS.items():
    inspecionar(nome, path)
