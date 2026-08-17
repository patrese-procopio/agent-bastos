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

from config.paths import DB_AUTH

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

# Caminho do banco centralizado em config/paths.py
# Em dev → BASE_DIR/data/auth.db
# Em prod → %APPDATA%\AgentBastos\data\auth.db
AUTH_DB_PATH = str(DB_AUTH)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# --- Blacklist SQLite — logout persistente ----------------------------

def _get_db_conn() -> sqlite3.Connection:
    """
    Conexao SQLite com WAL (Write-Ahead Logging).
    WAL permite leituras concorrentes sem bloquear escritas.
    """
    DB_AUTH.parent.mkdir(parents=True, exist_ok=True)
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
        # Remove tokens expirados â€" ja sao invalidos de qualquer forma
        conn.execute(
            "DELETE FROM revoked_tokens WHERE expires_at < ?",
            (datetime.now(timezone.utc).isoformat(),)
        )


def _hash_token(token: str) -> str:
    """SHA-256 do token - nunca armazenamos o JWT raw no banco."""
    return hashlib.sha256(token.encode()).hexdigest()


def revoke_refresh_token(token: str) -> None:
    """
    Adiciona o refresh token na blacklist (revogado).
    Armazena apenas o hash SHA-256, nunca o JWT em claro.
    expires_at calculado a partir do payload do token.
    """
    try:
        payload = decode_token(token)
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    except Exception:
        # Token invalido/expirado: revoga com TTL de 24h por seguranca
        exp = datetime.now(timezone.utc) + timedelta(hours=24)

    h = _hash_token(token)
    with _get_db_conn() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO revoked_tokens (token_hash, revoked_at, expires_at) VALUES (?, ?, ?)",
            (h, datetime.now(timezone.utc).isoformat(), exp.isoformat()),
        )


def is_revoked(token: str) -> bool:
    """
    Retorna True se o token estiver na blacklist.
    Tambem faz housekeeping dos tokens expirados nessa checagem.
    """
    h = _hash_token(token)
    now_iso = datetime.now(timezone.utc).isoformat()
    with _get_db_conn() as conn:
        # Remove expirados antes de checar (housekeeping inline)
        conn.execute("DELETE FROM revoked_tokens WHERE expires_at < ?", (now_iso,))
        row = conn.execute(
            "SELECT 1 FROM revoked_tokens WHERE token_hash = ?", (h,)
        ).fetchone()
    return row is not None


# Inicializa o banco na carga do modulo (idempotente)
_init_blacklist_db()


def _init_users_db() -> None:
    """
    Cria a tabela users em auth.db se nao existir.
    Se a tabela estiver vazia, semeia admin e analista
    usando os hashes do .env (migracao automatica).
    Migra automaticamente colunas novas se a tabela ja existir (idempotente).
    """
    with _get_db_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                username        TEXT PRIMARY KEY,
                hashed_password TEXT NOT NULL,
                level           TEXT NOT NULL DEFAULT 'analista',
                modules         TEXT NOT NULL DEFAULT '[]',
                active          INTEGER NOT NULL DEFAULT 1,
                created_at      TEXT NOT NULL,
                created_by      TEXT NOT NULL DEFAULT 'system',
                nome_completo   TEXT NOT NULL DEFAULT '',
                cpf             TEXT NOT NULL DEFAULT '',
                email           TEXT NOT NULL DEFAULT '',
                funcao          TEXT NOT NULL DEFAULT '',
                matricula       TEXT NOT NULL DEFAULT ''
            )
        """)
        # Migracao automatica: adiciona colunas ausentes em bancos pre-existentes.
        # LGPD art. 46: dados pessoais (CPF, email) armazenados server-side,
        # nunca expostos em texto plano via API — sempre mascarados na resposta.
        cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
        _migrations = {
            "active":        "ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1",
            "nome_completo": "ALTER TABLE users ADD COLUMN nome_completo TEXT NOT NULL DEFAULT ''",
            "cpf":           "ALTER TABLE users ADD COLUMN cpf TEXT NOT NULL DEFAULT ''",
            "email":         "ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT ''",
            "funcao":        "ALTER TABLE users ADD COLUMN funcao TEXT NOT NULL DEFAULT ''",
            "matricula":     "ALTER TABLE users ADD COLUMN matricula TEXT NOT NULL DEFAULT ''",
        }
        for col, sql in _migrations.items():
            if col not in cols:
                conn.execute(sql)
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
            "admin", "chat_rag", "grafoscopia", "transcricao", "dashboard",
            "agenda", "alertas", "lista_negra", "referencias",
            "noticias", "osint", "grupos", "inteligencia_grupos",
            "politicas", "configuracoes", "drone"
        ],
    },
    "analista": {
        "username": "analista",
        "hashed_password": _carregar_hash("ANALISTA_PASSWORD_HASH", _FALLBACK_ANALISTA, "analista"),
        "level": "analista",
        # grafoscopia: concedido explicitamente â€" funcao primordial para o
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

def _mask_cpf(cpf: str) -> str:
    """
    Mascara CPF para exibicao — LGPD art. 46 (minimizacao na exposicao).
    Entrada: '123.456.789-01' ou '12345678901'
    Saida:   'XXX.XXX.XXX-**'
    """
    digits = "".join(c for c in cpf if c.isdigit())
    if len(digits) == 11:
        return f"XXX.XXX.{digits[6:9]}-**"
    return "***.***.***-**" if cpf else ""


def create_user(
    username: str,
    plain_password: str,
    level: str,
    modules: list[str],
    created_by: str = "system",
    nome_completo: str = "",
    cpf: str = "",
    email: str = "",
    funcao: str = "",
    matricula: str = "",
) -> dict:
    """
    Cria novo usuario no banco.
    Levanta ValueError se o username ja existe.
    CPF armazenado como texto simples (server-side only) — mascarado na API.
    """
    if get_user(username):
        raise ValueError(f"Usuario '{username}' ja existe.")
    hashed = pwd_context.hash(plain_password)
    now    = datetime.now(timezone.utc).isoformat()
    with _get_db_conn() as conn:
        conn.execute(
            "INSERT INTO users "
            "(username, hashed_password, level, modules, created_at, created_by, "
            " nome_completo, cpf, email, funcao, matricula) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (username, hashed, level, json.dumps(modules), now, created_by,
             nome_completo, cpf, email, funcao, matricula)
        )
    return {
        "username":     username,
        "level":        level,
        "modules":      modules,
        "created_at":   now,
        "created_by":   created_by,
        "nome_completo": nome_completo,
        "cpf_masked":   _mask_cpf(cpf),
        "email":        email,
        "funcao":       funcao,
        "matricula":    matricula,
    }


def delete_user(username: str) -> bool:
    """Remove usuario. Retorna True se removido, False se nao existia."""
    with _get_db_conn() as conn:
        result = conn.execute(
            "DELETE FROM users WHERE username = ?", (username,)
        )
    return result.rowcount > 0


def list_users() -> list[dict]:
    """
    Lista todos os usuarios sem expor hashes de senha.
    CPF nunca retornado em texto plano — sempre mascarado (LGPD art. 46).
    """
    with _get_db_conn() as conn:
        rows = conn.execute(
            "SELECT username, level, modules, created_at, created_by, "
            "       nome_completo, cpf, email, funcao, matricula "
            "FROM users ORDER BY username"
        ).fetchall()
    return [
        {
            "username":      r[0],
            "level":         r[1],
            "modules":       json.loads(r[2]),
            "created_at":    r[3],
            "created_by":    r[4],
            "nome_completo": r[5],
            "cpf_masked":    _mask_cpf(r[6]),
            "email":         r[7],
            "funcao":        r[8],
            "matricula":     r[9],
        }
        for r in rows
    ]


# --- Funcoes de senha ---------------------------------------------------------
def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def change_password(username: str, old_password: str, new_password: str) -> None:
    """
    Troca a senha do usuario validando a senha atual primeiro.

    Regras:
      - Verifica que old_password corresponde ao hash atual (autentica antes de trocar).
      - new_password deve ter no minimo 8 caracteres.
      - Levanta ValueError com mensagem descritiva em caso de falha.
    """
    if len(new_password) < 8:
        raise ValueError("A nova senha deve ter pelo menos 8 caracteres.")

    # Busca o hash atual diretamente (get_user omite o campo para seguranca)
    with _get_db_conn() as conn:
        row = conn.execute(
            "SELECT hashed_password FROM users WHERE username = ? AND active = 1",
            (username,)
        ).fetchone()

    if not row:
        raise ValueError("Usuario nao encontrado ou inativo.")

    if not pwd_context.verify(old_password, row[0]):
        raise ValueError("Senha atual incorreta.")

    update_user(username, plain_password=new_password)


def get_user(username: str) -> Optional[dict]:
    """Retorna o usuario do banco SQLite ou None se nao existir."""
    with _get_db_conn() as conn:
        row = conn.execute(
            "SELECT username, hashed_password, level, modules, active, "
            "       nome_completo, cpf, email, funcao, matricula "
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
        "active":          bool(row[4]),
        "nome_completo":   row[5],
        "cpf_masked":      _mask_cpf(row[6]),
        "email":           row[7],
        "funcao":          row[8],
        "matricula":       row[9],
    }


def update_user(
    username: str,
    plain_password: Optional[str] = None,
    level: Optional[str] = None,
    modules: Optional[list] = None,
    active: Optional[bool] = None,
    nome_completo: Optional[str] = None,
    cpf: Optional[str] = None,
    email: Optional[str] = None,
    funcao: Optional[str] = None,
    matricula: Optional[str] = None,
) -> dict:
    """
    Atualiza campos do usuario. Apenas os campos fornecidos (nao-None) sao alterados.
    Levanta ValueError se o usuario nao existir.
    """
    user = get_user(username)
    if not user:
        raise ValueError(f"Usuario '{username}' nao encontrado.")

    fields, values = [], []
    if plain_password is not None:
        fields.append("hashed_password = ?")
        values.append(pwd_context.hash(plain_password))
    if level is not None:
        fields.append("level = ?")
        values.append(level)
    if modules is not None:
        fields.append("modules = ?")
        values.append(json.dumps(modules))
    if active is not None:
        fields.append("active = ?")
        values.append(1 if active else 0)
    if nome_completo is not None:
        fields.append("nome_completo = ?")
        values.append(nome_completo)
    if cpf is not None:
        fields.append("cpf = ?")
        values.append(cpf)
    if email is not None:
        fields.append("email = ?")
        values.append(email)
    if funcao is not None:
        fields.append("funcao = ?")
        values.append(funcao)
    if matricula is not None:
        fields.append("matricula = ?")
        values.append(matricula)

    if not fields:
        return get_user(username)

    values.append(username)
    with _get_db_conn() as conn:
        conn.execute(
            f"UPDATE users SET {', '.join(fields)} WHERE username = ?",
            values,
        )
    return get_user(username)


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
    """
    Decodifica e valida um JWT.
    Relanca JWTError se invalido/expirado — o chamador (dependencies.py)
    converte para HTTPException 401.
    """
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])