import { useState, useEffect, useMemo } from "react"
import api from "./api"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const C = {
  bg:        "#0B1120",
  surface:   "#111827",
  surfaceUp: "#1A2236",
  border:    "rgba(255,255,255,0.07)",
  text:      "#F1F5F9",
  textMid:   "#CBD5E1",
  textDim:   "#94A3B8",
  accent:    "#E8A020",
  goldSoft:  "rgba(232,160,32,0.12)",
  goldBorder:"rgba(232,160,32,0.3)",
}

const TIPOS = [
  {val:"",       label:"Todos",  cor:C.accent,   bg:C.goldSoft,            border:C.goldBorder},
  {val:"RELINT", label:"RELINT", cor:"#93C5FD",  bg:"rgba(59,130,246,0.12)", border:"rgba(59,130,246,0.35)"},
  {val:"RELTEC", label:"RELTEC", cor:"#C4B5FD",  bg:"rgba(109,40,217,0.12)", border:"rgba(109,40,217,0.35)"},
]

// ── DocCard ───────────────────────────────────────────────────────────────────
function DocCard({ doc, termo }) {
  const isRelint  = doc.tipo === "RELINT"
  const tipoCor   = isRelint ? "#93C5FD" : "#C4B5FD"
  const tipoBg    = isRelint ? "rgba(59,130,246,0.12)" : "rgba(109,40,217,0.12)"
  const tipoBord  = isRelint ? "rgba(59,130,246,0.35)" : "rgba(109,40,217,0.35)"
  const barCor    = isRelint ? "#3B82F6" : "#7C3AED"

  function highlight(text) {
    const t = termo.trim()
    if (!t) return text
    const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")})`, "gi")
    return text.split(re).map((p,i) =>
      re.test(p)
        ? <mark key={i} style={{background:"#FEF9C3",color:"#854D0E",
            padding:"0 2px",borderRadius:2,fontWeight:700}}>{p}</mark>
        : p
    )
  }

  return (
    <div className="ref-card" style={{
      background:C.surface,
      border:`1px solid ${C.border}`,
      borderLeft:`3px solid ${barCor}`,
      borderRadius:9, padding:"13px 16px", marginBottom:8,
      transition:"all 0.15s",
    }}>
      {/* Linha de meta */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
        <span style={{fontSize:13,fontWeight:800,padding:"3px 10px",borderRadius:5,
          fontFamily:MONO,background:tipoBg,color:tipoCor,border:`1px solid ${tipoBord}`,
          flexShrink:0,letterSpacing:"0.04em"}}>
          {doc.tipo}
        </span>
        <span style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:MONO}}>
          Nº {doc.numero}
        </span>
        <span style={{fontSize:14,color:C.textDim,fontFamily:MONO}}>
          · {doc.ano}{doc.mes ? ` · ${doc.mes}` : ""}
        </span>
        <span style={{marginLeft:"auto",fontSize:13,color:C.textDim,fontFamily:MONO,flexShrink:0}}>
          {doc.data_modificacao}
        </span>
      </div>

      {/* Assunto */}
      <div style={{fontSize:15,color:C.text,lineHeight:1.6,fontWeight:500}}>
        {highlight(doc.assunto || "—")}
      </div>

      {/* Download */}
      {doc.file_id && (
        <div style={{display:"flex",gap:6,marginTop:10}}>
          <button
            onClick={async () => {
              try {
                const res  = await api.get(`/referencias/download/docx/${doc.file_id}`)
                const blob = await res.blob()
                const url  = URL.createObjectURL(blob)
                const a    = document.createElement("a")
                a.href = url; a.download = `${doc.file_id}.docx`; a.click()
                URL.revokeObjectURL(url)
              } catch {}
            }}
            style={{fontSize:13,fontWeight:800,color:"#FFF",background:"#1D4ED8",
              padding:"5px 12px",borderRadius:6,border:"none",cursor:"pointer",
              fontFamily:MONO,letterSpacing:"0.04em"}}>
            ⬇ DOCX
          </button>
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function Referencias({ onNavigate }) {
  const [todos,   setTodos]   = useState([])
  const [anos,    setAnos]    = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [erro,    setErro]    = useState(false)
  const [q,       setQ]       = useState("")
  const [ano,     setAno]     = useState("")
  const [tipo,    setTipo]    = useState("")

  useEffect(() => {
    api.get("/referencias")
      .then(r => r?.json())
      .then(d => {
        setTodos(d.documentos || [])
        setAnos(d.anos || [])
        setTotal(d.total_indexados || 0)
        setLoading(false)
      })
      .catch(() => { setErro(true); setLoading(false) })
  }, [])

  const resultados = useMemo(() => {
    const termo = q.trim().toUpperCase()
    return todos.filter(doc => {
      if (ano  && doc.ano  !== ano)  return false
      if (tipo && doc.tipo !== tipo) return false
      if (termo) {
        const assunto = (doc.assunto || "").toUpperCase()
        if (!assunto.includes(termo) && !(doc.numero||"").includes(termo)) return false
      }
      return true
    }).slice(0, 150)
  }, [todos, q, ano, tipo])

  // Contagem por tipo para os filtros
  const countTipo = t => t === "" ? todos.length : todos.filter(d => d.tipo === t).length

  return (
    <div style={{display:"flex",flex:1,minWidth:0,height:"100%",overflow:"hidden",
      background:C.bg,fontFamily:SANS,color:C.text}}>

      {/* ── ASIDE ──────────────────────────────────────────────────────────── */}
      <aside style={{
        width:268, flexShrink:0,
        background:C.surface,
        borderRight:`1px solid ${C.border}`,
        display:"flex", flexDirection:"column",
        height:"100%", overflow:"hidden",
      }}>

        {/* Header */}
        <div style={{padding:"16px 16px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
            <div style={{width:3,height:18,background:C.accent,borderRadius:2,
              boxShadow:`0 0 6px ${C.accent}88`}}/>
            <span style={{fontSize:13,fontWeight:800,color:C.accent,
              letterSpacing:"0.1em",textTransform:"uppercase"}}>
              Referências
            </span>
          </div>
          <div style={{fontSize:13,color:C.textMid,marginLeft:11,marginTop:2}}>
            Drive institucional indexado
          </div>
        </div>

        {/* Contadores */}
        <div style={{display:"flex",gap:6,padding:"12px 14px",
          borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{flex:1,textAlign:"center",padding:"8px 4px",
            background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:8}}>
            <div style={{fontSize:24,fontWeight:800,color:C.accent,fontFamily:MONO,lineHeight:1}}>
              {loading ? "—" : total}
            </div>
            <div style={{fontSize:12,color:C.textDim,marginTop:4}}>Indexados</div>
          </div>
          <div style={{flex:1,textAlign:"center",padding:"8px 4px",
            background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:8}}>
            <div style={{fontSize:24,fontWeight:800,color:"#4ADE80",fontFamily:MONO,lineHeight:1}}>
              {loading ? "—" : resultados.length}
            </div>
            <div style={{fontSize:12,color:C.textDim,marginTop:4}}>Filtrados</div>
          </div>
        </div>

        {/* Busca */}
        <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{position:"relative"}}>
            <svg style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",
              pointerEvents:"none"}} width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={q} onChange={e=>setQ(e.target.value)}
              placeholder="Buscar por nome, vulgo, assunto..."
              style={{width:"100%",paddingLeft:32,paddingRight:12,height:38,
                borderRadius:7,border:`1px solid ${C.border}`,
                background:"rgba(255,255,255,0.05)",fontSize:14,color:C.text,
                outline:"none",fontFamily:SANS,boxSizing:"border-box",caretColor:C.accent}}
            />
          </div>
        </div>

        {/* Filtro por tipo */}
        <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{fontSize:11,fontWeight:700,color:C.textDim,letterSpacing:"0.1em",
            textTransform:"uppercase",fontFamily:MONO,marginBottom:8}}>
            Tipo de documento
          </div>
          {TIPOS.map(t => {
            const ativo = tipo === t.val
            return (
              <button key={t.val} onClick={()=>setTipo(t.val)} style={{
                width:"100%", textAlign:"left", padding:"9px 12px",
                borderRadius:8, marginBottom:4, cursor:"pointer", border:"none",
                background: ativo ? t.bg : "transparent",
                borderLeft: `3px solid ${ativo ? t.cor : "transparent"}`,
                display:"flex", alignItems:"center", justifyContent:"space-between",
                transition:"all 0.12s",
              }}>
                <span style={{fontSize:15,fontWeight:ativo?700:500,
                  color:ativo?t.cor:C.textMid}}>
                  {t.label}
                </span>
                <span style={{fontSize:13,fontWeight:700,color:ativo?t.cor:C.textDim,
                  fontFamily:MONO}}>
                  {countTipo(t.val)}
                </span>
              </button>
            )
          })}
        </div>

        {/* Filtro por ano */}
        <div style={{flex:1,overflowY:"auto",padding:"10px 12px"}}>
          <div style={{fontSize:11,fontWeight:700,color:C.textDim,letterSpacing:"0.1em",
            textTransform:"uppercase",fontFamily:MONO,marginBottom:8}}>
            Ano
          </div>

          {/* Todos os anos */}
          <button onClick={()=>setAno("")} style={{
            width:"100%", textAlign:"left", padding:"8px 12px",
            borderRadius:8, marginBottom:4, cursor:"pointer", border:"none",
            background: ano==="" ? C.goldSoft : "transparent",
            borderLeft: `3px solid ${ano===""?C.accent:"transparent"}`,
            transition:"all 0.12s",
          }}>
            <span style={{fontSize:15,fontWeight:ano===""?700:500,
              color:ano===""?C.accent:C.textMid}}>
              Todos os anos
            </span>
          </button>

          {anos.map(a => {
            const ativo = ano === a
            const qtd   = todos.filter(d => d.ano === a).length
            return (
              <button key={a} onClick={()=>setAno(a)} style={{
                width:"100%", textAlign:"left", padding:"8px 12px",
                borderRadius:8, marginBottom:4, cursor:"pointer", border:"none",
                background: ativo ? C.goldSoft : "transparent",
                borderLeft: `3px solid ${ativo ? C.accent : "transparent"}`,
                display:"flex", alignItems:"center", justifyContent:"space-between",
                transition:"all 0.12s",
              }}>
                <span style={{fontSize:15,fontWeight:ativo?700:500,
                  color:ativo?C.accent:C.textMid,fontFamily:MONO}}>
                  {a}
                </span>
                <span style={{fontSize:13,fontWeight:700,
                  color:ativo?C.accent:C.textDim,fontFamily:MONO}}>
                  {qtd}
                </span>
              </button>
            )
          })}
        </div>
      </aside>

      {/* ── MAIN ───────────────────────────────────────────────────────────── */}
      <div style={{display:"flex",flexDirection:"column",flex:1,minWidth:0,
        height:"100%",overflow:"hidden"}}>

        {/* Topbar */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"0 22px", height:56,
          borderBottom:`1px solid ${C.border}`,
          background:C.surface, flexShrink:0,
        }}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{display:"flex",gap:6}}>
              {["#FF5F57","#FEBC2E","#28C840"].map(cor=>(
                <div key={cor} style={{width:12,height:12,borderRadius:"50%",background:cor}}/>
              ))}
            </div>
            <div>
              <div style={{fontSize:17,fontWeight:700,color:C.text}}>
                Busca de Referências
              </div>
              <div style={{fontSize:13,color:C.textMid,fontFamily:MONO,marginTop:1}}>
                {loading ? "Carregando índice..."
                 : erro   ? "Backend offline — verifique o api.py"
                 : `${total} documentos indexados · Google Drive`}
              </div>
            </div>
          </div>

          {/* Badges de tipo ativo */}
          <div style={{display:"flex",gap:6}}>
            {TIPOS.filter(t=>t.val!=="").map(t=>(
              <span key={t.val} style={{fontSize:13,fontWeight:800,padding:"4px 12px",
                borderRadius:6,fontFamily:MONO,background:t.bg,
                color:t.cor,border:`1px solid ${t.border}`}}>
                {t.label}
              </span>
            ))}
          </div>
        </div>

        {/* Barra de resultado + busca ativa */}
        {(q.trim() || ano || tipo) && (
          <div style={{padding:"8px 22px",background:C.bg,
            borderBottom:`1px solid ${C.border}`,flexShrink:0,
            display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:14,color:C.textDim,fontFamily:MONO}}>
              {resultados.length} resultado{resultados.length!==1?"s":""}
            </span>
            {q.trim() && (
              <span style={{fontSize:14,color:"#A78BFA",fontWeight:700,fontFamily:MONO}}>
                · "{q.trim()}"
              </span>
            )}
            {ano && (
              <span style={{fontSize:13,color:C.accent,fontFamily:MONO,
                background:C.goldSoft,padding:"2px 10px",borderRadius:5,
                border:`1px solid ${C.goldBorder}`}}>
                {ano}
              </span>
            )}
            {tipo && (
              <span style={{fontSize:13,fontWeight:700,fontFamily:MONO,
                color:TIPOS.find(t=>t.val===tipo)?.cor||C.textMid}}>
                {tipo}
              </span>
            )}
            <button onClick={()=>{setQ("");setAno("");setTipo("")}} style={{
              marginLeft:"auto",fontSize:13,color:C.textDim,background:"transparent",
              border:`1px solid ${C.border}`,borderRadius:6,padding:"3px 10px",
              cursor:"pointer",fontFamily:MONO}}>
              × Limpar filtros
            </button>
          </div>
        )}

        {/* Lista */}
        <div className="ref-scroll" style={{flex:1,overflowY:"auto",padding:"14px 22px"}}>

          {loading && (
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",
              height:200}}>
              <span style={{fontSize:15,color:C.textDim,fontFamily:MONO}}>
                Carregando índice do Drive...
              </span>
            </div>
          )}

          {erro && (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",
              justifyContent:"center",height:200,gap:10}}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
                stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span style={{fontSize:16,color:"#FCA5A5",fontWeight:700}}>Backend offline</span>
              <span style={{fontSize:14,color:C.textDim,fontFamily:MONO}}>
                Verifique se o api.py está rodando na porta 8000
              </span>
            </div>
          )}

          {!loading && !erro && resultados.length === 0 && (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",
              justifyContent:"center",height:200,gap:8}}>
              <span style={{fontSize:16,color:C.textDim,fontWeight:600}}>
                Nenhum documento encontrado
              </span>
              {q.trim() && (
                <span style={{fontSize:14,color:C.textDim,fontFamily:MONO}}>
                  Tente outro nome ou vulgo
                </span>
              )}
            </div>
          )}

          {!loading && !erro && resultados.map((doc, i) => (
            <DocCard key={i} doc={doc} termo={q}/>
          ))}

          {!loading && !erro && resultados.length === 150 && (
            <div style={{textAlign:"center",padding:"14px 0",fontSize:14,
              color:C.textDim,fontFamily:MONO}}>
              Exibindo os primeiros 150 resultados — refine a busca para ver mais
            </div>
          )}
        </div>
      </div>

      <style>{`
        .ref-card:hover { border-color: rgba(232,160,32,0.3) !important;
          background: rgba(232,160,32,0.04) !important; }
        .ref-scroll::-webkit-scrollbar { width:6px; }
        .ref-scroll::-webkit-scrollbar-track { background:transparent; }
        .ref-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.14);border-radius:6px; }
        .ref-scroll::-webkit-scrollbar-thumb:hover { background:rgba(232,160,32,0.4); }
        input::placeholder { color: #64748B !important; }
      `}</style>
    </div>
  )
}
