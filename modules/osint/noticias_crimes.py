"""
noticias_crimes.py — Notícias e alertas sobre a pessoa, classificadas por TIPO DE CRIME e PAPEL
Agent Bastos | Segurança Pública/Corporativa

Fontes:
  alertas do monitor   data/relatorios/alertas.json e alertas_osint.json (alvos monitorados, Telegram/OSINT);
                       já trazem risco e análise de IA feitos pelo monitor.
  feed de crimes (AM)  data/relatorios/noticias_crimes.json (notícias recentes coletadas pelo n8n).
  Google News (RSS)    busca ao vivo pelo NOME entre aspas (fonte externa pública).

Cada menção recebe:
  crime_tipos   categorias de crime detectadas no texto (homicídio, tráfico, facção, roubo…)
  papel         "autor" (preso, suspeito, condenado, denunciado…), "vitima" ou "citado"
  confianca     0-100. Só menção do NOME COMPLETO conta (nome abreviado fica < 50).

Quem usa: o motor de risco (risco.py). Só papel "autor" eleva o risco; vítima e citado são informativos
(evita acusar uma vítima ou um homônimo).
"""

from __future__ import annotations

import json
import re
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx

from .models import OsintRequest
from .receita_cnpj import norm, tokens

try:
    from config.paths import DATA_DIR
    _DATA = Path(DATA_DIR)
except Exception:
    _DATA = Path(__file__).resolve().parents[2] / "data"

PASTA = _DATA / "relatorios"
TIMEOUT_S = 20.0
MAX_GOOGLE = 15

# Categorias de crime (texto normalizado, sem acento) → rótulo
CRIMES: dict[str, str] = {
    r"\b(homicidio|assassinat|latrocinio|execucao|chacina|feminicidio|morto a tiros|matou)\w*": "homicídio",
    r"\b(trafico|traficante|entorpecente|drogas?|cocaina|maconha|apreensao de droga)\w*": "tráfico de drogas",
    r"\b(faccao|faccoes|comando vermelho|\bcv\b|\bpcc\b|familia do norte|\bfdn\b|organizacao criminosa|crime organizado)": "facção / organização criminosa",
    r"\b(roubo|assalto|latrocinio)\w*": "roubo",
    r"\b(sequestro|carcere privado|extorsao)\w*": "sequestro / extorsão",
    r"\b(estupro|abuso sexual|violencia sexual)\w*": "crime sexual",
    r"\b(corrupcao|lavagem de dinheiro|desvio|fraude|peculato|improbidade)\w*": "corrupção / fraude",
    r"\b(arma de fogo|porte ilegal|tiroteio|disparos?)\w*": "armas",
    r"\b(fuga|evadiu|evasao|foragido|motim|rebeliao)\w*": "fuga / motim",
}
GRAVES = {"homicídio", "tráfico de drogas", "facção / organização criminosa", "sequestro / extorsão", "crime sexual"}

_AUTOR = re.compile(r"\b(preso|presa|detido|detida|apreendido|capturado|flagrante|prisao|mandado de prisao|"
                    r"foragido|denunciado|indiciado|condenado|acusado|suspeito|investigado|autor|"
                    r"respondera|reu|reu confesso|cumpre pena|operacao)\b")
_VITIMA = re.compile(r"\b(vitima|vitimas|morto|morta|morreu|baleado|baleada|assassinado|assassinada|"
                     r"esfaqueado|ferido|encontrado morto|corpo)\b")


def classificar(texto: str, nome_norm: str) -> dict[str, Any]:
    """Tipos de crime e papel da pessoa no texto (heurística — o analista confirma)."""
    t = norm(texto).lower()
    crimes = sorted({rot for pad, rot in CRIMES.items() if re.search(pad, t)})
    papel = "citado"
    if nome_norm:
        n = re.escape(nome_norm.lower())
        # "morte de <nome>", "<nome> foi morto", "vítima <nome>" → vítima
        if re.search(rf"(morte|assassinato|execucao|homicidio|corpo|vitima|velorio)\s+(de|do|da)\s+{n}", t) or \
           re.search(rf"{n}\s+(foi|e|era)\s+(morto|morta|assassinad|baleado|baleada|esfaquead)", t):
            papel = "vitima"
        elif _AUTOR.search(t):
            papel = "autor"
        elif _VITIMA.search(t):
            papel = "vitima"
    return {"crime_tipos": crimes, "grave": bool(set(crimes) & GRAVES), "papel": papel}


def _limpa(s: str | None) -> str:
    s = re.sub(r"<[^>]+>", " ", s or "")
    return re.sub(r"\s+", " ", s).strip()


def _menciona(nome: str, texto: str) -> tuple[str, int] | None:
    """('nome completo', 55) / ('nome abreviado', 40) / None."""
    nn, tn = norm(nome), norm(texto)
    if not nn:
        return None
    if re.search(rf"\b{re.escape(nn)}\b", tn):
        return "nome completo na notícia", 55
    t = tokens(nome)
    if len(t) >= 3 and re.search(rf"\b{re.escape(t[0].upper())} {re.escape(t[-1].upper())}\b", tn):
        return "nome abreviado (primeiro e último)", 40
    return None


def _ler_json(caminho: Path) -> Any:
    try:
        return json.loads(caminho.read_text(encoding="utf-8", errors="replace"))
    except Exception:
        return None


def _montar(item: dict[str, Any], origem: str, pontos: int, motivos: list[str], nome: str, ufs: list[str]) -> dict[str, Any]:
    texto = f"{item.get('titulo', '')} {item.get('resumo', '')}"
    cls = classificar(texto, norm(nome))
    pontos_f = pontos
    if cls["papel"] == "autor" and cls["crime_tipos"]:
        pontos_f += 15; motivos.append("pessoa aparece como autor/suspeito de crime")
    elif cls["papel"] == "vitima":
        pontos_f = min(pontos_f, 40); motivos.append("pessoa aparece como VÍTIMA (informativo, não eleva o risco)")
    ctx = norm(texto)
    if any(norm(x) in ctx for x in ("manaus", "amazonas")) and "AM" in ufs:
        pontos_f += 10; motivos.append("notícia do Amazonas, coerente com o contexto da pesquisa")
    return {"pontos": max(0, min(100, pontos_f)), "motivos": motivos, "origem": origem,
            "titulo": _limpa(item.get("titulo"))[:200], "resumo": _limpa(item.get("resumo"))[:300],
            "fonte": item.get("fonte") or origem, "data": str(item.get("data") or item.get("timestamp") or "")[:16],
            "link": item.get("link"), "risco_monitor": item.get("risco"), "analise_ia": (item.get("analise_ia") or "")[:300] or None,
            **cls}


def _locais(nome: str, ufs: list[str]) -> list[dict[str, Any]]:
    achados: list[dict[str, Any]] = []
    # alertas do monitor (alvos monitorados)
    for arq, rotulo in (("alertas.json", "alerta do monitor (notícias)"), ("alertas_osint.json", "alerta OSINT (Telegram/web)")):
        for it in _ler_json(PASTA / arq) or []:
            alvo_ok = norm(it.get("alvo_nome")) == norm(nome)
            m = _menciona(nome, f"{it.get('titulo', '')} {it.get('resumo', '')} {it.get('termo_encontrado', '')}")
            if alvo_ok or m:
                pontos, motivos = (80, ["alerta gerado pelo monitor para este alvo"]) if alvo_ok else (m[1], [m[0]])
                achados.append(_montar(it, rotulo, pontos, motivos, nome, ufs))
    # feed de crimes do AM
    d = _ler_json(PASTA / "noticias_crimes.json") or {}
    for it in (d.get("noticias") if isinstance(d, dict) else []) or []:
        m = _menciona(nome, f"{it.get('titulo', '')} {it.get('resumo', '')}")
        if m:
            achados.append(_montar({**it, "fonte": "feed de crimes (AM)"}, "notícias do sistema", m[1], [m[0]], nome, ufs))
    return achados


def _google_news(nome: str, ufs: list[str]) -> list[dict[str, Any]]:
    url = f"https://news.google.com/rss/search?q={quote(chr(34) + nome + chr(34))}&hl=pt-BR&gl=BR&ceid=BR:pt-419"
    r = httpx.get(url, timeout=TIMEOUT_S, headers={"User-Agent": "Mozilla/5.0 (AgentBastos/1.0)"}, follow_redirects=True)
    r.raise_for_status()
    achados = []
    for it in ET.fromstring(r.content).iter("item"):
        titulo = it.findtext("title") or ""
        fonte = (it.find("source").text if it.find("source") is not None else "") or ""
        m = _menciona(nome, f"{titulo} {_limpa(it.findtext('description'))}")
        if not m:
            continue
        achados.append(_montar({"titulo": titulo, "resumo": _limpa(it.findtext("description")), "link": it.findtext("link"),
                                "data": it.findtext("pubDate"), "fonte": fonte or "Google News"},
                               "Google News", m[1], [m[0]], nome, ufs))
        if len(achados) >= MAX_GOOGLE:
            break
    return achados


def buscar_noticias(req: OsintRequest, ufs: list[str] | None = None) -> dict[str, Any]:
    if not req.nome or len(tokens(req.nome)) < 2:
        return {"status": "nao_aplicavel", "achados": [], "descartados": 0}
    ufs = ufs or []
    achados = _locais(req.nome, ufs)
    aviso = None
    try:
        achados += _google_news(req.nome, ufs)
    except Exception as exc:
        aviso = f"Google News indisponível ({type(exc).__name__})"
        if not achados:
            raise RuntimeError(aviso)
    vistos, unicos = set(), []
    for a in sorted(achados, key=lambda x: x["pontos"], reverse=True):
        chave = (norm(a["titulo"])[:80])
        if chave in vistos:
            continue
        vistos.add(chave); unicos.append(a)
    return {"status": "ok" if unicos else "vazio", "achados": unicos[:30], "descartados": 0, "aviso": aviso}
