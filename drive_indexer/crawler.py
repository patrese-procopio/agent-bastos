# drive_indexer/crawler.py
#
# CONCEITO: Recursividade na API
# O Google Drive organiza tudo em pastas identificadas por IDs únicos.
# Para descer na hierarquia (pasta → subpasta → arquivos), usamos
# uma função recursiva que chama a si mesma a cada nível encontrado.
# É como um explorador que, ao entrar numa sala, verifica se há portas
# e entra em cada uma antes de continuar.

from googleapiclient.discovery import Resource
from typing import Optional
import re

# Campos que queremos trazer — nunca peça mais do que precisa
FIELDS = "files(id, name, mimeType, modifiedTime, parents)"
MIME_FOLDER = "application/vnd.google-apps.folder"


def listar_subpastas(service: Resource, folder_id: str) -> list[dict]:
    """Retorna todas as subpastas diretas de uma pasta."""
    query = f"'{folder_id}' in parents and mimeType='{MIME_FOLDER}' and trashed=false"
    resultado = service.files().list(q=query, fields=FIELDS).execute()
    return resultado.get("files", [])


def listar_arquivos(service: Resource, folder_id: str) -> list[dict]:
    """Retorna todos os arquivos (não pastas) de uma pasta."""
    query = f"'{folder_id}' in parents and mimeType!='{MIME_FOLDER}' and trashed=false"
    resultado = service.files().list(q=query, fields=FIELDS, pageSize=1000).execute()
    return resultado.get("files", [])


def extrair_numero_mes(nome_pasta: str) -> Optional[str]:
    """
    '8.AGOSTO' → 'Agosto'
    '10. OUTUBRO' → 'Outubro'
    """
    match = re.match(r"^(\d{1,2})\.\s*([A-ZÇÃÕ]+)", nome_pasta.strip(), re.IGNORECASE)
    if match:
        return match.group(2).capitalize()
    return None


def crawlear_pasta_ano(
    service: Resource,
    folder_id: str,
    ano: str
) -> list[dict]:
    """
    Desce recursivamente numa pasta de ano e coleta todos os arquivos
    com seus metadados de localização (ano, mês, pasta_tipo).

    Retorna lista de dicts com:
    - name: nome do arquivo
    - modifiedTime: data ISO
    - ano: string do ano
    - mes: nome do mês (se houver subpasta mensal)
    - pasta_tipo: ex. 'RELINTS', 'RELTEC'
    """
    arquivos_coletados = []

    # Nível 1: pastas de tipo dentro do ano (RELINTS, RELTEC, etc.)
    pastas_tipo = listar_subpastas(service, folder_id)

    for pasta_tipo in pastas_tipo:
        nome_tipo = pasta_tipo["name"].upper()

        # Só processa RELINTS e RELTEC — ignora FEDERAL, LIDERANÇAS, etc.
        if not any(t in nome_tipo for t in ["RELINT", "RELTEC"]):
            continue

        # Nível 2: verifica se há subpastas mensais
        subpastas = listar_subpastas(service, pasta_tipo["id"])

        if subpastas:
            # Tem subpastas mensais (padrão 2019/2020)
            for subpasta in subpastas:
                mes = extrair_numero_mes(subpasta["name"])
                arquivos = listar_arquivos(service, subpasta["id"])

                for arq in arquivos:
                    if not arq["name"].lower().endswith(('.docx','.doc','.pdf')):
                        continue
                    arq["ano"] = ano
                    arq["mes"] = mes
                    arq["pasta_tipo"] = pasta_tipo["name"]
                    arquivos_coletados.append(arq)
        else:
            # Sem subpastas — arquivos direto na pasta de tipo (2015-2018)
            arquivos = listar_arquivos(service, pasta_tipo["id"])

            for arq in arquivos:
                if not arq["name"].lower().endswith(('.docx','.doc','.pdf')):
                    continue
                arq["ano"] = ano
                arq["mes"] = None
                arq["pasta_tipo"] = pasta_tipo["name"]
                arquivos_coletados.append(arq)

    return arquivos_coletados