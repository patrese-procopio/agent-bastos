# testar_indice.py
# Script de consulta rápida para validar o índice gerado

import json
from pathlib import Path

INDICE_PATH = Path("indice_documentos.json")

def carregar_indice():
    return json.loads(INDICE_PATH.read_text(encoding="utf-8"))

def buscar(termo: str, indice: dict) -> list:
    termo = termo.upper()
    return [
        doc for doc in indice["documentos"]
        if termo in doc["assunto"].upper()
        or termo in doc["numero"]
        or termo in doc["ano"]
    ]

def exibir(docs: list):
    if not docs:
        print("\n❌ Nenhum documento encontrado.")
        return
    print(f"\n✅ {len(docs)} documento(s) encontrado(s):\n")
    for doc in docs:
        mes = f" | {doc['mes']}" if doc['mes'] else ""
        print(f"  {doc['tipo']} {doc['numero']} — {doc['ano']}{mes}")
        print(f"  Assunto: {doc['assunto']}")
        print(f"  Data: {doc['data_modificacao']} | Formato: {doc['formato']}")
        print()

if __name__ == "__main__":
    indice = carregar_indice()
    print(f"📚 Índice carregado: {indice['total_documentos']} documentos")
    print(f"📅 Gerado em: {indice['gerado_em']}\n")

    while True:
        termo = input("🔍 Buscar (ou 'sair'): ").strip()
        if termo.lower() == "sair":
            break
        exibir(buscar(termo, indice))