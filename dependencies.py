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

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError

from services.auth_service import decode_token

# Aponta para onde fica a rota de login — usado pelo Swagger para
# gerar o botão "Authorize" e pelo OAuth2 para saber onde buscar o token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


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