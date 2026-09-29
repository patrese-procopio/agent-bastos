<#
.SYNOPSIS
  Sobe backend do Agent Bastos + tunel ngrok com pre-checagens e validacao ponta a ponta.

.DESCRIPTION
  Fluxo:
    1. Pre-checagens  -> venv, ngrok instalado, authtoken configurado, porta livre
    2. Backend        -> startup.py em janela propria, espera /health = 200
    3. Tunel ngrok    -> janela propria, descobre a URL publica pela API local (:4040)
    4. Validacao      -> GET <url publica>/health (o mesmo teste do "Testar conexao" do app)
    5. Resumo         -> mostra a URL para colar no app

  O dominio do ngrok vem de (nesta ordem): parametro -Dominio, variavel NGROK_DOMAIN no .env.
  Se nenhum for informado, o ngrok sorteia um dominio (e a URL muda a cada subida).
  O authtoken NUNCA passa por aqui: ele fica no ngrok.yml da maquina (ngrok config add-authtoken).

.EXAMPLE
  .\scripts\subir_tudo.ps1
  .\scripts\subir_tudo.ps1 -Dominio avert-collage-manual.ngrok-free.dev
  .\scripts\subir_tudo.ps1 -SemNgrok        # so o backend (uso local)
  .\scripts\subir_tudo.ps1 -Parar           # derruba backend e ngrok
#>
[CmdletBinding()]
param(
    [int]$Porta = 8000,
    [string]$Dominio = "",
    [switch]$SemNgrok,
    [switch]$Parar,
    [int]$TimeoutBackendSeg = 180
)

$ErrorActionPreference = "Stop"

# Raiz do backend = pasta acima de scripts\ (independe de onde o script foi chamado)
$Raiz   = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $Raiz ".venv\Scripts\python.exe"
$Local  = "http://127.0.0.1:$Porta"

function Write-Etapa($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "    [OK]   $msg" -ForegroundColor Green }
function Write-Aviso($msg) { Write-Host "    [AVISO] $msg" -ForegroundColor Yellow }
function Write-Falha($msg) { Write-Host "    [ERRO] $msg" -ForegroundColor Red }

function Get-EnvValor([string]$chave) {
    # Le CHAVE=valor do .env (ignora comentarios e aspas). Retorna "" se nao achar.
    $arquivo = Join-Path $Raiz ".env"
    if (-not (Test-Path $arquivo)) { return "" }
    foreach ($linha in Get-Content $arquivo -Encoding UTF8) {
        if ($linha -match "^\s*$chave\s*=\s*(.*)$") {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return ""
}

function Stop-Porta([int]$porta) {
    # Mata quem estiver escutando na porta (instancia anterior do backend).
    $conns = Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop
              Write-Aviso "Encerrado processo antigo na porta $porta (PID $($c.OwningProcess))" }
        catch { Write-Falha "Nao consegui encerrar o PID $($c.OwningProcess): $($_.Exception.Message)"; throw }
    }
}

function Stop-Ngrok {
    Get-Process -Name ngrok -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        Write-Aviso "Encerrado ngrok anterior (PID $($_.Id))"
    }
}

# ---------------------------------------------------------------- modo -Parar
if ($Parar) {
    Write-Etapa "Derrubando backend e ngrok"
    Stop-Ngrok
    Stop-Porta $Porta
    Write-Ok "Tudo encerrado."
    return
}

Write-Host ""
Write-Host "  AGENT BASTOS - SUBIDA COMPLETA" -ForegroundColor Green
Write-Host "  Raiz: $Raiz"

# ------------------------------------------------------------ 1. pre-checagens
Write-Etapa "1/4  Pre-checagens"

if (-not (Test-Path $Python)) {
    Write-Falha "Python do venv nao encontrado em: $Python"
    Write-Host "         Crie o ambiente: python -m venv .venv ; .venv\Scripts\pip install -r requirements.txt"
    exit 1
}
Write-Ok "venv encontrado"

if (-not $SemNgrok) {
    $ngrok = Get-Command ngrok -ErrorAction SilentlyContinue
    if (-not $ngrok) {
        Write-Falha "ngrok nao esta no PATH. Instale em https://ngrok.com/download"
        exit 1
    }
    Write-Ok "ngrok encontrado ($($ngrok.Source))"

    # 'ngrok config check' valida o arquivo de configuracao. Sem authtoken o ngrok
    # falha com ERR_NGROK_4018 (foi o erro que tivemos), entao avisamos ANTES de subir.
    & ngrok config check *> $null
    $cfgOk = ($LASTEXITCODE -eq 0)
    if (-not $cfgOk) {
        Write-Aviso "'ngrok config check' nao passou. Se aparecer ERR_NGROK_4018, rode:"
        Write-Host  "         ngrok config add-authtoken <SEU_TOKEN>   (token em dashboard.ngrok.com)"
    } else {
        Write-Ok "configuracao do ngrok valida"
    }

    if (-not $Dominio) { $Dominio = Get-EnvValor "NGROK_DOMAIN" }
    if ($Dominio) {
        # Aceita "https://x.ngrok-free.dev/" e normaliza para so o host
        $Dominio = ($Dominio -replace "^https?://", "").TrimEnd("/")
        Write-Ok "dominio: $Dominio"
    } else {
        Write-Aviso "Sem dominio fixo (NGROK_DOMAIN no .env ou -Dominio): a URL publica vai mudar a cada subida."
    }
}

# Porta livre: derruba instancia antiga em vez de falhar com 'address already in use'
Stop-Porta $Porta
if (-not $SemNgrok) { Stop-Ngrok }
Write-Ok "porta $Porta livre"

# ------------------------------------------------------------------ 2. backend
Write-Etapa "2/4  Backend (startup.py)"

$env:PYTHONUTF8 = "1"
$procBackend = Start-Process -FilePath $Python `
    -ArgumentList @("-X", "utf8", "startup.py") `
    -WorkingDirectory $Raiz `
    -WindowStyle Minimized `
    -PassThru
Write-Host "    aguardando $Local/health (o 1o boot carrega o modelo de embeddings e pode demorar)..."

$inicio = Get-Date
$pronto = $false
while (((Get-Date) - $inicio).TotalSeconds -lt $TimeoutBackendSeg) {
    if ($procBackend.HasExited) {
        Write-Falha "O backend encerrou sozinho (codigo $($procBackend.ExitCode)). Rode manualmente para ver o erro:"
        Write-Host  "         $Python -X utf8 startup.py"
        exit 1
    }
    try {
        $r = Invoke-WebRequest -Uri "$Local/health" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $pronto = $true; break }
    } catch { }
    Start-Sleep -Seconds 2
}
if (-not $pronto) {
    Write-Falha "Backend nao respondeu em $TimeoutBackendSeg s. Veja a janela minimizada 'python'."
    exit 1
}
Write-Ok "backend respondendo em $Local/health"

if ($SemNgrok) {
    Write-Host ""
    Write-Host "  Backend no ar (sem tunel). URL no app: $Local" -ForegroundColor Green
    return
}

# ------------------------------------------------------------------- 3. ngrok
Write-Etapa "3/4  Tunel ngrok"

$argsNgrok = @("http", "$Porta")
if ($Dominio) { $argsNgrok += "--url=$Dominio" }
$procNgrok = Start-Process -FilePath "ngrok" -ArgumentList $argsNgrok -WindowStyle Minimized -PassThru

# A API local do ngrok (127.0.0.1:4040) lista os tuneis assim que a sessao abre.
$urlPublica = ""
$inicio = Get-Date
while (((Get-Date) - $inicio).TotalSeconds -lt 30) {
    if ($procNgrok.HasExited) {
        Write-Falha "O ngrok encerrou (codigo $($procNgrok.ExitCode)). Rode manualmente para ver o erro:"
        Write-Host  "         ngrok $($argsNgrok -join ' ')"
        Write-Host  "         ERR_NGROK_4018 = falta 'ngrok config add-authtoken <token>'"
        exit 1
    }
    try {
        $t = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2
        $https = $t.tunnels | Where-Object { $_.public_url -like "https://*" } | Select-Object -First 1
        if ($https) { $urlPublica = $https.public_url; break }
    } catch { }
    Start-Sleep -Seconds 1
}
if (-not $urlPublica) {
    Write-Falha "O ngrok subiu, mas nao consegui ler a URL publica em 127.0.0.1:4040."
    exit 1
}
Write-Ok "tunel: $urlPublica -> localhost:$Porta"

# ---------------------------------------------------------------- 4. validacao
Write-Etapa "4/4  Validacao ponta a ponta (URL publica)"

# O header pula a pagina de aviso do ngrok free, igual ao que o app faz.
$validou = $false
for ($i = 1; $i -le 5; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "$urlPublica/health" -UseBasicParsing -TimeoutSec 8 `
                -Headers @{ "ngrok-skip-browser-warning" = "true" }
        if ($r.StatusCode -eq 200) { $validou = $true; break }
    } catch { }
    Start-Sleep -Seconds 2
}
if ($validou) {
    Write-Ok "GET $urlPublica/health -> 200"
} else {
    Write-Falha "A URL publica nao respondeu 200 (backend de pe, mas o tunel nao entrega)."
    Write-Host  "         Inspecione as requisicoes em http://127.0.0.1:4040"
    exit 1
}

# ------------------------------------------------------------------- resumo
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "   SISTEMA NO AR" -ForegroundColor Green
Write-Host "   URL para o app (Config. inicial): $urlPublica" -ForegroundColor Green
Write-Host "   Backend local : $Local"
Write-Host "   Painel ngrok  : http://127.0.0.1:4040"
Write-Host "   Para derrubar : .\scripts\subir_tudo.ps1 -Parar"
Write-Host "  ============================================" -ForegroundColor Green
Write-Host ""
