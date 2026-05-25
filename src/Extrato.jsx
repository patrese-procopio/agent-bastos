import { useState, useEffect, useCallback } from "react"
import api from "./api"
import { C, MONO, SANS, RISK_COLORS, riskColor } from "./theme"

/* ============================================================
   MÓDULO EXTRATO — submissão, RAE e fusão de homônimos
   Alimenta o grafo i2 (Análise de Vínculo), o Léxico de Sinais
   Fracos e a Matriz de Calor dos NUCADIs.
   ============================================================ */

const CSS = `
  .ex-tab:hover { color:#F1F5F9 !important; }
  .ex-row:hover { background: rgba(232,160,32,0.06) !important; cursor:pointer; }
  .ex-btn { transition: all .12s; }
  .ex-btn:hover { filter: brightness(1.12); transform: translateY(-1px); }
  .ex-card:hover { border-color: rgba(232,160,32,0.3) !important; }
`

const CLASSIF_COR = {
  teste:     { c:"#4ADE80", b:"rgba(74,222,128,0.12)" },
  sintetico: { c:"#4ADE80", b:"rgba(74,222,128,0.12)" },
  publico:   { c:"#60A5FA", b:"rgba(96,165,250,0.12)" },
  interno:   { c:"#FBBF24", b:"rgba(251,191,36,0.12)" },
  reservado: { c:"#FB923C", b:"rgba(251,146,60,0.12)" },
  sigiloso:  { c:"#F87171", b:"rgba(239,68,68,0.12)" },
  secreto:   { c:"#F87171", b:"rgba(239,68,68,0.16)" },
}
const TIPO_ICONE = {
  pessoa:"👤", local:"🏛️", faccao:"🏴", crime:"🔫", juridico:"⚖️", documento:"📄",
  social:"🤝", geografia:"🌎", financeiro:"💰", organizacao:"🏢", evento:"⚡", generico:"⚪",
}

export default function Extrato({ onNavigate }) {
  const [tab, setTab]         = useState("novo")
  const [meta, setMeta]       = useState(null)
  const [lista, setLista]     = useState([])
  const [sel, setSel]         = useState(null)       // RAE dados
  const [selId, setSelId]     = useState(null)
  const [busy, setBusy]       = useState(false)
  const [toast, setToast]     = useState(null)
  const [cand, setCand]       = useState([])

  const [form, setForm] = useState({
    data: new Date().toISOString().slice(0,10),
    unidade:"", nucleo:"", autor:"", assunto:"",
    topicos:"", corpo:"", classificacao:"reservado", nucleos_destino:"",
  })

  const aviso = (msg, cor=C.gold) => { setToast({msg,cor}); setTimeout(()=>setToast(null), 3200) }

  useEffect(() => {
    const s = document.createElement("style"); s.textContent = CSS
    document.head.appendChild(s); return () => document.head.removeChild(s)
  }, [])

  const carregarMeta = useCallback(async () => {
    try { const r = await api.get("/extrato/meta"); if (r.ok) setMeta(await r.json()) } catch {}
  }, [])
  const carregarLista = useCallback(async () => {
    try { const r = await api.get("/extrato/listar"); if (r.ok) setLista((await r.json()).extratos||[]) } catch {}
  }, [])
  const carregarCand = useCallback(async () => {
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
      if (!r.ok) { aviso(d?.detail?.erro || d?.detail || "Falha no processamento.", C.red); setBusy(false); return }
      const proc = d.processamento || {}
      if (!proc.ok) {
        aviso(proc.bloqueado ? "🔒 Bloqueado pelo guardrail de soberania (provedor local indisponível)." :
              (proc.erro || "Falha na extração."), C.red)
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
      else { const d=await r.json(); aviso(d?.detail?.erro || "Falha ao reprocessar.", C.red) }
    } catch { aviso("Erro de conexão.", C.red) }
    setBusy(false)
  }

  const baixarPdf = async (eid) => {
    try {
      const r = await api.get(`/extrato/${eid}/rae.pdf`)
      if (!r.ok) return aviso("Falha ao gerar PDF.", C.red)
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a"); a.href = url; a.download = `RAE_${eid}.pdf`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      carregarLista()
    } catch { aviso("Erro ao baixar PDF.", C.red) }
  }

  const fundir = async (manter_id, fundir_id) => {
    setBusy(true)
    try {
      const r = await api.post("/extrato/fusao/confirmar", { manter_id, fundir_id })
      if (r.ok) { aviso("Entidades fundidas.", C.green); carregarCand() }
      else { const d=await r.json(); aviso(d?.detail || "Falha na fusão.", C.red) }
    } catch { aviso("Erro de conexão.", C.red) }
    setBusy(false)
  }

  const set = (k,v) => setForm(f=>({...f, [k]:v}))
  const localDown = meta && !meta.ollama_disponivel
  const classSensivel = !["teste","sintetico","publico"].includes(form.classificacao)

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div>
          <div style={S.title}>Módulo Extrato</div>
          <div style={S.sub}>
            Extração de inteligência · grafo i2 · proveniência ·
            {meta ? <span style={{color: meta.ollama_disponivel ? C.green : C.textMid}}>
              {" "}local {meta.ollama_disponivel ? "online" : "offline"} · provedor «{meta.provedor_configurado}»
            </span> : " ..."}
          </div>
        </div>
        <div style={S.tabs}>
          {[["novo","Novo Extrato"],["rae","Extratos & RAE"],["fusao","Fusão de Homônimos"]].map(([k,l])=>(
            <button key={k} className="ex-tab" onClick={()=>setTab(k)}
              style={{...S.tab, ...(tab===k?S.tabActive:{})}}>{l}</button>
          ))}
        </div>
      </header>

      <div style={S.body}>
        {tab==="novo" && (
          <div style={{maxWidth:880, margin:"0 auto", width:"100%"}}>
            <SectionBar label="Registrar Extrato de Campo" />
            <div style={S.grid2}>
              <Campo label="Data"><input style={S.input} type="date" value={form.data} onChange={e=>set("data",e.target.value)}/></Campo>
              <Campo label="Unidade"><input style={S.input} placeholder="COMPAJ, CDPM I..." value={form.unidade} onChange={e=>set("unidade",e.target.value)}/></Campo>
              <Campo label="Núcleo (origem)"><input style={S.input} placeholder="NI, NCI, NBE..." value={form.nucleo} onChange={e=>set("nucleo",e.target.value)}/></Campo>
              <Campo label="Autor"><input style={S.input} placeholder="Agente responsável" value={form.autor} onChange={e=>set("autor",e.target.value)}/></Campo>
            </div>
            <Campo label="Assunto"><input style={S.input} placeholder="Resumo do relato" value={form.assunto} onChange={e=>set("assunto",e.target.value)}/></Campo>
            <Campo label="Tópicos (um por linha)">
              <textarea style={{...S.input, height:70, resize:"vertical"}} value={form.topicos} onChange={e=>set("topicos",e.target.value)} placeholder="banho de sol&#10;menção a 'futebol'"/>
            </Campo>
            <Campo label="Corpo do extrato (texto livre)">
              <textarea style={{...S.input, height:160, resize:"vertical", lineHeight:1.6}} value={form.corpo} onChange={e=>set("corpo",e.target.value)} placeholder="Descreva o relato de campo desestruturado..."/>
            </Campo>
            <div style={S.grid2}>
              <Campo label="Classificação do dado (guardrail)">
                <select style={S.input} value={form.classificacao} onChange={e=>set("classificacao",e.target.value)}>
                  {(meta?.classificacoes || ["teste","interno","reservado","sigiloso","secreto"]).map(c=>(
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Campo>
              <Campo label="Núcleos de destino (vírgula)"><input style={S.input} placeholder="NI, NBE, NCI" value={form.nucleos_destino} onChange={e=>set("nucleos_destino",e.target.value)}/></Campo>
            </div>

            <div style={S.guardBox(classSensivel)}>
              {classSensivel ? (localDown
                ? <>🔒 <b>Dado sensível</b> e provedor local <b style={{color:C.red}}>offline</b>: o sistema vai RECUSAR o processamento para não vazar à nuvem. Suba o Ollama ou use classificação «teste».</>
                : <>🔒 <b>Dado sensível</b>: será processado <b>somente no provedor local soberano</b> (não sai para a nuvem).</>)
                : <>🌐 Classificação liberada para nuvem — processado via «{meta?.provedor_configurado||"groq"}». Use apenas com dado <b>sintético/público</b>.</>}
            </div>

            <button className="ex-btn" disabled={busy} onClick={submeter}
              style={{...S.primary, opacity:busy?0.6:1}}>
              {busy ? "Processando…" : "Submeter e Extrair Inteligência"}
            </button>
          </div>
        )}

        {tab==="rae" && (
          <div style={S.split}>
            <div style={S.listaWrap}>
              <SectionBar label={`Extratos (${lista.length})`} />
              {lista.length===0 && <div style={S.vazio}>Nenhum extrato ainda.</div>}
              {lista.map(e=>{
                const rk = RISK_COLORS[e.risk_nivel] || null
                return (
                  <div key={e.id} className="ex-row" onClick={()=>abrirRae(e.id)}
                    style={{...S.itemRow, ...(selId===e.id?{background:"rgba(232,160,32,0.1)",borderColor:C.goldBorder}:{})}}>
                    <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
                      <span style={{fontSize:13.5,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {e.assunto_sintetizado || e.assunto || e.id}
                      </span>
                      {rk && <span style={badge(rk.color,rk.bg,rk.border)}>{e.risk_nivel} {e.risk_score?`· ${e.risk_score}`:""}</span>}
                    </div>
                    <div style={{display:"flex",gap:8,marginTop:5,flexWrap:"wrap",alignItems:"center"}}>
                      <Tag>{e.unidade||"—"}</Tag>
                      {classifTag(e.classificacao)}
                      {e.status==="erro" && <span style={{fontSize:10.5,color:C.red}}>● erro</span>}
                      {e.bloqueado && <span style={{fontSize:10.5,color:C.red}}>🔒 bloqueado</span>}
                      {e.forcado_local && <span style={{fontSize:10.5,color:C.green}}>🔒 local</span>}
                      <span style={{fontSize:10.5,color:C.textDim,fontFamily:MONO,marginLeft:"auto"}}>{(e.criado_em||"").slice(0,10)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={S.raeWrap}>
              {!selId && <div style={S.vazioBig}>Selecione um extrato para ver o RAE.</div>}
              {selId && !sel && <div style={S.vazioBig}>Carregando RAE…</div>}
              {sel && <RaeView rae={sel} onPdf={()=>baixarPdf(selId)} onGrafo={()=>{ if(selId) localStorage.setItem("grafo_foco_alvo", `extrato_${selId}`); onNavigate?.("Análise de Vínculo") }} onReproc={()=>reprocessar(selId)} busy={busy}/>}
            </div>
          </div>
        )}

        {tab==="fusao" && (
          <div style={{maxWidth:980, margin:"0 auto", width:"100%"}}>
            <SectionBar label={`Candidatos a Fusão de Homônimos (${cand.length})`} />
            <div style={S.fusaoHint}>
              Sugestões de pessoas que <b>parecem ser a mesma</b>. A fusão é <b>manual</b> — nada é unido sem seu clique.
              Escolha qual nó manter (o outro é absorvido com seus vínculos).
            </div>
            {cand.length===0 && <div style={S.vazio}>Nenhum homônimo provável no momento.</div>}
            {cand.map((p,i)=>(
              <div key={i} className="ex-card" style={S.fusaoCard}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <span style={badge("#A78BFA","rgba(167,139,250,0.14)","rgba(167,139,250,0.4)")}>score {p.score}</span>
                  <span style={{fontSize:12,color:C.textMid,fontFamily:MONO}}>{p.motivo}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:12,alignItems:"center"}}>
                  <NoFusao no={p.a}/>
                  <span style={{color:C.gold,fontSize:18}}>⇄</span>
                  <NoFusao no={p.b}/>
                </div>
                <div style={{display:"flex",gap:10,marginTop:12,justifyContent:"center"}}>
                  <button className="ex-btn" disabled={busy} onClick={()=>fundir(p.a.id, p.b.id)} style={S.fundeBtn}>Manter «{p.a.rotulo}» ← absorver B</button>
                  <button className="ex-btn" disabled={busy} onClick={()=>fundir(p.b.id, p.a.id)} style={S.fundeBtn}>Manter «{p.b.rotulo}» ← absorver A</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && <div style={{...S.toast, borderColor:toast.cor, color:toast.cor}}>{toast.msg}</div>}
    </div>
  )
}

/* ── Subcomponentes ── */
function RaeView({ rae, onPdf, onGrafo, onReproc, busy }) {
  const rk = RISK_COLORS[rae.risk_nivel] || RISK_COLORS.MÉDIO
  const ex = rae.extrato || {}
  return (
    <div className="fade-in">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:240}}>
          <div style={{fontSize:10.5,color:C.gold,fontFamily:MONO,letterSpacing:"0.1em"}}>RELATÓRIO ANALÍTICO DE EXTRATO · {ex.id}</div>
          <div style={{fontSize:17,fontWeight:800,color:C.text,marginTop:3}}>{rae.assunto_sintetizado || ex.assunto || "—"}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:26,fontWeight:900,color:rk.color,lineHeight:1}}>{rae.risk_score ?? "—"}</div>
            <div style={badge(rk.color,rk.bg,rk.border)}>{rae.risk_nivel}</div>
          </div>
        </div>
      </div>

      <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
        <Tag>{ex.unidade||"—"}</Tag>{classifTag(ex.classificacao)}
        <Tag>{ex.provedor||"—"} / {ex.modelo||"—"}</Tag>
        {ex.forcado_local && <span style={badge(C.green,"rgba(74,222,128,0.12)","rgba(74,222,128,0.3)")}>🔒 LOCAL SOBERANO</span>}
      </div>

      {ex.corpo && (
        <Bloco titulo="Texto integral do extrato (preservado na íntegra)">
          <div style={{whiteSpace:"pre-wrap",fontSize:13,color:C.text,lineHeight:1.65,background:"rgba(255,255,255,0.02)",border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px",maxHeight:260,overflowY:"auto"}}>{ex.corpo}</div>
        </Bloco>
      )}

      <Bloco titulo="Avaliação de Risco">
        <div style={{fontSize:13.5,color:C.text,lineHeight:1.6}}>{rae.justificativa_risco || "—"}
          {rae.risco_forcado ? <span style={{color:C.gold}}> · piso aplicado por palavra-crítica.</span> : null}</div>
      </Bloco>

      <Bloco titulo={`Entidades-chave (${(rae.entidades||[]).length})`}>
        {(rae.entidades||[]).map((e,i)=>(
          <div key={i} style={S.entRow}>
            <span style={{fontSize:16}}>{TIPO_ICONE[e.tipo]||"⚪"}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13.5,fontWeight:700,color:C.text}}>{e.rotulo}
                <span style={{fontSize:11,color:C.textDim,fontWeight:500,marginLeft:6,fontFamily:MONO}}>{e.tipo}</span></div>
              <div style={{fontSize:12,color:C.textMid}}>{e.papel||"—"}</div>
              {e.evidencia && <div style={S.evid} title={e.evidencia}>“{e.evidencia}”</div>}
            </div>
            <span title={e.evidencia_ok?"trecho-fonte conferido":"sem correspondência exata — revisar"}
              style={{fontSize:13,color:e.evidencia_ok?C.green:"#FBBF24",flexShrink:0}}>
              {e.evidencia_ok?"✓":"⚠"}</span>
          </div>
        ))}
      </Bloco>

      {(rae.conexoes||[]).length>0 && (
        <Bloco titulo={`Vínculos detectados (${rae.conexoes.length})`}>
          {rae.conexoes.map((c,i)=>(
            <div key={i} style={{fontSize:12.5,color:C.text,fontFamily:MONO,padding:"3px 0"}}>
              <b>{c.source}</b> <span style={{color:C.gold}}>—{c.relation}→</span> <b>{c.target}</b>
              <span style={{color:C.textDim}}> (peso {c.weight})</span></div>
          ))}
        </Bloco>
      )}

      {(rae.jargoes||[]).length>0 && (
        <Bloco titulo={`Sinais fracos / jargões (${rae.jargoes.length})`}>
          {rae.jargoes.map((j,i)=>(
            <div key={i} style={{fontSize:13,color:C.text,padding:"3px 0"}}>
              <b style={{color:"#FBBF24"}}>«{j.termo}»</b> ≈ {j.significado_provavel}</div>
          ))}
        </Bloco>
      )}

      {(rae.tags||[]).length>0 && (
        <div style={{marginTop:10,display:"flex",gap:6,flexWrap:"wrap"}}>
          {rae.tags.map((t,i)=><span key={i} style={S.tagPill}>#{t}</span>)}
        </div>
      )}

      <div style={S.provBar}>
        Proveniência: <b style={{color:C.green}}>{rae.evidencias_ok}/{rae.evidencias_total}</b> itens com trecho-fonte conferido.
      </div>

      <div style={{display:"flex",gap:10,marginTop:14,flexWrap:"wrap"}}>
        <button className="ex-btn" onClick={onPdf} style={S.actGold}>⬇ Baixar RAE (PDF)</button>
        <button className="ex-btn" onClick={onGrafo} style={S.actBlue}>🕸 Ver no Grafo de Vínculos</button>
        <button className="ex-btn" disabled={busy} onClick={onReproc} style={S.actGhost}>↻ Reprocessar</button>
      </div>
    </div>
  )
}

const NoFusao = ({no}) => (
  <div style={S.noFusao}>
    <div style={{fontSize:13.5,fontWeight:700,color:C.text}}>👤 {no.rotulo}</div>
    <div style={{fontSize:11.5,color:C.textMid,fontFamily:MONO,marginTop:3}}>
      {no.nome||"—"}{no.vulgo?` · ${no.vulgo}`:""}</div>
    <div style={{fontSize:11,color:C.textDim,marginTop:3}}>
      {no.faccao||"—"} · {no.unidade||"—"} · {no.vinculos} vínculos · {no.origem}</div>
  </div>
)

const SectionBar = ({label}) => (
  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
    <span style={{width:3,height:16,background:C.gold,borderRadius:2,boxShadow:"0 0 8px rgba(232,160,32,0.5)"}}/>
    <h2 style={{fontSize:12,fontWeight:800,color:C.gold,letterSpacing:"0.12em",textTransform:"uppercase",margin:0}}>{label}</h2>
  </div>
)
const Campo = ({label,children}) => (
  <div style={{marginBottom:12}}>
    <div style={{fontSize:10.5,fontWeight:700,color:C.textDim,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:MONO,marginBottom:5}}>{label}</div>
    {children}
  </div>
)
const Bloco = ({titulo,children}) => (
  <div style={{marginTop:14}}>
    <div style={{fontSize:11,fontWeight:800,color:C.textMid,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6,fontFamily:MONO}}>{titulo}</div>
    {children}
  </div>
)
const Tag = ({children}) => <span style={S.tag}>{children}</span>
const badge = (color,bg,border) => ({fontSize:10,fontWeight:800,padding:"2px 8px",borderRadius:4,letterSpacing:"0.05em",fontFamily:MONO,color,background:bg,border:`1px solid ${border}`,whiteSpace:"nowrap"})
const classifTag = (c) => {
  const cc = CLASSIF_COR[c] || {c:C.textMid,b:"rgba(255,255,255,0.06)"}
  return <span style={badge(cc.c,cc.b,cc.c+"55")}>{(c||"—").toUpperCase()}</span>
}

/* ── Estilos ── */
const S = {
  page:{display:"flex",flexDirection:"column",flex:1,minWidth:0,height:"100%",overflow:"hidden",background:C.bg,fontFamily:SANS},
  header:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,padding:"14px 22px",borderBottom:`1px solid ${C.border}`,background:C.surface,flexShrink:0,flexWrap:"wrap"},
  title:{fontSize:17,fontWeight:800,color:C.text,letterSpacing:"-0.01em"},
  sub:{fontSize:11.5,color:C.textMid,fontFamily:MONO,marginTop:2},
  tabs:{display:"flex",gap:4,background:"rgba(255,255,255,0.03)",padding:4,borderRadius:9,border:`1px solid ${C.border}`},
  tab:{padding:"7px 14px",borderRadius:6,fontSize:12.5,fontWeight:600,color:C.textMid,background:"transparent",border:"none",cursor:"pointer",fontFamily:MONO},
  tabActive:{background:C.goldSoft,color:C.gold,boxShadow:"inset 0 0 0 1px rgba(232,160,32,0.3)"},
  body:{flex:1,overflowY:"auto",padding:"18px 22px"},
  grid2:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12},
  input:{width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${C.borderUp}`,borderRadius:7,padding:"9px 12px",fontSize:13.5,color:C.text,outline:"none",fontFamily:SANS,caretColor:C.gold},
  primary:{width:"100%",marginTop:8,padding:"12px",borderRadius:9,border:"none",background:`linear-gradient(135deg,${C.gold},#C9851A)`,color:"#1A1206",fontSize:14,fontWeight:800,cursor:"pointer",letterSpacing:"0.02em"},
  guardBox:(sens)=>({marginTop:6,marginBottom:6,padding:"10px 14px",borderRadius:8,fontSize:12.5,lineHeight:1.5,color:C.text,background:sens?"rgba(251,146,60,0.08)":"rgba(96,165,250,0.07)",border:`1px solid ${sens?"rgba(251,146,60,0.3)":"rgba(96,165,250,0.25)"}`}),
  split:{display:"flex",gap:16,height:"100%",minHeight:0},
  listaWrap:{width:340,flexShrink:0,overflowY:"auto",paddingRight:4},
  raeWrap:{flex:1,minWidth:0,overflowY:"auto",background:"rgba(255,255,255,0.02)",border:`1px solid ${C.border}`,borderRadius:10,padding:"18px 20px"},
  itemRow:{padding:"10px 12px",borderRadius:8,border:`1px solid ${C.border}`,marginBottom:8,background:"rgba(255,255,255,0.02)"},
  tag:{fontSize:10.5,color:C.textMid,fontFamily:MONO,background:"rgba(255,255,255,0.05)",padding:"2px 7px",borderRadius:4,border:`1px solid ${C.border}`},
  tagPill:{fontSize:11,color:C.gold,fontFamily:MONO,background:C.goldSoft,padding:"2px 8px",borderRadius:10,border:`1px solid ${C.goldBorder}`},
  vazio:{fontSize:12.5,color:C.textDim,padding:"20px 4px",textAlign:"center",fontFamily:MONO},
  vazioBig:{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:C.textDim,fontSize:13,fontFamily:MONO},
  entRow:{display:"flex",gap:10,alignItems:"flex-start",padding:"8px 0",borderBottom:`1px solid ${C.border}`},
  evid:{fontSize:11.5,color:C.textMid,fontStyle:"italic",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"},
  provBar:{marginTop:14,padding:"9px 12px",borderRadius:7,background:"rgba(74,222,128,0.06)",border:"1px solid rgba(74,222,128,0.2)",fontSize:12.5,color:C.text},
  actGold:{padding:"10px 16px",borderRadius:8,border:`1px solid ${C.goldBorder}`,background:C.goldSoft,color:C.gold,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:MONO},
  actBlue:{padding:"10px 16px",borderRadius:8,border:"1px solid rgba(56,189,248,0.4)",background:"rgba(56,189,248,0.1)",color:"#38BDF8",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:MONO},
  actGhost:{padding:"10px 16px",borderRadius:8,border:`1px solid ${C.borderUp}`,background:"rgba(255,255,255,0.04)",color:C.textMid,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:MONO},
  fusaoHint:{fontSize:12.5,color:C.textMid,lineHeight:1.5,marginBottom:14,padding:"10px 14px",background:"rgba(167,139,250,0.07)",border:"1px solid rgba(167,139,250,0.22)",borderRadius:8},
  fusaoCard:{padding:"14px 16px",borderRadius:10,border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.02)",marginBottom:12},
  noFusao:{padding:"10px 12px",borderRadius:8,background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`},
  fundeBtn:{padding:"8px 14px",borderRadius:7,border:`1px solid ${C.goldBorder}`,background:C.goldSoft,color:C.gold,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:MONO},
  toast:{position:"fixed",bottom:26,left:"50%",transform:"translateX(-50%)",background:"#0A0F1C",border:"1px solid",borderRadius:10,padding:"12px 20px",fontSize:13,fontWeight:600,fontFamily:MONO,zIndex:9999,boxShadow:"0 8px 30px rgba(0,0,0,0.5)",maxWidth:"80%",textAlign:"center"},
}
