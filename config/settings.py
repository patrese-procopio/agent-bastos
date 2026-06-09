from dotenv import load_dotenv
import os

# override=True: o .env é a fonte de verdade das chaves/config — vence qualquer
# variável de ambiente pré-existente (evita chave herdada/vazia mascarar a real).
load_dotenv(override=True)

# Anthropic
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

# Google Drive
GOOGLE_CREDENTIALS_PATH = os.getenv("GOOGLE_CREDENTIALS_PATH", "credentials.json")
GOOGLE_TOKEN_PATH = os.getenv("GOOGLE_TOKEN_PATH", "token.json")

# Firebase
FIREBASE_KEY_PATH = os.getenv("FIREBASE_KEY_PATH", "serviceAccountKey.json")

# Groq
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# DeepSeek (API OpenAI-compatible — https://platform.deepseek.com)
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")

# Telegram (OSINT — Telethon)
# api_id/api_hash: gerados em https://my.telegram.org → API development tools
# session: string gerada uma única vez por scripts/telegram_login.py
TELEGRAM_API_ID = os.getenv("TELEGRAM_API_ID")
TELEGRAM_API_HASH = os.getenv("TELEGRAM_API_HASH")
TELEGRAM_SESSION = os.getenv("TELEGRAM_SESSION")