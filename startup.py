"""
startup.py - Wrapper de compatibilidade Python 3.14
----------------------------------------------------
Python 3.14 adicionou typing.Sentinel ao stdlib.
typing_extensions 4.15.0 (ultima versao disponivel) ainda nao o re-exporta.
pydantic_core importa Sentinel de typing_extensions, causando ImportError.

Este script patcha typing_extensions ANTES de qualquer import de FastAPI/pydantic,
dentro do mesmo processo Python, de forma que o patch vale para toda a aplicacao.

Referencia: https://docs.python.org/3.14/library/typing.html#typing.Sentinel
"""

import typing
import typing_extensions

# Patch: expoe typing.Sentinel via typing_extensions se ausente
if hasattr(typing, "Sentinel") and not hasattr(typing_extensions, "Sentinel"):
    typing_extensions.Sentinel = typing.Sentinel
    print("[startup] typing_extensions.Sentinel patchado a partir de typing.Sentinel")

import uvicorn

if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8000, log_level="info")
