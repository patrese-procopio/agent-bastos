"""
dashboard.py — Dashboard de Produção da AIPEN
Agent Bastos | Inteligência Penitenciária

Exibe os índices mensais de produção por tipo e por núcleo.
Alimentado por arquivo JSON local — futuramente pode ser Firebase.
"""

import customtkinter as ctk
import json
import os
from datetime import datetime
from tkinter import messagebox

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg

# ─────────────────────────────────────────────
# CORES DA IDENTIDADE AIPEN
# ─────────────────────────────────────────────

COR_FUNDO      = "#0d0f12"
COR_CARD       = "#111318"
COR_BORDA      = "#1e2028"
COR_DOURADO    = "#c49a20"
COR_DOURADO2   = "#8B6914"
COR_TEXTO      = "#b0b5c0"
COR_TEXTO2     = "#5a5e6a"

CORES_TIPOS = {
    "RELINTS": "#c49a20",
    "RELTECS": "#3a6abd",
    "REPEN":   "#3a8a5a",
    "RIs":     "#6a3a8a",
    "PB":      "#8a5a3a",
}

CORES_NUCLEOS = {
    "NI":      "#3a6abd",
    "NCI":     "#3a8a5a",
    "NBE":     "#8a5a3a",
    "NUCADIS": "#6a3a8a",
}

# Mapeamento núcleo → tipos que produz
NUCLEO_TIPOS = {
    "NI":      ["RELINTS", "RELTECS", "REPEN", "PB"],
    "NCI":     ["RELINTS", "PB"],
    "NBE":     [],
    "NUCADIS": ["RIs"],
}

MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
         "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

# ─────────────────────────────────────────────
# DADOS — arquivo local JSON
# ─────────────────────────────────────────────

ARQUIVO_DADOS = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "producao_aipen.json"
)

DADOS_EXEMPLO = {
    "2026": {
        "Jan": {"RELINTS": 10, "RELTECS": 5, "REPEN": 8,  "RIs": 14, "PB": 6},
        "Fev": {"RELINTS": 12, "RELTECS": 6, "REPEN": 9,  "RIs": 14, "PB": 6},
        "Mar": {"RELINTS": 11, "RELTECS": 7, "REPEN": 12, "RIs": 16, "PB": 9},
        "Abr": {"RELINTS": 14, "RELTECS": 8, "REPEN": 11, "RIs": 19, "PB": 7},
    }
}

NUCLEO_DADOS_EXEMPLO = {
    "2026": {
        "Abr": {
            "NI":      {"RELINTS": 8, "RELTECS": 8, "REPEN": 11, "RIs": 0,  "PB": 4},
            "NCI":     {"RELINTS": 6, "RELTECS": 0, "REPEN": 0,  "RIs": 0,  "PB": 3},
            "NBE":     {"RELINTS": 0, "RELTECS": 0, "REPEN": 0,  "RIs": 0,  "PB": 0},
            "NUCADIS": {"RELINTS": 0, "RELTECS": 0, "REPEN": 0,  "RIs": 19, "PB": 0},
        }
    }
}


def carregar_dados():
    if os.path.exists(ARQUIVO_DADOS):
        with open(ARQUIVO_DADOS, "r", encoding="utf-8") as f:
            return json.load(f)
    with open(ARQUIVO_DADOS, "w", encoding="utf-8") as f:
        json.dump({"totais": DADOS_EXEMPLO, "nucleos": NUCLEO_DADOS_EXEMPLO}, f, ensure_ascii=False, indent=2)
    return {"totais": DADOS_EXEMPLO, "nucleos": NUCLEO_DADOS_EXEMPLO}


def salvar_dados(dados):
    with open(ARQUIVO_DADOS, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)


# ─────────────────────────────────────────────
# CONFIGURAÇÃO MATPLOTLIB
# ─────────────────────────────────────────────

def configurar_estilo():
    plt.rcParams.update({
        "figure.facecolor":  COR_FUNDO,
        "axes.facecolor":    COR_CARD,
        "axes.edgecolor":    COR_BORDA,
        "axes.labelcolor":   COR_TEXTO2,
        "axes.spines.top":   False,
        "axes.spines.right": False,
        "axes.spines.left":  False,
        "axes.spines.bottom": True,
        "xtick.color":       COR_TEXTO2,
        "ytick.color":       COR_TEXTO2,
        "text.color":        COR_TEXTO,
        "grid.color":        COR_BORDA,
        "grid.linewidth":    0.5,
        "font.size":         10,
        "font.family":       "sans-serif",
    })


# ─────────────────────────────────────────────
# JANELA DO DASHBOARD
# ─────────────────────────────────────────────

def abrir_dashboard(parent):
    dados = carregar_dados()
    ano_atual = str(datetime.now().year)
    mes_atual = MESES[datetime.now().month - 1]

    janela = ctk.CTkToplevel(parent)
    janela.title("Dashboard de Produção — AIPEN")
    janela.geometry("1100x720")
    janela.configure(fg_color=COR_FUNDO)

    # Header
    header = ctk.CTkFrame(janela, fg_color="#111318", corner_radius=0)
    header.pack(fill="x", padx=0, pady=0)

    ctk.CTkLabel(
        header,
        text="SECRETARIA DE ESTADO DE ADMINISTRAÇÃO PENITENCIÁRIA - SEAP-AM",
        font=("Roboto", 10),
        text_color="#3d4150"
    ).pack(side="left", padx=20, pady=(12, 0))

    ctk.CTkLabel(
        header,
        text="ASSESSORIA DE INTELIGÊNCIA PENITENCIÁRIA - AIPEN",
        font=("Roboto", 10, "bold"),
        text_color="#5a5e6a"
    ).pack(side="left", padx=4, pady=(12, 0))

    ctk.CTkLabel(
        header,
        text="Dashboard de Produção",
        font=("Roboto", 14, "bold"),
        text_color=COR_DOURADO
    ).pack(side="right", padx=20, pady=(12, 0))

    ctk.CTkFrame(janela, height=1, fg_color=COR_BORDA).pack(fill="x")

    # Seletor de mês/ano
    controles = ctk.CTkFrame(janela, fg_color=COR_FUNDO)
    controles.pack(fill="x", padx=20, pady=12)

    ctk.CTkLabel(controles, text="Período:", font=("Roboto", 12), text_color=COR_TEXTO2).pack(side="left")

    anos_disponiveis = list(dados["totais"].keys())
    var_ano = ctk.StringVar(value=ano_atual if ano_atual in anos_disponiveis else anos_disponiveis[-1])
    sel_ano = ctk.CTkOptionMenu(controles, values=anos_disponiveis, variable=var_ano, width=90, height=30)
    sel_ano.pack(side="left", padx=(8, 4))

    meses_disponiveis = list(dados["totais"].get(var_ano.get(), {}).keys())
    var_mes = ctk.StringVar(value=mes_atual if mes_atual in meses_disponiveis else meses_disponiveis[-1])
    sel_mes = ctk.CTkOptionMenu(controles, values=meses_disponiveis or ["—"], variable=var_mes, width=90, height=30)
    sel_mes.pack(side="left", padx=4)

    btn_atualizar = ctk.CTkButton(
        controles, text="Atualizar", width=90, height=30,
        font=("Roboto", 12),
        fg_color=COR_DOURADO2, hover_color="#6a4a10",
        command=lambda: renderizar(var_ano.get(), var_mes.get())
    )
    btn_atualizar.pack(side="left", padx=8)

    btn_lancar = ctk.CTkButton(
        controles, text="+ Lançar produção", width=140, height=30,
        font=("Roboto", 12),
        fg_color="#1a2a3a", hover_color="#1e3040",
        command=lambda: janela_lancamento(janela, var_ano.get(), var_mes.get(), dados, lambda: renderizar(var_ano.get(), var_mes.get()))
    )
    btn_lancar.pack(side="left", padx=4)

    # Área dos cards + gráficos
    area = ctk.CTkScrollableFrame(janela, fg_color=COR_FUNDO)
    area.pack(fill="both", expand=True, padx=20, pady=(0, 16))

    # Cards de métricas
    frame_cards = ctk.CTkFrame(area, fg_color=COR_FUNDO)
    frame_cards.pack(fill="x", pady=(0, 14))

    card_widgets = {}
    for tipo in ["RELINTS", "RELTECS", "REPEN", "RIs", "PB"]:
        card = ctk.CTkFrame(frame_cards, fg_color=COR_CARD, corner_radius=10,
                            border_width=1, border_color=COR_BORDA)
        card.pack(side="left", expand=True, fill="x", padx=5)
        ctk.CTkLabel(card, text=tipo, font=("Roboto", 10, "bold"),
                     text_color=COR_TEXTO2).pack(pady=(12, 0))
        lbl = ctk.CTkLabel(card, text="0", font=("Roboto", 28, "bold"),
                           text_color=CORES_TIPOS[tipo])
        lbl.pack()
        diff = ctk.CTkLabel(card, text="", font=("Roboto", 10), text_color=COR_TEXTO2)
        diff.pack(pady=(0, 12))
        card_widgets[tipo] = (lbl, diff)

    # Frame dos gráficos
    frame_graficos = ctk.CTkFrame(area, fg_color=COR_FUNDO)
    frame_graficos.pack(fill="both", expand=True)

    canvas_holder = {"canvas": None, "fig": None}

    def renderizar(ano, mes):
        totais = dados["totais"]
        nucleos_dados = dados.get("nucleos", {})

        ano_dados = totais.get(ano, {})
        mes_dados = ano_dados.get(mes, {})
        meses_ano = list(ano_dados.keys())

        # Atualiza cards
        meses_anteriores = [m for m in MESES if m in meses_ano]
        idx_atual = meses_anteriores.index(mes) if mes in meses_anteriores else -1
        mes_ant = meses_anteriores[idx_atual - 1] if idx_atual > 0 else None

        for tipo, (lbl, diff) in card_widgets.items():
            val = mes_dados.get(tipo, 0)
            lbl.configure(text=str(val))
            if mes_ant:
                val_ant = ano_dados.get(mes_ant, {}).get(tipo, 0)
                delta = val - val_ant
                sinal = "▲" if delta >= 0 else "▼"
                cor = "#3a8a5a" if delta >= 0 else "#8a3a3a"
                diff.configure(text=f"{sinal} {abs(delta)} vs {mes_ant}", text_color=cor)
            else:
                diff.configure(text="")

        # Remove canvas anterior
        if canvas_holder["canvas"]:
            canvas_holder["canvas"].get_tk_widget().destroy()
            plt.close(canvas_holder["fig"])

        configurar_estilo()
        fig = plt.figure(figsize=(13, 7), facecolor=COR_FUNDO)
        fig.subplots_adjust(hspace=0.4, wspace=0.3)

        # ── Gráfico 1: Barras por tipo no mês selecionado ──
        ax1 = fig.add_subplot(2, 3, 1)
        tipos = list(CORES_TIPOS.keys())
        valores = [mes_dados.get(t, 0) for t in tipos]
        bars = ax1.barh(tipos, valores, color=[CORES_TIPOS[t] for t in tipos],
                        height=0.5, alpha=0.85)
        for bar, val in zip(bars, valores):
            if val > 0:
                ax1.text(val + 0.2, bar.get_y() + bar.get_height()/2,
                         str(val), va="center", color=COR_TEXTO, fontsize=9)
        ax1.set_title(f"Produção por tipo — {mes}/{ano}", color=COR_TEXTO, fontsize=10, pad=8)
        ax1.set_xlabel("")
        ax1.tick_params(axis="y", labelsize=9)
        ax1.set_xlim(0, max(valores + [1]) * 1.2)
        ax1.grid(axis="x", alpha=0.3)

        # ── Gráfico 2: Distribuição por núcleo (pizza) ──
        ax2 = fig.add_subplot(2, 3, 2)
        nucleo_mes = nucleos_dados.get(ano, {}).get(mes, {})
        totais_nucleo = {n: sum(nucleo_mes.get(n, {}).values()) for n in CORES_NUCLEOS}
        nomes = [n for n, v in totais_nucleo.items() if v > 0]
        vals_pizza = [totais_nucleo[n] for n in nomes]
        cores_pizza = [CORES_NUCLEOS[n] for n in nomes]
        if vals_pizza:
            wedges, texts, autotexts = ax2.pie(
                vals_pizza, labels=nomes, colors=cores_pizza,
                autopct="%1.0f%%", startangle=90,
                textprops={"color": COR_TEXTO, "fontsize": 9},
                wedgeprops={"linewidth": 0.5, "edgecolor": COR_FUNDO}
            )
            for at in autotexts:
                at.set_fontsize(8)
                at.set_color(COR_FUNDO)
        ax2.set_title(f"Distribuição por núcleo — {mes}", color=COR_TEXTO, fontsize=10, pad=8)

        # ── Gráfico 3: Tabela de produção por núcleo ──
        ax3 = fig.add_subplot(2, 3, 3)
        ax3.axis("off")
        col_labels = ["Núcleo", "RELINT", "TEC", "PEN", "RI", "PB", "Total"]
        rows = []
        for nucleo in ["NI", "NCI", "NBE", "NUCADIS"]:
            nd = nucleo_mes.get(nucleo, {})
            r = [nucleo,
                 nd.get("RELINTS", 0) or "—",
                 nd.get("RELTECS", 0) or "—",
                 nd.get("REPEN", 0) or "—",
                 nd.get("RIs", 0) or "—",
                 nd.get("PB", 0) or "—",
                 sum(v for v in nd.values() if isinstance(v, int))]
            rows.append(r)

        table = ax3.table(
            cellText=rows,
            colLabels=col_labels,
            cellLoc="center",
            loc="center"
        )
        table.auto_set_font_size(False)
        table.set_fontsize(9)
        table.scale(1, 1.6)
        for (row, col), cell in table.get_celld().items():
            cell.set_facecolor(COR_CARD if row > 0 else "#1a1d25")
            cell.set_edgecolor(COR_BORDA)
            cell.set_text_props(color=COR_DOURADO if row == 0 else COR_TEXTO)
        ax3.set_title("Produção detalhada por núcleo", color=COR_TEXTO, fontsize=10, pad=8)

        # ── Gráfico 4: Evolução mensal (linha) ──
        ax4 = fig.add_subplot(2, 1, 2)
        meses_plot = [m for m in MESES if m in ano_dados]
        for tipo in tipos:
            vals = [ano_dados.get(m, {}).get(tipo, 0) for m in meses_plot]
            ax4.plot(meses_plot, vals, marker="o", color=CORES_TIPOS[tipo],
                     linewidth=1.5, markersize=4, label=tipo, alpha=0.85)
            if meses_plot:
                ax4.annotate(str(vals[-1]),
                             xy=(meses_plot[-1], vals[-1]),
                             xytext=(4, 0), textcoords="offset points",
                             color=CORES_TIPOS[tipo], fontsize=8)

        if mes in meses_plot:
            idx = meses_plot.index(mes)
            ax4.axvline(x=idx, color=COR_DOURADO, linewidth=0.8,
                        linestyle="--", alpha=0.5)

        ax4.set_title(f"Evolução mensal — {ano}", color=COR_TEXTO, fontsize=10, pad=8)
        ax4.legend(loc="upper left", fontsize=8, framealpha=0,
                   labelcolor=COR_TEXTO)
        ax4.grid(axis="y", alpha=0.2)
        ax4.tick_params(labelsize=9)

        canvas = FigureCanvasTkAgg(fig, master=frame_graficos)
        canvas.draw()
        canvas.get_tk_widget().pack(fill="both", expand=True)
        canvas_holder["canvas"] = canvas
        canvas_holder["fig"] = fig

    renderizar(var_ano.get(), var_mes.get())

    def ao_mudar_ano(valor):
        meses_novo = list(dados["totais"].get(valor, {}).keys())
        sel_mes.configure(values=meses_novo or ["—"])
        if meses_novo:
            var_mes.set(meses_novo[-1])

    var_ano.trace_add("write", lambda *_: ao_mudar_ano(var_ano.get()))


# ─────────────────────────────────────────────
# JANELA DE LANÇAMENTO DE PRODUÇÃO
# ─────────────────────────────────────────────

def janela_lancamento(parent, ano, mes, dados, callback):
    win = ctk.CTkToplevel(parent)
    win.title(f"Lançar Produção — {mes}/{ano}")
    win.geometry("460x520")
    win.grab_set()
    win.configure(fg_color=COR_FUNDO)

    ctk.CTkLabel(win, text=f"LANÇAR PRODUÇÃO — {mes}/{ano}",
                 font=("Roboto", 13, "bold"), text_color=COR_DOURADO).pack(pady=(20, 4))
    ctk.CTkLabel(win, text="Preencha os totais do mês por tipo de documento",
                 font=("Roboto", 11), text_color=COR_TEXTO2).pack(pady=(0, 16))

    frame = ctk.CTkFrame(win, fg_color=COR_CARD, corner_radius=10)
    frame.pack(padx=20, fill="x")

    campos = {}
    mes_atual_dados = dados["totais"].get(ano, {}).get(mes, {})
    for tipo, cor in CORES_TIPOS.items():
        row = ctk.CTkFrame(frame, fg_color="transparent")
        row.pack(fill="x", padx=16, pady=6)
        ctk.CTkLabel(row, text=tipo, font=("Roboto", 12, "bold"),
                     text_color=cor, width=80).pack(side="left")
        entry = ctk.CTkEntry(row, width=80, height=32, font=("Roboto", 12))
        entry.insert(0, str(mes_atual_dados.get(tipo, 0)))
        entry.pack(side="right")
        campos[tipo] = entry

    ctk.CTkLabel(win, text="Distribuição por núcleo:",
                 font=("Roboto", 11, "bold"), text_color=COR_TEXTO2).pack(pady=(16, 4))

    frame2 = ctk.CTkFrame(win, fg_color=COR_CARD, corner_radius=10)
    frame2.pack(padx=20, fill="x")

    campos_nucleo = {}
    nucleo_atual = dados.get("nucleos", {}).get(ano, {}).get(mes, {})
    for nucleo, tipos_nucleo in NUCLEO_TIPOS.items():
        if not tipos_nucleo:
            continue
        row = ctk.CTkFrame(frame2, fg_color="transparent")
        row.pack(fill="x", padx=16, pady=4)
        ctk.CTkLabel(row, text=nucleo, font=("Roboto", 11, "bold"),
                     text_color=CORES_NUCLEOS[nucleo], width=70).pack(side="left")
        campos_nucleo[nucleo] = {}
        for tipo in tipos_nucleo:
            ctk.CTkLabel(row, text=tipo, font=("Roboto", 9),
                         text_color=COR_TEXTO2, width=50).pack(side="left")
            entry = ctk.CTkEntry(row, width=40, height=28, font=("Roboto", 11))
            entry.insert(0, str(nucleo_atual.get(nucleo, {}).get(tipo, 0)))
            entry.pack(side="left", padx=2)
            campos_nucleo[nucleo][tipo] = entry

    def salvar():
        try:
            if ano not in dados["totais"]:
                dados["totais"][ano] = {}
            dados["totais"][ano][mes] = {
                tipo: int(entry.get() or 0)
                for tipo, entry in campos.items()
            }
            if "nucleos" not in dados:
                dados["nucleos"] = {}
            if ano not in dados["nucleos"]:
                dados["nucleos"][ano] = {}
            if mes not in dados["nucleos"][ano]:
                dados["nucleos"][ano][mes] = {}
            for nucleo, tipos_entries in campos_nucleo.items():
                dados["nucleos"][ano][mes][nucleo] = {
                    tipo: int(entry.get() or 0)
                    for tipo, entry in tipos_entries.items()
                }
            salvar_dados(dados)
            messagebox.showinfo("Salvo", "Produção lançada com sucesso!")
            win.destroy()
            callback()
        except ValueError:
            messagebox.showerror("Erro", "Digite apenas números inteiros.")

    ctk.CTkButton(
        win, text="Salvar produção", command=salvar,
        height=40, font=("Roboto", 13, "bold"),
        fg_color=COR_DOURADO2, hover_color="#6a4a10"
    ).pack(padx=20, pady=16, fill="x")
