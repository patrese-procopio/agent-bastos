# ─────────────────────────────────────────────────────────────────────────────
# STAGE 1 — builder
# Instala dependências pesadas (torch, transformers, etc.) numa camada separada
# para que re-builds não reinstalem tudo do zero quando só o código mudar.
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /app

# Copia só o requirements primeiro — Docker cacheia essa camada
# enquanto o requirements.txt não mudar, mesmo que o código mude.
COPY requirements.txt .

RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt


# ─────────────────────────────────────────────────────────────────────────────
# STAGE 2 — runtime
# Imagem final limpa: copia os pacotes instalados do builder + o código.
# Resultado: imagem menor, sem lixo de compilação.
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

# Copia os pacotes Python instalados no stage anterior
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Dependências de sistema para soundfile/sounddevice (áudio) e reportlab (PDF)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    libportaudio2 \
    && rm -rf /var/lib/apt/lists/*

# Copia o código da aplicação
COPY . .

# Porta que o uvicorn vai escutar
EXPOSE 8000

# Usuário sem privilégios — boa prática de segurança (LGPD/hardening)
RUN useradd -m bastos
USER bastos

# Comando de inicialização
# --host 0.0.0.0 → aceita conexões de fora do container
# --reload       → só em dev; remover em produção
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
