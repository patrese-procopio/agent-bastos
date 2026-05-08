# 🦉 Agent Bastos
### Assistente de Inteligência Corporativa com IA

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat&logo=react&logoColor=black)
![LLaMA](https://img.shields.io/badge/LLaMA_3.3_70B-Groq-F55036?style=flat)
![Claude](https://img.shields.io/badge/Claude_Vision-Anthropic-191919?style=flat)
![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFCA28?style=flat&logo=firebase&logoColor=black)
![n8n](https://img.shields.io/badge/Automação-n8n-EA4B71?style=flat&logo=n8n&logoColor=white)
![Status](https://img.shields.io/badge/Status-Em_desenvolvimento-yellow?style=flat)

---

## Sobre o Projeto

O **Agent Bastos** é um assistente de inteligência corporativa desenvolvido para modernizar a produção analítica de equipes de segurança e inteligência. Nasceu de uma dor real: analistas perdiam horas consultando doutrinas em documentos dispersos, transcrevendo entrevistas manualmente e buscando referências em acervos desorganizados.

A solução combina **RAG doutrinário**, **transcrição de áudio**, **análise de documentos manuscritos**, **monitor OSINT em tempo real** e **agenda operacional** numa única interface integrada — construída para ser implantada em qualquer organização que trabalhe com produção de conhecimento e gestão de inteligência.

> Projeto desenvolvido como portfólio de especialização em **IA aplicada à inteligência corporativa**, unindo experiência operacional real em análise de inteligência com Engenharia de Dados e soluções de IA.

---

## Screenshots

> 📸 *Em breve — interface em produção local. Prints serão adicionados na pasta `docs/screenshots/`.*

---

## Funcionalidades

### 🔍 Consulta Doutrinária com RAG
Consulta semântica sobre bases de conhecimento e doutrinas corporativas indexadas no ChromaDB. O agente localiza trechos relevantes com scores de relevância e responde fundamentado no conteúdo — sem alucinar, sempre referenciando a origem.

### 📎 Análise de Documentos Manuscritos
Upload de imagens de documentos, bilhetes e registros físicos. O Claude Vision transcreve o conteúdo e o agente gera automaticamente um **Relatório de Inteligência** formal com seções: Assunto, Dados, Análise e Observações.

### 🎙️ Gravação e Transcrição de Entrevistas
Gravação de áudio diretamente pela interface. O arquivo `.wav` é salvo em `data/audios/` e integrado ao pipeline de transcrição via **n8n + Whisper**.

### 📊 Dashboard de Produção
Painel de acompanhamento da produção analítica por setor. Indicadores visuais de desempenho por período e por analista — útil para gestão de equipes de inteligência.

### 📋 Agenda Operacional com Firebase
Sistema de lançamento e visualização de ordens e tarefas em tempo real via Firestore. Acesso hierárquico: gestores lançam tarefas (autenticados por senha hash SHA-256), analistas visualizam por núcleo/setor. Notificação automática em tela ao chegar nova tarefa.

### 🗂️ Busca de Referências em Acervo Documental
Indexação de acervo histórico diretamente do Google Drive via OAuth2. Permite consulta por palavra-chave sem acessar sistemas internos — ideal para análise de produção histórica e referência cruzada de documentos.

### 🚨 Monitor OSINT e Alertas em Tempo Real
Varredura automatizada de fontes abertas e geração de alertas operacionais. Integrado ao pipeline n8n para coleta contínua de notícias e eventos relevantes por região.

### 📰 Painel de Notícias Integrado
Feed de notícias de segurança pública e defesa atualizado automaticamente via n8n — com categorização por tipo (Operação, Defesa, Tecnologia, Segurança) e exibição em tempo real no painel principal.

### ⛔ Lista Negra Operacional
Gestão de alvos e registros operacionais integrada ao Google Drive API. Acesso controlado com autenticação hierárquica.

---

## Arquitetura

```
Agent_Bastos/
│
├── api.py                   # Backend FastAPI — todos os endpoints REST
├── main.py                  # Entrypoint do sistema
├── iniciar.bat              # Script de inicialização (backend + frontend)
│
├── config/
│   └── settings.py          # Centraliza variáveis de ambiente (.env)
│
├── modules/                 # Lógica de negócio (desacoplada da UI)
│   ├── agente.py            # RAG, consulta LLM, processamento de áudio
│   ├── agenda.py            # Firebase — agenda operacional
│   ├── agenda_patch.py      # Patches de compatibilidade da agenda
│   ├── dashboard.py         # Indicadores de produção
│   ├── decifrar.py          # Claude Vision — análise de documentos
│   ├── ingestor.py          # Ingestão de documentos no ChromaDB
│   ├── monitor.py           # Monitor OSINT e alertas em tempo real
│   ├── rag.py               # Pipeline RAG com ChromaDB
│   └── transcricao.py       # Transcrição de áudio (Whisper)
│
├── drive_indexer/           # Módulo de indexação do Google Drive
│   ├── auth.py
│   ├── crawler.py
│   ├── indexer.py
│   ├── parser.py
│   └── busca_referencias.py
│
├── frontend/                # Interface React + Vite + Electron
│   └── src/
│       ├── App.jsx          # Componente raiz + navegação
│       ├── ChatRAG.jsx      # Interface de consulta doutrinária
│       ├── Agenda.jsx       # Agenda operacional
│       ├── Alertas.jsx      # Painel de alertas
│       ├── Dashboard.jsx    # Dashboard de produção
│       ├── ListaNegra.jsx   # Gestão de alvos
│       ├── Noticias.jsx     # Feed de notícias OSINT
│       ├── Referencias.jsx  # Busca em acervo
│       ├── Transcricao.jsx  # Interface de transcrição
│       └── Configuracoes.jsx
│
├── data/                    # Dados locais (não versionados)
│   ├── doutrina/            # Base de conhecimento em .txt
│   ├── audios/              # Gravações de entrevistas
│   └── chroma_db/           # Banco vetorial local
│
├── logs/
│   └── missao.log
│
├── .env                     # Segredos (não versionado)
├── .env.example             # Modelo de configuração
└── .gitignore
```

### Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Interface | React 18 + Vite + Electron |
| Backend API | FastAPI (Python) |
| LLM Principal | LLaMA 3.3 70B via Groq API |
| Visão Computacional | Claude Vision (Anthropic) |
| RAG / Banco Vetorial | ChromaDB + multilingual-e5-small |
| Banco em Tempo Real | Firebase Firestore |
| Acervo Documental | Google Drive API (OAuth2) |
| Transcrição de Áudio | Whisper via n8n |
| Automação de Fluxos | n8n |
| Monitor OSINT | Python + requests + n8n |

---

## Instalação

### Pré-requisitos
- Python 3.10+
- Node.js 18+
- Conta no [Groq](https://console.groq.com) — LLM gratuito
- Conta no [Anthropic](https://console.anthropic.com) — Claude Vision
- Projeto no Firebase com Firestore habilitado
- Credenciais OAuth2 do Google Drive

### Passo a passo

**1. Clone o repositório**
```bash
git clone https://github.com/patrese-procopio/agent-bastos.git
cd agent-bastos
```

**2. Crie e ative o ambiente virtual**
```bash
python -m venv .venv

# Windows
.venv\Scripts\activate
```

**3. Instale as dependências Python**
```bash
pip install -r requirements.txt
```

**4. Instale as dependências do frontend**
```bash
cd frontend
npm install
cd ..
```

**5. Configure as variáveis de ambiente**

Copie o arquivo de exemplo e preencha com suas credenciais:

```bash
cp .env.example .env
```

```env
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...
GOOGLE_CREDENTIALS_PATH=credentials.json
GOOGLE_TOKEN_PATH=token.json
FIREBASE_KEY_PATH=serviceAccountKey.json
```

**6. Adicione os arquivos de credenciais na raiz**
- `credentials.json` — OAuth2 do Google Drive
- `serviceAccountKey.json` — Firebase Admin SDK

**7. Execute**
```bash
# Opção 1 — script de inicialização (recomendado)
iniciar.bat

# Opção 2 — manual
python api.py          # Terminal 1 — backend FastAPI
cd frontend && npm run dev  # Terminal 2 — frontend React
```

---

## Segurança e LGPD

Este projeto foi desenvolvido com atenção às boas práticas de segurança e conformidade com a **Lei Geral de Proteção de Dados (LGPD)**:

- ✅ Credenciais e chaves de API isoladas em `.env` — nunca versionadas
- ✅ Arquivos sensíveis protegidos via `.gitignore` (credenciais, tokens, dados operacionais)
- ✅ Autenticação hierárquica com senha armazenada em hash SHA-256 — nunca em texto puro
- ✅ Dados operacionais armazenados localmente ou em ambiente controlado
- ✅ Acervo histórico acessado por referência — documentos originais não são replicados
- ✅ Arquitetura modular que permite auditoria independente por camada
- ✅ Backend desacoplado do frontend — superfície de ataque reduzida

---

## Casos de Uso

O Agent Bastos foi projetado para ser adaptável. Pode ser implantado em:

- 🏢 **Empresas com setor de segurança corporativa** — consulta de políticas, análise de incidentes, gestão de ocorrências
- 🏛️ **Órgãos públicos com produção de conhecimento** — acesso a bases doutrinárias, produção de relatórios, coordenação de equipes
- 🔎 **Escritórios de investigação e compliance** — análise de documentos, transcrição de depoimentos, gestão de tarefas
- 🎓 **Centros de treinamento e capacitação** — consulta a bases de conhecimento, produção de material analítico

---

## Roadmap

- [x] RAG com base de conhecimento doutrinário (ChromaDB + multilingual-e5-small)
- [x] Análise de documentos manuscritos com Claude Vision
- [x] Agenda operacional com Firebase em tempo real
- [x] Dashboard de produção por setor
- [x] Indexação de acervo no Google Drive
- [x] Backend FastAPI com endpoints REST documentados
- [x] Interface React + Vite + Electron
- [x] Monitor OSINT e alertas em tempo real
- [x] Feed de notícias integrado via n8n
- [x] Lista Negra operacional integrada ao Google Drive
- [x] Gestão segura de credenciais com `.env`
- [x] Pipeline de avaliação RAG com RAGAS
- [ ] Transcrição automática integrada (Whisper + n8n)
- [ ] Exportação de relatórios em PDF
- [ ] Autenticação individual por usuário (JWT)
- [ ] Suporte multi-organização
- [ ] Versão mobile (React Native)

---

## Autor

**Patrese Procópio**
Especialista em Inteligência | Engenharia de Dados com foco em IA

Construindo soluções que unem experiência operacional real com tecnologia de ponta — da coleta de dados ao insight estratégico.

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Conectar-0A66C2?style=flat&logo=linkedin)](https://linkedin.com/in/seu-perfil)
[![GitHub](https://img.shields.io/badge/GitHub-patrese--procopio-181717?style=flat&logo=github)](https://github.com/patrese-procopio)

---

> *"Inteligência não é sobre ter todas as respostas. É sobre fazer as perguntas certas."* 🦉
