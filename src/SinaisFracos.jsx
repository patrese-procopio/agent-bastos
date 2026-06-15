import { useState, useEffect, useCallback } from "react"
import api from "./api"
import { C, MONO, SANS } from "./theme"

/*
  DICIONÁRIO DE SINAIS FRACOS
  Léxico persistente de jargões detectados pela IA nos extratos,
  com loop de validação humana. Termos validados voltam como
  contexto do prompt de extração → detecção consistente.
*/

const CSS = `
  .sf-row:hover { background: rgba(232,160,32,0.05) !important; }
  .sf-btn { transition: all .12s; }
  .sf-btn:hover { filter: brightness(1.15); transform: translateY(-1px); }
  .sf-scroll::-webkit-scrollbar { width:6px; }
  .sf-scroll::-webkit-scrollbar-track { background:transparent; }
  .sf-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.14);border-radius:6px; }
  .sf-scroll::-webkit-scrollbar-thumb:hover { background:rgba(232,160,32,0.4); }
  input::placeholder { color: #64748B !important; }
  select option { background: #111827; color: #F1F5F9; }
`

const NIVEL_COR = {
  ALTO:    {c:"#FCA5A5", b:"rgba(239,68,68,0.14)",  bd:"rgba(239,68,68,0.4)"},
  "MÉDIO": {c:"#FDE68A", b:"rgba(251,191,36,0.14)", bd:"rgba(251,191,36,0.4)"},
  BAIXO:   {c:"#86EFAC", b:"rgba(74,222,128,0.14)", bd:"rgba(74,222,128,0.4)"},
}
const STATUS_COR = {
  validado:  {c:"#4ADE80", t:"VALIDADO"},
  candidato: {c:"#FBBF24", t:"CANDIDATO"},
  rejeitado: {c:"#94A3B8", t:"REJEITADO"},
}

const FILTROS = [
  {k:"todos",     l:"Todos"},
  {k:"candidato", l:"Candidatos"},
  {k:"validado",  l:"Validados"},
  {k:"rejeitado", l:"Rejeitados"},
]

const badge = (color, bg, border) => ({
  fontSize:13, fontWeight:800, padding:"3px 10px", borderRadius:5,
  letterSpacing:"0.04em", fontFamily:MONO, color, background:bg,
  border:`1px solid ${border}`, whiteSpace:"nowrap",
})

export default function SinaisFracos() {
  const [termos, setTermos] = useState([])
  const [filtro, setFiltro] = useState("todos")
  const [busca,  setBusca]  = useState("")
  const [edit,   setEdit]   = useState(null)
  const [toast,  setToast]  = useState(null)
  const [busy,   setBusy]   = useState(false)

  const aviso = (m, c=C.gold) => { setToast({m,c}); setTimeout(()=>setToast(null), 2800) }

  useEffect(() => {
    const s = document.createElement("style"); s.textContent = CSS
    document.head.appendChild(s); return () => document.head.removeChild(s)
  }, [])

  const carregar = useCallback(async () => {
    try {
      const r = await api.get("/extrato/lexico")
      if (r.ok) setTermos((await r.json()).termos || [])
    } catch {}
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const validar = async (t) => {
    setBusy(true)
    try {
      const body = edit && edit.termo === t.termo
        ? {termo:t.termo, significado:edit.significado, nivel:edit.nivel}
        : {termo:t.termo}
      const r = await api.post("/extrato/lexico/validar", body)
      if (r.ok) { aviso("Termo validado — entra no contexto da IA.", C.green); setEdit(null); carregar() }
      else aviso("Falha ao validar.", C.red)
    } catch { aviso("Erro de conexão.", C.red) }
    setBusy(false)
  }

  const rejeitar = async (t) => {
    setBusy(true)
    try {
      const r = await api.post("/extrato/lexico/rejeitar", {termo:t.termo})
      if (r.ok) { aviso("Termo rejeitado.", C.textMid); carregar() }
      else aviso("Falha.", C.red)
    } catch { aviso("Erro de conexão.", C.red) }
    setBusy(false)
  }

  const lista = termos
    .filter(t => filtro === "todos" || t.status === filtro)
    .filter(t => !busca ||
      t.termo_original.toLowerCase().includes(busca.toLowerCase()) ||
      (t.significado||"").toLowerCase().includes(busca.toLowerCase()))

  const kpi = {
    total:      termos.length,
    validados:  termos.filter(t => t.status === "validado").length,
    candidatos: termos.filter(t => t.status === "candidato").length,
    alto:       termos.filter(t => t.nivel  === "ALTO").length,
  }

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
            <div style={{width:3,height:18,background:C.gold,borderRadius:2,
              boxShadow:`0 0 6px ${C.gold}88`}}/>
            <span style={{fontSize:13,fontWeight:800,color:C.gold,
              letterSpacing:"0.1em",textTransform:"uppercase"}}>
              Sinais Fracos
            </span>
          </div>
          <div style={{fontSize:13,color:C.textMid,marginLeft:11,marginTop:2}}>
            Léxico de jargões operacionais
          </div>
        </div>

        {/* KPIs */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,
          padding:"12px 14px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          {[
            {n:kpi.total,      l:"No léxico",   cor:C.text},
            {n:kpi.validados,  l:"Validados",   cor:"#4ADE80"},
            {n:kpi.candidatos, l:"Candidatos",  cor:"#FBBF24"},
            {n:kpi.alto,       l:"Nível Alto",  cor:"#FCA5A5"},
          ].map(({n,l,cor})=>(
            <div key={l} style={{textAlign:"center",padding:"8px 4px",
              background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,
              borderRadius:8}}>
              <div style={{fontSize:24,fontWeight:800,color:cor,fontFamily:MONO,lineHeight:1}}>{n}</div>
              <div style={{fontSize:12,color:C.textDim,marginTop:4}}>{l}</div>
            </div>
          ))}
        </div>

        {/* Busca */}
        <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{position:"relative"}}>
            <svg style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",
              pointerEvents:"none"}} width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={busca} onChange={e=>setBusca(e.target.value)}
              placeholder="Buscar termo ou significado..."
              style={{width:"100%",paddingLeft:32,paddingRight:12,height:38,
                borderRadius:7,border:`1px solid ${C.border}`,
                background:"rgba(255,255,255,0.05)",fontSize:14,color:C.text,
                outline:"none",fontFamily:SANS,boxSizing:"border-box",caretColor:C.gold}}
            />
          </div>
        </div>

        {/* Filtro de status */}
        <div style={{flex:1,overflowY:"auto",padding:"10px 12px"}}>
          <div style={{fontSize:11,fontWeight:700,color:C.textDim,letterSpacing:"0.1em",
            textTransform:"uppercase",fontFamily:MONO,marginBottom:8}}>
            Status
          </div>
          {FILTROS.map(({k,l}) => {
            const ativo  = filtro === k
            const qtd    = k==="todos" ? termos.length
              : termos.filter(t=>t.status===k).length
            const sc     = STATUS_COR[k]
            const cor    = ativo ? (sc?.c || C.gold) : C.textMid
            const bg     = ativo ? (sc ? `${sc.c}20` : C.goldSoft) : "transparent"
            const border = ativo ? (sc?.c || C.gold) : "transparent"
            return (
              <button key={k} onClick={()=>setFiltro(k)} style={{
                width:"100%", textAlign:"left", padding:"9px 12px",
                borderRadius:8, marginBottom:4, cursor:"pointer", border:"none",
                background:bg,
                borderLeft:`3px solid ${border}`,
                display:"flex", alignItems:"center", justifyContent:"space-between",
                transition:"all 0.12s",
              }}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  {sc && <span style={{width:7,height:7,borderRadius:"50%",
                    background:sc.c,flexShrink:0,
                    opacity:ativo?1:0.5}}/>}
                  <span style={{fontSize:15,fontWeight:ativo?700:500,color:cor}}>
                    {l}
                  </span>
                </div>
                <span style={{fontSize:13,fontWeight:700,color:ativo?cor:C.textDim,
                  fontFamily:MONO}}>
                  {qtd}
                </span>
              </button>
            )
          })}

          {/* Dica */}
          <div style={{marginTop:16,padding:"12px 14px",borderRadius:8,
            background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`}}>
            <div style={{fontSize:12,fontWeight:700,color:C.gold,fontFamily:MONO,
              marginBottom:6,letterSpacing:"0.08em"}}>◈ COMO FUNCIONA</div>
            <div style={{fontSize:13,color:C.textMid,lineHeight:1.6}}>
              Termos <b style={{color:"#4ADE80"}}>validados</b> voltam como contexto para o motor de extração — a IA passa a reconhecê-los automaticamente.
            </div>
          </div>
        </div>
      </aside>

      {/* ── MAIN ───────────────────────────────────────────────────────────── */}
      <div style={{display:"flex",flexDirection:"column",flex:1,minWidth:0,height:"100%",overflow:"hidden"}}>

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
                Dicionário de Sinais Fracos
              </div>
              <div style={{fontSize:13,color:C.textMid,fontFamily:MONO,marginTop:1}}>
                {lista.length} termo{lista.length!==1?"s":""} · {filtro==="todos"?"todos os status":filtro}
              </div>
            </div>
          </div>

          <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 14px",
            background:"rgba(74,222,128,0.08)",borderRadius:8,
            border:"1px solid rgba(74,222,128,0.2)"}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:"#22C55E",
              boxShadow:"0 0 6px rgba(34,197,94,0.7)"}}/>
            <span style={{fontSize:13,color:"#4ADE80",fontWeight:600}}>
              {kpi.validados} termo{kpi.validados!==1?"s":""} ativos no prompt
            </span>
          </div>
        </div>

        {/* Tabela */}
        <div className="sf-scroll" style={{flex:1,overflowY:"auto",padding:"16px 22px"}}>

          {/* Cabeçalho da tabela */}
          <div style={{
            display:"grid",
            gridTemplateColumns:"1.4fr 0.9fr 1.3fr 2.5fr 0.9fr 2fr",
            gap:10, alignItems:"center",
            padding:"10px 16px",
            background:"rgba(255,255,255,0.04)",
            borderRadius:"8px 8px 0 0",
            border:`1px solid ${C.border}`,
            borderBottom:"none",
            position:"sticky", top:0, zIndex:2,
          }}>
            {["Termo em campo","Ocorr. 7d/total","Unidades","Significado (IA)","Nível","Status / Ações"].map(h=>(
              <div key={h} style={{fontSize:12,fontWeight:700,color:C.textDim,
                letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:MONO}}>
                {h}
              </div>
            ))}
          </div>

          {/* Linhas */}
          <div style={{border:`1px solid ${C.border}`,borderRadius:"0 0 8px 8px",overflow:"hidden"}}>
            {lista.length === 0 && (
              <div style={{padding:"32px",textAlign:"center",fontSize:14,
                color:C.textDim,fontFamily:MONO}}>
                Nenhum termo. Submeta extratos no Módulo Extrato para popular o léxico.
              </div>
            )}
            {lista.map((t, i) => {
              const nc     = NIVEL_COR[t.nivel] || NIVEL_COR["MÉDIO"]
              const sc     = STATUS_COR[t.status] || STATUS_COR.candidato
              const emEdicao = edit && edit.termo === t.termo
              return (
                <div key={i} className="sf-row" style={{
                  display:"grid",
                  gridTemplateColumns:"1.4fr 0.9fr 1.3fr 2.5fr 0.9fr 2fr",
                  gap:10, alignItems:"center",
                  padding:"12px 16px",
                  borderBottom:`1px solid ${C.border}`,
                  transition:"background 0.12s",
                }}>
                  {/* Termo */}
                  <div>
                    <span style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:MONO}}>
                      «{t.termo_original}»
                    </span>
                  </div>

                  {/* Ocorrências */}
                  <div style={{fontFamily:MONO,fontSize:14}}>
                    <span style={{color:C.gold,fontWeight:700}}>{t.ocorrencias_7d}</span>
                    <span style={{color:C.textDim}}> / {t.ocorrencias}</span>
                  </div>

                  {/* Unidades */}
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    {(t.unidades||[]).length
                      ? t.unidades.map((u,j)=>(
                          <span key={j} style={{fontSize:12,color:C.textMid,fontFamily:MONO,
                            background:"rgba(255,255,255,0.05)",padding:"2px 8px",
                            borderRadius:4,border:`1px solid ${C.border}`}}>
                            {u}
                          </span>
                        ))
                      : <span style={{color:C.textDim,fontSize:14}}>—</span>}
                  </div>

                  {/* Significado */}
                  <div>
                    {emEdicao
                      ? <input value={edit.significado}
                          onChange={e=>setEdit({...edit,significado:e.target.value})}
                          style={{width:"100%",background:"rgba(255,255,255,0.06)",
                            border:`1px solid ${C.goldBorder}`,borderRadius:6,
                            padding:"7px 10px",fontSize:14,color:C.text,
                            outline:"none",fontFamily:SANS}}/>
                      : <span style={{fontSize:14,color:C.textMid,lineHeight:1.5}}>
                          {t.significado||"—"}
                        </span>}
                  </div>

                  {/* Nível */}
                  <div>
                    {emEdicao
                      ? <select value={edit.nivel}
                          onChange={e=>setEdit({...edit,nivel:e.target.value})}
                          style={{background:"rgba(255,255,255,0.06)",
                            border:`1px solid ${C.goldBorder}`,borderRadius:6,
                            padding:"6px 8px",fontSize:13,color:C.text,
                            outline:"none",fontFamily:MONO,width:"100%"}}>
                          <option>ALTO</option>
                          <option>MÉDIO</option>
                          <option>BAIXO</option>
                        </select>
                      : <span style={badge(nc.c, nc.b, nc.bd)}>{t.nivel}</span>}
                  </div>

                  {/* Status / Ações */}
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{...badge(sc.c, sc.c+"22", sc.c+"55")}}>{sc.t}</span>

                    {t.status !== "validado" && !emEdicao && (
                      <button className="sf-btn" disabled={busy}
                        onClick={()=>setEdit({termo:t.termo,significado:t.significado||"",nivel:t.nivel||"MÉDIO"})}
                        style={{padding:"4px 10px",borderRadius:6,
                          border:`1px solid ${C.borderUp}`,background:"rgba(255,255,255,0.05)",
                          color:C.textMid,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:MONO}}>
                        revisar
                      </button>
                    )}
                    {emEdicao && (
                      <>
                        <button className="sf-btn" disabled={busy} onClick={()=>validar(t)}
                          style={{padding:"4px 10px",borderRadius:6,
                            border:"1px solid rgba(74,222,128,0.4)",
                            background:"rgba(74,222,128,0.12)",
                            color:"#4ADE80",fontSize:13,fontWeight:700,
                            cursor:"pointer",fontFamily:MONO}}>
                          ✓ validar
                        </button>
                        <button className="sf-btn" disabled={busy} onClick={()=>setEdit(null)}
                          style={{padding:"4px 10px",borderRadius:6,
                            border:`1px solid ${C.border}`,background:"transparent",
                            color:C.textDim,fontSize:13,cursor:"pointer",fontFamily:MONO}}>
                          cancelar
                        </button>
                      </>
                    )}
                    {t.status === "validado" && !emEdicao && (
                      <button className="sf-btn" disabled={busy}
                        onClick={()=>setEdit({termo:t.termo,significado:t.significado||"",nivel:t.nivel||"MÉDIO"})}
                        style={{padding:"4px 10px",borderRadius:6,
                          border:`1px solid ${C.borderUp}`,background:"rgba(255,255,255,0.05)",
                          color:C.textMid,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:MONO}}>
                        editar
                      </button>
                    )}
                    {t.status !== "rejeitado" && !emEdicao && (
                      <button className="sf-btn" disabled={busy} onClick={()=>rejeitar(t)}
                        style={{padding:"4px 8px",borderRadius:6,
                          border:"1px solid rgba(239,68,68,0.3)",
                          background:"rgba(239,68,68,0.1)",
                          color:"#FCA5A5",fontSize:13,fontWeight:700,
                          cursor:"pointer",fontFamily:MONO}}>
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{position:"fixed",bottom:26,left:"50%",transform:"translateX(-50%)",
          background:"#0A0F1C",border:`1px solid ${toast.c}`,borderRadius:10,
          padding:"12px 22px",fontSize:14,fontWeight:700,fontFamily:MONO,
          zIndex:9999,boxShadow:"0 8px 30px rgba(0,0,0,0.5)",color:toast.c}}>
          {toast.m}
        </div>
      )}
    </div>
  )
}
