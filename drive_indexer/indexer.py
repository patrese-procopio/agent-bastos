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


def _persistir(indice: dict) -> None:
    """Escreve o indice atual em disco. Chamado apos cada ano pra ter
    progresso incremental — se a rede cair no meio, o proximo run comeca
    do proximo ano em vez de zerar tudo."""
    indice["total_documentos"] = len(indice["documentos"])
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(indice, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _carregar_existente() -> dict:
    """Le o indice anterior se existir. Volta um dict vazio se nao houver."""
    if OUTPUT_PATH.exists():
        try:
            return json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"gerado_em": "", "total_documentos": 0, "nao_classificados": 0, "documentos": []}


def construir_indice(resumir: bool = True) -> dict:
    """
    Funcao principal: autentica, coleta e parseia todos os documentos.
    Retorna o indice completo como dicionario.

    Se resumir=True (default) e o arquivo do indice ja existe, PULA anos
    que ja tem documentos — util pra retomar apos falha de rede.
    """
    print("[*] Autenticando com o Google Drive...")
    service = get_drive_service()
    print("[+] Autenticado com sucesso.\n")

    indice = _carregar_existente() if resumir else {
        "gerado_em": "", "total_documentos": 0,
        "nao_classificados": 0, "documentos": [],
    }
    indice["gerado_em"] = datetime.now().strftime("%d/%m/%Y as %H:%M")
    # Anos ja indexados (pra pular em modo resume)
    anos_ja_processados = {d.get("ano") for d in indice.get("documentos", []) if d.get("ano")}

    for ano, folder_id in PASTAS_ANOS.items():
        if "COLE_AQUI" in folder_id:
            print(f"[!] Pasta {ano} sem ID configurado - pulando.")
            continue

        if resumir and ano in anos_ja_processados:
            n = sum(1 for d in indice["documentos"] if d.get("ano") == ano)
            print(f"[=] {ano} ja indexado ({n} docs) - pulando. Use resumir=False pra refazer.")
            continue

        print(f"[.] Crawleando {ano}...")
        try:
            arquivos_brutos = crawlear_pasta_ano(service, folder_id, ano)
        except Exception as exc:
            print(f"[X] {ano} FALHOU: {exc}")
            print(f"    Salvando progresso ate aqui e abortando. Rode de novo pra retomar.")
            _persistir(indice)
            raise
        print(f"    {len(arquivos_brutos)} arquivos encontrados.")

        adicionados = 0
        nao_class_ano = 0
        for arq in arquivos_brutos:
            metadata = parsear_nome_arquivo(
                nome=arq["name"], ano_pasta=ano, mes_pasta=arq.get("mes")
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
            adicionados += 1
            if not metadata.classificado:
                nao_class_ano += 1
        indice["nao_classificados"] = indice.get("nao_classificados", 0) + nao_class_ano

        # Salva progresso apos cada ano (rede pode cair)
        _persistir(indice)
        print(f"    +{adicionados} docs, {nao_class_ano} nao classificados. Total acumulado: {len(indice['documentos'])}")

    return indice


def salvar_indice():
    indice = construir_indice(resumir=True)
    _persistir(indice)
    print(f"\n[+] Indice salvo em: {OUTPUT_PATH}")
    print(f"[=] Total: {indice['total_documentos']} documentos")
    print(f"[!] Nao classificados: {indice['nao_classificados']}")


if __name__ == "__main__":
    import sys
    # Uso: python -m drive_indexer.indexer [--refazer]
    resumir = "--refazer" not in sys.argv
    idx = construir_indice(resumir=resumir)
    _persistir(idx)
    print(f"\n[+] Indice salvo em: {OUTPUT_PATH}")
    print(f"[=] Total: {idx['total_documentos']} documentos")
    print(f"[!] Nao classificados: {idx['nao_classificados']}")
