<div align="center">

# ðŸ›¡ï¸ Agent Bastos

### Assistente de InteligÃªncia com RAG, TranscriÃ§Ã£o Forense e Arquitetura Segura

*Sistema de apoio Ã  anÃ¡lise de inteligÃªncia em seguranÃ§a pÃºblica â€” construÃ­do com foco em seguranÃ§a, rastreabilidade e conformidade com a LGPD.*

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

## ðŸ“‹ Sobre o Projeto

**Agent Bastos** Ã© um assistente de inteligÃªncia projetado para apoiar analistas de seguranÃ§a pÃºblica em tarefas como consulta a doutrinas, transcriÃ§Ã£o de Ã¡udios para relatÃ³rios e anÃ¡lise de informaÃ§Ãµes operacionais.

O diferencial do projeto nÃ£o estÃ¡ apenas nas funcionalidades de IA, mas na **engenharia por trÃ¡s delas**: autenticaÃ§Ã£o robusta, controle de acesso por mÃ³dulo, criptografia de dados sensÃ­veis, trilha de auditoria forense e conformidade com a LGPD â€” tudo validado por uma auditoria de seguranÃ§a documentada ([`AUDIT.md`](./AUDIT.md)).

> âš ï¸ **Nota sobre privacidade:** Este repositÃ³rio Ã© uma versÃ£o de demonstraÃ§Ã£o. Nenhum dado operacional real, informaÃ§Ã£o pessoal ou material sensÃ­vel estÃ¡ incluÃ­do. A base de conhecimento usa apenas doutrinas pÃºblicas e dados fictÃ­cios para exemplos.

<div align="center">

![Painel principal do Agent Bastos](./docs/screenshots/painel.jpg)

</div>

---

## ðŸ–¥ï¸ Interface

<div align="center">

| Chat com RAG | Dashboard Operacional |
|:---:|:---:|
| ![Chat RAG](./docs/screenshots/chat_rag.jpg) | ![Dashboard](./docs/screenshots/dashboard.jpg) |
| **TranscriÃ§Ã£o de Ãudio** | **Alertas** |
| ![TranscriÃ§Ã£o](./docs/screenshots/transcricao.jpg) | ![Alertas](./docs/screenshots/alertas.jpg) |
| **Agenda** | **NotÃ­cias** |
| ![Agenda](./docs/screenshots/agenda.jpg) | ![NotÃ­cias](./docs/screenshots/noticias.jpg) |

</div>

---

## âœ¨ Funcionalidades

| MÃ³dulo | DescriÃ§Ã£o | Tecnologia-chave |
|---|---|---|
| ðŸ’¬ **Chat com RAG** | Consulta semÃ¢ntica a doutrinas indexadas, com memÃ³ria de conversa criptografada | ChromaDB + embeddings multilÃ­ngues |
| ðŸŽ™ï¸ **TranscriÃ§Ã£o** | Converte Ã¡udios em texto e gera anÃ¡lise estruturada para relatÃ³rios | Whisper + LLM |
| âœï¸ **Grafoscopia** | AnÃ¡lise de documentos manuscritos | VisÃ£o computacional + LLM |
| ðŸ“Š **Dashboard** | Painel operacional com mÃ©tricas e visÃ£o consolidada | React + Recharts |
| ðŸ•¸ï¸ **AnÃ¡lise de Grafos** | Mapeamento de relaÃ§Ãµes entre entidades | SQLite + visualizaÃ§Ã£o |
| ðŸ‘¥ **GestÃ£o de UsuÃ¡rios** | CRUD de usuÃ¡rios com controle de acesso por mÃ³dulo | SQLite + JWT |

---

## ðŸ—ï¸ Arquitetura

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                      Frontend (Electron + React)             â”‚
â”‚              Interface desktop multiplataforma               â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                            â”‚ HTTPS + JWT Bearer
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                       API (FastAPI)                          â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚
â”‚  â”‚  Middlewares: SecurityHeaders Â· RateLimit Â· CORS     â”‚    â”‚
â”‚  â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤    â”‚
â”‚  â”‚  Auth: JWT (HS256) Â· bcrypt Â· Blacklist persistente  â”‚    â”‚
â”‚  â”‚  RBAC: controle de acesso por mÃ³dulo (require_module)â”‚    â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â”‚
â”‚                                                              â”‚
â”‚   14 routers organizados por domÃ­nio de responsabilidade     â”‚
â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
       â”‚               â”‚              â”‚
â”Œâ”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  ChromaDB   â”‚ â”‚   SQLite    â”‚ â”‚  Logs (Fernet) â”‚
â”‚ (vetorial)  â”‚ â”‚ (usuÃ¡rios + â”‚ â”‚  criptografadosâ”‚
â”‚ doutrinas   â”‚ â”‚  blacklist) â”‚ â”‚  + auditoria   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### DecisÃµes de arquitetura

- **SeparaÃ§Ã£o por camadas:** `routers/` cuidam apenas de HTTP; `services/` concentram a lÃ³gica de negÃ³cio; `modules/` encapsulam capacidades de IA. Zero lÃ³gica de negÃ³cio nos routers.
- **RAG vetorial:** a base doutrinÃ¡ria Ã© dividida em *chunks*, transformada em embeddings e indexada no ChromaDB para busca semÃ¢ntica â€” nÃ£o busca por palavra-chave.
- **PersistÃªncia consciente:** dados que precisam sobreviver a reinicializaÃ§Ãµes (usuÃ¡rios, tokens revogados) vÃ£o para SQLite; o que Ã© efÃªmero fica em memÃ³ria.

---

## ðŸ” SeguranÃ§a & Conformidade

SeguranÃ§a nÃ£o foi um detalhe posterior â€” Ã© o nÃºcleo do projeto. Principais controles implementados:

### AutenticaÃ§Ã£o e AutorizaÃ§Ã£o
- **JWT com rotaÃ§Ã£o de tokens** â€” access token de curta duraÃ§Ã£o (15 min) + refresh token, com rotaÃ§Ã£o obrigatÃ³ria a cada renovaÃ§Ã£o para limitar a janela de ataque.
- **Blacklist persistente** â€” tokens revogados (logout) sÃ£o armazenados como *hash* SHA-256 em SQLite, sobrevivendo a reinicializaÃ§Ãµes do servidor. Mesmo que o banco vaze, os hashes sÃ£o inÃºteis para autenticaÃ§Ã£o.
- **RBAC por mÃ³dulo** â€” cada rota sensÃ­vel exige um mÃ³dulo especÃ­fico no token (`require_module`), aplicando o princÃ­pio do menor privilÃ©gio.
- **Senhas com bcrypt** (custo 12) â€” nunca armazenadas em texto plano.

### ProteÃ§Ã£o de Dados (LGPD)
- **Criptografia de logs** â€” conversas operacionais sÃ£o criptografadas com Fernet (AES-128) antes de tocar o disco.
- **Trilha de auditoria forense** â€” operaÃ§Ãµes sensÃ­veis (incluindo a destruiÃ§Ã£o de dados) geram registro imutÃ¡vel em texto puro, com timestamp UTC, operador, host e PID. Esse log sobrevive atÃ© mesmo ao comando de limpeza total.
- **ConfirmaÃ§Ã£o explÃ­cita para operaÃ§Ãµes destrutivas** â€” destruiÃ§Ã£o de dados exige confirmaÃ§Ã£o consciente *case-sensitive*, evitando ativaÃ§Ã£o acidental.
- **RotaÃ§Ã£o automÃ¡tica de logs** â€” previne crescimento indefinido de dados.

### Hardening contra ataques
- **SanitizaÃ§Ã£o de entrada** â€” nomes de arquivos de upload sÃ£o higienizados antes de qualquer uso, prevenindo *prompt injection*.
- **Rate limiting** â€” proteÃ§Ã£o contra forÃ§a bruta nos endpoints de autenticaÃ§Ã£o.
- **Fail-fast** â€” o sistema se recusa a iniciar se chaves crÃ­ticas (JWT, criptografia) nÃ£o estiverem configuradas, em vez de operar de forma insegura.

> ðŸ“‘ O processo completo de auditoria â€” com 12 correÃ§Ãµes de seguranÃ§a documentadas, anÃ¡lise de severidade e conformidade LGPD â€” estÃ¡ em **[`AUDIT.md`](./AUDIT.md)**.

---

## ðŸ› ï¸ Stack TecnolÃ³gica

**Backend**
- Python 3.14 Â· FastAPI Â· Uvicorn
- ChromaDB (banco vetorial) Â· embeddings multilÃ­ngues
- SQLite (usuÃ¡rios, blacklist de tokens)
- JWT (python-jose) Â· bcrypt (passlib) Â· Fernet (cryptography)

**IA / ML**
- RAG (Retrieval-Augmented Generation) com busca semÃ¢ntica
- TranscriÃ§Ã£o de Ã¡udio (Whisper)
- Modelos de linguagem de grande porte via API

**Frontend**
- React Â· Vite Â· Electron (aplicaÃ§Ã£o desktop)
- Recharts (visualizaÃ§Ã£o de dados)

**AutomaÃ§Ã£o & Infra**
- n8n (orquestraÃ§Ã£o de fluxos)
- pytest (testes)

---

## ðŸš€ Como Executar

> **PrÃ©-requisitos:** Python 3.12+, Node.js 18+, e uma chave de API de um provedor de LLM.

### 1. Backend

```bash
# Clone o repositÃ³rio
git clone https://github.com/patrese-procopio/agent-bastos.git
cd agent-bastos

# Crie e ative o ambiente virtual
python -m venv .venv
source .venv/bin/activate        # Linux/Mac
# .venv\Scripts\Activate.ps1     # Windows PowerShell

# Instale as dependÃªncias
pip install -r requirements.txt

# Configure as variÃ¡veis de ambiente (veja .env.example)
cp .env.example .env
# Edite o .env com suas chaves

# Indexe a base de conhecimento
python -m modules.ingestor

# Inicie a API
python api.py
```

A API estarÃ¡ disponÃ­vel em `http://127.0.0.1:8000`.
DocumentaÃ§Ã£o interativa (Swagger) em `http://127.0.0.1:8000/docs`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## âš™ï¸ ConfiguraÃ§Ã£o

O sistema usa variÃ¡veis de ambiente para todas as configuraÃ§Ãµes sensÃ­veis. Um arquivo `.env.example` documenta as variÃ¡veis necessÃ¡rias â€” **nunca** versione seu `.env` real.

As chaves crÃ­ticas (autenticaÃ§Ã£o e criptografia) seguem o princÃ­pio *fail-fast*: a aplicaÃ§Ã£o nÃ£o inicia sem elas, evitando operaÃ§Ã£o em estado inseguro.

Para gerar uma senha de usuÃ¡rio com hash seguro:
```bash
python scripts/setar_senha.py <usuario>
```

---

## ðŸ“‚ Estrutura do Projeto

```
agent-bastos/
â”œâ”€â”€ api.py                 # Entry point â€” registra middlewares e routers
â”œâ”€â”€ dependencies.py        # DependÃªncias compartilhadas (auth, RBAC)
â”œâ”€â”€ config/                # ConfiguraÃ§Ãµes centralizadas
â”œâ”€â”€ routers/               # Camada HTTP â€” 14 routers por domÃ­nio
â”œâ”€â”€ services/              # LÃ³gica de negÃ³cio (auth, rate limit, logging)
â”œâ”€â”€ modules/               # Capacidades de IA (RAG, ingestÃ£o, transcriÃ§Ã£o)
â”œâ”€â”€ frontend/              # AplicaÃ§Ã£o React + Electron
â”œâ”€â”€ scripts/               # UtilitÃ¡rios (gestÃ£o de senhas, manutenÃ§Ã£o)
â”œâ”€â”€ tests/                 # Testes automatizados (pytest)
â”œâ”€â”€ automacao_n8n/         # Fluxos de automaÃ§Ã£o
â”œâ”€â”€ AUDIT.md               # RelatÃ³rio de auditoria de seguranÃ§a
â””â”€â”€ requirements.txt
```

---

## ðŸ—ºï¸ Roadmap

- [x] Auditoria de seguranÃ§a completa (12 correÃ§Ãµes documentadas)
- [x] Blacklist JWT persistente em SQLite
- [x] GestÃ£o de usuÃ¡rios com RBAC via API
- [x] RotaÃ§Ã£o automÃ¡tica de logs criptografados
- [ ] ContainerizaÃ§Ã£o (Docker)
- [ ] Busca hÃ­brida no RAG (vetorial + keyword) com reranking
- [ ] CI/CD com GitHub Actions
- [ ] Cobertura de testes ampliada

---

## ðŸ‘¤ Autor

**Patrese ProcÃ³pio**
Engenharia de Dados Â· InteligÃªncia de SeguranÃ§a Â· SoluÃ§Ãµes de IA Corporativa

[![GitHub](https://img.shields.io/badge/GitHub-100000?style=flat-square&logo=github&logoColor=white)](https://github.com/patrese-procopio)

---

## ðŸ“„ LicenÃ§a

Este projeto Ã© disponibilizado para fins de demonstraÃ§Ã£o e portfÃ³lio. Consulte o autor para usos especÃ­ficos.

<div align="center">

---

*ConstruÃ­do com atenÃ§Ã£o Ã  seguranÃ§a, Ã  privacidade e Ã  boa engenharia.*

</div>
