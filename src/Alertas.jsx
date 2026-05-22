import { useState, useEffect, useCallback } from "react"
import api from "./api"
const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const GLOBAL_CSS = `
  @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pulse-alert { 0%,100%{box-shadow:0 0 4px 2px rgba(239,68,68,0.4)} 50%{box-shadow:0 0 14px 5px rgba(239,68,68,0.0)} }
  @keyframes spin { to{transform:rotate(360deg)} }
  .alert-enter { animation: fadeIn 0.22s ease forwards; }
  .alert-pulse  { animation: pulse-alert 2s ease-in-out infinite; }
  .spin         { animation: spin 1s linear infinite; }
  .card-row:hover { background: rgba(232,160,32,0.06) !important; cursor: pointer; }
  ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:4px}
`

// ── Helpers ───────────────────────────────────────────────────────────────────
const RISK = {
  ALTO:  { color:"#F87171", bg:"rgba(239,68,68,0.12)",  border:"rgba(239,68,68,0.3)",  dot:"#EF4444" },
  MÉDIO: { color:"#FBBF24", bg:"rgba(251,191,36,0.12)", border:"rgba(251,191,36,0.3)", dot:"#F59E0B" },
  BAIXO: { color:"#4ADE80", bg:"rgba(74,222,128,0.12)", border:"rgba(74,222,128,0.3)", dot:"#22C55E" },
}
const r = (level, key) => (RISK[level] || RISK.MÉDIO)[key]

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff < 60)   return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff/60)}min`
  if (diff < 86400) return `${Math.floor(diff/3600)}h`
  return `${Math.floor(diff/86400)}d`
}

const TIPO_CONFIG = {
  telegram:     { label:"✈ Telegram",    color:"#818CF8", bg:"rgba(129,140,248,0.12)", border:"rgba(129,140,248,0.3)", categoria:"realtime" },
  noticia:      { label:"📰 Notícia",    color:"#34D399", bg:"rgba(52,211,153,0.12)",  border:"rgba(52,211,153,0.3)",  categoria:"realtime" },
  youtube:      { label:"▶ YouTube",     color:"#F87171", bg:"rgba(239,68,68,0.12)",   border:"rgba(239,68,68,0.3)",   categoria:"realtime" },
  sherlock:     { label:"🔍 Sherlock",   color:"#60A5FA", bg:"rgba(96,165,250,0.12)",  border:"rgba(96,165,250,0.3)",  categoria:"osint"    },
  google_dork:  { label:"🌐 Dork",       color:"#A78BFA", bg:"rgba(167,139,250,0.12)", border:"rgba(167,139,250,0.3)", categoria:"osint"    },
  maigret:      { label:"🕵 Maigret",    color:"#94A3B8", bg:"rgba(148,163,184,0.12)", border:"rgba(148,163,184,0.3)", categoria:"osint"    },
}

const EmptyState = ({ texto }) => (
  <svg width="380" height="100" viewBox="0 0 380 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{opacity:0.08}}>
    <text x="190" y="38" textAnchor="middle" fontFamily={SANS} fontSize="28" fontWeight="800" letterSpacing="4" fill="#FFFFFF">ALERTAS</text>
    <line x1="50" y1="50" x2="330" y2="50" stroke="#FFFFFF" strokeWidth="0.6" strokeDasharray="4 6"/>
    <text x="190" y="76" textAnchor="middle" fontFamily={MONO} fontSize="10" fontWeight="400" letterSpacing="3" fill="#FFFFFF">{texto}</text>
  </svg>
)

// ── Card de Alerta ────────────────────────────────────────────────────────────
function AlertCard({ alerta, isSelected, onClick, onLido }) {
  const tc = TIPO_CONFIG[alerta.tipo] || TIPO_CONFIG.noticia
  const isOSINT = tc.categoria === "osint"

  return (
    <div
      className="card-row alert-enter"
      onClick={onClick}
      style={{
        padding:"14px 20px",
        borderBottom:"1px solid rgba(255,255,255,0.05)",
        background: isSelected ? "rgba(232,160,32,0.08)" : "transparent",
        borderLeft:`3px solid ${alerta.lido ? "transparent" : isOSINT ? "#60A5FA" : r(alerta.risco,"dot")}`,
        transition:"all 0.15s",
      }}
    >
      <div style={{display:"grid", gridTemplateColumns:"10px 1fr auto", gap:"0 14px", alignItems:"start"}}>

        {/* Dot */}
        <div style={{paddingTop:5}}>
          <div style={{
            width:9, height:9, borderRadius:"50%",
            background: isOSINT ? "#60A5FA" : r(alerta.risco,"dot"),
            boxShadow: !alerta.lido && alerta.risco === "ALTO" ? `0 0 6px ${r(alerta.risco,"dot")}` : "none",
          }}/>
        </div>

        {/* Conteúdo */}
        <div>
          <div style={{display:"flex", alignItems:"center", gap:6, marginBottom:5, flexWrap:"wrap"}}>
            <span style={{
              fontSize:10, fontWeight:800, fontFamily:MONO,
              color: isOSINT ? "#60A5FA" : "#94A3B8",
              background: isOSINT ? "rgba(96,165,250,0.12)" : "rgba(255,255,255,0.06)",
              border:`1px solid ${isOSINT ? "rgba(96,165,250,0.3)" : "rgba(255,255,255,0.1)"}`,
              padding:"2px 7px", borderRadius:4, letterSpacing:"0.08em",
            }}>{isOSINT ? "🔵 OSINT" : "🔴 TEMPO REAL"}</span>

            <span style={{
              fontSize:10, fontWeight:700, fontFamily:MONO,
              color:tc.color, background:tc.bg, border:`1px solid ${tc.border}`,
              padding:"2px 7px", borderRadius:4,
            }}>{tc.label}</span>

            {!isOSINT && (
              <span style={{
                fontSize:10, fontWeight:800, fontFamily:MONO,
                color:r(alerta.risco,"color"), background:r(alerta.risco,"bg"),
                border:`1px solid ${r(alerta.risco,"border")}`,
                padding:"2px 7px", borderRadius:4, letterSpacing:"0.06em",
              }}>{alerta.risco}</span>
            )}

            <span style={{fontSize:13, fontWeight:700, color:"#E8A020"}}>{alerta.alvo_nome}</span>
            {alerta.alvo_vulgos?.length > 0 && (
              <span style={{fontSize:11, color:"#94A3B8", fontFamily:MONO}}>
                ({alerta.alvo_vulgos.slice(0,2).join(", ")})
              </span>
            )}
          </div>

          {/* Título */}
          <div style={{fontSize:15.6, fontWeight:alerta.lido?400:600, color:"#F1F5F9", marginBottom:5, lineHeight:1.4}}>
            {alerta.titulo}
          </div>

          {/* Resumo */}
          <div style={{fontSize:13, color:"#94A3B8", lineHeight:1.55, marginBottom:7}}>
            {alerta.resumo?.length > 130 ? alerta.resumo.slice(0,130)+"..." : alerta.resumo}
          </div>

          {/* Meta */}
          <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
            <span style={{fontSize:11, color:"#94A3B8", fontFamily:MONO}}>{alerta.fonte}</span>
            <span style={{fontSize:10, color:"rgba(255,255,255,0.2)"}}>·</span>
            <span style={{fontSize:11, color:"#94A3B8", fontFamily:MONO}}>{timeAgo(alerta.timestamp)} atrás</span>
            {alerta.termo_encontrado && (
              <>
                <span style={{fontSize:10, color:"rgba(255,255,255,0.2)"}}>·</span>
                <span style={{fontSize:11, fontFamily:MONO, color:"#E8A020", background:"rgba(232,160,32,0.12)", padding:"1px 6px", borderRadius:3}}>
                  "{alerta.termo_encontrado}"
                </span>
              </>
            )}
            {alerta.plataforma && (
              <>
                <span style={{fontSize:10, color:"rgba(255,255,255,0.2)"}}>·</span>
                <span style={{fontSize:11, fontFamily:MONO, color:"#60A5FA", background:"rgba(96,165,250,0.12)", padding:"1px 6px", borderRadius:3}}>
                  {alerta.plataforma}
                </span>
              </>
            )}
            {alerta.dork && (
              <>
                <span style={{fontSize:10, color:"rgba(255,255,255,0.2)"}}>·</span>
                <span style={{fontSize:10, fontFamily:MONO, color:"#A78BFA", background:"rgba(167,139,250,0.12)", padding:"1px 6px", borderRadius:3, maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", display:"inline-block"}}>
                  {alerta.dork}
                </span>
              </>
            )}
          </div>

          {/* Expansão */}
          {isSelected && (
            <div className="alert-enter" style={{marginTop:14, display:"flex", flexDirection:"column", gap:10}}>
              {alerta.analise_ia && (
                <div style={{padding:"12px 16px", background:"rgba(232,160,32,0.08)", border:"1px solid rgba(232,160,32,0.25)", borderLeft:"3px solid #E8A020", borderRadius:8}}>
                  <div style={{fontSize:10, fontWeight:700, color:"#E8A020", letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:MONO, marginBottom:6}}>
                    ◈ Análise Tática — BASTOS-UNIT
                  </div>
                  <div style={{fontSize:14.3, color:"#F1F5F9", lineHeight:1.65}}>{alerta.analise_ia}</div>
                </div>
              )}
              <div style={{display:"flex", gap:8}}>
                <a href={alerta.link} target="_blank" rel="noreferrer" style={{
                  padding:"8px 16px", background:"#E8A020", color:"#F1F5F9",
                  borderRadius:7, fontSize:12, fontWeight:700, textDecoration:"none",
                  display:"flex", alignItems:"center", gap:6,
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  Abrir fonte
                </a>
                {!alerta.lido && (
                  <button onClick={e=>{e.stopPropagation();onLido(alerta.id)}} style={{
                    padding:"8px 16px", background:"rgba(74,222,128,0.1)", color:"#4ADE80",
                    border:"1px solid rgba(74,222,128,0.3)", borderRadius:7, fontSize:12,
                    fontWeight:600, cursor:"pointer",
                  }}>✓ Marcar lido</button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Tempo */}
        <div style={{fontSize:11, color:"#94A3B8", fontFamily:MONO, whiteSpace:"nowrap", paddingTop:2}}>
          {timeAgo(alerta.timestamp)}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
export default function Alertas({ onNavigate }) {
  const [realtimeAlertas, setRealtimeAlertas] = useState([])
  const [osintAlertas, setOsintAlertas]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [erro, setErro]             = useState(false)
  const [filtroRisco, setFiltroRisco] = useState("TODOS")
  const [filtroTipo, setFiltroTipo]   = useState("TODOS")
  const [filtroLido, setFiltroLido]   = useState("TODOS")
  const [busca, setBusca]             = useState("")
  const [selecionado, setSelecionado] = useState(null)
  const [varrendo, setVarrendo]       = useState(false)
  const [varrendoOSINT, setVarrendoOSINT] = useState(false)

  useEffect(() => {
    const style = document.createElement("style")
    style.textContent = GLOBAL_CSS
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  useEffect(() => { carregarAlertas() }, [])

  async function carregarAlertas() {
    setLoading(true)
    try {
      const [rt, os] = await Promise.all([
        api.get("/alertas").then(r=>r?.json()),
        api.get("/alertas/osint").then(r=>r?.json()),
      ])
      setRealtimeAlertas(Array.isArray(rt) ? rt : [])
      setOsintAlertas(Array.isArray(os) ? os : [])
      setErro(false)
    } catch {
      setRealtimeAlertas([])
      setOsintAlertas([])
      setErro(true)
    } finally { setLoading(false) }
  }

  async function varrerRealtime() {
    setVarrendo(true)
    try {
      await api.post("/alertas/varrer")
      await carregarAlertas()
    } catch { await new Promise(r=>setTimeout(r,1500)) }
    finally { setVarrendo(false) }
  }

  async function varrerOSINT() {
    setVarrendoOSINT(true)
    try {
      await api.post("/alertas/osint/varrer")
      await carregarAlertas()
    } catch { await new Promise(r=>setTimeout(r,2000)) }
    finally { setVarrendoOSINT(false) }
  }

  function marcarLido(id) {
    setRealtimeAlertas(prev => prev.map(a => a.id===id ? {...a,lido:true} : a))
    setOsintAlertas(prev    => prev.map(a => a.id===id ? {...a,lido:true} : a))
    try { api.patch(`/alertas/${id}/lido`) } catch{}
  }

  function marcarTodosLidos() {
    setRealtimeAlertas(prev => prev.map(a=>({...a,lido:true})))
    setOsintAlertas(prev    => prev.map(a=>({...a,lido:true})))
    try { api.patch("/alertas/marcar-todos-lidos") } catch{}
  }

  const todos = [...realtimeAlertas, ...osintAlertas].sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp))
  const filtrados = todos.filter(a => {
    const tc = TIPO_CONFIG[a.tipo] || TIPO_CONFIG.noticia
    if (filtroRisco !== "TODOS" && a.risco !== filtroRisco) return false
    if (filtroTipo === "realtime" && tc.categoria !== "realtime") return false
    if (filtroTipo === "osint"    && tc.categoria !== "osint")    return false
    if (filtroLido === "NAO_LIDOS" && a.lido) return false
    if (busca) {
      const b = busca.toLowerCase()
      return a.alvo_nome?.toLowerCase().includes(b) ||
        a.termo_encontrado?.toLowerCase().includes(b) ||
        a.titulo?.toLowerCase().includes(b) ||
        a.alvo_vulgos?.some(v=>v.toLowerCase().includes(b))
    }
    return true
  })

  const naoLidos   = todos.filter(a=>!a.lido).length
  const altoRisco  = todos.filter(a=>a.risco==="ALTO"&&!a.lido).length
  const totalOSINT = osintAlertas.length
  const totalRT    = realtimeAlertas.length

  return (
    <div style={S.page}>

      {/* ══ ASIDE ══════════════════════════════════════════════════════════ */}
      <aside style={S.aside}>
        <div style={S.asideHeader}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span style={{fontSize:14.3,fontWeight:800,color:"#E8A020",letterSpacing:"0.1em",textTransform:"uppercase"}}>Alertas</span>
          </div>
          {naoLidos > 0 && (
            <span style={{fontSize:10,color:"#F87171",fontWeight:800,fontFamily:MONO,background:"rgba(239,68,68,0.12)",padding:"2px 8px",borderRadius:4,border:"1px solid rgba(239,68,68,0.3)"}}>
              {naoLidos} novos
            </span>
          )}
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"12px 12px 0",display:"flex",flexDirection:"column",gap:10}}>

          {/* Contadores */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
            {[
              {label:"Não lidos",  value:naoLidos,  color:"#F87171", bg:"rgba(239,68,68,0.12)",  border:"rgba(239,68,68,0.3)"},
              {label:"Risco Alto", value:altoRisco, color:"#F87171", bg:"rgba(239,68,68,0.12)",  border:"rgba(239,68,68,0.3)"},
              {label:"🔴 Tempo Real",value:totalRT, color:"#FBBF24", bg:"rgba(251,191,36,0.12)", border:"rgba(251,191,36,0.3)"},
              {label:"🔵 OSINT",    value:totalOSINT,color:"#60A5FA",bg:"rgba(96,165,250,0.12)", border:"rgba(96,165,250,0.3)"},
            ].map(({label,value,color,bg,border})=>(
              <div key={label} style={{padding:"10px 12px",background:bg,border:`1px solid ${border}`,borderRadius:8}}>
                <div style={{fontSize:20,fontWeight:800,color,fontFamily:MONO,lineHeight:1}}>{value}</div>
                <div style={{fontSize:11,color:"#94A3B8",marginTop:3,lineHeight:1.3}}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{height:1,background:"rgba(255,255,255,0.07)"}}/>

          {/* Filtro categoria */}
          <div>
            <div style={S.filterLabel}>Categoria</div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {[
                {id:"TODOS",    label:"Todos os alertas"},
                {id:"realtime", label:"🔴 Tempo Real"},
                {id:"osint",    label:"🔵 OSINT"},
              ].map(f=>(
                <button key={f.id} onClick={()=>setFiltroTipo(f.id)} style={{
                  ...S.filterBtn,
                  background:filtroTipo===f.id?"rgba(232,160,32,0.15)":"transparent",
                  color:filtroTipo===f.id?"#E8A020":"#94A3B8",
                  border:`1px solid ${filtroTipo===f.id?"rgba(232,160,32,0.4)":"rgba(255,255,255,0.07)"}`,
                  fontWeight:filtroTipo===f.id?700:500,
                }}>{f.label}</button>
              ))}
            </div>
          </div>

          <div style={{height:1,background:"rgba(255,255,255,0.07)"}}/>

          {/* Filtro risco */}
          <div>
            <div style={S.filterLabel}>Risco</div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {["TODOS","ALTO","MÉDIO","BAIXO"].map(f=>(
                <button key={f} onClick={()=>setFiltroRisco(f)} style={{
                  ...S.filterBtn,
                  background:filtroRisco===f?"rgba(232,160,32,0.15)":"transparent",
                  color:filtroRisco===f?"#E8A020":"#94A3B8",
                  border:`1px solid ${filtroRisco===f?"rgba(232,160,32,0.4)":"rgba(255,255,255,0.07)"}`,
                  fontWeight:filtroRisco===f?700:500,
                }}>
                  {f!=="TODOS" && <span style={{width:7,height:7,borderRadius:"50%",background:r(f,"dot"),flexShrink:0}}/>}
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div style={{height:1,background:"rgba(255,255,255,0.07)"}}/>

          {/* Filtro leitura */}
          <div>
            <div style={S.filterLabel}>Leitura</div>
            <div style={{display:"flex",gap:6}}>
              {[["TODOS","Todos"],["NAO_LIDOS","Não lidos"]].map(([id,label])=>(
                <button key={id} onClick={()=>setFiltroLido(id)} style={{
                  flex:1,padding:"7px 0",borderRadius:6,fontSize:12,fontWeight:600,
                  border:`1px solid ${filtroLido===id?"rgba(232,160,32,0.4)":"rgba(255,255,255,0.07)"}`,
                  background:filtroLido===id?"rgba(232,160,32,0.15)":"transparent",
                  color:filtroLido===id?"#E8A020":"#94A3B8",
                  cursor:"pointer",fontFamily:MONO,
                }}>{label}</button>
              ))}
            </div>
          </div>

          <div style={{height:1,background:"rgba(255,255,255,0.07)"}}/>

          {/* Ações */}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <button onClick={varrerRealtime} disabled={varrendo} style={S.actionBtn}>
              {varrendo
                ? <><svg className="spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Varrendo...</>
                : <><span>🔴</span>Varrer Tempo Real</>}
            </button>
            <button onClick={varrerOSINT} disabled={varrendoOSINT} style={{...S.actionBtn,color:"#60A5FA",border:"1px solid rgba(96,165,250,0.3)"}}>
              {varrendoOSINT
                ? <><svg className="spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Sherlock rodando...</>
                : <><span>🔵</span>Varrer OSINT</>}
            </button>
            {naoLidos > 0 && (
              <button onClick={marcarTodosLidos} style={{...S.actionBtn,color:"#4ADE80",border:"1px solid rgba(74,222,128,0.3)"}}>
                ✓ Marcar todos lidos
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{padding:"12px 14px",borderTop:"1px solid rgba(255,255,255,0.07)",background:"rgba(255,255,255,0.02)",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
            <div className={altoRisco>0?"alert-pulse":""} style={{width:6,height:6,borderRadius:"50%",background:altoRisco>0?"#EF4444":"#4ADE80"}}/>
            <span style={{fontSize:11,color:"#94A3B8",fontFamily:MONO}}>Monitor OSINT · a cada 8h</span>
          </div>
          <span style={{fontSize:11,color:"rgba(255,255,255,0.3)",fontFamily:MONO}}>
            Telegram · News · Sherlock · Google Dork
          </span>
        </div>
      </aside>

      {/* ══ ÁREA PRINCIPAL ════════════════════════════════════════════════ */}
      <div style={S.main}>
        <div style={S.mainHeader}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div className={altoRisco>0?"alert-pulse":""} style={{width:9,height:9,borderRadius:"50%",flexShrink:0,
              background:altoRisco>0?"#EF4444":loading?"#94A3B8":"#4ADE80"}}/>
            <div>
              <div style={{fontSize:16.9,fontWeight:700,color:"#F1F5F9"}}>Central de Alertas OSINT</div>
              <div style={{fontSize:11.7,color:"#94A3B8",fontFamily:MONO,marginTop:2}}>
                {loading ? "Carregando..." : `${filtrados.length} alertas · ${naoLidos} não lidos · 🔴 ${totalRT} · 🔵 ${totalOSINT} OSINT`}
              </div>
            </div>
          </div>
          <div style={{position:"relative"}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"
              style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)"}}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input value={busca} onChange={e=>setBusca(e.target.value)}
              placeholder="Buscar alvo, vulgo, termo..."
              style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:7,
                padding:"8px 12px 8px 32px",fontSize:13,color:"#F1F5F9",outline:"none",fontFamily:MONO,width:240,caretColor:"#E8A020"}}
            />
          </div>
        </div>

        <div style={S.mainBody}>
          {loading && (
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",flex:1,gap:10}}>
              <svg className="spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              <span style={{fontSize:15.6,color:"#94A3B8",fontFamily:MONO}}>Carregando alertas...</span>
            </div>
          )}
          {!loading && erro && (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,gap:14,padding:40,height:"100%"}}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:15,fontWeight:700,color:"#F1F5F9",marginBottom:5}}>Backend indisponível</div>
                <p style={{fontSize:13,color:"#94A3B8",fontFamily:MONO,margin:0}}>Não foi possível carregar os alertas. Verifique se o servidor está online.</p>
              </div>
              <button onClick={carregarAlertas} style={{...S.actionBtn,width:"auto",padding:"9px 20px",color:"#E8A020",border:"1px solid rgba(232,160,32,0.4)"}}>
                Tentar novamente
              </button>
            </div>
          )}
          {!loading && !erro && filtrados.length === 0 && (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,gap:12,padding:40,height:"100%"}}>
              <EmptyState texto="OSINT Monitor · Telegram · Google News" />
              <p style={{fontSize:13,color:"rgba(255,255,255,0.2)",fontFamily:MONO,margin:0}}>
                {busca ? "Nenhum alerta encontrado para essa busca" : "Nenhum alerta registrado ainda"}
              </p>
            </div>
          )}
          {!loading && !erro && filtrados.length > 0 && (
            <div style={{display:"flex",flexDirection:"column"}}>
              {filtrados.map(alerta => (
                <AlertCard
                  key={alerta.id}
                  alerta={alerta}
                  isSelected={selecionado?.id===alerta.id}
                  onClick={()=>setSelecionado(selecionado?.id===alerta.id?null:alerta)}
                  onLido={marcarLido}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const S = {
  page:{display:"flex",flex:1,minWidth:0,height:"100%",overflow:"hidden",background:"#0B1120"},
  aside:{width:268,flexShrink:0,background:"#111827",borderRight:"1px solid rgba(255,255,255,0.07)",display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"},
  asideHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 16px 12px",borderBottom:"1px solid rgba(255,255,255,0.07)",flexShrink:0},
  main:{display:"flex",flexDirection:"column",flex:1,minWidth:0,height:"100%",overflow:"hidden",background:"#0B1120"},
  mainHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 22px",borderBottom:"1px solid rgba(255,255,255,0.07)",background:"#111827",flexShrink:0},
  mainBody:{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"},
  filterLabel:{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.32)",letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:MONO,marginBottom:6},
  filterBtn:{width:"100%",padding:"7px 10px",borderRadius:6,fontSize:13,fontWeight:500,cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontFamily:MONO,transition:"all 0.12s",textAlign:"left"},
  actionBtn:{width:"100%",padding:"9px",borderRadius:7,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",fontSize:13,color:"#94A3B8",cursor:"pointer",fontFamily:MONO,display:"flex",alignItems:"center",justifyContent:"center",gap:6},
}
