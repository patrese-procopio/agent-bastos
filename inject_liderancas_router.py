# -*- coding: utf-8 -*-
"""
inject_liderancas_router.py
Injeta include_router no api.py logo após a criação do app FastAPI.
Execute UMA VEZ: python inject_liderancas_router.py
"""
import os, sys

API_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "api.py")

with open(API_PATH, "r", encoding="utf-8-sig") as f:
    src = f.read()

if "liderancas_router" in src:
    print("✓ Router já registrado — nada a fazer.")
    sys.exit(0)

# Injeta import no topo junto com os outros imports de módulos
MARCADOR_IMPORT = "from modules.liderancas import ("
NOVO_IMPORT = "from api_liderancas_router import liderancas_router\n"

if MARCADOR_IMPORT not in src:
    print("✗ Marcador de import não encontrado.")
    sys.exit(1)

src = src.replace(MARCADOR_IMPORT, NOVO_IMPORT + MARCADOR_IMPORT, 1)

# Injeta include_router logo após app.add_middleware(...)
MARCADOR_MIDDLEWARE = 'allow_headers=["Content-Type", "Authorization"],\n)'
if MARCADOR_MIDDLEWARE not in src:
    print("✗ Marcador de middleware não encontrado.")
    sys.exit(1)

src = src.replace(
    MARCADOR_MIDDLEWARE,
    MARCADOR_MIDDLEWARE + "\napp.include_router(liderancas_router)\n",
    1,
)

with open(API_PATH, "w", encoding="utf-8") as f:
    f.write(src)

print("✓ Router de lideranças registrado no api.py")
print("  Prefixo: /api/liderancas")
print("  Reinicie o backend: python api.py")
