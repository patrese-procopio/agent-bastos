// src/Login.jsx
import { useState } from "react"
import api from "./api"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState("")

  async function handleLogin(e) {
    e.preventDefault()
    if (!username || !password) return
    setLoading(true)
    setError("")
    try {
      const res  = await api.login(username, password)
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail || "Credenciais inválidas")
        return
      }
      // Salva tokens e dados do usuário
      localStorage.setItem("ab_access_token",  data.access_token)
      localStorage.setItem("ab_refresh_token", data.refresh_token)
      localStorage.setItem("ab_user", JSON.stringify({
        username: data.username,
        level:    data.level,
        modules:  data.modules,
      }))
      onLogin(data)
    } catch {
      setError("Sem conexão com o servidor")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100vh", background: "#0B1120", fontFamily: SANS,
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='28' height='28' viewBox='0 0 28 28' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1' cy='1' r='0.9' fill='%23FFFFFF' fill-opacity='0.04'/%3E%3C/svg%3E")`,
    }}>
      <div style={{
        width: 400, background: "#111827",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16, padding: "40px 36px",
        boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
      }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            border: "2px solid rgba(245,158,11,0.85)",
            background: "rgba(245,158,11,0.1)",
            boxShadow: "0 0 20px rgba(245,158,11,0.3)",
            margin: "0 auto 16px",
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden",
          }}>
            <img src="./src/assets/logo.png" alt="AB"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={e => { e.target.style.display = "none" }}
            />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9", letterSpacing: "-0.01em" }}>
            Agent Bastos
          </div>
          <div style={{ fontSize: 11, color: "#F59E0B", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, marginTop: 4 }}>
            Inteligência Soberana
          </div>
        </div>

        {/* Formulário */}
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
              Usuário
            </label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              style={{
                width: "100%", padding: "11px 14px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, fontSize: 15, color: "#F1F5F9",
                outline: "none", fontFamily: SANS,
                boxSizing: "border-box",
              }}
              placeholder="seu.usuario"
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                width: "100%", padding: "11px 14px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, fontSize: 15, color: "#F1F5F9",
                outline: "none", fontFamily: SANS,
                boxSizing: "border-box",
              }}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div style={{
              padding: "10px 14px", borderRadius: 8,
              background: "rgba(220,38,38,0.1)",
              border: "1px solid rgba(220,38,38,0.3)",
              fontSize: 13, color: "#FCA5A5", fontFamily: MONO,
            }}>
              ⚠ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 6, padding: "12px",
              background: loading ? "rgba(180,83,9,0.5)" : "linear-gradient(135deg,#F59E0B,#B45309)",
              border: "none", borderRadius: 8,
              fontSize: 14, fontWeight: 800, color: "#F1F5F9",
              cursor: loading ? "not-allowed" : "pointer",
              letterSpacing: "0.04em",
              boxShadow: loading ? "none" : "0 4px 14px rgba(180,83,9,0.4)",
            }}>
            {loading ? "Autenticando..." : "Acessar Sistema"}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: MONO }}>
          AIPEN · SEAP-AM · Sistema Restrito
        </div>
      </div>
    </div>
  )
}