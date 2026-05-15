import { useState, useEffect, useRef } from "react"

const API     = "http://127.0.0.1:8000"
const API_LID = `${API}/api/liderancas`
const MONO    = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS    = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const FACCAO_COR = {
  "CV/AM":          { dot: "#DC2626", bg: "#FEF2F2", border: "#FECACA", text: "#991B1B" },
  "PCC":            { dot: "#3B82F6", bg: "#EFF6FF", border: "#BFDBFE", text: "#1E40AF" },
  "RDA":            { dot: "#22C55E", bg: "#F0FDF4", border: "#BBF7D0", text: "#166534" },
  "NEUTROS":        { dot: "#94A3B8", bg: "#F8FAFC", border: "#CBD5E1", text: "#475569" },
  "CRIMES SEXUAIS": { dot: "#F97316", bg: "#FFF7ED", border: "#FED7AA", text: "#9A3412" },
  "JACK/TDA":       { dot: "#8B5CF6", bg: "#F5F3FF", border: "#DDD6FE", text: "#5B21B6" },
  "AMARELINHOS":    { dot: "#F59E0B", bg: "#FFFBEB", border: "#FDE68A", text: "#92400E" },
  "ISOLAMENTO":     { dot: "#6B7280", bg: "#F8FAFC", border: "#D1D5DB", text: "#374151" },
  "MED. SEGURANÇA": { dot: "#94A3B8", bg: "#F8FAFC", border: "#CBD5E1", text: "#475569" },
}
function corF(f) { return FACCAO_COR[f] || { dot:"#94A3B8", bg:"#F8FAFC", border:"#E2E8F0", text:"#475569" } }

const inputStyle = {
  padding: "8px 10px", borderRadius: 6, border: "1px solid #E2E8F0",
  fontSize: 12, color: "#0F172A", fontFamily: MONO,
  background: "#FFFFFF", outline: "none", width: "100%", boxSizing: "border-box",
}

// ── Upload de foto ────────────────────────────────────────────────────────────
function FotoUpload({ fotoUrl, onChange }) {
  const ref = useRef(null)
  const [preview, setPreview] = useState(fotoUrl || null)
  const [drag, setDrag]       = useState(false)
  useEffect(() => setPreview(fotoUrl || null), [fotoUrl])
  function handle(file) {
    if (!file) return
    setPreview(URL.createObjectURL(file))
    onChange(file)
  }
  return (
    <div onClick={() => ref.current?.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]) }}
      style={{
        width:120, height:150, borderRadius:8, overflow:"hidden", flexShrink:0,
        border:`2px dashed ${drag?"#B45309":"#CBD5E1"}`,
        background: drag?"#FFFBEB":"#F8FAFC",
        cursor:"pointer", position:"relative",
        display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.15s",
      }}>
      {preview
        ? <img src={preview} alt="foto" style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"top"}}/>
        : <div style={{textAlign:"center",padding:8}}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <div style={{fontSize:9,color:"#94A3B8",fontFamily:MONO,marginTop:6,lineHeight:1.4}}>
              Clique ou<br/>arraste foto
            </div>
          </div>
      }
      <input ref={ref} type="file" accept="image/*" style={{display:"none"}}
        onChange={e => handle(e.target.files[0])}/>
      {preview && (
        <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,0.7)",
          padding:4,fontSize:8,color:"#FFF",textAlign:"center",fontFamily:MONO}}>
          clique para trocar
        </div>
      )}
    </div>
  )
}

function Campo({ label, children, required }) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      <label style={{fontSize:9,fontWeight:700,color:"#64748B",fontFamily:MONO,
        letterSpacing:"0.08em",textTransform:"uppercase"}}>
        {label}{required && <span style={{color:"#DC2626"}}> *</span>}
      </label>
      {children}
    </div>
  )
}

// ── Modal cadastro/edição ─────────────────────────────────────────────────────
function ModalLider({ lider, estrutura, faccoes, cargosPorFaccao, unidadeAtiva, pavilhaoInicial, alaInicial, onSalvar, onFechar }) {
  const isEdicao = !!lider?.id
  const [form, setForm] = useState({
    unidade:    unidadeAtiva,
    pavilhao:   pavilhaoInicial || "",
    ala:        alaInicial      || "",
    cela:       "",
    faccao:     "",
    cargo:      "",
    nome:       "",
    vulgo:      "",
    observacao: "",
    ...(isEdicao ? lider : {}),
  })
  const [fotoFile, setFotoFile] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro]         = useState("")

  const pavilhoes = Object.keys(estrutura[form.unidade]?.pavilhoes || {})
  const alas      = Object.keys(estrutura[form.unidade]?.pavilhoes?.[form.pavilhao] || {})
  // Celas disponíveis para a ala selecionada
  const celas     = estrutura[form.unidade]?.pavilhoes?.[form.pavilhao]?.[form.ala] || []
  const cargos    = cargosPorFaccao[form.faccao] || []
  const cor       = corF(form.faccao)

  function set(k, v) {
    setForm(prev => {
      const next = { ...prev, [k]: v }
      if (k === "unidade")  { next.pavilhao = ""; next.ala = ""; next.cela = "" }
      if (k === "pavilhao") { next.ala = ""; next.cela = "" }
      if (k === "ala")      { next.cela = "" }
      if (k === "faccao")   { next.cargo = "" }
      return next
    })
  }

  async function salvar() {
    if (!form.pavilhao || !form.ala || !form.faccao || !form.cargo) {
      setErro("Pavilhão, Ala, Facção e Cargo são obrigatórios.")
      return
    }
    setSalvando(true); setErro("")
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, v || ""))
      if (fotoFile) fd.append("foto", fotoFile)
      const res = await fetch(
        isEdicao ? `${API_LID}/${lider.id}` : API_LID,
        { method: isEdicao ? "PUT" : "POST", body: fd }
      )
      if (!res.ok) throw new Error(await res.text())
      onSalvar(await res.json())
    } catch (e) {
      setErro("Erro ao salvar: " + e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20}}>
      <div style={{background:"#FFFFFF",borderRadius:14,width:"100%",maxWidth:560,
        boxShadow:"0 20px 60px rgba(0,0,0,0.25)",
        display:"flex",flexDirection:"column",maxHeight:"92vh",overflow:"hidden"}}>

        {/* Header */}
        <div style={{padding:"16px 20px",background:"#0F172A",borderRadius:"14px 14px 0 0",
          display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:13,fontWeight:800,color:"#FFFFFF"}}>
              {isEdicao ? "Editar Líder" : "Cadastrar Líder"}
            </div>
            <div style={{fontSize:9,color:"#94A3B8",fontFamily:MONO,marginTop:2}}>
              {isEdicao ? `ID: ${lider.id.slice(0,8)}...` : "Novo registro de liderança"}
            </div>
          </div>
          <button onClick={onFechar} style={{background:"rgba(255,255,255,0.1)",border:"none",
            borderRadius:6,width:30,height:30,cursor:"pointer",color:"#FFF",fontSize:18,
            display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>

        {/* Body */}
        <div style={{padding:20,overflowY:"auto",display:"flex",flexDirection:"column",gap:16}}>

          {/* Foto + identificação */}
          <div style={{display:"flex",gap:16,alignItems:"flex-start"}}>
            <FotoUpload
              fotoUrl={isEdicao && lider.foto_ext ? `${API_LID}/foto/${lider.id}` : null}
              onChange={setFotoFile}
            />
            <div style={{flex:1,display:"flex",flexDirection:"column",gap:10}}>
              <Campo label="Vulgo / Apelido">
                <input value={form.vulgo} onChange={e => set("vulgo", e.target.value)}
                  placeholder="ex: Carnaúba"
                  style={{...inputStyle, fontSize:16, fontWeight:800,
                    color: cor.dot || "#0F172A", borderColor: cor.border}}/>
              </Campo>
              <Campo label="Nome completo">
                <input value={form.nome} onChange={e => set("nome", e.target.value)}
                  placeholder="Nome civil" style={inputStyle}/>
              </Campo>
            </div>
          </div>

          <div style={{height:1,background:"#E2E8F0"}}/>

          {/* Localização — Unidade / Pavilhão / Ala / Cela */}
          <div>
            <div style={{fontSize:9,fontWeight:700,color:"#94A3B8",fontFamily:MONO,
              letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8}}>Localização</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Campo label="Unidade" required>
                <select value={form.unidade} onChange={e => set("unidade", e.target.value)} style={inputStyle}>
                  {Object.entries(estrutura).map(([k,v]) =>
                    <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Campo>
              <Campo label="Pavilhão" required>
                <select value={form.pavilhao} onChange={e => set("pavilhao", e.target.value)}
                  style={inputStyle} disabled={!form.unidade}>
                  <option value="">Selecione...</option>
                  {pavilhoes.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Campo>
              <Campo label="Ala" required>
                <select value={form.ala} onChange={e => set("ala", e.target.value)}
                  style={inputStyle} disabled={!form.pavilhao}>
                  <option value="">Selecione...</option>
                  {alas.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </Campo>
              <Campo label="Cela onde está custodiado">
                <select value={form.cela} onChange={e => set("cela", e.target.value)}
                  style={inputStyle} disabled={!form.ala}>
                  <option value="">Não informada</option>
                  {celas.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Campo>
            </div>
          </div>

          <div style={{height:1,background:"#E2E8F0"}}/>

          {/* Facção + Cargo */}
          <div>
            <div style={{fontSize:9,fontWeight:700,color:"#94A3B8",fontFamily:MONO,
              letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8}}>Função na facção</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Campo label="Facção" required>
                <select value={form.faccao} onChange={e => set("faccao", e.target.value)}
                  style={{...inputStyle, color:cor.text, borderColor:cor.border, background:cor.bg}}>
                  <option value="">Selecione...</option>
                  {faccoes.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </Campo>
              <Campo label="Cargo" required>
                <select value={form.cargo} onChange={e => set("cargo", e.target.value)}
                  style={inputStyle} disabled={!form.faccao}>
                  <option value="">Selecione...</option>
                  {cargos.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Campo>
            </div>
          </div>

          {/* Observação */}
          <Campo label="Observação operacional">
            <textarea value={form.observacao} onChange={e => set("observacao", e.target.value)}
              placeholder="Informações adicionais relevantes..." rows={3}
              style={{...inputStyle, resize:"vertical", lineHeight:1.5}}/>
          </Campo>

          {erro && (
            <div style={{padding:"8px 12px",background:"#FEF2F2",border:"1px solid #FECACA",
              borderRadius:6,fontSize:11,color:"#DC2626",fontFamily:MONO}}>{erro}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{padding:"12px 20px",borderTop:"1px solid #E2E8F0",
          display:"flex",justifyContent:"flex-end",gap:8,
          background:"#F8FAFC",borderRadius:"0 0 14px 14px"}}>
          <button onClick={onFechar} style={{padding:"8px 18px",borderRadius:7,
            border:"1px solid #E2E8F0",background:"#FFFFFF",fontSize:12,fontWeight:600,
            color:"#475569",cursor:"pointer",fontFamily:MONO}}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} style={{padding:"8px 20px",borderRadius:7,
            border:"none",background:salvando?"#CBD5E1":"#B45309",color:"#FFFFFF",
            fontSize:12,fontWeight:800,cursor:salvando?"not-allowed":"pointer",
            fontFamily:MONO,letterSpacing:"0.04em"}}>
            {salvando ? "Salvando..." : isEdicao ? "Salvar alterações" : "Cadastrar líder"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Card horizontal do líder por ala ─────────────────────────────────────────
function CardLiderAla({ lider, onEditar, onDeletar }) {
  const cor = corF(lider.faccao)
  const [confirmando, setConfirmando] = useState(false)

  return (
    <div style={{
      display:"flex", alignItems:"center", gap:14,
      padding:"12px 14px",
      background:"#FFFFFF",
      border:`1px solid ${cor.border}`,
      borderLeft:`4px solid ${cor.dot}`,
      borderRadius:10,
      boxShadow:"0 2px 6px rgba(0,0,0,0.05)",
    }}>
      {/* Foto */}
      <div style={{
        width:56, height:68, borderRadius:7, overflow:"hidden",
        background:"#1E293B", flexShrink:0,
        display:"flex", alignItems:"center", justifyContent:"center",
      }}>
        {lider.foto_ext
          ? <img src={`${API_LID}/foto/${lider.id}?t=${lider.atualizado_em}`}
              alt={lider.vulgo}
              style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"top"}}
              onError={e => { e.target.style.display="none" }}/>
          : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
        }
      </div>

      {/* Dados */}
      <div style={{flex:1, minWidth:0}}>
        <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:3, flexWrap:"wrap"}}>
          <span style={{fontSize:16, fontWeight:900, color:cor.dot, fontFamily:MONO}}>
            {lider.vulgo || "—"}
          </span>
          <span style={{fontSize:9,fontWeight:800,color:cor.text,background:cor.bg,
            border:`1px solid ${cor.border}`,padding:"2px 7px",borderRadius:3,fontFamily:MONO}}>
            {lider.faccao}
          </span>
        </div>
        {lider.nome && (
          <div style={{
            fontSize:14, fontWeight:800, color:"#1E293B",
            fontFamily:MONO, letterSpacing:"0.01em", marginBottom:4,
          }}>{lider.nome}</div>
        )}
        <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
          <span style={{fontSize:10,fontWeight:700,color:"#334155",fontFamily:MONO}}>
            {lider.cargo}
          </span>
          {lider.cela && (
            <>
              <span style={{color:"#CBD5E1",fontSize:9}}>·</span>
              <span style={{fontSize:10,color:"#64748B",fontFamily:MONO,
                background:"#F1F5F9",padding:"1px 7px",borderRadius:3}}>
                {lider.cela}
              </span>
            </>
          )}
        </div>
        {lider.observacao && (
          <div style={{fontSize:10,color:"#94A3B8",marginTop:4,fontStyle:"italic"}}>
            {lider.observacao.length > 80 ? lider.observacao.slice(0,80)+"..." : lider.observacao}
          </div>
        )}
      </div>

      {/* Ações */}
      <div style={{display:"flex",gap:5,flexShrink:0}}>
        <button onClick={() => onEditar(lider)} style={{
          width:30,height:30,borderRadius:6,border:"1px solid #E2E8F0",
          background:"#F8FAFC",cursor:"pointer",
          display:"flex",alignItems:"center",justifyContent:"center",
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        {confirmando
          ? <button onClick={() => onDeletar(lider.id)} style={{
              height:30,borderRadius:6,border:"none",padding:"0 10px",
              background:"#DC2626",cursor:"pointer",
              fontSize:9,fontWeight:800,color:"#FFF",fontFamily:MONO}}>confirmar</button>
          : <button onClick={() => setConfirmando(true)} style={{
              width:30,height:30,borderRadius:6,border:"1px solid #FECACA",
              background:"#FEF2F2",cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/>
              </svg>
            </button>
        }
      </div>
    </div>
  )
}

// ── Seção de Ala ──────────────────────────────────────────────────────────────
// Cada ala mostra seus líderes (geralmente 1) + botão para adicionar
function SecaoAla({ ala, lideres, onNovo, onEditar, onDeletar }) {
  const temLider = lideres.length > 0
  const cor      = temLider ? corF(lideres[0].faccao) : null

  return (
    <div style={{marginBottom:8}}>
      {/* Header da ala */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"7px 12px",
        background: temLider ? cor.bg : "#F8FAFC",
        border:`1px solid ${temLider ? cor.border : "#E2E8F0"}`,
        borderRadius: temLider ? "8px 8px 0 0" : 8,
        borderBottom: temLider ? "none" : undefined,
      }}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{
            width:3,height:14,borderRadius:2,
            background: temLider ? cor.dot : "#CBD5E1",
          }}/>
          <span style={{fontSize:11,fontWeight:700,color:"#334155",fontFamily:MONO}}>
            {ala}
          </span>
          <span style={{
            fontSize:9,color: temLider ? cor.text : "#94A3B8",fontFamily:MONO,
            background: temLider ? "#FFFFFF" : "#F1F5F9",
            border:`1px solid ${temLider ? cor.border : "#E2E8F0"}`,
            padding:"1px 6px",borderRadius:3,
          }}>
            {temLider ? `${lideres.length} líder` : "sem líder"}
          </span>
        </div>
        <button onClick={onNovo} style={{
          padding:"3px 10px",borderRadius:5,
          border:`1px solid ${temLider ? cor.border : "#E2E8F0"}`,
          background:"transparent",
          fontSize:9,color: temLider ? cor.text : "#64748B",
          cursor:"pointer",fontFamily:MONO,fontWeight:600,
        }}>
          {temLider ? "+ Outro" : "+ Líder"}
        </button>
      </div>

      {/* Cards dos líderes */}
      {temLider && (
        <div style={{
          border:`1px solid ${cor.border}`,borderTop:"none",
          borderRadius:"0 0 8px 8px",
          display:"flex",flexDirection:"column",gap:0,overflow:"hidden",
        }}>
          {lideres.map((l, idx) => (
            <div key={l.id} style={{borderTop: idx > 0 ? `1px solid ${cor.border}` : "none"}}>
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

  // Conta total e detecta facção dominante para colorir o header
  const todosLideres = Object.values(alas).flat()
  const total        = todosLideres.length
  const faccaoDom    = total > 0
    ? todosLideres.map(l => l.faccao)
        .sort((a,b) =>
          todosLideres.filter(l=>l.faccao===b).length -
          todosLideres.filter(l=>l.faccao===a).length
        )[0]
    : null
  const cor = corF(faccaoDom)

  return (
    <div style={{
      background:"#FFFFFF",borderRadius:10,
      border:"1px solid #E2E8F0",overflow:"hidden",
      boxShadow:"0 2px 8px rgba(0,0,0,0.04)",
    }}>
      {/* Header pavilhão */}
      <div onClick={() => setAberto(v=>!v)} style={{
        padding:"11px 16px",cursor:"pointer",
        background:"linear-gradient(135deg,#0F172A 0%,#1E293B 100%)",
        borderBottom: aberto ? `3px solid ${cor.dot||"#334155"}` : "none",
        display:"flex",alignItems:"center",justifyContent:"space-between",
      }}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{
            width:10,height:10,borderRadius:"50%",
            background: faccaoDom ? cor.dot : "#475569",
            boxShadow: faccaoDom ? `0 0 7px ${cor.dot}` : "none",
          }}/>
          <span style={{fontSize:13,fontWeight:800,color:"#FFFFFF",
            letterSpacing:"0.06em",fontFamily:MONO}}>{pavilhao}</span>
          {total > 0 && (
            <span style={{fontSize:9,color:"#94A3B8",fontFamily:MONO,
              background:"rgba(255,255,255,0.08)",padding:"2px 8px",borderRadius:4}}>
              {total} líder{total!==1?"es":""}
            </span>
          )}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={e=>{e.stopPropagation();onNovo(pavilhao)}} style={{
            padding:"4px 12px",borderRadius:5,border:"none",
            background:"#B45309",color:"#FFF",
            fontSize:10,fontWeight:800,cursor:"pointer",fontFamily:MONO,
          }}>+ Líder</button>
          <span style={{color:"#475569",fontSize:13,userSelect:"none"}}>
            {aberto?"▲":"▼"}
          </span>
        </div>
      </div>

      {/* Alas */}
      {aberto && (
        <div style={{padding:"12px 16px"}}>
          {Object.entries(alas).map(([ala, lideres]) => (
            <SecaoAla
              key={ala}
              ala={ala}
              lideres={Object.values(lideres).flat()}
              onNovo={() => onNovo(pavilhao, ala)}
              onEditar={onEditar}
              onDeletar={onDeletar}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function LiderancasUnidade({ onNavigate }) {
  const [unidade, setUnidade]   = useState("CDPM1")
  const [dados, setDados]       = useState(null)
  const [estrutura, setEstrutura] = useState({})
  const [faccoes, setFaccoes]   = useState([])
  const [cargosPorFaccao, setCargosPorFaccao] = useState({})
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(null)
  const [busca, setBusca]       = useState("")
  const [toast, setToast]       = useState(null)

  const unidadesLabel = Object.fromEntries(
    Object.entries(estrutura).map(([k,v]) => [k, v.label])
  )

  function exibirToast(msg, tipo="ok") {
    setToast({msg,tipo})
    setTimeout(() => setToast(null), 3000)
  }

  async function carregarEstrutura() {
    try {
      const d = await fetch(`${API_LID}/estrutura`).then(r=>r.json())
      setEstrutura(d.estrutura)
      setFaccoes(d.faccoes)
      setCargosPorFaccao(d.cargos_por_faccao)
    } catch {}
  }

  async function carregarDados(u=unidade) {
    setLoading(true)
    try {
      const d = await fetch(`${API_LID}/${u}`).then(r=>r.json())
      setDados(d.pavilhoes)
    } catch { setDados(null) }
    finally  { setLoading(false) }
  }

  useEffect(() => { carregarEstrutura() }, [])
  useEffect(() => { carregarDados(unidade) }, [unidade])

  async function deletar(id) {
    try {
      await fetch(`${API_LID}/${id}`, {method:"DELETE"})
      exibirToast("Líder removido.")
      carregarDados()
    } catch { exibirToast("Erro ao remover.","erro") }
  }

  function aoSalvar() {
    exibirToast("Líder salvo com sucesso!")
    setModal(null)
    carregarDados()
  }

  // Conta total de líderes
  const totalLideres = dados
    ? Object.values(dados).reduce((s,alas) =>
        s + Object.values(alas).reduce((s2,celas) =>
          s2 + Object.values(celas).reduce((s3,l) => s3+l.length, 0), 0), 0)
    : 0

  // Filtra por busca
  function filtrar(dados) {
    if (!busca || !dados) return dados
    const b = busca.toLowerCase()
    const r = {}
    for (const [pav, alas] of Object.entries(dados)) {
      r[pav] = {}
      for (const [ala, celas] of Object.entries(alas)) {
        r[pav][ala] = {}
        for (const [cela, lids] of Object.entries(celas)) {
          r[pav][ala][cela] = lids.filter(l =>
            l.vulgo?.toLowerCase().includes(b) ||
            l.nome?.toLowerCase().includes(b)  ||
            l.cargo?.toLowerCase().includes(b)
          )
        }
      }
    }
    return r
  }

  const dadosFiltrados = filtrar(dados)

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",
      background:"#F8FAFC",fontFamily:SANS,overflow:"hidden"}}>

      {/* Topbar */}
      <div style={{height:52,background:"#FFFFFF",borderBottom:"1px solid #E2E8F0",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"0 20px",flexShrink:0,boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={() => onNavigate?.("Controle de Grupos")} style={{
            background:"transparent",border:"none",cursor:"pointer",
            fontSize:18,color:"#64748B",padding:0}}>←</button>
          <div>
            <div style={{fontSize:13,fontWeight:800,color:"#0F172A"}}>
              Lideranças por Unidade
            </div>
            <div style={{fontSize:9,color:"#94A3B8",fontFamily:MONO,marginTop:1}}>
              Unidade → Pavilhão → Ala · {totalLideres} líderes cadastrados
            </div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{position:"relative"}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"
              strokeLinecap="round" style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)"}}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input value={busca} onChange={e=>setBusca(e.target.value)}
              placeholder="Buscar vulgo, nome, cargo..."
              style={{...inputStyle,paddingLeft:28,width:210,
                border:"1px solid #E2E8F0",background:"#F8FAFC"}}/>
          </div>
          <button onClick={() => setModal({pavilhao:"",ala:""})} style={{
            padding:"8px 16px",borderRadius:7,border:"none",
            background:"#B45309",color:"#FFF",
            fontSize:11,fontWeight:800,cursor:"pointer",fontFamily:MONO,
            letterSpacing:"0.04em",display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:16,lineHeight:1}}>+</span> Novo líder
          </button>
        </div>
      </div>

      {/* Abas de unidade */}
      <div style={{display:"flex",gap:4,padding:"10px 20px",
        background:"#FFFFFF",borderBottom:"1px solid #E2E8F0",
        flexShrink:0,overflowX:"auto"}}>
        {Object.entries(unidadesLabel).map(([key,label]) => (
          <button key={key} onClick={() => setUnidade(key)} style={{
            background: unidade===key ? "#0F172A" : "#F1F5F9",
            border: unidade===key ? "none" : "1px solid #E2E8F0",
            borderRadius:8, cursor:"pointer", padding:"8px 20px",
            fontSize:12, fontWeight: unidade===key ? 800 : 600,
            color: unidade===key ? "#FFFFFF" : "#475569",
            fontFamily:MONO, letterSpacing:"0.05em",
            transition:"all 0.15s", whiteSpace:"nowrap",
            boxShadow: unidade===key ? "0 2px 8px rgba(15,23,42,0.3)" : "none",
          }}>{label}</button>
        ))}
      </div>

      {/* Corpo */}
      <div style={{flex:1,overflow:"auto",padding:"16px 20px"}}>
        {loading ? (
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",
            height:200,gap:10}}>
            <svg style={{animation:"spin 1s linear infinite"}} width="22" height="22"
              viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            <span style={{fontSize:11,color:"#94A3B8",fontFamily:MONO}}>Carregando...</span>
          </div>
        ) : dadosFiltrados ? (
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {Object.entries(dadosFiltrados).map(([pav,alas]) => (
              <SecaoPavilhao
                key={pav}
                pavilhao={pav}
                alas={alas}
                onNovo={(p,a) => setModal({pavilhao:p,ala:a||""})}
                onEditar={l => setModal({lider:l})}
                onDeletar={deletar}
              />
            ))}
          </div>
        ) : (
          <div style={{textAlign:"center",padding:60,color:"#94A3B8",fontFamily:MONO,fontSize:12}}>
            Backend offline ou sem dados.
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <ModalLider
          lider={modal.lider||null}
          estrutura={estrutura}
          faccoes={faccoes}
          cargosPorFaccao={cargosPorFaccao}
          unidadeAtiva={unidade}
          pavilhaoInicial={modal.pavilhao}
          alaInicial={modal.ala}
          onSalvar={aoSalvar}
          onFechar={() => setModal(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{position:"fixed",bottom:24,right:24,
          padding:"10px 18px",borderRadius:8,
          background:toast.tipo==="erro"?"#DC2626":"#0F172A",
          color:"#FFF",fontSize:12,fontWeight:700,
          fontFamily:MONO,boxShadow:"0 4px 20px rgba(0,0,0,0.3)",
          zIndex:2000,animation:"fadeUp 0.2s ease"}}>
          {toast.tipo==="erro"?"✗ ":"✓ "}{toast.msg}
        </div>
      )}

      <style>{`
        @keyframes spin   { to { transform:rotate(360deg) } }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  )
}
