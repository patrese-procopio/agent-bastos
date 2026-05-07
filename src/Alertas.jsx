import { useState, useEffect, useCallback } from "react"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const GLOBAL_CSS = `
  @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pulse-alert { 0%,100%{box-shadow:0 0 4px 2px rgba(220,38,38,0.4)} 50%{box-shadow:0 0 14px 5px rgba(220,38,38,0.0)} }
  @keyframes spin { to{transform:rotate(360deg)} }
  .alert-enter { animation: fadeIn 0.22s ease forwards; }
  .alert-pulse  { animation: pulse-alert 2s ease-in-out infinite; }
  .spin         { animation: spin 1s linear infinite; }
  .card-row:hover { background: #FFFBEB !important; cursor: pointer; }
  ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:4px}
`

// ── Mocks ────────────────────────────────────────────────────────────────────
const MOCK_REALTIME = [
  { id:"a1", tipo:"telegram", fonte:"@manausnoticias", link:"https://t.me/manausnoticias/1284",
    titulo:"Menção via #CVAM", resumo:'Movimentação no bairro Compensa. Fonte relata presença de elemento conhecido como "Carnaúba" coordenando distribuição de entorpecentes. #CVAM #Manaus',
    risco:"ALTO", timestamp:new Date(Date.now()-1000*60*18).toISOString(), lido:false,
    alvo_id:1, alvo_nome:"Gelson de Lima Carnaúba", alvo_vulgos:["Carnaúba"], termo_encontrado:"carnaúba", hashtag:"#CVAM",
    analise_ia:"Elemento identificado em área de distribuição ativa — risco operacional imediato. Verificação de campo recomendada nas próximas 2h." },
  { id:"b2", tipo:"noticia", fonte:"G1 Amazonas", link:"https://g1.globo.com/am/",
    titulo:"Polícia prende suspeito de tráfico no Jorge Teixeira",
    resumo:'"John Wick" foi detido com 3kg de entorpecentes durante operação da DENARC nesta manhã.',
    risco:"ALTO", timestamp:new Date(Date.now()-1000*60*45).toISOString(), lido:false,
    alvo_id:14, alvo_nome:"Leandro Costa de Oliveira", alvo_vulgos:["John Wick","Gavião","Leandrinho"], termo_encontrado:"john wick", analise_ia:"Confirmação de prisão — atualizar status do alvo. Verificar mandados pendentes." },
  { id:"c3", tipo:"telegram", fonte:"@policiaamazonas", link:"https://t.me/policiaamazonas/887",
    titulo:'Menção: "El Diablo" em @policiaamazonas',
    resumo:'Alerta de fronteira: indivíduo colombiano "El Diablo" teria cruzado pelo município de Tabatinga.',
    risco:"ALTO", timestamp:new Date(Date.now()-1000*60*90).toISOString(), lido:true,
    alvo_id:30, alvo_nome:"Nelson Gaviria Florez", alvo_vulgos:["El Diablo","Diablo"], termo_encontrado:"el diablo", analise_ia:null },
  { id:"d4", tipo:"noticia", fonte:"Acrítica AM", link:"https://www.acritica.com/",
    titulo:"Operação desmantela ponto de venda no Morro da Liberdade",
    resumo:'"Professor" foi preso com quatro pessoas durante operação no bairro.',
    risco:"MÉDIO", timestamp:new Date(Date.now()-1000*60*60*3).toISOString(), lido:false,
    alvo_id:6, alvo_nome:"Adalberto Salomão Guedes da Silva", alvo_vulgos:["Professor","Salomão"], termo_encontrado:"professor", analise_ia:null },
]

const MOCK_OSINT = [
  { id:"o1", tipo:"sherlock", fonte:"Sherlock — TikTok", link:"https://www.tiktok.com/@carnauba_am",
    titulo:"Perfil encontrado: @carnauba_am no TikTok",
    resumo:"Username 'carnauba' identificado em conta ativa. Bio: 'Compensa 🔴⚫'. Último post há 3 dias. Possível perfil operacional do alvo.",
    risco:"ALTO", timestamp:new Date(Date.now()-1000*60*60*2).toISOString(), lido:false,
    alvo_id:1, alvo_nome:"Gelson de Lima Carnaúba", alvo_vulgos:["Carnaúba"], termo_encontrado:"carnauba",
    plataforma:"TikTok", analise_ia:"Perfil ativo com simbologia de facção na bio. Recomenda-se monitoramento contínuo e extração de contatos/seguidores." },
  { id:"o2", tipo:"google_dork", fonte:"Google Dork — Pastebin", link:"https://pastebin.com/xYz123",
    titulo:'"Mão Branca" indexado no Pastebin',
    resumo:'Documento indexado contém o termo "Mão Branca" associado a coordenadas e horários de entrega. Possível lista operacional vazada.',
    risco:"ALTO", timestamp:new Date(Date.now()-1000*60*60*4).toISOString(), lido:false,
    alvo_id:23, alvo_nome:"Josias da Cruz Barroso", alvo_vulgos:["Mão Branca","MB"], termo_encontrado:"mão branca",
    dork:'site:pastebin.com "Mão Branca"', analise_ia:"Possível vazamento de dados operacionais. Prioridade máxima — acionar equipe de análise digital." },
  { id:"o3", tipo:"sherlock", fonte:"Sherlock — Instagram", link:"https://www.instagram.com/rdk_manaus",
    titulo:"Perfil encontrado: @rdk_manaus no Instagram",
    resumo:"Username 'RDK' identificado em perfil privado. Foto de capa com referências à zona norte de Manaus. 847 seguidores.",
    risco:"MÉDIO", timestamp:new Date(Date.now()-1000*60*60*6).toISOString(), lido:false,
    alvo_id:28, alvo_nome:"Gilson Mattos Rodrigues", alvo_vulgos:["RDK","Rei do Skunk"], termo_encontrado:"rdk",
    plataforma:"Instagram", analise_ia:null },
  { id:"o4", tipo:"google_dork", fonte:"Google Dork — Facebook", link:"https://facebook.com/john.wick.manaus",
    titulo:'"John Wick" encontrado via Google Dork no Facebook',
    resumo:'Perfil público indexado: "John Wick Manaus". Check-ins recentes no bairro Jorge Teixeira. Fotos com veículos de luxo.',
    risco:"MÉDIO", timestamp:new Date(Date.now()-1000*60*60*8).toISOString(), lido:true,
    alvo_id:14, alvo_nome:"Leandro Costa de Oliveira", alvo_vulgos:["John Wick","Gavião"], termo_encontrado:"john wick",
    dork:'site:facebook.com "John Wick" Manaus', analise_ia:null },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
const RISK = {
  ALTO:  { color:"#DC2626", bg:"#FEF2F2", border:"#FCA5A5", dot:"#EF4444" },
  MÉDIO: { color:"#D97706", bg:"#FFFBEB", border:"#FCD34D", dot:"#F59E0B" },
  BAIXO: { color:"#16A34A", bg:"#F0FDF4", border:"#86EFAC", dot:"#22C55E" },
}
const r = (level, key) => (RISK[level] || RISK.MÉDIO)[key]

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff < 60)   return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff/60)}min`
  if (diff < 86400) return `${Math.floor(diff/3600)}h`
  return `${Math.floor(diff/86400)}d`
}

// Configuração de cada tipo de card
const TIPO_CONFIG = {
  telegram:     { label:"✈ Telegram",    color:"#3730A3", bg:"#EEF2FF", border:"#C7D2FE", categoria:"realtime" },
  noticia:      { label:"📰 Notícia",    color:"#065F46", bg:"#ECFDF5", border:"#A7F3D0", categoria:"realtime" },
  youtube:      { label:"▶ YouTube",     color:"#DC2626", bg:"#FEF2F2", border:"#FCA5A5", categoria:"realtime" },
  sherlock:     { label:"🔍 Sherlock",   color:"#1D4ED8", bg:"#DBEAFE", border:"#93C5FD", categoria:"osint"    },
  google_dork:  { label:"🌐 Dork",       color:"#6D28D9", bg:"#EDE9FE", border:"#C4B5FD", categoria:"osint"    },
  maigret:      { label:"🕵 Maigret",    color:"#0F172A", bg:"#F1F5F9", border:"#CBD5E1", categoria:"osint"    },
}

const EmptyState = ({ texto }) => (
  <svg width="380" height="100" viewBox="0 0 380 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{opacity:0.13}}>
    <text x="190" y="38" textAnchor="middle" fontFamily={SANS} fontSize="28" fontWeight="800" letterSpacing="4" fill="#1E293B">ALERTAS</text>
    <line x1="50" y1="50" x2="330" y2="50" stroke="#1E293B" strokeWidth="0.6" strokeDasharray="4 6"/>
    <text x="190" y="76" textAnchor="middle" fontFamily={MONO} fontSize="10" fontWeight="400" letterSpacing="3" fill="#1E293B">{texto}</text>
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
        padding:"12px 20px",
        borderBottom:"1px solid #F8FAFC",
        background: isSelected ? "#FFFBEB" : alerta.lido ? "#FFFFFF" : isOSINT ? "#F8F8FF" : "#FAFBFF",
        borderLeft:`3px solid ${alerta.lido ? "transparent" : isOSINT ? "#1D4ED8" : r(alerta.risco,"dot")}`,
        transition:"all 0.15s",
      }}
    >
      <div style={{display:"grid", gridTemplateColumns:"10px 1fr auto", gap:"0 14px", alignItems:"start"}}>

        {/* Dot */}
        <div style={{paddingTop:5}}>
          <div style={{
            width:9, height:9, borderRadius:"50%",
            background: isOSINT ? "#1D4ED8" : r(alerta.risco,"dot"),
            boxShadow: !alerta.lido && alerta.risco === "ALTO" ? `0 0 6px ${r(alerta.risco,"dot")}` : "none",
          }}/>
        </div>

        {/* Conteúdo */}
        <div>
          {/* Badges linha 1 */}
          <div style={{display:"flex", alignItems:"center", gap:6, marginBottom:4, flexWrap:"wrap"}}>
            {/* Categoria */}
            <span style={{
              fontSize:9, fontWeight:800, fontFamily:MONO,
              color: isOSINT ? "#1D4ED8" : "#64748B",
              background: isOSINT ? "#DBEAFE" : "#F1F5F9",
              border:`1px solid ${isOSINT ? "#93C5FD" : "#E2E8F0"}`,
              padding:"1px 6px", borderRadius:3, letterSpacing:"0.08em",
            }}>{isOSINT ? "🔵 OSINT" : "🔴 TEMPO REAL"}</span>

            {/* Tipo */}
            <span style={{
              fontSize:9, fontWeight:700, fontFamily:MONO,
              color:tc.color, background:tc.bg, border:`1px solid ${tc.border}`,
              padding:"1px 6px", borderRadius:3,
            }}>{tc.label}</span>

            {/* Risco — só em tempo real */}
            {!isOSINT && (
              <span style={{
                fontSize:9, fontWeight:800, fontFamily:MONO,
                color:r(alerta.risco,"color"), background:r(alerta.risco,"bg"),
                border:`1px solid ${r(alerta.risco,"border")}`,
                padding:"1px 6px", borderRadius:3, letterSpacing:"0.06em",
              }}>{alerta.risco}</span>
            )}

            {/* Alvo */}
            <span style={{fontSize:10, fontWeight:700, color:"#B45309"}}>{alerta.alvo_nome}</span>
            {alerta.alvo_vulgos?.length > 0 && (
              <span style={{fontSize:9, color:"#94A3B8", fontFamily:MONO}}>
                ({alerta.alvo_vulgos.slice(0,2).join(", ")})
              </span>
            )}
          </div>

          {/* Título */}
          <div style={{fontSize:12, fontWeight:alerta.lido?400:600, color:"#0F172A", marginBottom:4, lineHeight:1.4}}>
            {alerta.titulo}
          </div>

          {/* Resumo */}
          <div style={{fontSize:11, color:"#64748B", lineHeight:1.5, marginBottom:6}}>
            {alerta.resumo?.length > 130 ? alerta.resumo.slice(0,130)+"..." : alerta.resumo}
          </div>

          {/* Meta linha */}
          <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
            <span style={{fontSize:10, color:"#94A3B8", fontFamily:MONO}}>{alerta.fonte}</span>
            <span style={{fontSize:9, color:"#CBD5E1"}}>·</span>
            <span style={{fontSize:10, color:"#94A3B8", fontFamily:MONO}}>{timeAgo(alerta.timestamp)} atrás</span>
            {alerta.termo_encontrado && (
              <>
                <span style={{fontSize:9, color:"#CBD5E1"}}>·</span>
                <span style={{fontSize:10, fontFamily:MONO, color:"#B45309", background:"#FEF3C7", padding:"1px 5px", borderRadius:3}}>
                  "{alerta.termo_encontrado}"
                </span>
              </>
            )}
            {alerta.plataforma && (
              <>
                <span style={{fontSize:9, color:"#CBD5E1"}}>·</span>
                <span style={{fontSize:10, fontFamily:MONO, color:"#1D4ED8", background:"#DBEAFE", padding:"1px 5px", borderRadius:3}}>
                  {alerta.plataforma}
                </span>
              </>
            )}
            {alerta.dork && (
              <>
                <span style={{fontSize:9, color:"#CBD5E1"}}>·</span>
                <span style={{fontSize:9, fontFamily:MONO, color:"#6D28D9", background:"#EDE9FE", padding:"1px 5px", borderRadius:3, maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", display:"inline-block"}}>
                  {alerta.dork}
                </span>
              </>
            )}
          </div>

          {/* Expansão */}
          {isSelected && (
            <div className="alert-enter" style={{marginTop:12, display:"flex", flexDirection:"column", gap:10}}>
              {alerta.analise_ia && (
                <div style={{padding:"10px 14px", background:"#FFFBEB", border:"1px solid #FCD34D", borderLeft:"3px solid #B45309", borderRadius:6}}>
                  <div style={{fontSize:9, fontWeight:700, color:"#92400E", letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:MONO, marginBottom:5}}>
                    ◈ Análise Tática — BASTOS-UNIT
                  </div>
                  <div style={{fontSize:12, color:"#78350F", lineHeight:1.6}}>{alerta.analise_ia}</div>
                </div>
              )}
              <div style={{display:"flex", gap:8}}>
                <a href={alerta.link} target="_blank" rel="noreferrer" style={{
                  padding:"6px 14px", background:"#0F172A", color:"#FFF",
                  borderRadius:6, fontSize:11, fontWeight:700, textDecoration:"none",
                  display:"flex", alignItems:"center", gap:6,
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  Abrir fonte
                </a>
                {!alerta.lido && (
                  <button onClick={e=>{e.stopPropagation();onLido(alerta.id)}} style={{
                    padding:"6px 14px", background:"transparent", color:"#16A34A",
                    border:"1px solid #86EFAC", borderRadius:6, fontSize:11,
                    fontWeight:600, cursor:"pointer",
                  }}>✓ Marcar lido</button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Tempo */}
        <div style={{fontSize:9, color:"#94A3B8", fontFamily:MONO, whiteSpace:"nowrap", paddingTop:2}}>
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
  const [filtroRisco, setFiltroRisco] = useState("TODOS")
  const [filtroTipo, setFiltroTipo]   = useState("TODOS")   // TODOS | realtime | osint
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
        fetch("http://127.0.0.1:8000/alertas").then(r=>r.json()),
        fetch("http://127.0.0.1:8000/alertas/osint").then(r=>r.json()),
      ])
      setRealtimeAlertas(rt)
      setOsintAlertas(os)
    } catch {
      setRealtimeAlertas(MOCK_REALTIME)
      setOsintAlertas(MOCK_OSINT)
    } finally {
      setLoading(false)
    }
  }

  async function varrerRealtime() {
    setVarrendo(true)
    try {
      await fetch("http://127.0.0.1:8000/alertas/varrer", { method:"POST", signal: AbortSignal.timeout(300000) })
      await carregarAlertas()
    } catch {
      await new Promise(r=>setTimeout(r,1500))
    } finally { setVarrendo(false) }
  }

  async function varrerOSINT() {
    setVarrendoOSINT(true)
    try {
      await fetch("http://127.0.0.1:8000/alertas/osint/varrer", { method:"POST", signal: AbortSignal.timeout(300000) })
      await carregarAlertas()
    } catch {
      await new Promise(r=>setTimeout(r,2000))
    } finally { setVarrendoOSINT(false) }
  }

  function marcarLido(id) {
    setRealtimeAlertas(prev => prev.map(a => a.id===id ? {...a,lido:true} : a))
    setOsintAlertas(prev    => prev.map(a => a.id===id ? {...a,lido:true} : a))
    try { fetch(`http://127.0.0.1:8000/alertas/${id}/lido`, {method:"PATCH"}) } catch{}
  }

  function marcarTodosLidos() {
    setRealtimeAlertas(prev => prev.map(a=>({...a,lido:true})))
    setOsintAlertas(prev    => prev.map(a=>({...a,lido:true})))
    try { fetch("http://127.0.0.1:8000/alertas/marcar-todos-lidos",{method:"PATCH"}) } catch{}
  }

  // ── Filtragem ──────────────────────────────────────────────────────────────
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

  // ════════════════════════════════════════════════════════════════════════
  return (
    <div style={S.page}>

      {/* ══ ASIDE ══════════════════════════════════════════════════════════ */}
      <aside style={S.aside}>
        <div style={S.asideHeader}>
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span style={{fontSize:10,fontWeight:800,color:"#334155",letterSpacing:"0.12em",textTransform:"uppercase"}}>Alertas</span>
          </div>
          {naoLidos > 0 && (
            <span style={{fontSize:9,color:"#DC2626",fontWeight:800,fontFamily:MONO,background:"#FEF2F2",padding:"2px 7px",borderRadius:4,border:"1px solid #FCA5A5"}}>
              {naoLidos} novos
            </span>
          )}
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"10px 12px 0",display:"flex",flexDirection:"column",gap:8}}>

          {/* Contadores */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {[
              {label:"Não lidos",  value:naoLidos,  color:"#DC2626",bg:"#FEF2F2",border:"#FCA5A5"},
              {label:"Risco Alto", value:altoRisco, color:"#DC2626",bg:"#FEF2F2",border:"#FCA5A5"},
              {label:"🔴 Tempo Real",value:totalRT,  color:"#D97706",bg:"#FFFBEB",border:"#FCD34D"},
              {label:"🔵 OSINT",    value:totalOSINT,color:"#1D4ED8",bg:"#DBEAFE",border:"#93C5FD"},
            ].map(({label,value,color,bg,border})=>(
              <div key={label} style={{padding:"8px 10px",background:bg,border:`1px solid ${border}`,borderRadius:7}}>
                <div style={{fontSize:18,fontWeight:800,color,fontFamily:MONO,lineHeight:1}}>{value}</div>
                <div style={{fontSize:9,color:"#64748B",marginTop:2,lineHeight:1.3}}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{height:1,background:"#E2E8F0"}}/>

          {/* Filtro categoria */}
          <div>
            <div style={S.filterLabel}>Categoria</div>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              {[
                {id:"TODOS",    label:"Todos os alertas"},
                {id:"realtime", label:"🔴 Tempo Real"},
                {id:"osint",    label:"🔵 OSINT"},
              ].map(f=>(
                <button key={f.id} onClick={()=>setFiltroTipo(f.id)} style={{
                  ...S.filterBtn,
                  background:filtroTipo===f.id?"#0F172A":"transparent",
                  color:filtroTipo===f.id?"#FFF":"#475569",
                  border:`1px solid ${filtroTipo===f.id?"#0F172A":"#E2E8F0"}`,
                }}>{f.label}</button>
              ))}
            </div>
          </div>

          <div style={{height:1,background:"#E2E8F0"}}/>

          {/* Filtro risco */}
          <div>
            <div style={S.filterLabel}>Risco</div>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              {["TODOS","ALTO","MÉDIO","BAIXO"].map(f=>(
                <button key={f} onClick={()=>setFiltroRisco(f)} style={{
                  ...S.filterBtn,
                  background:filtroRisco===f?"#0F172A":"transparent",
                  color:filtroRisco===f?"#FFF":"#475569",
                  border:`1px solid ${filtroRisco===f?"#0F172A":"#E2E8F0"}`,
                }}>
                  {f!=="TODOS" && <span style={{width:7,height:7,borderRadius:"50%",background:r(f,"dot"),flexShrink:0}}/>}
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div style={{height:1,background:"#E2E8F0"}}/>

          {/* Filtro leitura */}
          <div>
            <div style={S.filterLabel}>Leitura</div>
            <div style={{display:"flex",gap:5}}>
              {[["TODOS","Todos"],["NAO_LIDOS","Não lidos"]].map(([id,label])=>(
                <button key={id} onClick={()=>setFiltroLido(id)} style={{
                  flex:1,padding:"5px 0",borderRadius:5,fontSize:10,fontWeight:600,
                  border:`1px solid ${filtroLido===id?"#0F172A":"#E2E8F0"}`,
                  background:filtroLido===id?"#0F172A":"transparent",
                  color:filtroLido===id?"#FFF":"#475569",
                  cursor:"pointer",fontFamily:MONO,
                }}>{label}</button>
              ))}
            </div>
          </div>

          <div style={{height:1,background:"#E2E8F0"}}/>

          {/* Ações */}
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            <button onClick={varrerRealtime} disabled={varrendo} style={{...S.actionBtn,"#E2E8F0":true}}>
              {varrendo
                ? <><svg className="spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Varrendo...</>
                : <><span style={{fontSize:10}}>🔴</span>Varrer Tempo Real</>}
            </button>
            <button onClick={varrerOSINT} disabled={varrendoOSINT} style={{...S.actionBtn,borderColor:"#93C5FD",color:"#1D4ED8"}}>
              {varrendoOSINT
                ? <><svg className="spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Sherlock rodando...</>
                : <><span style={{fontSize:10}}>🔵</span>Varrer OSINT</>}
            </button>
            {naoLidos > 0 && (
              <button onClick={marcarTodosLidos} style={{...S.actionBtn,color:"#16A34A",borderColor:"#86EFAC"}}>
                ✓ Marcar todos lidos
              </button>
            )}
          </div>

        </div>

        {/* Footer */}
        <div style={{padding:"10px 14px",borderTop:"1px solid #E2E8F0",background:"#F1F5F9",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}>
            <div className={altoRisco>0?"alert-pulse":""} style={{
              width:5,height:5,borderRadius:"50%",
              background:altoRisco>0?"#DC2626":"#16A34A",
            }}/>
            <span style={{fontSize:9,color:"#475569",fontFamily:MONO}}>Monitor OSINT · a cada 2h</span>
          </div>
          <span style={{fontSize:9,color:"#94A3B8",fontFamily:MONO}}>
            Telegram · News · Sherlock · Google Dork
          </span>
        </div>
      </aside>

      {/* ══ ÁREA PRINCIPAL ════════════════════════════════════════════════ */}
      <div style={S.main}>

        {/* Header */}
        <div style={S.mainHeader}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div className={altoRisco>0?"alert-pulse":""} style={{
              width:8,height:8,borderRadius:"50%",flexShrink:0,
              background:altoRisco>0?"#DC2626":loading?"#94A3B8":"#16A34A",
            }}/>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:"#0F172A"}}>Central de Alertas OSINT</div>
              <div style={{fontSize:9,color:"#64748B",fontFamily:MONO,marginTop:1}}>
                {loading ? "Carregando..." : `${filtrados.length} alertas · ${naoLidos} não lidos · 🔴 ${totalRT} tempo real · 🔵 ${totalOSINT} OSINT`}
              </div>
            </div>
          </div>
          <div style={{position:"relative"}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"
              style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)"}}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input value={busca} onChange={e=>setBusca(e.target.value)}
              placeholder="Buscar alvo, vulgo, termo..."
              style={{background:"#F8FAFC",border:"1px solid #CBD5E1",borderRadius:6,padding:"6px 10px 6px 28px",fontSize:11,color:"#0F172A",outline:"none",fontFamily:MONO,width:220}}
            />
          </div>
        </div>

        {/* Corpo */}
        <div style={S.mainBody}>
          {loading && (
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",flex:1,gap:10}}>
              <svg className="spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              <span style={{fontSize:12,color:"#64748B",fontFamily:MONO}}>Carregando alertas...</span>
            </div>
          )}

          {!loading && filtrados.length === 0 && (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,gap:12,padding:40,height:"100%"}}>
              <EmptyState texto="OSINT Monitor · Telegram · Google News" />
              <p style={{fontSize:11,color:"#CBD5E1",fontFamily:MONO,margin:0}}>
                {busca ? "Nenhum alerta encontrado para essa busca" : "Nenhum alerta registrado ainda"}
              </p>
            </div>
          )}

          {!loading && filtrados.length > 0 && (
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
  page:{display:"flex",flex:1,minWidth:0,height:"100%",overflow:"hidden"},
  aside:{width:268,flexShrink:0,background:"#F8FAFC",borderRight:"1px solid #E2E8F0",display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"},
  asideHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 14px 10px",borderBottom:"1px solid #E2E8F0",flexShrink:0},
  main:{display:"flex",flexDirection:"column",flex:1,minWidth:0,height:"100%",overflow:"hidden",background:"#FFFFFF"},
  mainHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 18px",borderBottom:"1px solid #E2E8F0",background:"#FFFFFF",flexShrink:0,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"},
  mainBody:{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"},
  filterLabel:{fontSize:8,fontWeight:700,color:"#94A3B8",letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"'JetBrains Mono','Roboto Mono','Courier New',monospace",marginBottom:5},
  filterBtn:{width:"100%",padding:"5px 10px",borderRadius:5,fontSize:10,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontFamily:"'JetBrains Mono','Roboto Mono','Courier New',monospace",transition:"all 0.12s",textAlign:"left"},
  actionBtn:{width:"100%",padding:"7px",borderRadius:6,border:"1px solid #E2E8F0",background:"transparent",fontSize:10,color:"#64748B",cursor:"pointer",fontFamily:"'JetBrains Mono','Roboto Mono','Courier New',monospace",display:"flex",alignItems:"center",justifyContent:"center",gap:6},
}
