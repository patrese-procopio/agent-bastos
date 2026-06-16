# Próximas Missões — Agent Bastos

## Meta: chegar em 90%+ de autonomia

---

## Missões identificadas

### Missão 25 — Resposta Automática a Alertas de Baixo Risco
- Alertas classificados como BAIXO/MÉDIO risco sem HITL
- Sistema responde automaticamente com ação padrão (ex: registrar, arquivar)
- HITL só para ALTO e CRÍTICO
- Reduz ruído operacional e fadiga de alerta

### Missão 26 — Feedback Loop de Correlação
- Quando operador CONFIRMA um HITL, o sistema aprende o par (entidade × fonte)
- Quando operador REJEITA, reduz peso daquele tipo de correlação
- Tabela `correlacao_feedback` em auth.db
- Motor ajusta threshold de confiança por tipo de fonte

### Missão 27 — Fontes Externas em Tempo Real
- Integração com feeds RSS de segurança pública (G1, portais regionais)
- Telegram monitor (já tem Telethon configurado) — grupos de interesse
- Cruza automaticamente com corpus do motor de correlação
- Alertas em tempo real, não só varredura agendada

### Missão 28 — Vínculo Automático no Grafo
- Quando correlação detectada → sistema já gera aresta no grafo de vínculos
- Grafo cresce automaticamente conforme HITLs são confirmados
- Visualização de rede de relacionamentos atualizada sem intervenção manual

### Missão 29 — Score de Risco Dinâmico por Entidade
- Cada entidade monitorada ganha um score de risco (0-100)
- Score sobe quando: nova correlação, novo extrato, novo alerta
- Score cai com tempo sem ocorrências
- Dashboard mostra ranking de entidades por score atual

### Missão 30 — Relatório de Inteligência Automatizado (RELINT)
- Geração automática de RELINT a partir de correlações confirmadas
- Template padronizado AIPEN com seções: Histórico, Vínculos, Análise, Conclusão
- PDF gerado e salvo, disponível para revisão e assinatura digital

---

## Notas de arquitetura
- Manter padrão: zero LLM no motor de correlação (determinístico, custo zero)
- Feedback loop pode usar LLM leve (Groq/Haiku) só para classificação de qualidade
- Todas as missões devem respeitar LGPD: logs de auditoria, acesso por nível
- Prioridade de portfólio: Missões 25, 26 e 29 impressionam mais tecnicamente

---

*Registrado em 16/06/2026 — retomar na próxima sessão*
