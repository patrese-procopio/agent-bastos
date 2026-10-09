"""Acervo de Áudios (Fase 1): ingestão/hash, fila, divisão em silêncio, guardrail de soberania,
busca (FTS5), correção humana, custódia (hash encadeado) e painel. STT/LLM são simulados."""
import os
import sqlite3
import stat
import sys
import types

import numpy as np
import pytest
import soundfile as sf

from modules import audio_acervo as ac


@pytest.fixture
def acervo(tmp_path, monkeypatch):
    monkeypatch.setattr(ac, "DB_PATH", str(tmp_path / "audio.db"))
    monkeypatch.setattr(ac, "DIR_ORIG", str(tmp_path / "orig"))
    monkeypatch.setattr(ac, "_notificar", lambda *a, **k: None)
    monkeypatch.setattr(ac, "_escrever_relatorio_txt", lambda *a, **k: None)
    monkeypatch.setattr(ac, "_cruzar", lambda segs: [])
    monkeypatch.setattr(ac, "STT_PROVEDOR", "groq")
    ac.init_db()
    return tmp_path


def _wav(caminho, seg=3.0, sr=8000, silencio=None):
    """Áudio sintético: ruído com um trecho de silêncio opcional (ini, fim) em segundos."""
    n = int(seg * sr)
    x = (np.random.RandomState(1).randn(n) * 0.2).astype("float32")
    if silencio:
        x[int(silencio[0] * sr):int(silencio[1] * sr)] = 0
    sf.write(str(caminho), x, sr, subtype="PCM_16")
    return str(caminho)


def _ingerir(acervo, nome="a.wav", classif="teste", seg=3.0, **meta):
    p = _wav(acervo / nome, seg=seg)
    return ac.ingerir_arquivo(p, nome, {"classificacao": classif, **meta}, "ana")


def _fake_stt(monkeypatch, textos):
    """Cada pedaço devolve os textos dados, com início local 1.0 + 2*i."""
    chamadas = []

    def fake(provedor, caminho):
        chamadas.append((provedor, caminho))
        return [{"start": 1.0 + 2 * i, "end": 2.5 + 2 * i, "text": t, "avg_logprob": -0.2, "no_speech_prob": 0.01}
                for i, t in enumerate(textos)]
    monkeypatch.setattr(ac, "_transcrever", fake)
    return chamadas


def _sem_llm(monkeypatch):
    def nao(_):
        raise RuntimeError("sem LLM no teste")
    monkeypatch.setattr(ac, "_llm_analise", nao)


# ── Ingestão / custódia ──────────────────────────────────────────────────────

def test_ingestao_grava_hash_original_somente_leitura_e_custodia(acervo):
    r = _ingerir(acervo)
    assert not r["duplicado"] and len(r["sha256"]) == 64
    a = ac.obter(r["id"])
    assert a["status"] == "pendente" and a["sha256"] == r["sha256"]
    orig = ac.caminho_original(r["id"])
    assert os.path.exists(orig)
    assert not os.stat(orig).st_mode & stat.S_IWRITE      # original é somente leitura
    ev = ac.custodia_do_audio(r["id"])
    assert ev[0]["acao"] == "ingestao" and r["sha256"] in ev[0]["detalhe"]


def test_duplicado_nao_recria_e_registra(acervo):
    a = _ingerir(acervo)
    b = ac.ingerir_arquivo(str(acervo / "a.wav"), "copia.wav", {"classificacao": "teste"}, "bia")
    assert b["duplicado"] and b["id"] == a["id"]
    assert ac.listar()["total"] == 1
    assert [e["acao"] for e in ac.custodia_do_audio(a["id"])] == ["ingestao", "reenvio_duplicado"]


def test_formato_invalido_e_vazio_recusados(acervo):
    (acervo / "x.txt").write_text("oi")
    with pytest.raises(ValueError):
        ac.ingerir_arquivo(str(acervo / "x.txt"), "x.txt", {}, "ana")
    (acervo / "v.wav").write_bytes(b"")
    with pytest.raises(ValueError):
        ac.ingerir_arquivo(str(acervo / "v.wav"), "v.wav", {}, "ana")


def test_classificacao_invalida_vira_reservado(acervo):
    r = _ingerir(acervo, classif="qualquer-coisa")
    assert ac.obter(r["id"])["classificacao"] == "reservado"


def test_cadeia_detecta_adulteracao(acervo):
    r = _ingerir(acervo)
    ac.registrar_evento(r["id"], "ana", "audio_acessado", "")
    assert ac.verificar_cadeia()["ok"]
    con = sqlite3.connect(ac.DB_PATH)
    con.execute("UPDATE custodia SET detalhe='adulterado' WHERE acao='audio_acessado'")
    con.commit()
    con.close()
    assert not ac.verificar_cadeia()["ok"]


def test_integridade_detecta_arquivo_alterado(acervo):
    r = _ingerir(acervo)
    assert ac.verificar_integridade(r["id"], "ana")["ok"]
    orig = ac.caminho_original(r["id"])
    os.chmod(orig, stat.S_IWRITE | stat.S_IREAD)
    with open(orig, "ab") as f:
        f.write(b"x")
    assert not ac.verificar_integridade(r["id"], "ana")["ok"]


# ── Divisão de áudio longo ───────────────────────────────────────────────────

def test_dividir_corta_na_pausa_e_reencoda_16k_mono(acervo, monkeypatch):
    monkeypatch.setattr(ac, "LIMITE_ORIGINAL", 1000)       # força o caminho de divisão
    p = _wav(acervo / "longo.wav", seg=100, silencio=(48, 50))
    tmp = acervo / "tmp"
    tmp.mkdir()
    partes = list(ac.dividir(p, str(tmp), alvo_s=60, janela_s=20))
    assert len(partes) == 2
    assert partes[0][1] == 0.0
    assert 48.0 <= partes[0][2] <= 50.1                      # cortou dentro da pausa
    assert abs(partes[1][1] - partes[0][2]) < 1e-6           # offsets contíguos
    assert abs(sum(d for _, _, d in partes) - 100) < 0.5     # nada se perde
    info = sf.info(partes[0][0])
    assert info.samplerate == 16000 and info.channels == 1 and info.format == "FLAC"


def test_dividir_audio_curto_segue_original(acervo):
    p = _wav(acervo / "curto.wav", seg=3)
    tmp = acervo / "tmp"
    tmp.mkdir()
    partes = list(ac.dividir(p, str(tmp)))
    assert partes == [(p, 0.0, pytest.approx(3.0, abs=0.01))]


def test_formato_nao_decodificavel_grande_levanta(acervo, monkeypatch):
    monkeypatch.setattr(ac, "LIMITE_API", 10)
    (acervo / "x.m4a").write_bytes(b"nao-e-audio-de-verdade")
    tmp = acervo / "tmp"
    tmp.mkdir()
    with pytest.raises(ac.FormatoNaoSuportado):
        list(ac.dividir(str(acervo / "x.m4a"), str(tmp)))


# ── Pipeline: transcrição, análise, busca, correção ──────────────────────────

def test_processa_timestamps_absolutos_e_analise(acervo, monkeypatch):
    monkeypatch.setattr(ac, "LIMITE_ORIGINAL", 1000)
    p = _wav(acervo / "longo.wav", seg=100, silencio=(48, 50))
    r = ac.ingerir_arquivo(p, "longo.wav", {"classificacao": "teste"}, "ana")
    orig = ac.dividir    # usa pedaços de 60 s no teste (o padrão de produção é 480 s)
    monkeypatch.setattr(ac, "dividir", lambda c, t: orig(c, t, alvo_s=60, janela_s=20))
    _fake_stt(monkeypatch, ["o plano de fuga é amanhã"])
    _sem_llm(monkeypatch)

    aid = ac._reivindicar()
    assert aid == r["id"]
    ac.processar(aid)

    a = ac.obter(aid)
    assert a["status"] == "concluido" and a["progresso"] == 100
    segs = ac.segmentos(aid)
    assert len(segs) == 2 and segs[0]["inicio"] == pytest.approx(1.0)
    assert segs[1]["inicio"] > 48                           # 2º pedaço: offset + 1.0 (tempo absoluto)
    assert a["risco"] == "ALTO"                             # piso por palavra crítica ("fuga")
    assert a["flags"] and a["flags"][0]["origem"] == "regra" and a["flags"][0]["inicio"] is not None
    assert a["analise_ok"] == 0                             # LLM falhou, transcrição preservada
    assert ac.verificar_cadeia()["ok"]


def test_palavra_critica_nao_dispara_em_palavra_parecida(acervo, monkeypatch):
    r = _ingerir(acervo)
    _fake_stt(monkeypatch, ["guardei no armário da cozinha", "comprei armazém"])
    _sem_llm(monkeypatch)
    ac.processar(ac._reivindicar())
    a = ac.obter(r["id"])
    assert a["risco"] == "BAIXO" and a["flags"] == []


def test_flag_da_ia_so_vale_com_trecho_literal(acervo, monkeypatch):
    r = _ingerir(acervo)
    _fake_stt(monkeypatch, ["amanhã a entrega chega no portão", "avisa o fulano"])
    monkeypatch.setattr(ac, "_llm_analise", lambda t: {
        "risk_level": "MEDIO", "classification": "logística", "summary": "Combinação de entrega.",
        "red_flags": [{"title": "Entrega", "text": "t", "trecho": "a entrega chega no portão"},
                      {"title": "Inventada", "text": "t", "trecho": "frase que ninguém falou"}]})
    ac.processar(ac._reivindicar())
    a = ac.obter(r["id"])
    ia = {f["title"]: f for f in a["flags"]}
    assert ia["Entrega"]["verificado"] and ia["Entrega"]["inicio"] == pytest.approx(1.0)
    assert not ia["Inventada"]["verificado"] and ia["Inventada"]["inicio"] is None
    assert a["analise_ok"] == 1 and a["risco"] == "MÉDIO" and a["classificacao_conteudo"] == "logística"


def test_guardrail_sensivel_bloqueia_sem_transcricao_local(acervo, monkeypatch):
    r = _ingerir(acervo, classif="reservado")
    chamadas = _fake_stt(monkeypatch, ["x"])
    monkeypatch.setattr(ac, "local_disponivel", lambda: False)
    ac.processar(ac._reivindicar())
    a = ac.obter(r["id"])
    assert a["status"] == "bloqueado" and "nuvem" in a["erro"]
    assert chamadas == []                                    # NADA foi enviado a provedor algum
    assert "bloqueado_soberania" in [e["acao"] for e in ac.custodia_do_audio(r["id"])]


def test_sensivel_usa_local_e_nao_chama_llm(acervo, monkeypatch):
    r = _ingerir(acervo, classif="sigiloso")
    chamadas = _fake_stt(monkeypatch, ["conversa qualquer"])
    monkeypatch.setattr(ac, "local_disponivel", lambda: True)

    def proibido(_):
        raise AssertionError("LLM de nuvem em dado sensível!")
    monkeypatch.setattr(ac, "_llm_analise", proibido)
    ac.processar(ac._reivindicar())
    a = ac.obter(r["id"])
    assert a["status"] == "concluido" and a["stt_provedor"] == "local"
    assert chamadas and chamadas[0][0] == "local"


def test_reclassificar_libera_bloqueado_e_fica_na_custodia(acervo, monkeypatch):
    r = _ingerir(acervo, classif="reservado")
    monkeypatch.setattr(ac, "local_disponivel", lambda: False)
    _fake_stt(monkeypatch, ["texto de teste"])
    _sem_llm(monkeypatch)
    ac.processar(ac._reivindicar())
    assert ac.obter(r["id"])["status"] == "bloqueado"
    ac.reclassificar(r["id"], "teste", "chefe")
    ac.reprocessar(r["id"], "chefe")
    ac.processar(ac._reivindicar())
    assert ac.obter(r["id"])["status"] == "concluido"
    acoes = [e["acao"] for e in ac.custodia_do_audio(r["id"])]
    assert "reclassificacao" in acoes and "reprocessamento" in acoes


def test_provedor_local_faster_whisper_integrado(acervo, monkeypatch):
    """Simula o pacote faster-whisper para provar a ligação (sem baixar modelo)."""
    class Seg:
        def __init__(self, a, b, t):
            self.start, self.end, self.text, self.avg_logprob, self.no_speech_prob = a, b, t, -0.3, 0.0

    class FakeModel:
        def __init__(self, nome, device, compute_type):
            self.args = (nome, device, compute_type)

        def transcribe(self, caminho, **kw):
            assert kw["language"] == "pt" and kw["vad_filter"] is True
            return iter([Seg(0.5, 2.0, " olá, tudo bem? ")]), None

    fake = types.ModuleType("faster_whisper")
    fake.WhisperModel = FakeModel
    monkeypatch.setitem(sys.modules, "faster_whisper", fake)
    monkeypatch.setattr(ac, "_modelo_local", None)
    r = _ingerir(acervo, classif="reservado")
    _sem_llm(monkeypatch)
    ac.processar(ac._reivindicar())
    a = ac.obter(r["id"])
    assert a["status"] == "concluido" and a["stt_provedor"] == "local"
    assert ac.segmentos(r["id"])[0]["texto"] == "olá, tudo bem?"
    assert ac._modelo_local.args == (ac.STT_MODELO_LOCAL, "cpu", "int8")


def test_erro_do_provedor_marca_erro_e_permite_reprocessar(acervo, monkeypatch):
    r = _ingerir(acervo)

    def falha(p, c):
        raise RuntimeError("429")
    monkeypatch.setattr(ac, "_transcrever", falha)
    ac.processar(ac._reivindicar())
    a = ac.obter(r["id"])
    assert a["status"] == "erro" and "429" in a["erro"]
    _fake_stt(monkeypatch, ["ok agora"])
    _sem_llm(monkeypatch)
    ac.reprocessar(r["id"], "ana")
    ac.processar(ac._reivindicar())
    assert ac.obter(r["id"])["status"] == "concluido"


# ── Busca / correção / painel ────────────────────────────────────────────────

def test_busca_sem_acento_prefixo_e_correcao_reindexa(acervo, monkeypatch):
    r = _ingerir(acervo, unidade="CDPM1")
    _fake_stt(monkeypatch, ["Vai chegar amanhã o pacote", "no pavilhão dois"])
    _sem_llm(monkeypatch)
    ac.processar(ac._reivindicar())

    assert [h["audio_id"] for h in ac.buscar("amanha")] == [r["id"]]      # sem acento
    assert ac.buscar("pavil")                                              # prefixo
    assert ac.buscar("amanha pacote") and not ac.buscar("amanha foguete")  # AND de termos
    assert not ac.buscar("amanha", unidade="OUTRA")
    assert "[[" in ac.buscar("pacote")[0]["trecho"]                        # destaque do trecho

    seg = ac.segmentos(r["id"])[0]
    ac.corrigir_segmento(r["id"], seg["id"], "Vai chegar sábado o carregamento", "ana")
    assert not ac.buscar("amanha") and ac.buscar("carregamento")           # índice atualizado
    s2 = ac.segmentos(r["id"])[0]
    assert s2["texto"] == "Vai chegar amanhã o pacote"                     # original preservado
    assert s2["texto_corrigido"].endswith("carregamento") and s2["revisado_por"] == "ana"
    assert "segmento_corrigido" in [e["acao"] for e in ac.custodia_do_audio(r["id"])]
    assert ac.verificar_cadeia()["ok"]


def test_busca_com_caracteres_especiais_nao_quebra(acervo):
    assert isinstance(ac.buscar('") OR 1=1 --'), list)
    assert ac.buscar("   ") == []


def test_painel_conta_fila_status_e_risco(acervo, monkeypatch):
    _ingerir(acervo, "a.wav", unidade="U1")
    _ingerir(acervo, "b.wav", seg=4.0, unidade="U1")                       # fica pendente
    _fake_stt(monkeypatch, ["fuga amanhã"])
    _sem_llm(monkeypatch)
    ac.processar(ac._reivindicar())
    pn = ac.painel()
    assert pn["total"] == 2 and pn["por_status"] == {"concluido": 1, "pendente": 1}
    assert pn["por_risco"].get("ALTO") == 1
    assert pn["ultimas_24h"] == 2 and pn["cadeia_custodia"]["ok"]
    assert pn["por_unidade"][0]["unidade"] == "U1" and pn["por_unidade"][0]["alto"] == 1


def test_fila_reivindica_em_ordem(acervo):
    a = _ingerir(acervo, "a.wav")
    b = _ingerir(acervo, "b.wav", seg=4.0)
    assert ac._reivindicar() == a["id"]                    # mais antigo primeiro
    assert ac._reivindicar() == b["id"]
    assert ac._reivindicar() is None


def test_dados_laudo_nao_inventa_falantes(acervo, monkeypatch):
    r = _ingerir(acervo)
    _fake_stt(monkeypatch, ["primeira fala", "segunda fala"])
    _sem_llm(monkeypatch)
    ac.processar(ac._reivindicar())
    d = ac.dados_laudo(r["id"])
    assert d["speakers"] == [] and all(s["speaker"] == "" for s in d["segments"])
    assert r["sha256"][:16] in d["filename"] and d["laudo_number"].startswith("AUD-")
    from services.export_service import build_txt
    assert b"primeira fala" in build_txt(d)


def test_trecho_da_busca_vem_do_texto_corrigido_e_destaca_sem_acento(acervo, monkeypatch):
    r = _ingerir(acervo)
    _fake_stt(monkeypatch, ["Você está gravando?"])
    _sem_llm(monkeypatch)
    ac.processar(ac._reivindicar())
    seg = ac.segmentos(r["id"])[0]
    ac.corrigir_segmento(r["id"], seg["id"], "Sim, o pacote chega amanhã no pavilhão dois.", "ana")

    hit = ac.buscar("pavilhao dois")[0]
    assert "gravando" not in hit["trecho"]                               # não é o texto original
    assert "[[pavilhão]]" in hit["trecho"] and "[[dois]]" in hit["trecho"]  # destaque no texto acentuado
    assert "[[amanhã]]" in ac.buscar("amanha")[0]["trecho"]
    assert "[[chega]]" in ac.buscar("che")[0]["trecho"] or "[[chega" in ac.buscar("che")[0]["trecho"]   # prefixo no último termo


def test_destacar_recorta_texto_longo():
    longo = "palavra " * 40 + "alvo central " + "outra " * 40
    t = ac._destacar(longo, "alvo")
    assert "[[alvo]]" in t and t.startswith("…") and t.endswith("…") and len(t) < len(longo)
