# -*- coding: utf-8 -*-
"""
alvos_service.py — CRUD da watchlist de alvos/termos monitorados
Agent Bastos | AIPEN

Lê/grava o mesmo data/alvos.json usado por modules/monitor.py e
modules/telegram_monitor.py (varredura Tempo Real, OSINT/Dork e Telegram).
Antes desta tela, a lista só era editável direto no arquivo — só quem tinha
acesso ao backend conseguia dar baixa num alvo que já perdeu relevância
(preso, morto, saiu da facção) ou cadastrar um novo. Agora qualquer agente
com acesso ao módulo "alertas" faz isso pela tela.
"""

import json
import os

from config.paths import FILE_ALVOS

ALVOS_PATH = str(FILE_ALVOS)


def _ler() -> list:
    if not os.path.exists(ALVOS_PATH):
        return []
    with open(ALVOS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _salvar(alvos: list) -> None:
    os.makedirs(os.path.dirname(ALVOS_PATH), exist_ok=True)
    with open(ALVOS_PATH, "w", encoding="utf-8") as f:
        json.dump(alvos, f, ensure_ascii=False, indent=2)


def listar_alvos() -> list:
    return _ler()


def obter_alvo(alvo_id) -> dict | None:
    alvo_id = _normalizar_id(alvo_id)
    for a in _ler():
        if a.get("id") == alvo_id:
            return a
    return None


def _normalizar_id(alvo_id):
    """IDs de pessoa são int, de termo são string ("t1"). Aceita ambos vindos da URL."""
    if isinstance(alvo_id, str) and alvo_id.isdigit():
        return int(alvo_id)
    return alvo_id


def _proximo_id_pessoa(alvos: list) -> int:
    ids = [a["id"] for a in alvos if isinstance(a.get("id"), int)]
    return (max(ids) + 1) if ids else 1


def _proximo_id_termo(alvos: list) -> str:
    numeros = []
    for a in alvos:
        i = a.get("id")
        if isinstance(i, str) and i.startswith("t") and i[1:].isdigit():
            numeros.append(int(i[1:]))
    return f"t{(max(numeros) + 1) if numeros else 1}"


def criar_alvo(tipo: str, nome: str = "", termo: str = "",
               vulgos: list | None = None, descricao: str = "") -> dict:
    """
    Cria um alvo (tipo="pessoa": nome + vulgos opcionais) ou um termo
    (tipo="termo": termo livre + descrição opcional). Lança ValueError em
    dado inválido — o router traduz pra HTTP 400.
    """
    alvos = _ler()
    tipo = (tipo or "pessoa").strip().lower()

    if tipo == "termo":
        termo = (termo or "").strip()
        if not termo:
            raise ValueError("Termo não pode ser vazio")
        if any(a.get("tipo") == "termo" and a.get("termo", "").lower() == termo.lower() for a in alvos):
            raise ValueError("Já existe um termo igual cadastrado")
        novo = {
            "id": _proximo_id_termo(alvos),
            "tipo": "termo",
            "termo": termo,
        }
        variantes_limpas = [v.strip() for v in (vulgos or []) if v.strip()]
        if variantes_limpas:
            novo["variantes"] = variantes_limpas
        if descricao.strip():
            novo["descricao"] = descricao.strip()
    else:
        nome = (nome or "").strip()
        if not nome:
            raise ValueError("Nome não pode ser vazio")
        if any(a.get("tipo", "pessoa") == "pessoa" and a.get("nome", "").lower() == nome.lower() for a in alvos):
            raise ValueError("Já existe uma pessoa com esse nome cadastrada")
        novo = {
            "id": _proximo_id_pessoa(alvos),
            "nome": nome,
            "vulgos": [v.strip() for v in (vulgos or []) if v.strip()],
        }

    alvos.append(novo)
    _salvar(alvos)
    return novo


def editar_variantes(alvo_id, variantes: list) -> dict:
    """
    Substitui a lista de variantes/sinônimos de um termo já cadastrado
    (ex: CV-AM ganha variantes ["CVAM", "CV/AM", "Comando Vermelho do
    Amazonas"] sem precisar recriar o alvo e perder o histórico de alertas
    já vinculados a esse alvo_id). Só se aplica a tipo="termo".
    """
    alvo_id = _normalizar_id(alvo_id)
    alvos = _ler()
    for a in alvos:
        if a.get("id") == alvo_id:
            if a.get("tipo") != "termo":
                raise ValueError("Variantes só se aplicam a alvos do tipo termo")
            limpas = [v.strip() for v in (variantes or []) if v.strip()]
            if limpas:
                a["variantes"] = limpas
            else:
                a.pop("variantes", None)
            _salvar(alvos)
            return a
    raise ValueError("Alvo não encontrado")


def remover_alvo(alvo_id) -> bool:
    """Remove o alvo/termo. Retorna False se o id não existia."""
    alvo_id = _normalizar_id(alvo_id)
    alvos = _ler()
    restantes = [a for a in alvos if a.get("id") != alvo_id]
    if len(restantes) == len(alvos):
        return False
    _salvar(restantes)
    return True
