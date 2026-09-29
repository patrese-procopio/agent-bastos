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
    6. (-Vigiar)      -> fica rodando e sobe de novo o que cair (backend / ngrok)

  Instancia unica: se ja houver um vigia ativo, nova execucao recusa subir. -Parar encerra
  tarefa agendada + vigia + ngrok + backend, nessa ordem.

  O dominio do ngrok vem de (nesta ordem): parametro -Dominio, variavel NGROK_DOMAIN no .env.
  Se nenhum for informado, o ngrok sorteia um dominio (e a URL muda a cada subida).
  O authtoken NUNCA passa por aqui: ele fica no ngrok.yml da maquina (ngrok config add-authtoken).

.EXAMPLE
  .\scripts\subir_tudo.ps1
  .\scripts\subir_tudo.ps1 -Dominio avert-collage-manual.ngrok-free.dev
  .\scripts\subir_tudo.ps1 -SemNgrok        # so o backend (uso local)
  .\scripts\subir_tudo.ps1 -Vigiar          # modo servidor: sobe e se recupera sozinho
  .\scripts\subir_tudo.ps1 -Parar           # derruba backend e ngrok
#>
[CmdletBinding()]
param(
    [int]$Porta = 8000,
    [string]$Dominio = "",
    [switch]$SemNgrok,
    [switch]$Parar,
    [switch]$Vigiar,
    [int]$TimeoutBackendSeg = 180,
    [int]$IntervaloVigiaSeg = 30
)

$ErrorActionPreference = "Stop"

# Raiz do backend = pasta acima de scripts\ (independe de onde o script foi chamado)
$Raiz   = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $Raiz ".venv\Scripts\python.exe"
$Local  = "http://127.0.0.1:$Porta"

$script:ProcBackend = $null
$script:ProcNgrok   = $null
$script:ArgsNgrok   = @()
$script:UrlPublica  = ""

# Controle de instancia unica: o vigia grava PID + StartTime + "batimento" neste arquivo.
# Duas instancias brigam entre si (uma reinicia o que a outra derruba) e o ngrok recusa o
# mesmo dominio duas vezes (ERR_NGROK_6030).
$NomeTarefa = "AgentBastos-Servidor"
$ArquivoPid = Join-Path $Raiz "data\subir_tudo.pid"
$FrescorSeg = $TimeoutBackendSeg + (3 * $IntervaloVigiaSeg) + 60

function Write-Etapa($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "    [OK]   $msg" -ForegroundColor Green }
function Write-Aviso($msg) { Write-Host "    [AVISO] $msg" -ForegroundColor Yellow }
function Write-Falha($msg) { Write-Host "    [ERRO] $msg" -ForegroundColor Red }
function Get-Agora         { return (Get-Date).ToString("yyyy-MM-dd HH:mm:ss") }

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

function Test-Health([string]$url, [hashtable]$headers = @{}, [int]$timeout = 3) {
    try {
        $r = Invoke-WebRequest -Uri "$url/health" -UseBasicParsing -TimeoutSec $timeout -Headers $headers
        return ($r.StatusCode -eq 200)
    } catch { return $false }
}

function Start-Backend {
    # startup.py (nao api.py): ele liga o modo offline quando o modelo de embeddings ja esta em cache.
    $env:PYTHONUTF8 = "1"
    $script:ProcBackend = Start-Process -FilePath $Python `
        -ArgumentList @("-X", "utf8", "startup.py") `
        -WorkingDirectory $Raiz `
        -WindowStyle Minimized `
        -PassThru
}

function Wait-Backend {
    # Espera o /health dar 200. Retorna $true/$false; se o processo morrer, desiste na hora.
    $inicio = Get-Date
    while (((Get-Date) - $inicio).TotalSeconds -lt $TimeoutBackendSeg) {
        if ($script:ProcBackend.HasExited) {
            Write-Falha "O backend encerrou sozinho (codigo $($script:ProcBackend.ExitCode)). Rode manualmente para ver o erro:"
            Write-Host  "         $Python -X utf8 startup.py"
            return $false
        }
        if (Test-Health $Local) { return $true }
        Start-Sleep -Seconds 2
    }
    Write-Falha "Backend nao respondeu em $TimeoutBackendSeg s. Veja a janela minimizada 'python'."
    return $false
}

function Start-Tunel {
    # Sobe o ngrok e le a URL publica na API local dele (127.0.0.1:4040).
    $script:ProcNgrok = Start-Process -FilePath "ngrok" -ArgumentList $script:ArgsNgrok -WindowStyle Minimized -PassThru
    $inicio = Get-Date
    while (((Get-Date) - $inicio).TotalSeconds -lt 30) {
        if ($script:ProcNgrok.HasExited) {
            Write-Falha "O ngrok encerrou (codigo $($script:ProcNgrok.ExitCode)). Rode manualmente para ver o erro:"
            Write-Host  "         ngrok $($script:ArgsNgrok -join ' ')"
            Write-Host  "         ERR_NGROK_4018 = falta 'ngrok config add-authtoken <token>'"
            return ""
        }
        try {
            $t = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2
            $https = $t.tunnels | Where-Object { $_.public_url -like "https://*" } | Select-Object -First 1
            if ($https) { return $https.public_url }
        } catch { }
        Start-Sleep -Seconds 1
    }
    Write-Falha "O ngrok subiu, mas nao consegui ler a URL publica em 127.0.0.1:4040."
    return ""
}

function Test-Publico([string]$url) {
    # O header pula a pagina de aviso do ngrok free, igual ao que o app faz.
    for ($i = 1; $i -le 5; $i++) {
        if (Test-Health $url @{ "ngrok-skip-browser-warning" = "true" } 8) { return $true }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Get-InstanciaAtiva {
    # Devolve o processo de OUTRA instancia ativa do vigia, ou $null. Confere tres coisas para
    # nao confundir com PID reciclado ou arquivo velho: batimento recente, processo vivo e
    # mesmo StartTime.
    if (-not (Test-Path $ArquivoPid)) { return $null }
    try {
        $arq = Get-Item $ArquivoPid
        if (((Get-Date) - $arq.LastWriteTime).TotalSeconds -gt $FrescorSeg) { return $null }
        $partes = (Get-Content $ArquivoPid -Raw).Trim().Split("|")
        $p = Get-Process -Id ([int]$partes[0]) -ErrorAction Stop
        if ($p.Id -eq $PID) { return $null }
        if ($p.StartTime.Ticks -ne [long]$partes[1]) { return $null }
        return $p
    } catch { return $null }
}

function Save-Batimento {
    $dir = Split-Path -Parent $ArquivoPid
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $eu = Get-Process -Id $PID
    Set-Content -Path $ArquivoPid -Value "$($eu.Id)|$($eu.StartTime.Ticks)" -Encoding ASCII
}

function Fim([int]$codigo) {
    # Toda saida depois do registro passa por aqui: solta o "lock" para a proxima tentativa.
    Remove-Item $ArquivoPid -Force -ErrorAction SilentlyContinue
    exit $codigo
}

# ---------------------------------------------------------------- modo -Parar
if ($Parar) {
    Write-Etapa "Derrubando vigia, backend e ngrok"
    # Ordem importa: primeiro quem RELIGA as coisas (tarefa agendada e vigia), depois o resto.
    # Se matar so o backend/ngrok, o vigia os ressuscita em ate 30 s.
    Stop-ScheduledTask -TaskName $NomeTarefa -ErrorAction SilentlyContinue
    $vigia = Get-InstanciaAtiva
    if ($vigia) {
        Write-Aviso "Encerrando o vigia (PID $($vigia.Id)); se ele estava num terminal, essa janela fecha"
        Stop-Process -Id $vigia.Id -Force -ErrorAction SilentlyContinue
    }
    Remove-Item $ArquivoPid -Force -ErrorAction SilentlyContinue
    Stop-Ngrok
    Stop-Porta $Porta
    Write-Ok "Tudo encerrado."
    return
}

# Instancia unica: se ja ha um vigia vivo, nao sobe outro por cima.
$outra = Get-InstanciaAtiva
if ($outra) {
    Write-Falha "Ja existe uma instancia do subir_tudo rodando (PID $($outra.Id))."
    Write-Host  "         Duas instancias brigam entre si e o ngrok recusa o mesmo dominio duas vezes."
    Write-Host  "         Para parar tudo antes de subir de novo: .\scripts\subir_tudo.ps1 -Parar"
    exit 1
}
if ($Vigiar) { Save-Batimento }

# Em modo servidor (-Vigiar) ninguem esta olhando a tela: grava um log para diagnostico.
# data\ ja esta no .gitignore (LGPD: o log nao deve ir para o repositorio).
if ($Vigiar) {
    $dirLog = Join-Path $Raiz "data\logs"
    if (-not (Test-Path $dirLog)) { New-Item -ItemType Directory -Path $dirLog -Force | Out-Null }
    try { Start-Transcript -Path (Join-Path $dirLog "subir_tudo.log") -Append | Out-Null } catch { }
}

Write-Host ""
Write-Host "  AGENT BASTOS - SUBIDA COMPLETA" -ForegroundColor Green
Write-Host "  Raiz: $Raiz"

# ------------------------------------------------------------ 1. pre-checagens
Write-Etapa "1/4  Pre-checagens"

if (-not (Test-Path $Python)) {
    Write-Falha "Python do venv nao encontrado em: $Python"
    Write-Host "         Crie o ambiente: python -m venv .venv ; .venv\Scripts\pip install -r requirements.txt"
    Fim 1
}
Write-Ok "venv encontrado"

if (-not $SemNgrok) {
    $ngrok = Get-Command ngrok -ErrorAction SilentlyContinue
    if (-not $ngrok) {
        Write-Falha "ngrok nao esta no PATH. Instale em https://ngrok.com/download"
        Fim 1
    }
    Write-Ok "ngrok encontrado ($($ngrok.Source))"

    # 'ngrok config check' valida o arquivo de configuracao. Sem authtoken o ngrok
    # falha com ERR_NGROK_4018 (foi o erro que tivemos), entao avisamos ANTES de subir.
    & ngrok config check *> $null
    if ($LASTEXITCODE -ne 0) {
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

    # 127.0.0.1 explicito: 'localhost' pode resolver para IPv6 (::1) no Windows.
    $script:ArgsNgrok = @("http", "127.0.0.1:$Porta")
    if ($Dominio) { $script:ArgsNgrok += "--url=$Dominio" }
}

# Porta livre: derruba instancia antiga em vez de falhar com 'address already in use'
Stop-Porta $Porta
if (-not $SemNgrok) { Stop-Ngrok }
Write-Ok "porta $Porta livre"

# ------------------------------------------------------------------ 2. backend
Write-Etapa "2/4  Backend (startup.py)"
Start-Backend
Write-Host "    aguardando $Local/health (o 1o boot carrega o modelo de embeddings e pode demorar)..."
if (-not (Wait-Backend)) { Fim 1 }
Write-Ok "backend respondendo em $Local/health"

if ($SemNgrok) {
    Write-Host ""
    Write-Host "  Backend no ar (sem tunel). URL no app: $Local" -ForegroundColor Green
    if (-not $Vigiar) { return }
}

# ------------------------------------------------------------------- 3. ngrok
if (-not $SemNgrok) {
    Write-Etapa "3/4  Tunel ngrok"
    $script:UrlPublica = Start-Tunel
    if (-not $script:UrlPublica) { Fim 1 }
    Write-Ok "tunel: $($script:UrlPublica) -> 127.0.0.1:$Porta"

    # -------------------------------------------------------------- 4. validacao
    Write-Etapa "4/4  Validacao ponta a ponta (URL publica)"
    if (Test-Publico $script:UrlPublica) {
        Write-Ok "GET $($script:UrlPublica)/health -> 200"
    } else {
        Write-Falha "A URL publica nao respondeu 200 (backend de pe, mas o tunel nao entrega)."
        Write-Host  "         Inspecione as requisicoes em http://127.0.0.1:4040"
        Fim 1
    }

    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Green
    Write-Host "   SISTEMA NO AR" -ForegroundColor Green
    Write-Host "   URL para o app (Config. inicial): $($script:UrlPublica)" -ForegroundColor Green
    Write-Host "   Backend local : $Local"
    Write-Host "   Painel ngrok  : http://127.0.0.1:4040"
    Write-Host "   Para derrubar : .\scripts\subir_tudo.ps1 -Parar"
    Write-Host "  ============================================" -ForegroundColor Green
    Write-Host ""
}

# ------------------------------------------------------------------ 5. vigia
if ($Vigiar) {
    Write-Etapa "Modo vigia ativo (checa a cada $IntervaloVigiaSeg s; Ctrl+C ou -Parar para sair)"
    $falhasSeguidas = 0
    try {
    while ($true) {
        Start-Sleep -Seconds $IntervaloVigiaSeg
        Save-Batimento

        # Backend: processo morto OU /health falhando 3x seguidas (travado) -> reinicia
        if ($script:ProcBackend.HasExited) {
            $falhasSeguidas = 3
        } elseif (Test-Health $Local) {
            $falhasSeguidas = 0
        } else {
            $falhasSeguidas++
        }
        if ($falhasSeguidas -ge 3) {
            Write-Aviso "[$(Get-Agora)] backend fora do ar - reiniciando"
            if (-not $script:ProcBackend.HasExited) { Stop-Process -Id $script:ProcBackend.Id -Force -ErrorAction SilentlyContinue }
            Stop-Porta $Porta
            Start-Backend
            if (Wait-Backend) { Write-Ok "[$(Get-Agora)] backend de volta" }
            $falhasSeguidas = 0
        }

        # ngrok: processo morto -> sobe de novo (com dominio fixo a URL nao muda)
        if (-not $SemNgrok -and $script:ProcNgrok.HasExited) {
            Write-Aviso "[$(Get-Agora)] ngrok caiu - reiniciando"
            $nova = Start-Tunel
            if ($nova) { $script:UrlPublica = $nova; Write-Ok "[$(Get-Agora)] tunel de volta: $nova" }
        }
    }
    } finally {
        # Ctrl+C ou encerramento normal: solta o "lock" (o arquivo velho tambem expira sozinho).
        Remove-Item $ArquivoPid -Force -ErrorAction SilentlyContinue
    }
}
