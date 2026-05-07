from dotenv import load_dotenv
import os

load_dotenv()

# Anthropic
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

# Google Drive
GOOGLE_CREDENTIALS_PATH = os.getenv("GOOGLE_CREDENTIALS_PATH", "credentials.json")
GOOGLE_TOKEN_PATH = os.getenv("GOOGLE_TOKEN_PATH", "token.json")

# Firebase
FIREBASE_KEY_PATH = os.getenv("FIREBASE_KEY_PATH", "serviceAccountKey.json")

# Groq
GROQ_API_KEY = os.getenv("GROQ_API_KEY")