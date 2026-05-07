"""
config_ui.py — Tela de Configurações do Agent Bastos
Responsabilidade: editar chaves de API, paths e preferências.
Salva direto no .env e recarrega as variáveis em memória.
"""

import customtkinter as ctk
import threading
import os
from tkinter import filedialog, messagebox
from pathlib import Path

# ─────────────────────────────────────────────
# HELPERS — leitura e escrita do .env
# ─────────────────────────────────────────────

def _encontrar_env() -> Path:
    """Sobe na árvore de diretórios até achar o .env do projeto."""
    base = Path(__file__).resolve().parent
    for candidato in [base, base.parent, base.parent.parent]:
        alvo = candidato / ".env"
        if alvo.exists():
            return alvo
    # Se não existir, cria na raiz do projeto (um nível acima de modules/)
    return base.parent / ".env"


def _ler_env(caminho: Path) -> dict:
    """Lê o .env e devolve dict {chave: valor}. Ignora comentários e linhas vazias."""
    dados = {}
    if not caminho.exists():
        return dados
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#"):
            continue
        if "=" in linha:
            chave, _, valor = linha.partition("=")
            dados[chave.strip()] = valor.strip().strip('"').strip("'")
    return dados


def _salvar_env(caminho: Path, dados: dict) -> None:
    """
    Reescreve o .env preservando comentários e ordem das chaves existentes.
    Novas chaves são adicionadas no final.
    """
    linhas_originais = []
    if caminho.exists():
        linhas_originais = caminho.read_text(encoding="utf-8").splitlines()

    chaves_escritas = set()
    novas_linhas = []

    for linha in linhas_originais:
        stripped = linha.strip()
        if not stripped or stripped.startswith("#"):
            novas_linhas.append(linha)
            continue
        if "=" in stripped:
            chave = stripped.split("=")[0].strip()
            if chave in dados:
                novas_linhas.append(f'{chave}="{dados[chave]}"')
                chaves_escritas.add(chave)
            else:
                novas_linhas.append(linha)  # mantém chaves que não editamos
        else:
            novas_linhas.append(linha)

    # Chaves novas que não existiam no arquivo
    for chave, valor in dados.items():
        if chave not in chaves_escritas:
            novas_linhas.append(f'{chave}="{valor}"')

    caminho.write_text("\n".join(novas_linhas) + "\n", encoding="utf-8")

    # Recarrega as variáveis em memória para valer na sessão atual
    for chave, valor in dados.items():
        os.environ[chave] = valor


# ─────────────────────────────────────────────
# DEFINIÇÃO DOS CAMPOS
# ─────────────────────────────────────────────

# Cada entrada: (env_key, label, tipo, dica)
# tipo: "senha" | "texto" | "path_arquivo" | "path_pasta"
CAMPOS_CONFIG = [
    # ── APIs ──────────────────────────────────────────────────────────
    ("GROQ_API_KEY",         "Groq API Key",          "senha",        "gsk_..."),
    ("ANTHROPIC_API_KEY",    "Anthropic API Key",      "senha",        "sk-ant-..."),
    # ── Firebase ──────────────────────────────────────────────────────
    ("FIREBASE_KEY_PATH",    "Firebase — serviceAccountKey.json", "path_arquivo", "Caminho para o JSON da service account"),
    # ── Google Drive ──────────────────────────────────────────────────
    ("GOOGLE_CREDENTIALS_PATH", "Google Drive — credentials.json", "path_arquivo", "Caminho para o credentials.json OAuth"),
    ("GOOGLE_TOKEN_PATH",    "Google Drive — token.json",          "path_arquivo", "Caminho para o token.json gerado após auth"),
]


# ─────────────────────────────────────────────
# TESTES DE CONECTIVIDADE (rápidos, não bloqueiam a UI)
# ─────────────────────────────────────────────

def _testar_groq(chave: str) -> tuple[bool, str]:
    try:
        from groq import Groq
        client = Groq(api_key=chave)
        client.models.list()
        return True, "✅  Groq conectado com sucesso."
    except Exception as e:
        return False, f"❌  Groq: {e}"


def _testar_anthropic(chave: str) -> tuple[bool, str]:
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=chave)
        client.models.list()
        return True, "✅  Anthropic conectado com sucesso."
    except Exception as e:
        return False, f"❌  Anthropic: {e}"


def _testar_firebase(path: str) -> tuple[bool, str]:
    try:
        if not Path(path).exists():
            return False, "❌  Arquivo não encontrado."
        import json
        with open(path, encoding="utf-8") as f:
            dados = json.load(f)
        if "project_id" not in dados:
            return False, "❌  JSON inválido: campo 'project_id' ausente."
        return True, f"✅  Firebase OK — projeto: {dados['project_id']}"
    except Exception as e:
        return False, f"❌  Firebase: {e}"


# Mapa: env_key → função de teste
TESTERS = {
    "GROQ_API_KEY":      _testar_groq,
    "ANTHROPIC_API_KEY": _testar_anthropic,
    "FIREBASE_KEY_PATH": _testar_firebase,
}


# ─────────────────────────────────────────────
# COMPONENTE DE LINHA (label + campo + botões)
# ─────────────────────────────────────────────

class _LinhaConfig(ctk.CTkFrame):
    """
    Um componente reutilizável que representa uma linha de configuração.
    Encapsula: label, campo de entrada, botão olho (para senhas),
    botão de selecionar arquivo/pasta e botão de testar conexão.
    """

    def __init__(self, master, env_key, label, tipo, dica, valor_atual, **kwargs):
        super().__init__(master, fg_color="transparent", **kwargs)

        self.env_key   = env_key
        self.tipo      = tipo
        self._visivel  = False  # controla exibição da senha

        # Label
        ctk.CTkLabel(
            self, text=label,
            font=("Roboto", 12, "bold"),
            anchor="w", width=260
        ).grid(row=0, column=0, sticky="w", padx=(0, 10))

        # Entrada
        show_char = "●" if tipo == "senha" else ""
        self.entrada = ctk.CTkEntry(
            self,
            placeholder_text=dica,
            show=show_char,
            height=36,
            font=("Roboto", 12),
            width=340
        )
        self.entrada.grid(row=0, column=1, padx=(0, 6))
        if valor_atual:
            self.entrada.insert(0, valor_atual)

        col_atual = 2

        # Botão olho (somente para senhas)
        if tipo == "senha":
            self.btn_olho = ctk.CTkButton(
                self, text="👁", width=36, height=36,
                font=("Roboto", 14),
                fg_color="#2a2a2a", hover_color="#3a3a3a",
                command=self._toggle_visibilidade
            )
            self.btn_olho.grid(row=0, column=col_atual, padx=(0, 4))
            col_atual += 1

        # Botão de selecionar arquivo/pasta
        if tipo in ("path_arquivo", "path_pasta"):
            ctk.CTkButton(
                self, text="📁", width=36, height=36,
                font=("Roboto", 14),
                fg_color="#1a3a5c", hover_color="#1a2a4c",
                command=self._selecionar_path
            ).grid(row=0, column=col_atual, padx=(0, 4))
            col_atual += 1

        # Botão testar (para as chaves que têm tester)
        if env_key in TESTERS:
            self.lbl_status = ctk.CTkLabel(
                self, text="", font=("Roboto", 11), width=30
            )
            self.lbl_status.grid(row=1, column=1, columnspan=3, sticky="w", pady=(2, 0))

            ctk.CTkButton(
                self, text="Testar", width=70, height=28,
                font=("Roboto", 11),
                fg_color="#2e7d32", hover_color="#1b5e20",
                command=self._testar
            ).grid(row=0, column=col_atual, padx=(0, 4))

    def get_valor(self) -> str:
        return self.entrada.get().strip()

    def _toggle_visibilidade(self):
        self._visivel = not self._visivel
        self.entrada.configure(show="" if self._visivel else "●")
        self.btn_olho.configure(text="🙈" if self._visivel else "👁")

    def _selecionar_path(self):
        if self.tipo == "path_arquivo":
            caminho = filedialog.askopenfilename(
                title="Selecionar arquivo",
                filetypes=[("JSON", "*.json"), ("Todos", "*.*")]
            )
        else:
            caminho = filedialog.askdirectory(title="Selecionar pasta")
        if caminho:
            self.entrada.delete(0, "end")
            self.entrada.insert(0, caminho)

    def _testar(self):
        valor = self.get_valor()
        if not valor:
            self.lbl_status.configure(text="⚠️  Campo vazio.", text_color="#ffcc80")
            return

        self.lbl_status.configure(text="⏳  Testando...", text_color="gray")

        def _executar():
            ok, msg = TESTERS[self.env_key](valor)
            cor = "#a5d6a7" if ok else "#ef9a9a"
            self.after(0, lambda: self.lbl_status.configure(text=msg, text_color=cor))

        threading.Thread(target=_executar, daemon=True).start()


# ─────────────────────────────────────────────
# JANELA PRINCIPAL DE CONFIGURAÇÕES
# ─────────────────────────────────────────────

def abrir_configuracoes(parent):
    """Entry point: abre a janela de configurações. Chame do sidebar."""

    env_path  = _encontrar_env()
    env_dados = _ler_env(env_path)

    janela = ctk.CTkToplevel(parent)
    janela.title("⚙️  Configurações — Agent Bastos")
    janela.geometry("760x580")
    janela.resizable(False, False)
    janela.grab_set()

    # ── Cabeçalho ──────────────────────────────────────────────────────
    ctk.CTkLabel(
        janela,
        text="⚙️  CONFIGURAÇÕES DO SISTEMA",
        font=("Roboto", 18, "bold")
    ).pack(pady=(24, 2))

    ctk.CTkLabel(
        janela,
        text=f"Arquivo: {env_path}",
        font=("Roboto", 10),
        text_color="gray"
    ).pack(pady=(0, 4))

    ctk.CTkLabel(janela, text="─" * 90, text_color="gray").pack()

    # ── Área scrollável com os campos ─────────────────────────────────
    scroll = ctk.CTkScrollableFrame(janela, height=400)
    scroll.pack(padx=30, pady=(10, 6), fill="both", expand=True)

    linhas: list[_LinhaConfig] = []

    for env_key, label, tipo, dica in CAMPOS_CONFIG:
        valor_atual = env_dados.get(env_key, "")

        linha = _LinhaConfig(
            scroll,
            env_key=env_key,
            label=label,
            tipo=tipo,
            dica=dica,
            valor_atual=valor_atual
        )
        linha.pack(anchor="w", pady=10, padx=10)

        # Separador visual entre campos
        ctk.CTkLabel(scroll, text="─" * 88, text_color="#2a2a2a").pack()

        linhas.append(linha)

    # ── Rodapé com botões ──────────────────────────────────────────────
    ctk.CTkLabel(janela, text="─" * 90, text_color="gray").pack()

    frame_btns = ctk.CTkFrame(janela, fg_color="transparent")
    frame_btns.pack(pady=12, padx=30, fill="x")

    lbl_feedback = ctk.CTkLabel(
        frame_btns, text="", font=("Roboto", 12), text_color="#a5d6a7"
    )
    lbl_feedback.pack(side="left", padx=(0, 20))

    def _salvar():
        novos = {linha.env_key: linha.get_valor() for linha in linhas}
        # Remove entradas vazias para não sobrescrever com string vazia
        novos_filtrados = {k: v for k, v in novos.items() if v}
        try:
            _salvar_env(env_path, novos_filtrados)
            lbl_feedback.configure(
                text="✅  Salvo com sucesso! Reinicie o Agent Bastos para aplicar.",
                text_color="#a5d6a7"
            )
        except Exception as e:
            lbl_feedback.configure(
                text=f"❌  Erro ao salvar: {e}",
                text_color="#ef9a9a"
            )

    ctk.CTkButton(
        frame_btns,
        text="💾  Salvar Configurações",
        command=_salvar,
        height=42,
        width=220,
        font=("Roboto", 13, "bold"),
        fg_color="#1565c0",
        hover_color="#0d47a1"
    ).pack(side="right", padx=(8, 0))

    ctk.CTkButton(
        frame_btns,
        text="Cancelar",
        command=janela.destroy,
        height=42,
        width=100,
        font=("Roboto", 12),
        fg_color="#2a2a2a",
        hover_color="#3a3a3a"
    ).pack(side="right")
