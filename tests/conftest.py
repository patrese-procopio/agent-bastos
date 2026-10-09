"""
Configuração comum dos testes.

O CI roda numa máquina limpa, SEM .env. Os módulos de autenticação (services/auth_service,
config/settings) são fail-fast e se recusam a importar sem segredos — por isso definimos valores
FALSOS de teste, só quando a variável ainda não existe. Em desenvolvimento o .env real continua
valendo (settings.py faz load_dotenv(override=True) depois deste arquivo).
Nada aqui é credencial de verdade.
"""
import os

os.environ.setdefault("JWT_SECRET_KEY", "chave-somente-para-testes-0123456789abcdef0123456789abcdef")
os.environ.setdefault("FERNET_KEY", "VGVzdGVTb21lbnRlLVBhcmEtQ0ktMDEyMzQ1Njc4OTAxMjM0NTY3ODk=")
_HASH_FALSO = "$2b$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ0123456"
os.environ.setdefault("ADMIN_PASSWORD_HASH", _HASH_FALSO)
os.environ.setdefault("ANALISTA_PASSWORD_HASH", _HASH_FALSO)
