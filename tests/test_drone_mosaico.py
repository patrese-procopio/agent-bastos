# -*- coding: utf-8 -*-
"""
tests/test_drone_mosaico.py — Mosaico Rápido (Missão 31, Fase 4)
─────────────────────────────────────────────────────────────────────────────
Grade sintética 3x3: 9 fotos em waypoints espaçados ~20 m, cada uma de
uma cor. O mosaico deve: concluir, gerar JPEG + world file, ter bounds
englobando todos os pontos e conter as cores das fotos (colagem real).
"""

import time

import pytest
from PIL import Image
from PIL.TiffImagePlugin import IFDRational

from services import drone_service as ds
from services import drone_mosaico as dm

from tests.test_drone_service import _aguardar_job  # noqa: F401


def _foto_grade(path, lat, lon, hora, cor):
    img = Image.new("RGB", (800, 600), cor)
    exif = Image.Exif()
    exif.get_ifd(0x8769)[0x9003] = hora
    exif.get_ifd(0x8769)[0xA405] = 24        # focal 35mm equiv → FOV ~73.7°

    def dms(dec):
        dec = abs(dec)
        d = int(dec); m = int((dec - d) * 60); s = ((dec - d) * 60 - m) * 60
        return (IFDRational(d, 1), IFDRational(m, 1), IFDRational(int(s * 100), 100))

    gps = exif.get_ifd(0x8825)
    gps[1] = "S"; gps[2] = dms(lat)
    gps[3] = "W"; gps[4] = dms(lon)
    gps[5] = 0;   gps[6] = IFDRational(6000, 100)   # 60 m
    img.save(path, "JPEG", exif=exif)


def _aguardar_mosaico(job_id, timeout=30):
    for _ in range(int(timeout / 0.2)):
        job = dm.obter_job(job_id)
        if job["status"] != "executando":
            return job
        time.sleep(0.2)
    pytest.fail("mosaico nao terminou no tempo esperado")


@pytest.fixture
def missao_grade(tmp_path, monkeypatch):
    drone_dir = tmp_path / "drone"
    monkeypatch.setattr(ds, "DRONE_DIR", drone_dir)
    monkeypatch.setattr(ds, "MISSIONS_DIR", drone_dir / "missoes")
    monkeypatch.setattr(ds, "DB_PATH", drone_dir / "drone.db")
    # dm importa DRONE_DIR por valor — precisa ser repatchado no módulo dele
    monkeypatch.setattr(dm, "DRONE_DIR", drone_dir)
    monkeypatch.setattr(dm, "MOSAICO_DIR", drone_dir / "mosaicos")
    ds._init()
    dm._init()

    sdcard = tmp_path / "sdcard"
    sdcard.mkdir()
    # grade 3x3, passo ~0.00018° (~20 m), serpenteando como voo real
    base_lat, base_lon = 3.1000, 60.0200
    cores = [(200, 40, 40), (40, 200, 40), (40, 40, 200),
             (200, 200, 40), (40, 200, 200), (200, 40, 200),
             (240, 140, 40), (140, 40, 240), (40, 240, 140)]
    n = 0
    for i in range(3):
        cols = range(3) if i % 2 == 0 else range(2, -1, -1)
        for j in cols:
            _foto_grade(sdcard / f"DJI_{n:03d}.JPG",
                        base_lat + i * 0.00018, base_lon + j * 0.00018,
                        f"2026:07:07 10:{n:02d}:00", cores[n])
            n += 1

    m = ds.criar_missao({"nome": "Varredura Grade 3x3",
                         "perimetro": "Teste"}, usuario="pytest")
    job = ds.iniciar_importacao(m["id"], str(sdcard), usuario="pytest")
    _aguardar_job(job["job_id"])
    return m["id"]


def test_mosaico_rapido_conclui_e_georreferencia(missao_grade):
    r = dm.iniciar_mosaico(missao_grade, qualidade="rapida", usuario="pytest")
    job = _aguardar_mosaico(r["job_id"])

    assert job["status"] == "concluido", job["msg"]
    assert job["processados"] == 9

    # bounds englobam a grade (com folga da pegada)
    (min_lat, min_lon), (max_lat, max_lon) = job["bounds"]
    assert min_lat < -3.1000 and max_lat > -3.0996
    assert min_lon < -60.0200 and max_lon > -60.0196

    # JPEG existe e contém as cores coladas (não é canvas vazio)
    path = dm.caminho_imagem(r["job_id"])
    assert path and path.exists()
    img = Image.open(path)
    cores_achadas = set()
    px = img.load()
    for x in range(0, img.width, 25):
        for y in range(0, img.height, 25):
            p = px[x, y]
            if p != (14, 20, 33) and sum(p) > 90:
                cores_achadas.add((p[0] > 120, p[1] > 120, p[2] > 120))
    assert len(cores_achadas) >= 3          # várias cores distintas presentes

    # world file gerado (compatível com QGIS)
    jgw = path.with_suffix(".jgw")
    assert jgw.exists() and len(jgw.read_text().splitlines()) == 6


def test_mosaico_erros(missao_grade):
    with pytest.raises(ValueError):
        dm.iniciar_mosaico(missao_grade, qualidade="ultra")
    with pytest.raises(ValueError):
        dm.iniciar_mosaico("nao-existe")


def test_qualidade_media_usa_original(missao_grade):
    r = dm.iniciar_mosaico(missao_grade, qualidade="media", usuario="pytest")
    job = _aguardar_mosaico(r["job_id"])
    assert job["status"] == "concluido"
    assert job["gsd_cm"] <= 13              # GSD mais fino que o modo rápido


def test_e_nadir():
    assert dm._e_nadir(None) is True        # sem XMP (não-DJI): assume nadir
    assert dm._e_nadir(-90.0) is True       # câmera reto p/ baixo
    assert dm._e_nadir(-75.0) is True       # tolerância ok
    assert dm._e_nadir(-30.0) is False      # oblíqua — distorceria o mosaico
    assert dm._e_nadir(0.0) is False        # horizonte


def test_retencao_mantem_apenas_ultimos(missao_grade):
    # Gera 5 mosaicos; a política de retenção deve manter só os 3 últimos
    ids = []
    for _ in range(5):
        r = dm.iniciar_mosaico(missao_grade, qualidade="rapida", usuario="pytest")
        job = _aguardar_mosaico(r["job_id"])
        assert job["status"] == "concluido"
        ids.append(r["job_id"])

    restantes = dm.listar_mosaicos(missao_grade)
    assert len(restantes) == dm._MANTER_MOSAICOS
    assert [m["id"] for m in restantes][0] == ids[-1]      # mais recente vivo
    # os expurgados não têm mais registro nem arquivo
    for antigo in ids[:2]:
        assert dm.obter_job(antigo) is None
        assert dm.caminho_imagem(antigo) is None
    # pasta tem exatamente 3 jogos de arquivos (jpg + jgw + preview)
    pasta = dm.MOSAICO_DIR / missao_grade
    assert len(list(pasta.glob("*.jpg"))) == dm._MANTER_MOSAICOS


def test_excluir_missao_remove_mosaicos(missao_grade):
    r = dm.iniciar_mosaico(missao_grade, qualidade="rapida", usuario="pytest")
    _aguardar_mosaico(r["job_id"])
    pasta = dm.MOSAICO_DIR / missao_grade
    assert pasta.exists()
    # DRONE_DIR do drone_service precisa apontar p/ o mesmo tmp (fixture já faz)
    assert ds.excluir_missao(missao_grade, usuario="pytest") is True
    assert not pasta.exists()                               # descarte completo
    assert dm.listar_mosaicos(missao_grade) == []


def test_filtro_nadir_ignora_obliquas(missao_grade, monkeypatch):
    # Simula o XMP da DJI: DJI_004 com câmera inclinada (-30°), resto nadir
    original = dm._xmp_dji

    def fake_xmp(path):
        d = original(path)
        d["pitch"] = -30.0 if "DJI_004" in str(path) else -90.0
        return d

    monkeypatch.setattr(dm, "_xmp_dji", fake_xmp)
    r = dm.iniciar_mosaico(missao_grade, qualidade="rapida", usuario="pytest")
    job = _aguardar_mosaico(r["job_id"])
    assert job["status"] == "concluido"
    assert "1 obliquas ignoradas" in job["msg"]   # a inclinada ficou de fora
