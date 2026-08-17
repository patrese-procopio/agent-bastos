# -*- coding: utf-8 -*-
"""
services/drone_comparacao.py — Comparação de Voos (Missão 31, Fase 3)
─────────────────────────────────────────────────────────────────────────────
Compara dois voos sobre o MESMO perímetro e aponta onde a cena mudou:
supressão de vegetação, estruturas novas, alterações no perímetro.

COMO FUNCIONA (3 etapas):

1. PAREAMENTO POR GPS
   Cada foto georreferenciada do voo A é casada com a foto mais próxima
   do voo B dentro de um raio (default 15 m). Voos de varredura repetem
   waypoints — as fotos "caem" praticamente no mesmo lugar.

2. ÍNDICE DE VEGETAÇÃO ExG (Excess Green)
   Câmera RGB comum não mede NDVI (precisaria de banda NIR/multiespectral).
   O ExG = 2G - R - B é o substituto clássico da literatura de agricultura
   de precisão: vegetação verde tem G dominante. O %-de-pixels-vegetados
   de cada foto vira um número comparável entre datas.

3. DIFF ESTRUTURAL + HEATMAP
   As duas fotos são reduzidas, borradas (Gaussian) e subtraídas.
   Pixels com diferença acima do limiar viram máscara vermelha sobre a
   foto mais recente — o heatmap mostra ONDE mudou.

LIMITAÇÃO HONESTA (documentada de propósito):
   Não fazemos registro geométrico (alinhamento subpixel) entre as fotos.
   Pequenas variações de posição/ângulo do drone geram ruído no diff —
   o blur e o limiar mitigam, mas o heatmap é APOIO à análise humana,
   não veredito. O analista confirma no par lado a lado.

PERFORMANCE:
   Opera sobre os THUMBNAILS (480px) já gerados na importação — cada par
   custa ~20 ms. Comparação de 60 pares responde em ~2 s, síncrona.
"""

from __future__ import annotations

import logging
import math
import re
import uuid
from pathlib import Path
from typing import Optional

from services import drone_service
from services.drone_service import _audit, DRONE_DIR

logger = logging.getLogger("bastos.drone.comparacao")

COMP_DIR = DRONE_DIR / "comparacoes"

_RAIO_DEFAULT_M = 15.0
_MAX_PARES      = 60
_TAM_ANALISE    = (512, 384)   # tamanho fixo p/ métricas e heatmap
_EXG_LIMIAR     = 20           # 2G-R-B acima disso = pixel vegetado
_DIFF_LIMIAR    = 30           # diferença de cinza acima disso = mudança


# ══════════════════════════════════════════════════════════════════════════════
# Pareamento por GPS
# ══════════════════════════════════════════════════════════════════════════════

def _haversine_m(a: dict, b: dict) -> float:
    R = 6371000.0
    rad = math.radians
    dlat, dlon = rad(b["lat"] - a["lat"]), rad(b["lon"] - a["lon"])
    s = math.sin(dlat / 2) ** 2 + \
        math.cos(rad(a["lat"])) * math.cos(rad(b["lat"])) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(s))


def _fotos_gps(missao: dict) -> list[dict]:
    return [m for m in missao.get("midias", [])
            if m["tipo"] == "foto" and m.get("lat") is not None and m.get("tem_thumb")]


def _parear(fotos_a: list[dict], fotos_b: list[dict], raio_m: float) -> list[tuple]:
    """
    Greedy nearest-neighbor: para cada foto de A, a foto de B mais próxima
    dentro do raio, sem repetir foto de B. Pares ordenados por distância —
    os casamentos mais confiáveis primeiro.
    """
    candidatos = []
    for fa in fotos_a:
        for fb in fotos_b:
            d = _haversine_m(fa, fb)
            if d <= raio_m:
                candidatos.append((d, fa, fb))
    candidatos.sort(key=lambda c: c[0])

    pares, usados_a, usados_b = [], set(), set()
    for d, fa, fb in candidatos:
        if fa["id"] in usados_a or fb["id"] in usados_b:
            continue
        usados_a.add(fa["id"])
        usados_b.add(fb["id"])
        pares.append((d, fa, fb))
        if len(pares) >= _MAX_PARES:
            break
    return pares


# ══════════════════════════════════════════════════════════════════════════════
# Métricas de imagem (numpy sobre thumbnails)
# ══════════════════════════════════════════════════════════════════════════════

def _carregar(path: Path):
    from PIL import Image
    import numpy as np
    with Image.open(path) as img:
        img = img.convert("RGB").resize(_TAM_ANALISE)
        return np.asarray(img).astype(np.int16)


def _veg_pct(arr) -> float:
    """% de pixels vegetados via ExG = 2G - R - B."""
    exg = 2 * arr[:, :, 1] - arr[:, :, 0] - arr[:, :, 2]
    return float((exg > _EXG_LIMIAR).mean() * 100.0)


def _analisar_par(path_a: Path, path_b: Path, heatmap_dest: Path) -> dict:
    from PIL import Image, ImageFilter
    import numpy as np

    arr_a, arr_b = _carregar(path_a), _carregar(path_b)
    veg_a, veg_b = _veg_pct(arr_a), _veg_pct(arr_b)

    # Diff por CANAL RGB (não em cinza): mudança de vegetação p/ solo exposto
    # muda o MATIZ mantendo luminância parecida — em tons de cinza ela some.
    # max() entre canais captura qualquer troca de cor. Blur mitiga desalinhamento.
    def _rgb_borrado(arr):
        img = Image.fromarray(arr.astype("uint8"))
        return np.asarray(img.filter(ImageFilter.GaussianBlur(3))).astype(np.int16)

    diff = np.abs(_rgb_borrado(arr_a) - _rgb_borrado(arr_b)).max(axis=2)
    mask = diff > _DIFF_LIMIAR
    diff_pct = float(mask.mean() * 100.0)

    # Heatmap: foto B (mais recente) com as zonas de mudança em vermelho
    base = arr_b.astype(np.float32)
    base[mask] = base[mask] * 0.35 + np.array([220, 38, 38], dtype=np.float32) * 0.65
    heatmap_dest.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(base.astype("uint8")).save(heatmap_dest, "PNG")

    return {"veg_a_pct": round(veg_a, 1), "veg_b_pct": round(veg_b, 1),
            "delta_veg": round(veg_b - veg_a, 1), "diff_pct": round(diff_pct, 1)}


# ══════════════════════════════════════════════════════════════════════════════
# API pública
# ══════════════════════════════════════════════════════════════════════════════

def comparar(mid_a: str, mid_b: str, raio_m: float = _RAIO_DEFAULT_M,
             usuario: str = "sistema") -> dict:
    """
    Compara os voos A (referência/antes) e B (atual/depois).
    Retorna resumo + pares ordenados por % de mudança (maior primeiro).
    Heatmaps ficam em data/drone/comparacoes/<comp_id>/ e são servidos
    pelo endpoint autenticado do router.
    """
    ma, mb = drone_service.obter_missao(mid_a), drone_service.obter_missao(mid_b)
    if not ma or not mb:
        raise ValueError("Missão não encontrada")
    if mid_a == mid_b:
        raise ValueError("Selecione duas missões diferentes")

    fotos_a, fotos_b = _fotos_gps(ma), _fotos_gps(mb)
    if not fotos_a or not fotos_b:
        raise ValueError("As duas missões precisam ter fotos com GPS importadas")

    pares_gps = _parear(fotos_a, fotos_b, raio_m)
    if not pares_gps:
        raise ValueError(
            f"Nenhum par de fotos a menos de {raio_m:.0f} m entre os voos. "
            "Confirme que são voos do mesmo perímetro (ou aumente o raio).")

    comp_id = str(uuid.uuid4())
    resultados = []
    for idx, (dist, fa, fb) in enumerate(pares_gps):
        pa = drone_service.caminho_midia(fa["id"], thumb=True)
        pb = drone_service.caminho_midia(fb["id"], thumb=True)
        if not pa or not pb:
            continue
        met = _analisar_par(pa, pb, COMP_DIR / comp_id / f"{idx}.png")
        resultados.append({
            "idx": idx,
            "dist_m": round(dist, 1),
            "a": {"id": fa["id"], "nome": fa["nome_original"], "capturado_em": fa.get("capturado_em")},
            "b": {"id": fb["id"], "nome": fb["nome_original"], "capturado_em": fb.get("capturado_em")},
            **met,
        })

    resultados.sort(key=lambda r: r["diff_pct"], reverse=True)
    import statistics as st
    resumo = {
        "comp_id": comp_id,
        "missao_a": {"id": ma["id"], "nome": ma["nome"], "data_voo": ma["data_voo"]},
        "missao_b": {"id": mb["id"], "nome": mb["nome"], "data_voo": mb["data_voo"]},
        "pares": len(resultados),
        "fotos_sem_par": len(fotos_a) - len(resultados),
        "diff_medio_pct": round(st.mean(r["diff_pct"] for r in resultados), 1) if resultados else 0,
        "delta_veg_medio": round(st.mean(r["delta_veg"] for r in resultados), 1) if resultados else 0,
    }
    _audit(evento="comparacao_voos", categoria="drone", usuario=usuario,
           alvo=f"{mid_a}~{mid_b}",
           detalhe=f"comp {comp_id[:8]}: {len(resultados)} pares, "
                   f"diff medio {resumo['diff_medio_pct']}%, dveg {resumo['delta_veg_medio']}%")
    return {"resumo": resumo, "pares": resultados}


def caminho_heatmap(comp_id: str, idx: int) -> Optional[Path]:
    """Resolve o PNG do heatmap com validação anti path-traversal."""
    if not re.fullmatch(r"[0-9a-f\-]{36}", comp_id):
        return None
    path = (COMP_DIR / comp_id / f"{int(idx)}.png").resolve()
    if not str(path).startswith(str(COMP_DIR.resolve())):
        return None
    return path if path.exists() else None
