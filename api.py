import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from modules.rag import conversar_com_bastos

app = FastAPI(title="Agent Bastos API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

class PerguntaRequest(BaseModel):
    pergunta: str

@app.get("/health")
def health():
    return {"status": "online", "agente": "BASTOS-UNIT"}

@app.post("/chat")
def chat(req: PerguntaRequest):
    if not req.pergunta.strip():
        return {"resposta": "Pergunta vazia recebida."}
    resposta = conversar_com_bastos(req.pergunta)
    return {"resposta": resposta}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
