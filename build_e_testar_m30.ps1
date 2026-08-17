Set-Location "C:\Users\Administrador\Agent_Bastos"

Write-Host "PASSO 1: Removendo containers antigos"
docker compose down
docker rm -f agent-bastos-api 2>$null

Write-Host "PASSO 2: Build e subida do backend Docker"
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { Write-Host "ERRO: docker compose falhou"; exit 1 }

Write-Host "PASSO 3: Aguardando 25s para o backend iniciar"
Start-Sleep -Seconds 25

$status = docker ps --filter "name=agent-bastos-api" --format "{{.Status}}"
Write-Host "Status container: $status"

Write-Host "PASSO 4: Testando endpoints ORACULO LIVE"
Get-Content "C:\Users\Administrador\Agent_Bastos\testar_m30.py" | docker exec -i agent-bastos-api python3 -

Write-Host "PASSO 5: Build frontend"
Set-Location "C:\Users\Administrador\agent-bastos-app"
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "ERRO: build frontend falhou"; exit 1 }

Write-Host "PASSO 6: Commit e Push Git frontend (M31)"
git add src/HitlDashboard.jsx
git commit -m "M31: SubintPreviewModal preview inline no ORACULO"
git push origin master

Write-Host "PASSO 7: Push Git backend"
Set-Location "C:\Users\Administrador\Agent_Bastos"
git push origin main

Write-Host "CONCLUIDO"
