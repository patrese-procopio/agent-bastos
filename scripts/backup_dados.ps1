<#
.SYNOPSIS
  Backup criptografado do Agent Bastos (bancos, ChromaDB, relatorios, auditoria, .env).

.DESCRIPTION
  Involucro fino sobre scripts\backup_dados.py (o trabalho pesado e la: backup consistente
  dos bancos SQLite em modo WAL + criptografia AES-256-GCM). A senha e pedida no terminal
  e NUNCA vai em argumento nem e gravada.

  Pode rodar com o backend LIGADO: os bancos SQLite saem consistentes. Unica ressalva: os
  arquivos de indice do ChromaDB sao copiados "a quente"; para copia 100% garantida do
  Chroma rode com o backend parado (.\scripts\subir_tudo.ps1 -Parar) ou use -SemChroma.

  Tudo e lido, compactado e criptografado num unico fluxo (sem copias intermediarias):
  o disco de destino precisa ter pelo menos o tamanho dos dados. O script confere antes.

.EXAMPLE
  .\scripts\backup_dados.ps1                              # backup em .\backups
  .\scripts\backup_dados.ps1 -Destino D:\bkp -Manter 30   # outro disco, guarda 30
  .\scripts\backup_dados.ps1 -Excluir drone,relatorios     # deixa pastas grandes de fora
  .\scripts\backup_dados.ps1 -Verificar .\backups\agentbastos_20260929_190000.bkp
  .\scripts\backup_dados.ps1 -Restaurar arq.bkp -Para C:\restaura   # NUNCA sobrescreve dados vivos
#>
[CmdletBinding()]
param(
    [string]$Destino = "",
    [int]$Manter = 14,
    [switch]$SemChroma,
    [switch]$ComAudios,
    [string[]]$Excluir = @(),
    [string]$Verificar = "",
    [string]$Restaurar = "",
    [string]$Para = ""
)

$ErrorActionPreference = "Stop"

$Raiz   = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $Raiz ".venv\Scripts\python.exe"
$Script = Join-Path $PSScriptRoot "backup_dados.py"

if (-not (Test-Path $Python)) {
    Write-Host "[ERRO] Python do venv nao encontrado em: $Python" -ForegroundColor Red
    exit 1
}

$argumentos = @("-X", "utf8", $Script)

if ($Verificar) {
    $argumentos += @("--verificar", $Verificar)
} elseif ($Restaurar) {
    if (-not $Para) {
        Write-Host "[ERRO] Informe a pasta de destino com -Para." -ForegroundColor Red
        exit 1
    }
    $argumentos += @("--restaurar", $Restaurar, "--para", $Para)
} else {
    if ($Destino)   { $argumentos += @("--destino", $Destino) }
    $argumentos += @("--manter", "$Manter")
    if ($SemChroma) { $argumentos += "--sem-chroma" }
    if ($ComAudios) { $argumentos += "--com-audios" }
    foreach ($pasta in $Excluir) { $argumentos += @("--excluir", $pasta) }

    # Aviso util: backend ligado + Chroma incluido = indice vetorial pode sair inconsistente.
    $backendLigado = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
    if ($backendLigado -and -not $SemChroma) {
        Write-Host "[AVISO] Backend ligado: bancos SQLite saem consistentes, mas o indice do ChromaDB" -ForegroundColor Yellow
        Write-Host "        e copiado a quente. Para garantia total: -Parar antes, ou use -SemChroma." -ForegroundColor Yellow
        Write-Host ""
    }
}

# Roda na raiz do projeto (o .py resolve os caminhos a partir do proprio arquivo).
Push-Location $Raiz
try {
    & $Python @argumentos
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
