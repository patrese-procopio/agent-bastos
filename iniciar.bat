@echo off
chcp 65001 >nul
title Agent Bastos - Iniciando Sistema...
color 0A

echo.
echo  AGENT BASTOS - STARTUP
echo  Sistema de Inteligencia Soberana
echo.
echo  [1/3] Ativando ambiente Python...

cd /d C:\Users\Administrador\Agent_Bastos
call .venv\Scripts\activate.bat

echo  [2/3] Iniciando backend FastAPI...
start "Agent Bastos - Backend" cmd /k "cd /d C:\Users\Administrador\Agent_Bastos && call .venv\Scripts\activate.bat && python api.py"

echo  Aguardando backend inicializar...
timeout /t 8 /nobreak >nul

echo  [3/3] Iniciando interface...
start "Agent Bastos - Frontend" cmd /k "cd /d C:\Users\Administrador\agent-bastos-app && npm run dev"

echo  Aguardando frontend inicializar...
timeout /t 6 /nobreak >nul

echo.
echo  SISTEMA OPERACIONAL - Abrindo navegador...
echo.

start "" "http://localhost:5174"

exit
