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

import os
from pathlib import Path

# ─── Modo offline do Hugging Face ─────────────────────────────────────────────
# Se o modelo de embeddings JA ESTA em cache local, não há motivo para
# consultar huggingface.co no boot. Sem esta guarda, máquina sem internet
# (rede fechada ou DNS fora) derruba o backend inteiro com erro de conexão.
_MODELO = "models--intfloat--multilingual-e5-small"

def _ativar_offline_se_cacheado() -> None:
    candidatos = [
        # 1. HF_HOME explícito (setado pelo iniciar_prod.bat em produção)
        Path(os.environ["HF_HOME"]) / "hub" if os.environ.get("HF_HOME") else None,
        # 2. Cache empacotado junto do backend (deploy offline)
        Path(__file__).parent / "data" / "hf_cache" / "hub",
        # 3. Cache padrão do usuário (máquina de desenvolvimento)
        Path.home() / ".cache" / "huggingface" / "hub",
    ]
    for hub in candidatos:
        if hub and (hub / _MODELO).exists():
            # Sobrescreve SEMPRE: o modelo está COMPROVADAMENTE neste hub.
            # (setdefault deixava um HF_HOME pré-setado apontando p/ pasta
            #  vazia — ex.: iniciar_prod.bat em máquina de dev — e o loader
            #  crashava em modo offline procurando o modelo no lugar errado.)
            os.environ["HF_HOME"] = str(hub.parent)
            os.environ["HF_HUB_OFFLINE"] = "1"
            os.environ["TRANSFORMERS_OFFLINE"] = "1"
            print(f"[startup] Modelo em cache ({hub}) — modo offline ativado.")
            return
    print("[startup] Modelo NAO cacheado — primeira execucao exigira internet.")

_ativar_offline_se_cacheado()

import uvicorn

if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8000, log_level="info")
