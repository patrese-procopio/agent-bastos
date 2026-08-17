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

---

## 🎯 Próximas candidatas

Puxadas de pendências já documentadas em `agent_bastos_levantamento_frontend.md`, `README.md` e `AUDIT.md` — não são ideias novas, são itens que o próprio projeto já sinalizou como faltando.

### Missão 32 — Validar deploy real (Docker + n8n)
- Rodar `docker compose up` do zero numa máquina limpa (não a de desenvolvimento) e confirmar que API + n8n sobem e se comunicam via `bastos_net`.
- Prioridade: alta — é a diferença entre "roda na minha máquina" e "roda em produção".

### Missão 33 — Hardening de segurança do frontend
- Tokens JWT saindo de `localStorage` para memória (access) + `sessionStorage`/httpOnly (refresh).
- CSP no `electron.cjs`.
- Origem: `agent_bastos_levantamento_frontend.md`, seção de vulnerabilidades.

### Missão 34 — Refatorar App.jsx (God Component)
- Extrair `AuthContext`, `AppRouter`, `Layout` — hoje App.jsx concentra autenticação, navegação e renderização dos 20+ módulos.
- Prioridade média — não trava o sistema, mas pesa em qualquer code review técnico.

### Missão 35 — Busca híbrida no RAG
- Vetorial + keyword com reranking (item já listado no roadmap do `README.md`).
- Ganho de Context Recall, que ficou marcado como "em otimização" no `ARCHITECTURE.md` (ADR-006).

### Missão 36 — CI/CD com GitHub Actions
- Rodar pytest + build do frontend a cada push, badge de status no README.
- Prioridade de portfólio: alta — sinaliza prática de engenharia sem precisar explicar em entrevista.

### Missão 37 — Cobertura de testes do frontend
- Vitest para `api.js` (mock de fetch) e `Login.jsx` (comportamento de formulário) — zero testes hoje no frontend.

---

## Notas de arquitetura
- Manter padrão: zero LLM no motor de correlação (determinístico, custo zero).
- Feedback loop pode usar LLM leve (Groq/Haiku) só para classificação de qualidade.
- Todas as missões devem respeitar LGPD: logs de auditoria, acesso por nível.
- Prioridade de portfólio hoje: Missões 32 (prova que roda em produção) e 36 (CI/CD) — mostram maturidade operacional, não só feature.

---

*Atualizado em 17/08/2026 — Missões 25 a 31 e Inteligência Preditiva confirmadas funcionais em teste manual.*
