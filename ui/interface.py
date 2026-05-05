"""
interface.py — Camada de UI do Agent Bastos
Responsabilidade: desenhar a tela e capturar eventos.
Não contém lógica de negócio. Delega tudo para modules/agente.py
"""

import customtkinter as ctk
import threading
from tkinter import filedialog

from modules.config_ui import abrir_configuracoes
from modules.agente import (
    consultar_agente,
    processar_missiva,
    iniciar_gravacao,
    parar_gravacao,
    esta_gravando,
)
from modules.agenda import adicionar_agenda_sidebar, iniciar_monitoramento
from modules.dashboard import abrir_dashboard
from drive_indexer.busca_referencias import BuscaReferenciaTab


# --- AÇÕES --- (ponte entre botão e lógica)

def _acao_consultar():
    pergunta = entry.get()
    if not pergunta:
        return
    _log(f"\n➤ VOCÊ: {pergunta}")
    _log("⏳ Analisando base de dados...")
    app.update()
    entry.delete(0, "end")

    def _executar():
        try:
            resposta = consultar_agente(pergunta)
            app.after(0, lambda: _log(f"🕵️ BASTOS: {resposta}\n{'_' * 60}"))
        except Exception as e:
            app.after(0, lambda: _log(f"❌ ERRO TÉCNICO: {e}"))

    threading.Thread(target=_executar, daemon=True).start()


def _acao_missiva():
    caminho = filedialog.askopenfilename(
        title="Selecionar Missiva",
        filetypes=[("Imagens", "*.png *.jpg *.jpeg *.bmp *.tiff *.webp"), ("Todos", "*.*")]
    )
    if not caminho:
        return
    _log(f"\n📎 MISSIVA ANEXADA: {caminho.split('/')[-1]}")
    _log("🔍 Transcrevendo com Claude Vision... aguarde.")

    def _executar():
        try:
            r = processar_missiva(caminho)
            if not r["ok"]:
                app.after(0, lambda: _log(f"⚠️ {r['mensagem']}"))
                return
            def _exibir():
                _log(f"✅ Transcrição concluída — confiança: {r['confianca']}")
                if r["revisao"]:
                    _log("⚠️ ATENÇÃO: revisão humana recomendada.")
                _log(f"\n🕵️ BASTOS [RELATÓRIO - {r['nome']}]:\n{r['relatorio']}")
                _log("_" * 60)
            app.after(0, _exibir)
        except Exception as e:
            app.after(0, lambda: _log(f"❌ ERRO NA TRANSCRIÇÃO: {e}"))

    threading.Thread(target=_executar, daemon=True).start()


def _acao_gravar():
    if not esta_gravando():
        btn_gravar.configure(text="⏹  Parar Gravação",
                             fg_color="#8b1a1a", hover_color="#6b1313")
        iniciar_gravacao(_log)
    else:
        def _restaurar_btn():
            btn_gravar.configure(text="🎙️  Gravar Entrevista",
                                fg_color="#2d6a2d", hover_color="#245224")
        parar_gravacao(_log, _restaurar_btn)


def _acao_busca_referencias():
    janela = ctk.CTkToplevel(app)
    janela.title("Agent Bastos — Busca de Referências")
    janela.geometry("960x680")
    janela.grab_set()
    BuscaReferenciaTab(janela).pack(fill="both", expand=True)


# --- HELPER DE LOG ---

def _log(texto: str):
    chat_display.configure(state="normal")
    chat_display.insert("end", texto + "\n")
    chat_display.configure(state="disabled")
    chat_display.see("end")


# --- CONSTRUÇÃO DA INTERFACE ---

ctk.set_appearance_mode("dark")
app = ctk.CTk()
app.title("AGENT BASTOS - MÓDULO DE INTELIGÊNCIA v1.5")
app.geometry("1000x650")
app.grid_columnconfigure(1, weight=1)
app.grid_rowconfigure(0, weight=1)

# Sidebar
sidebar = ctk.CTkFrame(app, width=220, corner_radius=0)
sidebar.grid(row=0, column=0, rowspan=2, sticky="nsew")
ctk.CTkLabel(sidebar, text="AGENT BASTOS",
             font=("Roboto", 22, "bold")).pack(pady=30)
ctk.CTkLabel(sidebar, text="Powered by\nLLaMA 3.3 70B",
             font=("Roboto", 11), text_color="gray").pack(pady=5)
ctk.CTkLabel(sidebar, text="─" * 18, text_color="gray").pack(pady=10)
ctk.CTkLabel(sidebar, text="FERRAMENTAS",
             font=("Roboto", 11, "bold"), text_color="gray").pack()

ctk.CTkButton(
    sidebar, text="📎  Anexar Missiva", command=_acao_missiva,
    height=40, font=("Roboto", 13, "bold"),
    fg_color="#1f538d", hover_color="#1a4570"
).pack(pady=(10, 5), padx=15, fill="x")

btn_gravar = ctk.CTkButton(
    sidebar, text="🎙️  Gravar Entrevista", command=_acao_gravar,
    height=40, font=("Roboto", 13, "bold"),
    fg_color="#2d6a2d", hover_color="#245224"
)
btn_gravar.pack(pady=(5, 10), padx=15, fill="x")

ctk.CTkButton(
    sidebar, text="📊  Dashboard AIPEN",
    command=lambda: abrir_dashboard(app),
    height=40, font=("Roboto", 13, "bold"),
    fg_color="#1a2a0a", hover_color="#243810"
).pack(pady=(5, 5), padx=15, fill="x")

ctk.CTkButton(
    sidebar, text="🔍  Busca de Referências", command=_acao_busca_referencias,
    height=40, font=("Roboto", 13, "bold"),
    fg_color="#1a3a5c", hover_color="#1a2a4c"
).pack(pady=(5, 5), padx=15, fill="x")
# No sidebar, depois do botão de Busca de Referências e ANTES de adicionar_agenda_sidebar:
ctk.CTkButton(
    sidebar, text="⚙️  Configurações",
    command=lambda: abrir_configuracoes(app),
    height=40, font=("Roboto", 13, "bold"),
    fg_color="#3a3a3a", hover_color="#4a4a4a"
).pack(pady=(5, 5), padx=15, fill="x")
adicionar_agenda_sidebar(sidebar, app)
iniciar_monitoramento(app, intervalo_segundos=60)

# Chat
chat_frame = ctk.CTkFrame(app, corner_radius=15)
chat_frame.grid(row=0, column=1, padx=20, pady=20, sticky="nsew")
chat_display = ctk.CTkTextbox(chat_frame, font=("Roboto", 15), corner_radius=10)
chat_display.pack(expand=True, fill="both", padx=15, pady=15)
chat_display.insert("end", "SISTEMA PRONTO. AGUARDANDO COMANDO...\n" + "=" * 50 + "\n")
chat_display.configure(state="disabled")

# Entrada
entry_frame = ctk.CTkFrame(app, fg_color="transparent")
entry_frame.grid(row=1, column=1, padx=20, pady=(0, 20), sticky="ew")
entry = ctk.CTkEntry(entry_frame, placeholder_text="Consulte a doutrina...", height=45)
entry.pack(side="left", expand=True, fill="x", padx=(0, 10))
entry.bind("<Return>", lambda e: _acao_consultar())

ctk.CTkButton(
    entry_frame, text="CONSULTAR", command=_acao_consultar,
    width=120, height=45, font=("Roboto", 14, "bold")
).pack(side="right")


# --- ENTRYPOINT ---

def main():
    app.mainloop()