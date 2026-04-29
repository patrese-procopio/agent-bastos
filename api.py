import uvicorn
import os
import glob
import json
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

PASTA_RELATORIOS = r"C:\Users\Administrador\Agent_Bastos\data\relatorios"

class PerguntaRequest(BaseModel):
    pergunta: str

class RelatorioRequest(BaseModel):
    mes: str
    ano: int
    dados: dict

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

@app.post("/relatorio-dashboard")
def relatorio_dashboard(req: RelatorioRequest):
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

@app.get("/noticias")
def noticias():
    arquivos = []
    os.makedirs(PASTA_RELATORIOS, exist_ok=True)

    # Lê noticias_crimes.json (novo formato estruturado do n8n)
    json_path = os.path.join(PASTA_RELATORIOS, "noticias_crimes.json")
    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                dados = json.load(f)
            stat = os.stat(json_path)
            # Formato novo: objeto direto com campo noticias
            noticias_list = None
            if "noticias" in dados:
                noticias_list = dados["noticias"]
            # Formato n8n: campo texto contém JSON como string
            elif "texto" in dados:
                inner = json.loads(dados["texto"])
                if "noticias" in inner:
                    noticias_list = inner["noticias"]
            if noticias_list:
                for n in noticias_list:
                    arquivos.append({
                        "titulo": n.get("titulo", "Sem título"),
                        "resumo": n.get("resumo", ""),
                        "link": n.get("link", ""),
                        "imagem": n.get("imagem", ""),
                        "data_pub": n.get("data", ""),
                        "categoria": n.get("categoria", "CRIMES"),
                        "conteudo": n.get("resumo", ""),
                        "arquivo": "noticias_crimes.json",
                        "atualizado": stat.st_mtime,
                        "formato": "estruturado"
                    })
                return {"noticias": arquivos}
        except Exception:
            pass

    # Fallback: lê arquivos .txt legados
    for caminho in glob.glob(os.path.join(PASTA_RELATORIOS, "*.txt")):
        nome = os.path.basename(caminho)
        try:
            with open(caminho, "r", encoding="utf-8") as f:
                conteudo = f.read()
        except Exception:
            continue
        stat = os.stat(caminho)
        titulo = "Monitor Crimes AM" if nome == "relatorio.txt" else nome.replace(".txt", "").replace("_", " ").title()
        arquivos.append({
            "titulo": titulo,
            "resumo": conteudo[:200],
            "link": "",
            "imagem": "",
            "data_pub": "",
            "categoria": "CRIMES",
            "conteudo": conteudo,
            "arquivo": nome,
            "atualizado": stat.st_mtime,
            "formato": "texto"
        })

    arquivos.sort(key=lambda x: x["atualizado"], reverse=True)
    return {"noticias": arquivos}

@app.post("/noticias/salvar")
async def salvar_noticias(dados: dict):
    """Endpoint chamado pelo n8n para salvar notícias estruturadas."""
    os.makedirs(PASTA_RELATORIOS, exist_ok=True)
    caminho = os.path.join(PASTA_RELATORIOS, "noticias_crimes.json")
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
    total = len(dados.get("noticias", []))
    return {"status": "salvo", "total": total}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
