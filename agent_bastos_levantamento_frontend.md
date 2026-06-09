# Agent Bastos — Levantamento Técnico: Frontend
**Data:** Junho 2026 | **Escopo:** `agent-bastos-app/`

---

## TL;DR

O frontend tem visual profissional e funcionalidades reais — são 20 telas implementadas com design system próprio, integração Electron, splash screen e autenticação com refresh automático. Os problemas são de **arquitetura de componentes** e **segurança de tokens**, além de inconsistências que ficam visíveis em revisão de código. Nada destrói o projeto, mas cada item abaixo é o que separa "projeto de portfólio" de "produto enterprise".

---

## 1. O QUE ESTÁ SÓLIDO ✅

### Design System (theme.js)
Existe uma fonte de verdade real para cores, tipografia e estilos compartilhados. O `theme.js` exporta `C` (paleta), `T` (layout reutilizável), `RISK_COLORS`, `BASE_CSS` e as fontes — o padrão certo para escalar o projeto. O fato de existir e estar documentado com comentários (escala +30%) demonstra maturidade.

### api.js — Cliente HTTP centralizado
O cliente HTTP está bem construído:
- JWT automático em todo request via `headers()`
- Refresh automático transparente (401 → tenta refresh → retry)
- Limpeza de localStorage em caso de refresh falho (logout automático)
- Suporte a FormData sem Content-Type manual
- Interface limpa: `api.get()`, `api.post()`, `api.upload()`

Esse arquivo é o coração certo de uma SPA segura.

### Electron — Integração correta
- Splash screen com barra de progresso animada durante boot do Python
- `contextBridge` no `preload.cjs` (segurança: renderer não tem acesso direto ao Node)
- Controles de janela via IPC (minimize/maximize/close)
- Proxy Vite configurado: `/api-proxy` → `localhost:8000` (dev funciona sem CORS)

### Breadth de funcionalidades
20 telas implementadas: Dashboard, ChatRAG, OSINT, Transcrição, Grafoscopia, GrafoVínculos, Alertas, Notícias, Agenda, Extrato, LiderançasPorUnidade, LíderesGerais, ControleGrupos, InteligênciaGrupos, ListaNegra, SinaisFracos, MatrizNUCADIs, Referências, Configurações, Login.

A variedade de módulos funcionais é o maior argumento de portfólio do projeto.

### Login com UX profissional
Tratamento correto de estados (loading, erro, sucesso), senhas com `type="password"`, feedback visual de erro, submit via Enter e botão.

---

## 2. VULNERABILIDADES DE SEGURANÇA 🚨

### ALTA — Tokens JWT em localStorage (XSS risk)
Os tokens `access_token`, `refresh_token` e dados do usuário ficam em `localStorage`:

```js
localStorage.setItem("ab_access_token", data.access_token)
localStorage.setItem("ab_refresh_token", data.refresh_token)
localStorage.setItem("ab_user", JSON.stringify({...}))
```

`localStorage` é acessível a qualquer JavaScript na página — se houver XSS (injeção de script), o atacante rouba o token. Para Electron o risco é menor que web, mas persiste.

**Solução enterprise:** tokens em memória (variável de contexto React) + refresh token em cookie httpOnly. Em Electron, no mínimo usar `sessionStorage` (limpa ao fechar a janela) para o access token.

### ALTA — Componentes bypassam o api.js (sem autenticação)

`OsintPesquisa.jsx` e `LiderancasUnidade.jsx` usam fetch direto com URL hardcoded:

```js
// OsintPesquisa.jsx — linha 5
const API = "http://127.0.0.1:8000/api"

// LiderancasUnidade.jsx — linha 4-6
const API = "http://127.0.0.1:8000"
const tkn = () => localStorage.getItem("ab_access_token") || ""
```

O problema: implementam o próprio sistema de token sem refresh automático. Se o access token expirar durante uma operação OSINT longa, a requisição falha silenciosamente sem tentar renovar. E o `tkn()` inline é duplicação de lógica do `api.js`.

**Solução:** todos os componentes devem usar `api.js` exclusivamente.

### MÉDIA — URLs hardcoded em múltiplos arquivos

```
OsintPesquisa.jsx       const API = "http://127.0.0.1:8000/api"
LiderancasUnidade.jsx   const API = "http://127.0.0.1:8000"
Referencias.jsx         href hardcoded para localhost:8000
Configuracoes.jsx       fetch("http://127.0.0.1:8000/...") direto
Agenda.jsx              fallback hardcoded em 3 lugares
```

Em produção (quando o app roda empacotado como .exe), essa URL pode precisar mudar. Tudo deve passar pelo proxy Vite (dev) ou pela `BASE` do `api.js`.

---

## 3. DÍVIDA TÉCNICA 🧹

### App.jsx é um "God Component"
O arquivo tem ~500 linhas e mistura:
- Gerenciamento de autenticação (`user` state, `handleLogin`, `handleLogout`)
- Lógica de navegação (switch de `active`)
- Chat inline no Painel (duplicado do ChatRAG.jsx)
- Busca de notícias para o Painel
- Injeção de CSS global
- Renderização de todos os 20 módulos

Isso quebra o princípio de responsabilidade única e torna testes impossíveis. Enterprise pattern:
```
AuthContext.jsx     → estado do usuário, login/logout
AppRouter.jsx       → mapeamento de rotas → componentes
Layout.jsx          → sidebar + topbar
App.jsx             → orquestra apenas os três acima
```

### Comunicação entre componentes via localStorage
`Extrato.jsx` salva um valor no localStorage para que `GrafoVinculos.jsx` o consuma:

```js
// Extrato.jsx
localStorage.setItem("grafo_foco_alvo", `extrato_${selId}`)
onNavigate?.("Análise de Vínculo")

// GrafoVinculos.jsx
const foco = localStorage.getItem("grafo_foco_alvo")
localStorage.removeItem("grafo_foco_alvo")
```

Isso é um anti-pattern. É "passar parâmetros por post-it". Enterprise pattern: passar via props, Context, ou URL param via React Router.

### Design system existe mas não é usado consistentemente
`theme.js` está correto, mas vários componentes definem seus próprios `const C = {...}` com as mesmas cores:

```js
// App.jsx tem seu próprio C = { bg: "#0B1120", gold: "#E8A020"... }
// ChatRAG.jsx (hardcoded inline)
// OsintPesquisa.jsx tem const C = { bg: "#0B1120", gold: "#E8A020"... }
```

Qualquer mudança de cor precisa ser feita em múltiplos arquivos. Solução: `import { C, MONO, SANS } from "./theme"` em todos os componentes.

### CSS global injetado via useEffect em múltiplos componentes
`App.jsx`, `ChatRAG.jsx`, `OsintPesquisa.jsx` e outros injetam `<style>` via `useEffect`. Isso cria estilos duplicados no DOM e é frágil. O correto é usar `index.css` ou módulos CSS para o que é global.

### Arquivos Python dentro de src/
```
src/dark_theme.py
src/find_conflicts.py
src/fix_colors.py
```
Scripts de desenvolvimento que não pertencem ao repositório frontend. Devem ser removidos ou movidos para a raiz.

### Assets duplicados
As imagens das unidades existem em dois lugares:
```
/public/unidades/CDF.jpg, CDPM1.jpg...
/src/assets/unidades/CDF.jpg, CDPM1.jpg...
```
Duplicação desnecessária. Manter apenas em `/public/` (servido estaticamente pelo Vite) ou em `/src/assets/` (importado via bundle).

### Login com path de imagem quebrado em produção
```jsx
// Login.jsx
<img src="./src/assets/logo.png" />
```
Em dev funciona porque Vite serve a raiz do projeto. No build de produção (Electron empacotado), `./src/assets/` não existe. O correto é `import logo from "./assets/logo.png"` como o `App.jsx` já faz.

### Zero testes no frontend
Nenhum arquivo `.test.jsx` ou `.spec.js` existe. Para enterprise:
- Vitest (integrado ao Vite, sem config extra)
- Testes unitários: `api.js` (mocking de fetch), `theme.js`
- Testes de componente: Login (comportamento de formulário)

---

## 4. GAPS DE FUNCIONALIDADE

### Sem React Router
A navegação usa `useState("Painel")` + giant if/else. Consequências:
- Não existe URL por tela (deep linking impossível)
- Botão "Voltar" do browser não funciona
- Cada tela nova aumenta o if/else em App.jsx

Para Electron puro o impacto é menor, mas se o projeto migrar para web (SaaS) isso vira retrabalho.

### Sem gerenciamento de estado global
Não há Context API, Zustand ou Redux. O estado de autenticação é lido do localStorage em vários lugares. Se o usuário deslogar em uma aba e a outra não sabe — edge case não tratado.

**Solução mínima:** `AuthContext` com `useContext` nos componentes que precisam do usuário logado.

### Sem Error Boundaries
Se qualquer componente lançar uma exceção não capturada, a tela inteira vira um branco vazio no Electron. Com `<ErrorBoundary>` envolvendo cada módulo, apenas aquele módulo quebra e o resto continua funcionando.

### Electron sem CSP (Content Security Policy)
O `electron.cjs` não define `Content-Security-Policy` no `webPreferences` ou via meta tag. Para um app que processa dados sensíveis de inteligência, CSP evita execução de scripts injetados.

---

## 5. PRIORIZAÇÃO

| Prioridade | Item | Esforço | Impacto |
|---|---|---|---|
| 🔴 IMEDIATO | Unificar todos os fetch via api.js (OsintPesquisa, LiderancasUnidade, Referencias, Agenda) | 2h | Crítico (segurança) |
| 🔴 IMEDIATO | Corrigir path da logo no Login.jsx | 15min | Alto (quebra em produção) |
| 🟠 CURTO PRAZO | Remover src/*.py (dark_theme, find_conflicts, fix_colors) | 5min | Médio (higiene) |
| 🟠 CURTO PRAZO | Unificar paleta: todos importando de theme.js | 2h | Médio (manutenibilidade) |
| 🟠 CURTO PRAZO | Remover assets duplicados (public/ vs src/assets/) | 15min | Baixo |
| 🟠 CURTO PRAZO | Extrair AuthContext do App.jsx | 3h | Alto (arquitetura) |
| 🟠 CURTO PRAZO | Substituir comunicação localStorage entre Extrato↔GrafoVinculos | 1h | Médio |
| 🟡 MÉDIO PRAZO | Adicionar Error Boundaries nos módulos | 2h | Alto (estabilidade) |
| 🟡 MÉDIO PRAZO | Mover tokens para sessionStorage (access) + memória (refresh) | 4h | Alto (segurança) |
| 🟡 MÉDIO PRAZO | Testes: Vitest + testes do api.js e Login | 1 dia | Alto (portfólio) |
| 🟢 LONGO PRAZO | React Router (ou hash router para Electron) | 1 dia | Médio |
| 🟢 LONGO PRAZO | CSP no electron.cjs | 2h | Médio (segurança Electron) |
| 🟢 LONGO PRAZO | Refatorar App.jsx → Layout + AppRouter | 1 dia | Médio |

---

## 6. NOTA DE PORTFÓLIO

**Pontos que vão chamar atenção positiva:**
- Design system próprio com `theme.js` — demonstra pensamento de escala
- `api.js` com refresh automático — não é o tutorial básico de fetch
- Splash screen durante boot do Python — UX de produto real
- Breadth: 20 módulos funcionando é impressionante

**Pontos de atenção em code review:**
- Componentes que bypassam `api.js` — inconsistência que indica desenvolvimento não coordenado
- `const C = {...}` duplicado em vários arquivos apesar do `theme.js` existir — não seguiu o próprio padrão
- Comunicação entre componentes via localStorage — red flag para desenvolvedor sênior
- Zero testes — será o primeiro comentário de qualquer tech lead

---

*Análise gerada em Junho 2026. Escopo: frontend `C:\Users\Administrador\agent-bastos-app\`*
