import { useState, useEffect } from "react"
import AnimatedNumber from "./AnimatedNumber"
import { S, C, MONO } from "./shellTheme"
import painelBanner from "./assets/painel-banner.jpg"

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
  loading, message, setMessage, focused, setFocused,
  enviarPergunta, handleKey,
}) {
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

              {/* ── Banner institucional ──
                   Antes tinha um card de chat/RAG duplicado aqui (a busca real
                   já vive na tela Chat RAG dedicada — isso só ocupava espaço
                   sem uso diário). Virou a "vitrine" do sistema: foto real da
                   equipe em operação (rostos anonimizados por segurança —
                   agentes de inteligência penitenciária não podem ficar
                   identificáveis numa tela que qualquer um pode ver por cima
                   do ombro) + a proposta de valor do Bastos. */}
              <div style={{
                flex:1, position:"relative", borderRadius:14, overflow:"hidden",
                border:"1px solid rgba(255,255,255,0.07)",
                boxShadow:"0 4px 40px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)",
                backgroundImage:`url(${painelBanner})`,
                backgroundSize:"cover", backgroundPosition:"center 32%",
                display:"flex", flexDirection:"column", justifyContent:"flex-end",
                padding:"24px 30px",
              }}>
                <div style={{position:"absolute", top:18, left:22, display:"flex", alignItems:"center", gap:8}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:"#E8A020",
                    boxShadow:"0 0 8px #E8A020",animation:"amber-pulse 2.5s infinite",flexShrink:0}}/>
                  <span style={{fontSize:11,fontWeight:800,color:C.gold,letterSpacing:"0.14em",fontFamily:MONO}}>◈ AGENT BASTOS</span>
                  <span style={{fontSize:10,color:"rgba(232,160,32,0.55)",fontFamily:MONO}}>· AIPEN / SEAP-AM</span>
                </div>

                <div style={{maxWidth:480}}>
                  <h2 style={{fontSize:25,fontWeight:900,color:"#F8FAFC",lineHeight:1.28,margin:0,
                    textShadow:"0 2px 20px rgba(0,0,0,0.7)", letterSpacing:"-0.01em"}}>
                    Inteligência auxiliando na decisão rápida em ambiente de risco.
                  </h2>
                </div>
              </div>{/* /banner institucional */}
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
