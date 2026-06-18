"""
routers/agenda_router.py
─────────────────────────────────────────────────────────────────────────────
Rotas HTTP da Agenda de Missão — publicação e leitura de ordens operacionais.

Rotas registradas:
  POST   /agenda/login                          → autenticação do chefe
  POST   /agenda/publicar                       → publica missão no Firestore
  GET    /agenda/missoes                        → lista missões recentes
  PATCH  /agenda/missoes/{missao_id}/ciencia    → núcleo acusa ciência

Segurança:
  Senha do chefe verificada com bcrypt (rounds=12).
  Hash armazenado em CHEFE_PASSWORD_HASH no .env — nunca no código.
  Para gerar um novo hash: python -c "from passlib.context import CryptContext;
    c=CryptContext(schemes=['bcrypt']); print(c.hash('SUA_SENHA'))"
"""

import os

from fastapi import APIRouter, Depends, HTTPException, status
from passlib.context import CryptContext
from pydantic import BaseModel

from dependencies import get_current_user, require_module

router = APIRouter(tags=["agenda"])

# bcrypt com rounds=12 — padrão de mercado para senhas operacionais
_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Hash lido do .env. Se não configurado em produção, recusa todos os logins.
_CHEFE_HASH = os.getenv("CHEFE_PASSWORD_HASH", "")


# ─── Modelos ─────────────────────────────────────────────────────────────────

class AgendaLoginRequest(BaseModel):
    senha: str


class MissaoRequest(BaseModel):
    nucleo:   str
    mensagem: str


class CienciaRequest(BaseModel):
    nucleo: str


# ─── Rotas ───────────────────────────────────────────────────────────────────

@router.post("/agenda/login")
def agenda_login(req: AgendaLoginRequest):
    # Sem hash configurado = sistema mal configurado → rejeita por segurança
    if not _CHEFE_HASH:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Autenticação do chefe não configurada. Contate o administrador.",
        )
    ok = _pwd_ctx.verify(req.senha, _CHEFE_HASH)
    return {"ok": ok}


@router.post("/agenda/publicar")
def agenda_publicar(req: MissaoRequest, user: dict = Depends(require_module("agenda"))):
    try:
        from modules.agenda import publicar_missao
        ok = publicar_missao(req.nucleo, req.mensagem)
        return {"ok": ok}
    except Exception as e:
        return {"ok": False, "erro": str(e)}


@router.get("/agenda/missoes")
def agenda_missoes(nucleo: str = None, limite: int = 30, user: dict = Depends(get_current_user)):
    try:
        from modules.agenda import buscar_missoes_recentes
        missoes   = buscar_missoes_recentes(nucleo=nucleo, limite=limite)
        resultado = []
        for m in missoes:
            ts = m.get("timestamp")
            resultado.append({
                **m,
                "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else str(ts) if ts else None,
            })
        return {"missoes": resultado}
    except Exception as e:
        return {"missoes": [], "erro": str(e)}


@router.patch("/agenda/missoes/{missao_id}/ciencia")
def agenda_acusar_ciencia(missao_id: str, req: CienciaRequest, user: dict = Depends(require_module("agenda"))):
    try:
        from modules.agenda import acusar_ciencia
        ok = acusar_ciencia(missao_id, req.nucleo)
        return {"ok": ok}
    except Exception as e:
        return {"ok": False, "erro": str(e)}