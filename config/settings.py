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
# Modelo de chat do Groq usado no RAG, monitor e transcricao. Centralizado
# aqui para nao depender de find-and-replace em 3 arquivos quando a Groq
# aposentar um modelo (ja aconteceu com llama-3.3-70b-versatile em 16/08/2026
# -- ver https://console.groq.com/docs/deprecations).
GROQ_MODEL_CHAT = os.getenv("GROQ_MODEL_CHAT", "openai/gpt-oss-120b")
# Modelo mais leve para papeis de alto volume/baixa criatividade (juiz de
# avaliacao RAGAS, classificacoes simples). Sem overhead de raciocinio do
# gpt-oss-120b -- consome uma fracao dos tokens para a mesma tarefa, o que
# importa muito no free tier (limite diario de 200k tokens).
GROQ_MODEL_JUDGE = os.getenv("GROQ_MODEL_JUDGE", "llama-3.1-8b-instant")

# DeepSeek (API OpenAI-compatible — https://platform.deepseek.com)
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")

# Telegram (OSINT — Telethon)
# api_id/api_hash: gerados em https://my.telegram.org → API development tools
# session: string gerada uma única vez por scripts/telegram_login.py
TELEGRAM_API_ID = os.getenv("TELEGRAM_API_ID")
TELEGRAM_API_HASH = os.getenv("TELEGRAM_API_HASH")
TELEGRAM_SESSION = os.getenv("TELEGRAM_SESSION")