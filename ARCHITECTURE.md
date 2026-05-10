# Architecture Decision Records — Agent Bastos

Registro das decisões arquiteturais relevantes do projeto, com contexto, decisão e consequências.

---

## ADR-001: Separação Backend / Frontend

**Contexto:** O projeto nasceu como aplicação desktop Python com CustomTkinter. A interface acoplada ao backend dificultava evolução independente e limitava a experiência do usuário.

**Decisão:** Separar em dois repositórios — backend FastAPI (`Agent_Bastos`) e frontend React + Vite (`agent-bastos-app`). Comunicação via REST API.

**Consequência:** Desacoplamento total. Frontend pode evoluir sem tocar no backend. Abre caminho para versão web, mobile e múltiplos clientes. Trade-off: dois servidores locais para desenvolvimento (porta 8000 e 5173).

---

## ADR-002: ChromaDB como banco vetorial local

**Contexto:** Necessidade de RAG sobre base doutrinária (~960 chunks) sem dependência de serviço externo pago (Pinecone, Weaviate).

**Decisão:** ChromaDB local com embeddings `intfloat/multilingual-e5-small` — modelo compacto, suporte nativo ao português.

**Consequência:** Zero custo de infraestrutura vetorial. Base persiste em `data/chroma_db/` entre sessões. Trade-off: não escala para múltiplos usuários simultâneos sem migração para servidor ChromaDB.

---

## ADR-003: FastAPI como camada de API

**Contexto:** Backend precisava expor os módulos Python para o frontend React sem reescrever a lógica.

**Decisão:** FastAPI com Uvicorn. Documentação automática em `/docs`, tipagem com Pydantic, suporte nativo a async.

**Consequência:** API autodocumentada. Endpoints testáveis via Swagger UI sem ferramentas externas. Pydantic garante validação de entrada em todas as rotas.

---

## ADR-004: Arquitetura modular em `modules/`

**Contexto:** Lógica de negócio estava misturada com código de interface no monólito Tkinter original.

**Decisão:** Cada domínio em módulo isolado: `rag.py`, `decifrar.py`, `transcricao.py`, `agenda.py`, `agente.py`, `ingestor.py`, `monitor.py`. O `api.py` apenas orquestra — não contém lógica de negócio.

**Consequência:** Testabilidade por módulo. Cada módulo pode ser importado e testado independentemente. `api.py` cresceu para 50KB mas permanece legível porque cada rota delega ao módulo correspondente.

---

## ADR-005: Migração de LLM — Ollama 1b para Groq LLaMA 70b

**Contexto:** Durante os testes iniciais do RAG, o modelo LLaMA 3.2 1b rodando localmente via Ollama ignorava a diretriz de responder apenas com base nos trechos doutrinários recuperados, gerando respostas genéricas e recusando perguntas legítimas de inteligência.

**Decisão:** Migrar a inferência para Groq API com modelo LLaMA 3.3 70b.

**Consequência:** Faithfulness de 1.000 — zero alucinação nos testes RAGAS. Respostas fundamentadas na doutrina real. Trade-off: dependência de API externa e limite de tokens no free tier (100k tokens/dia).

---

## ADR-006: Chunking overlap aumentado de 100 para 200 tokens

**Contexto:** Context Recall de 0.333 no RAGAS indicou que conceitos doutrinários importantes estavam sendo fragmentados nas bordas dos chunks, impedindo recuperação correta.

**Decisão:** Aumentar `chunk_overlap` de 100 para 200 tokens no `RecursiveCharacterTextSplitter`.

**Consequência:** Base aumentou de 690 para 963 chunks. Context Precision melhorou para 0.794. Context Recall em investigação para próxima rodada do RAGAS.

---

## ADR-007: Pipeline de avaliação RAGAS integrado ao projeto

**Contexto:** Necessidade de métricas objetivas para avaliar qualidade do RAG e embasar resultados com dados reais.

**Decisão:** Implementar `avaliar_rag.py` com 4 métricas RAGAS usando Groq como LLM avaliador: Faithfulness, Answer Relevancy, Context Precision, Context Recall.

**Consequência:** Resultados mensuráveis e reproduzíveis. Faithfulness 1.000, Answer Relevancy 0.782, Context Precision 0.794. Avaliação pode ser reexecutada a qualquer momento para detectar regressões.

---

## ADR-008: Migração de visão computacional — Claude Vision para Gemini 2.5 Flash

**Contexto:** O módulo `decifrar.py` utilizava Claude Vision (Anthropic) para transcrição de manuscritos. A SDK `google-generativeai` já estava instalada no projeto para outros fins. Testes mostraram que o Gemini 2.5 Flash tem desempenho superior em cursivo denso com rasuras, típico de documentos apreendidos em operações.

**Decisão:** Migrar `decifrar.py` para Gemini 2.5 Flash via `google-genai` SDK (nova SDK — `google-generativeai` foi depreciada).

**Consequência:** `confianca: alto` e `requer_revisao_humana: false` em teste com bilhete real de cursivo denso. Identificação automática de codinomes, siglas de organizações e abreviações operacionais. `temperature=0.1` para fidelidade máxima ao texto original. Trade-off: dependência de chave `GEMINI_API_KEY` adicional.

---

## ADR-009: Exportação de laudos em PDF client-side com jsPDF

**Contexto:** Analistas precisam exportar transcrições forenses em formato de laudo para anexar a processos. Geração server-side adicionaria complexidade desnecessária ao backend.

**Decisão:** Usar `jsPDF` no frontend React para gerar laudos A4 diretamente no browser — sem chamada ao backend.

**Consequência:** Laudo gerado instantaneamente, sem latência de rede. Estrutura forense: cabeçalho, metadados, seções separadas por linha, quebra automática de página, rodapé `CONFIDENCIAL` em todas as páginas. Trade-off: fontes limitadas às nativas do jsPDF (Courier para identidade forense).

---

## ADR-010: Dados operacionais fora do versionamento (LGPD)

**Contexto:** Imagens de documentos apreendidos, relatórios gerados e dados de alvos são dados sensíveis sob a LGPD. Versionar esses arquivos criaria risco de exposição no histórico Git mesmo após remoção.

**Decisão:** `.gitignore` com regras explícitas por extensão (`*.jpeg`, `*.png`, `*.gif`, `*.webp`) e por diretório (`data/`, `logs/`). Adicionalmente, arquivos de credenciais nunca commitados — verificado via `git log --all --oneline -- <arquivo>`.

**Consequência:** Repositório público sem nenhum dado operacional ou credencial no histórico. Conformidade LGPD por design, não por correção posterior.
