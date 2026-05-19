"""
auth_service.py — Lógica de autenticação JWT
─────────────────────────────────────────────────────────────────────────────
Responsabilidades:
  1. Verificar senha com bcrypt
  2. Criar access token (15 min) e refresh token (7 dias)
  3. Decodificar e validar tokens
  4. Gerenciar blacklist de refresh tokens (logout)

Regra: zero FastAPI aqui. Só lógica pura — testável de forma isolada.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

# ── Configuração ──────────────────────────────────────────────────────────────
SECRET_KEY  = os.getenv("JWT_SECRET_KEY")
ALGORITHM   = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS   = 7

# Contexto bcrypt — custo 12 é o padrão corporativo
# (lento o suficiente pra dificultar força bruta, rápido o suficiente pra UX)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Blacklist em memória — guarda refresh tokens revogados (logout)
# Limitação: reiniciar o servidor limpa a blacklist.
# Próximo passo natural: migrar para Redis ou SQLite.
_blacklist: set[str] = set()


# ── Banco de usuários ─────────────────────────────────────────────────────────
# Por ora: dicionário estático. Quando tiver banco real, só trocar get_user().
# A senha NUNCA fica em texto puro — sempre o hash bcrypt.
# Para gerar um hash novo: python -c "from passlib.context import CryptContext; c=CryptContext(schemes=['bcrypt']); print(c.hash('sua_senha'))"

USERS_DB: dict = {
    "admin": {
        "username": "admin",
        "hashed_password": pwd_context.hash("admin123"),   # troque antes de produção
        "level": "admin",
        "modules": [
            "chat_rag", "grafoscopia", "transcricao", "dashboard",
            "agenda", "alertas", "lista_negra", "referencias",
            "noticias", "osint", "grupos", "inteligencia_grupos",
            "politicas", "configuracoes"
        ],
    },
    "analista": {
        "username": "analista",
        "hashed_password": pwd_context.hash("analista123"),  # troque antes de produção
        "level": "analista",
        "modules": ["chat_rag", "transcricao", "referencias", "noticias"],
    },
}


# ── Funções de senha ──────────────────────────────────────────────────────────
def verify_password(plain: str, hashed: str) -> bool:
    """Compara senha em texto puro com o hash armazenado."""
    return pwd_context.verify(plain, hashed)


def get_user(username: str) -> Optional[dict]:
    """Retorna o usuário do banco ou None se não existir."""
    return USERS_DB.get(username)


# ── Funções de token ──────────────────────────────────────────────────────────
def _create_token(payload: dict, expires_delta: timedelta) -> str:
    """
    Função interna — não chamar diretamente.
    Adiciona exp e iat ao payload e assina com a SECRET_KEY.
    """
    data = payload.copy()
    now  = datetime.now(timezone.utc)
    data["iat"] = now                        # issued at — quando foi criado
    data["exp"] = now + expires_delta        # expiration — quando expira
    return jwt.encode(data, SECRET_KEY, algorithm=ALGORITHM)


def create_access_token(username: str, level: str, modules: list[str]) -> str:
    """
    Token de curta duração — vai no header de cada request.
    Carrega as permissões do usuário nos claims para evitar consulta ao banco.
    """
    return _create_token(
        {"sub": username, "level": level, "modules": modules, "type": "access"},
        timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(username: str) -> str:
    """
    Token de longa duração — fica guardado no frontend.
    Só carrega o username, sem permissões (permissões são relidas no refresh).
    """
    return _create_token(
        {"sub": username, "type": "refresh"},
        timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )


def decode_token(token: str) -> dict:
    """
    Decodifica e valida o token.
    Lança JWTError se assinatura inválida, expirado ou malformado.
    """
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise exc   # quem chamar decide o que fazer com o erro


# ── Blacklist (logout) ────────────────────────────────────────────────────────
def revoke_refresh_token(token: str) -> None:
    """Adiciona o refresh token à blacklist — efetua logout."""
    _blacklist.add(token)


def is_revoked(token: str) -> bool:
    """Verifica se o refresh token já foi revogado."""
    return token in _blacklist