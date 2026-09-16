# 🛡️ Agent Bastos — Guia de Deploy na Agência

Guia passo-a-passo para colocar o Agent Bastos rodando em produção em uma agência de inteligência: **1 servidor central Docker + N clientes Electron**.

> **Perfil deste guia:** operador de TI/DevOps da agência. Pressupõe acesso administrativo ao servidor e conhecimento básico de Docker, DNS e Windows.

---

## 📋 Pré-requisitos

### Servidor (1 máquina)
- **Windows Server 2019+ ou Linux (Ubuntu 22.04+)** — CPU 4 cores, 16 GB RAM, 100 GB SSD.
- **Docker Desktop (Windows) ou Docker Engine + Compose (Linux)** — versão 24+.
- **IP fixo na rede da agência** ou DNS interno apontando pro hostname escolhido.
- **Portas 80 e 443 liberadas** no firewall (para HTTPS via Caddy).
- **Acesso à internet** para pull das imagens Docker e chamadas às APIs (Groq/Claude/Firebase).

### Clientes (agentes)
- **Windows 10/11** — 4 GB RAM, 500 MB disco.
- **Rede que enxerga o IP do servidor** (VPN, LAN corporativa).
- Nenhuma instalação de Python/Node/nada — só o instalador `.exe` do Agent Bastos.

### Contas externas (opcionais mas recomendadas)
- **Groq API** — Chat RAG e análise de alertas em nuvem (barato).
- **Anthropic (Claude)** — extração de extratos de campo (alta qualidade).
- **Firebase Service Account** — sincronização de alertas/agenda entre clientes.

---

## 🏗️ Etapa 1 — Preparar o servidor

### 1.1 Instalar Docker
- **Windows Server:** baixe Docker Desktop de https://docker.com/products/docker-desktop e habilite WSL2.
- **Linux:** `curl -fsSL https://get.docker.com | sh` e depois `usermod -aG docker $USER`.

Confirme: `docker --version` e `docker compose version`.

### 1.2 Clonar o repositório
```bash
git clone https://github.com/patrese-procopio/agent-bastos.git C:\Agent_Bastos
cd C:\Agent_Bastos
```

### 1.3 Configurar variáveis de ambiente
```bash
cp .env.example .env
```

Edite `.env` e preencha:

| Variável | Valor recomendado | Observação |
|---|---|---|
| `GROQ_API_KEY` | (sua chave) | Chat RAG, análise de alertas |
| `ANTHROPIC_API_KEY` | (sua chave) | Extração de extratos (opcional) |
| `JWT_SECRET_KEY` | Gere com `python -c "import secrets; print(secrets.token_hex(48))"` | **NUNCA** use o placeholder |
| `FERNET_KEY` | Gere com `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` | Cifra logs de auditoria (LGPD) |
| `N8N_ENCRYPTION_KEY` | Gere com `openssl rand -hex 24` | Cifra credenciais do n8n |
| `HITL_CALLBACK_KEY` | Gere com `python -c "import secrets; print(secrets.token_hex(24))"` | Callback do n8n → API |
| **`BASTOS_BIND_ADDR`** | `127.0.0.1` | **Mantenha loopback** — Caddy expõe pra fora |
| **`BASTOS_PUBLIC_HOST`** | `bastos.suaagencia.gov.br` | Hostname público que os agentes vão usar |
| **`BASTOS_CADDY_EMAIL`** | `infra@suaagencia.gov.br` | Para renovação Let's Encrypt |
| **`BASTOS_CORS_ORIGINS`** | `https://bastos.suaagencia.gov.br` | Deve bater com `BASTOS_PUBLIC_HOST` |

### 1.4 Setar senhas de admin e analista
```bash
.venv\Scripts\python.exe scripts\setar_senha.py admin
.venv\Scripts\python.exe scripts\setar_senha.py analista
```
Cada comando pede a senha via prompt (não ecoa). Mínimo 12 caracteres com 3 classes.

> 💡 Se ainda não tem `.venv`: `python -m venv .venv && .venv\Scripts\pip install -r requirements.txt`. Só é necessário para rodar o script de senha — o backend em produção roda dentro do container.

### 1.5 Popular a base de conhecimento (RAG)
Copie doutrinas, manuais e material técnico para `data/doutrina/` (PDFs, DOCX, TXT). O indexer rodará no primeiro `docker compose up` ou você pode rodar manual depois:

```bash
docker compose exec api python -m drive_indexer.indexer
```

---

## 🚀 Etapa 2 — Subir o stack com HTTPS

### 2.1 Configurar DNS
Aponte `bastos.suaagencia.gov.br` (ou o hostname que escolheu) para o IP público/interno do servidor. Se for domínio público, o Caddy pega Let's Encrypt automaticamente. Se for IP puro ou hostname interno, o Caddy gera certificado self-signed.

### 2.2 Subir tudo
```bash
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d
```

Isso sobe:
- `agent-bastos-api` — FastAPI + RAG + ChromaDB (interno)
- `agent-bastos-n8n` — automação HITL (interno)
- `agent-bastos-evolution` — WhatsApp (interno)
- `agent-bastos-caddy` — reverse proxy HTTPS (:80, :443)

Verifique:
```bash
docker compose ps
curl https://bastos.suaagencia.gov.br/health
# Esperado: {"status":"ok"}
```

Logs em tempo real:
```bash
docker compose logs -f
```

### 2.3 Verificar segurança
- `curl -I https://bastos.suaagencia.gov.br/health` deve mostrar `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`.
- `curl http://bastos.suaagencia.gov.br/health` deve fazer **redirect 301 para HTTPS**.
- Do próprio servidor: `curl https://localhost/health` funciona (Caddy aceita loopback).

---

## 👥 Etapa 3 — Criar contas dos agentes

Login inicial: `admin` + a senha que você definiu na etapa 1.4.

1. Instale o Electron na sua máquina de operador (ou acesse via `https://bastos.suaagencia.gov.br` num Chromium com CSP relaxado — não recomendado).
2. Vá em **Configurações → Usuários**.
3. Para cada agente, crie usuário com:
   - **Nome de usuário** — padrão `nome.sobrenome`
   - **Nível** — `analista` (default) ou `admin` (só coordenadores/TI)
   - **Módulos habilitados** — marque só o que o agente precisa (LGPD: princípio da necessidade)
   - **Senha inicial** — pelo menos 12 chars, forçar troca no 1º login

Distribua as credenciais individualmente por canal seguro (não e-mail em massa).

---

## 💻 Etapa 4 — Distribuir o cliente Electron

### 4.1 Baixar instalador
- `agent-bastos-app/dist-installer/Agent Bastos Setup 1.2.0.exe` (~91 MB)
- Assine digitalmente antes de distribuir (Authenticode) se sua agência exigir.

### 4.2 Configurar cada máquina
Ao instalar e abrir pela primeira vez, o app mostra a tela **"CONFIGURACAO INICIAL"** pedindo a URL do backend. O agente informa:

```
https://bastos.suaagencia.gov.br
```

Clica em **"Testar conexão"** — deve mostrar `✓ Backend respondeu (ok)`. Depois **"Salvar e conectar"**. O app reinicia automaticamente e vai pra tela de login.

**Alternativa MDM/GPO:** defina a env var `AGENT_BASTOS_BACKEND_URL=https://bastos.suaagencia.gov.br` na máquina antes de abrir o app. O SetupInicial não aparece — vai direto pra login.

### 4.3 Login e primeiro uso
O agente entra com credenciais e é forçado a trocar a senha. A partir daí, uso normal.

---

## 🔄 Etapa 5 — Operação e manutenção

### Backup diário dos volumes
Criar tarefa agendada no servidor (Task Scheduler ou cron):

```bash
docker run --rm -v bastos_chroma:/data -v C:\backup:/out alpine tar czf /out/chroma_$(date +%Y%m%d).tar.gz /data
docker run --rm -v bastos_db:/data -v C:\backup:/out alpine tar czf /out/db_$(date +%Y%m%d).tar.gz /data
docker run --rm -v bastos_logs:/data -v C:\backup:/out alpine tar czf /out/logs_$(date +%Y%m%d).tar.gz /data
```

**Retenção sugerida:** diário 30 dias, semanal 6 meses, mensal 5 anos (LGPD Art. 37).

### Atualização de versão
```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.caddy.yml build api
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d api
```

### Monitorar logs
- Auditoria de acesso: `docker compose exec api tail -f logs/bastos.audit.log`
- Segurança (401/403): `docker compose exec api tail -f logs/bastos.log | grep security`
- Acesso HTTP: `docker compose exec api tail -f logs/bastos.access`

### Rate limits ativos (por IP)
- `/auth/login`: 5/min (anti-brute)
- `/alertas/varrer`: 20/h
- `/chat`: 60/h por IP
- Ver todos: `services/rate_limit_service.py`

### Rotação de segredos
- **JWT_SECRET_KEY** — trocar a cada 90 dias derruba todas as sessões ativas (agentes reautenticam)
- **Senhas** — política de 90 dias no admin, forçado via `GerenciarUsuarios`

---

## 🆘 Troubleshooting

### "Não conecta ao servidor"
1. No servidor: `docker compose ps` — todos os serviços em `Up (healthy)`?
2. `curl https://bastos.suaagencia.gov.br/health` do servidor → ok?
3. Do cliente: `curl https://bastos.suaagencia.gov.br/health` — se falhar aqui, é firewall/DNS.
4. Certificado inválido? Cliente Electron: **Configurações → URL do Backend → Testar conexão** mostra a mensagem exata.

### "Certificado inválido / self-signed rejeitado"
- Se você está usando IP puro ou hostname interno, o Caddy gerou self-signed. Distribua o CA do Caddy pros clientes:
  ```bash
  docker compose exec caddy cat /data/caddy/pki/authorities/local/root.crt > caddy_root.crt
  ```
  Importe `caddy_root.crt` no Windows: `Painel de Controle → Gerenciar Certificados de Usuário → Autoridades de Certificação Raiz Confiáveis`.

### "Container `agent-bastos-api` fica reiniciando"
- `docker logs agent-bastos-api --tail 100`
- Causas comuns: `.env` sem `JWT_SECRET_KEY`, `FERNET_KEY` inválida (precisa ser 32 bytes base64), `credentials.json` do Firebase faltando.

### "Rate limit 429 no login"
- Alguém fez 5+ tentativas erradas em 1 minuto pelo mesmo IP. Espera 60s ou reinicia o container: `docker restart agent-bastos-api` (zera o contador in-memory).

### "n8n não sobe automações"
- Confirme `N8N_ENCRYPTION_KEY` no `.env`.
- Volumes n8n em `C:\Users\Administrador\.n8n` (Windows) devem estar acessíveis.
- Workflows precisam ser importados na primeira subida via UI (`https://bastos.suaagencia.gov.br:5678` — abrir a porta se for admin).

---

## 📚 Referências

- Arquitetura: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Auditoria de segurança: [`AUDIT.md`](./AUDIT.md)
- Missões concluídas: [`PROXIMAS_MISSOES.md`](./PROXIMAS_MISSOES.md)
- Docker Compose: [`docker-compose.yml`](./docker-compose.yml) + [`docker-compose.caddy.yml`](./docker-compose.caddy.yml)
- CI/CD: [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)

---

## 🔒 Checklist LGPD

Antes de colocar em produção com dados reais:

- [ ] JWT_SECRET_KEY única (não é o placeholder)
- [ ] FERNET_KEY única (cifra logs de auditoria)
- [ ] HTTPS obrigatório (Caddy configurado, redirect 80→443 funcionando)
- [ ] `BASTOS_BIND_ADDR=127.0.0.1` (API não exposta direto na LAN)
- [ ] Backup diário rodando e testado (restore validado)
- [ ] Cada agente tem usuário próprio (sem contas compartilhadas)
- [ ] Módulos por perfil (analistas não têm acesso admin)
- [ ] Rate limit ativo (verificar `/auth/login` bloqueia após 5)
- [ ] Trilha de auditoria (`bastos.audit.log`) escrevendo e sob backup
- [ ] Política de retenção documentada e implementada
- [ ] DPO identificado e canal LGPD publicado

---

*Atualizado em 2026-09-16 — release inicial do modo deploy centralizado (backend URL configurável, docker-compose flexível, reverse proxy Caddy).*
