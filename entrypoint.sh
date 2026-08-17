#!/bin/sh
set -e

# Garante permissões nos volumes Docker (sobem como root na primeira criação)
chown -R bastos:bastos /app/logs /app/data 2>/dev/null || true
chmod -R 755 /app/logs /app/data 2>/dev/null || true

echo "[entrypoint] Verificando ChromaDB..."

CHUNKS=$(gosu bastos python - <<'EOF'
try:
    import chromadb
    client = chromadb.PersistentClient(path="/app/data/chroma_db")
    cols = client.list_collections()
    total = sum(c.count() for c in cols)
    print(total)
except Exception:
    print(0)
EOF
)

echo "[entrypoint] Chunks encontrados: $CHUNKS"

if [ "$CHUNKS" -eq 0 ]; then
    if [ -d "/app/data/doutrina" ] && ls /app/data/doutrina/*.txt 2>/dev/null | grep -q .; then
        echo "[entrypoint] ChromaDB vazio. Indexando..."
        gosu bastos python -m modules.ingestor
        echo "[entrypoint] Indexacao concluida."
    else
        echo "[entrypoint] AVISO: sem documentos para indexar. API sobe sem RAG."
    fi
else
    echo "[entrypoint] ChromaDB OK. Pulando indexacao."
fi

echo "[entrypoint] Subindo API como bastos..."
exec gosu bastos uvicorn api:app --host 0.0.0.0 --port 8000 --log-level info
