"""
auth_service.py - Logica de autenticacao JWT
-----------------------------------------------------------------------------
Responsabilidades:
  1. Verificar senha com bcrypt
  2. Criar access token (15 min) e refresh token (7 dias)
  3. Decodificar e validar tokens
  4. Gerenciar blacklist de refresh tokens (logout)

Regra: zero FastAPI aqui. So logica pura - testavel de forma isolada.
"""

import os
import json
import logging
import sqlite3
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from dotenv import load_dotenv

# override=True: o .env e a fonte de verdade das chaves/config (consistente com api.py).
load_dotenv(override=True)

_log = logging.getLogger("bastos.auth")

# --- Configuracao -------------------------------------------------------------
# JWT_SECRET_KEY e OBRIGATORIA (fail-fast).
# Para gerar uma nova chave forte:
#   python -c "import secrets; print(secrets.token_hex(48))"
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET_KEY nao encontrada no ambiente. Configure o arquivo .env.\n"
        "Para gerar uma chave forte: "
        "python -c \"import secrets; print(secrets.token_hex(48))\""
    )

ALGORITHM   = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS   = 7

# Banco SQLite para blacklist de tokens revogados.
# Fica em data/auth.db â€” persiste entre reinicializacoes do servidor.
AUTH_DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data", "auth.db"
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# --- Blacklist SQLite â€” logout persistente ----------------------------

def _get_db_conn() -> sqlite3.Connection:
    """
    Conexao SQLite com WAL (Write-Ahead Logging).
    WAL permite leituras concorrentes sem bloquear escritas.
    """
    os.makedirs(os.path.dirname(AUTH_DB_PATH), exist_ok=True)
    conn = sqlite3.connect(AUTH_DB_PATH, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _init_blacklist_db() -> None:
    """
    Cria a tabela revoked_tokens se nao existir. Idempotente.
    Remove tokens ja expirados na inicializacao (housekeeping automatico).

    Schema:
      token_hash : SHA-256 do JWT (nunca o token raw)
      revoked_at : quando foi revogado (ISO UTC)
      expires_at : quando o token expiraria naturalmente (para cleanup)
    """
    with _get_db_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS revoked_tokens (
                token_hash TEXT PRIMARY KEY,
                revoked_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )
        """)
        # Remove tokens expirados â€” ja sao invalidos de qualquer forma
        conn.execute(
            "DELETE FROM revoked_tokens WHERE expires_at < ?",
            (datetime.now(timezone.utc).isoformat(),)
        )


def _hash_token(token: str) -> str:
    """SHA-256 do token â€” nunca armazenamos o JWT raw no banco."""
    return hashlib.sha256(token.encode()).hexdigest()


# Inicializa o banco na carga do modulo (idempotente)
_init_blacklist_db()


def _init_users_db() -> None:
    """
    Cria a tabela users em auth.db se nao existir.
    Se a tabela estiver vazia, semeia admin e analista
    usando os hashes do .env (migracao automatica).
    """
    with _get_db_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                username        TEXT PRIMARY KEY,
                hashed_password TEXT NOT NULL,
                level           TEXT NOT NULL DEFAULT 'analista',
                modules         TEXT NOT NULL DEFAULT '[]',
                created_at      TEXT NOT NULL,
                created_by      TEXT NOT NULL DEFAULT 'system'
            )
        """)
        count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if count > 0:
            return
        # Tabela vazia: semeia usuarios padrao do .env
        now = datetime.now(timezone.utc).isoformat()
        seed = [
            (
                "admin",
                _carregar_hash("ADMIN_PASSWORD_HASH", _FALLBACK_ADMIN, "admin"),
                "admin",
                json.dumps(["chat_rag", "grafoscopia", "transcricao", "dashboard",
                            "agenda", "alertas", "lista_negra", "referencias",
                            "noticias", "osint", "grupos", "inteligencia_grupos",
                            "politicas", "configuracoes"]),
                now, "system"
            ),
            (
                "analista",
                _carregar_hash("ANALISTA_PASSWORD_HASH", _FALLBACK_ANALISTA, "analista"),
                "analista",
                json.dumps(["chat_rag", "grafoscopia", "transcricao",
                            "referencias", "noticias"]),
                now, "system"
            ),
        ]
        conn.executemany(
            "INSERT OR IGNORE INTO users "
            "(username, hashed_password, level, modules, created_at, created_by) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            seed
        )




# --- Banco de usuarios --------------------------------------------------------
_FALLBACK_ADMIN     = "admin123"
_FALLBACK_ANALISTA  = "analista123"


def _carregar_hash(env_var: str, fallback: str, usuario: str) -> str:
    h = os.getenv(env_var, "").strip()
    if h:
        return h
    _log.warning(
        f"{env_var} nao definido - usando senha padrao para '{usuario}'. "
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
        # grafoscopia: concedido explicitamente â€” funcao primordial para o
        # trabalho operacional diario dos analistas da agencia.
        # Principio do menor privilegio aplicado: acesso por concessao
        # intencional, nao por ausencia de controle.
        "modules": [
            "chat_rag", "grafoscopia", "transcricao",
            "referencias", "noticias"
        ],
    },
}


_init_users_db()

# --- CRUD de usuarios --------------------------------------------------------

def create_user(
    username: str,
    plain_password: str,
    level: str,
    modules: list[str],
    created_by: str = "system",
) -> dict:
    """
    Cria novo usuario no banco.
    Levanta ValueError se o username ja existe.
    """
    if get_user(username):
        raise ValueError(f"Usuario '{username}' ja existe.")
    hashed = pwd_context.hash(plain_password)
    now    = datetime.now(timezone.utc).isoformat()
    with _get_db_conn() as conn:
        conn.execute(
            "INSERT INTO users "
            "(username, hashed_password, level, modules, created_at, created_by) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (username, hashed, level, json.dumps(modules), now, created_by)
        )
    return {
        "username":   username,
        "level":      level,
        "modules":    modules,
        "created_at": now,
        "created_by": created_by,
    }


def delete_user(username: str) -> bool:
    """Remove usuario. Retorna True se removido, False se nao existia."""
    with _get_db_conn() as conn:
        result = conn.execute(
            "DELETE FROM users WHERE username = ?", (username,)
        )
    return result.rowcount > 0


def list_users() -> list[dict]:
    """Lista todos os usuarios sem expor hashes de senha."""
    with _get_db_conn() as conn:
        rows = conn.execute(
            "SELECT username, level, modules, created_at, created_by "
            "FROM users ORDER BY username"
        ).fetchall()
    return [
        {
            "username":   r[0],
            "level":      r[1],
            "modules":    json.loads(r[2]),
            "created_at": r[3],
            "created_by": r[4],
        }
        for r in rows
    ]


# --- Funcoes de senha ---------------------------------------------------------
def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def get_user(username: str) -> Optional[dict]:
    """Retorna o usuario do banco SQLite ou None se nao existir."""
    with _get_db_conn() as conn:
        row = conn.execute(
            "SELECT username, hashed_password, level, modules "
            "FROM users WHERE username = ?",
            (username,)
        ).fetchone()
    if not row:
        return None
    return {
        "username":        row[0],
        "hashed_password": row[1],
        "level":           row[2],
        "modules":         json.loads(row[3]),
    }


# --- Funcoes de token ---------------------------------------------------------
def _create_token(payload: dict, expires_delta: timedelta) -> str:
    data = payload.copy()
    now  = datetime.now(timezone.utc)
    data["iat"] = now
    data["exp"] = now + expires_delta
    return jwt.encode(data, SECRET_KEY, algorithm=ALGORITHM)


def create_access_token(username: str, level: str, modules: list[str]) -> str:
    return _create_token(
        {"sub": username, "level": level, "modules": modules, "type": "access"},
        timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(username: str) -> str:
    return _create_token(
        {"sub": username, "type": "refresh"},
        timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise exc


# --- Blacklist (logout) -------------------------------------------------------
def revoke_refresh_token(token: str) -> None:
    try:
        claims = jwt.get_unverified_claims(token)
        exp = claims.get("exp", 0)
        expires_at = datetime.fromtimestamp(exp, tz=timezone.utc).isoformat()
    except Exception:
        expires_at = (datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)).isoformat()
    token_hash = _hash_token(token)
    with _get_db_conn() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO revoked_tokens (token_hash, revoked_at, expires_at) VALUES (?, ?, ?)",
            (token_hash, datetime.now(timezone.utc).isoformat(), expires_at)
        )


def is_revoked(token: str) -> bool:
    token_hash = _hash_token(token)
    with _get_db_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM revoked_tokens WHERE token_hash = ?",
            (token_hash,)
        ).fetchone()
    return row is not None




