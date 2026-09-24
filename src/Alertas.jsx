import { useState, useEffect, useCallback, useRef } from "react"
import { createPortal } from "react-dom"
import useAutoRefresh, { formatarHaTempo } from "./useAutoRefresh"
import api from "./api"
import { toast } from "./Toast"
import { confirm } from "./ConfirmModal"
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
  ::-webkit-scrollbar{width:6px;height:6px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.18);border-radius:5px} ::-webkit-scrollbar-thumb:hover{background:rgba(232,160,32,0.45)}
`

// ── Helpers ───────────────────────────────────────────────────────────────────
const RISK = {
  ALTO:  { color:"#F87171", bg:"rgba(239,68,68,0.12)",  border:"rgba(239,68,68,0.3)",  dot:"#EF4444" },
  MÉDIO: { color:"#FBBF24", bg:"rgba(251,191,36,0.12)", border:"rgba(251,191,36,0.3)", dot:"#F59E0B" },
  BAIXO: { color:"#4ADE80", bg:"rgba(74,222,128,0.12)", border:"rgba(74,222,128,0.3)", dot:"#22C55E" },
}
const r = (level, key) => (RISK[level] || RISK.MÉDIO)[key]

function rotuloAlvo(a) {
  if (!a) return ""
  return a.tipo === "termo" ? `# ${a.termo}` : a.nome
}

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff < 60)   return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff/60)}min`
  if (diff < 86400) return `${Math.floor(diff/3600)}h`
  return `${Math.floor(diff/86400)}d`
}

const TIPO_CONFIG = {
  telegram:     { label:"✈ Telegram",    color:"#818CF8", bg:"rgba(129,140,248,0.12)", border:"rgba(129,140,248,0.3)", categoria:"osint"    },
  noticia:      { label:"📰 Notícia",    color:"#34D399", bg:"rgba(52,211,153,0.12)",  border:"rgba(52,211,153,0.3)",  categoria:"realtime" },
  youtube:      { label:"▶ YouTube",     color:"#F87171", bg:"rgba(239,68,68,0.12)",   border:"rgba(239,68,68,0.3)",   categoria:"realtime" },
  sherlock:     { label:"🔍 Sherlock",   color:"#60A5FA", bg:"rgba(96,165,250,0.12)",  border:"rgba(96,165,250,0.3)",  categoria:"osint"    },
  google_dork:  { label:"🌐 Dork",       color:"#A78BFA", bg:"rgba(167,139,250,0.12)", border:"rgba(167,139,250,0.3)", categoria:"osint"    },
  gdelt:        { label:"🌐 GDELT",      color:"#A78BFA", bg:"rgba(167,139,250,0.12)", border:"rgba(167,139,250,0.3)", categoria:"osint"    },
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
              fontSize: 12, fontWeight:800, fontFamily:MONO,
              color: isOSINT ? "#60A5FA" : "#94A3B8",
              background: isOSINT ? "rgba(96,165,250,0.12)" : "rgba(255,255,255,0.06)",
              border:`1px solid ${isOSINT ? "rgba(96,165,250,0.3)" : "rgba(255,255,255,0.1)"}`,
              padding:"2px 7px", borderRadius:4, letterSpacing:"0.08em",
            }}>{isOSINT ? "🔵 OSINT" : "🔴 TEMPO REAL"}</span>

            <span style={{
              fontSize: 12, fontWeight:700, fontFamily:MONO,
              color:tc.color, background:tc.bg, border:`1px solid ${tc.border}`,
              padding:"2px 7px", borderRadius:4,
            }}>{tc.label}</span>

            {!isOSINT && (
              <span style={{
                fontSize: 12, fontWeight:800, fontFamily:MONO,
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
          <div style={{fontSize:13, fontWeight:alerta.lido?400:600, color:"#F1F5F9", marginBottom:5, lineHeight:1.4}}>
            {alerta.titulo}
          </div>

          {/* Resumo */}
          <div style={{fontSize:13, color:"#94A3B8", lineHeight:1.55, marginBottom:7}}>
            {alerta.resumo?.length > 130 ? alerta.resumo.slice(0,130)+"..." : alerta.resumo}
          </div>

          {/* Meta */}
          <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
            <span style={{fontSize:11, color:"#94A3B8", fontFamily:MONO}}>{alerta.fonte}</span>
            <span style={{fontSize: 12, color:"rgba(255,255,255,0.2)"}}>·</span>
            <span style={{fontSize:11, color:"#94A3B8", fontFamily:MONO}}>{timeAgo(alerta.timestamp)} atrás</span>
            {alerta.termo_encontrado && (
              <>
                <span style={{fontSize: 12, color:"rgba(255,255,255,0.2)"}}>·</span>
                <span style={{fontSize:11, fontFamily:MONO, color:"#E8A020", background:"rgba(232,160,32,0.12)", padding:"1px 6px", borderRadius:3}}>
                  "{alerta.termo_encontrado}"
                </span>
              </>
            )}
            {alerta.plataforma && (
              <>
                <span style={{fontSize: 12, color:"rgba(255,255,255,0.2)"}}>·</span>
                <span style={{fontSize:11, fontFamily:MONO, color:"#60A5FA", background:"rgba(96,165,250,0.12)", padding:"1px 6px", borderRadius:3}}>
                  {alerta.plataforma}
                </span>
              </>
            )}
            {alerta.dork && (
              <>
                <span style={{fontSize: 12, color:"rgba(255,255,255,0.2)"}}>·</span>
                <span style={{fontSize: 12, fontFamily:MONO, color:"#A78BFA", background:"rgba(167,139,250,0.12)", padding:"1px 6px", borderRadius:3, maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", display:"inline-block"}}>
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
                  <div style={{fontSize: 12, fontWeight:700, color:"#E8A020", letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:MONO, marginBottom:6}}>
                    ◈ Análise Tática — BASTOS-UNIT
                  </div>
                  <div style={{fontSize:13, color:"#F1F5F9", lineHeight:1.65}}>{alerta.analise_ia}</div>
                </div>
              )}
              <div style={{display:"flex", gap:8}}>
                <button onClick={async e=>{
                  e.stopPropagation()
                  if (!alerta.link) return
                  // Backend tenta em cascata: decoder -> follow_redirects ->
                  // fallback com busca no Google pelo titulo. Sempre retorna
                  // uma URL utilizavel.
                  let alvo = alerta.link
                  try {
                    const params = new URLSearchParams({
                      url: alerta.link,
                      titulo: alerta.titulo || "",
                    })
                    const r = await api.get(`/alertas/resolver-link?${params.toString()}`)
                    if (r?.ok) {
                      const d = await r.json()
                      if (d?.url) alvo = d.url
                    }
                  } catch { /* mantem o link original */ }
                  // setWindowOpenHandler do electron.cjs manda pro navegador do sistema
                  window.open(alvo, "_blank", "noreferrer")
                }} style={{
                  padding:"8px 16px", background:"#E8A020", color:"#F1F5F9",
                  borderRadius:7, fontSize:12, fontWeight:700, border:"none",
                  cursor:"pointer", display:"flex", alignItems:"center", gap:6,
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  Abrir fonte
                </button>
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

// ── Modal Gerenciar Alvos ────────────────────────────────────────────────────
// CRUD da watchlist (data/alvos.json no backend) direto pela tela — antes só
// dava pra editar mexendo em código. Alimenta as 3 varreduras (Tempo Real,
// OSINT/Dork, Telegram) e o dropdown de varredura individualizada.
function ModalGerenciarAlvos({ alvos, onFechar, onMudou }) {
  const [tipo, setTipo]         = useState("pessoa")
  const [nome, setNome]         = useState("")
  const [vulgos, setVulgos]     = useState("")
  const [termo, setTermo]       = useState("")
  const [descricao, setDescricao] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [variantesEdit, setVariantesEdit] = useState("")
  const [salvandoVariantes, setSalvandoVariantes] = useState(false)

  const pessoas = alvos.filter(a => (a.tipo || "pessoa") === "pessoa")
  const termos  = alvos.filter(a => a.tipo === "termo")

  async function adicionar() {
    if (tipo === "pessoa" && !nome.trim())  return toast.error("Informe o nome do alvo.")
    if (tipo === "termo"  && !termo.trim()) return toast.error("Informe o termo de busca.")
    setSalvando(true)
    try {
      const listaVulgos = vulgos.split(",").map(v=>v.trim()).filter(Boolean)
      const payload = tipo === "pessoa"
        ? { tipo, nome: nome.trim(), vulgos: listaVulgos }
        : { tipo, termo: termo.trim(), vulgos: listaVulgos, descricao: descricao.trim() }
      const res = await api.post("/alertas/alvos", payload)
      const data = await res.json()
      if (!res.ok) { toast.error(data.detail || "Não foi possível adicionar."); return }
      toast.success(tipo === "pessoa" ? `"${data.nome}" adicionado à watchlist.` : `Termo "${data.termo}" adicionado.`)
      setNome(""); setVulgos(""); setTermo(""); setDescricao("")
      onMudou()
    } catch {
      toast.error("Sem conexão com o servidor.")
    } finally {
      setSalvando(false)
    }
  }

  function abrirEdicaoVariantes(alvo) {
    setEditandoId(alvo.id)
    setVariantesEdit((alvo.variantes || []).join(", "))
  }

  async function salvarVariantes(alvo) {
    setSalvandoVariantes(true)
    try {
      const lista = variantesEdit.split(",").map(v=>v.trim()).filter(Boolean)
      const res = await api.patch(`/alertas/alvos/${alvo.id}/variantes`, { variantes: lista })
      const data = await res.json()
      if (!res.ok) { toast.error(data.detail || "Não foi possível salvar."); return }
      toast.success(`Variantes de "${alvo.termo}" atualizadas.`)
      setEditandoId(null)
      onMudou()
    } catch {
      toast.error("Sem conexão com o servidor.")
    } finally {
      setSalvandoVariantes(false)
    }
  }

  function remover(alvo) {
    const label = alvo.tipo === "termo" ? alvo.termo : alvo.nome
    confirm({
      title: "Remover da watchlist",
      description: `"${label}" vai parar de ser buscado nas próximas varreduras (Tempo Real, OSINT e Telegram). Os alertas já gerados permanecem no histórico.`,
      confirmLabel: "Remover",
      destructive: true,
      onConfirm: async () => {
        try {
          const res = await api.delete(`/alertas/alvos/${alvo.id}`)
          if (!res.ok) { toast.error("Não foi possível remover."); return }
          toast.success(`"${label}" removido da watchlist.`)
          onMudou()
        } catch {
          toast.error("Sem conexão com o servidor.")
        }
      },
    })
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20}}>
      <div style={{background:"#111827",borderRadius:10,width:"100%",maxWidth:560,
        border:"1px solid rgba(255,255,255,0.1)",display:"flex",flexDirection:"column",
        maxHeight:"88vh",overflow:"hidden"}}>

        {/* Header */}
        <div style={{padding:"14px 20px",background:"rgba(255,255,255,0.02)",
          borderBottom:"1px solid rgba(255,255,255,0.07)",
          display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:"#F1F5F9",fontFamily:MONO}}>GERENCIAR ALVOS E TERMOS</div>
            <div style={{fontSize:11,color:"#94A3B8",fontFamily:MONO,marginTop:2}}>
              {pessoas.length} pessoas · {termos.length} termos — alimenta as 3 varreduras
            </div>
          </div>
          <button onClick={onFechar} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.12)",
            borderRadius:6,width:28,height:28,cursor:"pointer",color:"#94A3B8",fontSize:16,
            display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>

        {/* Form de adicionar */}
        <div style={{padding:"16px 20px",borderBottom:"1px solid rgba(255,255,255,0.07)",flexShrink:0}}>
          <div style={{display:"flex",gap:6,marginBottom:12}}>
            {[["pessoa","👤 Pessoa"],["termo","# Termo"]].map(([id,label])=>(
              <button key={id} onClick={()=>setTipo(id)} style={{
                flex:1,padding:"7px 0",borderRadius:6,fontSize:12,fontWeight:700,cursor:"pointer",
                fontFamily:MONO,border:`1px solid ${tipo===id?"rgba(232,160,32,0.4)":"rgba(255,255,255,0.08)"}`,
                background:tipo===id?"rgba(232,160,32,0.14)":"transparent",
                color:tipo===id?"#E8A020":"#94A3B8",
              }}>{label}</button>
            ))}
          </div>

          {tipo === "pessoa" ? (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <input value={nome} onChange={e=>setNome(e.target.value)}
                placeholder="Nome completo do alvo"
                style={S.modalInput}/>
              <input value={vulgos} onChange={e=>setVulgos(e.target.value)}
                placeholder="Vulgos (opcional, separados por vírgula)"
                style={S.modalInput}/>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <input value={termo} onChange={e=>setTermo(e.target.value)}
                placeholder='Termo livre (ex: "CV-AM", "Tropa de Manaus")'
                style={S.modalInput}/>
              <input value={vulgos} onChange={e=>setVulgos(e.target.value)}
                placeholder="Variantes/como também é escrito (opcional, separadas por vírgula: CVAM, CV/AM...)"
                style={S.modalInput}/>
              <input value={descricao} onChange={e=>setDescricao(e.target.value)}
                placeholder="Descrição (opcional)"
                style={S.modalInput}/>
            </div>
          )}

          <button onClick={adicionar} disabled={salvando} style={{
            marginTop:10,width:"100%",padding:"9px",borderRadius:7,border:"none",cursor:"pointer",
            background:"#E8A020",color:"#0F172A",fontSize:13,fontWeight:800,fontFamily:MONO,
            opacity:salvando?0.6:1,
          }}>{salvando?"Adicionando...":"+ Adicionar à watchlist"}</button>
        </div>

        {/* Lista atual */}
        <div style={{flex:1,overflowY:"auto",padding:"8px 0"}}>
          {alvos.length === 0 && (
            <div style={{padding:"30px 20px",textAlign:"center",color:"rgba(255,255,255,0.3)",fontSize:13,fontFamily:MONO}}>
              Nenhum alvo cadastrado ainda.
            </div>
          )}
          {pessoas.length > 0 && (
            <div style={{padding:"6px 20px 2px",fontSize:11,fontWeight:700,color:"#64748B",
              letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:MONO}}>Pessoas ({pessoas.length})</div>
          )}
          {pessoas.map(a => (
            <div key={a.id} style={{display:"flex",alignItems:"center",gap:10,
              padding:"9px 20px",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:"#F1F5F9"}}>{a.nome}</div>
                {a.vulgos?.length > 0 && (
                  <div style={{fontSize:11,color:"#94A3B8",fontFamily:MONO,marginTop:1}}>{a.vulgos.join(", ")}</div>
                )}
              </div>
              <button onClick={()=>remover(a)} title="Remover"
                style={S.trashBtn}>🗑</button>
            </div>
          ))}
          {termos.length > 0 && (
            <div style={{padding:"12px 20px 2px",fontSize:11,fontWeight:700,color:"#64748B",
              letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:MONO}}>Termos ({termos.length})</div>
          )}
          {termos.map(a => (
            <div key={a.id} style={{padding:"9px 20px",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#F1F5F9",fontFamily:MONO}}>#{a.termo}</div>
                  {a.descricao && (
                    <div style={{fontSize:11,color:"#94A3B8",marginTop:1}}>{a.descricao}</div>
                  )}
                  {a.variantes?.length > 0 && (
                    <div style={{fontSize:11,color:"#E8A020",marginTop:2,fontFamily:MONO}}>
                      também: {a.variantes.join(", ")}
                    </div>
                  )}
                </div>
                <button onClick={()=>editandoId===a.id ? setEditandoId(null) : abrirEdicaoVariantes(a)}
                  title="Editar variantes/sinônimos" style={{...S.trashBtn,color:"#E8A020",
                    border:"1px solid rgba(232,160,32,0.3)",background:"rgba(232,160,32,0.08)"}}>✎</button>
                <button onClick={()=>remover(a)} title="Remover"
                  style={S.trashBtn}>🗑</button>
              </div>
              {editandoId === a.id && (
                <div style={{display:"flex",gap:6,marginTop:8}}>
                  <input value={variantesEdit} onChange={e=>setVariantesEdit(e.target.value)}
                    placeholder="Variantes separadas por vírgula (ex: CVAM, CV/AM)"
                    style={{...S.modalInput,flex:1,padding:"6px 10px",fontSize:12}}/>
                  <button onClick={()=>salvarVariantes(a)} disabled={salvandoVariantes} style={{
                    padding:"0 14px",borderRadius:6,border:"none",cursor:"pointer",
                    background:"#E8A020",color:"#0F172A",fontSize:12,fontWeight:800,fontFamily:MONO,
                    opacity:salvandoVariantes?0.6:1,
                  }}>Salvar</button>
                </div>
              )}
            </div>
          ))}
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
  const [varrendoTelegram, setVarrendoTelegram] = useState(false)
  const [alvos, setAlvos]             = useState([])
  const [alvoSelecionado, setAlvoSelecionado] = useState("TODOS")
  const [modalAlvos, setModalAlvos]   = useState(false)
  const [showAlvoList, setShowAlvoList] = useState(false)
  const [alvoDropdownPos, setAlvoDropdownPos] = useState(null)
  const [buscandoAlvo, setBuscandoAlvo] = useState(false)
  const alvoTriggerRef = useRef(null)

  // A barra lateral tem rolagem própria (overflow-y:auto) — um dropdown com
  // position:absolute renderizado dentro dela fica CORTADO pelo limite do
  // menu (some ou aparece pela metade). Por isso calculamos a posição em tela
  // do botão e desenhamos a lista via portal direto no body, com
  // position:fixed — sempre visível, seja qual for o tamanho da barra.
  function toggleAlvoList() {
    if (!showAlvoList && alvoTriggerRef.current) {
      const rect = alvoTriggerRef.current.getBoundingClientRect()
      const espacoAbaixo = window.innerHeight - rect.bottom
      const abrirParaCima = espacoAbaixo < 180 && rect.top > espacoAbaixo
      setAlvoDropdownPos({
        left: rect.left, width: rect.width,
        top:    abrirParaCima ? null : rect.bottom + 4,
        bottom: abrirParaCima ? (window.innerHeight - rect.top + 4) : null,
        maxHeight: Math.max(120, Math.min(280, (abrirParaCima ? rect.top : espacoAbaixo) - 16)),
      })
    }
    setShowAlvoList(s => !s)
  }

  useEffect(() => {
    const style = document.createElement("style")
    style.textContent = GLOBAL_CSS
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  useEffect(() => { carregarAlvos() }, [])

  async function carregarAlvos() {
    try {
      const r = await api.get("/alertas/alvos")
      const data = await r.json()
      const lista = Array.isArray(data) ? data : []
      setAlvos(lista)
      return lista
    } catch { return null } // dropdown fica só com "Todos" — não trava a tela
  }

  // Se o alvo selecionado no dropdown foi removido na Gerenciar Alvos, volta pra "Todos"
  async function aoMudarAlvos() {
    const lista = await carregarAlvos()
    if (lista && alvoSelecionado !== "TODOS" && !lista.some(a => String(a.id) === alvoSelecionado)) {
      setAlvoSelecionado("TODOS")
    }
  }

  // Auto-refresh a cada 3 min, com retry em backoff se falhar. Antes o
  // useEffect rodava 1x no mount e a tela congelava — agora fica viva sozinha.
  const { ultimaAtualizacao, falhou, atualizarAgora } = useAutoRefresh(
    () => carregarAlertas(),
    { intervalMs: 3 * 60 * 1000 }
  )

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
    } catch (e) {
      setRealtimeAlertas([])
      setOsintAlertas([])
      setErro(true)
      throw e   // propaga pro useAutoRefresh disparar o backoff
    } finally { setLoading(false) }
  }

  // alvoSelecionado !== "TODOS" -> varredura individualizada (só aquele alvo/termo)
  function sufixoAlvo() {
    return alvoSelecionado !== "TODOS" ? `?alvo_id=${encodeURIComponent(alvoSelecionado)}` : ""
  }

  // O backend (GDELT, gratuito e sem chave) reporta buscas que falharam —
  // rede instável ou rate-limit (exige >=5s entre requisições). Antes, com
  // o Google News RSS, uma falha virava silenciosamente "0 novos",
  // indistinguível de "não achou nada" — isso avisa o operador na hora.
  function avisarFalhasBusca(data) {
    if (!data) return
    if (data.bloqueio_busca) {
      toast.error("Busca temporariamente limitada (rate-limit do provedor gratuito) — Tempo Real/OSINT podem estar incompletos. Tente novamente em alguns segundos.", 9000)
    } else if (data.buscas_falhas > 0) {
      toast.warn(`${data.buscas_falhas} busca(s) falharam por instabilidade de rede — resultado pode estar incompleto.`)
    }
  }

  async function varrerRealtime() {
    setVarrendo(true)
    try {
      const r = await api.post(`/alertas/varrer${sufixoAlvo()}`)
      avisarFalhasBusca(await r.json())
      await carregarAlertas()
    } catch { await new Promise(r=>setTimeout(r,1500)) }
    finally { setVarrendo(false) }
  }

  async function varrerOSINT() {
    setVarrendoOSINT(true)
    try {
      const r = await api.post(`/alertas/osint/varrer${sufixoAlvo()}`)
      avisarFalhasBusca(await r.json())
      await carregarAlertas()
    } catch { await new Promise(r=>setTimeout(r,2000)) }
    finally { setVarrendoOSINT(false) }
  }

  async function varrerTelegram() {
    setVarrendoTelegram(true)
    try {
      await api.post(`/alertas/telegram/varrer${sufixoAlvo()}`)
      await carregarAlertas()
    } catch { await new Promise(r=>setTimeout(r,2000)) }
    finally { setVarrendoTelegram(false) }
  }

  // Ação única e intuitiva: dispara as 3 varreduras (Tempo Real + OSINT +
  // Telegram) de uma vez, todas restritas ao alvo selecionado no dropdown.
  async function buscarAlvoSelecionado() {
    if (alvoSelecionado === "TODOS") return
    const rotulo = rotuloAlvo(alvoAtual)
    setBuscandoAlvo(true)
    try {
      const suf = sufixoAlvo()
      const resultados = await Promise.allSettled([
        api.post(`/alertas/varrer${suf}`).then(r=>r.json()),
        api.post(`/alertas/osint/varrer${suf}`).then(r=>r.json()),
        api.post(`/alertas/telegram/varrer${suf}`).then(r=>r.json()),
      ])
      const valores = resultados.filter(r=>r.status==="fulfilled").map(r=>r.value)
      const novos = valores.reduce((acc,v)=> acc + (v?.novos || 0), 0)
      const falhas = valores.reduce((acc,v)=> acc + (v?.buscas_falhas || 0), 0)
      const bloqueado = valores.some(v=>v?.bloqueio_busca)
      await carregarAlertas()
      if (bloqueado) {
        toast.error(`Busca temporariamente limitada (rate-limit do provedor gratuito) — a busca sobre "${rotulo}" pode estar incompleta. Tente novamente em instantes.`, 9000)
      } else if (falhas > 0) {
        toast.warn(`Busca sobre "${rotulo}" concluída, mas ${falhas} sub-busca(s) falharam por instabilidade — resultado pode estar incompleto.`)
      } else {
        toast.success(novos > 0
          ? `Busca concluída: ${novos} alerta(s) novo(s) sobre "${rotulo}".`
          : `Busca concluída sobre "${rotulo}" — nenhuma menção nova encontrada.`)
      }
    } catch {
      toast.error("Falha ao buscar o alvo selecionado.")
    } finally {
      setBuscandoAlvo(false)
    }
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
    // Alvo específico selecionado no dropdown -> lista só mostra os alertas
    // DELE (mesmo vazio), nunca mistura com os demais alvos monitorados.
    if (alvoSelecionado !== "TODOS" && String(a.alvo_id) !== alvoSelecionado) return false
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

  const alvoAtual = alvos.find(a => String(a.id) === alvoSelecionado) || null
  const alvosOrdenados = [...alvos].sort((a,b) => rotuloAlvo(a).localeCompare(rotuloAlvo(b), "pt-BR"))

  return (
    <div style={{ display:"flex", flexDirection:"column", flex:1, height:"100%", overflow:"hidden" }}>

      {/* ══ TOPBAR ════════════════════════════════════════════════════════════ */}
      <div style={S.topbar}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            <div style={{ width:12, height:12, borderRadius:"50%", background:"#FF5F57" }} />
            <div style={{ width:12, height:12, borderRadius:"50%", background:"#FEBC2E" }} />
            <div style={{ width:12, height:12, borderRadius:"50%", background:"#28C840" }} />
          </div>
          <div style={{ width:1, height:16, background:"rgba(255,255,255,0.12)", margin:"0 4px" }} />
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:"#F1F5F9", letterSpacing:"0.03em" }}>Alertas</div>
            <div style={{ fontSize:11, color:"#94A3B8", fontFamily:MONO, letterSpacing:"0.06em" }}>BASTOS-UNIT · OSINT Monitor · Telegram · Realtime</div>
          </div>
        </div>
        {naoLidos > 0 && (
          <span style={{ fontSize:11, color:"#F87171", fontWeight:800, fontFamily:MONO, background:"rgba(239,68,68,0.15)", padding:"3px 10px", borderRadius:4, border:"1px solid rgba(239,68,68,0.35)", letterSpacing:"0.06em" }}>
            {naoLidos} NÃO LIDOS
          </span>
        )}
      </div>

      <div style={S.page}>

      {/* ══ ASIDE ══════════════════════════════════════════════════════════ */}
      <aside style={S.aside}>
        <div style={S.asideHeader}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span style={{fontSize:12,fontWeight:800,color:"#E8A020",letterSpacing:"0.1em",textTransform:"uppercase"}}>Alertas</span>
          </div>
          {naoLidos > 0 && (
            <span style={{fontSize: 12,color:"#F87171",fontWeight:800,fontFamily:MONO,background:"rgba(239,68,68,0.12)",padding:"2px 8px",borderRadius:4,border:"1px solid rgba(239,68,68,0.3)"}}>
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

          {/* Alvo da varredura — individualizada ou todos */}
          <div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
              <div style={S.filterLabel}>Alvo da varredura</div>
              <button onClick={()=>setModalAlvos(true)} title="Adicionar ou remover alvos/termos"
                style={{background:"transparent",border:"none",cursor:"pointer",color:"#E8A020",
                  fontSize:11,fontFamily:MONO,fontWeight:700,padding:0}}>⚙ Gerenciar</button>
            </div>

            {/* Dropdown custom (não usamos <select> nativo — no Windows/Electron
                a lista de opções renderiza com fundo branco do SO, ilegível no
                tema dark; assim controlamos 100% do estilo). */}
            <div style={{position:"relative"}}>
              <button ref={alvoTriggerRef} onClick={toggleAlvoList} style={{
                width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,
                padding:"8px 10px",borderRadius:6,fontSize:12,fontFamily:MONO,cursor:"pointer",
                background:alvoSelecionado!=="TODOS"?"rgba(232,160,32,0.12)":"rgba(255,255,255,0.04)",
                border:`1px solid ${alvoSelecionado!=="TODOS"?"rgba(232,160,32,0.4)":"rgba(255,255,255,0.1)"}`,
                color:alvoSelecionado!=="TODOS"?"#E8A020":"#E2E8F0", textAlign:"left",
              }}>
                <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {alvoSelecionado==="TODOS" ? `Todos os alvos (${alvos.length})` : rotuloAlvo(alvoAtual)}
                </span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{flexShrink:0,transform:showAlvoList?"rotate(180deg)":"none",transition:"transform 0.15s"}}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
            </div>

            {/* Portal pro body — foge da rolagem da barra lateral, senão a
                lista fica cortada/invisível dentro do menu */}
            {showAlvoList && alvoDropdownPos && createPortal(
              <>
                <div onClick={()=>setShowAlvoList(false)} style={{position:"fixed",inset:0,zIndex:9998}}/>
                <div style={{
                  position:"fixed", zIndex:9999,
                  left:alvoDropdownPos.left, width:alvoDropdownPos.width,
                  ...(alvoDropdownPos.top!=null ? {top:alvoDropdownPos.top} : {bottom:alvoDropdownPos.bottom}),
                  maxHeight:alvoDropdownPos.maxHeight, overflowY:"auto", borderRadius:8,
                  background:"rgba(10,16,28,0.99)",
                  border:"1px solid rgba(255,255,255,0.14)",
                  boxShadow:"0 16px 40px rgba(0,0,0,0.65)",
                }}>
                  <button onClick={()=>{setAlvoSelecionado("TODOS");setShowAlvoList(false)}} style={{
                    width:"100%",textAlign:"left",padding:"9px 12px",background:alvoSelecionado==="TODOS"?"rgba(232,160,32,0.14)":"transparent",
                    border:"none",borderBottom:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",
                    color:alvoSelecionado==="TODOS"?"#E8A020":"#E2E8F0",fontSize:12,fontFamily:MONO,fontWeight:700,
                  }}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(232,160,32,0.10)"}
                    onMouseLeave={e=>e.currentTarget.style.background=alvoSelecionado==="TODOS"?"rgba(232,160,32,0.14)":"transparent"}>
                    Todos os alvos ({alvos.length})
                  </button>
                  {alvosOrdenados.length === 0 && (
                    <div style={{padding:"14px 12px",fontSize:12,color:"rgba(255,255,255,0.3)",fontFamily:MONO}}>
                      Nenhum alvo cadastrado — use "Gerenciar" pra adicionar.
                    </div>
                  )}
                  {alvosOrdenados.map(a => {
                    const sel = String(a.id) === alvoSelecionado
                    return (
                      <button key={a.id} onClick={()=>{setAlvoSelecionado(String(a.id));setShowAlvoList(false)}} style={{
                        width:"100%",textAlign:"left",padding:"9px 12px",
                        background:sel?"rgba(232,160,32,0.14)":"transparent",
                        border:"none",borderBottom:"1px solid rgba(255,255,255,0.05)",cursor:"pointer",
                        color:sel?"#E8A020":"#E2E8F0",fontSize:12,fontFamily:MONO,fontWeight:sel?700:500,
                      }}
                        onMouseEnter={e=>e.currentTarget.style.background="rgba(232,160,32,0.10)"}
                        onMouseLeave={e=>e.currentTarget.style.background=sel?"rgba(232,160,32,0.14)":"transparent"}>
                        {rotuloAlvo(a)}
                      </button>
                    )
                  })}
                </div>
              </>,
              document.body
            )}

            {/* Botão de ação — só aparece com um alvo específico selecionado.
                Dispara as 3 varreduras de uma vez, sem precisar escolher qual. */}
            {alvoSelecionado !== "TODOS" && (
              <button onClick={buscarAlvoSelecionado} disabled={buscandoAlvo} style={{
                width:"100%",marginTop:8,padding:"9px",borderRadius:7,border:"none",cursor:"pointer",
                background:"#E8A020",color:"#0F172A",fontSize:13,fontWeight:800,fontFamily:MONO,
                display:"flex",alignItems:"center",justifyContent:"center",gap:6,
                opacity:buscandoAlvo?0.65:1,
              }}>
                {buscandoAlvo
                  ? <><svg className="spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Buscando...</>
                  : <>🔍 Buscar alvo selecionado</>}
              </button>
            )}
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
                ? <><svg className="spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Buscando (GDELT)...</>
                : <><span>🔵</span>Varrer OSINT</>}
            </button>
            <button onClick={varrerTelegram} disabled={varrendoTelegram} style={{...S.actionBtn,color:"#818CF8",border:"1px solid rgba(129,140,248,0.3)"}}>
              {varrendoTelegram
                ? <><svg className="spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Varrendo Telegram...</>
                : <><span>✈</span>Varrer Telegram</>}
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
            <span style={{fontSize:11,color:"#94A3B8",fontFamily:MONO}}>Monitor OSINT · varredura manual</span>
          </div>
          <span style={{fontSize:11,color:"rgba(255,255,255,0.3)",fontFamily:MONO}}>
            Telegram · GDELT News
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
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{fontSize:14,fontWeight:700,color:"#F1F5F9"}}>Central de Alertas OSINT</div>
                {/* Badge auto-refresh: verde=fresh, amarelo=falha na ultima tentativa */}
                <span title={ultimaAtualizacao ? `Última atualização ${ultimaAtualizacao.toLocaleTimeString()}` : "Nunca atualizado"}
                  style={{fontSize:9.5, fontFamily:MONO, letterSpacing:"0.05em",
                    padding:"2px 8px", borderRadius:10,
                    border:`1px solid ${falhou ? "rgba(232,160,32,0.35)" : "rgba(74,222,128,0.35)"}`,
                    color: falhou ? "#E8A020" : "#4ADE80",
                    background: falhou ? "rgba(232,160,32,0.08)" : "rgba(74,222,128,0.08)"}}>
                  {falhou ? "⚠ reconectando" : `● ao vivo · ${formatarHaTempo(ultimaAtualizacao)}`}
                </span>
              </div>
              <div style={{fontSize:11,color:"#94A3B8",fontFamily:MONO,marginTop:2}}>
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
              <span style={{fontSize:13,color:"#94A3B8",fontFamily:MONO}}>Carregando alertas...</span>
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
              <button onClick={atualizarAgora} style={{...S.actionBtn,width:"auto",padding:"9px 20px",color:"#E8A020",border:"1px solid rgba(232,160,32,0.4)"}}>
                Tentar novamente
              </button>
            </div>
          )}
          {!loading && !erro && filtrados.length === 0 && (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,gap:12,padding:40,height:"100%"}}>
              <EmptyState texto="OSINT Monitor · Telegram · Google News" />
              <p style={{fontSize:13,color:"rgba(255,255,255,0.2)",fontFamily:MONO,margin:0}}>
                {alvoSelecionado !== "TODOS"
                  ? `Nenhum alerta para "${rotuloAlvo(alvoAtual)}" nos últimos 90 dias`
                  : busca ? "Nenhum alerta encontrado para essa busca" : "Nenhum alerta registrado ainda"}
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

      {modalAlvos && (
        <ModalGerenciarAlvos alvos={alvos} onFechar={()=>setModalAlvos(false)} onMudou={aoMudarAlvos}/>
      )}
    </div>
  )
}

const S = {
  topbar:{height:48,flexShrink:0,background:"#0F172A",borderBottom:"1px solid rgba(255,255,255,0.07)",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px"},
  page:{display:"flex",flex:1,minWidth:0,minHeight:0,overflow:"hidden",background:"#0B1120"},
  aside:{width:268,flexShrink:0,background:"#111827",borderRight:"1px solid rgba(255,255,255,0.07)",display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"},
  asideHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 16px 12px",borderBottom:"1px solid rgba(255,255,255,0.07)",flexShrink:0},
  main:{display:"flex",flexDirection:"column",flex:1,minWidth:0,height:"100%",overflow:"hidden",background:"#0B1120"},
  mainHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 22px",borderBottom:"1px solid rgba(255,255,255,0.07)",background:"#111827",flexShrink:0},
  mainBody:{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"},
  filterLabel:{fontSize:11,fontWeight:700,color:"#64748B",letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:MONO,marginBottom:6},
  filterBtn:{width:"100%",padding:"7px 10px",borderRadius:6,fontSize:13,fontWeight:500,cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontFamily:MONO,transition:"all 0.12s",textAlign:"left"},
  actionBtn:{width:"100%",padding:"9px",borderRadius:7,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",fontSize:13,color:"#94A3B8",cursor:"pointer",fontFamily:MONO,display:"flex",alignItems:"center",justifyContent:"center",gap:6},
  modalInput:{width:"100%",padding:"9px 12px",borderRadius:7,fontSize:13,fontFamily:MONO,color:"#F1F5F9",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",outline:"none"},
  trashBtn:{flexShrink:0,width:30,height:30,borderRadius:6,border:"1px solid rgba(239,68,68,0.25)",background:"rgba(239,68,68,0.08)",color:"#F87171",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"},
}
