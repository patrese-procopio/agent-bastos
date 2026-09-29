"""
api_key_service.py - Portao de API key (camada de borda, antes do JWT)
---------------------------------------------------------------------------
Por que existe:
  O backend fica exposto na internet via tunel (ngrok). O JWT protege as
  rotas, mas o /api/auth/login continua alcancavel por qualquer um que
  descubra a URL (brute-force, enumeracao de usuarios). A API key e uma
  "porta do predio": quem nao tem o cracha nem chega na recepcao (login).

  Defesa em profundidade = camadas independentes:
    1. API key (este modulo)  -> "voce e um cliente conhecido?"
    2. JWT + modulos          -> "quem e voce e o que pode fazer?"
    3. Auditoria              -> "o que voce fez?"

Regra: zero FastAPI aqui. So logica pura - testavel de forma isolada.

Decisoes de seguranca:
  - Comparacao em tempo constante (hmac.compare_digest): evita timing attack,
    onde o atacante mede microssegundos de resposta pra descobrir a chave
    caractere por caractere.
  - Suporta MULTIPLAS chaves (BASTOS_API_KEYS, separadas por virgula): permite
    rotacao sem downtime (entra a nova, migra os clientes, remove a antiga)
    e uma chave por cliente (Electron, n8n, mobile) - se uma vazar, revoga so ela.
  - A chave nunca vai pra log. Logamos so um fingerprint (SHA-256 truncado).
"""

from __future__ import annotations

import hashlib
import hmac
import os

# Header HTTP onde o cliente manda a chave.
HEADER_NAME = "X-API-Key"

# Caminhos que nunca exigem a chave:
#   /health                     -> healthcheck de Docker/subir_tudo.ps1 (retorna so {"status":"ok"})
#   /api/human-loop/responder/  -> callback do n8n, que ja tem chave propria (X-Hitl-Key)
_PUBLIC_EXACT = frozenset({"/health"})
_PUBLIC_PREFIXES = ("/api/human-loop/responder/",)

# Tamanho minimo aceito. token_hex(32) gera 64 chars; abaixo de 24 vira senha fraca.
MIN_KEY_LENGTH = 24


def load_keys() -> list[str]:
    """
    Le as chaves validas do ambiente.

    BASTOS_API_KEYS  (varias, separadas por virgula) tem prioridade;
    BASTOS_API_KEY   (uma so) e o atalho simples.
    Retorna lista vazia se nada configurado -> gate desativado.
    """
    raw = os.getenv("BASTOS_API_KEYS", "") or os.getenv("BASTOS_API_KEY", "")
    return [k.strip() for k in raw.split(",") if k.strip()]


def validate_keys(keys: list[str]) -> list[str]:
    """Retorna os problemas encontrados (lista vazia = configuracao OK)."""
    return [
        f"chave #{i + 1} tem {len(k)} caracteres (minimo {MIN_KEY_LENGTH})"
        for i, k in enumerate(keys)
        if len(k) < MIN_KEY_LENGTH
    ]


def is_public_path(path: str) -> bool:
    """True se a rota dispensa API key."""
    return path in _PUBLIC_EXACT or path.startswith(_PUBLIC_PREFIXES)


def verify_key(provided: str | None, valid_keys: list[str]) -> bool:
    """
    Confere a chave enviada contra todas as validas, em tempo constante.

    Percorremos TODAS as chaves sem dar `break` no primeiro acerto: o tempo
    gasto nao revela qual (nem se alguma) bateu.
    """
    if not provided:
        return False
    provided_b = provided.encode("utf-8")
    ok = False
    for key in valid_keys:
        ok |= hmac.compare_digest(provided_b, key.encode("utf-8"))
    return ok


def fingerprint(key: str | None) -> str:
    """Identificador seguro pra log: 8 hex do SHA-256. Nao permite reconstruir a chave."""
    if not key:
        return "-"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:8]
