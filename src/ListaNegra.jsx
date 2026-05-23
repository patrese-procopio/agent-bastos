import { useState, useEffect } from "react"
import api from "./api"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const GLOBAL_CSS = `
  @keyframes ln-fade { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:translateY(0)} }
  .ln-card { animation: ln-fade 0.18s ease forwards; }
  .ln-card:hover { background:#16203a !important; border-color:rgba(232,160,32,0.30) !important; }
  .ln-letter:hover { color:#E8A020 !important; border-color:rgba(232,160,32,0.4) !important; }
  .ln-scroll::-webkit-scrollbar{width:8px} .ln-scroll::-webkit-scrollbar-track{background:transparent}
  .ln-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.14);border-radius:6px}
  .ln-scroll::-webkit-scrollbar-thumb:hover{background:rgba(232,160,32,0.4)}
`

// Estilos de situação — badges translúcidos elegantes sobre fundo escuro
const SITUACAO_STYLE = {
  EXONERADO: { color: "#F87171", bg: "rgba(239,68,68,0.14)",  border: "rgba(239,68,68,0.35)",  dot: "#EF4444" },
  EXONERADA: { color: "#F87171", bg: "rgba(239,68,68,0.14)",  border: "rgba(239,68,68,0.35)",  dot: "#EF4444" },
  DEMITIDO:  { color: "#FB923C", bg: "rgba(249,115,22,0.14)", border: "rgba(249,115,22,0.35)", dot: "#F97316" },
  DEMITIDA:  { color: "#FB923C", bg: "rgba(249,115,22,0.14)", border: "rgba(249,115,22,0.35)", dot: "#F97316" },
  VERIFICAR: { color: "#FBBF24", bg: "rgba(251,191,36,0.14)", border: "rgba(251,191,36,0.35)", dot: "#F59E0B" },
  INATIVO:   { color: "#94A3B8", bg: "rgba(148,163,184,0.14)", border: "rgba(148,163,184,0.30)", dot: "#64748B" },
}
const SIT_DEFAULT = { color: "#CBD5E1", bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.28)", dot: "#94A3B8" }

function getSituacaoStyle(situacao) {
  if (!situacao) return SIT_DEFAULT
  const key = Object.keys(SITUACAO_STYLE).find(k => situacao.toUpperCase().includes(k))
  return key ? SITUACAO_STYLE[key] : SIT_DEFAULT
}

export default function ListaNegra({ onNavigate }) {
  const [registros, setRegistros]     = useState([])
  const [filtrados, setFiltrados]     = useState([])
  const [busca, setBusca]             = useState("")
  const [loading, setLoading]         = useState(true)
  const [erro, setErro]               = useState(null)
  const [selecionado, setSelecionado] = useState(null)
  const [letraAtiva, setLetraAtiva]   = useState("TODOS")

  useEffect(() => {
    const style = document.createElement("style")
    style.textContent = GLOBAL_CSS
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  useEffect(() => {
    api.get("/lista-negra")
      .then(r => r?.json())
      .then(d => {
        setRegistros(d.registros || [])
        setFiltrados(d.registros || [])
        setLoading(false)
      })
      .catch(() => {
        setErro("Falha ao conectar com o backend.")
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    let resultado = registros
    if (letraAtiva !== "TODOS") {
      resultado = resultado.filter(r => r.nome?.toUpperCase().startsWith(letraAtiva))
    }
    if (busca.trim()) {
      const termo = busca.trim().toUpperCase()
      resultado = resultado.filter(r =>
        r.nome?.toUpperCase().includes(termo) ||
        r.unidade?.toUpperCase().includes(termo) ||
        r.descricao?.toUpperCase().includes(termo)
      )
    }
    setFiltrados(resultado)
  }, [busca, letraAtiva, registros])

  const letras = ["TODOS", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")]

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0B1120", fontFamily: SANS }}>

      {/* ── HEADER ── */}
      <header style={{
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 22px", background: "#111827", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 4, height: 30, background: "#E8A020", borderRadius: 3, flexShrink: 0 }}/>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#F1F5F9", letterSpacing: "0.01em" }}>Lista Negra</div>
            <div style={{ fontSize: 13, color: "#94A3B8", fontFamily: MONO, marginTop: 2 }}>
              Registros Caveirinha · {registros.length} servidores indexados
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            fontSize: 11.5, fontWeight: 800, padding: "4px 11px", borderRadius: 6, letterSpacing: "0.08em",
            background: "rgba(239,68,68,0.14)", color: "#F87171",
            border: "1px solid rgba(239,68,68,0.35)", fontFamily: MONO,
          }}>● RESTRITO</span>
          <span style={{
            fontSize: 13, fontWeight: 700, color: "#E8A020", fontFamily: MONO,
            background: "rgba(232,160,32,0.12)", border: "1px solid rgba(232,160,32,0.3)",
            padding: "4px 11px", borderRadius: 6,
          }}>{filtrados.length} resultados</span>
        </div>
      </header>

      {/* ── BUSCA ── */}
      <div style={{
        padding: "12px 22px", background: "#111827",
        borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0,
      }}>
        <div style={{ position: "relative" }}>
          <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
            width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#E8A020" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            style={{
              width: "100%", paddingLeft: 38, paddingRight: 14, height: 40,
              borderRadius: 9, border: "1px solid rgba(255,255,255,0.12)",
              background: "#0B1120", fontSize: 15, color: "#F1F5F9",
              outline: "none", fontFamily: SANS, boxSizing: "border-box", caretColor: "#E8A020",
            }}
            placeholder="Buscar por nome, unidade ou descrição..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
      </div>

      {/* ── FILTRO A-Z ── */}
      <div style={{
        padding: "10px 22px", background: "#0B1120",
        borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0,
        display: "flex", gap: 5, flexWrap: "wrap",
      }}>
        {letras.map(l => {
          const ativo = letraAtiva === l
          return (
            <button key={l} onClick={() => setLetraAtiva(l)} className="ln-letter" style={{
              padding: l === "TODOS" ? "5px 12px" : "5px 9px",
              borderRadius: 6, border: "1px solid",
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: MONO,
              minWidth: l === "TODOS" ? "auto" : 28, textAlign: "center",
              borderColor: ativo ? "#E8A020" : "rgba(255,255,255,0.10)",
              background: ativo ? "#E8A020" : "transparent",
              color: ativo ? "#0B1120" : "#94A3B8",
              transition: "all 0.12s",
            }}>{l}</button>
          )
        })}
      </div>

      {/* ── CONTEÚDO ── */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>

        {/* LISTA */}
        <div className="ln-scroll" style={{
          flex: selecionado ? "0 0 440px" : 1,
          overflowY: "auto", padding: "14px 22px",
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          {loading && (
            <div style={{ textAlign: "center", padding: 50, color: "#94A3B8", fontSize: 15, fontFamily: MONO }}>
              Carregando registros...
            </div>
          )}
          {erro && (
            <div style={{ textAlign: "center", padding: 50, color: "#F87171", fontSize: 14, fontFamily: MONO }}>
              {erro}
            </div>
          )}
          {!loading && !erro && filtrados.length === 0 && (
            <div style={{ textAlign: "center", padding: 50, color: "#64748B", fontSize: 15, fontFamily: MONO }}>
              Nenhum registro encontrado.
            </div>
          )}
          {!loading && filtrados.map((r, i) => {
            const st = getSituacaoStyle(r.situacao)
            const isSelected = selecionado?.nome === r.nome && selecionado?.ano === r.ano
            return (
              <div key={i} onClick={() => setSelecionado(isSelected ? null : r)} className="ln-card" style={{
                background: isSelected ? "rgba(232,160,32,0.10)" : "#111827",
                borderTop: `1px solid ${isSelected ? "rgba(232,160,32,0.45)" : "rgba(255,255,255,0.07)"}`,
                borderRight: `1px solid ${isSelected ? "rgba(232,160,32,0.45)" : "rgba(255,255,255,0.07)"}`,
                borderBottom: `1px solid ${isSelected ? "rgba(232,160,32,0.45)" : "rgba(255,255,255,0.07)"}`,
                borderLeft: `3px solid ${st.dot}`,
                borderRadius: 10, padding: "12px 16px",
                cursor: "pointer", transition: "all 0.15s",
                display: "flex", alignItems: "center", gap: 14,
              }}>
                {/* Inicial */}
                <div style={{
                  width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
                  background: "rgba(232,160,32,0.12)",
                  border: "1px solid rgba(232,160,32,0.35)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, fontWeight: 800, color: "#E8A020", fontFamily: MONO,
                }}>
                  {r.nome?.[0]?.toUpperCase() || "?"}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 15.5, fontWeight: 600, color: "#F1F5F9",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {r.nome}
                  </div>
                  <div style={{
                    fontSize: 13, color: "#94A3B8", fontFamily: MONO, marginTop: 3,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {r.unidade || r.empresa || "—"} · {r.ano}
                  </div>
                </div>

                <span style={{
                  fontSize: 11, fontWeight: 800, padding: "4px 10px",
                  borderRadius: 6, flexShrink: 0, fontFamily: MONO, letterSpacing: "0.04em",
                  background: st.bg, color: st.color, border: `1px solid ${st.border}`,
                }}>
                  {r.situacao?.split(" ")[0] || "—"}
                </span>
              </div>
            )
          })}
        </div>

        {/* DETALHE */}
        {selecionado && (() => {
          const st = getSituacaoStyle(selecionado.situacao)
          return (
            <div className="ln-scroll" style={{
              flex: 1, borderLeft: "1px solid rgba(255,255,255,0.07)",
              background: "#111827", overflowY: "auto",
              padding: "22px 26px", display: "flex", flexDirection: "column", gap: 16,
            }}>
              {/* Cabeçalho do detalhe */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
                    background: "rgba(232,160,32,0.12)", border: "1px solid rgba(232,160,32,0.4)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 24, fontWeight: 800, color: "#E8A020", fontFamily: MONO,
                  }}>{selecionado.nome?.[0]?.toUpperCase() || "?"}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 19, fontWeight: 800, color: "#F1F5F9", lineHeight: 1.25 }}>
                      {selecionado.nome}
                    </div>
                    <div style={{ fontSize: 13, color: "#94A3B8", fontFamily: MONO, marginTop: 4 }}>
                      Nº {selecionado.numero || "—"} · Ref: {selecionado.referencia || "—"}
                    </div>
                  </div>
                </div>
                <button onClick={() => setSelecionado(null)} style={{
                  width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                  border: "1px solid rgba(255,255,255,0.12)", background: "#0B1120",
                  cursor: "pointer", fontSize: 18, color: "#94A3B8",
                  display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
                }}>×</button>
              </div>

              {/* Badge de situação em destaque */}
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start",
                padding: "7px 14px", borderRadius: 8,
                background: st.bg, border: `1px solid ${st.border}`,
              }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: st.dot }}/>
                <span style={{ fontSize: 14, fontWeight: 800, color: st.color, fontFamily: MONO, letterSpacing: "0.04em" }}>
                  {selecionado.situacao || "—"}
                </span>
              </div>

              {/* Campos (grid) */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  ["Unidade", selecionado.unidade || "—"],
                  ["Empresa", selecionado.empresa || "—"],
                  ["Data",    selecionado.data    || "—"],
                  ["CPF",     selecionado.cpf     || "—"],
                  ["Ano / Aba", selecionado.ano   || "—"],
                  ["Referência", selecionado.referencia || "—"],
                ].map(([k, v]) => (
                  <div key={k} style={{
                    display: "flex", flexDirection: "column", gap: 4,
                    padding: "11px 14px", borderRadius: 9,
                    background: "#0B1120", border: "1px solid rgba(255,255,255,0.06)",
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#E8A020", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: MONO }}>
                      {k}
                    </span>
                    <span style={{ fontSize: 15, color: "#F1F5F9", fontWeight: 500, wordBreak: "break-word" }}>
                      {v}
                    </span>
                  </div>
                ))}
              </div>

              {/* Descrição / Motivo */}
              {selecionado.descricao && (
                <div style={{
                  padding: "14px 16px", borderRadius: 9,
                  background: "rgba(232,160,32,0.08)",
                  borderTop: "1px solid rgba(232,160,32,0.25)",
                  borderRight: "1px solid rgba(232,160,32,0.25)",
                  borderBottom: "1px solid rgba(232,160,32,0.25)",
                  borderLeft: "3px solid #E8A020",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#E8A020", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: MONO, marginBottom: 8 }}>
                    ◈ Descrição / Motivo
                  </div>
                  <div style={{ fontSize: 14.5, color: "#F1F5F9", lineHeight: 1.65 }}>
                    {selecionado.descricao}
                  </div>
                </div>
              )}

              {/* Aviso LGPD */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 14px", borderRadius: 8, marginTop: "auto",
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                fontSize: 12.5, color: "#94A3B8", lineHeight: 1.5,
              }}>
                <span style={{ color: "#E8A020", fontSize: 14 }}>⚠</span>
                Dados protegidos pela LGPD. CPF parcialmente ocultado. Acesso restrito a agentes autorizados.
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
