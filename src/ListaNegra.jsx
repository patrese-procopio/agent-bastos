import { useState, useEffect } from "react"
import api from "./api"
const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const SITUACAO_STYLE = {
  "EXONERADO":  { bg: "#FEF2F2", color: "#991B1B", border: "#FECACA" },
  "EXONERADA":  { bg: "#FEF2F2", color: "#991B1B", border: "#FECACA" },
  "DEMITIDO":   { bg: "#FEF2F2", color: "#FCA5A5", border: "#FCA5A5" },
  "DEMITIDA":   { bg: "#FEF2F2", color: "#FCA5A5", border: "#FCA5A5" },
  "VERIFICAR":  { bg: "#FFFBEB", color: "#E8A020", border: "#FDE68A" },
  "INATIVO":    { bg: "#0B1120", color: "#475569", border: "#CBD5E1" },
}

function getSituacaoStyle(situacao) {
  if (!situacao) return { bg: "#0B1120", color: "#64748B", border: "#E2E8F0" }
  const key = Object.keys(SITUACAO_STYLE).find(k => situacao.toUpperCase().includes(k))
  return key ? SITUACAO_STYLE[key] : { bg: "#0B1120", color: "#64748B", border: "#E2E8F0" }
}

export default function ListaNegra({ onNavigate }) {
  const [registros, setRegistros]   = useState([])
  const [filtrados, setFiltrados]   = useState([])
  const [busca, setBusca]           = useState("")
  const [loading, setLoading]       = useState(true)
  const [erro, setErro]             = useState(null)
  const [selecionado, setSelecionado] = useState(null)
  const [letraAtiva, setLetraAtiva] = useState("TODOS")

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
      resultado = resultado.filter(r => r.nome?.startsWith(letraAtiva))
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
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0B1120", fontFamily: SANS }}>

      {/* Header */}
      <header style={{
        height: 44, borderBottom: "1px solid rgba(255,255,255,0.07)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 18px", background: "#111827", flexShrink: 0,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 6, height: 20, background: "#1E293B",
            borderRadius: 3, flexShrink: 0,
          }}/>
          <div>
            <div style={{ fontSize: 16.9, fontWeight: 700, color: "#F1F5F9" }}>Lista Negra</div>
            <div style={{ fontSize: 16.9, color: "#64748B", fontFamily: MONO }}>
              Registros Caveirinha · {registros.length} servidores indexados
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 16.9, fontWeight: 700, padding: "3px 10px",
            borderRadius: 4, background: "rgba(239,68,68,0.10)", color: "#991B1B",
            border: "1px solid rgba(239,68,68,0.3)", fontFamily: MONO,
          }}>
            RESTRITO
          </span>
          <span style={{
            fontSize: 16.9, color: "#64748B", fontFamily: MONO,
          }}>
            {filtrados.length} resultados
          </span>
        </div>
      </header>

      {/* Barra de busca */}
      <div style={{
        padding: "10px 18px", background: "#111827",
        borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0,
        display: "flex", gap: 10, alignItems: "center",
      }}>
        <div style={{ position: "relative", flex: 1 }}>
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
            width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="#94A3B8" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            style={{
              width: "100%", paddingLeft: 32, paddingRight: 12,
              height: 34, borderRadius: 7, border: "1px solid rgba(255,255,255,0.07)",
              background: "#0B1120", fontSize: 15.6, color: "#F1F5F9",
              outline: "none", fontFamily: SANS, boxSizing: "border-box",
            }}
            placeholder="Buscar por nome, unidade ou descrição..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
      </div>

      {/* Filtro A-Z */}
      <div style={{
        padding: "6px 18px", background: "#0B1120",
        borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0,
        display: "flex", gap: 3, flexWrap: "wrap",
      }}>
        {letras.map(l => (
          <button key={l} onClick={() => setLetraAtiva(l)} style={{
            padding: l === "TODOS" ? "3px 10px" : "3px 6px",
            borderRadius: 4, border: "1px solid",
            fontSize: 16.9, fontWeight: 600, cursor: "pointer", fontFamily: MONO,
            borderColor: letraAtiva === l ? "#1E293B" : "#E2E8F0",
            background: letraAtiva === l ? "#1E293B" : "transparent",
            color: letraAtiva === l ? "#111827" : "#64748B",
            transition: "all 0.1s",
          }}>
            {l}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", gap: 0 }}>

        {/* Lista */}
        <div style={{
          flex: selecionado ? "0 0 420px" : 1,
          overflowY: "auto", padding: "12px 18px",
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          {loading && (
            <div style={{ textAlign: "center", padding: 40, color: "#94A3B8", fontSize: 15.6, fontFamily: MONO }}>
              Carregando registros...
            </div>
          )}
          {erro && (
            <div style={{ textAlign: "center", padding: 40, color: "#F87171", fontSize: 12 }}>
              {erro}
            </div>
          )}
          {!loading && !erro && filtrados.length === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: "#94A3B8", fontSize: 15.6, fontFamily: MONO }}>
              Nenhum registro encontrado.
            </div>
          )}
          {!loading && filtrados.map((r, i) => {
            const st = getSituacaoStyle(r.situacao)
            const isSelected = selecionado?.nome === r.nome && selecionado?.ano === r.ano
            return (
              <div key={i} onClick={() => setSelecionado(isSelected ? null : r)} style={{
                background: isSelected ? "#0F172A" : "#111827",
                border: `1px solid ${isSelected ? "#0F172A" : "#E2E8F0"}`,
                borderRadius: 8, padding: "10px 14px",
                cursor: "pointer", transition: "all 0.15s",
                display: "flex", alignItems: "center", gap: 12,
                boxShadow: isSelected ? "0 4px 12px rgba(15,23,42,0.15)" : "0 1px 3px rgba(0,0,0,0.04)",
              }}>
                {/* Inicial */}
                <div style={{
                  width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                  background: isSelected ? "#1E293B" : "#1A2236",
                  border: `1px solid ${isSelected ? "#334155" : "#E2E8F0"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16.9, fontWeight: 700,
                  color: isSelected ? "#94A3B8" : "#475569",
                  fontFamily: MONO,
                }}>
                  {r.nome?.[0] || "?"}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 15.6, fontWeight: 600,
                    color: isSelected ? "#111827" : "#0F172A",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {r.nome}
                  </div>
                  <div style={{
                    fontSize: 16.9, color: isSelected ? "#94A3B8" : "#64748B",
                    fontFamily: MONO, marginTop: 2,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {r.unidade || r.empresa || "—"} · {r.ano}
                  </div>
                </div>

                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 8px",
                  borderRadius: 4, flexShrink: 0, fontFamily: MONO,
                  background: isSelected ? "rgba(255,255,255,0.1)" : st.bg,
                  color: isSelected ? "#94A3B8" : st.color,
                  border: `1px solid ${isSelected ? "transparent" : st.border}`,
                }}>
                  {r.situacao?.split(" ")[0] || "—"}
                </span>
              </div>
            )
          })}
        </div>

        {/* Detalhe */}
        {selecionado && (
          <div style={{
            flex: 1, borderLeft: "1px solid rgba(255,255,255,0.07)",
            background: "#111827", overflowY: "auto",
            padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16,
          }}>
            {/* Cabeçalho do detalhe */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9", lineHeight: 1.3 }}>
                  {selecionado.nome}
                </div>
                <div style={{ fontSize: 16.9, color: "#94A3B8", fontFamily: MONO, marginTop: 4 }}>
                  Nº {selecionado.numero || "—"} · Ref: {selecionado.referencia || "—"}
                </div>
              </div>
              <button onClick={() => setSelecionado(null)} style={{
                width: 28, height: 28, borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.07)", background: "#0B1120",
                cursor: "pointer", fontSize: 14, color: "#64748B",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>×</button>
            </div>

            {/* Campos */}
            {[
              ["Situação",  selecionado.situacao],
              ["Unidade",   selecionado.unidade  || "—"],
              ["Empresa",   selecionado.empresa  || "—"],
              ["Data",      selecionado.data     || "—"],
              ["CPF",       selecionado.cpf      || "—"],
              ["Ano/Aba",   selecionado.ano],
            ].map(([k, v]) => (
              <div key={k} style={{
                display: "flex", flexDirection: "column", gap: 2,
                padding: "10px 12px", borderRadius: 7,
                background: "#0B1120", border: "1px solid #1A2236",
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: MONO }}>
                  {k}
                </span>
                <span style={{ fontSize: 15.6, color: "#F1F5F9", fontWeight: k === "Situação" ? 600 : 400 }}>
                  {v}
                </span>
              </div>
            ))}

            {/* Descrição */}
            {selecionado.descricao && (
              <div style={{
                padding: "12px 14px", borderRadius: 7,
                background: "rgba(232,160,32,0.10)", border: "1px solid #FDE68A",
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#E8A020", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: MONO, marginBottom: 6 }}>
                  Descrição / Motivo
                </div>
                <div style={{ fontSize: 15.6, color: "#F1F5F9", lineHeight: 1.6 }}>
                  {selecionado.descricao}
                </div>
              </div>
            )}

            {/* Aviso LGPD */}
            <div style={{
              padding: "8px 12px", borderRadius: 6,
              background: "#1A2236", border: "1px solid rgba(255,255,255,0.07)",
              fontSize: 16.9, color: "#64748B", lineHeight: 1.5,
            }}>
              ⚠ Dados protegidos pela LGPD. CPF parcialmente ocultado. Acesso restrito a agentes autorizados.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
