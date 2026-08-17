import { useState, useEffect } from "react"
import AnimatedNumber from "./AnimatedNumber"
import { S, C, MONO } from "./shellTheme"
import { REFS } from "./homeData"

function LiveClock({ showSeconds = false }) {
  const [t, setT] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const opts = showSeconds
    ? {hour:"2-digit",minute:"2-digit",second:"2-digit"}
    : {hour:"2-digit",minute:"2-digit"}
  return <>{t.toLocaleTimeString("pt-BR", opts)}</>
}

// Tela inicial (Painel) — antes vivia embutida dentro do App.jsx (Missão 34:
// extração do "God Component"). É a única das 20+ telas do sistema que não
// tinha arquivo próprio; as demais (Dashboard, ChatRAG, etc.) já eram
// componentes lazy-loaded independentes.
export default function Painel({
  homeKpis, homeKpisLoading, expandedKpi, setExpandedKpi,
  chatHistory, loading, message, setMessage, focused, setFocused,
  chatEndRef, enviarPergunta, handleKey,
}) {
  const now = new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})

  return (
          <>
            <header style={S.topbar}>
              <div style={{display:"flex",alignItems:"center"}}>
                <div style={S.wc}>
                  <button style={{...S.wb,background:"#FF5F57"}} onClick={()=>window.electronAPI?.close()}/>
                  <button style={{...S.wb,background:"#FEBC2E"}} onClick={()=>window.electronAPI?.minimize()}/>
                  <button style={{...S.wb,background:"#28C840"}} onClick={()=>window.electronAPI?.maximize()}/>
                </div>
                <div>
                  <div style={S.ttitle}>Painel Principal</div>
                  <div style={S.tsub}>
                    <span style={{color:C.gold,fontWeight:700}}>◈</span> {new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"})} · Manaus, AM
                  </div>
                </div>
              </div>
              <div style={S.chip}>
                <div className="chip-dot-pulse" style={S.chipDot}/>
                <span style={S.chipText}>Sistema Operacional</span>
              </div>
            </header>

            <div style={S.body}>
              {/* ── Animated intel ticker ── */}
              <div style={{
                background:"rgba(220,38,38,0.05)",
                borderTop:"1px solid rgba(220,38,38,0.18)",
                borderBottom:"1px solid rgba(220,38,38,0.10)",
                padding:"5px 0", overflow:"hidden", flexShrink:0, position:"relative",
              }}>
                <div style={{display:"flex",alignItems:"center"}}>
                  <div style={{
                    padding:"0 12px", borderRight:"1px solid rgba(220,38,38,0.25)",
                    display:"flex",alignItems:"center",gap:6, flexShrink:0,
                  }}>
                    <span style={{width:6,height:6,borderRadius:"50%",background:"#EF4444",
                      display:"inline-block",animation:"amber-pulse 1.5s infinite"}}/>
                    <span style={{fontSize:9,fontWeight:900,color:"#EF4444",fontFamily:MONO,letterSpacing:"0.16em"}}>INTEL</span>
                  </div>
                  <div style={{flex:1,overflow:"hidden"}}>
                    <div style={{animation:"ticker-scroll 52s linear infinite",display:"inline-block",whiteSpace:"nowrap",paddingLeft:16}}>
                      <span style={{fontSize:12,color:"#FCA5A5",fontFamily:MONO,fontWeight:500}}>
                        ⚠ Movimentação detectada na região de fronteira norte — verificar imediatamente
                        &nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;
                        🔵 Análise doutrinária concluída — {new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})} — aguardando revisão
                        &nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;
                        ⚡ Nova entrada no banco de dados — classificação em andamento
                        &nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;
                        ◎ Grupo monitorado com variação ≥20% — análise prioritária solicitada
                        &nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;
                        AIPEN · SEAP-AM · {new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"})}
                      </span>
                    </div>
                  </div>
                  <span style={{fontSize:10,color:"rgba(252,165,165,0.4)",fontFamily:MONO,padding:"0 12px",flexShrink:0}}>há 12 min</span>
                </div>
              </div>

              {/* ── 2-col layout: KPIs | chat ── */}
              <div style={{flex:1, display:"flex", gap:14, minHeight:0, overflow:"hidden"}}>

              {/* LEFT: status + KPIs + drill-down */}
              <div style={{width:"44%", flexShrink:0, display:"flex", flexDirection:"column", gap:10, overflowY:"auto"}}>

              {/* System status card */}
              <div style={{
                background:"rgba(22,163,74,0.05)",
                border:"1px solid rgba(22,163,74,0.14)",
                borderRadius:10, padding:"9px 14px",
                display:"flex", alignItems:"center", justifyContent:"space-between",
              }}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:"#16A34A",
                    boxShadow:"0 0 8px #16A34A",animation:"pulse-glow 2s infinite",flexShrink:0}}/>
                  <span style={{fontSize:11,fontWeight:700,color:"#4ADE80",letterSpacing:"0.08em",fontFamily:MONO}}>SISTEMA OPERACIONAL</span>
                </div>
                <span style={{fontSize:10,color:"rgba(74,222,128,0.45)",fontFamily:MONO}}>
                  <LiveClock showSeconds={true}/> · Manaus, AM
                </span>
              </div>

              {/* ── KPI Cards ─────────────────────────────────────────── */}
              {(()=>{
                const kpiDefs = homeKpis ? [
                  {
                    id:"alertas", label:"Alertas Ativos", icon:"🔔",
                    value: homeKpis.alertas, color:"#F87171",
                    sub: `${homeKpis.alertasCriticos} críticos`,
                    subColor:"#FCA5A5",
                    detail: homeKpis.hist6,
                    detailLabel:"Histórico 6 meses",
                  },
                  {
                    id:"grupos", label:"Grupos Monitorados", icon:"◎",
                    value: homeKpis.gruposAtivos, color:"#A78BFA",
                    sub: `${homeKpis.variacoes} variação ≥20%`,
                    subColor: homeKpis.variacoes > 0 ? "#F87171" : "#34D399",
                    detail: homeKpis.hist6,
                    detailLabel:"Movimentação histórica",
                  },
                  {
                    id:"docsMes", label:"Docs do Mês", icon:"📄",
                    value: homeKpis.docsMes, color:"#38BDF8",
                    sub: homeKpis.variacaoPct >= 0
                      ? `+${homeKpis.variacaoPct}% vs mês ant.`
                      : `${homeKpis.variacaoPct}% vs mês ant.`,
                    subColor: homeKpis.variacaoPct >= 0 ? "#34D399" : "#F87171",
                    detail: homeKpis.porTipo?.map(t=>t.total) || [],
                    detailLabel: "Por tipo de documento",
                  },
                  {
                    id:"docsAno", label:"Acumulado Ano", icon:"📊",
                    value: homeKpis.docsAno, color:"#34D399",
                    sub: `Média ${homeKpis.docsAno > 0 && homeKpis.meses?.length > 0 ? Math.round(homeKpis.docsAno / homeKpis.meses.length) : 0}/mês`,
                    subColor:"#6EE7B7",
                    detail: homeKpis.hist6,
                    detailLabel:"Produção acumulada",
                  },
                ] : [{},{},{},{}]

                return (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    {kpiDefs.map((kpi,i)=>{
                      const isExp = expandedKpi === kpi.id
                      const isLoading = homeKpisLoading || !homeKpis
                      return (
                        <div key={kpi.id||i}
                          onClick={()=>kpi.id && setExpandedKpi(isExp ? null : kpi.id)}
                          style={{
                            background: isExp
                              ? `rgba(255,255,255,0.06)`
                              : "rgba(255,255,255,0.025)",
                            border: `1px solid ${isExp ? (kpi.color||"#60A5FA")+"44" : "rgba(255,255,255,0.06)"}`,
                            borderTop: `2px solid ${kpi.color||"#60A5FA"}`,
                            borderRadius:12, padding:"16px 16px",
                            cursor: kpi.id ? "pointer" : "default",
                            transition:"all 0.25s",
                            transform: isExp ? "translateY(-2px)" : "none",
                            boxShadow: isExp
                              ? `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${kpi.color||"#60A5FA"}22`
                              : `0 2px 12px rgba(0,0,0,0.15)`,
                            backdropFilter:"blur(12px)",
                            WebkitBackdropFilter:"blur(12px)",
                            position:"relative", overflow:"hidden",
                          }}>
                          {/* Ambient glow */}
                          <div style={{position:"absolute",top:-16,right:-16,width:72,height:72,
                            borderRadius:"50%",background:`${kpi.color||"#60A5FA"}18`,
                            filter:"blur(18px)",pointerEvents:"none"}}/>
                          {isLoading ? (
                            /* Skeleton */
                            <div>
                              <div style={{height:10,borderRadius:4,background:"rgba(255,255,255,0.08)",marginBottom:8,width:"60%"}}/>
                              <div style={{height:28,borderRadius:4,background:"rgba(255,255,255,0.05)",marginBottom:6,width:"40%"}}/>
                              <div style={{height:8,borderRadius:4,background:"rgba(255,255,255,0.05)",width:"70%"}}/>
                            </div>
                          ) : (
                            <>
                              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                                <span style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.45)",
                                  letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:MONO}}>
                                  {kpi.label}
                                </span>
                                <span style={{fontSize:14}}>{kpi.icon}</span>
                              </div>
                              <div style={{fontSize:38,fontWeight:900,color:kpi.color,
                                fontFamily:MONO,letterSpacing:"-0.03em",lineHeight:1,marginBottom:6,
                                textShadow:`0 0 24px ${kpi.color||"#60A5FA"}44`}}>
                                <AnimatedNumber value={kpi.value||0} duration={900}/>
                              </div>
                              <div style={{fontSize:11,color:kpi.subColor||"rgba(255,255,255,0.40)",
                                fontFamily:MONO,fontWeight:600}}>
                                {kpi.sub}
                              </div>
                              {/* Sparkline inline SVG */}
                              {kpi.detail?.length > 1 && (
                                <div style={{marginTop:10}}>
                                  {(()=>{
                                    const d = kpi.detail
                                    const mx = Math.max(...d,1)
                                    const W = 120, H = 24, n = d.length
                                    const pts = d.map((v,i)=>`${(i/(n-1))*W},${H-(v/mx)*H}`)
                                    return (
                                      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{display:"block"}}>
                                        <polyline
                                          points={pts.join(" ")}
                                          fill="none"
                                          stroke={kpi.color}
                                          strokeWidth="1.5"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          opacity="0.7"
                                        />
                                        {/* dot no último ponto */}
                                        <circle
                                          cx={(n-1)/(n-1)*W}
                                          cy={H-(d[n-1]/mx)*H}
                                          r="2.5"
                                          fill={kpi.color}
                                        />
                                      </svg>
                                    )
                                  })()}
                                </div>
                              )}
                              {/* Expand indicator */}
                              {kpi.id && (
                                <div style={{marginTop:6,display:"flex",alignItems:"center",gap:4}}>
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
                                    stroke={isExp?kpi.color:"rgba(255,255,255,0.20)"}
                                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                    style={{transform:isExp?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}>
                                    <polyline points="6 9 12 15 18 9"/>
                                  </svg>
                                  <span style={{fontSize:9,color:isExp?kpi.color:"rgba(255,255,255,0.18)",
                                    fontFamily:MONO,fontWeight:700,letterSpacing:"0.06em"}}>
                                    {isExp?"RECOLHER":"DETALHAR"}
                                  </span>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* ── Drill-down panel ───────────────────────────────────── */}
              {expandedKpi && homeKpis && (()=>{
                const defs = {
                  alertas: {
                    title:"Distribuição de Alertas",
                    rows: [
                      {label:"Total de alertas", value:homeKpis.alertas, color:"#F87171"},
                      {label:"Nível crítico/alto", value:homeKpis.alertasCriticos, color:"#EF4444"},
                      {label:"Outros", value:homeKpis.alertas-homeKpis.alertasCriticos, color:"#94A3B8"},
                    ]
                  },
                  grupos: {
                    title:"Monitoramento de Grupos",
                    rows: [
                      {label:"Grupos ativos", value:homeKpis.gruposAtivos, color:"#A78BFA"},
                      {label:"Variações ≥20%", value:homeKpis.variacoes, color:"#F87171"},
                    ]
                  },
                  docsMes: {
                    title:"Produção por Tipo",
                    rows: (homeKpis.porTipo||[]).map(t=>({label:t.codigo||t.nome, value:t.total, color:"#38BDF8"}))
                  },
                  docsAno: {
                    title:"Resumo Anual",
                    rows: [
                      {label:"Total acumulado", value:homeKpis.docsAno, color:"#34D399"},
                      {label:"Média mensal", value: homeKpis.meses?.length > 0 ? Math.round(homeKpis.docsAno/homeKpis.meses.length) : 0, color:"#6EE7B7"},
                    ]
                  },
                }
                const d = defs[expandedKpi]
                if (!d) return null
                const maxVal = Math.max(...d.rows.map(r=>r.value),1)
                return (
                  <div style={{
                    borderRadius:10,padding:"14px 16px",marginBottom:12,
                    background:"rgba(255,255,255,0.04)",
                    border:"1px solid rgba(255,255,255,0.09)",
                    animation:"screenIn 0.2s cubic-bezier(0.16,1,0.3,1) both"
                  }}>
                    <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,0.45)",
                      letterSpacing:"0.10em",textTransform:"uppercase",fontFamily:MONO,marginBottom:12}}>
                      {d.title}
                    </div>
                    {d.rows.map((row,i)=>(
                      <div key={i} style={{marginBottom:8}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                          <span style={{fontSize:11,color:"rgba(255,255,255,0.55)",fontFamily:MONO}}>{row.label}</span>
                          <span style={{fontSize:11,fontWeight:700,color:row.color,fontFamily:MONO}}>
                            <AnimatedNumber value={row.value}/>
                          </span>
                        </div>
                        <div style={{height:4,borderRadius:2,background:"rgba(255,255,255,0.06)"}}>
                          <div style={{
                            height:"100%",borderRadius:2,
                            width: `${(row.value/maxVal)*100}%`,
                            background:row.color,
                            transition:"width 0.8s cubic-bezier(0.16,1,0.3,1)"
                          }}/>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}

              </div>{/* /left col */}

              {/* RIGHT: refs bar + chat */}
              <div style={{flex:1, display:"flex", flexDirection:"column", gap:10, minWidth:0, overflow:"hidden"}}>

              {/* ── Unified intel chat card ── */}
              <div style={{
                flex:1, display:"flex", flexDirection:"column",
                background:"rgba(255,255,255,0.02)",
                border:"1px solid rgba(255,255,255,0.07)",
                borderRadius:14,
                overflow:"hidden",
                backdropFilter:"blur(16px)",
                WebkitBackdropFilter:"blur(16px)",
                boxShadow:"0 4px 40px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)",
              }}>

                {/* Card header */}
                <div style={{
                  padding:"10px 16px",
                  borderBottom:"1px solid rgba(255,255,255,0.06)",
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  flexShrink:0,
                  background:"rgba(232,160,32,0.03)",
                }}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:"#E8A020",
                      boxShadow:"0 0 8px #E8A020",animation:"amber-pulse 2.5s infinite",flexShrink:0}}/>
                    <span style={{fontSize:11,fontWeight:800,color:C.gold,letterSpacing:"0.14em",fontFamily:MONO}}>◈ BASTOS-UNIT</span>
                    <span style={{fontSize:10,color:"rgba(232,160,32,0.4)",fontFamily:MONO}}>· Sistema Pronto</span>
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    {REFS.slice(0,3).map((r,i)=>(
                      <button key={i}
                        onClick={()=>enviarPergunta(r.query)}
                        style={{
                          padding:"3px 9px", borderRadius:5,
                          background:"rgba(255,255,255,0.03)",
                          border:`1px solid rgba(255,255,255,0.07)`,
                          color:r.color, fontSize:10.5, fontWeight:600, cursor:"pointer",
                          display:"flex", alignItems:"center", gap:4, whiteSpace:"nowrap",
                          fontFamily:MONO, letterSpacing:"0.03em",
                          transition:"all 0.15s",
                        }}
                        onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.07)";e.currentTarget.style.borderColor=r.color+"55"}}
                        onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.03)";e.currentTarget.style.borderColor="rgba(255,255,255,0.07)"}}>
                        <span style={{width:4,height:4,borderRadius:"50%",background:r.color,flexShrink:0}}/>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chat messages area */}
                <div style={{flex:1, position:"relative", overflow:"hidden", minHeight:0}}>
                  {/* Scanline overlay — efeito tela tática */}
                  <div style={{
                    position:"absolute", inset:0, pointerEvents:"none", zIndex:10,
                    backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.03) 3px,rgba(0,0,0,0.03) 4px)",
                  }}/>
                  {/* RESERVADO watermark */}
                  <div style={{
                    position:"absolute", inset:0, display:"flex",
                    alignItems:"center", justifyContent:"center",
                    pointerEvents:"none", overflow:"hidden", zIndex:1,
                  }}>
                    <span style={{
                      fontSize:58, fontWeight:900, color:"rgba(255,255,255,0.016)",
                      fontFamily:MONO, letterSpacing:"0.28em",
                      transform:"rotate(-28deg)", userSelect:"none", whiteSpace:"nowrap",
                    }}>RESERVADO</span>
                  </div>
                  {chatHistory.length===0 && (
                    <div style={{
                      position:"absolute", inset:0,
                      display:"flex", flexDirection:"column",
                      alignItems:"center", justifyContent:"center",
                      gap:18, pointerEvents:"none", userSelect:"none",
                    }}>
                      {/* Animated ring */}
                      <div style={{position:"relative", width:80, height:80}}>
                        <div style={{
                          position:"absolute", inset:0,
                          borderRadius:"50%",
                          border:"1px solid rgba(232,160,32,0.15)",
                          animation:"breathe 4s ease-in-out infinite",
                        }}/>
                        <div style={{
                          position:"absolute", inset:8,
                          borderRadius:"50%",
                          border:"1px solid rgba(232,160,32,0.25)",
                          animation:"breathe 4s ease-in-out infinite 0.3s",
                        }}/>
                        <div style={{
                          position:"absolute", inset:16,
                          borderRadius:"50%",
                          background:"rgba(232,160,32,0.06)",
                          border:"1.5px solid rgba(232,160,32,0.4)",
                          boxShadow:"0 0 30px rgba(232,160,32,0.12)",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          animation:"breathe 4s ease-in-out infinite 0.6s",
                        }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                            stroke="#E8A020" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                          </svg>
                        </div>
                      </div>
                      <div style={{textAlign:"center"}}>
                        <p style={{fontSize:15,color:"rgba(255,255,255,0.25)",fontWeight:700,margin:0,letterSpacing:"0.06em"}}>
                          AGUARDANDO CONSULTA
                        </p>
                        <p style={{fontSize:11,color:"rgba(255,255,255,0.12)",fontFamily:MONO,marginTop:6,letterSpacing:"0.04em"}}>
                          Doutrina · Análise · Referências
                        </p>
                      </div>
                    </div>
                  )}
                  {chatHistory.length>0 && (
                    <>
                      <div style={S.chatFadeMask}/>
                      <div style={S.chatMessages}>
                        {chatHistory.map((m,i)=>(
                          <div key={i} style={{alignSelf:m.role==="user"?"flex-end":"flex-start",maxWidth:"80%",position:"relative",zIndex:3}}>
                            <div style={{
                              background: m.role==="user"
                                ? "linear-gradient(135deg,#1E3A5F,#0F2840)"
                                : "rgba(255,255,255,0.04)",
                              borderRadius:10,
                              padding:"11px 15px",
                              fontSize:15.5,
                              color: m.role==="user"?"#FFFFFF":C.text,
                              lineHeight:1.65,
                              boxShadow: m.role==="user"?"0 4px 20px rgba(0,0,0,0.4)":"0 2px 12px rgba(0,0,0,0.2)",
                              backdropFilter:"blur(8px)",
                              border: m.role==="bastos"?"1px solid rgba(232,160,32,0.15)":"none",
                              borderLeft: m.role==="bastos"?"2px solid #E8A020":"none",
                            }}>
                              {m.role==="bastos"&&(
                                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                                  <span style={{fontSize:10,color:C.gold,fontWeight:800,letterSpacing:"0.12em",fontFamily:MONO}}>◈ BASTOS-UNIT</span>
                                  <span style={{fontSize:10,color:C.textMid,fontFamily:MONO}}>· {now}</span>
                                </div>
                              )}
                              {m.text}
                            </div>
                          </div>
                        ))}
                        {loading&&(
                          <div style={{alignSelf:"flex-start",fontSize:12,color:C.textMid,fontFamily:MONO,
                            display:"flex",alignItems:"center",gap:8,zIndex:3,position:"relative"}}>
                            <span style={{width:5,height:5,borderRadius:"50%",background:C.gold,display:"inline-block",
                              animation:"amber-pulse 1.5s ease-in-out infinite"}}/>
                            processando consulta doutrinária...
                          </div>
                        )}
                        <div ref={chatEndRef}/>
                      </div>
                    </>
                  )}
                </div>
              </div>{/* /unified chat card */}
              </div>{/* /right col */}
              </div>{/* /2-col wrapper */}
            </div>{/* /S.body */}

            <div style={{...S.chatBar,...(focused?S.chatBarFocused:{})}}>
              <div style={S.chatRow}>
                <div style={S.chatIconWrap}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <input
                  style={{...S.chatIn,...(focused?{borderColor:C.gold,boxShadow:`0 0 0 3px ${C.goldSoft}`}:{})}}
                  value={message}
                  onChange={e=>setMessage(e.target.value)}
                  onKeyDown={handleKey}
                  onFocus={()=>setFocused(true)}
                  onBlur={()=>setFocused(false)}
                  placeholder="Pergunte ao Agent Bastos — doutrina, análise, referências…"
                />
                <button style={{...S.sendBtn,...(loading?{opacity:0.4,cursor:"not-allowed"}:{})}}
                  onClick={enviarPergunta} disabled={loading}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
              <p style={S.chatHint}>
                <span style={{color:C.gold,fontWeight:700,letterSpacing:"0.04em"}}>↵ Pressione Enter</span>
                <span style={{color:"rgba(255,255,255,0.45)"}}> para enviar</span>
              </p>
            </div>
          </>
  )
}
