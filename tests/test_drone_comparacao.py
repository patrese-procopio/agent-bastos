# -*- coding: utf-8 -*-
"""
tests/test_drone_comparacao.py — Comparação de Voos (Missão 31, Fase 3)
─────────────────────────────────────────────────────────────────────────────
Cenário sintético de supressão de vegetação:
  Voo A (antes):  cena verde homogênea
  Voo B (depois): mesma coordenada, com "clareira" marrom em 1/4 da cena

Esperado: pareamento por GPS casa as fotos, delta_veg NEGATIVO
(vegetação sumiu) e diff_pct alto na foto alterada, heatmap gerado.
"""

import time

import pytest
from PIL import Image, ImageDraw
from PIL.TiffImagePlugin import IFDRational

from services import drone_service as ds
from services import drone_comparacao as dc

from tests.test_drone_service import _aguardar_job  # noqa: F401


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _foto_cena(path, lat, lon, hora, clareira=False):
    """Cena 'aérea' sintética: campo verde; opcionalmente com clareira marrom."""
    img = Image.new("RGB", (800, 600), (34, 120, 45))          # vegetação
    dr = ImageDraw.Draw(img)
    # textura leve para não ser 100% uniforme
    for i in range(0, 800, 40):
        dr.line([(i, 0), (i, 600)], fill=(30, 110, 40), width=6)
    if clareira:
        dr.rectangle([400, 150, 780, 450], fill=(139, 105, 70))  # solo exposto

    exif = Image.Exif()
    exif.get_ifd(0x8769)[0x9003] = hora

    def dms(dec):
        dec = abs(dec)
        d = int(dec); m = int((dec - d) * 60); s = ((dec - d) * 60 - m) * 60
        return (IFDRational(d, 1), IFDRational(m, 1), IFDRational(int(s * 100), 100))

    gps = exif.get_ifd(0x8825)
    gps[1] = "S"; gps[2] = dms(lat)
    gps[3] = "W"; gps[4] = dms(lon)
    gps[5] = 0;   gps[6] = IFDRational(9000, 100)
    img.save(path, "JPEG", exif=exif)


COORDS = [(3.1019, 60.0250), (3.1015, 60.0244), (3.1010, 60.0238)]


@pytest.fixture
def dois_voos(tmp_path, monkeypatch):
    drone_dir = tmp_path / "drone"
    monkeypatch.setattr(ds, "DRONE_DIR", drone_dir)
    monkeypatch.setattr(ds, "MISSIONS_DIR", drone_dir / "missoes")
    monkeypatch.setattr(ds, "DB_PATH", drone_dir / "drone.db")
    monkeypatch.setattr(dc, "COMP_DIR", drone_dir / "comparacoes")
    ds._init()

    voos = {}
    for rotulo, clareira, dia in [("antes", False, "05"), ("depois", True, "06")]:
        pasta = tmp_path / f"sd_{rotulo}"
        pasta.mkdir()
        for i, (lat, lon) in enumerate(COORDS):
            _foto_cena(pasta / f"DJI_{rotulo}_{i}.JPG", lat, lon,
                       f"2026:07:{dia} 09:1{i}:00", clareira=clareira and i == 1)
        m = ds.criar_missao({"nome": f"Perimetro Norte ({rotulo})",
                             "perimetro": "Setor N-3"}, usuario="pytest")
        job = ds.iniciar_importacao(m["id"], str(pasta), usuario="pytest")
        _aguardar_job(job["job_id"])
        voos[rotulo] = m["id"]
    return voos


# ─── Testes ───────────────────────────────────────────────────────────────────

def test_comparacao_detecta_supressao(dois_voos):
    r = dc.comparar(dois_voos["antes"], dois_voos["depois"], usuario="pytest")

    assert r["resumo"]["pares"] == 3                 # 3 waypoints casados
    # par com clareira deve liderar o ranking de mudança
    alterado = r["pares"][0]
    assert alterado["diff_pct"] > 5.0
    assert alterado["delta_veg"] < -10.0             # vegetação SUMIU
    # pares intactos: quase nada mudou
    for par in r["pares"][1:]:
        assert par["diff_pct"] < 2.0
        assert abs(par["delta_veg"]) < 2.0
    # heatmap do par alterado existe e é PNG
    hm = dc.caminho_heatmap(r["resumo"]["comp_id"], alterado["idx"])
    assert hm and hm.read_bytes().startswith(b"\x89PNG")


def test_erros_de_validacao(dois_voos):
    with pytest.raises(ValueError):                  # mesma missão 2x
        dc.comparar(dois_voos["antes"], dois_voos["antes"])
    with pytest.raises(ValueError):                  # missão inexistente
        dc.comparar(dois_voos["antes"], "nao-existe")


def test_raio_pequeno_sem_pares(dois_voos):
    # Raio de 1 m não casa nada se os pontos forem idênticos? Casa (dist 0).
    # Mas entre waypoints diferentes (~90 m) nunca cruza — garante que o
    # pareamento não mistura waypoints distintos.
    r = dc.comparar(dois_voos["antes"], dois_voos["depois"], raio_m=1.0)
    assert r["resumo"]["pares"] == 3
    assert all(p["dist_m"] < 1.0 for p in r["pares"])


def test_heatmap_path_traversal_bloqueado(dois_voos):
    assert dc.caminho_heatmap("../../etc", 0) is None
    assert dc.caminho_heatmap("x" * 36, 0) is None
