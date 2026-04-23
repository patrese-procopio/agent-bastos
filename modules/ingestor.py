import os
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOCS_DIR = os.path.join(BASE_DIR, "doutrina")
CHROMA_DIR = os.path.join(BASE_DIR, "chroma_db")

print("Carregando modelo de embeddings...")
embeddings = HuggingFaceEmbeddings(model_name="intfloat/multilingual-e5-small")
splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)

docs = []
for fname in os.listdir(DOCS_DIR):
    if fname.endswith(".txt"):
        caminho = os.path.join(DOCS_DIR, fname)
        with open(caminho, encoding="utf-8") as f:
            conteudo = f.read()
        chunks = splitter.create_documents([conteudo], metadatas=[{"fonte": fname}])
        docs.extend(chunks)
        print(f"  OK {fname} -> {len(chunks)} chunks")

print(f"Indexando {len(docs)} chunks...")
db = Chroma.from_documents(docs, embeddings, persist_directory=CHROMA_DIR)
db.persist()
print(f"Pronto! Base salva em: {CHROMA_DIR}")