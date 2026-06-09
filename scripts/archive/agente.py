"""
agente.py — Lógica de negócio do Agent Bastos
Responsabilidade: chamadas de API, processamento de dados, I/O de arquivos.
A UI não entra aqui. Este módulo não conhece botões, janelas ou widgets.
"""

import os
import threading
import numpy as np
import sounddevice as sd
import soundfile as sf
from groq import Groq

from config.settings import GROQ_API_KEY
from modules.decifrar import transcrever_documento, TipoDocumento

os.environ['no_proxy'] = '*'

# --- CONFIGURAÇÃO ---
_client = Groq(api_key=GROQ_API_KEY)

SYSTEM_PROMPT = (
    "Você é o Agent Bastos, um analista sênior de inteligência. "
    "Use o contexto fornecido para responder de forma técnica e objetiva."
)

LIMITE_CHARS_CONTEXTO = 24_000
SAMPLE_RATE           = 44100
MAX_SEGUNDOS          = 180

BASE_DIR  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR  = os.path.join(BASE_DIR, "data")
DOUTRINA_DIR = os.path.join(DATA_DIR, "doutrina")
AUDIO_PATH   = os.path.join(DATA_DIR, "audios", "entrevista_temp.wav")

# --- RAG: DOUTRINA ---

def carregar_contexto_doutrina() -> str:
    contexto = ""
    try:
        if not os.path.exists(DOUTRINA_DIR):
            return "Aviso: Nenhuma doutrina encontrada."
        arquivos = sorted(f for f in os.listdir(DOUTRINA_DIR) if f.endswith(".txt"))
        for arquivo in arquivos:
            with open(os.path.join(DOUTRINA_DIR, arquivo), 'r', encoding='utf-8') as f:
                conteudo = f.read()
            bloco = f"\n--- ORIGEM: {arquivo} ---\n{conteudo}\n"
            if len(contexto) + len(bloco) > LIMITE_CHARS_CONTEXTO:
                espaco_restante = LIMITE_CHARS_CONTEXTO - len(contexto)
                if espaco_restante > 200:
                    contexto += bloco[:espaco_restante] + "\n[CONTEXTO TRUNCADO]\n"
                break
            contexto += bloco
        return contexto if contexto else "Aviso: Nenhuma doutrina encontrada."
    except Exception as e:
        return f"Erro ao ler arquivos: {e}"


def consultar_agente(pergunta: str) -> str:
    """Recebe pergunta, retorna resposta do LLM. Sem UI."""
    contexto_txt = carregar_contexto_doutrina()
    prompt_final = f"CONTEXTO DOUTRINÁRIO:\n{contexto_txt}\n\nPERGUNTA: {pergunta}"
    response = _client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": prompt_final},
        ],
        temperature=0.7,
        max_tokens=2048,
    )
    return response.choices[0].message.content


# --- MISSIVA ---

def processar_missiva(caminho_imagem: str) -> dict:
    """Transcreve imagem e gera relatório. Retorna dict com status e conteúdo."""
    nome_arquivo = os.path.basename(caminho_imagem)
    resultado = transcrever_documento(
        caminho_imagem=caminho_imagem,
        tipo_documento=TipoDocumento.BILHETE,
        contexto_extra="Documento apreendido em operação de inteligência"
    )
    transcricao = resultado.get("transcricao", "")
    if not transcricao:
        return {"ok": False, "mensagem": "Nenhum texto identificado no documento."}

    prompt_relatorio = (
        f"O texto abaixo foi transcrito de um documento manuscrito '{nome_arquivo}'.\n"
        f"Organize como RELATÓRIO DE INTELIGÊNCIA formal com seções: "
        f"Assunto, Dados, Análise e Observações.\n\n"
        f"TRANSCRIÇÃO:\n{transcricao}"
    )
    observacoes = resultado.get("observacoes", "")
    if observacoes:
        prompt_relatorio += f"\n\nNOTAS FORENSES: {observacoes}"

    response = _client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": prompt_relatorio},
        ],
        temperature=0.4,
        max_tokens=2048,
    )
    return {
        "ok":        True,
        "nome":      nome_arquivo,
        "confianca": resultado.get("confianca", "N/A"),
        "revisao":   resultado.get("requer_revisao_humana", False),
        "relatorio": response.choices[0].message.content,
    }


# --- GRAVAÇÃO DE ÁUDIO ---

_gravando     = False
_frames_audio = []


def iniciar_gravacao(callback_log):
    global _gravando, _frames_audio
    _gravando     = True
    _frames_audio = []
    callback_log("🎙️ GRAVAÇÃO INICIADA — fale agora (máx. 3 min)...")
    threading.Thread(target=_gravar_audio, args=(callback_log,), daemon=True).start()


def parar_gravacao(callback_log, callback_ui):
    global _gravando
    if not _gravando:
        return
    _gravando = False
    callback_ui()
    if not _frames_audio:
        callback_log("⚠️ Nenhum áudio capturado.")
        return
    threading.Thread(target=_salvar_audio, args=(callback_log,), daemon=True).start()


def _gravar_audio(callback_log):
    global _gravando
    for _ in range(MAX_SEGUNDOS):
        if not _gravando:
            break
        bloco = sd.rec(SAMPLE_RATE, samplerate=SAMPLE_RATE,
                       channels=1, dtype='int16', blocking=True)
        _frames_audio.append(bloco)
    if _gravando:
        parar_gravacao(callback_log, lambda: None)


def _salvar_audio(callback_log):
    try:
        audio_completo = np.concatenate(_frames_audio, axis=0)
        sf.write(AUDIO_PATH, audio_completo, SAMPLE_RATE)
        duracao = len(audio_completo) / SAMPLE_RATE
        callback_log(f"✅ ENTREVISTA SALVA: entrevista_temp.wav ({duracao:.1f}s)")
        callback_log(f"📁 Local: {AUDIO_PATH}")
        callback_log("⏳ Aguardando integração com n8n para transcrição...")
        callback_log("_" * 60)
    except Exception as e:
        callback_log(f"❌ ERRO AO SALVAR ÁUDIO: {e}")


def esta_gravando() -> bool:
    return _gravando