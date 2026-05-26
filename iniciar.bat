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

REM Backend agora ouve em 127.0.0.1 (loopback). Usamos esse endereco em
REM todos os curl pra evitar mismatch IPv4/IPv6 com 'localhost'.
set BACK=http://127.0.0.1:8000
set FRONT=http://127.0.0.1:5174

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
curl -s -o nul %BACK%/openapi.json
if "%errorlevel%"=="0" goto backready
set /a _tries+=1
if %_tries% geq 60 (
  echo       [aviso] backend demorou demais; seguindo mesmo assim. Veja a janela "Backend".
  goto backready
)
echo       ... ainda subindo ^(tentativa %_tries%/60^)
goto waitback
:backready
echo       backend PRONTO em %BACK%

echo  [2/4] Iniciando n8n (automacao)...
start "Agent Bastos - n8n" cmd /k "n8n start"
timeout /t 4 /nobreak >nul

echo  [3/4] Iniciando interface (Vite)...
start "Agent Bastos - Frontend" cmd /k "cd /d C:\Users\Administrador\agent-bastos-app && npm run dev"
echo       aguardando porta 5174 abrir...
set /a _ftries=0
:waitfront
timeout /t 2 /nobreak >nul
curl -s -o nul %FRONT%/
if "%errorlevel%"=="0" goto frontporta
set /a _ftries+=1
if %_ftries% geq 60 (
  echo       [aviso] frontend nao abriu a porta; veja a janela "Frontend".
  goto frontporta
)
echo       ... porta ainda nao abriu ^(tentativa %_ftries%/60^)
goto waitfront
:frontporta
echo       porta 5174 respondendo; aguardando bundle ficar PRONTO...

REM Vite responde 200 na porta antes de terminar o bundle inicial (tela em
REM branco). Para detectar bundle pronto, esperamos /src/main.jsx servir
REM (modulo raiz so e servido depois do transform inicial).
set /a _btries=0
:waitbundle
timeout /t 2 /nobreak >nul
curl -s -o nul -w "%%{http_code}" %FRONT%/src/main.jsx > "%TEMP%\bastos_front_chk.txt"
set /p _code=<"%TEMP%\bastos_front_chk.txt"
del "%TEMP%\bastos_front_chk.txt" >nul 2>&1
if "%_code%"=="200" goto frontready
set /a _btries+=1
if %_btries% geq 45 (
  echo       [aviso] bundle demorou demais; abrindo navegador mesmo assim.
  goto frontready
)
echo       ... compilando ^(tentativa %_btries%/45, http=%_code%^)
goto waitbundle
:frontready
echo       frontend PRONTO em %FRONT%

echo  [4/4] Abrindo navegador...
REM Pequena folga extra antes de abrir, garante HMR pronto
timeout /t 1 /nobreak >nul
start "" "%FRONT%"

echo.
echo  ============================================
echo    SISTEMA NO AR  -  %FRONT%
echo    Login: admin / admin123
echo.
echo    Backend amarrado a 127.0.0.1 (sem LAN).
echo    Para mudar senha: python scripts\setar_senha.py admin
echo.
echo    NAO feche as janelas "Backend" e "Frontend".
echo    Se o navegador abrir em branco, aguarde 5s e F5.
echo  ============================================
echo.
pause
