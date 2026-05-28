"""
dependencies.py — Dependências de autenticação para injeção nas rotas
─────────────────────────────────────────────────────────────────────────────
Responsabilidades:
  1. Extrair o token do header Authorization: Bearer <token>
  2. Validar assinatura e expiração
  3. Retornar os dados do usuário para a rota que pediu
  4. Bloquear acesso se token inválido ou módulo não autorizado

Como funciona a injeção de dependência do FastAPI:
  Quando uma rota declara `user: dict = Depends(get_current_user)`,
  o FastAPI executa get_current_user automaticamente antes da rota.
  Se lançar HTTPException, a rota nem chega a executar.
"""

from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import OAuth2PasswordBearer
from fastapi.security.utils import get_authorization_scheme_param
from jose import JWTError

from services.auth_service import decode_token

# Aponta para onde fica a rota de login — usado pelo Swagger para
# gerar o botão "Authorize" e pelo OAuth2 para saber onde buscar o token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Dependência base — valida o access token e retorna os claims.

    Retorna um dict com:
      {
        "sub":     "admin",
        "level":   "admin",
        "modules": ["chat_rag", "grafoscopia", ...],
        "type":    "access",
        "iat":     <timestamp>,
        "exp":     <timestamp>
      }
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido ou expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_token(token)
    except JWTError:
        raise credentials_exception

    # Garante que não estão usando um refresh token no lugar do access token
    if payload.get("type") != "access":
        raise credentials_exception

    # Garante que o campo sub (username) existe no token
    if not payload.get("sub"):
        raise credentials_exception

    return payload


def get_current_user_media(
    request: Request,
    token_query: str = Query(default=None, alias="token"),
) -> dict:
    """
    Variante de get_current_user para endpoints de mídia (imagens).
    Aceita token via query param ?token=... (necessário para <img src="...">)
    ou via header Authorization: Bearer <token>.
    """
    token = token_query
    if not token:
        auth = request.headers.get("Authorization", "")
        scheme, param = get_authorization_scheme_param(auth)
        if scheme.lower() == "bearer":
            token = param

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Token não fornecido")
    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Token inválido ou expirado")

    if payload.get("type") != "access" or not payload.get("sub"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Token inválido")
    return payload


def require_module(module: str):
    """
    Fábrica de dependências — cria um porteiro específico por módulo.

    Uso na rota:
      @router.post("/grafoscopia")
      def analisar(user = Depends(require_module("grafoscopia"))):
          ...

    Se o usuário não tiver "grafoscopia" nos modules do token → 403 Forbidden.
    Se o token for inválido → 401 Unauthorized (via get_current_user).
    """
    def checker(user: dict = Depends(get_current_user)) -> dict:
        if module not in user.get("modules", []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Acesso ao módulo '{module}' não autorizado para o nível '{user.get('level')}'",
            )
        return user
    return checker
