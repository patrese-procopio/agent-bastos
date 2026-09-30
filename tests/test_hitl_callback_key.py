"""
tests/test_hitl_callback_key.py
─────────────────────────────────────────────────────────────────────────────
Testes da dependencia _validar_callback_key (callback n8n -> backend).
Monta um app minimo so com a dependencia, sem subir o backend inteiro.
"""

import os

# O router importa services/auth_service, que exige estas variaveis (fail-fast).
# Valores falsos so pra permitir o import: nenhum login acontece neste teste.
for _var in ("ADMIN_PASSWORD_HASH", "ANALISTA_PASSWORD_HASH"):
    os.environ.setdefault(_var, "hash-falso-de-teste")
os.environ.setdefault("JWT_SECRET_KEY", "x" * 64)

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from routers import human_loop_router as hl

CHAVE = "k" * 48


@pytest.fixture
def client():
    app = FastAPI()

    @app.post("/cb")
    def cb(_: None = Depends(hl._validar_callback_key)):
        return {"ok": True}

    return TestClient(app)


def test_chave_correta_passa(client, monkeypatch):
    monkeypatch.setattr(hl, "_CALLBACK_KEY", CHAVE)
    assert client.post("/cb", headers={"X-Hitl-Key": CHAVE}).status_code == 200


def test_chave_errada_ou_ausente_403(client, monkeypatch):
    monkeypatch.setattr(hl, "_CALLBACK_KEY", CHAVE)
    assert client.post("/cb", headers={"X-Hitl-Key": "errada"}).status_code == 403
    assert client.post("/cb").status_code == 403


def test_sem_chave_configurada_recusa_em_producao(client, monkeypatch):
    monkeypatch.setattr(hl, "_CALLBACK_KEY", "")
    monkeypatch.setenv("BASTOS_ENV", "production")
    assert client.post("/cb", headers={"X-Hitl-Key": "qualquer"}).status_code == 503
    assert client.post("/cb").status_code == 503


def test_sem_chave_configurada_libera_so_em_dev(client, monkeypatch):
    monkeypatch.setattr(hl, "_CALLBACK_KEY", "")
    monkeypatch.setenv("BASTOS_ENV", "development")
    assert client.post("/cb").status_code == 200
