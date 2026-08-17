param(
    [string]$NovaSenha = "admin123"
)

$backendDir = "C:\Users\Administrador\Agent_Bastos"
$python = "$backendDir\.venv\Scripts\python.exe"

Write-Host "=== RESET SENHA ADMIN ===" -ForegroundColor Cyan

Write-Host "Parando backend..." -ForegroundColor Yellow
Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

Write-Host "Resetando senha para: $NovaSenha" -ForegroundColor Yellow
Push-Location $backendDir

$script = @"
import sqlite3, os, sys
sys.path.insert(0, '.')
from passlib.context import CryptContext
pwd = CryptContext(schemes=['bcrypt'], deprecated='auto')
nova = '$NovaSenha'
h = pwd.hash(nova)
db = os.path.join('data', 'auth.db')
conn = sqlite3.connect(db)
cur = conn.execute('UPDATE users SET hashed_password = ? WHERE username = ?', (h, 'admin'))
conn.commit()
conn.close()
print(f'Atualizado: {cur.rowcount} registro(s). Senha: {nova}')
"@

& $python -c $script
Pop-Location

Write-Host "Reiniciando backend..." -ForegroundColor Green
Push-Location $backendDir
Start-Process -NoNewWindow -FilePath $python -ArgumentList "api.py" -WorkingDirectory $backendDir
Pop-Location

Write-Host "Pronto! Logue com usuario: admin / senha: $NovaSenha" -ForegroundColor Green
