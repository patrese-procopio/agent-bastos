import { useState, useEffect, useCallback, useRef } from "react"
import api from "./api"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const C = {
  bg:        "#0B1120",
  surface:   "#111827",
  surfaceUp: "#1A2236",
  border:    "rgba(255,255,255,0.07)",
  borderUp:  "rgba(255,255,255,0.13)",
  gold:      "#E8A020",
  goldSoft:  "rgba(232,160,32,0.15)",
  text:      "#F1F5F9",
  textMid:   "#94A3B8",
  textDim:   "rgba(255,255,255,0.35)",
  green:     "#22C55E",
  greenSoft: "rgba(34,197,94,0.12)",
  red:       "#EF4444",
  redSoft:   "rgba(239,68,68,0.12)",
  amber:     "#F59E0B",
  amberSoft: "rgba(245,158,11,0.12)",
}

const HITL_CSS = `
  @keyframes fadeSlideIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pulse-pending { 0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,0)} 60%{box-shadow:0 0 0 5px rgba(245,158,11,0.18)} }
  @keyframes spin { to{transform:rotate(360deg)} }
  @keyframes countdown-shrink { from{width:100%} to{width:0%} }
  .hitl-card { animation: fadeSlideIn 0.22s ease forwards; }
  .hitl-pending { animation: pulse-pending 2.5s ease-in-out infinite; }
  .hitl-spin { animation: spin 0.9s linear infinite; }
  .hitl-btn:hover { filter: brightness(1.15); transform: translateY(-1px); }
  .hitl-btn:active { transform: scale(0.97); }
  .hitl-row:hover { background: rgba(255,255,255,0.03) !important; }
  ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:4px}
`

const RISCO = {
  CRITICO: { label:"CRÍTICO", color:"#F87171", bg:"rgba(239,68,68,0.15)", border:"rgba(239,68,68,0.35)" },
  ALTO:    { label:"ALTO",    color:"#FBBF24", bg:"rgba(251,191,36,0.12)", border:"rgba(251,191,36,0.3)" },
  MÉDIO:   { label:"MÉDIO",   color:"#60A5FA", bg:"rgba(96,165,250,0.12)", border:"rgba(96,165,250,0.3)" },
}
const risco = (r) => RISCO[r?.toUpperCase().replace("Í","I")] || RISCO.ALTO

const STATUS_CFG = {
  pendente:   { label:"AGUARDANDO", color:"#F59E0B", bg:"rgba(245,158,11,0.12)", dot:"#F59E0B" },
  confirmada: { label:"CONFIRMADA", color:"#22C55E", bg:"rgba(34,197,94,0.12)",  dot:"#22C55E" },
  rejeitada:  { label:"REJEITADA",  color:"#EF4444", bg:"rgba(239,68,68,0.12)",  dot:"#EF4444" },
  expirada:   { label:"EXPIRADA",   color:"#94A3B8", bg:"rgba(148,163,184,0.1)", dot:"#94A3B8" },
}

function statusCfg(s) { return STATUS_CFG[s] || STATUS_CFG.expirada }

function fmtDate(iso) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("pt-BR", {
    day:"2-digit", month:"2-digit", year:"numeric",
    hour:"2-digit", minute:"2-digit",
    timeZone:"America/Manaus",
  })
}

function tempoAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff < 60)    return `${diff}s atrás`
  if (diff < 3600)  return `${Math.floor(diff/60)}min atrás`
  if (diff < 86400) return `${Math.floor(diff/3600)}h atrás`
  return `${Math.floor(diff/86400)}d atrás`
}

// Calcula % do tempo expirado (assume timeout de 60min)
function progressoPendencia(criado_em, timeoutMin=60) {
  const elapsed = (Date.now() - new Date(criado_em)) / 1000 / 60
  return Math.min(100, (elapsed / timeoutMin) * 100)
}

function minutosRestantes(criado_em, timeoutMin=60) {
  const elapsed = (Date.now() - new Date(criado_em)) / 1000 / 60
  const rest = Math.max(0, timeoutMin - elapsed)
  if (rest < 1) return "< 1 min"
  return `${Math.floor(rest)} min`
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function HitlDashboard() {
  const [aprovacoes, setAprovacoes]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [erro, setErro]               = useState(null)
  const [acao, setAcao]               = useState({})   // { [id]: "confirmando"|"rejeitando"|null }
  const [confirmModal, setConfirmModal] = useState(null) // { id, decisao, descricao }
  const [tick, setTick]               = useState(0)    // força re-render para countdown
  const intervalRef                   = useRef(null)

  const carregar = useCallback(async () => {
    try {
      const res  = await api.get("/human-loop/listar?limite=100")
      const data = await res.json()
      setAprovacoes(data.aprovacoes || [])
      setErro(null)
    } catch(e) {
      setErro("Falha ao carregar aprovações.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const style = document.createElement("style")
    style.textContent = HITL_CSS
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  useEffect(() => {
    carregar()
    intervalRef.current = setInterval(carregar, 10_000)
    return () => clearInterval(intervalRef.current)
  }, [carregar])

  // Atualiza countdown a cada 15s sem recarregar do backend
  useEffect(() => {
    const t = setInterval(() => setTick(x => x+1), 15_000)
    return () => clearInterval(t)
  }, [])

  async function decidir(id, decisao) {
    setAcao(prev => ({ ...prev, [id]: decisao === "confirmada" ? "confirmando" : "rejeitando" }))
    try {
      await api.post(`/human-loop/decidir/${id}`, {
        decisao,
        resposta_por: "dashboard",
        observacao:   `Respondido via Dashboard — ${decisao}`,
      })
      await carregar()
    } catch(e) {
      alert("Falha ao registrar decisão. Tente novamente.")
    } finally {
      setAcao(prev => ({ ...prev, [id]: null }))
      setConfirmModal(null)
    }
  }

  const pendentes   = aprovacoes.filter(a => a.status === "pendente")
  const historico   = aprovacoes.filter(a => a.status !== "pendente")

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:C.bg,fontFamily:SANS,color:C.text,overflow:"hidden"}}>

      {/* ── Topbar ── */}
      <header style={{height:52,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",
        justifyContent:"space-between",padding:"0 22px",background:C.surface,flexShrink:0,
        boxShadow:"0 1px 0 rgba(232,160,32,0.08)"}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div>
            <div style={{fontSize:17,fontWeight:700,letterSpacing:"-0.01em"}}>Dashboard HITL</div>
            <div style={{fontSize:12,color:C.textMid,fontFamily:MONO,marginTop:1}}>
              Human-in-the-Loop · Aprovações em tempo real
            </div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {pendentes.length > 0 && (
            <div style={{display:"flex",alignItems:"center",gap:7,padding:"5px 14px",
              background:"rgba(245,158,11,0.12)",borderRadius:20,border:"1px solid rgba(245,158,11,0.35)"}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:C.amber,
                boxShadow:"0 0 6px rgba(245,158,11,0.8)",animation:"pulse-pending 2s ease-in-out infinite"}}/>
              <span style={{fontSize:13,color:C.amber,fontWeight:700,fontFamily:MONO}}>
                {pendentes.length} PENDENTE{pendentes.length > 1 ? "S" : ""}
              </span>
            </div>
          )}
          <button onClick={carregar} title="Atualizar"
            style={{width:34,height:34,borderRadius:8,border:`1px solid ${C.border}`,
              background:"rgba(255,255,255,0.05)",cursor:"pointer",color:C.textMid,
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,
              transition:"all 0.15s"}}>
            ↻
          </button>
        </div>
      </header>

      <div style={{flex:1,overflow:"auto",padding:"18px 22px",display:"flex",flexDirection:"column",gap:20}}>

        {/* ── Estado de loading/erro ── */}
        {loading && (
          <div style={{display:"flex",alignItems:"center",gap:10,color:C.textMid,fontSize:14,fontFamily:MONO}}>
            <div style={{width:14,height:14,border:"2px solid rgba(255,255,255,0.15)",
              borderTopColor:C.gold,borderRadius:"50%"}} className="hitl-spin"/>
            Carregando aprovações...
          </div>
        )}
        {erro && (
          <div style={{padding:"12px 16px",borderRadius:10,background:C.redSoft,
            border:"1px solid rgba(239,68,68,0.3)",color:"#FCA5A5",fontSize:14}}>{erro}</div>
        )}

        {/* ══ PENDENTES ══ */}
        <section>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <div style={{width:3,height:16,background:C.amber,borderRadius:2,boxShadow:`0 0 8px ${C.amber}88`}}/>
            <span style={{fontSize:11.5,fontWeight:800,color:C.amber,letterSpacing:"0.12em",textTransform:"uppercase"}}>
              Aguardando Decisão
            </span>
            <span style={{fontSize:11,color:C.textDim,fontFamily:MONO}}>· atualiza a cada 10s</span>
          </div>

          {!loading && pendentes.length === 0 && (
            <div style={{padding:"28px",borderRadius:12,border:`1px dashed ${C.border}`,
              textAlign:"center",color:C.textDim,fontSize:14,fontFamily:MONO}}>
              ✓ Nenhuma aprovação pendente
            </div>
          )}

          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {pendentes.map(a => {
              const rc   = risco(a.risco)
              const prog = progressoPendencia(a.criado_em)
              const rest = minutosRestantes(a.criado_em)
              const emAcao = acao[a.id]
              return (
                <div key={a.id} className="hitl-card hitl-pending"
                  style={{borderRadius:12,border:`1px solid ${rc.border}`,
                    background:`linear-gradient(135deg,${rc.bg},rgba(255,255,255,0.02))`,
                    overflow:"hidden",boxShadow:"0 4px 20px rgba(0,0,0,0.3)"}}>

                  {/* Barra de progresso de expiração */}
                  <div style={{height:3,background:"rgba(255,255,255,0.06)",position:"relative"}}>
                    <div style={{position:"absolute",left:0,top:0,height:"100%",
                      width:`${100 - prog}%`,
                      background:`linear-gradient(90deg,${rc.color},${C.amber})`,
                      transition:"width 1s linear",borderRadius:2}}/>
                  </div>

                  <div style={{padding:"16px 18px"}}>
                    {/* Header do card */}
                    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:10}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5,flexWrap:"wrap"}}>
                          <span style={{fontSize:10,fontWeight:800,padding:"3px 10px",borderRadius:5,
                            background:rc.bg,color:rc.color,border:`1px solid ${rc.border}`,
                            letterSpacing:"0.08em",fontFamily:MONO}}>
                            ⚠ {rc.label}
                          </span>
                          <span style={{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:5,
                            background:"rgba(255,255,255,0.06)",color:C.textMid,fontFamily:MONO,
                            letterSpacing:"0.05em"}}>
                            {a.tipo_evento?.replace(/_/g," ").toUpperCase()}
                          </span>
                        </div>
                        <p style={{fontSize:15,fontWeight:600,color:C.text,lineHeight:1.5,margin:0}}>
                          {a.descricao}
                        </p>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontSize:11,color:C.amber,fontWeight:700,fontFamily:MONO}}>
                          ⏱ {rest}
                        </div>
                        <div style={{fontSize:10,color:C.textDim,fontFamily:MONO,marginTop:2}}>
                          {tempoAgo(a.criado_em)}
                        </div>
                      </div>
                    </div>

                    {/* ID e operador */}
                    <div style={{display:"flex",gap:16,marginBottom:12,flexWrap:"wrap"}}>
                      <span style={{fontSize:11,color:C.textDim,fontFamily:MONO}}>
                        ID: <span style={{color:C.textMid}}>{a.id?.slice(0,8)}…</span>
                      </span>
                      <span style={{fontSize:11,color:C.textDim,fontFamily:MONO}}>
                        Operador: <span style={{color:C.textMid}}>{a.operador}</span>
                      </span>
                      <span style={{fontSize:11,color:C.textDim,fontFamily:MONO}}>
                        Criado: <span style={{color:C.textMid}}>{fmtDate(a.criado_em)}</span>
                      </span>
                    </div>

                    {/* Botões de ação */}
                    <div style={{display:"flex",gap:10}}>
                      <button className="hitl-btn"
                        disabled={!!emAcao}
                        onClick={() => setConfirmModal({ id: a.id, decisao:"confirmada", descricao: a.descricao })}
                        style={{flex:1,padding:"10px 0",borderRadius:9,border:"1px solid rgba(34,197,94,0.35)",cursor:emAcao?"not-allowed":"pointer",
                          background:emAcao==="confirmando"?"rgba(34,197,94,0.3)":"rgba(34,197,94,0.2)",
                          color:C.green,fontWeight:800,fontSize:14,fontFamily:MONO,letterSpacing:"0.06em",
                          display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                          transition:"all 0.15s",opacity:emAcao&&emAcao!=="confirmando"?0.4:1}}>
                        {emAcao==="confirmando"
                          ? <><div style={{width:12,height:12,border:"2px solid rgba(34,197,94,0.3)",borderTopColor:C.green,borderRadius:"50%"}} className="hitl-spin"/>Confirmando…</>
                          : <>✔ CONFIRMAR</>
                        }
                      </button>
                      <button className="hitl-btn"
                        disabled={!!emAcao}
                        onClick={() => setConfirmModal({ id: a.id, decisao:"rejeitada", descricao: a.descricao })}
                        style={{flex:1,padding:"10px 0",borderRadius:9,border:"1px solid rgba(239,68,68,0.35)",cursor:emAcao?"not-allowed":"pointer",
                          background:emAcao==="rejeitando"?"rgba(239,68,68,0.3)":"rgba(239,68,68,0.12)",
                          color:C.red,fontWeight:800,fontSize:14,fontFamily:MONO,letterSpacing:"0.06em",
                          display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                          transition:"all 0.15s",opacity:emAcao&&emAcao!=="rejeitando"?0.4:1}}>
                        {emAcao==="rejeitando"
                          ? <><div style={{width:12,height:12,border:"2px solid rgba(239,68,68,0.3)",borderTopColor:C.red,borderRadius:"50%"}} className="hitl-spin"/>Rejeitando…</>
                          : <>✘ REJEITAR</>
                        }
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ══ HISTÓRICO ══ */}
        <section>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <div style={{width:3,height:16,background:C.textMid,borderRadius:2}}/>
            <span style={{fontSize:11.5,fontWeight:800,color:C.textMid,letterSpacing:"0.12em",textTransform:"uppercase"}}>
              Histórico
            </span>
            <span style={{fontSize:11,color:C.textDim,fontFamily:MONO}}>· {historico.length} registro{historico.length !== 1 ? "s" : ""}</span>
          </div>

          {historico.length === 0 && !loading && (
            <div style={{padding:"20px",borderRadius:12,border:`1px dashed ${C.border}`,
              textAlign:"center",color:C.textDim,fontSize:13,fontFamily:MONO}}>
              Nenhum registro no histórico
            </div>
          )}

          <div style={{borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden",background:C.surface}}>
            {historico.map((a, i) => {
              const sc = statusCfg(a.status)
              const rc = risco(a.risco)
              return (
                <div key={a.id} className="hitl-row"
                  style={{padding:"13px 18px",borderBottom:i<historico.length-1?`1px solid ${C.border}`:"none",
                    display:"flex",alignItems:"center",gap:14,transition:"background 0.12s",cursor:"default"}}>
                  {/* Dot de status */}
                  <div style={{width:8,height:8,borderRadius:"50%",background:sc.dot,flexShrink:0,
                    boxShadow:`0 0 5px ${sc.dot}88`}}/>

                  {/* Conteúdo principal */}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                      <span style={{fontSize:12,fontWeight:600,color:C.text,
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:380}}>
                        {a.descricao}
                      </span>
                      <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:4,
                        background:rc.bg,color:rc.color,border:`1px solid ${rc.border}`,
                        fontFamily:MONO,letterSpacing:"0.05em",flexShrink:0}}>
                        {a.risco}
                      </span>
                    </div>
                    <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                      <span style={{fontSize:11,color:C.textDim,fontFamily:MONO}}>
                        {fmtDate(a.criado_em)}
                      </span>
                      {a.resposta_por && (
                        <span style={{fontSize:11,color:C.textDim,fontFamily:MONO}}>
                          · <span style={{color:C.textMid}}>{a.resposta_por}</span>
                        </span>
                      )}
                      {a.respondido_em && (
                        <span style={{fontSize:11,color:C.textDim,fontFamily:MONO}}>
                          · respondido {tempoAgo(a.respondido_em)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Badge de status */}
                  <span style={{fontSize:10,fontWeight:800,padding:"4px 10px",borderRadius:5,
                    background:sc.bg,color:sc.color,border:`1px solid ${sc.color}44`,
                    fontFamily:MONO,letterSpacing:"0.07em",flexShrink:0}}>
                    {sc.label}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      {/* ══ Modal de confirmação ══ */}
      {confirmModal && (
        <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(7,10,20,0.8)",
          display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)"}}
          onClick={e=>{if(e.target===e.currentTarget)setConfirmModal(null)}}>
          <div style={{background:"#111827",borderRadius:14,width:"min(460px,90vw)",padding:"28px 30px",
            boxShadow:"0 32px 80px rgba(0,0,0,0.6)",border:"1px solid rgba(255,255,255,0.08)"}}>

            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
              <div style={{width:3,height:20,background:confirmModal.decisao==="confirmada"?C.green:C.red,borderRadius:2}}/>
              <div style={{fontSize:17,fontWeight:800}}>
                {confirmModal.decisao === "confirmada" ? "✔ Confirmar Aprovação" : "✘ Rejeitar Aprovação"}
              </div>
            </div>

            <div style={{padding:"14px 16px",borderRadius:10,
              background:confirmModal.decisao==="confirmada"?C.greenSoft:C.redSoft,
              border:`1px solid ${confirmModal.decisao==="confirmada"?"rgba(34,197,94,0.3)":"rgba(239,68,68,0.3)"}`,
              marginBottom:20}}>
              <p style={{fontSize:14,color:C.text,lineHeight:1.6,margin:0}}>
                {confirmModal.descricao}
              </p>
            </div>

            <p style={{fontSize:13,color:C.textMid,marginBottom:22,lineHeight:1.6}}>
              {confirmModal.decisao === "confirmada"
                ? "Ao confirmar, o Agent Bastos registrará a aprovação e o fluxo operacional seguirá."
                : "Ao rejeitar, o Agent Bastos registrará a recusa e o fluxo será encerrado."}
            </p>

            <div style={{display:"flex",gap:10}}>
              <button onClick={() => setConfirmModal(null)}
                style={{flex:1,padding:"11px 0",borderRadius:9,cursor:"pointer",
                  background:"rgba(255,255,255,0.06)",border:`1px solid ${C.border}`,
                  color:C.textMid,fontWeight:700,fontSize:14,fontFamily:MONO}}>
                Cancelar
              </button>
              <button className="hitl-btn"
                onClick={() => decidir(confirmModal.id, confirmModal.decisao)}
                style={{flex:1,padding:"11px 0",borderRadius:9,cursor:"pointer",border:"none",
                  background:confirmModal.decisao==="confirmada"
                    ?"linear-gradient(135deg,#16A34A,#15803D)"
                    :"linear-gradient(135deg,#DC2626,#B91C1C)",
                  color:"#FFFFFF",fontWeight:800,fontSize:14,fontFamily:MONO,letterSpacing:"0.04em",
                  boxShadow:confirmModal.decisao==="confirmada"
                    ?"0 4px 14px rgba(22,163,74,0.4)"
                    :"0 4px 14px rgba(220,38,38,0.4)"}}>
                {confirmModal.decisao === "confirmada" ? "✔ CONFIRMAR AGORA" : "✘ REJEITAR AGORA"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
