$apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3NzVjYWVmMC1jMDY2LTRhNTctOTE3My0wMTM3NTcwZDk4MmIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiZThjZTVhNjMtN2YyNS00YjAxLTlkNmItMjU2Mzc0NmZhYjcwIiwiaWF0IjoxNzgwOTc5MzYzfQ.A8VlQqjyu2sqbledRCk6oIwVeBT-wvUzOEHDR1EDH2c"
$wfId = "PHAIZDUup4OkxfK2"
$base = "http://localhost:5678/api/v1"
$hdrs = @{ "X-N8N-API-KEY" = $apiKey; "Content-Type" = "application/json" }

Write-Host "[1/4] Buscando workflow..."
$wf = Invoke-RestMethod -Uri "$base/workflows/$wfId" -Headers $hdrs
Write-Host "     Nodes: $($wf.nodes.Count)"

Write-Host "[2/4] Localizando node_processar_resposta..."
$node6 = $wf.nodes | Where-Object { $_.id -eq "52e05034-3729-4fb7-9764-49be9f09d417" }
if (-not $node6) {
    Write-Host "ERRO: node nao encontrado. IDs disponiveis:"
    $wf.nodes | ForEach-Object { Write-Host "  $($_.id) -> $($_.name)" }
    exit 1
}
Write-Host "     OK: $($node6.name)"

$novoCode = 'const raw = $input.first().json;' + "`n" +
            'const payload = raw.body ?? raw;' + "`n" +
            '' + "`n" +
            '// Tenta extrair texto de qualquer estrutura de evento do Evolution' + "`n" +
            'function extrairTexto(d) {' + "`n" +
            '  if (!d) return "";' + "`n" +
            '  // messages.upsert: data.message.conversation' + "`n" +
            '  if (d.message && d.message.conversation) return d.message.conversation;' + "`n" +
            '  if (d.message && d.message.extendedTextMessage) return d.message.extendedTextMessage.text || "";' + "`n" +
            '  // messages.update: data pode ser array' + "`n" +
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

Write-Host "[3/4] Injetando codigo de debug..."
$node6.parameters.jsCode = $novoCode

Write-Host "[4/4] Enviando para n8n..."
# PUT aceita apenas: name, nodes, connections, settings, staticData
$payload = @{
    name        = $wf.name
    nodes       = $wf.nodes
    connections = $wf.connections
    settings    = @{ executionOrder = "v1" }
    staticData  = $null
}
$bodyJson = $payload | ConvertTo-Json -Depth 30 -Compress
$resp = Invoke-RestMethod -Uri "$base/workflows/$wfId" -Method PUT -Headers $hdrs -Body $bodyJson

Write-Host ""
Write-Host "=== SUCESSO ==="
Write-Host "Node 6 atualizado com codigo de debug."
Write-Host "Proximo passo: mande qualquer msg no WhatsApp, veja Executions, me manda o output do node 6."
