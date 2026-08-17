# Missões — Agent Bastos

## Meta: chegar em 90%+ de autonomia

---

## ✅ Concluídas

### Missão 25 — Resposta Automática a Alertas de Baixo Risco
- Alertas BAIXO/MÉDIO risco resolvidos sem HITL; ALTO/CRÍTICO seguem exigindo revisão humana.

### Missão 26 — Feedback Loop de Correlação
- Confirmação/rejeição de HITL ajusta o peso de confiança por tipo de fonte (`feedback_service.py`, tabela `correlacao_feedback`).

### Missão 27 — Fontes Externas em Tempo Real
- Telegram monitor (Telethon) e feeds cruzando automaticamente com o motor de correlação (`services/subint_service.py`, `modules/telegram_monitor.py`).

### Missão 28 — Vínculo Automático no Grafo
- Correlação confirmada gera aresta automaticamente no grafo de vínculos — sem edição manual.

### Missão 29 — Score de Risco Dinâmico por Entidade
- Score 0-100 por entidade, com decaimento exponencial por tempo sem ocorrência (`services/risco_score_service.py`).

### Missão 30 — Relatório de Inteligência Automatizado (RELINT)
- Geração de RELINT a partir de correlações confirmadas, template AIPEN, exportação em PDF.

### Missão 31 — Operações Drone
- Comparação, mosaico e relatório de imagens de drone (`services/drone_*.py`, `routers/drone_router.py`), tela `OperacoesDrone.jsx` no frontend. Testado e funcional em 17/08/2026.

### Inteligência Preditiva (frontend)
- Tela `InteligenciaPreditiva.jsx` — testada e funcional em 17/08/2026.

### Missão 32 — Validar deploy real (Docker + n8n)
- `docker compose up` testado do zero (incluindo recuperação de um travamento do Docker Desktop/WSL no meio do processo — stack se manteve saudável via `restart: unless-stopped`).
- Confirmado via `docker compose exec api curl` que o backend containerizado roda o código atual (rota `/api/drone/missoes` respondendo `Not authenticated`, não `Not Found`) — Drone e demais serviços validados dentro do container, não só no `.venv` local.
- `docs_url` desligado em produção (`BASTOS_ENV=production`) confirmado como comportamento intencional, não bug.
- Testado e funcional em 17/08/2026.

### Missão 33 — Hardening de segurança do frontend
- `access_token` movido para memória (variável de módulo em `src/authStore.js`) — nunca mais toca disco.
- `refresh_token` movido de `localStorage` para `sessionStorage` — sobrevive a um F5, mas some ao fechar a janela do Electron.
- Reidratação de sessão no boot do `App.jsx` via refresh silencioso, pra reload de página não derrubar o usuário logado.
- CSP no `electron.cjs` — já estava implementado antes desta missão (achado ao investigar, não uma tarefa nova).
- Corrigidos 2 pontos em `GrafoVinculos.jsx` que faziam `fetch` direto lendo `localStorage.getItem('ab_access_token')` (bypass do `api.js` — teriam quebrado silenciosamente com a mudança).
- Testado e funcional em 17/08/2026.

### Missão 34 — Refatorar App.jsx (God Component)
- Escopo enxuto: extraídos `AuthContext.jsx` (sessão), `Painel.jsx` (tela inicial, que antes vivia inline — única das 20+ telas sem arquivo próprio) e `AppRouter.jsx` (mapeamento tela→componente, antes 19 blocos condicionais soltos).
- `App.jsx` caiu de 2394 para 1407 linhas (-41%).
- Limpeza: removido código morto (`NEWS`/`liveNews`/`newsToShow` — polling sem uso; `decodeJwt`/`userFromToken` — órfãos desde a Missão 33).
- Sidebar/Topbar (tabs, busca, notificações, tema, idle-timeout) ficaram de fora — ver Missão 34b.
- Testado e funcional em 17/08/2026.

### Fix não planejado — Modelo Groq descomissionado
- A Groq desativou `llama-3.3-70b-versatile` em 16/08/2026, quebrando Chat RAG, resumo de transcrição e o monitor de notícias (404 `model_not_found`).
- Migrado para `openai/gpt-oss-120b` (modelo de produção, não preview), centralizado em `GROQ_MODEL_CHAT` (`config/settings.py`) em vez de string repetida em 3 arquivos.
- Testado e funcional em 17/08/2026.

### Missão 36 — CI/CD com GitHub Actions
- Investigação em 17/08/2026 revelou que o backend já tinha CI funcional desde 19/05/2026 (`.github/workflows/ci.yml`, commits `dfeca47`/`ccd4646`/`b7dd684`) — pytest rodando a cada push/PR na `main`, 67 testes reais hoje (a lista de deps do CI já vem enxuta de propósito, sem `torch`/`chromadb`/`sentence-transformers`, porque a suite mocka a camada de serviço).
- O que realmente faltava era doc drift: o badge de CI tinha sido dropado silenciosamente numa reescrita antiga do `README.md`, e o Roadmap continuava marcando `CI/CD` e `Containerização (Docker)` como pendentes mesmo já entregues (Docker validado na Missão 32). Corrigido: badge restaurado, checklist atualizado, `requirements-dev.txt` criado (conveniência de dev local, documentado que o CI não depende dele).
- Trabalho novo de verdade: frontend (`agent-bastos-app`) nunca teve CI — adicionado `.github/workflows/ci.yml` rodando `npm ci` + `npm run build` a cada push/PR na `master`, como smoke test até a Missão 37 trazer testes de verdade.
- Quase repeti aqui o mesmo erro da Missão 34 (sobrescrever arquivo já existente sem checar `git status` antes) — pego a tempo ao ver `M` em vez de `??` no `git status` do `ci.yml` do backend.
- Achado não resolvido: `tests/test_pipeline_transcricao.py` tem 285 linhas mas zero funções `test_*` — pytest coleta silenciosamente 0 testes ali. Vira item pra Missão 37.
- Testado: workflow do backend restaurado idêntico ao HEAD (diff zero). Workflow novo do frontend ainda não verificado rodando de verdade — falta o usuário dar push e conferir a aba Actions do GitHub.

---

## 🎯 Próximas candidatas

Puxadas de pendências já documentadas em `agent_bastos_levantamento_frontend.md`, `README.md` e `AUDIT.md` — não são ideias novas, são itens que o próprio projeto já sinalizou como faltando.

### Missão 34b — Extrair Layout (Sidebar/Topbar) do App.jsx
- Continuação da Missão 34: sidebar, topbar (busca Ctrl+K, notificações, seletor de tema, avatar), tab bar e timeout de sessão por inatividade ainda vivem dentro do `App.jsx`.
- Mais arriscado que a Missão 34 original — muito estado compartilhado entre esses widgets (ex: `showSearch` fecha `showNotifications`, `focusMode` esconde topbar inteira). Fazer com ambiente de build local disponível pra testar a cada extração.
- Prioridade: baixa — não pesa tanto quanto Painel/AppRouter pesavam numa review técnica.

### Missão 35 — Busca híbrida no RAG (🔄 em andamento)
- Vetorial + keyword com reranking (item já listado no roadmap do `README.md`).
- Ganho de Context Recall, que ficou marcado como "em otimização" no `ARCHITECTURE.md` (ADR-006).
- Código implementado em 17/08/2026: `modules/hybrid_retriever.py` (BM25 + fusão RRF k=60 + reranking com cross-encoder multilingue `mmarco-mMiniLMv2-L12-H384-v1`), atrás da flag `RAG_HYBRID_SEARCH` (default `false`) — não altera o caminho de produção atual.
- Faltando: medir Context Recall antes/depois com `scripts/avaliar_rag.py` (RAGAS). Bloqueado pela cota diária gratuita da Groq (200k tokens/dia) — as duas primeiras tentativas de medição pós-reset ainda bateram no limite. Retomar quando a cota resetar de novo.
- Ao concluir: recalibrar `SCORE_MINIMO_DOUTRINA` se necessário (score do cross-encoder é sigmoid, não é diretamente comparável ao cosseno atual) e registrar ADR-008 no `ARCHITECTURE.md` com os números reais.

### Missão 37 — Cobertura de testes do frontend
- Vitest para `api.js` (mock de fetch) e `Login.jsx` (comportamento de formulário) — zero testes hoje no frontend.

### Missão 38 — Sincronizar dados entre deploy local e Docker
- Descoberto em 17/08/2026: o volume nomeado `bastos_db` (usado pelo `docker compose`) é um banco **separado** do `data/auth.db` local usado pelo `.venv`. O registro do admin no volume Docker ficou 8 semanas sem o módulo `drone`, mesmo com o código já atualizado — porque dados não se propagam pelos bind mounts, só código.
- Avaliar: script de migração/seed que sincroniza `modules` de usuários entre os dois bancos, ou documentar claramente no README que são bancos independentes e qual é a fonte de verdade em cada ambiente.
- Prioridade: média — não trava nada, mas já causou um "cadê meu módulo novo" real numa sessão de teste.

---

## Notas de arquitetura
- Manter padrão: zero LLM no motor de correlação (determinístico, custo zero).
- Feedback loop pode usar LLM leve (Groq/Haiku) só para classificação de qualidade.
- Todas as missões devem respeitar LGPD: logs de auditoria, acesso por nível.
- Prioridade de portfólio hoje: Missões 32 (prova que roda em produção) e 36 (CI/CD) — mostram maturidade operacional, não só feature.

---

*Atualizado em 17/08/2026 — Missões 25 a 34 (escopo enxuto), Inteligência Preditiva e fix do modelo Groq confirmados funcionais em teste manual. Missão 36 (CI/CD) concluída — em boa parte doc drift corrigido, CI novo no frontend. Missão 35 (busca híbrida) implementada, medição RAGAS pendente por cota da Groq.*
