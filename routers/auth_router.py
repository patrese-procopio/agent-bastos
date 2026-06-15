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

from fastapi import APIRouter, HTTPException, Request, status
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
    create_user,
    update_user,
    delete_user,
    list_users,
)
from dependencies import require_module
from services.rate_limit_service import limiter, LIMIT_LOGIN, LIMIT_REFRESH
from services.logging_service import get_logger
from services.audit_service import registrar as audit

_log_audit    = get_logger("audit")
_log_security = get_logger("security")

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


class CreateUserRequest(BaseModel):
    username: str
    password: str
    level:    str       = "analista"
    modules:  list[str] = []


class UpdateUserRequest(BaseModel):
    password: str | None = None
    level:    str | None = None
    modules:  list[str] | None = None
    active:   bool | None = None


class UserResponse(BaseModel):
    username:   str
    level:      str
    modules:    list[str]
    active:     bool = True
    created_at: str
    created_by: str


# ── Rotas ─────────────────────────────────────────────────────────────────────
@router.post("/login", response_model=TokenResponse)
@limiter.limit(LIMIT_LOGIN)
def login(request: Request, form: OAuth2PasswordRequestForm = Depends()):
    """
    Recebe username + password no formato form-data (padrão OAuth2).
    Verifica credenciais e devolve o par de tokens + dados do usuário.
    O frontend guarda esses tokens para usar nas próximas requests.

    Rate limit: LIMIT_LOGIN por IP (anti brute-force).
    """
    user = get_user(form.username)
    ip = request.client.host if request.client else "?"

    # Mensagem genérica intencional — não revelar se o usuário existe ou não
    if not user or not verify_password(form.password, user["hashed_password"]) or not user.get("active", True):
        _log_security.warning(
            "login falhou",
            extra={"username": form.username, "ip": ip, "motivo": "credenciais"},
        )
        audit("login_falhou", "autenticacao", usuario=form.username, ip=ip,
              detalhe="credenciais invalidas ou usuario inativo")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access  = create_access_token(user["username"], user["level"], user["modules"])
    refresh = create_refresh_token(user["username"])

    _log_audit.info(
        "login ok",
        extra={"username": user["username"], "level": user["level"], "ip": ip},
    )
    audit("login_ok", "autenticacao", usuario=user["username"], ip=ip,
          detalhe=f"level={user['level']}")

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        username=user["username"],
        level=user["level"],
        modules=user["modules"],
    )


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit(LIMIT_REFRESH)
def refresh(request: Request, body: RefreshRequest):
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
def logout(request: Request, body: RefreshRequest):
    """
    Revoga o refresh token — impede renovação futura.
    O access token ainda válido expira naturalmente em 15 min.
    Status 204: sucesso sem corpo de resposta (padrão REST para logout).
    """
    revoke_refresh_token(body.refresh_token)
    ip = request.client.host if request.client else "?"
    try:
        payload = decode_token(body.refresh_token)
        _log_audit.info("logout", extra={"username": payload.get("sub"), "ip": ip})
        audit("logout", "autenticacao", usuario=payload.get("sub","?"), ip=ip)
    except Exception:
        _log_audit.info("logout", extra={"username": "?", "ip": ip})
        audit("logout", "autenticacao", ip=ip)


# -- Gerenciamento de usuarios (admin only) -----------------------------------

@router.get("/usuarios", response_model=list[UserResponse])
def listar_usuarios(user: dict = Depends(require_module("configuracoes"))):
    """
    Lista todos os usuarios cadastrados.
    Acesso: apenas admin (modulo configuracoes).
    Hashes de senha nunca sao expostos.
    """
    return list_users()


@router.post("/usuarios", response_model=UserResponse, status_code=201)
def criar_usuario(
    body: CreateUserRequest,
    user: dict = Depends(require_module("configuracoes")),
):
    """
    Cria novo usuario.
    Acesso: apenas admin (modulo configuracoes).
    """
    try:
        novo = create_user(
            username=body.username,
            plain_password=body.password,
            level=body.level,
            modules=body.modules,
            created_by=user["sub"],
        )
        _log_audit.info(
            "usuario criado",
            extra={"novo_usuario": body.username, "criado_por": user["sub"]},
        )
        audit("usuario_criado", "usuario", usuario=user["sub"], alvo=body.username,
              detalhe=f"level={body.level}")
        return novo
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.put("/usuarios/{username}", response_model=UserResponse)
def atualizar_usuario(
    username: str,
    body: UpdateUserRequest,
    user: dict = Depends(require_module("configuracoes")),
):
    """
    Atualiza nivel, modulos, senha ou status ativo de um usuario.
    Campos omitidos (null) nao sao alterados.
    Acesso: apenas admin (modulo configuracoes).
    """
    try:
        atualizado = update_user(
            username=username,
            plain_password=body.password,
            level=body.level,
            modules=body.modules,
            active=body.active,
        )
        _log_audit.info(
            "usuario atualizado",
            extra={"usuario": username, "atualizado_por": user["sub"]},
        )
        audit("usuario_editado", "usuario", usuario=user["sub"], alvo=username,
              detalhe=f"level={body.level or '?'} active={body.active}")
        # get_user nao retorna created_at/created_by, busca da listagem
        from services.auth_service import list_users
        todos = {u["username"]: u for u in list_users()}
        dados = todos.get(username, atualizado)
        return {**atualizado, "created_at": dados.get("created_at",""), "created_by": dados.get("created_by","")}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/usuarios/{username}", status_code=204)
def deletar_usuario(
    username: str,
    user: dict = Depends(require_module("configuracoes")),
):
    """
    Remove usuario do banco.
    Admin nao pode deletar a si mesmo.
    Acesso: apenas admin (modulo configuracoes).
    """
    if username == user["sub"]:
        raise HTTPException(
            status_code=400,
            detail="Nao e possivel deletar o proprio usuario."
        )
    if not delete_user(username):
        raise HTTPException(
            status_code=404,
            detail=f"Usuario '{username}' nao encontrado."
        )
    _log_audit.info(
        "usuario deletado",
        extra={"usuario_deletado": username, "deletado_por": user["sub"]},
    )
    audit("usuario_deletado", "usuario", usuario=user["sub"], alvo=username)