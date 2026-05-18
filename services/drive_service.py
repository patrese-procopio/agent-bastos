"""
services/drive_service.py
─────────────────────────────────────────────────────────────────────────────
Centraliza TODA interação com o Google Drive via Service Account.

Por que existe este módulo?
  - Antes, as funções de Drive estavam espalhadas no api.py, misturadas
    com rotas HTTP, seeds e helpers de exportação.
  - Aqui elas vivem isoladas: sem FastAPI, sem Request, sem Response.
  - Isso permite testar o upload/download de JSON com pytest puro,
    sem precisar subir o servidor.

Funções exportadas:
  get_service()              → cliente autenticado do Drive v3
  upload_json(nome, dados, folder_id)
  download_json(nome, folder_id) → dict | None
  download_bytes(file_id)    → bytes  (para xlsx, docx, pdf)

Constantes exportadas:
  SA_KEY_PATH    → caminho absoluto do serviceAccountKey.json
  DRIVE_SCOPES   → escopos OAuth usados em todo o projeto
"""

import io
import json
import os

from google.oauth2 import service_account as _sa
from googleapiclient.discovery import build as _build
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload

# ─── Caminhos e escopos ──────────────────────────────────────────────────────

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SA_KEY_PATH = os.path.join(BASE_DIR, "serviceAccountKey.json")

# Escopo de leitura para download de arquivos públicos/compartilhados
DRIVE_SCOPES_RO = ["https://www.googleapis.com/auth/drive.readonly"]

# Escopo completo para upload, update e delete
DRIVE_SCOPES_RW = ["https://www.googleapis.com/auth/drive"]


# ─── Cliente autenticado ─────────────────────────────────────────────────────

def get_service(readonly: bool = False):
    """
    Retorna um cliente autenticado do Google Drive v3.

    Parâmetro:
      readonly  Se True, usa escopo drive.readonly (menor privilégio).
                Se False (padrão), usa drive completo (necessário para upload).

    Por que não usar singleton aqui?
      A googleapiclient já faz cache interno de discovery. Criar o cliente
      a cada chamada é seguro e evita problemas de estado compartilhado
      em ambientes com múltiplas threads (ex: uvicorn com workers).
    """
    scopes = DRIVE_SCOPES_RO if readonly else DRIVE_SCOPES_RW
    creds  = _sa.Credentials.from_service_account_file(SA_KEY_PATH, scopes=scopes)
    return _build("drive", "v3", credentials=creds)


# ─── JSON: upload e download ─────────────────────────────────────────────────

def upload_json(nome_arquivo: str, dados: dict, folder_id: str) -> None:
    """
    Faz upload de um dict como JSON no Drive.
    Se o arquivo já existir na pasta, atualiza (update); senão, cria (create).

    Estratégia upsert:
      1. Lista arquivos com o mesmo nome na pasta (trashed=false).
      2. Se encontrar → update (preserva o file_id, histórico de versões).
      3. Se não encontrar → create com parents=[folder_id].

    Por que upsert e não sempre create?
      Create duplica o arquivo a cada chamada. Com update, o Drive mantém
      um único arquivo com histórico de versões — mais limpo e auditável.
    """
    service  = get_service()
    conteudo = json.dumps(dados, ensure_ascii=False, indent=2).encode("utf-8")
    media    = MediaIoBaseUpload(io.BytesIO(conteudo), mimetype="application/json")

    results = service.files().list(
        q=f"name='{nome_arquivo}' and '{folder_id}' in parents and trashed=false",
        fields="files(id)",
    ).execute()

    if results["files"]:
        service.files().update(
            fileId=results["files"][0]["id"],
            media_body=media,
        ).execute()
    else:
        service.files().create(
            body={"name": nome_arquivo, "parents": [folder_id]},
            media_body=media,
        ).execute()


def download_json(nome_arquivo: str, folder_id: str) -> dict | None:
    """
    Baixa um arquivo JSON do Drive e retorna como dict.
    Retorna None se o arquivo não existir na pasta.

    Nota: usa utf-8-sig para tolerar BOM (Byte Order Mark) que o Windows
    às vezes adiciona ao salvar arquivos JSON via Excel/Notepad.
    """
    service = get_service(readonly=True)

    results = service.files().list(
        q=f"name='{nome_arquivo}' and '{folder_id}' in parents and trashed=false",
        fields="files(id)",
    ).execute()

    if not results["files"]:
        return None

    buffer  = io.BytesIO()
    request = service.files().get_media(fileId=results["files"][0]["id"])
    dl      = MediaIoBaseDownload(buffer, request)
    done    = False
    while not done:
        _, done = dl.next_chunk()

    buffer.seek(0)
    return json.loads(buffer.read().decode("utf-8-sig"))


# ─── Bytes brutos: download direto por file_id ───────────────────────────────

def download_bytes(file_id: str) -> bytes:
    """
    Baixa qualquer arquivo do Drive pelo file_id e retorna bytes brutos.
    Usado para xlsx (lista negra), docx e pdf das referências.

    Diferença de download_json:
      - download_json procura por nome dentro de uma pasta.
      - download_bytes acessa diretamente pelo ID único do arquivo.
      Útil quando você já tem o file_id salvo no índice de documentos.
    """
    service = get_service(readonly=True)
    request = service.files().get_media(fileId=file_id)
    buffer  = io.BytesIO()
    dl      = MediaIoBaseDownload(buffer, request)
    done    = False
    while not done:
        _, done = dl.next_chunk()
    buffer.seek(0)
    return buffer.read()
