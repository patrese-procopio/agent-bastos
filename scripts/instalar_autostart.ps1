<#
.SYNOPSIS
  Registra (ou remove) uma Tarefa Agendada do Windows que sobe o Agent Bastos sozinho.

.DESCRIPTION
  A tarefa executa scripts\subir_tudo.ps1 -Vigiar: sobe backend + ngrok e, se algo cair,
  sobe de novo. Assim o servidor volta sozinho depois de reinicio, queda de energia ou
  atualizacao do Windows, sem ninguem precisar lembrar de rodar o .bat.

  Dois modos de disparo:

    Logon    (padrao) -> dispara quando o SEU usuario faz login.
                         Simples, nao guarda senha. Exige que alguem logue (ou auto-login).
    Startup           -> dispara quando o Windows liga, ANTES de qualquer login.
                         Ideal para servidor. Pede a senha do usuario UMA vez; quem guarda
                         e o proprio Windows (Gerenciador de Credenciais), nunca este script.
                         Exige PowerShell como Administrador.

  IMPORTANTE: a tarefa roda COM O SEU USUARIO (nao como SYSTEM) porque o ngrok.yml
  (authtoken) e o venv pertencem ao seu perfil.

.EXAMPLE
  .\scripts\instalar_autostart.ps1                 # modo Logon
  .\scripts\instalar_autostart.ps1 -Modo Startup   # servidor (PowerShell como Admin)
  .\scripts\instalar_autostart.ps1 -Remover        # desfaz
  .\scripts\instalar_autostart.ps1 -Status         # mostra estado da tarefa
#>
[CmdletBinding()]
param(
    [ValidateSet("Logon", "Startup")]
    [string]$Modo = "Logon",
    [string]$Dominio = "",
    [switch]$Remover,
    [switch]$Status
)

$ErrorActionPreference = "Stop"

$NomeTarefa = "AgentBastos-Servidor"
$Raiz       = Split-Path -Parent $PSScriptRoot
$Script     = Join-Path $PSScriptRoot "subir_tudo.ps1"
$Usuario    = "$env:USERDOMAIN\$env:USERNAME"

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    return ([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# ---------------------------------------------------------------------- status
if ($Status) {
    $t = Get-ScheduledTask -TaskName $NomeTarefa -ErrorAction SilentlyContinue
    if (-not $t) { Write-Host "Tarefa '$NomeTarefa' nao esta instalada."; return }
    $info = Get-ScheduledTaskInfo -TaskName $NomeTarefa
    Write-Host "Tarefa      : $NomeTarefa"
    Write-Host "Estado      : $($t.State)"
    Write-Host "Usuario     : $($t.Principal.UserId)"
    Write-Host "Ultima exec.: $($info.LastRunTime)  (resultado: $($info.LastTaskResult))"
    Write-Host "Log         : $(Join-Path $Raiz 'data\logs\subir_tudo.log')"
    return
}

# --------------------------------------------------------------------- remover
if ($Remover) {
    $t = Get-ScheduledTask -TaskName $NomeTarefa -ErrorAction SilentlyContinue
    if ($t) {
        Stop-ScheduledTask -TaskName $NomeTarefa -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $NomeTarefa -Confirm:$false
        Write-Host "[OK] Tarefa '$NomeTarefa' removida." -ForegroundColor Green
        Write-Host "     Backend/ngrok que estiverem rodando continuam ate: .\scripts\subir_tudo.ps1 -Parar"
    } else {
        Write-Host "Tarefa '$NomeTarefa' nao existe. Nada a remover."
    }
    return
}

# -------------------------------------------------------------------- instalar
if (-not (Test-Path $Script)) { throw "Nao achei $Script" }
if ($Modo -eq "Startup" -and -not (Test-Admin)) {
    Write-Host "[ERRO] O modo Startup exige PowerShell como Administrador." -ForegroundColor Red
    Write-Host "       Clique direito no PowerShell > Executar como administrador, ou use o modo Logon."
    exit 1
}

# Argumentos do script principal. -Vigiar = fica vivo e se recupera de quedas.
$argsScript = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Script`" -Vigiar"
if ($Dominio) { $argsScript += " -Dominio `"$Dominio`"" }

$acao = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argsScript -WorkingDirectory $Raiz

# Configuracoes que importam para servidor:
#  - sem limite de tempo (por padrao o Windows mata tarefas apos 3 dias!)
#  - roda em bateria (notebook) e nao para se sair da tomada
#  - se falhar, tenta de novo 3x com 1 min de intervalo
#  - nao empilha instancias se disparar duas vezes
$config = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew

if ($Modo -eq "Logon") {
    $gatilho   = New-ScheduledTaskTrigger -AtLogOn -User $Usuario
    $principal = New-ScheduledTaskPrincipal -UserId $Usuario -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $NomeTarefa -Action $acao -Trigger $gatilho `
        -Settings $config -Principal $principal `
        -Description "Agent Bastos: sobe backend + ngrok ao fazer login (subir_tudo.ps1 -Vigiar)" `
        -Force | Out-Null
} else {
    # Startup: o Windows precisa da senha para rodar sem sessao aberta.
    Write-Host "Informe a senha do usuario $Usuario (o Windows guarda; o script nao)." -ForegroundColor Yellow
    $cred = Get-Credential -UserName $Usuario -Message "Senha para a tarefa $NomeTarefa"
    $gatilho = New-ScheduledTaskTrigger -AtStartup
    $gatilho.Delay = "PT30S"   # 30 s de folga: deixa a rede subir antes do ngrok
    Register-ScheduledTask -TaskName $NomeTarefa -Action $acao -Trigger $gatilho `
        -Settings $config -User $cred.UserName `
        -Password $cred.GetNetworkCredential().Password -RunLevel Limited `
        -Description "Agent Bastos: sobe backend + ngrok ao ligar o Windows (subir_tudo.ps1 -Vigiar)" `
        -Force | Out-Null
}

Write-Host ""
Write-Host "[OK] Tarefa '$NomeTarefa' instalada (modo $Modo)." -ForegroundColor Green
Write-Host "     Testar agora, sem reiniciar : Start-ScheduledTask -TaskName $NomeTarefa"
Write-Host "     Ver estado                  : .\scripts\instalar_autostart.ps1 -Status"
Write-Host "     Log                         : data\logs\subir_tudo.log"
Write-Host "     Desinstalar                 : .\scripts\instalar_autostart.ps1 -Remover"
Write-Host ""
Write-Host "     Lembrete: em Opcoes de energia, deixe 'Suspender' = Nunca (na tomada)," -ForegroundColor Yellow
Write-Host "     senao o PC dorme e o tunel cai."
