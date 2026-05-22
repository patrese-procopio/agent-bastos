# -*- coding: utf-8 -*-
"""
telegram_login.py — gera a StringSession do Telegram (rodar UMA única vez)
Agent Bastos | AIPEN

Uso (a partir da raiz do projeto):
  .venv\\Scripts\\python.exe scripts\\telegram_login.py

Pré-requisitos no .env (de https://my.telegram.org → "API development tools"):
  TELEGRAM_API_ID
  TELEGRAM_API_HASH

O script pede seu telefone (formato internacional, ex.: +5592999999999) e o
código que o Telegram envia. Se a conta tiver verificação em duas etapas, pede
a senha. Ao final, imprime a TELEGRAM_SESSION para você colar no .env.
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

from dotenv import load_dotenv
load_dotenv(os.path.join(BASE_DIR, ".env"))

from telethon.sync import TelegramClient
from telethon.sessions import StringSession


ENV_PATH = os.path.join(BASE_DIR, ".env")


def _obter(env_var: str, prompt: str) -> str:
    valor = os.getenv(env_var)
    return valor.strip() if valor else input(prompt).strip()


def _gravar_session_no_env(session: str) -> bool:
    """Atualiza (ou adiciona) a linha TELEGRAM_SESSION no .env. Retorna True se salvou."""
    try:
        linhas = []
        if os.path.exists(ENV_PATH):
            with open(ENV_PATH, "r", encoding="utf-8") as f:
                linhas = f.read().splitlines()
        nova = f"TELEGRAM_SESSION={session}"
        achou = False
        for i, ln in enumerate(linhas):
            if ln.strip().startswith("TELEGRAM_SESSION="):
                linhas[i] = nova
                achou = True
                break
        if not achou:
            linhas.append(nova)
        with open(ENV_PATH, "w", encoding="utf-8") as f:
            f.write("\n".join(linhas) + "\n")
        return True
    except Exception as e:
        print(f"  (Não consegui gravar no .env automaticamente: {type(e).__name__}: {e})")
        return False


def main() -> None:
    api_id_raw = _obter("TELEGRAM_API_ID", "api_id: ")
    api_hash   = _obter("TELEGRAM_API_HASH", "api_hash: ")

    try:
        api_id = int(api_id_raw)
    except ValueError:
        print("ERRO: api_id precisa ser numérico (veja em my.telegram.org).")
        return

    print("\nConectando ao Telegram... informe os dados quando solicitado.\n")
    with TelegramClient(StringSession(), api_id, api_hash) as client:
        session = client.session.save()
        me = client.get_me()
        nome = getattr(me, "username", None) or getattr(me, "first_name", None)
        salvou = _gravar_session_no_env(session)
        print("\n" + "=" * 64)
        print(f"  Login OK como: {nome}")
        if salvou:
            print("  TELEGRAM_SESSION gravada automaticamente no .env. Tudo pronto!")
        else:
            print("  Cole a linha abaixo no seu .env manualmente:")
            print(f"\n  TELEGRAM_SESSION={session}")
        print("=" * 64)
        print("  Guarde essa string como senha — ela dá acesso à conta.")
        print("=" * 64)


if __name__ == "__main__":
    main()
