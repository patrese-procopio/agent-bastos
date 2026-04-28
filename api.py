import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from modules.rag import conversar_com_bastos, conversar_com_fontes

app = FastAPI(title="Agent Bastos API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_methods=["POST", "GET", "OPTIONS"],
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

@app.post("/chat-rag")
def chat_rag(req: PerguntaRequest):
    if not req.pergunta.strip():
        return {"resposta": "Pergunta vazia recebida.", "fontes": [], "confianca": 0}
    resultado = conversar_com_fontes(req.pergunta)
    return resultado


class RelatorioRequest(BaseModel):
    mes: str
    ano: int
    dados: dict

@app.post("/relatorio-dashboard")
def relatorio_dashboard(req: RelatorioRequest):
    import os
    from groq import Groq

    prompt = f"""Voce e o BASTOS-UNIT, analista de inteligencia institucional.
Com base nos dados de producao documental da agencia abaixo, gere um RELATORIO ANALITICO EXECUTIVO completo e profissional.

MES DE REFERENCIA: {req.mes}/{req.ano}

DADOS DE PRODUCAO:
{req.dados}

Estruture o relatorio com:
1. SUMARIO EXECUTIVO (2-3 paragrafos sobre o desempenho geral)
2. DESTAQUES POSITIVOS (nucleos e documentos com melhor performance)
3. PONTOS DE ATENCAO (quedas, inconsistencias ou nucleos com baixa producao)
4. ANALISE POR NUCLEO (breve paragrafo sobre cada nucleo principal: NI, NCI, NBE)
5. ANALISE DOS NUCADIs (producao de Relatorios Internos por unidade)
6. RECOMENDACOES ESTRATEGICAS (3-5 acoes concretas para o chefe da agencia)
7. CONCLUSAO

Use linguagem tecnica, direta e institucional. Seja especifico com os numeros fornecidos."""

    try:
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=2048,
        )
        analise = completion.choices[0].message.content
    except Exception as e:
        return {"analise": f"FALHA: {e}"}

    return {"analise": analise}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
