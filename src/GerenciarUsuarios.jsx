import { useState, useEffect, useCallback } from "react"
import api from "./api"
import { toast } from "./Toast"

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
    descricao:"Acesso operacional de campo: RAG, Transcrição, OSINT, Grupos, Vínculos, Grafoscopia, Dashboard e mais.",
    level:    "operador_campo",
    modules:  [
      "chat_rag", "transcricao", "referencias", "sinais_fracos", "agenda",
      "osint", "grupos", "inteligencia_grupos", "lista_negra",
      "vinculo", "extrato", "grafoscopia", "matrix_nucadis", "liderancas", "dashboard",
      "drone",
    ],
  },
  analista: {
    label:    "Analista",
    color:    "#60A5FA",
    bg:       "rgba(96,165,250,0.1)",
    border:   "rgba(96,165,250,0.3)",
    descricao:"Acesso analítico completo: inclui Notícias, Alertas e HITL além de todos os módulos do Operador.",
    level:    "analista",
    modules:  [
      "chat_rag", "transcricao", "noticias", "referencias", "sinais_fracos", "agenda",
      "alertas", "osint", "grupos", "inteligencia_grupos", "lista_negra",
      "vinculo", "extrato", "grafoscopia", "hitl", "matrix_nucadis", "liderancas", "dashboard",
      "drone",
    ],
  },
  agente: {
    label:    "Agente",
    color:    "#F59E0B",
    bg:       "rgba(245,158,11,0.1)",
    border:   "rgba(245,158,11,0.3)",
    descricao:"Acesso de agente de inteligência: HITL e Notícias incluídos, sem acesso a Alertas.",
    level:    "agente",
    modules:  [
      "chat_rag", "transcricao", "noticias", "referencias", "sinais_fracos", "agenda",
      "osint", "grupos", "inteligencia_grupos", "lista_negra",
      "vinculo", "extrato", "grafoscopia", "hitl", "matrix_nucadis", "liderancas", "dashboard",
      "drone",
    ],
  },
  admin: {
    label:    "Admin",
    color:    "#F87171",
    bg:       "rgba(248,113,113,0.1)",
    border:   "rgba(248,113,113,0.3)",
    descricao:"Acesso total: todos os módulos + Alertas, Dashboard, Configurações e Gerenciamento de Usuários.",
    level:    "admin",
    modules:  [
      "admin", "chat_rag", "transcricao", "noticias", "referencias", "sinais_fracos", "agenda",
      "alertas", "osint", "grupos", "inteligencia_grupos", "lista_negra",
      "vinculo", "extrato", "grafoscopia", "hitl", "matrix_nucadis", "liderancas",
      "dashboard", "configuracoes", "usuarios", "drone",
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

// ── Funções de formatação ──────────────────────────────────────────────────────
function maskCpfInput(v) {
  // Mascara progressiva enquanto o usuário digita: 000.000.000-00
  const d = v.replace(/\D/g, "").slice(0, 11)
  if (d.length <= 3)  return d
  if (d.length <= 6)  return `${d.slice(0,3)}.${d.slice(3)}`
  if (d.length <= 9)  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`
}

const FUNCOES = [
  "Agente de Inteligência",
  "Chefe de Inteligência",
  "Analista de Inteligência",
  "Operador de Campo",
  "Técnico de Inteligência",
  "Coordenador de Inteligência",
  "Auxiliar Administrativo",
]

function Campo({ label, children }) {
  return (
    <div style={{marginBottom:14}}>
      <label style={{fontSize:11,fontWeight:700,color:C.textMid,letterSpacing:"0.08em",
        textTransform:"uppercase",display:"block",marginBottom:6}}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle = {
  width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid rgba(255,255,255,0.1)`,
  borderRadius:8,padding:"9px 13px",fontSize:13,color:"#F1F5F9",outline:"none",
  fontFamily:MONO,transition:"border-color 0.15s,box-shadow 0.15s",boxSizing:"border-box",
}

// ── Modal criar/editar usuário ─────────────────────────────────────────────────
function ModalUsuario({ usuario, onClose, onSave }) {
  const editando = !!usuario
  const [form, setForm] = useState({
    username:      usuario?.username      || "",
    password:      "",
    nivel:         usuario?.level         || "analista",
    nome_completo: usuario?.nome_completo || "",
    cpf:           "",  // nunca pré-preenchido — dado sensível
    email:         usuario?.email         || "",
    funcao:        usuario?.funcao        || "",
    matricula:     usuario?.matricula     || "",
  })
  const [erro, setErro]         = useState("")
  const [salvando, setSalvando] = useState(false)

  const perfil = perfilDe(form.nivel)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function salvar() {
    if (!editando && !form.username.trim()) return setErro("Username obrigatório.")
    if (!editando && !form.password.trim()) return setErro("Senha obrigatória.")
    if (!editando && !form.nome_completo.trim()) return setErro("Nome completo obrigatório.")
    if (!editando && !form.funcao)         return setErro("Selecione a função.")
    setSalvando(true); setErro("")
    try {
      const base = {
        level:         form.nivel,
        modules:       PERFIS[form.nivel]?.modules || [],
        nome_completo: form.nome_completo.trim(),
        email:         form.email.trim(),
        funcao:        form.funcao,
        matricula:     form.matricula.trim(),
      }
      if (form.password.trim()) base.password = form.password.trim()
      if (form.cpf.trim())      base.cpf      = form.cpf.replace(/\D/g,"") // dígitos puros

      if (editando) {
        await api.put(`/auth/usuarios/${usuario.username}`, base)
      } else {
        await api.post("/auth/usuarios", { username: form.username.trim(), ...base })
      }
      onSave()
    } catch (e) {
      const msg = await e.response?.json?.().catch(() => null)
      setErro(msg?.detail || "Erro ao salvar usuário.")
    } finally { setSalvando(false) }
  }

  return (
    <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(7,10,20,0.88)",
      display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)",
      overflowY:"auto",padding:"20px 0"}}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="gu-card" style={{background:"#111827",borderRadius:14,
        width:"min(580px,94vw)", padding:"26px 28px",
        border:"1px solid rgba(255,255,255,0.09)",
        boxShadow:"0 32px 80px rgba(0,0,0,0.6)"}}>

        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
          <div style={{width:3,height:20,background:C.gold,borderRadius:2}}/>
          <span style={{fontSize:17,fontWeight:800}}>
            {editando ? `Editar — ${usuario.username}` : "Novo Usuário"}
          </span>
        </div>

        {/* ── Seção 1: Credenciais de acesso ── */}
        <div style={{fontSize:11,fontWeight:800,color:C.textDim,letterSpacing:"0.12em",
          textTransform:"uppercase",marginBottom:12,fontFamily:MONO}}>
          Credenciais de Acesso
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:4}}>
          {!editando && (
            <Campo label="Username *">
              <input className="gu-input"
                value={form.username}
                onChange={e => setForm(f => ({...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9._]/g,"")}))}
                placeholder="ex: joao.silva"
                style={inputStyle}/>
            </Campo>
          )}
          <Campo label={editando ? "Nova Senha (vazio = não alterar)" : "Senha *"}>
            <input className="gu-input" type="password"
              value={form.password}
              onChange={set("password")}
              placeholder={editando ? "••••••••" : "Mín. 8 caracteres"}
              style={inputStyle}/>
          </Campo>
        </div>

        {/* ── Seção 2: Dados pessoais (LGPD) ── */}
        <div style={{fontSize:11,fontWeight:800,color:C.textDim,letterSpacing:"0.12em",
          textTransform:"uppercase",margin:"16px 0 12px",fontFamily:MONO}}>
          Dados Pessoais <span style={{color:"rgba(167,139,250,0.6)",marginLeft:6}}>LGPD art. 7</span>
        </div>

        <Campo label="Nome Completo *">
          <input className="gu-input"
            value={form.nome_completo}
            onChange={set("nome_completo")}
            placeholder="Nome completo do agente"
            style={inputStyle}/>
        </Campo>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Campo label="CPF">
            <input className="gu-input"
              value={form.cpf}
              onChange={e => setForm(f => ({...f, cpf: maskCpfInput(e.target.value)}))}
              placeholder="000.000.000-00"
              style={inputStyle}/>
            {editando && usuario?.cpf_masked && (
              <div style={{fontSize:11,color:C.textDim,marginTop:4,fontFamily:MONO}}>
                Atual: {usuario.cpf_masked} · deixe vazio para não alterar
              </div>
            )}
          </Campo>
          <Campo label="Matrícula / RE">
            <input className="gu-input"
              value={form.matricula}
              onChange={set("matricula")}
              placeholder="ex: 123456"
              style={inputStyle}/>
          </Campo>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Campo label="E-mail Institucional">
            <input className="gu-input" type="email"
              value={form.email}
              onChange={set("email")}
              placeholder="nome@instituicao.gov.br"
              style={inputStyle}/>
          </Campo>
          <Campo label="Função *">
            <select className="gu-input"
              value={form.funcao}
              onChange={set("funcao")}
              style={{...inputStyle, cursor:"pointer"}}>
              <option value="">Selecione…</option>
              {FUNCOES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Campo>
        </div>

        {/* ── Seção 3: Perfil de acesso ── */}
        <div style={{fontSize:11,fontWeight:800,color:C.textDim,letterSpacing:"0.12em",
          textTransform:"uppercase",margin:"16px 0 12px",fontFamily:MONO}}>
          Perfil de Acesso
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7,marginBottom:10}}>
          {NIVEL_ORDER.map(key => {
            const p = PERFIS[key]
            const sel = form.nivel === key
            return (
              <button key={key} className="gu-perfil"
                onClick={() => setForm(f => ({...f, nivel: key}))}
                style={{padding:"10px 12px",borderRadius:10,cursor:"pointer",textAlign:"left",
                  border:`1px solid ${sel ? p.color : "rgba(255,255,255,0.1)"}`,
                  background: sel ? p.bg : "rgba(255,255,255,0.03)",
                  transition:"all 0.15s", color: p.color,
                  outline:"none", boxShadow: sel ? `0 0 0 2px ${p.color}44` : "none"}}>
                <div style={{fontSize:12,fontWeight:800,marginBottom:2}}>{p.label}</div>
                <div style={{fontSize:10,color:C.textMid,fontFamily:MONO}}>
                  {p.modules.length} módulos
                </div>
              </button>
            )
          })}
        </div>
        {perfil && (
          <p style={{fontSize:12,color:C.textMid,lineHeight:1.5,marginBottom:16,
            padding:"8px 12px",borderRadius:8,background:"rgba(255,255,255,0.03)",
            border:`1px solid ${C.border}`}}>
            {perfil.descricao}
          </p>
        )}

        {/* Nota LGPD */}
        <div style={{fontSize:11,color:"rgba(167,139,250,0.55)",marginBottom:14,
          fontFamily:MONO,lineHeight:1.5,padding:"8px 12px",borderRadius:8,
          background:"rgba(167,139,250,0.05)",border:"1px solid rgba(167,139,250,0.1)"}}>
          🔒 Dados pessoais coletados com base no art. 7, III LGPD (execução de contrato).
          CPF armazenado server-side e nunca exposto em texto plano via API.
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
            style={{flex:2,padding:"11px 0",borderRadius:9,cursor:"pointer",border:"none",
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
    } catch { toast.error("Falha ao alterar status do usuário.") }
  }

  async function deletar(username) {
    try {
      await api.delete(`/auth/usuarios/${username}`)
      setConfirmar(null)
      await carregar()
    } catch { toast.error("Falha ao remover usuário. Tente novamente.") }
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
            <div style={{display:"grid",gridTemplateColumns:"1.4fr 1.2fr 130px 130px 100px 90px",
              padding:"10px 18px",borderBottom:`1px solid ${C.border}`,
              background:"rgba(255,255,255,0.025)"}}>
              {["Usuário / Nome","Função","Perfil","CPF","Criado em","Ações"].map(h => (
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
                  style={{display:"grid",gridTemplateColumns:"1.4fr 1.2fr 130px 130px 100px 90px",
                    padding:"13px 18px",
                    borderBottom: i < usuarios.length-1 ? `1px solid ${C.border}` : "none",
                    alignItems:"center",transition:"background 0.1s",
                    opacity: u.active === false ? 0.45 : 1}}>

                  {/* Usuário + Nome */}
                  <div>
                    <div style={{fontSize:13,fontWeight:700,fontFamily:MONO,color:C.text}}>
                      {u.username}
                    </div>
                    {u.nome_completo ? (
                      <div style={{fontSize:12,color:C.textMid,marginTop:2}}>{u.nome_completo}</div>
                    ) : null}
                    {u.active === false && (
                      <span style={{fontSize:11,fontWeight:700,color:"#94A3B8",
                        fontFamily:MONO,letterSpacing:"0.06em"}}>INATIVO</span>
                    )}
                  </div>

                  {/* Função */}
                  <div style={{fontSize:12,color:C.textMid,lineHeight:1.4}}>
                    {u.funcao || <span style={{color:C.textDim,fontFamily:MONO}}>—</span>}
                    {u.matricula ? (
                      <div style={{fontSize:11,fontFamily:MONO,color:C.textDim,marginTop:2}}>
                        RE {u.matricula}
                      </div>
                    ) : null}
                  </div>

                  {/* Perfil */}
                  <span style={{fontSize:11,fontWeight:800,padding:"4px 10px",
                    borderRadius:6,background:p.bg,color:p.color,
                    border:`1px solid ${p.border}`,fontFamily:MONO,
                    letterSpacing:"0.06em",display:"inline-block"}}>
                    {p.label}
                  </span>

                  {/* CPF mascarado — LGPD */}
                  <span style={{fontSize:12,color:C.textDim,fontFamily:MONO}}>
                    {u.cpf_masked || "—"}
                  </span>

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
