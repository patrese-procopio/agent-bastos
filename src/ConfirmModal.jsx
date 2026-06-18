/**
 * ConfirmModal.jsx — Modal de confirmação global
 *
 * Uso em qualquer componente:
 *   import { confirm } from "./ConfirmModal"
 *
 *   confirm({
 *     title:        "Remover líder",
 *     description:  "Esta ação não pode ser desfeita. O líder será excluído permanentemente.",
 *     confirmLabel: "Remover",
 *     destructive:  true,
 *     onConfirm:    () => deletarLider(id),
 *   })
 *
 * Em App.jsx: <ConfirmModalContainer /> dentro do root div (uma vez só)
 */
import { useState, useCallback, useEffect } from "react"

const MONO = "'JetBrains Mono','Roboto Mono',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

// ── Singleton ────────────────────────────────────────────────────────────────
let _open = null

export function confirm(config) {
  if (!_open) { if (import.meta.env.DEV) console.warn("[ConfirmModal] ConfirmModalContainer não montado."); return }
  _open(config)
}

// ── Container — montar UMA VEZ em App.jsx ───────────────────────────────────
export function ConfirmModalContainer() {
  const [modal, setModal]     = useState(null)
  const [visible, setVisible] = useState(false)

  _open = useCallback((config) => {
    setModal(config)
    // micro-delay para a transição de entrada funcionar
    setTimeout(() => setVisible(true), 10)
  }, [])

  function close() {
    setVisible(false)
    setTimeout(() => setModal(null), 220)
  }

  function handleConfirm() {
    modal?.onConfirm?.()
    close()
  }

  // Fecha com Escape
  useEffect(() => {
    if (!modal) return
    function onKey(e) { if (e.key === "Escape") close() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [modal])

  if (!modal) return null

  const isDestructive = modal.destructive !== false // default true para segurança

  return (
    // Overlay
    <div
      onClick={close}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.2s ease",
      }}>
      {/* Modal */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 420, borderRadius: 14,
          background: "rgba(11,17,32,0.98)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.70), 0 0 0 1px rgba(232,160,32,0.06)",
          overflow: "hidden",
          transform: visible ? "scale(1) translateY(0)" : "scale(0.95) translateY(-8px)",
          transition: "transform 0.22s cubic-bezier(0.16,1,0.3,1)",
        }}>

        {/* Barra de aviso (destrutivo = vermelho) */}
        <div style={{
          height: 3,
          background: isDestructive
            ? "linear-gradient(90deg,#EF4444,#DC2626)"
            : "linear-gradient(90deg,#E8A020,#F59E0B)",
        }}/>

        {/* Body */}
        <div style={{padding: "24px 24px 20px"}}>

          {/* Ícone */}
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: isDestructive ? "rgba(239,68,68,0.12)" : "rgba(232,160,32,0.10)",
            border: `1px solid ${isDestructive ? "rgba(239,68,68,0.28)" : "rgba(232,160,32,0.25)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 16,
          }}>
            {isDestructive ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="#F87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/>
                <path d="M9 6V4h6v2"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="#E8A020" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            )}
          </div>

          {/* Título */}
          <div style={{
            fontSize: 17, fontWeight: 800, color: "#F1F5F9",
            fontFamily: SANS, letterSpacing: "-0.01em", marginBottom: 8,
          }}>
            {modal.title || "Confirmar ação"}
          </div>

          {/* Descrição */}
          {modal.description && (
            <div style={{
              fontSize: 13, color: "rgba(255,255,255,0.50)",
              fontFamily: SANS, lineHeight: 1.55, marginBottom: 4,
            }}>
              {modal.description}
            </div>
          )}

          {/* Aviso destrutivo */}
          {isDestructive && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 10px", borderRadius: 7, marginTop: 14,
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.20)",
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="#F87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span style={{fontSize: 11, color: "#FCA5A5", fontFamily: MONO, fontWeight: 700}}>
                Esta ação não pode ser desfeita
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", gap: 8, padding: "0 24px 20px",
          justifyContent: "flex-end",
        }}>
          {/* Cancelar */}
          <button
            onClick={close}
            style={{
              padding: "8px 18px", borderRadius: 8, cursor: "pointer",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.70)", fontSize: 13, fontWeight: 600,
              fontFamily: SANS, transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.10)" }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)" }}>
            Cancelar
          </button>

          {/* Confirmar */}
          <button
            onClick={handleConfirm}
            style={{
              padding: "8px 20px", borderRadius: 8, cursor: "pointer",
              background: isDestructive ? "#DC2626" : "#E8A020",
              border: "none",
              color: "#FFF", fontSize: 13, fontWeight: 800,
              fontFamily: MONO, letterSpacing: "0.03em",
              transition: "all 0.15s",
              boxShadow: isDestructive
                ? "0 0 0 0 rgba(239,68,68,0)"
                : "0 0 0 0 rgba(232,160,32,0)",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = isDestructive ? "#EF4444" : "#F59E0B"
              e.currentTarget.style.boxShadow  = isDestructive
                ? "0 4px 16px rgba(239,68,68,0.45)"
                : "0 4px 16px rgba(232,160,32,0.45)"
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = isDestructive ? "#DC2626" : "#E8A020"
              e.currentTarget.style.boxShadow  = "0 0 0 0 transparent"
            }}>
            {modal.confirmLabel || "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  )
}
