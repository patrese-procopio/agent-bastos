"""
config/paths.py — Caminhos de dados centralizados do Agent Bastos
=================================================================

POR QUÊ ISSO EXISTE?
--------------------
Em produção, o banco de dados NUNCA deve ficar na pasta do código.
Se o operador reinstalar ou atualizar o app, a pasta do projeto pode
ser substituída e TODOS OS DADOS OPERACIONAIS se perdem.

A solução padrão de mercado é usar o AppData do Windows:
  %APPDATA%/AgentBastos/  ->  C:/Users/<usuario>/AppData/Roaming/AgentBastos/

COMO FUNCIONA?
--------------
- Em desenvolvimento (sem a env var AGENT_BASTOS_PROD):
  → Dados ficam em <raiz do projeto>/data/  (comportamento atual, mantém compatibilidade)

- Em produção (AGENT_BASTOS_PROD=1 no ambiente ou .env):
  → Dados ficam em %APPDATA%\AgentBastos\data\
  → A pasta é criada automaticamente no primeiro boot

MIGRAÇÃO:
---------
Execute `python config/paths.py --migrate` para copiar os dados
existentes do projeto para o AppData (feito UMA VEZ na implantação).

COMO USAR NOS MÓDULOS:
-----------------------
  from config.paths import DATA_DIR

  DB_AUTH    = DATA_DIR / "auth.db"
  DB_GRAFO   = DATA_DIR / "grafo" / "grafo_vinculos.db"
  DB_EXTRATO = DATA_DIR / "extrato" / "extrato.db"
"""

import os
import shutil
from pathlib import Path

# Raiz do projeto (Agent_Bastos/)
BASE_DIR: Path = Path(__file__).parent.parent

# ── Detecção de ambiente ──────────────────────────────────────────────────────
# AGENT_BASTOS_PROD=1  →  usa AppData (produção)
# (ausente ou 0)       →  usa BASE_DIR/data (desenvolvimento)
_PROD = os.getenv("AGENT_BASTOS_PROD", "0").strip() == "1"

if _PROD:
    # Windows: C:\Users\<user>\AppData\Roaming\AgentBastos\data
    _appdata = Path(os.getenv("APPDATA", Path.home() / "AppData" / "Roaming"))
    DATA_DIR: Path = _appdata / "AgentBastos" / "data"
else:
    DATA_DIR: Path = BASE_DIR / "data"

# Garante que o diretório base existe (criação automática no primeiro boot)
DATA_DIR.mkdir(parents=True, exist_ok=True)

# ── Caminhos canônicos de cada banco ─────────────────────────────────────────
DB_AUTH    = DATA_DIR / "auth.db"
DB_AUDIT   = DATA_DIR / "audit.db"
DB_ALERTAS = DATA_DIR / "alertas.db"
DB_ALERTAS.parent.mkdir(parents=True, exist_ok=True)

DB_EXTRATO  = DATA_DIR / "extrato"  / "extrato.db"
DB_GRAFO    = DATA_DIR / "grafo"    / "grafo_vinculos.db"
DB_LIDERANCAS = DATA_DIR / "liderancas" / "liderancas.db"

# dashboard_bastos.db (legacy — referenciado pelo dashboard_router e dashboard_routes)
DB_DASHBOARD = BASE_DIR / "dashboard_bastos.db"

# Banco de grupos de ocupação
DB_GRUPOS = DATA_DIR / "grupos" / "grupos_ocupacao.db"

# ── Diretórios de dados estruturados ─────────────────────────────────────────
DIR_RELATORIOS  = DATA_DIR / "relatorios"
DIR_SNAPSHOTS   = DATA_DIR / "snapshots"
DIR_LOGS        = DATA_DIR / "logs"
DIR_CHROMA      = DATA_DIR / "chroma_db"
DIR_DOUTRINA    = DATA_DIR / "doutrina"

# ── Arquivos de configuração/estado ──────────────────────────────────────────
FILE_ALVOS          = DATA_DIR / "alvos.json"
FILE_CONFIG         = DATA_DIR / "config.json"
FILE_ALERTAS_RT     = DIR_RELATORIOS / "alertas.json"
FILE_ALERTAS_OSINT  = DIR_RELATORIOS / "alertas_osint.json"
FILE_TELEGRAM_CANAIS = DATA_DIR / "telegram_canais.json"

# Garante subpastas de bancos
for _db in (DB_EXTRATO, DB_GRAFO, DB_LIDERANCAS, DB_GRUPOS):
    _db.parent.mkdir(parents=True, exist_ok=True)

# Garante diretórios de dados
for _d in (DIR_RELATORIOS, DIR_SNAPSHOTS, DIR_LOGS, DIR_CHROMA, DIR_DOUTRINA):
    _d.mkdir(parents=True, exist_ok=True)


def is_production() -> bool:
    """Retorna True se rodando em modo produção (AGENT_BASTOS_PROD=1)."""
    return _PROD


# ── Script de migração ────────────────────────────────────────────────────────
def _migrate():
    """
    Copia os bancos existentes em BASE_DIR/data/ para DATA_DIR (AppData).
    Executa apenas em modo produção; em dev é um no-op com aviso.

    Uso:  python config/paths.py --migrate
    """
    if not _PROD:
        print("[migrate] Não está em modo produção (AGENT_BASTOS_PROD=1 não definido).")
        print("          Defina a variável e execute novamente.")
        return

    src_data = BASE_DIR / "data"
    if not src_data.exists():
        print(f"[migrate] Pasta de origem não encontrada: {src_data}")
        return

    print(f"[migrate] Origem  : {src_data}")
    print(f"[migrate] Destino : {DATA_DIR}")

    copied = 0
    skipped = 0
    for src_file in src_data.rglob("*.db"):
        rel = src_file.relative_to(src_data)
        dst_file = DATA_DIR / rel
        dst_file.parent.mkdir(parents=True, exist_ok=True)

        if dst_file.exists():
            print(f"  [skip] {rel}  (já existe no destino)")
            skipped += 1
        else:
            shutil.copy2(src_file, dst_file)
            print(f"  [OK]   {rel}")
            copied += 1

    # Migra também o dashboard_bastos.db da raiz
    src_dash = BASE_DIR / "dashboard_bastos.db"
    if src_dash.exists():
        dst_dash = DATA_DIR / "dashboard_bastos.db"
        if dst_dash.exists():
            print("  [skip] dashboard_bastos.db  (já existe no destino)")
            skipped += 1
        else:
            shutil.copy2(src_dash, dst_dash)
            print("  [OK]   dashboard_bastos.db")
            copied += 1

    print(f"\n[migrate] Concluído: {copied} copiados, {skipped} ignorados.")
    print("[migrate] Você pode excluir BASE_DIR/data/ após verificar que tudo funciona.")


if __name__ == "__main__":
    import sys
    if "--migrate" in sys.argv:
        _migrate()
    else:
        print(f"DATA_DIR  = {DATA_DIR}")
        print(f"Produção  = {_PROD}")
        print(f"DB_AUTH   = {DB_AUTH}")
        print(f"DB_GRAFO  = {DB_GRAFO}")
