#Requires -Version 5.1
<#
.SYNOPSIS
    Prepara o pacote de implantacao offline do Agent Bastos.

.DESCRIPTION
    Executa na maquina de desenvolvimento. Cria uma pasta deploy_package
    com tudo que a maquina destino precisa para instalar sem internet:
      - Wheels de todos os pacotes Python (do .venv atual)
      - Codigo-fonte do backend
      - Instalador do Electron
      - Scripts de instalacao

.PARAMETER OutputDir
    Pasta de destino do pacote. Default: <backend>\deploy_package

.PARAMETER Version
    Versao do app para nomes de arquivo. Default: 1.0.0

.EXAMPLE
    .\preparar_deploy.ps1
    .\preparar_deploy.ps1 -OutputDir D:\Distribuicao\AgentBastos_v1.0 -Version 1.0.0

.NOTES
    Requer: .venv ativo com pip, robocopy (padrao no Windows)
    Tempo estimado: 10-40 minutos (depende do tamanho das dependencias)
#>

param(
    [string]$OutputDir = "",
    [string]$Version   = "1.0.0"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# ----------------------------------------------------------------
# Caminhos
# ----------------------------------------------------------------
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir  = Split-Path -Parent $ScriptDir
$VenvPip     = Join-Path $BackendDir ".venv\Scripts\pip.exe"
$VenvPython  = Join-Path $BackendDir ".venv\Scripts\python.exe"
$ReqFile     = Join-Path $BackendDir "requirements.txt"
$ElectronDir = "C:\Users\Administrador\agent-bastos-app\dist-installer"

if ($OutputDir -eq "") {
    $OutputDir = Join-Path $BackendDir "deploy_package"
}

# ----------------------------------------------------------------
# Banner
# ----------------------------------------------------------------
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host "    AGENT BASTOS v$Version - PREPARAR DEPLOY OFFLINE" -ForegroundColor Cyan
Write-Host "    Empacotando para implantacao em rede fechada" -ForegroundColor Cyan
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Backend    : $BackendDir" -ForegroundColor Gray
Write-Host "  Saida      : $OutputDir" -ForegroundColor Gray
Write-Host ""

# ----------------------------------------------------------------
# Pre-requisitos
# ----------------------------------------------------------------
Write-Host "  [PRE] Verificando pre-requisitos..." -ForegroundColor Yellow

if (-not (Test-Path $VenvPip)) {
    Write-Host "  [ERRO] pip nao encontrado em: $VenvPip" -ForegroundColor Red
    Write-Host "         Certifique-se de que o .venv existe e esta ativo." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $ReqFile)) {
    Write-Host "  [ERRO] requirements.txt nao encontrado em: $ReqFile" -ForegroundColor Red
    exit 1
}

$pyVersion = & $VenvPython --version 2>&1
Write-Host "         Python: $pyVersion" -ForegroundColor Gray

# ----------------------------------------------------------------
# Criar estrutura do pacote
# ----------------------------------------------------------------
Write-Host "  [PRE] Criando estrutura do pacote..." -ForegroundColor Yellow

$subdirs = @(
    $OutputDir,
    (Join-Path $OutputDir "backend"),
    (Join-Path $OutputDir "wheels"),
    (Join-Path $OutputDir "python_installer"),
    (Join-Path $OutputDir "electron")
)
foreach ($d in $subdirs) {
    New-Item -ItemType Directory -Force -Path $d | Out-Null
}
Write-Host "         Estrutura criada em: $OutputDir" -ForegroundColor Gray
Write-Host ""

# ----------------------------------------------------------------
# ETAPA 1/5 — Gerar requirements_freeze.txt
# ----------------------------------------------------------------
Write-Host "  [1/5] Gerando freeze do ambiente atual..." -ForegroundColor Yellow

$FreezeFile = Join-Path $OutputDir "requirements_freeze.txt"
& $VenvPip freeze | Out-File -FilePath $FreezeFile -Encoding UTF8
$freezeCount = (Get-Content $FreezeFile).Count
Write-Host "         $freezeCount pacotes no ambiente atual -> requirements_freeze.txt" -ForegroundColor Green
Write-Host ""

# ----------------------------------------------------------------
# ETAPA 2/5 — Baixar wheels
# ----------------------------------------------------------------
Write-Host "  [2/5] Baixando wheels (instalacao offline)..." -ForegroundColor Yellow
Write-Host "         AVISO: Isso pode demorar 20-60 minutos para ~200 pacotes." -ForegroundColor Gray
Write-Host "         O processo inclui torch, transformers, chromadb e toda a stack." -ForegroundColor Gray
Write-Host ""

$WheelsDir = Join-Path $OutputDir "wheels"

# Usa o freeze (versoes exatas instaladas) para garantir reproducibilidade
# --prefer-binary: prefere wheels pre-compilados (evita compilar C extensions)
# Nao usa --platform para pegar os wheels da plataforma atual (Windows x64)
Write-Host "         Executando pip download (versoes exatas do ambiente)..." -ForegroundColor Gray

& $VenvPip download `
    --requirement $FreezeFile `
    --dest $WheelsDir `
    --prefer-binary `
    --quiet

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [AVISO] pip download retornou erros. Alguns pacotes podem estar faltando." -ForegroundColor Yellow
    Write-Host "          Verifique a conexao com o PyPI e tente novamente." -ForegroundColor Yellow
} else {
    $wheelCount = (Get-ChildItem $WheelsDir -File).Count
    $wheelsSize = [math]::Round((Get-ChildItem $WheelsDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1GB, 2)
    Write-Host "         $wheelCount arquivos baixados ($wheelsSize GB)" -ForegroundColor Green
}
Write-Host ""

# ----------------------------------------------------------------
# ETAPA 3/5 — Copiar backend
# ----------------------------------------------------------------
Write-Host "  [3/5] Copiando codigo-fonte do backend..." -ForegroundColor Yellow

$BackendDest = Join-Path $OutputDir "backend"

# Pastas a excluir do deploy
$excludeDirs = @(
    ".venv", ".git", ".github", ".vscode", ".pytest_cache",
    "__pycache__", "deploy_package", "logs", "node_modules",
    "drive_indexer", "frontend", "ui", "tests", "n8n_workflows"
)

# Arquivos a excluir
$excludeFiles = @("*.pyc", "*.log", "*.db-shm", "*.db-wal", "*.tar.gz", "*.zip")

$robocopyArgs = @(
    $BackendDir, $BackendDest, "/E",
    "/XD") + $excludeDirs + @(
    "/XF") + $excludeFiles + @(
    "/NFL", "/NDL", "/NJH", "/NJS", "/NC", "/NS",
    "/R:1", "/W:1"
)

$result = robocopy @robocopyArgs
# robocopy exit code <= 7 = sucesso
if ($LASTEXITCODE -gt 7) {
    Write-Host "  [AVISO] robocopy retornou code $LASTEXITCODE. Verifique os arquivos copiados." -ForegroundColor Yellow
} else {
    $backendSize = [math]::Round((Get-ChildItem $BackendDest -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
    Write-Host "         Backend copiado ($backendSize MB)" -ForegroundColor Green
}
Write-Host ""

# ----------------------------------------------------------------
# ETAPA 3.5/5 — Copiar modelo de embeddings (rede fechada)
# ----------------------------------------------------------------
Write-Host "  [3.5/5] Copiando modelo de embeddings (intfloat/multilingual-e5-small)..." -ForegroundColor Yellow
Write-Host "          Necessario para RAG funcionar sem internet." -ForegroundColor Gray

$HfCacheSource = Join-Path $env:USERPROFILE ".cache\huggingface\hub"
$ModelName     = "models--intfloat--multilingual-e5-small"
$ModelSource   = Join-Path $HfCacheSource $ModelName
# Destino: backend\data\hf_cache\hub\ (robocopy ja copiou o backend, mas hf_cache nao existe)
# Copiamos direto para la agora
$HfCacheDest   = Join-Path $BackendDest "data\hf_cache\hub"

if (-not (Test-Path $ModelSource)) {
    Write-Host "  [AVISO] Modelo nao encontrado em: $ModelSource" -ForegroundColor Yellow
    Write-Host "          O modelo sera baixado na primeira execucao (requer internet)." -ForegroundColor Yellow
    Write-Host "          Para deploy offline, execute o backend uma vez para cachear o modelo." -ForegroundColor Yellow
} else {
    New-Item -ItemType Directory -Force -Path $HfCacheDest | Out-Null
    $modelArgs = @(
        $ModelSource, (Join-Path $HfCacheDest $ModelName), "/E",
        "/NFL", "/NDL", "/NJH", "/NJS", "/NC", "/NS",
        "/R:1", "/W:1"
    )
    robocopy @modelArgs | Out-Null
    if ($LASTEXITCODE -le 7) {
        $modelSize = [math]::Round((Get-ChildItem (Join-Path $HfCacheDest $ModelName) -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
        Write-Host "          Modelo copiado ($modelSize MB) -> data\hf_cache\hub\$ModelName" -ForegroundColor Green
    } else {
        Write-Host "  [AVISO] Erro ao copiar modelo (code $LASTEXITCODE). Verifique manualmente." -ForegroundColor Yellow
    }
}
Write-Host ""

# Copia o instalar_backend.bat para a raiz do pacote
$installerSrc = Join-Path $ScriptDir "instalar_backend.bat"
if (Test-Path $installerSrc) {
    Copy-Item $installerSrc $OutputDir -Force
    Write-Host "         instalar_backend.bat incluido no pacote." -ForegroundColor Gray
} else {
    Write-Host "  [AVISO] instalar_backend.bat nao encontrado em $ScriptDir" -ForegroundColor Yellow
}

# ----------------------------------------------------------------
# ETAPA 4/5 — Copiar instalador Electron
# ----------------------------------------------------------------
Write-Host "  [4/5] Copiando instalador Electron..." -ForegroundColor Yellow

$ElectronDest = Join-Path $OutputDir "electron"
$setupFiles = @(Get-ChildItem $ElectronDir -Filter "*.exe" -ErrorAction SilentlyContinue)

if ($setupFiles.Count -eq 0) {
    Write-Host "  [AVISO] Nenhum .exe encontrado em $ElectronDir" -ForegroundColor Yellow
    Write-Host "          Execute 'npm run dist' no diretorio agent-bastos-app antes de empacotar." -ForegroundColor Yellow
} else {
    foreach ($f in $setupFiles) {
        Copy-Item $f.FullName $ElectronDest -Force
        $sizeMB = [math]::Round($f.Length / 1MB, 1)
        Write-Host "         Copiado: $($f.Name) ($sizeMB MB)" -ForegroundColor Green
    }
}
Write-Host ""

# ----------------------------------------------------------------
# ETAPA 5/5 — Gerar README de instalacao
# ----------------------------------------------------------------
Write-Host "  [5/5] Gerando instrucoes de instalacao..." -ForegroundColor Yellow

$pyVerShort = ($pyVersion -replace "Python ", "").Trim()
$readmeContent = @"
AGENT BASTOS v$Version - PACOTE DE INSTALACAO OFFLINE
======================================================
Gerado em: $(Get-Date -Format "dd/MM/yyyy HH:mm")
Python requerido: $pyVerShort

CONTEUDO DESTE PACOTE:
  instalar_backend.bat   - Instalador principal (execute como Administrador)
  backend\               - Codigo-fonte Python do Agent Bastos
  wheels\                - Pacotes Python pre-baixados (sem internet)
  python_installer\      - Coloque aqui o python-installer.exe (veja abaixo)
  electron\              - Instalador da interface grafica

PASSO A PASSO DE INSTALACAO:
  1. Baixe Python $pyVerShort em: https://www.python.org/downloads/
     Renomeie o arquivo baixado para: python-installer.exe
     Coloque-o na pasta: python_installer\

  2. Copie TODA esta pasta para a maquina destino
     (pen drive, share de rede, etc.)

  3. Na maquina destino, clique com botao direito em:
     instalar_backend.bat -> "Executar como administrador"

  4. Aguarde a instalacao completar (10-30 minutos na primeira vez)

  5. Use o atalho "Agent Bastos" na Area de Trabalho para iniciar.

PRIMEIRO ACESSO:
  - Login: admin
  - Senha: admin123
  - Troque a senha imediatamente em Configuracoes -> Minha Conta

SUPORTE:
  Em caso de erros, verifique o log em:
  C:\Agent_Bastos\logs\

"@

$readmePath = Join-Path $OutputDir "LEIA-ME_INSTALACAO.txt"
Set-Content -Path $readmePath -Value $readmeContent -Encoding UTF8
Write-Host "         LEIA-ME_INSTALACAO.txt criado." -ForegroundColor Green
Write-Host ""

# ----------------------------------------------------------------
# SUMARIO FINAL
# ----------------------------------------------------------------
$totalSize = [math]::Round((Get-ChildItem $OutputDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1GB, 2)

Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host "    PACOTE CRIADO COM SUCESSO!" -ForegroundColor Green
Write-Host ""
Write-Host "    Localizacao : $OutputDir" -ForegroundColor White
Write-Host "    Tamanho     : $totalSize GB (sem wheels de ML pode ser menor)" -ForegroundColor White
Write-Host ""
Write-Host "    PROXIMO PASSO OBRIGATORIO:" -ForegroundColor Yellow
Write-Host "    Baixe Python $pyVerShort e coloque em:" -ForegroundColor White
Write-Host "    $OutputDir\python_installer\python-installer.exe" -ForegroundColor Gray
Write-Host ""
Write-Host "    Depois copie a pasta completa para pen drive / share de rede." -ForegroundColor White
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host ""
