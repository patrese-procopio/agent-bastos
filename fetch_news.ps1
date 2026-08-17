$backendDir = "C:\Users\Administrador\Agent_Bastos"
$python = "$backendDir\.venv\Scripts\python.exe"

Write-Host "=== AGENT BASTOS - Buscar Noticias ===" -ForegroundColor Cyan

# Verifica se backend esta rodando
$apiUp = $false
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -TimeoutSec 3 -UseBasicParsing -ErrorAction SilentlyContinue
    if ($resp.StatusCode -eq 200) { $apiUp = $true }
} catch {}

if (-not $apiUp) {
    Write-Host "Backend nao esta rodando. Iniciando..." -ForegroundColor Yellow

    # Libera porta 8000
    Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 800

    # Sobe backend em background
    $proc = Start-Process -NoNewWindow -FilePath $python -ArgumentList "api.py" -WorkingDirectory $backendDir -PassThru
    Write-Host "Backend PID: $($proc.Id)" -ForegroundColor DarkGray

    # Aguarda backend responder (max 15s)
    $tentativas = 0
    while ($tentativas -lt 15) {
        Start-Sleep -Seconds 1
        $tentativas++
        try {
            $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
            if ($resp.StatusCode -eq 200) { $apiUp = $true; break }
        } catch {}
        Write-Host "  aguardando backend... ($tentativas/15)" -ForegroundColor DarkGray
    }

    if (-not $apiUp) {
        Write-Host "Backend nao subiu. Abortando." -ForegroundColor Red
        exit 1
    }
    Write-Host "Backend pronto!" -ForegroundColor Green
}

# Faz login para obter token JWT (OAuth2 form-data — nao JSON)
Write-Host "Autenticando..." -ForegroundColor Yellow
$formBody = "username=admin&password=Int3l1g3nc1@"
try {
    $loginResp = Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/auth/login" `
        -Method POST -Body $formBody -ContentType "application/x-www-form-urlencoded" `
        -UseBasicParsing -TimeoutSec 10
    $token = ($loginResp.Content | ConvertFrom-Json).access_token
    Write-Host "Token OK" -ForegroundColor DarkGray
} catch {
    Write-Host "Falha na autenticacao. Verifique usuario/senha em fetch_news.ps1." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor DarkGray
    exit 1
}

# Chama endpoint de atualizacao (pode demorar 20-30s enquanto busca no RSS)
Write-Host "Buscando noticias do Google News RSS..." -ForegroundColor Cyan
Write-Host "(Aguarde, isso pode levar ate 30 segundos)" -ForegroundColor DarkGray
try {
    $newsResp = Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/noticias/atualizar" `
        -Headers @{ Authorization = "Bearer $token" } `
        -UseBasicParsing -TimeoutSec 60
    $result = $newsResp.Content | ConvertFrom-Json
    Write-Host "Pronto! $($result.total) noticias salvas em noticias_crimes.json" -ForegroundColor Green
    Write-Host "Data: $($result.data)" -ForegroundColor DarkGray
} catch {
    Write-Host "Falha ao buscar noticias:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor DarkGray
    exit 1
}
