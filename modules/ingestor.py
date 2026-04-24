import os
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
DOCS_DIR   = os.path.join(BASE_DIR, "..", "data", "doutrina")
CHROMA_DIR = os.path.join(BASE_DIR, "..", "data", "chroma_db")

print("Carregando modelo de embeddings...")
embeddings = HuggingFaceEmbeddings(model_name="intfloat/multilingual-e5-small")
splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=200)

docs = []
for fname in os.listdir(DOCS_DIR):
    if fname.endswith(".txt"):
        caminho = os.path.join(DOCS_DIR, fname)
        with open(caminho, encoding="utf-8") as f:
            conteudo = f.read()
        chunks = splitter.create_documents([conteudo], metadatas=[{"fonte": fname}])
        docs.extend(chunks)
        print(f"  OK {fname} -> {len(chunks)} chunks")

print(f"Indexando {len(docs)} chunks no ChromaDB...")
db = Chroma(persist_directory=CHROMA_DIR, embedding_function=embeddings)
db.delete_collection()
db = Chroma.from_documents(docs, embeddings, persist_directory=CHROMA_DIR)
print(f"Pronto! {len(docs)} chunks salvos em: {CHROMA_DIR}")
