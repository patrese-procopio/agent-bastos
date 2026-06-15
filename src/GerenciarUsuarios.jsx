import { useState, useEffect, useCallback } from "react"
import api from "./api"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const C = {
  bg:        "#0B1120",
  surface:   "#111827",
  surfaceUp: "#1A2236",
  border:    "rgba(255,255,255,0.07)",
  borderUp:  "rgba(255,255,255,0.14)",
  gold:      "#E8A020",
  goldSoft:  "rgba(232,160,32,0.12)",
  text:      "#F1F5F9",
  textMid:   "#94A3B8",
  textDim:   "rgba(255,255,255,0.3)",
  green:     "#22C55E",
  red:       "#EF4444",
  blue:      "#60A5FA",
}

// ── Perfis predefinidos ────────────────────────────────────────────────────────
const PERFIS = {
  operador_campo: {
    label:    "Operador de Campo",
    color:    "#34D399",
    bg:       "rgba(52,211,153,0.1)",
    border:   "rgba(52,211,153,0.3)",
    descricao:"Acesso básico: Chat RAG e Transcrição. Ideal para agentes em campo.",
    level:    "operador_campo",
    modules:  ["chat_rag", "transcricao"],
  },
  analista: {
    label:    "Analista",
    color:    "#60A5FA",
    bg:       "rgba(96,165,250,0.1)",
    border:   "rgba(96,165,250,0.3)",
    descricao:"Acesso operacional de análise: RAG, Transcrição, Notícias, Referências, Sinais Fracos e Agenda.",
    level:    "analista",
    modules:  ["chat_rag", "transcricao", "noticias", "referencias", "sinais_fracos", "agenda"],
  },
  agente: {
    label:    "Agente",
    color:    "#F59E0B",
    bg:       "rgba(245,158,11,0.1)",
    border:   "rgba(245,158,11,0.3)",
    descricao:"Acesso completo de inteligência: tudo do Analista + HITL, OSINT, Grupos, Vínculos, Listas e mais.",
    level:    "agente",
    modules:  [
      "chat_rag", "transcricao", "noticias", "referencias", "sinais_fracos", "agenda",
      "alertas", "osint", "grupos", "inteligencia_grupos", "lista_negra",
      "vinculo", "extrato", "grafoscopia", "hitl", "matrix_nucadis", "liderancas",
    ],
  },
  admin: {
    label:    "Admin",
    color:    "#F87171",
    bg:       "rgba(248,113,113,0.1)",
    border:   "rgba(248,113,113,0.3)",
    descricao:"Acesso total: todos os módulos + Dashboard, Configurações e Gerenciamento de Usuários.",
    level:    "admin",
    modules:  [
      "admin", "chat_rag", "transcricao", "noticias", "referencias", "sinais_fracos", "agenda",
      "alertas", "osint", "grupos", "inteligencia_grupos", "lista_negra",
      "vinculo", "extrato", "grafoscopia", "hitl", "matrix_nucadis", "liderancas",
      "dashboard", "configuracoes", "usuarios",
    ],
  },
}

const NIVEL_ORDER = ["operador_campo", "analista", "agente", "admin"]

function perfilDe(level) { return PERFIS[level] || PERFIS.analista }

function fmtDate(iso) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" })
}

const GU_CSS = `
  @keyframes guFade { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  .gu-card { animation: guFade 0.2s ease forwards; }
  .gu-btn:hover { filter: brightness(1.12); transform: translateY(-1px); }
  .gu-btn:active { transform: scale(0.97); }
  .gu-row:hover { background: rgba(255,255,255,0.025) !important; }
  .gu-input:focus { border-color: #E8A020 !important; box-shadow: 0 0 0 3px rgba(232,160,32,0.12) !important; }
  .gu-perfil:hover { border-color: rgba(255,255,255,0.25) !important; transform: translateY(-2px); }
  .gu-perfil.selected { box-shadow: 0 0 0 2px currentColor; }
`

// ── Modal criar/editar usuário ─────────────────────────────────────────────────
function ModalUsuario({ usuario, onClose, onSave }) {
  const editando = !!usuario
  const [form, setForm] = useState({
    username: usuario?.username || "",
    password: "",
    nivel:    usuario?.level    || "analista",
  })
  const [erro, setErro]       = useState("")
  const [salvando, setSalvando] = useState(false)

  const perfil = perfilDe(form.nivel)

  async function salvar() {
    if (!editando && !form.username.trim()) return setErro("Username obrigatório.")
    if (!editando && !form.password.trim()) return setErro("Senha obrigatória.")
    setSalvando(true); setErro("")
    try {
      if (editando) {
        const body = { level: form.nivel, modules: PERFIS[form.nivel]?.modules || [] }
        if (form.password.trim()) body.password = form.password.trim()
        await api.put(`/auth/usuarios/${usuario.username}`, body)
      } else {
        await api.post("/auth/usuarios", {
          username: form.username.trim(),
          password: form.password.trim(),
          level:    form.nivel,
          modules:  PERFIS[form.nivel]?.modules || [],
        })
      }
      onSave()
    } catch (e) {
      const msg = await e.response?.json?.().catch(() => null)
      setErro(msg?.detail || "Erro ao salvar usuário.")
    } finally { setSalvando(false) }
  }

  return (
    <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(7,10,20,0.85)",
      display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)"}}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="gu-card" style={{background:"#111827",borderRadius:14,width:"min(520px,92vw)",
        padding:"28px 30px",border:"1px solid rgba(255,255,255,0.09)",
        boxShadow:"0 32px 80px rgba(0,0,0,0.6)"}}>

        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:22}}>
          <div style={{width:3,height:20,background:C.gold,borderRadius:2}}/>
          <span style={{fontSize:17,fontWeight:800}}>
            {editando ? `Editar — ${usuario.username}` : "Novo Usuário"}
          </span>
        </div>

        {/* Username (só na criação) */}
        {!editando && (
          <div style={{marginBottom:16}}>
            <label style={{fontSize:12,fontWeight:700,color:C.textMid,letterSpacing:"0.08em",
              textTransform:"uppercase",display:"block",marginBottom:6}}>Username</label>
            <input className="gu-input"
              value={form.username}
              onChange={e => setForm(f => ({...f, username: e.target.value.toLowerCase().replace(/\s/g,"_")}))}
              placeholder="ex: joao.silva"
              style={{width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,
                borderRadius:8,padding:"10px 14px",fontSize:14,color:C.text,outline:"none",
                fontFamily:MONO,transition:"border-color 0.15s,box-shadow 0.15s"}}/>
          </div>
        )}

        {/* Senha */}
        <div style={{marginBottom:18}}>
          <label style={{fontSize:12,fontWeight:700,color:C.textMid,letterSpacing:"0.08em",
            textTransform:"uppercase",display:"block",marginBottom:6}}>
            {editando ? "Nova Senha (deixe vazio para não alterar)" : "Senha"}
          </label>
          <input className="gu-input" type="password"
            value={form.password}
            onChange={e => setForm(f => ({...f, password: e.target.value}))}
            placeholder={editando ? "••••••••" : "Mínimo 8 caracteres"}
            style={{width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,
              borderRadius:8,padding:"10px 14px",fontSize:14,color:C.text,outline:"none",
              fontFamily:MONO,transition:"border-color 0.15s,box-shadow 0.15s"}}/>
        </div>

        {/* Seleção de Perfil */}
        <div style={{marginBottom:22}}>
          <label style={{fontSize:12,fontWeight:700,color:C.textMid,letterSpacing:"0.08em",
            textTransform:"uppercase",display:"block",marginBottom:10}}>Perfil de Acesso</label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {NIVEL_ORDER.map(key => {
              const p = PERFIS[key]
              const sel = form.nivel === key
              return (
                <button key={key} className="gu-perfil"
                  onClick={() => setForm(f => ({...f, nivel: key}))}
                  style={{padding:"12px 14px",borderRadius:10,cursor:"pointer",textAlign:"left",
                    border:`1px solid ${sel ? p.color : "rgba(255,255,255,0.1)"}`,
                    background: sel ? p.bg : "rgba(255,255,255,0.03)",
                    transition:"all 0.15s", color: p.color,
                    outline:"none", boxShadow: sel ? `0 0 0 2px ${p.color}44` : "none"}}>
                  <div style={{fontSize:13,fontWeight:800,marginBottom:3}}>{p.label}</div>
                  <div style={{fontSize:11,color:C.textMid,lineHeight:1.4,fontFamily:MONO}}>
                    {p.modules.length} módulos
                  </div>
                </button>
              )
            })}
          </div>
          {perfil && (
            <p style={{fontSize:12,color:C.textMid,marginTop:10,lineHeight:1.5,
              padding:"8px 12px",borderRadius:8,background:"rgba(255,255,255,0.03)",
              border:`1px solid ${C.border}`}}>
              {perfil.descricao}
            </p>
          )}
        </div>

        {erro && (
          <div style={{padding:"10px 14px",borderRadius:8,background:"rgba(239,68,68,0.1)",
            border:"1px solid rgba(239,68,68,0.3)",color:"#FCA5A5",fontSize:13,marginBottom:14}}>
            {erro}
          </div>
        )}

        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose}
            style={{flex:1,padding:"11px 0",borderRadius:9,cursor:"pointer",
              background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,
              color:C.textMid,fontWeight:700,fontSize:14,fontFamily:MONO}}>
            Cancelar
          </button>
          <button className="gu-btn" onClick={salvar} disabled={salvando}
            style={{flex:1,padding:"11px 0",borderRadius:9,cursor:"pointer",border:"none",
              background:"linear-gradient(135deg,#E8A020,#B45309)",
              color:"#FFF",fontWeight:800,fontSize:14,fontFamily:MONO,
              boxShadow:"0 4px 14px rgba(180,83,9,0.35)",
              opacity:salvando?0.6:1,transition:"all 0.15s"}}>
            {salvando ? "Salvando…" : editando ? "Salvar Alterações" : "Criar Usuário"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal confirmação de exclusão ─────────────────────────────────────────────
function ModalConfirmar({ username, onClose, onConfirm }) {
  return (
    <div style={{position:"fixed",inset:0,zIndex:300,background:"rgba(7,10,20,0.9)",
      display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)"}}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="gu-card" style={{background:"#111827",borderRadius:14,width:"min(400px,90vw)",
        padding:"28px 30px",border:"1px solid rgba(239,68,68,0.2)",
        boxShadow:"0 32px 80px rgba(0,0,0,0.6)"}}>
        <div style={{fontSize:17,fontWeight:800,marginBottom:10}}>Remover Usuário</div>
        <p style={{fontSize:14,color:C.textMid,lineHeight:1.6,marginBottom:22}}>
          Tem certeza que deseja remover <span style={{color:C.text,fontWeight:700,fontFamily:MONO}}>{username}</span>?
          Esta ação não pode ser desfeita.
        </p>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose}
            style={{flex:1,padding:"10px 0",borderRadius:9,cursor:"pointer",
              background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,
              color:C.textMid,fontWeight:700,fontSize:14,fontFamily:MONO}}>
            Cancelar
          </button>
          <button className="gu-btn" onClick={onConfirm}
            style={{flex:1,padding:"10px 0",borderRadius:9,cursor:"pointer",border:"none",
              background:"linear-gradient(135deg,#DC2626,#B91C1C)",
              color:"#FFF",fontWeight:800,fontSize:14,fontFamily:MONO,
              boxShadow:"0 4px 14px rgba(220,38,38,0.35)"}}>
            Remover
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function GerenciarUsuarios() {
  const [usuarios, setUsuarios]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [erro, setErro]           = useState(null)
  const [modal, setModal]         = useState(null)  // null | "criar" | { usuario }
  const [confirmar, setConfirmar] = useState(null)  // null | username

  useEffect(() => {
    const style = document.createElement("style")
    style.textContent = GU_CSS
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  const carregar = useCallback(async () => {
    try {
      const res  = await api.get("/auth/usuarios")
      const data = await res.json()
      setUsuarios(Array.isArray(data) ? data : [])
      setErro(null)
    } catch {
      setErro("Falha ao carregar usuários.")
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function toggleAtivo(u) {
    try {
      await api.put(`/auth/usuarios/${u.username}`, { active: !u.active })
      await carregar()
    } catch { alert("Erro ao alterar status.") }
  }

  async function deletar(username) {
    try {
      await api.delete(`/auth/usuarios/${username}`)
      setConfirmar(null)
      await carregar()
    } catch { alert("Erro ao remover usuário.") }
  }

  // Contadores por perfil
  const counts = NIVEL_ORDER.reduce((acc, k) => {
    acc[k] = usuarios.filter(u => u.level === k).length
    return acc
  }, {})

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:C.bg,
      fontFamily:SANS,color:C.text,overflow:"hidden"}}>

      {/* ── Topbar ── */}
      <header style={{height:52,borderBottom:`1px solid ${C.border}`,display:"flex",
        alignItems:"center",justifyContent:"space-between",padding:"0 22px",
        background:C.surface,flexShrink:0,boxShadow:"0 1px 0 rgba(232,160,32,0.08)"}}>
        <div>
          <div style={{fontSize:17,fontWeight:700,letterSpacing:"-0.01em"}}>Gerenciar Usuários</div>
          <div style={{fontSize:12,color:C.textMid,fontFamily:MONO,marginTop:1}}>
            Controle de Acesso · {usuarios.length} usuário{usuarios.length !== 1 ? "s" : ""}
          </div>
        </div>
        <button className="gu-btn" onClick={() => setModal("criar")}
          style={{display:"flex",alignItems:"center",gap:8,padding:"8px 18px",
            borderRadius:9,border:"none",cursor:"pointer",
            background:"linear-gradient(135deg,#E8A020,#B45309)",
            color:"#FFF",fontWeight:800,fontSize:13,fontFamily:MONO,
            boxShadow:"0 4px 14px rgba(180,83,9,0.3)"}}>
          + Novo Usuário
        </button>
      </header>

      <div style={{flex:1,overflow:"auto",padding:"18px 22px",display:"flex",flexDirection:"column",gap:18}}>

        {/* ── Cards de resumo por perfil ── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
          {NIVEL_ORDER.map(key => {
            const p = PERFIS[key]
            return (
              <div key={key} className="gu-card"
                style={{padding:"14px 16px",borderRadius:12,
                  background:`linear-gradient(135deg,${p.bg},rgba(255,255,255,0.01))`,
                  border:`1px solid ${p.border}`}}>
                <div style={{fontSize:11,fontWeight:800,color:p.color,
                  letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6,fontFamily:MONO}}>
                  {p.label}
                </div>
                <div style={{fontSize:28,fontWeight:900,color:C.text,lineHeight:1}}>
                  {counts[key] || 0}
                </div>
                <div style={{fontSize:11,color:C.textMid,marginTop:4,fontFamily:MONO}}>
                  {p.modules.length} módulos
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Estado ── */}
        {loading && (
          <div style={{color:C.textMid,fontSize:14,fontFamily:MONO}}>Carregando…</div>
        )}
        {erro && (
          <div style={{padding:"12px 16px",borderRadius:10,
            background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",
            color:"#FCA5A5",fontSize:14}}>{erro}</div>
        )}

        {/* ── Tabela de usuários ── */}
        {!loading && !erro && (
          <div style={{borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden",background:C.surface}}>
            {/* Header */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 160px 1fr 110px 80px",
              padding:"10px 18px",borderBottom:`1px solid ${C.border}`,
              background:"rgba(255,255,255,0.025)"}}>
              {["Usuário","Perfil","Módulos","Criado em","Ações"].map(h => (
                <span key={h} style={{fontSize:11,fontWeight:800,color:C.textMid,
                  letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:MONO}}>{h}</span>
              ))}
            </div>

            {usuarios.length === 0 && (
              <div style={{padding:"28px",textAlign:"center",color:C.textDim,fontSize:14,fontFamily:MONO}}>
                Nenhum usuário cadastrado
              </div>
            )}

            {usuarios.map((u, i) => {
              const p = perfilDe(u.level)
              return (
                <div key={u.username} className="gu-row"
                  style={{display:"grid",gridTemplateColumns:"1fr 160px 1fr 110px 80px",
                    padding:"13px 18px",
                    borderBottom: i < usuarios.length-1 ? `1px solid ${C.border}` : "none",
                    alignItems:"center",transition:"background 0.1s",
                    opacity: u.active === false ? 0.45 : 1}}>

                  {/* Usuário */}
                  <div>
                    <div style={{fontSize:14,fontWeight:600,fontFamily:MONO,color:C.text}}>
                      {u.username}
                    </div>
                    {u.active === false && (
                      <span style={{fontSize:10,fontWeight:700,color:"#94A3B8",
                        fontFamily:MONO,letterSpacing:"0.06em"}}>INATIVO</span>
                    )}
                  </div>

                  {/* Perfil */}
                  <span style={{fontSize:11,fontWeight:800,padding:"4px 10px",
                    borderRadius:6,background:p.bg,color:p.color,
                    border:`1px solid ${p.border}`,fontFamily:MONO,
                    letterSpacing:"0.06em",display:"inline-block"}}>
                    {p.label}
                  </span>

                  {/* Módulos */}
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    {u.modules.slice(0,5).map(m => (
                      <span key={m} style={{fontSize:9,fontWeight:700,padding:"2px 7px",
                        borderRadius:4,background:"rgba(255,255,255,0.06)",
                        color:C.textMid,fontFamily:MONO,letterSpacing:"0.04em"}}>
                        {m}
                      </span>
                    ))}
                    {u.modules.length > 5 && (
                      <span style={{fontSize:9,fontWeight:700,padding:"2px 7px",
                        borderRadius:4,background:"rgba(255,255,255,0.04)",
                        color:C.textDim,fontFamily:MONO}}>
                        +{u.modules.length - 5}
                      </span>
                    )}
                  </div>

                  {/* Data */}
                  <span style={{fontSize:12,color:C.textMid,fontFamily:MONO}}>
                    {fmtDate(u.created_at)}
                  </span>

                  {/* Ações */}
                  <div style={{display:"flex",gap:6}}>
                    <button className="gu-btn" title="Editar"
                      onClick={() => setModal({ usuario: u })}
                      style={{width:30,height:30,borderRadius:7,border:`1px solid ${C.border}`,
                        background:"rgba(255,255,255,0.05)",cursor:"pointer",
                        color:C.gold,fontSize:14,display:"flex",alignItems:"center",
                        justifyContent:"center",transition:"all 0.12s"}}>
                      ✏
                    </button>
                    <button className="gu-btn" title={u.active === false ? "Reativar" : "Desativar"}
                      onClick={() => toggleAtivo(u)}
                      style={{width:30,height:30,borderRadius:7,
                        border:`1px solid ${u.active === false ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)"}`,
                        background: u.active === false ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)",
                        cursor:"pointer",
                        color: u.active === false ? C.green : C.gold,
                        fontSize:13,display:"flex",alignItems:"center",
                        justifyContent:"center",transition:"all 0.12s"}}>
                      {u.active === false ? "▶" : "⏸"}
                    </button>
                    <button className="gu-btn" title="Remover"
                      onClick={() => setConfirmar(u.username)}
                      style={{width:30,height:30,borderRadius:7,border:"1px solid rgba(239,68,68,0.25)",
                        background:"rgba(239,68,68,0.06)",cursor:"pointer",
                        color:C.red,fontSize:14,display:"flex",alignItems:"center",
                        justifyContent:"center",transition:"all 0.12s"}}>
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Modais ── */}
      {modal === "criar" && (
        <ModalUsuario onClose={() => setModal(null)} onSave={() => { setModal(null); carregar() }} />
      )}
      {modal?.usuario && (
        <ModalUsuario
          usuario={modal.usuario}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); carregar() }}
        />
      )}
      {confirmar && (
        <ModalConfirmar
          username={confirmar}
          onClose={() => setConfirmar(null)}
          onConfirm={() => deletar(confirmar)}
        />
      )}
    </div>
  )
}
