# ==============================================================================
# Agent Bastos - Dockerfile (multi-stage build)
# ------------------------------------------------------------------------------
# Estagio 1 (builder): instala dependencias com ferramentas de compilacao.
# Estagio 2 (runtime): imagem final enxuta, so com o necessario para rodar.
# Beneficio: imagem final menor, sem compiladores (menos superficie de ataque).
# ==============================================================================

# ---- Estagio 1: builder ------------------------------------------------------
FROM python:3.11-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
        g++ \
        git \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt


# ---- Estagio 2: runtime ------------------------------------------------------
FROM python:3.11-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 \
        curl \
    && rm -rf /var/lib/apt/lists/*

# "builder" agora bate com o AS builder do estágio 1
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN useradd --create-home --uid 1000 bastos
WORKDIR /app

COPY . .

# mkdir e chown juntos num único RUN — menos layers, mais limpo
RUN mkdir -p /app/data /app/logs \
    && chown -R bastos:bastos /app/data /app/logs

USER bastos

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/docs || exit 1

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]