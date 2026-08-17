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
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip \
    && pip install -r requirements.txt


# ---- Estagio 2: runtime ------------------------------------------------------
FROM python:3.11-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 \
        curl \
        gosu \
    && rm -rf /var/lib/apt/lists/*

# "builder" agora bate com o AS builder do estágio 1
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN useradd --create-home --uid 1000 bastos
WORKDIR /app

COPY . .

# mkdir antecipado — chown real acontece no entrypoint (volume montado)
RUN mkdir -p /app/data /app/logs

# Sem USER aqui — o entrypoint roda como root, corrige permissões e cai para bastos via gosu
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

COPY --chmod=755 entrypoint.sh /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]