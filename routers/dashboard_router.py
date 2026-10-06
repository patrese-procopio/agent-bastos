"""
routers/dashboard_router.py
─────────────────────────────────────────────────────────────────────────────
Rotas HTTP do domínio de Dashboard — produção documental via SQLite.

Migrado de modules/dashboard_routes.py (padrão registrar_rotas_dashboard)
para APIRouter padrão de mercado.

Por que APIRouter e não registrar_rotas_dashboard(app)?
  - APIRouter permite prefixo, tags e dependências por grupo de rotas.
  - Testável com TestClient sem subir o app completo.
  - O padrão registrar_rotas_dashboard(app) é um anti-padrão: acopla
    o módulo à instância do app, impossibilitando testes isolados.

Rotas registradas (SQLite — dashboard_bastos.db):
  POST   /dashboard/lancar
  DELETE /dashboard/lancar/{doc_id}
  GET    /dashboard/kpi
  GET    /dashboard/producao
  GET    /dashboard/lancamentos
  GET    /dashboard/catalogos
  GET    /dashboard/relatorio/pdf        (relatório de produtividade p/ auditoria)
  GET    /dashboard/pedidos              (pedidos de pesquisa social + resumo)
  POST   /dashboard/pedidos
  PUT    /dashboard/pedidos/{id}
  DELETE /dashboard/pedidos/{id}

Rotas legadas (JSON — producao.json) — ainda no api.py até próximo passo:
  GET    /dashboard/stats
  POST   /dashboard/stats
"""

import sqlite3
from datetime import datetime
from pathlib import Path

from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import Response
from pydantic import BaseModel
from dependencies import get_current_user, require_module
from services import dashboard_sync_drive as sync_drive
from services.dashboard_sync_drive import numero_chave

router = APIRouter(tags=["dashboard"])

# Anos exibidos nas listas suspensas: antes de 2024 as pastas do Drive não têm
# subpasta de mês, então a distribuição mensal não é confiável.
ANO_MINIMO_PAINEL = 2024

from config.paths import DB_DASHBOARD
DB_PATH = DB_DASHBOARD


# ─── Helper de conexão ────────────────────────────────────────────────────────

def _db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


# ─── Modelo ──────────────────────────────────────────────────────────────────

class DocLancamento(BaseModel):
    nome_arquivo:   str
    tipo_codigo:    str
    nucleo_sigla:   str
    unidade_sigla:  str = ""
    ano:            int = 2026
    mes:            int
    observacao:     str = ""
    registrado_por: str = ""


# ─── Rotas ───────────────────────────────────────────────────────────────────

@router.post("/dashboard/lancar")
def lancar(doc: DocLancamento, user: dict = Depends(require_module("dashboard"))):
    with _db() as conn:
        tipo = conn.execute(
            "SELECT id FROM tipos_documento WHERE codigo = ?", (doc.tipo_codigo,)
        ).fetchone()
        if not tipo:
            raise HTTPException(400, "Tipo nao encontrado.")
        nucleo = conn.execute(
            "SELECT id FROM unidades WHERE sigla = ?", (doc.nucleo_sigla,)
        ).fetchone()
        if not nucleo:
            raise HTTPException(400, "Nucleo nao encontrado.")
        # Anti-duplicidade: RELINT/RELTEC são identificados por tipo + número + ano.
        numero = numero_chave(doc.nome_arquivo, doc.tipo_codigo, doc.ano)
        if numero:
            ja = conn.execute(
                "SELECT nome_arquivo FROM documentos WHERE tipo_id=? AND ano=? AND numero_doc=?",
                (tipo["id"], doc.ano, numero)).fetchone()
            if ja:
                raise HTTPException(409, f"{doc.tipo_codigo} {numero}/{doc.ano} já está lançado "
                                         f"({ja['nome_arquivo'].strip()}). Não foi duplicado.")
        unidade_id = None
        if doc.unidade_sigla:
            u = conn.execute(
                "SELECT id FROM unidades WHERE sigla = ?", (doc.unidade_sigla,)
            ).fetchone()
            if u:
                unidade_id = u["id"]
        conn.execute(
            "INSERT INTO documentos "
            "(nome_arquivo,tipo_id,nucleo_produtor_id,unidade_ref_id,ano,mes,observacao,registrado_por,numero_doc,origem) "
            "VALUES (?,?,?,?,?,?,?,?,?,'manual')",
            (doc.nome_arquivo, tipo["id"], nucleo["id"], unidade_id,
             doc.ano, doc.mes, doc.observacao, doc.registrado_por, numero),
        )
        conn.commit()
    return {"ok": True}


@router.delete("/dashboard/lancar/{doc_id}")
def deletar(doc_id: int, user: dict = Depends(require_module("dashboard"))):
    with _db() as conn:
        sync_drive.registrar_exclusao(conn, doc_id, user.get("sub", ""))
        conn.execute("DELETE FROM documentos WHERE id = ?", (doc_id,))
        conn.commit()
    return {"ok": True}


@router.get("/dashboard/kpi")
def kpi(ano: int = 2026, mes: int = None, user: dict = Depends(get_current_user)):
    if mes is None:
        mes = datetime.now().month
    mes_ant = mes - 1 if mes > 1 else 12
    ano_ant = ano if mes > 1 else ano - 1
    with _db() as conn:
        def count(a, m):
            return conn.execute(
                "SELECT COUNT(*) as n FROM documentos WHERE ano=? AND mes=?", (a, m)
            ).fetchone()["n"]
        atual    = count(ano, mes)
        anterior = count(ano_ant, mes_ant)
        variacao = round(((atual - anterior) / anterior * 100) if anterior > 0 else 0, 1)
        acumulado = conn.execute(
            "SELECT COUNT(*) as n FROM documentos WHERE ano=?", (ano,)
        ).fetchone()["n"]
        media = conn.execute(
            "SELECT ROUND(AVG(total),1) as m FROM "
            "(SELECT mes,COUNT(*) as total FROM documentos WHERE ano=? GROUP BY mes)", (ano,)
        ).fetchone()["m"] or 0
        por_tipo = [dict(r) for r in conn.execute(
            "SELECT t.codigo,t.nome,COUNT(*) as total "
            "FROM documentos d JOIN tipos_documento t ON t.id=d.tipo_id "
            "WHERE d.ano=? AND d.mes=? GROUP BY t.id ORDER BY total DESC",
            (ano, mes),
        ).fetchall()]
    return {
        "mes_atual": mes, "ano": ano,
        "total_mes": atual, "total_mes_anterior": anterior,
        "variacao_pct": variacao, "acumulado_ano": acumulado,
        "media_mensal": media, "por_tipo": por_tipo,
    }


@router.get("/dashboard/producao")
def producao(ano: int = 2026, user: dict = Depends(get_current_user)):
    m  = datetime.now().month
    ma = m - 1 if m > 1 else 12
    with _db() as conn:
        pmt = [dict(r) for r in conn.execute(
            "SELECT * FROM v_producao_mes_tipo WHERE ano=?", (ano,)
        ).fetchall()]
        pn = [dict(r) for r in conn.execute(
            "SELECT * FROM v_producao_nucleo_mes WHERE ano=?", (ano,)
        ).fetchall()]
        pu = [dict(r) for r in conn.execute(
            "SELECT * FROM v_producao_unidade_mes WHERE ano=?", (ano,)
        ).fetchall()]
        rk = [dict(r) for r in conn.execute(
            "SELECT u.sigla,u.nome,COUNT(*) as total,"
            "SUM(CASE WHEN d.mes=? THEN 1 ELSE 0 END) as total_mes_atual,"
            "SUM(CASE WHEN d.mes=? THEN 1 ELSE 0 END) as total_mes_anterior "
            "FROM documentos d "
            "JOIN unidades u ON u.id=d.unidade_ref_id "
            "JOIN tipos_documento t ON t.id=d.tipo_id "
            "WHERE d.ano=? AND t.codigo=? "
            "GROUP BY u.id ORDER BY total DESC",
            (m, ma, ano, "REL_INTERNO"),
        ).fetchall()]
    return {"ano": ano, "por_mes_tipo": pmt, "por_nucleo": pn, "por_unidade": pu, "ranking_unidades": rk}


@router.get("/dashboard/lancamentos")
def lancamentos(ano: int = 2026, mes: int = None, user: dict = Depends(get_current_user)):
    with _db() as conn:
        q = (
            "SELECT d.id,d.nome_arquivo,d.mes,d.ano,d.observacao,d.created_at,d.origem,d.numero_doc,"
            "t.codigo as tipo,t.nome as tipo_nome,"
            "np.sigla as nucleo,ur.sigla as unidade "
            "FROM documentos d "
            "JOIN tipos_documento t ON t.id=d.tipo_id "
            "JOIN unidades np ON np.id=d.nucleo_produtor_id "
            "LEFT JOIN unidades ur ON ur.id=d.unidade_ref_id "
            "WHERE d.ano=?"
        )
        p = [ano]
        if mes:
            q += " AND d.mes=?"
            p.append(mes)
        return [dict(r) for r in conn.execute(q + " ORDER BY d.created_at DESC LIMIT 100", p).fetchall()]


@router.get("/dashboard/catalogos")
def catalogos(user: dict = Depends(get_current_user)):
    with _db() as conn:
        # Anos para as listas suspensas: com lançamentos/pedidos + anos das pastas do Drive + ano atual.
        anos = {datetime.now().year}
        anos |= {r[0] for r in conn.execute("SELECT DISTINCT ano FROM documentos")}
        try:
            anos |= {int(r[0]) for r in conn.execute(
                "SELECT DISTINCT substr(data_pedido,1,4) FROM pedidos_pesquisa") if r[0] and r[0].isdigit()}
        except sqlite3.OperationalError:
            pass
        anos |= set(sync_drive.anos_disponiveis())
        anos = {a for a in anos if a >= ANO_MINIMO_PAINEL}
        return {
            "anos":     sorted(anos, reverse=True),
            "anos_com_dados": [r[0] for r in conn.execute(
                "SELECT DISTINCT ano FROM documentos WHERE ano >= ? ORDER BY ano DESC", (ANO_MINIMO_PAINEL,))],
            "tipos":    [dict(r) for r in conn.execute(
                "SELECT codigo,nome FROM tipos_documento ORDER BY nome"
            ).fetchall()],
            "nucleos":  [dict(r) for r in conn.execute(
                "SELECT sigla,nome FROM unidades WHERE tipo=? ORDER BY sigla", ("nucleo",)
            ).fetchall()],
            "unidades": [dict(r) for r in conn.execute(
                "SELECT sigla,nome FROM unidades WHERE tipo=? ORDER BY sigla", ("unidade_prisional",)
            ).fetchall()],
        }

# ─── Relatório de produtividade (PDF) ────────────────────────────────────────

@router.get("/dashboard/relatorio/pdf")
def relatorio_pdf(
    ano: int = Query(default=None, ge=2000, le=2100),
    mes: int = Query(default=None, ge=1, le=12),
    periodo: str = Query(default="mes", pattern="^(mes|ano)$"),
    user: dict = Depends(get_current_user),
):
    """PDF corporativo da produção. periodo=mes usa `mes`; periodo=ano consolida o ano todo."""
    from services.dashboard_relatorio import gerar_pdf
    hoje = datetime.now()
    ano = ano or hoje.year
    mes_ref = None if periodo == "ano" else (mes or hoje.month)
    try:
        pdf = gerar_pdf(str(DB_PATH), ano, mes_ref, gerado_por=user.get("sub", ""))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar relatório: {e}")
    nome = f"relatorio_produtividade_{ano}" + (f"_{mes_ref:02d}" if mes_ref else "_anual") + ".pdf"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{nome}"'})


# ─── Pedidos de pesquisa social (recebidos pelo e-mail institucional) ────────

def _init_pedidos() -> None:
    with _db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS pedidos_pesquisa (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                autor             TEXT NOT NULL,          -- quem fez o pedido
                email_solicitante TEXT,                   -- e-mail de quem pediu (opcional)
                data_pedido       TEXT NOT NULL,          -- AAAA-MM-DD
                assunto           TEXT NOT NULL,
                respondido        INTEGER NOT NULL DEFAULT 0,
                data_resposta     TEXT,                   -- AAAA-MM-DD
                email_resposta    TEXT,                   -- e-mail que foi respondido (texto)
                registrado_por    TEXT,
                respondido_por    TEXT,
                created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at        TEXT
            )""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_pedidos_data ON pedidos_pesquisa(data_pedido)")
        conn.commit()


_init_pedidos()


def _init_documentos() -> None:
    """Colunas numero_doc/origem/drive_file_id + índice único anti-duplicidade."""
    with _db() as conn:
        sync_drive.garantir_schema(conn)


_init_documentos()


# ─── Sincronização com as pastas anuais do Drive (RELINT → NI, RELTEC → NCI) ──

def _parse_anos(anos: str) -> list[int]:
    try:
        lista = sorted({int(a) for a in anos.split(",") if a.strip()})
    except ValueError:
        raise HTTPException(400, "Anos inválidos.")
    if not lista or len(lista) > 15:
        raise HTTPException(400, "Informe de 1 a 15 anos.")
    return lista


@router.get("/dashboard/sync-drive/previa")
def sync_drive_previa(anos: str = Query(..., description="ex.: 2025,2026"),
                      user: dict = Depends(get_current_user)):
    """Dry-run: mostra o que seria lançado. NÃO grava nada."""
    res = sync_drive.previa(str(DB_PATH), _parse_anos(anos))
    res["anos_disponiveis"] = [a for a in sync_drive.anos_disponiveis() if a >= ANO_MINIMO_PAINEL]
    res["indice"] = sync_drive.status_indice()
    return res


class SyncAplicarIn(BaseModel):
    anos: list[int]
    permitir_mes_estimado: bool = True


@router.post("/dashboard/sync-drive/aplicar")
def sync_drive_aplicar(body: SyncAplicarIn, user: dict = Depends(require_module("dashboard"))):
    """Lança só os documentos novos (um por tipo+número+ano). Idempotente."""
    if not body.anos:
        raise HTTPException(400, "Informe ao menos um ano.")
    return sync_drive.aplicar(str(DB_PATH), sorted(set(body.anos)), user.get("sub", ""),
                              body.permitir_mes_estimado)


@router.post("/dashboard/sync-drive/atualizar-indice")
def sync_drive_atualizar_indice(user: dict = Depends(require_module("dashboard"))):
    """Relê as pastas do Drive em segundo plano (leva alguns minutos)."""
    r = sync_drive.atualizar_indice_async()
    if not r.get("ok"):
        raise HTTPException(409, "A leitura do Drive já está em andamento.")
    return r


@router.get("/dashboard/sync-drive/lotes")
def sync_drive_lotes(user: dict = Depends(get_current_user)):
    return {"lotes": sync_drive.listar_lotes(str(DB_PATH))}


@router.delete("/dashboard/sync-drive/lotes/{lote_id}")
def sync_drive_desfazer(lote_id: str, user: dict = Depends(require_module("dashboard"))):
    """Desfaz um lote inteiro de lançamentos vindos do Drive."""
    r = sync_drive.desfazer_lote(str(DB_PATH), lote_id, user.get("sub", ""))
    if not r.get("ok"):
        raise HTTPException(404, "Lote não encontrado.")
    return r


@router.post("/dashboard/sync-drive/restaurar-ignorados")
def sync_drive_restaurar(body: SyncAplicarIn, user: dict = Depends(require_module("dashboard"))):
    """Volta a considerar números que foram excluídos à mão (voltam a aparecer como novos)."""
    return {"ok": True, "restaurados": sync_drive.restaurar_ignorados(str(DB_PATH), sorted(set(body.anos)))}


@router.get("/dashboard/sync-drive/status")
def sync_drive_status(user: dict = Depends(get_current_user)):
    return sync_drive.status_indice()


def _data_valida(v: Optional[str], campo: str) -> Optional[str]:
    if not v:
        return None
    try:
        datetime.strptime(v[:10], "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, f"{campo} inválida (use AAAA-MM-DD).")
    return v[:10]


class PedidoIn(BaseModel):
    autor: str
    data_pedido: str
    assunto: str
    email_solicitante: Optional[str] = None
    respondido: bool = False
    data_resposta: Optional[str] = None
    email_resposta: Optional[str] = None


def _validar_pedido(p: PedidoIn) -> dict:
    autor, assunto = p.autor.strip(), p.assunto.strip()
    if not autor:
        raise HTTPException(400, "Informe o autor do pedido.")
    if not assunto:
        raise HTTPException(400, "Informe o assunto.")
    data_pedido = _data_valida(p.data_pedido, "Data do pedido")
    if not data_pedido:
        raise HTTPException(400, "Informe a data do pedido.")
    data_resp = email_resp = None
    if p.respondido:
        data_resp = _data_valida(p.data_resposta, "Data da resposta") or datetime.now().strftime("%Y-%m-%d")
        if data_resp < data_pedido:
            raise HTTPException(400, "A data da resposta não pode ser anterior à data do pedido.")
        email_resp = (p.email_resposta or "").strip() or None
    return {"autor": autor, "assunto": assunto, "data_pedido": data_pedido,
            "email_solicitante": (p.email_solicitante or "").strip() or None,
            "respondido": 1 if p.respondido else 0,
            "data_resposta": data_resp, "email_resposta": email_resp}


def _dias(d1: str, d2: str) -> int:
    return max((datetime.strptime(d2[:10], "%Y-%m-%d") - datetime.strptime(d1[:10], "%Y-%m-%d")).days, 0)


@router.get("/dashboard/pedidos")
def listar_pedidos(
    ano: int = Query(default=None),
    status: str = Query(default="todos", pattern="^(todos|pendente|respondido)$"),
    user: dict = Depends(get_current_user),
):
    q, params = "SELECT * FROM pedidos_pesquisa WHERE 1=1", []
    if ano:
        q += " AND substr(data_pedido,1,4)=?"
        params.append(str(ano))
    with _db() as conn:
        rows = [dict(r) for r in conn.execute(q + " ORDER BY respondido ASC, data_pedido DESC, id DESC", params).fetchall()]
    hoje = datetime.now().strftime("%Y-%m-%d")
    prazos = []
    for r in rows:
        r["respondido"] = bool(r["respondido"])
        if r["respondido"] and r.get("data_resposta"):
            r["dias_resposta"] = _dias(r["data_pedido"], r["data_resposta"])
            prazos.append(r["dias_resposta"])
            r["dias_em_aberto"] = None
        else:
            r["dias_resposta"] = None
            r["dias_em_aberto"] = _dias(r["data_pedido"], hoje)
    resumo = {
        "total": len(rows),
        "respondidos": sum(1 for r in rows if r["respondido"]),
        "pendentes": sum(1 for r in rows if not r["respondido"]),
        "prazo_medio": round(sum(prazos) / len(prazos), 1) if prazos else None,
    }
    if status == "pendente":
        rows = [r for r in rows if not r["respondido"]]
    elif status == "respondido":
        rows = [r for r in rows if r["respondido"]]
    return {"pedidos": rows, "resumo": resumo}


@router.post("/dashboard/pedidos")
def criar_pedido(p: PedidoIn, user: dict = Depends(require_module("dashboard"))):
    v = _validar_pedido(p)
    usuario = user.get("sub", "")
    with _db() as conn:
        cur = conn.execute(
            "INSERT INTO pedidos_pesquisa (autor,email_solicitante,data_pedido,assunto,respondido,"
            "data_resposta,email_resposta,registrado_por,respondido_por,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (v["autor"], v["email_solicitante"], v["data_pedido"], v["assunto"], v["respondido"],
             v["data_resposta"], v["email_resposta"], usuario, usuario if v["respondido"] else None,
             datetime.now().isoformat(timespec="seconds")))
        conn.commit()
    return {"ok": True, "id": cur.lastrowid}


@router.put("/dashboard/pedidos/{pid}")
def atualizar_pedido(pid: int, p: PedidoIn, user: dict = Depends(require_module("dashboard"))):
    v = _validar_pedido(p)
    usuario = user.get("sub", "")
    with _db() as conn:
        atual = conn.execute("SELECT respondido, respondido_por FROM pedidos_pesquisa WHERE id=?", (pid,)).fetchone()
        if not atual:
            raise HTTPException(404, "Pedido não encontrado.")
        resp_por = (atual["respondido_por"] or usuario) if v["respondido"] else None
        conn.execute(
            "UPDATE pedidos_pesquisa SET autor=?,email_solicitante=?,data_pedido=?,assunto=?,respondido=?,"
            "data_resposta=?,email_resposta=?,respondido_por=?,updated_at=? WHERE id=?",
            (v["autor"], v["email_solicitante"], v["data_pedido"], v["assunto"], v["respondido"],
             v["data_resposta"], v["email_resposta"], resp_por,
             datetime.now().isoformat(timespec="seconds"), pid))
        conn.commit()
    return {"ok": True}


@router.delete("/dashboard/pedidos/{pid}")
def excluir_pedido(pid: int, user: dict = Depends(require_module("dashboard"))):
    with _db() as conn:
        cur = conn.execute("DELETE FROM pedidos_pesquisa WHERE id=?", (pid,))
        conn.commit()
    if not cur.rowcount:
        raise HTTPException(404, "Pedido não encontrado.")
    return {"ok": True}
