# drive_indexer/busca_referencias.py
#
# CONCEITO: Separação de responsabilidades na UI
# Essa tab não conversa com o LLM — ela é um módulo de consulta pura.
# O índice JSON é carregado em memória uma vez e todas as buscas
# rodam localmente, sem chamada de API. Isso garante velocidade
# e zero custo operacional para consultas de referência.

import json
import customtkinter as ctk
from pathlib import Path
from typing import Optional

INDICE_PATH = Path(__file__).parent.parent / "indice_documentos.json"


def carregar_indice() -> dict:
    if not INDICE_PATH.exists():
        return {"documentos": [], "total_documentos": 0}
    return json.loads(INDICE_PATH.read_text(encoding="utf-8"))


def buscar_documentos(
    termo: str,
    ano: Optional[str],
    tipo: Optional[str],
    documentos: list
) -> list:
    """
    Busca com três critérios combinados:
    - termo livre: bate contra assunto e número
    - ano: filtro exato
    - tipo: filtro exato (RELINT ou RELTEC)
    """
    termo = termo.strip().upper()
    resultado = []

    for doc in documentos:
        # Filtro de ano
        if ano and ano != "Todos" and doc["ano"] != ano:
            continue
        # Filtro de tipo
        if tipo and tipo != "Todos" and doc["tipo"] != tipo:
            continue
        # Busca livre
        if termo and termo not in doc["assunto"].upper() \
                and termo not in doc["numero"]:
            continue
        resultado.append(doc)

    # Ordena por ano desc, depois número desc
    resultado.sort(key=lambda d: (d["ano"], d["numero"]), reverse=True)
    return resultado


class BuscaReferenciaTab(ctk.CTkFrame):
    """
    Tab de busca de referências do Agent Bastos.
    Completamente isolada do chat — não acessa LLM.
    """

    COR_FUNDO = "#1a1d24"
    COR_CARD = "#1e2230"
    COR_BORDA = "#2a2d3a"
    COR_DOURADO = "#c49a20"
    COR_TEXTO = "#d0d5e0"
    COR_SUBTEXTO = "#6a7080"
    COR_RELINT = "#1a3a5c"
    COR_RELTEC = "#2a1a4a"
    COR_BADGE_RELINT = "#2a5a8c"
    COR_BADGE_RELTEC = "#4a2a7c"

    def __init__(self, parent, *args, **kwargs):
        super().__init__(parent, *args, **kwargs)
        self.configure(fg_color=self.COR_FUNDO)

        self._indice = carregar_indice()
        self._todos_docs = self._indice.get("documentos", [])
        self._anos = self._extrair_anos()

        self._construir_interface()

    def _extrair_anos(self) -> list:
        anos = sorted(set(d["ano"] for d in self._todos_docs), reverse=True)
        return ["Todos"] + anos

    def _construir_interface(self):
        # ── Cabeçalho ──────────────────────────────────────────────
        header = ctk.CTkFrame(self, fg_color="transparent")
        header.pack(fill="x", padx=20, pady=(20, 0))

        ctk.CTkLabel(
            header,
            text="🔍  Busca de Referências",
            font=("Roboto", 18, "bold"),
            text_color=self.COR_DOURADO
        ).pack(side="left")

        self._lbl_total = ctk.CTkLabel(
            header,
            text=f"{self._indice.get('total_documentos', 0)} documentos indexados",
            font=("Roboto", 11),
            text_color=self.COR_SUBTEXTO
        )
        self._lbl_total.pack(side="right")

        # ── Barra de busca ─────────────────────────────────────────
        barra = ctk.CTkFrame(self, fg_color=self.COR_CARD,
                             corner_radius=10, border_width=1,
                             border_color=self.COR_BORDA)
        barra.pack(fill="x", padx=20, pady=16)

        self._entry_busca = ctk.CTkEntry(
            barra,
            placeholder_text="Buscar por nome, assunto ou número do documento...",
            font=("Roboto", 13),
            fg_color="transparent",
            border_width=0,
            text_color=self.COR_TEXTO,
            height=42
        )
        self._entry_busca.pack(side="left", fill="x", expand=True, padx=14)
        self._entry_busca.bind("<KeyRelease>", lambda e: self._executar_busca())

        # Filtro Ano
        self._var_ano = ctk.StringVar(value="Todos")
        ctk.CTkOptionMenu(
            barra,
            values=self._anos,
            variable=self._var_ano,
            command=lambda _: self._executar_busca(),
            width=90,
            fg_color="#252830",
            button_color="#2a2d3a",
            text_color=self.COR_TEXTO,
            font=("Roboto", 12)
        ).pack(side="left", padx=(0, 8), pady=8)

        # Filtro Tipo
        self._var_tipo = ctk.StringVar(value="Todos")
        ctk.CTkOptionMenu(
            barra,
            values=["Todos", "RELINT", "RELTEC"],
            variable=self._var_tipo,
            command=lambda _: self._executar_busca(),
            width=100,
            fg_color="#252830",
            button_color="#2a2d3a",
            text_color=self.COR_TEXTO,
            font=("Roboto", 12)
        ).pack(side="left", padx=(0, 12), pady=8)

        # ── Contador de resultados ─────────────────────────────────
        self._lbl_resultados = ctk.CTkLabel(
            self,
            text="",
            font=("Roboto", 11),
            text_color=self.COR_SUBTEXTO
        )
        self._lbl_resultados.pack(anchor="w", padx=22)

        # ── Lista de resultados ────────────────────────────────────
        self._scroll = ctk.CTkScrollableFrame(
            self,
            fg_color="transparent",
            scrollbar_button_color=self.COR_BORDA
        )
        self._scroll.pack(fill="both", expand=True, padx=20, pady=(8, 20))

        # Carrega todos os documentos na abertura
        self._executar_busca()

    def _executar_busca(self):
        termo = self._entry_busca.get()
        ano = self._var_ano.get()
        tipo = self._var_tipo.get()

        resultados = buscar_documentos(termo, ano, tipo, self._todos_docs)
        self._lbl_resultados.configure(
            text=f"{len(resultados)} resultado(s) encontrado(s)"
        )
        self._renderizar_resultados(resultados[:100])  # limita a 100 por performance

    def _renderizar_resultados(self, docs: list):
        # Limpa resultados anteriores
        for widget in self._scroll.winfo_children():
            widget.destroy()

        if not docs:
            ctk.CTkLabel(
                self._scroll,
                text="Nenhum documento encontrado.",
                font=("Roboto", 13),
                text_color=self.COR_SUBTEXTO
            ).pack(pady=40)
            return

        for doc in docs:
            self._criar_card(doc)

    def _criar_card(self, doc: dict):
        cor_card = self.COR_RELINT if doc["tipo"] == "RELINT" else self.COR_RELTEC
        cor_badge = self.COR_BADGE_RELINT if doc["tipo"] == "RELINT" else self.COR_BADGE_RELTEC

        card = ctk.CTkFrame(
            self._scroll,
            fg_color=cor_card,
            corner_radius=8,
            border_width=1,
            border_color=self.COR_BORDA
        )
        card.pack(fill="x", pady=3)

        # Linha superior: badge tipo + número + ano + mês
        topo = ctk.CTkFrame(card, fg_color="transparent")
        topo.pack(fill="x", padx=12, pady=(10, 4))

        ctk.CTkLabel(
            topo,
            text=doc["tipo"],
            font=("Roboto", 10, "bold"),
            fg_color=cor_badge,
            corner_radius=4,
            text_color="white",
            width=55,
            height=20
        ).pack(side="left")

        numero_txt = f"  Nº {doc['numero']}  •  {doc['ano']}"
        if doc.get("mes"):
            numero_txt += f"  •  {doc['mes']}"

        ctk.CTkLabel(
            topo,
            text=numero_txt,
            font=("Roboto", 12, "bold"),
            text_color=self.COR_TEXTO
        ).pack(side="left", padx=8)

        ctk.CTkLabel(
            topo,
            text=doc["data_modificacao"],
            font=("Roboto", 10),
            text_color=self.COR_SUBTEXTO
        ).pack(side="right")

        # Linha inferior: assunto
        ctk.CTkLabel(
            card,
            text=doc["assunto"],
            font=("Roboto", 12),
            text_color=self.COR_TEXTO,
            anchor="w",
            wraplength=700
        ).pack(fill="x", padx=12, pady=(0, 10))


# ── Teste standalone ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    ctk.set_appearance_mode("dark")
    app = ctk.CTk()
    app.title("Agent Bastos — Busca de Referências")
    app.geometry("900x650")
    BuscaReferenciaTab(app).pack(fill="both", expand=True)
    app.mainloop()