import { useState, useEffect, useRef } from "react"
import logoImg from "./assets/logo.webp"
import ErrorBoundary from "./ErrorBoundary"
import ChatRAG from "./ChatRAG"
import Dashboard from "./Dashboard"
import Transcricao from "./Transcricao"
import Alertas from "./Alertas"
import Noticias from "./Noticias"
import Referencias from "./Referencias"
import Configuracoes from "./Configuracoes"
import Agenda from "./Agenda"
import ListaNegra from "./ListaNegra"
import OsintPesquisa from "./OsintPesquisa"
import Grafoscopia from "./Grafoscopia"
import ControleGrupos from "./ControleGrupos"
import InteligenciaGrupos from "./InteligenciaGrupos"
import LiderancasUnidade from "./LiderancasUnidade"
import GrafoVinculos from "./GrafoVinculos"
import Extrato from "./Extrato"
import SinaisFracos from "./SinaisFracos"
import MatrizNucadis from "./MatrizNucadis"
import Login from "./Login"
import api from "./api"
import LideresGerais from "./LideresGerais"
import HitlDashboard from "./HitlDashboard"
import GerenciarUsuarios from "./GerenciarUsuarios"
import AuditoriaLog from "./AuditoriaLog"
import AnimatedNumber from "./AnimatedNumber"
import { ToastContainer } from "./Toast"
import { ConfirmModalContainer } from "./ConfirmModal"

// Mapeamento: label do nav → módulo necessário no JWT
// Se module === null → sempre visível para qualquer usuário autenticado
const NAV_PERMISSIONS = {
  "Painel":                  null,
  "Alertas":                 "alertas",
  "ORÁCULO":                 "hitl",
  "Controle de Grupos":      "grupos",
  "Inteligência de Grupos":  "inteligencia_grupos",
  "Lideranças por Unidade":  "liderancas",
  "Líderes Gerais":          "liderancas",
  "Análise de Vínculo":      "vinculo",
  "Extrato":                 "extrato",
  "Lista Negra":             "lista_negra",
  "Chat RAG":                "chat_rag",
  "OSINT Pessoas":           "osint",
  "Sinais Fracos":           "sinais_fracos",
  "Referências":             "referencias",
  "Agenda de Missão":        "agenda",
  "Dashboard":               "dashboard",
  "Matriz NUCADIs":          "matrix_nucadis",
  "Transcrição":             "transcricao",
  "Análise Grafoscópica":    "grafoscopia",
  "Notícias":                "noticias",
  "Gerenciar Usuários":      "usuarios",
  "Auditoria":               "auditoria",
}

const NAV_GROUPS_ALL = [
  { title: "PRINCIPAL", items: [
    { label: "Painel",                  color: "#F59E0B" },
    { label: "Alertas",                 color: "#F87171", pulse: true },
    { label: "ORÁCULO",                  color: "#A78BFA", pulse: true },
    { label: "Controle de Grupos",      color: "#F87171" },
    { label: "Inteligência de Grupos",  color: "#A78BFA" },
    { label: "Lideranças por Unidade",  color: "#F87171" },
    { label: "Líderes Gerais",          color: "#F97316" },
    { label: "Análise de Vínculo",      color: "#38BDF8" },
    { label: "Extrato",                 color: "#E8A020" },
    { label: "Lista Negra",             color: "#94A3B8" },
  ]},
  { title: "INTELIGÊNCIA", items: [
    { label: "Chat RAG",        color: "#1D4ED8" },
    { label: "OSINT Pessoas",   color: "#B45309" },
    { label: "Sinais Fracos",   color: "#FBBF24" },
    { label: "Referências",     color: "#C4B5FD" },
    { label: "Agenda de Missão",color: "#F59E0B", badge: "2" },
  ]},
  { title: "FERRAMENTAS", items: [
    { label: "Dashboard",             color: "#34D399" },
    { label: "Matriz NUCADIs",        color: "#F472B6" },
    { label: "Transcrição",           color: "#818CF8" },
    { label: "Análise Grafoscópica",  color: "#FBBF24" },
    { label: "Notícias",              color: "#FB923C" },
    { label: "Gerenciar Usuários",    color: "#60A5FA" },
    { label: "Auditoria",             color: "#A78BFA" },
  ]},
]

function buildNavGroups(modules = []) {
  return NAV_GROUPS_ALL.map(group => ({
    ...group,
    items: group.items.filter(item => {
      const mod = NAV_PERMISSIONS[item.label]
      return mod === null || mod === undefined || modules.includes(mod)
    }),
  })).filter(group => group.items.length > 0)
}

const NEWS = [
  { title: "Acordo bilateral entre Brasil e Argentina avança em questões de defesa", source: "Defesa Net", time: "2h", category: "Defesa", accent: "#60A5FA", img: "https://picsum.photos/seed/defesa/400/200" },
  { title: "Nova tecnologia de vigilância apresentada no Fórum de Segurança Regional", source: "Valor Econômico", time: "4h", category: "Tecnologia", accent: "#A78BFA", img: "https://picsum.photos/seed/tech2/400/200" },
  { title: "Operação conjunta desmantela rede de tráfico no Amazonas", source: "G1 AM", time: "6h", category: "Operação", accent: "#FB923C", img: "https://picsum.photos/seed/op2/400/200" },
  { title: "Reforço nas fronteiras: medidas estratégicas anunciadas pelo governo federal", source: "Agência Brasil", time: "8h", category: "Segurança", accent: "#34D399", img: "https://picsum.photos/seed/seg2/400/200" },
]

const REFS = [
  { label: "Relatórios operacionais", color: "#A78BFA" },
  { label: "Documentos históricos", color: "#A78BFA" },
  { label: "Arquivos de inteligência", color: "#60A5FA" },
  { label: "Busca por período", color: "#60A5FA" },
  { label: "Drive institucional", color: "#34D399" },
]

// Decodifica o payload do JWT sem verificar assinatura (o backend verifica em cada chamada)
function decodeJwt(token) {
  try {
    return JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")))
  } catch { return null }
}

// Lê o usuário atual a partir do access token armazenado (sempre fresco)
function userFromStorage() {
  const token = localStorage.getItem("ab_access_token")
  if (!token) return null
  const p = decodeJwt(token)
  if (!p?.sub) return null
  return { username: p.sub, level: p.level || "analista", modules: p.modules || [] }
}

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const DOT_GRID = `url("data:image/svg+xml,%3Csvg width='28' height='28' viewBox='0 0 28 28' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1' cy='1' r='0.9' fill='%23FFFFFF' fill-opacity='0.04'/%3E%3C/svg%3E")`

// Referencia CSS custom properties — permite trocar tema sem tocar nos componentes
const C = {
  bg:        "var(--ab-bg)",
  surface:   "var(--ab-surface)",
  surfaceUp: "var(--ab-surface2)",
  border:    "var(--ab-border)",
  borderUp:  "var(--ab-border-up)",
  gold:      "#E8A020",
  goldSoft:  "rgba(232,160,32,0.15)",
  text:      "var(--ab-text)",
  textMid:   "var(--ab-text-mid)",
  textDim:   "var(--ab-text-dim)",
}

const GLOBAL_CSS = `
  /* ── CSS Custom Properties por tema ──────────────────────────────────── */
  :root {
    --ab-bg:         #0B1120;
    --ab-surface:    #111827;
    --ab-surface2:   #1A2236;
    --ab-border:     rgba(255,255,255,0.07);
    --ab-border-up:  rgba(255,255,255,0.13);
    --ab-text:       #F1F5F9;
    --ab-text-mid:   #94A3B8;
    --ab-text-dim:   rgba(255,255,255,0.35);
  }
  /* Tema Tático */
  body.theme-tactico {
    --ab-bg:         #070c05;
    --ab-surface:    #0c1309;
    --ab-surface2:   #111f0c;
    --ab-border:     rgba(130,170,60,0.12);
    --ab-border-up:  rgba(130,170,60,0.22);
    --ab-text:       #b8d890;
    --ab-text-mid:   rgba(140,185,85,0.68);
    --ab-text-dim:   rgba(130,170,60,0.42);
  }
  /* Tema Claro */
  body.theme-claro {
    --ab-bg:         #F1F5F9;
    --ab-surface:    #FFFFFF;
    --ab-surface2:   #F8FAFC;
    --ab-border:     rgba(0,0,0,0.08);
    --ab-border-up:  rgba(0,0,0,0.14);
    --ab-text:       #0F172A;
    --ab-text-mid:   #64748B;
    --ab-text-dim:   rgba(0,0,0,0.35);
  }

  * { box-sizing: border-box; }
  body { background: var(--ab-bg); }

  /* ── Seleção de texto ──────────────────────────────────────────────── */
  ::selection { background: rgba(232,160,32,0.28); color: #F1F5F9; }

  /* ── Scrollbar premium ─────────────────────────────────────────────── */
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(232,160,32,0.22); border-radius: 99px; transition: background 0.2s; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(232,160,32,0.55); }

  /* ── Inputs ────────────────────────────────────────────────────────── */
  input, textarea { caret-color: ${C.gold}; transition: box-shadow 0.2s, border-color 0.2s; }
  input::placeholder, textarea::placeholder { color: var(--ab-text-dim) !important; font-weight: 500 !important; opacity:1 !important; }
  input:focus, textarea:focus, select:focus { outline: none; box-shadow: 0 0 0 2px rgba(232,160,32,0.22) !important; border-color: rgba(232,160,32,0.55) !important; }

  /* ── Keyframes ─────────────────────────────────────────────────────── */
  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 5px 1px rgba(22,163,74,0.5); }
    50%       { box-shadow: 0 0 14px 4px rgba(22,163,74,0.9); }
  }
  @keyframes amber-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(232,160,32,0); }
    50%       { box-shadow: 0 0 0 5px rgba(232,160,32,0.14); }
  }
  @keyframes screenIn {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
  @keyframes logoOrbit {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes goldShimmer {
    0%   { background-position: -300% center; }
    100% { background-position:  300% center; }
  }
  @keyframes navBarGrow {
    from { height: 0; opacity: 0; }
    to   { height: 60%; opacity: 1; }
  }
  @keyframes toastIn {
    from { opacity: 0; transform: translateX(-50%) translateY(18px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0);    }
  }
  @keyframes toastProgress {
    from { width: 100%; }
    to   { width: 0%; }
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes dotPulseRed {
    0%, 100% { box-shadow: 0 0 0 0 rgba(248,113,113,0); transform: scale(1); }
    50%       { box-shadow: 0 0 0 5px rgba(248,113,113,0.2); transform: scale(1.15); }
  }

  /* ── Classes utilitárias ───────────────────────────────────────────── */
  .chip-dot-pulse  { animation: pulse-glow 2.4s ease-in-out infinite; }
  .alert-dot-pulse { animation: dotPulseRed 2s ease-in-out infinite; }
  .screen-enter    { animation: screenIn 0.28s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .fade-up         { animation: fadeUp 0.32s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .toast-anim      { animation: toastIn 0.26s cubic-bezier(0.16, 1, 0.3, 1) both; }

  /* ── Logo orbital ring ─────────────────────────────────────────────── */
  .logo-ring-orbit {
    position: absolute; inset: -5px; border-radius: 50%;
    border: 1.5px dashed rgba(245,158,11,0.4);
    animation: logoOrbit 12s linear infinite;
    pointer-events: none;
  }

  /* ── Group label shimmer ───────────────────────────────────────────── */
  .group-label-shimmer {
    background: linear-gradient(90deg, #E8A020 0%, #FDE68A 35%, #E8A020 55%, #B45309 100%);
    background-size: 300% auto;
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: goldShimmer 4s linear infinite;
  }

  /* ── Nav item ──────────────────────────────────────────────────────── */
  .nav-item { position: relative; overflow: hidden; }
  .nav-item::before {
    content: ''; position: absolute; inset: 0; opacity: 0;
    background: radial-gradient(ellipse at left center, rgba(232,160,32,0.14) 0%, transparent 70%);
    transition: opacity 0.25s ease; pointer-events: none;
  }
  .nav-item::after {
    content: '›'; position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
    font-size: 14px; line-height:1; color: transparent;
    transition: color 0.18s ease, right 0.18s ease; pointer-events: none;
  }
  .nav-item:hover::before { opacity: 1; }
  .nav-item:hover { background: rgba(232,160,32,0.09) !important; border-left-color: rgba(232,160,32,0.65) !important; }
  .nav-item:hover::after { color: rgba(232,160,32,0.65); right: 9px; }
  .nav-item:active { transform: scale(0.981); transition: transform 0.07s ease; }
  .nav-item-active-glow { box-shadow: inset 0 0 0 1px rgba(255,255,255,0.09), 0 2px 12px rgba(0,0,0,0.25) !important; }

  /* ── News / ref cards ──────────────────────────────────────────────── */
  .news-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; overflow:hidden; cursor:pointer; transition: all 0.22s cubic-bezier(0.16,1,0.3,1); backdrop-filter: blur(8px); }
  .news-card:hover { background: rgba(255,255,255,0.075); border-color: rgba(232,160,32,0.28); transform: translateY(-3px); box-shadow: 0 10px 28px rgba(0,0,0,0.38); }
  .ref-btn { background: rgba(255,255,255,0.05) !important; border: 1px solid rgba(255,255,255,0.1) !important; transition: all 0.18s ease; }
  .ref-btn:hover { background: ${C.goldSoft} !important; border-color: rgba(232,160,32,0.4) !important; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(0,0,0,0.2); }
  .config-btn:hover { background: rgba(255,255,255,0.07) !important; }

  /* ── Toast ─────────────────────────────────────────────────────────── */
  .toast-progress {
    position: absolute; bottom: 0; left: 0; height: 2px; border-radius: 0 0 8px 8px;
    animation: toastProgress 2.6s linear forwards;
  }
`

const OwlBlueprint = () => (
  <svg width="520" height="180" viewBox="0 0 520 180" fill="none" xmlns="http://www.w3.org/2000/svg" style={{opacity:0.07}}>
    <text x="260" y="44" textAnchor="middle" fontFamily={SANS} fontSize="40" fontWeight="800" letterSpacing="5" fill="#FFFFFF">AGENTE AUTÔNOMO</text>
    <line x1="80" y1="58" x2="440" y2="58" stroke="#FFFFFF" strokeWidth="0.6" strokeDasharray="4 6"/>
    <text x="260" y="95" textAnchor="middle" fontFamily={SANS} fontSize="22" fontWeight="300" letterSpacing="6" fill="#FFFFFF">Sistema de Inteligência</text>
    <text x="260" y="126" textAnchor="middle" fontFamily={SANS} fontSize="18" fontWeight="700" letterSpacing="2" fill="#E8A020">&amp;</text>
    <text x="260" y="158" textAnchor="middle" fontFamily={SANS} fontSize="22" fontWeight="300" letterSpacing="6" fill="#FFFFFF">Segurança Corporativa</text>
  </svg>
)

const GearIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
)
function tempoH(ts) { const d = Math.floor((Date.now()/1000 - ts)/3600); return d + "h" }
export default function App() {
  // ── Sistema de abas ─────────────────────────────────────────────────────
  const [tabs, setTabs]               = useState([{id:"t-init", label:"Painel", color:"#F59E0B"}])
  const [activeTabId, setActiveTabId] = useState("t-init")
  const active = tabs.find(t=>t.id===activeTabId)?.label ?? "Painel"
  const [user, setUser]                 = useState(() => userFromStorage())
  const [message, setMessage]           = useState("")
  const [focused, setFocused]           = useState(false)
  const [chatHistory, setChatHistory]   = useState([])
  const [loading, setLoading]           = useState(false)
  const [liveNews, setLiveNews]         = useState([])
  const [showPolicies, setShowPolicies] = useState(false)
  const [tema, setTema]                 = useState(() => localStorage.getItem("ab_tema") || "dark")
  const [showSearch, setShowSearch]         = useState(false)
  const [searchQuery, setSearchQuery]       = useState("")
  const [alertCount, setAlertCount]         = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications]   = useState([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showThemePicker, setShowThemePicker]   = useState(false)
  const [showProfileMenu, setShowProfileMenu]   = useState(false)
  const [homeKpis, setHomeKpis]             = useState(null)
  const [homeKpisLoading, setHomeKpisLoading] = useState(false)
  const [expandedKpi, setExpandedKpi]       = useState(null)
  const [focusMode, setFocusMode]           = useState(false)
  const [showCheatsheet, setShowCheatsheet] = useState(false)
  const [pendingG, setPendingG]             = useState(false)
  const pendingGRef                         = useRef(null)
  const chatEndRef                      = useRef(null)
  const searchInputRef                  = useRef(null)

  useEffect(() => {
    document.body.classList.remove("dark-mode","theme-tactico","theme-claro")
    if (tema === "tactico") document.body.classList.add("theme-tactico")
    if (tema === "claro")   document.body.classList.add("theme-claro")
    localStorage.setItem("ab_tema", tema)
  }, [tema])

  useEffect(() => {
    const style = document.createElement("style")
    style.textContent = GLOBAL_CSS
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior:"smooth" })
  }, [chatHistory, loading])

  useEffect(() => {
    if (!user) return
    api.get("/noticias")
      .then(r => r?.json())
      .then(d => { if (d?.noticias?.length > 0) setLiveNews(d.noticias) })
      .catch(() => {})
  }, [user])

  // Atalhos de teclado globais
  useEffect(() => {
    const MAP = {
      p:"Painel", a:"Alertas", o:"ORÁCULO",
      c:"Controle de Grupos", i:"Inteligência de Grupos",
      l:"Líderes Gerais", r:"Referências",
      d:"Dashboard", t:"Transcrição", n:"Notícias",
    }
    function onKey(e) {
      const inInput = e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA"||e.target.isContentEditable
      // Ctrl+K sempre funciona
      if ((e.ctrlKey||e.metaKey) && e.key==="k") {
        e.preventDefault(); setShowSearch(s=>{if(!s)setSearchQuery("");return !s}); return
      }
      if (inInput) { if (e.key==="Escape") setShowSearch(false); return }
      if (e.key==="Escape") {
        setShowSearch(false); setShowCheatsheet(false)
        setFocusMode(false)
        if (pendingGRef.current) { clearTimeout(pendingGRef.current); pendingGRef.current=null; setPendingG(false) }
        return
      }
      // ? → cheatsheet
      if (e.key==="?" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setShowCheatsheet(s=>!s); return }
      // F → modo foco
      if (e.key==="f" && !e.ctrlKey && !e.metaKey) { setFocusMode(s=>!s); return }
      // G sequence — primeiro G
      if (e.key==="g" && !e.ctrlKey && !e.metaKey) {
        if (pendingGRef.current) clearTimeout(pendingGRef.current)
        setPendingG(true)
        pendingGRef.current = setTimeout(()=>{ setPendingG(false); pendingGRef.current=null }, 1500)
        return
      }
      // G+key
      if (pendingGRef.current) {
        clearTimeout(pendingGRef.current); pendingGRef.current=null; setPendingG(false)
        const dest = MAP[e.key.toLowerCase()]
        if (dest) { e.preventDefault(); openTab(dest) }
        return
      }
    }
    window.addEventListener("keydown", onKey)
    return ()=>window.removeEventListener("keydown", onKey)
  }, [openTab])

  // Focus automático no input ao abrir
  useEffect(() => {
    if (showSearch) setTimeout(() => searchInputRef.current?.focus(), 50)
  }, [showSearch])

  // Polling de alertas e notificações do sistema a cada 30s
  useEffect(() => {
    if (!user) return
    const fetchAlerts = async () => {
      try {
        const r = await api.get("/human-loop/listar"); const d = await r?.json()
        if (!Array.isArray(d)) return
        const pendentes = d.filter(a=>a.status==="pendente")
        setAlertCount(pendentes.length)
        setNotifications(pendentes.slice(0,5).map(a=>({
          id: a.id || Math.random(),
          tipo: "hitl",
          titulo: "Revisão pendente — ORÁCULO",
          corpo: a.prompt ? a.prompt.slice(0,60)+"…" : "Nova análise aguardando aprovação",
          cor: "#A78BFA", ts: a.criado_em || null
        })))
      } catch {}
    }
    fetchAlerts()
    const id = setInterval(fetchAlerts, 30000)
    return () => clearInterval(id)
  }, [user])

  // ── KPI fetch para o Painel ───────────────────────────────────────────
  useEffect(() => {
    if (active !== "Painel" || !user) return
    setHomeKpisLoading(true)
    Promise.all([
      api.get("/alertas").then(r=>r.json()).catch(()=>[]),
      api.get("/grupos/kpis").then(r=>r.json()).catch(()=>null),
      api.get("/dashboard/kpi").then(r=>r.json()).catch(()=>null),
    ]).then(([alertas, gruposKpi, dashKpi]) => {
      const meses = gruposKpi?.meses || []
      const ultimoMes = meses[meses.length-1]
      const gruposAtivos = ultimoMes ? Object.keys(gruposKpi.series?.[ultimoMes]||{}).length : 0
      // Histórico dos últimos 6 meses para o sparkline
      const hist6 = meses.slice(-6).map(m=>{
        const vals = Object.values(gruposKpi?.series?.[m]||{})
        return vals.reduce((a,b)=>a+b,0)
      })
      setHomeKpis({
        alertas:          Array.isArray(alertas) ? alertas.length : 0,
        alertasCriticos:  Array.isArray(alertas) ? alertas.filter(a=>a.nivel==="critico"||a.nivel==="alto").length : 0,
        gruposAtivos,
        variacoes:        gruposKpi?.alertas?.length || 0,
        hist6,
        docsMes:          dashKpi?.total_mes || 0,
        docsAno:          dashKpi?.acumulado_ano || 0,
        variacaoPct:      dashKpi?.variacao_pct || 0,
        porTipo:          dashKpi?.por_tipo || [],
        meses:            meses.slice(-6),
      })
    }).finally(()=>setHomeKpisLoading(false))
  }, [active, user])

  function handleLogin(data) {
    // Remove cache stale — módulos sempre lidos do JWT via userFromStorage()
    localStorage.removeItem("ab_user")
    setUser({ username: data.username, level: data.level, modules: data.modules || [] })
  }

  function handleLogout() {
    localStorage.removeItem("ab_access_token")
    localStorage.removeItem("ab_refresh_token")
    localStorage.removeItem("ab_user")
    setUser(null)
  }

  // ── Logout automático quando token expira (api.js dispara 'ab:logout') ──
  useEffect(() => {
    function onSessionExpired() { setUser(null) }
    window.addEventListener("ab:logout", onSessionExpired)
    return () => window.removeEventListener("ab:logout", onSessionExpired)
  }, [])  // setUser é estável — [] é seguro aqui

  // ── openTab: abre nova aba ou foca a existente ─────────────────────────
  function openTab(label) {
    setTabs(prev => {
      const exists = prev.find(t => t.label === label)
      if (exists) {
        setActiveTabId(exists.id)
        return prev
      }
      const navItem = NAV_GROUPS_ALL.flatMap(g=>g.items).find(i=>i.label===label)
      const id = "t-" + Date.now() + "-" + Math.random().toString(36).slice(2,5)
      setActiveTabId(id)
      return [...prev, {id, label, color: navItem?.color || "#94A3B8"}]
    })
  }

  // ── closeTab: fecha aba e ativa a anterior ────────────────────────────
  function closeTab(tabId) {
    setTabs(prev => {
      if (prev.length === 1) {
        const home = {id:"t-home-"+Date.now(), label:"Painel", color:"#F59E0B"}
        setActiveTabId(home.id)
        return [home]
      }
      const idx  = prev.findIndex(t => t.id === tabId)
      const next = prev.filter(t => t.id !== tabId)
      if (tabId === activeTabId) {
        setActiveTabId(next[Math.max(0, idx - 1)].id)
      }
      return next
    })
  }

  async function enviarPergunta() {
    const pergunta = message.trim()
    if (!pergunta || loading) return
    setMessage("")
    setChatHistory(prev=>[...prev,{role:"user",text:pergunta}])
    setLoading(true)
    try {
      const res  = await api.post("/chat", { pergunta })
      const data = await res.json()
      setChatHistory(prev=>[...prev,{role:"bastos",text:data.resposta}])
    } catch {
      setChatHistory(prev=>[...prev,{role:"bastos",text:"FALHA: sem conexão com o backend."}])
    } finally { setLoading(false) }
  }

  function handleKey(e) {
    if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); enviarPergunta() }
  }

  // ← AQUI — depois de todos os hooks e funções
  if (!user) return <Login onLogin={handleLogin} />

  const now = new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})
  const NAV_GROUPS = buildNavGroups(user?.modules || [])

  const newsToShow = liveNews.length > 0
    ? liveNews.slice(0,4).map((n,i)=>({
        title: n.titulo, source:"n8n", time: tempoH(n.atualizado),
        category:"Intel", accent:"#FB923C",
        img: n.imagem||`https://picsum.photos/seed/n${i}/400/200`,
      }))
    : NEWS

  return (
    <div style={S.app}>
      <div style={S.dotGrid}/>
      <ToastContainer/>
      <ConfirmModalContainer/>

      <aside style={{...S.sidebar, width: focusMode ? 0 : (sidebarCollapsed ? 60 : 240), transition:"width 0.28s cubic-bezier(0.4,0,0.2,1)"}}>
        <div style={{...S.logoArea, padding: sidebarCollapsed ? "10px 8px" : "14px 16px 12px"}}>
          <div style={{position:"relative",display:"inline-flex",alignItems:"center",justifyContent:"center"}}>
            <div style={S.logoRing}>
              <img src={logoImg} alt="AB" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            </div>
            <div className="logo-ring-orbit"/>
          </div>
          {!sidebarCollapsed && (
            <div style={S.logoText}>
              <div style={S.logoName}>Agent Bastos</div>
              <div style={S.logoTagline}>Inteligência Soberana</div>
            </div>
          )}
        </div>

        <div style={{flex:1,display:"flex",flexDirection:"column",padding:"2px 0",overflowY:"auto",overflowX:"hidden"}}>
          <nav style={S.nav}>
            {NAV_GROUPS.map(group=>(
              <div key={group.title} style={{marginBottom:12}}>
                {!sidebarCollapsed && (
                  <div style={S.groupLabel}>
                    <span style={S.groupLabelBar}/>
                    <span className="group-label-shimmer">{group.title}</span>
                  </div>
                )}
                {group.items.map(item=>{
                  const isActive = active===item.label
                  // Abreviação enterprise: iniciais das palavras-chave
                  const words = item.label.split(/[\s\/]+/)
                  const abbr  = words.length >= 2
                    ? (words[0][0] + words[words.length-1][0]).toUpperCase()
                    : item.label.slice(0,2).toUpperCase()
                  // Parse da cor hex para rgba sem depender de parseInt
                  const hex = item.color.replace("#","")
                  const r = parseInt(hex.slice(0,2),16)
                  const g = parseInt(hex.slice(2,4),16)
                  const b = parseInt(hex.slice(4,6),16)
                  return (
                    <button key={item.label} title={sidebarCollapsed ? item.label : undefined}
                      className={`nav-item${isActive?" nav-item-active-glow":""}`}
                      style={{...S.ni,
                        justifyContent: sidebarCollapsed ? "center" : "flex-start",
                        padding: sidebarCollapsed ? "6px 4px" : "6px 10px",
                        paddingRight: sidebarCollapsed ? 4 : 28,
                        ...(isActive?{
                          background:`linear-gradient(90deg,rgba(255,255,255,0.13) 0%,rgba(255,255,255,0.06) 100%)`,
                          borderLeft:`3px solid ${item.color}`,
                        }:{borderLeft:"3px solid transparent"})}}
                      onClick={()=>openTab(item.label)}>
                      {isActive && !sidebarCollapsed && (
                        <span style={{
                          position:"absolute",left:0,top:"50%",transform:"translateY(-50%)",
                          width:3,height:"60%",borderRadius:"0 3px 3px 0",
                          background:item.color,
                          boxShadow:`0 0 10px ${item.color}`,
                          animation:"navBarGrow 0.2s cubic-bezier(0.16,1,0.3,1) both"
                        }}/>
                      )}
                      {sidebarCollapsed ? (
                        <span className="sidebar-chip" style={{
                          display:"flex",alignItems:"center",justifyContent:"center",
                          width:32,height:26,borderRadius:6,flexShrink:0,
                          background: isActive ? `rgba(${r},${g},${b},0.16)` : "rgba(255,255,255,0.05)",
                          border: isActive ? `1px solid rgba(${r},${g},${b},0.40)` : "1px solid rgba(255,255,255,0.07)",
                          fontSize:10,fontWeight:800,letterSpacing:"0.05em",
                          fontFamily:"'JetBrains Mono','Roboto Mono',monospace",
                          color: isActive ? item.color : "rgba(255,255,255,0.38)",
                          transition:"all 0.15s",
                        }}>
                          {abbr}
                        </span>
                      ) : (
                        <>
                          <span style={{fontSize:13,flex:1,
                            color: isActive?"#FFFFFF":"rgba(255,255,255,0.68)",
                            fontWeight: isActive?700:400,letterSpacing:"0.01em",
                            transition:"color 0.15s"}}>
                            {item.label}
                          </span>
                          {item.badge&&<span style={{fontSize:11,fontWeight:700,padding:"1px 6px",
                            borderRadius:8,background:item.color,color:"#F1F5F9",fontFamily:MONO}}>
                            {item.badge}
                          </span>}
                          {item.pulse&&<span className="alert-dot-pulse" style={{width:7,height:7,borderRadius:"50%",
                            background:"#F87171",flexShrink:0,boxShadow:"0 0 7px rgba(248,113,113,0.9)"}}/>}
                        </>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
        </div>

        <div style={{...S.sidebarFooter, padding: sidebarCollapsed ? "0 6px 12px" : "0 12px 12px"}}>
          <div style={S.footerDivider}/>

          {/* Botão collapse — sempre visível */}
          <button
            onClick={()=>setSidebarCollapsed(s=>!s)}
            title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            style={{
              display:"flex",alignItems:"center",justifyContent: sidebarCollapsed ? "center" : "flex-start",
              gap:8,width:"100%",padding:"7px 8px",marginBottom:6,
              background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",
              borderRadius:7,cursor:"pointer",color:"rgba(255,255,255,0.55)",
              transition:"all 0.15s",
            }}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(232,160,32,0.10)";e.currentTarget.style.borderColor="rgba(232,160,32,0.30)";e.currentTarget.style.color="#E8A020"}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.style.borderColor="rgba(255,255,255,0.08)";e.currentTarget.style.color="rgba(255,255,255,0.55)"}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{transition:"transform 0.22s",transform: sidebarCollapsed ? "rotate(180deg)" : "rotate(0deg)"}}>
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            {!sidebarCollapsed && <span style={{fontSize:12,fontFamily:"'JetBrains Mono','Roboto Mono',monospace",fontWeight:600,letterSpacing:"0.02em"}}>Recolher menu</span>}
          </button>

          {!sidebarCollapsed && (
            <>
              <button style={S.policyBtn} onClick={()=>setShowPolicies(true)}>Políticas de uso</button>
              <div style={S.copyright}>
                © 2026 <span style={{color:"#F59E0B",fontWeight:700}}>Agent Bastos</span>
                <span style={{display:"block",marginTop:1}}>Todos os direitos reservados</span>
              </div>
            </>
          )}
        </div>
      </aside>

      <main style={S.main}>

        {/* ══ FOCUS MODE EXIT PILL ═══════════════════════════════════════════ */}
        {focusMode && (
          <div style={{
            position:"fixed",top:12,right:12,zIndex:9990,
            display:"flex",alignItems:"center",gap:8,
            padding:"7px 14px",borderRadius:20,
            background:"rgba(10,14,24,0.92)",backdropFilter:"blur(16px)",
            border:"1px solid rgba(232,160,32,0.35)",
            boxShadow:"0 4px 20px rgba(0,0,0,0.5)",
            animation:"fadeUp 0.22s ease"
          }}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="#E8A020" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
                <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
              </svg>
              <span style={{fontSize:12,fontWeight:700,color:"#E8A020",fontFamily:"'JetBrains Mono','Roboto Mono',monospace",letterSpacing:"0.06em"}}>
                MODO FOCO
              </span>
            </div>
            <span style={{fontSize:10,color:"rgba(255,255,255,0.38)",fontFamily:"'JetBrains Mono','Roboto Mono',monospace"}}>ESC ou F para sair</span>
            <button onClick={()=>setFocusMode(false)}
              style={{display:"flex",alignItems:"center",justifyContent:"center",
                width:20,height:20,borderRadius:4,border:"none",cursor:"pointer",
                background:"rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.50)",
                padding:0,transition:"all 0.15s"}}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.16)";e.currentTarget.style.color="#F1F5F9"}}
              onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.08)";e.currentTarget.style.color="rgba(255,255,255,0.50)"}}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        )}

        {/* ══ G PENDING INDICATOR ═════════════════════════════════════════════ */}
        {pendingG && (
          <div style={{
            position:"fixed",bottom:80,right:20,zIndex:9991,
            padding:"8px 16px",borderRadius:8,
            background:"rgba(10,14,24,0.94)",backdropFilter:"blur(16px)",
            border:"1px solid rgba(232,160,32,0.45)",
            boxShadow:"0 4px 20px rgba(232,160,32,0.15)",
            animation:"fadeUp 0.15s ease"
          }}>
            <span style={{fontSize:16,fontWeight:800,color:"#E8A020",
              fontFamily:"'JetBrains Mono','Roboto Mono',monospace",letterSpacing:"0.06em"}}>
              G·
            </span>
            <span style={{fontSize:12,color:"rgba(255,255,255,0.45)",
              fontFamily:"'JetBrains Mono','Roboto Mono',monospace",marginLeft:8}}>
              aguardando tecla...
            </span>
          </div>
        )}

        {/* ══ KEYBOARD CHEATSHEET ═════════════════════════════════════════════ */}
        {showCheatsheet && (
          <div onClick={()=>setShowCheatsheet(false)} style={{
            position:"fixed",inset:0,zIndex:9995,
            background:"rgba(0,0,0,0.65)",backdropFilter:"blur(8px)",
            display:"flex",alignItems:"center",justifyContent:"center"
          }}>
            <div onClick={e=>e.stopPropagation()} style={{
              background:"rgba(10,16,28,0.99)",borderRadius:14,
              border:"1px solid rgba(255,255,255,0.10)",
              boxShadow:"0 24px 64px rgba(0,0,0,0.7)",
              padding:"24px 28px",minWidth:480,
              animation:"scaleIn 0.18s cubic-bezier(0.16,1,0.3,1)"
            }}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:18}}>⌨</span>
                  <div>
                    <div style={{fontSize:15,fontWeight:700,color:"#F1F5F9",fontFamily:"'JetBrains Mono','Roboto Mono',monospace"}}>
                      Atalhos de Teclado
                    </div>
                    <div style={{fontSize:11,color:"rgba(255,255,255,0.38)",fontFamily:"'JetBrains Mono','Roboto Mono',monospace",marginTop:2}}>
                      Agent Bastos · padrão Linear/GitHub
                    </div>
                  </div>
                </div>
                <button onClick={()=>setShowCheatsheet(false)}
                  style={{width:28,height:28,borderRadius:6,border:"1px solid rgba(255,255,255,0.10)",
                    background:"rgba(255,255,255,0.04)",cursor:"pointer",color:"rgba(255,255,255,0.50)",
                    display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 24px"}}>
                {[
                  {section:"NAVEGAÇÃO (G + tecla)"},
                  {key:"G  P",  desc:"Painel"},
                  {key:"G  A",  desc:"Alertas"},
                  {key:"G  O",  desc:"ORÁCULO"},
                  {key:"G  C",  desc:"Controle de Grupos"},
                  {key:"G  I",  desc:"Inteligência de Grupos"},
                  {key:"G  L",  desc:"Líderes Gerais"},
                  {key:"G  R",  desc:"Referências"},
                  {key:"G  D",  desc:"Dashboard"},
                  {key:"G  T",  desc:"Transcrição"},
                  {key:"G  N",  desc:"Notícias"},
                  {section:"INTERFACE"},
                  {key:"Ctrl K", desc:"Abrir busca"},
                  {key:"F",      desc:"Modo foco"},
                  {key:"?",      desc:"Este cheatsheet"},
                  {key:"ESC",    desc:"Fechar / sair do foco"},
                ].map((item,i)=>{
                  if (item.section) return (
                    <div key={i} style={{gridColumn:"1/-1",marginTop:i>0?14:0,
                      fontSize:9,fontWeight:800,color:"rgba(232,160,32,0.60)",
                      letterSpacing:"0.14em",textTransform:"uppercase",
                      fontFamily:"'JetBrains Mono','Roboto Mono',monospace",
                      borderBottom:"1px solid rgba(255,255,255,0.06)",paddingBottom:6}}>
                      {item.section}
                    </div>
                  )
                  return (
                    <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                      padding:"5px 8px",borderRadius:6,background:"rgba(255,255,255,0.03)"}}>
                      <span style={{fontSize:11,color:"rgba(255,255,255,0.55)",
                        fontFamily:"'JetBrains Mono','Roboto Mono',monospace"}}>{item.desc}</span>
                      <div style={{display:"flex",gap:4}}>
                        {item.key.split(" ").map((k,j)=>(
                          <kbd key={j} style={{
                            padding:"2px 7px",borderRadius:4,
                            background:"rgba(255,255,255,0.08)",
                            border:"1px solid rgba(255,255,255,0.14)",
                            color:"#E8A020",fontSize:10,
                            fontFamily:"'JetBrains Mono','Roboto Mono',monospace",
                            fontWeight:700,letterSpacing:"0.04em"
                          }}>{k}</kbd>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div style={{marginTop:16,padding:"10px 12px",borderRadius:8,
                background:"rgba(232,160,32,0.06)",border:"1px solid rgba(232,160,32,0.15)"}}>
                <span style={{fontSize:11,color:"rgba(232,160,32,0.70)",
                  fontFamily:"'JetBrains Mono','Roboto Mono',monospace"}}>
                  💡 Press <kbd style={{padding:"1px 5px",borderRadius:3,
                    background:"rgba(232,160,32,0.12)",border:"1px solid rgba(232,160,32,0.25)",
                    color:"#E8A020",fontSize:10,fontFamily:"'JetBrains Mono','Roboto Mono',monospace",fontWeight:700}}>?</kbd> a qualquer momento para abrir este painel.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ══ TOPBAR PROFISSIONAL ══════════════════════════════════════════════ */}
        <div style={{
          height:48, display: focusMode ? "none" : "flex", alignItems:"center", gap:10,
          padding:"0 14px 0 12px", flexShrink:0,
          background:"rgba(10,16,30,0.97)", backdropFilter:"blur(24px)",
          borderBottom:"1px solid rgba(255,255,255,0.07)",
          boxShadow:"0 1px 0 rgba(232,160,32,0.12),0 4px 20px rgba(0,0,0,0.4)",
          position:"relative", zIndex:20
        }}>

          {/* ── Breadcrumb ── */}
          {(()=>{
            const activeGroup = NAV_GROUPS.find(g=>g.items.some(i=>i.label===active))
            return (
              <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0,minWidth:150}}>
                <span style={{color:"#E8A020",fontSize:13,fontWeight:900,flexShrink:0}}>◈</span>
                <div style={{lineHeight:1.15}}>
                  {activeGroup && (
                    <div style={{fontSize:9,fontWeight:800,letterSpacing:"0.12em",
                      color:"rgba(232,160,32,0.55)",textTransform:"uppercase",
                      fontFamily:MONO,marginBottom:1}}>
                      {activeGroup.title}
                    </div>
                  )}
                  <div style={{fontSize:14,fontWeight:700,color:"#F1F5F9",maxWidth:145,
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                    letterSpacing:"-0.01em"}}>
                    {active}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* ── Centro: inline search ── */}
          <div style={{flex:1,maxWidth:440,margin:"0 auto",position:"relative"}}>
            {/* Trigger / Input */}
            {!showSearch ? (
              <button onClick={()=>{setShowSearch(true);setSearchQuery(""); setTimeout(()=>searchInputRef.current?.focus(),30)}}
                style={{
                  width:"100%",display:"flex",alignItems:"center",gap:9,
                  padding:"7px 12px",borderRadius:8,cursor:"text",
                  background:"rgba(255,255,255,0.05)",
                  border:"1px solid rgba(255,255,255,0.09)",
                  transition:"all 0.2s"
                }}
                onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.09)";e.currentTarget.style.borderColor="rgba(232,160,32,0.30)"}}
                onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.05)";e.currentTarget.style.borderColor="rgba(255,255,255,0.09)"}}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <span style={{fontSize:13,color:"rgba(255,255,255,0.32)",fontFamily:MONO,flex:1}}>
                  Pesquisar telas e módulos...
                </span>
                <kbd style={{padding:"1px 6px",borderRadius:4,
                  background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",
                  color:"rgba(255,255,255,0.38)",fontSize:10,fontFamily:MONO,flexShrink:0}}>Ctrl+K</kbd>
              </button>
            ) : (
              <div style={{position:"relative"}}>
                <div style={{display:"flex",alignItems:"center",gap:9,padding:"7px 12px",
                  borderRadius:"8px 8px 0 0",background:"rgba(13,20,36,0.98)",
                  border:"1px solid rgba(232,160,32,0.35)",borderBottom:"none"}}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#E8A020" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input ref={searchInputRef} value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
                    placeholder="Digite o nome da tela..."
                    style={{flex:1,background:"transparent",border:"none",outline:"none",
                      fontSize:13,color:"#F1F5F9",fontFamily:MONO,caretColor:"#E8A020"}}
                    onBlur={()=>{ setTimeout(()=>setShowSearch(false), 150) }}/>
                  <button onClick={()=>setShowSearch(false)}
                    style={{background:"none",border:"none",cursor:"pointer",
                      color:"rgba(255,255,255,0.35)",fontSize:16,lineHeight:1,padding:0}}>×</button>
                </div>
                {/* Dropdown de resultados */}
                <div className="topbar-popup" style={{
                  position:"absolute",top:"100%",left:0,right:0,
                  background:"rgba(10,16,28,0.99)",
                  border:"1px solid rgba(232,160,32,0.25)",borderTop:"none",
                  borderRadius:"0 0 10px 10px",
                  boxShadow:"0 16px 40px rgba(0,0,0,0.6)",
                  maxHeight:320,overflowY:"auto",zIndex:999
                }}>
                  {NAV_GROUPS.flatMap(g=>g.items)
                    .filter(item=>item.label.toLowerCase().includes(searchQuery.toLowerCase()))
                    .slice(0,10)
                    .map(item=>(
                      <button key={item.label}
                        onMouseDown={()=>{openTab(item.label);setShowSearch(false)}}
                        style={{
                          width:"100%",display:"flex",alignItems:"center",gap:10,
                          padding:"9px 14px",background:"transparent",border:"none",
                          borderBottom:"1px solid rgba(255,255,255,0.04)",
                          cursor:"pointer",textAlign:"left",transition:"background 0.1s"
                        }}
                        onMouseEnter={e=>e.currentTarget.style.background="rgba(232,160,32,0.08)"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <div style={{width:7,height:7,borderRadius:"50%",flexShrink:0,
                          background:item.color,boxShadow:`0 0 5px ${item.color}88`}}/>
                        <span style={{fontSize:13,color:"#E2E8F0",fontFamily:MONO,flex:1}}>{item.label}</span>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.20)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </button>
                    ))}
                  {NAV_GROUPS.flatMap(g=>g.items).filter(item=>item.label.toLowerCase().includes(searchQuery.toLowerCase())).length===0 && (
                    <div style={{padding:"16px",textAlign:"center",color:"rgba(255,255,255,0.30)",
                      fontSize:13,fontFamily:MONO}}>Nenhum módulo encontrado</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Direita: ações ── */}
          <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0}}>

            {/* Sino de alertas — dropdown de notificações */}
            <div style={{position:"relative"}}>
              <button onClick={()=>{setShowNotifications(s=>!s)}} title="Notificações do sistema"
                style={{
                  position:"relative",width:34,height:34,borderRadius:7,cursor:"pointer",
                  background:showNotifications?"rgba(167,139,250,0.15)":"rgba(255,255,255,0.04)",
                  border:`1px solid ${showNotifications?"rgba(167,139,250,0.4)":"rgba(255,255,255,0.08)"}`,
                  display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s"
                }}
                onMouseEnter={e=>{if(!showNotifications){e.currentTarget.style.background="rgba(167,139,250,0.12)";e.currentTarget.style.borderColor="rgba(167,139,250,0.3)"}}}
                onMouseLeave={e=>{if(!showNotifications){e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.style.borderColor="rgba(255,255,255,0.08)"}}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                  stroke={alertCount>0?"#A78BFA":"rgba(255,255,255,0.50)"}
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {alertCount>0 && (
                  <span style={{
                    position:"absolute",top:-4,right:-4,minWidth:16,height:16,borderRadius:8,
                    background:"#7C3AED",border:"2px solid #0A1020",
                    color:"#fff",fontSize:9,fontWeight:800,fontFamily:MONO,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    padding:"0 2px",lineHeight:1,boxShadow:"0 0 8px rgba(124,58,237,0.8)"
                  }}>{alertCount}</span>
                )}
              </button>
              {/* Dropdown de notificações */}
              {showNotifications && (
                <div onClick={()=>setShowNotifications(false)}
                  style={{position:"fixed",inset:0,zIndex:998}} />
              )}
              {showNotifications && (
                <div className="topbar-popup" style={{
                  position:"absolute",top:"calc(100% + 8px)",right:0,
                  width:320,borderRadius:10,overflow:"hidden",
                  background:"rgba(10,16,28,0.99)",
                  border:"1px solid rgba(255,255,255,0.10)",
                  boxShadow:"0 16px 48px rgba(0,0,0,0.6)",zIndex:999
                }}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                    padding:"11px 14px",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
                    <span style={{fontSize:12,fontWeight:800,color:"#94A3B8",letterSpacing:"0.1em",
                      textTransform:"uppercase",fontFamily:MONO}}>Notificações</span>
                    {alertCount>0 && <span style={{fontSize:10,color:"#A78BFA",fontFamily:MONO,
                      fontWeight:700}}>{alertCount} pendente{alertCount>1?"s":""}</span>}
                  </div>
                  {notifications.length===0 ? (
                    <div style={{padding:"24px",textAlign:"center"}}>
                      <div style={{fontSize:22,marginBottom:6}}>🔔</div>
                      <div style={{fontSize:13,color:"rgba(255,255,255,0.35)",fontFamily:MONO}}>
                        Nenhuma notificação nova
                      </div>
                    </div>
                  ) : notifications.map(n=>(
                    <div key={n.id} style={{
                      padding:"10px 14px",borderBottom:"1px solid rgba(255,255,255,0.05)",
                      display:"flex",gap:10,alignItems:"flex-start"
                    }}>
                      <div style={{width:8,height:8,borderRadius:"50%",flexShrink:0,
                        marginTop:4,background:n.cor,boxShadow:`0 0 6px ${n.cor}88`}}/>
                      <div style={{flex:1}}>
                        <div style={{fontSize:12,fontWeight:700,color:"#E2E8F0",fontFamily:MONO,
                          marginBottom:2}}>{n.titulo}</div>
                        <div style={{fontSize:11,color:"rgba(255,255,255,0.50)",fontFamily:MONO,
                          lineHeight:1.5}}>{n.corpo}</div>
                      </div>
                    </div>
                  ))}
                  {/* Notificações fixas do sistema */}
                  {[
                    {titulo:"Sistema",corpo:"Agent Bastos v1.0 · Build estável",cor:"#22C55E"},
                    {titulo:"Doutrina RAG",corpo:"Base de conhecimento disponível para consulta",cor:"#60A5FA"},
                  ].map((n,i)=>(
                    <div key={"sys-"+i} style={{
                      padding:"10px 14px",borderBottom:"1px solid rgba(255,255,255,0.04)",
                      display:"flex",gap:10,alignItems:"flex-start",
                      opacity:0.65
                    }}>
                      <div style={{width:7,height:7,borderRadius:"50%",flexShrink:0,
                        marginTop:4,background:n.cor}}/>
                      <div style={{flex:1}}>
                        <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",fontFamily:MONO,
                          marginBottom:1}}>{n.titulo}</div>
                        <div style={{fontSize:11,color:"rgba(255,255,255,0.40)",fontFamily:MONO}}>{n.corpo}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Theme Picker — troca de aparência direto no topbar */}
            <div style={{position:"relative"}}>
              <button onClick={()=>setShowThemePicker(s=>!s)} title="Aparência"
                style={{
                  width:34,height:34,borderRadius:7,cursor:"pointer",
                  background: showThemePicker ? "rgba(232,160,32,0.12)" : "rgba(255,255,255,0.04)",
                  border:`1px solid ${showThemePicker ? "rgba(232,160,32,0.35)" : "rgba(255,255,255,0.08)"}`,
                  display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s"
                }}
                onMouseEnter={e=>{if(!showThemePicker){e.currentTarget.style.background="rgba(232,160,32,0.12)";e.currentTarget.style.borderColor="rgba(232,160,32,0.35)"}}}
                onMouseLeave={e=>{if(!showThemePicker){e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.style.borderColor="rgba(255,255,255,0.08)"}}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={showThemePicker?"#E8A020":"rgba(255,255,255,0.55)"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
                  <line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/>
                  <line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/>
                </svg>
              </button>
              {showThemePicker && (
                <div onClick={()=>setShowThemePicker(false)}
                  style={{position:"fixed",inset:0,zIndex:998}}/>
              )}
              {showThemePicker && (
                <div className="topbar-popup" style={{
                  position:"absolute",top:"calc(100% + 8px)",right:0,
                  width:200,borderRadius:10,overflow:"hidden",
                  background:"rgba(10,16,28,0.99)",
                  border:"1px solid rgba(255,255,255,0.10)",
                  boxShadow:"0 16px 40px rgba(0,0,0,0.6)",zIndex:999
                }}>
                  <div style={{padding:"9px 12px 6px",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
                    <span style={{fontSize:10,fontWeight:800,color:"#94A3B8",letterSpacing:"0.12em",
                      textTransform:"uppercase",fontFamily:MONO}}>Aparência</span>
                  </div>
                  {[
                    {id:"dark",    label:"Padrão",   sub:"Dark · Recomendado", swatch:"#0A1020"},
                    {id:"tactico", label:"Tático",   sub:"Operacional",         swatch:"#0c1309"},
                    {id:"claro",   label:"Claro",    sub:"Corporativo",         swatch:"#E2E8F0"},
                  ].map(t=>(
                    <button key={t.id} onClick={()=>{setTema(t.id);setShowThemePicker(false)}}
                      style={{
                        width:"100%",display:"flex",alignItems:"center",gap:10,
                        padding:"9px 12px",background:"transparent",border:"none",
                        cursor:"pointer",textAlign:"left",transition:"background 0.12s",
                        borderBottom:"1px solid rgba(255,255,255,0.04)"
                      }}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(232,160,32,0.08)"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      {/* Swatch */}
                      <div style={{
                        width:22,height:22,borderRadius:6,flexShrink:0,
                        background:t.swatch,
                        border: tema===t.id ? "2px solid #E8A020" : "1.5px solid rgba(255,255,255,0.18)",
                        boxShadow: tema===t.id ? "0 0 8px rgba(232,160,32,0.5)" : "none",
                        transition:"all 0.15s"
                      }}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:700,
                          color: tema===t.id ? "#E8A020" : "#E2E8F0",fontFamily:MONO}}>{t.label}</div>
                        <div style={{fontSize:10,color:"rgba(255,255,255,0.38)",fontFamily:MONO,marginTop:1}}>{t.sub}</div>
                      </div>
                      {tema===t.id && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#E8A020" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Avatar dropdown ── */}
            <div style={{position:"relative"}}>
              <button
                onClick={()=>setShowProfileMenu(s=>!s)}
                style={{
                  display:"flex",alignItems:"center",gap:8,
                  padding:"3px 9px 3px 4px",borderRadius:20,cursor:"pointer",
                  background: showProfileMenu ? "rgba(232,160,32,0.10)" : "rgba(255,255,255,0.04)",
                  border:`1px solid ${showProfileMenu ? "rgba(232,160,32,0.35)" : "rgba(255,255,255,0.08)"}`,
                  transition:"all 0.18s"
                }}
                onMouseEnter={e=>{if(!showProfileMenu){e.currentTarget.style.background="rgba(232,160,32,0.07)";e.currentTarget.style.borderColor="rgba(232,160,32,0.22)"}}}
                onMouseLeave={e=>{if(!showProfileMenu){e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.style.borderColor="rgba(255,255,255,0.08)"}}}>
                {/* Iniciais */}
                <div style={{
                  width:28,height:28,borderRadius:"50%",flexShrink:0,
                  background:"linear-gradient(135deg,rgba(232,160,32,0.40),rgba(232,160,32,0.16))",
                  border:"1.5px solid rgba(232,160,32,0.65)",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:12,fontWeight:800,color:"#E8A020",fontFamily:MONO
                }}>
                  {(user?.username||"?")[0].toUpperCase()}
                </div>
                {/* Nome + cargo */}
                <div style={{lineHeight:1.2}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#F1F5F9",fontFamily:MONO}}>{user?.username}</div>
                  <div style={{fontSize:9,fontWeight:800,color:"#F59E0B",letterSpacing:"0.10em",
                    textTransform:"uppercase",fontFamily:MONO}}>{user?.level}</div>
                </div>
                {/* Chevron */}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                  stroke="rgba(255,255,255,0.35)" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{transform:showProfileMenu?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.18s",flexShrink:0}}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {/* Overlay fecha o menu */}
              {showProfileMenu && (
                <div onClick={()=>setShowProfileMenu(false)}
                  style={{position:"fixed",inset:0,zIndex:998}}/>
              )}

              {/* Dropdown */}
              {showProfileMenu && (
                <div className="topbar-popup" style={{
                  position:"absolute",top:"calc(100% + 8px)",right:0,
                  width:230,borderRadius:12,overflow:"hidden",
                  background:"rgba(10,16,28,0.99)",
                  border:"1px solid rgba(255,255,255,0.10)",
                  boxShadow:"0 20px 48px rgba(0,0,0,0.65),0 0 0 1px rgba(232,160,32,0.06)",
                  zIndex:999
                }}>
                  {/* Header do perfil */}
                  <div style={{
                    padding:"14px 14px 13px",
                    borderBottom:"1px solid rgba(255,255,255,0.07)",
                    display:"flex",alignItems:"center",gap:11
                  }}>
                    <div style={{
                      width:40,height:40,borderRadius:"50%",flexShrink:0,
                      background:"linear-gradient(135deg,rgba(232,160,32,0.40),rgba(232,160,32,0.16))",
                      border:"2px solid rgba(232,160,32,0.60)",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:17,fontWeight:800,color:"#E8A020",fontFamily:MONO
                    }}>
                      {(user?.username||"?")[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:"#F1F5F9",fontFamily:MONO}}>{user?.username}</div>
                      <div style={{fontSize:10,fontWeight:800,color:"#F59E0B",letterSpacing:"0.10em",
                        textTransform:"uppercase",fontFamily:MONO,marginTop:2}}>{user?.level}</div>
                      <div style={{display:"flex",alignItems:"center",gap:5,marginTop:3}}>
                        <span style={{width:6,height:6,borderRadius:"50%",background:"#22C55E",
                          boxShadow:"0 0 6px rgba(34,197,94,0.8)",display:"inline-block",flexShrink:0}}/>
                        <span style={{fontSize:10,color:"rgba(255,255,255,0.35)",fontFamily:MONO}}>Sessão ativa</span>
                      </div>
                    </div>
                  </div>

                  {/* Itens de menu */}
                  {[
                    {
                      label:"Configurações",
                      icon:(
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="3"/>
                          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                        </svg>
                      ),
                      action:()=>{openTab("Configurações");setShowProfileMenu(false)}
                    }
                  ].map(opt=>(
                    <button key={opt.label} onClick={opt.action}
                      style={{
                        width:"100%",display:"flex",alignItems:"center",gap:10,
                        padding:"10px 14px",background:"transparent",border:"none",
                        borderBottom:"1px solid rgba(255,255,255,0.04)",
                        cursor:"pointer",textAlign:"left",transition:"background 0.12s"
                      }}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(232,160,32,0.07)"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <div style={{
                        width:28,height:28,borderRadius:7,flexShrink:0,
                        background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.09)",
                        display:"flex",alignItems:"center",justifyContent:"center"
                      }}>
                        {opt.icon}
                      </div>
                      <span style={{fontSize:13,fontWeight:600,color:"#E2E8F0",fontFamily:SANS}}>{opt.label}</span>
                    </button>
                  ))}

                  {/* Encerrar Sessão */}
                  <div style={{padding:"8px 10px 10px"}}>
                    <button
                      onClick={()=>{setShowProfileMenu(false);handleLogout()}}
                      style={{
                        width:"100%",display:"flex",alignItems:"center",gap:10,
                        padding:"9px 10px",borderRadius:8,cursor:"pointer",
                        background:"rgba(239,68,68,0.07)",
                        border:"1px solid rgba(239,68,68,0.22)",
                        textAlign:"left",transition:"all 0.15s"
                      }}
                      onMouseEnter={e=>{e.currentTarget.style.background="rgba(239,68,68,0.16)";e.currentTarget.style.borderColor="rgba(239,68,68,0.50)"}}
                      onMouseLeave={e=>{e.currentTarget.style.background="rgba(239,68,68,0.07)";e.currentTarget.style.borderColor="rgba(239,68,68,0.22)"}}>
                      <div style={{
                        width:28,height:28,borderRadius:7,flexShrink:0,
                        background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.28)",
                        display:"flex",alignItems:"center",justifyContent:"center"
                      }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FCA5A5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                          <polyline points="16 17 21 12 16 7"/>
                          <line x1="21" y1="12" x2="9" y2="12"/>
                        </svg>
                      </div>
                      <span style={{fontSize:13,fontWeight:700,color:"#FCA5A5",fontFamily:SANS}}>Encerrar Sessão</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Botão Focus Mode ── */}
            <button onClick={()=>setFocusMode(s=>!s)} title="Modo Foco  (F)"
              style={{
                width:34,height:34,borderRadius:7,cursor:"pointer",
                background: focusMode ? "rgba(232,160,32,0.12)" : "rgba(255,255,255,0.04)",
                border:`1px solid ${focusMode ? "rgba(232,160,32,0.35)" : "rgba(255,255,255,0.08)"}`,
                display:"flex",alignItems:"center",justifyContent:"center",
                transition:"all 0.2s",flexShrink:0
              }}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(232,160,32,0.12)";e.currentTarget.style.borderColor="rgba(232,160,32,0.35)"}}
              onMouseLeave={e=>{if(!focusMode){e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.style.borderColor="rgba(255,255,255,0.08)"}}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke={focusMode?"#E8A020":"rgba(255,255,255,0.55)"} strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round">
                {focusMode
                  ? <><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></>
                  : <><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></>
                }
              </svg>
            </button>

            {/* ── Controles de janela — extremo direito ── */}
            <div style={{display:"flex",alignItems:"center",gap:1,marginLeft:8,flexShrink:0}}>
              {/* Minimizar */}
              <button onClick={()=>window.electronAPI?.minimize()}
                title="Minimizar"
                style={{
                  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                  gap:2,width:40,height:40,border:"none",cursor:"pointer",
                  background:"transparent",color:"rgba(255,255,255,0.45)",
                  borderRadius:0,transition:"all 0.15s",flexShrink:0,padding:0
                }}
                onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.08)";e.currentTarget.style.color="#F1F5F9"}}
                onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="rgba(255,255,255,0.45)"}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                <span style={{fontSize:8,fontFamily:MONO,letterSpacing:"0.04em",lineHeight:1}}>MIN</span>
              </button>
              {/* Maximizar */}
              <button onClick={()=>window.electronAPI?.maximize()}
                title="Maximizar / Restaurar"
                style={{
                  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                  gap:2,width:40,height:40,border:"none",cursor:"pointer",
                  background:"transparent",color:"rgba(255,255,255,0.45)",
                  borderRadius:0,transition:"all 0.15s",flexShrink:0,padding:0
                }}
                onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.08)";e.currentTarget.style.color="#F1F5F9"}}
                onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="rgba(255,255,255,0.45)"}}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                </svg>
                <span style={{fontSize:8,fontFamily:MONO,letterSpacing:"0.04em",lineHeight:1}}>MAX</span>
              </button>
            </div>
          </div>
        </div>

        {/* ══ TAB BAR ══════════════════════════════════════════════════════════ */}
        <div style={{
          display: focusMode ? "none" : "flex",alignItems:"center",gap:0,
          background:"rgba(7,12,22,0.98)",
          borderBottom:"1px solid rgba(255,255,255,0.06)",
          flexShrink:0,overflowX:"auto",height:34,
          scrollbarWidth:"none"
        }}>
          {tabs.map(tab=>{
            const isAct = tab.id === activeTabId
            return (
              <div key={tab.id}
                style={{
                  display:"flex",alignItems:"center",gap:6,
                  padding:"0 6px 0 10px",height:"100%",
                  flexShrink:0,maxWidth:180,minWidth:70,
                  borderRight:"1px solid rgba(255,255,255,0.05)",
                  borderBottom: isAct ? `2px solid ${tab.color}` : "2px solid transparent",
                  background: isAct ? "rgba(255,255,255,0.07)" : "transparent",
                  cursor:"pointer",transition:"background 0.12s,border-color 0.15s"
                }}
                onClick={()=>setActiveTabId(tab.id)}
                onMouseEnter={e=>{if(!isAct)e.currentTarget.style.background="rgba(255,255,255,0.04)"}}
                onMouseLeave={e=>{if(!isAct)e.currentTarget.style.background="transparent"}}>
                {/* dot */}
                <span style={{
                  width:5,height:5,borderRadius:"50%",flexShrink:0,
                  background: isAct ? tab.color : "rgba(255,255,255,0.20)",
                  boxShadow: isAct ? `0 0 6px ${tab.color}88` : "none",
                  transition:"all 0.15s"
                }}/>
                {/* label */}
                <span style={{
                  fontSize:11,fontWeight:isAct?700:500,
                  color: isAct ? "#F1F5F9" : "rgba(255,255,255,0.40)",
                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",
                  flex:1,minWidth:0,fontFamily:MONO,letterSpacing:"0.01em",
                  transition:"color 0.12s"
                }}>
                  {tab.label}
                </span>
                {/* close */}
                <button
                  onClick={e=>{e.stopPropagation();closeTab(tab.id)}}
                  style={{
                    width:16,height:16,borderRadius:4,border:"none",
                    background:"transparent",cursor:"pointer",flexShrink:0,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    color:"rgba(255,255,255,0.20)",padding:0,transition:"all 0.12s"
                  }}
                  onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.12)";e.currentTarget.style.color="#F1F5F9"}}
                  onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="rgba(255,255,255,0.20)"}}>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            )
          })}
          {/* + abrir novo módulo */}
          <button
            onClick={()=>{setShowSearch(true);setTimeout(()=>searchInputRef.current?.focus(),30)}}
            title="Abrir módulo (Ctrl+K)"
            style={{
              width:34,height:"100%",flexShrink:0,border:"none",
              background:"transparent",cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",
              color:"rgba(255,255,255,0.20)",transition:"all 0.12s"
            }}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.06)";e.currentTarget.style.color="rgba(255,255,255,0.65)"}}
            onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="rgba(255,255,255,0.20)"}}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>

        <div key={active} className="screen-enter" style={{display:"contents"}}>
        {active==="Chat RAG"               && <ErrorBoundary modulo="Chat RAG"><ChatRAG      onNavigate={openTab}/></ErrorBoundary>}
        {active==="Dashboard"              && <ErrorBoundary modulo="Dashboard"><Dashboard    onNavigate={openTab}/></ErrorBoundary>}
        {active==="Transcrição"            && <ErrorBoundary modulo="Transcrição"><Transcricao  onNavigate={openTab}/></ErrorBoundary>}
        {active==="Análise Grafoscópica"   && <ErrorBoundary modulo="Análise Grafoscópica"><Grafoscopia  onNavigate={openTab}/></ErrorBoundary>}
        {active==="Alertas"                && <ErrorBoundary modulo="Alertas"><Alertas      onNavigate={openTab}/></ErrorBoundary>}
        {active==="Notícias"               && <ErrorBoundary modulo="Notícias"><Noticias     onNavigate={openTab}/></ErrorBoundary>}
        {active==="Referências"            && <ErrorBoundary modulo="Referências"><Referencias  onNavigate={openTab}/></ErrorBoundary>}
        {active==="Configurações"          && <ErrorBoundary modulo="Configurações"><Configuracoes onNavigate={openTab} tema={tema} setTema={setTema}/></ErrorBoundary>}
        {active==="Controle de Grupos"     && <ErrorBoundary modulo="Controle de Grupos"><ControleGrupos onNavigate={openTab}/></ErrorBoundary>}
        {active==="Inteligência de Grupos" && <ErrorBoundary modulo="Inteligência de Grupos"><InteligenciaGrupos onNavigate={openTab}/></ErrorBoundary>}
        {active==="Lideranças por Unidade" && <ErrorBoundary modulo="Lideranças por Unidade"><LiderancasUnidade onNavigate={openTab}/></ErrorBoundary>}
        {active==="Líderes Gerais"         && <ErrorBoundary modulo="Líderes Gerais"><LideresGerais    onNavigate={openTab}/></ErrorBoundary>}
        {active==="Análise de Vínculo"     && <ErrorBoundary modulo="Análise de Vínculo"><GrafoVinculos onNavigate={openTab}/></ErrorBoundary>}
        {active==="Extrato"                && <ErrorBoundary modulo="Extrato"><Extrato      onNavigate={openTab}/></ErrorBoundary>}
        {active==="Sinais Fracos"          && <ErrorBoundary modulo="Sinais Fracos"><SinaisFracos onNavigate={openTab}/></ErrorBoundary>}
        {active==="Matriz NUCADIs"         && <ErrorBoundary modulo="Matriz NUCADIs"><MatrizNucadis onNavigate={openTab}/></ErrorBoundary>}
        {active==="Agenda de Missão"       && <ErrorBoundary modulo="Agenda de Missão"><Agenda       onNavigate={openTab}/></ErrorBoundary>}
        {active === "Lista Negra"          && <ErrorBoundary modulo="Lista Negra"><ListaNegra     onNavigate={openTab} /></ErrorBoundary>}
        {active === "OSINT Pessoas"        && <ErrorBoundary modulo="OSINT Pessoas"><OsintPesquisa  onNavigate={openTab} /></ErrorBoundary>}
        {active === "ORÁCULO"              && <ErrorBoundary modulo="ORÁCULO"><HitlDashboard         onNavigate={openTab} /></ErrorBoundary>}
        {active === "Gerenciar Usuários"   && <ErrorBoundary modulo="Gerenciar Usuários"><GerenciarUsuarios onNavigate={openTab} /></ErrorBoundary>}
        {active === "Auditoria"            && <ErrorBoundary modulo="Auditoria"><AuditoriaLog onNavigate={openTab} /></ErrorBoundary>}

        {active==="Painel" && (
          <>
            <header style={S.topbar}>
              <div style={{display:"flex",alignItems:"center"}}>
                <div style={S.wc}>
                  <button style={{...S.wb,background:"#FF5F57"}} onClick={()=>window.electronAPI?.close()}/>
                  <button style={{...S.wb,background:"#FEBC2E"}} onClick={()=>window.electronAPI?.minimize()}/>
                  <button style={{...S.wb,background:"#28C840"}} onClick={()=>window.electronAPI?.maximize()}/>
                </div>
                <div>
                  <div style={S.ttitle}>Painel Principal</div>
                  <div style={S.tsub}>
                    <span style={{color:C.gold,fontWeight:700}}>◈</span> {new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"})} · Manaus, AM
                  </div>
                </div>
              </div>
              <div style={S.chip}>
                <div className="chip-dot-pulse" style={S.chipDot}/>
                <span style={S.chipText}>Sistema Operacional</span>
              </div>
            </header>

            <div style={S.body}>
              <div style={S.alert}>
                <div style={{display:"flex",alignItems:"center",gap:12,flex:1,minWidth:0}}>
                  <span style={S.alertBadge}>⚠ ALERTA</span>
                  <p style={S.alertText}>Movimentação detectada na região de fronteira norte — verificar imediatamente</p>
                </div>
                <span style={S.alertTime}>há 12 min</span>
              </div>

              {/* ── KPI Cards ─────────────────────────────────────────── */}
              {(()=>{
                const kpiDefs = homeKpis ? [
                  {
                    id:"alertas", label:"Alertas Ativos", icon:"🔔",
                    value: homeKpis.alertas, color:"#F87171",
                    sub: `${homeKpis.alertasCriticos} críticos`,
                    subColor:"#FCA5A5",
                    detail: homeKpis.hist6,
                    detailLabel:"Histórico 6 meses",
                  },
                  {
                    id:"grupos", label:"Grupos Monitorados", icon:"◎",
                    value: homeKpis.gruposAtivos, color:"#A78BFA",
                    sub: `${homeKpis.variacoes} variação ≥20%`,
                    subColor: homeKpis.variacoes > 0 ? "#F87171" : "#34D399",
                    detail: homeKpis.hist6,
                    detailLabel:"Movimentação histórica",
                  },
                  {
                    id:"docsMes", label:"Docs do Mês", icon:"📄",
                    value: homeKpis.docsMes, color:"#38BDF8",
                    sub: homeKpis.variacaoPct >= 0
                      ? `+${homeKpis.variacaoPct}% vs mês ant.`
                      : `${homeKpis.variacaoPct}% vs mês ant.`,
                    subColor: homeKpis.variacaoPct >= 0 ? "#34D399" : "#F87171",
                    detail: homeKpis.porTipo?.map(t=>t.total) || [],
                    detailLabel: "Por tipo de documento",
                  },
                  {
                    id:"docsAno", label:"Acumulado Ano", icon:"📊",
                    value: homeKpis.docsAno, color:"#34D399",
                    sub: `Média ${homeKpis.docsAno > 0 && homeKpis.meses?.length > 0 ? Math.round(homeKpis.docsAno / homeKpis.meses.length) : 0}/mês`,
                    subColor:"#6EE7B7",
                    detail: homeKpis.hist6,
                    detailLabel:"Produção acumulada",
                  },
                ] : [{},{},{},{}]

                return (
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
                    {kpiDefs.map((kpi,i)=>{
                      const isExp = expandedKpi === kpi.id
                      const isLoading = homeKpisLoading || !homeKpis
                      return (
                        <div key={kpi.id||i}
                          onClick={()=>kpi.id && setExpandedKpi(isExp ? null : kpi.id)}
                          style={{
                            background: isExp
                              ? `linear-gradient(135deg,rgba(${kpi.color?parseInt(kpi.color.slice(1,3),16):100},${kpi.color?parseInt(kpi.color.slice(3,5),16):100},${kpi.color?parseInt(kpi.color.slice(5,7),16):100},0.12) 0%,rgba(255,255,255,0.04) 100%)`
                              : "rgba(255,255,255,0.04)",
                            border: isExp
                              ? `1px solid ${kpi.color||"rgba(255,255,255,0.10)"}55`
                              : "1px solid rgba(255,255,255,0.07)",
                            borderRadius:10,padding:"14px 16px",
                            cursor: kpi.id ? "pointer" : "default",
                            transition:"all 0.22s",
                            transform: isExp ? "translateY(-1px)" : "none",
                            boxShadow: isExp ? `0 8px 24px rgba(0,0,0,0.3)` : "none",
                          }}>
                          {isLoading ? (
                            /* Skeleton */
                            <div>
                              <div style={{height:10,borderRadius:4,background:"rgba(255,255,255,0.08)",marginBottom:8,width:"60%"}}/>
                              <div style={{height:28,borderRadius:4,background:"rgba(255,255,255,0.05)",marginBottom:6,width:"40%"}}/>
                              <div style={{height:8,borderRadius:4,background:"rgba(255,255,255,0.05)",width:"70%"}}/>
                            </div>
                          ) : (
                            <>
                              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                                <span style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.45)",
                                  letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:MONO}}>
                                  {kpi.label}
                                </span>
                                <span style={{fontSize:14}}>{kpi.icon}</span>
                              </div>
                              <div style={{fontSize:28,fontWeight:800,color:kpi.color,
                                fontFamily:MONO,letterSpacing:"-0.02em",lineHeight:1,marginBottom:5}}>
                                <AnimatedNumber value={kpi.value||0} duration={900}/>
                              </div>
                              <div style={{fontSize:11,color:kpi.subColor||"rgba(255,255,255,0.40)",
                                fontFamily:MONO,fontWeight:600}}>
                                {kpi.sub}
                              </div>
                              {/* Sparkline inline SVG */}
                              {kpi.detail?.length > 1 && (
                                <div style={{marginTop:10}}>
                                  {(()=>{
                                    const d = kpi.detail
                                    const mx = Math.max(...d,1)
                                    const W = 120, H = 24, n = d.length
                                    const pts = d.map((v,i)=>`${(i/(n-1))*W},${H-(v/mx)*H}`)
                                    return (
                                      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{display:"block"}}>
                                        <polyline
                                          points={pts.join(" ")}
                                          fill="none"
                                          stroke={kpi.color}
                                          strokeWidth="1.5"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          opacity="0.7"
                                        />
                                        {/* dot no último ponto */}
                                        <circle
                                          cx={(n-1)/(n-1)*W}
                                          cy={H-(d[n-1]/mx)*H}
                                          r="2.5"
                                          fill={kpi.color}
                                        />
                                      </svg>
                                    )
                                  })()}
                                </div>
                              )}
                              {/* Expand indicator */}
                              {kpi.id && (
                                <div style={{marginTop:6,display:"flex",alignItems:"center",gap:4}}>
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
                                    stroke={isExp?kpi.color:"rgba(255,255,255,0.20)"}
                                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                    style={{transform:isExp?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}>
                                    <polyline points="6 9 12 15 18 9"/>
                                  </svg>
                                  <span style={{fontSize:9,color:isExp?kpi.color:"rgba(255,255,255,0.18)",
                                    fontFamily:MONO,fontWeight:700,letterSpacing:"0.06em"}}>
                                    {isExp?"RECOLHER":"DETALHAR"}
                                  </span>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* ── Drill-down panel ───────────────────────────────────── */}
              {expandedKpi && homeKpis && (()=>{
                const defs = {
                  alertas: {
                    title:"Distribuição de Alertas",
                    rows: [
                      {label:"Total de alertas", value:homeKpis.alertas, color:"#F87171"},
                      {label:"Nível crítico/alto", value:homeKpis.alertasCriticos, color:"#EF4444"},
                      {label:"Outros", value:homeKpis.alertas-homeKpis.alertasCriticos, color:"#94A3B8"},
                    ]
                  },
                  grupos: {
                    title:"Monitoramento de Grupos",
                    rows: [
                      {label:"Grupos ativos", value:homeKpis.gruposAtivos, color:"#A78BFA"},
                      {label:"Variações ≥20%", value:homeKpis.variacoes, color:"#F87171"},
                    ]
                  },
                  docsMes: {
                    title:"Produção por Tipo",
                    rows: (homeKpis.porTipo||[]).map(t=>({label:t.codigo||t.nome, value:t.total, color:"#38BDF8"}))
                  },
                  docsAno: {
                    title:"Resumo Anual",
                    rows: [
                      {label:"Total acumulado", value:homeKpis.docsAno, color:"#34D399"},
                      {label:"Média mensal", value: homeKpis.meses?.length > 0 ? Math.round(homeKpis.docsAno/homeKpis.meses.length) : 0, color:"#6EE7B7"},
                    ]
                  },
                }
                const d = defs[expandedKpi]
                if (!d) return null
                const maxVal = Math.max(...d.rows.map(r=>r.value),1)
                return (
                  <div style={{
                    borderRadius:10,padding:"14px 16px",marginBottom:12,
                    background:"rgba(255,255,255,0.04)",
                    border:"1px solid rgba(255,255,255,0.09)",
                    animation:"screenIn 0.2s cubic-bezier(0.16,1,0.3,1) both"
                  }}>
                    <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,0.45)",
                      letterSpacing:"0.10em",textTransform:"uppercase",fontFamily:MONO,marginBottom:12}}>
                      {d.title}
                    </div>
                    {d.rows.map((row,i)=>(
                      <div key={i} style={{marginBottom:8}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                          <span style={{fontSize:11,color:"rgba(255,255,255,0.55)",fontFamily:MONO}}>{row.label}</span>
                          <span style={{fontSize:11,fontWeight:700,color:row.color,fontFamily:MONO}}>
                            <AnimatedNumber value={row.value}/>
                          </span>
                        </div>
                        <div style={{height:4,borderRadius:2,background:"rgba(255,255,255,0.06)"}}>
                          <div style={{
                            height:"100%",borderRadius:2,
                            width: `${(row.value/maxVal)*100}%`,
                            background:row.color,
                            transition:"width 0.8s cubic-bezier(0.16,1,0.3,1)"
                          }}/>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}

              <section>
                <div style={S.secHeader}>
                  <span style={S.secBar}/>
                  <h2 style={S.secLabel}>Notícias em Destaque</h2>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                  {newsToShow.map((n,i)=>(
                    <div key={i} className="news-card">
                      <div style={{position:"relative",height:68,overflow:"hidden",background:"rgba(255,255,255,0.03)"}}>
                        <img src={n.img} alt="" style={{width:"100%",height:"100%",objectFit:"cover",opacity:0.85}}
                          onError={e=>{e.target.style.display="none"}}/>
                        <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,transparent 40%,rgba(0,0,0,0.7))"}}/>
                        <span style={{position:"absolute",top:7,right:7,fontSize:11,fontWeight:700,
                          padding:"2px 8px",borderRadius:4,fontFamily:MONO,
                          background:`${n.accent}22`,color:n.accent,
                          border:`1px solid ${n.accent}44`,backdropFilter:"blur(4px)"}}>
                          {n.category}
                        </span>
                      </div>
                      <div style={{padding:"10px 12px 12px"}}>
                        <p style={{fontSize:13.7,color:C.text,lineHeight:1.5,fontWeight:500,marginBottom:6}}>
                          {n.title}
                        </p>
                        <div style={{display:"flex",gap:6,alignItems:"center"}}>
                          <span style={{fontSize:11,color:n.accent,fontWeight:700,fontFamily:MONO}}>{n.source}</span>
                          <span style={{fontSize:11,color:C.textDim}}>·</span>
                          <span style={{fontSize:11,color:C.textMid,fontFamily:MONO}}>{n.time}</span>
                        </div>
                      </div>
                      <div style={{height:2,background:`linear-gradient(90deg,${n.accent},transparent)`}}/>
                    </div>
                  ))}
                </div>
              </section>

              <div style={S.refsBar}>
                <div style={S.refsBarLeft}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  </svg>
                  <span style={{fontSize:11.7,fontWeight:800,color:C.gold,letterSpacing:"0.1em",textTransform:"uppercase",whiteSpace:"nowrap"}}>
                    Consulta de Referências
                  </span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,flex:1,overflow:"hidden"}}>
                  {REFS.map((r,i)=>(
                    <button key={i} className="ref-btn" style={{
                      display:"flex",alignItems:"center",gap:6,
                      padding:"6px 12px",borderRadius:7,
                      cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,
                    }}>
                      <span style={{width:6,height:6,borderRadius:"50%",background:r.color,flexShrink:0}}/>
                      <span style={{fontSize:13,color:r.color,fontWeight:600}}>{r.label}</span>
                    </button>
                  ))}
                </div>
                <span style={{fontSize:14,color:C.textMid,flexShrink:0}}>›</span>
              </div>

              <div style={S.chatArea}>
                {chatHistory.length===0 && (
                  <div style={S.emptyState}>
                    <OwlBlueprint/>
                    <p style={S.emptyText}>Aguardando diretrizes...</p>
                    <p style={S.emptySubtext}>Inicie uma análise de inteligência</p>
                  </div>
                )}
                {chatHistory.length>0 && (
                  <>
                    <div style={S.chatFadeMask}/>
                    <div style={S.chatMessages}>
                      {chatHistory.map((m,i)=>(
                        <div key={i} style={{alignSelf:m.role==="user"?"flex-end":"flex-start",maxWidth:"72%",position:"relative",zIndex:3}}>
                          <div style={{
                            background: m.role==="user"
                              ? "linear-gradient(135deg,#1E3A5F,#0F2840)"
                              : "rgba(255,255,255,0.05)",
                            borderRadius:8,
                            padding:"12px 16px",
                            fontSize:16.9,
                            color: m.role==="user"?"#FFFFFF":C.text,
                            lineHeight:1.65,
                            boxShadow: m.role==="user"
                              ?"0 4px 20px rgba(0,0,0,0.4)"
                              :"0 2px 12px rgba(0,0,0,0.2)",
                            backdropFilter:"blur(8px)",
                            border: m.role==="bastos"
                              ?"1px solid rgba(232,160,32,0.2)"
                              :"none",
                            borderLeft: m.role==="bastos"?"3px solid #E8A020":"none",
                          }}>
                            {m.role==="bastos"&&(
                              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                                <span style={{fontSize:11.7,color:C.gold,fontWeight:700,letterSpacing:"0.12em",fontFamily:MONO}}>◈ BASTOS-UNIT</span>
                                <span style={{fontSize:11,color:C.textMid,fontFamily:MONO}}>· {now}</span>
                              </div>
                            )}
                            {m.text}
                          </div>
                        </div>
                      ))}
                      {loading&&(
                        <div style={{alignSelf:"flex-start",fontSize:13,color:C.textMid,fontFamily:MONO,
                          display:"flex",alignItems:"center",gap:8,zIndex:3,position:"relative"}}>
                          <span style={{width:5,height:5,borderRadius:"50%",background:C.gold,display:"inline-block",
                            animation:"amber-pulse 1.5s ease-in-out infinite"}}/>
                          processando consulta doutrinária...
                        </div>
                      )}
                      <div ref={chatEndRef}/>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div style={{...S.chatBar,...(focused?S.chatBarFocused:{})}}>
              <div style={S.chatRow}>
                <div style={S.chatIconWrap}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <input
                  style={{...S.chatIn,...(focused?{borderColor:C.gold,boxShadow:`0 0 0 3px ${C.goldSoft}`}:{})}}
                  value={message}
                  onChange={e=>setMessage(e.target.value)}
                  onKeyDown={handleKey}
                  onFocus={()=>setFocused(true)}
                  onBlur={()=>setFocused(false)}
                  placeholder="Pergunte ao Agent Bastos — doutrina, análise, referências…"
                />
                <button style={{...S.sendBtn,...(loading?{opacity:0.4,cursor:"not-allowed"}:{})}}
                  onClick={enviarPergunta} disabled={loading}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
              <p style={S.chatHint}>
                <span style={{color:C.gold,fontWeight:700,letterSpacing:"0.04em"}}>↵ Pressione Enter</span>
                <span style={{color:"rgba(255,255,255,0.45)"}}> para enviar</span>
              </p>
            </div>
          </>
        )}

       {!["Painel","Chat RAG","Dashboard","Transcrição","Alertas","Notícias","Referências",
           "Configurações","Agenda de Missão","Lista Negra","Controle de Grupos",
           "Inteligência de Grupos","Lideranças por Unidade","Líderes Gerais","Análise de Vínculo","Análise Grafoscópica",
           "Extrato","Sinais Fracos","Matriz NUCADIs","OSINT Pessoas","ORÁCULO","Gerenciar Usuários","Auditoria"].includes(active) && (
          <div style={{display:"flex",flex:1,alignItems:"center",justifyContent:"center",flexDirection:"column",gap:10}}>
            <div style={{fontSize:17,fontWeight:700,color:C.text}}>{active}</div>
            <div style={{fontSize:13,color:C.textMid,fontFamily:MONO}}>Em desenvolvimento</div>
          </div>
        )}
        </div>{/* /screen-enter */}
      </main>

      {showPolicies && <PoliciesModal onClose={()=>setShowPolicies(false)}/>}
    </div>
  )
}
const S = {
  app:{display:"flex",height:"100vh",background:C.bg,overflow:"hidden",fontFamily:SANS,position:"relative",color:C.text},
  dotGrid:{position:"fixed",inset:0,backgroundImage:DOT_GRID,backgroundSize:"28px 28px",pointerEvents:"none",zIndex:0},
  sidebar:{
    background:"linear-gradient(180deg,#0D3F74 0%,#0A3362 35%,#071F42 75%,#050E20 100%)",
    borderRight:"1px solid rgba(255,255,255,0.07)",display:"flex",flexDirection:"column",
    flexShrink:0,height:"100vh",position:"relative",zIndex:10,overflow:"hidden",
    boxShadow:"4px 0 32px rgba(0,0,0,0.45), inset -1px 0 0 rgba(255,255,255,0.04)",
    backdropFilter:"blur(18px)",WebkitBackdropFilter:"blur(18px)",
    transition:"width 0.22s cubic-bezier(0.16,1,0.3,1)"},
  logoArea:{padding:"14px 16px 12px",borderBottom:"1px solid rgba(255,255,255,0.08)",
    display:"flex",flexDirection:"column",alignItems:"center",gap:10,flexShrink:0,
    background:"rgba(0,0,0,0.12)"},
  logoRing:{width:50,height:50,borderRadius:"50%",border:"2px solid rgba(245,158,11,0.9)",
    overflow:"hidden",flexShrink:0,background:"rgba(245,158,11,0.12)",position:"relative",
    boxShadow:"0 0 20px rgba(245,158,11,0.4), 0 0 40px rgba(245,158,11,0.12), 0 3px 10px rgba(0,0,0,0.4)"},
  logoText:{display:"flex",flexDirection:"column",alignItems:"center",gap:2},
  logoName:{fontSize:14,fontWeight:800,color:"#FFFFFF",letterSpacing:"0.01em",textAlign:"center"},
  logoTagline:{fontSize:11,color:"#F59E0B",letterSpacing:"0.18em",textTransform:"uppercase",fontWeight:700,textAlign:"center"},
  nav:{padding:"3px 8px 0",flexShrink:0},
  groupLabel:{display:"flex",alignItems:"center",gap:7,fontSize:14.3,fontWeight:900,color:"#E8A020",
    letterSpacing:"0.03em",padding:"0 10px 2px",marginBottom:2,textTransform:"uppercase",
    textShadow:"0 1px 4px rgba(0,0,0,0.7),0 -1px 0 rgba(255,200,50,0.2)"},
  groupLabelBar:{display:"inline-block",width:3,height:13,background:"#E8A020",borderRadius:2,
    flexShrink:0,boxShadow:"0 0 6px rgba(232,160,32,0.5)"},
  ni:{display:"flex",alignItems:"center",gap:10,padding:"6px 10px",paddingRight:28,
    borderRadius:7,cursor:"pointer",marginBottom:3,border:"none",background:"transparent",
    width:"100%",textAlign:"left",transition:"all 0.12s ease"},
  sidebarFooter:{padding:"0 12px 12px",flexShrink:0},
  footerDivider:{height:1,background:"linear-gradient(90deg,transparent,rgba(245,158,11,0.4),transparent)",marginBottom:10},
  configBtn:{display:"flex",alignItems:"center",gap:10,padding:"9px 10px",cursor:"pointer",
    border:"none",background:"transparent",width:"100%",textAlign:"left",borderRadius:7,
    transition:"background 0.12s",marginBottom:4},
  policyBtn:{display:"block",width:"100%",textAlign:"center",fontSize:11,color:"#F59E0B",
    background:"transparent",border:"none",cursor:"pointer",padding:"4px 0",fontWeight:600,
    letterSpacing:"0.04em",opacity:0.85},
  copyright:{fontSize:11,color:"#FFFFFF",textAlign:"center",padding:"5px 0 0",lineHeight:1.5,fontWeight:500,opacity:0.75},
  main:{flex:1,display:"flex",flexDirection:"column",minWidth:0,height:"100vh",position:"relative",zIndex:10,background:C.bg},
  topbar:{height:52,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",
    justifyContent:"space-between",padding:"0 22px",background:C.surface,flexShrink:0,
    boxShadow:"0 1px 0 rgba(232,160,32,0.08)"},
  wc:{display:"flex",gap:6,alignItems:"center",marginRight:14},
  wb:{width:12,height:12,borderRadius:"50%",border:"none",cursor:"pointer",flexShrink:0},
  ttitle:{fontSize:17,fontWeight:700,color:C.text,letterSpacing:"-0.01em"},
  tsub:{fontSize:13,color:C.textMid,marginTop:2,fontFamily:MONO},
  chip:{display:"flex",alignItems:"center",gap:6,padding:"5px 14px",
    background:"rgba(22,163,74,0.1)",borderRadius:20,border:"1px solid rgba(22,163,74,0.3)"},
  chipDot:{width:7,height:7,borderRadius:"50%",background:"#16A34A",flexShrink:0},
  chipText:{fontSize:13,color:"#4ADE80",fontWeight:600},
  body:{flex:1,overflow:"hidden",padding:"14px 22px",display:"flex",flexDirection:"column",gap:10},
  alert:{background:"rgba(220,38,38,0.08)",borderRadius:10,padding:"10px 16px",
    display:"flex",alignItems:"center",justifyContent:"space-between",
    border:"1px solid rgba(220,38,38,0.25)",boxShadow:"0 2px 12px rgba(220,38,38,0.1)",
    flexShrink:0,backdropFilter:"blur(8px)"},
  alertBadge:{fontSize:11,fontWeight:700,padding:"3px 10px",background:"#DC2626",color:"#FFFFFF",
    borderRadius:5,letterSpacing:"0.06em",whiteSpace:"nowrap",flexShrink:0,fontFamily:MONO},
  alertText:{fontSize:15.6,color:"#FCA5A5",lineHeight:1.4,marginLeft:12,fontWeight:600},
  alertTime:{fontSize:13,color:"rgba(252,165,165,0.6)",whiteSpace:"nowrap",marginLeft:12,flexShrink:0,fontFamily:MONO},
  secHeader:{display:"flex",alignItems:"center",gap:8,marginBottom:8},
  secBar:{display:"inline-block",width:3,height:16,background:C.gold,borderRadius:2,flexShrink:0,boxShadow:`0 0 8px ${C.gold}88`},
  secLabel:{fontSize:11.7,fontWeight:800,color:C.gold,letterSpacing:"0.12em",textTransform:"uppercase",margin:0},
  refsBar:{display:"flex",alignItems:"center",gap:12,background:"rgba(255,255,255,0.03)",
    border:`1px solid ${C.border}`,borderRadius:10,padding:"9px 14px",flexShrink:0,overflow:"hidden",backdropFilter:"blur(8px)"},
  refsBarLeft:{display:"flex",alignItems:"center",gap:8,paddingRight:12,borderRight:`1px solid ${C.border}`,flexShrink:0},
  chatArea:{flex:1,background:"rgba(255,255,255,0.02)",border:`1px solid ${C.border}`,
    borderRadius:10,position:"relative",overflow:"hidden",minHeight:60,backdropFilter:"blur(8px)"},
  emptyState:{position:"absolute",inset:0,display:"flex",flexDirection:"column",
    alignItems:"center",justifyContent:"center",pointerEvents:"none",userSelect:"none"},
  emptyText:{fontSize:15.6,color:"rgba(255,255,255,0.35)",fontWeight:600,marginTop:10,letterSpacing:"0.04em"},
  emptySubtext:{fontSize:13,color:"rgba(255,255,255,0.18)",fontFamily:MONO,marginTop:4},
  chatFadeMask:{position:"absolute",top:0,left:0,right:0,height:28,
    background:`linear-gradient(to bottom,${C.bg},transparent)`,zIndex:2,pointerEvents:"none"},
  chatMessages:{padding:"14px 16px 10px",display:"flex",flexDirection:"column",gap:10,height:"100%",overflowY:"auto"},
  chatBar:{borderTop:`1px solid ${C.border}`,background:C.surface,padding:"10px 22px 12px",flexShrink:0},
  chatBarFocused:{background:C.surfaceUp},
  chatRow:{display:"flex",gap:10,alignItems:"center"},
  chatIconWrap:{width:38,height:38,borderRadius:8,background:`${C.goldSoft}`,
    border:`1px solid rgba(232,160,32,0.25)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},
  chatIn:{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,
    borderRadius:8,padding:"11px 16px",fontSize:16.9,color:C.text,outline:"none",fontFamily:SANS,
    transition:"border-color 0.2s,box-shadow 0.2s"},
  sendBtn:{width:40,height:40,background:`linear-gradient(135deg,#F59E0B,#B45309)`,
    border:"none",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",
    cursor:"pointer",flexShrink:0,boxShadow:"0 4px 14px rgba(180,83,9,0.4)",transition:"opacity 0.2s"},
  chatHint:{fontSize:13,color:C.textDim,textAlign:"center",marginTop:7,letterSpacing:"0.03em",fontWeight:500,fontFamily:MONO},
}

const POLICY_DEFAULT = {
  empresa:"Viga — Soluções em Tecnologia e Segurança",
  versao:"1.0.0",data:"Abril de 2026",
  clausulas:[
    {titulo:"1. Finalidade do Sistema",texto:"O Agent Bastos é um sistema de inteligência corporativa desenvolvido para apoiar atividades de análise, monitoramento e produção de conhecimento em segurança pública e corporativa. Seu uso é restrito a agentes devidamente autorizados pela instituição responsável pelo licenciamento."},
    {titulo:"2. Responsabilidade pelo Uso",texto:"O usuário é integralmente responsável pela utilização dos dados, relatórios e análises gerados pelo sistema. Todo acesso é registrado e auditável. O uso indevido das informações, incluindo compartilhamento não autorizado ou utilização para fins pessoais, constitui violação das normas institucionais e pode acarretar sanções administrativas, civis e penais."},
    {titulo:"3. Proteção de Dados — LGPD",texto:"Este sistema processa dados pessoais de terceiros no estrito cumprimento da Lei Geral de Proteção de Dados (Lei nº 13.709/2018). Os dados são tratados exclusivamente para finalidades legítimas de segurança pública e investigação. O armazenamento, compartilhamento e descarte seguem as diretrizes da LGPD e das normas internas da instituição."},
    {titulo:"4. Inteligência Artificial e Limitações",texto:"As análises geradas por inteligência artificial têm caráter auxiliar e não substituem o julgamento do agente responsável. Toda informação produzida pelo sistema deve ser validada por supervisor humano antes de embasar decisões operacionais. O sistema não possui valor probatório direto para fins judiciais sem perícia técnica complementar."},
    {titulo:"5. Confidencialidade",texto:"Todas as informações processadas, relatórios gerados e análises produzidas são classificadas como RESERVADAS e de USO INTERNO. É vedada a reprodução, cópia ou divulgação do conteúdo do sistema sem autorização expressa da autoridade competente."},
    {titulo:"6. Titularidade e Propriedade Intelectual",texto:"O Agent Bastos é produto desenvolvido e licenciado por {empresa}. Todos os direitos de propriedade intelectual, incluindo código-fonte, design, arquitetura e metodologias, são de titularidade exclusiva desta empresa. É vedada a engenharia reversa, reprodução ou distribuição sem autorização."},
    {titulo:"7. Vigência e Atualizações",texto:"Estas políticas entram em vigor na data de implantação do sistema e podem ser atualizadas a qualquer momento pela administradora do sistema. Alterações serão comunicadas aos usuários no primeiro acesso após a atualização."},
  ],
}
const MONO_P = "'JetBrains Mono','Roboto Mono','Courier New',monospace"

function PoliciesModal({onClose}) {
  const stored = localStorage.getItem("ab_policies")
  const [data,setData]           = useState(stored?JSON.parse(stored):POLICY_DEFAULT)
  const [editing,setEditing]     = useState(false)
  const [editEmpresa,setEditEmpresa] = useState(data.empresa)

  function renderTexto(txt) { return txt.replace("{empresa}",data.empresa) }

  function saveEmpresa() {
    const novo = { ...data, empresa: editEmpresa }
    setData(novo)
    localStorage.setItem("ab_policies", JSON.stringify(novo))
    setEditing(false)
  }

  return (
    <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(7,10,20,0.82)",
      display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:"#111827",borderRadius:14,width:"min(780px,92vw)",maxHeight:"88vh",
        display:"flex",flexDirection:"column",boxShadow:"0 32px 80px rgba(0,0,0,0.6)",
        overflow:"hidden",border:"1px solid rgba(255,255,255,0.08)"}}>
        <div style={{padding:"22px 30px 18px",borderBottom:"1px solid rgba(255,255,255,0.08)",
          background:"#0F172A",display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexShrink:0}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
              <div style={{width:3,height:20,background:"#E8A020",borderRadius:2}}/>
              <span style={{fontSize:11,fontWeight:700,color:C.textMid,letterSpacing:"0.15em",textTransform:"uppercase"}}>
                Agent Bastos · Documento Institucional
              </span>
            </div>
            <div style={{fontSize:20,fontWeight:800,color:C.text,letterSpacing:"-0.01em"}}>Políticas de Uso</div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8}}>
              {editing?(
                <>
                  <input value={editEmpresa} onChange={e=>setEditEmpresa(e.target.value)} autoFocus
                    style={{fontSize:13,fontWeight:600,color:C.text,border:`1px solid ${C.gold}`,borderRadius:6,
                      padding:"4px 10px",outline:"none",fontFamily:"inherit",background:"rgba(232,160,32,0.1)",width:320}}
                    onKeyDown={e=>{if(e.key==="Enter")saveEmpresa();if(e.key==="Escape")setEditing(false)}}/>
                  <button onClick={saveEmpresa} style={{fontSize:12,fontWeight:700,color:"#4ADE80",
                    background:"rgba(22,163,74,0.1)",border:"1px solid rgba(22,163,74,0.3)",borderRadius:6,padding:"4px 12px",cursor:"pointer"}}>Salvar</button>
                  <button onClick={()=>setEditing(false)} style={{fontSize:12,color:C.textMid,background:"transparent",border:"none",cursor:"pointer"}}>Cancelar</button>
                </>
              ):(
                <>
                  <span style={{fontSize:13,fontWeight:600,color:C.textMid,fontFamily:MONO_P}}>{data.empresa}</span>
                  <button onClick={()=>{setEditEmpresa(data.empresa);setEditing(true)}}
                    style={{fontSize:11,color:C.gold,background:C.goldSoft,border:`1px solid rgba(232,160,32,0.3)`,
                      borderRadius:5,padding:"2px 8px",cursor:"pointer",fontWeight:600}}>✏ Editar</button>
                </>
              )}
            </div>
            <div style={{display:"flex",gap:18,marginTop:10}}>
              {[["Versão",data.versao],["Vigência",data.data],["Status","ATIVO"]].map(([k,v])=>(
                <div key={k}>
                  <div style={{fontSize:11,fontWeight:700,color:C.textDim,letterSpacing:"0.1em",textTransform:"uppercase"}}>{k}</div>
                  <div style={{fontSize:12,fontWeight:700,color:C.text,fontFamily:MONO_P}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={onClose} style={{width:34,height:34,borderRadius:"50%",
            border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.05)",cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:C.textMid,flexShrink:0}}>×</button>
        </div>
        <div style={{overflowY:"auto",padding:"22px 30px",display:"flex",flexDirection:"column",gap:14}}>
          {data.clausulas.map((c,i)=>(
            <div key={i} style={{padding:"16px 18px",borderRadius:10,
              background:i%2===0?"rgba(255,255,255,0.03)":"rgba(255,255,255,0.01)",
              border:`1px solid ${C.border}`}}>
              <div style={{fontSize:13,fontWeight:800,color:C.text,marginBottom:7,letterSpacing:"0.01em"}}>{c.titulo}</div>
              <div style={{fontSize:14,color:C.textMid,lineHeight:1.75}}>{renderTexto(c.texto)}</div>
            </div>
          ))}
          <div style={{marginTop:8,padding:"16px 18px",background:"rgba(232,160,32,0.06)",borderRadius:10,
            display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,
            border:`1px solid rgba(232,160,32,0.2)`}}>
            <span style={{fontSize:12,color:C.textMid,fontFamily:MONO_P}}>Agent Bastos · Intelligence System</span>
            <div style={{display:"flex",gap:6}}>
              {["PROTEGIDO","RESERVADO","USO INTERNO"].map(t=>(
                <span key={t} style={{fontSize:11,fontWeight:800,color:"#F1F5F9",background:"#F59E0B",
                  borderRadius:4,padding:"3px 8px",letterSpacing:"0.05em",fontFamily:MONO_P}}>{t}</span>
              ))}
            </div>
            <span style={{fontSize:11,color:C.textDim,fontFamily:MONO_P}}>© 2026 {data.empresa}</span>
          </div>
        </div>
        <div style={{padding:"14px 30px",borderTop:`1px solid ${C.border}`,background:"#0F172A",
          display:"flex",justifyContent:"flex-end",flexShrink:0}}>
          <button onClick={onClose} style={{padding:"10px 28px",background:C.gold,color:"#F1F5F9",
            border:"none",borderRadius:8,fontSize:13,fontWeight:800,cursor:"pointer",letterSpacing:"0.02em"}}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
