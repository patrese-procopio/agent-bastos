# Human-in-the-Loop — Guia de Setup Completo

Sistema de aprovação humana via WhatsApp para eventos de risco alto.

---

## Como funciona (fluxo completo)

```
Transcrição RISCO ALTO
    │
    ▼
Backend cria AprovacaoPendente (SQLite)
    │
    ▼
POST → n8n webhook (hitl-bastos)
    │
    ▼
n8n → Evolution API → WhatsApp do Chefe
    │
    [Chefe clica ✅ CONFIRMAR ou ❌ REJEITAR]
    │
    ▼
Evolution API → n8n webhook (hitl-resposta-bastos)
    │
    ▼
n8n → POST /api/human-loop/responder/{id}
    │
    ▼
Backend atualiza registro + auditoria
```

---

## Passo 1 — Subir a Evolution API

```powershell
# Na pasta Agent_Bastos
docker compose up -d evolution

# Verificar se subiu
docker logs evolution-api --tail 20
```

---

## Passo 2 — Criar instância e conectar WhatsApp

1. Acesse **http://localhost:8080**
2. Clique em **"New Instance"**
3. Nome da instância: `bastos` (ou o que você escolher)
4. Clique em **"Connect"** → aparece o QR Code
5. Abra o WhatsApp no celular operacional → **Aparelhos conectados** → **Conectar aparelho**
6. Escaneie o QR Code
7. Status muda para **"open"** ✅

---

## Passo 3 — Configurar variáveis no .env

```env
# Copie para o .env real e preencha
N8N_WEBHOOK_HITL=http://localhost:5678/webhook/hitl-bastos
HITL_CALLBACK_KEY=gere_com_python_secrets_token_hex_24
BASTOS_CALLBACK_URL=http://127.0.0.1:8000
HITL_TIMEOUT_MINUTOS=60
EVOLUTION_API_KEY=bastos_evo_key_troque_aqui
```

---

## Passo 4 — Importar workflow no n8n

1. Abra o n8n (**http://localhost:5678**)
2. Menu → **Workflows** → **Import from file**
3. Selecione `automacao_n8n/human_loop_whatsapp.json`
4. Configure as **Environment Variables** do n8n:

| Variável | Valor |
|---|---|
| `EVOLUTION_API_URL` | `http://localhost:8080` |
| `EVOLUTION_INSTANCE` | `bastos` (nome da instância criada) |
| `EVOLUTION_API_KEY` | mesma do .env |
| `WA_NUMERO_CHEFE` | número do chefe no formato `559299999999` |
| `BASTOS_API_URL` | `http://localhost:8000` |
| `HITL_CALLBACK_KEY` | mesma do .env |

5. Ative o workflow (toggle no canto superior direito)
6. Copie a **URL do webhook** do nó "1. Recebe Evento do Backend" e cole em `N8N_WEBHOOK_HITL` no `.env`

---

## Passo 5 — Configurar webhook de resposta no Evolution API

O Evolution precisa saber para onde mandar as respostas do WhatsApp.

Via API (use o Postman ou curl):

```bash
curl -X POST http://localhost:8080/webhook/set/bastos \
  -H "apikey: bastos_evo_key_troque_aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://host.docker.internal:5678/webhook/hitl-resposta-bastos",
    "webhook_by_events": false,
    "webhook_base64": false,
    "events": ["MESSAGES_UPSERT"]
  }'
```

> **Nota:** `host.docker.internal` aponta para o host (sua máquina) de dentro do container Docker. No Linux, pode ser necessário usar o IP da bridge (`172.17.0.1`).

---

## Passo 6 — Testar

Reinicie o backend:
```powershell
docker restart agent-bastos-api
# ou
python api.py
```

Faça uma transcrição de áudio pelo Agent Bastos com conteúdo que gere risco ALTO (mencione termos como "trafico", "arma", "facção"). Em segundos, o Chefe recebe no WhatsApp:

```
🔴 AGENT BASTOS — ALERTA ALTO

📋 Tipo: TRANSCRICAO RISCO ALTO
👤 Operador: admin
🕐 Horário: 08/06/2026 14:32

📝 Descrição:
Transcrição: audio_operacional.wav — Dois interlocutores discutem...

🔑 ID da Aprovação:
`a1b2c3d4-...`

━━━━━━━━━━━━━━━━━━━━
Responda com:
✅ CONFIRMAR — para aprovar
❌ REJEITAR — para reprovar

_Esta aprovação expira em 60 minutos._
```

---

## Verificar aprovações pendentes (API)

```bash
# Listar todas as aprovações
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/human-loop/listar

# Expirar manualmente as antigas
curl -X POST -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/human-loop/expirar
```

---

## Troubleshooting

**Mensagem não chegou no WhatsApp:**
- Verifique se o Evolution API está "open": `http://localhost:8080`
- Verifique `N8N_WEBHOOK_HITL` no `.env`
- Consulte logs do n8n → execução do workflow
- Consulte `data/logs/bastos.log` para erros de notificação

**n8n não consegue chamar o backend:**
- O n8n roda em Docker mas o backend pode rodar no host
- Use `http://host.docker.internal:8000` em vez de `localhost:8000` nas variáveis do n8n

**Botões não aparecem no WhatsApp:**
- A Evolution API v2 exige que o número tenha WhatsApp Business ou seja uma conta comum verificada
- Como fallback, o usuário pode digitar `CONFIRMAR UUID` ou `REJEITAR UUID` manualmente

---

*Documentação gerada automaticamente — Agent Bastos v1.0*
