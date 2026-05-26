"""
scoping_service.py - Substituto leve de Row Level Security para SQLite
---------------------------------------------------------------------------
SQLite NAO suporta RLS nativo (e feature do Postgres). Este modulo cumpre
o mesmo papel via filtro automatico na camada de servico:

  - 'admin'  -> ve tudo (sem filtro)
  - demais   -> ve so o que ele criou (filtra por coluna 'autor')

Como usar nos modulos de dados:

    from services.scoping_service import where_escopo

    sql_extra, params_extra = where_escopo(user, coluna="autor")
    sql = f"SELECT ... FROM extratos WHERE 1=1 {sql_extra} ORDER BY criado_em DESC"
    cur = con.execute(sql, params_extra)

Onde aplicar:
  - leitura de extratos (autor)
  - leitura de movimentacoes manuais (criado_por, se existir)
  - logs/auditoria (usuario)

NAO usar para:
  - dados estaticos/catalogos (tipos_documento, unidades, etc.)
  - dados compartilhados intencionalmente (lideranças, alertas OSINT)
"""

from __future__ import annotations

from typing import Tuple


# Niveis com visibilidade global (veem tudo, sem filtro)
NIVEIS_GLOBAIS = frozenset({"admin"})


def is_admin(user: dict | None) -> bool:
    """Considera admin se nivel for 'admin' (ou user ausente = chamada interna)."""
    if not user:
        return True  # chamada interna (sem contexto de usuario) = sem filtro
    return (user.get("level") or "").lower() in NIVEIS_GLOBAIS


def where_escopo(user: dict | None, coluna: str = "autor",
                  prefixo: str = " AND ") -> Tuple[str, tuple]:
    """
    Retorna (clausula_where, params) para juntar a uma query.

    Exemplo:
        sql_extra, p_extra = where_escopo(user, coluna="autor")
        # admin -> sql_extra='' , p_extra=()
        # outro -> sql_extra=' AND autor = ?' , p_extra=(user['sub'],)

    Args:
        user: dict do token JWT (com 'sub' e 'level').
        coluna: nome da coluna que guarda o dono do registro.
        prefixo: texto a colar antes do filtro (default " AND ").
    """
    if is_admin(user):
        return "", ()
    sub = (user or {}).get("sub")
    if not sub:
        # Token sem sub e estranho - filtra como ninguem para nao vazar
        return f"{prefixo}1=0", ()
    return f"{prefixo}{coluna} = ?", (sub,)


def pode_ver_registro(user: dict | None, registro: dict | None,
                       coluna: str = "autor") -> bool:
    """
    Versao em memoria: valida se 'user' pode ver 'registro' apos buscado.
    Util para endpoints /{id} que ja fizeram um SELECT pelo PK.
    """
    if not registro:
        return False
    if is_admin(user):
        return True
    dono = registro.get(coluna)
    if dono is None:
        return True  # registro orfao (legado) - nao bloquear
    return dono == (user or {}).get("sub")
