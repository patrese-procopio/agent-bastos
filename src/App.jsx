import { useState, useEffect, useRef } from "react"
import ChatRAG    from "./ChatRAG"
import Dashboard  from "./Dashboard"
import Transcricao from "./Transcricao"
import Alertas    from "./Alertas"
import Noticias   from "./Noticias"
import Referencias from "./Referencias"
import Configuracoes from "./Configuracoes"
import Agenda        from "./Agenda"
import ListaNegra    from "./ListaNegra"
import Grafoscopia from "./Grafoscopia"

const NAV_GROUPS = [
  { title: "PRINCIPAL", items: [
    { label: "Painel", color: "#B45309", active: true },
    { label: "Alertas", color: "#DC2626", pulse: true },
    { label: "Lista Negra", color: "#1E293B" },
  ]},
  { title: "INTELIGÊNCIA", items: [
    { label: "Chat RAG", color: "#1D4ED8" },
    { label: "Referências", color: "#6D28D9" },
    { label: "Agenda de Missão", color: "#B45309", badge: "2" },
  ]},
  { title: "FERRAMENTAS", items: [
    { label: "Dashboard",            color: "#065F46" },
    { label: "Transcrição",          color: "#3730A3" },
    { label: "Análise Grafoscópica", color: "#78350F" },  
    { label: "Notícias",             color: "#C2410C" },
]},
]

const AGENDA = [
  { time: "09:00", desc: "Briefing com setor operacional", status: "HOJE" },
  { time: "14:30", desc: "Revisão — Setor Norte", status: "HOJE" },
  { time: "10:00", desc: "Reunião com comando regional", status: "AMANHÃ" },
]

const NEWS = [
  { title: "Acordo bilateral entre Brasil e Argentina avança em questões de defesa", source: "Defesa Net", time: "2h", category: "Defesa", bg: "#DBEAFE", color: "#1D4ED8", img: "https://picsum.photos/seed/defesa/400/200" },
  { title: "Nova tecnologia de vigilância apresentada no Fórum de Segurança Regional", source: "Valor Econômico", time: "4h", category: "Tecnologia", bg: "#EDE9FE", color: "#6D28D9", img: "https://picsum.photos/seed/tech2/400/200" },
  { title: "Operação conjunta desmantela rede de tráfico no Amazonas", source: "G1 AM", time: "6h", category: "Operação", bg: "#FFEDD5", color: "#C2410C", img: "https://picsum.photos/seed/op2/400/200" },
  { title: "Reforço nas fronteiras: medidas estratégicas anunciadas pelo governo federal", source: "Agência Brasil", time: "8h", category: "Segurança", bg: "#D1FAE5", color: "#065F46", img: "https://picsum.photos/seed/seg2/400/200" },
]

const REFS = [
  { label: "Relatórios operacionais", color: "#6D28D9" },
  { label: "Documentos históricos", color: "#6D28D9" },
  { label: "Arquivos de inteligência", color: "#1D4ED8" },
  { label: "Busca por período", color: "#1D4ED8" },
  { label: "Drive institucional", color: "#065F46" },
]

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
const DOT_GRID = `url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1' cy='1' r='0.8' fill='%2394A3B8' fill-opacity='0.2'/%3E%3C/svg%3E")`

const SPARK = [3,5,4,7,6,8,5,9,7,10,8,11,9,10,12]

const GLOBAL_CSS = `
  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 4px 1px rgba(22,163,74,0.5); }
    50% { box-shadow: 0 0 10px 3px rgba(22,163,74,0.85); }
  }
  .chip-dot-pulse { animation: pulse-glow 2.5s ease-in-out infinite; }
  input::placeholder { color: #0F172A !important; font-weight: 700 !important; opacity: 0.45 !important; }
  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 4px; }
  .ref-btn:hover { background: #FFFBEB !important; border-color: rgba(180,83,9,0.35) !important; }
`

const OwlBlueprint = () => (
  <svg width="520" height="180" viewBox="0 0 520 180" fill="none" xmlns="http://www.w3.org/2000/svg" style={{opacity:0.15}}>
    <text x="260" y="44" textAnchor="middle"
      fontFamily="'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
      fontSize="40" fontWeight="800" letterSpacing="5" fill="#1E293B">
      AGENTE AUTÔNOMO
    </text>
    <line x1="80" y1="58" x2="440" y2="58" stroke="#1E293B" strokeWidth="0.7" strokeDasharray="4 6"/>
    <text x="260" y="95" textAnchor="middle"
      fontFamily="'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
      fontSize="22" fontWeight="300" letterSpacing="6" fill="#1E293B">
      Sistema de Inteligência
    </text>
    <text x="260" y="126" textAnchor="middle"
      fontFamily="'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
      fontSize="18" fontWeight="700" letterSpacing="2" fill="#1E293B">
      &amp;
    </text>
    <text x="260" y="158" textAnchor="middle"
      fontFamily="'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
      fontSize="22" fontWeight="300" letterSpacing="6" fill="#1E293B">
      Segurança Corporativa
    </text>
  </svg>
)

const Sparkline = ({ data }) => {
  const w = 80, h = 22
  const max = Math.max(...data), min = Math.min(...data)
  const pts = data.map((v,i) => {
    const x = (i/(data.length-1))*w
    const y = h - ((v-min)/(max-min))*(h-4) - 2
    return `${x},${y}`
  }).join(" ")
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={parseFloat(pts.split(" ").at(-1).split(",")[0])} cy={parseFloat(pts.split(" ").at(-1).split(",")[1])} r="2" fill="#16A34A"/>
    </svg>
  )
}

const GearIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
)

function tempoH(ts) { const d = Math.floor((Date.now()/1000 - ts)/3600); return d + "h" }

export default function App() {
  const [active, setActive] = useState("Painel")
  const [message, setMessage] = useState("")
  const [focused, setFocused] = useState(false)
  const [chatHistory, setChatHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [liveNews, setLiveNews] = useState([])
  const [showPolicies, setShowPolicies] = useState(false)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("darkMode") === "true")

useEffect(() => {
  document.body.classList.toggle("dark-mode", darkMode)
  localStorage.setItem("darkMode", darkMode)
}, [darkMode])
  const chatEndRef = useRef(null)

  useEffect(() => {
    const style = document.createElement("style")
    style.textContent = GLOBAL_CSS
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatHistory, loading])

  useEffect(() => {
    fetch("http://127.0.0.1:8000/noticias").then(r=>r.json()).then(d=>{if(d.noticias&&d.noticias.length>0)setLiveNews(d.noticias)}).catch(()=>{})
  }, [])

  async function enviarPergunta() {
    const pergunta = message.trim()
    if (!pergunta || loading) return
    setMessage("")
    setChatHistory(prev => [...prev, { role: "user", text: pergunta }])
    setLoading(true)
    try {
      const res = await fetch("http://127.0.0.1:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pergunta })
      })
      const data = await res.json()
      setChatHistory(prev => [...prev, { role: "bastos", text: data.resposta }])
    } catch {
      setChatHistory(prev => [...prev, { role: "bastos", text: "FALHA: sem conexão com o backend." }])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarPergunta() }
  }

  const now = new Date().toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })

  // Telas que substituem o main inteiro
 const isFullScreen = ["Chat RAG","Dashboard","Transcrição","Alertas","Referências","Configurações","Agenda de Missão","Lista Negra","Análise Grafoscópica"].includes(active)

  return (
    <div style={S.app}>
      <div style={S.dotGrid}/>

      {/* ── SIDEBAR — sempre visível ── */}
      <aside style={S.sidebar}>

        <div style={S.logoArea}>
          <div style={S.logoRing}>
            <img src="./src/assets/logo.png" alt="AB" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          </div>
          <div>
            <div style={S.logoName}>Agent Bastos</div>
            <div style={S.logoTagline}>Inteligência Soberana</div>
          </div>
        </div>

        <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"}}>

          <nav style={S.nav}>
            {NAV_GROUPS.map(group => (
              <div key={group.title} style={{marginBottom:10}}>
                <div style={S.groupLabel}>{group.title}</div>
                {group.items.map(item => {
                  const isActive = active === item.label
                  return (
                    <button key={item.label} style={{
                      ...S.ni,
                      ...(isActive ? {
                        background:"#FFFFFF",
                        borderLeft:`3px solid ${item.color}`,
                        boxShadow:"0 1px 6px rgba(0,0,0,0.07)",
                        paddingLeft:9,
                      } : { borderLeft:"3px solid transparent", paddingLeft:9 })
                    }} onClick={()=>setActive(item.label)}>
                      <span style={{fontSize:11.5,flex:1,color:isActive?"#0F172A":"#475569",fontWeight:isActive?600:400}}>{item.label}</span>
                      {item.badge && <span style={{fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:8,background:item.color,color:"#fff",fontFamily:MONO}}>{item.badge}</span>}
                      {item.pulse && <span style={{width:6,height:6,borderRadius:"50%",background:"#DC2626",flexShrink:0,boxShadow:"0 0 5px rgba(220,38,38,0.7)"}}/>}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>

          <div style={{height:1,background:"#E2E8F0",margin:"0 10px 8px"}}/>

          <div style={S.agendaWidget}>
            <div style={S.agendaWidgetHeader}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span style={{fontSize:9,fontWeight:800,color:"#334155",letterSpacing:"0.1em",textTransform:"uppercase"}}>Agenda</span>
              <span style={{fontSize:8,color:"#B45309",fontWeight:700,fontFamily:MONO,marginLeft:"auto"}}>+2</span>
            </div>
            {AGENDA.map((a,i) => (
              <div key={i} style={{display:"flex",alignItems:"baseline",gap:5,padding:"4px 0",borderBottom:i<AGENDA.length-1?"1px solid #F1F5F9":"none"}}>
                <span style={{fontSize:9,fontWeight:700,color:"#B45309",flexShrink:0,fontFamily:MONO,minWidth:30}}>{a.time}</span>
                <span style={{fontSize:10,color:"#334155",flex:1,lineHeight:1.3}}>{a.desc}</span>
                <span style={{fontSize:7,fontWeight:700,padding:"1px 4px",borderRadius:2,flexShrink:0,fontFamily:MONO,...(a.status==="HOJE"?{background:"#FEF3C7",color:"#92400E",border:"1px solid #F59E0B"}:{background:"#F1F5F9",color:"#64748B",border:"1px solid #CBD5E1"})}}>{a.status}</span>
              </div>
            ))}
          </div>

          <div style={{height:1,background:"#E2E8F0",margin:"8px 10px"}}/>

          <div style={S.statusWidget}>
            <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8}}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span style={{fontSize:9,fontWeight:800,color:"#334155",letterSpacing:"0.1em",textTransform:"uppercase"}}>Status de Operação</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
                  <span style={{width:5,height:5,borderRadius:"50%",background:"#16A34A",flexShrink:0,boxShadow:"0 0 4px rgba(22,163,74,0.7)"}}/>
                  <span style={{fontSize:9,color:"#0F172A",fontFamily:MONO}}>IA: Operacional</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <span style={{width:5,height:5,borderRadius:"50%",background:"#1D4ED8",flexShrink:0}}/>
                  <span style={{fontSize:9,color:"#0F172A",fontFamily:MONO}}>Agentes: 04 Ativos</span>
                </div>
              </div>
              <Sparkline data={SPARK}/>
            </div>
            <div style={{height:2,borderRadius:2,background:"#F1F5F9",overflow:"hidden"}}>
              <div style={{height:"100%",width:"78%",background:"linear-gradient(90deg,#16A34A,#34D399)",borderRadius:2}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
              <span style={{fontSize:8,color:"#64748B",fontFamily:MONO}}>Carga do sistema</span>
              <span style={{fontSize:8,color:"#16A34A",fontWeight:700,fontFamily:MONO}}>78%</span>
            </div>
          </div>
        </div>

        <div style={S.sidebarFooter}>
          <div style={{height:1,background:"#CBD5E1",marginBottom:6}}/>
          <button style={S.configBtn} onClick={()=>setActive("Configurações")}>
            <GearIcon/>
            <span style={{fontSize:11,color:"rgba(15,23,42,0.8)",fontWeight:500}}>Configurações</span>
          </button>
          <button style={S.policyBtn} onClick={()=>setShowPolicies(true)}>Políticas de uso</button>
          <div style={S.copyright}>© 2026 Agent Bastos · Todos os direitos reservados</div>
        </div>
      </aside>

      {/* ── MAIN — conteúdo dinâmico ── */}
      <main style={S.main}>

        {/* ── Telas que tomam o espaço inteiro do main ── */}
        {active === "Chat RAG"         && <ChatRAG      onNavigate={setActive} />}
        {active === "Dashboard"        && <Dashboard    onNavigate={setActive} />}
        {active === "Transcrição"      && <Transcricao  onNavigate={setActive} />}
        {active === "Análise Grafoscópica" && <Grafoscopia onNavigate={setActive} />}
        {active === "Alertas"          && <Alertas      onNavigate={setActive} />}
        {active === "Notícias"         && <Noticias     onNavigate={setActive} />}  
        {active === "Referências"      && <Referencias  onNavigate={setActive} />}
        {active === "Configurações" && <Configuracoes onNavigate={setActive} darkMode={darkMode} setDarkMode={setDarkMode}/>}
        {active === "Agenda de Missão" && <Agenda       onNavigate={setActive} />}
        {active === "Lista Negra"      && <ListaNegra   onNavigate={setActive} />}

        {/* ── Painel Principal ── */}
        {active === "Painel" && (
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
                  <div style={S.tsub}>24 abr 2026 · Manaus, AM</div>
                </div>
              </div>
              <div style={S.chip}>
                <div className="chip-dot-pulse" style={S.chipDot}/>
                <span style={S.chipText}>Sistema Operacional</span>
              </div>
            </header>

            <div style={S.body}>

              <div style={S.alert}>
                <div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
                  <span style={S.alertBadge}>⚠ ALERTA</span>
                  <p style={S.alertText}>Movimentação detectada na região de fronteira norte — verificar imediatamente</p>
                </div>
                <span style={S.alertTime}>há 12 min</span>
              </div>

              <section>
                <h2 style={S.secLabel}>Notícias em Destaque</h2>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                  {(liveNews.length > 0
                ? [...liveNews.slice(0,4).map((n,i) => ({ title: n.titulo, source: "n8n", time: tempoH(n.atualizado), category: "Intel", bg: "#FFEDD5", color: "#C2410C", img: n.imagem || "https://picsum.photos/seed/n"+i+"/400/200" })), ...NEWS].slice(0,4)          
                    : NEWS
                  ).map((n,i) => (
                    <div key={i} style={S.newsCard}>
                      <div style={S.newsImgWrap}>
                        <img src={n.img} alt="" style={S.newsImg} onError={e=>{e.target.style.display="none"}}/>
                        <div style={{position:"absolute",top:7,right:7,zIndex:2,fontSize:8,fontWeight:700,padding:"2px 7px",borderRadius:4,fontFamily:MONO,background:n.bg,color:n.color}}>{n.category}</div>
                      </div>
                      <div style={S.newsContent}>
                        <p style={S.newsTitle}>{n.title}</p>
                        <div style={{display:"flex",gap:4,marginTop:4,alignItems:"center"}}>
                          <span style={{fontSize:9,color:n.color,fontWeight:700,fontFamily:MONO}}>{n.source}</span>
                          <span style={{fontSize:9,color:"#CBD5E1"}}>·</span>
                          <span style={{fontSize:9,color:"#64748B",fontFamily:MONO}}>{n.time}</span>
                        </div>
                      </div>
                      <div style={{height:2,background:n.color,opacity:0.7}}/>
                    </div>
                  ))}
                </div>
              </section>

              <div style={S.refsBar}>
                <div style={S.refsBarLeft}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6D28D9" strokeWidth="2" strokeLinecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                  <span style={{fontSize:9,fontWeight:800,color:"#334155",letterSpacing:"0.1em",textTransform:"uppercase",whiteSpace:"nowrap"}}>Consulta de Referências</span>
                </div>
                <div style={S.refsBarItems}>
                  {REFS.map((r,i) => (
                    <button key={i} className="ref-btn" style={{
                      display:"flex",alignItems:"center",gap:5,
                      padding:"5px 10px",borderRadius:6,
                      background:"#FFFFFF",
                      border:`1px solid ${r.color}30`,
                      cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,
                      boxShadow:"0 1px 3px rgba(0,0,0,0.05)",
                      transition:"all 0.15s",
                    }}>
                      <span style={{width:5,height:5,borderRadius:"50%",background:r.color,flexShrink:0}}/>
                      <span style={{fontSize:10,color:r.color,fontWeight:600}}>{r.label}</span>
                    </button>
                  ))}
                </div>
                <span style={{fontSize:11,color:"#94A3B8",flexShrink:0,fontWeight:600}}>›</span>
              </div>

              <div style={S.chatArea}>
                {chatHistory.length === 0 && (
                  <div style={S.emptyState}>
                    <OwlBlueprint/>
                    <p style={S.emptyText}>Aguardando diretrizes...</p>
                    <p style={S.emptySubtext}>Inicie uma análise de inteligência</p>
                  </div>
                )}
                {chatHistory.length > 0 && (
                  <>
                    <div style={S.chatFadeMask}/>
                    <div style={S.chatMessages}>
                      {chatHistory.map((m,i) => (
                        <div key={i} style={{alignSelf:m.role==="user"?"flex-end":"flex-start",maxWidth:"72%",position:"relative",zIndex:3}}>
                          <div style={{
                            background: m.role==="user" ? "#0F172A" : "#F8FAFC",
                            borderRadius: 6,
                            borderLeft: m.role==="bastos" ? "3px solid #EAB308" : "none",
                            padding: "10px 14px",
                            fontSize: 13,
                            color: m.role==="user" ? "#FFFFFF" : "#1E293B",
                            lineHeight: 1.65,
                            boxShadow: m.role==="user" ? "0 4px 16px rgba(15,23,42,0.2)" : "0 2px 8px rgba(0,0,0,0.06)",
                          }}>
                            {m.role==="bastos" && (
                              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                                <span style={{fontSize:9,color:"#B45309",fontWeight:700,letterSpacing:"0.12em",fontFamily:MONO}}>◈ BASTOS-UNIT</span>
                                <span style={{fontSize:9,color:"#94A3B8",fontFamily:MONO}}>· {now}</span>
                              </div>
                            )}
                            {m.text}
                          </div>
                        </div>
                      ))}
                      {loading && (
                        <div style={{alignSelf:"flex-start",fontSize:11,color:"#94A3B8",fontFamily:MONO,display:"flex",alignItems:"center",gap:8,zIndex:3,position:"relative"}}>
                          <span style={{width:4,height:4,borderRadius:"50%",background:"#B45309",display:"inline-block"}}/>
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
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <input
                  style={{...S.chatIn,...(focused?{borderColor:"#B45309",boxShadow:"0 0 0 3px rgba(180,83,9,0.1)"}:{})}}
                  value={message}
                  onChange={e=>setMessage(e.target.value)}
                  onKeyDown={handleKey}
                  onFocus={()=>setFocused(true)}
                  onBlur={()=>setFocused(false)}
                  placeholder="Pergunte ao Agent Bastos — doutrina, análise, referências…"
                />
                <button style={{...S.sendBtn,...(loading?{opacity:0.4,cursor:"not-allowed"}:{})}} onClick={enviarPergunta} disabled={loading}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
              <p style={S.chatHint}>Pressione Enter para enviar · Use /comandos para ações rápidas</p>
            </div>
          </>
        )}

        {/* Telas ainda não implementadas */}
        {!["Painel","Chat RAG","Dashboard","Transcrição","Alertas","Notícias","Referências","Configurações","Agenda de Missão","Lista Negra"].includes(active) && (
          <div style={{display:"flex",flex:1,alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8}}>
            <div style={{fontSize:13,fontWeight:700,color:"#0F172A"}}>{active}</div>
            <div style={{fontSize:11,color:"#94A3B8",fontFamily:MONO}}>Em desenvolvimento</div>
          </div>
        )}

      </main>
      {/* ── MODAL POLÍTICAS DE USO ── */}
      {showPolicies && <PoliciesModal onClose={()=>setShowPolicies(false)}/>}

    </div>
  )
}

const S = {
  app:{display:"flex",height:"100vh",background:"#F8FAFC",overflow:"hidden",fontFamily:SANS,position:"relative",color:"#0F172A"},
  dotGrid:{position:"fixed",inset:0,backgroundImage:DOT_GRID,backgroundSize:"24px 24px",pointerEvents:"none",zIndex:0},
  sidebar:{width:224,background:"#F1F5F9",borderRight:"1px solid #CBD5E1",display:"flex",flexDirection:"column",flexShrink:0,height:"100vh",position:"relative",zIndex:10},
  logoArea:{padding:"12px 14px 10px",borderBottom:"1px solid #CBD5E1",display:"flex",alignItems:"center",gap:10,flexShrink:0},
  logoRing:{width:34,height:34,borderRadius:"50%",border:"2px solid #B45309",overflow:"hidden",flexShrink:0,background:"#FEF3C7",boxShadow:"0 0 0 2px rgba(180,83,9,0.1)"},
  logoName:{fontSize:12,fontWeight:700,color:"#0F172A"},
  logoTagline:{fontSize:8,color:"#B45309",letterSpacing:"0.16em",textTransform:"uppercase",marginTop:1,fontWeight:700},
  nav:{padding:"8px 6px 0",flexShrink:0},
  groupLabel:{fontSize:10,fontWeight:800,color:"#334155",letterSpacing:"0.05em",padding:"0 8px 4px",marginBottom:1},
  ni:{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:6,cursor:"pointer",marginBottom:1,border:"none",background:"transparent",width:"100%",textAlign:"left",transition:"all 0.12s ease"},
  agendaWidget:{margin:"0 8px 0",padding:"7px 10px",background:"#FFFFFF",borderRadius:8,border:"1px solid #E2E8F0",boxShadow:"0 1px 4px rgba(0,0,0,0.05)",flexShrink:0},
  agendaWidgetHeader:{display:"flex",alignItems:"center",gap:5,marginBottom:6,paddingBottom:5,borderBottom:"1px solid #F1F5F9"},
  statusWidget:{margin:"0 8px",padding:"8px 10px",background:"#FFFFFF",borderRadius:8,border:"1px solid #E2E8F0",boxShadow:"0 1px 4px rgba(0,0,0,0.05)",flexShrink:0},
  sidebarFooter:{padding:"0 8px 8px",flexShrink:0},
  configBtn:{display:"flex",alignItems:"center",gap:7,padding:"6px 8px",cursor:"pointer",border:"none",background:"transparent",width:"100%",textAlign:"left",borderRadius:6},
  policyBtn:{display:"block",width:"100%",textAlign:"center",fontSize:10,color:"rgba(15,23,42,0.7)",background:"transparent",border:"none",cursor:"pointer",padding:"2px 0",fontWeight:500},
  copyright:{fontSize:9,color:"rgba(15,23,42,0.45)",textAlign:"center",padding:"2px 0 0",lineHeight:1.4},
  main:{flex:1,display:"flex",flexDirection:"column",minWidth:0,height:"100vh",position:"relative",zIndex:10},
  topbar:{height:44,borderBottom:"1px solid #E2E8F0",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 18px",background:"#FFFFFF",flexShrink:0,boxShadow:"0 1px 3px rgba(0,0,0,0.05)"},
  wc:{display:"flex",gap:6,alignItems:"center",marginRight:12},
  wb:{width:12,height:12,borderRadius:"50%",border:"none",cursor:"pointer",flexShrink:0},
  ttitle:{fontSize:13,fontWeight:700,color:"#0F172A"},
  tsub:{fontSize:10,color:"#64748B",marginTop:1,fontFamily:MONO},
  chip:{display:"flex",alignItems:"center",gap:6,padding:"4px 12px",background:"#F0FDF4",borderRadius:20,border:"1px solid #86EFAC"},
  chipDot:{width:7,height:7,borderRadius:"50%",background:"#16A34A",flexShrink:0},
  chipText:{fontSize:10,color:"#166534",fontWeight:600},
  body:{flex:1,overflow:"hidden",padding:"10px 18px",display:"flex",flexDirection:"column",gap:8},
  alert:{background:"#FEF2F2",borderRadius:7,padding:"7px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",border:"1px solid #FECACA",boxShadow:"0 2px 8px rgba(220,38,38,0.07)",flexShrink:0},
  alertBadge:{fontSize:10,fontWeight:700,padding:"2px 8px",background:"#DC2626",color:"#FFFFFF",borderRadius:4,letterSpacing:"0.06em",whiteSpace:"nowrap",flexShrink:0,fontFamily:MONO},
  alertText:{fontSize:12,color:"#7F1D1D",lineHeight:1.4,marginLeft:10,fontWeight:600},
  alertTime:{fontSize:10,color:"#FCA5A5",whiteSpace:"nowrap",marginLeft:12,flexShrink:0,fontFamily:MONO},
  secLabel:{fontSize:9,fontWeight:700,color:"#334155",letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:6},
  newsCard:{width:"100%",background:"#FFFFFF",border:"1px solid #E2E8F0",borderRadius:8,overflow:"hidden",cursor:"pointer",position:"relative",boxShadow:"0 2px 6px rgba(0,0,0,0.06)"},
  newsImgWrap:{position:"relative",height:54,background:"#F8FAFC",overflow:"hidden"},
  newsImg:{width:"100%",height:"100%",objectFit:"cover"},
  newsContent:{padding:"8px 10px 9px"},
  newsTitle:{fontSize:10.5,color:"#0F172A",lineHeight:1.45,fontWeight:500},
  refsBar:{display:"flex",alignItems:"center",gap:10,background:"#FFFFFF",border:"1px solid #E2E8F0",borderRadius:8,padding:"7px 12px",boxShadow:"0 2px 6px rgba(0,0,0,0.05)",flexShrink:0,overflow:"hidden"},
  refsBarLeft:{display:"flex",alignItems:"center",gap:6,paddingRight:10,borderRight:"1px solid #E2E8F0",flexShrink:0},
  refsBarItems:{display:"flex",alignItems:"center",gap:6,flex:1,overflow:"hidden"},
  chatArea:{flex:1,background:"#FFFFFF",border:"1px solid #E2E8F0",borderRadius:8,boxShadow:"0 8px 24px -4px rgba(0,0,0,0.1)",position:"relative",overflow:"hidden",minHeight:60},
  emptyState:{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",pointerEvents:"none",userSelect:"none"},
  emptyText:{fontSize:12,color:"rgba(15,23,42,0.25)",fontWeight:600,marginTop:8,letterSpacing:"0.04em"},
  emptySubtext:{fontSize:10,color:"rgba(15,23,42,0.15)",fontFamily:MONO,marginTop:3},
  chatFadeMask:{position:"absolute",top:0,left:0,right:0,height:24,background:"linear-gradient(to bottom,#FFFFFF,transparent)",zIndex:2,pointerEvents:"none"},
  chatMessages:{padding:"12px 14px 8px",display:"flex",flexDirection:"column",gap:8,height:"100%",overflowY:"auto"},
  chatBar:{borderTop:"1px solid #E2E8F0",background:"#FFFFFF",padding:"8px 18px 10px",flexShrink:0,boxShadow:"0 -1px 3px rgba(0,0,0,0.04)"},
  chatBarFocused:{background:"#FAFAFA"},
  chatRow:{display:"flex",gap:8,alignItems:"center"},
  chatIconWrap:{width:34,height:34,borderRadius:7,background:"#FEF3C7",border:"1px solid #FDE68A",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},
  chatIn:{flex:1,background:"#F8FAFC",border:"1px solid #CBD5E1",borderRadius:7,padding:"10px 14px",fontSize:13,color:"#0F172A",outline:"none",fontFamily:SANS,transition:"border-color 0.2s,box-shadow 0.2s"},
  sendBtn:{width:36,height:36,background:"linear-gradient(135deg,#F59E0B,#B45309)",border:"none",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,boxShadow:"0 4px 12px rgba(180,83,9,0.3)",transition:"opacity 0.2s"},
  chatHint:{fontSize:10,color:"rgba(0,0,0,0.7)",textAlign:"center",marginTop:6,letterSpacing:"0.03em",fontWeight:500,fontFamily:MONO},
}

// ════════════════════════════════════════════════════════════════════════════
// MODAL — POLÍTICAS DE USO
// ════════════════════════════════════════════════════════════════════════════
const POLICY_DEFAULT = {
  empresa: "Viga — Soluções em Tecnologia e Segurança",
  versao: "1.0.0",
  data: "Abril de 2026",
  clausulas: [
    {
      titulo: "1. Finalidade do Sistema",
      texto: "O Agent Bastos é um sistema de inteligência corporativa desenvolvido para apoiar atividades de análise, monitoramento e produção de conhecimento em segurança pública e corporativa. Seu uso é restrito a agentes devidamente autorizados pela instituição responsável pelo licenciamento.",
    },
    {
      titulo: "2. Responsabilidade pelo Uso",
      texto: "O usuário é integralmente responsável pela utilização dos dados, relatórios e análises gerados pelo sistema. Todo acesso é registrado e auditável. O uso indevido das informações, incluindo compartilhamento não autorizado ou utilização para fins pessoais, constitui violação das normas institucionais e pode acarretar sanções administrativas, civis e penais.",
    },
    {
      titulo: "3. Proteção de Dados — LGPD",
      texto: "Este sistema processa dados pessoais de terceiros no estrito cumprimento da Lei Geral de Proteção de Dados (Lei nº 13.709/2018). Os dados são tratados exclusivamente para finalidades legítimas de segurança pública e investigação. O armazenamento, compartilhamento e descarte seguem as diretrizes da LGPD e das normas internas da instituição.",
    },
    {
      titulo: "4. Inteligência Artificial e Limitações",
      texto: "As análises geradas por inteligência artificial têm caráter auxiliar e não substituem o julgamento do agente responsável. Toda informação produzida pelo sistema deve ser validada por supervisor humano antes de embasar decisões operacionais. O sistema não possui valor probatório direto para fins judiciais sem perícia técnica complementar.",
    },
    {
      titulo: "5. Confidencialidade",
      texto: "Todas as informações processadas, relatórios gerados e análises produzidas são classificadas como RESERVADAS e de USO INTERNO. É vedada a reprodução, cópia ou divulgação do conteúdo do sistema sem autorização expressa da autoridade competente.",
    },
    {
      titulo: "6. Titularidade e Propriedade Intelectual",
      texto: "O Agent Bastos é produto desenvolvido e licenciado por {empresa}. Todos os direitos de propriedade intelectual, incluindo código-fonte, design, arquitetura e metodologias, são de titularidade exclusiva desta empresa. É vedada a engenharia reversa, reprodução ou distribuição sem autorização.",
    },
    {
      titulo: "7. Vigência e Atualizações",
      texto: "Estas políticas entram em vigor na data de implantação do sistema e podem ser atualizadas a qualquer momento pela administradora do sistema. Alterações serão comunicadas aos usuários no primeiro acesso após a atualização.",
    },
  ],
}

const MONO_P = "'JetBrains Mono','Roboto Mono','Courier New',monospace"

function PoliciesModal({ onClose }) {
  const stored = localStorage.getItem("ab_policies")
  const [data, setData] = useState(stored ? JSON.parse(stored) : POLICY_DEFAULT)
  const [editing, setEditing] = useState(false)
  const [editEmpresa, setEditEmpresa] = useState(data.empresa)

  function saveEmpresa() {
    const updated = { ...data, empresa: editEmpresa }
    setData(updated)
    localStorage.setItem("ab_policies", JSON.stringify(updated))
    setEditing(false)
  }

  function renderTexto(txt) {
    return txt.replace("{empresa}", data.empresa)
  }

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:1000,
      background:"rgba(15,23,42,0.65)",
      display:"flex", alignItems:"center", justifyContent:"center",
      backdropFilter:"blur(3px)",
    }} onClick={e=>{ if(e.target===e.currentTarget) onClose() }}>

      <div style={{
        background:"#FFFFFF", borderRadius:12, width:"min(780px,92vw)",
        maxHeight:"88vh", display:"flex", flexDirection:"column",
        boxShadow:"0 24px 64px rgba(0,0,0,0.3)", overflow:"hidden",
      }}>

        <div style={{
          padding:"20px 28px 16px", borderBottom:"1px solid #E2E8F0",
          background:"#F8FAFC", display:"flex", alignItems:"flex-start",
          justifyContent:"space-between", flexShrink:0,
        }}>
          <div>
            <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:4}}>
              <div style={{width:3, height:20, background:"#B45309", borderRadius:2}}/>
              <span style={{fontSize:9, fontWeight:700, color:"#64748B", letterSpacing:"0.15em", textTransform:"uppercase"}}>
                Agent Bastos · Documento Institucional
              </span>
            </div>
            <div style={{fontSize:17, fontWeight:800, color:"#0F172A", letterSpacing:"-0.01em"}}>
              Políticas de Uso
            </div>

            <div style={{display:"flex", alignItems:"center", gap:8, marginTop:6}}>
              {editing ? (
                <>
                  <input
                    value={editEmpresa}
                    onChange={e=>setEditEmpresa(e.target.value)}
                    autoFocus
                    style={{
                      fontSize:12, fontWeight:600, color:"#0F172A",
                      border:"1px solid #B45309", borderRadius:5,
                      padding:"3px 8px", outline:"none", fontFamily:"inherit",
                      background:"#FEF3C7", width:320,
                    }}
                    onKeyDown={e=>{ if(e.key==="Enter") saveEmpresa(); if(e.key==="Escape") setEditing(false) }}
                  />
                  <button onClick={saveEmpresa} style={{fontSize:11, fontWeight:700, color:"#16A34A", background:"#F0FDF4", border:"1px solid #86EFAC", borderRadius:5, padding:"3px 10px", cursor:"pointer"}}>
                    Salvar
                  </button>
                  <button onClick={()=>setEditing(false)} style={{fontSize:11, color:"#64748B", background:"transparent", border:"none", cursor:"pointer"}}>
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <span style={{fontSize:12, fontWeight:600, color:"#475569", fontFamily:MONO_P}}>
                    {data.empresa}
                  </span>
                  <button onClick={()=>{ setEditEmpresa(data.empresa); setEditing(true) }} style={{
                    fontSize:9, color:"#B45309", background:"#FEF3C7", border:"1px solid #FDE68A",
                    borderRadius:4, padding:"2px 7px", cursor:"pointer", fontWeight:600,
                  }}>
                    ✏ Editar
                  </button>
                </>
              )}
            </div>

            <div style={{display:"flex", gap:16, marginTop:8}}>
              {[["Versão", data.versao], ["Vigência", data.data], ["Status", "ATIVO"]].map(([k,v])=>(
                <div key={k}>
                  <div style={{fontSize:8, fontWeight:700, color:"#94A3B8", letterSpacing:"0.1em", textTransform:"uppercase"}}>{k}</div>
                  <div style={{fontSize:10, fontWeight:700, color:"#0F172A", fontFamily:MONO_P}}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          <button onClick={onClose} style={{
            width:32, height:32, borderRadius:"50%", border:"1px solid #E2E8F0",
            background:"#F8FAFC", cursor:"pointer", display:"flex",
            alignItems:"center", justifyContent:"center", fontSize:16,
            color:"#64748B", flexShrink:0,
          }}>×</button>
        </div>

        <div style={{overflowY:"auto", padding:"20px 28px", display:"flex", flexDirection:"column", gap:16}}>
          {data.clausulas.map((c, i) => (
            <div key={i} style={{
              padding:"14px 16px", borderRadius:8,
              background: i % 2 === 0 ? "#FAFBFC" : "#FFFFFF",
              border:"1px solid #F1F5F9",
            }}>
              <div style={{fontSize:11, fontWeight:800, color:"#0F172A", marginBottom:6, letterSpacing:"0.01em"}}>
                {c.titulo}
              </div>
              <div style={{fontSize:12, color:"#475569", lineHeight:1.75}}>
                {renderTexto(c.texto)}
              </div>
            </div>
          ))}

          <div style={{
            marginTop:8, padding:"14px 16px",
            background:"#0F172A", borderRadius:8,
            display:"flex", alignItems:"center", justifyContent:"space-between",
            flexWrap:"wrap", gap:8,
          }}>
            <span style={{fontSize:10, color:"#94A3B8", fontFamily:MONO_P}}>
              Agent Bastos · Intelligence System
            </span>
            <div style={{display:"flex", gap:6}}>
              {["PROTEGIDO","RESERVADO","USO INTERNO"].map(t=>(
                <span key={t} style={{fontSize:8, fontWeight:800, color:"#0F172A", background:"#F59E0B", borderRadius:3, padding:"2px 7px", letterSpacing:"0.05em", fontFamily:MONO_P}}>
                  {t}
                </span>
              ))}
            </div>
            <span style={{fontSize:9, color:"#64748B", fontFamily:MONO_P}}>
              © 2026 {data.empresa}
            </span>
          </div>
        </div>

        <div style={{
          padding:"12px 28px", borderTop:"1px solid #E2E8F0",
          background:"#F8FAFC", display:"flex",
          justifyContent:"flex-end", flexShrink:0,
        }}>
          <button onClick={onClose} style={{
            padding:"8px 24px", background:"#0F172A", color:"#FFF",
            border:"none", borderRadius:7, fontSize:12, fontWeight:700,
            cursor:"pointer", letterSpacing:"0.02em",
          }}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
