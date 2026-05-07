/**
 * Agenda.jsx — Agent Bastos v3 COMPLETO
 * ✅ Calendário visual integrado
 * ✅ Toast de notificação discreta
 * ✅ Sistema de polling (60s)
 * ✅ Badges pulsantes (PENDENTE/CIÊNCIA)
 * ✅ Botões "Acusar Ciência"
 * ✅ Design profissional
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const GLOBAL_CSS = `
  @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
  @keyframes calSlide { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes toastIn { from{opacity:0;transform:translateX(72px)} to{opacity:1;transform:translateX(0)} }
  @keyframes toastOut { from{opacity:1;transform:translateX(0)} to{opacity:0;transform:translateX(72px)} }
  @keyframes badgePulse { 0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,0.35)} 70%{box-shadow:0 0 0 6px rgba(220,38,38,0)} }

  .ag-enter { animation: fadeIn 0.2s ease forwards; }
  .cal-in { animation: calSlide 0.2s ease forwards; }
  .ag-row:hover { background: #FFFBEB !important; }
  .badge-pendente { animation: badgePulse 2s ease infinite; }
  .toast-in { animation: toastIn 0.28s cubic-bezier(.22,1,.36,1) forwards; }
  .toast-out { animation: toastOut 0.22s ease forwards; }

  .cal-cell {
    position: relative; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    height: 36px; border-radius: 8px;
    border: 1px solid #CBD5E1; background: #F1F5F9;
    cursor: pointer; transition: all 0.13s ease; user-select: none;
  }
  .cal-cell:hover { background:#FEF3C7 !important; border-color:#F59E0B !important; transform:translateY(-1px); }
  .cal-cell.vazio { background:transparent !important; border-color:transparent !important; cursor:default !important; }
  .cal-cell.vazio:hover { transform:none !important; }
  .cal-cell.hoje { background:#0F172A !important; border-color:#0F172A !important; }
  .cal-cell.hoje:hover { background:#1E293B !important; border-color:#1E293B !important; }
  .cal-cell.ativo { background:#B45309 !important; border-color:#B45309 !important; transform:translateY(-1px); }
  .cal-cell.ativo:hover { background:#92400E !important; border-color:#92400E !important; }
  .cal-cell.com-missao:not(.hoje):not(.ativo) { background:#FEF3C7 !important; border-color:#F59E0B !important; }
  .cal-cell.fds:not(.hoje):not(.ativo):not(.com-missao) { background:#E2E8F0 !important; }
`

const NUCLEOS = {
  NI: "Núcleo de Inteligência",
  NCI: "Núcleo de Contrainteligência",
  NBE: "Núcleo de Busca Eletrônica",
  NUCADIS: "Núcleo de Coleta e Análise",
  AIPEN: "Assessoria de Inteligência (TODOS)",
}

const DIAS_SEMANA = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"]
const POLLING_MS = 60_000

function formatTs(ts) {
  if (!ts) return "—"
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"2-digit" })
    + " " + d.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })
}

function tsToDateKey(ts) {
  if (!ts) return null
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  if (isNaN(d)) return null
  return d.toISOString().slice(0, 10)
}

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
}

// Toast de Notificação
function Toast({ missao, onCiencia, onFechar }) {
  const [saindo, setSaindo] = useState(false)

  function fechar() {
    setSaindo(true)
    setTimeout(onFechar, 220)
  }

  function acusarCiencia() {
    onCiencia(missao)
    fechar()
  }

  return (
    <div className={saindo ? "toast-out" : "toast-in"} style={{
      position:"fixed", bottom:24, right:24, zIndex:9999,
      width:320, background:"#0F172A",
      border:"1px solid #334155", borderRadius:12,
      boxShadow:"0 8px 32px rgba(0,0,0,0.35)",
      overflow:"hidden",
    }}>
      <div style={{ height:3, background:"linear-gradient(90deg,#B45309,#EAB308)", width:"100%" }}/>
      <div style={{ padding:"14px 16px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{
              fontSize:9, fontWeight:800, padding:"2px 8px", borderRadius:3,
              background:"#DC2626", color:"#FFF", fontFamily:MONO, letterSpacing:"0.06em",
            }}>
              NOVA MISSÃO
            </span>
            <span style={{
              fontSize:9, fontWeight:700, padding:"2px 8px", borderRadius:3,
              background:"rgba(234,179,8,0.15)", color:"#EAB308",
              border:"1px solid rgba(234,179,8,0.25)", fontFamily:MONO,
            }}>
              {missao.nucleo}
            </span>
          </div>
          <button onClick={fechar} style={{
            background:"transparent", border:"none", cursor:"pointer",
            color:"#475569", fontSize:14, lineHeight:1, padding:"2px 4px",
          }}>✕</button>
        </div>
        <p style={{
          fontSize:11, color:"#CBD5E1", lineHeight:1.6, margin:"0 0 12px",
          fontFamily:SANS, display:"-webkit-box", WebkitLineClamp:3,
          WebkitBoxOrient:"vertical", overflow:"hidden",
        }}>
          {missao.mensagem}
        </p>
        <p style={{ 
          fontSize:10, color:"#EAB308", fontFamily:MONO, 
          margin:"0 0 12px", fontWeight:600 
        }}>
          🦉 Por favor, acuse ciência desta missão.
        </p>
        <button onClick={acusarCiencia} style={{
          width:"100%", padding:"9px", borderRadius:7, border:"none",
          background:"linear-gradient(135deg,#B45309,#92400E)",
          color:"#FFF", fontSize:11, fontWeight:700, cursor:"pointer",
          fontFamily:MONO, letterSpacing:"0.04em",
          boxShadow:"0 2px 8px rgba(180,83,9,0.4)",
        }}>
          ✓ Acusar Ciência
        </button>
      </div>
    </div>
  )
}

// Badge de Status
function BadgeStatus({ status }) {
  if (status === "ciencia") {
    return (
      <span style={{
        fontSize:8, fontWeight:700, padding:"2px 7px", borderRadius:3,
        background:"#F0FDF4", color:"#16A34A", border:"1px solid #86EFAC",
        fontFamily:MONO, letterSpacing:"0.06em",
      }}>
        ✓ CIÊNCIA ACUSADA
      </span>
    )
  }
  return (
    <span className="badge-pendente" style={{
      fontSize:8, fontWeight:700, padding:"2px 7px", borderRadius:3,
      background:"#FEF2F2", color:"#DC2626", border:"1px solid #FCA5A5",
      fontFamily:MONO, letterSpacing:"0.06em",
    }}>
      ● PENDENTE
    </span>
  )
}

// Calendário Visual
function MiniCalendario({ missoes, diaAtivo, onDiaClick }) {
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth())

  const diasComMissao = useMemo(() => {
    const set = new Set()
    missoes.forEach(m => { 
      const k = tsToDateKey(m.timestamp)
      if (k) set.add(k) 
    })
    return set
  }, [missoes])

  const contagemPorDia = useMemo(() => {
    const map = {}
    missoes.forEach(m => {
      const k = tsToDateKey(m.timestamp)
      if (k) map[k] = (map[k] || 0) + 1
    })
    return map
  }, [missoes])

  function navMes(delta) {
    let nm = mes + delta, na = ano
    if (nm < 0)  { nm = 11; na-- }
    if (nm > 11) { nm = 0;  na++ }
    setMes(nm); setAno(na)
  }

  const grade = useMemo(() => {
    const primeiro = new Date(ano, mes, 1).getDay()
    const ultimo = new Date(ano, mes + 1, 0).getDate()
    const slots = []
    for (let i = 0; i < primeiro; i++) slots.push(null)
    for (let d = 1; d <= ultimo; d++) slots.push(d)
    while (slots.length % 7 !== 0) slots.push(null)
    return slots
  }, [ano, mes])

  function chave(dia) {
    return `${ano}-${String(mes+1).padStart(2,"0")}-${String(dia).padStart(2,"0")}`
  }

  const today = todayKey()
  const totalMissoesMes = missoes.filter(m => {
    const k = tsToDateKey(m.timestamp)
    return k && k.startsWith(`${ano}-${String(mes+1).padStart(2,"0")}`)
  }).length

  return (
    <div className="cal-in" style={{
      background:"#FFFFFF", border:"1px solid #E2E8F0", borderRadius:12,
      overflow:"hidden", boxShadow:"0 4px 16px rgba(0,0,0,0.06)", flexShrink:0
    }}>
      <div style={{
        padding:"12px 16px", 
        background:"linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
        display:"flex", alignItems:"center", justifyContent:"space-between"
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{
            width:30, height:30, borderRadius:8,
            background:"rgba(234,179,8,0.15)", border:"1px solid rgba(234,179,8,0.3)",
            display:"flex", alignItems:"center", justifyContent:"center"
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EAB308" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:"#F1F5F9" }}>
              {MESES[mes]} {ano}
            </div>
            {totalMissoesMes > 0 && (
              <div style={{ fontSize:11, color:"#EAB308", fontFamily:MONO, marginTop:2 }}>
                {totalMissoesMes} missão{totalMissoesMes !== 1 ? "ões" : ""} neste mês
              </div>
            )}
          </div>
        </div>
        <div style={{ display:"flex", gap:4 }}>
          <button onClick={() => navMes(-1)} style={{
            width:26, height:26, borderRadius:6, 
            border:"1px solid rgba(255,255,255,0.12)", 
            background:"rgba(255,255,255,0.06)", cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center"
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <button onClick={() => { setMes(hoje.getMonth()); setAno(hoje.getFullYear()) }} style={{
            height:26, padding:"0 10px", borderRadius:6,
            border:"1px solid rgba(234,179,8,0.35)", background:"rgba(234,179,8,0.1)",
            cursor:"pointer", fontSize:9, fontWeight:700, color:"#EAB308", fontFamily:MONO
          }}>
            HOJE
          </button>
          <button onClick={() => navMes(+1)} style={{
            width:26, height:26, borderRadius:6,
            border:"1px solid rgba(255,255,255,0.12)",
            background:"rgba(255,255,255,0.06)", cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center"
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      </div>

      <div style={{ padding:"12px 14px 14px", background:"#FFFFFF" }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3, marginBottom:6 }}>
          {DIAS_SEMANA.map(d => (
            <div key={d} style={{
              textAlign:"center", fontSize:9, fontWeight:700, fontFamily:MONO,
              color: d==="Dom"||d==="Sáb" ? "#CBD5E1" : "#64748B", padding:"4px 0"
            }}>
              {d}
            </div>
          ))}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3 }}>
          {grade.map((dia, idx) => {
            if (!dia) return <div key={`v-${idx}`} className="cal-cell vazio" />
            
            const k = chave(dia)
            const temMissao = diasComMissao.has(k)
            const qtd = contagemPorDia[k] || 0
            const ehHoje = k === today
            const ehAtivo = k === diaAtivo
            const ehFds = (idx%7===0)||(idx%7===6)
            
            let classes = "cal-cell"
            if (ehAtivo) classes += " ativo"
            else if (ehHoje) classes += " hoje"
            else if (temMissao) classes += " com-missao"
            else if (ehFds) classes += " fds"
            
            const corTexto = ehAtivo||ehHoje ? "#FFFFFF" : ehFds ? "#94A3B8" : "#1E293B"
            const corPonto = ehAtivo ? "#FEF3C7" : ehHoje ? "#EAB308" : "#B45309"
            
            return (
              <div key={k} className={classes}
                onClick={() => onDiaClick(k===diaAtivo ? null : k)}
                title={temMissao ? `${qtd} missão${qtd>1?"ões":""} — ${new Date(k+"T12:00:00").toLocaleDateString("pt-BR")}` : ""}
              >
                <span style={{
                  fontSize:11, fontWeight:ehHoje||ehAtivo?800:temMissao?700:500,
                  fontFamily:MONO, color:corTexto, lineHeight:1,
                  marginBottom:temMissao?5:0
                }}>
                  {dia}
                </span>
                {temMissao && (
                  <div style={{
                    position:"absolute", bottom:4, display:"flex", gap:2,
                    alignItems:"center", justifyContent:"center", width:"100%"
                  }}>
                    {Array.from({ length: Math.min(qtd,3) }).map((_,i) => (
                      <span key={i} style={{
                        width:3, height:3, borderRadius:"50%",
                        background:corPonto, display:"inline-block"
                      }}/>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{
          display:"flex", alignItems:"center", gap:14, flexWrap:"wrap",
          marginTop:12, paddingTop:10, borderTop:"1px solid #F1F5F9"
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ width:14, height:14, borderRadius:4, background:"#0F172A", display:"inline-block" }}/>
            <span style={{ fontSize:11, color:"#64748B", fontFamily:MONO }}>Hoje</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ width:14, height:14, borderRadius:4, background:"#FEF3C7", border:"1px solid #F59E0B", display:"inline-block" }}/>
            <span style={{ fontSize:11, color:"#64748B", fontFamily:MONO }}>Com missão</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ width:14, height:14, borderRadius:4, background:"#B45309", display:"inline-block" }}/>
            <span style={{ fontSize:11, color:"#64748B", fontFamily:MONO }}>Selecionado</span>
          </div>
          {diaAtivo && (
            <button onClick={() => onDiaClick(null)} style={{
              marginLeft:"auto", fontSize:11, fontFamily:MONO, color:"#B45309",
              background:"transparent", border:"none", cursor:"pointer",
              textDecoration:"underline", padding:0
            }}>
              Limpar filtro ✕
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Componente Principal
export default function Agenda({ onNavigate }) {
  const [missoes, setMissoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [nucleoFiltro, setNucleoFiltro] = useState("TODOS")
  const [diaAtivo, setDiaAtivo] = useState(null)
  const [toast, setToast] = useState(null)
  const toastRepetidoRef = useRef(new Set())
  const toastMostradoRef = useRef(new Set())

  const cfg = JSON.parse(localStorage.getItem("ab_config") || "{}")
  const BACKEND = cfg.backendUrl || "http://127.0.0.1:8000"

  useEffect(() => {
    const style = document.createElement("style")
    style.textContent = GLOBAL_CSS
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  const carregarMissoes = useCallback(async () => {
    try {
      const r = await fetch(`${BACKEND}/agenda/missoes?limite=30`)
      const d = await r.json()
      const lista = d.missoes || []
      setMissoes(lista)
      return lista
    } catch {
      const hoje = new Date()
      const ontem = new Date(hoje); ontem.setDate(hoje.getDate()-1)
      const anteontem = new Date(hoje); anteontem.setDate(hoje.getDate()-3)
      const mock = [
        { id:"m1", nucleo:"NI", mensagem:"Levantar informações sobre movimentação no Setor Norte. Prazo: 48h.", timestamp:hoje.toISOString(), status:"pendente" },
        { id:"m2", nucleo:"NBE", mensagem:"Realizar monitoramento eletrônico do ponto X. Relatar até sexta.", timestamp:ontem.toISOString(), status:"ciencia" },
        { id:"m3", nucleo:"AIPEN", mensagem:"Reunião de briefing na sede às 09h desta quinta-feira. Presença obrigatória.", timestamp:anteontem.toISOString(), status:"ciencia" },
      ]
      setMissoes(mock)
      return mock
    }
  }, [BACKEND])

  useEffect(() => {
    carregarMissoes().finally(() => setLoading(false))
  }, [carregarMissoes])

  useEffect(() => {
    const verificar = async () => {
      const lista = await carregarMissoes()
      const pendentes = lista.filter(m => m.status === "pendente" || !m.status)

      for (const m of pendentes) {
        if (!m.id) continue
        if (!toastMostradoRef.current.has(m.id)) {
          toastMostradoRef.current.add(m.id)
          setToast(m)
          setTimeout(async () => {
            if (toastRepetidoRef.current.has(m.id)) return
            const atualizada = await fetch(`${BACKEND}/agenda/missoes?limite=30`)
              .then(r => r.json()).then(d => (d.missoes||[]).find(x => x.id === m.id))
              .catch(() => null)
            if (atualizada && (atualizada.status === "pendente" || !atualizada.status)) {
              toastRepetidoRef.current.add(m.id)
              setToast(atualizada)
            }
          }, POLLING_MS)
          break
        }
      }
    }

    const intervalo = setInterval(verificar, POLLING_MS)
    return () => clearInterval(intervalo)
  }, [BACKEND, carregarMissoes])

  async function acusarCiencia(missao) {
    try {
      await fetch(`${BACKEND}/agenda/missoes/${missao.id}/ciencia`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nucleo: nucleoFiltro === "TODOS" ? missao.nucleo : nucleoFiltro }),
      })
    } catch {}
    setMissoes(prev => prev.map(m =>
      m.id === missao.id ? { ...m, status:"ciencia" } : m
    ))
    setToast(null)
  }

  const missoesFiltradas = useMemo(() => {
    let lista = nucleoFiltro === "TODOS" ? missoes : missoes.filter(m => m.nucleo === nucleoFiltro || m.nucleo === "AIPEN")
    if (diaAtivo) lista = lista.filter(m => tsToDateKey(m.timestamp) === diaAtivo)
    return lista
  }, [missoes, nucleoFiltro, diaAtivo])

  const labelDiaAtivo = useMemo(() => {
    return diaAtivo ? new Date(diaAtivo + "T12:00:00").toLocaleDateString("pt-BR", { day:"2-digit", month:"short" }) : null
  }, [diaAtivo])

  return (
    <div style={{ display:"flex", flexDirection:"column", flex:1, height:"100%", overflow:"hidden", background:"#F8FAFC" }}>
      
      {toast && <Toast missao={toast} onCiencia={acusarCiencia} onFechar={() => setToast(null)} />}
      
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"12px 20px", borderBottom:"1px solid #E2E8F0",
        background:"#FFFFFF", flexShrink:0, boxShadow:"0 1px 3px rgba(0,0,0,0.05)"
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{
            width:32, height:32, borderRadius:8,
            background:"linear-gradient(135deg,#FEF3C7,#FDE68A)",
            border:"1px solid #FCD34D", display:"flex", alignItems:"center", justifyContent:"center"
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:800, color:"#0F172A" }}>Agenda Operacional</div>
            <div style={{ fontSize:10, color:"#94A3B8", fontFamily:MONO }}>AIPEN — Missões e Ordens do Dia</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:9, color:"#94A3B8", fontFamily:MONO }}>{missoesFiltradas.length} missões</span>
        </div>
      </div>

      <div className="ag-enter" style={{ display:"flex", gap:14, flex:1, overflow:"hidden", padding:16 }}>
        
        <div style={{ width:240, flexShrink:0, display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{
            background:"#FFFFFF", border:"1px solid #E2E8F0", borderRadius:10,
            overflow:"hidden", boxShadow:"0 2px 6px rgba(0,0,0,0.04)"
          }}>
            <div style={{
              display:"flex", alignItems:"center", gap:8, padding:"10px 14px",
              borderBottom:"1px solid #F1F5F9", background:"#F8FAFC"
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6D28D9" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
              </svg>
              <span style={{ fontSize:10, fontWeight:800, color:"#334155", textTransform:"uppercase" }}>
                Filtrar por Núcleo
              </span>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:3, padding:"10px 12px" }}>
              {["TODOS", ...Object.keys(NUCLEOS)].map(n => (
                <button key={n} onClick={() => setNucleoFiltro(n)} style={{
                  padding:"5px 10px", borderRadius:5, fontSize:10, fontWeight:600,
                  border:"1px solid", cursor:"pointer", textAlign:"left", fontFamily:MONO,
                  background:nucleoFiltro===n?"#0F172A":"transparent",
                  color:nucleoFiltro===n?"#FFF":"#475569",
                  borderColor:nucleoFiltro===n?"#0F172A":"#E2E8F0"
                }}>
                  {n==="TODOS" ? "Todos os Núcleos" : n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:10, overflow:"hidden" }}>
          
          <MiniCalendario missoes={missoes} diaAtivo={diaAtivo} onDiaClick={setDiaAtivo} />

          <div style={{
            flex:1, display:"flex", flexDirection:"column",
            background:"#FFFFFF", border:"1px solid #E2E8F0", borderRadius:10,
            overflow:"hidden", boxShadow:"0 2px 6px rgba(0,0,0,0.04)"
          }}>
            <div style={{
              padding:"12px 16px", borderBottom:"1px solid #F1F5F9",
              background:"#F8FAFC", display:"flex", alignItems:"center", justifyContent:"space-between"
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:10, fontWeight:800, color:"#334155", textTransform:"uppercase" }}>
                  Missões Registradas
                </span>
                {nucleoFiltro !== "TODOS" && (
                  <span style={{
                    fontSize:8, fontWeight:700, padding:"2px 7px", borderRadius:3,
                    background:"#DBEAFE", color:"#1D4ED8", fontFamily:MONO
                  }}>
                    {nucleoFiltro}
                  </span>
                )}
                {labelDiaAtivo && (
                  <span style={{
                    fontSize:8, fontWeight:700, padding:"2px 7px", borderRadius:3,
                    background:"#FEF3C7", color:"#92400E", fontFamily:MONO
                  }}>
                    📅 {labelDiaAtivo}
                  </span>
                )}
              </div>
              <span style={{ fontSize:9, color:"#94A3B8", fontFamily:MONO }}>
                {missoesFiltradas.length} resultado{missoesFiltradas.length!==1?"s":""}
              </span>
            </div>
            
            <div style={{ flex:1, overflowY:"auto" }}>
              {loading && (
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:48 }}>
                  <span style={{ fontSize:12, color:"#94A3B8", fontFamily:MONO }}>Carregando missões...</span>
                </div>
              )}
              {!loading && missoesFiltradas.length === 0 && (
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:40 }}>
                  <span style={{ fontSize:11, color:"#CBD5E1", fontFamily:MONO }}>
                    {diaAtivo ? "Nenhuma missão neste dia" : "Nenhuma missão registrada"}
                  </span>
                  {diaAtivo && (
                    <button onClick={() => setDiaAtivo(null)} style={{
                      fontSize:10, color:"#B45309", background:"transparent",
                      border:"none", cursor:"pointer", textDecoration:"underline", marginTop:8
                    }}>
                      Ver todas as missões
                    </button>
                  )}
                </div>
              )}
              {!loading && missoesFiltradas.map((m, i) => (
                <div key={m.id||i} className="ag-row" style={{
                  padding:"13px 16px",
                  borderBottom: i < missoesFiltradas.length-1 ? "1px solid #F8FAFC" : "none",
                  background: m.status === "pendente" || !m.status ? "#FFFBF5" : "#FFFFFF",
                  borderLeft: `3px solid ${m.nucleo==="AIPEN" ? "#16A34A" : (m.status==="pendente" || !m.status) ? "#DC2626" : "#1D4ED8"}`
                }}>
                  <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                    <div style={{ flexShrink:0, marginTop:2, display:"flex", flexDirection:"column", gap:4 }}>
                      <span style={{
                        fontSize:9, fontWeight:800, padding:"2px 7px", borderRadius:3, fontFamily:MONO,
                        background: m.nucleo==="AIPEN" ? "#F0FDF4" : "#DBEAFE",
                        color: m.nucleo==="AIPEN" ? "#16A34A" : "#1D4ED8",
                        border: `1px solid ${m.nucleo==="AIPEN" ? "#86EFAC" : "#93C5FD"}`
                      }}>
                        {m.nucleo}
                      </span>
                      <BadgeStatus status={m.status} />
                    </div>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:12, color:"#0F172A", lineHeight:1.65, margin:0, fontWeight:500 }}>
                        {m.mensagem}
                      </p>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:5, flexWrap:"wrap" }}>
                        <span style={{ fontSize:9, color:"#94A3B8", fontFamily:MONO }}>
                          {formatTs(m.timestamp)}
                        </span>
                        <span style={{ fontSize:8, color:"#CBD5E1" }}>·</span>
                        <span style={{ fontSize:9, color:"#B45309", fontFamily:MONO }}>
                          🦉 Corujas, juntos somos mais.
                        </span>
                        {(m.status !== "ciencia") && (
                          <button onClick={() => acusarCiencia(m)} style={{
                            marginLeft:"auto", fontSize:9, fontWeight:700, padding:"3px 10px",
                            borderRadius:4, border:"1px solid #B45309", background:"transparent",
                            color:"#B45309", cursor:"pointer", fontFamily:MONO, letterSpacing:"0.04em"
                          }}>
                            ✓ Acusar Ciência
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
