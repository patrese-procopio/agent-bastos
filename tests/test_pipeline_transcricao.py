"""
tests/test_pipeline_transcricao.py
Teste isolado do pipeline de cruzamento pos-transcricao (Missao 22).

Execucao:
    cd C:\\Users\\Administrador\\Agent_Bastos
    python tests/test_pipeline_transcricao.py

Nao precisa de Docker, nao envia WhatsApp, nao consome API.
"""

import sys
import os
import json

# Adiciona o root do projeto ao path
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from services.pipeline_transcricao import (
    _norm, _tokens, _tem_hit,
    _carregar_alvos, _carregar_lideres, _carregar_entidades_extrato,
    _buscar_hits,
)

# ── Cores para output ─────────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

ok_count   = 0
fail_count = 0

def check(descricao, condicao):
    global ok_count, fail_count
    if condicao:
        print(f"  {GREEN}[OK]{RESET} {descricao}")
        ok_count += 1
    else:
        print(f"  {RED}[FAIL]{RESET} {descricao}")
        fail_count += 1

def secao(titulo):
    print(f"\n{BOLD}{CYAN}{'='*55}{RESET}")
    print(f"{BOLD}{CYAN}  {titulo}{RESET}")
    print(f"{BOLD}{CYAN}{'='*55}{RESET}")


# ════════════════════════════════════════════════════════════
# 1. Normalizacao e tokenizacao
# ════════════════════════════════════════════════════════════
secao("1. Normalizacao e tokenizacao")

check("acento removido",
    _norm("Carnaúba") == "carnauba")
check("caixa alta normalizada",
    _norm("GELSON DE LIMA") == "gelson de lima")
check("espacos extras removidos",
    _norm("  Silvio   Costa  ") == "silvio costa")
check("tokens ignoram stop words",
    _tokens("gelson de lima carnauba") == ["gelson", "lima", "carnauba"])
check("tokens < 4 chars excluidos (ana=3, paz=3 -> lista vazia)",
    _tokens("ana da paz") == [])    # 'ana'=3, 'paz'=3, 'da'=stop -> nenhum token
check("tokens com 4+ chars incluidos",
    "lima" in _tokens("gelson de lima carnauba"))


# ════════════════════════════════════════════════════════════
# 2. Motor de match
# ════════════════════════════════════════════════════════════
secao("2. Motor de match (_tem_hit)")

# --- Match exato ---
check("match exato: string completa",
    _tem_hit("gelson de lima carnauba foi visto",
             {"nome_norm": "gelson de lima carnauba"}))

check("match exato: CV-AM (termo curto)",
    _tem_hit("o pessoal do cv-am atacou o pavilhao",
             {"nome_norm": "cv-am"}))

check("match exato: Tropa de Manaus",
    _tem_hit("a tropa de manaus domina esse setor",
             {"nome_norm": "tropa de manaus"}))

# --- 3+ tokens: primeiro + ultimo ---
check("3 tokens: primeiro+ultimo presentes -> HIT",
    _tem_hit("o gelson carnauba foi visto no patio",
             {"nome_norm": "gelson de lima carnauba"}))

check("3 tokens: sem o ultimo -> NAO HIT",
    not _tem_hit("o gelson lima foi visto",
                 {"nome_norm": "gelson de lima carnauba"}))

check("3 tokens: sem o primeiro -> NAO HIT",
    not _tem_hit("o lima carnauba estava la",
                 {"nome_norm": "gelson de lima carnauba"}))

# --- 2 tokens: ambos ---
check("2 tokens: ambos presentes -> HIT",
    _tem_hit("silvio costa foi transferido",
             {"nome_norm": "silvio costa"}))

check("2 tokens: apenas primeiro -> NAO HIT",
    not _tem_hit("o silvio fugiu",
                 {"nome_norm": "silvio costa"}))

# --- Nome muito curto ---
check("nome < 4 chars: ignorado",
    not _tem_hit("joao foi la",
                 {"nome_norm": "jo"}))

# --- Texto vazio ---
check("texto vazio: nao dispara",
    not _tem_hit("",
                 {"nome_norm": "gelson carnauba"}))


# ════════════════════════════════════════════════════════════
# 3. Carregamento das fontes
# ════════════════════════════════════════════════════════════
secao("3. Carregamento das fontes de dados")

alvos = _carregar_alvos()
check(f"alvos.json carregado ({len(alvos)} entradas)",
    len(alvos) > 0)

# Verifica que CV-AM e Tropa de Manaus estao la
nomes_alvos = [a["nome"] for a in alvos]
check("CV-AM presente em alvos",
    any("CV-AM" in n for n in nomes_alvos))
check("Tropa de Manaus presente em alvos",
    any("Tropa" in n for n in nomes_alvos))
check("Alvos tem campo 'fonte'",
    all("fonte" in a for a in alvos))
check("Alvos tem campo 'detalhe'",
    all("detalhe" in a for a in alvos))

lideres = _carregar_lideres()
print(f"  {YELLOW}[INFO]{RESET} liderancas.db: {len(lideres)} entradas carregadas")
if len(lideres) == 0:
    print(f"  {YELLOW}[INFO]{RESET} (normal se banco ainda nao tem lideres cadastrados)")

extratos = _carregar_entidades_extrato()
print(f"  {YELLOW}[INFO]{RESET} extrato_entidades: {len(extratos)} entradas carregadas")
if len(extratos) == 0:
    print(f"  {YELLOW}[INFO]{RESET} (normal se ainda nao ha extratos processados)")


# ════════════════════════════════════════════════════════════
# 4. Busca integrada (_buscar_hits)
# ════════════════════════════════════════════════════════════
secao("4. Busca integrada com texto simulado")

# Pega o primeiro nome real de alvos.json para simular uma transcricao
primeiro_alvo = next((a for a in alvos if a.get("tipo") != "termo"), None)
if primeiro_alvo:
    nome_completo = primeiro_alvo["nome"]
    partes = nome_completo.split()
    # Monta texto com primeiro + ultimo sobrenome (como seria em transcricao real)
    if len(partes) >= 2:
        texto_simulado = (
            f"o individuo chamado {partes[0]} {partes[-1]} foi flagrado "
            f"tentando passar um celular escondido na roupa. "
            f"Havia tambem mencao ao CV-AM na conversa interceptada."
        )
    else:
        texto_simulado = f"o individuo {nome_completo} foi flagrado."

    print(f"\n  {YELLOW}Texto simulado:{RESET}")
    print(f"  \"{texto_simulado}\"")

    hits = _buscar_hits(texto_simulado)
    print(f"\n  {YELLOW}Hits encontrados: {len(hits)}{RESET}")
    for h in hits:
        print(f"    • [{h['fonte']}] {h['nome']} — {h['detalhe']}")

    check("Hit encontrado para nome de alvo real",
        any(partes[0].lower() in h["nome"].lower() or partes[-1].lower() in h["nome"].lower()
            for h in hits))
    check("Hit encontrado para CV-AM",
        any("CV-AM" in h["nome"] or "cv-am" in h["nome"].lower() for h in hits))
else:
    print(f"  {YELLOW}[SKIP]{RESET} Nenhum alvo pessoa encontrado em alvos.json")

# Texto sem nenhum nome conhecido
hits_vazio = _buscar_hits("hoje choveu muito e o tempo estava frio")
check("Texto sem nomes monitorados: zero hits",
    len(hits_vazio) == 0)

# Deduplicacao: mesmo nome duas vezes no corpus nao gera dois hits
texto_dup = "o gelson carnauba gelson carnauba foi transferido"
e_dup = {"nome_norm": "gelson de lima carnauba"}
if _tem_hit(_norm(texto_dup), e_dup):
    hits_dup = _buscar_hits(texto_dup)
    duplicatas = [h for h in hits_dup if "gelson" in h["nome"].lower()]
    check("Deduplicacao: mesmo nome aparece apenas uma vez nos hits",
        len(duplicatas) <= 1)


# ════════════════════════════════════════════════════════════
# 5. Funcao executar() sem HITL (modo dry-run)
# ════════════════════════════════════════════════════════════
secao("5. executar() completo (dry-run, sem HITL)")

# Monkey-patch via unittest.mock: intercepta imports internos do executar()
# sem precisar de httpx ou qualquer dependencia externa.
from unittest.mock import patch, AsyncMock, MagicMock
import services.pipeline_transcricao as _mod

_hitl_chamado = {"sim": False}

def _fake_criar(tipo_evento, descricao, risco, operador, detalhes=None):
    _hitl_chamado["sim"] = True
    _hitl_chamado["tipo"] = tipo_evento
    _hitl_chamado["risco"] = risco
    _hitl_chamado["n_hits"] = len((detalhes or {}).get("hits", []))
    print(f"\n  {YELLOW}[HITL interceptado - sem WhatsApp]{RESET}")
    print(f"    tipo_evento : {tipo_evento}")
    print(f"    risco       : {risco}")
    print(f"    operador    : {operador}")
    for h in (detalhes or {}).get("hits", [])[:5]:
        print(f"    hit         : [{h['fonte']}] {h['nome']}")
    return "fake-aprov-id-001"

_fake_notificar = AsyncMock(return_value=True)
_fake_marcar    = MagicMock()

mock_hl = MagicMock()
mock_hl.criar_aprovacao       = _fake_criar
mock_hl.marcar_notificado     = _fake_marcar
mock_ns = MagicMock()
mock_ns.notificar_aprovacao_pendente = _fake_notificar

with patch.dict("sys.modules", {
    "services.human_loop_service": mock_hl,
    "services.notification_service": mock_ns,
}):
    # Executa com texto que contem um alvo conhecido
    if primeiro_alvo:
        resultado_simulado = {
            "risk_level": "ALTO",
            "summary": "Individuo suspeito flagrado com celular ilegal.",
            "red_flags": [{"id": 1, "title": "Contrabando", "text": "Celular na roupa"}],
        }
        _mod.executar(
            texto=texto_simulado,
            resultado=resultado_simulado,
            filename="audio_teste_pavilhao_02.mp3",
            operador="admin",
        )

        check("executar() ativou HITL ao encontrar hit",
            _hitl_chamado["sim"])
        if _hitl_chamado["sim"]:
            check("tipo_evento correto",
                _hitl_chamado.get("tipo") == "transcricao_cruzamento")
            check("hits passados ao HITL",
                _hitl_chamado.get("n_hits", 0) > 0)

    # Executa com texto sem hits — nao deve chamar HITL
    _hitl_chamado["sim"] = False
    _mod.executar(
        texto="hoje choveu muito e o tempo estava frio no pavilhao",
        resultado={"risk_level": "BAIXO", "summary": "Nada relevante.", "red_flags": []},
        filename="audio_sem_hits.mp3",
        operador="admin",
    )
    check("executar() NAO ativa HITL quando nao ha hits",
        not _hitl_chamado["sim"])


# ════════════════════════════════════════════════════════════
# Resultado final
# ════════════════════════════════════════════════════════════
total = ok_count + fail_count
print(f"\n{'='*55}")
print(f"{BOLD}RESULTADO: {GREEN}{ok_count} OK{RESET}{BOLD} / {RED}{fail_count} FAIL{RESET}{BOLD} de {total} checks{RESET}")
print("="*55)

if fail_count > 0:
    sys.exit(1)
