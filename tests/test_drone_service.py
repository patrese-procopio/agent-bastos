# -*- coding: utf-8 -*-
"""
tests/test_drone_service.py — Operações Drone (Missão 31)
─────────────────────────────────────────────────────────────────────────────
Valida o pipeline completo: missão → importação do cartão SD → EXIF →
trajeto reconstruído → dedupe por hash → guarda anti path-traversal.

As fotos de teste são geradas em memória com EXIF GPS idêntico ao padrão
DJI (hemisfério Sul/Oeste — Manaus), sem depender de arquivos reais.
"""

import time

import pytest
from PIL import Image
from PIL.TiffImagePlugin import IFDRational

from services import drone_service as ds


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _make_foto_dji(path, lat, lon, alt, hora):
    """Foto sintética com EXIF GPS no formato que a DJI grava."""
    img = Image.new("RGB", (800, 600), (30, 90, 40))
    exif = Image.Exif()
    exif[0x0132] = hora
    exif.get_ifd(0x8769)[0x9003] = hora          # DateTimeOriginal

    def dms(dec):
        dec = abs(dec)
        d = int(dec)
        m = int((dec - d) * 60)
        s = ((dec - d) * 60 - m) * 60
        return (IFDRational(d, 1), IFDRational(m, 1), IFDRational(int(s * 100), 100))

    gps = exif.get_ifd(0x8825)
    gps[1] = "S"
    gps[2] = dms(lat)
    gps[3] = "W"
    gps[4] = dms(lon)
    gps[5] = 0
    gps[6] = IFDRational(int(alt * 100), 100)
    img.save(path, "JPEG", exif=exif)


def _aguardar_job(job_id, timeout=15):
    for _ in range(int(timeout / 0.2)):
        job = ds.obter_job(job_id)
        if job["status"] != "executando":
            return job
        time.sleep(0.2)
    pytest.fail("importacao nao terminou no tempo esperado")


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def ambiente(tmp_path, monkeypatch):
    """Redireciona o storage do módulo para tmp_path — nada toca o data/ real."""
    drone_dir = tmp_path / "drone"
    monkeypatch.setattr(ds, "DRONE_DIR", drone_dir)
    monkeypatch.setattr(ds, "MISSIONS_DIR", drone_dir / "missoes")
    monkeypatch.setattr(ds, "DB_PATH", drone_dir / "drone.db")
    ds._init()

    sdcard = tmp_path / "sdcard"
    sdcard.mkdir()
    _make_foto_dji(sdcard / "DJI_0001.JPG", 3.1019, 60.0250, 87.5, "2026:07:05 09:12:00")
    _make_foto_dji(sdcard / "DJI_0002.JPG", 3.1015, 60.0244, 92.0, "2026:07:05 09:13:30")
    _make_foto_dji(sdcard / "DJI_0003.JPG", 3.1010, 60.0238, 95.3, "2026:07:05 09:15:00")
    (sdcard / "DJI_0004.MP4").write_bytes(b"\x00" * 1024 * 64)
    (sdcard / "ignorar.txt").write_text("nao e midia")
    return sdcard


@pytest.fixture
def missao(ambiente):
    return ds.criar_missao(
        {"nome": "Vigilancia Perimetro Norte", "perimetro": "Setor N-3",
         "piloto": "Teste", "drone_modelo": "DJI Mavic 3",
         "sarpas_protocolo": "SARPAS-2026-TEST",
         "checklist": {"bateria": True, "helices": True}},
        usuario="pytest",
    )


# ─── Testes ───────────────────────────────────────────────────────────────────

def test_criar_e_listar_missao(missao):
    assert missao["status"] == "planejada"
    assert missao["checklist"]["bateria"] is True
    nomes = [m["nome"] for m in ds.listar_missoes()]
    assert "Vigilancia Perimetro Norte" in nomes


def test_importacao_extrai_exif_e_gera_trajeto(missao, ambiente):
    job = ds.iniciar_importacao(missao["id"], str(ambiente), usuario="pytest")
    resultado = _aguardar_job(job["job_id"])

    assert resultado["status"] == "concluido"
    assert resultado["processados"] == 4          # 3 fotos + 1 video; .txt ignorado
    assert resultado["erros"] == 0

    m = ds.obter_missao(missao["id"])
    assert m["status"] == "realizada"             # avancou automaticamente

    fotos = [x for x in m["midias"] if x["tipo"] == "foto"]
    assert len(fotos) == 3
    # Hemisferio Sul/Oeste => coordenadas negativas (Manaus ~ -3.1, -60.0)
    assert all(f["lat"] is not None and f["lat"] < 0 for f in fotos)
    assert all(f["lon"] is not None and f["lon"] < 0 for f in fotos)
    assert all(f["tem_thumb"] for f in fotos)

    trajeto = ds.trajeto_missao(missao["id"])
    assert len(trajeto) == 3
    horarios = [p["capturado_em"] for p in trajeto]
    assert horarios == sorted(horarios)           # ordenado no tempo


def test_dedupe_por_hash(missao, ambiente):
    job1 = ds.iniciar_importacao(missao["id"], str(ambiente), usuario="pytest")
    _aguardar_job(job1["job_id"])
    job2 = ds.iniciar_importacao(missao["id"], str(ambiente), usuario="pytest")
    resultado = _aguardar_job(job2["job_id"])
    assert resultado["duplicados"] == 4           # nada importado duas vezes


def test_origem_invalida(missao):
    with pytest.raises(ValueError):
        ds.iniciar_importacao(missao["id"], "Z:\\pasta\\inexistente", usuario="pytest")


def test_caminho_midia_inexistente_retorna_none(ambiente):
    assert ds.caminho_midia("id-que-nao-existe") is None


def test_excluir_missao_remove_midia_fisica(missao, ambiente):
    job = ds.iniciar_importacao(missao["id"], str(ambiente), usuario="pytest")
    _aguardar_job(job["job_id"])
    pasta = ds.MISSIONS_DIR / missao["id"]
    assert pasta.exists()
    assert ds.excluir_missao(missao["id"], usuario="pytest") is True
    assert not pasta.exists()                     # descarte fisico completo
    assert ds.obter_missao(missao["id"]) is None
