"""
services/bases_osint_service.py — Atualização das bases locais do OSINT em segundo plano
Agent Bastos | Segurança Pública/Corporativa

Bases:
  receita → sócios PF da Receita (scripts/carregar_cnpj_receita.py --receita --se-novo)
            ~20 min e ~0,7 GB de download; só roda se houver mês novo publicado.
  cgu     → PEP/CEIS/CNEP/CEAF (scripts/carregar_sancoes_cgu.py --se-novo)
            ~7 MB; só roda se saiu PEP de mês novo ou se o banco tem > 30 dias.

A carga roda num PROCESSO SEPARADO (não trava a API e sobrevive a um reinício do backend).
O estado fica em data/bases_status.json e o log de cada carga em logs/carga_<base>.log.
Pensado para ser acionado por um agendador (n8n), que pode chamar todo dia: o --se-novo
faz a recarga acontecer só quando há dado novo (e recupera dias em que o PC estava desligado).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from config.paths import BASE_DIR, DATA_DIR

STATUS_FILE = Path(DATA_DIR) / "bases_status.json"
LOG_DIR = Path(BASE_DIR) / "logs"
_lock = threading.Lock()

BASES: dict[str, dict[str, Any]] = {
    "receita": {"rotulo": "Receita Federal — sócios PF", "script": "scripts/carregar_cnpj_receita.py",
                "args": ["--receita"], "timeout_s": 3 * 3600},
    "cgu": {"rotulo": "CGU — PEP, CEIS, CNEP e CEAF", "script": "scripts/carregar_sancoes_cgu.py",
            "args": [], "timeout_s": 30 * 60},
}


def _ler() -> dict[str, Any]:
    try:
        return json.loads(STATUS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _gravar(estado: dict[str, Any]) -> None:
    STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATUS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(estado, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, STATUS_FILE)


def _vivo(pid: int | None) -> bool:
    if not pid:
        return False
    try:
        import psutil
        return psutil.pid_exists(pid) and psutil.Process(pid).status() != psutil.STATUS_ZOMBIE
    except ImportError:
        pass
    if os.name == "nt":
        out = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/NH"], capture_output=True, text=True).stdout
        return str(pid) in out
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _cauda_log(base: str, n: int = 4) -> list[str]:
    try:
        linhas = (LOG_DIR / f"carga_{base}.log").read_text(encoding="utf-8", errors="replace").splitlines()
        return [l for l in linhas if l.strip()][-n:]
    except Exception:
        return []


def _classificar(base: str, codigo: int | None) -> str:
    cauda = " ".join(_cauda_log(base))
    if codigo not in (0, None):
        return "falhou"
    return "ja_atualizado" if "já atualizado" in cauda else "concluido"


def _vigiar(base: str, proc: subprocess.Popen, timeout_s: int) -> None:
    try:
        codigo = proc.wait(timeout=timeout_s)
    except subprocess.TimeoutExpired:
        proc.kill()
        codigo = -9
    with _lock:
        st = _ler()
        reg = st.get(base, {})
        reg.update(estado=_classificar(base, codigo), fim=datetime.now().isoformat(timespec="seconds"),
                   codigo=codigo, resumo=" | ".join(_cauda_log(base, 2)))
        st[base] = reg
        _gravar(st)


def iniciar(base: str, se_novo: bool = True) -> dict[str, Any]:
    """Dispara a carga em segundo plano. Não bloqueia; devolve o estado imediatamente."""
    if base not in BASES:
        raise ValueError(f"base desconhecida: {base}")
    cfg = BASES[base]
    with _lock:
        st = _ler()
        atual = st.get(base, {})
        if atual.get("estado") == "executando" and _vivo(atual.get("pid")):
            return {"base": base, "estado": "ja_executando", "pid": atual.get("pid"), "inicio": atual.get("inicio")}

        LOG_DIR.mkdir(parents=True, exist_ok=True)
        args = [sys.executable, "-X", "utf8", "-u", str(Path(BASE_DIR) / cfg["script"]), *cfg["args"]]
        if se_novo:
            args.append("--se-novo")
        log = open(LOG_DIR / f"carga_{base}.log", "w", encoding="utf-8")
        flags = (subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP) if os.name == "nt" else 0
        proc = subprocess.Popen(args, cwd=str(BASE_DIR), stdout=log, stderr=subprocess.STDOUT,
                                creationflags=flags, close_fds=True)
        st[base] = {"estado": "executando", "pid": proc.pid, "inicio": datetime.now().isoformat(timespec="seconds"),
                    "fim": None, "codigo": None, "resumo": None, "se_novo": se_novo}
        _gravar(st)
    threading.Thread(target=_vigiar, args=(base, proc, cfg["timeout_s"]), daemon=True).start()
    return {"base": base, "estado": "executando", "pid": proc.pid}


def status() -> dict[str, Any]:
    """Estado de cada base + o que está carregado (competência / arquivos)."""
    st = _ler()
    saida: dict[str, Any] = {}
    for base, cfg in BASES.items():
        reg = dict(st.get(base, {"estado": "nunca_executada"}))
        if reg.get("estado") == "executando" and not _vivo(reg.get("pid")):
            # processo morreu sem avisar (backend reiniciou durante a carga): decide pelo log
            reg["estado"] = _classificar(base, 0 if any("OK —" in l or "já atualizado" in l for l in _cauda_log(base))
                                         else 1)
            reg["resumo"] = " | ".join(_cauda_log(base, 2))
        reg["rotulo"] = cfg["rotulo"]
        reg["log"] = _cauda_log(base, 3) if reg.get("estado") == "executando" else None
        try:
            if base == "receita":
                from modules.osint.receita_cnpj import info_base
            else:
                from modules.osint.sancoes_cgu import info_base
            reg["carregado"] = info_base()
        except Exception:
            reg["carregado"] = {}
        saida[base] = reg
    return saida
