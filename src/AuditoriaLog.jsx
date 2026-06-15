import { useState, useEffect, useCallback } from "react"
import api from "./api"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const C = {
  bg:        "#0B1120",
  surface:   "#111827",
  surfaceUp: "#1A2236",
  border:    "rgba(255,255,255,0.07)",
  gold:      "#E8A020",
  goldSoft:  "rgba(232,160,32,0.12)",
  text:      "#F1F5F9",
  textMid:   "#94A3B8",
  textDim:   "rgba(255,255,255,0.3)",
}

const CATEGORIAS = {
  autenticacao: { label:"Autenticação",  color:"#60A5FA", bg:"rgba(96,165,250,0.1)",  border:"rgba(96,165,250,0.3)"  },
  hitl:         { label:"Decisões HITL", color:"#F59E0B", bg:"rgba(245,158,11,0.1)",  border:"rgba(245,158,11,0.3)"  },
  usuario:      { label:"Usuários",      color:"#F87171", bg:"rgba(248,113,113,0.1)", border:"rgba(248,113,113,0.3)" },
  consulta:     { label:"Consultas",     color:"#A78BFA", bg:"rgba(167,139,250,0.1)", border:"rgba(167,139,250,0.3)" },
  liderancas:   { label:"Lideranças",    color:"#34D399", bg:"rgba(52,211,153,0.1)",  border:"rgba(52,211,153,0.3)"  },
  auditoria:    { label:"Auditoria",     color:"#94A3B8", bg:"rgba(148,163,184,0.1)", border:"rgba(148,163,184,0.3)" },
}

const AUDIT_CSS = `
  @keyframes auditFade { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:translateY(0)} }
  .audit-row { animation: auditFade 0.15s ease forwards; }
  .audit-row:hover { background: rgba(255,255,255,0.025) !important; }
  .audit-btn:hover { filter: brightness(1.12); transform: translateY(-1px); }
  .audit-btn:active { transform: scale(0.97); }
  .audit-input:focus { border-color: #E8A020 !important; box-shadow: 0 0 0 3px rgba(232,160,32,0.1) !important; }
`

function fmtTs(iso) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("pt-BR", {
    day:"2-digit", month:"2-digit", year:"numeric",
    hour:"2-digit", minute:"2-digit", second:"2-digit",
    timeZone:"America/Manaus",
  })
}

function catCfg(cat) { return CATEGORIAS[cat] || { label: cat, color:"#94A3B8", bg:"rgba(148,163,184,0.1)", border:"rgba(148,163,184,0.3)" } }

export default function AuditoriaLog() {
  const [registros, setRegistros] = useState([])
  const [stats, setStats]         = useState({})
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [erro, setErro]           = useState(null)
  const [exportando, setExportando] = useState(null) // "csv" | "pdf" | null

  const [filtros, setFiltros] = useState({
    categoria: "", usuario: "", data_inicio: "", data_fim: "",
  })
  const [offset, setOffset] = useState(0)
  const LIMITE = 100

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ limite: LIMITE, offset })
      if (filtros.categoria)   p.set("categoria",   filtros.categoria)
      if (filtros.usuario)     p.set("usuario",     filtros.usuario)
      if (filtros.data_inicio) p.set("data_inicio", filtros.data_inicio)
      if (filtros.data_fim)    p.set("data_fim",    filtros.data_fim)

      const [resLogs, resStats] = await Promise.all([
        api.get(`/audit/logs?${p}`),
        api.get("/audit/stats"),
      ])
      const dLogs  = await resLogs.json()
      const dStats = await resStats.json()
      setRegistros(dLogs.registros || [])
      setTotal(dLogs.total || 0)
      setStats(dStats || {})
      setErro(null)
    } catch {
      setErro("Falha ao carregar log de auditoria.")
    } finally { setLoading(false) }
  }, [filtros, offset])

  useEffect(() => {
    const style = document.createElement("style")
    style.textContent = AUDIT_CSS
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function exportar(tipo) {
    setExportando(tipo)
    try {
      const p = new URLSearchParams()
      if (filtros.categoria)   p.set("categoria",   filtros.categoria)
      if (filtros.usuario)     p.set("usuario",     filtros.usuario)
      if (filtros.data_inicio) p.set("data_inicio", filtros.data_inicio)
      if (filtros.data_fim)    p.set("data_fim",    filtros.data_fim)
      const res = await api.get(`/audit/exportar/${tipo}?${p}`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = `auditoria.${tipo}`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert(`Erro ao exportar ${tipo.toUpperCase()}.`)
    } finally { setExportando(null) }
  }

  function aplicarFiltros(novo) {
    setFiltros(f => ({ ...f, ...novo }))
    setOffset(0)
  }

  const totalPages = Math.ceil(total / LIMITE)
  const currentPage = Math.floor(offset / LIMITE) + 1

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:C.bg,
      fontFamily:SANS,color:C.text,overflow:"hidden"}}>

      {/* ── Topbar ── */}
      <header style={{height:52,borderBottom:`1px solid ${C.border}`,display:"flex",
        alignItems:"center",justifyContent:"space-between",padding:"0 22px",
        background:C.surface,flexShrink:0,boxShadow:"0 1px 0 rgba(232,160,32,0.08)"}}>
        <div>
          <div style={{fontSize:17,fontWeight:700,letterSpacing:"-0.01em"}}>Log de Auditoria</div>
          <div style={{fontSize:12,color:C.textMid,fontFamily:MONO,marginTop:1}}>
            Rastreabilidade · LGPD · {total} evento{total !== 1 ? "s" : ""}
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button className="audit-btn" onClick={() => exportar("csv")} disabled={!!exportando}
            style={{display:"flex",alignItems:"center",gap:7,padding:"8px 16px",
              borderRadius:8,border:`1px solid rgba(52,211,153,0.35)`,cursor:"pointer",
              background:"rgba(52,211,153,0.1)",color:"#34D399",fontWeight:700,
              fontSize:13,fontFamily:MONO,transition:"all 0.15s",
              opacity:exportando?0.5:1}}>
            {exportando==="csv" ? "⏳ CSV…" : "↓ CSV"}
          </button>
          <button className="audit-btn" onClick={() => exportar("pdf")} disabled={!!exportando}
            style={{display:"flex",alignItems:"center",gap:7,padding:"8px 16px",
              borderRadius:8,border:`1px solid rgba(248,113,113,0.35)`,cursor:"pointer",
              background:"rgba(248,113,113,0.1)",color:"#F87171",fontWeight:700,
              fontSize:13,fontFamily:MONO,transition:"all 0.15s",
              opacity:exportando?0.5:1}}>
            {exportando==="pdf" ? "⏳ PDF…" : "↓ PDF"}
          </button>
          <button className="audit-btn" onClick={carregar}
            style={{width:34,height:34,borderRadius:8,border:`1px solid ${C.border}`,
              background:"rgba(255,255,255,0.05)",cursor:"pointer",color:C.textMid,
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>
            ↻
          </button>
        </div>
      </header>

      <div style={{flex:1,overflow:"auto",padding:"16px 22px",display:"flex",flexDirection:"column",gap:14}}>

        {/* ── Cards de stats ── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8}}>
          {Object.entries(CATEGORIAS).filter(([k]) => k !== "auditoria").map(([key, cfg]) => (
            <button key={key} onClick={() => aplicarFiltros({ categoria: filtros.categoria === key ? "" : key })}
              style={{padding:"12px 14px",borderRadius:10,cursor:"pointer",textAlign:"left",
                background: filtros.categoria === key ? cfg.bg : "rgba(255,255,255,0.03)",
                border: `1px solid ${filtros.categoria === key ? cfg.border : "rgba(255,255,255,0.07)"}`,
                transition:"all 0.15s"}}>
              <div style={{fontSize:10,fontWeight:800,color:cfg.color,letterSpacing:"0.1em",
                textTransform:"uppercase",marginBottom:5,fontFamily:MONO}}>{cfg.label}</div>
              <div style={{fontSize:24,fontWeight:900,color:C.text,lineHeight:1}}>
                {stats[key] ?? "…"}
              </div>
            </button>
          ))}
        </div>

        {/* ── Filtros ── */}
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",
          padding:"12px 16px",borderRadius:10,background:C.surface,border:`1px solid ${C.border}`}}>
          <span style={{fontSize:11,fontWeight:700,color:C.textMid,letterSpacing:"0.1em",
            textTransform:"uppercase",fontFamily:MONO,flexShrink:0}}>Filtros</span>

          <select className="audit-input" value={filtros.categoria}
            onChange={e => aplicarFiltros({ categoria: e.target.value })}
            style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,
              borderRadius:7,padding:"7px 12px",fontSize:13,color:C.text,outline:"none",
              fontFamily:MONO,cursor:"pointer",transition:"all 0.15s"}}>
            <option value="">Todas as categorias</option>
            {Object.entries(CATEGORIAS).filter(([k]) => k !== "auditoria").map(([k,v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          <input className="audit-input" placeholder="Usuário…" value={filtros.usuario}
            onChange={e => aplicarFiltros({ usuario: e.target.value })}
            style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,
              borderRadius:7,padding:"7px 12px",fontSize:13,color:C.text,outline:"none",
              fontFamily:MONO,width:140,transition:"all 0.15s"}}/>

          <input type="date" className="audit-input" value={filtros.data_inicio}
            onChange={e => aplicarFiltros({ data_inicio: e.target.value })}
            style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,
              borderRadius:7,padding:"7px 12px",fontSize:13,color:C.text,outline:"none",
              fontFamily:MONO,colorScheme:"dark",transition:"all 0.15s"}}/>
          <span style={{color:C.textDim,fontSize:12}}>→</span>
          <input type="date" className="audit-input" value={filtros.data_fim}
            onChange={e => aplicarFiltros({ data_fim: e.target.value })}
            style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,
              borderRadius:7,padding:"7px 12px",fontSize:13,color:C.text,outline:"none",
              fontFamily:MONO,colorScheme:"dark",transition:"all 0.15s"}}/>

          {(filtros.categoria || filtros.usuario || filtros.data_inicio || filtros.data_fim) && (
            <button onClick={() => aplicarFiltros({ categoria:"", usuario:"", data_inicio:"", data_fim:"" })}
              style={{padding:"7px 12px",borderRadius:7,border:`1px solid rgba(239,68,68,0.3)`,
                background:"rgba(239,68,68,0.08)",color:"#FCA5A5",fontSize:12,cursor:"pointer",
                fontFamily:MONO,fontWeight:700}}>
              ✕ Limpar
            </button>
          )}
        </div>

        {/* ── Estado ── */}
        {erro && (
          <div style={{padding:"12px 16px",borderRadius:10,background:"rgba(239,68,68,0.1)",
            border:"1px solid rgba(239,68,68,0.3)",color:"#FCA5A5",fontSize:14}}>{erro}</div>
        )}

        {/* ── Tabela ── */}
        <div style={{borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden",
          background:C.surface,flex:1}}>
          {/* Header */}
          <div style={{display:"grid",gridTemplateColumns:"160px 120px 180px 120px 160px 1fr 100px",
            padding:"10px 16px",borderBottom:`1px solid ${C.border}`,
            background:"rgba(255,255,255,0.025)"}}>
            {["Timestamp","Categoria","Evento","Usuário","Alvo","Detalhe","IP"].map(h => (
              <span key={h} style={{fontSize:10,fontWeight:800,color:C.textMid,
                letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:MONO}}>{h}</span>
            ))}
          </div>

          {loading && (
            <div style={{padding:"24px",textAlign:"center",color:C.textMid,fontSize:13,fontFamily:MONO}}>
              Carregando…
            </div>
          )}

          {!loading && registros.length === 0 && (
            <div style={{padding:"28px",textAlign:"center",color:C.textDim,fontSize:13,fontFamily:MONO}}>
              Nenhum evento encontrado
            </div>
          )}

          <div style={{overflowY:"auto",maxHeight:"calc(100vh - 340px)"}}>
            {registros.map((r, i) => {
              const cc = catCfg(r.categoria)
              return (
                <div key={r.id} className="audit-row"
                  style={{display:"grid",gridTemplateColumns:"160px 120px 180px 120px 160px 1fr 100px",
                    padding:"9px 16px",
                    borderBottom: i < registros.length-1 ? `1px solid rgba(255,255,255,0.04)` : "none",
                    alignItems:"center",transition:"background 0.1s"}}>

                  <span style={{fontSize:11,color:C.textMid,fontFamily:MONO}}>
                    {fmtTs(r.timestamp)}
                  </span>

                  <span style={{fontSize:10,fontWeight:800,padding:"3px 8px",
                    borderRadius:5,background:cc.bg,color:cc.color,
                    border:`1px solid ${cc.border}`,fontFamily:MONO,
                    letterSpacing:"0.05em",display:"inline-block",width:"fit-content"}}>
                    {cc.label}
                  </span>

                  <span style={{fontSize:12,fontWeight:600,color:C.text,fontFamily:MONO}}>
                    {r.evento}
                  </span>

                  <span style={{fontSize:12,color:C.textMid,fontFamily:MONO,
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {r.usuario || "—"}
                  </span>

                  <span style={{fontSize:11,color:C.textMid,fontFamily:MONO,
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}
                    title={r.alvo || ""}>
                    {r.alvo ? (r.alvo.length > 20 ? r.alvo.slice(0,8)+"…"+r.alvo.slice(-8) : r.alvo) : "—"}
                  </span>

                  <span style={{fontSize:11,color:C.textDim,fontFamily:MONO,
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}
                    title={r.detalhe || ""}>
                    {r.detalhe || "—"}
                  </span>

                  <span style={{fontSize:11,color:C.textDim,fontFamily:MONO}}>
                    {r.ip || "—"}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Paginação ── */}
        {totalPages > 1 && (
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
            <button disabled={offset===0} onClick={() => setOffset(Math.max(0,offset-LIMITE))}
              style={{padding:"6px 16px",borderRadius:7,cursor:offset===0?"not-allowed":"pointer",
                border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.05)",
                color:C.textMid,fontFamily:MONO,fontSize:12,opacity:offset===0?0.4:1}}>
              ← Anterior
            </button>
            <span style={{fontSize:12,color:C.textMid,fontFamily:MONO}}>
              {currentPage} / {totalPages}
            </span>
            <button disabled={currentPage>=totalPages} onClick={() => setOffset(offset+LIMITE)}
              style={{padding:"6px 16px",borderRadius:7,cursor:currentPage>=totalPages?"not-allowed":"pointer",
                border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.05)",
                color:C.textMid,fontFamily:MONO,fontSize:12,
                opacity:currentPage>=totalPages?0.4:1}}>
              Próximo →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
