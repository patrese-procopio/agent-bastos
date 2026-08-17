@echo off
title Agent Bastos - Producao
color 0A

echo.
echo  ============================================
echo    AGENT BASTOS v1.0 - MODO PRODUCAO
echo    Sistema de Inteligencia Soberana
echo    Viga Solucoes e Tecnologia
echo  ============================================
echo.

REM --- Caminhos (auto-detectados a partir da localizacao do .bat) ---
REM %~dp0 = pasta onde o .bat esta localizado, com \ no final
set BACKEND_DIR=%~dp0
set BACK=http://127.0.0.1:8000
set ELECTRON_INSTALLED="C:\Program Files\Agent Bastos\Agent Bastos.exe"
set ELECTRON_UNPACKED="%~dp0..\agent-bastos-app\dist-installer\win-unpacked\Agent Bastos.exe"

REM --- [0/3] Libera porta 8000 ---
echo  [0/3] Liberando porta 8000 de instancias anteriores...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 " ^| findstr LISTENING 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

REM --- [1/3] Inicia backend Python ---
echo  [1/3] Iniciando backend FastAPI (startup.py)...
REM HF_HOME: garante que o modelo de embeddings carrega do cache local (rede fechada)
set HF_HOME=%BACKEND_DIR%data\hf_cache
start "AgentBastos-Backend" /min cmd /c "cd /d %BACKEND_DIR% && set HF_HOME=%BACKEND_DIR%data\hf_cache && .venv\Scripts\python.exe -X utf8 startup.py"

echo       Aguardando backend em %BACK%/health ...
set /a _tries=0
:waitback
timeout /t 2 /nobreak >nul
curl -s -o nul -w "%%{http_code}" %BACK%/health > "%TEMP%\ab_health.txt" 2>nul
set /p _code=<"%TEMP%\ab_health.txt"
del "%TEMP%\ab_health.txt" >nul 2>&1
if "%_code%"=="200" goto backready
set /a _tries+=1
if %_tries% geq 60 (
    echo       [AVISO] Backend demorou mais de 2 minutos. Verifique erros.
    goto backready
)
if %_tries%==5  echo       ... carregando modelos de IA, aguarde...
if %_tries%==15 echo       ... ainda inicializando (tentativa %_tries%/60)...
if %_tries%==30 echo       ... demora normal em primeiro boot (tentativa %_tries%/60)...
goto waitback
:backready
echo       Backend PRONTO (http_code=%_code%)

REM --- [2/3] Inicia n8n ---
echo  [2/3] Iniciando n8n (automacao)...
start "AgentBastos-n8n" /min cmd /c "n8n start"
timeout /t 2 /nobreak >nul

REM --- [3/3] Abre o Electron ---
echo  [3/3] Abrindo Agent Bastos...
if exist %ELECTRON_INSTALLED% (
    echo       Usando instalacao: %ELECTRON_INSTALLED%
    start "" %ELECTRON_INSTALLED%
) else if exist %ELECTRON_UNPACKED% (
    echo       Usando win-unpacked: %ELECTRON_UNPACKED%
    start "" %ELECTRON_UNPACKED%
) else (
    echo       [ERRO] Electron nao encontrado.
    echo       Instale o Setup ou rode: npm run dist
    pause
    exit /b 1
)

echo.
echo  ============================================
echo    SISTEMA NO AR
echo    Backend : %BACK%
echo    Para encerrar: feche o Agent Bastos
echo  ============================================
echo.
pause
