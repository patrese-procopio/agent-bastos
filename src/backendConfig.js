// ═══════════════════════════════════════════════════════════════════════════════
// backendConfig.js — resolucao dinamica da URL do backend
//
// Em dev (Vite): usa /api-proxy (proxy configurado em vite.config.js).
// Em prod (Electron packaged): le a URL de `localStorage.ab_config.backendUrl`,
//   que e definida pelo usuario na tela Configuracoes -> Aba Geral. Se nao
//   houver valor salvo, cai no default 127.0.0.1:8000 (deploy single-host).
//
// Um cliente rodando na maquina do agente aponta pro IP do servidor central da
// agencia via essa mesma tela. O primeiro boot mostra uma tela de setup se
// backendUrl nao estiver definido (ver App.jsx).
// ═══════════════════════════════════════════════════════════════════════════════

// URL padrao pro piloto AIPEN (2026-09): tunel ngrok fixo apontando pro backend
// na maquina do coordenador. Amigos abrem o app e ja veem essa URL preenchida
// no SetupInicial — 2 cliques (Testar + Salvar) e ta conectado.
const DEFAULT_BACKEND = "https://avert-collage-manual.ngrok-free.dev"

function readStored() {
  try {
    return JSON.parse(localStorage.getItem("ab_config") || "{}")
  } catch {
    return {}
  }
}

// Cache da URL sincronizada com o Electron (fonte de verdade em prod).
// Populado por hydrateFromElectron() no boot do App.
let electronBackendUrl = null

// Retorna a ORIGEM do backend (ex: "http://192.168.10.50:8000"), sem barra final.
export function getBackendUrl() {
  if (import.meta.env.DEV) {
    // Em dev, o Vite proxeia /api-proxy -> backend local. A origem so importa
    // pra endpoints fora de /api (ex: /health) — cai no default local.
    return DEFAULT_BACKEND
  }
  // Em prod: Electron e a fonte de verdade (arquivo userData/bastos-config.json).
  // Se ja hidratamos, usa a URL do Electron. Senao, cai no localStorage (compat).
  if (electronBackendUrl) return electronBackendUrl
  const cfg = readStored()
  const url = (cfg.backendUrl || DEFAULT_BACKEND).trim()
  return url.replace(/\/+$/, "")
}

// Cache do source retornado pelo Electron: "file" (usuario salvou),
// "env" (MDM/GPO), "default" (fallback — precisa mostrar SetupInicial).
let electronBackendSource = null

// Hidrata a URL a partir do processo main (arquivo userData). Chamado no boot
// do App.jsx antes de qualquer fetch. Se rodar no browser puro (dev), noop.
// So espelha no localStorage se o Electron marcou como configurado explicitamente
// (source != "default") — senao o SetupInicial nunca apareceria.
export async function hydrateFromElectron() {
  if (import.meta.env.DEV) return null
  if (!window.electronAPI?.getBackend) return null
  try {
    const cfg = await window.electronAPI.getBackend()
    if (cfg?.backendUrl) {
      electronBackendUrl = cfg.backendUrl.replace(/\/+$/, "")
      electronBackendSource = cfg.source || "default"
      if (electronBackendSource !== "default") {
        // Config real (arquivo ou MDM) — espelha no localStorage pra tela Configuracoes
        const local = readStored()
        local.backendUrl = electronBackendUrl
        localStorage.setItem("ab_config", JSON.stringify(local))
      }
      return electronBackendUrl
    }
  } catch (e) {
    console.warn("hydrateFromElectron falhou:", e)
  }
  return null
}

// Retorna a base da API REST (ex: "http://192.168.10.50:8000/api").
// Em dev, retorna "/api-proxy" pra usar o proxy do Vite (sem CORS).
export function getApiBase() {
  if (import.meta.env.DEV) return "/api-proxy"
  return `${getBackendUrl()}/api`
}

// Grava nova URL. Em prod (Electron), grava no arquivo userData e pede reiniciar
// o app pra aplicar o novo CSP. Em dev/browser, grava no localStorage e dispara
// evento pra hot-swap.
// Retorna { ok, precisaReiniciar, erro? }.
export async function setBackendUrl(url) {
  const clean = normalizarBackendUrl(url)
  if (!clean || !/^https?:\/\//.test(clean)) {
    return { ok: false, erro: "URL invalida — precisa comecar com http:// ou https://" }
  }
  // Sempre atualiza o localStorage (a tela le daqui)
  const cfg = readStored()
  cfg.backendUrl = clean
  localStorage.setItem("ab_config", JSON.stringify(cfg))

  // Se estamos no Electron, grava tambem no arquivo userData (fonte de verdade
  // do processo main — o CSP e o splash leem daqui no proximo boot).
  if (window.electronAPI?.setBackend) {
    const r = await window.electronAPI.setBackend(clean)
    if (!r?.ok) return { ok: false, erro: r?.erro || "falha ao gravar" }
    electronBackendUrl = clean
    window.dispatchEvent(new CustomEvent("ab:backend-changed", { detail: clean }))
    return { ok: true, precisaReiniciar: true }
  }
  // Dev/browser: hot-swap sem restart
  electronBackendUrl = clean
  window.dispatchEvent(new CustomEvent("ab:backend-changed", { detail: clean }))
  return { ok: true, precisaReiniciar: false }
}

// True quando o usuario (ou MDM/GPO) ja configurou uma URL propria. Falsy quando
// o Electron so tem o fallback default — nesse caso o SetupInicial aparece.
// Dev sempre "configurado" (Vite proxy).
export function isBackendConfigured() {
  if (import.meta.env.DEV) return true
  // Em prod: fonte de verdade e o source do Electron (arquivo ou env = configurado).
  if (electronBackendSource !== null) {
    return electronBackendSource === "file" || electronBackendSource === "env"
  }
  // Fallback: se hydrate ainda nao rodou (nao deveria acontecer), le localStorage
  const cfg = readStored()
  return typeof cfg.backendUrl === "string" && cfg.backendUrl.trim().length > 0
}

// Reinicia o app (Electron) pra aplicar novo CSP apos trocar backend.
export async function relaunchApp() {
  if (window.electronAPI?.relaunch) {
    await window.electronAPI.relaunch()
  } else {
    window.location.reload()
  }
}

// Apaga a URL configurada e reinicia. No proximo boot cai no fallback default
// e mostra SetupInicial pra o operador informar uma URL nova. Usado pela tela
// de Login quando o backend esta offline e o operador precisa trocar de
// servidor (ou o tunel caiu e voltou em outra URL).
export async function resetBackendConfig() {
  if (window.electronAPI?.clearBackend) {
    await window.electronAPI.clearBackend()
  }
  // Zera cache local e localStorage tambem
  electronBackendUrl = null
  electronBackendSource = null
  try {
    const cfg = readStored()
    delete cfg.backendUrl
    localStorage.setItem("ab_config", JSON.stringify(cfg))
  } catch { /* noop */ }
  await relaunchApp()
}

// Normaliza a URL colada pelo usuario:
// - remove barras/whitespace do final
// - se colou terminando em /health, /api, /api/, /docs etc., corta pra origem
//   (evita duplicar /health e retornar 404)
function normalizarBackendUrl(raw) {
  let u = (raw || "").trim().replace(/\/+$/, "")
  // Corta caminhos comuns que usuarios costumam colar por engano
  u = u.replace(/\/(health|api\/health|api|docs|redoc)$/i, "")
  return u
}

// Testa conectividade contra /health do backend configurado.
// Usado no setup inicial e na tela Configuracoes -> "Testar conexao".
export async function pingBackend(url) {
  const target = normalizarBackendUrl(url || getBackendUrl())
  try {
    const res = await fetch(`${target}/health`, {
      signal: AbortSignal.timeout(5000),
      // Ngrok grátis mostra tela intersticial text/plain sem esse header —
      // sem ele o /health "responderia 200" com HTML de aviso e o pingBackend
      // acharia que o backend esta OK quando na verdade nem chegou nele.
      headers: { "ngrok-skip-browser-warning": "true" },
    })
    if (!res.ok) return { ok: false, erro: `HTTP ${res.status}` }
    // Confere se a resposta e JSON de verdade (nao a tela intersticial do ngrok)
    const ct = (res.headers.get("content-type") || "").toLowerCase()
    if (!ct.includes("json")) {
      return { ok: false, erro: "resposta inesperada (nao-JSON) — verifique a URL" }
    }
    const data = await res.json().catch(() => ({}))
    return { ok: true, dados: data }
  } catch (e) {
    return { ok: false, erro: e?.message || "sem resposta" }
  }
}
