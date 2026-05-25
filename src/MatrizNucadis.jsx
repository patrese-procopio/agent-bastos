import { useState, useEffect, useCallback } from "react"
import api from "./api"
import { C, MONO, SANS } from "./theme"

/* ============================================================
   MATRIZ DE CALOR DOS NUCADIs
   Produtividade analítica por unidade: extratos, processados,
   risco alto e RAEs gerados. Métrica de gestão de recursos.
   ============================================================ */

const CSS = `
  .mn-bar-fill { transition: width .5s cubic-bezier(.2,.8,.2,1), box-shadow .4s ease; }
`

/* Escala de calor: frio (azul) → âmbar → quente (vermelho).
   ratio 0..1 = volume da unidade relativo ao maior. Quanto mais extratos,
   maior a temperatura — a unidade #1 fica vermelha-quente com brilho. */
/* Modos de temperatura: por volume, por risco ALTO, ou combinado (risco pesa 2x). */
const MODOS = {
  combinado: { label: "Combinado", fn: (u) => u.extratos + u.risco_alto * 2, leg: "volume + risco (risco ×2)" },
  volume:    { label: "Volume",     fn: (u) => u.extratos,                    leg: "nº de extratos" },
  risco:     { label: "Risco ALTO", fn: (u) => u.risco_alto,                  leg: "extratos de risco alto" },
}

function heatRGB(ratio) {
  const r = Math.max(0, Math.min(1, ratio))
  const stops = [
    [0.00, [56, 116, 214]],   // azul frio
    [0.45, [232, 160, 32]],   // âmbar (fio condutor)
    [1.00, [239, 68, 68]],    // vermelho quente
  ]
  let a = stops[0], b = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (r >= stops[i][0] && r <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break }
  }
  const t = (r - a[0]) / ((b[0] - a[0]) || 1)
  return a[1].map((v, i) => Math.round(v + (b[1][i] - v) * t))
}

export default function MatrizNucadis() {
  const [dados, setDados] = useState(null)
  const [aud, setAud]     = useState(null)
  const [modo, setModo]   = useState("combinado")

  const carregar = useCallback(async ()=>{
    try { const r=await api.get("/extrato/heatmap"); if(r.ok) setDados(await r.json()) } catch {}
    try { const r=await api.get("/extrato/auditoria/verificar"); if(r.ok) setAud(await r.json()) } catch {}
  },[])
  useEffect(()=>{ const s=document.createElement("style"); s.textContent=CSS; document.head.appendChild(s); return ()=>document.head.removeChild(s) },[])
  useEffect(()=>{ carregar() },[carregar])

  const kpi = dados?.kpi || {total:0,processados:0,risco_alto:0,bloqueados:0}
  const unidades = dados?.por_unidade || []
  const meses = dados?.por_mes || []
  const maxM = Math.max(1, ...meses.map(m=>m.total))
  const metricFn = MODOS[modo].fn
  const ordenadas = [...unidades].sort((a,b)=>metricFn(b)-metricFn(a))
  const maxV = Math.max(1, ...ordenadas.map(metricFn))

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div>
          <div style={S.title}>Matriz de Calor dos NUCADIs</div>
          <div style={S.sub}>Produção de inteligência por sub-unidade · gestão de recursos analíticos</div>
        </div>
        <button onClick={carregar} style={S.refresh}>↻ Atualizar</button>
      </header>

      <div style={S.body}>
        <div style={S.kpis}>
          <Kpi n={kpi.total} l="Extratos recebidos" cor={C.text}/>
          <Kpi n={kpi.processados} l="Processados pela IA" cor="#60A5FA"/>
          <Kpi n={kpi.risco_alto} l="Risco ALTO" cor="#F87171"/>
          <Kpi n={kpi.bloqueados} l="Bloqueados (guardrail)" cor="#FBBF24"/>
        </div>

        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",margin:"18px 0 10px",flexWrap:"wrap",gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{width:3,height:16,background:C.gold,borderRadius:2,boxShadow:"0 0 8px rgba(232,160,32,0.5)"}}/>
            <h2 style={{fontSize:12,fontWeight:800,color:C.gold,letterSpacing:"0.12em",textTransform:"uppercase",margin:0}}>Produção por Unidade · Mapa de Calor</h2>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:10,color:C.textDim,fontFamily:MONO}}>calor por:</span>
              <div style={{display:"flex",gap:3,background:"rgba(255,255,255,0.03)",padding:3,borderRadius:8,border:`1px solid ${C.border}`}}>
                {Object.entries(MODOS).map(([k,m])=>(
                  <button key={k} onClick={()=>setModo(k)} title={m.leg}
                    style={{padding:"5px 10px",borderRadius:5,fontSize:11,fontWeight:700,fontFamily:MONO,cursor:"pointer",border:"none",
                      background: modo===k?C.goldSoft:"transparent", color: modo===k?C.gold:C.textMid}}>{m.label}</button>
                ))}
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:10,color:C.textDim,fontFamily:MONO}}>frio</span>
              <span style={{width:96,height:8,borderRadius:4,background:"linear-gradient(90deg,rgb(56,116,214),rgb(232,160,32),rgb(239,68,68))",display:"inline-block"}}/>
              <span style={{fontSize:10,color:C.textDim,fontFamily:MONO}}>quente</span>
            </div>
          </div>
        </div>
        <div style={S.card}>
          {ordenadas.length===0 && <div style={S.vazio}>Sem dados — submeta extratos no Módulo Extrato.</div>}
          {ordenadas.map((u,i)=>{
            const ratio = metricFn(u) / maxV
            const rgb = heatRGB(ratio)
            const solid = `rgb(${rgb.join(",")})`
            const soft  = `rgba(${rgb.join(",")},0.30)`
            const glow  = `0 0 ${Math.round(4 + ratio*18)}px rgba(${rgb.join(",")},${(0.22 + ratio*0.55).toFixed(2)})`
            return (
              <div key={u.unidade} style={S.uRow}>
                <div style={S.uName}>
                  <span style={{fontSize:13,color:i===0?solid:C.textDim,fontFamily:MONO,marginRight:8,fontWeight:i===0?800:400}}>#{i+1}</span>
                  <span style={{fontSize:14,fontWeight:700,color:C.text}}>{u.unidade}</span>
                  {i===0 && ratio>0 && <span style={{fontSize:13,marginLeft:6}} title="unidade mais quente neste critério">🔥</span>}
                </div>
                <div style={S.barTrack}>
                  <div className="mn-bar-fill" style={{position:"absolute",left:0,top:0,bottom:0,borderRadius:6,
                    width:`${Math.max(ratio*100, ratio>0?6:0)}%`, background:`linear-gradient(90deg,${solid},${soft})`, boxShadow:glow}}/>
                  <span style={S.barLabel}>{u.extratos} extratos · {u.risco_alto} alto</span>
                </div>
                <div style={S.uStats}>
                  <Stat n={u.processados} l="proc." cor="#60A5FA"/>
                  <Stat n={u.risco_alto} l="alto" cor="#F87171"/>
                  <Stat n={u.rae} l="RAE" cor="#4ADE80"/>
                </div>
              </div>
            )
          })}
        </div>

        {meses.length>0 && <>
          <SectionBar label="Evolução Mensal"/>
          <div style={S.card}>
            <div style={{display:"flex",alignItems:"flex-end",gap:14,height:140,padding:"0 6px"}}>
              {meses.map((m,i)=>(
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                  <div style={{fontSize:12,color:C.gold,fontWeight:700,fontFamily:MONO}}>{m.total}</div>
                  <div style={{width:"100%",maxWidth:48,height:`${(m.total/maxM)*100}%`,minHeight:4,background:"linear-gradient(180deg,#E8A020,rgba(232,160,32,0.25))",borderRadius:"5px 5px 0 0"}}/>
                  <div style={{fontSize:10.5,color:C.textMid,fontFamily:MONO}}>{m.mes}</div>
                </div>
              ))}
            </div>
          </div>
        </>}

        <SectionBar label="Integridade da Trilha de Auditoria"/>
        <div style={{...S.card, display:"flex",alignItems:"center",gap:12}}>
          {aud ? (
            <>
              <span style={{fontSize:22}}>{aud.ok ? "🛡️" : "⚠️"}</span>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:aud.ok?"#4ADE80":"#F87171"}}>
                  {aud.ok ? "Cadeia íntegra (tamper-evident)" : "Cadeia rompida — possível adulteração"}</div>
                <div style={{fontSize:11.5,color:C.textMid,fontFamily:MONO,marginTop:2}}>
                  {aud.total} eventos encadeados por hash SHA-256{aud.rompido_em_id?` · rompida no evento #${aud.rompido_em_id}`:""}</div>
              </div>
            </>
          ) : <span style={{color:C.textDim,fontFamily:MONO,fontSize:12}}>verificando…</span>}
        </div>
      </div>
    </div>
  )
}

const Kpi = ({n,l,cor}) => (
  <div style={S.kpi}>
    <div style={{fontSize:30,fontWeight:900,color:cor,lineHeight:1}}>{n}</div>
    <div style={{fontSize:11,color:C.textMid,marginTop:5,fontFamily:MONO}}>{l}</div>
  </div>
)
const Stat = ({n,l,cor}) => (
  <div style={{textAlign:"center",minWidth:42}}>
    <div style={{fontSize:15,fontWeight:800,color:cor}}>{n}</div>
    <div style={{fontSize:9.5,color:C.textDim,fontFamily:MONO,textTransform:"uppercase"}}>{l}</div>
  </div>
)
const SectionBar = ({label}) => (
  <div style={{display:"flex",alignItems:"center",gap:8,margin:"18px 0 10px"}}>
    <span style={{width:3,height:16,background:C.gold,borderRadius:2,boxShadow:"0 0 8px rgba(232,160,32,0.5)"}}/>
    <h2 style={{fontSize:12,fontWeight:800,color:C.gold,letterSpacing:"0.12em",textTransform:"uppercase",margin:0}}>{label}</h2>
  </div>
)

const S = {
  page:{display:"flex",flexDirection:"column",flex:1,minWidth:0,height:"100%",overflow:"hidden",background:C.bg,fontFamily:SANS},
  header:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,padding:"14px 22px",borderBottom:`1px solid ${C.border}`,background:C.surface,flexShrink:0},
  title:{fontSize:17,fontWeight:800,color:C.text},
  sub:{fontSize:11.5,color:C.textMid,fontFamily:MONO,marginTop:2},
  refresh:{padding:"8px 14px",borderRadius:7,border:`1px solid ${C.borderUp}`,background:"rgba(255,255,255,0.04)",color:C.textMid,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:MONO},
  body:{flex:1,overflowY:"auto",padding:"18px 22px"},
  kpis:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12},
  kpi:{background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px"},
  card:{background:"rgba(255,255,255,0.02)",border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 18px"},
  uRow:{display:"grid",gridTemplateColumns:"180px 1fr 200px",gap:14,alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${C.border}`},
  uName:{display:"flex",alignItems:"center"},
  barTrack:{position:"relative",height:26,background:"rgba(255,255,255,0.04)",borderRadius:6,overflow:"hidden",display:"flex",alignItems:"center"},
  barLabel:{position:"relative",fontSize:11.5,fontWeight:700,color:C.text,fontFamily:MONO,paddingLeft:10,zIndex:1},
  uStats:{display:"flex",gap:10,justifyContent:"flex-end"},
  vazio:{padding:"20px",textAlign:"center",fontSize:12.5,color:C.textDim,fontFamily:MONO},
}
