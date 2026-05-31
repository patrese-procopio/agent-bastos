"""
modules/rag.py - Motor de Inteligencia do Agent Bastos
=======================================================
RAG hibrido: classifica a pergunta, busca doutrina quando relevante,
responde como assistente tecnico geral quando nao ha contexto.
"""

import os
import threading
from groq import Groq
from dotenv import load_dotenv
from cryptography.fernet import Fernet
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
import getpass
import socket
from datetime import datetime, timezone

load_dotenv()

ROOT_DIR       = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROMA_DIR     = os.path.join(ROOT_DIR, "data", "chroma_db")
LOG_PATH       = os.path.join(ROOT_DIR, "logs", "missao.log")
AUDIT_LOG_PATH = os.path.join(ROOT_DIR, "logs", "auditoria.log")
LOG_MAX_BYTES  = 10 * 1024 * 1024

# Score minimo para usar doutrina — abaixo disso responde como assistente geral
# Valor entre 0 e 1. 0.35 e um bom ponto de partida; ajuste conforme testes.
SCORE_MINIMO_DOUTRINA = 0.80

_fernet_key = os.getenv("FERNET_KEY")
if not _fernet_key:
    raise RuntimeError(
        "FERNET_KEY nao encontrada no ambiente. Configure o arquivo .env."
    )
fernet = Fernet(_fernet_key.encode())

_MAX_HISTORICO  = 20
_historico_lock = threading.Lock()
_log_lock       = threading.Lock()
historico_conversa = []

print("[*] Carregando modelo de embeddings...")
_embeddings = HuggingFaceEmbeddings(model_name="intfloat/multilingual-e5-small")
print("[*] Conectando ao ChromaDB...")
_db = Chroma(persist_directory=CHROMA_DIR, embedding_function=_embeddings)
print(f"[+] ChromaDB carregado: {_db._collection.count()} chunks indexados.")

_GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not _GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY nao encontrada no ambiente.")
_groq_client = Groq(api_key=_GROQ_API_KEY)


# --- Logs criptografados ------------------------------------------------------

def _rotar_log_se_necessario() -> None:
    if not os.path.exists(LOG_PATH):
        return
    if os.path.getsize(LOG_PATH) < LOG_MAX_BYTES:
        return
    backup = LOG_PATH + ".old"
    if os.path.exists(backup):
        os.remove(backup)
    os.rename(LOG_PATH, backup)
    registrar_auditoria("LOG_ROTACIONADO", f"BACKUP={backup}")


def salvar_log_criptografado(texto: str) -> None:
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    _rotar_log_se_necessario()
    token = fernet.encrypt(texto.encode())
    with _log_lock:
        with open(LOG_PATH, "ab") as f:
            f.write(token + b"\n")


def registrar_auditoria(acao: str, detalhes: str = "") -> None:
    os.makedirs(os.path.dirname(AUDIT_LOG_PATH), exist_ok=True)
    ts = datetime.now(timezone.utc).isoformat()
    try:
        operador = getpass.getuser()
    except Exception:
        operador = "desconhecido"
    try:
        host = socket.gethostname()
    except Exception:
        host = "desconhecido"
    entrada = (
        f"[{ts}] ACAO={acao} | "
        f"OPERADOR={operador} | HOST={host} | "
        f"PID={os.getpid()} | {detalhes}\n"
    )
    with open(AUDIT_LOG_PATH, "a", encoding="utf-8") as f:
        f.write(entrada)


def carregar_memoria_recente() -> bool:
    global historico_conversa
    if not os.path.exists(LOG_PATH):
        return False
    try:
        with open(LOG_PATH, "rb") as f:
            linhas = f.readlines()
        with _historico_lock:
            for linha in linhas[-4:]:
                entrada = fernet.decrypt(linha.strip()).decode()
                if " | BASTOS: " in entrada:
                    partes = entrada.split(" | BASTOS: ", 1)
                    historico_conversa.append(partes[0])
                    historico_conversa.append(f"BASTOS: {partes[1]}")
                else:
                    historico_conversa.append(entrada)
        return True
    except Exception:
        return False


def _adicionar_historico(pergunta: str, resposta: str) -> None:
    with _historico_lock:
        historico_conversa.append(f"AGENTE: {pergunta}")
        historico_conversa.append(f"BASTOS: {resposta}")
        if len(historico_conversa) > _MAX_HISTORICO:
            del historico_conversa[: len(historico_conversa) - _MAX_HISTORICO]


def _snapshot_historico() -> str:
    with _historico_lock:
        return "\n".join(historico_conversa[-6:])


# --- Nucleo do RAG hibrido ----------------------------------------------------

def _buscar_doutrina_com_score(pergunta: str, top_k: int = 6):
    """
    Busca os top_k chunks mais proximos e retorna junto com o score.
    top_k=6 para ter margem de filtragem — so os acima do SCORE_MINIMO sao usados.
    """
    return _db.similarity_search_with_relevance_scores(pergunta, k=top_k)


def _montar_prompt_doutrinario(pergunta: str, contexto: str, historico: str) -> str:
    """
    Prompt para quando ha doutrina relevante disponivel.
    O modelo usa a doutrina como base mas pode complementar com conhecimento geral.
    """
    return (
        "### IDENTIDADE\n"
        "Voce e o BASTOS-UNIT, assistente tecnico de inteligencia de seguranca publica "
        "e corporativa. Voce e especialista em inteligencia, contrainteligencia, "
        "seguranca institucional e analise de risco.\n\n"
        "### INSTRUCAO\n"
        "Responda com base nos trechos doutrinarios abaixo. "
        "Quando a doutrina nao cobrir completamente a pergunta, complemente com seu "
        "conhecimento tecnico na area de inteligencia e seguranca. "
        "Seja direto, tecnico e objetivo. Use linguagem profissional.\n\n"
        f"### DOUTRINA RECUPERADA\n{contexto}\n\n"
        f"### HISTORICO RECENTE\n{historico}\n\n"
        f"### PERGUNTA\n{pergunta}\n\n"
        "### RESPOSTA TECNICA:"
    )


def _montar_prompt_geral(pergunta: str, historico: str) -> str:
    """
    Prompt para perguntas gerais sem contexto doutrinario relevante.
    O modelo responde como assistente tecnico especializado.
    """
    return (
        "### IDENTIDADE\n"
        "Voce e o BASTOS-UNIT, assistente tecnico especializado em inteligencia "
        "de seguranca publica e corporativa, analise de risco, OSINT, redacao "
        "de documentos operacionais e suporte tecnico geral.\n\n"
        "### INSTRUCAO\n"
        "Responda a pergunta do agente de forma direta e util. "
        "Para perguntas tecnicas da area de inteligencia, seja aprofundado. "
        "Para perguntas operacionais do dia a dia, seja pratico e objetivo. "
        "Mantenha sempre o contexto de um analista de inteligencia de seguranca.\n\n"
        f"### HISTORICO RECENTE\n{historico}\n\n"
        f"### PERGUNTA\n{pergunta}\n\n"
        "### RESPOSTA:"
    )


def conversar_com_fontes(pergunta: str) -> dict:
    """
    RAG hibrido com roteamento por score de relevancia.

    Fluxo:
    1. Busca os chunks mais proximos com score
    2. Filtra apenas os acima do SCORE_MINIMO_DOUTRINA
    3. Se ha chunks relevantes → usa prompt doutrinario
    4. Se nao ha → usa prompt de assistente geral
    5. Retorna resposta + fontes + score + modo usado
    """
    historico = _snapshot_historico()
    resultados = _buscar_doutrina_com_score(pergunta, top_k=6)

    # Filtra chunks com score acima do minimo
    resultados_relevantes = [
        (doc, score) for doc, score in resultados
        if score >= SCORE_MINIMO_DOUTRINA
    ]

    fontes = []
    modo   = "geral"

    if resultados_relevantes:
        modo = "doutrina"
        partes_contexto = []
        for i, (doc, score) in enumerate(resultados_relevantes, 1):
            fonte = doc.metadata.get("fonte", "desconhecida")
            partes_contexto.append(
                f"[TRECHO {i} - FONTE: {fonte} - RELEVANCIA: {round(score*100)}%]\n"
                f"{doc.page_content}"
            )
            fontes.append({
                "id":     i,
                "fonte":  fonte,
                "trecho": doc.page_content[:300].strip(),
                "score":  round(score * 100, 1),
            })
        contexto   = "\n\n".join(partes_contexto)
        prompt     = _montar_prompt_doutrinario(pergunta, contexto, historico)
    else:
        # Sem doutrina relevante — registra os candidatos rejeitados para debug
        fontes = [
            {
                "id":     i,
                "fonte":  doc.metadata.get("fonte", "desconhecida"),
                "trecho": doc.page_content[:200].strip(),
                "score":  round(score * 100, 1),
            }
            for i, (doc, score) in enumerate(resultados[:3], 1)
        ]
        prompt = _montar_prompt_geral(pergunta, historico)

    confianca = (
        round(sum(f["score"] for f in fontes) / len(fontes), 1)
        if fontes else 0
    )

    try:
        completion = _groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1500,
        )
        resposta = completion.choices[0].message.content
    except Exception as e:
        return {"resposta": f"FALHA: {e}", "fontes": fontes, "confianca": 0, "modo": modo}

    _adicionar_historico(pergunta, resposta)
    salvar_log_criptografado(f"AGENTE: {pergunta} | BASTOS: {resposta}")

    return {
        "resposta":  resposta,
        "fontes":    fontes,
        "confianca": confianca,
        "modo":      modo,  # "doutrina" ou "geral" — util para o frontend mostrar
    }


# Mantida para compatibilidade com codigo legado
def conversar_com_bastos(pergunta: str) -> str:
    return conversar_com_fontes(pergunta)["resposta"]


if __name__ == "__main__":
    print("\n" + "=" * 55)
    print("   AGENT BASTOS - SISTEMA DE INTELIGENCIA SOBERANA")
    print("=" * 55)
    print("\n[*] Carregando memorias criptografadas...")
    if carregar_memoria_recente():
        print("[+] Contexto recuperado.")
    else:
        print("[!] Sessao iniciada limpa.")
    print(f"[*] Score minimo para doutrina: {SCORE_MINIMO_DOUTRINA}\n")

    while True:
        try:
            comando = input("[AGENTE]> ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\n[!] Sessao encerrada.")
            break
        if not comando:
            continue
        if comando.lower() in ("sair", "exit"):
            break
        if comando.lower() == "protocolo-zero":
            print("\n[!] Digite CONFIRMO para destruir os logs:")
            try:
                confirmacao = input("    > ").strip()
            except (KeyboardInterrupt, EOFError):
                continue
            if confirmacao != "CONFIRMO":
                print("[!] Cancelado.")
                continue
            log_existia = os.path.exists(LOG_PATH)
            registrar_auditoria(
                "PROTOCOLO_ZERO_ATIVADO",
                f"LOG_PATH={LOG_PATH} | LOG_EXISTIA={log_existia}"
            )
            if log_existia:
                os.remove(LOG_PATH)
            print("[!] DADOS ELIMINADOS.")
            break
        print("\n[PROCESSANDO...]")
        resultado = conversar_com_fontes(comando)
        print(f"\n[MODO: {resultado['modo'].upper()}]")
        print(f"[CONFIANCA: {resultado['confianca']}%]")
        print(f"\n[BASTOS]> {resultado['resposta']}\n")