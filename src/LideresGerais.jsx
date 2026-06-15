import { useState, useEffect, useRef } from "react"
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
  accentHover:"#B45309",
  goldSoft:  "rgba(232,160,32,0.12)",
  goldBorder:"rgba(232,160,32,0.3)",
}

const FACCAO_COR = {
  "CV/AM":  { dot:"#EF4444", bg:"rgba(239,68,68,0.12)",   border:"rgba(239,68,68,0.3)",   text:"#FCA5A5" },
  "PCC/AM": { dot:"#3B82F6", bg:"rgba(59,130,246,0.12)",  border:"rgba(59,130,246,0.3)",  text:"#93C5FD" },
  "RDA":    { dot:"#22C55E", bg:"rgba(34,197,94,0.12)",   border:"rgba(34,197,94,0.3)",   text:"#86EFAC" },
  "TDA":    { dot:"#8B5CF6", bg:"rgba(139,92,246,0.12)",  border:"rgba(139,92,246,0.3)",  text:"#C4B5FD" },
  "Neutros":{ dot:"#94A3B8", bg:"rgba(148,163,184,0.08)", border:"rgba(148,163,184,0.2)", text:"#E2E8F0" },
  "CDN":    { dot:"#F59E0B", bg:"rgba(245,158,11,0.12)",  border:"rgba(245,158,11,0.3)",  text:"#FCD34D" },
}
const corF = f => FACCAO_COR[f] || { dot:"#94A3B8", bg:"rgba(148,163,184,0.08)", border:"rgba(148,163,184,0.2)", text:"#E2E8F0" }

const STATUS_COR = {
  "Ativo":    { bg:"rgba(34,197,94,0.12)",  border:"rgba(34,197,94,0.3)",   text:"#86EFAC", dot:"#22C55E" },
  "Preso":    { bg:"rgba(59,130,246,0.12)", border:"rgba(59,130,246,0.3)",  text:"#93C5FD", dot:"#3B82F6" },
  "Foragido": { bg:"rgba(245,158,11,0.12)", border:"rgba(245,158,11,0.3)",  text:"#FCD34D", dot:"#F59E0B" },
  "Morto":    { bg:"rgba(107,114,128,0.10)",border:"rgba(107,114,128,0.25)",text:"#CBD5E1", dot:"#6B7280" },
}
const corS = s => STATUS_COR[s] || STATUS_COR["Ativo"]

const iStyle = {
  padding:"10px 13px", borderRadius:6, border:`1px solid ${C.border}`,
  fontSize:15, color:C.text, fontFamily:SANS, background:"rgba(255,255,255,0.05)",
  outline:"none", width:"100%", boxSizing:"border-box",
}

// ── FotoLider ─────────────────────────────────────────────────────────────────
function FotoLider({ liderId, alt, atualizado }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    if (!liderId) return
    let objUrl = null
    api.get(`/liderancas/rua/foto/${liderId}`)
      .then(r => r.ok ? r.blob() : null)
      .then(blob => { if (blob) { objUrl = URL.createObjectURL(blob); setSrc(objUrl) } })
      .catch(() => {})
    return () => { if (objUrl) URL.revokeObjectURL(objUrl) }
  }, [liderId, atualizado])
  return src
    ? <img src={src} alt={alt||""} style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"top"}}/>
    : null
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
      style={{width:110,height:138,borderRadius:8,overflow:"hidden",flexShrink:0,
        border:`1px dashed ${drag?C.accent:C.border}`,background:drag?"rgba(194,106,26,0.1)":C.surfaceUp,
        cursor:"pointer",position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
      {preview
        ? <img src={preview} alt="foto" style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"top"}}/>
        : <div style={{textAlign:"center",padding:8}}>
            <div style={{fontSize:28,marginBottom:6}}>📷</div>
            <div style={{fontSize:13,color:C.textMid,fontFamily:MONO,lineHeight:1.4}}>Clique ou<br/>arraste foto</div>
          </div>}
      <input ref={ref} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handle(e.target.files[0])}/>
      {preview && <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,0.75)",
        padding:5,fontSize:12,color:"#FFF",textAlign:"center",fontFamily:MONO}}>trocar</div>}
    </div>
  )
}

function Campo({ label, children, required }) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      <label style={{fontSize:12,fontWeight:700,color:C.textMid,fontFamily:MONO,
        letterSpacing:"0.12em",textTransform:"uppercase"}}>
        {label}{required&&<span style={{color:"#EF4444"}}> *</span>}
      </label>
      {children}
    </div>
  )
}

// ── Modal Nova Facção ─────────────────────────────────────────────────────────
function ModalNovaFaccao({ onSalvar, onFechar }) {
  const [nome,  setNome]  = useState("")
  const [sigla, setSigla] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro]   = useState("")

  async function salvar() {
    if(!nome.trim()||!sigla.trim()) { setErro("Nome e sigla são obrigatórios."); return }
    setSalvando(true); setErro("")
    try {
      const fd = new FormData()
      fd.append("nome", nome.trim())
      fd.append("sigla", sigla.trim().toUpperCase())
      const res = await api.upload("/liderancas/rua/faccoes", fd)
      if(!res.ok) { const err = await res.json(); throw new Error(err.detail || "Erro ao criar facção.") }
      onSalvar(await res.json())
    } catch(e) { setErro(e.message) }
    finally { setSalvando(false) }
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:1200,padding:20}}>
      <div style={{background:C.surface,borderRadius:12,width:"100%",maxWidth:400,
        border:`1px solid ${C.borderUp}`,overflow:"hidden",boxShadow:"0 24px 64px rgba(0,0,0,0.6)"}}>
        <div style={{padding:"16px 22px",background:C.surfaceUp,borderBottom:`1px solid ${C.border}`,
          display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:16,fontWeight:800,color:C.text,fontFamily:MONO}}>NOVO GRUPO CRIMINOSO</div>
            <div style={{fontSize:13,color:C.textMid,marginTop:3}}>Adicionar nova facção ao sistema</div>
          </div>
          <button onClick={onFechar} style={{background:"transparent",border:`1px solid ${C.border}`,
            borderRadius:6,width:32,height:32,cursor:"pointer",color:C.textMid,fontSize:18,
            display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
        <div style={{padding:22,display:"flex",flexDirection:"column",gap:16}}>
          <Campo label="Nome do grupo" required>
            <input value={nome} onChange={e=>setNome(e.target.value)} placeholder="ex: Família do Norte" style={iStyle}/>
          </Campo>
          <Campo label="Sigla / Abreviação" required>
            <input value={sigla} onChange={e=>setSigla(e.target.value)} placeholder="ex: FDN"
              style={{...iStyle,textTransform:"uppercase"}}/>
          </Campo>
          {erro && (
            <div style={{padding:"10px 14px",background:"rgba(239,68,68,0.1)",
              border:"1px solid rgba(239,68,68,0.3)",borderRadius:6,fontSize:14,color:"#FCA5A5",fontFamily:MONO}}>
              {erro}
            </div>
          )}
        </div>
        <div style={{padding:"14px 22px",borderTop:`1px solid ${C.border}`,
          display:"flex",justifyContent:"flex-end",gap:8,background:C.surfaceUp}}>
          <button onClick={onFechar} style={{padding:"9px 18px",borderRadius:6,
            border:`1px solid ${C.border}`,background:"transparent",fontSize:14,
            color:C.textMid,cursor:"pointer",fontFamily:MONO}}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} style={{padding:"9px 22px",borderRadius:6,
            border:"none",background:salvando?C.surfaceUp:`linear-gradient(135deg,${C.accent},${C.accentHover})`,
            color:salvando?C.textMid:"#FFF",fontSize:14,fontWeight:800,
            cursor:salvando?"not-allowed":"pointer",fontFamily:MONO}}>
            {salvando?"Criando...":"Criar facção"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal Líder de Rua ────────────────────────────────────────────────────────
function ModalLiderRua({ lider, faccoes, cargos, statusList, faccaoInicial, onSalvar, onFechar }) {
  const isEdicao = !!lider?.id
  const [form, setForm] = useState({
    faccao_id: faccaoInicial || "",
    cargo:     "",
    nome:      "",
    vulgo:     "",
    status:    "Ativo",
    observacao:"",
    ...(isEdicao ? {
      faccao_id:  lider.faccao_id,
      cargo:      lider.cargo,
      nome:       lider.nome || "",
      vulgo:      lider.vulgo || "",
      status:     lider.status,
      observacao: lider.observacao || "",
    } : {}),
  })
  const [fotoFile, setFotoFile] = useState(null)
  const [fotoBlob, setFotoBlob] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro]         = useState("")

  useEffect(() => {
    if (!isEdicao || !lider.foto_ext) return
    let objUrl = null
    api.get(`/liderancas/rua/foto/${lider.id}`)
      .then(r => r.ok ? r.blob() : null)
      .then(blob => { if (blob) { objUrl = URL.createObjectURL(blob); setFotoBlob(objUrl) } })
      .catch(() => {})
    return () => { if (objUrl) URL.revokeObjectURL(objUrl) }
  }, [])

  const faccaoAtual = faccoes.find(f => f.id === form.faccao_id)
  const cor         = corF(faccaoAtual?.nome || "")
  const corStatus   = corS(form.status)

  function set(k,v) { setForm(prev=>({...prev,[k]:v,[k==="faccao_id"?"cargo":"_"]:k==="faccao_id"?"":prev.cargo})) }

  async function salvar() {
    if(!form.faccao_id||!form.cargo) { setErro("Facção e cargo são obrigatórios."); return }
    setSalvando(true); setErro("")
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k,v]) => fd.append(k, v||""))
      if(fotoFile) fd.append("foto", fotoFile)
      const res = isEdicao
        ? await api.uploadPut(`/liderancas/rua/lideres/${lider.id}`, fd)
        : await api.upload("/liderancas/rua/lideres", fd)
      if(!res.ok) throw new Error(await res.text())
      onSalvar(await res.json())
    } catch(e) { setErro("Erro: "+e.message) }
    finally { setSalvando(false) }
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:1100,padding:20}}>
      <div style={{background:C.surface,borderRadius:12,width:"100%",maxWidth:520,
        border:`1px solid ${C.borderUp}`,display:"flex",flexDirection:"column",maxHeight:"92vh",
        overflow:"hidden",boxShadow:"0 24px 64px rgba(0,0,0,0.6)"}}>

        <div style={{height:3,background:`linear-gradient(90deg,${cor.dot},${cor.border})`}}/>

        <div style={{padding:"16px 22px",background:C.surfaceUp,borderBottom:`1px solid ${C.border}`,
          display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div>
            <div style={{fontSize:16,fontWeight:800,color:C.text,fontFamily:MONO}}>
              {isEdicao?"EDITAR LÍDER DE RUA":"CADASTRAR LÍDER DE RUA"}
            </div>
            <div style={{fontSize:13,color:C.textMid,marginTop:3}}>
              {isEdicao?`ID: ${lider.id.slice(0,8)}...`:"Liderança geral — fora da unidade prisional"}
            </div>
          </div>
          <button onClick={onFechar} style={{background:"transparent",border:`1px solid ${C.border}`,
            borderRadius:6,width:32,height:32,cursor:"pointer",color:C.textMid,fontSize:18,
            display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>

        <div style={{padding:22,overflowY:"auto",display:"flex",flexDirection:"column",gap:16}}>
          <div style={{display:"flex",gap:16,alignItems:"flex-start"}}>
            <FotoUpload fotoUrl={fotoBlob} onChange={setFotoFile}/>
            <div style={{flex:1,display:"flex",flexDirection:"column",gap:12}}>
              <Campo label="Vulgo / Apelido">
                <input value={form.vulgo} onChange={e=>set("vulgo",e.target.value)}
                  placeholder="Nome de guerra"
                  style={{...iStyle,fontSize:16,fontWeight:700,color:cor.dot||C.accent,borderColor:cor.border||C.border}}/>
              </Campo>
              <Campo label="Nome completo">
                <input value={form.nome} onChange={e=>set("nome",e.target.value)} placeholder="Nome civil" style={iStyle}/>
              </Campo>
            </div>
          </div>

          <div style={{height:1,background:C.border}}/>

          <div>
            <div style={{fontSize:12,fontWeight:700,color:C.textMid,fontFamily:MONO,
              letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12}}>VÍNCULO CRIMINAL</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Campo label="Facção / Grupo" required>
                <select value={form.faccao_id} onChange={e=>set("faccao_id",e.target.value)}
                  style={{...iStyle,color:cor.text,borderColor:cor.border}}>
                  <option value="">Selecione...</option>
                  {faccoes.map(f=><option key={f.id} value={f.id}>{f.nome} ({f.sigla})</option>)}
                </select>
              </Campo>
              <Campo label="Cargo" required>
                <select value={form.cargo} onChange={e=>set("cargo",e.target.value)}
                  style={iStyle} disabled={!form.faccao_id}>
                  <option value="">Selecione...</option>
                  {cargos.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </Campo>
            </div>
          </div>

          <div style={{height:1,background:C.border}}/>

          <Campo label="Status operacional" required>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
              {statusList.map(s => {
                const cs  = corS(s)
                const ativo = form.status === s
                return (
                  <button key={s} onClick={()=>set("status",s)} style={{
                    padding:"10px 6px",borderRadius:8,cursor:"pointer",transition:"all .15s",
                    border:`1px solid ${ativo?cs.border:C.border}`,
                    background:ativo?cs.bg:C.surfaceUp,
                    display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:ativo?cs.dot:C.textDim}}/>
                    <span style={{fontSize:13,fontWeight:700,color:ativo?cs.text:C.textMid,fontFamily:MONO}}>{s}</span>
                  </button>
                )
              })}
            </div>
          </Campo>

          <Campo label="Observação operacional">
            <textarea value={form.observacao} onChange={e=>set("observacao",e.target.value)}
              placeholder="Informações de inteligência relevantes..." rows={3}
              style={{...iStyle,resize:"vertical",lineHeight:1.6}}/>
          </Campo>

          {erro && (
            <div style={{padding:"10px 14px",background:"rgba(239,68,68,0.1)",
              border:"1px solid rgba(239,68,68,0.3)",borderRadius:6,fontSize:14,color:"#FCA5A5",fontFamily:MONO}}>
              {erro}
            </div>
          )}
        </div>

        <div style={{padding:"14px 22px",borderTop:`1px solid ${C.border}`,
          display:"flex",justifyContent:"flex-end",gap:8,background:C.surfaceUp,flexShrink:0}}>
          <button onClick={onFechar} style={{padding:"9px 18px",borderRadius:6,
            border:`1px solid ${C.border}`,background:"transparent",fontSize:14,
            color:C.textMid,cursor:"pointer",fontFamily:MONO}}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} style={{padding:"9px 24px",borderRadius:6,
            border:"none",background:salvando?C.surfaceUp:`linear-gradient(135deg,${C.accent},${C.accentHover})`,
            color:salvando?C.textMid:"#FFF",fontSize:14,fontWeight:800,
            cursor:salvando?"not-allowed":"pointer",fontFamily:MONO}}>
            {salvando?"Salvando...":isEdicao?"Salvar alterações":"Cadastrar líder"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Monograma ─────────────────────────────────────────────────────────────────
function Monograma({ letra, cor }) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",height:"100%",background:cor.bg}}>
      <span style={{fontSize:48,fontWeight:800,color:cor.dot,opacity:0.9,fontFamily:SANS,lineHeight:1}}>{letra}</span>
    </div>
  )
}

// ── Card do Líder de Rua ──────────────────────────────────────────────────────
function CardLiderRua({ lider, onEditar, onDeletar }) {
  const cor    = corF(lider.faccao_nome || "")
  const corSt  = corS(lider.status)
  const [conf, setConf] = useState(false)
  const inicial = (lider.vulgo || lider.nome || "?").trim()[0]?.toUpperCase() || "?"

  return (
    <div className="lg-card" style={{
      position:"relative", display:"flex", gap:16, padding:"18px 16px 16px",
      background:"#18223A", borderRadius:14,
      border:`1px solid rgba(232,160,32,0.22)`,
      boxShadow:"0 6px 20px rgba(0,0,0,0.35)",
      transition:"transform .18s, box-shadow .18s", overflow:"hidden",
    }}>
      {/* Barra colorida da facção */}
      <div style={{position:"absolute",top:0,left:0,right:0,height:3,
        background:`linear-gradient(90deg,${cor.dot},transparent)`}}/>

      {/* Foto */}
      <div style={{width:116,height:148,borderRadius:10,overflow:"hidden",flexShrink:0,
        position:"relative",background:cor.bg,border:`2px solid ${cor.border}`,
        boxShadow:"0 2px 10px rgba(0,0,0,0.45)"}}>
        <Monograma letra={inicial} cor={cor}/>
        {lider.foto_ext && (
          <div style={{position:"absolute",inset:0}}>
            <FotoLider liderId={lider.id} alt={lider.vulgo} atualizado={lider.atualizado_em}/>
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:10,paddingTop:2}}>
        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          <div style={{minWidth:0,flex:"1 1 110px"}}>
            <div style={{fontSize:12,fontWeight:700,color:C.textDim,fontFamily:MONO,letterSpacing:"0.12em",marginBottom:3}}>VULGO</div>
            <div style={{fontSize:18,fontWeight:800,color:"#E8A020",lineHeight:1.15,
              whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{lider.vulgo||"—"}</div>
          </div>
          <div style={{minWidth:0,flex:"1 1 110px"}}>
            <div style={{fontSize:12,fontWeight:700,color:C.textDim,fontFamily:MONO,letterSpacing:"0.12em",marginBottom:3}}>NOME</div>
            <div style={{fontSize:18,fontWeight:800,color:C.text,lineHeight:1.15,
              whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{lider.nome||"—"}</div>
          </div>
        </div>

        <div style={{height:1,background:"rgba(255,255,255,0.07)"}}/>

        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{display:"flex",alignItems:"center",gap:7}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:"#E8A020",flexShrink:0}}/>
            <span style={{fontSize:15,fontWeight:700,color:C.text}}>{lider.cargo}</span>
          </span>
          <span style={{fontSize:13,fontWeight:800,color:corSt.text,background:corSt.bg,
            border:`1px solid ${corSt.border}`,padding:"4px 10px",borderRadius:20,
            fontFamily:MONO,display:"inline-flex",alignItems:"center",gap:5}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:corSt.dot}}/>
            {lider.status}
          </span>
        </div>

        {lider.observacao && (
          <div style={{fontSize:14,color:C.textMid,lineHeight:1.55,fontStyle:"italic"}}>
            {lider.observacao.length>100?lider.observacao.slice(0,100)+"…":lider.observacao}
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="lg-acoes" style={{position:"absolute",top:12,right:12,display:"flex",gap:6}}>
        <button onClick={()=>onEditar(lider)} title="Editar"
          style={{width:30,height:30,borderRadius:8,border:`1px solid ${C.border}`,
            background:"rgba(11,17,32,0.8)",cursor:"pointer",display:"flex",
            alignItems:"center",justifyContent:"center",fontSize:14,color:C.textMid}}>✎</button>
        {conf
          ? <button onClick={()=>onDeletar(lider.id)} style={{height:30,borderRadius:8,border:"none",
              padding:"0 12px",background:"#DC2626",cursor:"pointer",fontSize:13,fontWeight:800,
              color:"#FFF",fontFamily:MONO}}>excluir?</button>
          : <button onClick={()=>setConf(true)} title="Excluir"
              style={{width:30,height:30,borderRadius:8,border:`1px solid ${C.border}`,
                background:"rgba(11,17,32,0.8)",cursor:"pointer",display:"flex",
                alignItems:"center",justifyContent:"center",fontSize:14,color:"#F87171"}}>✕</button>}
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function LideresGerais({ onNavigate }) {
  const [faccoes,    setFaccoes]    = useState([])
  const [cargos,     setCargos]     = useState([])
  const [statusList, setStatusList] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [busca,      setBusca]      = useState("")
  const [faccaoSel,  setFaccaoSel]  = useState("todas")
  const [modal,      setModal]      = useState(null)
  const [toast,      setToast]      = useState(null)

  const toast$ = (msg, tipo="ok") => { setToast({msg,tipo}); setTimeout(()=>setToast(null),3200) }

  async function carregar() {
    setLoading(true)
    try {
      const [meta, dados] = await Promise.all([
        api.get("/liderancas/rua/metadados").then(r=>r.json()),
        api.get("/liderancas/rua/lideres").then(r=>r.json()),
      ])
      setCargos(meta.cargos||[])
      setStatusList(meta.status||[])
      setFaccoes(dados.faccoes||[])
    } catch { toast$("Erro ao carregar dados.","erro") }
    finally { setLoading(false) }
  }

  useEffect(()=>{ carregar() },[])

  async function deletarLider(id) {
    try {
      const res = await api.delete(`/liderancas/rua/lideres/${id}`)
      if(!res.ok) throw new Error()
      toast$("Líder removido."); carregar()
    } catch { toast$("Erro ao remover líder.","erro") }
  }

  async function deletarFaccao(id) {
    try {
      const res = await api.delete(`/liderancas/rua/faccoes/${id}`)
      if(!res.ok) throw new Error()
      toast$("Grupo removido."); carregar()
      if(faccaoSel === id) setFaccaoSel("todas")
    } catch { toast$("Erro ao remover grupo.","erro") }
  }

  function aoSalvarLider()  { toast$("Líder salvo!"); setModal(null); carregar() }
  function aoSalvarFaccao() { toast$("Grupo criado!"); setModal(null); carregar() }

  // Facção selecionada para exibir no main
  const faccaoAtual = faccaoSel === "todas" ? null : faccoes.find(f => f.id === faccaoSel)

  // Líderes a exibir com filtro de busca
  const lideresFiltrados = (() => {
    const pool = faccaoAtual ? faccaoAtual.lideres : faccoes.flatMap(f => f.lideres.map(l=>({...l,faccao_nome:f.nome})))
    if (!busca.trim()) return pool
    const q = busca.toLowerCase()
    return pool.filter(l =>
      l.vulgo?.toLowerCase().includes(q) ||
      l.nome?.toLowerCase().includes(q)  ||
      l.cargo?.toLowerCase().includes(q)
    )
  })()

  // KPIs globais
  const totalLideres = faccoes.reduce((s,f)=>s+f.lideres.length, 0)
  const totalAtivos  = faccoes.reduce((s,f)=>s+f.lideres.filter(l=>l.status==="Ativo").length, 0)
  const totalPresos  = faccoes.reduce((s,f)=>s+f.lideres.filter(l=>l.status==="Preso").length, 0)

  return (
    <div style={{display:"flex",flex:1,minWidth:0,height:"100%",overflow:"hidden",background:C.bg,fontFamily:SANS,color:C.text}}>

      {/* ── ASIDE ────────────────────────────────────────────────────────────── */}
      <aside style={{
        width:268, flexShrink:0,
        background:C.surface,
        borderRight:`1px solid ${C.border}`,
        display:"flex", flexDirection:"column",
        height:"100%", overflow:"hidden",
      }}>
        {/* Cabeçalho do aside */}
        <div style={{padding:"16px 16px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
            <div style={{width:3,height:18,background:C.accent,borderRadius:2,flexShrink:0,
              boxShadow:`0 0 6px ${C.accent}88`}}/>
            <span style={{fontSize:13,fontWeight:800,color:C.accent,letterSpacing:"0.1em",textTransform:"uppercase"}}>
              Líderes Gerais
            </span>
          </div>
          <div style={{fontSize:13,color:C.textMid,marginLeft:11,marginTop:2}}>
            Hierarquia externa
          </div>
        </div>

        {/* KPIs */}
        <div style={{display:"flex",gap:6,padding:"12px 14px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          {[
            {label:"Total",  val:totalLideres, cor:"#E8A020"},
            {label:"Ativos", val:totalAtivos,  cor:"#22C55E"},
            {label:"Presos", val:totalPresos,  cor:"#60A5FA"},
          ].map(({label,val,cor})=>(
            <div key={label} style={{flex:1,textAlign:"center",padding:"8px 4px",
              background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:8}}>
              <div style={{fontSize:22,fontWeight:800,color:cor,fontFamily:MONO,lineHeight:1}}>{val}</div>
              <div style={{fontSize:12,color:C.textDim,marginTop:4,letterSpacing:"0.04em"}}>{label}</div>
            </div>
          ))}
        </div>

        {/* Busca */}
        <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",
              color:C.textDim,fontSize:14,pointerEvents:"none"}}>⌕</span>
            <input value={busca} onChange={e=>setBusca(e.target.value)}
              placeholder="Buscar líder..."
              style={{...iStyle,paddingLeft:32,fontSize:14,padding:"9px 12px 9px 32px"}}/>
          </div>
        </div>

        {/* Lista de facções */}
        <div style={{flex:1,overflowY:"auto",padding:"8px 10px"}}>

          {/* Opção: Todos */}
          <button onClick={()=>setFaccaoSel("todas")} style={{
            width:"100%", textAlign:"left", padding:"10px 12px",
            borderRadius:8, marginBottom:4, cursor:"pointer", border:"none",
            background: faccaoSel==="todas" ? C.goldSoft : "transparent",
            borderLeft: `3px solid ${faccaoSel==="todas" ? C.accent : "transparent"}`,
            display:"flex", alignItems:"center", justifyContent:"space-between",
            transition:"all 0.12s",
          }}>
            <span style={{fontSize:15,fontWeight:faccaoSel==="todas"?700:500,
              color:faccaoSel==="todas"?C.accent:C.textMid}}>
              Todos os grupos
            </span>
            <span style={{fontSize:13,fontWeight:700,color:C.textDim,fontFamily:MONO}}>{totalLideres}</span>
          </button>

          {/* Divider */}
          <div style={{height:1,background:C.border,margin:"6px 0 8px"}}/>

          {loading ? (
            <div style={{textAlign:"center",padding:20,fontSize:14,color:C.textDim,fontFamily:MONO}}>
              Carregando...
            </div>
          ) : faccoes.map(f => {
            const cor    = corF(f.nome)
            const ativo  = faccaoSel === f.id
            const ativos = f.lideres.filter(l=>l.status==="Ativo").length
            return (
              <button key={f.id} onClick={()=>setFaccaoSel(f.id)} style={{
                width:"100%", textAlign:"left", padding:"10px 12px", borderRadius:8,
                marginBottom:4, cursor:"pointer", border:"none",
                background: ativo ? cor.bg : "transparent",
                borderLeft: `3px solid ${ativo ? cor.dot : "transparent"}`,
                display:"flex", alignItems:"center", justifyContent:"space-between",
                transition:"all 0.12s",
              }}>
                <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
                  <span style={{width:8,height:8,borderRadius:"50%",background:cor.dot,flexShrink:0,
                    boxShadow:ativo?`0 0 6px ${cor.dot}`:undefined}}/>
                  <span style={{fontSize:15,fontWeight:ativo?700:500,
                    color:ativo?cor.text:C.textMid,
                    whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {f.nome}
                  </span>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2,flexShrink:0,marginLeft:8}}>
                  <span style={{fontSize:13,fontWeight:700,color:ativo?cor.text:C.textDim,fontFamily:MONO}}>
                    {f.lideres.length}
                  </span>
                  {ativos > 0 && (
                    <span style={{fontSize:11,color:"#4ADE80",fontFamily:MONO}}>{ativos} atv</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Botões de ação */}
        <div style={{padding:"12px 12px 14px",borderTop:`1px solid ${C.border}`,flexShrink:0,display:"flex",flexDirection:"column",gap:8}}>
          <button onClick={()=>setModal({tipo:"lider",faccaoId:faccaoSel!=="todas"?faccaoSel:""})}
            style={{width:"100%",padding:"10px",borderRadius:8,border:"none",
              background:`linear-gradient(135deg,${C.accent},${C.accentHover})`,
              color:"#FFF",fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:MONO}}>
            + Novo Líder
          </button>
          <button onClick={()=>setModal({tipo:"faccao"})}
            style={{width:"100%",padding:"10px",borderRadius:8,
              border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.04)",
              color:C.textMid,fontSize:14,cursor:"pointer",fontFamily:MONO}}>
            + Novo Grupo
          </button>
        </div>
      </aside>

      {/* ── MAIN ─────────────────────────────────────────────────────────────── */}
      <div style={{display:"flex",flexDirection:"column",flex:1,minWidth:0,height:"100%",overflow:"hidden"}}>

        {/* Topbar */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"0 22px", height:56,
          borderBottom:`1px solid ${C.border}`,
          background:C.surface, flexShrink:0,
        }}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            {/* Window controls */}
            <div style={{display:"flex",gap:6}}>
              {["#FF5F57","#FEBC2E","#28C840"].map(cor=>(
                <div key={cor} style={{width:12,height:12,borderRadius:"50%",background:cor}}/>
              ))}
            </div>
            <div>
              <div style={{fontSize:17,fontWeight:700,color:C.text}}>
                {faccaoAtual ? faccaoAtual.nome : "Todos os Grupos"}
              </div>
              <div style={{fontSize:13,color:C.textMid,fontFamily:MONO,marginTop:1}}>
                {faccaoAtual
                  ? `${faccaoAtual.sigla} · ${faccaoAtual.lideres.length} líderes cadastrados`
                  : `${faccoes.length} grupos · ${totalLideres} líderes`}
              </div>
            </div>
          </div>

          {/* Badge status sistema */}
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 14px",
            background:"rgba(22,163,74,0.08)",borderRadius:20,border:"1px solid rgba(22,163,74,0.25)"}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:"#16A34A",
              boxShadow:"0 0 6px rgba(22,163,74,0.8)"}}/>
            <span style={{fontSize:13,color:"#4ADE80",fontWeight:600}}>Sistema Ativo</span>
          </div>
        </div>

        {/* Corpo principal */}
        <div className="lg-scroll" style={{flex:1,overflowY:"auto",padding:"20px 22px"}}>
          {loading ? (
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:200,gap:12}}>
              <span className="lg-spin" style={{display:"inline-block",fontSize:22,color:C.accent}}>⟳</span>
              <span style={{fontSize:15,color:C.textMid,fontFamily:MONO}}>Carregando líderes...</span>
            </div>

          ) : faccaoSel === "todas" ? (
            /* Visão agrupada por facção */
            faccoes.length === 0 ? (
              <div style={{textAlign:"center",padding:60,color:C.textDim,fontFamily:MONO,fontSize:15}}>
                Nenhum grupo cadastrado.
              </div>
            ) : faccoes.map(f => {
              const cor    = corF(f.nome)
              const lids   = busca
                ? f.lideres.filter(l=>
                    l.vulgo?.toLowerCase().includes(busca.toLowerCase()) ||
                    l.nome?.toLowerCase().includes(busca.toLowerCase()))
                : f.lideres
              if (lids.length === 0 && busca) return null
              return (
                <div key={f.id} style={{marginBottom:28}}>
                  {/* Header da seção de facção */}
                  <div style={{
                    display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"12px 16px", marginBottom:14,
                    background:`linear-gradient(135deg,${cor.bg},rgba(255,255,255,0.02))`,
                    borderRadius:10, border:`1px solid ${cor.border}`,
                  }}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:cor.dot,
                        boxShadow:`0 0 8px ${cor.dot}`}}/>
                      <span style={{fontSize:17,fontWeight:800,color:cor.text,fontFamily:MONO}}>{f.nome}</span>
                      <span style={{fontSize:14,color:C.textDim,fontFamily:MONO}}>({f.sigla})</span>
                      <span style={{fontSize:13,fontWeight:700,padding:"3px 10px",borderRadius:12,
                        background:cor.bg,border:`1px solid ${cor.border}`,color:cor.text,fontFamily:MONO}}>
                        {lids.length} líderes
                      </span>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>setModal({tipo:"lider",faccaoId:f.id})} style={{
                        padding:"6px 14px",borderRadius:8,border:`1px solid ${cor.border}`,
                        background:cor.bg,color:cor.text,fontSize:13,fontWeight:800,
                        cursor:"pointer",fontFamily:MONO}}>
                        + Líder
                      </button>
                      <button onClick={()=>deletarFaccao(f.id)} style={{
                        padding:"6px 12px",borderRadius:8,border:"1px solid rgba(239,68,68,0.3)",
                        background:"rgba(239,68,68,0.08)",color:"#FCA5A5",fontSize:13,
                        cursor:"pointer",fontFamily:MONO}}>
                        Remover grupo
                      </button>
                    </div>
                  </div>

                  {lids.length > 0
                    ? <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:14}}>
                        {lids.map(l=>(
                          <CardLiderRua key={l.id} lider={{...l,faccao_nome:f.nome}}
                            onEditar={lider=>setModal({tipo:"lider",lider})}
                            onDeletar={deletarLider}/>
                        ))}
                      </div>
                    : <div style={{padding:"20px",textAlign:"center",color:C.textDim,fontFamily:MONO,fontSize:14,
                        background:"rgba(255,255,255,0.015)",border:`1px dashed ${C.border}`,borderRadius:10}}>
                        Nenhum líder cadastrado neste grupo.
                      </div>}
                </div>
              )
            })

          ) : (
            /* Visão de facção específica */
            lideresFiltrados.length === 0 ? (
              <div style={{textAlign:"center",padding:60,color:C.textDim,fontFamily:MONO,fontSize:15}}>
                {busca?"Nenhum resultado para a busca.":"Nenhum líder cadastrado neste grupo."}
              </div>
            ) : (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:14}}>
                {lideresFiltrados.map(l=>(
                  <CardLiderRua key={l.id} lider={l}
                    onEditar={lider=>setModal({tipo:"lider",lider})}
                    onDeletar={deletarLider}/>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Modais */}
      {modal?.tipo==="faccao" && (
        <ModalNovaFaccao onSalvar={aoSalvarFaccao} onFechar={()=>setModal(null)}/>
      )}
      {modal?.tipo==="lider" && (
        <ModalLiderRua
          lider={modal.lider||null}
          faccoes={faccoes}
          cargos={cargos}
          statusList={statusList}
          faccaoInicial={modal.faccaoId||""}
          onSalvar={aoSalvarLider}
          onFechar={()=>setModal(null)}/>
      )}

      {/* Toast */}
      {toast && (
        <div style={{position:"fixed",bottom:24,right:24,padding:"12px 20px",borderRadius:8,
          background:toast.tipo==="erro"?"#DC2626":C.surfaceUp,color:"#FFF",fontSize:15,fontWeight:700,
          fontFamily:MONO,border:`1px solid ${C.border}`,zIndex:2000,boxShadow:"0 8px 24px rgba(0,0,0,0.5)",
          animation:"fadeUp .2s ease"}}>
          {toast.tipo==="erro"?"✗ ":"✓ "}{toast.msg}
        </div>
      )}

      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .lg-spin { animation: spin 1s linear infinite; }
        @keyframes spin { to{transform:rotate(360deg)} }
        select option { background: #111827; color:#F1F5F9; }
        textarea::placeholder, input::placeholder { color: #64748B !important; }
        .lg-card:hover { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(0,0,0,0.5) !important; }
        .lg-acoes { opacity: 0; transition: opacity .15s; }
        .lg-card:hover .lg-acoes { opacity: 1; }
        .lg-scroll::-webkit-scrollbar { width: 6px; }
        .lg-scroll::-webkit-scrollbar-track { background: transparent; }
        .lg-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.14); border-radius:6px; }
        .lg-scroll::-webkit-scrollbar-thumb:hover { background: rgba(232,160,32,0.4); }
      `}</style>
    </div>
  )
}
