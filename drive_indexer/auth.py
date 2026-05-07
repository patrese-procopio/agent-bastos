# drive_indexer/auth.py
#
# CONCEITO: OAuth 2.0
# O Google não aceita usuário/senha direto. Ele usa OAuth — um protocolo
# onde o usuário autoriza o app UMA VEZ pelo navegador, e o Google devolve
# um token de acesso. Esse token fica salvo em token.json para reusos futuros.
# É como um crachá temporário: você se identifica uma vez, depois só apresenta o crachá.

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from pathlib import Path

# Escopo mínimo necessário: apenas leitura de metadados
# Nunca peça mais permissão do que o necessário — princípio do menor privilégio
SCOPES = ["https://www.googleapis.com/auth/drive.metadata.readonly"]

BASE_DIR = Path(__file__).parent.parent
CREDENTIALS_PATH = BASE_DIR / "credentials.json"
TOKEN_PATH = BASE_DIR / "token.json"


def get_drive_service():
    """
    Autentica e retorna o serviço do Google Drive.
    Na primeira execução: abre o navegador para autorização.
    Nas seguintes: usa o token salvo automaticamente.
    """
    creds = None

    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)

    # Token expirado ou inexistente — renova
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                CREDENTIALS_PATH, SCOPES
            )
            creds = flow.run_local_server(port=0)

        TOKEN_PATH.write_text(creds.to_json())

    return build("drive", "v3", credentials=creds)