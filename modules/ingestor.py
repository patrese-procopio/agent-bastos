"""
modules/ingestor.py - Script de indexação da doutrina no ChromaDB
==================================================================
Lê arquivos .txt em data/doutrina/, particiona em chunks via
RecursiveCharacterTextSplitter e gera embeddings multilíngues
(intfloat/multilingual-e5-small) para busca semântica.

Operação idempotente: apaga a collection existente e reindexa do zero.

USO (sempre via linha de comando):
  python -m modules.ingestor
  # ou
  python modules/ingestor.py

ATENÇÃO: Este módulo NÃO deve ser importado em outros módulos.
Toda a lógica está dentro de indexar_doutrina() e só executa via __main__.
"""

import os
import sys

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings


# Constantes de caminho - calculadas no nível do módulo (não tem efeito colateral)
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
DOCS_DIR   = os.path.join(BASE_DIR, "..", "data", "doutrina")
CHROMA_DIR = os.path.join(BASE_DIR, "..", "data", "chroma_db")

# Configuração do chunking - exposta como constante para facilitar tuning
CHUNK_SIZE    = 800
CHUNK_OVERLAP = 200
MODELO_EMBED  = "intfloat/multilingual-e5-small"


def _validar_pre_requisitos() -> list[str]:
    """
    Valida que a pasta de doutrina existe e contém arquivos .txt.
    Roda ANTES de qualquer operação destrutiva no banco.

    Retorna: lista de nomes de arquivos .txt encontrados.
    Levanta: FileNotFoundError se nada estiver disponível.
    """
    if not os.path.isdir(DOCS_DIR):
        raise FileNotFoundError(
            f"Pasta de doutrina nao encontrada: {DOCS_DIR}\n"
            f"Crie a pasta e adicione arquivos .txt antes de rodar o ingestor."
        )

    arquivos_txt = sorted(f for f in os.listdir(DOCS_DIR) if f.endswith(".txt"))

    if not arquivos_txt:
        raise FileNotFoundError(
            f"Nenhum arquivo .txt encontrado em: {DOCS_DIR}\n"
            f"Adicione documentos de doutrina antes de indexar."
        )

    return arquivos_txt


def _carregar_chunks(arquivos: list[str]) -> list:
    """
    Lê cada .txt e particiona em chunks. Falha de um arquivo nao mata o batch:
    registra o erro e segue para o proximo. Padrao de resiliencia em pipelines.
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )
    docs = []

    for fname in arquivos:
        caminho = os.path.join(DOCS_DIR, fname)
        try:
            with open(caminho, encoding="utf-8") as f:
                conteudo = f.read()
        except (OSError, UnicodeDecodeError) as e:
            print(f"  [!] FALHA ao ler {fname}: {e}", file=sys.stderr)
            continue

        chunks = splitter.create_documents([conteudo], metadatas=[{"fonte": fname}])
        docs.extend(chunks)
        print(f"  [+] {fname} -> {len(chunks)} chunks")

    return docs


def indexar_doutrina() -> int:
    """
    Reconstrói o índice vetorial da doutrina a partir dos .txt.

    Fluxo seguro:
      1) Valida pré-requisitos (pasta existe, tem .txt)
      2) Lê e particiona arquivos (resiliente a falha por arquivo)
      3) Verifica que gerou pelo menos 1 chunk
      4) SÓ ENTÃO apaga e recria a collection no ChromaDB

    Retorna: numero total de chunks indexados.
    """
    arquivos = _validar_pre_requisitos()

    print(f"[*] Carregando modelo de embeddings: {MODELO_EMBED}")
    embeddings = HuggingFaceEmbeddings(model_name=MODELO_EMBED)

    print(f"[*] Processando {len(arquivos)} arquivo(s)...")
    docs = _carregar_chunks(arquivos)

    if not docs:
        # Guarda de seguranca: se NENHUM chunk foi gerado, NAO deleta o banco.
        # Isso evita que o banco seja zerado caso todos os .txt estejam corrompidos.
        raise RuntimeError(
            "Nenhum chunk valido foi gerado. Abortando para preservar o banco atual."
        )

    print(f"[*] Reindexando {len(docs)} chunks no ChromaDB...")
    db = Chroma(persist_directory=CHROMA_DIR, embedding_function=embeddings)
    db.delete_collection()
    db = Chroma.from_documents(docs, embeddings, persist_directory=CHROMA_DIR)

    print(f"[+] Concluido. {len(docs)} chunks salvos em: {CHROMA_DIR}")
    return len(docs)


# Sentinela de seguranca - so executa quando rodado direto.
# Importar este modulo NAO dispara nenhuma acao.
if __name__ == "__main__":
    try:
        indexar_doutrina()
        sys.exit(0)
    except (FileNotFoundError, RuntimeError) as e:
        print(f"\n[ERRO] {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERRO INESPERADO] {type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(2)
