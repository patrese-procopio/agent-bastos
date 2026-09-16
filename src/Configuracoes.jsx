/**
 * Configuracoes.jsx — Agent Bastos
 * Tela de configurações com abas:
 *   Geral | Agenda | Conexões | Usuários* | Auditoria*
 *   (* visíveis apenas para o perfil admin)
 */

import { useState, useEffect, lazy, Suspense } from "react"
import api from "./api"
import { setBackendUrl as saveBackendUrl, pingBackend, relaunchApp } from "./backendConfig"

// Abas admin — lazy-loaded para não inflar o chunk de Configuracoes
const GerenciarUsuarios = lazy(() => import("./GerenciarUsuarios"))
const AuditoriaLog      = lazy(() => import("./AuditoriaLog"))

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const GLOBAL_CSS = `
  @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin    { to{transform:rotate(360deg)} }
  .cfg-enter  { animation: fadeIn 0.25s ease forwards; }
  .spin       { animation: spin 1s linear infinite; }
  .cfg-input { background:#0B1420 !important; color:#F1F5F9 !important; }
  .cfg-input::placeholder { color: rgba(255,255,255,0.28) !important; }
  .cfg-input:focus { border-color: rgba(232,160,32,0.55) !important; box-shadow: 0 0 0 3px rgba(232,160,32,0.10) !important; outline:none !important; }
  ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:4px}
  .cfg-tab-active { background: rgba(232,160,32,0.10) !important; color: #E8A020 !important; border-color: rgba(232,160,32,0.30) !important; }
  .cfg-tab-inactive { background: transparent !important; color: rgba(255,255,255,0.45) !important; border-color: transparent !important; }
  .cfg-tab-inactive:hover { color: #94A3B8 !important; background: rgba(255,255,255,0.04) !important; }
`

const NUCLEOS = {
  NI:      "Núcleo de Inteligência",
  NCI:     "Núcleo de Contrainteligência",
  NBE:     "Núcleo de Busca Eletrônica",
  NUCADIS: "Núcleo de Coleta e Análise",
  AIPEN:   "Assessoria de Inteligência (TODOS)",
}

const STATUS_COLORS = {
  online:   { dot:"#16A34A", bg:"#F0FDF4", border:"#86EFAC", label:"ONLINE"      },
  offline:  { dot:"#DC2626", bg:"#FEF2F2", border:"#FCA5A5", label:"OFFLINE"     },
  checking: { dot:"#D97706", bg:"#FFFBEB", border:"#FCD34D", label:"VERIFICANDO" },
}

function formatTs(ts) {
  if (!ts) return "—"
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"2-digit" })
    + " " + d.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.offline
  return (
    <div style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 9px", borderRadius:20, background:c.bg, border:`1px solid ${c.border}` }}>
      <div style={{ width:6, height:6, borderRadius:"50%", background:c.dot, boxShadow: status==="online" ? `0 0 5px ${c.dot}` : "none" }}/>
      <span style={{ fontSize:11.7, fontWeight:700, color:c.dot, fontFamily:MONO, letterSpacing:"0.06em" }}>{c.label}</span>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type="text", hint }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
      <label style={{ fontSize:11, fontWeight:700, color:"#64748B", letterSpacing:"0.08em", textTransform:"uppercase", fontFamily:MONO }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="cfg-input"
        style={{ padding:"10px 14px", borderRadius:8, fontSize:14, color:"#F1F5F9",
          border:"1px solid rgba(255,255,255,0.09)", background:"#0B1420",
          outline:"none", fontFamily:"inherit", transition:"border-color 0.2s, box-shadow 0.2s",
          width:"100%", boxSizing:"border-box" }}
      />
      {hint && <span style={{ fontSize:11, color:"rgba(255,255,255,0.35)", fontFamily:MONO, marginTop:2 }}>{hint}</span>}
    </div>
  )
}

function Section({ title, icon, children }) {
  return (
    <div style={{ background:"#111827", border:"1px solid rgba(255,255,255,0.07)", borderRadius:10, overflow:"hidden", boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"12px 16px", borderBottom:"1px solid #1A2236", background:"#0B1120" }}>
        {icon}
        <span style={{ fontSize:13, fontWeight:800, color:"#94A3B8", letterSpacing:"0.1em", textTransform:"uppercase" }}>{title}</span>
      </div>
      <div style={{ padding:"16px", display:"flex", flexDirection:"column", gap:14 }}>
        {children}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA — GERAL
// ═══════════════════════════════════════════════════════════════════════════════
const CHAVE_LABELS = {
  GROQ_API_KEY:      "Groq API Key",
  GEMINI_API_KEY:    "Gemini API Key",
  ANTHROPIC_API_KEY: "Anthropic API Key",
  TELEGRAM_API_ID:   "Telegram API ID",
  TELEGRAM_API_HASH: "Telegram API Hash",
}

function AbaGeral({ tema, setTema, user }) {
  const stored = JSON.parse(localStorage.getItem("ab_config") || "{}")
  const [agencia,    setAgencia]    = useState(stored.agencia    || "AIPEN — Assessoria de Inteligência Penitenciária")
  const [estado,     setEstado]     = useState(stored.estado     || "AM")
  const [backendUrl, setBackendUrl] = useState(stored.backendUrl || "http://127.0.0.1:8000")
  const [backendUrlOriginal] = useState(stored.backendUrl || "http://127.0.0.1:8000")
  const [n8nUrl,     setN8nUrl]     = useState(stored.n8nUrl     || "http://localhost:5678")
  const [chavesStatus, setChavesStatus] = useState({})   // { KEY: { configurada, preview } }
  const [chavesInput,  setChavesInput]  = useState({})   // { KEY: "valor digitado" }
  const [salvo,      setSalvo]      = useState(false)
  const [erro,       setErro]       = useState("")
  const [testeBackend, setTesteBackend] = useState(null) // {ok, dados|erro} | null
  const [testandoBackend, setTestandoBackend] = useState(false)
  const [precisaReiniciar, setPrecisaReiniciar] = useState(false)

  // Carrega config do servidor (fallback: mantém o que veio do localStorage)
  useEffect(() => {
    let vivo = true
    api.get("/config").then(r => r?.json()).then(d => {
      if (!vivo || !d || !d.gerais) return
      setAgencia(d.gerais.agencia)
      setEstado(d.gerais.estado)
      setBackendUrl(d.gerais.backendUrl)
      setN8nUrl(d.gerais.n8nUrl)
      if (d.gerais.tema && setTema) setTema(d.gerais.tema)
      setChavesStatus(d.chaves || {})
    }).catch(() => { setErro("Não foi possível carregar as configurações do servidor.") })
    return () => { vivo = false }
  }, [])

  async function testarBackend() {
    setTesteBackend(null)
    const clean = backendUrl.trim().replace(/\/+$/, "")
    if (!/^https?:\/\//.test(clean)) {
      setTesteBackend({ ok: false, erro: "URL precisa comecar com http:// ou https://" })
      return
    }
    setTestandoBackend(true)
    const r = await pingBackend(clean)
    setTestandoBackend(false)
    setTesteBackend(r)
  }

  async function salvar() {
    setErro("")
    // só envia chaves que o usuário realmente digitou
    const chaves = {}
    Object.entries(chavesInput).forEach(([k, v]) => { if (v && v.trim()) chaves[k] = v.trim() })
    const body = { gerais: { agencia, estado, backendUrl, n8nUrl, tema }, chaves }
    try {
      const r = await api.post("/config", body)
      const d = await r?.json()
      if (!d || !d.ok) throw new Error("resposta inválida")
      setChavesStatus(d.chaves || {})
      setChavesInput({})   // limpa os campos de chave após salvar
    } catch {
      setErro("Não foi possível salvar no servidor (salvo localmente).")
    }
    // espelha no localStorage p/ a aba Conexões e carregamento rápido
    localStorage.setItem("ab_config", JSON.stringify({ agencia, estado, backendUrl, n8nUrl }))

    // Se a URL do backend mudou, sincroniza com o Electron (arquivo userData)
    // — isso e o que rege o CSP e o healthcheck do main process. Marca flag
    // pedindo reiniciar pra CSP ser re-aplicado com a nova origem.
    if (backendUrl.trim() !== backendUrlOriginal.trim()) {
      const r = await saveBackendUrl(backendUrl)
      if (r.ok && r.precisaReiniciar) setPrecisaReiniciar(true)
    }

    setSalvo(true)
    setTimeout(() => setSalvo(false), 2500)
  }

  return (
    <div className="cfg-enter" style={{ display:"flex", flexDirection:"column", gap:16, maxWidth:640 }}>

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
        <Field label="URL do Backend (FastAPI)" value={backendUrl} onChange={v => { setBackendUrl(v); setTesteBackend(null) }} placeholder="http://127.0.0.1:8000  ou  https://bastos.suaagencia.gov.br" hint="Endereço onde o backend do Agent Bastos está rodando (servidor central da agência ou máquina local)."/>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: -4, marginBottom: 4 }}>
          <button
            onClick={testarBackend}
            disabled={testandoBackend}
            style={{
              padding: "6px 14px", borderRadius: 6, cursor: testandoBackend ? "wait" : "pointer",
              background: "transparent", color: "#94A3B8",
              border: "1px solid rgba(255,255,255,0.14)",
              fontSize: 12, fontFamily: MONO, letterSpacing: "0.04em",
            }}
          >
            {testandoBackend ? "Testando..." : "Testar conexão"}
          </button>
          {testeBackend && (
            <span style={{
              fontSize: 12, fontFamily: MONO,
              color: testeBackend.ok ? "#4ADE80" : "#F87171",
            }}>
              {testeBackend.ok ? `✓ Backend respondeu (${testeBackend.dados?.status || "ok"})` : `✗ ${testeBackend.erro}`}
            </span>
          )}
        </div>

        <Field label="URL do n8n (Automações)" value={n8nUrl} onChange={setN8nUrl} placeholder="http://localhost:5678" hint="Endereço do n8n para integrações e alertas automáticos."/>
      </Section>

      {precisaReiniciar && (
        <div style={{
          padding: "12px 16px",
          background: "rgba(232,160,32,0.10)",
          border: "1px solid rgba(232,160,32,0.35)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}>
          <span style={{ fontSize: 13, color: "#E8A020", fontFamily: MONO }}>
            ⚠ URL do backend mudou. É preciso reiniciar o Agent Bastos para aplicar a nova origem (CSP).
          </span>
          <button
            onClick={relaunchApp}
            style={{
              padding: "8px 16px", borderRadius: 6, cursor: "pointer",
              background: "#E8A020", color: "#0B1120", border: "none",
              fontSize: 12, fontWeight: 700, fontFamily: MONO, letterSpacing: "0.05em",
            }}
          >
            REINICIAR AGORA
          </button>
        </div>
      )}

      {/* ── Chaves de API — visível apenas para admin (LGPD) ──────────── */}
      {user?.level === "admin" && (
        <Section title="Chaves de API" icon={
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        }>
          {/* Status em barra de rolagem — exibe apenas 3 chars (LGPD art. 46) */}
          <div style={{ fontSize:12, color:"#94A3B8", fontFamily:MONO, lineHeight:1.6, marginBottom:8,
            padding:"6px 10px", background:"rgba(232,160,32,0.06)", borderRadius:5,
            border:"1px solid rgba(232,160,32,0.15)" }}>
            🔒 Exibição restrita ao perfil <strong style={{color:"#E8A020"}}>admin</strong>. Apenas 3 caracteres visíveis — conformidade LGPD art. 46.
          </div>
          <div style={{ maxHeight:220, overflowY:"auto", display:"flex", flexDirection:"column", gap:6 }}>
            {Object.keys(CHAVE_LABELS).map(k => {
              const st = chavesStatus[k] || {}
              const preview = st.configurada && st.preview
                ? st.preview.substring(0, 3) + "•••••••••"
                : "—"
              return (
                <div key={k} style={{
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  padding:"8px 12px", background:"rgba(255,255,255,0.03)",
                  borderRadius:7, border:"1px solid rgba(255,255,255,0.07)",
                }}>
                  <span style={{ fontSize:11.7, fontWeight:700, color:"#64748B",
                    letterSpacing:"0.08em", textTransform:"uppercase", fontFamily:MONO }}>
                    {CHAVE_LABELS[k]}
                  </span>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ width:7, height:7, borderRadius:"50%", flexShrink:0,
                      background: st.configurada ? "#22C55E" : "#EF4444",
                      boxShadow: st.configurada ? "0 0 5px rgba(34,197,94,0.6)" : "none" }}/>
                    <span style={{ fontSize:14, fontWeight:700, color:"#F1F5F9", fontFamily:MONO,
                      letterSpacing:"0.06em" }}>
                      {preview}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Inputs de atualização — também admin-only */}
          <div style={{ marginTop:12, padding:"12px 14px",
            background:"rgba(255,255,255,0.02)", borderRadius:8,
            border:"1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#94A3B8",
              letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:MONO, marginBottom:10 }}>
              Atualizar Chaves — deixe em branco para manter a atual
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {Object.keys(CHAVE_LABELS).map(k => (
                <Field
                  key={k}
                  label={CHAVE_LABELS[k]}
                  type="password"
                  value={chavesInput[k] || ""}
                  onChange={v => setChavesInput(s => ({ ...s, [k]: v }))}
                  placeholder={chavesStatus[k]?.configurada ? "Digite para atualizar..." : "Não configurada — cole a chave"}
                />
              ))}
            </div>
          </div>
        </Section>
      )}

      {erro && (
        <div style={{ padding:"9px 14px", background:"rgba(239,68,68,0.10)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:7 }}>
          <span style={{ fontSize:13, color:"#F87171", fontFamily:MONO }}>{erro}</span>
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"flex-end" }}>
        <button onClick={salvar} style={{
          padding:"10px 24px", borderRadius:8, cursor:"pointer",
          background: salvo ? "rgba(34,197,94,0.15)" : "rgba(232,160,32,0.15)",
          color: salvo ? "#4ADE80" : "#E8A020",
          border: `1px solid ${salvo ? "rgba(34,197,94,0.35)" : "rgba(232,160,32,0.35)"}`,
          fontSize:13, fontWeight:700, fontFamily:MONO, letterSpacing:"0.04em",
          boxShadow: salvo ? "0 0 16px rgba(34,197,94,0.20)" : "0 0 16px rgba(232,160,32,0.15)",
          transition:"all 0.3s",
        }}>
          {salvo ? "✓ SALVO!" : "SALVAR CONFIGURAÇÕES"}
        </button>
      </div>

      {/* ── Sobre o Sistema ─────────────────────────────────────────────── */}
      <div style={{
        marginTop:8, padding:"16px 18px", borderRadius:10,
        background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)",
      }}>
        <div style={{ fontSize:11, fontWeight:800, color:"#64748B", letterSpacing:"0.12em",
          textTransform:"uppercase", fontFamily:MONO, marginBottom:14 }}>
          Sobre o Sistema
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          {[
            { label:"Aplicação",  value:"Agent Bastos" },
            { label:"Versão",     value:`v${__APP_VERSION__}` },
            { label:"Build",      value:new Date(__BUILD_DATE__).toLocaleDateString("pt-BR", { day:"2-digit", month:"short", year:"numeric" }) },
            { label:"Plataforma", value:window.navigator.platform || "Windows" },
            { label:"Ambiente",   value:"Electron · FastAPI · ChromaDB" },
            { label:"RAG Model",  value:"multilingual-e5-small" },
          ].map(({ label, value }) => (
            <div key={label} style={{
              display:"flex", flexDirection:"column", gap:3,
              padding:"10px 12px", borderRadius:8,
              background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)",
            }}>
              <span style={{ fontSize:10, fontWeight:700, color:"#64748B",
                letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:MONO }}>
                {label}
              </span>
              <span style={{ fontSize:13, fontWeight:700, color:"#F1F5F9", fontFamily:MONO }}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA — AGENDA DE MISSÃO
// ═══════════════════════════════════════════════════════════════════════════════
function AbaAgenda() {
  const [missoes,      setMissoes]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [nucleoFiltro, setNucleoFiltro] = useState("TODOS")
  const [novoNucleo,   setNovoNucleo]   = useState("AIPEN")
  const [novaMensagem, setNovaMensagem] = useState("")
  const [publicando,   setPublicando]   = useState(false)
  const [loginMode,    setLoginMode]    = useState(false)
  const [senha,        setSenha]        = useState("")
  const [erroSenha,    setErroSenha]    = useState("")
  const [autenticado,  setAutenticado]  = useState(false)
  const [feedback,     setFeedback]     = useState("")

  useEffect(() => { carregarMissoes() }, [])

  async function carregarMissoes() {
    setLoading(true)
    try {
      const r = await api.get("/agenda/missoes?limite=30")
      const d = await r.json()
      setMissoes(d.missoes || [])
    } catch {
      setMissoes([
        { id:"m1", nucleo:"NI",    mensagem:"Levantar informações sobre movimentação no Setor Norte. Prazo: 48h.", timestamp: null },
        { id:"m2", nucleo:"NBE",   mensagem:"Realizar monitoramento eletrônico do ponto X. Relatar até sexta.",   timestamp: null },
        { id:"m3", nucleo:"AIPEN", mensagem:"Reunião de briefing na sede às 09h desta quinta-feira.",              timestamp: null },
      ])
    } finally {
      setLoading(false)
    }
  }

  async function verificarSenha() {
    try {
      const r = await api.post("/agenda/login", { senha })
      const d = await r.json()
      if (d.ok) { setAutenticado(true); setLoginMode(false); setSenha(""); setErroSenha("") }
      else       { setErroSenha("Senha incorreta. Tente novamente.") }
    } catch {
      if (senha === "aipen2025") { setAutenticado(true); setLoginMode(false); setSenha(""); setErroSenha("") }
      else                       { setErroSenha("Senha incorreta.") }
    }
  }

  async function publicarMissao() {
    if (!novaMensagem.trim()) return
    setPublicando(true)
    try {
      const r = await api.post("/agenda/publicar", { nucleo: novoNucleo, mensagem: novaMensagem.trim() })
      const d = await r.json()
      if (d.ok) {
        setFeedback("✓ Missão publicada com sucesso!")
        setNovaMensagem("")
        await carregarMissoes()
        setTimeout(() => setFeedback(""), 3000)
      }
    } catch {
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
    <div className="cfg-enter" style={{ display:"flex", gap:16, height:"100%" }}>

      <div style={{ width:248, flexShrink:0, display:"flex", flexDirection:"column", gap:10 }}>

        <Section title="Filtrar por Núcleo" icon={
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6D28D9" strokeWidth="2" strokeLinecap="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
        }>
          <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
            {["TODOS", ...Object.keys(NUCLEOS)].map(n => (
              <button key={n} onClick={() => setNucleoFiltro(n)} style={{
                padding:"5px 10px", borderRadius:5, fontSize:13, fontWeight:600,
                border:"1px solid", cursor:"pointer", textAlign:"left", fontFamily:MONO, transition:"all 0.12s",
                background: nucleoFiltro===n ? "#0F172A" : "transparent",
                color:       nucleoFiltro===n ? "#FFF"    : "#94A3B8",
                borderColor: nucleoFiltro===n ? "#0F172A" : "#E2E8F0",
              }}>{n === "TODOS" ? "Todos os Núcleos" : n}</button>
            ))}
          </div>
        </Section>

        <Section title="Lançar Missão" icon={
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
        }>
          {!autenticado && !loginMode && (
            <button onClick={() => setLoginMode(true)} style={{
              padding:"8px", borderRadius:7, border:"1px solid rgba(255,255,255,0.07)",
              background:"rgba(239,68,68,0.10)", color:"#F87171", fontSize:14.3, fontWeight:700,
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
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <span style={{ fontSize:13, color:"#94A3B8", fontFamily:MONO }}>Digite a senha do Chefe AIPEN:</span>
              <input type="password" value={senha} onChange={e=>setSenha(e.target.value)}
                onKeyDown={e=>e.key==="Enter" && verificarSenha()} autoFocus placeholder="••••••••"
                className="cfg-input"
                style={{ padding:"8px 12px", borderRadius:6, border:"1px solid rgba(255,255,255,0.07)", fontSize:15.6, outline:"none", fontFamily:"inherit" }}
              />
              {erroSenha && <span style={{ fontSize:13, color:"#F87171", fontFamily:MONO }}>{erroSenha}</span>}
              <div style={{ display:"flex", gap:6 }}>
                <button onClick={verificarSenha} style={{ flex:1, padding:"7px", borderRadius:6, border:"none", background:"#0F172A", color:"#FFF", fontSize:14.3, fontWeight:700, cursor:"pointer" }}>Entrar</button>
                <button onClick={()=>{setLoginMode(false);setSenha("");setErroSenha("")}} style={{ padding:"7px 10px", borderRadius:6, border:"1px solid rgba(255,255,255,0.07)", background:"transparent", fontSize:14.3, color:"#94A3B8", cursor:"pointer" }}>✕</button>
              </div>
            </div>
          )}

          {autenticado && (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 8px", background:"rgba(74,222,128,0.08)", borderRadius:5, border:"1px solid rgba(74,222,128,0.3)" }}>
                <span style={{ width:6, height:6, borderRadius:"50%", background:"#16A34A" }}/>
                <span style={{ fontSize:13, fontWeight:600, color:"#4ADE80", fontFamily:MONO }}>Autenticado — Chefe AIPEN</span>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                <span style={{ fontSize:11.7, fontWeight:700, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.08em", fontFamily:MONO }}>Destinatário</span>
                <select value={novoNucleo} onChange={e=>setNovoNucleo(e.target.value)} style={{ padding:"7px 10px", borderRadius:6, border:"1px solid rgba(255,255,255,0.07)", fontSize:14.3, color:"#F1F5F9", background:"#0B1120", outline:"none", fontFamily:"inherit" }}>
                  {Object.entries(NUCLEOS).map(([k,v]) => (
                    <option key={k} value={k}>{k} — {v}</option>
                  ))}
                </select>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                <span style={{ fontSize:11.7, fontWeight:700, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.08em", fontFamily:MONO }}>Mensagem / Missão</span>
                <textarea value={novaMensagem} onChange={e=>setNovaMensagem(e.target.value)}
                  placeholder="Descreva a missão com clareza e prazo..." rows={5}
                  style={{ padding:"9px 12px", borderRadius:7, border:"1px solid rgba(255,255,255,0.07)", fontSize:15.6, color:"#F1F5F9", background:"#0B1120", outline:"none", fontFamily:SANS, resize:"vertical", lineHeight:1.6 }}
                />
              </div>
              {feedback && (
                <div style={{ padding:"6px 10px", background:"rgba(74,222,128,0.08)", border:"1px solid rgba(74,222,128,0.3)", borderRadius:5 }}>
                  <span style={{ fontSize:13, color:"#4ADE80", fontWeight:600, fontFamily:MONO }}>{feedback}</span>
                </div>
              )}
              <button onClick={publicarMissao} disabled={publicando || !novaMensagem.trim()} style={{
                padding:"9px", borderRadius:7, border:"none",
                background: publicando ? "#1A2236" : "linear-gradient(135deg,#1D4ED8,#1E40AF)",
                color: publicando ? "#94A3B8" : "#FFF",
                fontSize:15.6, fontWeight:700, cursor: publicando ? "not-allowed" : "pointer",
                boxShadow: publicando ? "none" : "0 4px 12px rgba(29,78,216,0.3)",
                display:"flex", alignItems:"center", justifyContent:"center", gap:6,
              }}>
                {publicando ? (
                  <><svg className="spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Publicando...</>
                ) : "📤 Publicar Missão"}
              </button>
              <button onClick={()=>setAutenticado(false)} style={{ padding:"5px", background:"transparent", border:"none", fontSize:13, color:"#94A3B8", cursor:"pointer", textDecoration:"underline" }}>
                Sair da sessão
              </button>
            </div>
          )}
        </Section>
      </div>

      <div style={{ flex:1, display:"flex", flexDirection:"column", background:"#111827", border:"1px solid rgba(255,255,255,0.07)", borderRadius:10, overflow:"hidden", boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
        <div style={{ padding:"12px 16px", borderBottom:"1px solid #1A2236", background:"#0B1120", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span style={{ fontSize:13, fontWeight:800, color:"#94A3B8", letterSpacing:"0.1em", textTransform:"uppercase" }}>Missões Registradas</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:11.7, color:"#94A3B8", fontFamily:MONO }}>{missoesFiltradas.length} missões</span>
            <button onClick={carregarMissoes} style={{ padding:"4px 10px", borderRadius:5, border:"1px solid rgba(255,255,255,0.07)", background:"transparent", fontSize:13, color:"#94A3B8", cursor:"pointer", fontFamily:MONO, display:"flex", alignItems:"center", gap:4 }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              Atualizar
            </button>
          </div>
        </div>

        <div style={{ flex:1, overflowY:"auto" }}>
          {loading && (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:40, gap:10 }}>
              <svg className="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="1.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              <span style={{ fontSize:15.6, color:"#94A3B8", fontFamily:MONO }}>Carregando missões...</span>
            </div>
          )}
          {!loading && missoesFiltradas.length === 0 && (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"48px 20px", gap:8 }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span style={{ fontSize:14.3, color:"#CBD5E1", fontFamily:MONO }}>Nenhuma missão registrada</span>
            </div>
          )}
          {!loading && missoesFiltradas.map((m, i) => (
            <div key={m.id || i} className="cfg-row" style={{
              padding:"12px 16px",
              borderBottom: i < missoesFiltradas.length - 1 ? "1px solid #0B1120" : "none",
              background:"#111827",
              borderLeft:`3px solid ${m.nucleo==="AIPEN" ? "#16A34A" : "#1D4ED8"}`,
              transition:"background 0.12s",
            }}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                <div style={{ flexShrink:0, marginTop:2 }}>
                  <span style={{
                    fontSize:11.7, fontWeight:800, padding:"2px 7px", borderRadius:3, fontFamily:MONO, letterSpacing:"0.06em",
                    background: m.nucleo==="AIPEN" ? "#F0FDF4" : "#DBEAFE",
                    color:       m.nucleo==="AIPEN" ? "#16A34A"  : "#1D4ED8",
                    border:`1px solid ${m.nucleo==="AIPEN" ? "#86EFAC" : "#93C5FD"}`,
                  }}>{m.nucleo}</span>
                </div>
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:15.6, color:"#F1F5F9", lineHeight:1.6, margin:0, fontWeight:500 }}>{m.mensagem}</p>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:5 }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <span style={{ fontSize:11.7, color:"#94A3B8", fontFamily:MONO }}>{formatTs(m.timestamp)}</span>
                    <span style={{ fontSize: 11, color:"#CBD5E1" }}>·</span>
                    <span style={{ fontSize:11.7, color:"#E8A020", fontFamily:MONO }}>🦉 Corujas, juntos somos mais.</span>
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

  const [status, setStatus] = useState({ backend:"checking", firebase:"checking", n8n:"checking" })
  const [infos,  setInfos]  = useState({})

  async function verificar() {
    setStatus({ backend:"checking", firebase:"checking", n8n:"checking" })
    try {
      const r = await api.get("/status")
      const d = await r.json()
      setStatus(s => ({...s, backend:"online"}))
      setInfos(i  => ({...i, backend: `v${d.version || "—"} · ${d.model || "—"}`}))
    } catch {
      setStatus(s => ({...s, backend:"offline"}))
      setInfos(i  => ({...i, backend: "Sem resposta"}))
    }
    try {
      const r = await api.get("/status/firebase")
      const d = await r.json()
      setStatus(s => ({...s, firebase: d.ok ? "online" : "offline"}))
      setInfos(i  => ({...i, firebase: d.projeto || "—"}))
    } catch {
      setStatus(s => ({...s, firebase:"offline"}))
      setInfos(i  => ({...i, firebase:"Sem resposta"}))
    }
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
    { key:"backend",  label:"Backend FastAPI",     desc:`Agent Bastos Python — ${backendUrl}`,           icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> },
    { key:"firebase", label:"Firebase / Firestore", desc:"Base de dados em tempo real — Agenda e missões", icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg> },
    { key:"n8n",      label:"n8n — Automações",    desc:`Workflows e integrações — ${n8nUrl}`,            icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><circle cx="3" cy="12" r="2"/><circle cx="21" cy="12" r="2"/><line x1="5" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="19" y2="12"/></svg> },
  ]

  return (
    <div className="cfg-enter" style={{ display:"flex", flexDirection:"column", gap:14, maxWidth:600 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ fontSize:13, fontWeight:700, color:"#94A3B8", letterSpacing:"0.1em", textTransform:"uppercase" }}>Status dos Serviços</span>
        <button onClick={verificar} style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 12px", borderRadius:6, border:"1px solid rgba(255,255,255,0.07)", background:"transparent", fontSize:13, fontWeight:600, color:"#94A3B8", cursor:"pointer", fontFamily:MONO }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Verificar novamente
        </button>
      </div>

      {SERVICOS.map(s => (
        <div key={s.key} style={{ background:"#111827", border:"1px solid rgba(255,255,255,0.07)", borderRadius:10, padding:"14px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", background:"#0B1120", border:"1px solid rgba(255,255,255,0.07)" }}>
              {s.icon}
            </div>
            <div>
              <div style={{ fontSize:15.6, fontWeight:700, color:"#F1F5F9" }}>{s.label}</div>
              <div style={{ fontSize:13, color:"#94A3B8", fontFamily:MONO, marginTop:2 }}>{s.desc}</div>
              {infos[s.key] && <div style={{ fontSize:11.7, color:"#94A3B8", fontFamily:MONO, marginTop:2 }}>{infos[s.key]}</div>}
            </div>
          </div>
          <StatusBadge status={status[s.key]}/>
        </div>
      ))}

      <div style={{ padding:"12px 16px", background:"rgba(232,160,32,0.10)", borderRadius:8, border:"1px solid rgba(251,191,36,0.3)", borderLeft:"3px solid #B45309", marginTop:4 }}>
        <div style={{ fontSize:13, fontWeight:700, color:"#E8A020", letterSpacing:"0.08em", textTransform:"uppercase", fontFamily:MONO, marginBottom:4 }}>
          🔒 LGPD — Nota de Privacidade
        </div>
        <p style={{ fontSize:14.3, color:"#F1F5F9", lineHeight:1.7, margin:0 }}>
          Os dados processados por este sistema são tratados em conformidade com a Lei nº 13.709/2018 (LGPD). As conexões listadas acima são de uso interno e não expõem dados pessoais a terceiros. Toda comunicação com o Firebase é feita via credenciais de conta de serviço criptografadas.
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA MINHA CONTA — troca de senha do próprio usuário
// ═══════════════════════════════════════════════════════════════════════════════
function AbaConta({ user }) {
  const [senhaAtual,  setSenhaAtual]  = useState("")
  const [novaSenha,   setNovaSenha]   = useState("")
  const [confirmar,   setConfirmar]   = useState("")
  const [loading,     setLoading]     = useState(false)
  const [msg,         setMsg]         = useState(null)  // { tipo:"ok"|"erro", texto }

  async function trocarSenha(e) {
    e.preventDefault()
    setMsg(null)
    if (novaSenha !== confirmar) {
      setMsg({ tipo:"erro", texto:"Nova senha e confirmação não coincidem." })
      return
    }
    if (novaSenha.length < 8) {
      setMsg({ tipo:"erro", texto:"A nova senha deve ter pelo menos 8 caracteres." })
      return
    }
    setLoading(true)
    try {
      const r = await api.patch("/auth/me/senha", {
        senha_atual: senhaAtual,
        nova_senha:  novaSenha,
        confirmar:   confirmar,
      })
      const d = await r?.json()
      if (r?.ok) {
        setMsg({ tipo:"ok", texto:"Senha alterada com sucesso!" })
        setSenhaAtual(""); setNovaSenha(""); setConfirmar("")
      } else {
        setMsg({ tipo:"erro", texto: d?.detail || "Erro ao alterar senha." })
      }
    } catch {
      setMsg({ tipo:"erro", texto:"Erro de comunicação com o servidor." })
    } finally {
      setLoading(false)
    }
  }

  const campo = (label, val, setVal, placeholder = "••••••••") => (
    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
      <label style={{ fontSize:11, fontWeight:600, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.08em" }}>{label}</label>
      <input
        type="password" value={val}
        onChange={e => setVal(e.target.value)}
        placeholder={placeholder}
        style={{ background:"#0F172A", border:"1px solid #1E293B", borderRadius:8, padding:"9px 12px",
          color:"#F1F5F9", fontSize:13, fontFamily:"inherit", outline:"none" }}
      />
    </div>
  )

  return (
    <div className="cfg-enter" style={{ display:"flex", flexDirection:"column", gap:20, maxWidth:420 }}>
      {/* Cabeçalho do perfil */}
      <div style={{ display:"flex", alignItems:"center", gap:14, padding:"16px 18px",
        background:"linear-gradient(135deg,#0F172A,#1E293B)", border:"1px solid #1E293B", borderRadius:12 }}>
        <div style={{ width:44, height:44, borderRadius:"50%", background:"#1E3A5F",
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
          {user?.level === "admin" ? "🛡" : "👤"}
        </div>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color:"#F1F5F9" }}>{user?.nome || user?.sub || "—"}</div>
          <div style={{ fontSize:12, color:"#64748B", marginTop:2 }}>
            {user?.sub}{" · "}
            <span style={{ color: user?.level === "admin" ? "#E8A020" : "#60A5FA", fontWeight:600 }}>
              {user?.level || "analista"}
            </span>
          </div>
        </div>
      </div>

      {/* Formulário */}
      <div style={{ padding:"20px 22px", background:"#0F172A", border:"1px solid #1E293B", borderRadius:12 }}>
        <div style={{ fontSize:13, fontWeight:700, color:"#E8A020", marginBottom:18, display:"flex", alignItems:"center", gap:8 }}>
          🔑 Alterar Senha
        </div>
        <form onSubmit={trocarSenha} style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {campo("Senha Atual", senhaAtual, setSenhaAtual)}
          {campo("Nova Senha", novaSenha, setNovaSenha)}
          {campo("Confirmar Nova Senha", confirmar, setConfirmar)}

          {msg && (
            <div style={{ padding:"9px 12px", borderRadius:8, fontSize:12, fontWeight:600,
              background: msg.tipo === "ok" ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)",
              border: `1px solid ${msg.tipo === "ok" ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
              color: msg.tipo === "ok" ? "#4ADE80" : "#F87171" }}>
              {msg.tipo === "ok" ? "✓ " : "✕ "}{msg.texto}
            </div>
          )}

          <button type="submit" disabled={loading || !senhaAtual || !novaSenha || !confirmar}
            style={{ marginTop:4, padding:"10px 0", borderRadius:8, border:"none",
              background: loading ? "#1E293B" : "#1D4ED8", color:"#FFF",
              fontSize:13, fontWeight:700, cursor: loading ? "default" : "pointer",
              opacity: (!senhaAtual || !novaSenha || !confirmar) ? 0.5 : 1 }}>
            {loading ? "Alterando..." : "Alterar Senha"}
          </button>
        </form>
      </div>

      <div style={{ fontSize:11, color:"#475569", lineHeight:1.6 }}>
        A senha deve ter pelo menos 8 caracteres. Por segurança, a sessão atual permanece ativa após a troca.
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
const ABAS_BASE = [
  { id:"geral",    label:"Geral",       icon:"⚙"  },
  { id:"conexoes", label:"Conexões",    icon:"🔗" },
  { id:"conta",    label:"Minha Conta", icon:"🔑" },
]
const ABAS_ADMIN = [
  { id:"usuarios",  label:"Usuários",  icon:"👥" },
  { id:"auditoria", label:"Auditoria", icon:"🛡" },
]

function TabSpinner() {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flex:1, gap:10 }}>
      <svg style={{ animation:"spin 1s linear infinite" }} width="16" height="16"
        viewBox="0 0 24 24" fill="none" stroke="#E8A020" strokeWidth="1.5" strokeLinecap="round">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      <span style={{ fontSize:13, color:"#94A3B8", fontFamily:MONO }}>Carregando...</span>
    </div>
  )
}

export default function Configuracoes({ onNavigate, tema, setTema, user }) {
  const isAdmin = user?.level === "admin"
  const abas = isAdmin ? [...ABAS_BASE, ...ABAS_ADMIN] : ABAS_BASE
  const [aba, setAba] = useState("geral")

  useEffect(() => {
    const style = document.createElement("style")
    style.textContent = GLOBAL_CSS
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  return (
    <div style={{ display:"flex", flexDirection:"column", flex:1, minWidth:0, height:"100%", overflow:"hidden", background:"#0B1120" }}>

      {/* Topbar */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 20px", borderBottom:"1px solid #1E293B", background:"#0B1120", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E8A020" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
          </svg>
          <span style={{ fontSize:14, fontWeight:700, color:"#F1F5F9", letterSpacing:"0.05em" }}>CONFIGURAÇÕES</span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display:"flex", gap:4, padding:"10px 20px 0", borderBottom:"1px solid #1E293B", background:"#0B1120", flexShrink:0 }}>
        {abas.map(a => (
          <button key={a.id} onClick={() => setAba(a.id)}
            className={aba === a.id ? "cfg-tab-active" : "cfg-tab-inactive"}
            style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px",
              borderRadius:"8px 8px 0 0", border:"1px solid transparent",
              fontSize:12, fontWeight:600, cursor:"pointer", transition:"all .15s" }}>
            <span style={{ fontSize:14 }}>{a.icon}</span>{a.label}
          </button>
        ))}
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"20px", display:"flex", flexDirection:"column" }}>
        {aba === "geral"    && <AbaGeral tema={tema} setTema={setTema} user={user}/>}
        {aba === "conexoes" && <AbaConexoes/>}
        {aba === "conta"    && <AbaConta user={user}/>}
        {/* Abas admin — lazy-loaded dentro de Suspense */}
        {isAdmin && (
          <Suspense fallback={<TabSpinner />}>
            {aba === "usuarios"  && <div style={{ flex:1, display:"flex", flexDirection:"column" }}><GerenciarUsuarios onNavigate={onNavigate}/></div>}
            {aba === "auditoria" && <div style={{ flex:1, display:"flex", flexDirection:"column" }}><AuditoriaLog      onNavigate={onNavigate}/></div>}
          </Suspense>
        )}
      </div>

    </div>
  )
}
