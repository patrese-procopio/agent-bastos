"""
modules/rag.py - Motor de Inteligencia do Agent Bastos
=======================================================
RAG real: busca semantica no ChromaDB + geracao via Groq (LLaMA 70b).
Mantem seguranca operacional: logs criptografados com Fernet.
"""

import os
from groq import Groq
from dotenv import load_dotenv
from cryptography.fernet import Fernet
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

load_dotenv()

ROOT_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROMA_DIR = os.path.join(ROOT_DIR, "data", "chroma_db")
LOG_PATH   = os.path.join(ROOT_DIR, "logs", "missao.log")

CHAVE  = b'HO-eVf31rwjok3MHPYnwUJ3sEemwwLHbw8P7rLCGisY='
fernet = Fernet(CHAVE)
historico_conversa = []

print("[*] Carregando modelo de embeddings...")
_embeddings = HuggingFaceEmbeddings(model_name="intfloat/multilingual-e5-small")
print("[*] Conectando ao ChromaDB...")
_db = Chroma(persist_directory=CHROMA_DIR, embedding_function=_embeddings)
print(f"[+] ChromaDB carregado: {_db._collection.count()} chunks indexados.")

def salvar_log_criptografado(texto):
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    token = fernet.encrypt(texto.encode())
    with open(LOG_PATH, "ab") as f:
        f.write(token + b"\n")

def carregar_memoria_recente():
    global historico_conversa
    if not os.path.exists(LOG_PATH):
        return False
    try:
        with open(LOG_PATH, "rb") as f:
            linhas = f.readlines()
        for linha in linhas[-4:]:
            texto_claro = fernet.decrypt(linha.strip()).decode()
            historico_conversa.append(texto_claro)
        return True
    except Exception:
        return False

def recuperar_contexto_doutrinario(pergunta, top_k=4):
    documentos = _db.similarity_search(pergunta, k=top_k)
    if not documentos:
        return "Nenhum trecho doutrinario relevante encontrado.", []
    partes = []
    for i, doc in enumerate(documentos, 1):
        fonte = doc.metadata.get("fonte", "desconhecida")
        partes.append(f"[TRECHO {i} - FONTE: {fonte}]\n{doc.page_content}")
    return "\n\n".join(partes), documentos

def conversar_com_bastos(pergunta):
    global historico_conversa
    contexto_doutrinario, _ = recuperar_contexto_doutrinario(pergunta)
    contexto_historico = "\n".join(historico_conversa[-6:])
    prompt_final = (
        "### DIRETRIZ OPERACIONAL\n"
        "Voce e o BASTOS-UNIT, analista tecnico de inteligencia de seguranca publica. "
        "Responda APENAS com base nos trechos doutrinarios fornecidos abaixo. "
        "Se a informacao nao estiver nos trechos, declare isso explicitamente.\n\n"
        f"### DOUTRINA RECUPERADA\n{contexto_doutrinario}\n\n"
        f"### HISTORICO RECENTE\n{contexto_historico}\n\n"
        f"### PERGUNTA\n{pergunta}\n\n"
        "### RESPOSTA TECNICA:"
    )
    try:
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt_final}],
            temperature=0.2,
            max_tokens=1024,
        )
        resposta = completion.choices[0].message.content
    except Exception as e:
        return f"FALHA: {e}"
    historico_conversa.append(f"AGENTE: {pergunta}")
    historico_conversa.append(f"BASTOS: {resposta}")
    salvar_log_criptografado(f"AGENTE: {pergunta} | BASTOS: {resposta}")
    return resposta



def conversar_com_fontes(pergunta):
    """
    RAG avancado: retorna resposta + fontes + score de confianca.
    Usado pelo endpoint /chat-rag.
    """
    global historico_conversa

    resultados = _db.similarity_search_with_relevance_scores(pergunta, k=4)

    fontes = []
    partes_contexto = []

    for i, (doc, score) in enumerate(resultados, 1):
        fonte = doc.metadata.get("fonte", "desconhecida")
        trecho = doc.page_content[:300].strip()
        partes_contexto.append(f"[TRECHO {i} - FONTE: {fonte}]\n{doc.page_content}")
        fontes.append({
            "id": i,
            "fonte": fonte,
            "trecho": trecho,
            "score": round(score * 100, 1)
        })

    confianca = round(sum(f["score"] for f in fontes) / len(fontes), 1) if fontes else 0
    contexto_doutrinario = "\n\n".join(partes_contexto)
    contexto_historico = "\n".join(historico_conversa[-6:])

    prompt_final = (
        "### DIRETRIZ OPERACIONAL\n"
        "Voce e o BASTOS-UNIT, analista tecnico de inteligencia de seguranca publica. "
        "Responda APENAS com base nos trechos doutrinarios fornecidos abaixo. "
        "Se a informacao nao estiver nos trechos, declare isso explicitamente.\n\n"
        f"### DOUTRINA RECUPERADA\n{contexto_doutrinario}\n\n"
        f"### HISTORICO RECENTE\n{contexto_historico}\n\n"
        f"### PERGUNTA\n{pergunta}\n\n"
        "### RESPOSTA TECNICA:"
    )

    try:
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt_final}],
            temperature=0.2,
            max_tokens=1024,
        )
        resposta = completion.choices[0].message.content
    except Exception as e:
        return {"resposta": f"FALHA: {e}", "fontes": fontes, "confianca": 0}

    historico_conversa.append(f"AGENTE: {pergunta}")
    historico_conversa.append(f"BASTOS: {resposta}")
    salvar_log_criptografado(f"AGENTE: {pergunta} | BASTOS: {resposta}")

    return {
        "resposta": resposta,
        "fontes": fontes,
        "confianca": confianca
    }

if __name__ == "__main__":
    print("\n" + "=" * 55)
    print("   AGENT BASTOS - SISTEMA DE INTELIGENCIA SOBERANA")
    print("=" * 55)
    print("\n[*] Carregando memorias criptografadas...")
    if carregar_memoria_recente():
        print("[+] Contexto recuperado do ultimo log com sucesso.")
    else:
        print("[!] Nenhum log anterior encontrado. Sessao iniciada limpa.")
    print("[*] Sistema pronto.\n")
    while True:
        try:
            comando = input("[AGENTE]> ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\n[!] Sessao encerrada.")
            break
        if not comando:
            continue
        if comando.lower() == "protocolo-zero":
            if os.path.exists(LOG_PATH): os.remove(LOG_PATH)
            print("\n[!] DADOS ELIMINADOS. SESSAO ENCERRADA.")
            break
        if comando.lower() in ["sair", "exit"]:
            print("\n[!] Sessao encerrada.")
            break
        print("\n[PROCESSANDO...]")
        resposta = conversar_com_bastos(comando)
        print(f"\n[BASTOS]> {resposta}\n")
