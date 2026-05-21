"""
modules/decifrar.py
Transcrição forense + cronologia analítica de manuscritos via Gemini 2.5 Flash.
"""

import json
import os
import re
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
load_dotenv()

from google import genai
from google.genai import types
from pydantic import BaseModel, Field


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


# ─── Schemas Pydantic — Structured Output ─────────────────────────────────────
# Esses schemas definem o CONTRATO de dados entre o Gemini e o frontend.
# O Pydantic garante que se o Gemini alucinar um campo errado, vai falhar
# na validação antes de chegar no frontend — isso é segurança de dados.

class EntidadesEnvolvidas(BaseModel):
    atores:        List[str] = Field(default=[], description="Codinomes, vulgos ou nomes reais citados.")
    locais:        List[str] = Field(default=[], description="Pavilhões, raias, cidades ou pontos de encontro.")
    organizacoes:  List[str] = Field(default=[], description="Facções, núcleos ou grupos citados.")


class EventoCronologico(BaseModel):
    data_isolada:         str                = Field(description="YYYY-MM-DD ou 'DATA_INCERTA'.")
    data_texto_original:  str                = Field(description="Como a data aparece literalmente no manuscrito.")
    tipo_evento:          str                = Field(description="ORDEM | MOVIMENTAÇÃO | REUNIÃO | ALERTA_DE_VISTORIA | PAGAMENTO | OUTRO")
    descricao_analitica:  str                = Field(description="Resumo objetivo da ação ou ordem.")
    criticidade:          str                = Field(description="ALTA | MÉDIA | BAIXA")
    entidades:            EntidadesEnvolvidas = Field(default_factory=EntidadesEnvolvidas)


class AnaliseGrafoscopica(BaseModel):
    # Campos legados — mantidos para não quebrar o frontend atual
    transcricao:             str              = Field(description="Transcrição literal preservando erros e gírias.")
    confianca:               str              = Field(description="alto | medio | baixo | critico")
    trechos_duvidosos:       List[str]        = Field(default=[])
    observacoes:             str              = Field(default="")
    idioma_detectado:        str              = Field(default="português")
    requer_revisao_humana:   bool             = Field(default=False)

    # Campos novos — cronologia analítica
    parecer_grafoscopico:    str              = Field(
        default="",
        description="Análise visual: tipo de caligrafia, rasuras, cores, marcas de dobra."
    )
    linha_do_tempo:          List[EventoCronologico] = Field(
        default=[],
        description="Eventos cronológicos extraídos ou deduzidos do manuscrito."
    )


# ─── Prompts ──────────────────────────────────────────────────────────────────

PROMPT_SISTEMA = """Você é um Perito Grafotécnico e Analista de Inteligência Sênior especializado em comunicações interceptadas no ambiente de Segurança Pública (bilhetes de pavilhões, salves, cartas cifradas).

DIRETRIZES OPERACIONAIS:

1. TRANSCRIÇÃO: Seja fiel ao texto. Não corrija erros ortográficos (ex: "brete", "asgola"). Use [?] para incertos e [ILEGÍVEL] para ilegíveis.

2. CRONOLOGIA: Se o documento tiver data de referência (ex: cabeçalho "18/05/2026") e o corpo disser "próxima sexta-feira", calcule a data exata. Sem referência, use "DATA_INCERTA".

3. ENTIDADES: Extraia vulgos mesmo que sejam uma letra ou número (ex: "01 do Norte", "Z").

4. CRITICIDADE ALTA: qualquer menção a motins, vistorias iminentes, transferências de lideranças, agressões ou transações de valores elevados.

RESPONDA APENAS com JSON válido seguindo exatamente este schema — sem markdown, sem backticks:
{
  "transcricao": "texto literal do manuscrito",
  "confianca": "alto|medio|baixo|critico",
  "trechos_duvidosos": ["lista"],
  "observacoes": "notas forenses",
  "idioma_detectado": "português|espanhol|inglês|misto|código",
  "requer_revisao_humana": true|false,
  "parecer_grafoscopico": "análise visual do documento",
  "linha_do_tempo": [
    {
      "data_isolada": "YYYY-MM-DD ou DATA_INCERTA",
      "data_texto_original": "como aparece no texto",
      "tipo_evento": "ORDEM|MOVIMENTAÇÃO|REUNIÃO|ALERTA_DE_VISTORIA|PAGAMENTO|OUTRO",
      "descricao_analitica": "resumo do evento",
      "criticidade": "ALTA|MÉDIA|BAIXA",
      "entidades": {
        "atores": [],
        "locais": [],
        "organizacoes": []
      }
    }
  ]
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
    """
    Parse robusto: tenta JSON direto, depois busca bloco JSON na resposta.
    Valida via Pydantic — se falhar, retorna estrutura mínima segura.
    """
    texto = texto.strip()
    limpo = re.sub(r"```(?:json)?\s*", "", texto)
    limpo = re.sub(r"```", "", limpo).strip()

    for candidato in [limpo, texto]:
        m = re.search(r"\{.*\}", candidato, re.DOTALL)
        if not m:
            continue
        try:
            dados = json.loads(m.group())
            # Valida via Pydantic — garante contrato de dados
            return AnaliseGrafoscopica(**dados).model_dump()
        except Exception:
            continue

    # Fallback seguro — nunca deixa o frontend sem resposta
    return AnaliseGrafoscopica(
        transcricao=texto,
        confianca="baixo",
        observacoes="Resposta não estruturada — revisar manualmente",
        requer_revisao_humana=True,
    ).model_dump()


def _montar_prompt(tipo_documento: TipoDocumento, contexto_extra: str) -> str:
    prompt = PROMPT_SISTEMA
    if CONTEXTO_TIPO[tipo_documento]:
        prompt += f"\n\nCONTEXTO DE TIPO: {CONTEXTO_TIPO[tipo_documento]}"
    if contexto_extra:
        prompt += f"\n\nCONTEXTO OPERACIONAL: {contexto_extra}"
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
            max_output_tokens=4096,  # aumentado para acomodar linha_do_tempo
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


if __name__ == "__main__":
    resultado = transcrever_documento(
        caminho_imagem="missiva teste.jpeg",
        tipo_documento=TipoDocumento.BILHETE,
        contexto_extra="Apreendido em abordagem na zona norte de Manaus",
    )
    print(json.dumps(resultado, ensure_ascii=False, indent=2))