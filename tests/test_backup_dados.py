"""Testes do scripts/backup_dados.py: criptografia, consistencia de bancos WAL e restauracao."""
import importlib.util
import sqlite3
from pathlib import Path

import pytest

_SPEC = importlib.util.spec_from_file_location(
    "backup_dados", Path(__file__).resolve().parent.parent / "scripts" / "backup_dados.py")
bk = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(bk)

SENHA = "uma frase longa e segura 123"
LOG2_N = 10   # scrypt barato so nos testes (o valor vai no cabecalho do arquivo)


@pytest.fixture
def ambiente(tmp_path):
    """Simula o servidor: data/ com bancos WAL, chroma, logs, hf_cache + extras na raiz."""
    base = tmp_path / "base"
    data = base / "data"
    (data / "grafo").mkdir(parents=True)
    (data / "chroma_db" / "seg").mkdir(parents=True)
    (data / "logs").mkdir()
    (data / "hf_cache").mkdir()

    # Banco em WAL com conexao ABERTA (backend "rodando") e dado ainda so no -wal
    banco = data / "grafo" / "grafo_vinculos.db"
    con = sqlite3.connect(banco)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA wal_autocheckpoint=0")     # nunca faz checkpoint: dado fica so no -wal
    con.execute("CREATE TABLE nos (id INTEGER PRIMARY KEY, nome TEXT)")
    con.executemany("INSERT INTO nos (nome) VALUES (?)", [(f"alvo{i}",) for i in range(200)])
    con.commit()

    (data / "chroma_db" / "chroma.sqlite3").write_bytes(b"")     # vazio: nao e um SQLite valido de fato
    (data / "chroma_db" / "seg" / "data_level0.bin").write_bytes(b"\x00" * 2048)
    (data / "logs" / "audit.log").write_text("linha de auditoria\n", encoding="utf-8")
    (data / "hf_cache" / "modelo.bin").write_bytes(b"grande e reproduzivel")
    (data / "subir_tudo.pid").write_text("123|456")
    (base / ".env").write_text("SEGREDO=abc\n", encoding="utf-8")

    yield {"base": base, "data": data, "destino": tmp_path / "bkps", "con": con}
    con.close()


def _backup(amb, **kw):
    return bk.executar_backup(amb["data"], amb["destino"], SENHA, base_dir=amb["base"],
                              log2_n=LOG2_N, **kw)


# ── Criptografia ─────────────────────────────────────────────────────────────
def test_cifra_e_decifra_ida_e_volta_com_varios_blocos(tmp_path):
    original = tmp_path / "a.bin"
    original.write_bytes(bytes(range(256)) * 13000)          # ~3,3 MiB = 4 blocos
    cif, dec = tmp_path / "a.enc", tmp_path / "a.dec"
    bk.cifrar_arquivo(original, cif, SENHA, LOG2_N)
    bk.decifrar_arquivo(cif, dec, SENHA)
    assert dec.read_bytes() == original.read_bytes()
    assert original.read_bytes()[:64] not in cif.read_bytes()   # nada em claro


def test_arquivo_vazio_tambem_funciona(tmp_path):
    (tmp_path / "v").write_bytes(b"")
    bk.cifrar_arquivo(tmp_path / "v", tmp_path / "v.enc", SENHA, LOG2_N)
    bk.decifrar_arquivo(tmp_path / "v.enc", tmp_path / "v.dec", SENHA)
    assert (tmp_path / "v.dec").read_bytes() == b""


def test_senha_errada_e_recusada(tmp_path):
    (tmp_path / "a").write_bytes(b"segredo")
    bk.cifrar_arquivo(tmp_path / "a", tmp_path / "a.enc", SENHA, LOG2_N)
    with pytest.raises(bk.ErroBackup, match="Senha incorreta"):
        bk.decifrar_arquivo(tmp_path / "a.enc", tmp_path / "a.dec", "outra senha qualquer")


def test_byte_adulterado_e_detectado(tmp_path):
    (tmp_path / "a").write_bytes(b"x" * 5000)
    bk.cifrar_arquivo(tmp_path / "a", tmp_path / "a.enc", SENHA, LOG2_N)
    dados = bytearray((tmp_path / "a.enc").read_bytes())
    dados[-20] ^= 0x01
    (tmp_path / "a.enc").write_bytes(bytes(dados))
    with pytest.raises(bk.ErroBackup):
        bk.decifrar_arquivo(tmp_path / "a.enc", tmp_path / "a.dec", SENHA)


def test_truncamento_por_blocos_e_detectado(tmp_path):
    """Cortar o arquivo exatamente na fronteira de um bloco NAO pode passar despercebido."""
    (tmp_path / "a").write_bytes(b"y" * (bk.TAM_BLOCO * 2 + 10))      # 3 blocos
    bk.cifrar_arquivo(tmp_path / "a", tmp_path / "a.enc", SENHA, LOG2_N)
    dados = (tmp_path / "a.enc").read_bytes()
    corte = bk.TAM_CABECALHO + 4 + bk.TAM_BLOCO + 16                  # depois do 1o bloco
    (tmp_path / "cortado.enc").write_bytes(dados[:corte])
    with pytest.raises(bk.ErroBackup, match="truncado"):
        bk.decifrar_arquivo(tmp_path / "cortado.enc", tmp_path / "x", SENHA)


def test_arquivo_que_nao_e_backup(tmp_path):
    (tmp_path / "lixo").write_bytes(b"isto nao e um backup" * 5)
    with pytest.raises(bk.ErroBackup, match="invalido"):
        bk.decifrar_arquivo(tmp_path / "lixo", tmp_path / "x", SENHA)


# ── Backup completo ──────────────────────────────────────────────────────────
def test_backup_pega_dado_que_esta_so_no_wal(ambiente):
    """O motivo de existir a API de backup do SQLite: copiar so o .db perderia estes dados."""
    banco = ambiente["data"] / "grafo" / "grafo_vinculos.db"
    assert (banco.parent / "grafo_vinculos.db-wal").stat().st_size > 0
    copia_ingenua = ambiente["destino"].parent / "ingenua.db"
    copia_ingenua.parent.mkdir(exist_ok=True)
    copia_ingenua.write_bytes(banco.read_bytes())
    try:
        n_ingenua = sqlite3.connect(copia_ingenua).execute("SELECT count(*) FROM nos").fetchone()[0]
    except sqlite3.DatabaseError:
        n_ingenua = 0
    assert n_ingenua < 200                                            # copia de arquivo perde dados

    arquivo, resumo = _backup(ambiente)
    assert resumo["integridade_com_problema"] == []
    pasta = ambiente["destino"].parent / "restaurado"
    manifesto = bk.abrir_backup(arquivo, SENHA, pasta)
    assert manifesto["falhas"] == []
    restaurado = sqlite3.connect(pasta / "data" / "grafo" / "grafo_vinculos.db")
    assert restaurado.execute("SELECT count(*) FROM nos").fetchone()[0] == 200
    restaurado.close()


def test_conteudo_incluido_e_excluido(ambiente):
    arquivo, _ = _backup(ambiente)
    pasta = ambiente["destino"].parent / "r"
    m = bk.abrir_backup(arquivo, SENHA, pasta)
    caminhos = {i["caminho"] for i in m["itens"]}
    assert "raiz/.env" in caminhos
    assert "data/logs/audit.log" in caminhos
    assert "data/chroma_db/seg/data_level0.bin" in caminhos
    assert not any("hf_cache" in c for c in caminhos)                 # reproduzivel: fora
    assert not any(c.endswith("subir_tudo.pid") for c in caminhos)    # trava do vigia: fora
    assert not any(c.endswith(("-wal", "-shm")) for c in caminhos)
    assert (pasta / "raiz" / ".env").read_text(encoding="utf-8") == "SEGREDO=abc\n"


def test_sem_chroma(ambiente):
    arquivo, _ = _backup(ambiente, incluir_chroma=False)
    m = bk.abrir_backup(arquivo, SENHA, ambiente["destino"].parent / "r")
    assert not any("chroma_db" in i["caminho"] for i in m["itens"])


def test_arquivo_final_nao_contem_texto_em_claro(ambiente):
    arquivo, _ = _backup(ambiente)
    bruto = arquivo.read_bytes()
    assert b"SEGREDO=abc" not in bruto and b"linha de auditoria" not in bruto and b"alvo1" not in bruto


def test_nao_deixa_temporarios_nem_parcial(ambiente):
    _backup(ambiente)
    sobras = [p.name for p in ambiente["destino"].iterdir()]
    assert len(sobras) == 1 and sobras[0].endswith(".bkp")


def test_retencao_mantem_so_os_mais_recentes(ambiente):
    ambiente["destino"].mkdir()
    for ts in ("20200101_000000", "20200102_000000", "20200103_000000"):
        (ambiente["destino"] / f"agentbastos_{ts}.bkp").write_bytes(b"velho")
    _, resumo = _backup(ambiente, manter=2)
    restantes = sorted(p.name for p in ambiente["destino"].glob("*.bkp"))
    assert len(restantes) == 2 and restantes[0] == "agentbastos_20200103_000000.bkp"
    assert len(resumo["removidos_pela_retencao"]) == 2


def test_destino_dentro_de_data_e_recusado(ambiente):
    with pytest.raises(bk.ErroBackup, match="dentro da pasta de dados"):
        bk.executar_backup(ambiente["data"], ambiente["data"] / "backups", SENHA,
                           base_dir=ambiente["base"], log2_n=LOG2_N)


def test_verificacao_acusa_arquivo_alterado_dentro_do_zip(ambiente, tmp_path):
    """Adulteracao SEM quebrar a criptografia (quem tem a senha): o hash do manifesto pega."""
    import json
    import zipfile
    arquivo, _ = _backup(ambiente)
    zip_claro = tmp_path / "claro.zip"
    bk.decifrar_arquivo(arquivo, zip_claro, SENHA)
    adulterado = tmp_path / "adulterado.zip"
    with zipfile.ZipFile(zip_claro) as zin, zipfile.ZipFile(adulterado, "w") as zout:
        for info in zin.infolist():
            dados = zin.read(info.filename)
            if info.filename == "raiz/.env":
                dados = b"SEGREDO=trocado\n"
            zout.writestr(info, dados)
    novo = tmp_path / "novo.bkp"
    bk.cifrar_arquivo(adulterado, novo, SENHA, LOG2_N)
    m = bk.abrir_backup(novo, SENHA, tmp_path / "r")
    assert any("hash diferente: raiz/.env" in f for f in m["falhas"])
    json.dumps(m)                                                     # manifesto serializavel



# ── Fluxo (sem copias intermediarias) ────────────────────────────────────────
@pytest.mark.parametrize("tamanho", [0, 1, bk.TAM_BLOCO - 1, bk.TAM_BLOCO, bk.TAM_BLOCO + 1, 2 * bk.TAM_BLOCO, 3 * bk.TAM_BLOCO + 7])
def test_escritor_em_fluxo_fronteiras_de_bloco(tmp_path, tamanho):
    """O bloco FINAL tem que ser identificado mesmo quando o total e multiplo exato do bloco."""
    dados = (bytes(range(251)) * (tamanho // 251 + 1))[:tamanho]
    with bk.EscritorCifrado(tmp_path / "f.enc", SENHA, LOG2_N) as w:
        for i in range(0, len(dados), 100_000):          # escritas em pedacos irregulares
            w.write(dados[i:i + 100_000])
    bk.decifrar_arquivo(tmp_path / "f.enc", tmp_path / "f.dec", SENHA)
    assert (tmp_path / "f.dec").read_bytes() == dados


def test_escritor_interrompido_nao_gera_arquivo_valido(tmp_path):
    """Se algo falha no meio, o arquivo parcial NAO pode ser aceito como backup completo."""
    with pytest.raises(RuntimeError):
        with bk.EscritorCifrado(tmp_path / "f.enc", SENHA, LOG2_N) as w:
            w.write(b"x" * (bk.TAM_BLOCO * 2))
            raise RuntimeError("queda de energia")
    with pytest.raises(bk.ErroBackup):
        bk.decifrar_arquivo(tmp_path / "f.enc", tmp_path / "f.dec", SENHA)


def test_recusa_quando_nao_ha_espaco(ambiente, monkeypatch):
    import collections
    Uso = collections.namedtuple("Uso", "total used free")
    monkeypatch.setattr(bk.shutil, "disk_usage", lambda _: Uso(100, 99, 1))
    with pytest.raises(bk.ErroBackup, match="Espaco insuficiente"):
        _backup(ambiente)
    assert list(ambiente["destino"].glob("*.bkp")) == []


def test_excluir_pasta_grande(ambiente):
    (ambiente["data"] / "drone").mkdir()
    (ambiente["data"] / "drone" / "mosaico.tif").write_bytes(b"II*\x00" * 1000)
    arquivo, _ = _backup(ambiente, excluir=frozenset({"drone"}))
    m = bk.abrir_backup(arquivo, SENHA)
    assert not any("drone" in i["caminho"] for i in m["itens"])
    assert m["excluidos"] == ["drone"]


def test_avisa_quando_a_pasta_excluida_contem_banco(ambiente):
    """Caso real: data/drone tem o drone.db (insubstituivel) ao lado de midias enormes."""
    (ambiente["data"] / "drone" / "missoes").mkdir(parents=True)
    (ambiente["data"] / "drone" / "missoes" / "video.mp4").write_bytes(b"\x00" * 100)
    con = sqlite3.connect(ambiente["data"] / "drone" / "drone.db")
    con.execute("CREATE TABLE m (id)"); con.commit(); con.close()

    # excluir 'missoes' NAO tira o drone.db -> sem aviso e o banco entra
    arquivo, r = _backup(ambiente, excluir=frozenset({"missoes"}))
    assert r["avisos"] == []
    m = bk.abrir_backup(arquivo, SENHA)
    assert "data/drone/drone.db" in {i["caminho"] for i in m["itens"]}

    # excluir 'drone' (o erro perigoso) -> o aviso aponta o banco que ficaria de fora
    avisos = bk.avisos_de_exclusao(ambiente["data"], frozenset({"drone"}))
    assert len(avisos) == 1 and "drone/drone.db" in avisos[0]
    _, r2 = _backup(ambiente, excluir=frozenset({"drone"}))
    assert any("drone.db" in a for a in r2["avisos"])


def test_progresso_soma_os_bytes_lidos(ambiente):
    lido = []
    _, resumo = _backup(ambiente, progresso=lambda n, rel: lido.append(n))
    assert sum(lido) > 0
    assert resumo["bytes_origem"] > 0


def test_arquivos_ja_compactados_nao_sao_recompactados(ambiente, tmp_path):
    import zipfile
    (ambiente["data"] / "foto.jpg").write_bytes(bytes(range(256)) * 50)
    arquivo, _ = _backup(ambiente)
    zip_claro = tmp_path / "c.zip"
    bk.decifrar_arquivo(arquivo, zip_claro, SENHA)
    with zipfile.ZipFile(zip_claro) as z:
        assert z.getinfo("data/foto.jpg").compress_type == zipfile.ZIP_STORED
        assert z.getinfo("data/logs/audit.log").compress_type == zipfile.ZIP_DEFLATED


def test_backup_nao_altera_os_dados_de_origem(ambiente):
    antes = {p: p.read_bytes() for p in ambiente["data"].rglob("*") if p.is_file() and not p.name.endswith(("-wal", "-shm", ".db"))}
    _backup(ambiente)
    depois = {p: p.read_bytes() for p in antes}
    assert antes == depois


def test_so_verificar_le_direto_do_zip_e_acusa_adulteracao(ambiente, tmp_path):
    import zipfile
    arquivo, _ = _backup(ambiente)
    assert bk.abrir_backup(arquivo, SENHA)["falhas"] == []           # modo verificacao (pasta=None)
    zip_claro = tmp_path / "c.zip"
    bk.decifrar_arquivo(arquivo, zip_claro, SENHA)
    adulterado = tmp_path / "a.zip"
    with zipfile.ZipFile(zip_claro) as zin, zipfile.ZipFile(adulterado, "w") as zout:
        for info in zin.infolist():
            dados = b"outro conteudo" if info.filename == "data/logs/audit.log" else zin.read(info.filename)
            zout.writestr(info, dados)
    novo = tmp_path / "n.bkp"
    bk.cifrar_arquivo(adulterado, novo, SENHA, LOG2_N)
    falhas = bk.abrir_backup(novo, SENHA)["falhas"]
    assert any("hash diferente: data/logs/audit.log" in f for f in falhas)

# ── CLI ──────────────────────────────────────────────────────────────────────
def test_cli_restaurar_recusa_pasta_nao_vazia(ambiente, monkeypatch, capsys):
    arquivo, _ = _backup(ambiente)
    ocupada = ambiente["destino"].parent / "ocupada"
    ocupada.mkdir()
    (ocupada / "algo.txt").write_text("nao apague")
    monkeypatch.setenv("BASTOS_BACKUP_SENHA", SENHA)
    codigo = bk.main(["--restaurar", str(arquivo), "--para", str(ocupada)])
    assert codigo == 1
    assert (ocupada / "algo.txt").read_text() == "nao apague"
    assert "nao esta vazia" in capsys.readouterr().err


def test_cli_senha_curta_e_recusada_no_backup(ambiente, monkeypatch, capsys):
    monkeypatch.setenv("BASTOS_BACKUP_SENHA", "curta")
    codigo = bk.main(["--data-dir", str(ambiente["data"]), "--destino", str(ambiente["destino"])])
    assert codigo == 1 and "muito curta" in capsys.readouterr().err
