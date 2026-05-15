# -*- coding: utf-8 -*-
"""
remove_liderancas_antigas.py
Remove o bloco ANTIGO de rotas de lideranças (Drive) do api.py.
Linhas ~1271 a ~1385 — versão que usava _gdrive_service.
Execute UMA VEZ: python remove_liderancas_antigas.py
"""
import re

API_PATH = r"C:\Users\Administrador\Agent_Bastos\api.py"

with open(API_PATH, "r", encoding="utf-8-sig") as f:
    src = f.read()

# Marca início e fim do bloco antigo
# Começa na constante _LIDERANCAS_DADOS_FOLDER_ID e vai até o próximo
# bloco claramente separado (ocupacao ou historico)
INICIO = '_LIDERANCAS_DADOS_FOLDER_ID'
FIM    = '@app.get("/ocupacao")'

i = src.find(INICIO)
j = src.find(FIM)

if i == -1:
    print("Bloco antigo não encontrado — nada a remover.")
    exit(0)

if j == -1:
    print("Marcador de fim '/ocupacao' não encontrado. Abortando.")
    exit(1)

# Remove o bloco (do início até antes do /ocupacao)
src_novo = src[:i] + src[j:]

# Verifica se não sobrou duplicata de /liderancas/{unidade}
ocorrencias = [m.start() for m in re.finditer(r'@app\.get\("/liderancas/\{unidade\}"\)', src_novo)]
print(f"Ocorrências de /liderancas/{{unidade}} após remoção: {len(ocorrencias)}")
for pos in ocorrencias:
    linha = src_novo[:pos].count('\n') + 1
    print(f"  → linha {linha}")

with open(API_PATH, "w", encoding="utf-8") as f:
    f.write(src_novo)

print("\n✓ Bloco antigo removido com sucesso.")
print("  Reinicie o backend: python api.py")
