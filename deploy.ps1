$frontendDir = "C:\Users\Administrador\agent-bastos-app"
$backendDir = "C:\Users\Administrador\Agent_Bastos"
$python = "$backendDir\.venv\Scripts\python.exe"

Write-Host "=== AGENT BASTOS - Deploy Completo ===" -ForegroundColor Cyan

Write-Host "[1/2] Buildando frontend..." -ForegroundColor Yellow
Push-Location $frontendDir
npm run dist
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build falhou. Abortando." -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "Frontend OK!" -ForegroundColor Green

Write-Host "[2/2] Reiniciando backend..." -ForegroundColor Yellow
Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 800

Write-Host "Backend rodando em http://127.0.0.1:8000 (Ctrl+C para parar)" -ForegroundColor Green
Push-Location $backendDir
& $python api.py
Pop-Location
