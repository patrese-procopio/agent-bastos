import { useState, useEffect, useCallback, useRef } from "react"
import api from "./api"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const C = {
  bg:           "#070B14",
  surface:      "#0D1424",
  surfaceUp:    "#111B2E",
  surfaceHigh:  "#162038",
  border:       "rgba(255,255,255,0.07)",
  borderUp:     "rgba(255,255,255,0.13)",
  gold:         "#E8A020",
  goldSoft:     "rgba(232,160,32,0.15)",
  text:         "#F1F5F9",
  textMid:      "#94A3B8",
  textDim:      "rgba(255,255,255,0.30)",
  green:        "#22C55E",
  greenSoft:    "rgba(34,197,94,0.12)",
  red:          "#EF4444",
  redSoft:      "rgba(239,68,68,0.12)",
  amber:        "#F59E0B",
  amberSoft:    "rgba(245,158,11,0.12)",
  oracle:       "#7C3AED",
  oracleLight:  "#A78BFA",
  oracleSoft:   "rgba(124,58,237,0.18)",
  oracleBorder: "rgba(167,139,250,0.35)",
  cyan:         "#22D3EE",
  cyanSoft:     "rgba(34,211,238,0.1)",
  cyanBorder:   "rgba(34,211,238,0.3)",
}

const CSS = `
  @keyframes fadeSlideIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pulse-oracle { 0%,100%{box-shadow:0 0 0 0 rgba(124,58,237,0)} 60%{box-shadow:0 0 0 6px rgba(124,58,237,0.18)} }
  @keyframes pulse-amber  { 0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,0)} 60%{box-shadow:0 0 0 5px rgba(245,158,11,0.20)} }
  @keyframes spin         { to{transform:rotate(360deg)} }
  @keyframes glow-in      { from{opacity:0;filter:blur(8px)} to{opacity:1;filter:blur(0)} }
  @keyframes bar-grow     { from{width:0} to{width:var(--w)} }
  .o-card   { animation: fadeSlideIn 0.22s ease forwards; }
  .o-pending{ animation: pulse-amber 2.5s ease-in-out infinite; }
  .o-spin   { animation: spin 0.9s linear infinite; }
  .o-btn:hover { filter:brightness(1.15); transform:translateY(-1px); }
  .o-btn:active{ transform:scale(0.97); }
  .o-row:hover { background:rgba(255,255,255,0.025) !important; }
  ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.10);border-radius:4px}
`

const RISCO_CFG = {
  CRITICO:  { label:"CRÍTICO", color:"#F87171", bg:"rgba(239,68,68,0.14)",  border:"rgba(239,68,68,0.35)" },
  CRÍTICO:  { label:"CRÍTICO", color:"#F87171", bg:"rgba(239,68,68,0.14)",  border:"rgba(239,68,68,0.35)" },
  ALTO:     { label:"ALTO",    color:"#FBBF24", bg:"rgba(251,191,36,0.12)", border:"rgba(251,191,36,0.30)" },
  MÉDIO:    { label:"MÉDIO",   color:"#60A5FA", bg:"rgba(96,165,250,0.12)", border:"rgba(96,165,250,0.30)" },
  MEDIO:    { label:"MÉDIO",   color:"#60A5FA", bg:"rgba(96,165,250,0.12)", border:"rgba(96,165,250,0.30)" },
  BAIXO:    { label:"BAIXO",   color:"#4ADE80", bg:"rgba(74,222,128,0.10)", border:"rgba(74,222,128,0.28)" },
}
const rc = (r) => RISCO_CFG[r?.toUpperCase()] || RISCO_CFG.ALTO

const SCORE_COLOR = {
  CRÍTICO: "#F87171",
  ALTO:    "#FBBF24",
  MÉDIO:   "#60A5FA",
  BAIXO:   "#4ADE80",
  INATIVO: "#475569",
}

const STATUS_CFG = {
  pendente:   { label:"AGUARDANDO", color:"#F59E0B", bg:"rgba(245,158,11,0.12)", dot:"#F59E0B" },
  confirmada: { label:"CONFIRMADA", color:"#22C55E", bg:"rgba(34,197,94,0.12)",  dot:"#22C55E" },
  rejeitada:  { label:"REJEITADA",  color:"#EF4444", bg:"rgba(239,68,68,0.12)",  dot:"#EF4444" },
  expirada:   { label:"EXPIRADA",   color:"#94A3B8", bg:"rgba(148,163,184,0.1)", dot:"#94A3B8" },
}
const sc = (s) => STATUS_CFG[s] || STATUS_CFG.expirada

const FONTE_ICON  = { "Alvo Monitorado":"🎯", "Liderança (Pavilhão)":"🏛", "Liderança (Rua)":"🏘", "Extrato de Campo":"📋" }
const FONTE_COLOR = { "Alvo Monitorado":"#F87171", "Liderança (Pavilhão)":"#FBBF24", "Liderança (Rua)":"#FB923C", "Extrato de Campo":"#60A5FA" }

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("pt-BR", {
    day:"2-digit", month:"2-digit", year:"numeric",
    hour:"2-digit", minute:"2-digit", timeZone:"America/Manaus",
  })
}

function tempoAgo(iso) {
  const d = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (d < 60)    return `${d}s atrás`
  if (d < 3600)  return `${Math.floor(d/60)}min atrás`
  if (d < 86400) return `${Math.floor(d/3600)}h atrás`
  return `${Math.floor(d/86400)}d atrás`
}

function progressoPendencia(criado_em, timeout=60) {
  return Math.min(100, ((Date.now() - new Date(criado_em)) / 1000 / 60 / timeout) * 100)
}

function minutosRestantes(criado_em, timeout=60) {
  const rest = Math.max(0, timeout - (Date.now() - new Date(criado_em)) / 1000 / 60)
  return rest < 1 ? "< 1 min" : `${Math.floor(rest)} min`
}

// extrai o nome principal de um HITL confirmado para pré-preencher SUBINT
function extrairEntidade(a) {
  const det = a.detalhes || {}
  const hits = det.hits || []
  if (hits.length > 0 && hits[0].nome) return hits[0].nome
  // Tenta extrair nome do campo descrição (primeiras palavras em maiúsculas)
  const match = (a.descricao || "").match(/([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][A-Za-záéíóúâêîôûãõç]+(?: [A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][A-Za-záéíóúâêîôûãõç]+)+)/)
  return match ? match[1] : (a.descricao || "").split(" ").slice(0,3).join(" ")
}

// ── Painel de cruzamento ───────────────────────────────────────────────────────
function PainelCruzamento({ detalhes }) {
  const hits    = detalhes?.hits    || []
  const summary = detalhes?.summary || ""
  const nFlags  = detalhes?.red_flags ?? 0
  if (!hits.length && !summary) return null

  return (
    <div style={{ margin:"12px 0", borderRadius:10, border:"1px solid rgba(248,113,113,0.22)",
      background:"rgba(248,113,113,0.04)", overflow:"hidden" }}>
      <div style={{ padding:"8px 14px", borderBottom:"1px solid rgba(248,113,113,0.16)",
        background:"rgba(248,113,113,0.07)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ fontSize:11, fontWeight:800, color:"#F87171", letterSpacing:"0.1em", fontFamily:MONO }}>
          🔍 NOMES ENCONTRADOS NAS BASES
        </span>
        <span style={{ fontSize:11, color:"rgba(248,113,113,0.7)", fontFamily:MONO }}>
          {hits.length} hit{hits.length!==1?"s":""}
          {nFlags>0 && <span style={{marginLeft:8}}>· 🚩 {nFlags} red flag{nFlags!==1?"s":""}</span>}
        </span>
      </div>
      {hits.length > 0 && (
        <div style={{ padding:"10px 14px", display:"flex", flexDirection:"column", gap:7 }}>
          {hits.map((h,i) => {
            const cor  = FONTE_COLOR[h.fonte] || "#94A3B8"
            const icon = FONTE_ICON[h.fonte]  || "📌"
            return (
              <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10,
                padding:"8px 12px", borderRadius:8, background:"rgba(255,255,255,0.03)",
                border:`1px solid ${cor}22` }}>
                <span style={{ fontSize:15, flexShrink:0, marginTop:1 }}>{icon}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                    <span style={{ fontSize:13, fontWeight:700, color:C.text }}>{h.nome}</span>
                    <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4,
                      background:`${cor}18`, color:cor, border:`1px solid ${cor}44`,
                      fontFamily:MONO, letterSpacing:"0.05em" }}>
                      {h.fonte}
                    </span>
                  </div>
                  {h.detalhe && (
                    <div style={{ fontSize:11.5, color:"#94A3B8", marginTop:3, lineHeight:1.4 }}>
                      {h.detalhe}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {summary && (
        <div style={{ padding:"8px 14px 10px", borderTop:hits.length?"1px solid rgba(255,255,255,0.06)":"none" }}>
          <div style={{ fontSize:10, fontWeight:700, color:"#94A3B8", letterSpacing:"0.08em",
            fontFamily:MONO, marginBottom:4 }}>RESUMO DA TRANSCRIÇÃO</div>
          <p style={{ fontSize:12.5, color:"#CBD5E1", lineHeight:1.55, margin:0, fontStyle:"italic" }}>
            "{summary}"
          </p>
        </div>
      )}
    </div>
  )
}

// ── Risk Radar ─────────────────────────────────────────────────────────────────
function RiskRadar({ scores }) {
  return (
    <div style={{ borderRadius:14, border:`1px solid ${C.oracleBorder}`,
      background:`linear-gradient(135deg,${C.oracleSoft},rgba(7,11,20,0.95))`,
      overflow:"hidden", marginBottom:20 }}>
      <div style={{ padding:"12px 18px 10px", borderBottom:`1px solid ${C.oracleBorder}`,
        display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:3, height:16, background:C.oracleLight, borderRadius:2,
            boxShadow:`0 0 8px ${C.oracleLight}88` }}/>
          <span style={{ fontSize:11.5, fontWeight:800, color:C.oracleLight,
            letterSpacing:"0.12em" }}>
            RADAR DE RISCO · ENTIDADES MONITORADAS
          </span>
        </div>
        <span style={{ fontSize:11, color:C.textDim, fontFamily:MONO }}>
          {scores.length} entidade{scores.length!==1?"s":""}
        </span>
      </div>

      {scores.length === 0 ? (
        <div style={{ padding:"16px 18px", color:C.textDim, fontSize:13, fontFamily:MONO }}>
          Nenhuma entidade com score ativo. Confirme HITLs para ativar o radar.
        </div>
      ) : (
        <div style={{ padding:"12px 18px", display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:"10px 20px" }}>
          {scores.slice(0,10).map(s => {
            const cor = SCORE_COLOR[s.classificacao] || "#94A3B8"
            const pct = Math.min(100, s.score_atual || 0)
            return (
              <div key={s.entidade_id} style={{ display:"flex", flexDirection:"column", gap:5 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:6 }}>
                  <span style={{ fontSize:12.5, fontWeight:600, color:C.text,
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:130 }}>
                    {s.entidade_nome}
                  </span>
                  <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                    <span style={{ fontSize:12, fontWeight:800, color:cor, fontFamily:MONO }}>
                      {pct.toFixed(0)}
                    </span>
                    <span style={{ fontSize:9, fontWeight:800, padding:"2px 6px", borderRadius:4,
                      background:`${cor}18`, color:cor, border:`1px solid ${cor}33`,
                      fontFamily:MONO, letterSpacing:"0.06em" }}>
                      {s.classificacao}
                    </span>
                  </div>
                </div>
                <div style={{ height:5, background:"rgba(255,255,255,0.07)", borderRadius:3, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${pct}%`, borderRadius:3, transition:"width 0.8s ease",
                    background:`linear-gradient(90deg,${cor}AA,${cor})` }}/>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Modal de geração de SUBINT ─────────────────────────────────────────────────
function SubintModal({ hitl, onClose }) {
  const [entidade, setEntidade]  = useState(hitl.entidade || "")
  const [origem,   setOrigem]    = useState("AIPEN")
  const [gerando,  setGerando]   = useState(false)
  const [resultado,setResultado] = useState(null) // { id, numero, ok }
  const [errMsg,   setErrMsg]    = useState(null)
  const [baixandoPdf,  setBaixandoPdf]  = useState(false)
  const [baixandoDocx, setBaixandoDocx] = useState(false)

  async function gerar() {
    if (!entidade.trim()) return
    setGerando(true)
    setErrMsg(null)
    try {
      const res  = await api.post("/subint/gerar", {
        entidade_nome: entidade.trim(),
        origem,
        hitl_id: hitl.hitl_id || null,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || "Erro ao gerar SUBINT")
      setResultado(data)
    } catch(e) {
      setErrMsg(e.message || "Falha ao gerar SUBINT")
    } finally {
      setGerando(false)
    }
  }

  async function baixar(formato) {
    if (!resultado?.id) return
    const setBaixando = formato === "pdf" ? setBaixandoPdf : setBaixandoDocx
    setBaixando(true)
    try {
      const res  = await api.get(`/subint/${resultado.id}/${formato}`)
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = `SUBINT_${(resultado.numero||resultado.id.slice(0,8)).replace(/\//g,"-")}.${formato}`
      a.click()
      URL.revokeObjectURL(url)
    } catch(e) {
      alert(`Falha ao baixar ${formato.toUpperCase()}. Tente novamente.`)
    } finally {
      setBaixando(false)
    }
  }

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1100, background:"rgba(4,7,16,0.88)",
      display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(8px)" }}
      onClick={e => { if(e.target === e.currentTarget) onClose() }}>
      <div className="o-card" style={{ background:"#0E1627", borderRadius:16, width:"min(520px,92vw)",
        boxShadow:"0 40px 100px rgba(0,0,0,0.7),0 0 0 1px rgba(167,139,250,0.2)", overflow:"hidden" }}>

        {/* Header do modal */}
        <div style={{ padding:"20px 24px 16px",
          background:`linear-gradient(135deg,${C.oracleSoft},rgba(14,22,39,0.95))`,
          borderBottom:"1px solid rgba(167,139,250,0.18)" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:38, height:38, borderRadius:10, display:"flex",
                alignItems:"center", justifyContent:"center", fontSize:20,
                background:C.oracleSoft, border:`1px solid ${C.oracleBorder}` }}>📄</div>
              <div>
                <div style={{ fontSize:16, fontWeight:800, color:C.text }}>Gerar SUBINT</div>
                <div style={{ fontSize:11, color:C.oracleLight, fontFamily:MONO, marginTop:1 }}>
                  Subsídio de Inteligência — documento técnico
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ width:30, height:30, borderRadius:8, border:`1px solid ${C.border}`,
              background:"rgba(255,255,255,0.05)", cursor:"pointer", color:C.textMid,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>×</button>
          </div>
        </div>

        <div style={{ padding:"20px 24px" }}>
          {!resultado ? (
            <>
              {/* Campo de entidade */}
              <div style={{ marginBottom:16 }}>
                <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.textMid,
                  letterSpacing:"0.08em", fontFamily:MONO, marginBottom:6 }}>
                  ENTIDADE / ALVO
                </label>
                <input
                  value={entidade}
                  onChange={e => setEntidade(e.target.value)}
                  placeholder="Nome da pessoa, organização ou evento"
                  style={{ width:"100%", padding:"11px 14px", borderRadius:9, fontSize:14,
                    border:`1px solid ${entidade ? C.oracleBorder : C.border}`,
                    background:"rgba(255,255,255,0.04)", color:C.text, outline:"none",
                    fontFamily:SANS, boxSizing:"border-box",
                    transition:"border-color 0.15s" }}
                />
              </div>

              {/* Selector de origem */}
              <div style={{ marginBottom:20 }}>
                <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.textMid,
                  letterSpacing:"0.08em", fontFamily:MONO, marginBottom:8 }}>
                  NÚCLEO DE ORIGEM
                </label>
                <div style={{ display:"flex", gap:8 }}>
                  {["AIPEN","NI","NCI","NBE"].map(o => (
                    <button key={o} onClick={() => setOrigem(o)} style={{
                      flex:1, padding:"9px 0", borderRadius:8, cursor:"pointer",
                      fontWeight:700, fontSize:12, fontFamily:MONO, letterSpacing:"0.05em",
                      transition:"all 0.15s",
                      border: origem===o ? `1px solid ${C.oracleBorder}` : `1px solid ${C.border}`,
                      background: origem===o ? C.oracleSoft : "rgba(255,255,255,0.04)",
                      color: origem===o ? C.oracleLight : C.textMid,
                    }}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>

              {errMsg && (
                <div style={{ padding:"10px 14px", borderRadius:9, background:C.redSoft,
                  border:"1px solid rgba(239,68,68,0.3)", color:"#FCA5A5", fontSize:13,
                  fontFamily:MONO, marginBottom:16 }}>
                  ⚠ {errMsg}
                </div>
              )}

              <div style={{ padding:"10px 14px", borderRadius:9, background:"rgba(255,255,255,0.03)",
                border:`1px solid ${C.border}`, marginBottom:20 }}>
                <div style={{ fontSize:11, color:C.textDim, lineHeight:1.6 }}>
                  O SUBINT é um documento técnico preliminar gerado por IA a partir de dados cruzados
                  do sistema. Serve como subsídio para elaboração do RELINT pelos analistas.
                  Tempo estimado: <span style={{color:C.textMid}}>15–30 segundos</span>.
                </div>
              </div>

              <div style={{ display:"flex", gap:10 }}>
                <button onClick={onClose} style={{ flex:1, padding:"11px 0", borderRadius:9,
                  cursor:"pointer", background:"rgba(255,255,255,0.05)", border:`1px solid ${C.border}`,
                  color:C.textMid, fontWeight:700, fontSize:13, fontFamily:MONO }}>
                  Cancelar
                </button>
                <button className="o-btn" disabled={gerando || !entidade.trim()}
                  onClick={gerar}
                  style={{ flex:2, padding:"11px 0", borderRadius:9, cursor:gerando||!entidade.trim()?"not-allowed":"pointer",
                    border:"none", fontWeight:800, fontSize:14, fontFamily:MONO, letterSpacing:"0.05em",
                    opacity: !entidade.trim() ? 0.5 : 1, transition:"all 0.15s",
                    background: gerando
                      ? "rgba(124,58,237,0.4)"
                      : `linear-gradient(135deg,#7C3AED,#5B21B6)`,
                    color:"#fff",
                    boxShadow: gerando ? "none" : "0 4px 16px rgba(124,58,237,0.45)",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                  {gerando ? (
                    <><div style={{width:13,height:13,border:"2px solid rgba(255,255,255,0.3)",
                      borderTopColor:"#fff",borderRadius:"50%"}} className="o-spin"/>
                    Gerando SUBINT…</>
                  ) : <>📄 GERAR SUBINT</>}
                </button>
              </div>
            </>
          ) : (
            /* ── Resultado ── */
            <>
              <div style={{ textAlign:"center", padding:"8px 0 20px" }}>
                <div style={{ fontSize:36, marginBottom:8 }}>✅</div>
                <div style={{ fontSize:17, fontWeight:800, color:C.green, marginBottom:4 }}>
                  SUBINT Gerado com Sucesso
                </div>
                <div style={{ fontSize:13, color:C.textMid, fontFamily:MONO }}>
                  {resultado.numero}
                </div>
              </div>

              <div style={{ padding:"14px 16px", borderRadius:10, background:"rgba(34,197,94,0.07)",
                border:"1px solid rgba(34,197,94,0.2)", marginBottom:20 }}>
                <div style={{ fontSize:12, color:"#86EFAC", lineHeight:1.7, fontFamily:MONO }}>
                  <div>📌 Entidade: <span style={{color:C.text, fontWeight:700}}>{resultado.entidade_nome || entidade}</span></div>
                  <div>🔢 Número:   <span style={{color:C.text, fontWeight:700}}>{resultado.numero}</span></div>
                  <div>📁 Origem:   <span style={{color:C.text, fontWeight:700}}>{resultado.origem || origem}</span></div>
                </div>
              </div>

              <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:20 }}>
                <button className="o-btn" onClick={() => baixar("pdf")}
                  disabled={baixandoPdf}
                  style={{ width:"100%", padding:"13px 0", borderRadius:9, cursor:baixandoPdf?"not-allowed":"pointer",
                    border:"1px solid rgba(239,68,68,0.35)", background:"rgba(239,68,68,0.12)",
                    color:"#FCA5A5", fontWeight:800, fontSize:14, fontFamily:MONO, letterSpacing:"0.05em",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:10,
                    transition:"all 0.15s" }}>
                  {baixandoPdf
                    ? <><div style={{width:13,height:13,border:"2px solid rgba(252,165,165,0.3)",borderTopColor:"#FCA5A5",borderRadius:"50%"}} className="o-spin"/>Baixando PDF…</>
                    : <>📥 BAIXAR PDF</>}
                </button>
                <button className="o-btn" onClick={() => baixar("docx")}
                  disabled={baixandoDocx}
                  style={{ width:"100%", padding:"13px 0", borderRadius:9, cursor:baixandoDocx?"not-allowed":"pointer",
                    border:`1px solid ${C.cyanBorder}`, background:C.cyanSoft,
                    color:C.cyan, fontWeight:800, fontSize:14, fontFamily:MONO, letterSpacing:"0.05em",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:10,
                    transition:"all 0.15s" }}>
                  {baixandoDocx
                    ? <><div style={{width:13,height:13,border:`2px solid ${C.cyanSoft}`,borderTopColor:C.cyan,borderRadius:"50%"}} className="o-spin"/>Baixando DOCX…</>
                    : <>📝 BAIXAR DOCX (editável)</>}
                </button>
              </div>

              <button onClick={onClose} style={{ width:"100%", padding:"10px 0", borderRadius:9,
                cursor:"pointer", background:"rgba(255,255,255,0.05)", border:`1px solid ${C.border}`,
                color:C.textMid, fontWeight:700, fontSize:13, fontFamily:MONO }}>
                Fechar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function HitlDashboard() {
  const [aprovacoes, setAprovacoes] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [erro,       setErro]       = useState(null)
  const [acao,       setAcao]       = useState({})
  const [confirmModal, setConfirmModal] = useState(null)
  const [subintModal,  setSubintModal]  = useState(null)

  // ORÁCULO state
  const [scores,  setScores]  = useState([])
  const [subints, setSubints] = useState([])
  const [, setTick] = useState(0)
  const intervalRef = useRef(null)

  const carregar = useCallback(async () => {
    try {
      const res  = await api.get("/human-loop/listar?limite=100")
      const data = await res.json()
      setAprovacoes(data.aprovacoes || [])
      setErro(null)
    } catch {
      setErro("Falha ao carregar aprovações.")
    } finally {
      setLoading(false)
    }
  }, [])

  const carregarScores = useCallback(async () => {
    try {
      const res  = await api.get("/risco/scores?min_score=1&limite=10")
      const data = await res.json()
      setScores(data.scores || [])
    } catch { /* silencioso */ }
  }, [])

  const carregarSubints = useCallback(async () => {
    try {
      const res  = await api.get("/subint/listar?limite=20")
      const data = await res.json()
      setSubints(data.subints || [])
    } catch { /* silencioso */ }
  }, [])

  useEffect(() => {
    const style = document.createElement("style")
    style.textContent = CSS
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  useEffect(() => {
    carregar()
    carregarScores()
    carregarSubints()
    intervalRef.current = setInterval(() => {
      carregar()
      carregarScores()
    }, 10_000)
    return () => clearInterval(intervalRef.current)
  }, [carregar, carregarScores, carregarSubints])

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
        observacao:   `Respondido via ORÁCULO — ${decisao}`,
      })
      await carregar()
      await carregarScores()
    } catch {
      alert("Falha ao registrar decisão. Tente novamente.")
    } finally {
      setAcao(prev => ({ ...prev, [id]: null }))
      setConfirmModal(null)
    }
  }

  const pendentes = aprovacoes.filter(a => a.status === "pendente")
  const historico = aprovacoes.filter(a => a.status !== "pendente")

  // Stats
  const nConfirmadas = aprovacoes.filter(a => a.status === "confirmada").length
  const nRejeitadas  = aprovacoes.filter(a => a.status === "rejeitada").length

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh",
      background:C.bg, fontFamily:SANS, color:C.text, overflow:"hidden" }}>

      {/* ── Header ORÁCULO ── */}
      <header style={{ flexShrink:0, borderBottom:`1px solid ${C.border}`,
        background:`linear-gradient(180deg,${C.oracleSoft} 0%,${C.surface} 100%)`,
        boxShadow:`0 1px 0 rgba(167,139,250,0.10),0 4px 24px rgba(0,0,0,0.4)` }}>

        {/* Topo do header */}
        <div style={{ height:56, display:"flex", alignItems:"center",
          justifyContent:"space-between", padding:"0 22px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:42, height:42, borderRadius:11,
              background:`linear-gradient(135deg,#5B21B6,#7C3AED)`,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:22,
              boxShadow:`0 0 18px rgba(124,58,237,0.5)` }}>🔮</div>
            <div>
              <div style={{ fontSize:19, fontWeight:800, letterSpacing:"-0.02em",
                background:"linear-gradient(90deg,#F1F5F9 0%,#A78BFA 100%)",
                WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
                ORÁCULO
              </div>
              <div style={{ fontSize:11, color:C.oracleLight, fontFamily:MONO,
                marginTop:1, letterSpacing:"0.06em" }}>
                Módulo de Inteligência · Alertas & Análise Autônoma
              </div>
            </div>
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {pendentes.length > 0 && (
              <div style={{ display:"flex", alignItems:"center", gap:7, padding:"5px 13px",
                background:"rgba(245,158,11,0.12)", borderRadius:20,
                border:"1px solid rgba(245,158,11,0.35)" }}>
                <div style={{ width:7, height:7, borderRadius:"50%", background:C.amber,
                  boxShadow:`0 0 7px ${C.amber}`, animation:"pulse-amber 2s ease-in-out infinite" }}/>
                <span style={{ fontSize:13, color:C.amber, fontWeight:700, fontFamily:MONO }}>
                  {pendentes.length} PENDENTE{pendentes.length > 1 ? "S" : ""}
                </span>
              </div>
            )}
            <button onClick={() => { carregar(); carregarScores(); carregarSubints() }}
              title="Atualizar"
              style={{ width:34, height:34, borderRadius:8, border:`1px solid ${C.border}`,
                background:"rgba(255,255,255,0.04)", cursor:"pointer", color:C.textMid,
                display:"flex", alignItems:"center", justifyContent:"center", fontSize:17,
                transition:"all 0.15s" }}>
              ↻
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div style={{ padding:"0 22px 12px", display:"flex", gap:20 }}>
          {[
            { label:"PENDENTES",   value:pendentes.length,   color:C.amber },
            { label:"CONFIRMADOS", value:nConfirmadas,        color:C.green },
            { label:"REJEITADOS",  value:nRejeitadas,         color:C.red   },
            { label:"NO RADAR",    value:scores.length,       color:C.oracleLight },
            { label:"SUBINTs",     value:subints.length,      color:C.cyan },
          ].map(st => (
            <div key={st.label} style={{ display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:18, fontWeight:800, color:st.color, fontFamily:MONO,
                lineHeight:1 }}>
                {st.value}
              </span>
              <span style={{ fontSize:10, color:C.textDim, fontFamily:MONO,
                letterSpacing:"0.07em" }}>
                {st.label}
              </span>
            </div>
          ))}
        </div>
      </header>

      {/* ── Conteúdo ── */}
      <div style={{ flex:1, overflow:"auto", padding:"18px 22px",
        display:"flex", flexDirection:"column", gap:20 }}>

        {/* Loading / Erro */}
        {loading && (
          <div style={{ display:"flex", alignItems:"center", gap:10,
            color:C.textMid, fontSize:14, fontFamily:MONO }}>
            <div style={{ width:14, height:14, border:"2px solid rgba(255,255,255,0.12)",
              borderTopColor:C.oracleLight, borderRadius:"50%" }} className="o-spin"/>
            Carregando ORÁCULO…
          </div>
        )}
        {erro && (
          <div style={{ padding:"12px 16px", borderRadius:10, background:C.redSoft,
            border:"1px solid rgba(239,68,68,0.3)", color:"#FCA5A5", fontSize:14 }}>
            {erro}
          </div>
        )}

        {/* ── Radar de Risco ── */}
        <RiskRadar scores={scores} />

        {/* ══ PENDENTES ══ */}
        <section>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
            <div style={{ width:3, height:16, background:C.amber, borderRadius:2,
              boxShadow:`0 0 8px ${C.amber}88` }}/>
            <span style={{ fontSize:11.5, fontWeight:800, color:C.amber,
              letterSpacing:"0.12em", textTransform:"uppercase" }}>
              Aguardando Decisão
            </span>
            <span style={{ fontSize:11, color:C.textDim, fontFamily:MONO }}>
              · atualiza a cada 10s
            </span>
          </div>

          {!loading && pendentes.length === 0 && (
            <div style={{ padding:"28px", borderRadius:12, border:`1px dashed ${C.border}`,
              textAlign:"center", color:C.textDim, fontSize:14, fontFamily:MONO }}>
              ✓ Nenhuma aprovação pendente
            </div>
          )}

          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {pendentes.map(a => {
              const riscoC = rc(a.risco)
              const prog   = progressoPendencia(a.criado_em)
              const rest   = minutosRestantes(a.criado_em)
              const emAcao = acao[a.id]
              return (
                <div key={a.id} className="o-card o-pending"
                  style={{ borderRadius:12, border:`1px solid ${riscoC.border}`,
                    background:`linear-gradient(135deg,${riscoC.bg},rgba(255,255,255,0.01))`,
                    overflow:"hidden", boxShadow:"0 4px 24px rgba(0,0,0,0.35)" }}>
                  {/* Barra de countdown */}
                  <div style={{ height:3, background:"rgba(255,255,255,0.05)" }}>
                    <div style={{ height:"100%", width:`${100-prog}%`,
                      background:`linear-gradient(90deg,${riscoC.color},${C.amber})`,
                      transition:"width 1s linear", borderRadius:2 }}/>
                  </div>

                  <div style={{ padding:"16px 18px" }}>
                    <div style={{ display:"flex", alignItems:"flex-start",
                      justifyContent:"space-between", gap:12, marginBottom:10 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8,
                          marginBottom:5, flexWrap:"wrap" }}>
                          <span style={{ fontSize:10, fontWeight:800, padding:"3px 10px",
                            borderRadius:5, background:riscoC.bg, color:riscoC.color,
                            border:`1px solid ${riscoC.border}`, letterSpacing:"0.08em",
                            fontFamily:MONO }}>
                            ⚠ {riscoC.label}
                          </span>
                          <span style={{ fontSize:10, fontWeight:700, padding:"3px 10px",
                            borderRadius:5, background:"rgba(255,255,255,0.06)",
                            color:C.textMid, fontFamily:MONO, letterSpacing:"0.05em" }}>
                            {a.tipo_evento?.replace(/_/g," ").toUpperCase()}
                          </span>
                        </div>
                        <p style={{ fontSize:15, fontWeight:600, color:C.text,
                          lineHeight:1.5, margin:0 }}>
                          {a.descricao}
                        </p>
                      </div>
                      <div style={{ textAlign:"right", flexShrink:0 }}>
                        <div style={{ fontSize:11, color:C.amber, fontWeight:700,
                          fontFamily:MONO, whiteSpace:"nowrap" }}>⏱ {rest}</div>
                        <div style={{ fontSize:10, color:C.textDim, fontFamily:MONO,
                          marginTop:2 }}>{tempoAgo(a.criado_em)}</div>
                      </div>
                    </div>

                    <div style={{ display:"flex", gap:16, marginBottom:12, flexWrap:"wrap" }}>
                      <span style={{ fontSize:11, color:C.textDim, fontFamily:MONO }}>
                        ID: <span style={{color:C.textMid}}>{a.id?.slice(0,8)}…</span>
                      </span>
                      <span style={{ fontSize:11, color:C.textDim, fontFamily:MONO }}>
                        Op: <span style={{color:C.textMid}}>{a.operador}</span>
                      </span>
                      <span style={{ fontSize:11, color:C.textDim, fontFamily:MONO }}>
                        {fmtDate(a.criado_em)}
                      </span>
                    </div>

                    {a.tipo_evento === "transcricao_cruzamento" && a.detalhes && (
                      <PainelCruzamento detalhes={a.detalhes} />
                    )}

                    <div style={{ display:"flex", gap:10 }}>
                      <button className="o-btn" disabled={!!emAcao}
                        onClick={() => setConfirmModal({ id:a.id, decisao:"confirmada", descricao:a.descricao })}
                        style={{ flex:1, padding:"10px 0", borderRadius:9,
                          border:"1px solid rgba(34,197,94,0.35)", cursor:emAcao?"not-allowed":"pointer",
                          background:emAcao==="confirmando"?"rgba(34,197,94,0.3)":"rgba(34,197,94,0.18)",
                          color:C.green, fontWeight:800, fontSize:14, fontFamily:MONO,
                          letterSpacing:"0.06em", display:"flex", alignItems:"center",
                          justifyContent:"center", gap:8, transition:"all 0.15s",
                          opacity:emAcao&&emAcao!=="confirmando"?0.4:1 }}>
                        {emAcao==="confirmando"
                          ? <><div style={{width:12,height:12,border:"2px solid rgba(34,197,94,0.3)",borderTopColor:C.green,borderRadius:"50%"}} className="o-spin"/>Confirmando…</>
                          : <>✔ CONFIRMAR</>}
                      </button>
                      <button className="o-btn" disabled={!!emAcao}
                        onClick={() => setConfirmModal({ id:a.id, decisao:"rejeitada", descricao:a.descricao })}
                        style={{ flex:1, padding:"10px 0", borderRadius:9,
                          border:"1px solid rgba(239,68,68,0.35)", cursor:emAcao?"not-allowed":"pointer",
                          background:emAcao==="rejeitando"?"rgba(239,68,68,0.3)":"rgba(239,68,68,0.10)",
                          color:C.red, fontWeight:800, fontSize:14, fontFamily:MONO,
                          letterSpacing:"0.06em", display:"flex", alignItems:"center",
                          justifyContent:"center", gap:8, transition:"all 0.15s",
                          opacity:emAcao&&emAcao!=="rejeitando"?0.4:1 }}>
                        {emAcao==="rejeitando"
                          ? <><div style={{width:12,height:12,border:"2px solid rgba(239,68,68,0.3)",borderTopColor:C.red,borderRadius:"50%"}} className="o-spin"/>Rejeitando…</>
                          : <>✘ REJEITAR</>}
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
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
            <div style={{ width:3, height:16, background:C.textMid, borderRadius:2 }}/>
            <span style={{ fontSize:11.5, fontWeight:800, color:C.textMid,
              letterSpacing:"0.12em", textTransform:"uppercase" }}>
              Histórico de Alertas
            </span>
            <span style={{ fontSize:11, color:C.textDim, fontFamily:MONO }}>
              · {historico.length} registro{historico.length !== 1 ? "s" : ""}
            </span>
          </div>

          {historico.length === 0 && !loading && (
            <div style={{ padding:"20px", borderRadius:12, border:`1px dashed ${C.border}`,
              textAlign:"center", color:C.textDim, fontSize:13, fontFamily:MONO }}>
              Nenhum registro no histórico
            </div>
          )}

          <div style={{ borderRadius:12, border:`1px solid ${C.border}`,
            overflow:"hidden", background:C.surface }}>
            {historico.map((a, i) => {
              const statusC = sc(a.status)
              const riscoC  = rc(a.risco)
              const isConfirmed = a.status === "confirmada"
              return (
                <div key={a.id} className="o-row"
                  style={{ padding:"12px 18px",
                    borderBottom: i < historico.length-1 ? `1px solid ${C.border}` : "none",
                    display:"flex", alignItems:"center", gap:12,
                    transition:"background 0.12s", cursor:"default" }}>
                  {/* Dot */}
                  <div style={{ width:8, height:8, borderRadius:"50%", background:statusC.dot,
                    flexShrink:0, boxShadow:`0 0 5px ${statusC.dot}88` }}/>

                  {/* Conteúdo */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8,
                      marginBottom:3, flexWrap:"wrap" }}>
                      <span style={{ fontSize:12, fontWeight:600, color:C.text,
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                        maxWidth:300 }}>
                        {a.descricao}
                      </span>
                      <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px",
                        borderRadius:4, background:riscoC.bg, color:riscoC.color,
                        border:`1px solid ${riscoC.border}`, fontFamily:MONO,
                        letterSpacing:"0.05em", flexShrink:0 }}>
                        {a.risco}
                      </span>
                      {a.tipo_evento === "transcricao_cruzamento" && (
                        <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px",
                          borderRadius:4, background:"rgba(248,113,113,0.1)",
                          color:"#F87171", border:"1px solid rgba(248,113,113,0.3)",
                          fontFamily:MONO, flexShrink:0 }}>
                          🔍 CRUZAMENTO
                        </span>
                      )}
                    </div>
                    <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                      <span style={{ fontSize:11, color:C.textDim, fontFamily:MONO }}>
                        {fmtDate(a.criado_em)}
                      </span>
                      {a.resposta_por && (
                        <span style={{ fontSize:11, color:C.textDim, fontFamily:MONO }}>
                          · <span style={{color:C.textMid}}>{a.resposta_por}</span>
                        </span>
                      )}
                      {a.respondido_em && (
                        <span style={{ fontSize:11, color:C.textDim, fontFamily:MONO }}>
                          · {tempoAgo(a.respondido_em)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Badge de status */}
                  <span style={{ fontSize:10, fontWeight:800, padding:"4px 10px",
                    borderRadius:5, background:statusC.bg, color:statusC.color,
                    border:`1px solid ${statusC.color}44`, fontFamily:MONO,
                    letterSpacing:"0.07em", flexShrink:0 }}>
                    {statusC.label}
                  </span>

                  {/* Botão SUBINT — só em confirmadas */}
                  {isConfirmed && (
                    <button className="o-btn"
                      onClick={() => setSubintModal({
                        hitl_id:  a.id,
                        entidade: extrairEntidade(a),
                      })}
                      title="Gerar Subsídio de Inteligência"
                      style={{ padding:"5px 12px", borderRadius:8, cursor:"pointer",
                        border:`1px solid ${C.oracleBorder}`,
                        background:C.oracleSoft, color:C.oracleLight,
                        fontWeight:700, fontSize:11, fontFamily:MONO,
                        letterSpacing:"0.04em", flexShrink:0, whiteSpace:"nowrap",
                        display:"flex", alignItems:"center", gap:5,
                        transition:"all 0.15s" }}>
                      📄 SUBINT
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* ══ SUBINTs GERADOS ══ */}
        {subints.length > 0 && (
          <section>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
              <div style={{ width:3, height:16, background:C.cyan, borderRadius:2,
                boxShadow:`0 0 8px ${C.cyan}88` }}/>
              <span style={{ fontSize:11.5, fontWeight:800, color:C.cyan,
                letterSpacing:"0.12em", textTransform:"uppercase" }}>
                Subsídios de Inteligência Gerados
              </span>
              <span style={{ fontSize:11, color:C.textDim, fontFamily:MONO }}>
                · {subints.length} documento{subints.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div style={{ borderRadius:12, border:`1px solid ${C.cyanBorder}`,
              overflow:"hidden", background:C.surface }}>
              {subints.map((s, i) => (
                <div key={s.id} className="o-row"
                  style={{ padding:"12px 18px",
                    borderBottom: i < subints.length-1 ? `1px solid ${C.border}` : "none",
                    display:"flex", alignItems:"center", gap:12, transition:"background 0.12s" }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:C.cyan,
                    flexShrink:0, boxShadow:`0 0 5px ${C.cyan}88` }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:C.text,
                      marginBottom:2 }}>
                      {s.entidade_nome}
                    </div>
                    <div style={{ fontSize:11, color:C.textDim, fontFamily:MONO }}>
                      {s.numero} · {s.origem} · {fmtDate(s.criado_em)}
                      {s.operador && <span> · {s.operador}</span>}
                    </div>
                  </div>
                  <SubintDownloadBtns id={s.id} numero={s.numero} />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ══ Modal de Confirmação/Rejeição ══ */}
      {confirmModal && (
        <div style={{ position:"fixed", inset:0, zIndex:1000,
          background:"rgba(4,7,16,0.85)", display:"flex",
          alignItems:"center", justifyContent:"center", backdropFilter:"blur(6px)" }}
          onClick={e => { if(e.target===e.currentTarget) setConfirmModal(null) }}>
          <div style={{ background:C.surfaceUp, borderRadius:14,
            width:"min(460px,90vw)", padding:"28px 30px",
            boxShadow:"0 32px 80px rgba(0,0,0,0.6)",
            border:"1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:18 }}>
              <div style={{ width:3, height:20, borderRadius:2,
                background: confirmModal.decisao==="confirmada" ? C.green : C.red }}/>
              <div style={{ fontSize:17, fontWeight:800 }}>
                {confirmModal.decisao==="confirmada" ? "✔ Confirmar Alerta" : "✘ Rejeitar Alerta"}
              </div>
            </div>

            <div style={{ padding:"14px 16px", borderRadius:10, marginBottom:20,
              background: confirmModal.decisao==="confirmada" ? C.greenSoft : C.redSoft,
              border:`1px solid ${confirmModal.decisao==="confirmada"?"rgba(34,197,94,0.3)":"rgba(239,68,68,0.3)"}` }}>
              <p style={{ fontSize:14, color:C.text, lineHeight:1.6, margin:0 }}>
                {confirmModal.descricao}
              </p>
            </div>

            <p style={{ fontSize:13, color:C.textMid, marginBottom:22, lineHeight:1.6 }}>
              {confirmModal.decisao==="confirmada"
                ? "Ao confirmar, o ORÁCULO registrará a correlação, atualizará o score de risco das entidades envolvidas e integrará ao grafo de vínculos."
                : "Ao rejeitar, o ORÁCULO registrará a recusa e incrementará o threshold de supressão para esse padrão."}
            </p>

            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setConfirmModal(null)}
                style={{ flex:1, padding:"11px 0", borderRadius:9, cursor:"pointer",
                  background:"rgba(255,255,255,0.05)", border:`1px solid ${C.border}`,
                  color:C.textMid, fontWeight:700, fontSize:14, fontFamily:MONO }}>
                Cancelar
              </button>
              <button className="o-btn"
                onClick={() => decidir(confirmModal.id, confirmModal.decisao)}
                style={{ flex:1, padding:"11px 0", borderRadius:9, cursor:"pointer",
                  border:"none", fontWeight:800, fontSize:14, fontFamily:MONO,
                  letterSpacing:"0.04em",
                  background: confirmModal.decisao==="confirmada"
                    ? "linear-gradient(135deg,#16A34A,#15803D)"
                    : "linear-gradient(135deg,#DC2626,#B91C1C)",
                  color:"#fff",
                  boxShadow: confirmModal.decisao==="confirmada"
                    ? "0 4px 14px rgba(22,163,74,0.4)"
                    : "0 4px 14px rgba(220,38,38,0.4)" }}>
                {confirmModal.decisao==="confirmada" ? "✔ CONFIRMAR" : "✘ REJEITAR"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal SUBINT ══ */}
      {subintModal && (
        <SubintModal hitl={subintModal}
          onClose={() => { setSubintModal(null); carregarSubints() }} />
      )}
    </div>
  )
}

// ── Botões de download inline na lista de SUBINTs ─────────────────────────────
function SubintDownloadBtns({ id, numero }) {
  const [baixandoPdf,  setBaixandoPdf]  = useState(false)
  const [baixandoDocx, setBaixandoDocx] = useState(false)

  async function baixar(formato) {
    const setBaixando = formato==="pdf" ? setBaixandoPdf : setBaixandoDocx
    setBaixando(true)
    try {
      const res  = await api.get(`/subint/${id}/${formato}`)
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = `SUBINT_${(numero||id.slice(0,8)).replace(/\//g,"-")}.${formato}`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert(`Falha ao baixar ${formato.toUpperCase()}.`)
    } finally {
      setBaixando(false)
    }
  }

  return (
    <div style={{ display:"flex", gap:6, flexShrink:0 }}>
      <button className="o-btn" onClick={() => baixar("pdf")} disabled={baixandoPdf}
        title="Baixar PDF"
        style={{ padding:"5px 10px", borderRadius:7, cursor:baixandoPdf?"wait":"pointer",
          border:"1px solid rgba(239,68,68,0.3)", background:"rgba(239,68,68,0.08)",
          color:"#FCA5A5", fontWeight:700, fontSize:11, fontFamily:MONO,
          display:"flex", alignItems:"center", gap:4 }}>
        {baixandoPdf
          ? <div style={{width:10,height:10,border:"2px solid rgba(252,165,165,0.3)",borderTopColor:"#FCA5A5",borderRadius:"50%"}} className="o-spin"/>
          : "PDF"}
      </button>
      <button className="o-btn" onClick={() => baixar("docx")} disabled={baixandoDocx}
        title="Baixar DOCX editável"
        style={{ padding:"5px 10px", borderRadius:7, cursor:baixandoDocx?"wait":"pointer",
          border:`1px solid ${C.cyanBorder}`, background:C.cyanSoft,
          color:C.cyan, fontWeight:700, fontSize:11, fontFamily:MONO,
          display:"flex", alignItems:"center", gap:4 }}>
        {baixandoDocx
          ? <div style={{width:10,height:10,border:`2px solid rgba(34,211,238,0.2)`,borderTopColor:C.cyan,borderRadius:"50%"}} className="o-spin"/>
          : "DOCX"}
      </button>
    </div>
  )
}
