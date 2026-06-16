# -*- coding: utf-8 -*-
"""
routers/correlacao_router.py — Motor de Correlação (Missão 23)
─────────────────────────────────────────────────────────────────────────────
Expõe endpoints para disparar o Motor de Correlação manualmente.

Rotas registradas:
  POST  /api/correlacao/reprocessar   → (admin) varre todo histórico e
                                         gera HITLs para pares ainda não
                                         registrados em correlacoes_registradas
  GET   /api/correlacao/stats         → (admin) retorna contagens da tabela
                                         de deduplicação

Arquitetura:
  - Segue o padrão BackgroundTask: a rota retorna 202 imediatamente e o
    processamento pesado ocorre em background, sem bloquear o event-loop.
  - A importação do engine é opcional (try/except) para que uma falha no
    engine nunca derrube os outros routers.
"""

from fastapi import APIRouter, BackgroundTasks, Depends
from dependencies import require_module
from services.logging_service import get_logger

_log = get_logger("correlacao.router")

router = APIRouter(prefix="/correlacao", tags=["correlacao"])

# ── Importação opcional do engine ─────────────────────────────────────────────
try:
    from services.correlacao_engine import reprocessar_todos as _reprocessar
    from services.correlacao_engine import _conn as _engine_conn
    _ENGINE_OK = True
except ImportError:
    _ENGINE_OK = False


# ── Helpers ───────────────────────────────────────────────────────────────────

def _stats_correlacoes() -> dict:
    """Lê contagens direto da tabela de deduplicação."""
    if not _ENGINE_OK:
        return {"erro": "engine não disponível"}
    try:
        with _engine_conn() as c:
            total = c.execute("SELECT COUNT(*) FROM correlacoes_registradas").fetchone()[0]
            por_fonte = c.execute(
                "SELECT fonte_tipo, COUNT(*) FROM correlacoes_registradas GROUP BY fonte_tipo"
            ).fetchall()
        return {
            "total": total,
            "por_fonte": {row[0]: row[1] for row in por_fonte},
        }
    except Exception as exc:
        return {"erro": str(exc)}


# ── Rotas ─────────────────────────────────────────────────────────────────────

@router.post("/reprocessar", status_code=202)
async def reprocessar(
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_module("admin")),
):
    """
    Dispara o reprocessamento completo de todos os módulos históricos:
      - Extratos (corpo)
      - Transcrições (texto_completo / resultado_ia)
      - Alertas (título + descrição)

    Retorna 202 imediatamente. O job roda em background e grava
    os HITLs novos conforme encontra correlações ainda não registradas.

    Idempotente: rodadas repetidas nunca geram HITLs duplicados
    (garantido pelo UNIQUE INDEX em correlacoes_registradas).
    """
    if not _ENGINE_OK:
        return {"ok": False, "detalhe": "Motor de correlação não disponível (import error)."}

    operador = user.get("sub", "sistema")
    _log.info("reprocessamento completo solicitado", extra={"username": operador})

    background_tasks.add_task(_reprocessar, operador=operador)

    return {
        "ok": True,
        "status": "reprocessamento iniciado em background",
        "operador": operador,
    }


@router.get("/stats")
def stats(user: dict = Depends(require_module("admin"))):
    """
    Retorna contagens da tabela de deduplicação (correlacoes_registradas).
    Útil para monitorar quantas correlações já foram detectadas por módulo.
    """
    return _stats_correlacoes()
