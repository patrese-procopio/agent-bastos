

### ADR-005: Migração de LLM — Ollama 1b para Groq LLaMA 70b

**Contexto:** Durante os testes iniciais do RAG, o modelo LLaMA 3.2 1b rodando localmente via Ollama ignorava sistematicamente a diretriz de responder apenas com base nos trechos doutrinários recuperados, gerando respostas genéricas e recusando perguntas legítimas de inteligência por interpretá-las como atividades ilegais.

**Decisão:** Migrar a inferência para Groq API com modelo LLaMA 3.3 70b.

**Consequência:** Faithfulness de 1.000 — zero alucinação nos testes RAGAS. Respostas fundamentadas na doutrina real. Trade-off: dependência de API externa e limite de tokens no free tier (100k tokens/dia).

### ADR-006: Chunking overlap aumentado de 100 para 200 tokens

**Contexto:** Context Recall de 0.333 no RAGAS indicou que conceitos doutrinários importantes estavam sendo fragmentados nas bordas dos chunks, impedindo recuperação correta.

**Decisão:** Aumentar chunk_overlap de 100 para 200 tokens no RecursiveCharacterTextSplitter.

**Consequência:** Base aumentou de 690 para 710 chunks. Melhoria no Context Recall pendente de validação na próxima rodada do RAGAS.

### ADR-007: Pipeline de avaliação RAGAS integrado ao projeto

**Contexto:** Necessidade de métricas objetivas para avaliar qualidade do RAG e embasar o artigo científico com dados reais.

**Decisão:** Implementar script avaliar_rag.py com 4 métricas RAGAS usando Groq como LLM avaliador.

**Consequência:** Resultados mensuráveis e reproduzíveis. Faithfulness 1.000, Answer Relevancy 0.782, Context Precision 0.794. Context Recall em investigação.
