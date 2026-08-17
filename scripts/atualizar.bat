@echo off
setlocal EnableDelayedExpansion
title Agent Bastos - Atualizador
color 0A

echo.
echo  ============================================================
echo    AGENT BASTOS - ATUALIZADOR
echo    Aplica atualizacao em instalacao existente
echo    Viga Solucoes e Tecnologia
echo  ============================================================
echo.

REM ==============================================================
REM CONFIGURACOES
REM ==============================================================
set INSTALL_DIR=C:\Agent_Bastos
REM ==============================================================

REM --- Verifica privilegios de Administrador ---
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERRO] Este atualizador requer privilegios de Administrador.
    echo         Botao direito no arquivo -^> "Executar como administrador"
    echo.
    pause
    exit /b 1
)

set UPDATE_DIR=%~dp0

REM --- Verifica se existe instalacao previa ---
if not exist "%INSTALL_DIR%\.venv\Scripts\python.exe" (
    echo  [ERRO] Instalacao do Agent Bastos nao encontrada em %INSTALL_DIR%
    echo         Este pacote e apenas para ATUALIZACAO.
    echo         Para instalar do zero, use o pacote completo (instalar_backend.bat).
    echo.
    pause
    exit /b 1
)

REM --- Le a versao do pacote ---
set NEW_VERSION=desconhecida
if exist "%UPDATE_DIR%versao.txt" (
    for /f "tokens=2 delims==" %%v in ('findstr /b "version=" "%UPDATE_DIR%versao.txt"') do set NEW_VERSION=%%v
)

echo  Instalacao : %INSTALL_DIR%
echo  Pacote     : %UPDATE_DIR%
echo  Versao     : %NEW_VERSION%
echo.

REM ==============================================================
REM [1/6] PARAR BACKEND E INTERFACE
REM ==============================================================
echo  [1/6] Encerrando Agent Bastos (backend + interface)...

REM Fecha o Electron (instalador NSIS falha se o app estiver aberto)
taskkill /F /IM "Agent Bastos.exe" >nul 2>&1

REM Encerra o backend pela porta 8000 (mesma tecnica do iniciar_prod.bat)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 " ^| findstr LISTENING 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul
echo        Processos encerrados.
echo.

REM ==============================================================
REM [2/6] BACKUP DO CODIGO ATUAL (ROLLBACK)
REM ==============================================================
echo  [2/6] Fazendo backup do codigo atual...

REM Timestamp seguro para nome de pasta (independe de formato regional)
for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set TS=%%t
set BACKUP_DIR=%INSTALL_DIR%\backups\pre_v%NEW_VERSION%_%TS%

REM Backup APENAS do codigo - dados de producao ficam onde estao
robocopy "%INSTALL_DIR%" "%BACKUP_DIR%" ^
    /E ^
    /XD .venv data logs backups python_runtime __pycache__ .git ^
    /XF "*.db" "*.db-shm" "*.db-wal" "*.log" ^
    /NFL /NDL /NJH /NJS /NC /NS ^
    /R:1 /W:1

if !errorlevel! gtr 7 (
    echo  [ERRO] Falha no backup. Atualizacao ABORTADA por seguranca.
    pause
    exit /b 1
)
echo        Backup criado em: %BACKUP_DIR%
echo.

REM ==============================================================
REM [3/6] INSTALAR DEPENDENCIAS NOVAS (SE HOUVER)
REM ==============================================================
echo  [3/6] Verificando dependencias Python novas...

set VENV_PIP=%INSTALL_DIR%\.venv\Scripts\pip.exe

if not exist "%UPDATE_DIR%novos_pacotes.txt" (
    echo        Nenhuma dependencia nova nesta versao.
    goto :deps_ok
)

set WHEELS_COUNT=0
for %%f in ("%UPDATE_DIR%wheels\*.whl") do set /a WHEELS_COUNT+=1
for %%f in ("%UPDATE_DIR%wheels\*.tar.gz") do set /a WHEELS_COUNT+=1

if !WHEELS_COUNT! equ 0 (
    echo  [AVISO] novos_pacotes.txt existe mas a pasta wheels esta vazia.
    echo          Pacote pode estar incompleto. Continuando sem instalar deps.
    goto :deps_ok
)

echo        Instalando !WHEELS_COUNT! pacote(s) em modo offline...
"%VENV_PIP%" install ^
    --no-index ^
    --find-links="%UPDATE_DIR%wheels" ^
    -r "%UPDATE_DIR%novos_pacotes.txt" ^
    --quiet ^
    2>"%TEMP%\ab_update_pip.txt"

if !errorlevel! neq 0 (
    echo  [AVISO] Erros na instalacao de dependencias:
    type "%TEMP%\ab_update_pip.txt"
    echo.
    echo  Pressione qualquer tecla para continuar mesmo assim...
    pause >nul
) else (
    echo        Dependencias instaladas.
)
del "%TEMP%\ab_update_pip.txt" >nul 2>&1

:deps_ok
echo.

REM ==============================================================
REM [4/6] ATUALIZAR CODIGO DO BACKEND
REM ==============================================================
echo  [4/6] Atualizando codigo do backend...

REM Defesa em profundidade: o pacote ja vem sem estado/segredos,
REM mas mesmo assim protegemos os arquivos de producao no destino.
robocopy "%UPDATE_DIR%backend" "%INSTALL_DIR%" ^
    /E ^
    /XD data logs backups .venv __pycache__ python_runtime ^
    /XF ".env" "*.db" "*.db-shm" "*.db-wal" "credentials.json" "serviceAccountKey.json" "token.json" ^
    /NFL /NDL /NJH /NJS /NC /NS ^
    /R:1 /W:1

if !errorlevel! gtr 7 (
    echo  [ERRO] Falha ao copiar codigo. Code: !errorlevel!
    echo         Restaure o backup se necessario: %BACKUP_DIR%
    pause
    exit /b 1
)

REM Limpa bytecode antigo para evitar codigo obsoleto em cache
for /d /r "%INSTALL_DIR%" %%d in (__pycache__) do (
    if exist "%%d" rmdir /s /q "%%d" >nul 2>&1
)
echo        Codigo atualizado (cache .pyc limpo).
echo.

REM ==============================================================
REM [5/6] ATUALIZAR INTERFACE GRAFICA (SE INCLUIDA)
REM ==============================================================
echo  [5/6] Interface grafica...

set ELECTRON_FOUND=0
for %%f in ("%UPDATE_DIR%electron\*.exe") do (
    set ELECTRON_FOUND=1
    echo        Instalando: %%~nxf
    "%%f" /S
    if !errorlevel! neq 0 (
        echo  [AVISO] Instalador retornou code !errorlevel!
    ) else (
        echo        Interface atualizada.
    )
)
if !ELECTRON_FOUND! equ 0 (
    echo        Sem novo instalador neste pacote. Interface mantida.
)
echo.

REM ==============================================================
REM [6/6] REGISTRAR VERSAO
REM ==============================================================
echo  [6/6] Registrando versao instalada...

if exist "%UPDATE_DIR%versao.txt" (
    copy /y "%UPDATE_DIR%versao.txt" "%INSTALL_DIR%\versao_instalada.txt" >nul
    echo        versao_instalada.txt atualizado.
)

echo.
echo  ============================================================
echo    ATUALIZACAO CONCLUIDA - v%NEW_VERSION%
echo.
echo    Para iniciar: atalho "Agent Bastos" na Area de Trabalho
echo.
echo    Rollback (se necessario): copie o conteudo de
echo    %BACKUP_DIR%
echo    de volta para %INSTALL_DIR% e reinicie.
echo  ============================================================
echo.
pause
