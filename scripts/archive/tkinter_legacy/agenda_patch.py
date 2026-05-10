"""
agenda.py — Agenda Operacional da AIPEN
Agent Bastos | Inteligência Penitenciária

PATCH v2: adiciona campo 'status' nas missões e função acusar_ciencia()
Não remove nenhuma função existente — compatível com código anterior.
"""

import customtkinter as ctk
import threading
import os
import hashlib
from config.settings import FIREBASE_KEY_PATH
from datetime import datetime
from tkinter import messagebox

import firebase_admin
from firebase_admin import credentials, firestore

# ─────────────────────────────────────────────
# CONFIGURAÇÃO
# ─────────────────────────────────────────────
FIREBASE_CREDENTIALS = FIREBASE_KEY_PATH

SENHA_CHEFE_HASH = hashlib.sha256("aipen2025".encode()).hexdigest()

NUCLEOS = {
    "NI":      "Núcleo de Inteligência",
    "NCI":     "Núcleo de Contrainteligência",
    "NBE":     "Núcleo de Busca Eletrônica",
    "NUCADIS": "Núcleo de Coleta e Análise",
    "AIPEN":   "Assessoria de Inteligência Penitenciária (TODOS)",
}

# ─────────────────────────────────────────────
# FIREBASE
# ─────────────────────────────────────────────

_db = None

def _obter_db():
    global _db
    if _db is None:
        if not firebase_admin._apps:
            cred = credentials.Certificate(FIREBASE_CREDENTIALS)
            firebase_admin.initialize_app(cred)
        _db = firestore.client()
    return _db


# ─────────────────────────────────────────────
# PUBLICAR MISSÃO — agora com status: "pendente"
# ─────────────────────────────────────────────

def publicar_missao(nucleo: str, mensagem: str) -> bool:
    """
    Salva missão no Firestore com status 'pendente'.
    O campo 'ciencia_em' e 'ciencia_nucleo' são preenchidos
    quando o destinatário acusa ciência via acusar_ciencia().
    """
    try:
        db = _obter_db()
        db.collection("missoes").add({
            "nucleo":        nucleo,
            "mensagem":      mensagem,
            "timestamp":     firestore.SERVER_TIMESTAMP,
            "status":        "pendente",   # novo campo
            "ciencia_em":    None,         # preenchido ao acusar
            "ciencia_nucleo": None,        # qual núcleo acusou
        })
        return True
    except Exception as e:
        print(f"[AGENDA] Erro ao publicar: {e}")
        return False


# ─────────────────────────────────────────────
# ACUSAR CIÊNCIA — endpoint chamado pelo agente
# ─────────────────────────────────────────────

def acusar_ciencia(missao_id: str, nucleo: str) -> bool:
    """
    Atualiza status da missão para 'ciencia' no Firestore.
    Registra quem acusou e quando.
    """
    try:
        db = _obter_db()
        db.collection("missoes").document(missao_id).update({
            "status":         "ciencia",
            "ciencia_em":     firestore.SERVER_TIMESTAMP,
            "ciencia_nucleo": nucleo,
        })
        return True
    except Exception as e:
        print(f"[AGENDA] Erro ao acusar ciência: {e}")
        return False


# ─────────────────────────────────────────────
# BUSCAR MISSÕES — inalterada (compatível)
# ─────────────────────────────────────────────

def buscar_missoes_recentes(nucleo: str = None, limite: int = 20) -> list:
    try:
        db = _obter_db()
        todas = db.collection("missoes").order_by(
            "timestamp", direction=firestore.Query.DESCENDING
        ).limit(100).stream()

        resultado = []
        for doc in todas:
            d = doc.to_dict()
            d["id"] = doc.id          # garante que o id vem junto
            nucleo_doc = d.get("nucleo", "")
            if nucleo is None or nucleo == "AIPEN":
                resultado.append(d)
            elif nucleo_doc == nucleo or nucleo_doc == "AIPEN":
                resultado.append(d)
            if len(resultado) >= limite:
                break
        return resultado
    except Exception as e:
        print(f"[AGENDA] Erro ao buscar: {e}")
        return []


# ─────────────────────────────────────────────
# NOTIFICAÇÃO AUTOMÁTICA (desktop — inalterada)
# ─────────────────────────────────────────────

_ultimo_total_missoes = -1
_monitoramento_ativo  = False


def iniciar_monitoramento(parent_app, intervalo_segundos: int = 60):
    global _monitoramento_ativo
    if _monitoramento_ativo:
        return
    _monitoramento_ativo = True
    _verificar_novas_missoes(parent_app, intervalo_segundos)


def _verificar_novas_missoes(parent_app, intervalo: int):
    global _ultimo_total_missoes

    def _buscar():
        global _ultimo_total_missoes
        try:
            missoes = buscar_missoes_recentes(limite=50)
            total = len(missoes)
            if _ultimo_total_missoes == -1:
                _ultimo_total_missoes = total
            elif total > _ultimo_total_missoes:
                novas = total - _ultimo_total_missoes
                _ultimo_total_missoes = total
                parent_app.after(0, lambda n=novas, m=missoes[0]: _popup_nova_missao(parent_app, n, m))
        except Exception as e:
            print(f"[NOTIFICAÇÃO] Erro: {e}")
        parent_app.after(intervalo * 1000, lambda: _verificar_novas_missoes(parent_app, intervalo))

    threading.Thread(target=_buscar, daemon=True).start()


def _popup_nova_missao(parent_app, quantidade: int, missao: dict):
    import winsound
    try:
        winsound.Beep(1000, 500)
    except Exception:
        pass

    nucleo  = missao.get("nucleo", "—")
    preview = missao.get("mensagem", "")[:80]
    if len(missao.get("mensagem", "")) > 80:
        preview += "..."

    popup = ctk.CTkToplevel(parent_app)
    popup.title("🔔 NOVA MISSÃO")
    popup.geometry("420x220")
    popup.attributes("-topmost", True)
    popup.grab_set()

    ctk.CTkLabel(popup, text=f"🔔  {quantidade} NOVA{'S' if quantidade > 1 else ''} MISSÃO{'ES' if quantidade > 1 else ''}",
                 font=("Roboto", 16, "bold"), text_color="#ef5350").pack(pady=(20, 4))
    ctk.CTkLabel(popup, text=f"Núcleo: {nucleo}", font=("Roboto", 12, "bold"), text_color="#4fc3f7").pack()
    ctk.CTkLabel(popup, text=preview, font=("Roboto", 11), wraplength=380).pack(pady=(8, 16), padx=20)
    ctk.CTkButton(popup, text="OK — Entendido", command=popup.destroy, height=38,
                  font=("Roboto", 12, "bold"), fg_color="#1565c0", hover_color="#0d47a1").pack(padx=30, fill="x")


# ─────────────────────────────────────────────
# LOGIN / UI TKINTER (inalterados)
# ─────────────────────────────────────────────

def _verificar_senha(senha: str) -> bool:
    return hashlib.sha256(senha.encode()).hexdigest() == SENHA_CHEFE_HASH


def _janela_login(parent, callback_sucesso):
    janela = ctk.CTkToplevel(parent)
    janela.title("Acesso Restrito — Chefe AIPEN")
    janela.geometry("380x280")
    janela.grab_set()
    janela.resizable(False, False)

    ctk.CTkLabel(janela, text="🔒  ACESSO RESTRITO", font=("Roboto", 16, "bold"), text_color="#ef5350").pack(pady=(24, 4))
    ctk.CTkLabel(janela, text="Área exclusiva do Chefe da AIPEN", font=("Roboto", 11), text_color="gray").pack(pady=(0, 20))
    ctk.CTkLabel(janela, text="Senha:", font=("Roboto", 12), anchor="w").pack(padx=30, anchor="w")
    campo_senha = ctk.CTkEntry(janela, show="●", height=40, font=("Roboto", 13))
    campo_senha.pack(padx=30, pady=(4, 6), fill="x")
    campo_senha.focus()
    msg_erro = ctk.CTkLabel(janela, text="", font=("Roboto", 11), text_color="#ef5350")
    msg_erro.pack()

    def _confirmar(event=None):
        senha = campo_senha.get()
        if _verificar_senha(senha):
            janela.destroy()
            callback_sucesso()
        else:
            msg_erro.configure(text="❌ Senha incorreta. Tente novamente.")
            campo_senha.delete(0, "end")
            campo_senha.focus()

    campo_senha.bind("<Return>", _confirmar)
    ctk.CTkButton(janela, text="ENTRAR", command=_confirmar, height=40,
                  font=("Roboto", 13, "bold"), fg_color="#1565c0", hover_color="#0d47a1").pack(padx=30, pady=(8, 0), fill="x")


def _abrir_submenu_lancamento(parent):
    menu = ctk.CTkToplevel(parent)
    menu.title("Selecionar Núcleo")
    menu.geometry("320x370")
    menu.grab_set()
    menu.resizable(False, False)

    ctk.CTkLabel(menu, text="LANÇAR MISSÃO PARA:", font=("Roboto", 13, "bold")).pack(pady=(20, 10))

    for key, nome in NUCLEOS.items():
        cor   = "#1a237e" if key != "AIPEN" else "#1b5e20"
        hover = "#0d1457" if key != "AIPEN" else "#0a3d0a"
        ctk.CTkButton(menu, text=f"{key}  —  {nome}",
                      command=lambda k=key: [menu.destroy(), _abrir_lancamento(k, parent)],
                      height=38, font=("Roboto", 12), fg_color=cor, hover_color=hover).pack(pady=4, padx=20, fill="x")


def _abrir_lancamento(nucleo_key: str, parent):
    nucleo_nome = NUCLEOS[nucleo_key]
    janela = ctk.CTkToplevel(parent)
    janela.title(f"Lançar Missão — {nucleo_key}")
    janela.geometry("620x530")
    janela.grab_set()
    janela.resizable(False, False)

    ctk.CTkLabel(janela, text="SECRETARIA DE ESTADO DE ADMINISTRAÇÃO PENITENCIÁRIA - SEAP-AM",
                 font=("Roboto", 11, "bold"), text_color="#aaaaaa").pack(pady=(18, 0))
    ctk.CTkLabel(janela, text="ASSESSORIA DE INTELIGÊNCIA PENITENCIÁRIA - AIPEN",
                 font=("Roboto", 11, "bold"), text_color="#aaaaaa").pack()
    ctk.CTkLabel(janela, text="─" * 72, text_color="gray").pack(pady=(4, 0))
    ctk.CTkLabel(janela, text=f"DESTINATÁRIO: {nucleo_nome}",
                 font=("Roboto", 13, "bold"), text_color="#4fc3f7").pack(pady=(10, 4))
    ctk.CTkLabel(janela, text="MENSAGEM / MISSÃO:", font=("Roboto", 11), anchor="w").pack(padx=20, anchor="w")
    caixa_texto = ctk.CTkTextbox(janela, height=200, font=("Roboto", 13))
    caixa_texto.pack(padx=20, pady=(4, 10), fill="x")
    caixa_texto.focus()
    ctk.CTkLabel(janela, text="─" * 72, text_color="gray").pack()
    ctk.CTkLabel(janela, text="⚠️  Assim que concluída, favor dar o pronto ao chefe da AIPEN.",
                 font=("Roboto", 11), text_color="#ffcc80").pack(pady=(4, 0))
    ctk.CTkLabel(janela, text="🦉  Corujas, juntos somos mais.",
                 font=("Roboto", 11, "bold"), text_color="#a5d6a7").pack(pady=(2, 10))

    def _publicar():
        mensagem = caixa_texto.get("1.0", "end").strip()
        if not mensagem:
            messagebox.showwarning("Atenção", "Digite a mensagem antes de publicar.")
            return
        btn_pub.configure(text="Publicando...", state="disabled")
        def _enviar():
            sucesso = publicar_missao(nucleo_key, mensagem)
            janela.after(0, lambda: _pos_publicacao(sucesso))
        threading.Thread(target=_enviar, daemon=True).start()

    def _pos_publicacao(sucesso):
        if sucesso:
            messagebox.showinfo("Publicado", "Missão lançada com sucesso!")
            janela.destroy()
        else:
            messagebox.showerror("Erro", "Falha ao publicar. Verifique a conexão.")
            btn_pub.configure(text="📤  Publicar Missão", state="normal")

    btn_pub = ctk.CTkButton(janela, text="📤  Publicar Missão", command=_publicar, height=42,
                            font=("Roboto", 13, "bold"), fg_color="#1565c0", hover_color="#0d47a1")
    btn_pub.pack(padx=20, pady=(0, 16), fill="x")


def _abrir_visualizacao(nucleo_key: str, parent):
    nucleo_nome = NUCLEOS[nucleo_key]
    janela = ctk.CTkToplevel(parent)
    janela.title(f"Agenda — {nucleo_key}")
    janela.geometry("680x600")
    janela.grab_set()

    ctk.CTkLabel(janela, text="SECRETARIA DE ESTADO DE ADMINISTRAÇÃO PENITENCIÁRIA - SEAP-AM",
                 font=("Roboto", 11, "bold"), text_color="#aaaaaa").pack(pady=(18, 0))
    ctk.CTkLabel(janela, text="ASSESSORIA DE INTELIGÊNCIA PENITENCIÁRIA - AIPEN",
                 font=("Roboto", 11, "bold"), text_color="#aaaaaa").pack()
    ctk.CTkLabel(janela, text="─" * 72, text_color="gray").pack(pady=(4, 0))
    ctk.CTkLabel(janela, text=f"MISSÕES — {nucleo_nome}",
                 font=("Roboto", 13, "bold"), text_color="#4fc3f7").pack(pady=(8, 4))
    display = ctk.CTkTextbox(janela, font=("Roboto", 13), state="disabled")
    display.pack(padx=20, pady=(4, 8), fill="both", expand=True)
    ctk.CTkLabel(janela, text="─" * 72, text_color="gray").pack()
    ctk.CTkLabel(janela, text="⚠️  Assim que concluída, favor dar o pronto ao chefe da AIPEN.",
                 font=("Roboto", 11), text_color="#ffcc80").pack(pady=(4, 0))
    ctk.CTkLabel(janela, text="🦉  Corujas, juntos somos mais.",
                 font=("Roboto", 11, "bold"), text_color="#a5d6a7").pack(pady=(2, 12))

    btn_att = ctk.CTkButton(janela, text="🔄  Atualizar",
                            command=lambda: _carregar(nucleo_key, display, btn_att),
                            height=38, font=("Roboto", 12, "bold"), fg_color="#2e7d32", hover_color="#1b5e20")
    btn_att.pack(padx=20, pady=(0, 16), fill="x")
    _carregar(nucleo_key, display, btn_att)


def _carregar(nucleo_key, display, btn):
    btn.configure(text="Carregando...", state="disabled")
    def _buscar():
        missoes = buscar_missoes_recentes(nucleo_key)
        display.after(0, lambda: _renderizar(missoes, display, btn))
    threading.Thread(target=_buscar, daemon=True).start()


def _renderizar(missoes, display, btn):
    display.configure(state="normal")
    display.delete("1.0", "end")
    if not missoes:
        display.insert("end", "Nenhuma missão registrada para este núcleo.\n")
    else:
        for m in missoes:
            ts = m.get("timestamp")
            data_str = ts.strftime("%d/%m/%Y %H:%M") if ts else "—"
            status = m.get("status", "pendente")
            display.insert("end", f"📅 {data_str}  |  🎯 {m.get('nucleo', '—')}  |  {status.upper()}\n")
            display.insert("end", f"{m.get('mensagem', '')}\n")
            display.insert("end", "─" * 55 + "\n\n")
    display.configure(state="disabled")
    display.see("1.0")
    btn.configure(text="🔄  Atualizar", state="normal")


def adicionar_agenda_sidebar(sidebar: ctk.CTkFrame, parent_app):
    ctk.CTkLabel(sidebar, text="─" * 18, text_color="gray").pack(pady=8)
    ctk.CTkLabel(sidebar, text="AGENDA OPERACIONAL", font=("Roboto", 11, "bold"), text_color="gray").pack()

    ctk.CTkButton(sidebar, text="🔒  Lançar Missão",
                  command=lambda: _janela_login(parent_app, lambda: _abrir_submenu_lancamento(parent_app)),
                  height=40, font=("Roboto", 13, "bold"), fg_color="#4a148c", hover_color="#38006b").pack(pady=(8, 3), padx=15, fill="x")

    for key in NUCLEOS:
        cor   = "#1565c0" if key != "AIPEN" else "#1b5e20"
        hover = "#0d47a1" if key != "AIPEN" else "#0a3d0a"
        ctk.CTkButton(sidebar, text=f"👁  {key}",
                      command=lambda k=key: _abrir_visualizacao(k, parent_app),
                      height=34, font=("Roboto", 12), fg_color=cor, hover_color=hover).pack(pady=2, padx=15, fill="x")
