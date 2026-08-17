# -*- coding: utf-8 -*-
"""
resetar_senha_db.py — Reseta a senha de um usuário DIRETO no auth.db
---------------------------------------------------------------------------
POR QUE ESTE SCRIPT EXISTE:
  O setar_senha.py grava o hash no .env, mas o .env só é lido para SEMEAR
  o banco quando a tabela users está VAZIA (INSERT OR IGNORE). Usuário já
  criado no auth.db mantém o hash antigo — o login valida contra o BANCO.
  Este script atualiza a fonte de verdade real: a linha do usuário no DB.

USO (na raiz do projeto):
    .venv\\Scripts\\python.exe scripts\\resetar_senha_db.py admin

  A senha é pedida via getpass (não aparece na tela, não fica no histórico).
  Reinicie o backend depois? NÃO precisa — o login lê o DB a cada tentativa.
"""

from __future__ import annotations

import getpass
import sys
from pathlib import Path

# Permite importar services/ rodando de qualquer pasta
sys.path.insert(0, str(Path(__file__).parent.parent))

from services import auth_service


def main() -> int:
    if len(sys.argv) != 2:
        print("Uso: python scripts/resetar_senha_db.py <username>")
        return 1
    username = sys.argv[1].strip()

    user = auth_service.get_user(username)
    if not user:
        print(f"[ERRO] Usuario '{username}' nao existe no auth.db.")
        print("       Usuarios sao criados no primeiro boot ou via Gerenciar Usuarios.")
        return 1

    print(f"Resetando senha de '{username}' (nivel: {user['level']})")
    senha1 = getpass.getpass("Nova senha (min. 12 chars, letras+numeros+simbolo): ")
    senha2 = getpass.getpass("Confirme a nova senha: ")

    if senha1 != senha2:
        print("[ERRO] As senhas nao conferem.")
        return 1
    if len(senha1) < 12:
        print("[ERRO] Senha muito curta — minimo 12 caracteres.")
        return 1

    auth_service.update_user(username, plain_password=senha1)
    print(f"[OK] Senha de '{username}' atualizada no auth.db.")
    print("     Aguarde ~1 minuto se o rate limit de login estiver ativo e entre.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
