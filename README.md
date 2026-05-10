# Agent Bastos
### Sistema de Inteligência Corporativa com IA

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat&logo=react&logoColor=black)
![LLaMA](https://img.shields.io/badge/LLaMA_3.3_70B-Groq-F55036?style=flat)
![Gemini](https://img.shields.io/badge/Gemini_2.5_Flash-Google-4285F4?style=flat&logo=google&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFCA28?style=flat&logo=firebase&logoColor=black)
![ChromaDB](https://img.shields.io/badge/ChromaDB-RAG_Vetorial-6C3483?style=flat)
![Status](https://img.shields.io/badge/Status-Em_desenvolvimento-yellow?style=flat)

---

## Sobre o Projeto

O **Agent Bastos** é um sistema de inteligência corporativa desenvolvido para modernizar a produção analítica de equipes de segurança e inteligência. Nasceu de uma dor real: analistas perdiam horas consultando doutrinas em documentos dispersos, transcrevendo entrevistas manualmente e buscando referências em acervos desorganizados.

A solução combina **RAG doutrinário**, **transcrição forense de áudio**, **análise grafoscópica de manuscritos** e **agenda operacional em tempo real** numa única interface integrada — construída para ser implantada em qualquer organização que trabalhe com produção de conhecimento e gestão de inteligência.

> Projeto desenvolvido como portfólio de especialização em **IA aplicada à inteligência corporativa**, unindo uma década de experiência operacional em análise de inteligência de segurança pública com Engenharia de Dados e soluções de IA.

---

## Screenshots

| Painel Principal | Chat RAG Doutrinário |
|---|---|
| ![Painel](docs/screenshots/painel.png) | ![Chat RAG](docs/screenshots/chat_rag.png) |

| Transcrição Forense de Áudio | Agenda Operacional |
|---|---|
| ![Transcrição](docs/screenshots/transcricao.png) | ![Agenda](docs/screenshots/agenda.png) |

| Dashboard de Produção | Alertas Operacionais |
|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Alertas](docs/screenshots/alertas.png) |

> Screenshots na pasta `docs/screenshots/`

---

## Funcionalidades

### 🔍 Consulta Doutrinária com RAG Vetorial
Consulta semântica sobre bases de conhecimento e doutrinas corporativas via ChromaDB. O agente recupera os trechos mais relevantes e responde com base exclusivamente no conteúdo indexado — **Faithfulness 1.000 nos testes RAGAS**, zero alucinação, sempre referenciando a origem.

### 🔬 Análise Grafoscópica de Manuscritos
Upload de imagens de documentos, bilhetes e registros físicos apreendidos. O **Gemini 2.5 Flash** transcreve o conteúdo com precisão forense, preservando a grafia original, identificando codinomes e sinalizando trechos duvidosos. Exportação em `.txt` e `.pdf` com cabeçalho de laudo forense.

### 🎙️ Transcrição Forense de Áudio
Gravação e transcrição de entrevistas, depoimentos e capturas de campo. Pipeline via **Groq Whisper** com geração automática de Relatório de Informação (RI) no padrão institucional — com diarização de speakers, timestamps e identificação de flags de risco.

### 📊 Dashboard de Produção Analítica
Painel de acompanhamento da produção por núcleo e por analista. KPIs com tendência, gráficos de barras e linha, exportação de relatório narrativo gerado por LLM via endpoint `/relatorio-dashboard`.

### 🗓️ Agenda Operacional com Firebase
Sistema de lançamento e acompanhamento de ordens e missões em tempo real via Firestore. Acesso hierárquico com autenticação por senha hash SHA-256. Notificação automática ao chegar nova tarefa.

### 🗂️ Busca de Referências em Acervo Documental
Indexação do acervo histórico direto do Google Drive (OAuth2). Consulta por palavra-chave sem acessar sistemas internos — ideal para referência cruzada de documentos e análise de produção histórica.

### 🚨 Monitor de Alertas e Lista Negra
Sistema de alertas operacionais com integração a workflows n8n. Lista negra de alvos com busca e gestão integrada.

---

## Arquitetura

```
Agent_Bastos/          ← Backend (Python + FastAPI)
│
├── api.py             ← FastAPI — todas as rotas REST
├── main.py            ← Entrypoint
├── avaliar_rag.py     ← Pipeline RAGAS (avaliação de qualidade)
│
├── modules/           ← Lógica de negócio (desacoplada da API)
│   ├── rag.py         ← RAG vetorial — ChromaDB + LLaMA 3.3 70B
│   ├── decifrar.py    ← Análise grafoscópica — Gemini 2.5 Flash
│   ├── transcricao.py ← Transcrição de áudio — Groq Whisper
│   ├── agenda.py      ← Agenda operacional — Firebase Firestore
│   ├── agente.py      ← Agente principal — orquestração LLM
│   ├── ingestor.py    ← Ingestão de documentos no ChromaDB
│   └── monitor.py     ← Monitor de alertas e eventos
│
├── drive_indexer/     ← Indexação do Google Drive (OAuth2)
├── data/              ← Dados locais — não versionados (LGPD)
│   ├── doutrina/      ← Base de conhecimento (.txt)
│   ├── chroma_db/     ← Banco vetorial local
│   └── relatorios/    ← Laudos e relatórios gerados
├── scripts/
│   └── archive/       ← Scripts de desenvolvimento arquivados
└── docs/screenshots/  ← Capturas de tela do sistema

agent-bastos-app/      ← Frontend (React + Vite)
│
├── src/
│   ├── App.jsx           ← Roteamento e sidebar de navegação
│   ├── ChatRAG.jsx       ← Interface do RAG doutrinário
│   ├── Grafoscopia.jsx   ← Análise grafoscópica de manuscritos
│   ├── Transcricao.jsx   ← Transcrição forense de áudio
│   ├── Dashboard.jsx     ← Dashboard de produção analítica
│   ├── Agenda.jsx        ← Agenda operacional
│   ├── Alertas.jsx       ← Monitor de alertas
│   ├── ListaNegra.jsx    ← Gestão de alvos
│   ├── Noticias.jsx      ← Feed de notícias integrado
│   ├── Referencias.jsx   ← Busca no acervo documental
│   └── Configuracoes.jsx ← Configurações e health checks
```

### Stack Tecnológica

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Backend | FastAPI + Python 3.14 | Alta performance, tipagem forte, docs automáticas |
| Frontend | React 18 + Vite | SPA moderna, HMR, build otimizado |
| LLM Principal | LLaMA 3.3 70B via Groq | Faithfulness 1.000 nos testes RAGAS |
| Visão Computacional | Gemini 2.5 Flash | Superior em cursivo denso e linguagem cifrada |
| RAG / Banco Vetorial | ChromaDB + multilingual-e5-small | Busca semântica em português |
| Transcrição de Áudio | Whisper via Groq API | Diarização + timestamps em tempo real |
| Banco em Tempo Real | Firebase Firestore | Sync em tempo real, sem servidor próprio |
| Acervo Documental | Google Drive API (OAuth2) | Integração com acervo institucional existente |
| Avaliação de Qualidade | RAGAS | Métricas objetivas: Faithfulness, Relevancy, Precision |
| Exportação PDF | jsPDF | Geração client-side de laudos forenses |

---

## Instalação

### Pré-requisitos
- Python 3.10+
- Node.js 18+
- Conta no [Groq](https://console.groq.com) — LLM e Whisper
- Conta no [Google AI Studio](https://aistudio.google.com) — Gemini
- Projeto no Firebase com Firestore habilitado
- Credenciais OAuth2 do Google Drive

### Backend

```bash
# 1. Clone o repositório
git clone https://github.com/patrese-procopio/agent-bastos.git
cd agent-bastos

# 2. Crie e ative o ambiente virtual
python -m venv .venv
.venv\Scripts\activate        # Windows
source .venv/bin/activate     # Linux/Mac

# 3. Instale as dependências
pip install -r requirements.txt

# 4. Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env com suas chaves

# 5. Adicione os arquivos de credenciais na raiz
# credentials.json        — OAuth2 do Google Drive
# serviceAccountKey.json  — Firebase Admin SDK

# 6. Execute
python api.py
```

### Frontend

```bash
cd agent-bastos-app
npm install
npm run dev
```

### Variáveis de ambiente necessárias

```env
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIzaSy...
GOOGLE_CREDENTIALS_PATH=credentials.json
CHROMA_DIR=data/chroma_db
DOUTRINA_DIR=data/doutrina
```

---

## Avaliação de Qualidade — RAGAS

O projeto inclui pipeline de avaliação objetiva do RAG com 4 métricas:

| Métrica | Resultado | Interpretação |
|---|---|---|
| **Faithfulness** | **1.000** | Zero alucinação — respostas 100% baseadas na doutrina |
| **Answer Relevancy** | **0.782** | Alta relevância das respostas às perguntas |
| **Context Precision** | **0.794** | Boa precisão na recuperação dos chunks relevantes |
| **Context Recall** | Em investigação | Otimização de chunking em andamento |

> Avaliação reproduzível via `python avaliar_rag.py`

---

## Segurança e LGPD

- ✅ Credenciais e chaves de API isoladas em `.env` — nunca versionadas
- ✅ Arquivos sensíveis protegidos via `.gitignore` com regras por extensão
- ✅ Imagens de documentos operacionais não versionadas (`*.jpeg`, `*.png`)
- ✅ Autenticação hierárquica com senha em hash SHA-256
- ✅ Dados operacionais armazenados localmente ou em ambiente controlado
- ✅ Acervo histórico acessado por referência — documentos originais não replicados
- ✅ Arquitetura modular que permite auditoria independente por camada

---

## Casos de Uso

- 🏢 **Segurança Corporativa** — consulta de políticas, análise de incidentes, gestão de ocorrências
- 🏛️ **Órgãos de Inteligência** — acesso a bases doutrinárias, produção de relatórios, coordenação
- 🔍 **Investigação e Compliance** — análise de manuscritos, transcrição de depoimentos, gestão de alvos
- 🎓 **Capacitação** — consulta à base de conhecimento, produção de material analítico

---

## Roadmap

- [x] RAG vetorial com ChromaDB e avaliação RAGAS
- [x] Análise grafoscópica com Gemini 2.5 Flash
- [x] Transcrição forense de áudio com diarização
- [x] Agenda operacional com Firebase em tempo real
- [x] Dashboard de produção analítica por núcleo
- [x] Indexação de acervo no Google Drive
- [x] Interface React completa com 10 telas
- [x] Exportação de laudos em PDF
- [x] Arquitetura segura — LGPD compliant
- [ ] Autenticação individual por usuário (JWT)
- [ ] Suporte multi-organização
- [ ] Build desktop via Electron
- [ ] Versão mobile

---

## Autor

**Patrese**
Especialista em Inteligência de Segurança Pública · Engenharia de Dados com foco em IA

Uma década de experiência operacional em análise de inteligência aplicada ao desenvolvimento de soluções que transformam dado bruto em conhecimento acionável.

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Conectar-0A66C2?style=flat&logo=linkedin)](https://linkedin.com/in/seu-perfil)
[![GitHub](https://img.shields.io/badge/GitHub-Perfil-181717?style=flat&logo=github)](https://github.com/patrese-procopio)

---

> *"Inteligência não é sobre ter todas as respostas. É sobre fazer as perguntas certas."* 🦉
