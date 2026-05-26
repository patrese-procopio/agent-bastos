# -*- coding: utf-8 -*-
"""
setar_senha.py - Define a senha de um usuario do Agent Bastos
---------------------------------------------------------------------------
Roda no terminal local. A senha NUNCA aparece na tela (getpass mascara) e
NUNCA fica em historico de shell (nao recebe por argv).

Como funciona:
  1. Solicita a senha duas vezes (confirmacao).
  2. Aplica regras de qualidade (>= 12 chars, mix de classes).
  3. Gera hash bcrypt (custo 12).
  4. Grava ADMIN_PASSWORD_HASH= ou ANALISTA_PASSWORD_HASH= no .env
     (sobrescrevendo o valor anterior se existir).

Uso:
    .venv\\Scripts\\python.exe scripts\\setar_senha.py admin
    .venv\\Scripts\\python.exe scripts\\setar_senha.py analista

Depois de rodar, REINICIE o backend para a nova senha valer.
"""

from __future__ import annotations

import getpass
import os
import re
import sys

from passlib.context import CryptContext


BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(BASE, ".env")

VARS = {
    "admin":    "ADMIN_PASSWORD_HASH",
    "analista": "ANALISTA_PASSWORD_HASH",
}

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _validar_forca(senha: str) -> list[str]:
    """Retorna lista de problemas. Lista vazia = senha aceitavel."""
    erros = []
    if len(senha) < 12:
        erros.append("muito curta (minimo 12 caracteres)")
    classes = 0
    if re.search(r"[a-z]", senha): classes += 1
    if re.search(r"[A-Z]", senha): classes += 1
    if re.search(r"[0-9]", senha): classes += 1
    if re.search(r"[^A-Za-z0-9]", senha): classes += 1
    if classes < 3:
        erros.append("misture pelo menos 3 classes: minusculas, MAIUSCULAS, digitos, simbolos")
    triviais = {
        "admin123", "analista123", "senha123", "password", "12345678",
        "qwertyui", "bastos123",
    }
    if senha.lower() in triviais:
        erros.append("senha trivial conhecida")
    return erros


def _atualizar_env(chave: str, valor: str) -> bool:
    """Substitui ou adiciona <chave>=<valor> no .env. Preserva o resto."""
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, "r", encoding="utf-8") as f:
            linhas = f.read().splitlines()
    else:
        linhas = []

    encontrou = False
    for i, ln in enumerate(linhas):
        if ln.startswith(f"{chave}="):
            linhas[i] = f"{chave}={valor}"
            encontrou = True
            break
    if not encontrou:
        linhas.append(f"{chave}={valor}")

    with open(ENV_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(linhas) + "\n")
    return encontrou


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in VARS:
        print("Uso: python scripts/setar_senha.py <admin|analista>")
        return 1

    usuario = sys.argv[1]
    chave_env = VARS[usuario]

    print(f"\n>>> Definindo senha para usuario: {usuario}")
    print(">>> A senha NAO sera ecoada na tela. Digite e pressione Enter.\n")

    try:
        s1 = getpass.getpass(f"Nova senha para '{usuario}': ")
    except (KeyboardInterrupt, EOFError):
        print("\nCancelado.")
        return 1
    if not s1:
        print("Senha vazia. Abortando.")
        return 1

    erros = _validar_forca(s1)
    if erros:
        print("\nSenha rejeitada:")
        for e in erros:
            print(f"  - {e}")
        return 1

    try:
        s2 = getpass.getpass("Confirme a senha:           ")
    except (KeyboardInterrupt, EOFError):
        print("\nCancelado.")
        return 1
    if s1 != s2:
        print("As senhas nao conferem. Abortando.")
        return 1

    hash_bcrypt = _pwd.hash(s1)
    # Verifica que o hash valida (sanidade)
    if not _pwd.verify(s1, hash_bcrypt):
        print("ERRO interno: hash gerado nao verifica. Abortando.")
        return 2

    substituiu = _atualizar_env(chave_env, hash_bcrypt)
    acao = "substituida" if substituiu else "definida"
    print(f"\n[OK] Senha {acao} no .env ({chave_env}).")
    print("[!]  Reinicie o backend para a nova senha valer.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
