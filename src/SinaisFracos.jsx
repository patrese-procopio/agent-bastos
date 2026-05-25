import { useState, useEffect, useCallback } from "react"
import api from "./api"
import { C, MONO, SANS } from "./theme"

/* ============================================================
   DICIONÁRIO DE SINAIS FRACOS
   Léxico persistente de jargões que a IA detectou nos extratos,
   com loop de validação humana. Termos validados voltam como
   contexto do prompt de extração → detecção consistente.
   ============================================================ */

const CSS = `
  .sf-row:hover { background: rgba(232,160,32,0.05) !important; }
  .sf-btn { transition: all .12s; }
  .sf-btn:hover { filter: brightness(1.15); transform: translateY(-1px); }
`
const NIVEL_COR = {
  ALTO:  { c:"#F87171", b:"rgba(239,68,68,0.14)", bd:"rgba(239,68,68,0.4)" },
  "MÉDIO":{ c:"#FBBF24", b:"rgba(251,191,36,0.14)", bd:"rgba(251,191,36,0.4)" },
  BAIXO: { c:"#4ADE80", b:"rgba(74,222,128,0.14)", bd:"rgba(74,222,128,0.4)" },
}
const STATUS_COR = {
  validado:  { c:"#4ADE80", t:"VALIDADO" },
  candidato: { c:"#FBBF24", t:"CANDIDATO" },
  rejeitado: { c:"#94A3B8", t:"REJEITADO" },
}

export default function SinaisFracos() {
  const [termos, setTermos] = useState([])
  const [filtro, setFiltro] = useState("todos")
  const [busca, setBusca]   = useState("")
  const [edit, setEdit]     = useState(null)   // {termo, significado, nivel}
  const [toast, setToast]   = useState(null)
  const [busy, setBusy]     = useState(false)

  const aviso = (m,c=C.gold)=>{ setToast({m,c}); setTimeout(()=>setToast(null),2800) }

  useEffect(()=>{ const s=document.createElement("style"); s.textContent=CSS; document.head.appendChild(s); return ()=>document.head.removeChild(s) },[])

  const carregar = useCallback(async ()=>{
    try { const r=await api.get("/extrato/lexico"); if(r.ok) setTermos((await r.json()).termos||[]) } catch {}
  },[])
  useEffect(()=>{ carregar() },[carregar])

  const validar = async (t)=>{
    setBusy(true)
    try {
      const body = edit && edit.termo===t.termo ? {termo:t.termo, significado:edit.significado, nivel:edit.nivel} : {termo:t.termo}
      const r = await api.post("/extrato/lexico/validar", body)
      if (r.ok){ aviso("Termo validado — entra no contexto da IA.", C.green); setEdit(null); carregar() }
      else aviso("Falha ao validar.", C.red)
    } catch { aviso("Erro de conexão.", C.red) }
    setBusy(false)
  }
  const rejeitar = async (t)=>{
    setBusy(true)
    try {
      const r = await api.post("/extrato/lexico/rejeitar", {termo:t.termo})
      if (r.ok){ aviso("Termo rejeitado.", C.textMid); carregar() } else aviso("Falha.", C.red)
    } catch { aviso("Erro de conexão.", C.red) }
    setBusy(false)
  }

  const lista = termos
    .filter(t=> filtro==="todos" || t.status===filtro)
    .filter(t=> !busca || t.termo_original.toLowerCase().includes(busca.toLowerCase()) || (t.significado||"").toLowerCase().includes(busca.toLowerCase()))

  const kpi = {
    total: termos.length,
    validados: termos.filter(t=>t.status==="validado").length,
    candidatos: termos.filter(t=>t.status==="candidato").length,
    alto: termos.filter(t=>t.nivel==="ALTO").length,
  }

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div>
          <div style={S.title}>Dicionário de Sinais Fracos</div>
          <div style={S.sub}>Jargões traduzidos pela IA · validação humana · realimentam o motor de extração</div>
        </div>
        <input style={S.search} placeholder="buscar termo ou significado…" value={busca} onChange={e=>setBusca(e.target.value)}/>
      </header>

      <div style={S.body}>
        <div style={S.kpis}>
          <Kpi n={kpi.total} l="Termos no léxico" cor={C.text}/>
          <Kpi n={kpi.validados} l="Validados (no prompt)" cor="#4ADE80"/>
          <Kpi n={kpi.candidatos} l="Aguardando validação" cor="#FBBF24"/>
          <Kpi n={kpi.alto} l="Nível ALTO" cor="#F87171"/>
        </div>

        <div style={S.filtros}>
          {[["todos","Todos"],["candidato","Candidatos"],["validado","Validados"],["rejeitado","Rejeitados"]].map(([k,l])=>(
            <button key={k} className="sf-btn" onClick={()=>setFiltro(k)}
              style={{...S.fbtn, ...(filtro===k?S.fbtnA:{})}}>{l}</button>
          ))}
        </div>

        <div style={S.tableWrap}>
          <div style={{...S.tr, ...S.th}}>
            <div style={S.cTermo}>Termo em campo</div>
            <div style={S.cOco}>Ocorr. (7d/total)</div>
            <div style={S.cUni}>Unidades</div>
            <div style={S.cSig}>Significado (IA)</div>
            <div style={S.cNiv}>Nível</div>
            <div style={S.cAcao}>Status / Ações</div>
          </div>
          {lista.length===0 && <div style={S.vazio}>Nenhum termo. Submeta extratos no Módulo Extrato para popular o léxico.</div>}
          {lista.map((t,i)=>{
            const nc = NIVEL_COR[t.nivel] || NIVEL_COR["MÉDIO"]
            const sc = STATUS_COR[t.status] || STATUS_COR.candidato
            const emEdicao = edit && edit.termo===t.termo
            return (
              <div key={i} className="sf-row" style={S.tr}>
                <div style={S.cTermo}><span style={{fontSize:14,fontWeight:700,color:C.text}}>«{t.termo_original}»</span></div>
                <div style={S.cOco}><span style={{color:C.gold,fontWeight:700}}>{t.ocorrencias_7d}</span> <span style={{color:C.textDim}}>/ {t.ocorrencias}</span></div>
                <div style={S.cUni}>{(t.unidades||[]).length ? t.unidades.map((u,j)=><span key={j} style={S.uniTag}>{u}</span>) : <span style={{color:C.textDim}}>—</span>}</div>
                <div style={S.cSig}>
                  {emEdicao
                    ? <input style={S.editInput} value={edit.significado} onChange={e=>setEdit({...edit,significado:e.target.value})}/>
                    : <span style={{fontSize:12.5,color:C.textMid,lineHeight:1.45}}>{t.significado||"—"}</span>}
                </div>
                <div style={S.cNiv}>
                  {emEdicao
                    ? <select style={S.editSel} value={edit.nivel} onChange={e=>setEdit({...edit,nivel:e.target.value})}>
                        <option>ALTO</option><option>MÉDIO</option><option>BAIXO</option></select>
                    : <span style={badge(nc.c,nc.b,nc.bd)}>{t.nivel}</span>}
                </div>
                <div style={S.cAcao}>
                  <span style={{...badge(sc.c, sc.c+"22", sc.c+"55"), marginRight:6}}>{sc.t}</span>
                  {t.status!=="validado" && !emEdicao &&
                    <button className="sf-btn" disabled={busy} onClick={()=>setEdit({termo:t.termo, significado:t.significado||"", nivel:t.nivel||"MÉDIO"})} style={S.actEdit}>revisar</button>}
                  {emEdicao && <>
                    <button className="sf-btn" disabled={busy} onClick={()=>validar(t)} style={S.actOk}>✓ validar</button>
                    <button className="sf-btn" disabled={busy} onClick={()=>setEdit(null)} style={S.actCancel}>cancelar</button>
                  </>}
                  {t.status==="validado" && !emEdicao &&
                    <button className="sf-btn" disabled={busy} onClick={()=>setEdit({termo:t.termo, significado:t.significado||"", nivel:t.nivel||"MÉDIO"})} style={S.actEdit}>editar</button>}
                  {t.status!=="rejeitado" && !emEdicao &&
                    <button className="sf-btn" disabled={busy} onClick={()=>rejeitar(t)} style={S.actNo}>✕</button>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {toast && <div style={{...S.toast,borderColor:toast.c,color:toast.c}}>{toast.m}</div>}
    </div>
  )
}

const Kpi = ({n,l,cor}) => (
  <div style={S.kpi}>
    <div style={{fontSize:30,fontWeight:900,color:cor,lineHeight:1}}>{n}</div>
    <div style={{fontSize:11,color:C.textMid,marginTop:5,fontFamily:MONO}}>{l}</div>
  </div>
)
const badge = (color,bg,border) => ({fontSize:10,fontWeight:800,padding:"2px 8px",borderRadius:4,letterSpacing:"0.05em",fontFamily:MONO,color,background:bg,border:`1px solid ${border}`,whiteSpace:"nowrap"})

const S = {
  page:{display:"flex",flexDirection:"column",flex:1,minWidth:0,height:"100%",overflow:"hidden",background:C.bg,fontFamily:SANS},
  header:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,padding:"14px 22px",borderBottom:`1px solid ${C.border}`,background:C.surface,flexShrink:0},
  title:{fontSize:17,fontWeight:800,color:C.text},
  sub:{fontSize:11.5,color:C.textMid,fontFamily:MONO,marginTop:2},
  search:{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.borderUp}`,borderRadius:7,padding:"8px 12px",fontSize:13,color:C.text,outline:"none",fontFamily:MONO,width:280,caretColor:C.gold},
  body:{flex:1,overflowY:"auto",padding:"18px 22px"},
  kpis:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16},
  kpi:{background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px"},
  filtros:{display:"flex",gap:8,marginBottom:14},
  fbtn:{padding:"7px 14px",borderRadius:7,fontSize:12,fontWeight:600,color:C.textMid,background:"transparent",border:`1px solid ${C.border}`,cursor:"pointer",fontFamily:MONO},
  fbtnA:{background:C.goldSoft,color:C.gold,borderColor:C.goldBorder},
  tableWrap:{border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"},
  tr:{display:"grid",gridTemplateColumns:"1.3fr 1fr 1.4fr 2.6fr 0.9fr 1.8fr",gap:10,alignItems:"center",padding:"10px 14px",borderBottom:`1px solid ${C.border}`},
  th:{background:"rgba(255,255,255,0.04)",position:"sticky",top:0},
  cTermo:{}, cOco:{fontFamily:MONO,fontSize:12.5}, cUni:{display:"flex",gap:4,flexWrap:"wrap"},
  cSig:{}, cNiv:{}, cAcao:{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"},
  uniTag:{fontSize:10,color:C.textMid,fontFamily:MONO,background:"rgba(255,255,255,0.05)",padding:"1px 6px",borderRadius:4,border:`1px solid ${C.border}`},
  editInput:{width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid ${C.goldBorder}`,borderRadius:6,padding:"6px 9px",fontSize:12.5,color:C.text,outline:"none",fontFamily:SANS},
  editSel:{background:"rgba(255,255,255,0.06)",border:`1px solid ${C.goldBorder}`,borderRadius:6,padding:"5px 6px",fontSize:11,color:C.text,outline:"none",fontFamily:MONO},
  actEdit:{padding:"4px 9px",borderRadius:6,border:`1px solid ${C.borderUp}`,background:"rgba(255,255,255,0.05)",color:C.textMid,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:MONO},
  actOk:{padding:"4px 9px",borderRadius:6,border:"1px solid rgba(74,222,128,0.4)",background:"rgba(74,222,128,0.12)",color:"#4ADE80",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:MONO},
  actCancel:{padding:"4px 9px",borderRadius:6,border:`1px solid ${C.border}`,background:"transparent",color:C.textDim,fontSize:11,cursor:"pointer",fontFamily:MONO},
  actNo:{padding:"4px 8px",borderRadius:6,border:"1px solid rgba(239,68,68,0.3)",background:"rgba(239,68,68,0.1)",color:"#F87171",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:MONO},
  vazio:{padding:"28px",textAlign:"center",fontSize:12.5,color:C.textDim,fontFamily:MONO},
  toast:{position:"fixed",bottom:26,left:"50%",transform:"translateX(-50%)",background:"#0A0F1C",border:"1px solid",borderRadius:10,padding:"12px 20px",fontSize:13,fontWeight:600,fontFamily:MONO,zIndex:9999,boxShadow:"0 8px 30px rgba(0,0,0,0.5)"},
}
