#Requires -Version 5.1
<#
.SYNOPSIS
    Prepara um pacote de ATUALIZACAO leve do Agent Bastos.

.DESCRIPTION
    Executa na maquina de desenvolvimento. Diferente do preparar_deploy.ps1
    (pacote completo de 1.36 GB), este gera apenas o delta:
      - Codigo-fonte do backend (sem dados, sem segredos, sem modelo de IA)
      - Somente wheels de pacotes NOVOS ou com versao alterada
      - Novo instalador Electron (se existir)
      - atualizar.bat + LEIA-ME + manifesto de versao

    O que NUNCA entra no pacote (estado de producao / LGPD):
      .env, credentials.json, serviceAccountKey.json, token.json,
      data\ (chroma_db, auth.db, audit.db, audios, relatorios),
      dashboard_bastos.db, logs\

.PARAMETER Version
    Versao desta atualizacao (obrigatorio). Ex: 1.1.0

.PARAMETER OutputDir
    Pasta de saida. Default: <backend>\update_package_v<Version>

.PARAMETER SkipWheels
    Pula a deteccao/download de dependencias novas.

.PARAMETER SkipElectron
    Nao inclui o instalador Electron (update so de backend).

.EXAMPLE
    .\preparar_update.ps1 -Version 1.1.0
    .\preparar_update.ps1 -Version 1.1.0 -SkipElectron
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Version,
    [string]$OutputDir = "",
    [switch]$SkipWheels,
    [switch]$SkipElectron
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# ----------------------------------------------------------------
# Caminhos
# ----------------------------------------------------------------
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir  = Split-Path -Parent $ScriptDir
$VenvPip     = Join-Path $BackendDir ".venv\Scripts\pip.exe"
$ElectronDir = "C:\Users\Administrador\agent-bastos-app\dist-installer"

# Baseline do freeze: usa o do ultimo update se existir, senao o do deploy inicial
$BaselineFreeze = Join-Path $ScriptDir "freeze_baseline.txt"
if (-not (Test-Path $BaselineFreeze)) {
    $BaselineFreeze = Join-Path $BackendDir "deploy_package\requirements_freeze.txt"
}

if ($OutputDir -eq "") {
    $OutputDir = Join-Path $BackendDir "update_package_v$Version"
}

# ----------------------------------------------------------------
# Banner
# ----------------------------------------------------------------
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host "    AGENT BASTOS v$Version - PREPARAR PACOTE DE ATUALIZACAO" -ForegroundColor Cyan
Write-Host "    Delta leve: codigo + deps novas (sem modelo, sem dados)" -ForegroundColor Cyan
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Backend  : $BackendDir" -ForegroundColor Gray
Write-Host "  Saida    : $OutputDir" -ForegroundColor Gray
Write-Host "  Baseline : $BaselineFreeze" -ForegroundColor Gray
Write-Host ""

# ----------------------------------------------------------------
# Pre-requisitos
# ----------------------------------------------------------------
if (-not (Test-Path $VenvPip)) {
    Write-Host "  [ERRO] pip nao encontrado em: $VenvPip" -ForegroundColor Red
    exit 1
}

# Estrutura do pacote
foreach ($d in @($OutputDir, (Join-Path $OutputDir "backend"), (Join-Path $OutputDir "wheels"), (Join-Path $OutputDir "electron"))) {
    New-Item -ItemType Directory -Force -Path $d | Out-Null
}

# ----------------------------------------------------------------
# ETAPA 1/5 - Detectar dependencias novas (diff do pip freeze)
# ----------------------------------------------------------------
Write-Host "  [1/5] Detectando dependencias novas ou atualizadas..." -ForegroundColor Yellow

$NewFreeze = & $VenvPip freeze
$NovosFile = Join-Path $OutputDir "novos_pacotes.txt"

if ($SkipWheels) {
    Write-Host "         Pulado (-SkipWheels)." -ForegroundColor Gray
} elseif (-not (Test-Path $BaselineFreeze)) {
    Write-Host "  [AVISO] Baseline nao encontrado. Sem diff possivel." -ForegroundColor Yellow
    Write-Host "          Rode preparar_deploy.ps1 primeiro ou crie scripts\freeze_baseline.txt" -ForegroundColor Yellow
} else {
    $oldLines = Get-Content $BaselineFreeze | Where-Object { $_ -match "==" }
    $newLines = $NewFreeze | Where-Object { $_ -match "==" }
    # Diff: linhas presentes no freeze novo que nao existem (nome+versao) no antigo
    $delta = $newLines | Where-Object { $oldLines -notcontains $_ }

    if (-not $delta) {
        Write-Host "         Nenhuma dependencia nova. Pasta wheels ficara vazia." -ForegroundColor Green
    } else {
        # ASCII sem BOM: pip e findstr leem sem problemas de encoding
        $delta | Out-File -FilePath $NovosFile -Encoding ASCII
        Write-Host "         $($delta.Count) pacote(s) novo(s)/alterado(s):" -ForegroundColor Green
        $delta | ForEach-Object { Write-Host "           - $_" -ForegroundColor Gray }
        Write-Host ""
        Write-Host "         Baixando wheels (pode incluir sub-dependencias)..." -ForegroundColor Gray

        & $VenvPip download `
            --requirement $NovosFile `
            --dest (Join-Path $OutputDir "wheels") `
            --prefer-binary `
            --quiet

        if ($LASTEXITCODE -ne 0) {
            Write-Host "  [AVISO] pip download retornou erros. Verifique a pasta wheels." -ForegroundColor Yellow
        } else {
            $wCount = (Get-ChildItem (Join-Path $OutputDir "wheels") -File).Count
            Write-Host "         $wCount arquivo(s) baixado(s)." -ForegroundColor Green
        }
    }
}
Write-Host ""

# ----------------------------------------------------------------
# ETAPA 2/5 - Copiar codigo do backend (SEM estado, SEM segredos)
# ----------------------------------------------------------------
Write-Host "  [2/5] Copiando codigo-fonte (sem dados de producao)..." -ForegroundColor Yellow

$BackendDest = Join-Path $OutputDir "backend"

$excludeDirs = @(
    ".venv", ".git", ".github", ".vscode", ".pytest_cache",
    "__pycache__", "deploy_package", "logs", "node_modules",
    "drive_indexer", "frontend", "ui", "tests", "n8n_workflows",
    "data", "backups"
)
# CRITICO: segredos e bancos de producao nunca entram no pacote (LGPD)
$excludeFiles = @(
    "*.pyc", "*.log", "*.db", "*.db-shm", "*.db-wal", "*.tar.gz", "*.zip",
    ".env", "credentials.json", "serviceAccountKey.json", "token.json",
    "*.xlsx", "*.docx", "*.pdf"
)

# Exclui tambem qualquer update_package_v* anterior
$updateDirs = Get-ChildItem $BackendDir -Directory -Filter "update_package_v*" -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }
if ($updateDirs) { $excludeDirs += $updateDirs }

$robocopyArgs = @(
    $BackendDir, $BackendDest, "/E",
    "/XD") + $excludeDirs + @(
    "/XF") + $excludeFiles + @(
    "/NFL", "/NDL", "/NJH", "/NJS", "/NC", "/NS",
    "/R:1", "/W:1"
)
robocopy @robocopyArgs | Out-Null

if ($LASTEXITCODE -gt 7) {
    Write-Host "  [AVISO] robocopy code $LASTEXITCODE. Verifique a copia." -ForegroundColor Yellow
} else {
    $sizeMB = [math]::Round((Get-ChildItem $BackendDest -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
    Write-Host "         Codigo copiado ($sizeMB MB)" -ForegroundColor Green
}
Write-Host ""

# ----------------------------------------------------------------
# ETAPA 3/5 - Instalador Electron (se houver build novo)
# ----------------------------------------------------------------
Write-Host "  [3/5] Instalador Electron..." -ForegroundColor Yellow

if ($SkipElectron) {
    Write-Host "         Pulado (-SkipElectron)." -ForegroundColor Gray
} else {
    # Idempotencia: limpa instaladores de rodadas anteriores — o atualizar.bat
    # executa TODOS os .exe da pasta, entao so pode existir um.
    Get-ChildItem (Join-Path $OutputDir "electron") -Filter "*.exe" -ErrorAction SilentlyContinue |
        Remove-Item -Force

    $setup = Get-ChildItem $ElectronDir -Filter "*.exe" -ErrorAction SilentlyContinue |
             Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($null -eq $setup) {
        Write-Host "  [AVISO] Nenhum .exe em $ElectronDir" -ForegroundColor Yellow
        Write-Host "          Se o frontend mudou, rode 'npm run dist' antes." -ForegroundColor Yellow
    } else {
        Copy-Item $setup.FullName (Join-Path $OutputDir "electron") -Force
        $sizeMB = [math]::Round($setup.Length / 1MB, 1)
        Write-Host "         Incluido: $($setup.Name) ($sizeMB MB, build de $($setup.LastWriteTime.ToString('dd/MM/yyyy HH:mm')))" -ForegroundColor Green
    }
}
Write-Host ""

# ----------------------------------------------------------------
# ETAPA 4/5 - atualizar.bat + manifesto de versao
# ----------------------------------------------------------------
Write-Host "  [4/5] Incluindo atualizar.bat e manifesto..." -ForegroundColor Yellow

$updaterSrc = Join-Path $ScriptDir "atualizar.bat"
if (Test-Path $updaterSrc) {
    Copy-Item $updaterSrc $OutputDir -Force
    Write-Host "         atualizar.bat incluido." -ForegroundColor Green
} else {
    Write-Host "  [ERRO] atualizar.bat nao encontrado em $ScriptDir" -ForegroundColor Red
    exit 1
}

# Manifesto: rastreabilidade de versao (inclui commit git se disponivel)
$gitHash = ""
try { $gitHash = (git -C $BackendDir rev-parse --short HEAD 2>$null) } catch {}
$manifest = @"
version=$Version
gerado_em=$(Get-Date -Format "dd/MM/yyyy HH:mm")
git_commit=$gitHash
"@
# ASCII sem BOM: o findstr do atualizar.bat precisa casar "version=" na 1a linha
Set-Content -Path (Join-Path $OutputDir "versao.txt") -Value $manifest -Encoding ASCII
Write-Host "         versao.txt criado (commit: $(if ($gitHash) { $gitHash } else { 'n/d' }))" -ForegroundColor Green
Write-Host ""

# ----------------------------------------------------------------
# ETAPA 5/5 - LEIA-ME + atualizar baseline
# ----------------------------------------------------------------
Write-Host "  [5/5] Gerando LEIA-ME e atualizando baseline..." -ForegroundColor Yellow

$readme = @"
AGENT BASTOS v$Version - PACOTE DE ATUALIZACAO
===============================================
Gerado em: $(Get-Date -Format "dd/MM/yyyy HH:mm")

Este pacote atualiza uma instalacao EXISTENTE do Agent Bastos.
NAO use em maquina nova - para isso use o pacote de instalacao completo.

O QUE ESTE PACOTE FAZ:
  - Faz backup do codigo atual (rollback automatico disponivel)
  - Atualiza o codigo do backend
  - Instala dependencias Python novas (se houver)
  - Atualiza a interface grafica (se incluida)

O QUE ELE NUNCA TOCA:
  - Banco de dados, documentos e dados de producao (pasta data\)
  - Arquivo .env (segredos e configuracoes locais)
  - Logs e credenciais

COMO APLICAR:
  1. Copie esta pasta inteira para a maquina destino
  2. Feche o Agent Bastos se estiver aberto
  3. Botao direito em atualizar.bat -> "Executar como administrador"
  4. Aguarde (2-10 minutos)
  5. Abra o Agent Bastos pelo atalho da Area de Trabalho

ATENCAO - VARIAVEIS DE AMBIENTE:
  Se esta versao exigir variaveis novas no .env, elas devem ser
  adicionadas MANUALMENTE no .env da maquina destino.
  (Segredos nunca viajam em pacote de atualizacao.)

ROLLBACK (se algo der errado):
  O codigo anterior fica em C:\Agent_Bastos\backups\
  Copie o conteudo do backup de volta para C:\Agent_Bastos\ e reinicie.
"@
Set-Content -Path (Join-Path $OutputDir "LEIA-ME_ATUALIZACAO.txt") -Value $readme -Encoding UTF8
Write-Host "         LEIA-ME_ATUALIZACAO.txt criado." -ForegroundColor Green

# Atualiza baseline para o proximo diff de dependencias
$NewFreeze | Out-File -FilePath (Join-Path $ScriptDir "freeze_baseline.txt") -Encoding UTF8
Write-Host "         freeze_baseline.txt atualizado (proximo update parte daqui)." -ForegroundColor Green
Write-Host ""

# ----------------------------------------------------------------
# SUMARIO
# ----------------------------------------------------------------
$totalMB = [math]::Round((Get-ChildItem $OutputDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 1)

Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host "    PACOTE DE ATUALIZACAO PRONTO!" -ForegroundColor Green
Write-Host ""
Write-Host "    Localizacao : $OutputDir" -ForegroundColor White
Write-Host "    Tamanho     : $totalMB MB" -ForegroundColor White
Write-Host ""
Write-Host "    Copie a pasta para o pen drive e execute atualizar.bat" -ForegroundColor White
Write-Host "    como Administrador na maquina destino." -ForegroundColor White
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host ""
