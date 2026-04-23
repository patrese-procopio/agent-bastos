import requests
import json
from cryptography.fernet import Fernet
import os

# --- CONFIGURAÇÃO DE SEGURANÇA ---
CHAVE = b'HO-eVf31rwjok3MHPYnwUJ3sEemwwLHbw8P7rLCGisY='
fernet = Fernet(CHAVE)

# MEMÓRIA DE TRABALHO (AGORA INICIALIZADA PELO LOG)
historico_conversa = []

def salvar_log_criptografado(texto):
    token = fernet.encrypt(texto.encode())
    with open("missao.log", "ab") as f:
        f.write(token + b"\n")

def carregar_memoria_recente():
    """Lê os últimos registros do log para dar contexto ao Bastos na abertura"""
    global historico_conversa
    if os.path.exists("missao.log"):
        try:
            with open("missao.log", "rb") as f:
                linhas = f.readlines()
                # Pega as últimas 4 linhas (2 trocas de conversa) para não sobrecarregar
                ultimas_linhas = linhas[-4:] 
                for linha in ultimas_linhas:
                    texto_claro = fernet.decrypt(linha.strip()).decode()
                    historico_conversa.append(texto_claro)
            return True
        except:
            return False
    return False

def carregar_doutrina():
    caminho_pasta = "doutrina"
    conteudo_completo = ""
    if os.path.exists(caminho_pasta):
        for arquivo in os.listdir(caminho_pasta):
            if arquivo.endswith(".txt"):
                with open(os.path.join(caminho_pasta, arquivo), 'r', encoding='utf-8') as f:
                    conteudo_completo += f"\n--- FONTE: {arquivo} ---\n{f.read()}\n"
    return conteudo_completo

def conversar_com_bastos(pergunta):
    global historico_conversa
    url = "http://localhost:11434/api/generate"
    conhecimento = carregar_doutrina()
    contexto_passado = "\n".join(historico_conversa[-6:]) # Mantém as últimas 6 interações
    
    prompt_final = (
        f"### DIRETRIZES: Você é o BASTOS-UNIT, analista técnico de inteligência.\n"
        f"### DOUTRINA BASE:\n{conhecimento}\n\n"
        f"### HISTÓRICO RECENTE:\n{contexto_passado}\n\n"
        f"### PERGUNTA ATUAL: {pergunta}\n\n"
        f"### RESPOSTA TÉCNICA:"
    )
    
    corpo = {"model": "llama3.2:1b", "prompt": prompt_final, "stream": False}
    
    try:
        res = requests.post(url, json=corpo)
        if res.status_code == 200:
            resposta = json.loads(res.text)['response']
            historico_conversa.append(f"Agente: {pergunta}")
            historico_conversa.append(f"Bastos: {resposta}")
            salvar_log_criptografado(f"AGENTE: {pergunta} | BASTOS: {resposta}")
            return resposta
        return "ERRO: Motor offline."
    except Exception as e:
        return f"FALHA: {e}"

# --- INICIALIZAÇÃO DO SISTEMA ---
print("\n" + "="*50)
print("   AGENT BASTOS - SISTEMA DE INTELIGÊNCIA SOBERANA")
print("="*50)

print("[*] Carregando memórias criptografadas...")
if carregar_memoria_recente():
    print("[+] Contexto recuperado do último log com sucesso.")
else:
    print("[!] Nenhum log anterior encontrado ou erro de chave.")

print("[*] Sincronizando doutrinas locais...")

while True:
    comando = input("\n[AGENTE]> ")
    if comando.lower() == 'protocolo-zero':
        if os.path.exists("missao.log"): os.remove("missao.log")
        print("\n[!] DADOS ELIMINADOS. SESSÃO ENCERRADA.")
        break
    if comando.lower() in ['sair', 'exit']: break
    
    print("\n[PROCESSANDO COM PERSISTÊNCIA DE DADOS...]")
    analise = conversar_com_bastos(comando)
    print(f"\n[BASTOS]> {analise}")