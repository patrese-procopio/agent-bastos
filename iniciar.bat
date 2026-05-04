@echo off
title Agent Bastos — Iniciando...

echo.
echo  ╔══════════════════════════════════════╗
echo  ║        AGENT BASTOS — STARTUP        ║
echo  ╚══════════════════════════════════════╝
echo.

:: Backend
echo  [1/2] Subindo backend (api.py)...
start "Agent Bastos — Backend" cmd /k "cd /d C:\Users\Administrador\Agent_Bastos && C:\Users\Administrador\Agent_Bastos\.venv\Scripts\activate.bat && python api.py"

:: Aguarda o backend inicializar
timeout /t 8 /nobreak > nul

:: Frontend
echo  [2/2] Subindo frontend (Vite)...
start "Agent Bastos — Frontend" cmd /k "cd /d C:\Users\Administrador\agent-bastos-app && npm run dev"

:: Aguarda o Vite inicializar
timeout /t 6 /nobreak > nul

:: Abre o navegador
echo  [3/3] Abrindo navegador...
start "" "http://localhost:5174"

echo.
echo  Sistema iniciado. Pode fechar essa janela.
timeout /t 3 /nobreak > nul
