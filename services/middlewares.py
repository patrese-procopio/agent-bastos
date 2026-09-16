"""
middlewares.py - Camada de seguranca e observabilidade HTTP
---------------------------------------------------------------------------
Reune middlewares aplicados no api.py em ordem:
  1. SecurityHeadersMiddleware  -> headers defensivos em toda resposta
  2. AccessLogMiddleware        -> 1 linha de log por request (bastos.access)
  3. CORSMiddleware (FastAPI)   -> origins restritos (construido aqui)

Rate limit (slowapi) e registrado direto no api.py (precisa do app instance).
"""

from __future__ import annotations

import os
import time
from typing import Iterable

from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from services.logging_service import get_logger

_log_access   = get_logger("access")
_log_security = get_logger("security")


# ----------------------------------------------------------------------------
# Security headers
# ----------------------------------------------------------------------------
# Conjunto conservador - nao quebra Electron/Vite que usam inline styles/scripts.
# CSP estrito intencionalmente OMITIDO: o frontend usa eval-inline (Vite HMR) e
# o usuario carrega <img> via blob:/data: - CSP rigoroso quebraria a UI.
_SECURITY_HEADERS = {
    "X-Content-Type-Options":   "nosniff",
    "X-Frame-Options":          "DENY",
    "Referrer-Policy":          "no-referrer",
    "X-XSS-Protection":         "0",  # moderno: deixar o navegador decidir (filtro legado e nocivo)
    "Permissions-Policy":       "geolocation=(), microphone=(), camera=(), payment=()",
    "Cross-Origin-Opener-Policy":   "same-origin",
    "Cross-Origin-Resource-Policy": "same-site",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        for k, v in _SECURITY_HEADERS.items():
            # nao sobrescrever se o endpoint ja setou (raro, mas respeitar)
            response.headers.setdefault(k, v)
        return response


# ----------------------------------------------------------------------------
# Access log
# ----------------------------------------------------------------------------
class AccessLogMiddleware(BaseHTTPMiddleware):
    """
    1 linha por request em bastos.access. Inclui status, latencia e cliente.
    Rotas barulhentas (favicon, healthcheck) podem ser ignoradas via lista.
    """

    _SILENT_PATHS = {"/favicon.ico"}

    async def dispatch(self, request: Request, call_next):
        if request.url.path in self._SILENT_PATHS:
            return await call_next(request)

        inicio = time.perf_counter()
        status_code = 500
        try:
            response: Response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            ms = int((time.perf_counter() - inicio) * 1000)
            ip = request.client.host if request.client else "?"
            nivel_log = _log_access.warning if status_code >= 500 else _log_access.info
            nivel_log(
                f"{request.method} {request.url.path} {status_code} {ms}ms",
                extra={
                    "method": request.method,
                    "path":   request.url.path,
                    "status": status_code,
                    "ms":     ms,
                    "ip":     ip,
                },
            )
            # Eventos 401/403 vao tambem para security (triagem rapida)
            if status_code in (401, 403):
                _log_security.warning(
                    f"acesso negado {status_code} em {request.url.path}",
                    extra={"method": request.method, "path": request.url.path,
                           "status": status_code, "ip": ip},
                )


# ----------------------------------------------------------------------------
# CORS - allowlist para Electron (file://) + dev (Vite localhost)
# ----------------------------------------------------------------------------
# Electron em producao envia Origin: null (file://) ou nao envia.
# Vite dev envia http://localhost:5174 ou http://127.0.0.1:5174.
# Tauri/Edge WebView2 podem enviar app://. Cobrimos todos.
_CORS_ALLOW_ORIGINS_DEFAULT = [
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://[::1]:5174",
    "app://-",
    "null",  # Electron com file:// envia origin "null"
]

# Permite porta alternativa do Vite (5175 fallback) e Electron prod
_CORS_ALLOW_ORIGIN_REGEX_DEFAULT = r"^(https?://(localhost|127\.0\.0\.1|\[::1\]):(517[0-9]|3000|8000)|app://.*|file://.*)$"


def _origens_extras_do_env() -> list[str]:
    """Le BASTOS_CORS_ORIGINS do env - vazio ou lista separada por virgula.
    Uso em deploy centralizado: BASTOS_CORS_ORIGINS=https://bastos.aipen.am.gov.br,https://n8n.aipen.am.gov.br
    """
    raw = os.getenv("BASTOS_CORS_ORIGINS", "").strip()
    if not raw:
        return []
    return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]


def _regex_do_env() -> str | None:
    """Regex adicional opcional (BASTOS_CORS_ORIGIN_REGEX).
    Se definido, SUBSTITUI o regex default - use com cuidado, ele ja cobre
    dev/Electron. Util so quando o default nao serve (ex: dominio corporativo).
    """
    return os.getenv("BASTOS_CORS_ORIGIN_REGEX", "").strip() or None


def montar_cors(app) -> None:
    """Aplica CORSMiddleware oficial do FastAPI com allowlist.

    Deploy centralizado (multi-cliente): defina BASTOS_CORS_ORIGINS no .env do
    servidor com a lista de origens permitidas (dominio publico, IPs internos).
    Origens default (Electron/Vite dev) permanecem em qualquer caso.
    """
    origins = list(_CORS_ALLOW_ORIGINS_DEFAULT) + _origens_extras_do_env()
    regex = _regex_do_env() or _CORS_ALLOW_ORIGIN_REGEX_DEFAULT
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_origin_regex=regex,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
        expose_headers=["Content-Disposition", "Content-Length"],
        max_age=3600,
    )
