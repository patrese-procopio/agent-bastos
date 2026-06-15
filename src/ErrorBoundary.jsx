/**
 * ErrorBoundary.jsx — Agent Bastos
 * ─────────────────────────────────────────────────────────────────────────────
 * Captura exceções não tratadas em qualquer sub-árvore de componentes.
 * Sem isso, um crash em qualquer módulo derruba a tela inteira (tela branca).
 * Com isso, apenas o módulo com erro é substituído por uma mensagem amigável —
 * o resto do sistema continua funcionando normalmente.
 *
 * Por que classe e não hook?
 * React só suporta Error Boundaries com componentes de classe (lifecycles
 * componentDidCatch e getDerivedStateFromError). Não existe hook equivalente.
 *
 * Uso no App.jsx:
 *   import ErrorBoundary from "./ErrorBoundary"
 *   {active === "Chat RAG" && <ErrorBoundary modulo="Chat RAG"><ChatRAG /></ErrorBoundary>}
 */

import { Component } from "react"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: "" }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "Erro desconhecido" }
  }

  componentDidCatch(error, info) {
    // Log para facilitar debug — em produção pode enviar para serviço de monitoramento
    console.error(`[ErrorBoundary] Módulo: ${this.props.modulo || "?"}`, error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const modulo = this.props.modulo || "Módulo"

    return (
      <div style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        flex:           1,
        height:         "100%",
        background:     "#0B1120",
        fontFamily:     SANS,
        padding:        32,
      }}>
        <div style={{
          maxWidth:     480,
          background:   "rgba(239,68,68,0.08)",
          border:       "1px solid rgba(239,68,68,0.25)",
          borderRadius: 12,
          padding:      "28px 32px",
          textAlign:    "center",
        }}>
          {/* Ícone de alerta */}
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>

          <div style={{
            fontSize:      14,
            fontWeight:    800,
            color:         "#FCA5A5",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontFamily:    MONO,
            marginBottom:  8,
          }}>
            {modulo} — Falha ao renderizar
          </div>

          <p style={{
            fontSize:   14,
            color:      "#94A3B8",
            lineHeight: 1.7,
            margin:     "0 0 20px",
          }}>
            Ocorreu um erro inesperado neste módulo. Os demais módulos do sistema
            continuam operacionais. Recarregue o módulo ou reinicie o sistema.
          </p>

          {/* Detalhe técnico — útil em demo para mostrar que há tratamento */}
          <div style={{
            fontSize:     12,
            color:        "rgba(255,255,255,0.2)",
            fontFamily:   MONO,
            background:   "rgba(0,0,0,0.3)",
            borderRadius: 6,
            padding:      "8px 12px",
            textAlign:    "left",
            marginBottom: 20,
            wordBreak:    "break-all",
          }}>
            {this.state.message}
          </div>

          <button
            onClick={() => this.setState({ hasError: false, message: "" })}
            style={{
              padding:       "10px 24px",
              background:    "linear-gradient(135deg,#F59E0B,#B45309)",
              border:        "none",
              borderRadius:  8,
              color:         "#F1F5F9",
              fontSize:      13,
              fontWeight:    800,
              cursor:        "pointer",
              letterSpacing: "0.04em",
            }}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }
}
