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
from dotenv import load_dotenv
load_dotenv()

# ── Routers ──────────────────────────────────────────────────────────────────
from routers.liderancas_router import router as liderancas_router
from routers.alertas_router     import router as alertas_router
from routers.agenda_router      import router as agenda_router
from routers.dashboard_router   import router as dashboard_router
from routers.transcricao_router import router as transcricao_router
from routers.referencias_router import router as referencias_router
from routers.inteligencia_router import router as inteligencia_router
from routers.sistema_router     import router as sistema_router
from routers.auth_router import router as auth_router
from routers.chat_router import router as chat_router
from routers.config_router import router as config_router

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

from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

class ForceCORSMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            from starlette.responses import Response
            response = Response()
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = "*"
            response.headers["Access-Control-Allow-Headers"] = "*"
            return response
        response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return response

app.add_middleware(ForceCORSMiddleware)


# ── Registro de routers ───────────────────────────────────────────────────────
app.include_router(auth_router, prefix="/api")
app.include_router(liderancas_router)
app.include_router(alertas_router,     prefix="/api")
app.include_router(agenda_router,      prefix="/api")
app.include_router(dashboard_router,   prefix="/api")
app.include_router(transcricao_router, prefix="/api")
app.include_router(referencias_router, prefix="/api")
app.include_router(inteligencia_router,prefix="/api")
app.include_router(sistema_router,     prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(config_router, prefix="/api")

# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=False)
