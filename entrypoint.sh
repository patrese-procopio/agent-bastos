#!/bin/sh
set -e

echo "[entrypoint] Verificando ChromaDB..."

CHUNKS=$(python - <<'EOF'
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
        python -m modules.ingestor
        echo "[entrypoint] Indexacao concluida."
    else
        echo "[entrypoint] AVISO: sem documentos para indexar. API sobe sem RAG."
    fi
else
    echo "[entrypoint] ChromaDB OK. Pulando indexacao."
fi

echo "[entrypoint] Subindo API..."
exec uvicorn api:app --host 0.0.0.0 --port 8000 --log-level info