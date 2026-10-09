"""Rotas do Acervo de Áudios: upload em lote, listagem, player (Range + ?token), busca, correção,
custódia, exportação e controle de acesso. App mínimo (sem carregar RAG/embeddings)."""
import io

import numpy as np
import pytest
import soundfile as sf
from fastapi import FastAPI
from fastapi.testclient import TestClient

from modules import audio_acervo as ac
from routers.audio_router import router
from services.auth_service import create_access_token
from services.rate_limit_service import montar_rate_limit


@pytest.fixture
def cli(tmp_path, monkeypatch):
    monkeypatch.setattr(ac, "DB_PATH", str(tmp_path / "audio.db"))
    monkeypatch.setattr(ac, "DIR_ORIG", str(tmp_path / "orig"))
    monkeypatch.setattr(ac, "_notificar", lambda *a, **k: None)
    monkeypatch.setattr(ac, "_escrever_relatorio_txt", lambda *a, **k: None)
    monkeypatch.setattr(ac, "_cruzar", lambda segs: [])
    monkeypatch.setattr(ac, "STT_PROVEDOR", "groq")
    ac.init_db()
    app = FastAPI()
    montar_rate_limit(app)
    app.include_router(router, prefix="/api")
    return TestClient(app)


def _tok(modulos=("transcricao",), user="ana"):
    return create_access_token(user, "analista", list(modulos))


def _h(**k):
    return {"Authorization": "Bearer " + _tok(**k)}


def _wav_bytes(seg=2.0, sr=8000, seed=1):
    buf = io.BytesIO()
    sf.write(buf, (np.random.RandomState(seed).randn(int(seg * sr)) * 0.2).astype("float32"), sr,
             format="WAV", subtype="PCM_16")
    return buf.getvalue()


def _upload(cli, arquivos, **form):
    files = [("arquivos", (n, b, "audio/wav")) for n, b in arquivos]
    return cli.post("/api/audio/upload", files=files, data=form, headers=_h())


def _processar(monkeypatch, textos):
    monkeypatch.setattr(ac, "_transcrever", lambda p, c: [
        {"start": 1.0 + 2 * i, "end": 2.5 + 2 * i, "text": t, "avg_logprob": -0.2, "no_speech_prob": 0.0}
        for i, t in enumerate(textos)])
    monkeypatch.setattr(ac, "_llm_analise", lambda t: (_ for _ in ()).throw(RuntimeError("sem LLM")))
    while (aid := ac._reivindicar()):
        ac.processar(aid)


def test_exige_login_e_modulo(cli):
    assert cli.get("/api/audio").status_code == 401
    assert cli.get("/api/audio", headers=_h(modulos=("alertas",))).status_code == 403
    assert cli.get("/api/audio", headers=_h()).status_code == 200


def test_upload_lote_com_duplicado_e_formato_invalido(cli):
    a = _wav_bytes(seed=1)
    r = _upload(cli, [("a.wav", a), ("b.wav", _wav_bytes(seed=2)), ("copia_de_a.wav", a), ("nota.txt", b"oi")],
                unidade="CDPM1", custodiado="Fulano", classificacao="teste")
    j = r.json()
    assert r.status_code == 200
    assert j["enfileirados"] == 2 and j["duplicados"] == 1 and len(j["erros"]) == 1
    lst = cli.get("/api/audio", headers=_h()).json()
    assert lst["total"] == 2 and {i["status"] for i in lst["itens"]} == {"pendente"}
    assert lst["itens"][0]["unidade"] == "CDPM1"


def test_fluxo_completo_detalhe_player_busca_correcao_laudo(cli, monkeypatch):
    j = _upload(cli, [("sala1.wav", _wav_bytes())], unidade="U1", classificacao="teste").json()
    aid = j["itens"][0]["id"]
    _processar(monkeypatch, ["a fuga será amanhã", "avisa o pavilhão três"])

    d = cli.get(f"/api/audio/{aid}", headers=_h()).json()
    assert d["audio"]["status"] == "concluido" and d["audio"]["risco"] == "ALTO"
    assert "arquivo" not in d["audio"]                                  # caminho interno não vaza
    assert len(d["segmentos"]) == 2 and d["segmentos"][0]["inicio"] == 1.0

    # player: aceita ?token= (tag <audio>) e Range; sem token → 401; sem módulo → 403
    url = f"/api/audio/{aid}/arquivo"
    full = cli.get(url, params={"token": _tok()})
    assert full.status_code == 200 and full.headers["content-type"] == "audio/wav" and len(full.content) > 1000
    parcial = cli.get(url, params={"token": _tok()}, headers={"Range": "bytes=0-99"})
    assert parcial.status_code == 206 and len(parcial.content) == 100
    assert cli.get(url).status_code == 401
    assert cli.get(url, params={"token": _tok(modulos=("alertas",))}).status_code == 403

    # busca (sem acento)
    b = cli.get("/api/audio/busca", params={"q": "pavilhao"}, headers=_h()).json()["resultados"]
    assert b and b[0]["audio_id"] == aid and b[0]["inicio"] == 3.0
    assert cli.get("/api/audio/busca", params={"q": "a"}, headers=_h()).status_code == 400

    # correção humana
    seg = d["segmentos"][1]
    r = cli.patch(f"/api/audio/{aid}/segmentos/{seg['id']}", json={"texto": "avisa o pavilhão quatro"}, headers=_h())
    assert r.status_code == 200
    assert cli.patch(f"/api/audio/{aid}/segmentos/{seg['id']}", json={"texto": " "}, headers=_h()).status_code == 400
    assert cli.patch(f"/api/audio/{aid}/segmentos/99999", json={"texto": "x"}, headers=_h()).status_code == 404
    assert not cli.get("/api/audio/busca", params={"q": "tres"}, headers=_h()).json()["resultados"]

    # custódia: ingestão, processamento, acesso ao áudio, correção — e cadeia íntegra
    c = cli.get(f"/api/audio/{aid}/custodia", headers=_h()).json()
    acoes = [e["acao"] for e in c["eventos"]]
    for esperado in ("ingestao", "processamento_iniciado", "processamento_concluido", "audio_acessado", "segmento_corrigido"):
        assert esperado in acoes
    assert acoes.count("audio_acessado") == 1                           # Range não gera 1 log por pedido
    assert c["cadeia"]["ok"] and len(c["sha256"]) == 64
    assert cli.post(f"/api/audio/{aid}/verificar-integridade", headers=_h()).json()["ok"] is True

    # laudo
    t = cli.get(f"/api/audio/{aid}/exportar/txt", headers=_h())
    assert t.status_code == 200 and b"pavilh" in t.content
    p = cli.get(f"/api/audio/{aid}/exportar/pdf", headers=_h())
    assert p.status_code == 200 and p.content[:4] == b"%PDF"
    assert cli.get(f"/api/audio/{aid}/exportar/xyz", headers=_h()).status_code == 400
    assert "laudo_exportado" in [e["acao"] for e in cli.get(f"/api/audio/{aid}/custodia", headers=_h()).json()["eventos"]]


def test_sensivel_fica_bloqueado_e_reclassificar_libera(cli, monkeypatch):
    monkeypatch.setattr(ac, "local_disponivel", lambda: False)
    aid = _upload(cli, [("p.wav", _wav_bytes())], classificacao="reservado").json()["itens"][0]["id"]
    _processar(monkeypatch, ["conversa"])
    a = cli.get(f"/api/audio/{aid}", headers=_h()).json()["audio"]
    assert a["status"] == "bloqueado" and "nuvem" in a["erro"]

    assert cli.patch(f"/api/audio/{aid}/classificacao", json={"classificacao": "inexistente"}, headers=_h()).status_code == 400
    assert cli.patch(f"/api/audio/{aid}/classificacao", json={"classificacao": "teste"}, headers=_h()).status_code == 200
    assert cli.post(f"/api/audio/{aid}/reprocessar", headers=_h()).json()["status"] == "pendente"
    _processar(monkeypatch, ["conversa"])
    assert cli.get(f"/api/audio/{aid}", headers=_h()).json()["audio"]["status"] == "concluido"
    assert cli.get("/api/audio/nao-existe", headers=_h()).status_code == 404


def test_painel_e_classificacoes(cli, monkeypatch):
    _upload(cli, [("a.wav", _wav_bytes(seed=5))], classificacao="teste")
    _processar(monkeypatch, ["bom dia"])
    pn = cli.get("/api/audio/painel", headers=_h()).json()
    assert pn["total"] == 1 and pn["por_status"] == {"concluido": 1} and pn["cadeia_custodia"]["ok"]
    cl = cli.get("/api/audio/classificacoes", headers=_h()).json()
    assert "reservado" in cl["validas"] and cl["padrao"] and "stt_local_disponivel" in cl
