"""
routers/chat_router.py — Rota de Chat com RAG
─────────────────────────────────────────────
Conecta o frontend ao motor real do rag.py.
Retorna resposta + fontes + score de confiança.
"""

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from dependencies import get_current_user
from modules.rag import conversar_com_fontes, _db
from services.rate_limit_service import limiter, LIMIT_IA_LEVE

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    pergunta: str


@router.post("")
@limiter.limit(LIMIT_IA_LEVE)
async def chat(request: Request, req: ChatRequest, user=Depends(get_current_user)):
    """
    RAG real: busca semântica no ChromaDB → gera via Groq.
    Retorna: { resposta, fontes, confianca }
    """
    return conversar_com_fontes(req.pergunta)


@router.get("/doutrinas")
async def listar_doutrinas(user=Depends(get_current_user)):
    """
    Inventário do ChromaDB — alimenta a sidebar.
    Retorna cada doutrina única com contagem de chunks.
    """
    collection = _db._collection.get(include=["metadatas"])
    metadatas = collection["metadatas"]

    # Agrupa chunks por fonte
    contagem: dict[str, int] = {}
    for meta in metadatas:
        fonte = meta.get("fonte", "Desconhecida")
        contagem[fonte] = contagem.get(fonte, 0) + 1

    doutrinas = [
        {"nome": fonte, "chunks": total}
        for fonte, total in sorted(contagem.items())
    ]

    return {
        "total_documentos": len(doutrinas),
        "total_chunks": len(metadatas),
        "doutrinas": doutrinas,
    }
