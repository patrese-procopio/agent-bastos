import { useState, useEffect, useRef } from "react"
import api from "./api"

const API     = "http://127.0.0.1:8000"
const API_LID = "/api-proxy/liderancas"
const tkn     = () => localStorage.getItem("ab_access_token") || ""
const MONO    = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS    = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

// ── Paleta enterprise (alinhada às demais telas) ──────────────────────────────
const C = {
  bg:        "#0B1120", surface:  "#111827", surfaceUp: "#1A2236",
  border:    "rgba(255,255,255,0.07)", text: "#F1F5F9", textMid: "#94A3B8",
  textDim:   "#64748B", accent: "#E8A020", accentHover: "#B45309",
}

const FACCAO_COR = {
  "CV/AM":          { dot:"#EF4444", bg:"rgba(239,68,68,0.12)",   border:"rgba(239,68,68,0.3)",   text:"#FCA5A5" },
  "PCC":            { dot:"#3B82F6", bg:"rgba(59,130,246,0.12)",  border:"rgba(59,130,246,0.3)",  text:"#93C5FD" },
  "RDA":            { dot:"#22C55E", bg:"rgba(34,197,94,0.12)",   border:"rgba(34,197,94,0.3)",   text:"#86EFAC" },
  "NEUTROS":        { dot:"#94A3B8", bg:"rgba(148,163,184,0.08)", border:"rgba(148,163,184,0.2)", text:"#CBD5E1" },
  "CRIMES SEXUAIS": { dot:"#F97316", bg:"rgba(249,115,22,0.12)",  border:"rgba(249,115,22,0.3)",  text:"#FDBA74" },
  "JACK/TDA":       { dot:"#8B5CF6", bg:"rgba(139,92,246,0.12)",  border:"rgba(139,92,246,0.3)",  text:"#C4B5FD" },
  "AMARELINHOS":    { dot:"#F59E0B", bg:"rgba(245,158,11,0.12)",  border:"rgba(245,158,11,0.3)",  text:"#FCD34D" },
  "ISOLAMENTO":     { dot:"#6B7280", bg:"rgba(107,114,128,0.08)", border:"rgba(107,114,128,0.2)", text:"#9CA3AF" },
  "MED. SEGURANÇA": { dot:"#06B6D4", bg:"rgba(6,182,212,0.08)",   border:"rgba(6,182,212,0.2)",   text:"#67E8F9" },
  "LIDERANÇAS CV":  { dot:"#EC4899", bg:"rgba(236,72,153,0.12)",  border:"rgba(236,72,153,0.3)",  text:"#F9A8D4" },
  "LIDERANÇAS PCC": { dot:"#60A5FA", bg:"rgba(96,165,250,0.12)",  border:"rgba(96,165,250,0.3)",  text:"#BFDBFE" },
  "LGBTQIAPN+":     { dot:"#EC4899", bg:"rgba(236,72,153,0.08)",  border:"rgba(236,72,153,0.2)",  text:"#F9A8D4" },
}
const corF = f => FACCAO_COR[f] || { dot:"#94A3B8", bg:"rgba(148,163,184,0.08)", border:"rgba(148,163,184,0.2)", text:"#CBD5E1" }

const MESES = ["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
const fmtComp = c => { try { const [a,m]=c.split("-"); return `${MESES[+m]} ${a}` } catch { return c||"" } }

const iStyle = {
  padding:"9px 12px", borderRadius:4, border:`1px solid ${C.border}`,
  fontSize:13, color:C.text, fontFamily:MONO, background:C.surface,
  outline:"none", width:"100%", boxSizing:"border-box",
}

// ── FotoLider: busca foto via fetch com auth, exibe como blob local ──────────
function FotoLider({ liderId, alt, atualizado }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    if (!liderId) return
    let objUrl = null
    api.get(`/liderancas/foto/${liderId}`)
      .then(r => r.ok ? r.blob() : null)
      .then(blob => { if (blob) { objUrl = URL.createObjectURL(blob); setSrc(objUrl) } })
      .catch(() => {})
    return () => { if (objUrl) URL.revokeObjectURL(objUrl) }
  }, [liderId, atualizado])
  return src
    ? <img src={src} alt={alt||""} style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"top"}}/>
    : <span style={{fontSize:22}}>👤</span>
}

// ── FotoUpload ────────────────────────────────────────────────────────────────
function FotoUpload({ fotoUrl, onChange }) {
  const ref = useRef(null)
  const [preview, setPreview] = useState(fotoUrl||null)
  const [drag, setDrag] = useState(false)
  useEffect(()=>setPreview(fotoUrl||null),[fotoUrl])
  const handle = f => { if(!f) return; setPreview(URL.createObjectURL(f)); onChange(f) }
  return (
    <div onClick={()=>ref.current?.click()}
      onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
      onDrop={e=>{e.preventDefault();setDrag(false);handle(e.dataTransfer.files[0])}}
      style={{width:110,height:138,borderRadius:6,overflow:"hidden",flexShrink:0,
        border:`1px dashed ${drag?C.accent:C.border}`,background:drag?"rgba(194,106,26,0.1)":C.surfaceUp,
        cursor:"pointer",position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
      {preview
        ? <img src={preview} alt="foto" style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"top"}}/>
        : <div style={{textAlign:"center",padding:8}}>
            <div style={{fontSize:24,marginBottom:6}}>📷</div>
            <div style={{fontSize:11,color:C.textMid,fontFamily:MONO,lineHeight:1.4}}>Clique ou<br/>arraste foto</div>
          </div>}
      <input ref={ref} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handle(e.target.files[0])}/>
      {preview && <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,0.7)",
        padding:4,fontSize:9,color:"#FFF",textAlign:"center",fontFamily:MONO}}>trocar</div>}
    </div>
  )
}

function Campo({ label, children, required }) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:5}}>
      <label style={{fontSize:10,fontWeight:700,color:C.textMid,fontFamily:MONO,
        letterSpacing:"0.15em",textTransform:"uppercase"}}>
        {label}{required&&<span style={{color:"#EF4444"}}> *</span>}
      </label>
      {children}
    </div>
  )
}

// ── Modal PDF ─────────────────────────────────────────────────────────────────
function ModalPDF({ unidade, unidadeLabel, competencia, competencias, onFechar }) {
  const [tipo, setTipo] = useState("unidade")
  const [comp, setComp] = useState(competencia)
  const [baixando, setBaixando] = useState(false)

  async function baixar() {
    setBaixando(true)
    try {
      const url = tipo==="geral"
        ? `/liderancas/pdf-geral/todas?competencia=${comp}`
        : `/liderancas/pdf/${unidade}?competencia=${comp}`
      const res  = await api.get(url)
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const a    = document.createElement("a")
      a.href     = URL.createObjectURL(blob)
      a.download = tipo==="geral" ? `liderancas_geral_${comp}.pdf` : `liderancas_${unidade}_${comp}.pdf`
      a.click()
    } catch(e) { alert("Erro: "+e.message) }
    finally { setBaixando(false) }
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:1100,padding:20}}>
      <div style={{background:C.surface,borderRadius:8,width:"100%",maxWidth:420,
        border:`1px solid ${C.border}`,overflow:"hidden"}}>
        <div style={{padding:"14px 20px",background:C.surfaceUp,borderBottom:`1px solid ${C.border}`,
          display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:C.text,fontFamily:MONO}}>EXPORTAR PDF</div>
            <div style={{fontSize:11,color:C.textMid,fontFamily:MONO,marginTop:2}}>Relatório de lideranças — CONFIDENCIAL</div>
          </div>
          <button onClick={onFechar} style={{background:"transparent",border:`1px solid ${C.border}`,
            borderRadius:4,width:28,height:28,cursor:"pointer",color:C.textMid,fontSize:16,
            display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
        <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
          <Campo label="Tipo de relatório" required>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[{id:"unidade",label:`${unidadeLabel} apenas`},{id:"geral",label:"Todas as unidades"}].map(t=>(
                <button key={t.id} onClick={()=>setTipo(t.id)} style={{
                  padding:"10px",borderRadius:4,cursor:"pointer",transition:"all .15s",
                  border:`1px solid ${tipo===t.id?C.accent:C.border}`,
                  background:tipo===t.id?"rgba(194,106,26,0.15)":C.surfaceUp,
                  color:tipo===t.id?C.accent:C.textMid,
                  fontSize:12,fontWeight:tipo===t.id?700:500,fontFamily:MONO}}>
                  {t.label}
                </button>
              ))}
            </div>
          </Campo>
          <Campo label="Competência" required>
            <select value={comp} onChange={e=>setComp(e.target.value)} style={iStyle}>
              {competencias.length>0
                ? competencias.map(c=><option key={c} value={c}>{fmtComp(c)}</option>)
                : <option value={competencia}>{fmtComp(competencia)}</option>}
            </select>
          </Campo>
        </div>
        <div style={{padding:"12px 20px",borderTop:`1px solid ${C.border}`,
          display:"flex",justifyContent:"flex-end",gap:8,background:C.surfaceUp}}>
          <button onClick={onFechar} style={{padding:"8px 16px",borderRadius:4,
            border:`1px solid ${C.border}`,background:"transparent",fontSize:12,
            color:C.textMid,cursor:"pointer",fontFamily:MONO}}>Cancelar</button>
          <button onClick={baixar} disabled={baixando} style={{
            padding:"8px 18px",borderRadius:4,border:"none",
            background:baixando?C.surfaceUp:`linear-gradient(135deg,${C.accent},${C.accentHover})`,
            color:baixando?C.textMid:"#FFF",fontSize:12,fontWeight:700,
            cursor:baixando?"not-allowed":"pointer",fontFamily:MONO}}>
            {baixando?"Gerando...":"↓ Baixar PDF"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal Cadastro/Edição ─────────────────────────────────────────────────────
function ModalLider({ lider, estrutura, faccoes, cargosPorFaccao, unidadeAtiva,
  pavilhaoInicial, alaInicial, competenciaAtiva, onSalvar, onFechar }) {
  const isEdicao = !!lider?.id
  const [form, setForm] = useState({
    unidade:unidadeAtiva, pavilhao:pavilhaoInicial||"", ala:alaInicial||"",
    cela:"", faccao:"", cargo:"", nome:"", vulgo:"", observacao:"",
    competencia:competenciaAtiva||"", ...(isEdicao?lider:{}),
  })
  const [fotoFile, setFotoFile] = useState(null)
  const [fotoBlob, setFotoBlob] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro]         = useState("")

  useEffect(() => {
    if (!isEdicao || !lider.foto_ext) return
    let objUrl = null
    api.get(`/liderancas/foto/${lider.id}`)
      .then(r => r.ok ? r.blob() : null)
      .then(blob => { if (blob) { objUrl = URL.createObjectURL(blob); setFotoBlob(objUrl) } })
      .catch(() => {})
    return () => { if (objUrl) URL.revokeObjectURL(objUrl) }
  }, [])

  const est       = estrutura||{}
  const pavilhoes = Object.keys(est[form.unidade]?.pavilhoes||{})
  const alas      = Object.keys(est[form.unidade]?.pavilhoes?.[form.pavilhao]||{})
  const celas     = est[form.unidade]?.pavilhoes?.[form.pavilhao]?.[form.ala]||[]
  const cargos    = cargosPorFaccao[form.faccao]||[]
  const cor       = corF(form.faccao)

  function set(k,v) {
    setForm(prev=>{
      const n={...prev,[k]:v}
      if(k==="unidade")  {n.pavilhao="";n.ala="";n.cela=""}
      if(k==="pavilhao") {n.ala="";n.cela=""}
      if(k==="ala")      {n.cela=""}
      if(k==="faccao")   {n.cargo=""}
      return n
    })
  }

  async function salvar() {
    if(!form.pavilhao||!form.ala||!form.faccao||!form.cargo) {
      setErro("Pavilhão, Ala, Facção e Cargo são obrigatórios."); return
    }
    setSalvando(true); setErro("")
    try {
      const fd=new FormData()
      Object.entries(form).forEach(([k,v])=>fd.append(k,v||""))
      if(fotoFile) fd.append("foto",fotoFile)
      const res=isEdicao ? await api.uploadPut(`/liderancas/${lider.id}`,fd) : await api.upload("/liderancas",fd)
      if(!res.ok) throw new Error(await res.text())
      onSalvar(await res.json())
    } catch(e){setErro("Erro: "+e.message)}
    finally{setSalvando(false)}
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20}}>
      <div style={{background:C.surface,borderRadius:8,width:"100%",maxWidth:540,
        border:`1px solid ${C.border}`,display:"flex",flexDirection:"column",maxHeight:"92vh",overflow:"hidden"}}>
        {/* Header */}
        <div style={{padding:"14px 20px",background:C.surfaceUp,borderBottom:`1px solid ${C.border}`,
          display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:C.text,fontFamily:MONO}}>
              {isEdicao?"EDITAR LÍDER":"CADASTRAR LÍDER"}
            </div>
            <div style={{fontSize:11,color:C.textMid,fontFamily:MONO,marginTop:2}}>
              {isEdicao?`ID: ${lider.id.slice(0,8)}...`:"Novo registro de liderança"}
            </div>
          </div>
          <button onClick={onFechar} style={{background:"transparent",border:`1px solid ${C.border}`,
            borderRadius:4,width:28,height:28,cursor:"pointer",color:C.textMid,fontSize:16,
            display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>

        {/* Body */}
        <div style={{padding:20,overflowY:"auto",display:"flex",flexDirection:"column",gap:14}}>
          {/* Foto + nome */}
          <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
            <FotoUpload fotoUrl={fotoBlob} onChange={setFotoFile}/>
            <div style={{flex:1,display:"flex",flexDirection:"column",gap:10}}>
              <Campo label="Vulgo / Apelido">
                <input value={form.vulgo} onChange={e=>set("vulgo",e.target.value)}
                  placeholder="ex: Carnaúba"
                  style={{...iStyle,fontSize:15,fontWeight:700,color:cor.dot,borderColor:cor.border}}/>
              </Campo>
              <Campo label="Nome completo">
                <input value={form.nome} onChange={e=>set("nome",e.target.value)}
                  placeholder="Nome civil" style={iStyle}/>
              </Campo>
            </div>
          </div>

          <div style={{height:1,background:C.border}}/>

          {/* Competência */}
          <div style={{padding:"10px 14px",background:"rgba(245,158,11,0.08)",
            border:"1px solid rgba(245,158,11,0.25)",borderLeft:"3px solid #F59E0B",borderRadius:4}}>
            <div style={{fontSize:10,fontWeight:700,color:"#F59E0B",fontFamily:MONO,
              letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:6}}>
              COMPETÊNCIA (MÊS/ANO) *
            </div>
            <input type="month" value={form.competencia} onChange={e=>set("competencia",e.target.value)}
              style={{...iStyle,borderColor:"rgba(245,158,11,0.3)",color:"#F59E0B",fontWeight:700}}/>
          </div>

          <div style={{height:1,background:C.border}}/>

          {/* Localização */}
          <div>
            <div style={{fontSize:10,fontWeight:700,color:C.textMid,fontFamily:MONO,
              letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:10}}>LOCALIZAÇÃO</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Campo label="Unidade" required>
                <select value={form.unidade} onChange={e=>set("unidade",e.target.value)} style={iStyle}>
                  {Object.entries(est).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
              </Campo>
              <Campo label="Pavilhão" required>
                <select value={form.pavilhao} onChange={e=>set("pavilhao",e.target.value)}
                  style={iStyle} disabled={!form.unidade}>
                  <option value="">Selecione...</option>
                  {pavilhoes.map(p=><option key={p} value={p}>{p}</option>)}
                </select>
              </Campo>
              <Campo label="Ala" required>
                <select value={form.ala} onChange={e=>set("ala",e.target.value)}
                  style={iStyle} disabled={!form.pavilhao}>
                  <option value="">Selecione...</option>
                  {alas.map(a=><option key={a} value={a}>{a}</option>)}
                </select>
              </Campo>
              <Campo label="Cela">
                <select value={form.cela} onChange={e=>set("cela",e.target.value)}
                  style={iStyle} disabled={!form.ala}>
                  <option value="">Não informada</option>
                  {celas.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </Campo>
            </div>
          </div>

          <div style={{height:1,background:C.border}}/>

          {/* Facção */}
          <div>
            <div style={{fontSize:10,fontWeight:700,color:C.textMid,fontFamily:MONO,
              letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:10}}>FUNÇÃO NA FACÇÃO</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Campo label="Facção" required>
                <select value={form.faccao} onChange={e=>set("faccao",e.target.value)}
                  style={{...iStyle,color:cor.text,borderColor:cor.border}}>
                  <option value="">Selecione...</option>
                  {faccoes.map(f=><option key={f} value={f}>{f}</option>)}
                </select>
              </Campo>
              <Campo label="Cargo" required>
                <select value={form.cargo} onChange={e=>set("cargo",e.target.value)}
                  style={iStyle} disabled={!form.faccao}>
                  <option value="">Selecione...</option>
                  {cargos.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </Campo>
            </div>
          </div>

          <Campo label="Observação operacional">
            <textarea value={form.observacao} onChange={e=>set("observacao",e.target.value)}
              placeholder="Informações adicionais relevantes..." rows={3}
              style={{...iStyle,resize:"vertical",lineHeight:1.6}}/>
          </Campo>

          {erro && (
            <div style={{padding:"8px 12px",background:"rgba(239,68,68,0.1)",
              border:"1px solid rgba(239,68,68,0.3)",borderRadius:4,fontSize:12,color:"#FCA5A5",fontFamily:MONO}}>
              {erro}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{padding:"12px 20px",borderTop:`1px solid ${C.border}`,
          display:"flex",justifyContent:"flex-end",gap:8,background:C.surfaceUp,flexShrink:0}}>
          <button onClick={onFechar} style={{padding:"8px 16px",borderRadius:4,
            border:`1px solid ${C.border}`,background:"transparent",fontSize:12,
            color:C.textMid,cursor:"pointer",fontFamily:MONO}}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} style={{padding:"8px 20px",borderRadius:4,
            border:"none",background:salvando?C.surfaceUp:`linear-gradient(135deg,${C.accent},${C.accentHover})`,
            color:salvando?C.textMid:"#FFF",fontSize:12,fontWeight:700,
            cursor:salvando?"not-allowed":"pointer",fontFamily:MONO}}>
            {salvando?"Salvando...":isEdicao?"Salvar alterações":"Cadastrar líder"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Card líder ────────────────────────────────────────────────────────────────
function CardLider({ lider, onEditar, onDeletar }) {
  const cor = corF(lider.faccao)
  const [conf, setConf] = useState(false)
  const dt = lider.criado_em ? lider.criado_em.slice(0,10).split("-").reverse().join("/") : ""

  return (
    <div className="lu-card" style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",
      background:C.surface,borderTop:`1px solid ${cor.border}`,borderRight:`1px solid ${cor.border}`,
      borderBottom:`1px solid ${cor.border}`,borderLeft:`3px solid ${cor.dot}`,
      borderRadius:6,transition:"all .15s"}}>
      {/* Foto */}
      <div style={{width:64,height:80,borderRadius:4,overflow:"hidden",
        background:C.surfaceUp,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <FotoLider liderId={lider.foto_ext?lider.id:null} alt={lider.vulgo} atualizado={lider.atualizado_em}/>
      </div>
      {/* Dados */}
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
          <span style={{fontSize:15,fontWeight:800,color:cor.dot,fontFamily:MONO}}>
            {lider.vulgo||"—"}
          </span>
          <span style={{fontSize:11,fontWeight:700,color:cor.text,background:cor.bg,
            border:`1px solid ${cor.border}`,padding:"2px 8px",borderRadius:3,fontFamily:MONO}}>
            {lider.faccao}
          </span>
          {lider.competencia && (
            <span style={{fontSize:11,color:"#F59E0B",background:"rgba(245,158,11,0.1)",
              border:"1px solid rgba(245,158,11,0.25)",padding:"2px 8px",borderRadius:3,fontFamily:MONO}}>
              {fmtComp(lider.competencia)}
            </span>
          )}
        </div>
        {lider.nome && (
          <div style={{fontSize:13,fontWeight:600,color:C.text,fontFamily:MONO,marginBottom:3}}>
            {lider.nome}
          </div>
        )}
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{fontSize:12,color:C.textMid,fontFamily:MONO}}>{lider.cargo}</span>
          {lider.cela && (
            <span style={{fontSize:11,color:C.textMid,fontFamily:MONO,
              background:C.surfaceUp,padding:"1px 7px",borderRadius:3,border:`1px solid ${C.border}`}}>
              Cela {lider.cela}
            </span>
          )}
          {dt && <span style={{fontSize:11,color:C.textDim,fontFamily:MONO}}>{dt}</span>}
        </div>
        {lider.observacao && (
          <div style={{fontSize:12,color:C.textMid,marginTop:4,fontStyle:"italic"}}>
            {lider.observacao.length>90?lider.observacao.slice(0,90)+"...":lider.observacao}
          </div>
        )}
      </div>
      {/* Ações */}
      <div style={{display:"flex",gap:4,flexShrink:0}}>
        <button onClick={()=>onEditar(lider)} style={{width:28,height:28,borderRadius:4,
          border:`1px solid ${C.border}`,background:"transparent",cursor:"pointer",
          display:"flex",alignItems:"center",justifyContent:"center",color:C.textMid,fontSize:14}}>
          ✎
        </button>
        {conf
          ? <button onClick={()=>onDeletar(lider.id)} style={{height:28,borderRadius:4,border:"none",
              padding:"0 10px",background:"#DC2626",cursor:"pointer",fontSize:11,fontWeight:700,
              color:"#FFF",fontFamily:MONO}}>confirmar</button>
          : <button onClick={()=>setConf(true)} style={{width:28,height:28,borderRadius:4,
              border:"1px solid rgba(239,68,68,0.3)",background:"rgba(239,68,68,0.08)",cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",color:"#EF4444",fontSize:14}}>
              ✕
            </button>}
      </div>
    </div>
  )
}

// ── Seção Ala ─────────────────────────────────────────────────────────────────
function SecaoAla({ ala, lideres, onNovo, onEditar, onDeletar }) {
  const tem  = lideres.length>0
  const cor  = tem ? corF(lideres[0].faccao) : null
  return (
    <div style={{marginBottom:8}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"7px 12px",background:tem?cor.bg:C.surfaceUp,
        borderTop:`1px solid ${tem?cor.border:C.border}`,
        borderRight:`1px solid ${tem?cor.border:C.border}`,
        borderLeft:`1px solid ${tem?cor.border:C.border}`,
        borderBottom:tem?"none":`1px solid ${C.border}`,
        borderRadius:tem?"4px 4px 0 0":4}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:2,height:14,borderRadius:1,background:tem?cor.dot:C.textDim}}/>
          <span style={{fontSize:13,fontWeight:600,color:C.text,fontFamily:MONO}}>{ala}</span>
          <span style={{fontSize:11,color:tem?cor.text:C.textDim,fontFamily:MONO,
            background:tem?cor.bg:C.surface,border:`1px solid ${tem?cor.border:C.border}`,
            padding:"1px 7px",borderRadius:3}}>
            {tem?`${lideres.length} líder`:"sem líder"}
          </span>
        </div>
        <button onClick={onNovo} style={{padding:"3px 10px",borderRadius:3,cursor:"pointer",
          border:`1px solid ${tem?cor.border:C.border}`,background:"transparent",
          fontSize:11,color:tem?cor.text:C.textMid,fontFamily:MONO}}>
          {tem?"+ Outro":"+ Líder"}
        </button>
      </div>
      {tem && (
        <div style={{borderRight:`1px solid ${cor.border}`,borderBottom:`1px solid ${cor.border}`,
          borderLeft:`1px solid ${cor.border}`,borderRadius:"0 0 4px 4px",
          display:"flex",flexDirection:"column",overflow:"hidden",gap:1,padding:1,background:C.bg}}>
          {lideres.map(l=><CardLider key={l.id} lider={l} onEditar={onEditar} onDeletar={onDeletar}/>)}
        </div>
      )}
    </div>
  )
}

// ── Seção Pavilhão ────────────────────────────────────────────────────────────
function SecaoPavilhao({ pavilhao, alas, onNovo, onEditar, onDeletar }) {
  const [aberto, setAberto] = useState(true)
  const todos      = Object.values(alas).flat()
  const total      = todos.length
  const faccDom    = total>0
    ? todos.map(l=>l.faccao).sort((a,b)=>todos.filter(l=>l.faccao===b).length-todos.filter(l=>l.faccao===a).length)[0]
    : null
  const cor = corF(faccDom)

  return (
    <div style={{background:C.surface,borderRadius:6,border:`1px solid ${C.border}`,overflow:"hidden"}}>
      <div onClick={()=>setAberto(v=>!v)} style={{padding:"11px 16px",cursor:"pointer",
        background:C.surfaceUp,borderBottom:aberto?`2px solid ${cor.dot||C.border}`:`1px solid ${C.border}`,
        display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:faccDom?cor.dot:C.textDim,
            boxShadow:faccDom?`0 0 6px ${cor.dot}66`:"none"}}/>
          <span style={{fontSize:14,fontWeight:700,color:C.text,fontFamily:MONO}}>{pavilhao}</span>
          {total>0 && (
            <span style={{fontSize:11,color:C.textMid,fontFamily:MONO,
              background:C.surface,border:`1px solid ${C.border}`,padding:"2px 8px",borderRadius:3}}>
              {total} líder{total!==1?"es":""}
            </span>
          )}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={e=>{e.stopPropagation();onNovo(pavilhao)}} style={{
            padding:"4px 12px",borderRadius:3,border:"none",
            background:`linear-gradient(135deg,${C.accent},${C.accentHover})`,
            color:"#FFF",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:MONO}}>
            + Líder
          </button>
          <span style={{color:C.textMid,fontSize:12}}>{aberto?"▲":"▼"}</span>
        </div>
      </div>
      {aberto && (
        <div style={{padding:"12px 16px"}}>
          {Object.entries(alas).map(([ala,lideres])=>(
            <SecaoAla key={ala} ala={ala} lideres={Object.values(lideres).flat()}
              onNovo={()=>onNovo(pavilhao,ala)} onEditar={onEditar} onDeletar={onDeletar}/>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Principal ─────────────────────────────────────────────────────────────────
export default function LiderancasUnidade({ onNavigate }) {
  const [unidade,     setUnidade]     = useState("CDPM1")
  const [competencia, setCompetencia] = useState("")
  const [competencias,setCompetencias]= useState([])
  const [dados,       setDados]       = useState(null)
  const [estrutura,   setEstrutura]   = useState({})
  const [faccoes,     setFaccoes]     = useState([])
  const [cargosPorFaccao,setCargosPorFaccao] = useState({})
  const [loading,     setLoading]     = useState(true)
  const [modal,       setModal]       = useState(null)
  const [modalPDF,    setModalPDF]    = useState(false)
  const [busca,       setBusca]       = useState("")
  const [toast,       setToast]       = useState(null)
  const [compAtual,   setCompAtual]   = useState("")

  // ── FIX: guard contra null/undefined ──────────────────────────────────────
  const unidadesLabel = Object.fromEntries(
    Object.entries(estrutura||{}).map(([k,v])=>[k,v.label])
  )

  const toast$ = (msg,tipo="ok") => { setToast({msg,tipo}); setTimeout(()=>setToast(null),3000) }

  async function carregarEstrutura() {
    try {
      const d = await api.get("/liderancas/estrutura").then(r=>r.json())
      setEstrutura(d.estrutura||{}); setFaccoes(d.faccoes||[])
      setCargosPorFaccao(d.cargos_por_faccao||{}); setCompAtual(d.competencia_atual||"")
    } catch {}
  }

  async function carregarCompetencias(u=unidade) {
    try {
      const d = await api.get(`/liderancas/competencias/${u}`).then(r=>r.json())
      const comps = d.competencias||[]
      setCompetencias(comps)
      if(comps.length>0 && !competencia) setCompetencia(comps[0])
      else if(comps.length>0 && !comps.includes(competencia)) setCompetencia(comps[0])
    } catch {}
  }

  async function carregarDados(u=unidade, comp=competencia) {
    setLoading(true)
    try {
      const path = comp ? `/liderancas/${u}?competencia=${comp}` : `/liderancas/${u}`
      const d   = await api.get(path).then(r=>r.json())
      setDados(d.pavilhoes||null)
      if(d.competencia) setCompetencia(d.competencia)
      if(d.competencias) setCompetencias(d.competencias)
    } catch { setDados(null) }
    finally { setLoading(false) }
  }

  useEffect(()=>{ carregarEstrutura() },[])
  useEffect(()=>{ setCompetencia(""); carregarCompetencias(unidade).then(()=>carregarDados(unidade)) },[unidade])
  useEffect(()=>{ if(competencia) carregarDados(unidade,competencia) },[competencia])

  async function deletar(id) {
    try { await api.delete(`/liderancas/${id}`); toast$("Líder removido."); carregarDados() }
    catch { toast$("Erro ao remover.","erro") }
  }

  function aoSalvar() { toast$("Líder salvo!"); setModal(null); carregarDados(); carregarCompetencias() }

  const totalLideres = dados
    ? Object.values(dados).reduce((s,alas)=>s+Object.values(alas).reduce((s2,celas)=>
        s2+Object.values(celas).reduce((s3,l)=>s3+l.length,0),0),0) : 0

  // Distribuição por facção (resumo/KPI da unidade no mês)
  const faccaoCount = {}
  if (dados) for (const alas of Object.values(dados)) for (const celas of Object.values(alas))
    for (const lids of Object.values(celas)) for (const l of lids)
      faccaoCount[l.faccao] = (faccaoCount[l.faccao] || 0) + 1
  const faccaoRank = Object.entries(faccaoCount).sort((a,b)=>b[1]-a[1])

  function filtrar(d) {
    if(!busca||!d) return d
    const b=busca.toLowerCase(), r={}
    for(const [pav,alas] of Object.entries(d)) {
      r[pav]={}
      for(const [ala,celas] of Object.entries(alas)) {
        r[pav][ala]={}
        for(const [cela,lids] of Object.entries(celas))
          r[pav][ala][cela]=lids.filter(l=>l.vulgo?.toLowerCase().includes(b)||l.nome?.toLowerCase().includes(b)||l.cargo?.toLowerCase().includes(b))
      }
    }
    return r
  }

  const dadosFiltrados = filtrar(dados)

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:C.bg,fontFamily:SANS,overflow:"hidden"}}>

      {/* Header */}
      <div style={{height:56,background:C.surfaceUp,borderBottom:`1px solid ${C.border}`,
        display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>onNavigate?.("Controle de Grupos")} className="lu-btn" style={{
            background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,
            cursor:"pointer",fontSize:16,color:C.textMid,width:30,height:30,
            display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
          <div style={{width:4,height:30,background:C.accent,borderRadius:3,flexShrink:0}}/>
          <div>
            <div style={{fontSize:18,fontWeight:800,color:C.text,letterSpacing:"0.01em"}}>Lideranças por Unidade</div>
            <div style={{fontSize:12.5,color:C.textMid,fontFamily:MONO,marginTop:2}}>
              {unidadesLabel[unidade]||unidade} · {fmtComp(competencia)||"sem registros"} · <b style={{color:C.accent}}>{totalLideres}</b> líderes
            </div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {/* Seletor competência */}
          <div style={{display:"flex",alignItems:"center",gap:8,background:"rgba(245,158,11,0.08)",
            border:"1px solid rgba(245,158,11,0.25)",borderRadius:4,padding:"0 10px",height:34}}>
            <span style={{fontSize:10,fontWeight:700,color:"#F59E0B",fontFamily:MONO,letterSpacing:"0.1em"}}>MÊS/ANO</span>
            <select value={competencia} onChange={e=>setCompetencia(e.target.value)}
              style={{fontSize:13,fontFamily:MONO,fontWeight:700,border:"none",background:"transparent",
                color:"#F59E0B",cursor:"pointer",outline:"none"}}>
              {competencias.length>0
                ? competencias.map(c=><option key={c} value={c}>{fmtComp(c)}</option>)
                : <option value={compAtual}>{fmtComp(compAtual)||"Nenhum"}</option>}
            </select>
          </div>
          {/* Busca */}
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",
              color:C.textDim,fontSize:12}}>🔍</span>
            <input value={busca} onChange={e=>setBusca(e.target.value)}
              placeholder="Buscar vulgo, nome..."
              style={{...iStyle,paddingLeft:30,width:180,background:C.surface}}/>
          </div>
          <button onClick={()=>setModalPDF(true)} style={{padding:"7px 12px",borderRadius:4,
            border:`1px solid ${C.border}`,background:C.surface,color:C.textMid,
            fontSize:12,cursor:"pointer",fontFamily:MONO,display:"flex",alignItems:"center",gap:5}}>
            <span style={{color:"#EF4444"}}>PDF</span>
          </button>
          <button onClick={()=>setModal({pavilhao:"",ala:""})} style={{
            padding:"7px 16px",borderRadius:4,border:"none",
            background:`linear-gradient(135deg,${C.accent},${C.accentHover})`,
            color:"#FFF",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:MONO}}>
            + Novo líder
          </button>
        </div>
      </div>

      {/* Abas unidade */}
      <div style={{display:"flex",gap:4,padding:"10px 20px",background:C.surfaceUp,
        borderBottom:`1px solid ${C.border}`,flexShrink:0,overflowX:"auto"}}>
        {Object.entries(unidadesLabel).map(([key,label])=>(
          <button key={key} onClick={()=>setUnidade(key)} className="lu-tab" style={{
            background:unidade===key?C.accent:"transparent",
            border:`1px solid ${unidade===key?C.accent:C.border}`,
            borderRadius:6,cursor:"pointer",padding:"7px 18px",
            fontSize:12.5,fontWeight:700,
            color:unidade===key?"#0B1120":C.textMid,
            fontFamily:MONO,transition:"all .15s",whiteSpace:"nowrap"}}>
            {label}
          </button>
        ))}
      </div>

      {/* Resumo por facção (KPI) */}
      {faccaoRank.length > 0 && (
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 20px",background:C.surface,
          borderBottom:`1px solid ${C.border}`,flexShrink:0,overflowX:"auto"}}>
          <span style={{fontSize:10,fontWeight:700,color:C.textMid,fontFamily:MONO,letterSpacing:"0.12em",
            textTransform:"uppercase",flexShrink:0}}>Distribuição</span>
          {faccaoRank.map(([f,n])=>{ const c=corF(f); return (
            <div key={f} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:6,
              background:c.bg,border:`1px solid ${c.border}`,flexShrink:0}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:c.dot}}/>
              <span style={{fontSize:12,fontWeight:700,color:c.text,fontFamily:MONO}}>{f}</span>
              <span style={{fontSize:12.5,fontWeight:800,color:c.dot,fontFamily:MONO}}>{n}</span>
            </div>
          )})}
        </div>
      )}

      {/* Corpo */}
      <div className="lu-scroll" style={{flex:1,overflow:"auto",padding:"16px 20px"}}>
        {loading ? (
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:200,gap:10}}>
            <span style={{animation:"spin 1s linear infinite",display:"inline-block",fontSize:20}}>⟳</span>
            <span style={{fontSize:13,color:C.textMid,fontFamily:MONO}}>Carregando...</span>
          </div>
        ) : dadosFiltrados ? (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {Object.entries(dadosFiltrados).map(([pav,alas])=>(
              <SecaoPavilhao key={pav} pavilhao={pav} alas={alas}
                onNovo={(p,a)=>setModal({pavilhao:p,ala:a||""})}
                onEditar={l=>setModal({lider:l})} onDeletar={deletar}/>
            ))}
          </div>
        ) : (
          <div style={{textAlign:"center",padding:60,color:C.textMid,fontFamily:MONO,fontSize:13}}>
            Backend offline ou sem dados para este período.
          </div>
        )}
      </div>

      {modal && (
        <ModalLider lider={modal.lider||null} estrutura={estrutura} faccoes={faccoes}
          cargosPorFaccao={cargosPorFaccao} unidadeAtiva={unidade}
          pavilhaoInicial={modal.pavilhao} alaInicial={modal.ala}
          competenciaAtiva={competencia||compAtual} onSalvar={aoSalvar} onFechar={()=>setModal(null)}/>
      )}

      {modalPDF && (
        <ModalPDF unidade={unidade} unidadeLabel={unidadesLabel[unidade]||unidade}
          competencia={competencia||compAtual} competencias={competencias} onFechar={()=>setModalPDF(false)}/>
      )}

      {toast && (
        <div style={{position:"fixed",bottom:24,right:24,padding:"10px 18px",borderRadius:4,
          background:toast.tipo==="erro"?"#DC2626":C.surfaceUp,color:"#FFF",fontSize:13,fontWeight:700,
          fontFamily:MONO,border:`1px solid ${C.border}`,zIndex:2000,animation:"fadeUp .2s ease"}}>
          {toast.tipo==="erro"?"✗ ":"✓ "}{toast.msg}
        </div>
      )}

      <style>{`
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        select option { background: #111827; color:#F1F5F9; }
        textarea::placeholder, input::placeholder { color: #64748B; }
        .lu-card:hover { border-color: rgba(232,160,32,0.30) !important; background:#16203a !important; }
        .lu-btn:hover  { border-color: rgba(232,160,32,0.4) !important; color:#E8A020 !important; }
        .lu-tab:hover  { border-color: rgba(232,160,32,0.4) !important; }
        .lu-scroll::-webkit-scrollbar{width:8px} .lu-scroll::-webkit-scrollbar-track{background:transparent}
        .lu-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.14);border-radius:6px}
        .lu-scroll::-webkit-scrollbar-thumb:hover{background:rgba(232,160,32,0.4)}
      `}</style>
    </div>
  )
}
