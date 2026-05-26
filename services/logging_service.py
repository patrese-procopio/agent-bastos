"""
logging_service.py - Configuracao central de logging do Agent Bastos
---------------------------------------------------------------------------
Substitui os print() espalhados por logging estruturado em JSON-lines.

Hierarquia de loggers:
  bastos                -> raiz (NIVEL INFO)
    bastos.audit        -> auditoria de negocio (login, varreduras, criacao)
    bastos.security     -> eventos de seguranca (auth fail, rate limit, 403)
    bastos.access       -> 1 linha por request HTTP (metodo, path, status, ms)
    bastos.<modulo>     -> uso livre por modulo (ex.: bastos.grafo, bastos.extrato)

Arquivos rotativos em data/logs/:
  bastos.log            -> tudo de INFO+   (10 MB x 5 = ~50 MB max)
  bastos.error.log      -> so WARNING+     (5 MB x 5 = ~25 MB max)
  bastos.audit.log      -> so bastos.audit (5 MB x 10 = ~50 MB - trilha longa)

Formato: JSON-lines (uma linha por evento) - facil de grep/jq/parse.
Console: formato humano colorido (so se rodando interativo).
"""

from __future__ import annotations

import json
import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from typing import Any

# ----------------------------------------------------------------------------
# Caminhos e limites
# ----------------------------------------------------------------------------
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_LOG_DIR = os.path.join(_BASE_DIR, "data", "logs")

_MAX_BYTES_MAIN  = 10 * 1024 * 1024   # 10 MB
_MAX_BYTES_ERR   = 5  * 1024 * 1024
_MAX_BYTES_AUDIT = 5  * 1024 * 1024
_BACKUPS_MAIN  = 5
_BACKUPS_ERR   = 5
_BACKUPS_AUDIT = 10

# Campos que NUNCA devem ser logados (defesa em profundidade)
_SENSITIVE_KEYS = {
    "password", "senha", "hashed_password", "token", "access_token",
    "refresh_token", "authorization", "api_key", "secret", "anthropic_api_key",
    "groq_api_key", "deepseek_api_key", "telegram_api_hash", "telegram_session",
    "jwt_secret_key",
}


def _redact(value: Any) -> Any:
    """Mascara segredos antes de serializar. Recursivo em dict/list."""
    if isinstance(value, dict):
        return {k: ("***" if k.lower() in _SENSITIVE_KEYS else _redact(v)) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_redact(v) for v in value]
    return value


class _JsonFormatter(logging.Formatter):
    """Formata cada record como uma linha JSON estavel."""

    def format(self, record: logging.LogRecord) -> str:
        base = {
            "ts":     self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level":  record.levelname,
            "logger": record.name,
            "msg":    record.getMessage(),
        }
        # extras passados via logger.info("...", extra={"campo": valor})
        extras = getattr(record, "_bastos_extra", None)
        if extras:
            base["data"] = _redact(extras)
        if record.exc_info:
            base["exc"] = self.formatException(record.exc_info)
        return json.dumps(base, ensure_ascii=False, default=str)


class _HumanFormatter(logging.Formatter):
    """Para console - leitura humana."""

    def format(self, record: logging.LogRecord) -> str:
        base = f"[{self.formatTime(record, '%H:%M:%S')}] {record.levelname:<7} {record.name:<22} {record.getMessage()}"
        extras = getattr(record, "_bastos_extra", None)
        if extras:
            base += f" | {json.dumps(_redact(extras), ensure_ascii=False, default=str)}"
        return base


class _ExtraFilter(logging.Filter):
    """Encaminha kwargs passados como extra={...} para o formatter."""

    def filter(self, record: logging.LogRecord) -> bool:
        std = {"name","msg","args","levelname","levelno","pathname","filename","module","exc_info",
               "exc_text","stack_info","lineno","funcName","created","msecs","relativeCreated",
               "thread","threadName","processName","process","getMessage","_bastos_extra"}
        extras = {k: v for k, v in record.__dict__.items() if k not in std and not k.startswith("_")}
        if extras:
            record._bastos_extra = extras
        return True


class _AuditOnlyFilter(logging.Filter):
    """Deixa passar apenas registros do logger bastos.audit (ou sub-loggers)."""

    def filter(self, record: logging.LogRecord) -> bool:
        return record.name == "bastos.audit" or record.name.startswith("bastos.audit.")


_configured = False


def configurar_logging(nivel: str = "INFO") -> logging.Logger:
    """
    Idempotente: pode ser chamado varias vezes, configura uma so vez.
    Retorna o logger raiz 'bastos'.
    """
    global _configured
    raiz = logging.getLogger("bastos")
    if _configured:
        return raiz

    os.makedirs(_LOG_DIR, exist_ok=True)

    raiz.setLevel(getattr(logging, nivel.upper(), logging.INFO))
    raiz.propagate = False  # nao polui o root logger do uvicorn

    json_fmt  = _JsonFormatter()
    human_fmt = _HumanFormatter()
    extra_filter = _ExtraFilter()

    # 1. Arquivo principal (tudo INFO+)
    h_main = RotatingFileHandler(
        os.path.join(_LOG_DIR, "bastos.log"),
        maxBytes=_MAX_BYTES_MAIN, backupCount=_BACKUPS_MAIN, encoding="utf-8",
    )
    h_main.setLevel(logging.INFO)
    h_main.setFormatter(json_fmt)
    h_main.addFilter(extra_filter)
    raiz.addHandler(h_main)

    # 2. Arquivo de erros (WARNING+) - facilita triagem rapida
    h_err = RotatingFileHandler(
        os.path.join(_LOG_DIR, "bastos.error.log"),
        maxBytes=_MAX_BYTES_ERR, backupCount=_BACKUPS_ERR, encoding="utf-8",
    )
    h_err.setLevel(logging.WARNING)
    h_err.setFormatter(json_fmt)
    h_err.addFilter(extra_filter)
    raiz.addHandler(h_err)

    # 3. Arquivo de auditoria (apenas bastos.audit) - trilha de negocio
    h_audit = RotatingFileHandler(
        os.path.join(_LOG_DIR, "bastos.audit.log"),
        maxBytes=_MAX_BYTES_AUDIT, backupCount=_BACKUPS_AUDIT, encoding="utf-8",
    )
    h_audit.setLevel(logging.INFO)
    h_audit.setFormatter(json_fmt)
    h_audit.addFilter(extra_filter)
    h_audit.addFilter(_AuditOnlyFilter())
    raiz.addHandler(h_audit)

    # 4. Console (so se stdout for terminal interativo) - dev experience
    if sys.stdout.isatty():
        h_con = logging.StreamHandler(sys.stdout)
        h_con.setLevel(logging.INFO)
        h_con.setFormatter(human_fmt)
        h_con.addFilter(extra_filter)
        raiz.addHandler(h_con)

    # Silenciar bibliotecas barulhentas
    for ruido in ("uvicorn.access", "httpx", "httpcore", "urllib3", "chromadb.telemetry"):
        logging.getLogger(ruido).setLevel(logging.WARNING)

    _configured = True
    raiz.info("logging configurado", extra={"dir": _LOG_DIR, "nivel": nivel})
    return raiz


def get_logger(nome: str) -> logging.Logger:
    """Atalho: get_logger('grafo') -> logger 'bastos.grafo'."""
    if not nome.startswith("bastos"):
        nome = f"bastos.{nome}"
    return logging.getLogger(nome)
