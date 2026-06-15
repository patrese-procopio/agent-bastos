import { useState, useRef, useEffect } from "react"
import api from "./api"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const C = {
  bg:         "#0B1120",
  surface:    "#111827",
  surfaceUp:  "#1A2236",
  surfaceMid: "#162032",
  border:     "rgba(255,255,255,0.07)",
  borderUp:   "rgba(255,255,255,0.13)",
  gold:       "#E8A020",
  goldSoft:   "rgba(232,160,32,0.10)",
  goldBorder: "rgba(232,160,32,0.28)",
  text:       "#F1F5F9",
  textMid:    "#94A3B8",
  textDim:    "rgba(255,255,255,0.35)",
  red:        "#EF4444",
  redSoft:    "rgba(239,68,68,0.12)",
  green:      "#4ADE80",
  blue:       "#60A5FA",
  blueSoft:   "rgba(96,165,250,0.10)",
}

const GLOBAL_CSS = `
  @keyframes fadeUp   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin      { to{transform:rotate(360deg)} }
  @keyframes glow-pulse { 0%,100%{box-shadow:0 0 4px 1px rgba(232,160,32,0.3)} 50%{box-shadow:0 0 12px 3px rgba(232,160,32,0.6)} }
  .o-fade  { animation: fadeUp 0.3s ease forwards; }
  .o-spin  { animation: spin 0.9s linear infinite; }
  .o-glow  { animation: glow-pulse 2s ease infinite; }
  .o-row:hover  { background: rgba(232,160,32,0.05) !important; }
  .o-tab:hover  { background: rgba(255,255,255,0.05) !important; }
  .o-chip:hover { background: rgba(232,160,32,0.12) !important; border-color: rgba(232,160,32,0.4) !important; }
  .o-btn-pdf:hover { background: #E8A020 !important; color: #0B1120 !important; }
  input::placeholder { color: rgba(255,255,255,0.25) !important; }
  select option { background: #1A2236; color: #F1F5F9; }
  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
`

const RISCO = {
  alto:    { border:"#EF4444", badge:"#EF4444", badgeBg:"rgba(239,68,68,0.15)",  text:"#FCA5A5", label:"▲ ALTO"     },
  critico: { border:"#DC2626", badge:"#DC2626", badgeBg:"rgba(220,38,38,0.18)",  text:"#FCA5A5", label:"⚠ CRÍTICO"  },
  medio:   { border:"#E8A020", badge:"#E8A020", badgeBg:"rgba(232,160,32,0.12)", text:"#FCD34D", label:"● MÉDIO"    },
  baixo:   { border:"#4ADE80", badge:"#4ADE80", badgeBg:"rgba(74,222,128,0.10)", text:"#86EFAC", label:"✓ BAIXO"    },
  sem_dado:{ border:C.border,  badge:C.textMid, badgeBg:"rgba(255,255,255,0.06)",text:C.textMid, label:"— SEM DADO" },
}

const FINALIDADES = [
  { value:"seguranca_publica",         label:"Segurança Pública"       },
  { value:"investigacao_interna",      label:"Investigação Interna"    },
  { value:"due_diligence_corporativa", label:"Due Diligence"           },
  { value:"compliance_regulatorio",    label:"Compliance Regulatório"  },
  { value:"prevencao_fraude",          label:"Prevenção de Fraude"     },
]

const FONTES = [
  { key:"datajud",        label:"DataJud",  icon:"⚖" },
  { key:"cnpj_ws",        label:"CNPJ.ws",  icon:"🏢" },
  { key:"brasil_io",      label:"Brasil.io", icon:"📊" },
  { key:"diario_oficial", label:"D.O.U.",   icon:"📋" },
  { key:"gnews",          label:"GNews",    icon:"📰" },
]

const TRIBUNAIS = [
  { value: "",     label: "Auto-detectar pelo número CNJ" },
  { value: "tjam", label: "TJAM — Amazonas" },
  { value: "tjsp", label: "TJSP — São Paulo" },
  { value: "tjrj", label: "TJRJ — Rio de Janeiro" },
  { value: "tjmg", label: "TJMG — Minas Gerais" },
  { value: "tjrs", label: "TJRS — Rio Grande do Sul" },
  { value: "tjba", label: "TJBA — Bahia" },
  { value: "tjpr", label: "TJPR — Paraná" },
  { value: "tjsc", label: "TJSC — Santa Catarina" },
  { value: "stj",  label: "STJ — Superior Tribunal de Justiça" },
  { value: "stf",  label: "STF — Supremo Tribunal Federal" },
  { value: "trf1", label: "TRF1 — Tribunal Regional Federal 1" },
  { value: "trf2", label: "TRF2 — Tribunal Regional Federal 2" },
  { value: "trf3", label: "TRF3 — Tribunal Regional Federal 3" },
]

function cpfMask(v) {
  return v.replace(/\D/g,"").slice(0,11)
    .replace(/(\d{3})(\d)/,"$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/,"$1.$2.$3")
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/,"$1.$2.$3-$4")
}

// Formata número CNJ: NNNNNNN-DD.AAAA.J.TT.OOOO (20 dígitos)
function cnjMask(v) {
  const digits = v.replace(/\D/g,"").slice(0,20)
  if (digits.length <= 7)  return digits
  if (digits.length <= 9)  return `${digits.slice(0,7)}-${digits.slice(7)}`
  if (digits.length <= 13) return `${digits.slice(0,7)}-${digits.slice(7,9)}.${digits.slice(9)}`
  if (digits.length <= 14) return `${digits.slice(0,7)}-${digits.slice(7,9)}.${digits.slice(9,13)}.${digits.slice(13)}`
  if (digits.length <= 16) return `${digits.slice(0,7)}-${digits.slice(7,9)}.${digits.slice(9,13)}.${digits.slice(13,14)}.${digits.slice(14)}`
  return `${digits.slice(0,7)}-${digits.slice(7,9)}.${digits.slice(9,13)}.${digits.slice(13,14)}.${digits.slice(14,16)}.${digits.slice(16)}`
}

// ── Ícones ────────────────────────────────────────────────────────────────────
const Ico = ({ d, size=13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d}/>
  </svg>
)
const IcoSearch   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const IcoDownload = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
const IcoAlert    = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
const IcoClock    = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
const IcoGavel    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 13l-7.586 7.586a2 2 0 1 1-2.828-2.828L11.172 10.172"/><path d="M16 16l4-4"/><path d="M8 8l4-4"/><path d="M12 12L8 8m4 4l4 4"/></svg>

// ── StatBadge ─────────────────────────────────────────────────────────────────
const StatBadge = ({ label, value, accent=false }) => (
  <div style={{textAlign:"center",padding:"10px 16px",background:C.surfaceUp,borderRadius:8,border:`1px solid ${accent&&value>0?C.goldBorder:C.border}`,minWidth:80,flex:1}}>
    <div style={{fontSize:28,fontWeight:800,color:accent&&value>0?C.gold:C.text,fontFamily:MONO,lineHeight:1}}>{value}</div>
    <div style={{fontSize:10,fontWeight:700,color:C.textDim,letterSpacing:"0.06em",textTransform:"uppercase",marginTop:5,fontFamily:MONO}}>{label}</div>
  </div>
)

// ── Tabela dark ───────────────────────────────────────────────────────────────
const Tabela = ({ cols, rows, gridCols }) => (
  <div style={{borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`}}>
    <div style={{display:"grid",gridTemplateColumns:gridCols,background:"rgba(0,0,0,0.3)"}}>
      {cols.map(c=><div key={c} style={{padding:"7px 12px",fontSize:10,fontWeight:700,color:C.textDim,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:MONO}}>{c}</div>)}
    </div>
    {rows.length===0
      ? <div style={{padding:"16px 12px",fontSize:11,color:C.textDim,fontStyle:"italic",fontFamily:MONO,background:C.surfaceMid}}>Nenhum registro encontrado</div>
      : rows.map((r,i)=>(
        <div key={i} className="o-row" style={{display:"grid",gridTemplateColumns:gridCols,background:i%2===0?C.surfaceMid:"transparent",borderTop:`1px solid ${C.border}`,transition:"background 0.12s"}}>
          {r.map((c,j)=><div key={j} style={{padding:"7px 12px",fontSize:13,color:j===0?C.text:C.textMid,fontFamily:j===0?MONO:SANS,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c||"—"}</div>)}
        </div>
      ))
    }
  </div>
)

// ── Label de seção ────────────────────────────────────────────────────────────
const SecLabel = ({ children, color=C.gold }) => (
  <div style={{fontSize:11,fontWeight:700,color,fontFamily:MONO,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
    <span style={{width:16,height:1,background:color,display:"inline-block",opacity:0.6}}/>
    {children}
  </div>
)

export default function OsintPesquisa({ onNavigate }) {
  const [nome,       setNome]       = useState("")
  const [cpf,        setCpf]        = useState("")
  const [finalidade, setFinalidade] = useState("seguranca_publica")
  const [operador,   setOperador]   = useState("agente_001")
  const [loading,    setLoading]    = useState(false)
  const [erro,       setErro]       = useState("")
  const [resultado,  setResultado]  = useState(null)
  const [relatorio,  setRelatorio]  = useState(null)
  const [activeTab,  setActiveTab]  = useState("sumario")
  const [dlLoading,  setDlLoading]  = useState(false)

  // ── State da aba "Processo" ─────────────────────────────────────────────────
  const [numProc,       setNumProc]       = useState("")
  const [tribunalProc,  setTribunalProc]  = useState("")
  const [procLoading,   setProcLoading]   = useState(false)
  const [procErro,      setProcErro]      = useState("")
  const [procResultado, setProcResultado] = useState(null)

  const resultRef = useRef(null)

  useEffect(() => {
    const s = document.createElement("style")
    s.textContent = GLOBAL_CSS
    document.head.appendChild(s)
    return () => document.head.removeChild(s)
  }, [])

  useEffect(() => {
    if (resultado) resultRef.current?.scrollIntoView({ behavior:"smooth", block:"start" })
  }, [resultado])

  async function pesquisar() {
    if (!nome.trim() && !cpf.trim()) { setErro("Informe nome ou CPF para pesquisar."); return }
    setErro(""); setLoading(true); setResultado(null); setRelatorio(null)
    try {
      const res = await api.post("/osint/pesquisar", {
        operator_id: operador||"agente_anonimo",
        lgpd_purpose: finalidade,
        nome: nome.trim()||undefined,
        cpf: cpf.replace(/\D/g,"")||undefined,
      })
      const data = await res.json()
      if (!res.ok) { setErro(data.detail||"Erro na pesquisa."); return }
      setResultado(data)
      const r2 = await api.get(`/osint/relatorio/${data.report_id}`)
      if (r2.ok) setRelatorio(await r2.json())
    } catch {
      setErro("Falha de conexão com o backend.")
    } finally {
      setLoading(false)
    }
  }

  async function consultarProcesso() {
    const numeroLimpo = numProc.replace(/\D/g,"")
    if (!numeroLimpo) {
      setProcErro("Informe o número do processo.")
      return
    }
    setProcErro(""); setProcLoading(true); setProcResultado(null)
    try {
      const path = tribunalProc
        ? `/osint/processo/${numeroLimpo}?tribunal=${tribunalProc}`
        : `/osint/processo/${numeroLimpo}`
      const res = await api.get(path)
      const data = await res.json()
      if (!res.ok) {
        setProcErro(data.detail||"Erro ao consultar processo.")
        return
      }
      setProcResultado(data)
    } catch {
      setProcErro("Falha de conexão com o backend.")
    } finally {
      setProcLoading(false)
    }
  }

  async function baixarPdf() {
    if (!resultado?.report_id) return
    setDlLoading(true)
    try {
      const res = await api.get(`/osint/relatorio/${resultado.report_id}/pdf`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `osint_${resultado.subject_name?.replace(/ /g,"_")||resultado.report_id.slice(0,8)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally { setDlLoading(false) }
  }

  function limpar() {
    setNome(""); setCpf(""); setResultado(null); setRelatorio(null); setErro(""); setActiveTab("sumario")
    setNumProc(""); setTribunalProc(""); setProcResultado(null); setProcErro("")
  }

  const risco = resultado ? (RISCO[resultado.risk_level]||RISCO.sem_dado) : null

  const TABS = [
    {key:"sumario",   label:"Sumário"   },
    {key:"processos", label:"Processos" },
    {key:"empresas",  label:"Empresas"  },
    {key:"timeline",  label:"Timeline"  },
    {key:"grafo",     label:"Grafo"     },
    {key:"processo",  label:"Processo CNJ" },
  ]

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:C.bg,overflow:"hidden",fontFamily:SANS,color:C.text}}>

      {/* ── TOPBAR ── */}
      <header style={{height:44,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px",background:C.surface,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{display:"flex",gap:5,marginRight:4}}>
            {["#FF5F57","#FEBC2E","#28C840"].map(c=><div key={c} style={{width:11,height:11,borderRadius:"50%",background:c}}/>)}
          </div>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:C.text}}>Pesquisa OSINT</div>
            <div style={{fontSize:11,color:C.textMid,fontFamily:MONO,marginTop:1}}>Inteligência de Pessoas · Fontes Públicas</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 12px",background:"rgba(74,222,128,0.08)",borderRadius:20,border:"1px solid rgba(74,222,128,0.2)"}}>
          <div className="o-glow" style={{width:6,height:6,borderRadius:"50%",background:C.green}}/>
          <span style={{fontSize:11,color:C.green,fontWeight:600,fontFamily:MONO}}>LGPD · Art. 37</span>
        </div>
      </header>

      <div style={{flex:1,overflowY:"auto",padding:"16px 20px",display:"flex",flexDirection:"column",gap:14}}>

        {/* ── FORMULÁRIO ── */}
        <section style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,padding:"16px 18px"}}>

          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,paddingBottom:10,borderBottom:`1px solid ${C.border}`}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:12,fontWeight:700,color:C.gold,fontFamily:MONO,letterSpacing:"0.08em"}}>◈ IDENTIFICAÇÃO DO SUJEITO</span>
            </div>
            <span style={{fontSize:11,color:C.textDim,fontFamily:MONO}}>nome e/ou CPF</span>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.textMid,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:6,fontFamily:MONO}}>Nome Completo</label>
              <input style={S.input} placeholder="Ex: João Silva Santos" value={nome} onChange={e=>setNome(e.target.value)} onKeyDown={e=>e.key==="Enter"&&pesquisar()}/>
            </div>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.textMid,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:6,fontFamily:MONO}}>CPF</label>
              <input style={S.input} placeholder="000.000.000-00" value={cpf} onChange={e=>setCpf(cpfMask(e.target.value))} onKeyDown={e=>e.key==="Enter"&&pesquisar()} maxLength={14}/>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.textMid,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:6,fontFamily:MONO}}>Finalidade LGPD <span style={{color:C.red}}>*</span></label>
              <select style={S.select} value={finalidade} onChange={e=>setFinalidade(e.target.value)}>
                {FINALIDADES.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.textMid,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:6,fontFamily:MONO}}>ID do Operador <span style={{color:C.red}}>*</span></label>
              <input style={S.input} placeholder="Ex: agente_001" value={operador} onChange={e=>setOperador(e.target.value)}/>
            </div>
          </div>

          <div style={{marginBottom:14}}>
            <label style={{display:"block",fontSize:8,fontWeight:700,color:C.textMid,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6,fontFamily:MONO}}>Fontes Ativas</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {FONTES.map(f=>(
                <div key={f.key} className="o-chip" style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:6,background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,cursor:"default",transition:"all 0.12s"}}>
                  <span style={{fontSize:11}}>{f.icon}</span>
                  <span style={{fontSize:11,fontWeight:600,color:C.textMid,fontFamily:MONO}}>{f.label}</span>
                </div>
              ))}
            </div>
          </div>

          {erro && (
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:C.redSoft,border:"1px solid rgba(239,68,68,0.25)",borderRadius:7,marginBottom:12,color:C.red}}>
              <IcoAlert/><span style={{fontSize:11,fontWeight:500}}>{erro}</span>
            </div>
          )}

          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            {resultado && (
              <button style={S.btnSecondary} onClick={limpar}>Nova pesquisa</button>
            )}
            <button style={{...S.btnPrimary,...(loading?{opacity:0.55,cursor:"not-allowed"}:{})}} onClick={pesquisar} disabled={loading}>
              {loading
                ? <><span className="o-spin" style={{display:"inline-block",width:11,height:11,border:"2px solid rgba(11,17,32,0.3)",borderTopColor:C.bg,borderRadius:"50%"}}/> Pesquisando...</>
                : <><IcoSearch/> Pesquisar</>
              }
            </button>
          </div>
        </section>

        {/* ── RESULTADO ── */}
        {resultado && (
          <div ref={resultRef} className="o-fade" style={{display:"flex",flexDirection:"column",gap:12}}>

            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",background:C.surface,borderRadius:10,border:`1px solid ${risco.border}30`,flexWrap:"wrap",gap:10}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{padding:"5px 14px",background:risco.badgeBg,border:`1px solid ${risco.border}50`,borderRadius:6}}>
                  <span style={{fontSize:15,fontWeight:800,color:risco.badge,letterSpacing:"0.06em",fontFamily:MONO}}>{risco.label}</span>
                </div>
                <div>
                  <div style={{fontSize:18,fontWeight:700,color:C.text}}>{resultado.subject_name}</div>
                  <div style={{fontSize:12,color:C.textMid,fontFamily:MONO,marginTop:2}}>
                    CPF: {resultado.subject_cpf_masked} · REL: {resultado.report_id.slice(0,8).toUpperCase()}
                  </div>
                </div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <div style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:C.textDim,fontFamily:MONO}}>
                  <IcoClock/>{resultado.execution_time_ms?`${(resultado.execution_time_ms/1000).toFixed(1)}s`:"—"}
                </div>
                <button className="o-btn-pdf" onClick={baixarPdf} disabled={dlLoading} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",background:"transparent",border:`1px solid ${C.goldBorder}`,borderRadius:6,color:C.gold,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:MONO,transition:"all 0.15s"}}>
                  <IcoDownload/>{dlLoading?"gerando...":"PDF"}
                </button>
              </div>
            </div>

            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <StatBadge label="Processos Criminais" value={resultado.total_processos} accent/>
              <StatBadge label="Mandados Ativos"     value={resultado.tem_mandado_ativo?1:0} accent/>
              <StatBadge label="Empresas"            value={resultado.total_empresas}/>
              <StatBadge label="Notícias"            value={resultado.total_noticias}/>
              <StatBadge label="D.O.U."              value={resultado.total_dou}/>
              <StatBadge label="Nós no Grafo"        value={resultado.nos_grafo}/>
            </div>

            {resultado.fontes_com_erro?.length>0 && (
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 14px",background:"rgba(232,160,32,0.06)",border:`1px solid ${C.goldBorder}`,borderRadius:7,flexWrap:"wrap"}}>
                <span style={{fontSize:11,fontWeight:700,color:C.gold,fontFamily:MONO,flexShrink:0}}>FONTES INDISPONÍVEIS:</span>
                {resultado.fontes_com_erro.map(f=>(
                  <span key={f} style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:3,background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.25)",color:C.red,fontFamily:MONO}}>{f}</span>
                ))}
              </div>
            )}

            {relatorio && (
              <section style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden"}}>

                <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:"rgba(0,0,0,0.2)"}}>
                  {TABS.map(t=>(
                    <button key={t.key} className="o-tab" onClick={()=>setActiveTab(t.key)} style={{
                      padding:"10px 18px",border:"none",background:"transparent",cursor:"pointer",
                      borderBottom:activeTab===t.key?`2px solid ${C.gold}`:"2px solid transparent",
                      color:activeTab===t.key?C.gold:C.textMid,
                      fontWeight:activeTab===t.key?700:400,
                      fontSize:13,fontFamily:SANS,transition:"all 0.12s",
                    }}>{t.label}</button>
                  ))}
                </div>

                <div style={{padding:"16px 18px"}}>

                  {/* Sumário */}
                  {activeTab==="sumario" && (
                    <div className="o-fade" style={{display:"flex",flexDirection:"column",gap:12}}>
                      {relatorio.risk_summary && (
                        <div style={{padding:"12px 14px",background:C.surfaceMid,borderRadius:8,border:`1px solid ${C.border}`,borderLeft:`3px solid ${C.gold}`}}>
                          <div style={{fontSize:12,fontWeight:700,color:C.gold,fontFamily:MONO,marginBottom:8,letterSpacing:"0.1em"}}>◈ ANÁLISE IA — GROQ · {relatorio.lgpd_purpose}</div>
                          <p style={{fontSize:14,color:C.text,lineHeight:1.8,margin:0}}>{relatorio.risk_summary}</p>
                        </div>
                      )}
                      {relatorio.risk_indicators?.length>0 && (
                        <div>
                          <SecLabel>Indicadores de Risco</SecLabel>
                          <div style={{display:"flex",flexDirection:"column",gap:5}}>
                            {relatorio.risk_indicators.map((ind,i)=>(
                              <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:C.redSoft,border:"1px solid rgba(239,68,68,0.2)",borderRadius:6,color:C.red}}>
                                <IcoAlert/><span style={{fontSize:14,fontWeight:500,color:"#FCA5A5"}}>{ind}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Processos */}
                  {activeTab==="processos" && (
                    <div className="o-fade" style={{display:"flex",flexDirection:"column",gap:14}}>
                      {relatorio.mandados_prisao?.length>0 && (
                        <div>
                          <SecLabel color={C.red}>⚠ Mandados de Prisão</SecLabel>
                          <Tabela cols={["Nº Mandado","Tipo","Status","Data"]} rows={relatorio.mandados_prisao.map(m=>[m.numero,m.tipo,m.status,m.data_expedicao])} gridCols="2fr 1.5fr 1fr 1.2fr"/>
                        </div>
                      )}
                      <div>
                        <SecLabel>Processos Criminais</SecLabel>
                        <Tabela cols={["Nº Processo","Tribunal","Crime/Classe","Data","Status"]} rows={(relatorio.processos_criminais||[]).map(p=>[p.numero,p.tribunal,(p.assuntos||[]).join(", "),p.data_ajuizamento||p.data,p.status])} gridCols="2.2fr 1fr 2fr 1fr 1fr"/>
                      </div>
                      <div>
                        <SecLabel>Processos Cíveis</SecLabel>
                        <Tabela cols={["Nº Processo","Tribunal","Assunto","Data"]} rows={(relatorio.processos_civeis||[]).map(p=>[p.numero,p.tribunal,(p.assuntos||[]).join(", "),p.data_ajuizamento||p.data])} gridCols="2.2fr 1fr 2.5fr 1fr"/>
                      </div>
                    </div>
                  )}

                  {/* Empresas */}
                  {activeTab==="empresas" && (
                    <div className="o-fade" style={{display:"flex",flexDirection:"column",gap:14}}>
                      <div>
                        <SecLabel>Vínculos Empresariais</SecLabel>
                        <Tabela cols={["CNPJ","Razão Social","Qualificação","Situação","UF"]} rows={(relatorio.vinculos_empresariais||[]).map(e=>[e.cnpj,e.razao_social,e.qualificacao,e.situacao,e.uf])} gridCols="1.6fr 2fr 1.4fr 1fr 0.5fr"/>
                      </div>
                      {relatorio.mencoes_dou?.length>0 && (
                        <div>
                          <SecLabel>Diário Oficial da União</SecLabel>
                          <Tabela cols={["Data","Tipo","Órgão","Título"]} rows={relatorio.mencoes_dou.map(d=>[d.data,d.tipo,d.orgao,d.titulo])} gridCols="0.8fr 1fr 1.2fr 3fr"/>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Timeline */}
                  {activeTab==="timeline" && (
                    <div className="o-fade" style={{display:"flex",flexDirection:"column",gap:6}}>
                      <SecLabel>Linha do Tempo</SecLabel>
                      {[
                        ...(relatorio.processos_criminais||[]).map(p=>({data:p.data_ajuizamento||p.data,tipo:"PROCESSO CRIMINAL",desc:p.classe||"Processo",cor:C.red,bg:"rgba(239,68,68,0.08)"})),
                        ...(relatorio.mandados_prisao||[]).map(m=>({data:m.data_expedicao,tipo:"MANDADO PRISÃO",desc:m.tipo,cor:"#DC2626",bg:"rgba(220,38,38,0.1)"})),
                        ...(relatorio.mencoes_midia||[]).map(n=>({data:n.data?.slice(0,10),tipo:"MÍDIA",desc:n.titulo,cor:C.blue,bg:C.blueSoft})),
                        ...(relatorio.mencoes_dou||[]).map(d=>({data:d.data,tipo:"D.O.U.",desc:d.titulo,cor:C.green,bg:"rgba(74,222,128,0.08)"})),
                      ].filter(e=>e.data).sort((a,b)=>b.data.localeCompare(a.data)).map((e,i)=>(
                        <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"8px 12px",background:e.bg,border:`1px solid ${e.cor}20`,borderRadius:7,borderLeft:`3px solid ${e.cor}`}}>
                          <span style={{fontSize:12,fontWeight:700,color:e.cor,fontFamily:MONO,flexShrink:0,minWidth:90}}>{e.data}</span>
                          <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:3,background:`${e.cor}22`,color:e.cor,fontFamily:MONO,flexShrink:0}}>{e.tipo}</span>
                          <span style={{fontSize:13,color:C.textMid,lineHeight:1.5}}>{e.desc}</span>
                        </div>
                      ))}
                      {![...(relatorio.processos_criminais||[]),...(relatorio.mencoes_midia||[]),...(relatorio.mencoes_dou||[])].some(e=>e.data||e.data_ajuizamento) && (
                        <div style={{fontSize:13,color:C.textDim,fontStyle:"italic",fontFamily:MONO,padding:"16px 0"}}>Nenhum evento com data identificado.</div>
                      )}
                    </div>
                  )}

                  {/* Grafo */}
                  {activeTab==="grafo" && (
                    <div className="o-fade">
                      {relatorio.graph?.nodes?.length>0 ? (
                        <>
                          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                            <div style={{padding:"4px 12px",background:C.goldSoft,border:`1px solid ${C.goldBorder}`,borderRadius:6}}>
                              <span style={{fontSize:11,fontWeight:700,color:C.gold,fontFamily:MONO}}>◈ NÓ CENTRAL</span>
                            </div>
                            <span style={{fontSize:16,fontWeight:700,color:C.text}}>{relatorio.graph.nodes.find(n=>n.is_subject)?.label}</span>
                            <span style={{fontSize:9,color:C.textDim,fontFamily:MONO,marginLeft:"auto"}}>{relatorio.graph.nodes.length} nós · {relatorio.graph.edges.length} arestas</span>
                          </div>
                          <Tabela
                            cols={["Entidade","Tipo","Relação","Fonte"]}
                            rows={relatorio.graph.edges.map(e=>{
                              const t=relatorio.graph.nodes.find(n=>n.node_id===e.target_id)
                              return [t?.label,t?.node_type?.toUpperCase(),e.edge_type?.replace(/_/g," ").toUpperCase(),e.data_source]
                            }).filter(r=>r[0])}
                            gridCols="2.5fr 1fr 1.5fr 1fr"
                          />
                        </>
                      ) : (
                        <div style={{fontSize:13,color:C.textDim,fontStyle:"italic",fontFamily:MONO,padding:"16px 0"}}>Grafo não disponível.</div>
                      )}
                    </div>
                  )}

                  {/* ── NOVA ABA: Processo CNJ ───────────────────────────── */}
                  {activeTab==="processo" && (
                    <div className="o-fade" style={{display:"flex",flexDirection:"column",gap:14}}>

                      {/* Formulário de consulta */}
                      <div style={{padding:"12px 14px",background:C.surfaceMid,borderRadius:8,border:`1px solid ${C.border}`,borderLeft:`3px solid ${C.gold}`}}>
                        <div style={{fontSize:12,fontWeight:700,color:C.gold,fontFamily:MONO,marginBottom:10,letterSpacing:"0.1em"}}>◈ APROFUNDAMENTO POR NÚMERO CNJ</div>
                        <p style={{fontSize:12,color:C.textMid,lineHeight:1.6,margin:"0 0 12px 0"}}>
                          Consulta direta ao DataJud (CNJ). Informe o número do processo para obter a ficha completa com movimentações, classe, órgão julgador e datas.
                        </p>

                        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10,marginBottom:10}}>
                          <div>
                            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.textMid,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:6,fontFamily:MONO}}>Número do Processo</label>
                            <input
                              style={S.input}
                              placeholder="0000000-00.0000.0.00.0000"
                              value={numProc}
                              onChange={e=>setNumProc(cnjMask(e.target.value))}
                              onKeyDown={e=>e.key==="Enter"&&consultarProcesso()}
                              maxLength={25}
                            />
                          </div>
                          <div>
                            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.textMid,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:6,fontFamily:MONO}}>Tribunal</label>
                            <select style={S.select} value={tribunalProc} onChange={e=>setTribunalProc(e.target.value)}>
                              {TRIBUNAIS.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </div>
                        </div>

                        {procErro && (
                          <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:C.redSoft,border:"1px solid rgba(239,68,68,0.25)",borderRadius:7,marginBottom:10,color:C.red}}>
                            <IcoAlert/><span style={{fontSize:11,fontWeight:500}}>{procErro}</span>
                          </div>
                        )}

                        <div style={{display:"flex",justifyContent:"flex-end"}}>
                          <button
                            style={{...S.btnPrimary,...(procLoading?{opacity:0.55,cursor:"not-allowed"}:{})}}
                            onClick={consultarProcesso}
                            disabled={procLoading}
                          >
                            {procLoading
                              ? <><span className="o-spin" style={{display:"inline-block",width:11,height:11,border:"2px solid rgba(11,17,32,0.3)",borderTopColor:C.bg,borderRadius:"50%"}}/> Consultando DataJud...</>
                              : <><IcoGavel/> Consultar Processo</>
                            }
                          </button>
                        </div>
                      </div>

                      {/* Resultado da consulta */}
                      {procResultado && procResultado.numero && !procResultado.mensagem && (
                        <div className="o-fade" style={{display:"flex",flexDirection:"column",gap:12}}>

                          {/* Header do processo */}
                          <div style={{padding:"12px 14px",background:C.surface,borderRadius:8,border:`1px solid ${procResultado.is_criminal?"rgba(239,68,68,0.3)":C.border}`,borderLeft:`3px solid ${procResultado.is_criminal?C.red:C.gold}`}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                              {procResultado.is_criminal && (
                                <span style={{fontSize:10,fontWeight:800,padding:"3px 8px",background:C.redSoft,border:"1px solid rgba(239,68,68,0.3)",borderRadius:4,color:C.red,fontFamily:MONO,letterSpacing:"0.08em"}}>⚠ CRIMINAL</span>
                              )}
                              <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",background:C.goldSoft,border:`1px solid ${C.goldBorder}`,borderRadius:4,color:C.gold,fontFamily:MONO}}>{procResultado.tribunal}</span>
                              <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:4,color:C.textMid,fontFamily:MONO}}>{procResultado.grau}</span>
                              {procResultado.nivel_sigilo > 0 && (
                                <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",background:"rgba(220,38,38,0.15)",border:"1px solid rgba(220,38,38,0.3)",borderRadius:4,color:"#FCA5A5",fontFamily:MONO}}>SIGILO {procResultado.nivel_sigilo}</span>
                              )}
                            </div>
                            <div style={{fontSize:16,fontWeight:700,color:C.text,fontFamily:MONO,marginBottom:4}}>{procResultado.numero}</div>
                            <div style={{fontSize:14,color:C.textMid,marginBottom:2}}>{procResultado.classe}</div>
                            <div style={{fontSize:12,color:C.textDim,fontFamily:MONO}}>{procResultado.orgao_julgador}</div>
                          </div>

                          {/* Metadados */}
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                            <div style={{padding:"10px 12px",background:C.surfaceUp,borderRadius:7,border:`1px solid ${C.border}`}}>
                              <div style={{fontSize:10,fontWeight:700,color:C.textDim,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:MONO,marginBottom:4}}>Data de Ajuizamento</div>
                              <div style={{fontSize:13,color:C.text,fontFamily:MONO}}>{procResultado.data_ajuizamento||"—"}</div>
                            </div>
                            <div style={{padding:"10px 12px",background:C.surfaceUp,borderRadius:7,border:`1px solid ${C.border}`}}>
                              <div style={{fontSize:10,fontWeight:700,color:C.textDim,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:MONO,marginBottom:4}}>Última Atualização</div>
                              <div style={{fontSize:13,color:C.text,fontFamily:MONO}}>{procResultado.ultima_atualizacao||"—"}</div>
                            </div>
                            <div style={{padding:"10px 12px",background:C.surfaceUp,borderRadius:7,border:`1px solid ${C.border}`}}>
                              <div style={{fontSize:10,fontWeight:700,color:C.textDim,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:MONO,marginBottom:4}}>Movimentações</div>
                              <div style={{fontSize:13,color:C.text,fontFamily:MONO}}>{procResultado.movimentos?.length||0}</div>
                            </div>
                          </div>

                          {/* Assuntos */}
                          {procResultado.assuntos?.length>0 && (
                            <div>
                              <SecLabel>Assuntos</SecLabel>
                              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                                {procResultado.assuntos.map((a,i)=>(
                                  <span key={i} style={{fontSize:12,padding:"4px 10px",background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:6,color:C.textMid,fontFamily:MONO}}>{a}</span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Movimentações */}
                          {procResultado.movimentos?.length>0 && (
                            <div>
                              <SecLabel>Movimentações Processuais</SecLabel>
                              <Tabela
                                cols={["Data","Movimentação","Órgão Julgador"]}
                                rows={procResultado.movimentos.map(m=>[m.data,m.nome,m.orgao_julgador])}
                                gridCols="1fr 2fr 3fr"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Processo não encontrado */}
                      {procResultado && procResultado.mensagem && (
                        <div style={{padding:"14px 16px",background:"rgba(232,160,32,0.06)",border:`1px solid ${C.goldBorder}`,borderRadius:8,display:"flex",alignItems:"center",gap:10}}>
                          <IcoAlert/>
                          <div>
                            <div style={{fontSize:13,fontWeight:700,color:C.gold,fontFamily:MONO,marginBottom:2}}>PROCESSO NÃO LOCALIZADO</div>
                            <div style={{fontSize:12,color:C.textMid}}>
                              {procResultado.mensagem}
                              {procResultado.tribunais_consultados?.length>0 && (
                                <> · Tribunais consultados: <span style={{color:C.text,fontFamily:MONO}}>{procResultado.tribunais_consultados.join(", ")}</span></>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}

            <div style={{padding:"8px 14px",background:C.surfaceMid,border:`1px solid ${C.border}`,borderRadius:7,display:"flex",gap:8,alignItems:"flex-start"}}>
              <span style={{fontSize:11,fontWeight:700,color:C.gold,fontFamily:MONO,flexShrink:0,marginTop:1,letterSpacing:"0.08em"}}>LGPD · ART.37</span>
              <span style={{fontSize:12,color:C.textDim,lineHeight:1.6,fontFamily:MONO}}>
                operador: <span style={{color:C.textMid}}>{operador}</span> · finalidade: <span style={{color:C.textMid}}>{finalidade}</span> · {new Date().toLocaleString("pt-BR")}
              </span>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}

const S = {
  input:{ width:"100%",background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:7,padding:"10px 14px",fontSize:14,color:C.text,outline:"none",fontFamily:SANS,boxSizing:"border-box",transition:"border-color 0.15s" },
  select:{ width:"100%",background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:7,padding:"10px 14px",fontSize:14,color:C.text,outline:"none",fontFamily:SANS,boxSizing:"border-box",cursor:"pointer" },
  btnPrimary:{ display:"flex",alignItems:"center",gap:6,padding:"9px 20px",background:C.gold,border:"none",borderRadius:7,color:C.bg,fontSize:14,fontWeight:800,cursor:"pointer",transition:"opacity 0.15s",fontFamily:MONO },
  btnSecondary:{ padding:"9px 16px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:7,color:C.textMid,fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:SANS },
}
