import { useState, useEffect } from "react"
import { jsPDF } from "jspdf"
import api from "./api"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const C = {
  bg:        "#0B1120",
  surface:   "#111827",
  surfaceUp: "#1A2236",
  border:    "rgba(255,255,255,0.07)",
  borderUp:  "rgba(255,255,255,0.13)",
  text:      "#F1F5F9",
  textMid:   "#CBD5E1",
  textDim:   "#94A3B8",
  accent:    "#E8A020",
  goldSoft:  "rgba(232,160,32,0.12)",
  goldBorder:"rgba(232,160,32,0.3)",
}

// ── Paleta de grupos ───────────────────────────────────────────────────────────
const GRUPO_CORES = {
  "CV/AM":"#F87171","PCC":"#60A5FA","AMARELINHOS":"#FBBF24","JACK/TDA":"#A78BFA",
  "RDA":"#22D3EE","LIDERANÇAS CV":"#F472B6","LIDERANÇAS PCC":"#818CF8",
  "MED. SEGURANÇA":"#34D399","CRIMES SEXUAIS":"#FB923C","ISOLAMENTO":"#94A3B8",
  "NEUTROS":"#CBD5E1","LGBTQIAPN+":"#F0ABFC",
}
const CORES_FB = ["#2DD4BF","#FCD34D","#A5B4FC","#38BDF8","#4ADE80","#C084FC","#FB7185"]
function corDoGrupo(grupo, index) { return GRUPO_CORES[grupo] || CORES_FB[index % CORES_FB.length] }

const GRUPO_CORES_PDF = {
  "CV/AM":"#DC2626","PCC":"#1D4ED8","AMARELINHOS":"#D97706","JACK/TDA":"#7C3AED",
  "RDA":"#0891B2","LIDERANÇAS CV":"#BE185D","LIDERANÇAS PCC":"#1E40AF",
  "MED. SEGURANÇA":"#065F46","CRIMES SEXUAIS":"#92400E","ISOLAMENTO":"#475569",
  "NEUTROS":"#64748B","LGBTQIAPN+":"#DB2777",
}
const CORES_PDF_FB = ["#0F766E","#B45309","#4338CA","#0369A1","#15803D","#9333EA","#E11D48"]
function corPdf(grupo, i) { return GRUPO_CORES_PDF[grupo] || CORES_PDF_FB[i % CORES_PDF_FB.length] }

// ── Helpers de dados ───────────────────────────────────────────────────────────
function extrairContagem(dados) {
  const contagem = {}
  if (!dados?.unidades) return contagem
  for (const unidade of Object.values(dados.unidades)) {
    const pavilhoes = unidade.pavilhoes || unidade.pavs || {}
    for (const pav of Object.values(pavilhoes)) {
      const g = pav.grupo || pav.g || ""
      if (g) contagem[g] = (contagem[g] || 0) + 1
    }
  }
  return contagem
}

function extrairPorUnidade(dados) {
  if (!dados?.unidades) return {}
  const resultado = {}
  for (const [nome, unidade] of Object.entries(dados.unidades)) {
    const pavilhoes = unidade.pavilhoes || unidade.pavs || {}
    resultado[nome] = Object.entries(pavilhoes).map(([key, pav]) => ({
      key, label: pav.label || key, grupo: pav.grupo || pav.g || "—",
    }))
  }
  return resultado
}

// ── KPI Card ───────────────────────────────────────────────────────────────────
function KpiCard({ rank, grupo, qtd, total, variacao, cor }) {
  const temVar = variacao !== null && variacao !== undefined
  const subiu  = variacao > 0
  const desceu = variacao < 0
  const pct    = total > 0 ? (qtd / total) * 100 : 0
  return (
    <div className="ig-card" style={{
      background:C.surface,
      borderTop:`1px solid ${C.border}`, borderRight:`1px solid ${C.border}`,
      borderBottom:`1px solid ${C.border}`, borderLeft:`4px solid ${cor}`,
      borderRadius:10, padding:"16px 16px", display:"flex", flexDirection:"column", gap:10,
      transition:"all 0.15s",
    }}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:9,minWidth:0}}>
          <span style={{width:9,height:9,borderRadius:"50%",background:cor,flexShrink:0}}/>
          <span style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:MONO,
            whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}} title={grupo}>
            {grupo}
          </span>
        </div>
        <span style={{fontSize:12,fontWeight:700,color:C.textDim,fontFamily:MONO,flexShrink:0}}>#{rank}</span>
      </div>

      <div style={{display:"flex",alignItems:"flex-end",gap:10}}>
        <span style={{fontSize:32,fontWeight:800,color:cor,lineHeight:1,fontFamily:MONO}}>{qtd}</span>
        <span style={{fontSize:14,color:C.textMid,fontFamily:MONO,marginBottom:3}}>
          pavilhões · <b style={{color:C.text}}>{pct.toFixed(0)}%</b>
        </span>
      </div>

      <div style={{height:6,background:C.surfaceUp,borderRadius:3,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:cor,borderRadius:3,transition:"width 0.5s ease"}}/>
      </div>

      {temVar && (
        <div style={{display:"flex",alignItems:"center",gap:6,fontSize:13,fontWeight:700,fontFamily:MONO,
          color:subiu?"#F87171":desceu?"#4ADE80":C.textDim}}>
          <span>{subiu?"▲":desceu?"▼":"—"}</span>
          <span>{Math.abs(variacao).toFixed(1)}% vs mês ant.</span>
          {Math.abs(variacao) >= 20 && (
            <span style={{background:"rgba(239,68,68,0.14)",color:"#FCA5A5",
              border:"1px solid rgba(239,68,68,0.35)",padding:"2px 8px",
              borderRadius:4,fontSize:12,marginLeft:2,letterSpacing:"0.04em",fontWeight:800}}>
              ALERTA
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Gráfico de barras horizontal ───────────────────────────────────────────────
function GraficoBarras({ series, mesSelecionado, grupos }) {
  const dados = series[mesSelecionado] || {}
  const max   = Math.max(...Object.values(dados), 1)
  const total = Object.values(dados).reduce((a, b) => a + b, 0) || 1
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {grupos.map((grupo, i) => {
        const qtd   = dados[grupo] || 0
        const pct   = (qtd / max) * 100
        const share = (qtd / total) * 100
        const cor   = corDoGrupo(grupo, i)
        return (
          <div key={grupo} style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:140,fontSize:14,fontWeight:600,color:C.textMid,
              fontFamily:MONO,textAlign:"right",flexShrink:0,
              whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}} title={grupo}>
              {grupo}
            </div>
            <div style={{flex:1,height:24,background:C.surfaceUp,borderRadius:5,overflow:"hidden",position:"relative"}}>
              <div style={{height:"100%",width:`${pct}%`,
                background:`linear-gradient(90deg,${cor},${cor}AA)`,
                borderRadius:5,transition:"width 0.5s ease",minWidth:qtd>0?4:0}}/>
            </div>
            <div style={{width:70,fontSize:14,fontWeight:800,color:cor,
              fontFamily:MONO,textAlign:"right",flexShrink:0}}>
              {qtd} <span style={{color:C.textDim,fontWeight:600,fontSize:12}}>{share.toFixed(0)}%</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Tabela de unidades ─────────────────────────────────────────────────────────
function TabelaUnidades({ porUnidade }) {
  const [aberta, setAberta] = useState(null)
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {Object.entries(porUnidade).map(([unidade, pavilhoes]) => (
        <div key={unidade} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
          <button onClick={()=>setAberta(aberta===unidade?null:unidade)} style={{
            width:"100%",background:"transparent",border:"none",cursor:"pointer",padding:"14px 18px",
            display:"flex",alignItems:"center",justifyContent:"space-between",
          }}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:16,fontWeight:800,color:C.text,letterSpacing:"0.02em",fontFamily:MONO}}>
                {unidade}
              </span>
              <span style={{fontSize:13,color:C.textDim,fontFamily:MONO,
                background:C.surfaceUp,padding:"3px 10px",borderRadius:6}}>
                {pavilhoes.length} pavilhões
              </span>
            </div>
            <span style={{fontSize:15,color:aberta===unidade?C.accent:C.textDim}}>
              {aberta===unidade?"▲":"▼"}
            </span>
          </button>
          {aberta===unidade && (
            <div style={{borderTop:`1px solid ${C.border}`,padding:"0 16px 16px"}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:8,marginTop:14}}>
                {pavilhoes.map((pav, idx) => {
                  const cor = corDoGrupo(pav.grupo, idx)
                  return (
                    <div key={pav.key} style={{
                      display:"flex",alignItems:"center",gap:10,padding:"10px 12px",
                      background:C.bg,
                      borderTop:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`,
                      borderBottom:`1px solid ${C.border}`,borderLeft:`3px solid ${cor}`,
                      borderRadius:8,
                    }}>
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:15,fontWeight:600,color:C.text,lineHeight:1.3,
                          whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                          {pav.label}
                        </div>
                        <div style={{fontSize:13,color:cor,fontWeight:700,fontFamily:MONO,marginTop:2}}>
                          {pav.grupo}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function InteligenciaGrupos({ onNavigate }) {
  const [meses,          setMeses]          = useState([])
  const [mesSelecionado, setMesSelecionado] = useState(null)
  const [snapshots,      setSnapshots]      = useState({})
  const [kpis,           setKpis]           = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [erro,           setErro]           = useState(null)
  const [abaAtiva,       setAbaAtiva]       = useState("kpis")

  useEffect(() => {
    const atual = new Date().toISOString().slice(0,7)
    api.get("/grupos/meses")
      .then(r => r.json())
      .then(data => {
        let lista = data.meses || []
        if (!lista.includes(atual)) lista = [atual, ...lista]
        lista = [...new Set(lista)].sort().reverse()
        setMeses(lista); setMesSelecionado(lista[0])
      })
      .catch(() => { setMeses([atual]); setMesSelecionado(atual); setErro("Não foi possível carregar os meses.") })
  }, [])

  useEffect(() => {
    if (!mesSelecionado || snapshots[mesSelecionado]) return
    api.get(`/grupos/ocupacao?ano_mes=${mesSelecionado}`)
      .then(r => r.json())
      .then(data => setSnapshots(prev => ({...prev,[mesSelecionado]:data})))
      .catch(() => setErro(`Erro ao carregar ${mesSelecionado}`))
  }, [mesSelecionado])

  useEffect(() => {
    api.get("/grupos/kpis")
      .then(r => r.json())
      .then(setKpis)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const snap         = snapshots[mesSelecionado]
  const dadosAtual   = snap?.unidades ? snap : (snap?.dados || null)
  const contagem     = dadosAtual ? extrairContagem(dadosAtual) : {}
  const porUnidade   = dadosAtual ? extrairPorUnidade(dadosAtual) : {}
  const grupos       = Object.keys(contagem).sort((a,b) => contagem[b]-contagem[a])
  const semDados     = grupos.length === 0
  const totalPav     = Object.values(contagem).reduce((a,b)=>a+b,0)
  const totalGrupos  = grupos.length
  const alertasAtivos= kpis?.alertas?.length || 0
  const grupoDom     = grupos[0] || null
  const domPct       = grupoDom && totalPav>0 ? (contagem[grupoDom]/totalPav)*100 : 0

  const idxMes  = meses.indexOf(mesSelecionado)
  const podePrev = idxMes < meses.length-1
  const podeProx = idxMes > 0

  const variacoes = {}
  if (kpis?.series && mesSelecionado) {
    const ord = Object.keys(kpis.series).sort()
    const idx = ord.indexOf(mesSelecionado)
    if (idx > 0) {
      const ant = kpis.series[ord[idx-1]] || {}
      const atu = kpis.series[mesSelecionado] || {}
      for (const g of Object.keys(atu)) {
        if (ant[g] > 0) variacoes[g] = ((atu[g]-ant[g])/ant[g])*100
      }
    }
  }

  function formatarMes(mes) {
    if (!mes) return ""
    const [ano, m] = mes.split("-")
    return `${["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][parseInt(m)]} ${ano}`
  }

  async function forcarSnapshot() {
    setLoading(true)
    try {
      const atual = new Date().toISOString().slice(0,7)
      const mesesData = await api.get("/grupos/meses").then(r=>r?.json())
      let lista = mesesData?.meses || []
      if (!lista.includes(atual)) lista = [atual, ...lista]
      lista = [...new Set(lista)].sort().reverse()
      setMeses(lista); setSnapshots({})
      const kpisData = await api.get("/grupos/kpis").then(r=>r?.json())
      setKpis(kpisData)
    } catch {}
    finally { setLoading(false) }
  }

  // ── Exportação PDF (mantém lógica idêntica ao original) ──────────────────────
  function exportarPDF() {
    const doc = new jsPDF({orientation:"portrait",unit:"mm",format:"a4"})
    const W=210,ml=18,mr=18,cw=W-ml-mr
    let y=0
    const AZUL=[15,23,42],GOLD=[180,83,9],CINZA=[100,116,139],BORDA=[226,232,240],BRANCO=[255,255,255]
    doc.setFillColor(...AZUL); doc.rect(0,0,W,28,"F")
    doc.setFillColor(...GOLD); doc.rect(0,28,W,2,"F")
    doc.setTextColor(...BRANCO); doc.setFont("helvetica","bold"); doc.setFontSize(15)
    doc.text("AGENT BASTOS",ml,11)
    doc.setFontSize(8); doc.setFont("helvetica","normal")
    doc.text("Sistema de Inteligência e Segurança Corporativa",ml,17)
    doc.setFontSize(7); doc.text(`Relatório gerado em: ${new Date().toLocaleString("pt-BR")}`,ml,22)
    doc.setFillColor(...GOLD); doc.roundedRect(W-mr-32,8,32,10,2,2,"F")
    doc.setTextColor(...BRANCO); doc.setFont("helvetica","bold"); doc.setFontSize(7)
    doc.text("CONFIDENCIAL",W-mr-16,14.5,{align:"center"})
    y=36
    doc.setTextColor(...AZUL); doc.setFont("helvetica","bold"); doc.setFontSize(13)
    doc.text("RELATÓRIO DE INTELIGÊNCIA DE GRUPOS",ml,y+7)
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(...CINZA)
    doc.text(`Competência: ${formatarMes(mesSelecionado)}  ·  Fonte: Drive Institucional  ·  Atualização automática mensal`,ml,y+13)
    doc.setDrawColor(...BORDA); doc.line(ml,y+16,W-mr,y+16); y+=22
    doc.setFillColor(248,250,252); doc.roundedRect(ml,y,cw,18,2,2,"F")
    doc.setDrawColor(...BORDA); doc.roundedRect(ml,y,cw,18,2,2,"S")
    const colW=cw/3
    [{label:"GRUPOS DISTINTOS",valor:String(totalGrupos)},{label:"PAVILHÕES MAPEADOS",valor:String(totalPav)},{label:"ALERTAS DE VARIAÇÃO",valor:String(alertasAtivos)}]
      .forEach(({label,valor},i)=>{
        const cx=ml+colW*i+colW/2
        doc.setFont("helvetica","bold"); doc.setFontSize(16); doc.setTextColor(...AZUL)
        doc.text(valor,cx,y+9,{align:"center"})
        doc.setFont("helvetica","normal"); doc.setFontSize(6.5); doc.setTextColor(...CINZA)
        doc.text(label,cx,y+14,{align:"center"})
        if(i<2){doc.setDrawColor(...BORDA); doc.line(ml+colW*(i+1),y+3,ml+colW*(i+1),y+15)}
      }); y+=24
    if(kpis?.alertas?.length>0){
      doc.setFillColor(254,242,242); doc.roundedRect(ml,y,cw,8+kpis.alertas.length*6,2,2,"F")
      doc.setDrawColor(254,202,202); doc.roundedRect(ml,y,cw,8+kpis.alertas.length*6,2,2,"S")
      doc.setFont("helvetica","bold"); doc.setFontSize(7.5); doc.setTextColor(220,38,38)
      doc.text("⚠  ALERTAS DE VARIAÇÃO SIGNIFICATIVA (≥ 20%)",ml+4,y+6)
      kpis.alertas.forEach((a,i)=>{
        doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(127,29,29)
        doc.text(`${a.grupo}:  ${a.variacao>0?"▲":"▼"} ${Math.abs(a.variacao).toFixed(1)}%  (anterior: ${a.anterior}  →  atual: ${a.atual})`,ml+6,y+12+i*6)
      }); y+=12+kpis.alertas.length*6+4
    }
    doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(...AZUL)
    doc.text("DISTRIBUIÇÃO POR GRUPO",ml,y+5)
    doc.setFillColor(...GOLD); doc.rect(ml,y+7,30,0.8,"F"); y+=12
    const cardW=(cw-8)/3,cardH=16
    grupos.forEach((grupo,i)=>{
      const col=i%3,row=Math.floor(i/3),cx=ml+col*(cardW+4),cy=y+row*(cardH+4)
      doc.setFillColor(248,250,252); doc.roundedRect(cx,cy,cardW,cardH,1.5,1.5,"F")
      const hex=corPdf(grupo,i),r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16)
      doc.setFillColor(r,g,b); doc.rect(cx,cy,2,cardH,"F")
      doc.setFont("helvetica","bold"); doc.setFontSize(14); doc.setTextColor(r,g,b)
      doc.text(String(contagem[grupo]||0),cx+6,cy+9)
      doc.setFont("helvetica","bold"); doc.setFontSize(6); doc.setTextColor(...AZUL)
      doc.text(grupo.length>16?grupo.slice(0,14)+"...":grupo,cx+6,cy+13)
      if(variacoes[grupo]!=null){
        const v=variacoes[grupo]
        doc.setFont("helvetica","normal"); doc.setFontSize(5.5)
        doc.setTextColor(v>0?220:22,v>0?38:163,v>0?38:74)
        doc.text(`${v>0?"▲":"▼"} ${Math.abs(v).toFixed(1)}%`,cx+cardW-14,cy+13)
      }
    }); y+=Math.ceil(grupos.length/3)*(cardH+4)+8
    if(y>220){doc.addPage();y=18}
    doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(...AZUL)
    doc.text("DETALHAMENTO POR UNIDADE",ml,y+5)
    doc.setFillColor(...GOLD); doc.rect(ml,y+7,40,0.8,"F"); y+=14
    Object.entries(porUnidade).forEach(([unidade,pavilhoes])=>{
      if(y>255){doc.addPage();y=18}
      doc.setFillColor(...AZUL); doc.roundedRect(ml,y,cw,8,1,1,"F")
      doc.setFont("helvetica","bold"); doc.setFontSize(7.5); doc.setTextColor(...BRANCO)
      doc.text(unidade,ml+4,y+5.5)
      doc.setFont("helvetica","normal"); doc.setFontSize(6.5)
      doc.text(`${pavilhoes.length} pavilhões`,W-mr-4,y+5.5,{align:"right"}); y+=10
      pavilhoes.forEach((pav,i)=>{
        const col=i%2,px=ml+col*(cw/2+2),py=y+Math.floor(i/2)*8
        if(py>265) return
        const hex=corPdf(pav.grupo,i),r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16)
        doc.setFillColor(255,255,255); doc.setDrawColor(r,g,b)
        doc.roundedRect(px,py,cw/2-2,7,1,1,"FD")
        doc.setFillColor(r,g,b); doc.rect(px,py,2,7,"F")
        doc.setFont("helvetica","normal"); doc.setFontSize(6); doc.setTextColor(15,23,42)
        doc.text(pav.label.length>22?pav.label.slice(0,20)+"...":pav.label,px+5,py+3.2)
        doc.setFont("helvetica","bold"); doc.setFontSize(5.5); doc.setTextColor(r,g,b)
        doc.text(pav.grupo,px+5,py+6)
      }); y+=Math.ceil(pavilhoes.length/2)*8+6
    })
    const pageCount=doc.getNumberOfPages()
    for(let p=1;p<=pageCount;p++){
      doc.setPage(p)
      doc.setFillColor(...AZUL); doc.rect(0,287,W,10,"F")
      doc.setFont("helvetica","normal"); doc.setFontSize(6); doc.setTextColor(...BRANCO)
      doc.text("Agent Bastos · Sistema de Inteligência Corporativa · USO INTERNO · CONFIDENCIAL",ml,293)
      doc.text(`Página ${p} de ${pageCount}`,W-mr,293,{align:"right"})
    }
    doc.save(`inteligencia-grupos-${formatarMes(mesSelecionado).replace(" ","-")}.pdf`)
  }

  const ABAS = [
    {id:"kpis",     label:"KPIs por Grupo"},
    {id:"evolucao", label:"Evolução Histórica"},
    {id:"unidades", label:"Por Unidade"},
  ]

  return (
    <div style={{display:"flex",flex:1,minWidth:0,height:"100%",overflow:"hidden",
      background:C.bg,fontFamily:SANS,color:C.text}}>

      {/* ── ASIDE ──────────────────────────────────────────────────────────── */}
      <aside style={{
        width:268,flexShrink:0,background:C.surface,
        borderRight:`1px solid ${C.border}`,
        display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",
      }}>

        {/* Header */}
        <div style={{padding:"16px 16px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
            <div style={{width:3,height:18,background:C.accent,borderRadius:2,
              boxShadow:`0 0 6px ${C.accent}88`}}/>
            <span style={{fontSize:13,fontWeight:800,color:C.accent,letterSpacing:"0.1em",textTransform:"uppercase"}}>
              Inteligência
            </span>
          </div>
          <div style={{fontSize:13,color:C.textMid,marginLeft:11,marginTop:2}}>
            Ocupação de grupos
          </div>
        </div>

        {/* Navegação de meses */}
        <div style={{padding:"12px 14px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{fontSize:11,fontWeight:700,color:C.textDim,letterSpacing:"0.1em",
            textTransform:"uppercase",fontFamily:MONO,marginBottom:8}}>Competência</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
            background:C.bg,borderRadius:9,border:`1px solid ${C.border}`,overflow:"hidden"}}>
            <button onClick={()=>podePrev&&setMesSelecionado(meses[idxMes+1])} disabled={!podePrev} style={{
              background:"transparent",border:"none",cursor:podePrev?"pointer":"not-allowed",
              padding:"8px 12px",fontSize:18,color:podePrev?C.accent:"rgba(255,255,255,0.2)",fontWeight:700,
            }}>‹</button>
            <div style={{fontSize:15,fontWeight:800,color:C.text,fontFamily:MONO,textAlign:"center",flex:1}}>
              {formatarMes(mesSelecionado)||"—"}
            </div>
            <button onClick={()=>podeProx&&setMesSelecionado(meses[idxMes-1])} disabled={!podeProx} style={{
              background:"transparent",border:"none",cursor:podeProx?"pointer":"not-allowed",
              padding:"8px 12px",fontSize:18,color:podeProx?C.accent:"rgba(255,255,255,0.2)",fontWeight:700,
            }}>›</button>
          </div>
        </div>

        {/* KPIs resumo */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,padding:"12px 14px",
          borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          {[
            {label:"Pavilhões",  val:loading?"—":totalPav,      cor:"#60A5FA"},
            {label:"Grupos",     val:loading?"—":totalGrupos,   cor:"#A78BFA"},
            {label:"Alertas",    val:loading?"—":alertasAtivos, cor:alertasAtivos>0?"#F87171":C.textDim},
            {label:"Dominante",  val:loading?"—":(grupoDom?`${domPct.toFixed(0)}%`:"—"), cor:C.accent},
          ].map(({label,val,cor})=>(
            <div key={label} style={{textAlign:"center",padding:"8px 6px",
              background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:8}}>
              <div style={{fontSize:20,fontWeight:800,color:cor,fontFamily:MONO,lineHeight:1}}>{val}</div>
              <div style={{fontSize:12,color:C.textDim,marginTop:4}}>{label}</div>
            </div>
          ))}
        </div>

        {/* Grupo dominante nome */}
        {grupoDom && !loading && (
          <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
            <div style={{fontSize:11,fontWeight:700,color:C.textDim,letterSpacing:"0.1em",
              textTransform:"uppercase",fontFamily:MONO,marginBottom:5}}>Grupo dominante</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{width:8,height:8,borderRadius:"50%",
                background:corDoGrupo(grupoDom,0),flexShrink:0}}/>
              <span style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:MONO}}>{grupoDom}</span>
            </div>
          </div>
        )}

        {/* Abas de navegação */}
        <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{fontSize:11,fontWeight:700,color:C.textDim,letterSpacing:"0.1em",
            textTransform:"uppercase",fontFamily:MONO,marginBottom:8}}>Visualização</div>
          {ABAS.map(aba => {
            const ativo = abaAtiva === aba.id
            return (
              <button key={aba.id} onClick={()=>setAbaAtiva(aba.id)} style={{
                width:"100%",textAlign:"left",padding:"9px 12px",borderRadius:8,
                marginBottom:4,cursor:"pointer",border:"none",
                background:ativo?C.goldSoft:"transparent",
                borderLeft:`3px solid ${ativo?C.accent:"transparent"}`,
                transition:"all 0.12s",
              }}>
                <span style={{fontSize:15,fontWeight:ativo?700:500,
                  color:ativo?C.accent:C.textMid}}>
                  {aba.label}
                </span>
              </button>
            )
          })}
        </div>

        {/* Ações */}
        <div style={{padding:"12px 12px 14px",marginTop:"auto",
          borderTop:`1px solid ${C.border}`,flexShrink:0,display:"flex",flexDirection:"column",gap:8}}>
          <button onClick={exportarPDF} disabled={semDados} style={{
            width:"100%",padding:"10px",borderRadius:8,border:"none",
            background:semDados?C.surfaceUp:`linear-gradient(135deg,${C.accent},#B45309)`,
            color:semDados?C.textDim:"#FFF",fontSize:14,fontWeight:800,
            cursor:semDados?"not-allowed":"pointer",fontFamily:MONO,
          }}>↓ Exportar PDF</button>
          <button onClick={forcarSnapshot} disabled={loading} style={{
            width:"100%",padding:"10px",borderRadius:8,
            border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.04)",
            color:loading?C.textDim:C.textMid,fontSize:14,
            cursor:loading?"not-allowed":"pointer",fontFamily:MONO,opacity:loading?0.6:1,
          }}>{loading?"Aguarde...":"↻ Atualizar"}</button>
        </div>
      </aside>

      {/* ── MAIN ───────────────────────────────────────────────────────────── */}
      <div style={{display:"flex",flexDirection:"column",flex:1,minWidth:0,height:"100%",overflow:"hidden"}}>

        {/* Topbar */}
        <div style={{
          display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"0 22px",height:56,
          borderBottom:`1px solid ${C.border}`,
          background:C.surface,flexShrink:0,
        }}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{display:"flex",gap:6}}>
              {["#FF5F57","#FEBC2E","#28C840"].map(cor=>(
                <div key={cor} style={{width:12,height:12,borderRadius:"50%",background:cor}}/>
              ))}
            </div>
            <div>
              <div style={{fontSize:17,fontWeight:700,color:C.text}}>
                {ABAS.find(a=>a.id===abaAtiva)?.label}
              </div>
              <div style={{fontSize:13,color:C.textMid,fontFamily:MONO,marginTop:1}}>
                {formatarMes(mesSelecionado)} · {totalGrupos} grupos · {totalPav} pavilhões
              </div>
            </div>
          </div>

          {/* Alertas badge */}
          {alertasAtivos > 0 && (
            <div style={{display:"flex",alignItems:"center",gap:7,padding:"6px 14px",
              background:"rgba(239,68,68,0.1)",borderRadius:8,border:"1px solid rgba(239,68,68,0.3)"}}>
              <span style={{width:7,height:7,borderRadius:"50%",background:"#EF4444"}}/>
              <span style={{fontSize:13,color:"#FCA5A5",fontWeight:700,fontFamily:MONO}}>
                {alertasAtivos} alerta{alertasAtivos!==1?"s":""} de variação
              </span>
            </div>
          )}
        </div>

        {/* Erro */}
        {erro && (
          <div style={{margin:"12px 22px 0",padding:"10px 14px",
            background:"rgba(239,68,68,0.10)",border:"1px solid rgba(239,68,68,0.3)",
            borderRadius:8,fontSize:14,color:"#FCA5A5",fontFamily:MONO}}>
            ⚠ {erro}
          </div>
        )}

        {/* Faixa de alertas */}
        {kpis?.alertas?.length>0 && (
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",
            margin:"12px 22px 0",padding:"10px 14px",
            background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:8}}>
            <span style={{fontSize:13,fontWeight:800,color:"#FCA5A5",fontFamily:MONO,letterSpacing:"0.05em"}}>
              ⚠ VARIAÇÕES
            </span>
            {kpis.alertas.map((a,i)=>(
              <span key={i} style={{fontSize:13,fontFamily:MONO,fontWeight:700,
                color:a.variacao>0?"#F87171":"#4ADE80",
                background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,
                padding:"3px 10px",borderRadius:6}}>
                {a.grupo} {a.variacao>0?"▲":"▼"}{Math.abs(a.variacao).toFixed(0)}%
              </span>
            ))}
          </div>
        )}

        {/* Corpo */}
        <div className="ig-scroll" style={{flex:1,overflow:"auto",padding:"18px 22px"}}>

          {/* ABA: KPIs */}
          {abaAtiva==="kpis" && (
            loading ? (
              <div style={{textAlign:"center",color:C.textDim,fontFamily:MONO,fontSize:15,paddingTop:50}}>
                Carregando dados...
              </div>
            ) : semDados ? (
              <div style={{textAlign:"center",color:C.textDim,fontFamily:MONO,fontSize:15,paddingTop:50}}>
                Nenhum dado disponível para {formatarMes(mesSelecionado)||"este período"}.
              </div>
            ) : (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))",gap:14}}>
                {grupos.map((grupo,i)=>(
                  <KpiCard key={grupo} rank={i+1} grupo={grupo}
                    qtd={contagem[grupo]} total={totalPav}
                    variacao={variacoes[grupo]??null} cor={corDoGrupo(grupo,i)}/>
                ))}
              </div>
            )
          )}

          {/* ABA: Evolução */}
          {abaAtiva==="evolucao" && (
            <div style={{background:C.surface,border:`1px solid ${C.border}`,
              borderRadius:10,padding:"22px"}}>
              <div style={{fontSize:16,fontWeight:800,color:C.text,marginBottom:5}}>
                Distribuição por grupo — {formatarMes(mesSelecionado)}
              </div>
              <div style={{fontSize:14,color:C.textMid,fontFamily:MONO,marginBottom:20}}>
                Quantidade de pavilhões controlados por cada grupo
              </div>
              {kpis?.series && Object.keys(kpis.series[mesSelecionado]||{}).length>0 ? (
                <GraficoBarras series={kpis.series} mesSelecionado={mesSelecionado}
                  grupos={grupos.length>0?grupos:Object.keys(kpis.series[mesSelecionado]||{})}/>
              ) : (
                <div style={{color:C.textDim,fontFamily:MONO,fontSize:14}}>
                  Sem dados históricos suficientes.
                </div>
              )}
              {kpis?.meses?.length>1 && (
                <div style={{marginTop:24,borderTop:`1px solid ${C.border}`,paddingTop:16}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.textDim,marginBottom:10,
                    textTransform:"uppercase",letterSpacing:"0.06em",fontFamily:MONO}}>
                    Meses no histórico
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {[...kpis.meses].sort().reverse().map(mes => {
                      const ativo = mes===mesSelecionado
                      return (
                        <button key={mes} onClick={()=>setMesSelecionado(mes)} style={{
                          padding:"6px 14px",borderRadius:7,fontSize:14,fontFamily:MONO,
                          fontWeight:700,cursor:"pointer",border:"1px solid",
                          borderColor:ativo?C.accent:"rgba(255,255,255,0.10)",
                          background:ativo?C.accent:"transparent",
                          color:ativo?"#0B1120":C.textMid,transition:"all 0.12s",
                        }}>{formatarMes(mes)}</button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ABA: Unidades */}
          {abaAtiva==="unidades" && (
            Object.keys(porUnidade).length===0 ? (
              <div style={{textAlign:"center",color:C.textDim,fontFamily:MONO,fontSize:15,paddingTop:50}}>
                Nenhum dado disponível para {formatarMes(mesSelecionado)||"este período"}.
              </div>
            ) : <TabelaUnidades porUnidade={porUnidade}/>
          )}
        </div>
      </div>

      <style>{`
        @keyframes ig-fade { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:translateY(0)} }
        .ig-card { animation: ig-fade 0.18s ease forwards; }
        .ig-card:hover { transform: translateY(-2px) !important; border-color: rgba(232,160,32,0.35) !important; }
        .ig-scroll::-webkit-scrollbar { width:6px; }
        .ig-scroll::-webkit-scrollbar-track { background: transparent; }
        .ig-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.14); border-radius:6px; }
        .ig-scroll::-webkit-scrollbar-thumb:hover { background: rgba(232,160,32,0.4); }
        input::placeholder { color: #64748B !important; }
        select option { background: #111827; color: #F1F5F9; }
      `}</style>
    </div>
  )
}
