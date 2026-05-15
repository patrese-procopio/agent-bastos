# Diagnóstico: lista todas as rotas @app registradas no api.py
import re

with open(r"C:\Users\Administrador\Agent_Bastos\api.py", "r", encoding="utf-8-sig") as f:
    lines = f.readlines()

print(f"Total de linhas: {len(lines)}\n")
print("=== Todas as rotas @app registradas ===")
for i, line in enumerate(lines, 1):
    if re.match(r'\s*@app\.(get|post|put|delete|patch)\(', line):
        print(f"  Linha {i:4d}: {line.rstrip()}")

print("\n=== Ocorrências de 'liderancas' ===")
for i, line in enumerate(lines, 1):
    if "liderancas" in line.lower():
        print(f"  Linha {i:4d}: {line.rstrip()}")
