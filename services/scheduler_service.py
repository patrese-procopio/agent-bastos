"""
scheduler_service.py — Varreduras automaticas em threads daemon
---------------------------------------------------------------------------
Elimina a dependencia do n8n pras varreduras de Alertas e Noticias. Antes,
o backend so varria quando o n8n disparava POST /alertas/varrer a cada 8h;
se o n8n caia (Docker offline, container em restart-loop), as telas ficavam
com dados velhos e o operador via "fora do ar".

Substitui o `monitor.iniciar_scheduler` (Watchlist Engine) — este agora
consolida TODAS as varreduras num unico ponto:
  - alertas   -> varrer_realtime + varrer_osint + analisar_pendentes  8h  (BASTOS_ALERTAS_INTERVALO_H)
  - noticias  -> atualizar_noticias (RSS G1 + GNews)                  60m (BASTOS_NOTICIAS_INTERVALO_MIN)
  - telegram  -> varrer_telegram (no-op sem credenciais)              3h  (BASTOS_TELEGRAM_INTERVALO_H)

Compat com env legado:
  - WATCHLIST_ATIVO=false desliga o loop de alertas (mesmo comportamento do watchlist antigo)
  - WATCHLIST_INTERVALO_HORAS ainda respeitado se BASTOS_ALERTAS_INTERVALO_H nao existir

Cada loop e resiliente: erro em uma iteracao vira log.error e ele espera o
proximo ciclo. Nao trava, nao mata o processo, nao acumula estado ruim.

Roda UMA vez no delay_inicial (~1 min apos boot) — assim se o backend acabou
de subir, tenta dados novos ANTES do primeiro ciclo longo. O watchlist antigo
esperava 6h ate rodar a primeira vez, o que agravava a sensacao de "fora do ar".
"""
from __future__ import annotations

import os
import threading
import time
import logging
from typing import Callable

from services.logging_service import get_logger

_log = get_logger("scheduler")

# ── Intervalos configuraveis via env (defaults conservadores) ────────────────
def _env_int(chave: str, default: int) -> int:
    try:
        return int(float(os.getenv(chave, str(default))))
    except (TypeError, ValueError):
        return default

# Alertas: honra BASTOS_ALERTAS_INTERVALO_H; se ausente, honra WATCHLIST_INTERVALO_HORAS
# (compat com env antigo). Default 8h.
_INTERVALO_ALERTAS_S  = _env_int("BASTOS_ALERTAS_INTERVALO_H",
                                  _env_int("WATCHLIST_INTERVALO_HORAS", 8)) * 3600
_INTERVALO_NOTICIAS_S = _env_int("BASTOS_NOTICIAS_INTERVALO_MIN", 60) * 60
_INTERVALO_TELEGRAM_S = _env_int("BASTOS_TELEGRAM_INTERVALO_H",   3)  * 3600

# Compat: WATCHLIST_ATIVO=false desliga so o loop de alertas
_ALERTAS_ATIVO = os.getenv("WATCHLIST_ATIVO", "true").lower() == "true"

# Delay inicial: nao rodar tudo junto no boot pra nao competir com o carregamento
# do RAG (que ja consome CPU/RAM na primeira subida).
_DELAY_ALERTAS_S  = 60      # 1 min apos boot
_DELAY_NOTICIAS_S = 45      # 45s apos boot
_DELAY_TELEGRAM_S = 120     # 2 min apos boot


def _loop(nome: str, alvo: Callable[[], object], intervalo_s: int,
          delay_inicial_s: int) -> None:
    """
    Loop generico: aguarda delay_inicial, roda alvo(), aguarda intervalo, repete.
    Qualquer excecao no alvo() e logada e o loop continua no proximo ciclo.
    """
    _log.info(f"scheduler[{nome}] iniciando "
              f"(delay {delay_inicial_s}s, intervalo {intervalo_s}s)")
    time.sleep(delay_inicial_s)

    while True:
        inicio = time.time()
        try:
            _log.info(f"scheduler[{nome}] rodando varredura")
            resultado = alvo()
            duracao = time.time() - inicio
            _log.info(f"scheduler[{nome}] concluido em {duracao:.1f}s: {resultado}")
        except Exception as exc:
            duracao = time.time() - inicio
            _log.error(f"scheduler[{nome}] FALHOU apos {duracao:.1f}s: {exc}",
                       exc_info=True)
        # Dorme ate o proximo ciclo — se a varredura demorou, o intervalo real
        # entre inicios continua sendo intervalo_s (nao acumula atraso).
        proximo = max(60, intervalo_s - (time.time() - inicio))
        time.sleep(proximo)


def _rodar_alertas():
    """Varre realtime + OSINT + re-analisa pendentes com IA."""
    from modules import monitor
    r1 = monitor.varrer_realtime()
    r2 = monitor.varrer_osint()
    r3 = monitor.analisar_pendentes(limite=20)
    return {"realtime": r1, "osint": r2, "analise": r3}


def _rodar_noticias():
    """Refetch de G1 + GNews. Reusa o endpoint HTTP internamente pra nao duplicar."""
    import asyncio
    from routers import sistema_router
    coro = sistema_router.atualizar_noticias(user={"sub": "scheduler", "level": "admin"})
    if asyncio.iscoroutine(coro):
        return asyncio.run(coro)
    return coro


def _rodar_telegram():
    """Varredura Telegram — no-op se credenciais nao estao configuradas."""
    from modules import telegram_monitor
    return telegram_monitor.varrer_telegram()


def start_scheduler() -> None:
    """
    Sobe as 3 threads daemon. Idempotente: pode chamar N vezes; so cria as
    threads uma vez por processo (usa flag no module).
    """
    global _started
    if getattr(start_scheduler, "_started", False):
        _log.info("scheduler ja iniciado — ignorando chamada duplicada")
        return
    start_scheduler._started = True

    tarefas = []
    if _ALERTAS_ATIVO:
        tarefas.append(("alertas",  _rodar_alertas,  _INTERVALO_ALERTAS_S,  _DELAY_ALERTAS_S))
    else:
        _log.info("scheduler[alertas] desligado por WATCHLIST_ATIVO=false")
    tarefas.append(("noticias", _rodar_noticias, _INTERVALO_NOTICIAS_S, _DELAY_NOTICIAS_S))
    tarefas.append(("telegram", _rodar_telegram, _INTERVALO_TELEGRAM_S, _DELAY_TELEGRAM_S))

    for nome, alvo, intervalo, delay in tarefas:
        t = threading.Thread(
            target=_loop,
            args=(nome, alvo, intervalo, delay),
            daemon=True,
            name=f"scheduler-{nome}",
        )
        t.start()

    _log.info("scheduler_service iniciado — 3 threads daemon rodando "
              f"(alertas {_INTERVALO_ALERTAS_S//3600}h, "
              f"noticias {_INTERVALO_NOTICIAS_S//60}min, "
              f"telegram {_INTERVALO_TELEGRAM_S//3600}h)")
