"""
inject_dashboard_routes.py
Injeta as rotas /dashboard/* no api.py antes do bloco if __name__ == "__main__"
Execute: python inject_dashboard_routes.py
"""
import sys

SRC = r"C:\Users\Administrador\Agent_Bastos\api.py"

with open(SRC, encoding="latin-1") as f:
    code = f.read()

ANCHOR = 'if __name__ == "__main__":'

if ANCHOR not in code:
    print("ERRO: ancora nao encontrada.")
    sys.exit(1)

# Verifica se ja foi injetado
if "/dashboard/kpi" in code:
    print("Rotas ja existem no api.py. Nada a fazer.")
    sys.exit(0)

ROUTES = r'''
# ═══════════════════════════════════════════════════════════════════════════════
# DASHBOARD — Rotas SQLite
# ═══════════════════════════════════════════════════════════════════════════════
import sqlite3 as _sqlite3
from pathlib import Path as _Path

_DB_PATH = _Path(__file__).parent / "dashboard_bastos.db"

def _db():
    conn = _sqlite3.connect(str(_DB_PATH))
    conn.row_factory = _sqlite3.Row
    return conn

class DocLancamento(BaseModel):
    nome_arquivo:       str
    tipo_codigo:        str        # ex: 'RELINT'
    nucleo_sigla:       str        # ex: 'NI'
    unidade_sigla:      str = ""   # ex: 'COMPAJ' — obrigatorio para REL_INTERNO e PARECER_REM
    ano:                int = 2026
    mes:                int        # 1-12
    observacao:         str = ""
    registrado_por:     str = ""

@app.post("/dashboard/lancar")
def dashboard_lancar(doc: DocLancamento):
    """Registra um documento no banco de producao."""
    with _db() as conn:
        tipo = conn.execute(
            "SELECT id FROM tipos_documento WHERE codigo = ?", (doc.tipo_codigo,)
        ).fetchone()
        if not tipo:
            raise HTTPException(status_code=400, detail=f"Tipo '{doc.tipo_codigo}' nao encontrado.")

        nucleo = conn.execute(
            "SELECT id FROM unidades WHERE sigla = ?", (doc.nucleo_sigla,)
        ).fetchone()
        if not nucleo:
            raise HTTPException(status_code=400, detail=f"Nucleo '{doc.nucleo_sigla}' nao encontrado.")

        unidade_id = None
        if doc.unidade_sigla:
            u = conn.execute(
                "SELECT id FROM unidades WHERE sigla = ?", (doc.unidade_sigla,)
            ).fetchone()
            if u:
                unidade_id = u["id"]

        conn.execute("""
            INSERT INTO documentos
                (nome_arquivo, tipo_id, nucleo_produtor_id, unidade_ref_id, ano, mes, observacao, registrado_por)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            doc.nome_arquivo, tipo["id"], nucleo["id"], unidade_id,
            doc.ano, doc.mes, doc.observacao, doc.registrado_por
        ))
        conn.commit()
    return {"ok": True, "mensagem": "Documento registrado com sucesso."}

@app.delete("/dashboard/lancar/{doc_id}")
def dashboard_deletar(doc_id: int):
    """Remove um lancamento por ID."""
    with _db() as conn:
        conn.execute("DELETE FROM documentos WHERE id = ?", (doc_id,))
        conn.commit()
    return {"ok": True}

@app.get("/dashboard/kpi")
def dashboard_kpi(ano: int = 2026, mes: int = None):
    """KPIs gerais: total do mes, comparativo com mes anterior, acumulado ano."""
    with _db() as conn:
        if mes is None:
            mes = datetime.now().month

        mes_ant = mes - 1 if mes > 1 else 12
        ano_ant = ano if mes > 1 else ano - 1

        def count(a, m):
            r = conn.execute(
                "SELECT COUNT(*) as n FROM documentos WHERE ano=? AND mes=?", (a, m)
            ).fetchone()
            return r["n"] if r else 0

        atual   = count(ano, mes)
        anterior = count(ano_ant, mes_ant)
        variacao = round(((atual - anterior) / anterior * 100) if anterior > 0 else 0, 1)

        acumulado = conn.execute(
            "SELECT COUNT(*) as n FROM documentos WHERE ano=?", (ano,)
        ).fetchone()["n"]

        media_mes = conn.execute("""
            SELECT ROUND(AVG(total),1) as media FROM (
                SELECT mes, COUNT(*) as total FROM documentos
                WHERE ano=? GROUP BY mes
            )
        """, (ano,)).fetchone()["media"] or 0

        # Por tipo no mes atual
        por_tipo = [dict(r) for r in conn.execute("""
            SELECT t.codigo, t.nome, COUNT(*) as total
            FROM documentos d
            JOIN tipos_documento t ON t.id = d.tipo_id
            WHERE d.ano=? AND d.mes=?
            GROUP BY t.id ORDER BY total DESC
        """, (ano, mes)).fetchall()]

        return {
            "mes_atual":   mes,
            "ano":         ano,
            "total_mes":   atual,
            "total_mes_anterior": anterior,
            "variacao_pct": variacao,
            "acumulado_ano": acumulado,
            "media_mensal": media_mes,
            "por_tipo":    por_tipo,
        }

@app.get("/dashboard/producao")
def dashboard_producao(ano: int = 2026):
    """Producao mensal completa para graficos do Dashboard."""
    with _db() as conn:
        # Por mes e tipo
        por_mes_tipo = [dict(r) for r in conn.execute(
            "SELECT * FROM v_producao_mes_tipo WHERE ano=?", (ano,)
        ).fetchall()]

        # Por nucleo e mes
        por_nucleo = [dict(r) for r in conn.execute(
            "SELECT * FROM v_producao_nucleo_mes WHERE ano=?", (ano,)
        ).fetchall()]

        # Por unidade prisional e mes
        por_unidade = [dict(r) for r in conn.execute(
            "SELECT * FROM v_producao_unidade_mes WHERE ano=?", (ano,)
        ).fetchall()]

        # Ranking unidades (REL_INTERNO acumulado no ano)
        ranking_unidades = [dict(r) for r in conn.execute("""
            SELECT u.sigla, u.nome, COUNT(*) as total,
                   SUM(CASE WHEN d.mes = ? THEN 1 ELSE 0 END) as total_mes_atual,
                   SUM(CASE WHEN d.mes = ? THEN 1 ELSE 0 END) as total_mes_anterior
            FROM documentos d
            JOIN unidades u ON u.id = d.unidade_ref_id
            JOIN tipos_documento t ON t.id = d.tipo_id
            WHERE d.ano=? AND t.codigo='REL_INTERNO'
            GROUP BY u.id ORDER BY total DESC
        """, (datetime.now().month, datetime.now().month - 1 or 12, ano)).fetchall()]

        return {
            "ano":             ano,
            "por_mes_tipo":    por_mes_tipo,
            "por_nucleo":      por_nucleo,
            "por_unidade":     por_unidade,
            "ranking_unidades": ranking_unidades,
        }

@app.get("/dashboard/lancamentos")
def dashboard_lancamentos(ano: int = 2026, mes: int = None):
    """Lista os lancamentos recentes para exibir na tela de lancamento."""
    with _db() as conn:
        filtro_mes = f"AND d.mes = {mes}" if mes else ""
        rows = conn.execute(f"""
            SELECT d.id, d.nome_arquivo, d.mes, d.ano, d.observacao, d.created_at,
                   t.codigo as tipo, t.nome as tipo_nome,
                   np.sigla as nucleo,
                   ur.sigla as unidade
            FROM documentos d
            JOIN tipos_documento t  ON t.id = d.tipo_id
            JOIN unidades np        ON np.id = d.nucleo_produtor_id
            LEFT JOIN unidades ur   ON ur.id = d.unidade_ref_id
            WHERE d.ano = ? {filtro_mes}
            ORDER BY d.created_at DESC
            LIMIT 50
        """, (ano,)).fetchall()
        return [dict(r) for r in rows]

@app.get("/dashboard/catalogos")
def dashboard_catalogos():
    """Retorna tipos e unidades para popular os selects do formulario."""
    with _db() as conn:
        tipos   = [dict(r) for r in conn.execute("SELECT codigo, nome FROM tipos_documento ORDER BY nome").fetchall()]
        nucleos = [dict(r) for r in conn.execute("SELECT sigla, nome FROM unidades WHERE tipo='nucleo' ORDER BY sigla").fetchall()]
        unidades= [dict(r) for r in conn.execute("SELECT sigla, nome FROM unidades WHERE tipo='unidade_prisional' ORDER BY sigla").fetchall()]
    return {"tipos": tipos, "nucleos": nucleos, "unidades": unidades}

'''

code = code.replace(ANCHOR, ROUTES + ANCHOR, 1)

with open(SRC, "w", encoding="latin-1") as f:
    f.write(code)

print("Rotas do dashboard injetadas com sucesso!")
print("Rotas criadas:")
print("  POST   /dashboard/lancar")
print("  DELETE /dashboard/lancar/{id}")
print("  GET    /dashboard/kpi")
print("  GET    /dashboard/producao")
print("  GET    /dashboard/lancamentos")
print("  GET    /dashboard/catalogos")
