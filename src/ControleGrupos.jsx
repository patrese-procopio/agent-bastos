import { useState, useEffect } from "react"
const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
const CORES = {
  "CV/AM":          { bg:"#FEF2F2", text:"#991B1B", border:"#FECACA", dot:"#DC2626" },
  "LIDERANÇAS CV":  { bg:"#FEF2F2", text:"#991B1B", border:"#FECACA", dot:"#DC2626" },
  "PCC":            { bg:"#EFF6FF", text:"#1E40AF", border:"#BFDBFE", dot:"#3B82F6" },
  "LIDERANÇAS PCC": { bg:"#EFF6FF", text:"#1E40AF", border:"#BFDBFE", dot:"#3B82F6" },
  "JACK/TDA":       { bg:"#F5F3FF", text:"#5B21B6", border:"#DDD6FE", dot:"#8B5CF6" },
  "AMARELINHOS":    { bg:"#FFFBEB", text:"#92400E", border:"#FDE68A", dot:"#F59E0B" },
  "RDA":            { bg:"#F0FDF4", text:"#166534", border:"#BBF7D0", dot:"#22C55E" },
  "NEUTROS":        { bg:"#F8FAFC", text:"#475569", border:"#CBD5E1", dot:"#94A3B8" },
  "LGBTQIAPN+":     { bg:"#FDF2F8", text:"#9D174D", border:"#FBCFE8", dot:"#EC4899" },
  "CRIMES SEXUAIS": { bg:"#FFF7ED", text:"#9A3412", border:"#FED7AA", dot:"#F97316" },
  "ISOLAMENTO":     { bg:"#F8FAFC", text:"#374151", border:"#D1D5DB", dot:"#6B7280" },
  "MED. SEGURANÇA": { bg:"#F8FAFC", text:"#475569", border:"#CBD5E1", dot:"#94A3B8" },
}
const NOMES = {
  CDPM1:"CDPM I", CDPM2:"CDPM II", IPAT:"IPAT", UPP:"UPP", COMPAJ:"COMPAJ", CDF:"CDF"
}
const NOMES_FULL = {
  CDPM1:"Centro de Detenção Provisória I", CDPM2:"Centro de Detenção Provisória II",
  IPAT:"Instituto Penal Antônio Trindade", UPP:"Unidade Prisional do Puraquequara",
  COMPAJ:"Complexo Penitenciário Anísio Jobim", CDF:"Centro de Detenção Feminino",
}
const DADOS = { atualizado:"2026-05", unidades:{
  CDPM1:{ img:"CDPM1.jpg", pavs:{
    P01:{l:"Pavilhão 01",g:"RDA",x:41,y:43}, PANEXO:{l:"Pavilhão Anexo",g:"AMARELINHOS",x:21,y:47},
    P02A1:{l:"Pav. 02 Ala 01",g:"MED. SEGURANÇA",x:60,y:40}, P02A2:{l:"Pav. 02 Ala 02",g:"LIDERANÇAS CV",x:60,y:51},
    P03:{l:"Pavilhão 03",g:"CRIMES SEXUAIS",x:30,y:30}, P04:{l:"Pavilhão 04",g:"CV/AM",x:67,y:29},
    P05:{l:"Pavilhão 05",g:"JACK/TDA",x:30,y:10}, P06:{l:"Pavilhão 06",g:"JACK/TDA",x:68,y:9},
  }},
  CDPM2:{ img:"CDPM2.jpg", pavs:{
    P01:{l:"Pavilhão 01",g:"PCC",x:55,y:46}, P02:{l:"Pavilhão 02",g:"CV/AM",x:35,y:46},
    P03:{l:"Pavilhão 03",g:"AMARELINHOS",x:72,y:30}, P04:{l:"Pavilhão 04",g:"CV/AM",x:36,y:30},
    P05:{l:"Pavilhão 05",g:"AMARELINHOS",x:70,y:11}, P06:{l:"Pavilhão 06",g:"CV/AM",x:33,y:11},
    P07:{l:"Pavilhão 07",g:"LIDERANÇAS PCC",x:74,y:80},
  }},
  IPAT:{ img:"IPAT.jpg", pavs:{
    PA:{l:"Pavilhão A",g:"CV/AM",x:30,y:34}, PB:{l:"Pavilhão B",g:"AMARELINHOS",x:51,y:19},
    PC:{l:"Pavilhão C",g:"CV/AM",x:70,y:34}, PD:{l:"Pavilhão D",g:"LIDERANÇAS CV",x:67,y:71},
  }},
  UPP:{ img:"UPP.jpg", pavs:{
    G0102:{l:"Galerias 01 e 02",g:"AMARELINHOS",x:71,y:61}, G0304:{l:"Galerias 03 e 04",g:"NEUTROS",x:68,y:47},
    G0607:{l:"Galerias 06 e 07",g:"NEUTROS",x:70,y:37}, G05:{l:"Galeria 05",g:"NEUTROS",x:43,y:45},
    G08:{l:"Galeria 08",g:"ISOLAMENTO",x:43,y:37}, G11:{l:"Galeria 11",g:"LGBTQIAPN+",x:43,y:23},
    G0910:{l:"Galerias 09 e 10",g:"JACK/TDA",x:73,y:22},
  }},
  COMPAJ:{ img:"COMPAJ.jpg", pavs:{
    P01:{l:"Pavilhão 01",g:"CV/AM",x:43,y:16}, P02:{l:"Pavilhão 02",g:"CV/AM",x:46,y:32},
    P03:{l:"Pavilhão 03",g:"CV/AM",x:46,y:49}, P05:{l:"Pavilhão 05",g:"CV/AM",x:46,y:79},
    P07:{l:"Pavilhão 07",g:"AMARELINHOS",x:20,y:62},
  }},
  CDF:{ img:"CDF.jpg", pavs:{
    P01A:{l:"Pav. 01-A",g:"CV/AM",x:51,y:32}, P01B:{l:"Pav. 01-B",g:"AMARELINHOS",x:25,y:28},
    P02:{l:"Pav. 02 Condenadas",g:"CV/AM",x:74,y:27}, P03:{l:"Pavilhão 03",g:"ISOLAMENTO",x:74,y:37},
    BERC:{l:"Berçário",g:"MED. SEGURANÇA",x:64,y:62},
  }},
}}
const CSS = `
  @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pulse{0%,100%{box-shadow:0 0 0 0px rgba(0,0,0,0.1)}50%{box-shadow:0 0 0 10px rgba(0,0,0,0)}}
  .cg-enter{animation:fadeIn 0.2s ease forwards}
  .ppulse{animation:pulse 1.2s ease-in-out 3}
  ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:4px}
  .pr:hover{background:#FFFBEB!important;border-color:rgba(180,83,9,0.2)!important}
  .ut:hover{background:#F1F5F9!important;color:#0F172A!important}
`
export default function ControleGrupos({ onNavigate }) {
  const [unit, setUnit] = useState("CDPM1")
  const [pav, setPav]   = useState(null)
  const [err, setErr]   = useState({})
  useEffect(() => {
    const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s)
    return () => document.head.removeChild(s)
  }, [])
  useEffect(() => { setPav(null) }, [unit])
  const ud    = DADOS.unidades[unit]
  const pavs  = ud?.pavs || {}
  const img   = `./src/assets/unidades/${ud?.img}`
  const grups = [...new Set(Object.values(pavs).map(p => p.g))]
  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,minWidth:0,height:"100%",overflow:"hidden",background:"#F1F5F9",fontFamily:SANS}}>
      <div style={{height:44,borderBottom:"1px solid #E2E8F0",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 18px",background:"#FFFFFF",flexShrink:0,boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span style={{fontSize:13,fontWeight:700,color:"#0F172A"}}>Controle de Grupos</span>
          <span style={{fontSize:10,color:"#94A3B8",fontFamily:MONO}}>· {NOMES_FULL[unit]}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"3px 10px",background:"#F0FDF4",border:"1px solid #86EFAC",borderRadius:20}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:"#16A34A",boxShadow:"0 0 5px rgba(22,163,74,0.7)"}}/>
          <span style={{fontSize:9,color:"#166534",fontFamily:MONO,fontWeight:600}}>atualizado: {DADOS.atualizado}</span>
        </div>
      </div>
      <div style={{display:"flex",gap:2,padding:"8px 14px 0",background:"#FFFFFF",borderBottom:"1px solid #E2E8F0",flexShrink:0,overflowX:"auto"}}>
        {Object.entries(NOMES).map(([k,n]) => {
          const isA = unit===k
          const gs  = [...new Set(Object.values(DADOS.unidades[k]?.pavs||{}).map(p=>p.g))]
          const cor = gs.some(g=>g.includes("CV")) ? "#DC2626" : gs.some(g=>g.includes("PCC")) ? "#3B82F6" : "#94A3B8"
          return <button key={k} className="ut" onClick={()=>setUnit(k)} style={{padding:"6px 16px",borderRadius:"6px 6px 0 0",border:"1px solid",borderBottom:"none",fontSize:11,fontWeight:600,cursor:"pointer",transition:"all 0.15s",fontFamily:MONO,background:isA?"#F1F5F9":"transparent",color:isA?"#0F172A":"#64748B",borderColor:isA?"#E2E8F0":"transparent"}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:cor,display:"inline-block",marginRight:6,verticalAlign:"middle"}}/>{n}
          </button>
        })}
      </div>
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <div style={{width:268,flexShrink:0,borderRight:"1px solid #CBD5E1",display:"flex",flexDirection:"column",background:"#FFFFFF",overflow:"hidden",boxShadow:"2px 0 6px rgba(0,0,0,0.04)"}}>
          <div style={{padding:"14px 16px 12px",borderBottom:"1px solid #F1F5F9",background:"#F8FAFC",flexShrink:0}}>
            <div style={{fontSize:10,fontWeight:800,color:"#64748B",letterSpacing:"0.12em",textTransform:"uppercase",fontFamily:MONO,marginBottom:10}}>Grupos presentes</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {grups.map(g => { const c=CORES[g]||CORES["NEUTROS"]; return <span key={g} style={{fontSize:11,padding:"4px 10px",borderRadius:5,background:c.bg,color:c.text,border:`1px solid ${c.border}`,fontFamily:MONO,fontWeight:700}}>{g}</span> })}
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"8px"}}>
            {Object.entries(pavs).map(([id,p]) => {
              const c=CORES[p.g]||CORES["NEUTROS"]; const isA=pav===id
              return <div key={id} className="pr" onClick={()=>setPav(v=>v===id?null:id)} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 12px",borderRadius:8,cursor:"pointer",marginBottom:4,transition:"all 0.12s",background:isA?"#FFFBEB":"transparent",border:isA?"1px solid rgba(180,83,9,0.25)":"1px solid transparent",borderLeft:`3px solid ${isA?c.dot:"transparent"}`}}>
                <div style={{width:12,height:12,borderRadius:"50%",background:c.dot,flexShrink:0,boxShadow:isA?`0 0 6px ${c.dot}`:"none"}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:isA?700:500,color:isA?"#0F172A":"#334155",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.l}</div>
                  <div style={{fontSize:11,color:c.text,fontFamily:MONO,marginTop:2,fontWeight:700}}>{p.g}</div>
                </div>
                {isA && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>}
              </div>
            })}
          </div>
          <div style={{padding:"10px 16px",borderTop:"1px solid #F1F5F9",background:"#F8FAFC",flexShrink:0}}>
            <span style={{fontSize:10,color:"#94A3B8",fontFamily:MONO}}>{Object.keys(pavs).length} locais mapeados</span>
          </div>
        </div>
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",padding:"14px"}}>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,padding:"10px 16px",background:"#FFFFFF",border:"1px solid #E2E8F0",borderRadius:8,marginBottom:12,flexShrink:0,boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
            {Object.keys(CORES).map(g => { const c=CORES[g]; const at=grups.includes(g); return <div key={g} style={{display:"flex",alignItems:"center",gap:5,opacity:at?1:0.3}}><div style={{width:9,height:9,borderRadius:"50%",background:c.dot,flexShrink:0,boxShadow:at?`0 0 4px ${c.dot}66`:"none"}}/><span style={{fontSize:11,color:at?"#334155":"#94A3B8",fontFamily:MONO,fontWeight:at?700:400}}>{g}</span></div> })}
          </div>
          <div style={{flex:1,position:"relative",borderRadius:10,overflow:"hidden",border:"1px solid #E2E8F0",background:"#F1F5F9",minHeight:0,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"}}>
            {err[unit] ? (
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:8}}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <span style={{fontSize:11,color:"#94A3B8",fontFamily:MONO}}>Imagem não encontrada: {ud?.img}</span>
              </div>
            ) : (
              <img src={img} alt={unit} onError={()=>setErr(e=>({...e,[unit]:true}))} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
            )}
            {!err[unit] && Object.entries(pavs).map(([id,p]) => {
              const c=CORES[p.g]||CORES["NEUTROS"]; const isA=pav===id
              return (
                <div key={id} onClick={()=>setPav(v=>v===id?null:id)} style={{position:"absolute",left:p.x+"%",top:p.y+"%",transform:"translate(-50%,-50%)",cursor:"pointer",zIndex:isA?20:10,display:"flex",flexDirection:"column",alignItems:"center"}}>
                  {isA && <div className="ppulse" style={{position:"absolute",top:0,left:"50%",transform:"translate(-50%,-50%)",width:36,height:36,borderRadius:"50%",border:`2px solid ${c.dot}`,background:c.dot+"22",pointerEvents:"none"}}/>}
                  <div style={{width:isA?16:13,height:isA?16:13,borderRadius:"50%",background:c.dot,border:"2.5px solid #FFFFFF",boxShadow:isA?`0 0 0 3px ${c.dot}55,0 2px 10px rgba(0,0,0,0.4)`:"0 1px 5px rgba(0,0,0,0.4)",transition:"all 0.2s",position:"relative",zIndex:2,flexShrink:0}}/>
                  <div style={{marginTop:4,background:"rgba(255,255,255,0.93)",border:`1px solid ${c.border}`,borderRadius:4,padding:"3px 7px",whiteSpace:"nowrap",boxShadow:"0 1px 4px rgba(0,0,0,0.15)",textAlign:"center",zIndex:2}}>
                    <div style={{fontSize:9,fontWeight:700,color:"#0F172A",fontFamily:MONO,lineHeight:1.3}}>{p.l}</div>
                    <div style={{fontSize:8,color:c.text,fontFamily:MONO,fontWeight:700,lineHeight:1.3}}>{p.g}</div>
                  </div>
                  {isA && <div style={{position:"absolute",bottom:"calc(100% + 12px)",left:"50%",transform:"translateX(-50%)",background:"#FFFFFF",border:`2px solid ${c.dot}`,borderRadius:8,padding:"8px 14px",whiteSpace:"nowrap",boxShadow:"0 4px 20px rgba(0,0,0,0.15)",zIndex:30,minWidth:150}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#0F172A",fontFamily:MONO}}>{p.l}</div>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginTop:5}}><div style={{width:8,height:8,borderRadius:"50%",background:c.dot}}/><span style={{fontSize:11,color:c.text,fontWeight:700}}>{p.g}</span></div>
                    <div style={{position:"absolute",bottom:-6,left:"50%",width:10,height:10,background:"#FFFFFF",border:`2px solid ${c.dot}`,borderTop:"none",borderLeft:"none",transform:"translateX(-50%) rotate(45deg)"}}/>
                  </div>}
                </div>
              )
            })}
          </div>
          {pav && pavs[pav] && (() => { const c=CORES[pavs[pav].g]||CORES["NEUTROS"]; return (
            <div className="cg-enter" style={{marginTop:10,padding:"10px 16px",flexShrink:0,background:"#FFFFFF",border:`1px solid ${c.border}`,borderLeft:`4px solid ${c.dot}`,borderRadius:8,display:"flex",alignItems:"center",gap:12,boxShadow:"0 2px 6px rgba(0,0,0,0.06)"}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:c.dot,flexShrink:0}}/>
              <span style={{fontSize:13,fontWeight:700,color:"#0F172A"}}>{pavs[pav].l}</span>
              <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:4,background:c.bg,color:c.text,border:`1px solid ${c.border}`,fontFamily:MONO}}>{pavs[pav].g}</span>
              <button onClick={()=>setPav(null)} style={{marginLeft:"auto",background:"transparent",border:"none",color:"#94A3B8",cursor:"pointer",fontSize:18}}>×</button>
            </div>
          )})()}
        </div>
      </div>
    </div>
  )
}
