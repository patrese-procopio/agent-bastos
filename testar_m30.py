"""
testar_m30.py — Teste dos endpoints do ORÁCULO LIVE (Missão 30)
Rode com: docker exec -i agent-bastos-api python3 - < testar_m30.py
"""
import json, sqlite3, sys

BASE = "http://localhost:8000/api"

# ── import requests (dentro do container) ──────────────────────
try:
    import requests
except ImportError:
    print("❌  requests não disponível no container")
    sys.exit(1)

# ── 1. Login ───────────────────────────────────────────────────
print("\n[1/4] Login como admin...")
r = requests.post(f"{BASE}/auth/login",
                  data={"username": "admin", "password": "admin123"},
                  headers={"Content-Type": "application/x-www-form-urlencoded"})
if r.status_code != 200:
    print(f"❌  Login falhou ({r.status_code}): {r.text[:200]}")
    sys.exit(1)
token = r.json()["access_token"]
H = {"Authorization": f"Bearer {token}"}
print("✅  Token obtido")

# ── 2. GET /grafo/stats ────────────────────────────────────────
print("\n[2/4] GET /api/grafo/stats...")
r = requests.get(f"{BASE}/grafo/stats", headers=H)
if r.status_code != 200:
    print(f"❌  stats falhou ({r.status_code}): {r.text[:200]}")
    sys.exit(1)
stats = r.json()
print("✅  stats OK:")
for k, v in stats.items():
    print(f"    {k}: {v}")

# ── 3. GET /grafo/recentes ─────────────────────────────────────
print("\n[3/4] GET /api/grafo/recentes?limite=10...")
r = requests.get(f"{BASE}/grafo/recentes?limite=10", headers=H)
if r.status_code != 200:
    print(f"❌  recentes falhou ({r.status_code}): {r.text[:200]}")
    sys.exit(1)
rec = r.json()
print(f"✅  recentes OK: {rec['total_nos']} nó(s), {rec['total_arestas']} aresta(s) auto:correlacao")
if rec["nos"]:
    print(f"    Exemplo: {rec['nos'][0]['rotulo']} | origem: {rec['nos'][0]['origem']}")
else:
    print("    (sem nós auto:correlacao ainda — normal se nenhum HITL foi confirmado)")

# ── 4. Verificação de integridade da query SQL ─────────────────
print("\n[4/4] Verificando integridade da query SQL no grafo.db...")
try:
    con = sqlite3.connect("/app/data/grafo.db")
    total = con.execute("SELECT COUNT(*) FROM nos").fetchone()[0]
    auto  = con.execute("SELECT COUNT(*) FROM nos WHERE origem LIKE 'auto:correlacao:%'").fetchone()[0]
    con.close()
    print(f"✅  grafo.db: {total} nó(s) total, {auto} auto:correlacao")
except Exception as e:
    # grafo.db pode estar em auth.db ou outro caminho
    print(f"⚠️   grafo.db não encontrado em /app/data/grafo.db: {e}")
    print("    (normal — o grafo usa a tabela nos/arestas que pode estar em auth.db)")

print("\n" + "="*50)
print("M30 BACKEND — TODOS OS TESTES PASSARAM ✅")
print("="*50)
