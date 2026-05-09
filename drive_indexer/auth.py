from google.oauth2 import service_account
from googleapiclient.discovery import build
from pathlib import Path

SCOPES   = ["https://www.googleapis.com/auth/drive.readonly"]
BASE_DIR = Path(__file__).parent.parent
SA_PATH  = BASE_DIR / "serviceAccountKey.json"

def get_drive_service():
    creds = service_account.Credentials.from_service_account_file(
        str(SA_PATH), scopes=SCOPES
    )
    return build("drive", "v3", credentials=creds)
