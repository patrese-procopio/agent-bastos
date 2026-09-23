# drive_indexer/indexer.py
#
# CONCEITO: Orquestrador
# Este arquivo eh o ponto de entrada do modulo. Ele conecta todos os
# outros: autentica, crawlea, parseia e salva o indice final em JSON.
# Padrao de mercado: separar responsabilidades em modulos distintos
# e ter um unico ponto de entrada que os coordena.

import json
from datetime import datetime
from pathlib import Path

from .auth import get_drive_service
from .crawler import crawlear_pasta_ano
from .parser import parsear_nome_arquivo, DocumentoMetadata

# --- CONFIGURACAO ------------------------------------------------------------
# IDs das pastas de cada ano no Google Drive
# Para pegar o ID: abre a pasta no Drive, o ID eh o trecho final da URL
# Ex: drive.google.com/drive/folders/1ABC...XYZ -> ID = 1ABC...XYZ

PASTAS_ANOS = {
    "2015": "1e7AMjEf2baG4-c8MXdCQd5kd5YqferKb",
    "2016": "1K_QOGq_AR3tJwpf7juoqHKy27FqH22r4",
    "2017": "1ltn93rql7ebDxGdVVFmMzZdgDaKVrNhJ",
    "2018": "1D7oH8WmhowZ6nQpRf3mIim2_oZmm3OzZ",
    "2019": "1tmcU4cEjMFPqxHs2KZ8zvN6jQxJytrQF",
    "2020": "12QUpSUBY9Xs5-NP8gm-GTT4jKY7NizRl",
    # Pastas 2021-2026 adicionadas 2026-09-23 (AIPEN)
    "2021": "13vRq0FfwVlx8M_nP8oFS7jIjUSpD3KVg",
    "2022": "1AA_-wFeftMxwkQOBy8wbPUbPaAewSDUM",
    "2023": "12X2WeAbVW3F--cPTDSf3wS9bc5N2TG5M",
    "2024": "1WteztrpssXHMifA1h6JVfwDcLb_lBN3-",
    "2025": "1wQcA9ISLroKZ3EsV9169_vZHfaauPkGH",
    "2026": "1dn7fOqRHlow5dmWTzntE6q-0mCHsyZIb",
}

# Grava em scripts/ - mesmo lugar que routers/referencias_router.py le. Antes
# gravava na raiz, o que fazia GET /referencias devolver lista vazia porque o
# router procurava em scripts/ (bug corrigido em 2026-09-23).
OUTPUT_PATH = Path(__file__).parent.parent / "scripts" / "indice_documentos.json"
# ----------------------------------------------------------------------------


def formatar_data(iso_string: str) -> str:
    """Converte '2019-08-09T14:23:00.000Z' -> '09/08/2019'"""
    try:
        dt = datetime.fromisoformat(iso_string.replace("Z", "+00:00"))
        return dt.strftime("%d/%m/%Y")
    except Exception:
        return iso_string


def construir_indice() -> dict:
    """
    Funcao principal: autentica, coleta e parseia todos os documentos.
    Retorna o indice completo como dicionario.
    """
    print("[*] Autenticando com o Google Drive...")
    service = get_drive_service()
    print("[+] Autenticado com sucesso.\n")

    indice = {
        "gerado_em": datetime.now().strftime("%d/%m/%Y as %H:%M"),
        "total_documentos": 0,
        "nao_classificados": 0,
        "documentos": []
    }

    for ano, folder_id in PASTAS_ANOS.items():
        if "COLE_AQUI" in folder_id:
            print(f"[!] Pasta {ano} sem ID configurado - pulando.")
            continue

        print(f"[.] Crawleando {ano}...")
        arquivos_brutos = crawlear_pasta_ano(service, folder_id, ano)
        print(f"    {len(arquivos_brutos)} arquivos encontrados.")

        for arq in arquivos_brutos:
            metadata = parsear_nome_arquivo(
                nome=arq["name"],
                ano_pasta=ano,
                mes_pasta=arq.get("mes")
            )

            # Arquivo temporario do Word - ignora
            if metadata is None:
                continue

            doc = {
                "tipo": metadata.tipo,
                "numero": metadata.numero,
                "ano": metadata.ano,
                "mes": metadata.mes,
                "assunto": metadata.assunto,
                "data_modificacao": formatar_data(arq.get("modifiedTime", "")),
                "formato": metadata.formato,
                "classificado": metadata.classificado,
                "file_id": arq.get("id", ""),
            }

            indice["documentos"].append(doc)

            if not metadata.classificado:
                indice["nao_classificados"] += 1

    indice["total_documentos"] = len(indice["documentos"])
    return indice


def salvar_indice():
    indice = construir_indice()

    # Garante que scripts/ existe (idempotente)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(indice, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print(f"\n[+] Indice salvo em: {OUTPUT_PATH}")
    print(f"[=] Total: {indice['total_documentos']} documentos")
    print(f"[!] Nao classificados: {indice['nao_classificados']}")


if __name__ == "__main__":
    salvar_indice()
