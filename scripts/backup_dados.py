#!/usr/bin/env python3
"""
backup_dados.py - Backup criptografado e verificavel do estado do Agent Bastos
==============================================================================

O QUE FAZ
---------
Empacota tudo que NAO esta no Git e nao da para refazer: bancos SQLite, ChromaDB,
doutrinas, relatorios, trilha de auditoria, .env e credenciais. Saida: um unico
arquivo `agentbastos_AAAAMMDD_HHMMSS.bkp`, criptografado com senha.

POR QUE NAO SIMPLESMENTE COPIAR OS ARQUIVOS?
--------------------------------------------
Os bancos rodam em modo WAL: dados recentes ficam no arquivo `-wal` ate o proximo
checkpoint. Copiar so o `.db` com o backend ligado gera backup desatualizado ou
inconsistente. Aqui cada banco e copiado pela API de backup do SQLite
(`Connection.backup`), que devolve um retrato consistente mesmo com o backend escrevendo.
Depois cada copia passa por `PRAGMA integrity_check`.

POR QUE CRIPTOGRAFAR?
---------------------
O arquivo carrega dados pessoais e de inteligencia (LGPD) e as credenciais do .env.
Formato: AES-256-GCM em blocos de 1 MiB (padrao "STREAM": nonce = prefixo + contador,
e o ultimo bloco e marcado no AAD, o que detecta truncamento e reordenacao dos blocos).
Chave derivada da senha com scrypt (salt aleatorio; o custo vai no cabecalho).
A senha NUNCA vai por argumento de linha de comando nem e gravada.

USO (normalmente via scripts\\backup_dados.ps1)
-----------------------------------------------
  python scripts/backup_dados.py                          # gera backup em ./backups
  python scripts/backup_dados.py --destino D:\\bkp --manter 30
  python scripts/backup_dados.py --verificar arq.bkp      # decifra + confere hashes + integrity_check
  python scripts/backup_dados.py --restaurar arq.bkp --para C:\\restaura   # NUNCA sobrescreve dados vivos

LIMITES CONHECIDOS
------------------
* ChromaDB: o `chroma.sqlite3` sai pela API do SQLite, mas os arquivos de indice
  vetorial ao lado sao copiados "a quente". Para uma copia 100% garantida do Chroma,
  rode o backup com o backend parado (subir_tudo.ps1 -Parar). Use --sem-chroma para excluir.
* O authtoken do ngrok mora no perfil do Windows (ngrok.yml) e nao entra aqui.
* Arquivos temporarios em claro existem durante a execucao (apagados no fim): use
  disco com BitLocker.
"""
from __future__ import annotations

import argparse
import getpass
import hashlib
import json
import os
import shutil
import socket
import sqlite3
import struct
import sys
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

BASE_DIR = Path(__file__).resolve().parent.parent

# ── Formato do arquivo .bkp ──────────────────────────────────────────────────
MAGIC = b"ABKP"
VERSAO = 1
TAM_SALT = 16
TAM_PREFIXO_NONCE = 8            # + contador de 4 bytes = nonce de 12 bytes (GCM)
TAM_CABECALHO = len(MAGIC) + 1 + 1 + TAM_SALT + TAM_PREFIXO_NONCE
TAM_BLOCO = 1024 * 1024
SCRYPT_LOG2_N = 15               # ~32 MiB de memoria por derivacao; suficiente para uso local
SENHA_MIN = 12
PREFIXO_ARQ = "agentbastos_"
SUFIXO_ARQ = ".bkp"

# ── O que entra no backup ────────────────────────────────────────────────────
EXT_SQLITE = {".db", ".sqlite", ".sqlite3"}
SUFIXOS_IGNORADOS = ("-wal", "-shm", "-journal")
NOMES_IGNORADOS = {"subir_tudo.pid"}             # trava do vigia: sem sentido restaurar
DIRS_IGNORADOS = {"__pycache__", "hf_cache"}     # hf_cache = modelo de embeddings (baixa de novo)
EXTRAS_RAIZ = (                                  # fora de data/, fora do Git, nao reproduziveis
    "dashboard_bastos.db",
    ".env",
    "credentials.json",
    "token.json",
    "serviceAccountKey.json",
    "alvos.json",
    "indice_documentos.json",
    "producao_aipen.json",
    "modules/producao_aipen.json",
)
MANIFESTO = "MANIFESTO.json"


class ErroBackup(Exception):
    """Erro esperado (senha errada, arquivo invalido...) com mensagem pronta para o usuario."""


# ═════════════════════════════════════════════════════════════════════════════
# Criptografia
# ═════════════════════════════════════════════════════════════════════════════
def _derivar_chave(senha: str, salt: bytes, log2_n: int) -> bytes:
    return Scrypt(salt=salt, length=32, n=2 ** log2_n, r=8, p=1).derive(senha.encode("utf-8"))


def cifrar_arquivo(origem: Path, destino: Path, senha: str, log2_n: int = SCRYPT_LOG2_N) -> None:
    salt = os.urandom(TAM_SALT)
    prefixo = os.urandom(TAM_PREFIXO_NONCE)
    cabecalho = MAGIC + bytes([VERSAO, log2_n]) + salt + prefixo
    aes = AESGCM(_derivar_chave(senha, salt, log2_n))

    with origem.open("rb") as src, destino.open("wb") as dst:
        dst.write(cabecalho)
        bloco = src.read(TAM_BLOCO)
        indice = 0
        while True:
            proximo = src.read(TAM_BLOCO)
            ultimo = not proximo
            nonce = prefixo + indice.to_bytes(4, "big")
            aad = cabecalho + (b"\x01" if ultimo else b"\x00")
            cifrado = aes.encrypt(nonce, bloco, aad)
            dst.write(struct.pack(">I", len(cifrado)) + cifrado)
            if ultimo:
                break
            bloco = proximo
            indice += 1


def decifrar_arquivo(origem: Path, destino: Path, senha: str) -> None:
    with origem.open("rb") as src:
        cabecalho = src.read(TAM_CABECALHO)
        if len(cabecalho) != TAM_CABECALHO or cabecalho[: len(MAGIC)] != MAGIC:
            raise ErroBackup("Arquivo invalido: nao e um backup do Agent Bastos.")
        if cabecalho[len(MAGIC)] != VERSAO:
            raise ErroBackup(f"Versao de backup nao suportada: {cabecalho[len(MAGIC)]}.")
        log2_n = cabecalho[len(MAGIC) + 1]
        if not 10 <= log2_n <= 20:
            raise ErroBackup("Cabecalho invalido (parametro de custo fora do esperado).")
        salt = cabecalho[len(MAGIC) + 2: len(MAGIC) + 2 + TAM_SALT]
        prefixo = cabecalho[-TAM_PREFIXO_NONCE:]
        aes = AESGCM(_derivar_chave(senha, salt, log2_n))

        with destino.open("wb") as dst:
            indice = 0
            viu_ultimo = False
            while True:
                bruto = src.read(4)
                if not bruto:
                    break
                if viu_ultimo:
                    raise ErroBackup("Arquivo adulterado: ha dados depois do ultimo bloco.")
                if len(bruto) != 4:
                    raise ErroBackup("Backup truncado ou corrompido.")
                (tamanho,) = struct.unpack(">I", bruto)
                if tamanho > TAM_BLOCO + 16:
                    raise ErroBackup("Backup corrompido (bloco maior que o permitido).")
                cifrado = src.read(tamanho)
                if len(cifrado) != tamanho:
                    raise ErroBackup("Backup truncado ou corrompido.")
                nonce = prefixo + indice.to_bytes(4, "big")
                try:
                    plano = aes.decrypt(nonce, cifrado, cabecalho + b"\x00")
                except InvalidTag:
                    try:
                        plano = aes.decrypt(nonce, cifrado, cabecalho + b"\x01")
                        viu_ultimo = True
                    except InvalidTag:
                        raise ErroBackup("Senha incorreta, ou arquivo corrompido/adulterado.") from None
                dst.write(plano)
                indice += 1
            if not viu_ultimo:
                raise ErroBackup("Backup truncado: faltam blocos no final do arquivo.")


# ═════════════════════════════════════════════════════════════════════════════
# Coleta (staging) - copia consistente de tudo para uma pasta temporaria
# ═════════════════════════════════════════════════════════════════════════════
def _sha256(caminho: Path) -> str:
    h = hashlib.sha256()
    with caminho.open("rb") as f:
        for bloco in iter(lambda: f.read(TAM_BLOCO), b""):
            h.update(bloco)
    return h.hexdigest()


def _copiar_sqlite(origem: Path, destino: Path) -> None:
    """Retrato consistente via API de backup do SQLite (seguro com o backend escrevendo em WAL)."""
    destino.parent.mkdir(parents=True, exist_ok=True)
    src = sqlite3.connect(str(origem), timeout=30)
    try:
        dst = sqlite3.connect(str(destino))
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()


def _integrity_check(banco: Path) -> str:
    con = sqlite3.connect(str(banco))
    try:
        return con.execute("PRAGMA integrity_check").fetchone()[0]
    finally:
        con.close()


def _copiar_item(origem: Path, staging: Path, rel: str, itens: list[dict], avisos: list[str]) -> None:
    destino = staging / rel
    tipo = "arquivo"
    if origem.suffix.lower() in EXT_SQLITE:
        try:
            _copiar_sqlite(origem, destino)
            tipo = "sqlite"
        except sqlite3.DatabaseError as exc:
            avisos.append(f"{rel}: nao e SQLite valido ({exc}); copiado como arquivo comum")
            destino.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(origem, destino)
    else:
        destino.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(origem, destino)

    item = {"caminho": rel, "tipo": tipo, "bytes": destino.stat().st_size, "sha256": _sha256(destino)}
    if tipo == "sqlite":
        item["integrity_check"] = _integrity_check(destino)
    itens.append(item)


def _percorrer(raiz: Path, excluir_dirs: set[str]):
    for pasta, dirs, arquivos in os.walk(raiz):
        dirs[:] = sorted(d for d in dirs if d not in excluir_dirs)
        for nome in sorted(arquivos):
            caminho = Path(pasta) / nome
            if nome.endswith(SUFIXOS_IGNORADOS) or nome in NOMES_IGNORADOS or caminho.is_symlink():
                continue
            yield caminho


def montar_staging(data_dir: Path, base_dir: Path, staging: Path, *,
                   incluir_chroma: bool, incluir_audios: bool) -> tuple[list[dict], list[str]]:
    itens: list[dict] = []
    avisos: list[str] = []

    excluir = set(DIRS_IGNORADOS)
    if not incluir_chroma:
        excluir.add("chroma_db")

    for caminho in _percorrer(data_dir, excluir):
        rel = "data/" + caminho.relative_to(data_dir).as_posix()
        _copiar_item(caminho, staging, rel, itens, avisos)

    for nome in EXTRAS_RAIZ:
        caminho = base_dir / nome
        if caminho.is_file():
            _copiar_item(caminho, staging, "raiz/" + nome, itens, avisos)

    audios = base_dir / "audios"
    if incluir_audios and audios.is_dir():
        for caminho in _percorrer(audios, DIRS_IGNORADOS):
            rel = "raiz/audios/" + caminho.relative_to(audios).as_posix()
            _copiar_item(caminho, staging, rel, itens, avisos)

    return itens, avisos


# ═════════════════════════════════════════════════════════════════════════════
# Backup / verificacao / restauracao
# ═════════════════════════════════════════════════════════════════════════════
def _zipar(staging: Path, itens: list[dict], manifesto: dict, zip_path: Path) -> None:
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        z.writestr(MANIFESTO, json.dumps(manifesto, ensure_ascii=False, indent=2))
        for item in itens:
            z.write(staging / item["caminho"], arcname=item["caminho"])


def aplicar_retencao(destino: Path, manter: int) -> list[Path]:
    """Mantem os `manter` backups mais recentes (0 = nao apaga nada)."""
    if manter <= 0:
        return []
    todos = sorted(destino.glob(f"{PREFIXO_ARQ}*{SUFIXO_ARQ}"))
    removidos = todos[:-manter]
    for velho in removidos:
        velho.unlink()
    return removidos


def executar_backup(data_dir: Path, destino: Path, senha: str, *, base_dir: Path = BASE_DIR,
                    incluir_chroma: bool = True, incluir_audios: bool = False,
                    manter: int = 14, log2_n: int = SCRYPT_LOG2_N) -> tuple[Path, dict]:
    if not data_dir.is_dir():
        raise ErroBackup(f"Pasta de dados nao encontrada: {data_dir}")
    destino.mkdir(parents=True, exist_ok=True)
    if data_dir.resolve() in (destino.resolve(), *destino.resolve().parents):
        raise ErroBackup("O destino nao pode ficar dentro da pasta de dados (o backup copiaria a si mesmo).")
    carimbo = datetime.now().strftime("%Y%m%d_%H%M%S")
    final = destino / f"{PREFIXO_ARQ}{carimbo}{SUFIXO_ARQ}"

    # Temporarios ficam ao lado do destino (nao no %TEMP% do sistema) e sao sempre apagados.
    with tempfile.TemporaryDirectory(prefix=".tmp_bkp_", dir=destino) as tmp:
        tmp = Path(tmp)
        staging = tmp / "staging"
        staging.mkdir()
        itens, avisos = montar_staging(data_dir, base_dir, staging,
                                       incluir_chroma=incluir_chroma, incluir_audios=incluir_audios)
        if not itens:
            raise ErroBackup("Nada para salvar: a pasta de dados esta vazia.")

        problemas = [i["caminho"] for i in itens if i.get("integrity_check", "ok") != "ok"]
        manifesto = {
            "formato": VERSAO,
            "criado_em": datetime.now().isoformat(timespec="seconds"),
            "maquina": socket.gethostname(),
            "data_dir_origem": str(data_dir),
            "com_chroma": incluir_chroma,
            "com_audios": incluir_audios,
            "avisos": avisos,
            "itens": itens,
        }
        zip_tmp = tmp / "conteudo.zip"
        _zipar(staging, itens, manifesto, zip_tmp)

        parcial = destino / (final.name + ".parcial")
        try:
            cifrar_arquivo(zip_tmp, parcial, senha, log2_n)
            parcial.replace(final)      # so aparece com o nome final se terminou inteiro
        finally:
            parcial.unlink(missing_ok=True)

    removidos = aplicar_retencao(destino, manter)
    resumo = {"itens": len(itens), "bancos": sum(i["tipo"] == "sqlite" for i in itens),
              "bytes_finais": final.stat().st_size, "avisos": avisos,
              "integridade_com_problema": problemas, "removidos_pela_retencao": [p.name for p in removidos]}
    return final, resumo


def _extrair_seguro(zip_path: Path, pasta: Path) -> None:
    raiz = pasta.resolve()
    with zipfile.ZipFile(zip_path) as z:
        for info in z.infolist():
            alvo = (pasta / info.filename).resolve()
            if raiz != alvo and raiz not in alvo.parents:      # zip-slip
                raise ErroBackup(f"Backup malicioso: caminho fora da pasta ({info.filename}).")
        z.extractall(pasta)


def abrir_backup(arquivo: Path, senha: str, pasta: Path) -> dict:
    """Decifra, extrai em `pasta` e confere hash de cada arquivo + integrity_check dos bancos."""
    if not arquivo.is_file():
        raise ErroBackup(f"Arquivo nao encontrado: {arquivo}")
    pasta.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".tmp_dec_", dir=pasta.parent) as tmp:
        zip_tmp = Path(tmp) / "conteudo.zip"
        decifrar_arquivo(arquivo, zip_tmp, senha)
        try:
            _extrair_seguro(zip_tmp, pasta)
        except zipfile.BadZipFile:
            raise ErroBackup("Conteudo do backup corrompido (zip invalido).") from None

    manifesto_path = pasta / MANIFESTO
    if not manifesto_path.is_file():
        raise ErroBackup("Backup sem manifesto: nao e possivel verificar.")
    manifesto = json.loads(manifesto_path.read_text(encoding="utf-8"))

    falhas: list[str] = []
    for item in manifesto["itens"]:
        caminho = pasta / item["caminho"]
        if not caminho.is_file():
            falhas.append(f"faltando: {item['caminho']}")
        elif _sha256(caminho) != item["sha256"]:
            falhas.append(f"hash diferente: {item['caminho']}")
        elif item["tipo"] == "sqlite" and _integrity_check(caminho) != "ok":
            falhas.append(f"banco com problema de integridade: {item['caminho']}")
    manifesto["falhas"] = falhas
    return manifesto


# ═════════════════════════════════════════════════════════════════════════════
# CLI
# ═════════════════════════════════════════════════════════════════════════════
def _ler_senha(confirmar: bool) -> str:
    senha = os.environ.get("BASTOS_BACKUP_SENHA") or ""
    if not senha:
        senha = getpass.getpass("Senha do backup: ")
        if confirmar and getpass.getpass("Repita a senha: ") != senha:
            raise ErroBackup("As senhas nao conferem.")
    if confirmar and len(senha) < SENHA_MIN:
        raise ErroBackup(f"Senha muito curta: use pelo menos {SENHA_MIN} caracteres (frase longa serve).")
    return senha


def _resolver_data_dir(override: str | None) -> Path:
    if override:
        return Path(override)
    try:
        from dotenv import load_dotenv
        load_dotenv(BASE_DIR / ".env")
    except ImportError:
        pass
    sys.path.insert(0, str(BASE_DIR))
    from config.paths import DATA_DIR       # fonte unica de verdade (dev = ./data, prod = %APPDATA%)
    return DATA_DIR


def _mb(n: int) -> str:
    return f"{n / 1024 / 1024:.1f} MB"


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="Backup criptografado do Agent Bastos")
    ap.add_argument("--destino", default=str(BASE_DIR / "backups"), help="pasta de saida (padrao: ./backups)")
    ap.add_argument("--manter", type=int, default=14, help="quantos backups manter (0 = todos)")
    ap.add_argument("--sem-chroma", action="store_true", help="nao inclui o ChromaDB")
    ap.add_argument("--com-audios", action="store_true", help="inclui a pasta audios/ (pode ser grande)")
    ap.add_argument("--data-dir", help="sobrescreve a pasta de dados (padrao: config.paths.DATA_DIR)")
    modo = ap.add_mutually_exclusive_group()
    modo.add_argument("--verificar", metavar="ARQUIVO", help="confere um backup (nao restaura nada)")
    modo.add_argument("--restaurar", metavar="ARQUIVO", help="extrai um backup em --para (nunca sobrescreve dados vivos)")
    ap.add_argument("--para", metavar="PASTA", help="pasta vazia/inexistente para --restaurar")
    args = ap.parse_args(argv)

    try:
        if args.verificar:
            senha = _ler_senha(confirmar=False)
            with tempfile.TemporaryDirectory(prefix="bkp_verif_") as tmp:
                m = abrir_backup(Path(args.verificar), senha, Path(tmp) / "x")
            return _relatar_verificacao(m)

        if args.restaurar:
            if not args.para:
                raise ErroBackup("Informe a pasta de destino com --para.")
            pasta = Path(args.para)
            if pasta.exists() and any(pasta.iterdir()):
                raise ErroBackup(f"A pasta {pasta} nao esta vazia. Restauracao nunca sobrescreve nada.")
            senha = _ler_senha(confirmar=False)
            m = abrir_backup(Path(args.restaurar), senha, pasta)
            codigo = _relatar_verificacao(m)
            print(f"\nRestaurado em: {pasta}")
            print("Confira o conteudo e copie manualmente para o servidor (backend PARADO).")
            return codigo

        senha = _ler_senha(confirmar=True)
        data_dir = _resolver_data_dir(args.data_dir)
        print(f"Origem  : {data_dir}")
        print(f"Destino : {args.destino}")
        arquivo, r = executar_backup(data_dir, Path(args.destino), senha,
                                     incluir_chroma=not args.sem_chroma,
                                     incluir_audios=args.com_audios, manter=args.manter)
        print(f"\n[OK] Backup criado: {arquivo}")
        print(f"     {r['itens']} arquivos ({r['bancos']} bancos SQLite), {_mb(r['bytes_finais'])} criptografados")
        for aviso in r["avisos"]:
            print(f"     [AVISO] {aviso}")
        if r["integridade_com_problema"]:
            print(f"     [ERRO] banco(s) com problema de integridade: {', '.join(r['integridade_com_problema'])}")
            return 2
        if r["removidos_pela_retencao"]:
            print(f"     Retencao: removidos {len(r['removidos_pela_retencao'])} backup(s) antigo(s)")
        print("\nProximo passo: teste com --verificar, e guarde uma copia FORA deste computador.")
        return 0
    except ErroBackup as exc:
        print(f"[ERRO] {exc}", file=sys.stderr)
        return 1


def _relatar_verificacao(m: dict) -> int:
    print(f"Backup de {m['criado_em']} (maquina {m['maquina']})")
    print(f"  {len(m['itens'])} arquivos, {sum(i['tipo'] == 'sqlite' for i in m['itens'])} bancos SQLite")
    if m["falhas"]:
        for falha in m["falhas"]:
            print(f"  [ERRO] {falha}")
        return 2
    print("[OK] Todos os hashes conferem e os bancos passaram no integrity_check.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
