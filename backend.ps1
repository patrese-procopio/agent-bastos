$backendDir = "C:\Users\Administrador\Agent_Bastos"
$python = "$backendDir\.venv\Scripts\python.exe"

Write-Host "=== AGENT BASTOS - Backend ===" -ForegroundColor Cyan

Write-Host "Liberando porta 8000..." -ForegroundColor Yellow
Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 800

Write-Host "Iniciando backend em $backendDir" -ForegroundColor Green
Push-Location $backendDir
& $python api.py
Pop-Location
