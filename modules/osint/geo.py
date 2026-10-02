"""
geo.py — Mapa UF ↔ tribunais, para cruzar contexto geográfico entre fontes
Agent Bastos | Segurança Pública/Corporativa

Usa a lista oficial do DJEN (GET /api/v1/comunicacao/tribunal), que traz, por UF,
os tribunais com jurisdição ali (ex.: AM → TJAM, TRT11, TRF1, TRE-AM). Fica em cache
por 24 h; se a API falhar, cai num mapa mínimo derivado da sigla (TJ+UF).
"""

from __future__ import annotations

import time

import httpx

_URL = "https://comunicaapi.pje.jus.br/api/v1/comunicacao/tribunal"
_TTL = 24 * 3600.0
_cache: dict[str, object] = {"ts": 0.0, "uf2sig": {}, "sig2uf": {}}

UFS = {"AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR",
       "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"}


def _carregar() -> None:
    if _cache["uf2sig"] and time.monotonic() - float(_cache["ts"]) < _TTL:
        return
    uf2sig: dict[str, list[str]] = {}
    try:
        r = httpx.get(_URL, headers={"Accept": "application/json", "User-Agent": "AgentBastos/1.0"}, timeout=20)
        r.raise_for_status()
        for e in r.json():
            uf = (e.get("uf") or "").upper()
            if uf in UFS:
                uf2sig[uf] = [i["sigla"] for i in e.get("instituicoes", []) if i.get("sigla")]
    except Exception:
        pass
    if not uf2sig:  # reserva mínima: pelo menos o tribunal de justiça da UF
        uf2sig = {uf: [f"TJ{uf}"] for uf in UFS}
    sig2uf: dict[str, set[str]] = {}
    for uf, sigs in uf2sig.items():
        for s in sigs:
            sig2uf.setdefault(s.upper(), set()).add(uf)
    _cache.update(ts=time.monotonic(), uf2sig=uf2sig, sig2uf=sig2uf)


def ufs_do_tribunal(sigla: str | None) -> set[str]:
    """UFs onde o tribunal tem jurisdição ('TJAM'→{AM}; 'TRF1'→{AC, AM, …}; 'STJ'→{})."""
    _carregar()
    s = (sigla or "").upper()
    if s in _cache["sig2uf"]:  # type: ignore[operator]
        return set(_cache["sig2uf"][s])  # type: ignore[index]
    for uf in UFS:  # TJ??/TRE-?? fora da lista
        if s in (f"TJ{uf}", f"TRE-{uf}", f"TJM{uf}"):
            return {uf}
    return set()


def tribunais_da_uf(uf: str, incluir_eleitoral: bool = False) -> list[str]:
    """Siglas aceitas pelo DJEN para a UF (justiça comum, trabalho e federal)."""
    _carregar()
    sigs = list(_cache["uf2sig"].get(uf.upper(), []))  # type: ignore[union-attr]
    if not incluir_eleitoral:
        sigs = [s for s in sigs if not s.upper().startswith("TRE")]
    return sigs
