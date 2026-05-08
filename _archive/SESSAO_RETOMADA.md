# BRIEFING — Agent Bastos | Retomada de Sessão 2

## Status: 🟡 PENDENTE — Notícias com imagens reais

---

## O que foi feito nesta sessão

### ✅ Concluído
- `api.py` — rotas da agenda (`/agenda/login`, `/agenda/publicar`, `/agenda/missoes`)
- `api.py` — endpoints de alertas (6 rotas: listar, marcar lido, varrer)
- `api.py` — endpoint `/transcribe` (Whisper + laudo forense via LLM)
- `api.py` — endpoints `/status` e `/status/firebase`
- `Agenda.jsx` — separado do `Configuracoes.jsx` como tela independente
- `Configuracoes.jsx` — abas Geral + Conexões (sem agenda)
- `App.jsx` — rotas corrigidas, `Agenda de Missão` → `Agenda.jsx`
- `Noticias.jsx` — imagens, link FONTE, hover, layout melhorado
- n8n workflow — Schedule Trigger 08h e 20h, nó `Read/Write` desconectado
- n8n `Code in JavaScript2` — extrai `media:content` (imagem real do G1)

### ⏳ Pendente — Imagens reais nas notícias

**Problema:** O `noticias` (array com imagens) existe no **Code in JavaScript2** do fluxo superior (Claude API), mas não chega no **Code in JavaScript1** do fluxo inferior (backend).

`$('Code in JavaScript2').first().json.noticias` retorna `undefined` porque os dois são fluxos separados.

**Solução: usar nó Merge no n8n**

Arquitetura correta:
```
Schedule Trigger → HTTP Request (RSS) → XML → Code in JavaScript2 ──┐
                                                                      ├→ Merge → Code in JavaScript1 → HTTP Request1 (backend)
                                              HTTP Request3 (Claude) ─┘
```

O nó **Merge** junta:
- Input 1: output do **Code in JavaScript2** (tem o campo `noticias` com imagens)
- Input 2: output do **HTTP Request3** (tem `content[0].text` do Claude)

**Code in JavaScript1 após o Merge:**
```javascript
// Com Merge, $input tem dois items
const claudeResposta = $input.all().find(i => i.json.content);
const noticiasItem   = $input.all().find(i => i.json.noticias);

const texto   = claudeResposta?.json.content[0].text || '';
const noticias = noticiasItem?.json.noticias || [];
const data    = new Date().toISOString().slice(0, 10);

return [{ json: { noticias, texto, data } }];
```

**HTTP Request1 — body:**
```
{{ JSON.stringify($json) }}
```

---

## Arquitetura atual dos workflows no n8n

### Fluxo inferior (original — FUNCIONANDO)
```
Schedule Trigger → HTTP Request (RSS G1) → XML → Code in JavaScript → HTTP Request1 (backend /noticias/salvar)
```
- Salva notícias SEM imagens (campo imagem vazio)

### Fluxo superior (novo — COM IMAGENS)
```
Schedule Trigger1 → HTTP Request2 (RSS) → XML1 → Code in JavaScript2 → HTTP Request3 (Claude API) → Code in JavaScript1 → Read/Write (desconectado)
```
- Tem imagens mas não salva no backend

**Objetivo:** unificar os dois fluxos usando Merge.

---

## Contexto do Projeto

- **Stack frontend:** React + Vite + Electron (`C:\Users\Administrador\agent-bastos-app`)
- **Stack backend:** Python + FastAPI + Groq + Firebase (`C:\Users\Administrador\Agent_Bastos`)
- **n8n:** `npx n8n` → `localhost:5678`
- **Frontend:** `cd agent-bastos-app && npm run dev` → `localhost:5174`
- **Backend:** `.venv\Scripts\activate && python api.py` → `localhost:8000`

## Como retomar

Cole este briefing e diga:
> "Retomando Agent Bastos — resolver imagens reais nas notícias via Merge no n8n"
