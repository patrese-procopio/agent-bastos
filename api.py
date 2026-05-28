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
from dotenv import load_dotenv
load_dotenv(override=True)  # .env é a fonte de verdade (vence env vars pré-existentes)

# ── Logging (PRIMEIRA coisa antes de importar routers, p/ não perder eventos) ─
from services.logging_service import configurar_logging
configurar_logging()

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
from routers.grupos_router import router as grupos_router
from routers.grafo_router import router as grafo_router
from routers.extrato_router import router as extrato_router

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
# Dashboard agora lê dados REAIS do SQLite (dashboard_bastos.db) via dashboard_router.
# O seed fictício de producao.json foi descontinuado (não chamar — gerava números falsos).
# _seed_dashboard_inicial()  # DESATIVADO

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Agent Bastos API", version="1.0.0")

# Ordem dos middlewares (Starlette executa em ordem INVERSA da adição):
#   request entra → SecurityHeaders → AccessLog → CORS → SlowAPI → router
#   response sai  ← (mesmos em ordem reversa)
# Por isso adicionamos do "mais externo" para o "mais interno".
from services.middlewares import SecurityHeadersMiddleware, AccessLogMiddleware, montar_cors
from services.rate_limit_service import montar_rate_limit

app.add_middleware(SecurityHeadersMiddleware)   # sempre adiciona headers, mesmo em 4xx/5xx
app.add_middleware(AccessLogMiddleware)         # 1 linha por request em bastos.access
montar_cors(app)                                # allowlist Electron + localhost
montar_rate_limit(app)                          # slowapi: anti brute-force e abuse


# ── Registro de routers ───────────────────────────────────────────────────────
app.include_router(auth_router, prefix="/api")
app.include_router(liderancas_router, prefix="/api")
app.include_router(alertas_router,     prefix="/api")
app.include_router(agenda_router,      prefix="/api")
app.include_router(dashboard_router,   prefix="/api")
app.include_router(transcricao_router, prefix="/api")
app.include_router(referencias_router, prefix="/api")
app.include_router(inteligencia_router,prefix="/api")
app.include_router(sistema_router,     prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(config_router, prefix="/api")
app.include_router(grupos_router, prefix="/api")
app.include_router(grafo_router,      prefix="/api")
app.include_router(extrato_router,    prefix="/api")

# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # host=127.0.0.1 (loopback APENAS) — fecha a porta na LAN.
    # Electron+Vite rodam no mesmo host, não precisam de 0.0.0.0.
    # Pra expor na rede (raríssimo: só se for usar de outra máquina),
    # use BASTOS_HOST=0.0.0.0 no .env e tenha consciência do risco.
    host = os.getenv("BASTOS_HOST", "127.0.0.1")
    port = int(os.getenv("BASTOS_PORT", "8000"))
    uvicorn.run("api:app", host=host, port=port, reload=False)
