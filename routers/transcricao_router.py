"""
routers/transcricao_router.py
─────────────────────────────────────────────────────────────────────────────
Rotas HTTP de transcrição de áudio, exportação de laudos e grafoscopia.
"""

import io
import json
import os
import re
import tempfile
import wave
from datetime import datetime

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Depends
from fastapi.responses import Response

from services.export_service import build_txt, build_pdf, build_docx
from dependencies import get_current_user, require_module
from modules.decifrar import transcrever_documento_bytes, TipoDocumento

# ─── Configuração ─────────────────────────────────────────────────────────────

router = APIRouter(tags=["transcricao"])

_MAX_AUDIO_BYTES = 25 * 1024 * 1024
_AUDIO_EXTS      = {".wav", ".mp3", ".mp4", ".ogg", ".webm", ".flac", ".m4a", ".mpga", ".mpeg"}
_EXPORT_MIME     = {
    "txt":  "text/plain",
    "pdf":  "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
_MESES_PT = [
    "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

def _get_groq():
    from groq import Groq
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY nao encontrada. Configure o arquivo .env.")
    return Groq(api_key=api_key)


# ─── Helpers privados ─────────────────────────────────────────────────────────

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
            text = text[start: end + 1]
    return json.loads(text)


def _date_str_pt(dt: datetime) -> str:
    return f"{dt.day} de {_MESES_PT[dt.month - 1]} de {dt.year}"


# ─── Rota: Transcrição de Áudio ───────────────────────────────────────────────

@router.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    user: dict = Depends(require_module("transcricao")),
):
    groq     = _get_groq()
    filename = audio.filename or "audio.wav"
    suffix   = os.path.splitext(filename)[1].lower()

    if suffix not in _AUDIO_EXTS:
        raise HTTPException(
            status_code=415,
            detail=f"Formato nao suportado: '{suffix}'. Use: {', '.join(sorted(_AUDIO_EXTS))}",
        )

    audio_bytes = await audio.read()
    if len(audio_bytes) > _MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Arquivo excede o limite de 25 MB.")
    if len(audio_bytes) == 0:
        raise HTTPException(status_code=400, detail="Arquivo de audio vazio.")

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
            transcription = groq.audio.transcriptions.create(
                file=(filename, f),
                model="whisper-large-v3-turbo",
                language="pt",
                response_format="verbose_json",
                prompt="Audio operacional SEAP/AM. Terminologia policial e penitenciaria brasileira.",
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
            "Voce e BASTOS-UNIT, analista de inteligencia penitenciaria da SEAP/AM.\n\n"
            "Analise a transcricao abaixo e retorne SOMENTE o JSON (sem markdown):\n\n"
            f"TRANSCRICAO:\n{segments_text}\n\n"
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
            "Regras: speakers max 4 (M1,M2,F1,F2); risk_level=ALTO/MEDIO/BAIXO; "
            "red_flags pode ser []; retorne APENAS o JSON."
        )

        completion = groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": analysis_prompt}],
            temperature=0.1,
            max_tokens=3000,
        )

        return _parse_llm_json(completion.choices[0].message.content)

    except json.JSONDecodeError:
        return {
            "laudo_number":   laudo_number,
            "date":           date_str,
            "filename":       filename,
            "duration":       duration_str,
            "speakers":       [{"id": "M1", "label": "Voz detectada", "role": "Interlocutor"}],
            "segments":       [{"ts": "00:00:00", "speaker": "M1", "text": raw_text}],
            "risk_level":     "MEDIO",
            "classification": "Transcricao de audio operacional",
            "summary":        raw_text[:300] if raw_text else "Sem conteudo identificado.",
            "red_flags":      [],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


# ─── Rota: Exportação de Laudos ───────────────────────────────────────────────

@router.post("/export/{fmt}")
async def export_transcript(
    fmt: str,
    body: dict,
    user: dict = Depends(require_module("transcricao")),
):
    if fmt not in _EXPORT_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Formato '{fmt}' nao suportado. Use: {', '.join(_EXPORT_MIME)}",
        )
    transcript   = body.get("transcript", {})
    laudo_num    = transcript.get("laudo_number", "laudo").replace("/", "-")
    out_filename = f"laudo_{laudo_num}.{fmt}"
    try:
        if fmt == "txt":
            content = build_txt(transcript)
        elif fmt == "pdf":
            content = build_pdf(transcript)
        else:
            content = build_docx(transcript)
        return Response(
            content=content,
            media_type=_EXPORT_MIME[fmt],
            headers={"Content-Disposition": f'attachment; filename="{out_filename}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha ao gerar {fmt.upper()}: {e}")


# ─── Rota: Grafoscopia ────────────────────────────────────────────────────────

@router.post("/decifrar")
async def decifrar(
    imagem: UploadFile = File(...),
    tipo_documento: str = Form("desconhecido"),
    contexto_extra: str = Form(""),
    user: dict = Depends(get_current_user),
):
    """
    Recebe imagem de manuscrito, analisa via Gemini 2.5 Flash.
    Retorna transcrição forense + cronologia analítica estruturada.
    """
    dados = await imagem.read()
    if len(dados) == 0:
        raise HTTPException(status_code=400, detail="Imagem vazia.")

    media_type = imagem.content_type or "image/jpeg"

    try:
        tipo = TipoDocumento(tipo_documento)
    except ValueError:
        tipo = TipoDocumento.DESCONHECIDO

    try:
        resultado = transcrever_documento_bytes(
            dados=dados,
            media_type=media_type,
            nome_arquivo=imagem.filename or "documento",
            tipo_documento=tipo,
            contexto_extra=contexto_extra,
        )
        return resultado
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))