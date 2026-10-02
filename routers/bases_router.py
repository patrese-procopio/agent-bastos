"""
routers/bases_router.py — Atualização das bases locais do OSINT (Receita, CGU)
Agent Bastos | Segurança Pública/Corporativa

  POST /bases/atualizar?base=todas|receita|cgu&forcar=false   dispara a carga em 2º plano
  GET  /bases/status                                          estado de cada base

Acesso: usuário com o módulo "configuracoes" (JWT) OU o agendador (n8n) com o header
X-Agendador-Token (ver dependencies.require_module_or_scheduler).

Sem `forcar`, cada carga só roda se houver dado novo (Receita: mês novo; CGU: PEP de mês novo
ou banco com mais de 30 dias) — o agendador pode chamar todo dia.
"""

from fastapi import APIRouter, Depends, HTTPException, Request

from dependencies import require_module_or_scheduler
from services import bases_osint_service as bases
from services.logging_service import get_logger
from services.rate_limit_service import LIMIT_REINDEX, limiter

router = APIRouter(prefix="/bases", tags=["bases OSINT"])
_log_audit = get_logger("audit.bases")
_gate = require_module_or_scheduler("configuracoes")


@router.post("/atualizar")
@limiter.limit(LIMIT_REINDEX)
def atualizar(request: Request, base: str = "todas", forcar: bool = False, user: dict = Depends(_gate)):
    alvo = list(bases.BASES) if base == "todas" else [base]
    if any(b not in bases.BASES for b in alvo):
        raise HTTPException(status_code=422, detail=f"base inválida: {base}. Use todas, {', '.join(bases.BASES)}")
    _log_audit.info("atualizar bases", extra={"username": user.get("sub"), "base": base, "forcar": forcar})
    return {"ok": True, "resultado": [bases.iniciar(b, se_novo=not forcar) for b in alvo]}


@router.get("/status")
def status(user: dict = Depends(_gate)):
    return bases.status()
