"""
api.py — Agent Bastos API
─────────────────────────────────────────────────────────────────────────────
Orquestrador principal. Responsabilidades:
  1. Criar a instância FastAPI com CORS
  2. Registrar todos os routers (include_router)
  3. Executar seeds de inicialização (idempotentes)
  4. Entry point para uvicorn

Regra de ouro: NENHUMA lógica de negócio ou rota aqui.
Tudo vai em routers/ (transporte HTTP) ou services/ (lógica).
"""

import os
import uvicorn

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ── Routers ──────────────────────────────────────────────────────────────────
from api_liderancas_router import liderancas_router
from routers.alertas_router     import router as alertas_router
from routers.agenda_router      import router as agenda_router
from routers.dashboard_router   import router as dashboard_router
from routers.transcricao_router import router as transcricao_router
from routers.referencias_router import router as referencias_router
from routers.inteligencia_router import router as inteligencia_router
from routers.sistema_router     import router as sistema_router

# ── Seeds ─────────────────────────────────────────────────────────────────────
from services.alertas_service import seed_alertas_iniciais

# ── Configuração ──────────────────────────────────────────────────────────────
BASE_DIR         = os.path.dirname(os.path.abspath(__file__))
_SA_KEY_PATH     = os.path.join(BASE_DIR, "serviceAccountKey.json")
PASTA_RELATORIOS = os.path.join(BASE_DIR, "data", "relatorios")

os.makedirs(PASTA_RELATORIOS, exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, "data", "audios"), exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, "data", "snapshots"), exist_ok=True)

# ── Seed de produção legado (JSON) — mantido até migrar para SQLite ───────────

_DASHBOARD_STATS_PATH = os.path.join(PASTA_RELATORIOS, "producao.json")

def _seed_dashboard_inicial() -> None:
    """Popula producao.json com dados fictícios se ainda não existir."""
    if os.path.exists(_DASHBOARD_STATS_PATH):
        return
    import json, random as _r
    _r.seed(42)
    nucleos_docs = {
        "NI":            ["RELINT", "REPEN", "PEDIDO DE BUSCA", "MINUTA DE OFICIO", "PROJETO"],
        "NCI":           ["RELINT", "PEDIDO DE BUSCA", "RELTEC", "MINUTA DE OFICIO", "PROJETO"],
        "NBE":           ["RELINT", "RELTEC", "PROJETO"],
        "NUCADI_UPP":    ["RELATORIO INTERNO"],
        "NUCADI_COMPAJ": ["RELATORIO INTERNO"],
        "NUCADI_IPAT":   ["RELATORIO INTERNO"],
        "NUCADI_CDPM1":  ["RELATORIO INTERNO"],
        "NUCADI_CDPMII": ["RELATORIO INTERNO"],
        "NUCADI_CDF":    ["RELATORIO INTERNO"],
    }
    dados: dict = {}
    for nucleo, docs in nucleos_docs.items():
        dados[nucleo] = {}
        is_nucadi = nucleo.startswith("NUCADI")
        for m in range(12):
            dados[nucleo][str(m)] = {}
            for doc in docs:
                base = 8 if is_nucadi else 12
                dados[nucleo][str(m)][doc] = _r.randint(2, base + 1)
    os.makedirs(os.path.dirname(_DASHBOARD_STATS_PATH), exist_ok=True)
    with open(_DASHBOARD_STATS_PATH, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)


# ── Executa seeds ─────────────────────────────────────────────────────────────
seed_alertas_iniciais()
_seed_dashboard_inicial()

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Agent Bastos API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_methods=["POST", "GET", "OPTIONS", "PATCH", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

# ── Registro de routers ───────────────────────────────────────────────────────
app.include_router(liderancas_router)
app.include_router(alertas_router)
app.include_router(agenda_router)
app.include_router(dashboard_router)
app.include_router(transcricao_router)
app.include_router(referencias_router)
app.include_router(inteligencia_router)
app.include_router(sistema_router)

# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=False)
