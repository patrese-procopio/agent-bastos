"""
fotos.py — Fotos do pesquisado a partir de fontes OFICIAIS/INTERNAS e de perfis confirmados
Agent Bastos | Segurança Pública/Corporativa

Fontes:
  TSE        foto oficial da candidatura (DivulgaCandContas) — eleições gerais e municipais (2014-2024)
  Lideranças foto cadastrada no sistema (unidades e líderes de rua)
  Perfis     foto de perfil de contas sociais que o analista CONFIRMOU (ver pegada_digital)

NÃO faz busca por reconhecimento facial na web: é dado biométrico sensível (LGPD, arts. 5º e 11),
tem alta taxa de falso positivo e depende de serviços de terceiros. A galeria só mostra a origem
de cada foto e o nível de confiança da IDENTIDADE (herdado do achado), para o analista comparar.

As imagens ficam só em memória (LRU, TTL de 12 h) e são servidas por rota autenticada.
"""

from __future__ import annotations

import time
import uuid
from collections import OrderedDict
from typing import Any

import httpx

_UA = {"User-Agent": "AgentBastos/1.0", "Accept": "application/json"}
_TTL = 12 * 3600.0
_MAX = 300
MAX_BYTES = 2_000_000

_store: "OrderedDict[str, dict[str, Any]]" = OrderedDict()
_eleicoes: dict[int, list[int]] = {}


def _guardar(conteudo: bytes, mime: str, meta: dict[str, Any]) -> str:
    fid = uuid.uuid4().hex
    _store[fid] = {"bytes": conteudo, "mime": mime, "ts": time.monotonic(), **meta}
    while len(_store) > _MAX:
        _store.popitem(last=False)
    return fid


def obter(fid: str) -> dict[str, Any] | None:
    f = _store.get(fid)
    if not f or time.monotonic() - f["ts"] > _TTL:
        _store.pop(fid, None)
        return None
    return f


def guardar_externa(conteudo: bytes, mime: str, meta: dict[str, Any]) -> str:
    """Registra uma imagem obtida por outro módulo (ex.: foto de perfil confirmada)."""
    return _guardar(conteudo, mime, meta)


# ─────────────────────────────────────────────
# TSE
# ─────────────────────────────────────────────

def _ids_eleicao(ano: int) -> list[int]:
    if not _eleicoes:
        try:
            r = httpx.get("https://divulgacandcontas.tse.jus.br/divulga/rest/v1/eleicao/ordinarias",
                          headers=_UA, timeout=30)
            for e in r.json():
                _eleicoes.setdefault(int(e["ano"]), []).append(int(e["id"]))
        except Exception:
            pass
    return _eleicoes.get(ano, [])


MUNICIPAIS = (2016, 2020, 2024)


def foto_tse(ano: int, uf: str, sq: str, sg_ue: str = "") -> tuple[bytes, str] | None:
    """Foto oficial da candidatura (DivulgaCandContas). Eleições gerais usam a UF no caminho;
    as municipais (2016/2020/2024) usam o código do município (SG_UE)."""
    if not sq or ano not in (2014, 2016, 2018, 2020, 2022, 2024):
        return None
    local = (sg_ue or "") if ano in MUNICIPAIS else (uf or "")
    if not local:
        return None
    for ele in _ids_eleicao(ano):
        try:
            r = httpx.get(f"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/{ano}/{local}/{ele}/candidato/{sq}",
                          headers=_UA, timeout=30)
            if r.status_code != 200 or "json" not in (r.headers.get("content-type") or ""):
                continue
            url = (r.json() or {}).get("fotoUrl")
            if not url:
                continue
            img = httpx.get(url, headers={"User-Agent": "AgentBastos/1.0"}, timeout=30, follow_redirects=True)
            mime = (img.headers.get("content-type") or "").split(";")[0]
            if img.status_code == 200 and mime.startswith("image/") and 500 < len(img.content) <= MAX_BYTES:
                return img.content, mime
        except Exception:
            continue
    return None


# ─────────────────────────────────────────────
# COLETA PARA UM RELATÓRIO
# ─────────────────────────────────────────────

def coletar(report_id: str, achados: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Fotos disponíveis para os achados confirmados/prováveis. Nunca levanta."""
    fotos: list[dict[str, Any]] = []
    vistos: set[tuple] = set()

    def _add(conteudo: bytes, mime: str, fonte: str, legenda: str, a: dict[str, Any]):
        chave = (fonte, legenda, len(conteudo))
        if chave in vistos:
            return
        vistos.add(chave)
        fid = _guardar(conteudo, mime, {"report_id": report_id, "fonte": fonte, "legenda": legenda})
        fotos.append({"id": fid, "fonte": fonte, "legenda": legenda,
                      "confianca": a.get("confianca"), "nivel": a.get("nivel")})

    for a in achados:
        if a.get("nivel") not in ("confirmado", "provavel"):
            continue
        try:
            d = a.get("dados") or {}
            if a.get("fonte") == "tse":
                cands = sorted(d.get("candidaturas") or [], key=lambda c: c.get("ano", 0), reverse=True)
                n = 0
                for c in cands:
                    if n >= 2:
                        break
                    r = foto_tse(int(c.get("ano") or 0), c.get("uf") or "", str(c.get("sq") or ""), str(c.get("sg_ue") or ""))
                    if r:
                        n += 1
                        _add(r[0], r[1], "TSE — foto oficial da candidatura",
                             f"{c.get('ano')} · {c.get('cargo')} · {c.get('partido')}/{c.get('uf')}", a)
            elif a.get("fonte") == "liderancas" and d.get("foto_ext") and d.get("lider_id"):
                from modules import liderancas as L
                carregar = L.carregar_foto_rua if d.get("escopo") == "rua" else L.carregar_foto
                b = carregar(d["lider_id"], d["foto_ext"])
                if b and len(b) <= MAX_BYTES:
                    ext = str(d["foto_ext"]).lower().lstrip(".")
                    mime = "image/png" if ext == "png" else "image/jpeg"
                    _add(b, mime, "Lideranças (cadastro interno)",
                         f"{d.get('nome', '')} — {d.get('faccao') or ''}".strip(" —"), a)
        except Exception:
            continue
    return fotos
