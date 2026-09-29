"""
tests/test_api_key.py
─────────────────────────────────────────────────────────────────────────────
Testes do portao de API key (services/api_key_service.py + ApiKeyMiddleware).

Conceito: montamos um FastAPI MINIMO so com o middleware, em vez de importar
o api.py inteiro (que carrega RAG, schedulers, bancos...). Teste unitario bom
isola o que esta sendo testado.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from services import api_key_service as svc
from services.middlewares import ApiKeyMiddleware

CHAVE = "a" * 64
OUTRA = "b" * 64


def _app(keys):
    app = FastAPI()
    app.add_middleware(ApiKeyMiddleware, keys=keys)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.post("/api/auth/login")
    def login():
        return {"ok": True}

    @app.post("/api/human-loop/responder/{id}")
    def responder(id: str):
        return {"ok": True}

    return TestClient(app)


class TestVerifyKey:
    def test_chave_correta(self):
        assert svc.verify_key(CHAVE, [CHAVE]) is True

    def test_chave_errada_ou_ausente(self):
        assert svc.verify_key(OUTRA, [CHAVE]) is False
        assert svc.verify_key("", [CHAVE]) is False
        assert svc.verify_key(None, [CHAVE]) is False

    def test_rotacao_aceita_qualquer_chave_da_lista(self):
        assert svc.verify_key(OUTRA, [CHAVE, OUTRA]) is True

    def test_fingerprint_nao_vaza_chave(self):
        fp = svc.fingerprint(CHAVE)
        assert len(fp) == 8 and fp not in CHAVE


class TestLoadKeys:
    def test_vazio_desativa(self, monkeypatch):
        monkeypatch.delenv("BASTOS_API_KEY", raising=False)
        monkeypatch.delenv("BASTOS_API_KEYS", raising=False)
        assert svc.load_keys() == []

    def test_multiplas_com_espacos(self, monkeypatch):
        monkeypatch.delenv("BASTOS_API_KEY", raising=False)
        monkeypatch.setenv("BASTOS_API_KEYS", f" {CHAVE} , {OUTRA} ,")
        assert svc.load_keys() == [CHAVE, OUTRA]

    def test_chave_curta_gera_problema(self):
        assert svc.validate_keys(["curta"]) != []
        assert svc.validate_keys([CHAVE]) == []


class TestMiddleware:
    def test_sem_chave_recebe_401(self):
        assert _app([CHAVE]).post("/api/auth/login").status_code == 401

    def test_chave_errada_recebe_401(self):
        r = _app([CHAVE]).post("/api/auth/login", headers={"X-API-Key": OUTRA})
        assert r.status_code == 401

    def test_chave_correta_passa(self):
        r = _app([CHAVE]).post("/api/auth/login", headers={"X-API-Key": CHAVE})
        assert r.status_code == 200

    def test_health_e_publico(self):
        assert _app([CHAVE]).get("/health").status_code == 200

    def test_callback_hitl_e_publico(self):
        assert _app([CHAVE]).post("/api/human-loop/responder/x").status_code == 200

    def test_preflight_cors_nao_e_bloqueado(self):
        assert _app([CHAVE]).options("/api/auth/login").status_code != 401

    def test_gate_desligado_sem_chaves(self):
        assert _app([]).post("/api/auth/login").status_code == 200

    def test_resposta_401_nao_vaza_detalhes(self):
        r = _app([CHAVE]).post("/api/auth/login", headers={"X-API-Key": OUTRA})
        assert CHAVE not in r.text and OUTRA not in r.text
