/**
 * Toast.jsx — Sistema global de notificações
 *
 * Uso em qualquer componente (sem Context, sem Provider):
 *   import { toast } from "./Toast"
 *   toast.success("Salvo com sucesso!")
 *   toast.error("Erro ao remover.")
 *   toast.info("Exportando PDF...")
 *   toast.warn("Sessão expirando em 5 min")
 *
 * Em App.jsx: <ToastContainer /> dentro do root div (uma vez só)
 */
import { useState, useCallback, useEffect } from "react"

// ── Singleton: referência para o setter do container ────────────────────────
let _push = null

function pushToast(msg, type = "info", duration = 3500) {
  if (!_push) { console.warn("[Toast] ToastContainer não montado ainda."); return }
  _push({ id: Date.now() + Math.random(), msg, type, duration })
}

export const toast = {
  success: (msg, d) => pushToast(msg, "success", d),
  error:   (msg, d) => pushToast(msg, "error",   d ?? 5000),
  info:    (msg, d) => pushToast(msg, "info",     d),
  warn:    (msg, d) => pushToast(msg, "warn",     d),
}

// ── Ícones por tipo ─────────────────────────────────────────────────────────
const ICONS = {
  success: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  error: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  warn: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  info: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
}

const COLORS = {
  success: { bg: "rgba(16,42,26,0.97)", border: "rgba(34,197,94,0.35)",  icon: "#22C55E", bar: "#22C55E" },
  error:   { bg: "rgba(42,10,10,0.97)", border: "rgba(239,68,68,0.40)",  icon: "#F87171", bar: "#EF4444" },
  warn:    { bg: "rgba(40,28,8,0.97)",  border: "rgba(251,191,36,0.35)", icon: "#FBBF24", bar: "#F59E0B" },
  info:    { bg: "rgba(10,20,42,0.97)", border: "rgba(96,165,250,0.35)", icon: "#60A5FA", bar: "#3B82F6" },
}

const MONO = "'JetBrains Mono','Roboto Mono',monospace"

// ── Item individual do toast ────────────────────────────────────────────────
function ToastItem({ item, onRemove }) {
  const [visible, setVisible] = useState(false)
  const c = COLORS[item.type] || COLORS.info

  // Entrada suave
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  function dismiss() {
    setVisible(false)
    setTimeout(() => onRemove(item.id), 280)
  }

  useEffect(() => {
    const t = setTimeout(dismiss, item.duration)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      onClick={dismiss}
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "11px 14px 11px 12px",
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3)",
        cursor: "pointer",
        minWidth: 260, maxWidth: 380,
        position: "relative", overflow: "hidden",
        // Transição de entrada/saída
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : "translateX(24px)",
        transition: "opacity 0.25s ease, transform 0.25s cubic-bezier(0.16,1,0.3,1)",
        backdropFilter: "blur(12px)",
      }}>
      {/* Ícone */}
      <div style={{
        color: c.icon, flexShrink: 0, marginTop: 1,
        display: "flex", alignItems: "center"
      }}>
        {ICONS[item.type]}
      </div>
      {/* Texto */}
      <span style={{
        fontSize: 13, fontWeight: 600, color: "#F1F5F9",
        fontFamily: MONO, lineHeight: 1.4, flex: 1
      }}>
        {item.msg}
      </span>
      {/* Barra de progresso */}
      <div style={{
        position: "absolute", bottom: 0, left: 0,
        height: 2, background: c.bar, borderRadius: "0 0 10px 10px",
        animation: `toast-progress ${item.duration}ms linear forwards`,
      }}/>
      <style>{`
        @keyframes toast-progress {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  )
}

// ── Container — montar UMA VEZ em App.jsx ──────────────────────────────────
export function ToastContainer() {
  const [toasts, setToasts] = useState([])

  // Registra o setter global
  _push = useCallback((t) => {
    setToasts(prev => [...prev.slice(-4), t]) // máx 5 simultâneos
  }, [])

  const remove = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: "fixed", bottom: 20, right: 20,
      display: "flex", flexDirection: "column", gap: 8,
      zIndex: 9999, pointerEvents: "none",
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{ pointerEvents: "auto" }}>
          <ToastItem item={t} onRemove={remove}/>
        </div>
      ))}
    </div>
  )
}
