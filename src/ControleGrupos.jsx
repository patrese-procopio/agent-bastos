import { useState, useEffect, useRef, useCallback } from "react"
import { jsPDF } from "jspdf"
import html2canvas from "html2canvas"
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
  "NEUTROS":        { bg:"#1E293B", text:"#94A3B8", border:"#334155", dot:"#64748B" },
  "LGBTQIAPN+":     { bg:"#FDF2F8", text:"#9D174D", border:"#FBCFE8", dot:"#EC4899" },
  "CRIMES SEXUAIS": { bg:"#FFF7ED", text:"#9A3412", border:"#FED7AA", dot:"#F97316" },
  "ISOLAMENTO":     { bg:"#292524", text:"#A8A29E", border:"#57534E", dot:"#78716C" },
  "MED. SEGURANÇA": { bg:"#1E3A5F", text:"#93C5FD", border:"#3B82F6", dot:"#60A5FA" },
}
const NOMES = { CDPM1:"CDPM I", CDPM2:"CDPM II", IPAT:"IPAT", UPP:"UPP", COMPAJ:"COMPAJ", CDF:"CDF" }
const NOMES_FULL = {
  CDPM1:"Centro de Detenção Provisória I", CDPM2:"Centro de Detenção Provisória II",
  IPAT:"Instituto Penal Antônio Trindade", UPP:"Unidade Prisional do Puraquequara",
  COMPAJ:"Complexo Penitenciário Anísio Jobim", CDF:"Centro de Detenção Feminino",
}
const FALLBACK = { atualizado:"2026-05", unidades:{
  CDPM1:{ img:"CDPM1.jpg", pavs:{
    P01:{l:"Pavilhão 01",g:"RDA",x:41,y:43},
    PANEXO:{l:"Pavilhão Anexo",g:"AMARELINHOS",x:21,y:47},
    P02A1:{l:"Pav. 02 Ala 01",g:"MED. SEGURANÇA",x:60,y:40},
    P02A2:{l:"Pav. 02 Ala 02",g:"LIDERANÇAS CV",x:60,y:51},
    P03:{l:"Pavilhão 03",g:"CRIMES SEXUAIS",x:30,y:30},
    P04:{l:"Pavilhão 04",g:"CV/AM",x:67,y:29},
    P05:{l:"Pavilhão 05",g:"JACK/TDA",x:30,y:10},
    P06:{l:"Pavilhão 06",g:"JACK/TDA",x:68,y:9},
  }},
  CDPM2:{ img:"CDPM2.jpg", pavs:{
    P01:{l:"Pavilhão 01",g:"PCC",x:55,y:46},
    P02:{l:"Pavilhão 02",g:"CV/AM",x:35,y:46},
    P03:{l:"Pavilhão 03",g:"AMARELINHOS",x:72,y:30},
    P04:{l:"Pavilhão 04",g:"CV/AM",x:36,y:30},
    P05:{l:"Pavilhão 05",g:"AMARELINHOS",x:70,y:11},
    P06:{l:"Pavilhão 06",g:"CV/AM",x:33,y:11},
    P07:{l:"Pavilhão 07",g:"LIDERANÇAS PCC",x:74,y:80},
  }},
  IPAT:{ img:"IPAT.jpg", pavs:{
    PA:{l:"Pavilhão A",g:"CV/AM",x:30,y:34},
    PB:{l:"Pavilhão B",g:"AMARELINHOS",x:51,y:19},
    PC:{l:"Pavilhão C",g:"CV/AM",x:70,y:34},
    PD:{l:"Pavilhão D",g:"LIDERANÇAS CV",x:67,y:71},
  }},
  UPP:{ img:"UPP.jpg", pavs:{
    G0102:{l:"Galerias 01 e 02",g:"AMARELINHOS",x:71,y:61},
    G0304:{l:"Galerias 03 e 04",g:"NEUTROS",x:68,y:47},
    G0607:{l:"Galerias 06 e 07",g:"NEUTROS",x:70,y:37},
    G05:{l:"Galeria 05",g:"NEUTROS",x:43,y:45},
    G08:{l:"Galeria 08",g:"ISOLAMENTO",x:43,y:37},
    G11:{l:"Galeria 11",g:"LGBTQIAPN+",x:43,y:23},
    G0910:{l:"Galerias 09 e 10",g:"JACK/TDA",x:73,y:22},
  }},
  COMPAJ:{ img:"COMPAJ.jpg", pavs:{
    P01:{l:"Pavilhão 01",g:"CV/AM",x:43,y:16},
    P02:{l:"Pavilhão 02",g:"CV/AM",x:46,y:32},
    P03:{l:"Pavilhão 03",g:"CV/AM",x:46,y:49},
    P05:{l:"Pavilhão 05",g:"CV/AM",x:46,y:79},
    P07:{l:"Pavilhão 07",g:"AMARELINHOS",x:20,y:62},
  }},
  CDF:{ img:"CDF.jpg", pavs:{
    P01A:{l:"Pav. 01-A",g:"CV/AM",x:51,y:32},
    P01B:{l:"Pav. 01-B",g:"AMARELINHOS",x:25,y:28},
    P02:{l:"Pav. 02 Condenadas",g:"CV/AM",x:74,y:27},
    P03:{l:"Pavilhão 03",g:"ISOLAMENTO",x:74,y:37},
    BERC:{l:"Berçário",g:"MED. SEGURANÇA",x:64,y:62},
  }},
}}

function normalizar(d) {
  if (!d?.unidades) return FALLBACK
  const out = { atualizado: d.atualizado || "-", unidades: {} }
  for (const [k, u] of Object.entries(d.unidades)) {
    const img = u.imagem || u.img || k + ".jpg"
    const pavs = {}
    for (const [id, p] of Object.entries(u.pavilhoes || u.pavs || {})) {
      pavs[id] = { l: p.label || p.l, g: p.grupo || p.g, x: p.x, y: p.y }
    }
    out.unidades[k] = { img, pavs }
  }
  return out
}

const CSS = `
  @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pulse{0%,100%{box-shadow:0 0 0 0px rgba(0,0,0,0.1)}50%{box-shadow:0 0 0 10px rgba(0,0,0,0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  .cg-enter{animation:fadeIn 0.2s ease forwards}
  .ppulse{animation:pulse 1.2s ease-in-out 3}
  .spin{animation:spin 1s linear infinite}
  ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#1E293B;border-radius:4px}
  .pr:hover{background:rgba(255,255,255,0.06)!important}
  .ut:hover{background:rgba(255,255,255,0.12)!important;color:#FFFFFF!important}
`

export default function ControleGrupos({ onNavigate }) {
  const [unit, setUnit]             = useState("CDPM1")
  const [pav, setPav]               = useState(null)
  const [err, setErr]               = useState({})
  const [imgRect, setImgRect]       = useState(null)
  const [dados, setDados]           = useState(FALLBACK)
  const [carregando, setCarregando] = useState(true)
  const [erroApi, setErroApi]       = useState(false)
  const [exportando, setExportando] = useState(false)
  const imgRef  = useRef(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    const s = document.createElement("style")
    s.textContent = CSS
    document.head.appendChild(s)
    return () => document.head.removeChild(s)
  }, [])

  useEffect(() => {
    setCarregando(true)
    fetch("http://127.0.0.1:8000/ocupacao")
      .then(r => r.json())
      .then(d => { setDados(normalizar(d)); setErroApi(false) })
      .catch(() => { setDados(FALLBACK); setErroApi(true) })
      .finally(() => setCarregando(false))
  }, [])

  useEffect(() => { setPav(null); setImgRect(null) }, [unit])

  const calcRect = useCallback(() => {
    if (!imgRef.current || !wrapRef.current) return
    const img  = imgRef.current
    const wrap = wrapRef.current
    const wW = wrap.offsetWidth, wH = wrap.offsetHeight
    const iW = img.naturalWidth,  iH = img.naturalHeight
    const scale = Math.min(wW / iW, wH / iH)
    const rW = iW * scale, rH = iH * scale
    setImgRect({ offX:(wW-rW)/2, offY:(wH-rH)/2, rW, rH, wW, wH })
  }, [])

  function pinPos(px, py) {
    if (!imgRect) return { left:px+"%", top:py+"%" }
    const { offX, offY, rW, rH, wW, wH } = imgRect
    return {
      left: ((offX + (px/100)*rW) / wW * 100).toFixed(2) + "%",
      top:  ((offY + (py/100)*rH) / wH * 100).toFixed(2) + "%",
    }
  }

  const ud     = dados.unidades[unit]
  const pavs   = ud?.pavs || {}
  const imgSrc = `./src/assets/unidades/${ud?.img}`
  const grups  = [...new Set(Object.values(pavs).map(p => p.g))]

  // ── Exportação PDF ─────────────────────────────────────────────────────────
  async function exportarPDF() {
    if (!wrapRef.current || exportando) return
    setExportando(true)
    try {
      const W = 210, ml = 16, mr = 16, cw = W - ml - mr
      const AZUL   = [15, 23, 42]
      const GOLD   = [180, 83, 9]
      const CINZA  = [100, 116, 139]
      const BORDA  = [226, 232, 240]
      const BRANCO = [255, 255, 255]

      const canvas = await html2canvas(wrapRef.current, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
        backgroundColor: "#0A0E14",
        logging: false,
      })
      const mapaImg   = canvas.toDataURL("image/jpeg", 0.92)
      const mapaRatio = canvas.height / canvas.width
      const mapaW     = cw
      const mapaH     = Math.min(mapaW * mapaRatio, 100)

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
      let y = 0

      doc.setFillColor(...AZUL)
      doc.rect(0, 0, W, 28, "F")
      doc.setFillColor(...GOLD)
      doc.rect(0, 28, W, 2, "F")
      doc.setTextColor(...BRANCO)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(15)
      doc.text("AGENT BASTOS", ml, 11)
      doc.setFontSize(8)
      doc.setFont("helvetica", "normal")
      doc.text("Sistema de Inteligência e Segurança Corporativa", ml, 17)
      doc.setFontSize(7)
      doc.text(`Relatório gerado em: ${new Date().toLocaleString("pt-BR")}`, ml, 22)
      doc.setFillColor(...GOLD)
      doc.roundedRect(W - mr - 32, 8, 32, 10, 2, 2, "F")
      doc.setTextColor(...BRANCO)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(7)
      doc.text("CONFIDENCIAL", W - mr - 16, 14.5, { align: "center" })
      y = 36

      doc.setTextColor(...AZUL)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(13)
      doc.text("MAPA DE CONTROLE DE GRUPOS", ml, y + 7)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8)
      doc.setTextColor(...CINZA)
      doc.text(`Unidade: ${NOMES_FULL[unit]}  ·  Competência: ${dados.atualizado}  ·  ${Object.keys(pavs).length} locais mapeados`, ml, y + 13)
      doc.setDrawColor(...BORDA)
      doc.line(ml, y + 16, W - mr, y + 16)
      y += 22

      doc.setDrawColor(...BORDA)
      doc.roundedRect(ml, y, mapaW, mapaH, 2, 2, "S")
      doc.addImage(mapaImg, "JPEG", ml, y, mapaW, mapaH, undefined, "FAST")
      y += mapaH + 8

      doc.setFont("helvetica", "bold")
      doc.setFontSize(8)
      doc.setTextColor(...AZUL)
      doc.text("GRUPOS PRESENTES NESTA UNIDADE", ml, y + 5)
      doc.setFillColor(...GOLD)
      doc.rect(ml, y + 7, 46, 0.7, "F")
      y += 11

      let gx = ml
      grups.forEach((g) => {
        const hex = CORES[g]?.dot || "#94A3B8"
        const r = parseInt(hex.slice(1,3),16)
        const gv = parseInt(hex.slice(3,5),16)
        const b = parseInt(hex.slice(5,7),16)
        const chipW = Math.min(doc.getTextWidth(g) * 2.8 + 10, 45)
        if (gx + chipW > W - mr) { gx = ml; y += 9 }
        doc.setFillColor(248, 250, 252)
        doc.setDrawColor(r, gv, b)
        doc.roundedRect(gx, y, chipW, 7, 1.5, 1.5, "FD")
        doc.setFillColor(r, gv, b)
        doc.circle(gx + 3.5, y + 3.5, 1.3, "F")
        doc.setFont("helvetica", "bold")
        doc.setFontSize(6)
        doc.setTextColor(15, 23, 42)
        doc.text(g, gx + 7, y + 4.5)
        gx += chipW + 4
      })
      y += 13

      if (y > 220) { doc.addPage(); y = 18 }

      doc.setFont("helvetica", "bold")
      doc.setFontSize(8)
      doc.setTextColor(...AZUL)
      doc.text("DETALHAMENTO DOS LOCAIS", ml, y + 5)
      doc.setFillColor(...GOLD)
      doc.rect(ml, y + 7, 34, 0.7, "F")
      y += 12

      doc.setFillColor(...AZUL)
      doc.rect(ml, y, cw, 7, "F")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(7)
      doc.setTextColor(...BRANCO)
      doc.text("LOCAL / PAVILHÃO", ml + 3, y + 5)
      doc.text("GRUPO", ml + cw * 0.65, y + 5)

      y += 7
      Object.entries(pavs).forEach(([id, p], i) => {
        if (y > 265) { doc.addPage(); y = 18 }
        const hex = CORES[p.g]?.dot || "#94A3B8"
        const r = parseInt(hex.slice(1,3),16)
        const gv = parseInt(hex.slice(3,5),16)
        const b = parseInt(hex.slice(5,7),16)

        doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 252 : 255)
        doc.rect(ml, y, cw, 7, "F")
        doc.setFillColor(r, gv, b)
        doc.rect(ml, y, 2.5, 7, "F")
        doc.setFont("helvetica", "normal")
        doc.setFontSize(7)
        doc.setTextColor(15, 23, 42)
        doc.text(p.l, ml + 6, y + 4.8)
        doc.setFillColor(r, gv, b)
        doc.circle(ml + cw * 0.65, y + 3.5, 1.5, "F")
        doc.setFont("helvetica", "bold")
        doc.setFontSize(6.5)
        doc.setTextColor(r, gv, b)
        doc.text(p.g, ml + cw * 0.65 + 4, y + 4.8)
        doc.setDrawColor(...BORDA)
        doc.line(ml, y + 7, ml + cw, y + 7)
        y += 7
      })

      const pageCount = doc.getNumberOfPages()
      for (let p2 = 1; p2 <= pageCount; p2++) {
        doc.setPage(p2)
        doc.setFillColor(...AZUL)
        doc.rect(0, 287, W, 10, "F")
        doc.setFont("helvetica", "normal")
        doc.setFontSize(6)
        doc.setTextColor(...BRANCO)
        doc.text("Agent Bastos · Sistema de Inteligência Corporativa · USO INTERNO · CONFIDENCIAL", ml, 293)
        doc.text(`Página ${p2} de ${pageCount}`, W - mr, 293, { align: "right" })
      }

      doc.save(`mapa-controle-${unit.toLowerCase()}-${dados.atualizado}.pdf`)
    } catch (e) {
      console.error("Erro ao exportar PDF:", e)
    } finally {
      setExportando(false)
    }
  }

  if (carregando) return (
    <div style={{display:"flex",flex:1,alignItems:"center",justifyContent:"center",flexDirection:"column",gap:10,background:"#0A0E14"}}>
      <svg className="spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      <span style={{fontSize:15.6,color:"#94A3B8",fontFamily:MONO}}>Carregando dados do Drive...</span>
    </div>
  )

  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,minWidth:0,height:"100%",overflow:"hidden",background:"#0F172A",fontFamily:SANS,position:"relative"}}>
      {/* Textura de ruído — dá substância ao backdrop-filter da sidebar */}
      <div style={{position:"absolute",inset:0,zIndex:0,pointerEvents:"none",backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,backgroundRepeat:"repeat",opacity:1}}/>
      {/* Gradiente diagonal sutil — dá variação de tom ao fundo */}
      <div style={{position:"absolute",inset:0,zIndex:0,pointerEvents:"none",background:"linear-gradient(135deg, rgba(30,58,138,0.08) 0%, transparent 50%, rgba(15,23,42,0.12) 100%)"}}/>
      <div style={{position:"relative",zIndex:1,display:"flex",flexDirection:"column",flex:1,minWidth:0,height:"100%",overflow:"hidden"}}>
      <div style={{height:56,borderBottom:"1px solid rgba(255,255,255,0.07)",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 18px",background:"#0F172A",flexShrink:0,boxShadow:"0 1px 4px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <div style={{display:"flex",flexDirection:"column",gap:1}}>
            <span style={{fontSize:11,fontWeight:600,color:"#475569",letterSpacing:"0.10em",textTransform:"uppercase",fontFamily:MONO}}>Controle de Grupos</span>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:17,fontWeight:800,color:"#F8FAFC",letterSpacing:"0.01em"}}>{NOMES_FULL[unit]}</span>
              <span style={{fontSize:10,fontWeight:700,color:"#B45309",background:"rgba(180,83,9,0.12)",border:"1px solid rgba(180,83,9,0.35)",borderRadius:4,padding:"2px 7px",fontFamily:MONO,letterSpacing:"0.06em",textTransform:"uppercase"}}>{NOMES[unit]}</span>
            </div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {erroApi && <span style={{fontSize:11.7,color:"#F87171",fontFamily:MONO,background:"rgba(239,68,68,0.10)",padding:"2px 8px",borderRadius:4,border:"1px solid rgba(239,68,68,0.3)"}}>offline — dados locais</span>}
          <button
            onClick={exportarPDF}
            disabled={exportando}
            style={{
              background: exportando ? "#0D1526" : "#B45309",
              color: exportando ? "#94A3B8" : "#111827",
              border: "none", borderRadius: 7, padding: "5px 12px",
              fontSize: 16.9, fontWeight: 700, cursor: exportando ? "not-allowed" : "pointer",
              fontFamily: MONO, letterSpacing: "0.05em",
            }}
          >
            {exportando ? "GERANDO..." : "↓ EXPORTAR PDF"}
          </button>
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"3px 10px",background:"rgba(74,222,128,0.08)",border:"1px solid rgba(74,222,128,0.3)",borderRadius:20}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:"#16A34A",boxShadow:"0 0 5px rgba(22,163,74,0.7)"}}/>
            <span style={{fontSize:11.7,color:"#4ADE80",fontFamily:MONO,fontWeight:600}}>atualizado: {dados.atualizado}</span>
          </div>
        </div>
      </div>
      <div style={{display:"flex",gap:2,padding:"8px 14px 0",background:"#0F172A",borderBottom:"1px solid rgba(255,255,255,0.07)",flexShrink:0,overflowX:"auto"}}>
        {Object.entries(NOMES).map(([k,n]) => {
          const isA = unit===k
          const gs  = [...new Set(Object.values(dados.unidades[k]?.pavs||{}).map(p=>p.g))]
          const cor = gs.some(g=>g.includes("CV")) ? "#DC2626" : gs.some(g=>g.includes("PCC")) ? "#3B82F6" : "#94A3B8"
          return (
            <button key={k} className="ut" onClick={()=>setUnit(k)} style={{padding:"7px 18px",borderRadius:"6px 6px 0 0",border:"1px solid",borderBottom:"none",fontSize:13,fontWeight:700,cursor:"pointer",transition:"all 0.15s",fontFamily:MONO,background:isA?"#131C2E":"rgba(255,255,255,0.05)",color:isA?"#FFFFFF":"#CBD5E1",borderColor:isA?"rgba(255,255,255,0.15)":"rgba(255,255,255,0.08)",letterSpacing:"0.04em"}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:cor,display:"inline-block",marginRight:7,verticalAlign:"middle",boxShadow:`0 0 5px ${cor}88`}}/>{n}
            </button>
          )
        })}
      </div>
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <div style={{width:268,flexShrink:0,borderRight:"1px solid rgba(255,255,255,0.08)",display:"flex",flexDirection:"column",background:"rgba(13,21,38,0.75)",overflow:"hidden",boxShadow:"2px 0 12px rgba(0,0,0,0.4)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)"}}>
          <div style={{padding:"14px 16px 12px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(10,14,20,0.6)",flexShrink:0}}>
            <div style={{fontSize:13,fontWeight:800,color:"#64748B",letterSpacing:"0.12em",textTransform:"uppercase",fontFamily:MONO,marginBottom:10}}>Grupos presentes</div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {grups.map(g => { const c=CORES[g]||CORES["NEUTROS"]; return (
                <div key={g} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:6,background:"rgba(255,255,255,0.03)",border:`1px solid rgba(255,255,255,0.08)`,borderLeft:`3px solid ${c.dot}`}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:c.dot,flexShrink:0,boxShadow:`0 0 5px ${c.dot}99`}}/>
                  <span style={{fontSize:11,color:c.text,fontFamily:MONO,fontWeight:700,letterSpacing:"0.06em"}}>{g}</span>
                </div>
              )})}
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto"}}>
            {Object.entries(pavs).map(([id,p]) => {
              const c=CORES[p.g]||CORES["NEUTROS"]; const isA=pav===id
              return (
                <div key={id} className="pr" onClick={()=>setPav(v=>v===id?null:id)} style={{display:"flex",alignItems:"center",gap:10,padding:"13px 12px",cursor:"pointer",transition:"all 0.12s",background:isA?"rgba(180,83,9,0.12)":"transparent",borderBottom:"1px solid rgba(255,255,255,0.07)",borderLeft:`3px solid ${isA?c.dot:"transparent"}`}}>
                  <div style={{width:14,height:14,borderRadius:"50%",background:c.dot,flexShrink:0,boxShadow:isA?`0 0 8px ${c.dot}`:`0 0 4px ${c.dot}88`}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:isA?700:600,color:"#F1F5F9",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.l}</div>
                    <div style={{fontSize:12,color:c.dot,fontFamily:MONO,marginTop:3,fontWeight:700}}>{p.g}</div>
                  </div>
                  {isA && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>}
                </div>
              )
            })}
          </div>
          <div style={{padding:"10px 16px",borderTop:"1px solid rgba(255,255,255,0.06)",background:"rgba(10,14,20,0.6)",flexShrink:0}}>
            <span style={{fontSize:13,color:"#475569",fontFamily:MONO}}>{Object.keys(pavs).length} locais mapeados</span>
          </div>
        </div>
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",padding:"14px",background:"#0F172A"}}>
          <div style={{display:"flex",flexWrap:"wrap",gap:16,padding:"10px 16px",background:"#0D1526",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,marginBottom:12,flexShrink:0,boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
            {grups.map(g => { const c=CORES[g]||CORES["NEUTROS"]; return <div key={g} style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:10,height:10,borderRadius:"50%",background:c.dot,flexShrink:0,boxShadow:`0 0 5px ${c.dot}99`}}/><span style={{fontSize:12,color:"#F1F5F9",fontFamily:MONO,fontWeight:700}}>{g}</span></div> })}
          </div>
          <div ref={wrapRef} style={{flex:1,position:"relative",borderRadius:10,overflow:"hidden",border:"1px solid rgba(255,255,255,0.07)",minHeight:0,background:"#0F172A",backgroundImage:`url(${imgSrc})`,backgroundSize:"cover",backgroundPosition:"center",boxShadow:"0 2px 8px rgba(0,0,0,0.08)"}}>
            {err[unit] ? (
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:8}}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <span style={{fontSize:14.3,color:"#94A3B8",fontFamily:MONO}}>Imagem não encontrada: {ud?.img}</span>
              </div>
            ) : (
              <>
                <div style={{position:"absolute",inset:0,backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",background:"rgba(0,0,0,0.35)",zIndex:0}}/>
                <img ref={imgRef} src={imgSrc} alt={unit} onLoad={calcRect} onError={()=>setErr(e=>({...e,[unit]:true}))} style={{width:"100%",height:"100%",objectFit:"contain",display:"block",position:"relative",zIndex:1}}/>
              </>
            )}
            {!err[unit] && imgRect && Object.entries(pavs).map(([id,p]) => {
              const c=CORES[p.g]||CORES["NEUTROS"]; const isA=pav===id; const pos=pinPos(p.x,p.y)
              return (
                <div key={id} onClick={()=>setPav(v=>v===id?null:id)} style={{position:"absolute",left:pos.left,top:pos.top,transform:"translate(-50%,-50%)",cursor:"pointer",zIndex:isA?20:10,display:"flex",flexDirection:"column",alignItems:"center"}}>
                  {isA && <div className="ppulse" style={{position:"absolute",top:0,left:"50%",transform:"translate(-50%,-50%)",width:36,height:36,borderRadius:"50%",border:`2px solid ${c.dot}`,background:c.dot+"22",pointerEvents:"none"}}/>}
                  <div style={{width:isA?16:13,height:isA?16:13,borderRadius:"50%",background:c.dot,border:"2.5px solid #0F172A",boxShadow:isA?`0 0 0 3px ${c.dot}55,0 2px 10px rgba(0,0,0,0.4)`:"0 1px 5px rgba(0,0,0,0.4)",transition:"all 0.2s",position:"relative",zIndex:2,flexShrink:0}}/>
                  <div style={{marginTop:4,background:"rgba(10,14,20,0.88)",border:`1px solid ${c.dot}55`,borderRadius:4,padding:"3px 7px",whiteSpace:"nowrap",boxShadow:"0 1px 4px rgba(0,0,0,0.4)",textAlign:"center",zIndex:2,backdropFilter:"blur(6px)"}}>
                    <div style={{fontSize:11.7,fontWeight:700,color:"#F1F5F9",fontFamily:MONO,lineHeight:1.3}}>{p.l}</div>
                    <div style={{fontSize:8,color:c.dot,fontFamily:MONO,fontWeight:700,lineHeight:1.3}}>{p.g}</div>
                  </div>
                  {isA && (
                    <div style={{position:"absolute",bottom:"calc(100% + 12px)",left:"50%",transform:"translateX(-50%)",background:"#0D1526",border:`2px solid ${c.dot}`,borderRadius:8,padding:"8px 14px",whiteSpace:"nowrap",boxShadow:"0 4px 20px rgba(0,0,0,0.4)",zIndex:30,minWidth:150,backdropFilter:"blur(8px)"}}>
                      <div style={{fontSize:15.6,fontWeight:700,color:"#F1F5F9",fontFamily:MONO}}>{p.l}</div>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:5}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:c.dot}}/>
                        <span style={{fontSize:14.3,color:c.dot,fontWeight:700}}>{p.g}</span>
                      </div>
                      <div style={{position:"absolute",bottom:-6,left:"50%",width:10,height:10,background:"#0D1526",border:`2px solid ${c.dot}`,borderTop:"none",borderLeft:"none",transform:"translateX(-50%) rotate(45deg)"}}/>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {pav && pavs[pav] && (() => {
            const c = CORES[pavs[pav].g] || CORES["NEUTROS"]
            return (
              <div className="cg-enter" style={{marginTop:10,padding:"10px 16px",flexShrink:0,background:"#0D1526",border:`1px solid ${c.border}`,borderLeft:`4px solid ${c.dot}`,borderRadius:8,display:"flex",alignItems:"center",gap:12,boxShadow:"0 2px 6px rgba(0,0,0,0.2)"}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:c.dot,flexShrink:0}}/>
                <span style={{fontSize:13,fontWeight:700,color:"#F1F5F9"}}>{pavs[pav].l}</span>
                <span style={{fontSize:14.3,fontWeight:700,padding:"3px 10px",borderRadius:4,background:c.bg,color:c.text,border:`1px solid ${c.border}`,fontFamily:MONO}}>{pavs[pav].g}</span>
                <button onClick={()=>setPav(null)} style={{marginLeft:"auto",background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:18}}>×</button>
              </div>
            )
          })()}
        </div>
      </div>
      </div>
    </div>
  )
}