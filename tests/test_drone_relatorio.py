# -*- coding: utf-8 -*-
"""
tests/test_drone_relatorio.py — Relatório de Voo (Missão 31, Fase 2)
─────────────────────────────────────────────────────────────────────────────
Valida a geração de DOCX/PDF: assinatura binária, conteúdo mínimo,
seleção de fotos e erro para missão inexistente.
Reaproveita as fixtures de fotos sintéticas do test_drone_service.
"""

import pytest

from services import drone_service as ds
from services import drone_relatorio as dr

# Reaproveita fixtures (ambiente, missao) e helpers do teste da Fase 1
from tests.test_drone_service import ambiente, missao, _aguardar_job  # noqa: F401


@pytest.fixture
def missao_com_midia(missao, ambiente):
    job = ds.iniciar_importacao(missao["id"], str(ambiente), usuario="pytest")
    _aguardar_job(job["job_id"])
    return ds.obter_missao(missao["id"])


def test_docx_assinatura_e_tamanho(missao_com_midia):
    dados, nome = dr.gerar_relatorio(missao_com_midia["id"], formato="docx",
                                     parecer="Teste de parecer.", usuario="pytest")
    assert dados.startswith(b"PK")          # DOCX é um zip
    assert nome.endswith(".docx")
    assert len(dados) > 10_000              # tem croqui + fotos embutidos


def test_pdf_assinatura(missao_com_midia):
    dados, nome = dr.gerar_relatorio(missao_com_midia["id"], formato="pdf",
                                     usuario="pytest")
    assert dados.startswith(b"%PDF")
    assert nome.endswith(".pdf")


def test_selecao_manual_de_fotos(missao_com_midia):
    fotos = [m["id"] for m in missao_com_midia["midias"] if m["tipo"] == "foto"][:1]
    dados, _ = dr.gerar_relatorio(missao_com_midia["id"], formato="pdf",
                                  midia_ids=fotos, usuario="pytest")
    assert dados.startswith(b"%PDF")


def test_formato_invalido(missao_com_midia):
    with pytest.raises(ValueError):
        dr.gerar_relatorio(missao_com_midia["id"], formato="txt")


def test_missao_inexistente():
    with pytest.raises(ValueError):
        dr.gerar_relatorio("nao-existe", formato="docx")


def test_stats_sem_gps_retorna_none():
    assert dr._stats([]) is None
    assert dr._stats([{"lat": -3.1, "lon": -60.0, "capturado_em": "2026-07-07T09:00:00"}]) is None
