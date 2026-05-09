"""
modules/decifrar.py
Transcrição forense de documentos manuscritos via Gemini 2.5 Flash.
SDK: google-genai (substitui o depreciado google-generativeai)
"""

import json
import os
import re
from datetime import datetime
from enum import Enum
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from google import genai
from google.genai import types


# ─── Enums ────────────────────────────────────────────────────────────────────

class NivelConfianca(str, Enum):
    ALTO    = "alto"
    MEDIO   = "medio"
    BAIXO   = "baixo"
    CRITICO = "critico"


class TipoDocumento(str, Enum):
    BILHETE      = "bilhete"
    ANOTACAO     = "anotacao"
    CARTA        = "carta"
    CODIGO       = "codigo"
    DESCONHECIDO = "desconhecido"


# ─── Prompts ──────────────────────────────────────────────────────────────────

PROMPT_SISTEMA = """Você é um especialista forense em documentos manuscritos para inteligência de segurança pública.

REGRAS DE TRANSCRIÇÃO:
1. Transcreva EXATAMENTE o que está escrito — não corrija gramática ou ortografia
2. Use [?] para caracteres/palavras incertas
3. Use [ILEGÍVEL] para trechos impossíveis de ler
4. Use [RASURADO] para conteúdo riscado visível
5. Preserve quebras de linha, numerações e símbolos do original

RESPONDA APENAS com JSON válido, sem markdown, sem backticks:
{
  "transcricao": "texto transcrito",
  "confianca": "alto|medio|baixo|critico",
  "trechos_duvidosos": ["lista de trechos incertos"],
  "observacoes": "notas forenses relevantes",
  "idioma_detectado": "português|espanhol|inglês|misto|código",
  "requer_revisao_humana": true|false
}"""

CONTEXTO_TIPO = {
    TipoDocumento.BILHETE:      "Bilhete de comunicação rápida. Atenção a apelidos, endereços abreviados e linguagem cifrada.",
    TipoDocumento.CODIGO:       "Possível mensagem codificada. Atenção a sequências numéricas, letras isoladas e padrões repetitivos.",
    TipoDocumento.ANOTACAO:     "Anotações pessoais. Preserve listas, setas e hierarquias visuais.",
    TipoDocumento.CARTA:        "Documento extenso. Identifique saudação, corpo, despedida e assinatura.",
    TipoDocumento.DESCONHECIDO: "",
}


# ─── Singleton do cliente ─────────────────────────────────────────────────────

_GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not _GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY não encontrada. Configure o arquivo .env.")

_cliente = genai.Client(api_key=_GEMINI_API_KEY)
_MODELO  = "gemini-2.5-flash"


# ─── Helpers internos ─────────────────────────────────────────────────────────

def _carregar_imagem(caminho: str) -> tuple[bytes, str]:
    """Lê o arquivo e retorna (bytes_raw, media_type)."""
    caminho = Path(caminho)
    if not caminho.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {caminho}")

    tipos = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png",  ".gif": "image/gif",
        ".webp": "image/webp",
    }
    media_type = tipos.get(caminho.suffix.lower())
    if not media_type:
        raise ValueError(f"Formato não suportado: {caminho.suffix}")

    return caminho.read_bytes(), media_type

def _parsear_resposta(texto: str) -> dict:
    texto = texto.strip()
    # Remove markdown se existir
    limpo = re.sub(r"```(?:json)?\s*", "", texto)
    limpo = re.sub(r"```", "", limpo).strip()
    # Busca o maior bloco JSON na resposta
    for candidato in [limpo, texto]:
        m = re.search(r"\{.*\}", candidato, re.DOTALL)
        if not m:
            continue
        try:
            resultado = json.loads(m.group())
            # Desembala JSON aninhado no campo "transcricao"
            inner = resultado.get("transcricao", "")
            if isinstance(inner, str):
                m2 = re.search(r"\{.*\}", inner.strip(), re.DOTALL)
                if m2:
                    try:
                        interno = json.loads(m2.group())
                        if "transcricao" in interno:
                            return interno
                    except Exception:
                        pass
            return resultado
        except json.JSONDecodeError:
            continue
    return {
        "transcricao":           texto,
        "confianca":             "baixo",
        "trechos_duvidosos":     [],
        "observacoes":           "Resposta não estruturada — revisar manualmente",
        "idioma_detectado":      "desconhecido",
        "requer_revisao_humana": True,
    }

def _montar_prompt(tipo_documento: TipoDocumento, contexto_extra: str) -> str:
    prompt = PROMPT_SISTEMA
    if CONTEXTO_TIPO[tipo_documento]:
        prompt += f"\n\nCONTEXTO DE TIPO: {CONTEXTO_TIPO[tipo_documento]}"
    if contexto_extra:
        prompt += f"\n\nCONTEXTO OPERACIONAL: {contexto_extra}"
    prompt += "\n\nRealize a transcrição forense completa. Responda APENAS com o JSON estruturado."
    return prompt


# ─── Núcleo da transcrição ────────────────────────────────────────────────────

def _transcrever_core(
    dados: bytes,
    media_type: str,
    tipo_documento: TipoDocumento,
    contexto_extra: str,
    nome_ref: str,
) -> dict:
    prompt = _montar_prompt(tipo_documento, contexto_extra)

    resposta = _cliente.models.generate_content(
        model=_MODELO,
        contents=[
            types.Part.from_bytes(data=dados, mime_type=media_type),
            prompt,
        ],
        config=types.GenerateContentConfig(
            temperature=0.1,
            max_output_tokens=2048,
        ),
    )

    resultado = _parsear_resposta(resposta.text)
    resultado["metadados"] = {
        "arquivo":        Path(nome_ref).name,
        "tipo_documento": tipo_documento.value,
        "modelo":         _MODELO,
        "timestamp":      datetime.now().isoformat(),
    }
    return resultado


# ─── API pública ──────────────────────────────────────────────────────────────

def transcrever_documento(
    caminho_imagem: str,
    tipo_documento: TipoDocumento = TipoDocumento.DESCONHECIDO,
    contexto_extra: str = "",
) -> dict:
    """Transcreve a partir de um caminho de arquivo."""
    dados, media_type = _carregar_imagem(caminho_imagem)
    return _transcrever_core(dados, media_type, tipo_documento, contexto_extra, caminho_imagem)


def transcrever_documento_bytes(
    dados: bytes,
    media_type: str,
    nome_arquivo: str = "documento",
    tipo_documento: TipoDocumento = TipoDocumento.DESCONHECIDO,
    contexto_extra: str = "",
) -> dict:
    """Versão para bytes em memória — chamada pela rota FastAPI."""
    return _transcrever_core(dados, media_type, tipo_documento, contexto_extra, nome_arquivo)


# ─── Processamento em lote ────────────────────────────────────────────────────

def transcrever_lote(
    caminhos: list[str],
    tipo_documento: TipoDocumento = TipoDocumento.DESCONHECIDO,
    contexto_extra: str = "",
    parar_em_erro: bool = False,
) -> list[dict]:
    resultados = []
    for i, caminho in enumerate(caminhos, 1):
        print(f"[{i}/{len(caminhos)}] Processando: {caminho}")
        try:
            resultado = transcrever_documento(caminho, tipo_documento, contexto_extra)
            resultado["status"] = "sucesso"
        except Exception as e:
            resultado = {"status": "erro", "erro": str(e), "arquivo": caminho}
            if parar_em_erro:
                raise
        resultados.append(resultado)
    return resultados


def exportar_relatorio(resultados: list[dict], caminho_saida: str = None) -> str:
    relatorio = {
        "gerado_em":      datetime.now().isoformat(),
        "total":          len(resultados),
        "requer_revisao": sum(1 for r in resultados if r.get("requer_revisao_humana")),
        "resultados":     resultados,
    }
    json_str = json.dumps(relatorio, ensure_ascii=False, indent=2)
    if caminho_saida:
        Path(caminho_saida).write_text(json_str, encoding="utf-8")
    return json_str


# ─── Teste local ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    resultado = transcrever_documento(
        caminho_imagem="missiva teste.jpeg",
        tipo_documento=TipoDocumento.BILHETE,
        contexto_extra="Apreendido em abordagem na zona norte de Manaus",
    )
    print(json.dumps(resultado, ensure_ascii=False, indent=2))
