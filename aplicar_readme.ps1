# aplicar_readme.ps1 — escreve o README.md correto direto no disco
# Uso: rodar na raiz do projeto (Agent_Bastos/)
$ErrorActionPreference = "Stop"

$readme = @'
<div align="center">

# 🛡️ Agent Bastos

### Assistente de Inteligência com RAG, Transcrição Forense e Arquitetura Segura

*Sistema de apoio à análise de inteligência em segurança pública — construído com foco em segurança, rastreabilidade e conformidade com a LGPD.*

<br>

![Python](https://img.shields.io/badge/Python-3.14-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![ChromaDB](https://img.shields.io/badge/ChromaDB-FF6B6B?style=for-the-badge&logo=databricks&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-191970?style=for-the-badge&logo=electron&logoColor=white)

![JWT](https://img.shields.io/badge/Auth-JWT%20%2B%20RBAC-000000?style=flat-square)
![Encryption](https://img.shields.io/badge/Logs-Fernet%20AES--128-green?style=flat-square)
![LGPD](https://img.shields.io/badge/Compliance-LGPD-blue?style=flat-square)
![Status](https://img.shields.io/badge/Status-Auditado-success?style=flat-square)

</div>

---

## 📋 Sobre o Projeto

**Agent Bastos** é um assistente de inteligência projetado para apoiar analistas de segurança pública em tarefas como consulta a doutrinas, transcrição de áudios para relatórios e análise de informações operacionais.

O diferencial do projeto não está apenas nas funcionalidades de IA, mas na **engenharia por trás delas**: autenticação robusta, controle de acesso por módulo, criptografia de dados sensíveis, trilha de auditoria forense e conformidade com a LGPD — tudo validado por uma auditoria de segurança documentada ([`AUDIT.md`](./AUDIT.md)).

> ⚠️ **Nota sobre privacidade:** Este repositório é uma versão de demonstração. Nenhum dado operacional real, informação pessoal ou material sensível está incluído. A base de conhecimento usa apenas doutrinas públicas e dados fictícios para exemplos.

<div align="center">

![Painel principal do Agent Bastos](./docs/screenshots/painel.jpg)

</div>

---

## 🖥️ Interface

<div align="center">

| Chat com RAG | Dashboard Operacional |
|:---:|:---:|
| ![Chat RAG](./docs/screenshots/chat_rag.jpg) | ![Dashboard](./docs/screenshots/dashboard.jpg) |
| **Transcrição de Áudio** | **Alertas** |
| ![Transcrição](./docs/screenshots/transcricao.jpg) | ![Alertas](./docs/screenshots/alertas.jpg) |
| **Agenda** | **Notícias** |
| ![Agenda](./docs/screenshots/agenda.jpg) | ![Notícias](./docs/screenshots/noticias.jpg) |

</div>

---

## ✨ Funcionalidades

| Módulo | Descrição | Tecnologia-chave |
|---|---|---|
| 💬 **Chat com RAG** | Consulta semântica a doutrinas indexadas, com memória de conversa criptografada | ChromaDB + embeddings multilíngues |
| 🎙️ **Transcrição** | Converte áudios em texto e gera análise estruturada para relatórios | Whisper + LLM |
| ✍️ **Grafoscopia** | Análise de documentos manuscritos | Visão computacional + LLM |
| 📊 **Dashboard** | Painel operacional com métricas e visão consolidada | React + Recharts |
| 🕸️ **Análise de Grafos** | Mapeamento de relações entre entidades | SQLite + visualização |
| 👥 **Gestão de Usuários** | CRUD de usuários com controle de acesso por módulo | SQLite + JWT |

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Electron + React)             │
│              Interface desktop multiplataforma               │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS + JWT Bearer
┌───────────────────────────▼─────────────────────────────────┐
│                       API (FastAPI)                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Middlewares: SecurityHeaders · RateLimit · CORS     │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │  Auth: JWT (HS256) · bcrypt · Blacklist persistente  │    │
│  │  RBAC: controle de acesso por módulo (require_module)│    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│   14 routers organizados por domínio de responsabilidade     │
└──────┬───────────────┬──────────────┬───────────────────────┘
       │               │              │
┌──────▼──────┐ ┌──────▼──────┐ ┌─────▼──────────┐
│  ChromaDB   │ │   SQLite    │ │  Logs (Fernet) │
│ (vetorial)  │ │ (usuários + │ │  criptografados│
│ doutrinas   │ │  blacklist) │ │  + auditoria   │
└─────────────┘ └─────────────┘ └────────────────┘
```

### Decisões de arquitetura

- **Separação por camadas:** `routers/` cuidam apenas de HTTP; `services/` concentram a lógica de negócio; `modules/` encapsulam capacidades de IA. Zero lógica de negócio nos routers.
- **RAG vetorial:** a base doutrinária é dividida em *chunks*, transformada em embeddings e indexada no ChromaDB para busca semântica — não busca por palavra-chave.
- **Persistência consciente:** dados que precisam sobreviver a reinicializações (usuários, tokens revogados) vão para SQLite; o que é efêmero fica em memória.

---

## 🔐 Segurança & Conformidade

Segurança não foi um detalhe posterior — é o núcleo do projeto. Principais controles implementados:

### Autenticação e Autorização
- **JWT com rotação de tokens** — access token de curta duração (15 min) + refresh token, com rotação obrigatória a cada renovação para limitar a janela de ataque.
- **Blacklist persistente** — tokens revogados (logout) são armazenados como *hash* SHA-256 em SQLite, sobrevivendo a reinicializações do servidor. Mesmo que o banco vaze, os hashes são inúteis para autenticação.
- **RBAC por módulo** — cada rota sensível exige um módulo específico no token (`require_module`), aplicando o princípio do menor privilégio.
- **Senhas com bcrypt** (custo 12) — nunca armazenadas em texto plano.

### Proteção de Dados (LGPD)
- **Criptografia de logs** — conversas operacionais são criptografadas com Fernet (AES-128) antes de tocar o disco.
- **Trilha de auditoria forense** — operações sensíveis (incluindo a destruição de dados) geram registro imutável em texto puro, com timestamp UTC, operador, host e PID. Esse log sobrevive até mesmo ao comando de limpeza total.
- **Confirmação explícita para operações destrutivas** — destruição de dados exige confirmação consciente *case-sensitive*, evitando ativação acidental.
- **Rotação automática de logs** — previne crescimento indefinido de dados.

### Hardening contra ataques
- **Sanitização de entrada** — nomes de arquivos de upload são higienizados antes de qualquer uso, prevenindo *prompt injection*.
- **Rate limiting** — proteção contra força bruta nos endpoints de autenticação.
- **Fail-fast** — o sistema se recusa a iniciar se chaves críticas (JWT, criptografia) não estiverem configuradas, em vez de operar de forma insegura.

> 📑 O processo completo de auditoria — com 12 correções de segurança documentadas, análise de severidade e conformidade LGPD — está em **[`AUDIT.md`](./AUDIT.md)**.

---

## 🛠️ Stack Tecnológica

**Backend**
- Python 3.14 · FastAPI · Uvicorn
- ChromaDB (banco vetorial) · embeddings multilíngues
- SQLite (usuários, blacklist de tokens)
- JWT (python-jose) · bcrypt (passlib) · Fernet (cryptography)

**IA / ML**
- RAG (Retrieval-Augmented Generation) com busca semântica
- Transcrição de áudio (Whisper)
- Modelos de linguagem de grande porte via API

**Frontend**
- React · Vite · Electron (aplicação desktop)
- Recharts (visualização de dados)

**Automação & Infra**
- n8n (orquestração de fluxos)
- pytest (testes)

---

## 🚀 Como Executar

> **Pré-requisitos:** Python 3.12+, Node.js 18+, e uma chave de API de um provedor de LLM.

### 1. Backend

```bash
# Clone o repositório
git clone https://github.com/patrese-procopio/agent-bastos.git
cd agent-bastos

# Crie e ative o ambiente virtual
python -m venv .venv
source .venv/bin/activate        # Linux/Mac
# .venv\Scripts\Activate.ps1     # Windows PowerShell

# Instale as dependências
pip install -r requirements.txt

# Configure as variáveis de ambiente (veja .env.example)
cp .env.example .env
# Edite o .env com suas chaves

# Indexe a base de conhecimento
python -m modules.ingestor

# Inicie a API
python api.py
```

A API estará disponível em `http://127.0.0.1:8000`.
Documentação interativa (Swagger) em `http://127.0.0.1:8000/docs`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## ⚙️ Configuração

O sistema usa variáveis de ambiente para todas as configurações sensíveis. Um arquivo `.env.example` documenta as variáveis necessárias — **nunca** versione seu `.env` real.

As chaves críticas (autenticação e criptografia) seguem o princípio *fail-fast*: a aplicação não inicia sem elas, evitando operação em estado inseguro.

Para gerar uma senha de usuário com hash seguro:
```bash
python scripts/setar_senha.py <usuario>
```

---

## 📂 Estrutura do Projeto

```
agent-bastos/
├── api.py                 # Entry point — registra middlewares e routers
├── dependencies.py        # Dependências compartilhadas (auth, RBAC)
├── config/                # Configurações centralizadas
├── routers/               # Camada HTTP — 14 routers por domínio
├── services/              # Lógica de negócio (auth, rate limit, logging)
├── modules/               # Capacidades de IA (RAG, ingestão, transcrição)
├── frontend/              # Aplicação React + Electron
├── scripts/               # Utilitários (gestão de senhas, manutenção)
├── tests/                 # Testes automatizados (pytest)
├── automacao_n8n/         # Fluxos de automação
├── AUDIT.md               # Relatório de auditoria de segurança
└── requirements.txt
```

---

## 🗺️ Roadmap

- [x] Auditoria de segurança completa (12 correções documentadas)
- [x] Blacklist JWT persistente em SQLite
- [x] Gestão de usuários com RBAC via API
- [x] Rotação automática de logs criptografados
- [ ] Containerização (Docker)
- [ ] Busca híbrida no RAG (vetorial + keyword) com reranking
- [ ] CI/CD com GitHub Actions
- [ ] Cobertura de testes ampliada

---

## 👤 Autor

**Patrese Procópio**
Engenharia de Dados · Inteligência de Segurança · Soluções de IA Corporativa

[![GitHub](https://img.shields.io/badge/GitHub-100000?style=flat-square&logo=github&logoColor=white)](https://github.com/patrese-procopio)

---

## 📄 Licença

Este projeto é disponibilizado para fins de demonstração e portfólio. Consulte o autor para usos específicos.

<div align="center">

---

*Construído com atenção à segurança, à privacidade e à boa engenharia.*

</div>
'@

Set-Content -Path "README.md" -Value $readme -Encoding UTF8
Write-Host "[OK] README.md escrito com sucesso."
Write-Host "Verificando screenshots referenciados:"
Select-String -Path "README.md" -Pattern "painel.jpg|Dashboard Operacional|Transcricao de" | Select-Object LineNumber
