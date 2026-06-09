import { useState, useRef, useEffect } from "react"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
const API  = "http://127.0.0.1:8000/api"

const GLOBAL_CSS = `
  @keyframes fadeUp   { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pulse-ring { 0%,100%{box-shadow:0 0 0 0 rgba(180,83,9,0.35)} 50%{box-shadow:0 0 0 6px rgba(180,83,9,0)} }
  @keyframes spin      { to{transform:rotate(360deg)} }
  @keyframes bar-fill  { from{width:0} to{width:var(--w)} }
  .osint-fade  { animation: fadeUp 0.28s ease forwards; }
  .osint-spin  { animation: spin 0.9s linear infinite; }
  .osint-pulse { animation: pulse-ring 1.8s ease infinite; }
  .osint-row:hover { background:#FFFBEB !important; }
  .osint-src:hover { border-color:#B45309 !important; background:#FEF3C7 !important; }
  .osint-tab:hover { background:#F1F5F9 !important; }
`

const RISCO = {
  alto:    { bg:"#FEF2F2", badge:"#DC2626", text:"#7F1D1D", label:"▲ ALTO"    },
  critico: { bg:"#FFF0F0", badge:"#991B1B", text:"#7F1D1D", label:"⚠ CRÍTICO" },
  medio:   { bg:"#FFFBEB", badge:"#B45309", text:"#78350F", label:"● MÉDIO"   },
  baixo:   { bg:"#F0FDF4", badge:"#15803D", text:"#14532D", label:"✓ BAIXO"   },
  sem_dado:{ bg:"#F8FAFC", badge:"#64748B", text:"#475569", label:"— S/ DADO" },
}

const FINALIDADES = [
  { value:"seguranca_publica",      label:"Segurança Pública"       },
  { value:"investigacao_interna",   label:"Investigação Interna"    },
  { value:"due_diligence_corporativa", label:"Due Diligence"        },
  { value:"compliance_regulatorio", label:"Compliance Regulatório"  },
  { value:"prevencao_fraude",       label:"Prevenção de Fraude"     },
]

const FONTES = [
  { key:"datajud",       label:"DataJud",       icon:"⚖" },
  { key:"cnpj_ws",       label:"CNPJ.ws",       icon:"🏢" },
  { key:"brasil_io",     label:"Brasil.io",     icon:"📊" },
  { key:"diario_oficial",label:"D.O.U.",         icon:"📋" },
  { key:"gnews",         label:"GNews",         icon:"📰" },
]

function cpfMask(v) {
  return v.replace(/\D/g,"").slice(0,11)
    .replace(/(\d{3})(\d)/,"$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/,"$1.$2.$3")
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/,"$1.$2.$3-$4")
}

// ── Ícones inline ─────────────────────────────────────────────────────────────
const IconSearch = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)
const IconDownload = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
)
const IconAlert = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
)
const IconUser = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
)
const IconGraph = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
)
const IconClock = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
)

// ── Painel de contador ────────────────────────────────────────────────────────
const StatBadge = ({ label, value, color="#0F172A" }) => (
  <div style={{textAlign:"center",padding:"10px 14px",background:"#FFFFFF",borderRadius:8,border:"1px solid #E2E8F0",minWidth:72}}>
    <div style={{fontSize:22,fontWeight:800,color,fontFamily:MONO,lineHeight:1}}>{value}</div>
    <div style={{fontSize:8,fontWeight:700,color:"#94A3B8",letterSpacing:"0.1em",textTransform:"uppercase",marginTop:4}}>{label}</div>
  </div>
)

// ── Linha de tabela ───────────────────────────────────────────────────────────
const TRow = ({ cells, even }) => (
  <div className="osint-row" style={{display:"grid",gridTemplateColumns:"var(--cols)",background:even?"#FAFBFC":"#FFFFFF",borderBottom:"1px solid #F1F5F9",transition:"background 0.12s"}}>
    {cells.map((c,i) => (
      <div key={i} style={{padding:"7px 10px",fontSize:10,color:"#334155",fontFamily:i===0?MONO:SANS,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c||"—"}</div>
    ))}
  </div>
)

// ── Tabela com cabeçalho ──────────────────────────────────────────────────────
const Tabela = ({ cols, rows, gridCols }) => (
  <div style={{"--cols":gridCols,borderRadius:8,overflow:"hidden",border:"1px solid #E2E8F0",fontSize:10}}>
    <div style={{display:"grid",gridTemplateColumns:gridCols,background:"#0F172A"}}>
      {cols.map(c => <div key={c} style={{padding:"7px 10px",fontSize:8,fontWeight:700,color:"#94A3B8",letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:MONO}}>{c}</div>)}
    </div>
    {rows.length === 0
      ? <div style={{padding:"16px 10px",fontSize:11,color:"#94A3B8",fontStyle:"italic",fontFamily:MONO,background:"#FAFBFC"}}>Nenhum registro encontrado</div>
      : rows.map((r,i) => <TRow key={i} cells={r} even={i%2===0}/>)
    }
  </div>
)

// ── Chip de fonte ─────────────────────────────────────────────────────────────
const FonteChip = ({ fonte, ok }) => (
  <div style={{display:"flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:4,background:ok?"#F0FDF4":"#FEF2F2",border:`1px solid ${ok?"#86EFAC":"#FECACA"}`}}>
    <span style={{width:5,height:5,borderRadius:"50%",background:ok?"#16A34A":"#DC2626",flexShrink:0}}/>
    <span style={{fontSize:9,fontWeight:700,color:ok?"#166534":"#991B1B",fontFamily:MONO}}>{fonte}</span>
  </div>
)

export default function OsintPesquisa({ onNavigate }) {
  const [nome,        setNome]        = useState("")
  const [cpf,         setCpf]         = useState("")
  const [finalidade,  setFinalidade]  = useState("seguranca_publica")
  const [operador,    setOperador]    = useState("agente_001")
  const [loading,     setLoading]     = useState(false)
  const [erro,        setErro]        = useState("")
  const [resultado,   setResultado]   = useState(null)
  const [relatorio,   setRelatorio]   = useState(null)
  const [activeTab,   setActiveTab]   = useState("sumario")
  const [dlLoading,   setDlLoading]   = useState(false)
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
      const res = await fetch(`${API}/osint/pesquisar`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          operator_id: operador || "agente_anonimo",
          lgpd_purpose: finalidade,
          nome: nome.trim() || undefined,
          cpf: cpf.replace(/\D/g,"") || undefined,
        })
      })
      const data = await res.json()
      if (!res.ok) { setErro(data.detail || "Erro na pesquisa."); return }
      setResultado(data)
      // Busca relatório completo
      const r2 = await fetch(`${API}/osint/relatorio/${data.report_id}`)
      if (r2.ok) setRelatorio(await r2.json())
    } catch(e) {
      setErro("Falha de conexão com o backend. Verifique se a API está rodando.")
    } finally {
      setLoading(false)
    }
  }

  async function baixarPdf() {
    if (!resultado?.report_id) return
    setDlLoading(true)
    try {
      const res = await fetch(`${API}/osint/relatorio/${resultado.report_id}/pdf`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `osint_${resultado.subject_name?.replace(/ /g,"_") || resultado.report_id.slice(0,8)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDlLoading(false)
    }
  }

  function limpar() {
    setNome(""); setCpf(""); setResultado(null); setRelatorio(null); setErro(""); setActiveTab("sumario")
  }

  const risco = resultado ? (RISCO[resultado.risk_level] || RISCO.sem_dado) : null

  return (
    <div style={S.root}>

      {/* ── TOPBAR ────────────────────────────────────────────────── */}
      <header style={S.topbar}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{display:"flex",gap:5,marginRight:6}}>
            {["#FF5F57","#FEBC2E","#28C840"].map(c=><div key={c} style={{width:11,height:11,borderRadius:"50%",background:c}}/>)}
          </div>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:"#0F172A"}}>Pesquisa OSINT</div>
            <div style={{fontSize:10,color:"#64748B",fontFamily:MONO}}>Inteligência de Pessoas · Fontes Públicas</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 12px",background:"#F0FDF4",borderRadius:20,border:"1px solid #86EFAC"}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:"#16A34A",boxShadow:"0 0 5px rgba(22,163,74,0.7)"}}/>
          <span style={{fontSize:10,color:"#166534",fontWeight:600}}>LGPD Ativo</span>
        </div>
      </header>

      <div style={S.body}>

        {/* ── FORMULÁRIO ────────────────────────────────────────────── */}
        <section style={S.card}>
          <div style={S.cardHeader}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <IconSearch/>
              <span style={{fontSize:11,fontWeight:700,color:"#0F172A",letterSpacing:"0.04em"}}>IDENTIFICAÇÃO DO SUJEITO</span>
            </div>
            <div style={{fontSize:9,color:"#94A3B8",fontFamily:MONO}}>Informe nome e/ou CPF</div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            {/* Nome */}
            <div>
              <label style={S.label}>Nome Completo</label>
              <input
                style={S.input}
                placeholder="Ex: João Silva Santos"
                value={nome}
                onChange={e=>setNome(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&pesquisar()}
              />
            </div>
            {/* CPF */}
            <div>
              <label style={S.label}>CPF</label>
              <input
                style={S.input}
                placeholder="000.000.000-00"
                value={cpf}
                onChange={e=>setCpf(cpfMask(e.target.value))}
                onKeyDown={e=>e.key==="Enter"&&pesquisar()}
                maxLength={14}
              />
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
            {/* Finalidade */}
            <div>
              <label style={S.label}>Finalidade LGPD <span style={{color:"#DC2626"}}>*</span></label>
              <select style={S.select} value={finalidade} onChange={e=>setFinalidade(e.target.value)}>
                {FINALIDADES.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            {/* Operador */}
            <div>
              <label style={S.label}>ID do Operador <span style={{color:"#DC2626"}}>*</span></label>
              <input style={S.input} placeholder="Ex: agente_001" value={operador} onChange={e=>setOperador(e.target.value)}/>
            </div>
          </div>

          {/* Fontes ativas */}
          <div style={{marginBottom:16}}>
            <label style={S.label}>Fontes ativas</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
              {FONTES.map(f=>(
                <div key={f.key} className="osint-src" style={{
                  display:"flex",alignItems:"center",gap:5,
                  padding:"4px 10px",borderRadius:6,
                  background:"#FFFFFF",border:"1px solid #E2E8F0",
                  cursor:"default",transition:"all 0.12s",
                }}>
                  <span>{f.icon}</span>
                  <span style={{fontSize:10,fontWeight:600,color:"#334155",fontFamily:MONO}}>{f.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Erro */}
          {erro && (
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:7,marginBottom:12}}>
              <IconAlert/>
              <span style={{fontSize:11,color:"#991B1B",fontWeight:500}}>{erro}</span>
            </div>
          )}

          {/* Botões */}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            {resultado && (
              <button style={S.btnSecondary} onClick={limpar}>Nova pesquisa</button>
            )}
            <button style={{...S.btnPrimary,...(loading?{opacity:0.6,cursor:"not-allowed"}:{})}} onClick={pesquisar} disabled={loading}>
              {loading
                ? <><span className="osint-spin" style={{display:"inline-block",width:12,height:12,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#FFF",borderRadius:"50%"}}/> Pesquisando...</>
                : <><IconSearch/> Pesquisar</>
              }
            </button>
          </div>
        </section>

        {/* ── RESULTADO ─────────────────────────────────────────────── */}
        {resultado && (
          <div ref={resultRef} className="osint-fade">

            {/* Badge de risco */}
            <div style={{...S.riscoBanner,background:risco.bg,border:`1px solid ${risco.badge}30`}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{padding:"4px 14px",background:risco.badge,borderRadius:6}}>
                  <span style={{fontSize:13,fontWeight:800,color:"#FFF",letterSpacing:"0.06em",fontFamily:MONO}}>{risco.label}</span>
                </div>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:risco.text}}>{resultado.subject_name}</div>
                  <div style={{fontSize:9,color:risco.badge,fontFamily:MONO,marginTop:1}}>CPF: {resultado.subject_cpf_masked} · ID: {resultado.report_id.slice(0,8).toUpperCase()}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <div style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:"#64748B",fontFamily:MONO}}>
                  <IconClock/>{resultado.execution_time_ms ? `${(resultado.execution_time_ms/1000).toFixed(1)}s` : "—"}
                </div>
                <button
                  style={{...S.btnPdf,...(dlLoading?{opacity:0.5}:{})}}
                  onClick={baixarPdf}
                  disabled={dlLoading}
                >
                  <IconDownload/>
                  {dlLoading ? "Gerando..." : "PDF"}
                </button>
              </div>
            </div>

            {/* Contadores */}
            <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
              <StatBadge label="Processos Criminais" value={resultado.total_processos} color={resultado.total_processos>0?"#DC2626":"#0F172A"}/>
              <StatBadge label="Mandados Ativos"     value={resultado.tem_mandado_ativo?1:0} color={resultado.tem_mandado_ativo?"#DC2626":"#0F172A"}/>
              <StatBadge label="Empresas"            value={resultado.total_empresas}/>
              <StatBadge label="Notícias"            value={resultado.total_noticias}/>
              <StatBadge label="D.O.U."              value={resultado.total_dou}/>
              <StatBadge label="Nós no Grafo"        value={resultado.nos_grafo}/>
            </div>

            {/* Status das fontes */}
            {resultado.fontes_com_erro?.length > 0 && (
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:7,marginBottom:12,flexWrap:"wrap"}}>
                <span style={{fontSize:9,fontWeight:700,color:"#B45309",fontFamily:MONO,flexShrink:0}}>FONTES INDISPONÍVEIS:</span>
                {resultado.fontes_com_erro.map(f=><FonteChip key={f} fonte={f} ok={false}/>)}
              </div>
            )}

            {/* Tabs de detalhe */}
            {relatorio && (
              <section style={S.card}>
                {/* Tab bar */}
                <div style={{display:"flex",gap:2,borderBottom:"1px solid #E2E8F0",marginBottom:14,paddingBottom:0}}>
                  {[
                    {key:"sumario",   label:"Sumário",    icon:<IconUser/>   },
                    {key:"processos", label:"Processos",  icon:<IconAlert/>  },
                    {key:"empresas",  label:"Empresas",   icon:<IconSearch/> },
                    {key:"timeline",  label:"Timeline",   icon:<IconClock/>  },
                    {key:"grafo",     label:"Grafo",      icon:<IconGraph/>  },
                  ].map(t=>(
                    <button key={t.key} className="osint-tab" onClick={()=>setActiveTab(t.key)} style={{
                      display:"flex",alignItems:"center",gap:5,
                      padding:"7px 14px",border:"none",background:"transparent",cursor:"pointer",
                      borderBottom: activeTab===t.key ? "2px solid #B45309" : "2px solid transparent",
                      color: activeTab===t.key ? "#B45309" : "#64748B",
                      fontWeight: activeTab===t.key ? 700 : 400,
                      fontSize:11,fontFamily:SANS,transition:"all 0.12s",
                      borderRadius:"6px 6px 0 0",
                    }}>
                      {t.icon}<span>{t.label}</span>
                    </button>
                  ))}
                </div>

                {/* Tab: Sumário */}
                {activeTab === "sumario" && (
                  <div className="osint-fade">
                    {relatorio.risk_summary && (
                      <div style={{padding:"12px 14px",background:"#F8FAFC",borderRadius:8,border:"1px solid #E2E8F0",marginBottom:12}}>
                        <div style={{fontSize:9,fontWeight:700,color:"#B45309",fontFamily:MONO,marginBottom:6,letterSpacing:"0.08em"}}>◈ ANÁLISE IA — GROQ</div>
                        <p style={{fontSize:12,color:"#1E293B",lineHeight:1.7,margin:0}}>{relatorio.risk_summary}</p>
                      </div>
                    )}
                    {relatorio.risk_indicators?.length > 0 && (
                      <div>
                        <div style={{fontSize:9,fontWeight:700,color:"#334155",fontFamily:MONO,letterSpacing:"0.1em",marginBottom:8}}>INDICADORES DE RISCO</div>
                        <div style={{display:"flex",flexDirection:"column",gap:4}}>
                          {relatorio.risk_indicators.map((ind,i)=>(
                            <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:6}}>
                              <span style={{color:"#DC2626",flexShrink:0}}><IconAlert/></span>
                              <span style={{fontSize:11,color:"#7F1D1D",fontWeight:500}}>{ind}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab: Processos */}
                {activeTab === "processos" && (
                  <div className="osint-fade" style={{display:"flex",flexDirection:"column",gap:12}}>
                    {relatorio.mandados_prisao?.length > 0 && (
                      <div>
                        <div style={{fontSize:9,fontWeight:700,color:"#DC2626",fontFamily:MONO,letterSpacing:"0.1em",marginBottom:6}}>⚠ MANDADOS DE PRISÃO</div>
                        <Tabela
                          cols={["Nº Mandado","Tipo","Status","Data Expedição"]}
                          rows={relatorio.mandados_prisao.map(m=>[m.numero,m.tipo,m.status,m.data_expedicao])}
                          gridCols="2fr 1.5fr 1fr 1.2fr"
                        />
                      </div>
                    )}
                    <div>
                      <div style={{fontSize:9,fontWeight:700,color:"#334155",fontFamily:MONO,letterSpacing:"0.1em",marginBottom:6}}>PROCESSOS CRIMINAIS</div>
                      <Tabela
                        cols={["Nº Processo","Tribunal","Crime/Classe","Data","Status"]}
                        rows={(relatorio.processos_criminais||[]).map(p=>[p.numero,p.tribunal,(p.assuntos||[]).join(", "),p.data_ajuizamento||p.data,p.status])}
                        gridCols="2.2fr 1fr 2fr 1fr 1fr"
                      />
                    </div>
                    <div>
                      <div style={{fontSize:9,fontWeight:700,color:"#334155",fontFamily:MONO,letterSpacing:"0.1em",marginBottom:6}}>PROCESSOS CÍVEIS</div>
                      <Tabela
                        cols={["Nº Processo","Tribunal","Assunto","Data"]}
                        rows={(relatorio.processos_civeis||[]).map(p=>[p.numero,p.tribunal,(p.assuntos||[]).join(", "),p.data_ajuizamento||p.data])}
                        gridCols="2.2fr 1fr 2.5fr 1fr"
                      />
                    </div>
                  </div>
                )}

                {/* Tab: Empresas */}
                {activeTab === "empresas" && (
                  <div className="osint-fade">
                    <Tabela
                      cols={["CNPJ","Razão Social","Qualificação","Situação","UF"]}
                      rows={(relatorio.vinculos_empresariais||[]).map(e=>[e.cnpj,e.razao_social,e.qualificacao,e.situacao,e.uf])}
                      gridCols="1.6fr 2fr 1.4fr 1fr 0.5fr"
                    />
                    {relatorio.mencoes_dou?.length > 0 && (
                      <div style={{marginTop:12}}>
                        <div style={{fontSize:9,fontWeight:700,color:"#334155",fontFamily:MONO,letterSpacing:"0.1em",marginBottom:6}}>DIÁRIO OFICIAL DA UNIÃO</div>
                        <Tabela
                          cols={["Data","Tipo","Órgão","Título"]}
                          rows={relatorio.mencoes_dou.map(d=>[d.data,d.tipo,d.orgao,d.titulo])}
                          gridCols="0.8fr 1fr 1.2fr 3fr"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Tab: Timeline */}
                {activeTab === "timeline" && (
                  <div className="osint-fade" style={{display:"flex",flexDirection:"column",gap:6}}>
                    {[
                      ...(relatorio.processos_criminais||[]).map(p=>({data:p.data_ajuizamento||p.data,tipo:"PROCESSO CRIMINAL",desc:p.classe||"Processo",cor:"#DC2626",bg:"#FEF2F2"})),
                      ...(relatorio.mandados_prisao||[]).map(m=>({data:m.data_expedicao,tipo:"MANDADO PRISÃO",desc:m.tipo,cor:"#991B1B",bg:"#FFF0F0"})),
                      ...(relatorio.mencoes_midia||[]).map(n=>({data:n.data?.slice(0,10),tipo:"MÍDIA",desc:n.titulo,cor:"#1D4ED8",bg:"#EFF6FF"})),
                      ...(relatorio.mencoes_dou||[]).map(d=>({data:d.data,tipo:"D.O.U.",desc:d.titulo,cor:"#065F46",bg:"#F0FDF4"})),
                    ].filter(e=>e.data).sort((a,b)=>b.data.localeCompare(a.data)).map((e,i)=>(
                      <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"8px 10px",background:e.bg,border:`1px solid ${e.cor}20`,borderRadius:7}}>
                        <span style={{fontSize:9,fontWeight:700,color:e.cor,fontFamily:MONO,flexShrink:0,minWidth:76}}>{e.data}</span>
                        <span style={{fontSize:8,fontWeight:700,padding:"2px 7px",borderRadius:3,background:e.cor,color:"#FFF",fontFamily:MONO,flexShrink:0}}>{e.tipo}</span>
                        <span style={{fontSize:11,color:"#334155",lineHeight:1.4}}>{e.desc}</span>
                      </div>
                    ))}
                    {![...(relatorio.processos_criminais||[]),...(relatorio.mencoes_midia||[]),...(relatorio.mencoes_dou||[])].some(e=>e.data||e.data_ajuizamento) && (
                      <div style={{fontSize:11,color:"#94A3B8",fontStyle:"italic",fontFamily:MONO,padding:"16px 0"}}>Nenhum evento com data identificado.</div>
                    )}
                  </div>
                )}

                {/* Tab: Grafo */}
                {activeTab === "grafo" && (
                  <div className="osint-fade">
                    {relatorio.graph?.nodes?.length > 0 ? (
                      <>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                          <div style={{padding:"4px 10px",background:"#0F172A",borderRadius:6}}>
                            <span style={{fontSize:9,fontWeight:700,color:"#F59E0B",fontFamily:MONO}}>◈ NÓ CENTRAL</span>
                          </div>
                          <span style={{fontSize:12,fontWeight:700,color:"#0F172A"}}>{relatorio.graph.nodes.find(n=>n.is_subject)?.label}</span>
                          <span style={{fontSize:9,color:"#94A3B8",fontFamily:MONO,marginLeft:"auto"}}>{relatorio.graph.nodes.length} nós · {relatorio.graph.edges.length} arestas</span>
                        </div>
                        <Tabela
                          cols={["Entidade","Tipo","Relação","Fonte"]}
                          rows={relatorio.graph.edges.map(e=>{
                            const t = relatorio.graph.nodes.find(n=>n.node_id===e.target_id)
                            return [t?.label, t?.node_type?.toUpperCase(), e.edge_type?.replace(/_/g," ").toUpperCase(), e.data_source]
                          }).filter(r=>r[0])}
                          gridCols="2.5fr 1fr 1.5fr 1fr"
                        />
                      </>
                    ) : (
                      <div style={{fontSize:11,color:"#94A3B8",fontStyle:"italic",fontFamily:MONO,padding:"16px 0"}}>Grafo não disponível.</div>
                    )}
                  </div>
                )}

              </section>
            )}

            {/* Rodapé LGPD */}
            <div style={{padding:"8px 14px",background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:7,display:"flex",gap:8,alignItems:"flex-start"}}>
              <span style={{fontSize:9,fontWeight:700,color:"#B45309",fontFamily:MONO,flexShrink:0,marginTop:1}}>LGPD</span>
              <span style={{fontSize:9,color:"#64748B",lineHeight:1.6}}>
                Pesquisa realizada por <b style={{color:"#334155"}}>{operador}</b> · Finalidade: <b style={{color:"#334155"}}>{finalidade}</b> · Registro em audit log conforme Art. 37 LGPD · {new Date().toLocaleString("pt-BR")}
              </span>
            </div>

          </div>
        )}

      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  root:{ display:"flex",flexDirection:"column",height:"100vh",background:"#F8FAFC",overflow:"hidden",fontFamily:SANS },
  topbar:{ height:44,borderBottom:"1px solid #E2E8F0",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 18px",background:"#FFFFFF",flexShrink:0,boxShadow:"0 1px 3px rgba(0,0,0,0.05)" },
  body:{ flex:1,overflowY:"auto",padding:"14px 18px",display:"flex",flexDirection:"column",gap:12 },
  card:{ background:"#FFFFFF",border:"1px solid #E2E8F0",borderRadius:10,padding:"14px 16px",boxShadow:"0 2px 8px rgba(0,0,0,0.05)" },
  cardHeader:{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,paddingBottom:10,borderBottom:"1px solid #F1F5F9" },
  label:{ display:"block",fontSize:9,fontWeight:700,color:"#334155",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:5,fontFamily:MONO },
  input:{ width:"100%",background:"#F8FAFC",border:"1px solid #CBD5E1",borderRadius:7,padding:"9px 12px",fontSize:12,color:"#0F172A",outline:"none",fontFamily:SANS,boxSizing:"border-box",transition:"border-color 0.15s" },
  select:{ width:"100%",background:"#F8FAFC",border:"1px solid #CBD5E1",borderRadius:7,padding:"9px 12px",fontSize:12,color:"#0F172A",outline:"none",fontFamily:SANS,boxSizing:"border-box",cursor:"pointer" },
  btnPrimary:{ display:"flex",alignItems:"center",gap:6,padding:"9px 20px",background:"linear-gradient(135deg,#F59E0B,#B45309)",border:"none",borderRadius:7,color:"#FFF",fontSize:12,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 12px rgba(180,83,9,0.3)",transition:"opacity 0.15s" },
  btnSecondary:{ padding:"9px 16px",background:"transparent",border:"1px solid #CBD5E1",borderRadius:7,color:"#475569",fontSize:12,fontWeight:500,cursor:"pointer" },
  btnPdf:{ display:"flex",alignItems:"center",gap:5,padding:"6px 12px",background:"#0F172A",border:"none",borderRadius:6,color:"#FFF",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:MONO },
  riscoBanner:{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderRadius:10,marginBottom:12,flexWrap:"wrap",gap:8 },
}
