// authStore.js — Guarda de sessão do Agent Bastos
// ============================================================================
// Missão 33 (hardening de frontend): antes, access_token, refresh_token e
// ab_user viviam direto no localStorage — acessível a QUALQUER script que
// rode na página, inclusive um script injetado via XSS. Não é hipotético:
// era exatamente o item "ALTA — Tokens JWT em localStorage" do levantamento
// técnico do frontend.
//
// A mudança:
//   - access_token → variável de módulo, só em memória. Nunca toca disco,
//     nunca aparece em DevTools > Application > Storage. Some sozinho ao
//     fechar ou recarregar a janela — só existe enquanto o processo React
//     está de pé.
//   - refresh_token → sessionStorage. Ainda é acessível via JS (Electron não
//     dá pra usar cookie httpOnly sem reescrever o fluxo de auth pro backend
//     setar Set-Cookie, o que é um passo maior), mas sessionStorage já corta
//     a exposição pela metade: some ao fechar a janela, ao contrário do
//     localStorage que persistia pra sempre até logout manual. Numa máquina
//     compartilhada (comum em ambiente operacional), isso importa.
//   - ab_user (username/level/modules — não é segredo, só dado de exibição)
//     segue o mesmo ciclo de vida do refresh_token por consistência.
// ============================================================================

let accessToken = null

export function getAccessToken() {
  return accessToken
}

export function setAccessToken(token) {
  accessToken = token
}

export function getRefreshToken() {
  return sessionStorage.getItem("ab_refresh_token")
}

export function setTokens(access, refresh) {
  accessToken = access
  if (refresh) sessionStorage.setItem("ab_refresh_token", refresh)
}

export function getUser() {
  try {
    const raw = sessionStorage.getItem("ab_user")
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setUser(user) {
  if (user) sessionStorage.setItem("ab_user", JSON.stringify(user))
  else sessionStorage.removeItem("ab_user")
}

// Chamado no logout (manual ou automático via 401 sem refresh válido).
export function clearSession() {
  accessToken = null
  sessionStorage.removeItem("ab_refresh_token")
  sessionStorage.removeItem("ab_user")
}
