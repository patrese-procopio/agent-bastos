import { useState, useRef, useEffect } from "react"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const GLOBAL_CSS = `
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes thinking {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }
  @keyframes pulse-dot {
    0%, 100% { box-shadow: 0 0 4px 1px rgba(22,163,74,0.5); }
    50% { box-shadow: 0 0 10px 3px rgba(22,163,74,0.85); }
  }
  .msg-enter { animation: fadeIn 0.25s ease forwards; }
  .dot1 { animation: thinking 1.2s ease infinite 0s; }
  .dot2 { animation: thinking 1.2s ease infinite 0.2s; }
  .dot3 { animation: thinking 1.2s ease infinite 0.4s; }
  .live-dot { animation: pulse-dot 2.5s ease-in-out infinite; }
  .fonte-item:hover { background: #FFFBEB !important; border-color: rgba(180,83,9,0.3) !important; }
  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 4px; }
`

function scoreColor(s) {
  if (s >= 75) return "#16A34A"
  if (s >= 50) return "#D97706"
  return "#DC2626"
}

function scoreLabel(s) {
  if (s >= 75) return "Alta confiança"
  if (s >= 50) return "Confiança média"
  return "Baixa confiança"
}

export default function ChatRAG({ onNavigate }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [fontes, setFontes] = useState([])
  const [fonteAtiva, setFonteAtiva] = useState(null)
  const chatEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    const style = document.createElement("style")
    style.textContent = GLOBAL_CSS
    document.head.appendChild(style)
    inputRef.current?.focus()
    return () => document.head.removeChild(style)
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  async function enviar() {
    const pergunta = input.trim()
    if (!pergunta || loading) return
    setInput("")
    setFontes([])
    setFonteAtiva(null)
    setMessages(prev => [...prev, { role: "user", text: pergunta }])
    setLoading(true)
    try {
      const res = await fetch("http://127.0.0.1:8000/chat-rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pergunta })
      })
      const data = await res.json()
      setMessages(prev => [...prev, {
        role: "bastos",
        text: data.resposta,
        confianca: data.confianca,
        fontes: data.fontes || []
      }])
      setFontes(data.fontes || [])
    } catch {
      setMessages(prev => [...prev, {
        role: "bastos",
        text: "FALHA: sem conexão com o backend.",
        confianca: 0,
        fontes: []
      }])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar() }
  }

  function limpar() {
    setMessages([])
    setFontes([])
    setFonteAtiva(null)
    inputRef.current?.focus()
  }

  function exportar() {
    if (!messages.length) return
    const agora = new Date().toLocaleString("pt-BR")
    const linhas = [
      "AGENT BASTOS — Exportação Chat RAG",
      "Data: " + agora,
      "─".repeat(60), ""
    ]
    messages.forEach(m => {
      linhas.push(m.role === "user" ? "[AGENTE] " + m.text : "[BASTOS-UNIT] " + m.text)
      if (m.confianca) linhas.push("  Confiança: " + m.confianca + "%")
      if (m.fontes && m.fontes.length) {
        linhas.push("  Fontes:")
        m.fontes.forEach(f => linhas.push("    · " + f.fonte + " (" + f.score + "%)"))
      }
      linhas.push("")
    })
    const blob = new Blob([linhas.join("\n")], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "bastos_chat_" + Date.now() + ".txt"
    a.click()
    URL.revokeObjectURL(url)
  }

  const now = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  const ultimaBastos = messages.filter(m => m.role === "bastos").at(-1)

  return (
    <div style={S.page}>

      {/* PAINEL DE FONTES */}
      <aside style={S.aside}>
        <div style={S.asideHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6D28D9" strokeWidth="2" strokeLinecap="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
            <span style={{ fontSize: 10, fontWeight: 800, color: "#334155", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Base Doutrinária
            </span>
          </div>
          <span style={{ fontSize: 9, color: "#B45309", fontWeight: 700, fontFamily: MONO, background: "#FEF3C7", padding: "2px 6px", borderRadius: 4, border: "1px solid #FDE68A" }}>
            710 chunks
          </span>
        </div>

        {/* Confiança geral */}
        {ultimaBastos && ultimaBastos.confianca != null && (
          <div style={S.confiancaBox}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: "#334155", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: MONO }}>
                Confiança
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: scoreColor(ultimaBastos.confianca), fontFamily: MONO }}>
                {ultimaBastos.confianca}%
              </span>
            </div>
            <div style={{ height: 6, background: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: ultimaBastos.confianca + "%", background: scoreColor(ultimaBastos.confianca), borderRadius: 3, transition: "width 0.6s ease" }}/>
            </div>
            <span style={{ fontSize: 9, color: scoreColor(ultimaBastos.confianca), fontWeight: 600, marginTop: 4, display: "block", fontFamily: MONO }}>
              {scoreLabel(ultimaBastos.confianca)}
            </span>
          </div>
        )}

        {/* Fontes usadas */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
          {fontes.length > 0 ? (
            <>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8, fontFamily: MONO }}>
                Trechos Utilizados
              </div>
              {fontes.map((f, i) => (
                <div
                  key={i}
                  className="fonte-item"
                  onClick={() => setFonteAtiva(fonteAtiva && fonteAtiva.id === f.id ? null : f)}
                  style={{
                    padding: "10px 12px",
                    background: fonteAtiva && fonteAtiva.id === f.id ? "#FFFBEB" : "#FFFFFF",
                    border: "1px solid",
                    borderColor: fonteAtiva && fonteAtiva.id === f.id ? "rgba(180,83,9,0.4)" : "#E2E8F0",
                    borderRadius: 8,
                    marginBottom: 6,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 8, fontWeight: 700, fontFamily: MONO, background: "#EDE9FE", color: "#6D28D9", padding: "1px 5px", borderRadius: 3, flexShrink: 0 }}>
                        T{f.id}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.fonte.replace(".txt", "").replace(".pdf", "").replace(/_/g, " ")}
                      </span>
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 700, fontFamily: MONO, flexShrink: 0, color: scoreColor(f.score) }}>
                      {f.score}%
                    </span>
                  </div>
                  <div style={{ height: 3, background: "#F1F5F9", borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: f.score + "%", background: scoreColor(f.score), borderRadius: 2 }}/>
                  </div>
                  {fonteAtiva && fonteAtiva.id === f.id && (
                    <div style={{ marginTop: 8, padding: "8px", background: "#F8FAFC", borderRadius: 5, border: "1px solid #E2E8F0" }}>
                      <p style={{ fontSize: 10, color: "#475569", lineHeight: 1.55, fontFamily: MONO, margin: 0 }}>
                        "{f.trecho}..."
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "30px 16px", gap: 8 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <p style={{ fontSize: 11, color: "#94A3B8", textAlign: "center", lineHeight: 1.5, fontFamily: MONO, margin: 0 }}>
                As fontes aparecem aqui após cada consulta
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "10px 14px", borderTop: "1px solid #E2E8F0", background: "#F1F5F9", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#16A34A", boxShadow: "0 0 5px rgba(22,163,74,0.7)" }}/>
            <span style={{ fontSize: 9, color: "#475569", fontFamily: MONO }}>ChromaDB · 710 chunks</span>
          </div>
          <span style={{ fontSize: 9, color: "#94A3B8", fontFamily: MONO }}>multilingual-e5-small</span>
        </div>
      </aside>

      {/* ÁREA DE CHAT */}
      <div style={S.chatArea}>

        {/* Header */}
        <div style={S.chatHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="live-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: "#16A34A", flexShrink: 0 }}/>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Chat RAG</div>
              <div style={{ fontSize: 9, color: "#64748B", fontFamily: MONO, marginTop: 1 }}>
                BASTOS-UNIT · Doutrina Nacional · LLaMA 70b
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 9, color: "#94A3B8", fontFamily: MONO }}>{messages.length} mensagens</span>
            <button
              onClick={exportar}
              disabled={messages.length === 0}
              style={{ ...S.headerBtn, opacity: messages.length === 0 ? 0.4 : 1, cursor: messages.length === 0 ? "not-allowed" : "pointer" }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Exportar
            </button>
            <button
              onClick={limpar}
              disabled={messages.length === 0}
              style={{ ...S.headerBtn, color: "#DC2626", borderColor: "rgba(220,38,38,0.2)", background: "rgba(220,38,38,0.04)", opacity: messages.length === 0 ? 0.4 : 1, cursor: messages.length === 0 ? "not-allowed" : "pointer" }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/>
              </svg>
              Limpar
            </button>
          </div>
        </div>

        {/* Mensagens */}
        <div style={S.messages}>
          {messages.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 8, padding: "40px", minHeight: "200px" }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.2" strokeLinecap="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <p style={{ fontSize: 13, color: "#94A3B8", fontWeight: 500, margin: "6px 0 2px" }}>Consulte a base doutrinária</p>
              <p style={{ fontSize: 11, color: "#CBD5E1", fontFamily: MONO, margin: 0 }}>Faça uma pergunta para iniciar a análise</p>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className="msg-enter" style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "78%", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{
                background: m.role === "user" ? "#0F172A" : "#FFFFFF",
                borderRadius: 6,
                borderLeft: m.role === "bastos" ? "3px solid #EAB308" : "none",
                border: m.role === "user" ? "none" : "1px solid #E2E8F0",
                padding: "10px 14px",
                fontSize: 13,
                color: m.role === "user" ? "#FFFFFF" : "#1E293B",
                lineHeight: 1.7,
                boxShadow: m.role === "user" ? "0 4px 16px rgba(15,23,42,0.2)" : "0 2px 8px rgba(0,0,0,0.06)",
              }}>
                {m.role === "bastos" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 9, color: "#B45309", fontWeight: 700, letterSpacing: "0.14em", fontFamily: MONO }}>◈ BASTOS-UNIT</span>
                    <span style={{ fontSize: 9, color: "#94A3B8", fontFamily: MONO }}>· {now}</span>
                  </div>
                )}
                {m.text}
              </div>

              {m.role === "bastos" && m.confianca != null && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 4, flexWrap: "wrap" }}>
                  <div style={{ width: 140, height: 3, background: "#F1F5F9", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: m.confianca + "%", background: scoreColor(m.confianca), borderRadius: 2, transition: "width 0.6s ease" }}/>
                  </div>
                  <span style={{ fontSize: 9, color: scoreColor(m.confianca), fontWeight: 700, fontFamily: MONO }}>
                    {m.confianca}% · {scoreLabel(m.confianca)}
                  </span>
                  {m.fontes && m.fontes.length > 0 && (
                    <div style={{ display: "flex", gap: 4 }}>
                      {m.fontes.map((f, j) => (
                        <span key={j} style={{ fontSize: 8, fontWeight: 700, fontFamily: MONO, background: "#EDE9FE", color: "#6D28D9", padding: "1px 5px", borderRadius: 3 }}>
                          T{f.id}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "#FFFFFF", border: "1px solid #E2E8F0", borderLeft: "3px solid #EAB308", borderRadius: 6, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <span style={{ fontSize: 9, color: "#B45309", fontWeight: 700, letterSpacing: "0.14em", fontFamily: MONO }}>◈ BASTOS-UNIT</span>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <div className="dot1" style={{ width: 5, height: 5, borderRadius: "50%", background: "#B45309" }}/>
                <div className="dot2" style={{ width: 5, height: 5, borderRadius: "50%", background: "#B45309" }}/>
                <div className="dot3" style={{ width: 5, height: 5, borderRadius: "50%", background: "#B45309" }}/>
              </div>
              <span style={{ fontSize: 10, color: "#94A3B8", fontFamily: MONO }}>consultando doutrina...</span>
            </div>
          )}

          <div ref={chatEndRef}/>
        </div>

        {/* Input */}
        <div style={S.inputArea}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ width: 34, height: 34, borderRadius: 7, background: "#FEF3C7", border: "1px solid #FDE68A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="1.5" strokeLinecap="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <input
              ref={inputRef}
              style={S.input}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Consulte doutrinas, regulamentos ou procedimentos..."
              disabled={loading}
            />
            <button
              onClick={enviar}
              disabled={loading || !input.trim()}
              style={{ ...S.sendBtn, opacity: loading || !input.trim() ? 0.4 : 1, cursor: loading || !input.trim() ? "not-allowed" : "pointer" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
          <p style={{ fontSize: 10, color: "rgba(0,0,0,0.45)", textAlign: "center", marginTop: 7, fontFamily: MONO, fontWeight: 500, letterSpacing: "0.03em" }}>
            Pressione Enter para enviar · Respostas baseadas exclusivamente na base doutrinária indexada
          </p>
        </div>
      </div>
    </div>
  )
}

const S = {
  page: { display: "flex", flex: 1, minWidth: 0, height: "100%", overflow: "hidden" },
  aside: { width: 268, flexShrink: 0, background: "#F8FAFC", borderRight: "1px solid #E2E8F0", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" },
  asideHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 14px 10px", borderBottom: "1px solid #E2E8F0", flexShrink: 0 },
  confiancaBox: { margin: "10px 12px", padding: "10px 12px", background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.05)", flexShrink: 0 },
  chatArea: { display: "flex", flexDirection: "column", flex: 1, minWidth: 0, height: "100%", overflow: "hidden", background: "#FFFFFF", minHeight: 0 },
  chatHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid #E2E8F0", background: "#FFFFFF", flexShrink: 0, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" },
  headerBtn: { display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500, color: "#475569", background: "rgba(255,255,255,0.8)", border: "1px solid #E2E8F0", cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit" },
  messages: { flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12, justifyContent: "flex-end" },
  inputArea: { padding: "10px 18px 12px", borderTop: "1px solid #E2E8F0", background: "#FFFFFF", flexShrink: 0, boxShadow: "0 -1px 3px rgba(0,0,0,0.04)" },
  input: { flex: 1, background: "#F8FAFC", border: "1px solid #CBD5E1", borderRadius: 7, padding: "10px 14px", fontSize: 13, color: "#0F172A", outline: "none", fontFamily: "inherit", transition: "border-color 0.2s" },
  sendBtn: { width: 36, height: 36, background: "linear-gradient(135deg,#F59E0B,#B45309)", border: "none", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 12px rgba(180,83,9,0.3)", transition: "opacity 0.2s" },
}
