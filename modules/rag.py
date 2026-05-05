"""
modules/rag.py - Motor de Inteligencia do Agent Bastos
=======================================================
RAG real: busca semantica no ChromaDB + geracao via Groq (LLaMA 70b).
Mantem seguranca operacional: logs criptografados com Fernet.
"""

import os
import threading
from groq import Groq
from dotenv import load_dotenv
from cryptography.fernet import Fernet
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

load_dotenv()

ROOT_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROMA_DIR = os.path.join(ROOT_DIR, "data", "chroma_db")
LOG_PATH   = os.path.join(ROOT_DIR, "logs", "missao.log")

# Segurança — chave lida do .env, fallback para compatibilidade com logs existentes
_fernet_key = os.getenv("FERNET_KEY", "HO-eVf31rwjok3MHPYnwUJ3sEemwwLHbw8P7rLCGisY=").encode()
fernet      = Fernet(_fernet_key)

# Histórico de conversa com limite para evitar crescimento ilimitado do prompt
_MAX_HISTORICO  = 20   # 10 pares pergunta/resposta
_historico_lock = threading.Lock()
_log_lock       = threading.Lock()
historico_conversa = []

# ONNX/torch e embeddings devem ser carregados ANTES do Groq/httpx
# para evitar conflito de inicialização de bibliotecas nativas no Python 3.14+
print("[*] Carregando modelo de embeddings...")
_embeddings = HuggingFaceEmbeddings(model_name="intfloat/multilingual-e5-small")
print("[*] Conectando ao ChromaDB...")
_db = Chroma(persist_directory=CHROMA_DIR, embedding_function=_embeddings)
print(f"[+] ChromaDB carregado: {_db._collection.count()} chunks indexados.")

# Singleton Groq — criado APÓS embeddings para não conflitar com ONNX
_GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not _GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY não encontrada no ambiente. Configure o arquivo .env.")
_groq_client = Groq(api_key=_GROQ_API_KEY)


# ─── Logs criptografados ─────────────────────────────────────────────────────

_log_lock = threading.Lock()

def salvar_log_criptografado(texto: str) -> None:
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    token = fernet.encrypt(texto.encode())
    with _log_lock:
        with open(LOG_PATH, "ab") as f:
            f.write(token + b"\n")


def carregar_memoria_recente() -> bool:
    global historico_conversa
    if not os.path.exists(LOG_PATH):
        return False
    try:
        with open(LOG_PATH, "rb") as f:
            linhas = f.readlines()
        with _historico_lock:
            for linha in linhas[-4:]:
                historico_conversa.append(fernet.decrypt(linha.strip()).decode())
        return True
    except Exception:
        return False


def _adicionar_historico(pergunta: str, resposta: str) -> None:
    with _historico_lock:
        historico_conversa.append(f"AGENTE: {pergunta}")
        historico_conversa.append(f"BASTOS: {resposta}")
        # Mantém apenas as últimas _MAX_HISTORICO entradas
        if len(historico_conversa) > _MAX_HISTORICO:
            del historico_conversa[: len(historico_conversa) - _MAX_HISTORICO]


def _snapshot_historico() -> str:
    with _historico_lock:
        return "\n".join(historico_conversa[-6:])


# ─── Recuperação doutrinária ─────────────────────────────────────────────────

def recuperar_contexto_doutrinario(pergunta: str, top_k: int = 4):
    documentos = _db.similarity_search(pergunta, k=top_k)
    if not documentos:
        return "Nenhum trecho doutrinario relevante encontrado.", []
    partes = [
        f"[TRECHO {i} - FONTE: {doc.metadata.get('fonte', 'desconhecida')}]\n{doc.page_content}"
        for i, doc in enumerate(documentos, 1)
    ]
    return "\n\n".join(partes), documentos


# ─── Funções de conversação ──────────────────────────────────────────────────

def conversar_com_bastos(pergunta: str) -> str:
    contexto_doutrinario, _ = recuperar_contexto_doutrinario(pergunta)
    prompt_final = (
        "### DIRETRIZ OPERACIONAL\n"
        "Voce e o BASTOS-UNIT, analista tecnico de inteligencia de seguranca publica. "
        "Responda APENAS com base nos trechos doutrinarios fornecidos abaixo. "
        "Se a informacao nao estiver nos trechos, declare isso explicitamente.\n\n"
        f"### DOUTRINA RECUPERADA\n{contexto_doutrinario}\n\n"
        f"### HISTORICO RECENTE\n{_snapshot_historico()}\n\n"
        f"### PERGUNTA\n{pergunta}\n\n"
        "### RESPOSTA TECNICA:"
    )
    try:
        completion = _groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt_final}],
            temperature=0.2,
            max_tokens=1024,
        )
        resposta = completion.choices[0].message.content
    except Exception as e:
        return f"FALHA: {e}"
    _adicionar_historico(pergunta, resposta)
    salvar_log_criptografado(f"AGENTE: {pergunta} | BASTOS: {resposta}")
    return resposta


def conversar_com_fontes(pergunta: str) -> dict:
    """RAG avancado: retorna resposta + fontes + score de confianca."""
    resultados = _db.similarity_search_with_relevance_scores(pergunta, k=4)

    fontes          = []
    partes_contexto = []
    for i, (doc, score) in enumerate(resultados, 1):
        fonte = doc.metadata.get("fonte", "desconhecida")
        partes_contexto.append(f"[TRECHO {i} - FONTE: {fonte}]\n{doc.page_content}")
        fontes.append({
            "id":     i,
            "fonte":  fonte,
            "trecho": doc.page_content[:300].strip(),
            "score":  round(score * 100, 1),
        })

    confianca = round(sum(f["score"] for f in fontes) / len(fontes), 1) if fontes else 0

    prompt_final = (
        "### DIRETRIZ OPERACIONAL\n"
        "Voce e o BASTOS-UNIT, analista tecnico de inteligencia de seguranca publica. "
        "Responda APENAS com base nos trechos doutrinarios fornecidos abaixo. "
        "Se a informacao nao estiver nos trechos, declare isso explicitamente.\n\n"
        f"### DOUTRINA RECUPERADA\n{chr(10).join(partes_contexto)}\n\n"
        f"### HISTORICO RECENTE\n{_snapshot_historico()}\n\n"
        f"### PERGUNTA\n{pergunta}\n\n"
        "### RESPOSTA TECNICA:"
    )

    try:
        completion = _groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt_final}],
            temperature=0.2,
            max_tokens=1024,
        )
        resposta = completion.choices[0].message.content
    except Exception as e:
        return {"resposta": f"FALHA: {e}", "fontes": fontes, "confianca": 0}

    _adicionar_historico(pergunta, resposta)
    salvar_log_criptografado(f"AGENTE: {pergunta} | BASTOS: {resposta}")
    return {"resposta": resposta, "fontes": fontes, "confianca": confianca}


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
            if os.path.exists(LOG_PATH):
                os.remove(LOG_PATH)
            print("\n[!] DADOS ELIMINADOS. SESSAO ENCERRADA.")
            break
        if comando.lower() in ("sair", "exit"):
            print("\n[!] Sessao encerrada.")
            break
        print("\n[PROCESSANDO...]")
        print(f"\n[BASTOS]> {conversar_com_bastos(comando)}\n")
