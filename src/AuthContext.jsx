import { createContext, useContext, useState, useEffect } from "react"
import api from "./api"
import { getUser, clearSession } from "./authStore"

// AuthContext — Missão 34: isola toda a lógica de "quem está logado" que
// antes vivia misturada com estado de UI dentro do App.jsx (tabs, tema,
// busca, etc). Componentes filhos não sabem COMO a sessão é reidratada —
// só leem `user`/`authChecking` e chamam `login`/`logout` via useAuth().
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // user começa null — o access_token vive só em memória (Missão 33) e não
  // sobrevive a um reload de página. `authChecking` segura a tela de login
  // até tentarmos reidratar a sessão via refresh_token (useEffect abaixo).
  const [user, setUser]                 = useState(null)
  const [authChecking, setAuthChecking] = useState(true)

  // ── Reidratação de sessão no boot (Missão 33) ───────────────────────────
  // Sem isso, todo F5/reload derrubaria o usuário — o access_token some da
  // memória, mas o refresh_token continua no sessionStorage. Uma tentativa
  // silenciosa de refresh evita pedir login de novo sem reabrir o app.
  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const ok = await api.restoreSession()
      if (cancelado) return
      if (ok) {
        // O usuário salvo (username/level/modules) sobrevive no sessionStorage
        // só como cache de exibição — quem decide permissão é sempre o backend.
        setUser(getUser())
      }
      setAuthChecking(false)
    })()
    return () => { cancelado = true }
  }, [])

  // ── Logout automático quando token expira (api.js dispara 'ab:logout') ──
  useEffect(() => {
    function onSessionExpired() { setUser(null) }
    window.addEventListener("ab:logout", onSessionExpired)
    return () => window.removeEventListener("ab:logout", onSessionExpired)
  }, [])

  function login(data) {
    // Tokens já foram guardados pelo Login.jsx via authStore (memória + sessionStorage).
    setUser({ username: data.username, level: data.level, modules: data.modules || [] })
  }

  function logout() {
    clearSession()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, authChecking, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth() precisa ser chamado dentro de <AuthProvider>")
  return ctx
}
