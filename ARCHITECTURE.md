# 🏗️ Architecture Decision Records — Agent Bastos

> Registro formal das decisões arquiteturais do projeto, com contexto, motivação, decisão tomada e consequências mensuráveis.
> Este documento é a fonte de verdade sobre **por que** o sistema foi construído da forma que foi.

---

## Índice de Decisões

| ADR | Título | Status | Impacto |
|-----|--------|--------|---------|
| [ADR-001](#adr-001-separação-backend--frontend) | Separação Backend / Frontend | ✅ Aplicado | Arquitetura |
| [ADR-002](#adr-002-chromadb-como-banco-vetorial-local) | ChromaDB como banco vetorial local | ✅ Aplicado | Infraestrutura |
| [ADR-003](#adr-003-fastapi-como-camada-de-api) | FastAPI como camada de API | ✅ Aplicado | Backend |
| [ADR-004](#adr-004-arquitetura-modular-em-modules) | Arquitetura modular em `modules/` | ✅ Aplicado | Backend |
| [ADR-005](#adr-005-migração-de-llm--ollama-1b-para-groq-llama-70b) | Migração de LLM — Ollama 1b → Groq LLaMA 70b | ✅ Aplicado | LLM / RAG |
| [ADR-006](#adr-006-chunking-overlap-aumentado-de-100-para-200-tokens) | Chunking overlap aumentado de 100 → 200 tokens | ✅ Aplicado | RAG |
| [ADR-007](#adr-007-pipeline-de-avaliação-ragas-integrado-ao-projeto) | Pipeline de avaliação RAGAS integrado | ✅ Aplicado | Qualidade |
| [ADR-008](#adr-008-migração-de-visão-computacional--claude-vision-para-gemini-25-flash) | Migração de visão — Claude Vision → Gemini 2.5 Flash | ✅ Aplicado | LLM / Visão |
| [ADR-009](#adr-009-exportação-de-laudos-em-pdf-client-side-com-jspdf) | Exportação de laudos em PDF client-side | ✅ Aplicado | Frontend |
| [ADR-010](#adr-010-dados-operacionais-fora-do-versionamento-lgpd) | Dados operacionais fora do versionamento (LGPD) | ✅ Aplicado | Segurança |

---

## Visão Geral da Evolução Arquitetural

```
v1.0 — Monólito Desktop          v1.3 — Separação de Camadas        v1.5 — MVP Atual
─────────────────────────        ───────────────────────────        ──────────────────────────────
Python + CustomTkinter           FastAPI + React (REST)             Multi-modelo orquestrado
  └─ Tudo acoplado               Ollama local (LLaMA 1b)            ├─ LLaMA 3.3 70B (RAG)
  └─ Ollama local                ChromaDB local                     ├─ Gemini 2.5 Flash (visão)
  └─ Sem API                     Módulos isolados                   ├─ Whisper/Groq (áudio)
                                                                    ├─ Firebase (real-time)
                                                                    ├─ RAGAS (avaliação)
                                                                    └─ LGPD by design
```

---

## ADR-001: Separação Backend / Frontend

**Data:** Março 2026
**Status:** ✅ Aplicado

### Contexto

O projeto nasceu como aplicação desktop Python com CustomTkinter. A interface acoplada ao backend dificultava evolução independente e limitava a experiência do usuário.

### Decisão

Separar em dois repositórios independentes:
- Backend FastAPI → `Agent_Bastos/`
- Frontend React + Vite → `agent-bastos-app/`

Comunicação exclusivamente via REST API (porta 8000 → 5173).

### Consequências

| ✅ Ganhos | ⚠️ Trade-offs |
|-----------|--------------|
| Desacoplamento total — frontend evolui sem tocar no backend | Dois servidores locais em desenvolvimento |
| Abre caminho para versão web, mobile e múltiplos clientes | Complexidade adicional de CORS e autenticação |
| Times independentes podem trabalhar em paralelo | |

---

## ADR-002: ChromaDB como banco vetorial local

**Data:** Março 2026
**Status:** ✅ Aplicado

### Contexto

Necessidade de RAG sobre base doutrinária (~960 chunks) sem dependência de serviço externo pago (Pinecone, Weaviate). Requisito de operação em ambientes com conectividade limitada.

### Decisão

ChromaDB local com embeddings `intfloat/multilingual-e5-small` — modelo compacto com suporte nativo ao português.

### Consequências

| ✅ Ganhos | ⚠️ Trade-offs |
|-----------|--------------|
| Zero custo de infraestrutura vetorial | Não escala para múltiplos usuários simultâneos sem migração para servidor ChromaDB |
| Base persiste em `data/chroma_db/` entre sessões | |
| Funciona offline — sem dependência de nuvem | |

---

## ADR-003: FastAPI como camada de API

**Data:** Março 2026
**Status:** ✅ Aplicado

### Contexto

Backend precisava expor os módulos Python para o frontend React sem reescrever a lógica de negócio existente.

### Decisão

FastAPI com Uvicorn. Documentação automática em `/docs`, tipagem com Pydantic, suporte nativo a `async/await`.

### Consequências

| ✅ Ganhos | ⚠️ Trade-offs |
|-----------|--------------|
| API autodocumentada via Swagger UI — testável sem ferramentas externas | — |
| Pydantic garante validação de entrada em todas as rotas | |
| Performance assíncrona nativa para I/O intensivo (chamadas LLM) | |

---

## ADR-004: Arquitetura modular em `modules/`

**Data:** Março 2026
**Status:** ✅ Aplicado

### Contexto

Lógica de negócio estava misturada com código de interface no monólito Tkinter original. Impossível testar um módulo sem subir a interface inteira.

### Decisão

Cada domínio em módulo isolado dentro de `modules/`:

```
modules/
├── rag.py          ← domínio: consulta doutrinária
├── decifrar.py     ← domínio: análise grafoscópica
├── transcricao.py  ← domínio: transcrição forense
├── agenda.py       ← domínio: agenda operacional
├── agente.py       ← domínio: orquestração LLM
├── ingestor.py     ← domínio: ingestão de documentos
└── monitor.py      ← domínio: alertas e eventos
```

`api.py` apenas orquestra — **não contém lógica de negócio**.

### Consequências

| ✅ Ganhos | ⚠️ Trade-offs |
|-----------|--------------|
| Testabilidade por módulo independente | `api.py` cresceu para ~50KB |
| Cada módulo pode ser importado isoladamente | |
| Substituição de qualquer módulo sem afetar os demais | |

---

## ADR-005: Migração de LLM — Ollama 1b para Groq LLaMA 70b

**Data:** Abril 2026
**Status:** ✅ Aplicado
**Motivação:** Falha de qualidade mensurável

### Contexto

Durante os testes iniciais do RAG, o modelo LLaMA 3.2 1b rodando localmente via Ollama ignorava a diretriz de responder apenas com base nos trechos doutrinários recuperados — gerava respostas genéricas e recusava perguntas legítimas de inteligência.

### Decisão

Migrar a inferência para **Groq API com LLaMA 3.3 70B**. Justificativa: modelos 70B seguem instruções de sistema com fidelidade significativamente superior a modelos 1-7B para tarefas de RAG restrito.

### Resultado Mensurável

```
Métrica         Ollama 1b    Groq 70b    Variação
──────────────  ─────────    ────────    ────────
Faithfulness    ~0.40        1.000       +150%
Alucinações     Frequentes   Zero        ✅
```

### Consequências

| ✅ Ganhos | ⚠️ Trade-offs |
|-----------|--------------|
| Faithfulness 1.000 — zero alucinação verificada | Dependência de API externa |
| Respostas fundamentadas na doutrina real | Limite de 100k tokens/dia no free tier |

---

## ADR-006: Chunking overlap aumentado de 100 para 200 tokens

**Data:** Abril 2026
**Status:** ✅ Aplicado
**Motivação:** Regressão detectada via RAGAS

### Contexto

Context Recall de **0.333** no primeiro ciclo RAGAS indicou que conceitos doutrinários importantes estavam sendo fragmentados nas bordas dos chunks, impedindo recuperação correta pelo retriever.

### Decisão

Aumentar `chunk_overlap` de 100 → 200 tokens no `RecursiveCharacterTextSplitter` e reindexar toda a base.

### Resultado Mensurável

```
Métrica             Antes      Depois     Variação
──────────────────  ──────     ──────     ────────
Total de chunks     690        963        +39%
Context Precision   —          0.794      ✅
Context Recall      0.333      em opt.    em investigação
```

### Consequências

| ✅ Ganhos | ⚠️ Trade-offs |
|-----------|--------------|
| Context Precision saltou para 0.794 | Base cresceu 39% em número de chunks |
| Conceitos doutrinários preservados nas bordas | Leve aumento no tempo de ingestão |

---

## ADR-007: Pipeline de avaliação RAGAS integrado ao projeto

**Data:** Abril 2026
**Status:** ✅ Aplicado

### Contexto

Necessidade de métricas objetivas e reproduzíveis para avaliar qualidade do RAG — evitar regressões silenciosas a cada mudança de chunking, modelo ou prompt.

### Decisão

Implementar `avaliar_rag.py` com 4 métricas RAGAS usando Groq como LLM avaliador:
- **Faithfulness** — respostas fundamentadas no corpus?
- **Answer Relevancy** — resposta aderente à pergunta?
- **Context Precision** — chunks recuperados são relevantes?
- **Context Recall** — conceitos necessários foram recuperados?

### Resultado do Benchmark Atual

```
Métrica              Score    Status
───────────────────  ──────   ──────
Faithfulness         1.000    ✅ Excelente
Answer Relevancy     0.782    ✅ Bom
Context Precision    0.794    ✅ Bom
Context Recall       —        🔄 Em otimização (meta: ≥ 0.850)
```

### Consequências

| ✅ Ganhos | ⚠️ Trade-offs |
|-----------|--------------|
| Resultados mensuráveis e reproduzíveis | Custo de tokens Groq por execução |
| Detecta regressões antes de chegar em produção | |
| Credibilidade técnica — números reais, não estimativas | |

---

## ADR-008: Migração de visão computacional — Claude Vision para Gemini 2.5 Flash

**Data:** Maio 2026
**Status:** ✅ Aplicado
**Motivação:** Superioridade técnica verificada em testes

### Contexto

O módulo `decifrar.py` utilizava Claude Vision (Anthropic) para transcrição de manuscritos. Testes comparativos mostraram que o Gemini 2.5 Flash tem desempenho superior especificamente em **cursivo denso com rasuras** — padrão típico de documentos apreendidos em operações de campo.

### Decisão

Migrar `decifrar.py` para **Gemini 2.5 Flash** via `google-genai` SDK (nova SDK — `google-generativeai` foi depreciada pela Google).

Parâmetros críticos:
- `temperature=0.1` — fidelidade máxima ao texto original
- Prompt forense estruturado para identificar codinomes, siglas e abreviações operacionais
- `confianca` e `requer_revisao_humana` como campos de saída explícitos

### Resultado em Teste Real

```
Input:  bilhete manuscrito com cursivo denso + rasuras
Output: confianca: alto
        requer_revisao_humana: false
        codinomes_identificados: [lista automática]
```

### Consequências

| ✅ Ganhos | ⚠️ Trade-offs |
|-----------|--------------|
| Alta confiança em cursivo denso e linguagem cifrada | Chave `GEMINI_API_KEY` adicional |
| Identificação automática de codinomes e siglas operacionais | Dependência de API externa para visão |
| `temperature=0.1` garante fidelidade ao documento original | |

---

## ADR-009: Exportação de laudos em PDF client-side com jsPDF

**Data:** Maio 2026
**Status:** ✅ Aplicado

### Contexto

Analistas precisam exportar transcrições forenses em formato de laudo para anexar a processos. Geração server-side adicionaria latência, complexidade no backend e — criticamente — faria o documento transitar por servidor externo.

### Decisão

Usar **jsPDF** no frontend React para gerar laudos A4 diretamente no browser, sem chamada ao backend.

Estrutura do laudo gerado:
- Cabeçalho institucional + metadados
- Seções separadas por linha
- Quebra automática de página
- Rodapé `CONFIDENCIAL` em todas as páginas
- Fonte Courier — identidade forense

### Consequências

| ✅ Ganhos | ⚠️ Trade-offs |
|-----------|--------------|
| Laudo gerado instantaneamente, sem latência de rede | Fontes limitadas às nativas do jsPDF |
| Documento nunca transita por servidor externo (LGPD) | |
| Zero complexidade adicional no backend | |

---

## ADR-010: Dados operacionais fora do versionamento (LGPD)

**Data:** Março 2026
**Status:** ✅ Aplicado

### Contexto

Imagens de documentos apreendidos, relatórios gerados e dados de alvos são dados sensíveis protegidos pela **Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018)**. Versionar esses arquivos criaria risco de exposição permanente no histórico Git, mesmo após remoção posterior.

### Decisão

`.gitignore` com regras explícitas por extensão e diretório:

```gitignore
# Dados operacionais — LGPD
*.jpeg
*.png
*.gif
*.webp
data/
logs/

# Credenciais
.env
credentials.json
serviceAccountKey.json
*.key
```

Verificação adicional: `git log --all --oneline -- <arquivo>` confirma que nenhum arquivo sensível existe no histórico.

### Consequências

| ✅ Ganhos | ⚠️ Trade-offs |
|-----------|--------------|
| Repositório público sem nenhum dado operacional no histórico | Onboarding requer configuração manual dos arquivos locais |
| Conformidade LGPD por design — não por correção posterior | |
| Auditável: qualquer pessoa pode verificar o histórico limpo | |

---

<div align="center">

**Agent Bastos** — decisões arquiteturais documentadas, não apenas implementadas.

*Última atualização: Maio 2026*

</div>
