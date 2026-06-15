$apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3NzVjYWVmMC1jMDY2LTRhNTctOTE3My0wMTM3NTcwZDk4MmIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiZThjZTVhNjMtN2YyNS00YjAxLTlkNmItMjU2Mzc0NmZhYjcwIiwiaWF0IjoxNzgwOTc5MzYzfQ.A8VlQqjyu2sqbledRCk6oIwVeBT-wvUzOEHDR1EDH2c"
$wfId = "PHAIZDUup4OkxfK2"
$base = "http://localhost:5678/api/v1"
$hdrs = @{ "X-N8N-API-KEY" = $apiKey; "Content-Type" = "application/json" }

Write-Host "[1/5] Buscando workflow..."
$wf = Invoke-RestMethod -Uri "$base/workflows/$wfId" -Headers $hdrs
Write-Host "     Nodes: $($wf.nodes.Count)"

# ── Node 3: Formata Mensagem — suporte a múltiplos destinatários ──────────────
Write-Host "[2/5] Atualizando node 3 (Formata Mensagem)..."
$node3 = $wf.nodes | Where-Object { $_.id -eq "2a0b6a26-0b91-4faf-a25a-9bdf489593cf" }
if (-not $node3) { Write-Host "ERRO: node 3 nao encontrado"; exit 1 }

$node3Code = 'const d = $input.first().json;' + "`n" +
'const risco     = d.nivel_risco || d.risco || "ALTO";' + "`n" +
'const descricao = d.audio_resumo || d.descricao || "(sem descricao)";' + "`n" +
'const aprovId   = d.pendencia_id || d.aprovacao_id || ("HITL-" + Date.now());' + "`n" +
'' + "`n" +
'// Suporte a lista (novo) ou numero unico (legado)' + "`n" +
'const numeros = Array.isArray(d.numeros_destino) && d.numeros_destino.length > 0' + "`n" +
'  ? d.numeros_destino' + "`n" +
'  : [d.numero_destino || "559281727347"];' + "`n" +
'' + "`n" +
'const emojis = { "ALTO": "🔴", "CRITICO": "🚨" };' + "`n" +
'const emoji = emojis[risco.toUpperCase().replace("Í","I")] || "⚠️";' + "`n" +
'' + "`n" +
'const ts = new Date().toLocaleString("pt-BR", {' + "`n" +
'  timeZone: "America/Manaus",' + "`n" +
'  day: "2-digit", month: "2-digit", year: "numeric",' + "`n" +
'  hour: "2-digit", minute: "2-digit",' + "`n" +
'});' + "`n" +
'' + "`n" +
'const mensagem =' + "`n" +
'  emoji + " *AGENT BASTOS — ALERTA " + risco + "*\n\n" +' + "`n" +
'  "📝 *Descricao:*\n" + descricao + "\n\n" +' + "`n" +
'  "🔑 *ID:* " + aprovId + "\n" +' + "`n" +
'  "🕐 *Horario:* " + ts + "\n\n" +' + "`n" +
'  "━━━━━━━━━━━━━━━━━━━━\n" +' + "`n" +
'  "Responda com:\n" +' + "`n" +
'  "✅ *CONFIRMAR " + aprovId + "* — para aprovar\n" +' + "`n" +
'  "❌ *REJEITAR " + aprovId + "* — para reprovar\n\n" +' + "`n" +
'  "_Esta aprovacao expira em 60 minutos._";' + "`n" +
'' + "`n" +
'// Um item por destinatario — node 4 envia para cada um' + "`n" +
'return numeros.map(numero => ({ json: { aprovacao_id: aprovId, numero_destino: numero, mensagem } }));'

$node3.parameters.jsCode = $node3Code
Write-Host "     OK"

# ── Node 6: Processa Resposta — aceita CONFIRMAR de qualquer numero ───────────
Write-Host "[3/5] Atualizando node 6 (Processa Resposta)..."
$node6 = $wf.nodes | Where-Object { $_.id -eq "52e05034-3729-4fb7-9764-49be9f09d417" }
if (-not $node6) { Write-Host "ERRO: node 6 nao encontrado"; exit 1 }

$node6Code = 'const raw = $input.first().json;' + "`n" +
'const payload = raw.body ?? raw;' + "`n" +
'' + "`n" +
'function extrairTexto(d) {' + "`n" +
'  if (!d) return "";' + "`n" +
'  if (d.message && d.message.conversation) return d.message.conversation;' + "`n" +
'  if (d.message && d.message.extendedTextMessage) return d.message.extendedTextMessage.text || "";' + "`n" +
'  if (Array.isArray(d)) {' + "`n" +
'    for (const item of d) { const t = extrairTexto(item); if (t) return t; }' + "`n" +
'  }' + "`n" +
'  return "";' + "`n" +
'}' + "`n" +
'' + "`n" +
'const texto = extrairTexto(payload.data).trim().toUpperCase();' + "`n" +
'' + "`n" +
'const match = texto.match(/(CONFIRMAR|REJEITAR)\s+(HITL-\d+|[A-F0-9-]{36})/i);' + "`n" +
'if (!match) {' + "`n" +
'  return [{ json: { ignorar: true, motivo: "Sem CONFIRMAR/REJEITAR. Evento=" + (payload.event||"?") + " Texto=" + texto.substring(0,40) } }];' + "`n" +
'}' + "`n" +
'' + "`n" +
'const decisao = match[1].toLowerCase() === "confirmar" ? "confirmada" : "rejeitada";' + "`n" +
'const aprovacao_id = match[2];' + "`n" +
'const remetente = (payload.data && !Array.isArray(payload.data) && payload.data.key) ? payload.data.key.remoteJid : "whatsapp";' + "`n" +
'return [{ json: { aprovacao_id, decisao, resposta_por: remetente, observacao: "Respondido via WhatsApp por " + remetente } }];'

$node6.parameters.jsCode = $node6Code
Write-Host "     OK"

Write-Host "[4/5] Serializando e enviando para n8n..."
$payload = @{
    name        = $wf.name
    nodes       = $wf.nodes
    connections = $wf.connections
    settings    = @{ executionOrder = "v1" }
    staticData  = $null
}
$bodyJson = $payload | ConvertTo-Json -Depth 30 -Compress
$resp = Invoke-RestMethod -Uri "$base/workflows/$wfId" -Method PUT -Headers $hdrs -Body $bodyJson

Write-Host "[5/5] Verificando workflow ativo..."
Invoke-RestMethod -Uri "$base/workflows/$wfId/activate" -Method POST -Headers $hdrs | Out-Null

Write-Host ""
Write-Host "=== SUCESSO ==="
Write-Host "Node 3: envia para todos os numeros em WA_NUMEROS_HITL"
Write-Host "Node 6: aceita CONFIRMAR de qualquer numero autorizado"
Write-Host ""
Write-Host "PROXIMO PASSO: docker compose up -d api"
