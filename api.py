import uvicorn
import os
import glob
import json
import io
import wave
import tempfile
import re
import threading
from datetime import datetime, timedelta
from fastapi import Form, FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, field_validator
from groq import Groq
from modules.rag import conversar_com_bastos, conversar_com_fontes
from modules.decifrar import transcrever_documento_bytes, TipoDocumento

# â”€â”€â”€ ConfiguraÃ§Ã£o â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

BASE_DIR         = os.path.dirname(os.path.abspath(__file__))
PASTA_RELATORIOS = os.path.join(BASE_DIR, "data", "relatorios")
_SA_KEY_PATH     = os.path.join(BASE_DIR, "serviceAccountKey.json")

# Cria diretÃ³rios necessÃ¡rios uma Ãºnica vez na inicializaÃ§Ã£o
os.makedirs(PASTA_RELATORIOS, exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, "data", "audios"), exist_ok=True)

# Singleton Groq â€” uma Ãºnica conexÃ£o reutilizada em todas as requests
_GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not _GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY nÃ£o encontrada. Configure o arquivo .env.")
_groq = Groq(api_key=_GROQ_API_KEY)

# Limites de seguranÃ§a
_MAX_PERGUNTA    = 4_000
_MAX_AUDIO_BYTES = 25 * 1024 * 1024
_AUDIO_EXTS = {".wav", ".mp3", ".mp4", ".ogg", ".webm", ".flac", ".m4a", ".mpga", ".mpeg"}

# Lock para escrita de arquivos de alertas (requests simultÃ¢neas)
_alertas_lock = threading.Lock()

_MESES_PT = [
    "Janeiro", "Fevereiro", "MarÃ§o", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]
_EXPORT_MIME = {
    "txt":  "text/plain",
    "pdf":  "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

_ALERTAS_PATH         = os.path.join(PASTA_RELATORIOS, "alertas.json")
_ALERTAS_OSINT_PATH   = os.path.join(PASTA_RELATORIOS, "alertas_osint.json")
_DASHBOARD_STATS_PATH = os.path.join(PASTA_RELATORIOS, "producao.json")
_INDICE_PATH          = os.path.join(BASE_DIR, "indice_documentos.json")

# â”€â”€â”€ Lista Negra â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
_LISTA_NEGRA_FILE_ID = "1G6eFhb0jnD38iWU_SLDIFkGtOB0ngHjh"
_GDRIVE_SCOPES       = ["https://www.googleapis.com/auth/drive.readonly"]


def _ler_alertas(caminho: str) -> list:
    if not os.path.exists(caminho):
        return []
    try:
        with open(caminho, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _salvar_alertas(caminho: str, alertas: list) -> None:
    with _alertas_lock:
        with open(caminho, "w", encoding="utf-8") as f:
            json.dump(alertas, f, ensure_ascii=False, indent=2)


# â”€â”€â”€ Seed inicial de alertas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _seed_alertas_iniciais() -> None:
    now = datetime.now()

    if not os.path.exists(_ALERTAS_PATH):
        alertas = [
            {
                "id": "a1", "tipo": "telegram", "fonte": "@manausnoticias",
                "link": "https://t.me/manausnoticias",
                "titulo": "MenÃ§Ã£o via #CVAM",
                "resumo": "MovimentaÃ§Ã£o no bairro Compensa. Fonte relata presenÃ§a de elemento "
                          "conhecido como 'CarnaÃºba' coordenando distribuiÃ§Ã£o de entorpecentes. #CVAM #Manaus",
                "risco": "ALTO",
                "timestamp": (now - timedelta(minutes=18)).isoformat(),
                "lido": False,
                "alvo_id": 1, "alvo_nome": "Gelson de Lima CarnaÃºba", "alvo_vulgos": ["CarnaÃºba"],
                "termo_encontrado": "carnaÃºba", "hashtag": "#CVAM",
                "analise_ia": "Elemento identificado em Ã¡rea de distribuiÃ§Ã£o ativa â€” risco operacional "
                              "imediato. VerificaÃ§Ã£o de campo recomendada nas prÃ³ximas 2h.",
            },
            {
                "id": "b2", "tipo": "noticia", "fonte": "G1 Amazonas",
                "link": "https://g1.globo.com/am/",
                "titulo": "PolÃ­cia prende suspeito de trÃ¡fico no Jorge Teixeira",
                "resumo": '"John Wick" foi detido com 3 kg de entorpecentes durante operaÃ§Ã£o da DENARC nesta manhÃ£.',
                "risco": "ALTO",
                "timestamp": (now - timedelta(minutes=45)).isoformat(),
                "lido": False,
                "alvo_id": 14, "alvo_nome": "Leandro Costa de Oliveira",
                "alvo_vulgos": ["John Wick", "GaviÃ£o", "Leandrinho"],
                "termo_encontrado": "john wick",
                "analise_ia": "ConfirmaÃ§Ã£o de prisÃ£o â€” atualizar status do alvo. Verificar mandados pendentes.",
            },
            {
                "id": "c3", "tipo": "telegram", "fonte": "@policiaamazonas",
                "link": "https://t.me/policiaamazonas",
                "titulo": 'MenÃ§Ã£o: "El Diablo" em @policiaamazonas',
                "resumo": 'Alerta de fronteira: indivÃ­duo colombiano "El Diablo" teria cruzado pelo municÃ­pio de Tabatinga.',
                "risco": "ALTO",
                "timestamp": (now - timedelta(hours=1, minutes=30)).isoformat(),
                "lido": True,
                "alvo_id": 30, "alvo_nome": "Nelson Gaviria Florez",
                "alvo_vulgos": ["El Diablo", "Diablo"],
                "termo_encontrado": "el diablo",
                "analise_ia": None,
            },
            {
                "id": "d4", "tipo": "noticia", "fonte": "AcrÃ­tica AM",
                "link": "https://www.acritica.com/",
                "titulo": "OperaÃ§Ã£o desmantela ponto de venda no Morro da Liberdade",
                "resumo": '"Professor" foi preso com quatro pessoas durante operaÃ§Ã£o no bairro.',
                "risco": "MÃ‰DIO",
                "timestamp": (now - timedelta(hours=3)).isoformat(),
                "lido": False,
                "alvo_id": 6, "alvo_nome": "Adalberto SalomÃ£o Guedes da Silva",
                "alvo_vulgos": ["Professor", "SalomÃ£o"],
                "termo_encontrado": "professor",
                "analise_ia": None,
            },
        ]
        _salvar_alertas(_ALERTAS_PATH, alertas)

    if not os.path.exists(_ALERTAS_OSINT_PATH):
        osint = [
            {
                "id": "o1", "tipo": "sherlock", "fonte": "Sherlock â€” TikTok",
                "link": "https://www.tiktok.com/",
                "titulo": "Perfil encontrado: @carnauba_am no TikTok",
                "resumo": "Username 'carnauba' identificado em conta ativa. Bio: 'Compensa ðŸ”´âš«'. "
                          "Ãšltimo post hÃ¡ 3 dias. PossÃ­vel perfil operacional do alvo.",
                "risco": "ALTO",
                "timestamp": (now - timedelta(hours=2)).isoformat(),
                "lido": False,
                "alvo_id": 1, "alvo_nome": "Gelson de Lima CarnaÃºba", "alvo_vulgos": ["CarnaÃºba"],
                "termo_encontrado": "carnauba", "plataforma": "TikTok",
                "analise_ia": "Perfil ativo com simbologia de facÃ§Ã£o na bio. "
                              "Recomenda-se monitoramento contÃ­nuo e extraÃ§Ã£o de contatos/seguidores.",
            },
            {
                "id": "o2", "tipo": "google_dork", "fonte": "Google Dork â€” Pastebin",
                "link": "https://pastebin.com/",
                "titulo": '"MÃ£o Branca" indexado no Pastebin',
                "resumo": 'Documento indexado contÃ©m o termo "MÃ£o Branca" associado a coordenadas e '
                          "horÃ¡rios de entrega. PossÃ­vel lista operacional vazada.",
                "risco": "ALTO",
                "timestamp": (now - timedelta(hours=4)).isoformat(),
                "lido": False,
                "alvo_id": 23, "alvo_nome": "Josias da Cruz Barroso",
                "alvo_vulgos": ["MÃ£o Branca", "MB"],
                "termo_encontrado": "mÃ£o branca",
                "dork": 'site:pastebin.com "MÃ£o Branca"',
                "analise_ia": "PossÃ­vel vazamento de dados operacionais. "
                              "Prioridade mÃ¡xima â€” acionar equipe de anÃ¡lise digital.",
            },
            {
                "id": "o3", "tipo": "sherlock", "fonte": "Sherlock â€” Instagram",
                "link": "https://www.instagram.com/",
                "titulo": "Perfil encontrado: @rdk_manaus no Instagram",
                "resumo": "Username 'RDK' identificado em perfil privado. Foto de capa com referÃªncias "
                          "Ã  zona norte de Manaus. 847 seguidores.",
                "risco": "MÃ‰DIO",
                "timestamp": (now - timedelta(hours=6)).isoformat(),
                "lido": False,
                "alvo_id": 28, "alvo_nome": "Gilson Mattos Rodrigues",
                "alvo_vulgos": ["RDK", "Rei do Skunk"],
                "termo_encontrado": "rdk", "plataforma": "Instagram",
                "analise_ia": None,
            },
        ]
        _salvar_alertas(_ALERTAS_OSINT_PATH, osint)


_seed_alertas_iniciais()


# â”€â”€â”€ Seed inicial de produÃ§Ã£o â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _seed_dashboard_inicial() -> None:
    if os.path.exists(_DASHBOARD_STATS_PATH):
        return
    import random as _r
    _r.seed(42)
    nucleos_docs = {
        "NI":            ["RELINT", "REPEN", "PEDIDO DE BUSCA", "MINUTA DE OFICIO", "PROJETO"],
        "NCI":           ["RELINT", "PEDIDO DE BUSCA", "RELTEC", "MINUTA DE OFICIO", "PROJETO"],
        "NBE":           ["RELINT", "RELTEC", "PROJETO"],
        "NUCADI_UPP":    ["RELATORIO INTERNO"],
        "NUCADI_COMPAJ": ["RELATORIO INTERNO"],
        "NUCADI_IPAT":   ["RELATORIO INTERNO"],
        "NUCADI_CDPM1":  ["RELATORIO INTERNO"],
        "NUCADI_CDPMII": ["RELATORIO INTERNO"],
        "NUCADI_CDF":    ["RELATORIO INTERNO"],
    }
    dados: dict = {}
    for nucleo, docs in nucleos_docs.items():
        dados[nucleo] = {}
        is_nucadi = nucleo.startswith("NUCADI")
        for m in range(12):
            dados[nucleo][str(m)] = {}
            for doc in docs:
                base = 8 if is_nucadi else 12
                dados[nucleo][str(m)][doc] = _r.randint(2, base + 1)
    os.makedirs(os.path.dirname(_DASHBOARD_STATS_PATH), exist_ok=True)
    with open(_DASHBOARD_STATS_PATH, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)


_seed_dashboard_inicial()


# â”€â”€â”€ App â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app = FastAPI(title="Agent Bastos API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_methods=["POST", "GET", "OPTIONS", "PATCH"],
    allow_headers=["Content-Type", "Authorization"],
)
# â”€â”€â”€ Health â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}

# â”€â”€â”€ Modelos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class PerguntaRequest(BaseModel):
    pergunta: str

    @field_validator("pergunta")
    @classmethod
    def validar_tamanho(cls, v: str) -> str:
        if len(v) > _MAX_PERGUNTA:
            raise ValueError(f"Pergunta excede {_MAX_PERGUNTA} caracteres.")
        return v


class RelatorioRequest(BaseModel):
    mes:   str
    ano:   int
    dados: dict


# â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _get_wav_duration(path: str) -> str:
    try:
        with wave.open(path, "r") as wf:
            secs = int(wf.getnframes() / wf.getframerate())
        return f"{secs // 60:02d}:{secs % 60:02d}:00"
    except Exception:
        return "00:00:00"


def _parse_llm_json(text: str) -> dict:
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        text = match.group(1).strip()
    else:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end != -1:
            text = text[start : end + 1]
    return json.loads(text)


def _date_str_pt(dt: datetime) -> str:
    return f"{dt.day} de {_MESES_PT[dt.month - 1]} de {dt.year}"


# â”€â”€â”€ Endpoints principais â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.get("/health")
def health():
    return {"status": "online", "agente": "BASTOS-UNIT"}


@app.post("/chat")
def chat(req: PerguntaRequest):
    if not req.pergunta.strip():
        return {"resposta": "Pergunta vazia recebida."}
    return {"resposta": conversar_com_bastos(req.pergunta)}


@app.post("/chat-rag")
def chat_rag(req: PerguntaRequest):
    if not req.pergunta.strip():
        return {"resposta": "Pergunta vazia recebida.", "fontes": [], "confianca": 0}
    return conversar_com_fontes(req.pergunta)


@app.post("/relatorio-dashboard")
def relatorio_dashboard(req: RelatorioRequest):
    prompt = (
        "Voce e o BASTOS-UNIT, analista de inteligencia institucional.\n"
        "Com base nos dados de producao documental da agencia abaixo, "
        "gere um RELATORIO ANALITICO EXECUTIVO completo e profissional.\n\n"
        f"MES DE REFERENCIA: {req.mes}/{req.ano}\n\n"
        f"DADOS DE PRODUCAO:\n{req.dados}\n\n"
        "Estruture o relatorio com:\n"
        "1. SUMARIO EXECUTIVO\n"
        "2. DESTAQUES POSITIVOS\n"
        "3. PONTOS DE ATENCAO\n"
        "4. ANALISE POR NUCLEO (NI, NCI, NBE)\n"
        "5. ANALISE DOS NUCADIs\n"
        "6. RECOMENDACOES ESTRATEGICAS (3-5 acoes)\n"
        "7. CONCLUSAO\n\n"
        "Use linguagem tecnica, direta e institucional."
    )
    try:
        completion = _groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=2048,
        )
        return {"analise": completion.choices[0].message.content}
    except Exception as e:
        return {"analise": f"FALHA: {e}"}


# â”€â”€â”€ NotÃ­cias â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.get("/noticias")
def noticias():
    json_path = os.path.join(PASTA_RELATORIOS, "noticias_crimes.json")
    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                dados = json.load(f)
            stat = os.stat(json_path)
            noticias_list = dados.get("noticias")
            if not noticias_list and "texto" in dados:
                noticias_list = json.loads(dados["texto"]).get("noticias")
            if noticias_list:
                arquivos = [
                    {
                        "titulo":    n.get("titulo", "Sem tÃ­tulo"),
                        "resumo":    n.get("resumo", ""),
                        "link":      n.get("link", ""),
                        "imagem":    n.get("imagem", ""),
                        "data_pub":  n.get("data", ""),
                        "categoria": n.get("categoria", "CRIMES"),
                        "conteudo":  n.get("resumo", ""),
                        "arquivo":   "noticias_crimes.json",
                        "atualizado": stat.st_mtime,
                        "formato":   "estruturado",
                    }
                    for n in noticias_list
                ]
                return {"noticias": arquivos}
        except Exception:
            pass

    arquivos = []
    for caminho in glob.glob(os.path.join(PASTA_RELATORIOS, "*.txt")):
        nome = os.path.basename(caminho)
        try:
            with open(caminho, "r", encoding="utf-8") as f:
                conteudo = f.read()
        except Exception:
            continue
        stat   = os.stat(caminho)
        titulo = (
            "Monitor Crimes AM"
            if nome == "relatorio.txt"
            else nome.replace(".txt", "").replace("_", " ").title()
        )
        arquivos.append({
            "titulo":    titulo,
            "resumo":    conteudo[:200],
            "link":      "",
            "imagem":    "",
            "data_pub":  "",
            "categoria": "CRIMES",
            "conteudo":  conteudo,
            "arquivo":   nome,
            "atualizado": stat.st_mtime,
            "formato":   "texto",
        })

    arquivos.sort(key=lambda x: x["atualizado"], reverse=True)
    return {"noticias": arquivos}


@app.post("/noticias/salvar")
async def salvar_noticias(dados: dict):
    caminho = os.path.join(PASTA_RELATORIOS, "noticias_crimes.json")
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
    return {"status": "salvo", "total": len(dados.get("noticias", []))}


# â”€â”€â”€ TranscriÃ§Ã£o de Ã¡udio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    filename = audio.filename or "audio.wav"
    suffix   = os.path.splitext(filename)[1].lower()

    if suffix not in _AUDIO_EXTS:
        raise HTTPException(
            status_code=415,
            detail=f"Formato nÃ£o suportado: '{suffix}'. Use: {', '.join(sorted(_AUDIO_EXTS))}",
        )

    audio_bytes = await audio.read()
    if len(audio_bytes) > _MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Arquivo excede o limite de 25 MB.")
    if len(audio_bytes) == 0:
        raise HTTPException(status_code=400, detail="Arquivo de Ã¡udio vazio.")

    now          = datetime.now()
    laudo_number = now.strftime("%m%d/%Y")
    date_str     = _date_str_pt(now)
    raw_text     = ""
    duration_str = "00:00:00"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        if suffix == ".wav":
            duration_str = _get_wav_duration(tmp_path)

        with open(tmp_path, "rb") as f:
            transcription = _groq.audio.transcriptions.create(
                file=(filename, f),
                model="whisper-large-v3-turbo",
                language="pt",
                response_format="verbose_json",
                prompt="Ãudio operacional SEAP/AM. Terminologia policial e penitenciÃ¡ria brasileira.",
            )

        raw_text         = transcription.text
        whisper_segments = getattr(transcription, "segments", []) or []
        whisper_duration = getattr(transcription, "duration", None)

        if whisper_duration:
            secs         = int(whisper_duration)
            duration_str = f"{secs // 60:02d}:{secs % 60:02d}:00"

        if whisper_segments:
            lines = []
            for seg in whisper_segments:
                start = seg.get("start", 0) if isinstance(seg, dict) else getattr(seg, "start", 0)
                text  = seg.get("text",  "") if isinstance(seg, dict) else getattr(seg, "text",  "")
                ts    = f"{int(start) // 60:02d}:{int(start) % 60:02d}:{int((start % 1) * 100):02d}"
                lines.append(f"[{ts}] {text.strip()}")
            segments_text = "\n".join(lines)
        else:
            segments_text = raw_text

        analysis_prompt = (
            "VocÃª Ã© BASTOS-UNIT, analista de inteligÃªncia penitenciÃ¡ria da SEAP/AM.\n\n"
            "Analise a transcriÃ§Ã£o abaixo e retorne SOMENTE o JSON (sem markdown):\n\n"
            f"TRANSCRIÃ‡ÃƒO:\n{segments_text}\n\n"
            "{\n"
            f'  "laudo_number": "{laudo_number}",\n'
            f'  "date": "{date_str}",\n'
            f'  "filename": "{filename}",\n'
            f'  "duration": "{duration_str}",\n'
            '  "speakers": [{"id":"M1","label":"Voz masculina","role":"Interlocutor A"}],\n'
            '  "segments": [{"ts":"00:00:00","speaker":"M1","text":"..."}],\n'
            '  "risk_level": "ALTO",\n'
            '  "classification": "...",\n'
            '  "summary": "...",\n'
            '  "red_flags": [{"id":1,"title":"...","text":"..."}]\n'
            "}\n\n"
            "Regras: speakers mÃ¡x 4 (M1,M2,F1,F2); risk_level=ALTO/MÃ‰DIO/BAIXO; "
            "red_flags pode ser []; retorne APENAS o JSON."
        )

        completion = _groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": analysis_prompt}],
            temperature=0.1,
            max_tokens=3000,
        )

        return _parse_llm_json(completion.choices[0].message.content)

    except json.JSONDecodeError:
        return {
            "laudo_number": laudo_number,
            "date":         date_str,
            "filename":     filename,
            "duration":     duration_str,
            "speakers":     [{"id": "M1", "label": "Voz detectada", "role": "Interlocutor"}],
            "segments":     [{"ts": "00:00:00", "speaker": "M1", "text": raw_text}],
            "risk_level":   "MÃ‰DIO",
            "classification": "TranscriÃ§Ã£o de Ã¡udio operacional",
            "summary":      raw_text[:300] if raw_text else "Sem conteÃºdo identificado.",
            "red_flags":    [],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


# â”€â”€â”€ ExportaÃ§Ã£o de laudos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _build_txt(t: dict) -> bytes:
    sep  = "=" * 60
    dash = "-" * 60
    lines = [
        sep, "SEAP/AM - AGENCIA DE INTELIGENCIA PENITENCIARIA",
        "LAUDO DE ANALISE FONOGRAFICA", sep,
        f"No: {t.get('laudo_number','N/A')}",
        f"Data: {t.get('date','N/A')}",
        f"Arquivo: {t.get('filename','N/A')}",
        f"Duracao: {t.get('duration','N/A')}",
        f"Nivel de Risco: {t.get('risk_level','N/A')}",
        f"Classificacao: {t.get('classification','N/A')}",
        dash, "INTERLOCUTORES:",
    ]
    for sp in t.get("speakers", []):
        lines.append(f"  {sp.get('id')} - {sp.get('label')} / {sp.get('role')}")
    lines += [dash, "TRANSCRICAO SEGMENTADA:"]
    for seg in t.get("segments", []):
        lines.append(f"[{seg.get('ts')}] {seg.get('speaker')}: {seg.get('text')}")
    lines += [dash, "RESUMO ANALITICO:", t.get("summary", "")]
    flags = t.get("red_flags", [])
    if flags:
        lines += [dash, "ALERTAS IDENTIFICADOS:"]
        for fl in flags:
            lines.append(f"  [{fl.get('id')}] {fl.get('title')}: {fl.get('text')}")
    lines += [sep, "Gerado pelo Agent Bastos - BASTOS-UNIT", sep]
    return "\n".join(lines).encode("utf-8")


def _build_pdf(t: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib.enums import TA_CENTER
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
    )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=2*cm, bottomMargin=2*cm,
        leftMargin=2.5*cm, rightMargin=2.5*cm,
    )
    styles = getSampleStyleSheet()
    S = {
        "title": ParagraphStyle("T", parent=styles["Heading1"],
                                fontSize=13, alignment=TA_CENTER, spaceAfter=2),
        "sub":   ParagraphStyle("S", parent=styles["Normal"],
                                fontSize=9, alignment=TA_CENTER, spaceAfter=10,
                                textColor=colors.grey),
        "head":  ParagraphStyle("H", parent=styles["Heading2"],
                                fontSize=10, spaceBefore=10, spaceAfter=4,
                                textColor=colors.HexColor("#1E3A5F")),
        "body":  ParagraphStyle("B", parent=styles["Normal"], fontSize=9, leading=14),
        "mono":  ParagraphStyle("M", parent=styles["Normal"], fontSize=9, leading=13,
                                leftIndent=10, fontName="Courier"),
        "flag":  ParagraphStyle("F", parent=styles["Normal"], fontSize=9,
                                leftIndent=12, textColor=colors.HexColor("#DC2626")),
    }
    risk     = t.get("risk_level", "MÃ‰DIO")
    risk_hex = {"ALTO": "#DC2626", "MÃ‰DIO": "#D97706", "BAIXO": "#16A34A"}.get(risk, "#D97706")
    nav      = colors.HexColor("#1E3A5F")

    elements = [
        Paragraph("SEAP/AM â€” AGÃŠNCIA DE INTELIGÃŠNCIA PENITENCIÃRIA", S["title"]),
        Paragraph("LAUDO DE ANÃLISE FONOGRÃFICA â€” CONFIDENCIAL", S["sub"]),
        HRFlowable(width="100%", thickness=1, color=nav), Spacer(1, 8),
    ]
    meta = [
        ["NÂº do Laudo:", t.get("laudo_number","N/A"), "Data:",    t.get("date","N/A")],
        ["Arquivo:",     t.get("filename","N/A"),     "DuraÃ§Ã£o:", t.get("duration","N/A")],
        ["ClassificaÃ§Ã£o:", t.get("classification","N/A"), "Risco:",
         Paragraph(f'<font color="{risk_hex}"><b>{risk}</b></font>', S["body"])],
    ]
    mt = Table(meta, colWidths=[3.5*cm, 7*cm, 2.5*cm, 4*cm])
    mt.setStyle(TableStyle([
        ("FONTSIZE",      (0,0), (-1,-1), 9),
        ("FONTNAME",      (0,0), (0,-1),  "Helvetica-Bold"),
        ("FONTNAME",      (2,0), (2,-1),  "Helvetica-Bold"),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING",    (0,0), (-1,-1), 3),
    ]))
    elements += [mt, Spacer(1, 10), HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey)]

    elements.append(Paragraph("INTERLOCUTORES", S["head"]))
    for sp in t.get("speakers", []):
        elements.append(Paragraph(f"<b>{sp.get('id')}</b> â€” {sp.get('label')} / {sp.get('role')}", S["body"]))

    elements.append(Paragraph("TRANSCRIÃ‡ÃƒO SEGMENTADA", S["head"]))
    for seg in t.get("segments", []):
        elements.append(Paragraph(
            f"<b>[{seg.get('ts')}] {seg.get('speaker')}:</b> {seg.get('text')}", S["mono"]))

    elements.append(Paragraph("RESUMO ANALÃTICO", S["head"]))
    elements.append(Paragraph(t.get("summary", ""), S["body"]))

    flags = t.get("red_flags", [])
    if flags:
        elements.append(Paragraph("ALERTAS IDENTIFICADOS", S["head"]))
        for fl in flags:
            elements.append(Paragraph(
                f"<b>[{fl.get('id')}] {fl.get('title')}:</b> {fl.get('text')}", S["flag"]))

    elements += [
        Spacer(1, 16), HRFlowable(width="100%", thickness=1, color=nav),
        Paragraph("Documento gerado pelo sistema Agent Bastos â€” BASTOS-UNIT", S["sub"]),
    ]
    doc.build(elements)
    buf.seek(0)
    return buf.read()


def _build_docx(t: dict) -> bytes:
    from docx import Document as DocxDocument
    from docx.shared import Pt, RGBColor, Cm
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    RISK_RGB = {
        "ALTO":  RGBColor(0xDC, 0x26, 0x26),
        "MÃ‰DIO": RGBColor(0xD9, 0x77, 0x06),
        "BAIXO": RGBColor(0x16, 0xA3, 0x4A),
    }
    risk     = t.get("risk_level", "MÃ‰DIO")
    risk_rgb = RISK_RGB.get(risk, RISK_RGB["MÃ‰DIO"])
    grey     = RGBColor(0x6B, 0x72, 0x80)
    red      = RGBColor(0xDC, 0x26, 0x26)

    doc = DocxDocument()
    for section in doc.sections:
        section.top_margin    = Cm(2)
        section.bottom_margin = Cm(2)
        section.left_margin   = Cm(2.5)
        section.right_margin  = Cm(2.5)

    h = doc.add_heading("SEAP/AM â€” AGÃŠNCIA DE INTELIGÃŠNCIA PENITENCIÃRIA", 0)
    h.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub = doc.add_paragraph("LAUDO DE ANÃLISE FONOGRÃFICA â€” CONFIDENCIAL")
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub.runs[0].font.color.rgb = grey
    sub.runs[0].font.size      = Pt(10)
    doc.add_paragraph()

    table = doc.add_table(rows=3, cols=4)
    table.style = "Table Grid"
    for i, (k1, v1, k2, v2) in enumerate([
        ("NÂº do Laudo", t.get("laudo_number","N/A"), "Data",        t.get("date","N/A")),
        ("Arquivo",     t.get("filename","N/A"),      "DuraÃ§Ã£o",     t.get("duration","N/A")),
        ("ClassificaÃ§Ã£o", t.get("classification","N/A"), "Risco",   risk),
    ]):
        row = table.rows[i]
        for j, (txt, bold) in enumerate([(k1,True),(v1,False),(k2,True),(v2,False)]):
            cell = row.cells[j]
            cell.text  = txt
            run        = cell.paragraphs[0].runs[0]
            run.bold   = bold
            run.font.size = Pt(9)
            if i == 2 and j == 3:
                run.font.color.rgb = risk_rgb
    doc.add_paragraph()

    doc.add_heading("INTERLOCUTORES", 2)
    for sp in t.get("speakers", []):
        p = doc.add_paragraph(style="List Bullet")
        p.add_run(sp.get("id","") + " â€” ").bold = True
        p.add_run(f"{sp.get('label','')} / {sp.get('role','')}")

    doc.add_heading("TRANSCRIÃ‡ÃƒO SEGMENTADA", 2)
    for seg in t.get("segments", []):
        p  = doc.add_paragraph()
        r1 = p.add_run(f"[{seg.get('ts','')}] {seg.get('speaker','')}: ")
        r1.bold = True; r1.font.name = "Courier New"; r1.font.size = Pt(9)
        r2 = p.add_run(seg.get("text",""))
        r2.font.name = "Courier New"; r2.font.size = Pt(9)

    doc.add_heading("RESUMO ANALÃTICO", 2)
    doc.add_paragraph(t.get("summary",""))

    flags = t.get("red_flags", [])
    if flags:
        doc.add_heading("ALERTAS IDENTIFICADOS", 2)
        for fl in flags:
            p = doc.add_paragraph(style="List Number")
            r = p.add_run(f"{fl.get('title','')}: ")
            r.bold = True; r.font.color.rgb = red
            p.add_run(fl.get("text",""))

    doc.add_paragraph()
    footer = doc.add_paragraph("Documento gerado pelo sistema Agent Bastos â€” BASTOS-UNIT")
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer.runs[0].font.color.rgb = grey
    footer.runs[0].font.size      = Pt(9)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.read()


@app.post("/export/{fmt}")
async def export_transcript(fmt: str, body: dict):
    if fmt not in _EXPORT_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Formato '{fmt}' nÃ£o suportado. Use: {', '.join(_EXPORT_MIME)}",
        )
    transcript   = body.get("transcript", {})
    laudo_num    = transcript.get("laudo_number", "laudo").replace("/", "-")
    out_filename = f"laudo_{laudo_num}.{fmt}"
    try:
        if fmt == "txt":
            content = _build_txt(transcript)
        elif fmt == "pdf":
            content = _build_pdf(transcript)
        else:
            content = _build_docx(transcript)
        return Response(
            content=content,
            media_type=_EXPORT_MIME[fmt],
            headers={"Content-Disposition": f'attachment; filename="{out_filename}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha ao gerar {fmt.upper()}: {e}")


# â”€â”€â”€ Agenda de MissÃ£o â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import hashlib as _hashlib
_SENHA_CHEFE_HASH = _hashlib.sha256(b"aipen2025").hexdigest()


class AgendaLoginRequest(BaseModel):
    senha: str


class MissaoRequest(BaseModel):
    nucleo: str
    mensagem: str


@app.post("/agenda/login")
def agenda_login(req: AgendaLoginRequest):
    ok = _hashlib.sha256(req.senha.encode()).hexdigest() == _SENHA_CHEFE_HASH
    return {"ok": ok}


@app.post("/agenda/publicar")
def agenda_publicar(req: MissaoRequest):
    try:
        from modules.agenda import publicar_missao
        ok = publicar_missao(req.nucleo, req.mensagem)
        return {"ok": ok}
    except Exception as e:
        return {"ok": False, "erro": str(e)}


@app.get("/agenda/missoes")
def agenda_missoes(nucleo: str = None, limite: int = 30):
    try:
        from modules.agenda import buscar_missoes_recentes
        missoes = buscar_missoes_recentes(nucleo=nucleo, limite=limite)
        resultado = []
        for m in missoes:
            ts = m.get("timestamp")
            resultado.append({
                **m,
                "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else str(ts) if ts else None,
            })
        return {"missoes": resultado}
    except Exception as e:
        return {"missoes": [], "erro": str(e)}
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# ADICIONAR NO api.py â€” logo apÃ³s o endpoint GET /agenda/missoes
# Cole o bloco abaixo no arquivo api.py existente
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class CienciaRequest(BaseModel):
    nucleo: str   # nÃºcleo que estÃ¡ acusando ciÃªncia


@app.patch("/agenda/missoes/{missao_id}/ciencia")
def agenda_acusar_ciencia(missao_id: str, req: CienciaRequest):
    """
    Agente acusa ciÃªncia de uma missÃ£o.
    Atualiza status â†’ 'ciencia' no Firestore.
    O chefe vÃª o status atualizado na prÃ³xima busca.
    """
    try:
        from modules.agenda import acusar_ciencia
        ok = acusar_ciencia(missao_id, req.nucleo)
        return {"ok": ok}
    except Exception as e:
        return {"ok": False, "erro": str(e)}

@app.get("/status")
def status():
    return {"status": "online", "version": "1.0.0", "model": "llama-3.3-70b-versatile"}


@app.get("/status/firebase")
def status_firebase():
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore as _firestore
        if not firebase_admin._apps:
            cred = credentials.Certificate(_SA_KEY_PATH)
            firebase_admin.initialize_app(cred)
        db = _firestore.client()
        db.collection("missoes").limit(1).get()
        projeto = firebase_admin.get_app().project_id
        return {"ok": True, "projeto": projeto}
    except Exception as e:
        return {"ok": False, "projeto": str(e)}


# â”€â”€â”€ Firestore helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _get_firestore():
    import firebase_admin
    from firebase_admin import credentials, firestore as _firestore
    if not firebase_admin._apps:
        cred = credentials.Certificate(_SA_KEY_PATH)
        firebase_admin.initialize_app(cred)
    return _firestore.client()


def _serializar_alerta(doc) -> dict:
    d = doc.to_dict()
    d["id"] = doc.id
    ts = d.get("timestamp")
    if ts and hasattr(ts, "isoformat"):
        d["timestamp"] = ts.isoformat()
    elif ts:
        d["timestamp"] = str(ts)
    return d


# â”€â”€â”€ Alertas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.get("/alertas")
def listar_alertas(limite: int = 50):
    try:
        db   = _get_firestore()
        docs = (
            db.collection("alertas")
            .where("categoria", "==", "realtime")
            .order_by("timestamp", direction="DESCENDING")
            .limit(limite)
            .stream()
        )
        return [_serializar_alerta(d) for d in docs]
    except Exception:
        return _ler_alertas(_ALERTAS_PATH)


@app.get("/alertas/osint")
def listar_alertas_osint(limite: int = 50):
    try:
        db   = _get_firestore()
        docs = (
            db.collection("alertas")
            .where("categoria", "==", "osint")
            .order_by("timestamp", direction="DESCENDING")
            .limit(limite)
            .stream()
        )
        return [_serializar_alerta(d) for d in docs]
    except Exception:
        return _ler_alertas(_ALERTAS_OSINT_PATH)


@app.post("/alertas/salvar")
async def salvar_alerta(alerta: dict):
    alertas = _ler_alertas(_ALERTAS_PATH)
    ids = {a.get("id") for a in alertas}
    if alerta.get("id") not in ids:
        alertas.insert(0, alerta)
    _salvar_alertas(_ALERTAS_PATH, alertas)
    return {"status": "salvo", "total": len(alertas)}


@app.post("/alertas/osint/salvar")
async def salvar_alerta_osint(alerta: dict):
    alertas = _ler_alertas(_ALERTAS_OSINT_PATH)
    ids = {a.get("id") for a in alertas}
    if alerta.get("id") not in ids:
        alertas.insert(0, alerta)
    _salvar_alertas(_ALERTAS_OSINT_PATH, alertas)
    return {"status": "salvo", "total": len(alertas)}


@app.patch("/alertas/{alerta_id}/lido")
def marcar_alerta_lido(alerta_id: str):
    try:
        db = _get_firestore()
        db.collection("alertas").document(alerta_id).update({"lido": True})
        return {"ok": True}
    except Exception:
        for caminho in (_ALERTAS_PATH, _ALERTAS_OSINT_PATH):
            alertas = _ler_alertas(caminho)
            for a in alertas:
                if a.get("id") == alerta_id:
                    a["lido"] = True
            _salvar_alertas(caminho, alertas)
        return {"ok": True, "id": alerta_id}


@app.patch("/alertas/marcar-todos-lidos")
def marcar_todos_lidos():
    try:
        db       = _get_firestore()
        nao_lidos = db.collection("alertas").where("lido", "==", False).stream()
        batch    = db.batch()
        for doc in nao_lidos:
            batch.update(doc.reference, {"lido": True})
        batch.commit()
        return {"ok": True}
    except Exception:
        for caminho in (_ALERTAS_PATH, _ALERTAS_OSINT_PATH):
            alertas = _ler_alertas(caminho)
            for a in alertas:
                a["lido"] = True
            _salvar_alertas(caminho, alertas)
        return {"ok": True}


@app.post("/alertas/varrer")
def varrer_alertas_realtime():
    from modules.monitor import varrer_realtime
    return varrer_realtime()


@app.post("/alertas/osint/varrer")
def varrer_alertas_osint():
    from modules.monitor import varrer_osint
    return varrer_osint()


# â”€â”€â”€ Dashboard stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.get("/dashboard/stats")
def get_dashboard_stats():
    if not os.path.exists(_DASHBOARD_STATS_PATH):
        _seed_dashboard_inicial()
    try:
        with open(_DASHBOARD_STATS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


@app.post("/dashboard/stats")
async def salvar_dashboard_stats(dados: dict):
    os.makedirs(os.path.dirname(_DASHBOARD_STATS_PATH), exist_ok=True)
    with open(_DASHBOARD_STATS_PATH, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
    return {"status": "salvo"}


# â”€â”€â”€ ReferÃªncias â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.get("/referencias")
def buscar_referencias(q: str = "", ano: str = "", tipo: str = ""):
    if not os.path.exists(_INDICE_PATH):
        return {"documentos": [], "anos": [], "total": 0, "total_indexados": 0}
    try:
        with open(_INDICE_PATH, "r", encoding="utf-8") as f:
            indice = json.load(f)
    except Exception:
        return {"documentos": [], "anos": [], "total": 0, "total_indexados": 0}

    docs  = indice.get("documentos", [])
    anos  = sorted({d.get("ano", "") for d in docs if d.get("ano")}, reverse=True)
    termo = q.strip().upper()

    resultado = []
    for doc in docs:
        if ano  and doc.get("ano")  != ano:  continue
        if tipo and doc.get("tipo") != tipo:  continue
        if termo:
            assunto = (doc.get("assunto") or "").upper()
            numero  = doc.get("numero", "")
            if termo not in assunto and termo not in numero:
                continue
        resultado.append(doc)

    resultado.sort(key=lambda d: (d.get("ano", ""), d.get("numero", "")), reverse=True)
    return {
        "documentos":      resultado,
        "anos":            anos,
        "total":           len(resultado),
        "total_indexados": len(docs),
    }


# â”€â”€â”€ Lista Negra (Google Drive) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

from googleapiclient.discovery import build as _gdrive_build
from googleapiclient.http import MediaIoBaseDownload as _MediaIoBaseDownload
from google.oauth2 import service_account as _sa
import openpyxl as _openpyxl


def _mascarar_cpf(cpf: str) -> str:
    """753.164.392-87 â†’ 753.***.***-**"""
    if not cpf:
        return ""
    limpo = re.sub(r"\D", "", str(cpf))
    if len(limpo) < 3:
        return "***.***.***-**"
    return f"{limpo[:3]}.***.***-**"


def _baixar_xlsx_drive() -> bytes:
    """Baixa .xlsx real do Google Drive via Service Account."""
    creds   = _sa.Credentials.from_service_account_file(_SA_KEY_PATH, scopes=_GDRIVE_SCOPES)
    service = _gdrive_build("drive", "v3", credentials=creds)
    request = service.files().get_media(fileId=_LISTA_NEGRA_FILE_ID)
    buf     = io.BytesIO()
    dl      = _MediaIoBaseDownload(buf, request)
    done    = False
    while not done:
        _, done = dl.next_chunk()
    buf.seek(0)
    return buf.read()


def _ler_lista_negra() -> list:
    """LÃª todas as abas do .xlsx e retorna lista unificada ordenada A-Z por nome."""
    xlsx_bytes = _baixar_xlsx_drive()
    wb         = _openpyxl.load_workbook(io.BytesIO(xlsx_bytes), data_only=True)
    registros  = []

    for sheet_name in wb.sheetnames:
        ws   = wb[sheet_name]
        rows = list(ws.iter_rows(values_only=True))
        if len(rows) < 2:
            continue

        # Detecta linha do cabeÃ§alho (procura "NOME" nas primeiras 5 linhas)
        header_idx = 0
        for i, row in enumerate(rows[:5]):
            vals = [str(v).upper() for v in row if v]
            if "NOME" in vals:
                header_idx = i
                break

        headers = [str(v).strip().upper() if v else "" for v in rows[header_idx]]

        col_map = {}
        for i, h in enumerate(headers):
            if "NOME" in h:                               col_map["nome"]       = i
            elif h in ("N", "NÂ°", "NÂº") or "NUM" in h:   col_map["numero"]     = i
            elif "REFER" in h:                            col_map["referencia"] = i
            elif "SITUA" in h:                            col_map["situacao"]   = i
            elif "UNID" in h:                             col_map["unidade"]    = i
            elif "EMPRES" in h:                           col_map["empresa"]    = i
            elif "DATA" in h:                             col_map["data"]       = i
            elif "CPF" in h:                              col_map["cpf"]        = i
            elif "DESC" in h or "OBS" in h:               col_map["descricao"]  = i

        if "nome" not in col_map:
            continue

        for row in rows[header_idx + 1:]:
            nome = row[col_map["nome"]] if col_map.get("nome") is not None else None
            if not nome or str(nome).strip() == "":
                continue

            def _get(key, _row=row, _col=col_map):
                idx = _col.get(key)
                if idx is None or idx >= len(_row):
                    return ""
                val = _row[idx]
                if val is None:
                    return ""
                if hasattr(val, "strftime"):
                    return val.strftime("%d/%m/%Y")
                return str(val).strip()

            registros.append({
                "numero":     _get("numero"),
                "nome":       str(nome).strip().upper(),
                "referencia": _get("referencia"),
                "situacao":   _get("situacao").upper(),
                "unidade":    _get("unidade"),
                "empresa":    _get("empresa"),
                "data":       _get("data"),
                "cpf":        _mascarar_cpf(_get("cpf")),
                "descricao":  _get("descricao"),
                "ano":        sheet_name,
            })

    registros.sort(key=lambda x: x["nome"])
    return registros


@app.get("/lista-negra")
def lista_negra():
    """
    Retorna lista de servidores da planilha Caveirinha (Google Drive).
    CPF mascarado â€” apenas os 3 primeiros dÃ­gitos visÃ­veis. LGPD compliant.
    """
    try:
        registros = _ler_lista_negra()
        return {"total": len(registros), "registros": registros}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao acessar planilha: {e}")


# â”€â”€â”€ Entry point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€



# --- Download DOCX por file_id (Google Drive) ---
@app.get("/referencias/download/docx/{file_id}")
def download_referencia_docx(file_id: str):
    import io as _io
    from googleapiclient.discovery import build as _gdrive_build
    from googleapiclient.http import MediaIoBaseDownload as _MediaDL
    from google.oauth2 import service_account as _sa2
    from fastapi.responses import StreamingResponse
    try:
        creds = _sa2.Credentials.from_service_account_file(
            _SA_KEY_PATH, scopes=["https://www.googleapis.com/auth/drive.readonly"])
        service = _gdrive_build("drive", "v3", credentials=creds)
        request = service.files().get_media(fileId=file_id)
        buf = _io.BytesIO()
        dl = _MediaDL(buf, request)
        done = False
        while not done:
            _, done = dl.next_chunk()
        buf.seek(0)
        # Busca nome real no indice
        import json as _json
        nome = file_id
        try:
            with open(_INDICE_PATH, encoding='utf-8') as _f:
                _idx = _json.load(_f)
            _doc = next((d for d in _idx['documentos'] if d.get('file_id') == file_id), None)
            if _doc:
                tipo = _doc.get('tipo', '')
                num = _doc.get('numero', '')
                ano = _doc.get('ano', '')
                fmt = _doc.get('formato', 'docx')
                nome = f"{tipo}_{num}_{ano}.{fmt}"
        except Exception:
            pass
        mt = "application/vnd.openxmlformats-officedocument.wordprocessingml.document" if nome.endswith('docx') else "application/pdf"
        return StreamingResponse(buf, media_type=mt,
            headers={"Content-Disposition": f"attachment; filename={nome}"})
    except Exception as e:
        return {"erro": str(e)}

# --- Download PDF por file_id (Google Drive - converte via API) ---
@app.get("/referencias/download/pdf/{file_id}")
def download_referencia_pdf(file_id: str):
    import io as _io
    from googleapiclient.discovery import build as _gdrive_build
    from googleapiclient.http import MediaIoBaseDownload as _MediaDL
    from google.oauth2 import service_account as _sa2
    from fastapi.responses import StreamingResponse
    try:
        creds = _sa2.Credentials.from_service_account_file(
            _SA_KEY_PATH, scopes=["https://www.googleapis.com/auth/drive"])
        service = _gdrive_build("drive", "v3", credentials=creds)
        # Importa o arquivo como Google Doc
        meta = {"name": file_id, "mimeType": "application/vnd.google-apps.document"}
        media_body = service.files().get_media(fileId=file_id)
        buf_orig = _io.BytesIO()
        dl = _MediaDL(buf_orig, media_body)
        done = False
        while not done:
            _, done = dl.next_chunk()
        buf_orig.seek(0)
        from googleapiclient.http import MediaIoBaseUpload
        uploaded = service.files().create(
            body=meta,
            media_body=MediaIoBaseUpload(buf_orig,
                mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            fields="id"
        ).execute()
        temp_id = uploaded["id"]
        # Exporta como PDF
        pdf_request = service.files().export_media(fileId=temp_id, mimeType="application/pdf")
        pdf_buf = _io.BytesIO()
        dl2 = _MediaDL(pdf_buf, pdf_request)
        done2 = False
        while not done2:
            _, done2 = dl2.next_chunk()
        # Remove arquivo temporario
        service.files().delete(fileId=temp_id).execute()
        pdf_buf.seek(0)
        return StreamingResponse(pdf_buf, media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={file_id}.pdf"})
    except Exception as e:
        return {"erro": str(e)}
_IMG_MIME_MAP = {
    "image/jpeg": ".jpg",
    "image/png":  ".png",
    "image/webp": ".webp",
    "image/gif":  ".gif",
}

@app.post("/decifrar")
async def decifrar_missiva(
    imagem: UploadFile = File(...),
    tipo_documento: str = Form("desconhecido"),
    contexto_extra: str = Form(""),
):
    if imagem.content_type not in _IMG_MIME_MAP:
        raise HTTPException(status_code=415, detail=f"Formato nÃ£o suportado: {imagem.content_type}")
    dados = await imagem.read()
    if len(dados) > _MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Imagem excede o limite de 25MB.")
    try:
        tipo_enum = TipoDocumento(tipo_documento.lower())
    except ValueError:
        tipo_enum = TipoDocumento.DESCONHECIDO
    return transcrever_documento_bytes(
        dados=dados,
        media_type=imagem.content_type,
        nome_arquivo=imagem.filename or "documento",
        tipo_documento=tipo_enum,
        contexto_extra=contexto_extra,
    )
from modules.dashboard_routes import registrar_rotas_dashboard
registrar_rotas_dashboard(app)

if __name__ == "__main__":
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="info",
        access_log=True,
    )


# --- Controle de Grupos (Google Drive) ---
_OCUPACAO_FILE_ID = "1sX2vCfneb1_5Rq1WP7IYfQzsorWh5DvS"

def _baixar_ocupacao_drive():
    import io
    from googleapiclient.http import MediaIoBaseDownload
    creds   = _sa.Credentials.from_service_account_file(_SA_KEY_PATH, scopes=_GDRIVE_SCOPES)
    service = _gdrive_build("drive", "v3", credentials=creds)
    request = service.files().get_media(fileId=_OCUPACAO_FILE_ID)
    buffer  = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    buffer.seek(0)
    return json.loads(buffer.read().decode("utf-8"))

@app.get("/ocupacao")
def get_ocupacao():
    try:
        return _baixar_ocupacao_drive()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Inteligência de Grupos — Snapshots e KPIs ---
_HISTORICO_FOLDER_ID = "1-hQE2t9P7Kpk31V5oKCUoylM03nCNhT_"

def _gdrive_service():
    creds = _sa.Credentials.from_service_account_file(_SA_KEY_PATH, scopes=["https://www.googleapis.com/auth/drive"])
    return _gdrive_build("drive", "v3", credentials=creds)

def _upload_json_drive(nome_arquivo: str, dados: dict, folder_id: str):
    import io
    from googleapiclient.http import MediaIoBaseUpload
    service = _gdrive_service()
    results = service.files().list(
        q=f"name='{nome_arquivo}' and '{folder_id}' in parents and trashed=false",
        fields="files(id)"
    ).execute()
    conteudo = json.dumps(dados, ensure_ascii=False, indent=2).encode("utf-8")
    media = MediaIoBaseUpload(io.BytesIO(conteudo), mimetype="application/json")
    if results["files"]:
        service.files().update(fileId=results["files"][0]["id"], media_body=media).execute()
    else:
        service.files().create(
            body={"name": nome_arquivo, "parents": [folder_id]},
            media_body=media
        ).execute()

def _baixar_json_drive(nome_arquivo: str, folder_id: str) -> dict:
    import io
    from googleapiclient.http import MediaIoBaseDownload
    service = _gdrive_service()
    results = service.files().list(
        q=f"name='{nome_arquivo}' and '{folder_id}' in parents and trashed=false",
        fields="files(id)"
    ).execute()
    if not results["files"]:
        return None
    buffer = io.BytesIO()
    request = service.files().get_media(fileId=results["files"][0]["id"])
    downloader = MediaIoBaseDownload(buffer, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    buffer.seek(0)
    return json.loads(buffer.read().decode("utf-8"))

def _salvar_snapshot_automatico():
    mes_atual = datetime.now().strftime("%Y-%m")
    nome = f"snapshot_{mes_atual}.json"
    existente = _baixar_json_drive(nome, _HISTORICO_FOLDER_ID)
    if existente:
        return False
    try:
        ocupacao = _baixar_ocupacao_drive()
        snapshot = {"mes": mes_atual, "gerado_em": datetime.now().isoformat(), "dados": ocupacao}
        _upload_json_drive(nome, snapshot, _HISTORICO_FOLDER_ID)
        indice = _baixar_json_drive("indice.json", _HISTORICO_FOLDER_ID) or {"meses": []}
        if mes_atual not in indice["meses"]:
            indice["meses"].append(mes_atual)
            indice["meses"].sort()
        _upload_json_drive("indice.json", indice, _HISTORICO_FOLDER_ID)
        return True
    except Exception:
        return False

@app.get("/historico/indice")
def get_indice():
    try:
        indice = _baixar_json_drive("indice.json", _HISTORICO_FOLDER_ID)
        return indice or {"meses": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/historico/{mes}")
def get_historico_mes(mes: str):
    try:
        snap = _baixar_json_drive(f"snapshot_{mes}.json", _HISTORICO_FOLDER_ID)
        if not snap:
            raise HTTPException(status_code=404, detail=f"Snapshot {mes} nao encontrado")
        return snap
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/kpis")
def get_kpis():
    try:
        indice = _baixar_json_drive("indice.json", _HISTORICO_FOLDER_ID) or {"meses": []}
        meses = sorted(indice.get("meses", []))
        historico = []
        for mes in meses[-6:]:
            snap = _baixar_json_drive(f"snapshot_{mes}.json", _HISTORICO_FOLDER_ID)
            if snap:
                historico.append({"mes": mes, "dados": snap.get("dados", {})})
        series = {}
        for h in historico:
            mes = h["mes"]
            contagem = {}
            for u_dados in h["dados"].get("unidades", {}).values():
                for p in (u_dados.get("pavilhoes") or u_dados.get("pavs") or {}).values():
                    g = p.get("grupo") or p.get("g", "")
                    contagem[g] = contagem.get(g, 0) + 1
            series[mes] = contagem
        alertas = []
        meses_list = sorted(series.keys())
        if len(meses_list) >= 2:
            atual = series[meses_list[-1]]
            anterior = series[meses_list[-2]]
            for grupo, qtd in atual.items():
                qtd_ant = anterior.get(grupo, 0)
                if qtd_ant > 0:
                    variacao = ((qtd - qtd_ant) / qtd_ant) * 100
                    if abs(variacao) >= 20:
                        alertas.append({"grupo": grupo, "variacao": round(variacao, 1), "atual": qtd, "anterior": qtd_ant})
        return {"series": series, "alertas": alertas, "meses": meses_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.on_event("startup")
async def startup_snapshot():
    import threading
    threading.Thread(target=_salvar_snapshot_automatico, daemon=True).start()

@app.post("/snapshot/forcar")
def forcar_snapshot():
    try:
        mes_atual = datetime.now().strftime("%Y-%m")
        ocupacao = _baixar_ocupacao_drive()
        snapshot = {"mes": mes_atual, "gerado_em": datetime.now().isoformat(), "dados": ocupacao}
        _upload_json_drive(f"snapshot_{mes_atual}.json", snapshot, _HISTORICO_FOLDER_ID)
        indice = _baixar_json_drive("indice.json", _HISTORICO_FOLDER_ID) or {"meses": []}
        if mes_atual not in indice["meses"]:
            indice["meses"].append(mes_atual)
            indice["meses"].sort()
        _upload_json_drive("indice.json", indice, _HISTORICO_FOLDER_ID)
        return {"ok": True, "mes": mes_atual}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/debug/drive")
def debug_drive():
    import traceback
    try:
        service = _gdrive_service()
        results = service.files().list(
            q=f"'{_HISTORICO_FOLDER_ID}' in parents and trashed=false",
            fields="files(id, name)"
        ).execute()
        return {"ok": True, "arquivos": results.get("files", [])}
    except Exception as e:
        return {"ok": False, "erro": str(e), "trace": traceback.format_exc()}

@app.get("/debug/snapshot-erro")
def debug_snapshot_erro():
    import traceback
    try:
        mes_atual = datetime.now().strftime("%Y-%m")
        ocupacao = _baixar_ocupacao_drive()
        snapshot = {"mes": mes_atual, "gerado_em": datetime.now().isoformat(), "dados": ocupacao}
        _upload_json_drive(f"snapshot_{mes_atual}.json", snapshot, _HISTORICO_FOLDER_ID)
        return {"ok": True, "mes": mes_atual}
    except Exception as e:
        return {"ok": False, "erro": str(e), "trace": traceback.format_exc()}

# --- Snapshots: Drive (fonte de verdade) + Local (cache/fallback) ---
import os as _os
_SNAPSHOTS_DIR = _os.path.join(BASE_DIR, "data", "snapshots")
_os.makedirs(_SNAPSHOTS_DIR, exist_ok=True)


def _computar_series_kpis(meses_snaps: list) -> dict:
    """Recebe lista de {'mes': str, 'dados': dict} e retorna series + alertas."""
    series = {}
    for item in meses_snaps:
        mes = item["mes"]
        contagem = {}
        for u_dados in item.get("dados", {}).get("unidades", {}).values():
            for p in (u_dados.get("pavilhoes") or u_dados.get("pavs") or {}).values():
                g = p.get("grupo") or p.get("g", "")
                if g:
                    contagem[g] = contagem.get(g, 0) + 1
        series[mes] = contagem

    alertas = []
    meses_list = sorted(series.keys())
    if len(meses_list) >= 2:
        atual = series[meses_list[-1]]
        anterior = series[meses_list[-2]]
        for grupo, qtd in atual.items():
            qtd_ant = anterior.get(grupo, 0)
            if qtd_ant > 0:
                variacao = ((qtd - qtd_ant) / qtd_ant) * 100
                if abs(variacao) >= 20:
                    alertas.append({
                        "grupo": grupo,
                        "variacao": round(variacao, 1),
                        "atual": qtd,
                        "anterior": qtd_ant,
                    })
    return {"series": series, "alertas": alertas, "meses": meses_list}


def _salvar_snapshot_completo():
    """
    Salva snapshot do mês atual TANTO no Drive quanto localmente.
    Drive = fonte de verdade e histórico persistente.
    Local = cache offline/fallback.
    Idempotente: não sobrescreve se já existir no Drive no mesmo mês.
    """
    mes_atual = datetime.now().strftime("%Y-%m")
    nome_arquivo = f"snapshot_{mes_atual}.json"

    existente_drive = _baixar_json_drive(nome_arquivo, _HISTORICO_FOLDER_ID)
    if existente_drive:
        return {"criado": False, "destino": "drive", "mes": mes_atual}

    try:
        ocupacao = _baixar_ocupacao_drive()
        snapshot = {
            "mes": mes_atual,
            "gerado_em": datetime.now().isoformat(),
            "dados": ocupacao,
        }

        # Drive
        _upload_json_drive(nome_arquivo, snapshot, _HISTORICO_FOLDER_ID)
        indice = _baixar_json_drive("indice.json", _HISTORICO_FOLDER_ID) or {"meses": []}
        if mes_atual not in indice["meses"]:
            indice["meses"].append(mes_atual)
            indice["meses"].sort()
        _upload_json_drive("indice.json", indice, _HISTORICO_FOLDER_ID)

        # Local (cache)
        path_local = _os.path.join(_SNAPSHOTS_DIR, nome_arquivo)
        with open(path_local, "w", encoding="utf-8") as f:
            json.dump(snapshot, f, ensure_ascii=False, indent=2)
        indice_local_path = _os.path.join(_SNAPSHOTS_DIR, "indice.json")
        ind_local = json.loads(open(indice_local_path).read()) if _os.path.exists(indice_local_path) else {"meses": []}
        if mes_atual not in ind_local["meses"]:
            ind_local["meses"].append(mes_atual)
            ind_local["meses"].sort()
        with open(indice_local_path, "w", encoding="utf-8") as f:
            json.dump(ind_local, f, ensure_ascii=False, indent=2)

        return {"criado": True, "destino": "drive+local", "mes": mes_atual}
    except Exception as e:
        return {"criado": False, "erro": str(e)}


@app.on_event("startup")
async def startup_snapshot_unificado():
    import threading
    threading.Thread(target=_salvar_snapshot_completo, daemon=True).start()


@app.post("/snapshot/forcar")
def forcar_snapshot_unificado():
    """Força snapshot sobrescrevendo qualquer versão anterior. Drive + local."""
    try:
        mes_atual = datetime.now().strftime("%Y-%m")
        nome_arquivo = f"snapshot_{mes_atual}.json"
        ocupacao = _baixar_ocupacao_drive()
        snapshot = {
            "mes": mes_atual,
            "gerado_em": datetime.now().isoformat(),
            "dados": ocupacao,
        }

        _upload_json_drive(nome_arquivo, snapshot, _HISTORICO_FOLDER_ID)
        indice = _baixar_json_drive("indice.json", _HISTORICO_FOLDER_ID) or {"meses": []}
        if mes_atual not in indice["meses"]:
            indice["meses"].append(mes_atual)
            indice["meses"].sort()
        _upload_json_drive("indice.json", indice, _HISTORICO_FOLDER_ID)

        path_local = _os.path.join(_SNAPSHOTS_DIR, nome_arquivo)
        with open(path_local, "w", encoding="utf-8") as f:
            json.dump(snapshot, f, ensure_ascii=False, indent=2)
        indice_local_path = _os.path.join(_SNAPSHOTS_DIR, "indice.json")
        ind_local = json.loads(open(indice_local_path).read()) if _os.path.exists(indice_local_path) else {"meses": []}
        if mes_atual not in ind_local["meses"]:
            ind_local["meses"].append(mes_atual)
            ind_local["meses"].sort()
        with open(indice_local_path, "w", encoding="utf-8") as f:
            json.dump(ind_local, f, ensure_ascii=False, indent=2)

        return {"ok": True, "mes": mes_atual, "destino": "drive+local"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/historico/indice")
def get_indice_unificado():
    """Drive primeiro, local como fallback."""
    try:
        indice = _baixar_json_drive("indice.json", _HISTORICO_FOLDER_ID)
        if indice:
            return indice
    except Exception:
        pass
    path = _os.path.join(_SNAPSHOTS_DIR, "indice.json")
    return json.loads(open(path).read()) if _os.path.exists(path) else {"meses": []}


@app.get("/historico/{mes}")
def get_historico_mes_unificado(mes: str):
    """Drive primeiro, local como fallback."""
    try:
        snap = _baixar_json_drive(f"snapshot_{mes}.json", _HISTORICO_FOLDER_ID)
        if snap:
            return snap
    except Exception:
        pass
    path = _os.path.join(_SNAPSHOTS_DIR, f"snapshot_{mes}.json")
    if _os.path.exists(path):
        return json.loads(open(path).read())
    raise HTTPException(status_code=404, detail=f"Snapshot {mes} não encontrado")


@app.get("/kpis")
def get_kpis_unificado():
    """KPIs dos últimos 6 meses. Drive primeiro, local como fallback."""
    indice = None
    usar_local = False
    try:
        indice = _baixar_json_drive("indice.json", _HISTORICO_FOLDER_ID)
    except Exception:
        usar_local = True

    if not indice:
        path = _os.path.join(_SNAPSHOTS_DIR, "indice.json")
        indice = json.loads(open(path).read()) if _os.path.exists(path) else {"meses": []}
        usar_local = True

    meses = sorted(indice.get("meses", []))
    meses_snaps = []
    for mes in meses[-6:]:
        snap = None
        if not usar_local:
            try:
                snap = _baixar_json_drive(f"snapshot_{mes}.json", _HISTORICO_FOLDER_ID)
            except Exception:
                pass
        if not snap:
            path = _os.path.join(_SNAPSHOTS_DIR, f"snapshot_{mes}.json")
            if _os.path.exists(path):
                snap = json.loads(open(path).read())
        if snap:
            meses_snaps.append({"mes": mes, "dados": snap.get("dados", {})})

    return _computar_series_kpis(meses_snaps)
