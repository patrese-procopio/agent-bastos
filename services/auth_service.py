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
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from dotenv import load_dotenv
load_dotenv()

_log = logging.getLogger("bastos.auth")

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
# Hashes ficam no .env (ADMIN_PASSWORD_HASH / ANALISTA_PASSWORD_HASH).
# Para gerar/atualizar: rode `python scripts/setar_senha.py admin` (getpass).
#
# Fallback (legado): se o .env não tiver hash, usa admin123/analista123 e
# emite WARNING gritante no log — sinal claro para o operador trocar.

_FALLBACK_ADMIN     = "admin123"
_FALLBACK_ANALISTA  = "analista123"


def _carregar_hash(env_var: str, fallback: str, usuario: str) -> str:
    """Lê hash bcrypt do .env; se ausente, faz hash do fallback e avisa."""
    h = os.getenv(env_var, "").strip()
    if h:
        return h
    _log.warning(
        f"{env_var} não definido — usando senha padrão para '{usuario}'. "
        f"Rode: python scripts/setar_senha.py {usuario}",
        extra={"usuario": usuario, "acao": "fallback_senha_padrao"},
    )
    return pwd_context.hash(fallback)


USERS_DB: dict = {
    "admin": {
        "username": "admin",
        "hashed_password": _carregar_hash("ADMIN_PASSWORD_HASH", _FALLBACK_ADMIN, "admin"),
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
        "hashed_password": _carregar_hash("ANALISTA_PASSWORD_HASH", _FALLBACK_ANALISTA, "analista"),
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