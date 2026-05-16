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
import ControleGrupos from "./ControleGrupos"
import InteligenciaGrupos from "./InteligenciaGrupos"
import LiderancasUnidade from "./LiderancasUnidade"

const NAV_GROUPS = [
  { title: "PRINCIPAL", items: [
    { label: "Painel", color: "#F59E0B", active: true },
    { label: "Alertas", color: "#F87171", pulse: true },
    { label: "Controle de Grupos", color: "#F87171" },
    { label: "Inteligência de Grupos", color: "#A78BFA" },
    { label: "Lideranças por Unidade", color: "#F87171" },
    { label: "Lista Negra", color: "#94A3B8" },
  ]},
  { title: "INTELIGÊNCIA", items: [
    { label: "Chat RAG", color: "#60A5FA" },
    { label: "Referências", color: "#C4B5FD" },
    { label: "Agenda de Missão", color: "#F59E0B", badge: "2" },
  ]},
  { title: "FERRAMENTAS", items: [
    { label: "Dashboard",            color: "#34D399" },
    { label: "Transcrição",          color: "#818CF8" },
    { label: "Análise Grafoscópica", color: "#FBBF24" },
    { label: "Notícias",             color: "#FB923C" },
  ]},
]

const NEWS = [
  { title: "Acordo bilateral entre Brasil e Argentina avança em questões de defesa", source: "Defesa Net", time: "2h", category: "Defesa", accent: "#60A5FA", img: "https://picsum.photos/seed/defesa/400/200" },
  { title: "Nova tecnologia de vigilância apresentada no Fórum de Segurança Regional", source: "Valor Econômico", time: "4h", category: "Tecnologia", accent: "#A78BFA", img: "https://picsum.photos/seed/tech2/400/200" },
  { title: "Operação conjunta desmantela rede de tráfico no Amazonas", source: "G1 AM", time: "6h", category: "Operação", accent: "#FB923C", img: "https://picsum.photos/seed/op2/400/200" },
  { title: "Reforço nas fronteiras: medidas estratégicas anunciadas pelo governo federal", source: "Agência Brasil", time: "8h", category: "Segurança", accent: "#34D399", img: "https://picsum.photos/seed/seg2/400/200" },
]

const REFS = [
  { label: "Relatórios operacionais", color: "#A78BFA" },
  { label: "Documentos históricos",   color: "#A78BFA" },
  { label: "Arquivos de inteligência",color: "#60A5FA" },
  { label: "Busca por período",        color: "#60A5FA" },
  { label: "Drive institucional",      color: "#34D399" },
]

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

/* grade de pontos adaptada ao fundo escuro */
const DOT_GRID = `url("data:image/svg+xml,%3Csvg width='28' height='28' viewBox='0 0 28 28' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1' cy='1' r='0.9' fill='%23FFFFFF' fill-opacity='0.04'/%3E%3C/svg%3E")`

/* ─── tokens de cor do design system dark ─── */
const C = {
  bg:        "#0B1120",   /* slate escuro — fundo principal  */
  surface:   "#111827",   /* cards / topbar                  */
  surfaceUp: "#1A2236",   /* cards elevados (hover, destaque) */
  border:    "rgba(255,255,255,0.07)",
  borderUp:  "rgba(255,255,255,0.13)",
  gold:      "#E8A020",   /* dourado âmbar — fio condutor     */
  goldSoft:  "rgba(232,160,32,0.15)",
  text:      "#F1F5F9",   /* texto principal                  */
  textMid:   "#94A3B8",   /* texto secundário                 */
  textDim:   "rgba(255,255,255,0.35)", /* rótulos, placeholders */
}

const GLOBAL_CSS = `
  * { box-sizing: border-box; }
  body { background: ${C.bg}; }

  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 5px 1px rgba(22,163,74,0.5); }
    50%       { box-shadow: 0 0 12px 3px rgba(22,163,74,0.85); }
  }
  @keyframes amber-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(232,160,32,0); }
    50%       { box-shadow: 0 0 0 4px rgba(232,160,32,0.15); }
  }

  .chip-dot-pulse { animation: pulse-glow 2.5s ease-in-out infinite; }

  input, textarea { caret-color: ${C.gold}; }
  input::placeholder { color: ${C.textDim} !important; font-weight: 500 !important; opacity:1 !important; }

  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius:4px; }

  /* ── NAV ITEMS ── */
  .nav-item { position: relative; }
  .nav-item::after {
    content: '›';
    position: absolute; right: 12px; top: 50%;
    transform: translateY(-50%);
    font-size: 15px; line-height:1;
    color: transparent;
    transition: color 0.15s ease, right 0.15s ease;
    pointer-events: none;
  }
  .nav-item:hover {
    background: rgba(232,160,32,0.1) !important;
    border-left-color: rgba(232,160,32,0.6) !important;
  }
  .nav-item:hover::after { color: rgba(232,160,32,0.7); right:10px; }
  .nav-item:active { transform: scale(0.983); transition: transform 0.08s ease; }

  /* ── CARDS DE NOTÍCIA ── */
  .news-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 10px; overflow:hidden; cursor:pointer;
    transition: all 0.2s ease;
    backdrop-filter: blur(8px);
  }
  .news-card:hover {
    background: rgba(255,255,255,0.08);
    border-color: rgba(232,160,32,0.3);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  }

  /* ── BOTÕES DE REFERÊNCIA ── */
  .ref-btn {
    background: rgba(255,255,255,0.05) !important;
    border: 1px solid rgba(255,255,255,0.1) !important;
    transition: all 0.15s ease;
  }
  .ref-btn:hover {
    background: ${C.goldSoft} !important;
    border-color: rgba(232,160,32,0.4) !important;
    transform: translateY(-1px);
  }

  /* ── CONFIG BTN ── */
  .config-btn:hover { background: rgba(255,255,255,0.06) !important; }
`

/* ── watermark adaptada ao dark ── */
const OwlBlueprint = () => (
  <svg width="520" height="180" viewBox="0 0 520 180" fill="none" xmlns="http://www.w3.org/2000/svg" style={{opacity:0.07}}>
    <text x="260" y="44" textAnchor="middle" fontFamily={SANS}
      fontSize="40" fontWeight="800" letterSpacing="5" fill="#FFFFFF">
      AGENTE AUTÔNOMO
    </text>
    <line x1="80" y1="58" x2="440" y2="58" stroke="#FFFFFF" strokeWidth="0.6" strokeDasharray="4 6"/>
    <text x="260" y="95" textAnchor="middle" fontFamily={SANS}
      fontSize="22" fontWeight="300" letterSpacing="6" fill="#FFFFFF">
      Sistema de Inteligência
    </text>
    <text x="260" y="126" textAnchor="middle" fontFamily={SANS}
      fontSize="18" fontWeight="700" letterSpacing="2" fill="#E8A020">
      &amp;
    </text>
    <text x="260" y="158" textAnchor="middle" fontFamily={SANS}
      fontSize="22" fontWeight="300" letterSpacing="6" fill="#FFFFFF">
      Segurança Corporativa
    </text>
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
  const [active, setActive]           = useState("Painel")
  const [message, setMessage]         = useState("")
  const [focused, setFocused]         = useState(false)
  const [chatHistory, setChatHistory] = useState([])
  const [loading, setLoading]         = useState(false)
  const [liveNews, setLiveNews]       = useState([])
  const [showPolicies, setShowPolicies] = useState(false)
  const [tema, setTema] = useState(() => localStorage.getItem("ab_tema") || "dark")
  const chatEndRef = useRef(null)

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
    fetch("http://127.0.0.1:8000/noticias")
      .then(r=>r.json())
      .then(d=>{ if(d.noticias?.length>0) setLiveNews(d.noticias) })
      .catch(()=>{})
  }, [])

  async function enviarPergunta() {
    const pergunta = message.trim()
    if (!pergunta || loading) return
    setMessage("")
    setChatHistory(prev=>[...prev,{role:"user",text:pergunta}])
    setLoading(true)
    try {
      const res  = await fetch("http://127.0.0.1:8000/chat",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({pergunta}),
      })
      const data = await res.json()
      setChatHistory(prev=>[...prev,{role:"bastos",text:data.resposta}])
    } catch {
      setChatHistory(prev=>[...prev,{role:"bastos",text:"FALHA: sem conexão com o backend."}])
    } finally { setLoading(false) }
  }

  function handleKey(e) {
    if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); enviarPergunta() }
  }

  const now = new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})

  /* notícias: live ou mock */
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

      {/* ══════════════════════════════ SIDEBAR ══════════════════════════════ */}
      <aside style={S.sidebar}>

        <div style={S.logoArea}>
          <div style={S.logoRing}>
            <img src="./src/assets/logo.png" alt="AB" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          </div>
          <div style={S.logoText}>
            <div style={S.logoName}>Agent Bastos</div>
            <div style={S.logoTagline}>Inteligência Soberana</div>
          </div>
        </div>

        <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",padding:"6px 0"}}>
          <nav style={S.nav}>
            {NAV_GROUPS.map(group=>(
              <div key={group.title} style={{marginBottom:16}}>
                <div style={S.groupLabel}>
                  <span style={S.groupLabelBar}/>
                  {group.title}
                </div>
                {group.items.map(item=>{
                  const isActive = active===item.label
                  return (
                    <button key={item.label} className="nav-item"
                      style={{...S.ni,...(isActive?{
                        background:"rgba(255,255,255,0.15)",
                        borderLeft:`3px solid ${item.color}`,
                        boxShadow:"inset 0 0 0 1px rgba(255,255,255,0.08)",
                      }:{borderLeft:"3px solid transparent"})}}
                      onClick={()=>setActive(item.label)}>
                      <span style={{fontSize:13,flex:1,
                        color: isActive?"#FFFFFF":"rgba(255,255,255,0.7)",
                        fontWeight: isActive?700:400,letterSpacing:"0.01em"}}>
                        {item.label}
                      </span>
                      {item.badge&&<span style={{fontSize:9,fontWeight:700,padding:"1px 6px",
                        borderRadius:8,background:item.color,color:"#F1F5F9",fontFamily:MONO}}>
                        {item.badge}
                      </span>}
                      {item.pulse&&<span style={{width:7,height:7,borderRadius:"50%",
                        background:"#F87171",flexShrink:0,boxShadow:"0 0 6px rgba(248,113,113,0.8)"}}/>}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
        </div>

        <div style={S.sidebarFooter}>
          <div style={S.footerDivider}/>
          <button className="config-btn" style={S.configBtn} onClick={()=>setActive("Configurações")}>
            <GearIcon/>
            <span style={{fontSize:13,color:"#FFFFFF",fontWeight:600}}>Configurações</span>
          </button>
          <button style={S.policyBtn} onClick={()=>setShowPolicies(true)}>Políticas de uso</button>
          <div style={S.copyright}>
            © 2026 <span style={{color:"#F59E0B",fontWeight:700}}>Agent Bastos</span>
            <span style={{display:"block",marginTop:1}}>Todos os direitos reservados</span>
          </div>
        </div>
      </aside>

      {/* ══════════════════════════════ MAIN ══════════════════════════════ */}
      <main style={S.main}>

        {active==="Chat RAG"               && <ChatRAG      onNavigate={setActive}/>}
        {active==="Dashboard"              && <Dashboard    onNavigate={setActive}/>}
        {active==="Transcrição"            && <Transcricao  onNavigate={setActive}/>}
        {active==="Análise Grafoscópica"   && <Grafoscopia  onNavigate={setActive}/>}
        {active==="Alertas"                && <Alertas      onNavigate={setActive}/>}
        {active==="Notícias"               && <Noticias     onNavigate={setActive}/>}
        {active==="Referências"            && <Referencias  onNavigate={setActive}/>}
        {active==="Configurações"          && <Configuracoes onNavigate={setActive} tema={tema} setTema={setTema}/>}
        {active==="Controle de Grupos"     && <ControleGrupos onNavigate={setActive}/>}
        {active==="Inteligência de Grupos" && <InteligenciaGrupos onNavigate={setActive}/>}
        {active==="Lideranças por Unidade" && <LiderancasUnidade onNavigate={setActive}/>}
        {active==="Agenda de Missão"       && <Agenda       onNavigate={setActive}/>}
        {active==="Lista Negra"            && <ListaNegra   onNavigate={setActive}/>}

        {/* ── PAINEL PRINCIPAL ── */}
        {active==="Painel" && (
          <>
            {/* topbar */}
            <header style={S.topbar}>
              <div style={{display:"flex",alignItems:"center"}}>
                <div style={S.wc}>
                  <button style={{...S.wb,background:"#FF5F57"}} onClick={()=>window.electronAPI?.close()}/>
                  <button style={{...S.wb,background:"#FEBC2E"}} onClick={()=>window.electronAPI?.minimize()}/>
                  <button style={{...S.wb,background:"#28C840"}} onClick={()=>window.electronAPI?.maximize()}/>
                </div>
                <div>
                  {/* título: 13 → 17px (+30%) */}
                  <div style={S.ttitle}>Painel Principal</div>
                  {/* sub: 10 → 13px (+30%) */}
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

              {/* alerta */}
              <div style={S.alert}>
                <div style={{display:"flex",alignItems:"center",gap:12,flex:1,minWidth:0}}>
                  <span style={S.alertBadge}>⚠ ALERTA</span>
                  {/* texto: 12 → 15.6px (+30%) */}
                  <p style={S.alertText}>Movimentação detectada na região de fronteira norte — verificar imediatamente</p>
                </div>
                <span style={S.alertTime}>há 12 min</span>
              </div>

              {/* notícias */}
              <section>
                <div style={S.secHeader}>
                  <span style={S.secBar}/>
                  {/* secLabel: 9 → 11.7px (+30%) */}
                  <h2 style={S.secLabel}>Notícias em Destaque</h2>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                  {newsToShow.map((n,i)=>(
                    <div key={i} className="news-card">
                      <div style={{position:"relative",height:68,overflow:"hidden",background:"rgba(255,255,255,0.03)"}}>
                        <img src={n.img} alt="" style={{width:"100%",height:"100%",objectFit:"cover",opacity:0.85}}
                          onError={e=>{e.target.style.display="none"}}/>
                        <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,transparent 40%,rgba(0,0,0,0.7))"}}/>
                        <span style={{position:"absolute",top:7,right:7,fontSize:9,fontWeight:700,
                          padding:"2px 8px",borderRadius:4,fontFamily:MONO,
                          background:`${n.accent}22`,color:n.accent,
                          border:`1px solid ${n.accent}44`,backdropFilter:"blur(4px)"}}>
                          {n.category}
                        </span>
                      </div>
                      <div style={{padding:"10px 12px 12px"}}>
                        {/* newsTitle: 10.5 → 13.7px (+30%) */}
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

              {/* barra de referências */}
              <div style={S.refsBar}>
                <div style={S.refsBarLeft}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  </svg>
                  {/* refs label: 9 → 11.7px (+30%) */}
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
                      {/* ref label: 10 → 13px (+30%) */}
                      <span style={{fontSize:13,color:r.color,fontWeight:600}}>{r.label}</span>
                    </button>
                  ))}
                </div>
                <span style={{fontSize:14,color:C.textMid,flexShrink:0}}>›</span>
              </div>

              {/* área de chat */}
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
                            borderLeft: m.role==="bastos"?"3px solid #E8A020":"none",
                            padding:"12px 16px",
                            /* fontSize: 13 → 16.9px (+30%) */
                            fontSize:16.9,
                            color: m.role==="user"?"#FFFFFF":C.text,
                            lineHeight:1.65,
                            boxShadow: m.role==="user"
                              ?"0 4px 20px rgba(0,0,0,0.4)"
                              :"0 2px 12px rgba(0,0,0,0.2)",
                            backdropFilter:"blur(8px)",
                            border: m.role==="bastos"
                              ?"1px solid rgba(232,160,32,0.2) ; border-left:3px solid #E8A020"
                              :"none",
                          }}>
                            {m.role==="bastos"&&(
                              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                                {/* chat label: 9 → 11.7px (+30%) */}
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

            {/* barra de chat */}
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
              {/* hint: 10 → 13px (+30%) */}
              <p style={S.chatHint}>Pressione Enter para enviar · Use /comandos para ações rápidas</p>
            </div>
          </>
        )}

        {!["Painel","Chat RAG","Dashboard","Transcrição","Alertas","Notícias","Referências",
           "Configurações","Agenda de Missão","Lista Negra","Controle de Grupos",
           "Inteligência de Grupos","Lideranças por Unidade"].includes(active) && (
          <div style={{display:"flex",flex:1,alignItems:"center",justifyContent:"center",flexDirection:"column",gap:10}}>
            <div style={{fontSize:17,fontWeight:700,color:C.text}}>{active}</div>
            <div style={{fontSize:13,color:C.textMid,fontFamily:MONO}}>Em desenvolvimento</div>
          </div>
        )}
      </main>

      {showPolicies && <PoliciesModal onClose={()=>setShowPolicies(false)}/>}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   DESIGN SYSTEM — ESTILOS
   Regra de escala +30%:
     9px  → 11.7   |  10px → 13   |  10.5 → 13.7
     11px → 14.3   |  12px → 15.6 |  13px → 16.9
════════════════════════════════════════════════════════════════════════════ */
const S = {
  app:{display:"flex",height:"100vh",background:C.bg,overflow:"hidden",fontFamily:SANS,position:"relative",color:C.text},
  dotGrid:{position:"fixed",inset:0,backgroundImage:DOT_GRID,backgroundSize:"28px 28px",pointerEvents:"none",zIndex:0},

  /* ── SIDEBAR (intocado) ── */
  sidebar:{width:240,background:"linear-gradient(180deg,#0C3B6E 0%,#0A3260 40%,#082848 100%)",
    borderRight:"1px solid rgba(255,255,255,0.08)",display:"flex",flexDirection:"column",
    flexShrink:0,height:"100vh",position:"relative",zIndex:10,boxShadow:"4px 0 24px rgba(0,0,0,0.25)"},
  logoArea:{padding:"18px 16px 16px",borderBottom:"1px solid rgba(255,255,255,0.1)",
    display:"flex",flexDirection:"column",alignItems:"center",gap:10,flexShrink:0},
  logoRing:{width:56,height:56,borderRadius:"50%",border:"2px solid rgba(245,158,11,0.85)",
    overflow:"hidden",flexShrink:0,background:"rgba(245,158,11,0.15)",
    boxShadow:"0 0 16px rgba(245,158,11,0.35),0 2px 8px rgba(0,0,0,0.3)"},
  logoText:{display:"flex",flexDirection:"column",alignItems:"center",gap:2},
  logoName:{fontSize:14,fontWeight:800,color:"#FFFFFF",letterSpacing:"0.01em",textAlign:"center"},
  logoTagline:{fontSize:10,color:"#F59E0B",letterSpacing:"0.18em",textTransform:"uppercase",fontWeight:700,textAlign:"center"},
  nav:{padding:"10px 8px 0",flexShrink:0},
  groupLabel:{display:"flex",alignItems:"center",gap:7,fontSize:14.3,fontWeight:900,color:"#E8A020",
    letterSpacing:"0.03em",padding:"0 10px 6px",marginBottom:3,textTransform:"uppercase",
    textShadow:"0 1px 4px rgba(0,0,0,0.7),0 -1px 0 rgba(255,200,50,0.2)"},
  groupLabelBar:{display:"inline-block",width:3,height:13,background:"#E8A020",borderRadius:2,
    flexShrink:0,boxShadow:"0 0 6px rgba(232,160,32,0.5)"},
  ni:{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",paddingRight:28,
    borderRadius:7,cursor:"pointer",marginBottom:2,border:"none",background:"transparent",
    width:"100%",textAlign:"left",transition:"all 0.12s ease"},
  sidebarFooter:{padding:"0 12px 12px",flexShrink:0},
  footerDivider:{height:1,background:"linear-gradient(90deg,transparent,rgba(245,158,11,0.4),transparent)",marginBottom:10},
  configBtn:{display:"flex",alignItems:"center",gap:10,padding:"9px 10px",cursor:"pointer",
    border:"none",background:"transparent",width:"100%",textAlign:"left",borderRadius:7,
    transition:"background 0.12s",marginBottom:4},
  policyBtn:{display:"block",width:"100%",textAlign:"center",fontSize:11,color:"#F59E0B",
    background:"transparent",border:"none",cursor:"pointer",padding:"4px 0",fontWeight:600,
    letterSpacing:"0.04em",opacity:0.85},
  copyright:{fontSize:10,color:"#FFFFFF",textAlign:"center",padding:"5px 0 0",lineHeight:1.5,fontWeight:500,opacity:0.75},

  /* ── MAIN ── */
  main:{flex:1,display:"flex",flexDirection:"column",minWidth:0,height:"100vh",position:"relative",zIndex:10,background:C.bg},

  /* topbar: surface escuro, borda dourada sutil */
  topbar:{
    height:52,
    borderBottom:`1px solid ${C.border}`,
    display:"flex",alignItems:"center",justifyContent:"space-between",
    padding:"0 22px",
    background:C.surface,
    flexShrink:0,
    boxShadow:"0 1px 0 rgba(232,160,32,0.08)",
  },
  wc:{display:"flex",gap:6,alignItems:"center",marginRight:14},
  wb:{width:12,height:12,borderRadius:"50%",border:"none",cursor:"pointer",flexShrink:0},
  /* +30% */
  ttitle:{fontSize:17,fontWeight:700,color:C.text,letterSpacing:"-0.01em"},
  tsub:{fontSize:13,color:C.textMid,marginTop:2,fontFamily:MONO},
  chip:{display:"flex",alignItems:"center",gap:6,padding:"5px 14px",
    background:"rgba(22,163,74,0.1)",borderRadius:20,border:"1px solid rgba(22,163,74,0.3)"},
  chipDot:{width:7,height:7,borderRadius:"50%",background:"#16A34A",flexShrink:0},
  /* +30% */
  chipText:{fontSize:13,color:"#4ADE80",fontWeight:600},

  body:{flex:1,overflow:"hidden",padding:"14px 22px",display:"flex",flexDirection:"column",gap:10},

  /* alerta com glass */
  alert:{
    background:"rgba(220,38,38,0.08)",
    borderRadius:10,padding:"10px 16px",
    display:"flex",alignItems:"center",justifyContent:"space-between",
    border:"1px solid rgba(220,38,38,0.25)",
    boxShadow:"0 2px 12px rgba(220,38,38,0.1)",
    flexShrink:0,
    backdropFilter:"blur(8px)",
  },
  alertBadge:{fontSize:11,fontWeight:700,padding:"3px 10px",background:"#DC2626",color:"#FFFFFF",
    borderRadius:5,letterSpacing:"0.06em",whiteSpace:"nowrap",flexShrink:0,fontFamily:MONO},
  /* +30% */
  alertText:{fontSize:15.6,color:"#FCA5A5",lineHeight:1.4,marginLeft:12,fontWeight:600},
  alertTime:{fontSize:13,color:"rgba(252,165,165,0.6)",whiteSpace:"nowrap",marginLeft:12,flexShrink:0,fontFamily:MONO},

  /* cabeçalho de seção com dourado */
  secHeader:{display:"flex",alignItems:"center",gap:8,marginBottom:8},
  secBar:{display:"inline-block",width:3,height:16,background:C.gold,borderRadius:2,flexShrink:0,boxShadow:`0 0 8px ${C.gold}88`},
  /* +30% */
  secLabel:{fontSize:11.7,fontWeight:800,color:C.gold,letterSpacing:"0.12em",textTransform:"uppercase",margin:0},

  /* barra de referências */
  refsBar:{display:"flex",alignItems:"center",gap:12,
    background:"rgba(255,255,255,0.03)",
    border:`1px solid ${C.border}`,
    borderRadius:10,padding:"9px 14px",
    flexShrink:0,overflow:"hidden",
    backdropFilter:"blur(8px)",
  },
  refsBarLeft:{display:"flex",alignItems:"center",gap:8,paddingRight:12,
    borderRight:`1px solid ${C.border}`,flexShrink:0},

  /* área de chat */
  chatArea:{flex:1,
    background:"rgba(255,255,255,0.02)",
    border:`1px solid ${C.border}`,
    borderRadius:10,
    position:"relative",overflow:"hidden",minHeight:60,
    backdropFilter:"blur(8px)",
  },
  emptyState:{position:"absolute",inset:0,display:"flex",flexDirection:"column",
    alignItems:"center",justifyContent:"center",pointerEvents:"none",userSelect:"none"},
  /* +30% */
  emptyText:{fontSize:15.6,color:"rgba(255,255,255,0.12)",fontWeight:600,marginTop:10,letterSpacing:"0.04em"},
  emptySubtext:{fontSize:13,color:"rgba(255,255,255,0.06)",fontFamily:MONO,marginTop:4},
  chatFadeMask:{position:"absolute",top:0,left:0,right:0,height:28,
    background:`linear-gradient(to bottom,${C.bg},transparent)`,zIndex:2,pointerEvents:"none"},
  chatMessages:{padding:"14px 16px 10px",display:"flex",flexDirection:"column",gap:10,height:"100%",overflowY:"auto"},

  /* barra de input */
  chatBar:{
    borderTop:`1px solid ${C.border}`,
    background:C.surface,
    padding:"10px 22px 12px",
    flexShrink:0,
  },
  chatBarFocused:{background:C.surfaceUp},
  chatRow:{display:"flex",gap:10,alignItems:"center"},
  chatIconWrap:{width:38,height:38,borderRadius:8,
    background:`${C.goldSoft}`,border:`1px solid rgba(232,160,32,0.25)`,
    display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},
  chatIn:{
    flex:1,
    background:"rgba(255,255,255,0.05)",
    border:`1px solid ${C.border}`,
    borderRadius:8,padding:"11px 16px",
    /* +30% */
    fontSize:16.9,
    color:C.text,outline:"none",fontFamily:SANS,
    transition:"border-color 0.2s,box-shadow 0.2s",
  },
  sendBtn:{width:40,height:40,background:`linear-gradient(135deg,#F59E0B,#B45309)`,
    border:"none",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",
    cursor:"pointer",flexShrink:0,boxShadow:"0 4px 14px rgba(180,83,9,0.4)",transition:"opacity 0.2s"},
  /* +30% */
  chatHint:{fontSize:13,color:C.textDim,textAlign:"center",marginTop:7,letterSpacing:"0.03em",fontWeight:500,fontFamily:MONO},
}

// ════════════════════════════════════════════════════════════════════════════
// MODAL — POLÍTICAS DE USO
// ════════════════════════════════════════════════════════════════════════════
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

  function saveEmpresa() {
    const updated = {...data,empresa:editEmpresa}
    setData(updated); localStorage.setItem("ab_policies",JSON.stringify(updated)); setEditing(false)
  }
  function renderTexto(txt) { return txt.replace("{empresa}",data.empresa) }

  return (
    <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(7,10,20,0.8)",
      display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)"}}
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
                    style={{fontSize:10,color:C.gold,background:C.goldSoft,border:`1px solid rgba(232,160,32,0.3)`,
                      borderRadius:5,padding:"2px 8px",cursor:"pointer",fontWeight:600}}>✏ Editar</button>
                </>
              )}
            </div>
            <div style={{display:"flex",gap:18,marginTop:10}}>
              {[["Versão",data.versao],["Vigência",data.data],["Status","ATIVO"]].map(([k,v])=>(
                <div key={k}>
                  <div style={{fontSize:9,fontWeight:700,color:C.textDim,letterSpacing:"0.1em",textTransform:"uppercase"}}>{k}</div>
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
                <span key={t} style={{fontSize:9,fontWeight:800,color:"#F1F5F9",background:"#F59E0B",
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
