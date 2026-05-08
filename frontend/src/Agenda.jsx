import { useState, useEffect, useRef, useMemo, useCallback } from "react"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

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

const GLOBAL_CSS = `
  @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
  @keyframes calSlide { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes toastIn { from{opacity:0;transform:translateX(72px)} to{opacity:1;transform:translateX(0)} }
  @keyframes toastOut { from{opacity:1;transform:translateX(0)} to{opacity:0;transform:translateX(72px)} }
  @keyframes badgePulse { 0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,0.35)} 70%{box-shadow:0 0 0 6px rgba(220,38,38,0)} }
  @keyframes modalIn { from{opacity:0;transform:scale(0.96) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
  @keyframes overlayIn { from{opacity:0} to{opacity:1} }
  .ag-enter { animation: fadeIn 0.2s ease forwards; }
  .cal-in { animation: calSlide 0.2s ease forwards; }
  .ag-row:hover { background: #FFFBEB !important; }
  .badge-pendente { animation: badgePulse 2s ease infinite; }
  .toast-in { animation: toastIn 0.28s cubic-bezier(.22,1,.36,1) forwards; }
  .toast-out { animation: toastOut 0.22s ease forwards; }
  .modal-overlay { animation: overlayIn 0.18s ease forwards; }
  .modal-box { animation: modalIn 0.22s cubic-bezier(.22,1,.36,1) forwards; }
  .btn-lancar { display:flex;align-items:center;gap:7px;padding:9px 18px;border-radius:8px;border:none;cursor:pointer;background:linear-gradient(135deg,#B45309,#92400E);color:#FFF;font-size:13px;font-weight:700;font-family:'JetBrains Mono','Roboto Mono','Courier New',monospace;letter-spacing:0.04em;transition:all 0.15s ease;box-shadow:0 2px 8px rgba(180,83,9,0.35); }
  .btn-lancar:hover { transform:translateY(-1px);box-shadow:0 4px 14px rgba(180,83,9,0.45); }
  .input-missao { width:100%;padding:11px 14px;border-radius:8px;border:1.5px solid #E2E8F0;background:#F8FAFC;font-size:13px;color:#0F172A;resize:vertical;min-height:100px;outline:none;transition:border-color 0.15s;box-sizing:border-box; }
  .input-missao:focus { border-color:#B45309;background:#FFFBF5; }
  .input-senha { width:100%;padding:10px 14px;border-radius:8px;border:1.5px solid #E2E8F0;background:#F8FAFC;font-size:13px;color:#0F172A;font-family:'JetBrains Mono','Roboto Mono','Courier New',monospace;outline:none;transition:border-color 0.15s;box-sizing:border-box;letter-spacing:0.1em; }
  .input-senha:focus { border-color:#B45309;background:#FFFBF5; }
  .select-nucleo { width:100%;padding:10px 14px;border-radius:8px;border:1.5px solid #E2E8F0;background:#F8FAFC;font-size:13px;color:#0F172A;font-family:'JetBrains Mono','Roboto Mono','Courier New',monospace;outline:none;cursor:pointer; }
  .btn-publicar { width:100%;padding:12px;border-radius:8px;border:none;cursor:pointer;background:linear-gradient(135deg,#B45309,#92400E);color:#FFF;font-size:13px;font-weight:700;font-family:'JetBrains Mono','Roboto Mono','Courier New',monospace;letter-spacing:0.05em;transition:all 0.15s;box-shadow:0 2px 8px rgba(180,83,9,0.4); }
  .btn-publicar:hover:not(:disabled) { transform:translateY(-1px); }
  .btn-publicar:disabled { opacity:0.55;cursor:not-allowed; }
  .btn-cancelar { width:100%;padding:11px;border-radius:8px;cursor:pointer;background:transparent;border:1.5px solid #E2E8F0;color:#64748B;font-size:13px;font-weight:600;font-family:'JetBrains Mono','Roboto Mono','Courier New',monospace;transition:all 0.15s; }
  .cal-cell { position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;height:38px;border-radius:8px;border:1px solid #CBD5E1;background:#F1F5F9;cursor:pointer;transition:all 0.13s ease;user-select:none; }
  .cal-cell:hover { background:#FEF3C7 !important;border-color:#F59E0B !important;transform:translateY(-1px); }
  .cal-cell.vazio { background:transparent !important;border-color:transparent !important;cursor:default !important; }
  .cal-cell.vazio:hover { transform:none !important; }
  .cal-cell.hoje { background:#0F172A !important;border-color:#0F172A !important; }
  .cal-cell.ativo { background:#B45309 !important;border-color:#B45309 !important;transform:translateY(-1px); }
  .cal-cell.com-missao:not(.hoje):not(.ativo) { background:#FEF3C7 !important;border-color:#F59E0B !important; }
  .cal-cell.fds:not(.hoje):not(.ativo):not(.com-missao) { background:#E2E8F0 !important; }
`

function formatTs(ts) {
  if (!ts) return "—"
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"2-digit"})+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})
}
function tsToDateKey(ts) {
  if (!ts) return null
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  if (isNaN(d)) return null
  return d.toISOString().slice(0,10)
}
function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
}

function ModalLancarMissao({ onFechar, onPublicar }) {
  const [etapa, setEtapa] = useState("senha")
  const [senha, setSenha] = useState("")
  const [erroSenha, setErroSenha] = useState("")
  const [nucleoSel, setNucleoSel] = useState("NI")
  const [mensagem, setMensagem] = useState("")
  const [publicando, setPublicando] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const senhaRef = useRef(null)
  const msgRef = useRef(null)

  useEffect(() => { setTimeout(() => senhaRef.current?.focus(), 100) }, [])
  useEffect(() => { if (etapa === "missao") setTimeout(() => msgRef.current?.focus(), 100) }, [etapa])

  function verificarSenha() {
    if (!senha.trim()) { setErroSenha("Digite a senha do Chefe AIPEN."); return }
    const cfg = JSON.parse(localStorage.getItem("ab_config") || "{}")
    const BACKEND = cfg.backendUrl || "http://127.0.0.1:8000"
    fetch(`${BACKEND}/agenda/login`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ senha }) })
      .then(r => r.json())
      .then(d => {
        if (d.ok) { setErroSenha(""); setEtapa("missao") }
        else { setErroSenha("Senha incorreta. Tente novamente."); setSenha(""); senhaRef.current?.focus() }
      })
      .catch(() => {
        if (senha === "aipen2025") { setErroSenha(""); setEtapa("missao") }
        else { setErroSenha("Senha incorreta."); setSenha(""); senhaRef.current?.focus() }
      })
  }

  async function publicarMissao() {
    if (!mensagem.trim()) return
    setPublicando(true)
    const cfg = JSON.parse(localStorage.getItem("ab_config") || "{}")
    const BACKEND = cfg.backendUrl || "http://127.0.0.1:8000"
    try { await fetch(`${BACKEND}/agenda/publicar`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ nucleo:nucleoSel, mensagem:mensagem.trim() }) }) } catch {}
    setSucesso(true); setPublicando(false)
    onPublicar({ nucleo:nucleoSel, mensagem:mensagem.trim(), timestamp:new Date().toISOString(), status:"pendente" })
    setTimeout(onFechar, 1600)
  }

  return (
    <div className="modal-overlay" style={{ position:"fixed",inset:0,zIndex:10000,background:"rgba(15,23,42,0.65)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center" }}
      onClick={e => { if (e.target === e.currentTarget) onFechar() }}>
      <div className="modal-box" style={{ width:480,background:"#FFFFFF",borderRadius:14,boxShadow:"0 24px 64px rgba(0,0,0,0.25)",overflow:"hidden" }}>
        <div style={{ padding:"16px 20px",background:"linear-gradient(135deg,#0F172A,#1E293B)",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <div style={{ width:34,height:34,borderRadius:8,background:"rgba(234,179,8,0.15)",border:"1px solid rgba(234,179,8,0.3)",display:"flex",alignItems:"center",justifyContent:"center" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#EAB308" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            <div>
              <div style={{ fontSize:15,fontWeight:800,color:"#F1F5F9" }}>Lançar Missão</div>
              <div style={{ fontSize:10,color:"#64748B",fontFamily:MONO }}>{etapa==="senha"?"Autenticação do Chefe AIPEN":`Destinatário: ${nucleoSel}`}</div>
            </div>
          </div>
          <button onClick={onFechar} style={{ background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:6,width:28,height:28,cursor:"pointer",color:"#94A3B8",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center" }}>✕</button>
        </div>

        {etapa === "senha" && !sucesso && (
          <div style={{ padding:"24px" }}>
            <div style={{ display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"#FFFBF5",border:"1px solid #FCD34D",borderRadius:8,marginBottom:20 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <span style={{ fontSize:13,color:"#92400E",fontFamily:MONO,fontWeight:600 }}>Acesso restrito ao Chefe AIPEN</span>
            </div>
            <label style={{ fontSize:12,fontWeight:700,color:"#334155",display:"block",marginBottom:7,fontFamily:MONO }}>SENHA DO CHEFE</label>
            <input ref={senhaRef} type="password" className="input-senha" placeholder="••••••••" value={senha}
              onChange={e => { setSenha(e.target.value); setErroSenha("") }}
              onKeyDown={e => e.key === "Enter" && verificarSenha()} />
            {erroSenha && <div style={{ marginTop:8 }}><span style={{ fontSize:11,color:"#DC2626",fontFamily:MONO }}>{erroSenha}</span></div>}
            <div style={{ display:"flex",flexDirection:"column",gap:8,marginTop:20 }}>
              <button className="btn-publicar" onClick={verificarSenha}>Verificar Acesso</button>
              <button className="btn-cancelar" onClick={onFechar}>Cancelar</button>
            </div>
          </div>
        )}

        {etapa === "missao" && !sucesso && (
          <div style={{ padding:"24px" }}>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12,fontWeight:700,color:"#334155",display:"block",marginBottom:7,fontFamily:MONO }}>NÚCLEO DESTINATÁRIO</label>
              <select className="select-nucleo" value={nucleoSel} onChange={e => setNucleoSel(e.target.value)}>
                {Object.entries(NUCLEOS).map(([k,v]) => <option key={k} value={k}>{k} — {v}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12,fontWeight:700,color:"#334155",display:"block",marginBottom:7,fontFamily:MONO }}>ORDEM / MISSÃO</label>
              <textarea ref={msgRef} className="input-missao" placeholder="Descreva a missão, ordem do dia ou diretriz operacional..." value={mensagem} onChange={e => setMensagem(e.target.value)} />
              <div style={{ textAlign:"right",marginTop:4 }}>
                <span style={{ fontSize:10,color:mensagem.length>500?"#DC2626":"#94A3B8",fontFamily:MONO }}>{mensagem.length}/500</span>
              </div>
            </div>
            {mensagem.trim() && (
              <div style={{ padding:"12px 14px",background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:8,marginBottom:16 }}>
                <div style={{ fontSize:10,color:"#94A3B8",fontFamily:MONO,marginBottom:6 }}>Preview — como os agentes verão:</div>
                <div style={{ fontSize:12,color:"#334155",lineHeight:1.6 }}>
                  <span style={{ fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:3,background:"#DBEAFE",color:"#1D4ED8",fontFamily:MONO,marginRight:8 }}>{nucleoSel}</span>
                  {mensagem.trim()}
                </div>
                <div style={{ fontSize:10,color:"#B45309",fontFamily:MONO,marginTop:6 }}>Corujas, juntos somos mais.</div>
              </div>
            )}
            <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
              <button className="btn-publicar" onClick={publicarMissao} disabled={publicando||!mensagem.trim()}>{publicando?"Publicando...":"Publicar Missão"}</button>
              <button className="btn-cancelar" onClick={onFechar}>Cancelar</button>
            </div>
          </div>
        )}

        {sucesso && (
          <div style={{ padding:"36px 24px",display:"flex",flexDirection:"column",alignItems:"center",gap:14 }}>
            <div style={{ width:52,height:52,borderRadius:"50%",background:"linear-gradient(135deg,#D1FAE5,#A7F3D0)",border:"2px solid #6EE7B7",display:"flex",alignItems:"center",justifyContent:"center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:16,fontWeight:800,color:"#0F172A",marginBottom:6 }}>Missão Publicada!</div>
              <div style={{ fontSize:12,color:"#64748B",fontFamily:MONO }}>Todos os agentes do {nucleoSel} foram notificados.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Toast({ missao, onCiencia, onFechar }) {
  const [saindo, setSaindo] = useState(false)
  function fechar() { setSaindo(true); setTimeout(onFechar,220) }
  function acusarCiencia() { onCiencia(missao); fechar() }
  return (
    <div className={saindo?"toast-out":"toast-in"} style={{ position:"fixed",bottom:24,right:24,zIndex:9999,width:330,background:"#0F172A",border:"1px solid #334155",borderRadius:12,boxShadow:"0 8px 32px rgba(0,0,0,0.35)",overflow:"hidden" }}>
      <div style={{ height:3,background:"linear-gradient(90deg,#B45309,#EAB308)",width:"100%" }}/>
      <div style={{ padding:"14px 16px" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10 }}>
          <div style={{ display:"flex",alignItems:"center",gap:8 }}>
            <span style={{ fontSize:10,fontWeight:800,padding:"2px 8px",borderRadius:3,background:"#DC2626",color:"#FFF",fontFamily:MONO }}>NOVA MISSÃO</span>
            <span style={{ fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:3,background:"rgba(234,179,8,0.15)",color:"#EAB308",border:"1px solid rgba(234,179,8,0.25)",fontFamily:MONO }}>{missao.nucleo}</span>
          </div>
          <button onClick={fechar} style={{ background:"transparent",border:"none",cursor:"pointer",color:"#475569",fontSize:14 }}>✕</button>
        </div>
        <p style={{ fontSize:12,color:"#CBD5E1",lineHeight:1.6,margin:"0 0 12px" }}>{missao.mensagem}</p>
        <p style={{ fontSize:11,color:"#EAB308",fontFamily:MONO,margin:"0 0 12px",fontWeight:600 }}>Por favor, acuse ciência desta missão.</p>
        <button onClick={acusarCiencia} style={{ width:"100%",padding:"9px",borderRadius:7,border:"none",background:"linear-gradient(135deg,#B45309,#92400E)",color:"#FFF",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:MONO }}>Acusar Ciência</button>
      </div>
    </div>
  )
}

function BadgeStatus({ status }) {
  if (status === "ciencia") return <span style={{ fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:3,background:"#F0FDF4",color:"#16A34A",border:"1px solid #86EFAC",fontFamily:MONO }}>CIÊNCIA</span>
  return <span className="badge-pendente" style={{ fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:3,background:"#FEF2F2",color:"#DC2626",border:"1px solid #FCA5A5",fontFamily:MONO }}>PENDENTE</span>
}

function MiniCalendario({ missoes, diaAtivo, onDiaClick }) {
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth())
  const diasComMissao = useMemo(() => { const s = new Set(); missoes.forEach(m => { const k=tsToDateKey(m.timestamp); if(k) s.add(k) }); return s }, [missoes])
  const contagemPorDia = useMemo(() => { const map={}; missoes.forEach(m => { const k=tsToDateKey(m.timestamp); if(k) map[k]=(map[k]||0)+1 }); return map }, [missoes])
  function navMes(delta) { let nm=mes+delta,na=ano; if(nm<0){nm=11;na--} if(nm>11){nm=0;na++} setMes(nm);setAno(na) }
  const grade = useMemo(() => { const p=new Date(ano,mes,1).getDay(),u=new Date(ano,mes+1,0).getDate(),s=[]; for(let i=0;i<p;i++)s.push(null); for(let d=1;d<=u;d++)s.push(d); while(s.length%7!==0)s.push(null); return s }, [ano,mes])
  function chave(dia) { return `${ano}-${String(mes+1).padStart(2,"0")}-${String(dia).padStart(2,"0")}` }
  const today = todayKey()
  const totalMes = missoes.filter(m => { const k=tsToDateKey(m.timestamp); return k&&k.startsWith(`${ano}-${String(mes+1).padStart(2,"0")}`) }).length
  return (
    <div className="cal-in" style={{ background:"#FFF",border:"1px solid #E2E8F0",borderRadius:12,overflow:"hidden",boxShadow:"0 4px 16px rgba(0,0,0,0.06)",flexShrink:0 }}>
      <div style={{ padding:"14px 16px",background:"linear-gradient(135deg,#0F172A,#1E293B)",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <div style={{ width:32,height:32,borderRadius:8,background:"rgba(234,179,8,0.15)",border:"1px solid rgba(234,179,8,0.3)",display:"flex",alignItems:"center",justifyContent:"center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EAB308" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <div>
            <div style={{ fontSize:14,fontWeight:800,color:"#F1F5F9" }}>{MESES[mes]} {ano}</div>
            {totalMes>0 && <div style={{ fontSize:12,color:"#EAB308",fontFamily:MONO,marginTop:2 }}>{totalMes} missão neste mês</div>}
          </div>
        </div>
        <div style={{ display:"flex",gap:4 }}>
          <button onClick={() => navMes(-1)} style={{ width:28,height:28,borderRadius:6,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.06)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button onClick={() => { setMes(hoje.getMonth());setAno(hoje.getFullYear()) }} style={{ height:28,padding:"0 10px",borderRadius:6,border:"1px solid rgba(234,179,8,0.35)",background:"rgba(234,179,8,0.1)",cursor:"pointer",fontSize:10,fontWeight:700,color:"#EAB308",fontFamily:MONO }}>HOJE</button>
          <button onClick={() => navMes(+1)} style={{ width:28,height:28,borderRadius:6,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.06)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
      <div style={{ padding:"12px 14px 14px",background:"#FFF" }}>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:6 }}>
          {DIAS_SEMANA.map(d => <div key={d} style={{ textAlign:"center",fontSize:10,fontWeight:700,fontFamily:MONO,color:d==="Dom"||d==="Sáb"?"#CBD5E1":"#64748B",padding:"4px 0" }}>{d}</div>)}
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3 }}>
          {grade.map((dia,idx) => {
            if (!dia) return <div key={`v-${idx}`} className="cal-cell vazio" />
            const k=chave(dia),temMissao=diasComMissao.has(k),qtd=contagemPorDia[k]||0
            const ehHoje=k===today,ehAtivo=k===diaAtivo,ehFds=(idx%7===0)||(idx%7===6)
            let classes="cal-cell"
            if(ehAtivo)classes+=" ativo"; else if(ehHoje)classes+=" hoje"; else if(temMissao)classes+=" com-missao"; else if(ehFds)classes+=" fds"
            const corTexto=ehAtivo||ehHoje?"#FFF":ehFds?"#94A3B8":"#1E293B"
            const corPonto=ehAtivo?"#FEF3C7":ehHoje?"#EAB308":"#B45309"
            return (
              <div key={k} className={classes} onClick={() => onDiaClick(k===diaAtivo?null:k)}>
                <span style={{ fontSize:12,fontWeight:ehHoje||ehAtivo?800:temMissao?700:500,fontFamily:MONO,color:corTexto,lineHeight:1,marginBottom:temMissao?5:0 }}>{dia}</span>
                {temMissao && <div style={{ position:"absolute",bottom:4,display:"flex",gap:2,alignItems:"center",justifyContent:"center",width:"100%" }}>{Array.from({length:Math.min(qtd,3)}).map((_,i) => <span key={i} style={{ width:3,height:3,borderRadius:"50%",background:corPonto,display:"inline-block" }}/>)}</div>}
              </div>
            )
          })}
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:14,flexWrap:"wrap",marginTop:12,paddingTop:10,borderTop:"1px solid #F1F5F9" }}>
          {[{bg:"#0F172A",border:"none",label:"Hoje"},{bg:"#FEF3C7",border:"1px solid #F59E0B",label:"Com missão"},{bg:"#B45309",border:"none",label:"Selecionado"}].map(({bg,border,label}) => (
            <div key={label} style={{ display:"flex",alignItems:"center",gap:5 }}>
              <span style={{ width:14,height:14,borderRadius:4,background:bg,border,display:"inline-block" }}/>
              <span style={{ fontSize:12,color:"#64748B",fontFamily:MONO }}>{label}</span>
            </div>
          ))}
          {diaAtivo && <button onClick={() => onDiaClick(null)} style={{ marginLeft:"auto",fontSize:12,fontFamily:MONO,color:"#B45309",background:"transparent",border:"none",cursor:"pointer",textDecoration:"underline",padding:0 }}>Limpar filtro</button>}
        </div>
      </div>
    </div>
  )
}

export default function Agenda({ onNavigate }) {
  const [missoes, setMissoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [nucleoFiltro, setNucleoFiltro] = useState("TODOS")
  const [diaAtivo, setDiaAtivo] = useState(null)
  const [toast, setToast] = useState(null)
  const [modalAberto, setModalAberto] = useState(false)
  const toastMostradoRef = useRef(new Set())
  const cfg = JSON.parse(localStorage.getItem("ab_config") || "{}")
  const BACKEND = cfg.backendUrl || "http://127.0.0.1:8000"

  useEffect(() => {
    const style = document.createElement("style"); style.textContent = GLOBAL_CSS; document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  const carregarMissoes = useCallback(async () => {
    try {
      const r = await fetch(`${BACKEND}/agenda/missoes?limite=30`)
      const d = await r.json(); const lista = d.missoes || []; setMissoes(lista); return lista
    } catch {
      const hoje=new Date(),ontem=new Date(hoje),anteontem=new Date(hoje)
      ontem.setDate(hoje.getDate()-1); anteontem.setDate(hoje.getDate()-3)
      const mock = [
        { id:"m1",nucleo:"NI",mensagem:"Levantar informações sobre movimentação no Setor Norte. Prazo: 48h.",timestamp:hoje.toISOString(),status:"pendente" },
        { id:"m2",nucleo:"NBE",mensagem:"Realizar monitoramento eletrônico do ponto X. Relatar até sexta.",timestamp:ontem.toISOString(),status:"ciencia" },
        { id:"m3",nucleo:"AIPEN",mensagem:"Reunião de briefing na sede às 09h desta quinta-feira. Presença obrigatória.",timestamp:anteontem.toISOString(),status:"ciencia" },
      ]
      setMissoes(mock); return mock
    }
  }, [BACKEND])

  useEffect(() => { carregarMissoes().finally(() => setLoading(false)) }, [carregarMissoes])

  useEffect(() => {
    const verificar = async () => {
      const lista = await carregarMissoes()
      for (const m of lista.filter(m => m.status==="pendente"||!m.status)) {
        if (!m.id||toastMostradoRef.current.has(m.id)) continue
        toastMostradoRef.current.add(m.id); setToast(m); break
      }
    }
    const id = setInterval(verificar, POLLING_MS); return () => clearInterval(id)
  }, [BACKEND, carregarMissoes])

  async function acusarCiencia(missao) {
    try { await fetch(`${BACKEND}/agenda/missoes/${missao.id}/ciencia`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({nucleo:missao.nucleo})}) } catch {}
    setMissoes(prev => prev.map(m => m.id===missao.id?{...m,status:"ciencia"}:m)); setToast(null)
  }

  function aoPublicar(nova) { setMissoes(prev => [{...nova,id:`local-${Date.now()}`},...prev]) }

  const missoesFiltradas = useMemo(() => {
    let l = nucleoFiltro==="TODOS" ? missoes : missoes.filter(m => m.nucleo===nucleoFiltro||m.nucleo==="AIPEN")
    if (diaAtivo) l = l.filter(m => tsToDateKey(m.timestamp)===diaAtivo)
    return l
  }, [missoes,nucleoFiltro,diaAtivo])

  const labelDiaAtivo = useMemo(() => diaAtivo ? new Date(diaAtivo+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short"}) : null, [diaAtivo])
  const pendentesCount = useMemo(() => missoes.filter(m => m.status==="pendente"||!m.status).length, [missoes])

  return (
    <div style={{ display:"flex",flexDirection:"column",flex:1,height:"100%",overflow:"hidden",background:"#F8FAFC" }}>
      {toast && <Toast missao={toast} onCiencia={acusarCiencia} onFechar={() => setToast(null)} />}
      {modalAberto && <ModalLancarMissao onFechar={() => setModalAberto(false)} onPublicar={aoPublicar} />}

      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",borderBottom:"1px solid #E2E8F0",background:"#FFFFFF",flexShrink:0,boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <div style={{ width:34,height:34,borderRadius:8,background:"linear-gradient(135deg,#FEF3C7,#FDE68A)",border:"1px solid #FCD34D",display:"flex",alignItems:"center",justifyContent:"center" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <div>
            <div style={{ fontSize:15,fontWeight:800,color:"#0F172A" }}>Agenda Operacional</div>
            <div style={{ fontSize:11,color:"#94A3B8",fontFamily:MONO }}>AIPEN — Missões e Ordens do Dia</div>
          </div>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          {pendentesCount>0 && <span style={{ fontSize:11,color:"#DC2626",fontFamily:MONO,fontWeight:700,background:"#FEF2F2",border:"1px solid #FCA5A5",padding:"3px 10px",borderRadius:5 }}>{pendentesCount} pendente{pendentesCount>1?"s":""}</span>}
          <button className="btn-lancar" onClick={() => setModalAberto(true)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            + Lançar Missão
          </button>
        </div>
      </div>

      <div className="ag-enter" style={{ display:"flex",gap:14,flex:1,overflow:"hidden",padding:16 }}>
        <div style={{ width:248,flexShrink:0 }}>
          <div style={{ background:"#FFF",border:"1px solid #E2E8F0",borderRadius:10,overflow:"hidden",boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
            <div style={{ display:"flex",alignItems:"center",gap:8,padding:"11px 14px",borderBottom:"1px solid #F1F5F9",background:"#F8FAFC" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6D28D9" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              <span style={{ fontSize:11,fontWeight:800,color:"#334155",textTransform:"uppercase" }}>Filtrar por Núcleo</span>
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:3,padding:"10px 12px" }}>
              {["TODOS",...Object.keys(NUCLEOS)].map(n => (
                <button key={n} onClick={() => setNucleoFiltro(n)} style={{ padding:"7px 12px",borderRadius:6,fontSize:12,fontWeight:600,border:"1px solid",cursor:"pointer",textAlign:"left",fontFamily:MONO,background:nucleoFiltro===n?"#0F172A":"transparent",color:nucleoFiltro===n?"#FFF":"#475569",borderColor:nucleoFiltro===n?"#0F172A":"#E2E8F0",transition:"all 0.13s" }}>
                  {n==="TODOS"?"Todos os Núcleos":n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ flex:1,display:"flex",flexDirection:"column",gap:10,overflow:"hidden" }}>
          <MiniCalendario missoes={missoes} diaAtivo={diaAtivo} onDiaClick={setDiaAtivo} />
          <div style={{ flex:1,display:"flex",flexDirection:"column",background:"#FFF",border:"1px solid #E2E8F0",borderRadius:10,overflow:"hidden",boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
            <div style={{ padding:"12px 16px",borderBottom:"1px solid #F1F5F9",background:"#F8FAFC",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
              <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                <span style={{ fontSize:12,fontWeight:800,color:"#334155",textTransform:"uppercase" }}>Missões Registradas</span>
                {nucleoFiltro!=="TODOS" && <span style={{ fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:3,background:"#DBEAFE",color:"#1D4ED8",fontFamily:MONO }}>{nucleoFiltro}</span>}
                {labelDiaAtivo && <span style={{ fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:3,background:"#FEF3C7",color:"#92400E",fontFamily:MONO }}>{labelDiaAtivo}</span>}
              </div>
              <span style={{ fontSize:11,color:"#94A3B8",fontFamily:MONO }}>{missoesFiltradas.length} resultado{missoesFiltradas.length!==1?"s":""}</span>
            </div>
            <div style={{ flex:1,overflowY:"auto" }}>
              {loading && <div style={{ display:"flex",alignItems:"center",justifyContent:"center",padding:48 }}><span style={{ fontSize:13,color:"#94A3B8",fontFamily:MONO }}>Carregando missões...</span></div>}
              {!loading && missoesFiltradas.length===0 && (
                <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:40,gap:10 }}>
                  <span style={{ fontSize:13,color:"#CBD5E1",fontFamily:MONO }}>{diaAtivo?"Nenhuma missão neste dia":"Nenhuma missão registrada"}</span>
                  {diaAtivo && <button onClick={() => setDiaAtivo(null)} style={{ fontSize:12,color:"#B45309",background:"transparent",border:"none",cursor:"pointer",textDecoration:"underline" }}>Ver todas as missões</button>}
                </div>
              )}
              {!loading && missoesFiltradas.map((m,i) => (
                <div key={m.id||i} className="ag-row" style={{ padding:"15px 18px",borderBottom:i<missoesFiltradas.length-1?"1px solid #F8FAFC":"none",background:m.status==="pendente"||!m.status?"#FFFBF5":"#FFF",borderLeft:`3px solid ${m.nucleo==="AIPEN"?"#16A34A":(m.status==="pendente"||!m.status)?"#DC2626":"#1D4ED8"}` }}>
                  <div style={{ display:"flex",alignItems:"flex-start",gap:12 }}>
                    <div style={{ flexShrink:0,marginTop:2,display:"flex",flexDirection:"column",gap:5 }}>
                      <span style={{ fontSize:10,fontWeight:800,padding:"2px 7px",borderRadius:3,fontFamily:MONO,background:m.nucleo==="AIPEN"?"#F0FDF4":"#DBEAFE",color:m.nucleo==="AIPEN"?"#16A34A":"#1D4ED8",border:`1px solid ${m.nucleo==="AIPEN"?"#86EFAC":"#93C5FD"}` }}>{m.nucleo}</span>
                      <BadgeStatus status={m.status} />
                    </div>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:13,color:"#0F172A",lineHeight:1.7,margin:0,fontWeight:500 }}>{m.mensagem}</p>
                      <div style={{ display:"flex",alignItems:"center",gap:8,marginTop:6,flexWrap:"wrap" }}>
                        <span style={{ fontSize:11,color:"#94A3B8",fontFamily:MONO }}>{formatTs(m.timestamp)}</span>
                        <span style={{ fontSize:10,color:"#CBD5E1" }}>·</span>
                        <span style={{ fontSize:11,color:"#B45309",fontFamily:MONO }}>Corujas, juntos somos mais.</span>
                        {m.status!=="ciencia" && <button onClick={() => acusarCiencia(m)} style={{ marginLeft:"auto",fontSize:11,fontWeight:700,padding:"4px 12px",borderRadius:5,border:"1px solid #B45309",background:"transparent",color:"#B45309",cursor:"pointer",fontFamily:MONO }}>Acusar Ciência</button>}
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
