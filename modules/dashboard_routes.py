import sqlite3
from pathlib import Path
from datetime import datetime
from fastapi import HTTPException
from pydantic import BaseModel

DB_PATH = Path(__file__).parent.parent / "dashboard_bastos.db"

def _db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

class DocLancamento(BaseModel):
    nome_arquivo:   str
    tipo_codigo:    str
    nucleo_sigla:   str
    unidade_sigla:  str = ""
    ano:            int = 2026
    mes:            int
    observacao:     str = ""
    registrado_por: str = ""

def registrar_rotas_dashboard(app):

    @app.post("/dashboard/lancar")
    def lancar(doc: DocLancamento):
        with _db() as conn:
            tipo = conn.execute("SELECT id FROM tipos_documento WHERE codigo = ?", (doc.tipo_codigo,)).fetchone()
            if not tipo:
                raise HTTPException(400, "Tipo nao encontrado.")
            nucleo = conn.execute("SELECT id FROM unidades WHERE sigla = ?", (doc.nucleo_sigla,)).fetchone()
            if not nucleo:
                raise HTTPException(400, "Nucleo nao encontrado.")
            unidade_id = None
            if doc.unidade_sigla:
                u = conn.execute("SELECT id FROM unidades WHERE sigla = ?", (doc.unidade_sigla,)).fetchone()
                if u:
                    unidade_id = u["id"]
            conn.execute("INSERT INTO documentos (nome_arquivo,tipo_id,nucleo_produtor_id,unidade_ref_id,ano,mes,observacao,registrado_por) VALUES (?,?,?,?,?,?,?,?)",
                (doc.nome_arquivo,tipo["id"],nucleo["id"],unidade_id,doc.ano,doc.mes,doc.observacao,doc.registrado_por))
            conn.commit()
        return {"ok": True}

    @app.delete("/dashboard/lancar/{doc_id}")
    def deletar(doc_id: int):
        with _db() as conn:
            conn.execute("DELETE FROM documentos WHERE id = ?", (doc_id,))
            conn.commit()
        return {"ok": True}

    @app.get("/dashboard/kpi")
    def kpi(ano: int = 2026, mes: int = None):
        if mes is None:
            mes = datetime.now().month
        mes_ant = mes - 1 if mes > 1 else 12
        ano_ant = ano if mes > 1 else ano - 1
        with _db() as conn:
            def count(a, m):
                return conn.execute("SELECT COUNT(*) as n FROM documentos WHERE ano=? AND mes=?", (a,m)).fetchone()["n"]
            atual = count(ano, mes)
            anterior = count(ano_ant, mes_ant)
            variacao = round(((atual-anterior)/anterior*100) if anterior > 0 else 0, 1)
            acumulado = conn.execute("SELECT COUNT(*) as n FROM documentos WHERE ano=?", (ano,)).fetchone()["n"]
            media = conn.execute("SELECT ROUND(AVG(total),1) as m FROM (SELECT mes,COUNT(*) as total FROM documentos WHERE ano=? GROUP BY mes)", (ano,)).fetchone()["m"] or 0
            por_tipo = [dict(r) for r in conn.execute("SELECT t.codigo,t.nome,COUNT(*) as total FROM documentos d JOIN tipos_documento t ON t.id=d.tipo_id WHERE d.ano=? AND d.mes=? GROUP BY t.id ORDER BY total DESC", (ano,mes)).fetchall()]
        return {"mes_atual":mes,"ano":ano,"total_mes":atual,"total_mes_anterior":anterior,"variacao_pct":variacao,"acumulado_ano":acumulado,"media_mensal":media,"por_tipo":por_tipo}

    @app.get("/dashboard/producao")
    def producao(ano: int = 2026):
        m = datetime.now().month
        ma = m-1 if m > 1 else 12
        with _db() as conn:
            pmt = [dict(r) for r in conn.execute("SELECT * FROM v_producao_mes_tipo WHERE ano=?", (ano,)).fetchall()]
            pn  = [dict(r) for r in conn.execute("SELECT * FROM v_producao_nucleo_mes WHERE ano=?", (ano,)).fetchall()]
            pu  = [dict(r) for r in conn.execute("SELECT * FROM v_producao_unidade_mes WHERE ano=?", (ano,)).fetchall()]
            rk  = [dict(r) for r in conn.execute("SELECT u.sigla,u.nome,COUNT(*) as total,SUM(CASE WHEN d.mes=? THEN 1 ELSE 0 END) as total_mes_atual,SUM(CASE WHEN d.mes=? THEN 1 ELSE 0 END) as total_mes_anterior FROM documentos d JOIN unidades u ON u.id=d.unidade_ref_id JOIN tipos_documento t ON t.id=d.tipo_id WHERE d.ano=? AND t.codigo=? GROUP BY u.id ORDER BY total DESC", (m,ma,ano,"REL_INTERNO")).fetchall()]
        return {"ano":ano,"por_mes_tipo":pmt,"por_nucleo":pn,"por_unidade":pu,"ranking_unidades":rk}

    @app.get("/dashboard/lancamentos")
    def lancamentos(ano: int = 2026, mes: int = None):
        with _db() as conn:
            q = "SELECT d.id,d.nome_arquivo,d.mes,d.ano,d.observacao,d.created_at,t.codigo as tipo,t.nome as tipo_nome,np.sigla as nucleo,ur.sigla as unidade FROM documentos d JOIN tipos_documento t ON t.id=d.tipo_id JOIN unidades np ON np.id=d.nucleo_produtor_id LEFT JOIN unidades ur ON ur.id=d.unidade_ref_id WHERE d.ano=?"
            p = [ano]
            if mes:
                q += " AND d.mes=?"; p.append(mes)
            return [dict(r) for r in conn.execute(q+" ORDER BY d.created_at DESC LIMIT 100", p).fetchall()]

    @app.get("/dashboard/catalogos")
    def catalogos():
        with _db() as conn:
            return {
                "tipos":    [dict(r) for r in conn.execute("SELECT codigo,nome FROM tipos_documento ORDER BY nome").fetchall()],
                "nucleos":  [dict(r) for r in conn.execute("SELECT sigla,nome FROM unidades WHERE tipo=? ORDER BY sigla", ("nucleo",)).fetchall()],
                "unidades": [dict(r) for r in conn.execute("SELECT sigla,nome FROM unidades WHERE tipo=? ORDER BY sigla", ("unidade_prisional",)).fetchall()],
            }
