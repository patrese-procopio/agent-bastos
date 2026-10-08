"""Testes do JWT (PyJWT): emissao, validacao, expiracao, adulteracao e algoritmo 'none'."""
import base64
import json
from datetime import timedelta

import jwt
import pytest

from services import auth_service as a


def test_access_token_roundtrip():
    tok = a.create_access_token("ana", "analista", ["alertas", "chat_rag"])
    p = a.decode_token(tok)
    assert p["sub"] == "ana" and p["type"] == "access"
    assert p["modules"] == ["alertas", "chat_rag"]
    assert "exp" in p and "iat" in p


def test_refresh_token_tipo():
    assert a.decode_token(a.create_refresh_token("ana"))["type"] == "refresh"


def test_token_expirado_levanta_jwterror():
    tok = a._create_token({"sub": "ana", "type": "access"}, timedelta(seconds=-5))
    with pytest.raises(a.JWTError):
        a.decode_token(tok)


def test_token_adulterado_levanta_jwterror():
    tok = a.create_access_token("ana", "analista", [])
    h, p, s = tok.split(".")
    payload = json.loads(base64.urlsafe_b64decode(p + "=" * (-len(p) % 4)))
    payload["level"] = "admin"
    p2 = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b"=").decode()
    with pytest.raises(a.JWTError):
        a.decode_token(f"{h}.{p2}.{s}")


def test_assinatura_com_outra_chave_recusada():
    tok = jwt.encode({"sub": "x", "type": "access"}, "outra-chave-qualquer-com-32-bytes-ok!", algorithm=a.ALGORITHM)
    with pytest.raises(a.JWTError):
        a.decode_token(tok)


def test_algoritmo_none_recusado():
    h = base64.urlsafe_b64encode(b'{"alg":"none","typ":"JWT"}').rstrip(b"=").decode()
    p = base64.urlsafe_b64encode(b'{"sub":"x","type":"access"}').rstrip(b"=").decode()
    with pytest.raises(a.JWTError):
        a.decode_token(f"{h}.{p}.")
