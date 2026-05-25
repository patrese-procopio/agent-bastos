"""
config_service.py — Configurações persistidas no servidor
─────────────────────────────────────────────────────────────────────────────
Dois grupos de configuração:

  1. GERAIS (não-secreto) → data/config.json
     agencia, estado, backendUrl, n8nUrl, tema

  2. CHAVES DE API (secreto) → .env
     GROQ_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY,
     TELEGRAM_API_ID, TELEGRAM_API_HASH

Regras de segurança:
  - As chaves NUNCA são devolvidas em texto puro: status_chaves() só diz se
    está configurada e mostra um preview mascarado (últimos 4 chars).
  - salvar_chaves() ignora valores vazios ou mascarados (campo não editado),
    e só aceita chaves da whitelist CHAVES_API.
  - Ao salvar uma chave, ela é aplicada em runtime (os.environ + config.settings)
    para valer sem reiniciar — um restart garante a aplicação completa.
"""

import os
import json

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "data", "config.json")
ENV_PATH    = os.path.join(BASE_DIR, ".env")

GERAIS_DEFAULT = {
    "agencia":    "AIPEN — Assessoria de Inteligência Penitenciária",
    "estado":     "AM",
    "backendUrl": "http://127.0.0.1:8000",
    "n8nUrl":     "http://localhost:5678",
    "tema":       "dark",
}

# Whitelist das chaves editáveis pela tela (TELEGRAM_SESSION fica de fora —
# é gerada pelo scripts/telegram_login.py, não digitada).
CHAVES_API = [
    "GROQ_API_KEY",
    "GEMINI_API_KEY",
    "ANTHROPIC_API_KEY",
    "DEEPSEEK_API_KEY",
    "TELEGRAM_API_ID",
    "TELEGRAM_API_HASH",
]


# ─── Gerais (data/config.json) ────────────────────────────────────────────────

def ler_gerais() -> dict:
    """Defaults sobrescritos pelo que estiver salvo em config.json."""
    gerais = dict(GERAIS_DEFAULT)
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                salvo = json.load(f)
            for k in GERAIS_DEFAULT:
                if k in salvo and salvo[k] is not None:
                    gerais[k] = salvo[k]
        except Exception:
            pass
    return gerais


def salvar_gerais(parciais: dict) -> dict:
    """Mescla apenas as chaves conhecidas e grava. Retorna o conjunto completo."""
    gerais = ler_gerais()
    for k in GERAIS_DEFAULT:
        if k in parciais and parciais[k] is not None:
            gerais[k] = parciais[k]
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(gerais, f, ensure_ascii=False, indent=2)
    return gerais


# ─── Chaves de API (.env) ─────────────────────────────────────────────────────

def _mascarar(valor: str) -> str:
    valor = (valor or "").strip()
    if not valor:
        return ""
    if len(valor) <= 4:
        return "••••"
    return "••••" + valor[-4:]


def _eh_mascara(valor: str) -> bool:
    return "•" in (valor or "")


def status_chaves() -> dict:
    """Para cada chave: se está configurada + preview mascarado (sem expor o segredo)."""
    out = {}
    for k in CHAVES_API:
        v = os.getenv(k, "")
        out[k] = {"configurada": bool(v), "preview": _mascarar(v)}
    return out


def _gravar_env(updates: dict) -> None:
    """Substitui/insere linhas KEY=value no .env, preservando o resto do arquivo."""
    linhas = []
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, "r", encoding="utf-8") as f:
            linhas = f.read().splitlines()
    for chave, valor in updates.items():
        nova   = f"{chave}={valor}"
        achou  = False
        for i, ln in enumerate(linhas):
            if ln.strip().startswith(f"{chave}="):
                linhas[i] = nova
                achou = True
                break
        if not achou:
            linhas.append(nova)
    with open(ENV_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(linhas) + "\n")


def _aplicar_runtime(chave: str, valor: str) -> None:
    """Faz a chave valer sem reiniciar: os.environ + atributo em config.settings."""
    os.environ[chave] = valor
    try:
        import config.settings as s
        if hasattr(s, chave):
            setattr(s, chave, valor)
    except Exception:
        pass


def salvar_chaves(parciais: dict) -> list:
    """
    Grava no .env só as chaves da whitelist com valor real (ignora vazio/mascarado).
    Aplica em runtime. Retorna a lista de chaves efetivamente atualizadas.
    """
    updates = {}
    for chave in CHAVES_API:
        if chave not in parciais:
            continue
        valor = (parciais.get(chave) or "").strip()
        if not valor or _eh_mascara(valor):
            continue
        updates[chave] = valor
    if updates:
        _gravar_env(updates)
        for chave, valor in updates.items():
            _aplicar_runtime(chave, valor)
    return list(updates.keys())
