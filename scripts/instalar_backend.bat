@echo off
setlocal EnableDelayedExpansion
title Agent Bastos - Instalador Backend (Rede Fechada)
color 0A

echo.
echo  ============================================================
echo    AGENT BASTOS - INSTALADOR BACKEND OFFLINE
echo    Instalacao para ambientes sem acesso a internet
echo    Viga Solucoes e Tecnologia
echo  ============================================================
echo.

REM ==============================================================
REM CONFIGURACOES - edite aqui se necessario
REM ==============================================================
set INSTALL_DIR=C:\Agent_Bastos
set PYTHON_MIN_VER=3.11
set APP_VERSION=1.0.0
REM ==============================================================

REM --- Verifica privilegios de Administrador ---
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERRO] Este instalador requer privilegios de Administrador.
    echo.
    echo         Feche esta janela e execute novamente com:
    echo         Botao direito no arquivo -> "Executar como administrador"
    echo.
    pause
    exit /b 1
)

REM Pasta onde este .bat esta localizado (o deploy_package)
set DEPLOY_DIR=%~dp0

echo  Pasta de instalacao : %INSTALL_DIR%
echo  Pacote de deploy    : %DEPLOY_DIR%
echo.

REM ==============================================================
REM [1/7] VERIFICAR / INSTALAR PYTHON
REM ==============================================================
echo  [1/7] Verificando Python...

set PYTHON_EXE=
REM Tenta encontrar Python no PATH
python --version >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PYVER=%%v
    echo        Python !PYVER! encontrado no sistema.
    set PYTHON_EXE=python
    goto :python_ok
)

REM Tenta o caminho padrao Python 3.14
if exist "C:\Python314\python.exe" (
    set PYTHON_EXE=C:\Python314\python.exe
    for /f "tokens=2" %%v in ('"C:\Python314\python.exe" --version 2^>^&1') do set PYVER=%%v
    echo        Python !PYVER! encontrado em C:\Python314.
    goto :python_ok
)

REM Tenta outros caminhos comuns
for %%p in (
    "C:\Python313\python.exe"
    "C:\Python312\python.exe"
    "C:\Python311\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
) do (
    if exist %%p (
        set PYTHON_EXE=%%p
        for /f "tokens=2" %%v in ('"%%~p" --version 2^>^&1') do set PYVER=%%v
        echo        Python !PYVER! encontrado em %%~p.
        goto :python_ok
    )
)

REM Python nao encontrado - instala do pacote
echo        Python nao encontrado. Instalando do pacote...
if not exist "%DEPLOY_DIR%python_installer\python-installer.exe" (
    echo.
    echo  [ERRO] Arquivo python-installer.exe nao encontrado em:
    echo         %DEPLOY_DIR%python_installer\
    echo.
    echo         Solucao: Baixe o Python 3.14+ de https://www.python.org
    echo         e renomeie para python-installer.exe nessa pasta.
    echo.
    pause
    exit /b 1
)

echo        Executando instalador Python (aguarde)...
"%DEPLOY_DIR%python_installer\python-installer.exe" ^
    /quiet ^
    InstallAllUsers=0 ^
    PrependPath=0 ^
    TargetDir="%INSTALL_DIR%\python_runtime" ^
    Include_pip=1 ^
    Include_launcher=0 ^
    Include_test=0

if !errorlevel! neq 0 (
    echo  [ERRO] Falha na instalacao do Python. Code: !errorlevel!
    pause
    exit /b 1
)
set PYTHON_EXE=%INSTALL_DIR%\python_runtime\python.exe
echo        Python instalado em %INSTALL_DIR%\python_runtime

:python_ok
echo.

REM ==============================================================
REM [2/7] CRIAR PASTA DE INSTALACAO
REM ==============================================================
echo  [2/7] Criando estrutura de pastas em %INSTALL_DIR%...

for %%d in (
    "%INSTALL_DIR%"
    "%INSTALL_DIR%\logs"
    "%INSTALL_DIR%\data"
    "%INSTALL_DIR%\config"
) do (
    if not exist %%d mkdir %%d
)
echo        Pastas criadas.
echo.

REM ==============================================================
REM [3/7] CRIAR AMBIENTE VIRTUAL (.venv)
REM ==============================================================
echo  [3/7] Configurando ambiente virtual (.venv)...

if exist "%INSTALL_DIR%\.venv\Scripts\python.exe" (
    echo        .venv ja existe e esta funcional. Pulando criacao.
    goto :venv_ok
)

REM Remove venv incompleto se existir
if exist "%INSTALL_DIR%\.venv" (
    echo        .venv incompleto detectado. Removendo...
    rmdir /s /q "%INSTALL_DIR%\.venv"
)

echo        Criando novo .venv...
"%PYTHON_EXE%" -m venv "%INSTALL_DIR%\.venv"
if !errorlevel! neq 0 (
    echo  [ERRO] Falha ao criar .venv. Code: !errorlevel!
    pause
    exit /b 1
)
echo        .venv criado com sucesso.

:venv_ok
set VENV_PYTHON=%INSTALL_DIR%\.venv\Scripts\python.exe
set VENV_PIP=%INSTALL_DIR%\.venv\Scripts\pip.exe
echo.

REM ==============================================================
REM [4/7] INSTALAR PACOTES PYTHON (OFFLINE)
REM ==============================================================
echo  [4/7] Instalando pacotes Python...
echo        Modo: OFFLINE (sem internet) - usando pacotes locais
echo        Isso pode demorar 10 a 30 minutos. Aguarde...
echo.

REM Verifica se os wheels existem
set WHEELS_COUNT=0
for %%f in ("%DEPLOY_DIR%wheels\*.whl") do set /a WHEELS_COUNT+=1
for %%f in ("%DEPLOY_DIR%wheels\*.tar.gz") do set /a WHEELS_COUNT+=1

if !WHEELS_COUNT! equ 0 (
    echo  [ERRO] Nenhum wheel encontrado em %DEPLOY_DIR%wheels\
    echo         O pacote de deploy pode estar incompleto.
    pause
    exit /b 1
)
echo        !WHEELS_COUNT! pacotes encontrados na pasta wheels.
echo.

"%VENV_PIP%" install ^
    --no-index ^
    --find-links="%DEPLOY_DIR%wheels" ^
    -r "%DEPLOY_DIR%backend\requirements.txt" ^
    --quiet ^
    2>"%TEMP%\ab_pip_errors.txt"

if !errorlevel! neq 0 (
    echo  [AVISO] Alguns pacotes falharam. Detalhes:
    type "%TEMP%\ab_pip_errors.txt"
    echo.
    echo  A instalacao continua. Verifique os erros acima.
    echo  Pressione qualquer tecla para continuar...
    pause >nul
) else (
    echo        Todos os pacotes instalados com sucesso.
)
del "%TEMP%\ab_pip_errors.txt" >nul 2>&1
echo.

REM ==============================================================
REM [5/7] COPIAR ARQUIVOS DO BACKEND
REM ==============================================================
echo  [5/7] Copiando backend para %INSTALL_DIR%...

REM robocopy: exit code <= 7 = sucesso (inclui "copiado", "pulado", etc.)
robocopy "%DEPLOY_DIR%backend" "%INSTALL_DIR%" ^
    /E ^
    /XD .git .github __pycache__ .pytest_cache .venv deploy_package ^
    /XF "*.pyc" "*.log" "*.db-shm" "*.db-wal" ^
    /NFL /NDL /NJH /NJS /NC /NS ^
    /R:1 /W:1

if !errorlevel! gtr 7 (
    echo  [ERRO] Falha ao copiar backend. Code: !errorlevel!
    pause
    exit /b 1
)
echo        Backend copiado com sucesso.
echo.

REM ==============================================================
REM [6/7] VERIFICAR iniciar_prod.bat (ja vem com o backend)
REM ==============================================================
echo  [6/7] Verificando iniciar_prod.bat...
REM O iniciar_prod.bat foi copiado junto com o backend no passo [5/7].
REM Usa %%~dp0 internamente, entao funciona em qualquer caminho de instalacao.
REM Tambem ja tem HF_HOME configurado para carregar o modelo offline.

if exist "%INSTALL_DIR%\iniciar_prod.bat" (
    echo        OK - iniciar_prod.bat encontrado em %INSTALL_DIR%
) else (
    echo  [AVISO] iniciar_prod.bat nao encontrado. Verifique a copia do backend.
    echo         O sistema pode nao iniciar corretamente.
)
echo.

REM ==============================================================
REM [7/7] INSTALAR ELECTRON + ATALHO NA AREA DE TRABALHO
REM ==============================================================
echo  [7/7] Instalando Agent Bastos (interface grafica)...

set ELECTRON_FOUND=0
for %%f in ("%DEPLOY_DIR%electron\*.exe") do (
    set ELECTRON_FOUND=1
    echo        Executando: %%~nxf
    "%%f" /S
    if !errorlevel! neq 0 (
        echo  [AVISO] Instalador Electron retornou code !errorlevel!
        echo         Pode ser normal se ja estava instalado.
    ) else (
        echo        Interface grafica instalada.
    )
)

if !ELECTRON_FOUND! equ 0 (
    echo  [AVISO] Nenhum .exe encontrado em %DEPLOY_DIR%electron\
    echo         Execute o instalador Electron manualmente.
)

REM Cria atalho na Area de Trabalho (todos os usuarios)
echo.
echo        Criando atalho na Area de Trabalho...
powershell -NoProfile -Command ^
    "$ws = New-Object -ComObject WScript.Shell; ^
     $s = $ws.CreateShortcut([Environment]::GetFolderPath('CommonDesktopDirectory') + '\Agent Bastos.lnk'); ^
     $s.TargetPath = '%INSTALL_DIR%\iniciar_prod.bat'; ^
     $s.WorkingDirectory = '%INSTALL_DIR%'; ^
     $s.Description = 'Iniciar Agent Bastos - Sistema de Inteligencia'; ^
     $s.Save()" >nul 2>&1

if !errorlevel! equ 0 (
    echo        Atalho criado na Area de Trabalho.
) else (
    echo  [AVISO] Nao foi possivel criar o atalho. Crie manualmente.
)

REM ==============================================================
REM CONCLUSAO
REM ==============================================================
echo.
echo  ============================================================
echo    INSTALACAO CONCLUIDA COM SUCESSO!
echo.
echo    Para iniciar o sistema:
echo    1. Clique duas vezes em "Agent Bastos" na Area de Trabalho
echo       OU execute: %INSTALL_DIR%\iniciar_prod.bat
echo.
echo    IMPORTANTE - Primeiro acesso:
echo    - Login padrao: admin / admin123
echo    - Troque a senha imediatamente em Configuracoes
echo  ============================================================
echo.
pause
