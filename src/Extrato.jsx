import { useState, useEffect, useCallback } from "react"
import api from "./api"
import { C, MONO, SANS, RISK_COLORS } from "./theme"

/*
  MÓDULO EXTRATO — submissão, RAE e fusão de homônimos
  Alimenta o grafo i2, Léxico de Sinais Fracos e Matriz de Calor NUCADIs.
*/

const CSS = `
  .ex-tab:hover { background: rgba(232,160,32,0.06) !important; }
  .ex-row:hover { background: rgba(232,160,32,0.06) !important; cursor:pointer; }
  .ex-btn { transition: all .12s; }
  .ex-btn:hover { filter: brightness(1.12); transform: translateY(-1px); }
  .ex-card:hover { border-color: rgba(232,160,32,0.3) !important; }
  .ex-scroll::-webkit-scrollbar { width:6px; }
  .ex-scroll::-webkit-scrollbar-track { background:transparent; }
  .ex-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.14);border-radius:6px; }
  .ex-scroll::-webkit-scrollbar-thumb:hover { background:rgba(232,160,32,0.4); }
  input::placeholder, textarea::placeholder { color: #64748B !important; }
  select option { background: #111827; color: #F1F5F9; }
`

const CLASSIF_COR = {
  teste:     {c:"#4ADE80", b:"rgba(74,222,128,0.12)"},
  sintetico: {c:"#4ADE80", b:"rgba(74,222,128,0.12)"},
  publico:   {c:"#60A5FA", b:"rgba(96,165,250,0.12)"},
  interno:   {c:"#FBBF24", b:"rgba(251,191,36,0.12)"},
  reservado: {c:"#FB923C", b:"rgba(251,146,60,0.12)"},
  sigiloso:  {c:"#F87171", b:"rgba(239,68,68,0.12)"},
  secreto:   {c:"#F87171", b:"rgba(239,68,68,0.16)"},
}
const TIPO_ICONE = {
  pessoa:"👤",local:"🏛️",faccao:"🏴",crime:"🔫",juridico:"⚖️",documento:"📄",
  social:"🤝",geografia:"🌎",financeiro:"💰",organizacao:"🏢",evento:"⚡",generico:"⚪",
}

const ABAS = [
  {id:"novo",   label:"Novo Extrato"},
  {id:"rae",    label:"Extratos & RAE"},
  {id:"fusao",  label:"Fusão de Homônimos"},
]

// ── Helpers de UI ─────────────────────────────────────────────────────────────
const badge = (color, bg, border) => ({
  fontSize:13, fontWeight:800, padding:"3px 10px", borderRadius:5,
  letterSpacing:"0.04em", fontFamily:MONO, color, background:bg,
  border:`1px solid ${border}`, whiteSpace:"nowrap",
})
const classifTag = c => {
  const cc = CLASSIF_COR[c] || {c:C.textMid, b:"rgba(255,255,255,0.06)"}
  return <span style={badge(cc.c, cc.b, cc.c+"55")}>{(c||"—").toUpperCase()}</span>
}
const Tag = ({children}) => (
  <span style={{fontSize:13,color:C.textMid,fontFamily:MONO,
    background:"rgba(255,255,255,0.05)",padding:"3px 9px",
    borderRadius:4,border:`1px solid ${C.border}`}}>
    {children}
  </span>
)

// ── SectionBar ────────────────────────────────────────────────────────────────
const SectionBar = ({label}) => (
  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
    <span style={{width:3,height:16,background:C.gold,borderRadius:2,
      boxShadow:"0 0 8px rgba(232,160,32,0.5)",flexShrink:0}}/>
    <h2 style={{fontSize:14,fontWeight:800,color:C.gold,letterSpacing:"0.1em",
      textTransform:"uppercase",margin:0}}>
      {label}
    </h2>
  </div>
)

// ── Campo de formulário ───────────────────────────────────────────────────────
const Campo = ({label, children}) => (
  <div style={{marginBottom:14}}>
    <div style={{fontSize:12,fontWeight:700,color:C.textDim,letterSpacing:"0.08em",
      textTransform:"uppercase",fontFamily:MONO,marginBottom:6}}>
      {label}
    </div>
    {children}
  </div>
)

// ── Bloco de seção no RAE ─────────────────────────────────────────────────────
const Bloco = ({titulo, children}) => (
  <div style={{marginTop:16}}>
    <div style={{fontSize:13,fontWeight:800,color:C.textMid,letterSpacing:"0.08em",
      textTransform:"uppercase",marginBottom:8,fontFamily:MONO}}>
      {titulo}
    </div>
    {children}
  </div>
)

// ── Nó para fusão ─────────────────────────────────────────────────────────────
const NoFusao = ({no}) => (
  <div style={{padding:"12px 14px",borderRadius:8,background:"rgba(255,255,255,0.03)",
    border:`1px solid ${C.border}`}}>
    <div style={{fontSize:15,fontWeight:700,color:C.text}}>👤 {no.rotulo}</div>
    <div style={{fontSize:13,color:C.textMid,fontFamily:MONO,marginTop:4}}>
      {no.nome||"—"}{no.vulgo?` · ${no.vulgo}`:""}</div>
    <div style={{fontSize:13,color:C.textDim,marginTop:3}}>
      {no.faccao||"—"} · {no.unidade||"—"} · {no.vinculos} vínculos · {no.origem}
    </div>
  </div>
)

// ── Visualização do RAE ───────────────────────────────────────────────────────
function RaeView({ rae, onPdf, onGrafo, onReproc, busy }) {
  const rk = RISK_COLORS[rae.risk_nivel] || RISK_COLORS.MÉDIO
  const ex = rae.extrato || {}
  return (
    <div className="fade-in">
      {/* Cabeçalho */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
        gap:12,flexWrap:"wrap",marginBottom:12}}>
        <div style={{flex:1,minWidth:240}}>
          <div style={{fontSize:12,color:C.gold,fontFamily:MONO,letterSpacing:"0.1em",marginBottom:4}}>
            RELATÓRIO ANALÍTICO DE EXTRATO · {ex.id}
          </div>
          <div style={{fontSize:18,fontWeight:800,color:C.text,lineHeight:1.3}}>
            {rae.assunto_sintetizado || ex.assunto || "—"}
          </div>
        </div>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:30,fontWeight:900,color:rk.color,lineHeight:1,fontFamily:MONO}}>
            {rae.risk_score ?? "—"}
          </div>
          <span style={badge(rk.color, rk.bg, rk.border)}>{rae.risk_nivel}</span>
        </div>
      </div>

      {/* Tags */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:4}}>
        <Tag>{ex.unidade||"—"}</Tag>
        {classifTag(ex.classificacao)}
        <Tag>{ex.provedor||"—"} / {ex.modelo||"—"}</Tag>
        {ex.forcado_local && (
          <span style={badge(C.green,"rgba(74,222,128,0.12)","rgba(74,222,128,0.3)")}>
            🔒 LOCAL SOBERANO
          </span>
        )}
      </div>

      {/* Corpo original */}
      {ex.corpo && (
        <Bloco titulo="Texto integral do extrato (preservado na íntegra)">
          <div style={{whiteSpace:"pre-wrap",fontSize:14,color:C.text,lineHeight:1.65,
            background:"rgba(255,255,255,0.02)",border:`1px solid ${C.border}`,
            borderRadius:8,padding:"13px 15px",maxHeight:240,overflowY:"auto"}}>
            {ex.corpo}
          </div>
        </Bloco>
      )}

      {/* Avaliação de risco */}
      <Bloco titulo="Avaliação de Risco">
        <div style={{fontSize:14,color:C.text,lineHeight:1.65}}>
          {rae.justificativa_risco || "—"}
          {rae.risco_forcado && (
            <span style={{color:C.gold}}> · piso aplicado por palavra-crítica.</span>
          )}
        </div>
      </Bloco>

      {/* Entidades */}
      <Bloco titulo={`Entidades-chave (${(rae.entidades||[]).length})`}>
        {(rae.entidades||[]).map((e,i)=>(
          <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",
            padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:18}}>{TIPO_ICONE[e.tipo]||"⚪"}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:15,fontWeight:700,color:C.text}}>
                {e.rotulo}
                <span style={{fontSize:13,color:C.textDim,fontWeight:500,
                  marginLeft:8,fontFamily:MONO}}>
                  {e.tipo}
                </span>
              </div>
              <div style={{fontSize:13,color:C.textMid,marginTop:2}}>{e.papel||"—"}</div>
              {e.evidencia && (
                <div style={{fontSize:13,color:C.textMid,fontStyle:"italic",marginTop:4,
                  overflow:"hidden",textOverflow:"ellipsis",display:"-webkit-box",
                  WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}
                  title={e.evidencia}>"{e.evidencia}"</div>
              )}
            </div>
            <span title={e.evidencia_ok?"trecho-fonte conferido":"sem correspondência exata — revisar"}
              style={{fontSize:14,color:e.evidencia_ok?C.green:"#FBBF24",flexShrink:0}}>
              {e.evidencia_ok?"✓":"⚠"}
            </span>
          </div>
        ))}
      </Bloco>

      {/* Conexões */}
      {(rae.conexoes||[]).length>0 && (
        <Bloco titulo={`Vínculos detectados (${rae.conexoes.length})`}>
          {rae.conexoes.map((c,i)=>(
            <div key={i} style={{fontSize:14,color:C.text,fontFamily:MONO,padding:"4px 0"}}>
              <b>{c.source}</b>
              <span style={{color:C.gold}}> —{c.relation}→ </span>
              <b>{c.target}</b>
              <span style={{color:C.textDim}}> (peso {c.weight})</span>
            </div>
          ))}
        </Bloco>
      )}

      {/* Jargões */}
      {(rae.jargoes||[]).length>0 && (
        <Bloco titulo={`Sinais fracos / jargões (${rae.jargoes.length})`}>
          {rae.jargoes.map((j,i)=>(
            <div key={i} style={{fontSize:14,color:C.text,padding:"4px 0"}}>
              <b style={{color:"#FBBF24"}}>«{j.termo}»</b> ≈ {j.significado_provavel}
            </div>
          ))}
        </Bloco>
      )}

      {/* Tags */}
      {(rae.tags||[]).length>0 && (
        <div style={{marginTop:12,display:"flex",gap:6,flexWrap:"wrap"}}>
          {rae.tags.map((t,i)=>(
            <span key={i} style={{fontSize:13,color:C.gold,fontFamily:MONO,
              background:C.goldSoft,padding:"3px 10px",borderRadius:10,
              border:`1px solid ${C.goldBorder}`}}>
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* Proveniência */}
      <div style={{marginTop:16,padding:"10px 14px",borderRadius:7,
        background:"rgba(74,222,128,0.06)",border:"1px solid rgba(74,222,128,0.2)",
        fontSize:14,color:C.text}}>
        Proveniência: <b style={{color:C.green}}>{rae.evidencias_ok}/{rae.evidencias_total}</b> itens com trecho-fonte conferido.
      </div>

      {/* Ações */}
      <div style={{display:"flex",gap:10,marginTop:16,flexWrap:"wrap"}}>
        <button className="ex-btn" onClick={onPdf}
          style={{padding:"10px 18px",borderRadius:8,border:`1px solid ${C.goldBorder}`,
            background:C.goldSoft,color:C.gold,fontSize:14,fontWeight:700,
            cursor:"pointer",fontFamily:MONO}}>
          ⬇ Baixar RAE (PDF)
        </button>
        <button className="ex-btn" onClick={onGrafo}
          style={{padding:"10px 18px",borderRadius:8,border:"1px solid rgba(56,189,248,0.4)",
            background:"rgba(56,189,248,0.1)",color:"#38BDF8",fontSize:14,fontWeight:700,
            cursor:"pointer",fontFamily:MONO}}>
          🕸 Ver no Grafo
        </button>
        <button className="ex-btn" disabled={busy} onClick={onReproc}
          style={{padding:"10px 18px",borderRadius:8,border:`1px solid ${C.borderUp}`,
            background:"rgba(255,255,255,0.04)",color:C.textMid,fontSize:14,fontWeight:700,
            cursor:"pointer",fontFamily:MONO}}>
          ↻ Reprocessar
        </button>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function Extrato({ onNavigate }) {
  const [tab,    setTab]    = useState("novo")
  const [meta,   setMeta]   = useState(null)
  const [lista,  setLista]  = useState([])
  const [sel,    setSel]    = useState(null)
  const [selId,  setSelId]  = useState(null)
  const [busy,   setBusy]   = useState(false)
  const [toast,  setToast]  = useState(null)
  const [cand,   setCand]   = useState([])

  const [form, setForm] = useState({
    data: new Date().toISOString().slice(0,10),
    unidade:"", nucleo:"", autor:"", assunto:"",
    topicos:"", corpo:"", classificacao:"reservado", nucleos_destino:"",
  })

  const aviso = (msg, cor=C.gold) => { setToast({msg,cor}); setTimeout(()=>setToast(null), 3200) }
  const set   = (k,v) => setForm(f=>({...f,[k]:v}))

  useEffect(() => {
    const s = document.createElement("style"); s.textContent = CSS
    document.head.appendChild(s); return () => document.head.removeChild(s)
  }, [])

  const carregarMeta  = useCallback(async () => {
    try { const r = await api.get("/extrato/meta"); if (r.ok) setMeta(await r.json()) } catch {}
  }, [])
  const carregarLista = useCallback(async () => {
    try { const r = await api.get("/extrato/listar"); if (r.ok) setLista((await r.json()).extratos||[]) } catch {}
  }, [])
  const carregarCand  = useCallback(async () => {
    try { const r = await api.get("/extrato/fusao/candidatos"); if (r.ok) setCand((await r.json()).candidatos||[]) } catch {}
  }, [])

  useEffect(() => { carregarMeta(); carregarLista() }, [carregarMeta, carregarLista])
  useEffect(() => { if (tab==="fusao") carregarCand() }, [tab, carregarCand])

  const abrirRae = async (eid) => {
    setSelId(eid); setSel(null); setTab("rae")
    try {
      const r = await api.get(`/extrato/${eid}/rae`)
      if (r.ok) setSel(await r.json()); else aviso("Falha ao abrir o RAE.", C.red)
    } catch { aviso("Erro de conexão.", C.red) }
  }

  const submeter = async () => {
    if (!form.corpo.trim()) return aviso("Preencha o corpo do extrato.", C.red)
    setBusy(true)
    try {
      const payload = {
        ...form,
        topicos: form.topicos.split("\n").map(t=>t.trim()).filter(Boolean),
        nucleos_destino: form.nucleos_destino.split(",").map(t=>t.trim()).filter(Boolean),
      }
      const r = await api.post("/extrato/submeter", payload)
      const d = await r.json()
      if (!r.ok) { aviso(d?.detail?.erro||d?.detail||"Falha no processamento.", C.red); setBusy(false); return }
      const proc = d.processamento || {}
      if (!proc.ok) {
        aviso(proc.bloqueado
          ? "🔒 Bloqueado pelo guardrail de soberania (provedor local indisponível)."
          : (proc.erro||"Falha na extração."), C.red)
      } else {
        const fl = proc.forcado_local ? " · forçado p/ local 🔒" : ""
        aviso(`Processado via ${proc.provedor}${fl} · risco ${proc.risk_nivel} · ${proc.entidades} entidades`, C.green)
        await carregarLista()
        setForm(f=>({...f, corpo:"", assunto:"", topicos:""}))
        if (d.extrato?.id) abrirRae(d.extrato.id)
      }
    } catch { aviso("Erro de conexão com o backend.", C.red) }
    setBusy(false)
  }

  const reprocessar = async (eid) => {
    setBusy(true)
    try {
      const r = await api.post(`/extrato/${eid}/processar`)
      if (r.ok) { aviso("Reprocessado.", C.green); abrirRae(eid); carregarLista() }
      else { const d=await r.json(); aviso(d?.detail?.erro||"Falha ao reprocessar.", C.red) }
    } catch { aviso("Erro de conexão.", C.red) }
    setBusy(false)
  }

  const baixarPdf = async (eid) => {
    try {
      const r = await api.get(`/extrato/${eid}/rae.pdf`)
      if (!r.ok) return aviso("Falha ao gerar PDF.", C.red)
      const blob = await r.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a"); a.href = url; a.download = `RAE_${eid}.pdf`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      carregarLista()
    } catch { aviso("Erro ao baixar PDF.", C.red) }
  }

  const fundir = async (manter_id, fundir_id) => {
    setBusy(true)
    try {
      const r = await api.post("/extrato/fusao/confirmar", {manter_id, fundir_id})
      if (r.ok) { aviso("Entidades fundidas.", C.green); carregarCand() }
      else { const d=await r.json(); aviso(d?.detail||"Falha na fusão.", C.red) }
    } catch { aviso("Erro de conexão.", C.red) }
    setBusy(false)
  }

  const localDown     = meta && !meta.ollama_disponivel
  const classSensivel = !["teste","sintetico","publico"].includes(form.classificacao)
  const abaAtual      = ABAS.find(a => a.id === tab)

  return (
    <div style={{display:"flex",flex:1,minWidth:0,height:"100%",overflow:"hidden",
      background:C.bg,fontFamily:SANS,color:C.text}}>

      {/* ── ASIDE ──────────────────────────────────────────────────────────── */}
      <aside style={{
        width:268, flexShrink:0,
        background:C.surface,
        borderRight:`1px solid ${C.border}`,
        display:"flex", flexDirection:"column",
        height:"100%", overflow:"hidden",
      }}>

        {/* Header aside */}
        <div style={{padding:"16px 16px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
            <div style={{width:3,height:18,background:C.gold,borderRadius:2,
              boxShadow:`0 0 6px ${C.gold}88`}}/>
            <span style={{fontSize:13,fontWeight:800,color:C.gold,letterSpacing:"0.1em",
              textTransform:"uppercase"}}>
              Módulo Extrato
            </span>
          </div>
          <div style={{fontSize:13,color:C.textMid,marginLeft:11,marginTop:2}}>
            Extração de inteligência i2
          </div>
        </div>

        {/* Status do provedor */}
        <div style={{padding:"12px 14px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{fontSize:11,fontWeight:700,color:C.textDim,letterSpacing:"0.1em",
            textTransform:"uppercase",fontFamily:MONO,marginBottom:8}}>
            Provedor IA
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",
            background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:8}}>
            <div style={{width:8,height:8,borderRadius:"50%",flexShrink:0,
              background:meta?.ollama_disponivel?"#22C55E":"#94A3B8",
              boxShadow:meta?.ollama_disponivel?"0 0 6px rgba(34,197,94,0.7)":undefined}}/>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:C.text,fontFamily:MONO}}>
                {meta?.provedor_configurado || "—"}
              </div>
              <div style={{fontSize:12,color:meta?.ollama_disponivel?"#4ADE80":C.textDim,marginTop:1}}>
                local {meta?.ollama_disponivel?"online":"offline"}
              </div>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div style={{display:"flex",gap:6,padding:"12px 14px",
          borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{flex:1,textAlign:"center",padding:"8px 4px",
            background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:8}}>
            <div style={{fontSize:24,fontWeight:800,color:C.gold,fontFamily:MONO,lineHeight:1}}>
              {lista.length}
            </div>
            <div style={{fontSize:12,color:C.textDim,marginTop:4}}>Extratos</div>
          </div>
          <div style={{flex:1,textAlign:"center",padding:"8px 4px",
            background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:8}}>
            <div style={{fontSize:24,fontWeight:800,color:"#A78BFA",fontFamily:MONO,lineHeight:1}}>
              {cand.length}
            </div>
            <div style={{fontSize:12,color:C.textDim,marginTop:4}}>Homônimos</div>
          </div>
        </div>

        {/* Navegação de abas */}
        <div style={{flex:1,padding:"10px 12px",overflowY:"auto"}}>
          <div style={{fontSize:11,fontWeight:700,color:C.textDim,letterSpacing:"0.1em",
            textTransform:"uppercase",fontFamily:MONO,marginBottom:8}}>
            Módulos
          </div>
          {ABAS.map(aba => {
            const ativo = tab === aba.id
            return (
              <button key={aba.id} onClick={()=>setTab(aba.id)} className="ex-tab" style={{
                width:"100%", textAlign:"left", padding:"10px 12px",
                borderRadius:8, marginBottom:4, cursor:"pointer", border:"none",
                background: ativo ? C.goldSoft : "transparent",
                borderLeft: `3px solid ${ativo ? C.gold : "transparent"}`,
                transition:"all 0.12s",
              }}>
                <span style={{fontSize:15,fontWeight:ativo?700:500,
                  color:ativo?C.gold:C.textMid}}>
                  {aba.label}
                </span>
                {aba.id==="rae" && lista.length>0 && (
                  <span style={{marginLeft:8,fontSize:12,fontWeight:700,fontFamily:MONO,
                    color:ativo?C.gold:C.textDim}}>
                    ({lista.length})
                  </span>
                )}
                {aba.id==="fusao" && cand.length>0 && (
                  <span style={{marginLeft:8,fontSize:12,fontWeight:700,fontFamily:MONO,
                    color:"#A78BFA"}}>
                    ({cand.length})
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </aside>

      {/* ── MAIN ───────────────────────────────────────────────────────────── */}
      <div style={{display:"flex",flexDirection:"column",flex:1,minWidth:0,height:"100%",overflow:"hidden"}}>

        {/* Topbar */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"0 22px", height:56,
          borderBottom:`1px solid ${C.border}`,
          background:C.surface, flexShrink:0,
        }}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{display:"flex",gap:6}}>
              {["#FF5F57","#FEBC2E","#28C840"].map(cor=>(
                <div key={cor} style={{width:12,height:12,borderRadius:"50%",background:cor}}/>
              ))}
            </div>
            <div>
              <div style={{fontSize:17,fontWeight:700,color:C.text}}>{abaAtual?.label}</div>
              <div style={{fontSize:13,color:C.textMid,fontFamily:MONO,marginTop:1}}>
                {tab==="rae" ? `${lista.length} extrato${lista.length!==1?"s":""} registrados`
                 : tab==="fusao" ? `${cand.length} candidato${cand.length!==1?"s":""} a fusão`
                 : "Submeta novo relato de campo"}
              </div>
            </div>
          </div>

          {/* Badge guardrail */}
          {tab==="novo" && (
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 14px",
              background:classSensivel?"rgba(251,146,60,0.1)":"rgba(96,165,250,0.08)",
              borderRadius:8,
              border:`1px solid ${classSensivel?"rgba(251,146,60,0.35)":"rgba(96,165,250,0.25)"}`}}>
              <span style={{width:7,height:7,borderRadius:"50%",
                background:classSensivel?"#FB923C":"#60A5FA"}}/>
              <span style={{fontSize:13,color:classSensivel?"#FDBA74":"#93C5FD",fontWeight:700,fontFamily:MONO}}>
                {classSensivel ? "Dado sensível · soberano" : "Dado público · nuvem"}
              </span>
            </div>
          )}
        </div>

        {/* Corpo */}
        <div className="ex-scroll" style={{flex:1,overflowY:"auto",padding:"20px 22px"}}>

          {/* ── ABA: NOVO EXTRATO ── */}
          {tab==="novo" && (
            <div style={{maxWidth:860,margin:"0 auto",width:"100%"}}>
              <SectionBar label="Registrar Extrato de Campo"/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                <Campo label="Data">
                  <input style={S.input} type="date" value={form.data} onChange={e=>set("data",e.target.value)}/>
                </Campo>
                <Campo label="Unidade">
                  <input style={S.input} placeholder="COMPAJ, CDPM I..." value={form.unidade} onChange={e=>set("unidade",e.target.value)}/>
                </Campo>
                <Campo label="Núcleo (origem)">
                  <input style={S.input} placeholder="NI, NCI, NBE..." value={form.nucleo} onChange={e=>set("nucleo",e.target.value)}/>
                </Campo>
                <Campo label="Autor">
                  <input style={S.input} placeholder="Agente responsável" value={form.autor} onChange={e=>set("autor",e.target.value)}/>
                </Campo>
              </div>
              <Campo label="Assunto">
                <input style={S.input} placeholder="Resumo do relato" value={form.assunto} onChange={e=>set("assunto",e.target.value)}/>
              </Campo>
              <Campo label="Tópicos (um por linha)">
                <textarea style={{...S.input,height:72,resize:"vertical"}} value={form.topicos}
                  onChange={e=>set("topicos",e.target.value)} placeholder={"banho de sol\nmenção a 'futebol'"}/>
              </Campo>
              <Campo label="Corpo do extrato (texto livre)">
                <textarea style={{...S.input,height:160,resize:"vertical",lineHeight:1.65}} value={form.corpo}
                  onChange={e=>set("corpo",e.target.value)} placeholder="Descreva o relato de campo desestruturado..."/>
              </Campo>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                <Campo label="Classificação do dado (guardrail)">
                  <select style={S.input} value={form.classificacao} onChange={e=>set("classificacao",e.target.value)}>
                    {(meta?.classificacoes||["teste","interno","reservado","sigiloso","secreto"]).map(c=>(
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Núcleos de destino (vírgula)">
                  <input style={S.input} placeholder="NI, NBE, NCI" value={form.nucleos_destino} onChange={e=>set("nucleos_destino",e.target.value)}/>
                </Campo>
              </div>

              {/* Guardrail box */}
              <div style={{marginTop:4,marginBottom:6,padding:"12px 16px",borderRadius:8,
                fontSize:14,lineHeight:1.6,color:C.text,
                background:classSensivel?"rgba(251,146,60,0.08)":"rgba(96,165,250,0.07)",
                border:`1px solid ${classSensivel?"rgba(251,146,60,0.3)":"rgba(96,165,250,0.25)"}`}}>
                {classSensivel
                  ? (localDown
                    ? <>🔒 <b>Dado sensível</b> e provedor local <b style={{color:C.red}}>offline</b>: o sistema vai RECUSAR o processamento para não vazar à nuvem.</>
                    : <>🔒 <b>Dado sensível</b>: será processado <b>somente no provedor local soberano</b>.</>)
                  : <>🌐 Classificação liberada para nuvem — processado via «{meta?.provedor_configurado||"groq"}».</>}
              </div>

              <button className="ex-btn" disabled={busy} onClick={submeter}
                style={{width:"100%",marginTop:8,padding:"13px",borderRadius:9,border:"none",
                  background:busy?"rgba(255,255,255,0.08)":`linear-gradient(135deg,${C.gold},#C9851A)`,
                  color:busy?C.textMid:"#1A1206",fontSize:15,fontWeight:800,
                  cursor:busy?"not-allowed":"pointer",opacity:busy?0.6:1}}>
                {busy?"Processando…":"Submeter e Extrair Inteligência"}
              </button>
            </div>
          )}

          {/* ── ABA: EXTRATOS & RAE ── */}
          {tab==="rae" && (
            <div style={{display:"flex",gap:16,height:"100%",minHeight:0}}>
              {/* Lista */}
              <div className="ex-scroll" style={{width:340,flexShrink:0,overflowY:"auto",paddingRight:4}}>
                <SectionBar label={`Extratos (${lista.length})`}/>
                {lista.length===0 && (
                  <div style={{fontSize:14,color:C.textDim,padding:"20px 4px",textAlign:"center",fontFamily:MONO}}>
                    Nenhum extrato ainda.
                  </div>
                )}
                {lista.map(e => {
                  const rk = RISK_COLORS[e.risk_nivel] || null
                  return (
                    <div key={e.id} className="ex-row" onClick={()=>abrirRae(e.id)} style={{
                      padding:"12px 14px", borderRadius:8,
                      border:`1px solid ${selId===e.id?"rgba(232,160,32,0.45)":C.border}`,
                      background:selId===e.id?"rgba(232,160,32,0.08)":"rgba(255,255,255,0.02)",
                      marginBottom:8,
                    }}>
                      <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
                        <span style={{fontSize:15,fontWeight:700,color:C.text,
                          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {e.assunto_sintetizado||e.assunto||e.id}
                        </span>
                        {rk && <span style={badge(rk.color,rk.bg,rk.border)}>
                          {e.risk_nivel}{e.risk_score?` · ${e.risk_score}`:""}
                        </span>}
                      </div>
                      <div style={{display:"flex",gap:8,marginTop:7,flexWrap:"wrap",alignItems:"center"}}>
                        <Tag>{e.unidade||"—"}</Tag>
                        {classifTag(e.classificacao)}
                        {e.status==="erro" && <span style={{fontSize:13,color:C.red}}>● erro</span>}
                        {e.bloqueado && <span style={{fontSize:13,color:C.red}}>🔒 bloqueado</span>}
                        {e.forcado_local && <span style={{fontSize:13,color:C.green}}>🔒 local</span>}
                        <span style={{fontSize:13,color:C.textDim,fontFamily:MONO,marginLeft:"auto"}}>
                          {(e.criado_em||"").slice(0,10)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Detalhe RAE */}
              <div className="ex-scroll" style={{flex:1,minWidth:0,overflowY:"auto",
                background:"rgba(255,255,255,0.02)",border:`1px solid ${C.border}`,
                borderRadius:10,padding:"20px 22px"}}>
                {!selId && (
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",
                    height:"100%",color:C.textDim,fontSize:15,fontFamily:MONO}}>
                    Selecione um extrato para ver o RAE.
                  </div>
                )}
                {selId && !sel && (
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",
                    height:"100%",color:C.textDim,fontSize:15,fontFamily:MONO}}>
                    Carregando RAE…
                  </div>
                )}
                {sel && (
                  <RaeView rae={sel}
                    onPdf={()=>baixarPdf(selId)}
                    onGrafo={()=>{ if(selId) localStorage.setItem("grafo_foco_alvo",`extrato_${selId}`); onNavigate?.("Análise de Vínculo") }}
                    onReproc={()=>reprocessar(selId)}
                    busy={busy}/>
                )}
              </div>
            </div>
          )}

          {/* ── ABA: FUSÃO ── */}
          {tab==="fusao" && (
            <div style={{maxWidth:960,margin:"0 auto",width:"100%"}}>
              <SectionBar label={`Candidatos a Fusão de Homônimos (${cand.length})`}/>
              <div style={{marginBottom:16,padding:"12px 16px",borderRadius:8,fontSize:14,
                color:C.textMid,lineHeight:1.55,
                background:"rgba(167,139,250,0.07)",border:"1px solid rgba(167,139,250,0.22)"}}>
                Sugestões de pessoas que <b style={{color:C.text}}>parecem ser a mesma</b>. A fusão é <b style={{color:C.text}}>manual</b> — nada é unido sem seu clique. Escolha qual nó manter (o outro é absorvido com seus vínculos).
              </div>
              {cand.length===0 && (
                <div style={{fontSize:14,color:C.textDim,padding:"30px",textAlign:"center",fontFamily:MONO}}>
                  Nenhum homônimo provável no momento.
                </div>
              )}
              {cand.map((p,i)=>(
                <div key={i} className="ex-card" style={{padding:"16px 18px",borderRadius:10,
                  border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.02)",marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <span style={badge("#A78BFA","rgba(167,139,250,0.14)","rgba(167,139,250,0.4)")}>
                      score {p.score}
                    </span>
                    <span style={{fontSize:14,color:C.textMid,fontFamily:MONO}}>{p.motivo}</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:14,alignItems:"center"}}>
                    <NoFusao no={p.a}/>
                    <span style={{color:C.gold,fontSize:20}}>⇄</span>
                    <NoFusao no={p.b}/>
                  </div>
                  <div style={{display:"flex",gap:10,marginTop:14,justifyContent:"center",flexWrap:"wrap"}}>
                    <button className="ex-btn" disabled={busy} onClick={()=>fundir(p.a.id,p.b.id)}
                      style={{padding:"9px 16px",borderRadius:7,
                        border:`1px solid ${C.goldBorder}`,background:C.goldSoft,
                        color:C.gold,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:MONO}}>
                      Manter «{p.a.rotulo}» ← absorver B
                    </button>
                    <button className="ex-btn" disabled={busy} onClick={()=>fundir(p.b.id,p.a.id)}
                      style={{padding:"9px 16px",borderRadius:7,
                        border:`1px solid ${C.goldBorder}`,background:C.goldSoft,
                        color:C.gold,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:MONO}}>
                      Manter «{p.b.rotulo}» ← absorver A
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{position:"fixed",bottom:26,left:"50%",transform:"translateX(-50%)",
          background:"#0A0F1C",border:`1px solid ${toast.cor}`,borderRadius:10,
          padding:"12px 22px",fontSize:14,fontWeight:700,fontFamily:MONO,
          zIndex:9999,boxShadow:"0 8px 30px rgba(0,0,0,0.5)",
          maxWidth:"80%",textAlign:"center",color:toast.cor}}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

const S = {
  input:{
    width:"100%",background:"rgba(255,255,255,0.05)",
    border:`1px solid rgba(255,255,255,0.13)`,
    borderRadius:7,padding:"10px 13px",fontSize:15,
    color:"#F1F5F9",outline:"none",fontFamily:SANS,caretColor:"#E8A020",
    boxSizing:"border-box",
  },
}
