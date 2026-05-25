@echo off
chcp 65001 >nul
title Agent Bastos - Iniciando Sistema...
color 0A
echo.
echo  ============================================
echo    AGENT BASTOS - STARTUP
echo    Sistema de Inteligencia Soberana
echo  ============================================
echo.

REM [0/4] Libera portas de instancias anteriores (evita conflito)
echo  [0/4] Liberando portas 8000 / 5174 ...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 " ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5174 " ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

echo  [1/4] Iniciando backend FastAPI...
start "Agent Bastos - Backend" cmd /k "cd /d C:\Users\Administrador\Agent_Bastos && .venv\Scripts\python.exe -X utf8 api.py"
echo       aguardando backend ficar PRONTO (carrega modelo de embeddings)...
set /a _tries=0
:waitback
timeout /t 2 /nobreak >nul
curl -s -o nul http://localhost:8000/openapi.json
if "%errorlevel%"=="0" goto backready
set /a _tries+=1
if %_tries% geq 60 (
  echo       [aviso] backend demorou demais; seguindo mesmo assim. Veja a janela "Backend".
  goto backready
)
echo       ... ainda subindo ^(tentativa %_tries%/60^)
goto waitback
:backready
echo       backend PRONTO em http://localhost:8000

echo  [2/4] Iniciando n8n (automacao)...
start "Agent Bastos - n8n" cmd /k "n8n start"
timeout /t 4 /nobreak >nul

echo  [3/4] Iniciando interface (Vite)...
start "Agent Bastos - Frontend" cmd /k "cd /d C:\Users\Administrador\agent-bastos-app && npm run dev"
echo       aguardando frontend ficar PRONTO...
set /a _ftries=0
:waitfront
timeout /t 2 /nobreak >nul
curl -s -o nul http://127.0.0.1:5174/
if "%errorlevel%"=="0" goto frontready
set /a _ftries+=1
if %_ftries% geq 30 (
  echo       [aviso] frontend demorou demais; seguindo. Veja a janela "Frontend".
  goto frontready
)
echo       ... ainda subindo ^(tentativa %_ftries%/30^)
goto waitfront
:frontready
echo       frontend PRONTO em http://127.0.0.1:5174

echo  [4/4] Abrindo navegador...
start "" "http://127.0.0.1:5174"

echo.
echo  ============================================
echo    SISTEMA NO AR  -  http://127.0.0.1:5174
echo    Login: admin / admin123
echo.
echo    NAO feche as janelas "Backend" e "Frontend".
echo    Se o navegador abrir em branco, aguarde uns
echo    segundos e pressione F5.
echo  ============================================
echo.
pause
