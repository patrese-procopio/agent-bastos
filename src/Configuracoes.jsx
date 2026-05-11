/**
 * Configuracoes.jsx — Agent Bastos
 * Tela de configurações com 3 abas:
 *   1. Geral       — identidade da agência, backend URL, tema
 *   2. Agenda      — CRUD de missões integrado ao Firebase via backend
 *   3. Conexões    — status dos serviços (backend, Firebase, n8n)
 */

import { useState, useEffect } from "react"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const GLOBAL_CSS = `
  @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin    { to{transform:rotate(360deg)} }
  .cfg-enter  { animation: fadeIn 0.2s ease forwards; }
  .spin       { animation: spin 1s linear infinite; }
  .cfg-input:focus { border-color: #B45309 !important; box-shadow: 0 0 0 3px rgba(180,83,9,0.1) !important; }
  .cfg-row:hover  { background: #FFFBEB !important; }
  ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:4px}
`

// ─── Dados iniciais ────────────────────────────────────────────────────────────
const NUCLEOS = {
  NI:      "Núcleo de Inteligência",
  NCI:     "Núcleo de Contrainteligência",
  NBE:     "Núcleo de Busca Eletrônica",
  NUCADIS: "Núcleo de Coleta e Análise",
  AIPEN:   "Assessoria de Inteligência (TODOS)",
}

const STATUS_COLORS = {
  online:     { dot:"#16A34A", bg:"#F0FDF4", border:"#86EFAC", label:"ONLINE"     },
  offline:    { dot:"#DC2626", bg:"#FEF2F2", border:"#FCA5A5", label:"OFFLINE"    },
  checking:   { dot:"#D97706", bg:"#FFFBEB", border:"#FCD34D", label:"VERIFICANDO"},
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTs(ts) {
  if (!ts) return "—"
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"2-digit" })
    + " " + d.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })
}

// ─── Subcomponente: Badge de status ──────────────────────────────────────────
function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.offline
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:5,
      padding:"3px 9px", borderRadius:20,
      background:c.bg, border:`1px solid ${c.border}`,
    }}>
      <div style={{
        width:6, height:6, borderRadius:"50%", background:c.dot,
        boxShadow: status==="online" ? `0 0 5px ${c.dot}` : "none",
      }}/>
      <span style={{fontSize:9, fontWeight:700, color:c.dot, fontFamily:MONO, letterSpacing:"0.06em"}}>
        {c.label}
      </span>
    </div>
  )
}

// ─── Subcomponente: Campo de input ────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, type="text", hint }) {
  return (
    <div style={{display:"flex", flexDirection:"column", gap:5}}>
      <label style={{fontSize:10, fontWeight:700, color:"#334155", letterSpacing:"0.06em", textTransform:"uppercase", fontFamily:MONO}}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="cfg-input"
        style={{
          padding:"9px 12px", borderRadius:7, fontSize:12, color:"#0F172A",
          border:"1px solid #CBD5E1", background:"#F8FAFC", outline:"none",
          fontFamily:"inherit", transition:"border-color 0.2s, box-shadow 0.2s",
        }}
      />
      {hint && <span style={{fontSize:10, color:"#94A3B8", fontFamily:MONO}}>{hint}</span>}
    </div>
  )
}

// ─── Subcomponente: Seção com título ─────────────────────────────────────────
function Section({ title, icon, children }) {
  return (
    <div style={{background:"#FFFFFF", border:"1px solid #E2E8F0", borderRadius:10, overflow:"hidden", boxShadow:"0 2px 6px rgba(0,0,0,0.04)"}}>
      <div style={{
        display:"flex", alignItems:"center", gap:8,
        padding:"12px 16px", borderBottom:"1px solid #F1F5F9",
        background:"#F8FAFC",
      }}>
        {icon}
        <span style={{fontSize:10, fontWeight:800, color:"#334155", letterSpacing:"0.1em", textTransform:"uppercase"}}>{title}</span>
      </div>
      <div style={{padding:"16px", display:"flex", flexDirection:"column", gap:14}}>
        {children}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA — GERAL
// ═══════════════════════════════════════════════════════════════════════════════
function AbaGeral({ darkMode, setDarkMode }) {
  const stored = JSON.parse(localStorage.getItem("ab_config") || "{}")
  const [agencia,    setAgencia]    = useState(stored.agencia    || "AIPEN — Assessoria de Inteligência Penitenciária")
  const [estado,     setEstado]     = useState(stored.estado     || "AM")
  const [backendUrl, setBackendUrl] = useState(stored.backendUrl || "http://127.0.0.1:8000")
  const [n8nUrl,     setN8nUrl]     = useState(stored.n8nUrl     || "http://localhost:5678")
  const [salvo,      setSalvo]      = useState(false)

  function salvar() {
    localStorage.setItem("ab_config", JSON.stringify({ agencia, estado, backendUrl, n8nUrl }))
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2500)
  }

  return (
    <div className="cfg-enter" style={{display:"flex", flexDirection:"column", gap:16, maxWidth:640}}>

      <Section title="Identidade da Agência" icon={
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      }>
        <Field label="Nome da Agência / Empresa" value={agencia} onChange={setAgencia} placeholder="Ex: AIPEN — Assessoria de Inteligência" hint="Aparece nos relatórios e no rodapé do sistema."/>
        <Field label="Estado / UF" value={estado} onChange={setEstado} placeholder="Ex: AM"/>
      </Section>

      <Section title="Conexões de Serviço" icon={
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
          <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
          <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
        </svg>
      }>
        <Field label="URL do Backend (FastAPI)" value={backendUrl} onChange={setBackendUrl} placeholder="http://127.0.0.1:8000" hint="Endereço onde o Agent Bastos Python está rodando."/>
        <Field label="URL do n8n (Automações)" value={n8nUrl} onChange={setN8nUrl} placeholder="http://localhost:5678" hint="Endereço do n8n para integrações e alertas automáticos."/>
      </Section>
<Section title="Aparencia" icon={
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6D28D9" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
        </svg>
      }>
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", background:"#F8FAFC", borderRadius:8, border:"1px solid #E2E8F0"}}>
          <div>
            <div style={{fontSize:12, fontWeight:700, color:"#0F172A"}}>Modo Escuro</div>
            <div style={{fontSize:11, color:"#64748B", marginTop:2}}>Interface dark — ideal para ambientes com pouca luz</div>
          </div>
          <div onClick={() => setDarkMode(d => !d)} style={{
            width:44, height:24, borderRadius:12, cursor:"pointer",
            background: darkMode ? "#B45309" : "#CBD5E1",
            position:"relative", transition:"background 0.3s",
            flexShrink:0,
          }}>
            <div style={{
              position:"absolute", top:3, left: darkMode ? 23 : 3,
              width:18, height:18, borderRadius:"50%",
              background:"#FFFFFF", transition:"left 0.3s",
              boxShadow:"0 1px 4px rgba(0,0,0,0.2)",
            }}/>
          </div>
        </div>
      </Section>
      <div style={{display:"flex", justifyContent:"flex-end"}}>
        <button onClick={salvar} style={{
          padding:"9px 24px", borderRadius:7, border:"none", cursor:"pointer",
          background: salvo ? "#16A34A" : "linear-gradient(135deg,#F59E0B,#B45309)",
          color:"#FFF", fontSize:12, fontWeight:700,
          boxShadow: salvo ? "0 4px 12px rgba(22,163,74,0.3)" : "0 4px 12px rgba(180,83,9,0.3)",
          transition:"all 0.3s",
        }}>
          {salvo ? "✓ Salvo!" : "Salvar Configurações"}
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA — AGENDA DE MISSÃO
// ═══════════════════════════════════════════════════════════════════════════════
function AbaAgenda() {
  const [missoes,       setMissoes]       = useState([])
  const [loading,       setLoading]       = useState(true)
  const [nucleoSel,     setNucleoSel]     = useState("AIPEN")
  const [nucleoFiltro,  setNucleoFiltro]  = useState("TODOS")
  const [novaMensagem,  setNovaMensagem]  = useState("")
  const [novoNucleo,    setNovoNucleo]    = useState("AIPEN")
  const [publicando,    setPublicando]    = useState(false)
  const [loginMode,     setLoginMode]     = useState(false)
  const [senha,         setSenha]         = useState("")
  const [erroSenha,     setErroSenha]     = useState("")
  const [autenticado,   setAutenticado]   = useState(false)
  const [feedback,      setFeedback]      = useState("")

  useEffect(() => { carregarMissoes() }, [])

  async function carregarMissoes() {
    setLoading(true)
    try {
      const r = await fetch("http://127.0.0.1:8000/agenda/missoes?limite=30")
      const d = await r.json()
      setMissoes(d.missoes || [])
    } catch {
      // Mock para dev sem backend
      setMissoes([
        { id:"m1", nucleo:"NI",  mensagem:"Levantar informações sobre movimentação no Setor Norte. Prazo: 48h.", timestamp: null },
        { id:"m2", nucleo:"NBE", mensagem:"Realizar monitoramento eletrônico do ponto X. Relatar até sexta.", timestamp: null },
        { id:"m3", nucleo:"AIPEN", mensagem:"Reunião de briefing na sede às 09h desta quinta-feira. Presença obrigatória de todos os núcleos.", timestamp: null },
      ])
    } finally {
      setLoading(false)
    }
  }

  async function verificarSenha() {
    try {
      const r = await fetch("http://127.0.0.1:8000/agenda/login", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ senha }),
      })
      const d = await r.json()
      if (d.ok) { setAutenticado(true); setLoginMode(false); setSenha(""); setErroSenha("") }
      else       { setErroSenha("Senha incorreta. Tente novamente.") }
    } catch {
      // fallback local para dev
      if (senha === "aipen2025") { setAutenticado(true); setLoginMode(false); setSenha(""); setErroSenha("") }
      else                        { setErroSenha("Senha incorreta.") }
    }
  }

  async function publicarMissao() {
    if (!novaMensagem.trim()) return
    setPublicando(true)
    try {
      const r = await fetch("http://127.0.0.1:8000/agenda/publicar", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ nucleo: novoNucleo, mensagem: novaMensagem.trim() }),
      })
      const d = await r.json()
      if (d.ok) {
        setFeedback("✓ Missão publicada com sucesso!")
        setNovaMensagem("")
        await carregarMissoes()
        setTimeout(() => setFeedback(""), 3000)
      }
    } catch {
      // Mock local
      const nova = { id: Date.now().toString(), nucleo: novoNucleo, mensagem: novaMensagem.trim(), timestamp: null }
      setMissoes(prev => [nova, ...prev])
      setFeedback("✓ Missão publicada (modo offline).")
      setNovaMensagem("")
      setTimeout(() => setFeedback(""), 3000)
    } finally {
      setPublicando(false)
    }
  }

  const missoesFiltradas = nucleoFiltro === "TODOS"
    ? missoes
    : missoes.filter(m => m.nucleo === nucleoFiltro || m.nucleo === "AIPEN")

  return (
    <div className="cfg-enter" style={{display:"flex", gap:16, height:"100%"}}>

      {/* ── Coluna esquerda — filtros + lançar ─────────────────────────── */}
      <div style={{width:248, flexShrink:0, display:"flex", flexDirection:"column", gap:10}}>

        {/* Filtro por núcleo */}
        <Section title="Filtrar por Núcleo" icon={
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6D28D9" strokeWidth="2" strokeLinecap="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
        }>
          <div style={{display:"flex", flexDirection:"column", gap:3}}>
            {["TODOS", ...Object.keys(NUCLEOS)].map(n => (
              <button key={n} onClick={() => setNucleoFiltro(n)} style={{
                padding:"5px 10px", borderRadius:5, fontSize:10, fontWeight:600,
                border:"1px solid", cursor:"pointer", textAlign:"left",
                fontFamily:MONO, transition:"all 0.12s",
                background: nucleoFiltro===n ? "#0F172A" : "transparent",
                color:       nucleoFiltro===n ? "#FFF"     : "#475569",
                borderColor: nucleoFiltro===n ? "#0F172A"  : "#E2E8F0",
              }}>{n === "TODOS" ? "Todos os Núcleos" : n}</button>
            ))}
          </div>
        </Section>

        {/* Lançar missão — com auth */}
        <Section title="Lançar Missão" icon={
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="16"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
        }>
          {!autenticado && !loginMode && (
            <button onClick={() => setLoginMode(true)} style={{
              padding:"8px", borderRadius:7, border:"1px solid #E2E8F0",
              background:"#FEF2F2", color:"#DC2626", fontSize:11, fontWeight:700,
              cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6,
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Acesso Restrito — Chefe
            </button>
          )}

          {loginMode && (
            <div style={{display:"flex", flexDirection:"column", gap:8}}>
              <span style={{fontSize:10, color:"#64748B", fontFamily:MONO}}>Digite a senha do Chefe AIPEN:</span>
              <input
                type="password"
                value={senha}
                onChange={e=>setSenha(e.target.value)}
                onKeyDown={e=>e.key==="Enter" && verificarSenha()}
                autoFocus
                placeholder="••••••••"
                className="cfg-input"
                style={{padding:"8px 12px",borderRadius:6,border:"1px solid #CBD5E1",fontSize:12,outline:"none",fontFamily:"inherit"}}
              />
              {erroSenha && <span style={{fontSize:10, color:"#DC2626", fontFamily:MONO}}>{erroSenha}</span>}
              <div style={{display:"flex", gap:6}}>
                <button onClick={verificarSenha} style={{flex:1,padding:"7px",borderRadius:6,border:"none",background:"#0F172A",color:"#FFF",fontSize:11,fontWeight:700,cursor:"pointer"}}>Entrar</button>
                <button onClick={()=>{setLoginMode(false);setSenha("");setErroSenha("")}} style={{padding:"7px 10px",borderRadius:6,border:"1px solid #E2E8F0",background:"transparent",fontSize:11,color:"#64748B",cursor:"pointer"}}>✕</button>
              </div>
            </div>
          )}

          {autenticado && (
            <div style={{display:"flex", flexDirection:"column", gap:8}}>
              <div style={{display:"flex", alignItems:"center", gap:6, padding:"5px 8px", background:"#F0FDF4", borderRadius:5, border:"1px solid #86EFAC"}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:"#16A34A"}}/>
                <span style={{fontSize:10, fontWeight:600, color:"#16A34A", fontFamily:MONO}}>Autenticado — Chefe AIPEN</span>
              </div>

              <div style={{display:"flex", flexDirection:"column", gap:5}}>
                <span style={{fontSize:9, fontWeight:700, color:"#64748B", textTransform:"uppercase", letterSpacing:"0.08em", fontFamily:MONO}}>Destinatário</span>
                <select value={novoNucleo} onChange={e=>setNovoNucleo(e.target.value)} style={{
                  padding:"7px 10px", borderRadius:6, border:"1px solid #CBD5E1",
                  fontSize:11, color:"#0F172A", background:"#F8FAFC", outline:"none", fontFamily:"inherit",
                }}>
                  {Object.entries(NUCLEOS).map(([k,v]) => (
                    <option key={k} value={k}>{k} — {v}</option>
                  ))}
                </select>
              </div>

              <div style={{display:"flex", flexDirection:"column", gap:5}}>
                <span style={{fontSize:9, fontWeight:700, color:"#64748B", textTransform:"uppercase", letterSpacing:"0.08em", fontFamily:MONO}}>Mensagem / Missão</span>
                <textarea
                  value={novaMensagem}
                  onChange={e=>setNovaMensagem(e.target.value)}
                  placeholder="Descreva a missão com clareza e prazo..."
                  rows={5}
                  style={{
                    padding:"9px 12px", borderRadius:7, border:"1px solid #CBD5E1",
                    fontSize:12, color:"#0F172A", background:"#F8FAFC", outline:"none",
                    fontFamily:SANS, resize:"vertical", lineHeight:1.6,
                  }}
                />
              </div>

              {feedback && (
                <div style={{padding:"6px 10px", background:"#F0FDF4", border:"1px solid #86EFAC", borderRadius:5}}>
                  <span style={{fontSize:10, color:"#16A34A", fontWeight:600, fontFamily:MONO}}>{feedback}</span>
                </div>
              )}

              <button onClick={publicarMissao} disabled={publicando || !novaMensagem.trim()} style={{
                padding:"9px", borderRadius:7, border:"none",
                background: publicando ? "#F1F5F9" : "linear-gradient(135deg,#1D4ED8,#1E40AF)",
                color: publicando ? "#94A3B8" : "#FFF",
                fontSize:12, fontWeight:700, cursor: publicando ? "not-allowed" : "pointer",
                boxShadow: publicando ? "none" : "0 4px 12px rgba(29,78,216,0.3)",
                display:"flex", alignItems:"center", justifyContent:"center", gap:6,
              }}>
                {publicando ? (
                  <><svg className="spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Publicando...</>
                ) : "📤 Publicar Missão"}
              </button>

              <button onClick={()=>setAutenticado(false)} style={{padding:"5px", background:"transparent", border:"none", fontSize:10, color:"#94A3B8", cursor:"pointer", textDecoration:"underline"}}>
                Sair da sessão
              </button>
            </div>
          )}
        </Section>
      </div>

      {/* ── Coluna direita — lista de missões ───────────────────────────── */}
      <div style={{flex:1, display:"flex", flexDirection:"column", gap:0, background:"#FFFFFF", border:"1px solid #E2E8F0", borderRadius:10, overflow:"hidden", boxShadow:"0 2px 6px rgba(0,0,0,0.04)"}}>
        <div style={{padding:"12px 16px", borderBottom:"1px solid #F1F5F9", background:"#F8FAFC", display:"flex", alignItems:"center", justifyContent:"space-between"}}>
          <div style={{display:"flex", alignItems:"center", gap:8}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span style={{fontSize:10, fontWeight:800, color:"#334155", letterSpacing:"0.1em", textTransform:"uppercase"}}>Missões Registradas</span>
          </div>
          <div style={{display:"flex", alignItems:"center", gap:8}}>
            <span style={{fontSize:9, color:"#94A3B8", fontFamily:MONO}}>{missoesFiltradas.length} missões</span>
            <button onClick={carregarMissoes} style={{
              padding:"4px 10px", borderRadius:5, border:"1px solid #E2E8F0",
              background:"transparent", fontSize:10, color:"#64748B", cursor:"pointer", fontFamily:MONO,
              display:"flex", alignItems:"center", gap:4,
            }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              Atualizar
            </button>
          </div>
        </div>

        <div style={{flex:1, overflowY:"auto"}}>
          {loading && (
            <div style={{display:"flex", alignItems:"center", justifyContent:"center", padding:40, gap:10}}>
              <svg className="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="1.5" strokeLinecap="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              <span style={{fontSize:12, color:"#94A3B8", fontFamily:MONO}}>Carregando missões...</span>
            </div>
          )}

          {!loading && missoesFiltradas.length === 0 && (
            <div style={{display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"48px 20px", gap:8}}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span style={{fontSize:11, color:"#CBD5E1", fontFamily:MONO}}>Nenhuma missão registrada</span>
            </div>
          )}

          {!loading && missoesFiltradas.map((m, i) => (
            <div key={m.id || i} className="cfg-row" style={{
              padding:"12px 16px",
              borderBottom: i < missoesFiltradas.length - 1 ? "1px solid #F8FAFC" : "none",
              background:"#FFFFFF",
              borderLeft:`3px solid ${m.nucleo==="AIPEN" ? "#16A34A" : "#1D4ED8"}`,
              transition:"background 0.12s",
            }}>
              <div style={{display:"flex", alignItems:"flex-start", gap:10}}>
                <div style={{flexShrink:0, marginTop:2}}>
                  <span style={{
                    fontSize:9, fontWeight:800, padding:"2px 7px", borderRadius:3,
                    fontFamily:MONO, letterSpacing:"0.06em",
                    background: m.nucleo==="AIPEN" ? "#F0FDF4" : "#DBEAFE",
                    color:       m.nucleo==="AIPEN" ? "#16A34A"  : "#1D4ED8",
                    border:`1px solid ${m.nucleo==="AIPEN" ? "#86EFAC" : "#93C5FD"}`,
                  }}>{m.nucleo}</span>
                </div>
                <div style={{flex:1}}>
                  <p style={{fontSize:12, color:"#0F172A", lineHeight:1.6, margin:0, fontWeight:500}}>{m.mensagem}</p>
                  <div style={{display:"flex", alignItems:"center", gap:8, marginTop:5}}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <span style={{fontSize:9, color:"#94A3B8", fontFamily:MONO}}>{formatTs(m.timestamp)}</span>
                    <span style={{fontSize:8, color:"#CBD5E1"}}>·</span>
                    <span style={{fontSize:9, color:"#B45309", fontFamily:MONO}}>🦉 Corujas, juntos somos mais.</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA — CONEXÕES
// ═══════════════════════════════════════════════════════════════════════════════
function AbaConexoes() {
  const cfg = JSON.parse(localStorage.getItem("ab_config") || "{}")
  const backendUrl = cfg.backendUrl || "http://127.0.0.1:8000"
  const n8nUrl     = cfg.n8nUrl     || "http://localhost:5678"

  const [status, setStatus] = useState({
    backend:  "checking",
    firebase: "checking",
    n8n:      "checking",
  })
  const [infos, setInfos] = useState({})

  async function verificar() {
    setStatus({ backend:"checking", firebase:"checking", n8n:"checking" })

    // Backend
    try {
      const r = await fetch(`${backendUrl}/status`, { signal: AbortSignal.timeout(4000) })
      const d = await r.json()
      setStatus(s => ({...s, backend:"online"}))
      setInfos(i  => ({...i, backend: `v${d.version || "—"} · ${d.model || "—"}`}))
    } catch {
      setStatus(s => ({...s, backend:"offline"}))
      setInfos(i  => ({...i, backend: "Sem resposta"}))
    }

    // Firebase (via backend)
    try {
      const r = await fetch(`${backendUrl}/status/firebase`, { signal: AbortSignal.timeout(4000) })
      const d = await r.json()
      setStatus(s => ({...s, firebase: d.ok ? "online" : "offline"}))
      setInfos(i  => ({...i, firebase: d.projeto || "—"}))
    } catch {
      setStatus(s => ({...s, firebase:"offline"}))
      setInfos(i  => ({...i, firebase:"Sem resposta"}))
    }

    // n8n
    try {
      const r = await fetch(`${n8nUrl}/healthz`, { signal: AbortSignal.timeout(4000) })
      setStatus(s => ({...s, n8n: r.ok ? "online" : "offline"}))
      setInfos(i  => ({...i, n8n: r.ok ? "Rodando" : "Erro"}))
    } catch {
      setStatus(s => ({...s, n8n:"offline"}))
      setInfos(i  => ({...i, n8n:"Sem resposta"}))
    }
  }

  useEffect(() => { verificar() }, [])

  const SERVICOS = [
    {
      key:"backend", label:"Backend FastAPI",
      desc:`Agent Bastos Python — ${backendUrl}`,
      icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
    },
    {
      key:"firebase", label:"Firebase / Firestore",
      desc:"Base de dados em tempo real — Agenda e missões",
      icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
    },
    {
      key:"n8n", label:"n8n — Automações",
      desc:`Workflows e integrações — ${n8nUrl}`,
      icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><circle cx="3" cy="12" r="2"/><circle cx="21" cy="12" r="2"/><line x1="5" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="19" y2="12"/></svg>
    },
  ]

  return (
    <div className="cfg-enter" style={{display:"flex", flexDirection:"column", gap:14, maxWidth:600}}>
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between"}}>
        <span style={{fontSize:10, fontWeight:700, color:"#334155", letterSpacing:"0.1em", textTransform:"uppercase"}}>Status dos Serviços</span>
        <button onClick={verificar} style={{
          display:"flex", alignItems:"center", gap:5,
          padding:"5px 12px", borderRadius:6, border:"1px solid #E2E8F0",
          background:"transparent", fontSize:10, fontWeight:600, color:"#475569", cursor:"pointer",
          fontFamily:MONO,
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Verificar novamente
        </button>
      </div>

      {SERVICOS.map(s => (
        <div key={s.key} style={{
          background:"#FFFFFF", border:"1px solid #E2E8F0", borderRadius:10,
          padding:"14px 16px", display:"flex", alignItems:"center",
          justifyContent:"space-between", gap:12,
          boxShadow:"0 2px 6px rgba(0,0,0,0.04)",
        }}>
          <div style={{display:"flex", alignItems:"center", gap:12}}>
            <div style={{
              width:36, height:36, borderRadius:8, display:"flex",
              alignItems:"center", justifyContent:"center",
              background:"#F8FAFC", border:"1px solid #E2E8F0",
            }}>
              {s.icon}
            </div>
            <div>
              <div style={{fontSize:12, fontWeight:700, color:"#0F172A"}}>{s.label}</div>
              <div style={{fontSize:10, color:"#94A3B8", fontFamily:MONO, marginTop:2}}>{s.desc}</div>
              {infos[s.key] && (
                <div style={{fontSize:9, color:"#64748B", fontFamily:MONO, marginTop:2}}>{infos[s.key]}</div>
              )}
            </div>
          </div>
          <StatusBadge status={status[s.key]}/>
        </div>
      ))}

      {/* Info LGPD */}
      <div style={{
        padding:"12px 16px", background:"#FFFBEB", borderRadius:8,
        border:"1px solid #FCD34D", borderLeft:"3px solid #B45309",
        marginTop:4,
      }}>
        <div style={{fontSize:10, fontWeight:700, color:"#92400E", letterSpacing:"0.08em", textTransform:"uppercase", fontFamily:MONO, marginBottom:4}}>
          🔒 LGPD — Nota de Privacidade
        </div>
        <p style={{fontSize:11, color:"#78350F", lineHeight:1.7, margin:0}}>
          Os dados processados por este sistema são tratados em conformidade com a Lei nº 13.709/2018 (LGPD). As conexões listadas acima são de uso interno e não expõem dados pessoais a terceiros. Toda comunicação com o Firebase é feita via credenciais de conta de serviço criptografadas.
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
const ABAS = [
  { id:"geral",    label:"Geral",    icon:"⚙" },
  { id:"conexoes", label:"Conexões", icon:"🔗" },
]

export default function Configuracoes({ onNavigate, darkMode, setDarkMode }) {
  const [aba, setAba] = useState("geral")

  useEffect(() => {
    const style = document.createElement("style")
    style.textContent = GLOBAL_CSS
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  return (
    <div style={{display:"flex", flexDirection:"column", flex:1, minWidth:0, height:"100%", overflow:"hidden", background:"#F8FAFC"}}>

      {/* Header */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"12px 20px 0", borderBottom:"1px solid #E2E8F0",
        background:"#FFFFFF", flexShrink:0,
      }}>
        <div style={{paddingBottom:12}}>
          <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:3}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            <span style={{fontSize:14, fontWeight:800, color:"#0F172A"}}>Configurações</span>
          </div>
          <span style={{fontSize:10, color:"#94A3B8", fontFamily:MONO}}>Agent Bastos · Sistema de Inteligência e Segurança</span>
        </div>

        {/* Abas */}
        <div style={{display:"flex", gap:2, alignSelf:"flex-end", paddingBottom:0}}>
          {ABAS.map(a => (
            <button key={a.id} onClick={() => setAba(a.id)} style={{
              padding:"7px 16px", borderRadius:"6px 6px 0 0",
              border:"1px solid", borderBottom:"none",
              fontSize:11, fontWeight:600, cursor:"pointer",
              transition:"all 0.15s", fontFamily:"inherit",
              background: aba===a.id ? "#F8FAFC" : "transparent",
              color:       aba===a.id ? "#0F172A"  : "#94A3B8",
              borderColor: aba===a.id ? "#E2E8F0"  : "transparent",
            }}>
              <span style={{marginRight:5}}>{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo da aba */}
      <div style={{flex:1, overflowY:"auto", padding:"20px", display:"flex", flexDirection:"column"}}>
        {aba === "geral" && <AbaGeral darkMode={darkMode} setDarkMode={setDarkMode}/>}
        {aba === "conexoes" && <AbaConexoes/>}
      </div>
    </div>
  )
}
