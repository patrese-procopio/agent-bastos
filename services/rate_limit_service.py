"""
rate_limit_service.py - Configuracao central de rate limit (slowapi)
---------------------------------------------------------------------------
Objetivo: proteger contra brute-force (login) e abuso de endpoints pesados
(varreduras OSINT, reindex Drive) sem atrapalhar uso normal.

Como aplicar nos routers:
    from services.rate_limit_service import limiter, LIMIT_LOGIN

    @router.post("/login")
    @limiter.limit(LIMIT_LOGIN)
    def login(request: Request, ...):    # 'request' OBRIGATORIO no slowapi
        ...

Constantes pre-definidas evitam strings magicas espalhadas pelo codebase.
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from starlette.requests import Request
from starlette.responses import JSONResponse

from services.logging_service import get_logger

_log_security = get_logger("security")

# Limite default - generoso, nao atrapalha uso interativo
# Pode ser sobrescrito por endpoint com @limiter.limit("...")
_DEFAULT_LIMITS = ["120/minute"]

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=_DEFAULT_LIMITS,
    # headers_enabled=False intencional: ligado, slowapi exige `response: Response`
    # na assinatura de TODOS os endpoints com @limiter.limit (vide
    # slowapi.extension._inject_headers). Como o ganho dos X-RateLimit-* e
    # marginal e o 429 ja vem com Retry-After, mantemos desligado.
    headers_enabled=False,
)

# ----------------------------------------------------------------------------
# Constantes de limite por categoria
# ----------------------------------------------------------------------------
# Auth: agressivo (anti-brute force) - 5 tentativas/min por IP basta
LIMIT_LOGIN          = "5/minute"
LIMIT_REFRESH        = "30/minute"  # refresh roda automaticamente, precisa folga

# Varreduras pesadas (OSINT, Telegram, reindex Drive): caras em CPU/rede
# 20/hora cobre uso normal (usuario clica algumas vezes) + n8n (8h interval)
LIMIT_VARREDURA      = "20/hour"
LIMIT_REINDEX        = "10/hour"

# IA pesada (Claude/Groq, extracao, analise) - custo $$ em API externa
LIMIT_IA_PESADA      = "60/hour"
LIMIT_IA_LEVE        = "120/hour"

# Escritas regulares (CRUD)
LIMIT_ESCRITA        = "60/minute"

# Leituras: o default ja cobre. Usar so se precisar afrouxar (ex.: polling).


# ----------------------------------------------------------------------------
# Handler customizado: loga e responde 429 com JSON
# ----------------------------------------------------------------------------
async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Resposta 429 padronizada + log de seguranca."""
    ip = request.client.host if request.client else "?"
    _log_security.warning(
        f"rate limit excedido em {request.url.path}",
        extra={
            "ip":     ip,
            "path":   request.url.path,
            "method": request.method,
            "limite": str(exc.detail),
        },
    )
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Muitas requisicoes. Tente novamente em alguns instantes.",
            "limite": str(exc.detail),
        },
        headers={"Retry-After": "60"},
    )


def montar_rate_limit(app) -> None:
    """Registra Limiter + middleware + handler de excecao no app FastAPI."""
    app.state.limiter = limiter
    app.add_middleware(SlowAPIMiddleware)
    app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
