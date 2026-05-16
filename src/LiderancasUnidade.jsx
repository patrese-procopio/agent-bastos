import { useState, useEffect, useRef } from "react"

const API     = "http://127.0.0.1:8000"
const API_LID = `${API}/api/liderancas`
const MONO    = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS    = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const FACCAO_COR = {
  "CV/AM":          { dot:"#DC2626", bg:"#FEF2F2", border:"#FECACA", text:"#991B1B" },
  "PCC":            { dot:"#3B82F6", bg:"#EFF6FF", border:"#BFDBFE", text:"#1E40AF" },
  "RDA":            { dot:"#22C55E", bg:"#F0FDF4", border:"#BBF7D0", text:"#166534" },
  "NEUTROS":        { dot:"#94A3B8", bg:"#0B1120", border:"#CBD5E1", text:"#475569" },
  "CRIMES SEXUAIS": { dot:"#F97316", bg:"#FFF7ED", border:"#FED7AA", text:"#9A3412" },
  "JACK/TDA":       { dot:"#8B5CF6", bg:"#F5F3FF", border:"#DDD6FE", text:"#5B21B6" },
  "AMARELINHOS":    { dot:"#F59E0B", bg:"#FFFBEB", border:"#FDE68A", text:"#92400E" },
  "ISOLAMENTO":     { dot:"#6B7280", bg:"#0B1120", border:"#D1D5DB", text:"#374151" },
  "MED. SEGURANÇA": { dot:"#94A3B8", bg:"#0B1120", border:"#CBD5E1", text:"#475569" },
}
function corF(f) { return FACCAO_COR[f] || { dot:"#94A3B8", bg:"#0B1120", border:"#E2E8F0", text:"#475569" } }

const MESES_PT = ["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
function fmtComp(comp) {
  if (!comp) return ""
  try { const [a,m] = comp.split("-"); return `${MESES_PT[parseInt(m)]} ${a}` }
  catch { return comp }
}

const inputStyle = {
  padding:"8px 10px", borderRadius:6, border:"1px solid rgba(255,255,255,0.07)",
  fontSize:15.6, color:"#F1F5F9", fontFamily:MONO,
  background:"#111827", outline:"none", width:"100%", boxSizing:"border-box",
}

// ── Upload de foto ────────────────────────────────────────────────────────────
function FotoUpload({ fotoUrl, onChange }) {
  const ref = useRef(null)
  const [preview, setPreview] = useState(fotoUrl || null)
  const [drag, setDrag] = useState(false)
  useEffect(() => setPreview(fotoUrl || null), [fotoUrl])
  function handle(file) { if (!file) return; setPreview(URL.createObjectURL(file)); onChange(file) }
  return (
    <div onClick={() => ref.current?.click()}
      onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
      onDrop={e=>{e.preventDefault();setDrag(false);handle(e.dataTransfer.files[0])}}
      style={{width:120,height:150,borderRadius:8,overflow:"hidden",flexShrink:0,
        border:`2px dashed ${drag?"#B45309":"#CBD5E1"}`,background:drag?"#FFFBEB":"#0B1120",
        cursor:"pointer",position:"relative",display:"flex",alignItems:"center",
        justifyContent:"center",transition:"all 0.15s"}}>
      {preview
        ? <img src={preview} alt="foto" style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"top"}}/>
        : <div style={{textAlign:"center",padding:8}}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <div style={{fontSize:11.7,color:"#94A3B8",fontFamily:MONO,marginTop:6,lineHeight:1.4}}>Clique ou<br/>arraste foto</div>
          </div>
      }
      <input ref={ref} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handle(e.target.files[0])}/>
      {preview && <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,0.7)",
        padding:4,fontSize:8,color:"#FFF",textAlign:"center",fontFamily:MONO}}>clique para trocar</div>}
    </div>
  )
}

function Campo({ label, children, required }) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      <label style={{fontSize:11.7,fontWeight:700,color:"#94A3B8",fontFamily:MONO,letterSpacing:"0.08em",textTransform:"uppercase"}}>
        {label}{required && <span style={{color:"#F87171"}}> *</span>}
      </label>
      {children}
    </div>
  )
}

// ── Modal PDF ─────────────────────────────────────────────────────────────────
function ModalPDF({ unidade, unidadeLabel, competencia, competencias, onFechar }) {
  const [tipo, setTipo]         = useState("unidade")
  const [comp, setComp]         = useState(competencia)
  const [baixando, setBaixando] = useState(false)

  async function baixar() {
    setBaixando(true)
    try {
      const url = tipo === "geral"
        ? `${API_LID}/pdf-geral/todas?competencia=${comp}`
        : `${API_LID}/pdf/${unidade}?competencia=${comp}`
      const res  = await fetch(url)
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const a    = document.createElement("a")
      a.href     = URL.createObjectURL(blob)
      a.download = tipo === "geral" ? `liderancas_geral_${comp}.pdf` : `liderancas_${unidade}_${comp}.pdf`
      a.click()
    } catch (e) { alert("Erro ao gerar PDF: " + e.message) }
    finally { setBaixando(false) }
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:1100,padding:20}}>
      <div style={{background:"#111827",borderRadius:14,width:"100%",maxWidth:420,
        boxShadow:"0 20px 60px rgba(0,0,0,0.25)",overflow:"hidden"}}>
        <div style={{padding:"16px 20px",background:"#0F172A",borderRadius:"14px 14px 0 0",
          display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:13,fontWeight:800,color:"#F1F5F9"}}>Exportar PDF</div>
            <div style={{fontSize:11.7,color:"#94A3B8",fontFamily:MONO,marginTop:2}}>
              Relatório de lideranças — CONFIDENCIAL
            </div>
          </div>
          <button onClick={onFechar} style={{background:"rgba(255,255,255,0.1)",border:"none",
            borderRadius:6,width:30,height:30,cursor:"pointer",color:"#FFF",fontSize:18,
            display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
        <div style={{padding:20,display:"flex",flexDirection:"column",gap:16}}>
          <Campo label="Tipo de relatório" required>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[{id:"unidade",label:`${unidadeLabel} apenas`},{id:"geral",label:"Todas as unidades"}].map(t=>(
                <button key={t.id} onClick={()=>setTipo(t.id)} style={{
                  padding:"10px",borderRadius:8,cursor:"pointer",
                  border:`2px solid ${tipo===t.id?"#B45309":"#E2E8F0"}`,
                  background:tipo===t.id?"#FFFBEB":"#0B1120",
                  color:tipo===t.id?"#B45309":"#475569",
                  fontSize:14.3,fontWeight:tipo===t.id?800:500,fontFamily:MONO,transition:"all 0.15s",
                }}>{t.label}</button>
              ))}
            </div>
          </Campo>
          <Campo label="Competência (mês/ano)" required>
            <select value={comp} onChange={e=>setComp(e.target.value)} style={inputStyle}>
              {competencias.length>0
                ? competencias.map(c=><option key={c} value={c}>{fmtComp(c)}</option>)
                : <option value={competencia}>{fmtComp(competencia)}</option>}
            </select>
          </Campo>
          <div style={{padding:"10px 14px",background:"#0B1120",border:"1px solid rgba(255,255,255,0.07)",
            borderRadius:8,fontSize:14.3,color:"#94A3B8",fontFamily:MONO}}>
            Relatório: {tipo==="geral"?"6 unidades":unidadeLabel} · Competência: <strong>{fmtComp(comp)}</strong>
          </div>
        </div>
        <div style={{padding:"12px 20px",borderTop:"1px solid rgba(255,255,255,0.07)",
          display:"flex",justifyContent:"flex-end",gap:8,background:"#0B1120",borderRadius:"0 0 14px 14px"}}>
          <button onClick={onFechar} style={{padding:"8px 18px",borderRadius:7,
            border:"1px solid rgba(255,255,255,0.07)",background:"#111827",fontSize:15.6,fontWeight:600,
            color:"#94A3B8",cursor:"pointer",fontFamily:MONO}}>Cancelar</button>
          <button onClick={baixar} disabled={baixando} style={{
            padding:"8px 20px",borderRadius:7,border:"none",
            background:baixando?"#CBD5E1":"#DC2626",color:"#F1F5F9",
            fontSize:15.6,fontWeight:800,cursor:baixando?"not-allowed":"pointer",
            fontFamily:MONO,letterSpacing:"0.04em",display:"flex",alignItems:"center",gap:6}}>
            {baixando
              ? <><svg style={{animation:"spin 1s linear infinite"}} width="12" height="12"
                  viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Gerando...</>
              : "↓ Baixar PDF"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de cadastro/edição ───────────────────────────────────────────────────
function ModalLider({ lider, estrutura, faccoes, cargosPorFaccao, unidadeAtiva,
  pavilhaoInicial, alaInicial, competenciaAtiva, onSalvar, onFechar }) {
  const isEdicao = !!lider?.id
  const [form, setForm] = useState({
    unidade:     unidadeAtiva,
    pavilhao:    pavilhaoInicial || "",
    ala:         alaInicial      || "",
    cela:        "",
    faccao:      "",
    cargo:       "",
    nome:        "",
    vulgo:       "",
    observacao:  "",
    competencia: competenciaAtiva || "",
    ...(isEdicao ? lider : {}),
  })
  const [fotoFile, setFotoFile] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro]         = useState("")

  const pavilhoes = Object.keys(estrutura[form.unidade]?.pavilhoes || {})
  const alas      = Object.keys(estrutura[form.unidade]?.pavilhoes?.[form.pavilhao] || {})
  const celas     = estrutura[form.unidade]?.pavilhoes?.[form.pavilhao]?.[form.ala] || []
  const cargos    = cargosPorFaccao[form.faccao] || []
  const cor       = corF(form.faccao)

  function set(k, v) {
    setForm(prev => {
      const next = { ...prev, [k]: v }
      if (k==="unidade")  { next.pavilhao=""; next.ala=""; next.cela="" }
      if (k==="pavilhao") { next.ala=""; next.cela="" }
      if (k==="ala")      { next.cela="" }
      if (k==="faccao")   { next.cargo="" }
      return next
    })
  }

  async function salvar() {
    if (!form.pavilhao || !form.ala || !form.faccao || !form.cargo) {
      setErro("Pavilhão, Ala, Facção e Cargo são obrigatórios."); return
    }
    setSalvando(true); setErro("")
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k,v]) => fd.append(k, v || ""))
      if (fotoFile) fd.append("foto", fotoFile)
      const res = await fetch(isEdicao ? `${API_LID}/${lider.id}` : API_LID,
        { method: isEdicao?"PUT":"POST", body:fd })
      if (!res.ok) throw new Error(await res.text())
      onSalvar(await res.json())
    } catch(e) { setErro("Erro ao salvar: " + e.message) }
    finally { setSalvando(false) }
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20}}>
      <div style={{background:"#111827",borderRadius:14,width:"100%",maxWidth:560,
        boxShadow:"0 20px 60px rgba(0,0,0,0.25)",display:"flex",flexDirection:"column",
        maxHeight:"92vh",overflow:"hidden"}}>
        <div style={{padding:"16px 20px",background:"#0F172A",borderRadius:"14px 14px 0 0",
          display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:13,fontWeight:800,color:"#F1F5F9"}}>
              {isEdicao?"Editar Líder":"Cadastrar Líder"}
            </div>
            <div style={{fontSize:11.7,color:"#94A3B8",fontFamily:MONO,marginTop:2}}>
              {isEdicao?`ID: ${lider.id.slice(0,8)}...`:"Novo registro de liderança"}
            </div>
          </div>
          <button onClick={onFechar} style={{background:"rgba(255,255,255,0.1)",border:"none",
            borderRadius:6,width:30,height:30,cursor:"pointer",color:"#FFF",fontSize:18,
            display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
        <div style={{padding:20,overflowY:"auto",display:"flex",flexDirection:"column",gap:16}}>
          <div style={{display:"flex",gap:16,alignItems:"flex-start"}}>
            <FotoUpload fotoUrl={isEdicao&&lider.foto_ext?`${API_LID}/foto/${lider.id}`:null} onChange={setFotoFile}/>
            <div style={{flex:1,display:"flex",flexDirection:"column",gap:10}}>
              <Campo label="Vulgo / Apelido">
                <input value={form.vulgo} onChange={e=>set("vulgo",e.target.value)}
                  placeholder="ex: Carnaúba"
                  style={{...inputStyle,fontSize:16,fontWeight:800,color:cor.dot||"#0F172A",borderColor:cor.border}}/>
              </Campo>
              <Campo label="Nome completo">
                <input value={form.nome} onChange={e=>set("nome",e.target.value)}
                  placeholder="Nome civil" style={inputStyle}/>
              </Campo>
            </div>
          </div>
          <div style={{height:1,background:"#E2E8F0"}}/>
          <div style={{padding:"10px 14px",background:"rgba(232,160,32,0.10)",border:"1px solid rgba(251,191,36,0.3)",
            borderRadius:8,display:"flex",alignItems:"center",gap:12}}>
            <div style={{flex:1}}>
              <div style={{fontSize:11.7,fontWeight:700,color:"#E8A020",fontFamily:MONO,
                letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4}}>
                Competência (mês/ano de referência) *
              </div>
              <input type="month" value={form.competencia} onChange={e=>set("competencia",e.target.value)}
                style={{...inputStyle,borderColor:"#FCD34D",background:"#111827",fontFamily:MONO,fontWeight:700,color:"#E8A020"}}/>
            </div>
            <div style={{fontSize:11.7,color:"#E8A020",fontFamily:MONO,lineHeight:1.5,maxWidth:140}}>
              Define o período histórico deste registro
            </div>
          </div>
          <div style={{height:1,background:"#E2E8F0"}}/>
          <div>
            <div style={{fontSize:11.7,fontWeight:700,color:"#94A3B8",fontFamily:MONO,
              letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8}}>Localização</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Campo label="Unidade" required>
                <select value={form.unidade} onChange={e=>set("unidade",e.target.value)} style={inputStyle}>
                  {Object.entries(estrutura).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
              </Campo>
              <Campo label="Pavilhão" required>
                <select value={form.pavilhao} onChange={e=>set("pavilhao",e.target.value)}
                  style={inputStyle} disabled={!form.unidade}>
                  <option value="">Selecione...</option>
                  {pavilhoes.map(p=><option key={p} value={p}>{p}</option>)}
                </select>
              </Campo>
              <Campo label="Ala" required>
                <select value={form.ala} onChange={e=>set("ala",e.target.value)}
                  style={inputStyle} disabled={!form.pavilhao}>
                  <option value="">Selecione...</option>
                  {alas.map(a=><option key={a} value={a}>{a}</option>)}
                </select>
              </Campo>
              <Campo label="Cela onde está custodiado">
                <select value={form.cela} onChange={e=>set("cela",e.target.value)}
                  style={inputStyle} disabled={!form.ala}>
                  <option value="">Não informada</option>
                  {celas.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </Campo>
            </div>
          </div>
          <div style={{height:1,background:"#E2E8F0"}}/>
          <div>
            <div style={{fontSize:11.7,fontWeight:700,color:"#94A3B8",fontFamily:MONO,
              letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8}}>Função na facção</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Campo label="Facção" required>
                <select value={form.faccao} onChange={e=>set("faccao",e.target.value)}
                  style={{...inputStyle,color:cor.text,borderColor:cor.border,background:cor.bg}}>
                  <option value="">Selecione...</option>
                  {faccoes.map(f=><option key={f} value={f}>{f}</option>)}
                </select>
              </Campo>
              <Campo label="Cargo" required>
                <select value={form.cargo} onChange={e=>set("cargo",e.target.value)}
                  style={inputStyle} disabled={!form.faccao}>
                  <option value="">Selecione...</option>
                  {cargos.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </Campo>
            </div>
          </div>
          <Campo label="Observação operacional">
            <textarea value={form.observacao} onChange={e=>set("observacao",e.target.value)}
              placeholder="Informações adicionais relevantes..." rows={3}
              style={{...inputStyle,resize:"vertical",lineHeight:1.5}}/>
          </Campo>
          {erro && <div style={{padding:"8px 12px",background:"rgba(239,68,68,0.10)",border:"1px solid rgba(239,68,68,0.3)",
            borderRadius:6,fontSize:14.3,color:"#F87171",fontFamily:MONO}}>{erro}</div>}
        </div>
        <div style={{padding:"12px 20px",borderTop:"1px solid rgba(255,255,255,0.07)",
          display:"flex",justifyContent:"flex-end",gap:8,background:"#0B1120",borderRadius:"0 0 14px 14px"}}>
          <button onClick={onFechar} style={{padding:"8px 18px",borderRadius:7,
            border:"1px solid rgba(255,255,255,0.07)",background:"#111827",fontSize:15.6,fontWeight:600,
            color:"#94A3B8",cursor:"pointer",fontFamily:MONO}}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} style={{padding:"8px 20px",borderRadius:7,
            border:"none",background:salvando?"#CBD5E1":"#B45309",color:"#F1F5F9",
            fontSize:15.6,fontWeight:800,cursor:salvando?"not-allowed":"pointer",fontFamily:MONO,letterSpacing:"0.04em"}}>
            {salvando?"Salvando...":isEdicao?"Salvar alterações":"Cadastrar líder"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Card horizontal do líder ──────────────────────────────────────────────────
function CardLiderAla({ lider, onEditar, onDeletar }) {
  const cor = corF(lider.faccao)
  const [confirmando, setConfirmando] = useState(false)
  const dataCadastro = lider.criado_em ? lider.criado_em.slice(0,10).split("-").reverse().join("/") : ""

  return (
    <div style={{display:"flex",alignItems:"center",gap:14,padding:"12px 14px",
      background:"#111827",border:`1px solid ${cor.border}`,borderLeft:`4px solid ${cor.dot}`,
      borderRadius:10,boxShadow:"0 2px 6px rgba(0,0,0,0.05)"}}>
      {/* Foto — 72x90px, proporção 3x4 */}
      <div style={{width:72,height:90,borderRadius:8,overflow:"hidden",background:"#1E293B",
        flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
        {lider.foto_ext
          ? <img src={`${API_LID}/foto/${lider.id}?t=${lider.atualizado_em}`} alt={lider.vulgo}
              style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"top"}}
              onError={e=>{e.target.style.display="none"}}/>
          : <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
        }
      </div>
      {/* Dados */}
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
          <span style={{fontSize:16,fontWeight:900,color:cor.dot,fontFamily:MONO}}>
            {lider.vulgo||"—"}
          </span>
          <span style={{fontSize:11.7,fontWeight:800,color:cor.text,background:cor.bg,
            border:`1px solid ${cor.border}`,padding:"2px 7px",borderRadius:3,fontFamily:MONO}}>
            {lider.faccao}
          </span>
          {lider.competencia && (
            <span style={{fontSize:11.7,color:"#E8A020",background:"rgba(232,160,32,0.10)",
              border:"1px solid rgba(251,191,36,0.3)",padding:"2px 7px",borderRadius:3,fontFamily:MONO,fontWeight:700}}>
              {fmtComp(lider.competencia)}
            </span>
          )}
        </div>
        {lider.nome && (
          <div style={{fontSize:14,fontWeight:800,color:"#F1F5F9",
            fontFamily:MONO,letterSpacing:"0.01em",marginBottom:4}}>{lider.nome}</div>
        )}
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{fontSize:13,fontWeight:700,color:"#94A3B8",fontFamily:MONO}}>{lider.cargo}</span>
          {lider.cela && (
            <><span style={{color:"#CBD5E1",fontSize:9}}>·</span>
            <span style={{fontSize:13,color:"#94A3B8",fontFamily:MONO,
              background:"#1A2236",padding:"1px 7px",borderRadius:3}}>{lider.cela}</span></>
          )}
          {dataCadastro && (
            <><span style={{color:"#CBD5E1",fontSize:9}}>·</span>
            <span style={{fontSize:11.7,color:"#94A3B8",fontFamily:MONO}}>cadastrado {dataCadastro}</span></>
          )}
        </div>
        {lider.observacao && (
          <div style={{fontSize:13,color:"#94A3B8",marginTop:4,fontStyle:"italic"}}>
            {lider.observacao.length>80?lider.observacao.slice(0,80)+"...":lider.observacao}
          </div>
        )}
      </div>
      {/* Ações */}
      <div style={{display:"flex",gap:5,flexShrink:0}}>
        <button onClick={()=>onEditar(lider)} style={{width:30,height:30,borderRadius:6,
          border:"1px solid rgba(255,255,255,0.07)",background:"#0B1120",cursor:"pointer",
          display:"flex",alignItems:"center",justifyContent:"center"}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        {confirmando
          ? <button onClick={()=>onDeletar(lider.id)} style={{height:30,borderRadius:6,border:"none",
              padding:"0 10px",background:"#DC2626",cursor:"pointer",
              fontSize:11.7,fontWeight:800,color:"#FFF",fontFamily:MONO}}>confirmar</button>
          : <button onClick={()=>setConfirmando(true)} style={{width:30,height:30,borderRadius:6,
              border:"1px solid rgba(239,68,68,0.3)",background:"rgba(239,68,68,0.10)",cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/>
              </svg>
            </button>
        }
      </div>
    </div>
  )
}

// ── Seção de Ala ──────────────────────────────────────────────────────────────
function SecaoAla({ ala, lideres, onNovo, onEditar, onDeletar }) {
  const temLider = lideres.length > 0
  const cor      = temLider ? corF(lideres[0].faccao) : null
  return (
    <div style={{marginBottom:8}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"7px 12px",background:temLider?cor.bg:"#0B1120",
        border:`1px solid ${temLider?cor.border:"#E2E8F0"}`,
        borderRadius:temLider?"8px 8px 0 0":8,borderBottom:temLider?"none":undefined}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:3,height:14,borderRadius:2,background:temLider?cor.dot:"#CBD5E1"}}/>
          <span style={{fontSize:14.3,fontWeight:700,color:"#94A3B8",fontFamily:MONO}}>{ala}</span>
          <span style={{fontSize:11.7,color:temLider?cor.text:"#94A3B8",fontFamily:MONO,
            background:temLider?"#111827":"#1A2236",
            border:`1px solid ${temLider?cor.border:"#E2E8F0"}`,padding:"1px 6px",borderRadius:3}}>
            {temLider?`${lideres.length} líder`:"sem líder"}
          </span>
        </div>
        <button onClick={onNovo} style={{padding:"3px 10px",borderRadius:5,
          border:`1px solid ${temLider?cor.border:"#E2E8F0"}`,background:"transparent",
          fontSize:11.7,color:temLider?cor.text:"#64748B",cursor:"pointer",fontFamily:MONO,fontWeight:600}}>
          {temLider?"+ Outro":"+ Líder"}
        </button>
      </div>
      {temLider && (
        <div style={{border:`1px solid ${cor.border}`,borderTop:"none",
          borderRadius:"0 0 8px 8px",display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {lideres.map((l,i)=>(
            <div key={l.id} style={{borderTop:i>0?`1px solid ${cor.border}`:"none"}}>
              <CardLiderAla lider={l} onEditar={onEditar} onDeletar={onDeletar}/>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Seção de Pavilhão ─────────────────────────────────────────────────────────
function SecaoPavilhao({ pavilhao, alas, onNovo, onEditar, onDeletar }) {
  const [aberto, setAberto] = useState(true)
  const todosLideres = Object.values(alas).flat()
  const total        = todosLideres.length
  const faccaoDom    = total > 0
    ? todosLideres.map(l=>l.faccao)
        .sort((a,b)=>todosLideres.filter(l=>l.faccao===b).length-todosLideres.filter(l=>l.faccao===a).length)[0]
    : null
  const cor = corF(faccaoDom)
  return (
    <div style={{background:"#111827",borderRadius:10,border:"1px solid rgba(255,255,255,0.07)",
      overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
      <div onClick={()=>setAberto(v=>!v)} style={{padding:"11px 16px",cursor:"pointer",
        background:"linear-gradient(135deg,#0F172A 0%,#1E293B 100%)",
        borderBottom:aberto?`3px solid ${cor.dot||"#334155"}`:"none",
        display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:faccaoDom?cor.dot:"#475569",
            boxShadow:faccaoDom?`0 0 7px ${cor.dot}`:"none"}}/>
          <span style={{fontSize:13,fontWeight:800,color:"#F1F5F9",letterSpacing:"0.06em",fontFamily:MONO}}>
            {pavilhao}
          </span>
          {total>0&&<span style={{fontSize:11.7,color:"#94A3B8",fontFamily:MONO,
            background:"rgba(255,255,255,0.08)",padding:"2px 8px",borderRadius:4}}>
            {total} líder{total!==1?"es":""}
          </span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={e=>{e.stopPropagation();onNovo(pavilhao)}} style={{
            padding:"4px 12px",borderRadius:5,border:"none",background:"#B45309",
            color:"#FFF",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:MONO}}>+ Líder</button>
          <span style={{color:"#94A3B8",fontSize:13,userSelect:"none"}}>{aberto?"▲":"▼"}</span>
        </div>
      </div>
      {aberto&&(
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

// ── Componente principal ───────────────────────────────────────────────────────
export default function LiderancasUnidade({ onNavigate }) {
  const [unidade, setUnidade]         = useState("CDPM1")
  const [competencia, setCompetencia] = useState("")
  const [competencias, setCompetencias] = useState([])
  const [dados, setDados]             = useState(null)
  const [estrutura, setEstrutura]     = useState({})
  const [faccoes, setFaccoes]         = useState([])
  const [cargosPorFaccao, setCargosPorFaccao] = useState({})
  const [loading, setLoading]         = useState(true)
  const [modal, setModal]             = useState(null)
  const [modalPDF, setModalPDF]       = useState(false)
  const [busca, setBusca]             = useState("")
  const [toast, setToast]             = useState(null)
  const [compAtual, setCompAtual]     = useState("")

  const unidadesLabel = Object.fromEntries(Object.entries(estrutura).map(([k,v])=>[k,v.label]))

  function exibirToast(msg, tipo="ok") { setToast({msg,tipo}); setTimeout(()=>setToast(null),3000) }

  async function carregarEstrutura() {
    try {
      const d = await fetch(`${API_LID}/estrutura`).then(r=>r.json())
      setEstrutura(d.estrutura); setFaccoes(d.faccoes)
      setCargosPorFaccao(d.cargos_por_faccao); setCompAtual(d.competencia_atual||"")
    } catch {}
  }

  async function carregarCompetencias(u=unidade) {
    try {
      const d = await fetch(`${API_LID}/competencias/${u}`).then(r=>r.json())
      const comps = d.competencias||[]
      setCompetencias(comps)
      if (comps.length>0 && !competencia) setCompetencia(comps[0])
      else if (comps.length>0 && !comps.includes(competencia)) setCompetencia(comps[0])
    } catch {}
  }

  async function carregarDados(u=unidade, comp=competencia) {
    setLoading(true)
    try {
      const url = comp ? `${API_LID}/${u}?competencia=${comp}` : `${API_LID}/${u}`
      const d   = await fetch(url).then(r=>r.json())
      setDados(d.pavilhoes)
      if (d.competencia) setCompetencia(d.competencia)
      if (d.competencias) setCompetencias(d.competencias)
    } catch { setDados(null) }
    finally  { setLoading(false) }
  }

  useEffect(() => { carregarEstrutura() }, [])
  useEffect(() => { setCompetencia(""); carregarCompetencias(unidade).then(()=>carregarDados(unidade)) }, [unidade])
  useEffect(() => { if (competencia) carregarDados(unidade, competencia) }, [competencia])

  async function deletar(id) {
    try {
      await fetch(`${API_LID}/${id}`, {method:"DELETE"})
      exibirToast("Líder removido."); carregarDados()
    } catch { exibirToast("Erro ao remover.","erro") }
  }

  function aoSalvar() { exibirToast("Líder salvo!"); setModal(null); carregarDados(); carregarCompetencias() }

  const totalLideres = dados
    ? Object.values(dados).reduce((s,alas)=>s+Object.values(alas).reduce((s2,celas)=>
        s2+Object.values(celas).reduce((s3,l)=>s3+l.length,0),0),0) : 0

  function filtrar(dados) {
    if (!busca||!dados) return dados
    const b=busca.toLowerCase(), r={}
    for (const [pav,alas] of Object.entries(dados)) {
      r[pav]={}
      for (const [ala,celas] of Object.entries(alas)) {
        r[pav][ala]={}
        for (const [cela,lids] of Object.entries(celas)) {
          r[pav][ala][cela]=lids.filter(l=>
            l.vulgo?.toLowerCase().includes(b)||l.nome?.toLowerCase().includes(b)||l.cargo?.toLowerCase().includes(b))
        }
      }
    }
    return r
  }

  const dadosFiltrados = filtrar(dados)

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:"#0B1120",fontFamily:SANS,overflow:"hidden"}}>

      {/* Topbar */}
      <div style={{height:56,background:"#111827",borderBottom:"1px solid rgba(255,255,255,0.07)",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"0 20px",flexShrink:0,boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>onNavigate?.("Controle de Grupos")} style={{
            background:"transparent",border:"none",cursor:"pointer",fontSize:18,color:"#94A3B8",padding:0}}>←</button>
          <div>
            <div style={{fontSize:13,fontWeight:800,color:"#F1F5F9"}}>Lideranças por Unidade</div>
            <div style={{fontSize:11.7,color:"#94A3B8",fontFamily:MONO,marginTop:1}}>
              {unidadesLabel[unidade]} · {fmtComp(competencia)||"sem registros"} · {totalLideres} líderes
            </div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(232,160,32,0.10)",
            border:"1px solid rgba(251,191,36,0.3)",borderRadius:8,padding:"0 4px 0 10px"}}>
            <span style={{fontSize:11.7,fontWeight:700,color:"#E8A020",fontFamily:MONO,whiteSpace:"nowrap"}}>
              MES/ANO
            </span>
            <select value={competencia} onChange={e=>setCompetencia(e.target.value)}
              style={{fontSize:14.3,fontFamily:MONO,fontWeight:800,border:"none",borderRadius:6,
                padding:"8px 4px",background:"transparent",color:"#E8A020",cursor:"pointer",outline:"none"}}>
              {competencias.length>0
                ? competencias.map(c=><option key={c} value={c}>{fmtComp(c)}</option>)
                : <option value={compAtual}>{fmtComp(compAtual)||"Nenhum"}</option>}
            </select>
          </div>
          <div style={{position:"relative"}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"
              strokeLinecap="round" style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)"}}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar vulgo, nome..."
              style={{...inputStyle,paddingLeft:28,width:180,border:"1px solid rgba(255,255,255,0.07)",background:"#0B1120"}}/>
          </div>
          <button onClick={()=>setModalPDF(true)} style={{padding:"8px 14px",borderRadius:7,
            border:"1px solid rgba(255,255,255,0.07)",background:"#111827",color:"#94A3B8",
            fontSize:14.3,fontWeight:700,cursor:"pointer",fontFamily:MONO,
            display:"flex",alignItems:"center",gap:5}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            PDF
          </button>
          <button onClick={()=>setModal({pavilhao:"",ala:""})} style={{
            padding:"8px 16px",borderRadius:7,border:"none",background:"#B45309",color:"#FFF",
            fontSize:14.3,fontWeight:800,cursor:"pointer",fontFamily:MONO,
            letterSpacing:"0.04em",display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:16,lineHeight:1}}>+</span> Novo líder
          </button>
        </div>
      </div>

      {/* Abas de unidade */}
      <div style={{display:"flex",gap:4,padding:"10px 20px",background:"#111827",
        borderBottom:"1px solid rgba(255,255,255,0.07)",flexShrink:0,overflowX:"auto"}}>
        {Object.entries(unidadesLabel).map(([key,label])=>(
          <button key={key} onClick={()=>setUnidade(key)} style={{
            background:unidade===key?"#0F172A":"#1A2236",
            border:unidade===key?"none":"1px solid rgba(255,255,255,0.07)",
            borderRadius:8,cursor:"pointer",padding:"8px 20px",
            fontSize:15.6,fontWeight:unidade===key?800:600,
            color:unidade===key?"#111827":"#475569",
            fontFamily:MONO,letterSpacing:"0.05em",transition:"all 0.15s",whiteSpace:"nowrap",
            boxShadow:unidade===key?"0 2px 8px rgba(15,23,42,0.3)":"none"}}>
            {label}
          </button>
        ))}
      </div>

      {/* Corpo */}
      <div style={{flex:1,overflow:"auto",padding:"16px 20px"}}>
        {loading ? (
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:200,gap:10}}>
            <svg style={{animation:"spin 1s linear infinite"}} width="22" height="22"
              viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            <span style={{fontSize:14.3,color:"#94A3B8",fontFamily:MONO}}>Carregando...</span>
          </div>
        ) : dadosFiltrados ? (
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {Object.entries(dadosFiltrados).map(([pav,alas])=>(
              <SecaoPavilhao key={pav} pavilhao={pav} alas={alas}
                onNovo={(p,a)=>setModal({pavilhao:p,ala:a||""})}
                onEditar={l=>setModal({lider:l})} onDeletar={deletar}/>
            ))}
          </div>
        ) : (
          <div style={{textAlign:"center",padding:60,color:"#94A3B8",fontFamily:MONO,fontSize:12}}>
            Backend offline ou sem dados.
          </div>
        )}
      </div>

      {modal && <ModalLider lider={modal.lider||null} estrutura={estrutura} faccoes={faccoes}
        cargosPorFaccao={cargosPorFaccao} unidadeAtiva={unidade}
        pavilhaoInicial={modal.pavilhao} alaInicial={modal.ala}
        competenciaAtiva={competencia||compAtual} onSalvar={aoSalvar} onFechar={()=>setModal(null)}/>}

      {modalPDF && <ModalPDF unidade={unidade} unidadeLabel={unidadesLabel[unidade]||unidade}
        competencia={competencia||compAtual} competencias={competencias} onFechar={()=>setModalPDF(false)}/>}

      {toast && (
        <div style={{position:"fixed",bottom:24,right:24,padding:"10px 18px",borderRadius:8,
          background:toast.tipo==="erro"?"#DC2626":"#0F172A",color:"#FFF",fontSize:15.6,fontWeight:700,
          fontFamily:MONO,boxShadow:"0 4px 20px rgba(0,0,0,0.3)",zIndex:2000,animation:"fadeUp 0.2s ease"}}>
          {toast.tipo==="erro"?"✗ ":"✓ "}{toast.msg}
        </div>
      )}

      <style>{`
        @keyframes spin   { to{transform:rotate(360deg)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  )
}
