import anthropic
import base64
import json
import re
from pathlib import Path
from datetime import datetime
from enum import Enum


class NivelConfianca(str, Enum):
    ALTO = "alto"
    MEDIO = "medio"
    BAIXO = "baixo"
    CRITICO = "critico"


class TipoDocumento(str, Enum):
    BILHETE = "bilhete"
    ANOTACAO = "anotacao"
    CARTA = "carta"
    CODIGO = "codigo"
    DESCONHECIDO = "desconhecido"


PROMPT_SISTEMA = """Você é um especialista forense em documentos manuscritos para inteligência de segurança pública.

REGRAS DE TRANSCRIÇÃO:
1. Transcreva EXATAMENTE o que está escrito — não corrija gramática ou ortografia
2. Use [?] para caracteres/palavras incertas
3. Use [ILEGÍVEL] para trechos impossíveis de ler
4. Use [RASURADO] para conteúdo riscado visível
5. Preserve quebras de linha, numerações e símbolos do original

RESPONDA APENAS com JSON válido:
{
  "transcricao": "texto transcrito",
  "confianca": "alto|medio|baixo|critico",
  "trechos_duvidosos": ["lista de trechos incertos"],
  "observacoes": "notas forenses relevantes",
  "idioma_detectado": "português|espanhol|inglês|misto|código",
  "requer_revisao_humana": true|false
}"""

CONTEXTO_TIPO = {
    TipoDocumento.BILHETE: "Bilhete de comunicação rápida. Atenção a apelidos, endereços abreviados e linguagem cifrada.",
    TipoDocumento.CODIGO: "Possível mensagem codificada. Atenção a sequências numéricas, letras isoladas e padrões repetitivos.",
    TipoDocumento.ANOTACAO: "Anotações pessoais. Preserve listas, setas e hierarquias visuais.",
    TipoDocumento.CARTA: "Documento extenso. Identifique saudação, corpo, despedida e assinatura.",
    TipoDocumento.DESCONHECIDO: ""
}


def _carregar_imagem(caminho: str) -> tuple[str, str]:
    caminho = Path(caminho)
    if not caminho.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {caminho}")

    tipos = {".jpg": "image/jpeg", ".jpeg": "image/jpeg",
             ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp"}
    media_type = tipos.get(caminho.suffix.lower())
    if not media_type:
        raise ValueError(f"Formato não suportado: {caminho.suffix}")

    with open(caminho, "rb") as f:
        return base64.standard_b64encode(f.read()).decode("utf-8"), media_type


def _parsear_resposta(texto: str) -> dict:
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", texto, re.DOTALL)
    if match:
        return json.loads(match.group(1))
    match = re.search(r"\{.*\}", texto, re.DOTALL)
    if match:
        return json.loads(match.group())
    return {
        "transcricao": texto,
        "confianca": NivelConfianca.BAIXO,
        "trechos_duvidosos": [],
        "observacoes": "Resposta não estruturada — revisar manualmente",
        "idioma_detectado": "desconhecido",
        "requer_revisao_humana": True
    }


def transcrever_documento(
    caminho_imagem: str,
    tipo_documento: TipoDocumento = TipoDocumento.DESCONHECIDO,
    contexto_extra: str = "",
    modelo: str = "claude-opus-4-5"
) -> dict:
    dados_imagem, media_type = _carregar_imagem(caminho_imagem)

    system = PROMPT_SISTEMA
    if CONTEXTO_TIPO[tipo_documento]:
        system += f"\n\nCONTEXTO: {CONTEXTO_TIPO[tipo_documento]}"
    if contexto_extra:
        system += f"\n\nCONTEXTO OPERACIONAL: {contexto_extra}"

    cliente = anthropic.Anthropic()
    resposta = cliente.messages.create(
        model=modelo,
        max_tokens=2048,
        system=system,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": media_type, "data": dados_imagem}
                },
                {
                    "type": "text",
                    "text": "Realize a transcrição forense completa deste documento manuscrito. Responda APENAS com o JSON estruturado."
                }
            ]
        }]
    )

    resultado = _parsear_resposta(resposta.content[0].text)
    resultado["metadados"] = {
        "arquivo": Path(caminho_imagem).name,
        "tipo_documento": tipo_documento.value,
        "modelo": modelo,
        "timestamp": datetime.now().isoformat(),
        "tokens": {"entrada": resposta.usage.input_tokens, "saida": resposta.usage.output_tokens}
    }
    return resultado


def transcrever_lote(
    caminhos: list[str],
    tipo_documento: TipoDocumento = TipoDocumento.DESCONHECIDO,
    contexto_extra: str = "",
    parar_em_erro: bool = False
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
        "gerado_em": datetime.now().isoformat(),
        "total": len(resultados),
        "requer_revisao": sum(1 for r in resultados if r.get("requer_revisao_humana")),
        "resultados": resultados
    }
    json_str = json.dumps(relatorio, ensure_ascii=False, indent=2)
    if caminho_saida:
        Path(caminho_saida).write_text(json_str, encoding="utf-8")
    return json_str


if __name__ == "__main__":
    resultado = transcrever_documento(
        caminho_imagem="bilhete.jpg",
        tipo_documento=TipoDocumento.BILHETE,
        contexto_extra="Apreendido em abordagem na zona norte de Manaus"
    )
    print(json.dumps(resultado, ensure_ascii=False, indent=2))
