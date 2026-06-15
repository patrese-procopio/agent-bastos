import { useState, useEffect } from "react"
import api from "./api"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const C = {
  bg:        "#0B1120",
  surface:   "#111827",
  surfaceUp: "#1A2236",
  border:    "rgba(255,255,255,0.07)",
  borderUp:  "rgba(255,255,255,0.13)",
  text:      "#F1F5F9",
  textMid:   "#CBD5E1",
  textDim:   "#94A3B8",
  accent:    "#E8A020",
  goldSoft:  "rgba(232,160,32,0.12)",
  goldBorder:"rgba(232,160,32,0.3)",
}

const SITUACAO_STYLE = {
  EXONERADO: { color:"#FCA5A5", bg:"rgba(239,68,68,0.14)",  border:"rgba(239,68,68,0.35)",  dot:"#EF4444" },
  EXONERADA: { color:"#FCA5A5", bg:"rgba(239,68,68,0.14)",  border:"rgba(239,68,68,0.35)",  dot:"#EF4444" },
  DEMITIDO:  { color:"#FDBA74", bg:"rgba(249,115,22,0.14)", border:"rgba(249,115,22,0.35)", dot:"#F97316" },
  DEMITIDA:  { color:"#FDBA74", bg:"rgba(249,115,22,0.14)", border:"rgba(249,115,22,0.35)", dot:"#F97316" },
  VERIFICAR: { color:"#FDE68A", bg:"rgba(251,191,36,0.14)", border:"rgba(251,191,36,0.35)", dot:"#F59E0B" },
  INATIVO:   { color:"#CBD5E1", bg:"rgba(148,163,184,0.14)",border:"rgba(148,163,184,0.30)",dot:"#64748B" },
}
const SIT_DEFAULT = { color:"#CBD5E1", bg:"rgba(148,163,184,0.12)", border:"rgba(148,163,184,0.28)", dot:"#94A3B8" }

function getSituacaoStyle(situacao) {
  if (!situacao) return SIT_DEFAULT
  const key = Object.keys(SITUACAO_STYLE).find(k => situacao.toUpperCase().includes(k))
  return key ? SITUACAO_STYLE[key] : SIT_DEFAULT
}

const LETRAS = ["TODOS", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")]

export default function ListaNegra({ onNavigate }) {
  const [registros,   setRegistros]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [erro,        setErro]        = useState(null)
  const [selecionado, setSelecionado] = useState(null)
  const [busca,       setBusca]       = useState("")
  const [letraAtiva,  setLetraAtiva]  = useState("TODOS")
  const [sitFiltro,   setSitFiltro]   = useState("TODAS")

  useEffect(() => {
    api.get("/lista-negra")
      .then(r => r?.json())
      .then(d => { setRegistros(d.registros || []); setLoading(false) })
      .catch(() => { setErro("Falha ao conectar com o backend."); setLoading(false) })
  }, [])

  // Situações únicas para filtro
  const situacoesUnicas = ["TODAS", ...new Set(
    registros.map(r => r.situacao?.split(" ")[0]?.toUpperCase()).filter(Boolean)
  )]

  // Filtragem encadeada
  const filtrados = registros.filter(r => {
    if (letraAtiva !== "TODOS" && !r.nome?.toUpperCase().startsWith(letraAtiva)) return false
    if (sitFiltro !== "TODAS"  && !r.situacao?.toUpperCase().includes(sitFiltro)) return false
    if (busca.trim()) {
      const q = busca.trim().toUpperCase()
      return r.nome?.toUpperCase().includes(q) ||
             r.unidade?.toUpperCase().includes(q) ||
             r.descricao?.toUpperCase().includes(q)
    }
    return true
  })

  // Contagem por situação
  const countSit = sit => sit === "TODAS"
    ? registros.length
    : registros.filter(r => r.situacao?.toUpperCase().includes(sit)).length

  return (
    <div style={{display:"flex",flex:1,minWidth:0,height:"100%",overflow:"hidden",background:C.bg,fontFamily:SANS,color:C.text}}>

      {/* ── ASIDE ──────────────────────────────────────────────────────────── */}
      <aside style={{
        width:268, flexShrink:0,
        background:C.surface,
        borderRight:`1px solid ${C.border}`,
        display:"flex", flexDirection:"column",
        height:"100%", overflow:"hidden",
      }}>

        {/* Header */}
        <div style={{padding:"16px 16px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
            <div style={{width:3,height:18,background:C.accent,borderRadius:2,
              boxShadow:`0 0 6px ${C.accent}88`}}/>
            <span style={{fontSize:13,fontWeight:800,color:C.accent,letterSpacing:"0.1em",textTransform:"uppercase"}}>
              Lista Negra
            </span>
          </div>
          <div style={{fontSize:13,color:C.textMid,marginLeft:11,marginTop:2}}>
            Registros Caveirinha
          </div>
        </div>

        {/* Contador */}
        <div style={{display:"flex",gap:6,padding:"12px 14px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{flex:1,textAlign:"center",padding:"8px 4px",
            background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:8}}>
            <div style={{fontSize:24,fontWeight:800,color:C.accent,fontFamily:MONO,lineHeight:1}}>{registros.length}</div>
            <div style={{fontSize:12,color:C.textDim,marginTop:4}}>Indexados</div>
          </div>
          <div style={{flex:1,textAlign:"center",padding:"8px 4px",
            background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:8}}>
            <div style={{fontSize:24,fontWeight:800,color:"#4ADE80",fontFamily:MONO,lineHeight:1}}>{filtrados.length}</div>
            <div style={{fontSize:12,color:C.textDim,marginTop:4}}>Filtrados</div>
          </div>
        </div>

        {/* Busca */}
        <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{position:"relative"}}>
            <svg style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={busca} onChange={e=>setBusca(e.target.value)}
              placeholder="Nome, unidade, descrição..."
              style={{width:"100%",paddingLeft:32,paddingRight:12,height:38,
                borderRadius:7,border:`1px solid ${C.border}`,
                background:"rgba(255,255,255,0.05)",fontSize:14,color:C.text,
                outline:"none",fontFamily:SANS,boxSizing:"border-box",caretColor:C.accent}}
            />
          </div>
        </div>

        {/* Filtro por situação */}
        <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{fontSize:11,fontWeight:700,color:C.textDim,letterSpacing:"0.1em",
            textTransform:"uppercase",fontFamily:MONO,marginBottom:7}}>Situação</div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {situacoesUnicas.map(sit => {
              const ativo = sitFiltro === sit
              const st    = sit === "TODAS" ? null : getSituacaoStyle(sit)
              return (
                <button key={sit} onClick={()=>setSitFiltro(sit)} style={{
                  width:"100%", textAlign:"left", padding:"8px 10px",
                  borderRadius:7, cursor:"pointer", border:"none",
                  background: ativo ? (st ? st.bg : C.goldSoft) : "transparent",
                  borderLeft: `3px solid ${ativo ? (st?.dot || C.accent) : "transparent"}`,
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  transition:"all 0.12s",
                }}>
                  <div style={{display:"flex",alignItems:"center",gap:7}}>
                    {st && <span style={{width:7,height:7,borderRadius:"50%",background:st.dot,flexShrink:0}}/>}
                    <span style={{fontSize:14,fontWeight:ativo?700:500,
                      color:ativo?(st?.color||C.accent):C.textMid}}>
                      {sit === "TODAS" ? "Todas" : sit.charAt(0)+sit.slice(1).toLowerCase()}
                    </span>
                  </div>
                  <span style={{fontSize:12,fontWeight:700,color:C.textDim,fontFamily:MONO}}>
                    {countSit(sit)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Filtro A-Z */}
        <div style={{flex:1,overflowY:"auto",padding:"10px 12px"}}>
          <div style={{fontSize:11,fontWeight:700,color:C.textDim,letterSpacing:"0.1em",
            textTransform:"uppercase",fontFamily:MONO,marginBottom:8}}>Índice A–Z</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
            {LETRAS.map(l => {
              const ativo = letraAtiva === l
              const temRegistro = l === "TODOS" || registros.some(r => r.nome?.toUpperCase().startsWith(l))
              return (
                <button key={l} onClick={()=>setLetraAtiva(l)} style={{
                  padding: l === "TODOS" ? "5px 10px" : "5px 0",
                  width: l === "TODOS" ? "auto" : 30,
                  borderRadius:6, border:"1px solid",
                  fontSize:13, fontWeight:700, cursor: temRegistro ? "pointer" : "default",
                  fontFamily:MONO, textAlign:"center",
                  borderColor: ativo ? C.accent : "rgba(255,255,255,0.10)",
                  background: ativo ? C.accent : "transparent",
                  color: ativo ? "#0B1120" : temRegistro ? C.textMid : "rgba(255,255,255,0.2)",
                  transition:"all 0.12s",
                  opacity: temRegistro ? 1 : 0.4,
                }}>{l}</button>
              )
            })}
          </div>
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
              <div style={{fontSize:17,fontWeight:700,color:C.text}}>Lista Negra</div>
              <div style={{fontSize:13,color:C.textMid,fontFamily:MONO,marginTop:1}}>
                {filtrados.length} resultado{filtrados.length !== 1 ? "s" : ""}
                {letraAtiva !== "TODOS" ? ` · Letra ${letraAtiva}` : ""}
                {sitFiltro !== "TODAS" ? ` · ${sitFiltro}` : ""}
              </div>
            </div>
          </div>

          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{
              fontSize:13,fontWeight:800,padding:"5px 12px",borderRadius:6,letterSpacing:"0.06em",
              background:"rgba(239,68,68,0.14)",color:"#FCA5A5",
              border:"1px solid rgba(239,68,68,0.35)",fontFamily:MONO,
            }}>● RESTRITO</span>
          </div>
        </div>

        {/* Área de conteúdo: lista + detalhe */}
        <div style={{flex:1,overflow:"hidden",display:"flex"}}>

          {/* LISTA */}
          <div className="ln-scroll" style={{
            flex: selecionado ? "0 0 420px" : 1,
            overflowY:"auto", padding:"14px 16px",
            display:"flex", flexDirection:"column", gap:8,
            borderRight: selecionado ? `1px solid ${C.border}` : "none",
          }}>
            {loading && (
              <div style={{textAlign:"center",padding:50,color:C.textDim,fontSize:15,fontFamily:MONO}}>
                Carregando registros...
              </div>
            )}
            {erro && (
              <div style={{textAlign:"center",padding:50,color:"#FCA5A5",fontSize:15,fontFamily:MONO}}>
                {erro}
              </div>
            )}
            {!loading && !erro && filtrados.length === 0 && (
              <div style={{textAlign:"center",padding:50,color:C.textDim,fontSize:15,fontFamily:MONO}}>
                Nenhum registro encontrado.
              </div>
            )}

            {!loading && filtrados.map((r, i) => {
              const st         = getSituacaoStyle(r.situacao)
              const isSelected = selecionado?.nome === r.nome && selecionado?.ano === r.ano
              return (
                <div key={i} onClick={()=>setSelecionado(isSelected ? null : r)}
                  className="ln-card" style={{
                    background: isSelected ? "rgba(232,160,32,0.08)" : C.surface,
                    border:`1px solid ${isSelected ? "rgba(232,160,32,0.4)" : C.border}`,
                    borderLeft:`3px solid ${st.dot}`,
                    borderRadius:10, padding:"13px 16px",
                    cursor:"pointer", transition:"all 0.15s",
                    display:"flex", alignItems:"center", gap:14,
                  }}>

                  {/* Avatar */}
                  <div style={{
                    width:44,height:44,borderRadius:"50%",flexShrink:0,
                    background:C.goldSoft,border:`1px solid ${C.goldBorder}`,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:18,fontWeight:800,color:C.accent,fontFamily:MONO,
                  }}>
                    {r.nome?.[0]?.toUpperCase() || "?"}
                  </div>

                  <div style={{flex:1,minWidth:0}}>
                    <div style={{
                      fontSize:16,fontWeight:700,color:C.text,
                      whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",
                    }}>{r.nome}</div>
                    <div style={{
                      fontSize:14,color:C.textMid,fontFamily:MONO,marginTop:3,
                      whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",
                    }}>{r.unidade || r.empresa || "—"} · {r.ano}</div>
                  </div>

                  <span style={{
                    fontSize:13,fontWeight:800,padding:"4px 10px",
                    borderRadius:6,flexShrink:0,fontFamily:MONO,
                    background:st.bg,color:st.color,border:`1px solid ${st.border}`,
                  }}>
                    {r.situacao?.split(" ")[0] || "—"}
                  </span>
                </div>
              )
            })}
          </div>

          {/* PAINEL DE DETALHE */}
          {selecionado && (() => {
            const st = getSituacaoStyle(selecionado.situacao)
            return (
              <div className="ln-scroll" style={{
                flex:1, background:C.bg, overflowY:"auto",
                padding:"22px 26px", display:"flex", flexDirection:"column", gap:18,
              }}>
                {/* Cabeçalho do detalhe */}
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:16,minWidth:0}}>
                    <div style={{
                      width:58,height:58,borderRadius:"50%",flexShrink:0,
                      background:C.goldSoft,border:`2px solid ${C.goldBorder}`,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:26,fontWeight:800,color:C.accent,fontFamily:MONO,
                    }}>{selecionado.nome?.[0]?.toUpperCase() || "?"}</div>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:20,fontWeight:800,color:C.text,lineHeight:1.2}}>
                        {selecionado.nome}
                      </div>
                      <div style={{fontSize:14,color:C.textMid,fontFamily:MONO,marginTop:5}}>
                        Nº {selecionado.numero || "—"} · Ref: {selecionado.referencia || "—"}
                      </div>
                    </div>
                  </div>
                  <button onClick={()=>setSelecionado(null)} style={{
                    width:34,height:34,borderRadius:"50%",flexShrink:0,
                    border:`1px solid ${C.border}`,background:C.surface,
                    cursor:"pointer",fontSize:18,color:C.textMid,
                    display:"flex",alignItems:"center",justifyContent:"center",
                  }}>×</button>
                </div>

                {/* Badge situação */}
                <div style={{
                  display:"inline-flex",alignItems:"center",gap:9,alignSelf:"flex-start",
                  padding:"8px 16px",borderRadius:9,
                  background:st.bg,border:`1px solid ${st.border}`,
                }}>
                  <span style={{width:9,height:9,borderRadius:"50%",background:st.dot}}/>
                  <span style={{fontSize:15,fontWeight:800,color:st.color,fontFamily:MONO,letterSpacing:"0.05em"}}>
                    {selecionado.situacao || "—"}
                  </span>
                </div>

                {/* Campos em grid */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  {[
                    ["Unidade",    selecionado.unidade    || "—"],
                    ["Empresa",    selecionado.empresa    || "—"],
                    ["Data",       selecionado.data       || "—"],
                    ["CPF",        selecionado.cpf        || "—"],
                    ["Ano / Aba",  selecionado.ano        || "—"],
                    ["Referência", selecionado.referencia || "—"],
                  ].map(([k, v]) => (
                    <div key={k} style={{
                      display:"flex",flexDirection:"column",gap:5,
                      padding:"12px 14px",borderRadius:9,
                      background:C.surface,border:`1px solid ${C.border}`,
                    }}>
                      <span style={{fontSize:12,fontWeight:700,color:C.accent,
                        letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:MONO}}>
                        {k}
                      </span>
                      <span style={{fontSize:15,color:C.text,fontWeight:600,wordBreak:"break-word"}}>
                        {v}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Descrição */}
                {selecionado.descricao && (
                  <div style={{
                    padding:"16px 18px",borderRadius:10,
                    background:"rgba(232,160,32,0.06)",
                    border:`1px solid rgba(232,160,32,0.25)`,
                    borderLeft:`3px solid ${C.accent}`,
                  }}>
                    <div style={{fontSize:12,fontWeight:800,color:C.accent,
                      letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:MONO,marginBottom:10}}>
                      ◈ Descrição / Motivo
                    </div>
                    <div style={{fontSize:15,color:C.text,lineHeight:1.7}}>
                      {selecionado.descricao}
                    </div>
                  </div>
                )}

                {/* Aviso LGPD */}
                <div style={{
                  display:"flex",alignItems:"center",gap:8,marginTop:"auto",
                  padding:"11px 14px",borderRadius:8,
                  background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,
                  fontSize:13,color:C.textDim,lineHeight:1.5,
                }}>
                  <span style={{color:C.accent,fontSize:15,flexShrink:0}}>⚠</span>
                  Dados protegidos pela LGPD. CPF parcialmente ocultado. Acesso restrito a agentes autorizados.
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      <style>{`
        @keyframes ln-fade { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:translateY(0)} }
        .ln-card { animation: ln-fade 0.18s ease forwards; }
        .ln-card:hover { background: rgba(232,160,32,0.06) !important; border-color: rgba(232,160,32,0.25) !important; }
        .ln-scroll::-webkit-scrollbar { width:6px; }
        .ln-scroll::-webkit-scrollbar-track { background: transparent; }
        .ln-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.14); border-radius:6px; }
        .ln-scroll::-webkit-scrollbar-thumb:hover { background: rgba(232,160,32,0.4); }
        input::placeholder { color: #64748B !important; }
      `}</style>
    </div>
  )
}
