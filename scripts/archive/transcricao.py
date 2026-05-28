from groq import Groq
import customtkinter as ctk
import threading, os, glob
from datetime import datetime
from tkinter import filedialog

PASTA_AUDIOS = os.environ.get(
    "PASTA_AUDIOS",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "audios"),
)
MODELO_WHISPER = "whisper-large-v3-turbo"
FORMATOS_AUDIO = ["*.wav", "*.mp3", "*.ogg", "*.m4a", "*.flac"]

def transcrever_audio(caminho: str, client) -> str:
    with open(caminho, "rb") as f:
        resultado = client.audio.transcriptions.create(
            file=(os.path.basename(caminho), f),
            model=MODELO_WHISPER,
            language="pt",
            response_format="text",
            prompt="Áudio operacional SEAP/AM. Terminologia policial e penitenciária brasileira.",
        )
    return resultado

def formatar_relatorio(transcricao: str, arquivo: str, client) -> str:
    resposta = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": (
            "Formate como Relatório de Informação (RI) da SEAP/AM:\n\n"
            f"TRANSCRIÇÃO:\n{transcricao}\n\n"
            "Inclua: ORIGEM, RESUMO EXECUTIVO (3-5 linhas), "
            "CONFIABILIDADE DA FONTE (A-D), TRANSCRIÇÃO ESTRUTURADA, "
            "OBSERVAÇÕES DO ANALISTA, CLASSIFICAÇÃO SUGERIDA.\n"
            "Retorne apenas o relatório, sem comentários."
        )}],
        temperature=0.2,
    )
    return resposta.choices[0].message.content

class TranscricaoTab:
    def __init__(self, parent, client):
        self.parent = parent
        self.client = client
        self.arquivo_selecionado = None
        self._build_ui()
        self._listar_audios()

    def _build_ui(self):
        self.parent.grid_columnconfigure(0, weight=1)
        self.parent.grid_columnconfigure(1, weight=2)
        self.parent.grid_rowconfigure(0, weight=1)

        esq = ctk.CTkFrame(self.parent)
        esq.grid(row=0, column=0, padx=(10,5), pady=10, sticky="nsew")
        esq.grid_rowconfigure(2, weight=1)
        esq.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(esq, text="🎙 Áudios gravados",
                     font=ctk.CTkFont(size=14, weight="bold")
                     ).grid(row=0, column=0, padx=15, pady=(15,5), sticky="w")

        self.lista = ctk.CTkScrollableFrame(esq, height=200)
        self.lista.grid(row=2, column=0, padx=10, pady=5, sticky="nsew")

        ctk.CTkButton(esq, text="↻ Atualizar", height=32,
                      fg_color="transparent", border_width=1,
                      command=self._listar_audios
                      ).grid(row=3, column=0, padx=10, pady=5, sticky="ew")

        ctk.CTkButton(esq, text="📂 Procurar arquivo", height=32,
                      fg_color="transparent", border_width=1,
                      command=self._procurar_arquivo
                      ).grid(row=4, column=0, padx=10, pady=5, sticky="ew")

        self.lbl_sel = ctk.CTkLabel(esq, text="Nenhum arquivo selecionado",
                                    font=ctk.CTkFont(size=11), text_color="gray",
                                    wraplength=200)
        self.lbl_sel.grid(row=5, column=0, padx=15, pady=5)

        self.btn = ctk.CTkButton(esq, text="▶ TRANSCREVER", height=42,
                                 font=ctk.CTkFont(size=13, weight="bold"),
                                 command=self._iniciar)
        self.btn.grid(row=6, column=0, padx=10, pady=(5,15), sticky="ew")

        self.lbl_status = ctk.CTkLabel(esq, text="",
                                       font=ctk.CTkFont(size=11), text_color="gray")
        self.lbl_status.grid(row=7, column=0, padx=10, pady=(0,10))

        dir = ctk.CTkFrame(self.parent)
        dir.grid(row=0, column=1, padx=(5,10), pady=10, sticky="nsew")
        dir.grid_rowconfigure(1, weight=1)
        dir.grid_columnconfigure(0, weight=1)

        header = ctk.CTkFrame(dir, fg_color="transparent")
        header.grid(row=0, column=0, padx=15, pady=(15,5), sticky="ew")
        header.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(header, text="📄 Relatório de Informação — RI",
                     font=ctk.CTkFont(size=14, weight="bold")
                     ).grid(row=0, column=0, sticky="w")

        ctk.CTkButton(header, text="🗑 Limpar", width=80, height=28,
                      fg_color="transparent", border_width=1,
                      command=lambda: self._escrever("")
                      ).grid(row=0, column=1, padx=(10,0))

        self.txt = ctk.CTkTextbox(dir,
                                  font=ctk.CTkFont(family="Courier New", size=12),
                                  wrap="word", state="disabled")
        self.txt.grid(row=1, column=0, padx=10, pady=(0,10), sticky="nsew")

    def _listar_audios(self):
        for w in self.lista.winfo_children():
            w.destroy()
        os.makedirs(PASTA_AUDIOS, exist_ok=True)

        arquivos = sorted(
            [f for p in FORMATOS_AUDIO
             for f in glob.glob(os.path.join(PASTA_AUDIOS, p))],
            key=os.path.getmtime, reverse=True
        )

        if not arquivos:
            ctk.CTkLabel(self.lista,
                         text=f"Nenhum áudio em:\n{PASTA_AUDIOS}",
                         text_color="gray", font=ctk.CTkFont(size=11)
                         ).pack(padx=5, pady=10)
            return

        for c in arquivos:
            nome = os.path.basename(c)
            kb = os.path.getsize(c) // 1024
            data = datetime.fromtimestamp(
                os.path.getmtime(c)).strftime("%d/%m %H:%M")
            ctk.CTkButton(self.lista,
                          text=f"🎙 {nome}\n{data} • {kb} KB",
                          anchor="w", height=48,
                          fg_color="transparent",
                          hover_color=("gray85", "gray25"),
                          font=ctk.CTkFont(size=11),
                          command=lambda c=c, n=nome: self._selecionar(c, n)
                          ).pack(fill="x", pady=2)

    def _procurar_arquivo(self):
        caminho = filedialog.askopenfilename(
            title="Selecionar áudio",
            filetypes=[("Áudios", "*.wav *.mp3 *.ogg *.m4a *.flac"), ("Todos", "*.*")]
        )
        if caminho:
            self._selecionar(caminho, os.path.basename(caminho))

    def _selecionar(self, caminho, nome):
        self.arquivo_selecionado = caminho
        self.lbl_sel.configure(text=f"✔ {nome}",
                               text_color=("#4CAF50", "#4CAF50"))

    def _iniciar(self):
        if not self.arquivo_selecionado:
            self.lbl_status.configure(text="⚠ Selecione um arquivo",
                                      text_color="orange")
            return
        self.btn.configure(state="disabled", text="⏳ Processando...")
        self.lbl_status.configure(text="Enviando para Whisper...", text_color="gray")
        self._escrever("⏳ Transcrevendo, aguarde...\n")
        threading.Thread(target=self._processar, daemon=True).start()

    def _processar(self):
        try:
            self._status("🎙 Whisper transcrevendo...")
            bruto = transcrever_audio(self.arquivo_selecionado, self.client)

            self._status("📝 Formatando relatório...")
            relatorio = formatar_relatorio(
                bruto,
                os.path.basename(self.arquivo_selecionado),
                self.client
            )

            agora = datetime.now().strftime("%d/%m/%Y às %H:%M")
            doc = (
                "SEAP/AM — AGÊNCIA DE INTELIGÊNCIA PENITENCIÁRIA\n"
                + "━" * 55 + "\n"
                + "RELATÓRIO DE INFORMAÇÃO — RI\n"
                + f"Data: {agora} | Origem: {os.path.basename(self.arquivo_selecionado)}\n"
                + "━" * 55 + "\n\n"
                + relatorio
                + "\n\n" + "━" * 55
                + "\n[Gerado pelo Agent Bastos]"
            )
            self.parent.after(0, lambda: self._exibir(doc))

        except Exception as e:
            self.parent.after(0, lambda: self._exibir(
                f"❌ Erro: {e}\n\nVerifique a chave Groq e o arquivo de áudio."
            ))
        finally:
            self.parent.after(0, lambda: self.btn.configure(
                state="normal", text="▶ TRANSCREVER"
            ))

    def _exibir(self, texto):
        self._escrever(texto)
        self.lbl_status.configure(text="✔ Relatório gerado",
                                  text_color=("#4CAF50", "#4CAF50"))

    def _escrever(self, texto):
        self.txt.configure(state="normal")
        self.txt.delete("1.0", "end")
        self.txt.insert("1.0", texto)
        self.txt.configure(state="disabled")

    def _status(self, msg):
        self.parent.after(0, lambda: self.lbl_status.configure(
            text=msg, text_color="gray"
        ))


if __name__ == "__main__":
    from groq import Groq
    from config.settings import GROQ_API_KEY
    client_teste = Groq(api_key=GROQ_API_KEY)
    app = ctk.CTk()
    app.title("Agent Bastos — Transcrição")
    app.geometry("900x600")
    ctk.set_appearance_mode("dark")
    TranscricaoTab(app, client_teste)
    app.mainloop()