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
