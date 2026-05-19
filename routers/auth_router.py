"""
auth_router.py — Rotas de autenticação JWT
─────────────────────────────────────────────────────────────────────────────
Responsabilidades:
  POST /auth/login    → recebe usuário+senha, devolve access+refresh token
  POST /auth/refresh  → recebe refresh token, devolve novo par de tokens
  POST /auth/logout   → revoga o refresh token (blacklist)

Regra: zero lógica de negócio aqui. Só HTTP — validar entrada, chamar
o service, montar resposta.
"""

from fastapi import APIRouter, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from fastapi import Depends
from pydantic import BaseModel

from services.auth_service import (
    get_user,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    revoke_refresh_token,
    is_revoked,
)

router = APIRouter(prefix="/auth", tags=["Autenticação"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# ── Schemas de resposta ───────────────────────────────────────────────────────
class TokenResponse(BaseModel):
    access_token:  str
    refresh_token: str
    token_type:    str = "bearer"
    username:      str
    level:         str
    modules:       list[str]


class RefreshRequest(BaseModel):
    refresh_token: str


# ── Rotas ─────────────────────────────────────────────────────────────────────
@router.post("/login", response_model=TokenResponse)
def login(form: OAuth2PasswordRequestForm = Depends()):
    """
    Recebe username + password no formato form-data (padrão OAuth2).
    Verifica credenciais e devolve o par de tokens + dados do usuário.
    O frontend guarda esses tokens para usar nas próximas requests.
    """
    user = get_user(form.username)

    # Mensagem genérica intencional — não revelar se o usuário existe ou não
    if not user or not verify_password(form.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access  = create_access_token(user["username"], user["level"], user["modules"])
    refresh = create_refresh_token(user["username"])

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        username=user["username"],
        level=user["level"],
        modules=user["modules"],
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest):
    """
    Recebe o refresh token, valida, e devolve novo par de tokens.
    Rotação de token: o refresh antigo é revogado e um novo é emitido.
    Isso limita a janela de ataque se um refresh token for comprometido.
    """
    if is_revoked(body.refresh_token):
        raise HTTPException(status_code=401, detail="Token revogado")

    try:
        payload = decode_token(body.refresh_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Tipo de token incorreto")

    user = get_user(payload["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")

    # Revoga o refresh token antigo — rotação obrigatória
    revoke_refresh_token(body.refresh_token)

    access  = create_access_token(user["username"], user["level"], user["modules"])
    refresh_new = create_refresh_token(user["username"])

    return TokenResponse(
        access_token=refresh_new,
        refresh_token=refresh_new,
        username=user["username"],
        level=user["level"],
        modules=user["modules"],
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(body: RefreshRequest):
    """
    Revoga o refresh token — impede renovação futura.
    O access token ainda válido expira naturalmente em 15 min.
    Status 204: sucesso sem corpo de resposta (padrão REST para logout).
    """
    revoke_refresh_token(body.refresh_token)