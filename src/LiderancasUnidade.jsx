import { useState, useEffect } from "react"
import { jsPDF } from "jspdf"

const API = "http://127.0.0.1:8000"
const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const UNIDADES = {
  CDPM1:  "CDPM I",
  CDPM2:  "CDPM II",
  IPAT:   "IPAT",
  UPP:    "UPP",
  COMPAJ: "COMPAJ",
  CDF:    "CDF",
}

const FACCAO_COR = {
  "PCC":            { bg: "#EFF6FF", border: "#BFDBFE", dot: "#3B82F6", text: "#1E40AF" },
  "CV/AM":          { bg: "#FEF2F2", border: "#FECACA", dot: "#DC2626", text: "#991B1B" },
  "LIDERANÇAS CV":  { bg: "#FEF2F2", border: "#FECACA", dot: "#DC2626", text: "#991B1B" },
  "RDA":            { bg: "#F0FDF4", border: "#BBF7D0", dot: "#22C55E", text: "#166534" },
  "JACK/TDA":       { bg: "#F5F3FF", border: "#DDD6FE", dot: "#8B5CF6", text: "#5B21B6" },
  "AMARELINHOS":    { bg: "#FFFBEB", border: "#FDE68A", dot: "#F59E0B", text: "#92400E" },
  "NEUTROS":        { bg: "#F8FAFC", border: "#CBD5E1", dot: "#94A3B8", text: "#475569" },
  "ISOLAMENTO":     { bg: "#F8FAFC", border: "#D1D5DB", dot: "#6B7280", text: "#374151" },
  "MED. SEGURANÇA": { bg: "#F8FAFC", border: "#CBD5E1", dot: "#94A3B8", text: "#475569" },
}

function corFaccao(faccao) {
  return FACCAO_COR[faccao] || { bg: "#F8FAFC", border: "#E2E8F0", dot: "#94A3B8", text: "#475569" }
}

function formatarMes(competencia) {
  if (!competencia) return ""
  const [ano, m] = competencia.split("-")
  const nomes = ["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
  return `${nomes[parseInt(m)]} ${ano}`
}

// ── Card de líder ──────────────────────────────────────────────────────────────
function CardLider({ lider, faccaoCor, expandido, onClick }) {
  const temFoto = !!lider.foto_id
  const fotoUrl = temFoto ? `${API}/liderancas/foto/${lider.foto_id}` : null

  return (
    <div
      onClick={onClick}
      style={{
        background: "#FFFFFF",
        border: `1px solid ${expandido ? faccaoCor.dot : "#E2E8F0"}`,
        borderTop: `3px solid ${faccaoCor.dot}`,
        borderRadius: 10,
        overflow: "hidden",
        cursor: "pointer",
        transition: "all 0.2s",
        boxShadow: expandido
          ? `0 4px 20px ${faccaoCor.dot}33`
          : "0 2px 6px rgba(0,0,0,0.06)",
      }}
    >
      {/* Foto */}
      <div style={{
        height: 160,
        background: temFoto ? "#0F172A" : "#1E293B",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        {temFoto ? (
          <img
            src={fotoUrl}
            alt={lider.vulgo}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "top",
              filter: "grayscale(15%)",
            }}
            onError={e => { e.target.style.display = "none" }}
          />
        ) : (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        )}
        {/* Badge do cargo */}
        <div style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 70%, transparent 100%)",
          padding: "20px 10px 8px",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 900, color: "#FFFFFF",
            fontFamily: MONO, letterSpacing: "0.06em", textTransform: "uppercase",
            textShadow: "0 1px 4px rgba(0,0,0,0.8)",
            lineHeight: 1.3,
          }}>
            {lider.cargo}
          </div>
        </div>
      </div>

      {/* Dados */}
      <div style={{ padding: "10px 12px 12px" }}>
        <div style={{
          fontSize: 8, fontWeight: 800, color: "#94A3B8",
          fontFamily: MONO, letterSpacing: "0.1em", marginBottom: 2,
        }}>
          VULGO
        </div>
        <div style={{
          fontSize: 18, fontWeight: 900, color: faccaoCor.dot,
          fontFamily: MONO, letterSpacing: "0.03em", marginBottom: 6,
          lineHeight: 1.1,
        }}>
          {lider.vulgo || "—"}
        </div>

        {expandido && (
          <div style={{
            borderTop: "1px solid #F1F5F9",
            paddingTop: 8,
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}>
            <div>
              <div style={{ fontSize: 8, color: "#94A3B8", fontFamily: MONO, fontWeight: 700, marginBottom: 1 }}>
                NOME COMPLETO
              </div>
              <div style={{ fontSize: 11, color: "#0F172A", fontWeight: 600 }}>
                {lider.nome || "—"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 8, color: "#94A3B8", fontFamily: MONO, fontWeight: 700, marginBottom: 1 }}>
                LOCALIZAÇÃO
              </div>
              <div style={{ fontSize: 10, color: "#475569", fontFamily: MONO }}>
                {lider.localizacao || "—"}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Seção de pavilhão ──────────────────────────────────────────────────────────
function SecaoPavilhao({ nomePav, dados }) {
  const [expandidoId, setExpandidoId] = useState(null)
  const cor = corFaccao(dados.faccao)

  return (
    <div style={{
      background: "#FFFFFF",
      border: "1px solid #E2E8F0",
      borderRadius: 10,
      overflow: "hidden",
      boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
    }}>
      {/* Header do pavilhão */}
      <div style={{
        padding: "12px 16px",
        background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: `3px solid ${cor.dot}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 12, height: 12, borderRadius: "50%",
            background: cor.dot, flexShrink: 0,
            boxShadow: `0 0 8px ${cor.dot}`,
          }}/>
          <span style={{
            fontSize: 14, fontWeight: 800, color: "#FFFFFF",
            letterSpacing: "0.08em", fontFamily: MONO,
            textShadow: "0 1px 3px rgba(0,0,0,0.5)",
          }}>
            {nomePav.replace(/_/g, " ")}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 900,
            padding: "4px 12px", borderRadius: 5,
            background: cor.dot, color: "#FFFFFF",
            fontFamily: MONO, letterSpacing: "0.08em",
            boxShadow: `0 2px 8px ${cor.dot}66`,
          }}>
            {dados.faccao}
          </span>
          <span style={{
            fontSize: 10, color: "#94A3B8", fontFamily: MONO,
            background: "rgba(255,255,255,0.08)",
            padding: "3px 8px", borderRadius: 4,
          }}>
            {(dados.liderancas || []).length} líderes
          </span>
        </div>
      </div>

      {/* Grid de líderes */}
      <div style={{
        padding: "14px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
        gap: 12,
      }}>
        {(dados.liderancas || []).map(lider => (
          <CardLider
            key={lider.id}
            lider={lider}
            faccaoCor={cor}
            expandido={expandidoId === lider.id}
            onClick={() => setExpandidoId(v => v === lider.id ? null : lider.id)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function LiderancasUnidade({ onNavigate }) {
  const [unidade, setUnidade]           = useState("CDPM2")
  const [competencia, setCompetencia]   = useState(null)
  const [competencias, setCompetencias] = useState([])
  const [dados, setDados]               = useState(null)
  const [loading, setLoading]           = useState(false)
  const [erro, setErro]                 = useState(null)
  const [exportando, setExportando]     = useState(false)

  async function exportarPDF() {
    if (!dados || exportando) return
    setExportando(true)
    try {
      const W = 210, ml = 16, mr = 16, cw = W - ml - mr
      const AZUL   = [15, 23, 42]
      const GOLD   = [180, 83, 9]
      const CINZA  = [100, 116, 139]
      const BORDA  = [226, 232, 240]
      const BRANCO = [255, 255, 255]

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
      let y = 0

      const desenharCabecalho = () => {
        doc.setFillColor(...AZUL)
        doc.rect(0, 0, W, 28, "F")
        doc.setFillColor(...GOLD)
        doc.rect(0, 28, W, 2, "F")
        doc.setTextColor(...BRANCO)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(15)
        doc.text("AGENT BASTOS", ml, 11)
        doc.setFontSize(8)
        doc.setFont("helvetica", "normal")
        doc.text("Sistema de Inteligência e Segurança Corporativa", ml, 17)
        doc.setFontSize(7)
        doc.text(`Relatório gerado em: ${new Date().toLocaleString("pt-BR")}`, ml, 22)
        doc.setFillColor(...GOLD)
        doc.roundedRect(W - mr - 32, 8, 32, 10, 2, 2, "F")
        doc.setTextColor(...BRANCO)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(7)
        doc.text("CONFIDENCIAL", W - mr - 16, 14.5, { align: "center" })
      }

      desenharCabecalho()
      y = 36

      // Título
      doc.setTextColor(...AZUL)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(13)
      doc.text("MAPEAMENTO DE LIDERANÇAS", ml, y + 7)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8)
      doc.setTextColor(...CINZA)
      doc.text(`Unidade: ${UNIDADES[unidade]}  ·  Competência: ${formatarMes(competencia)}  ·  ${totalLideres} líderes mapeados`, ml, y + 13)
      doc.setDrawColor(...BORDA)
      doc.line(ml, y + 16, W - mr, y + 16)
      y += 22

      // Resumo
      doc.setFillColor(248, 250, 252)
      doc.roundedRect(ml, y, cw, 16, 2, 2, "F")
      doc.setDrawColor(...BORDA)
      doc.roundedRect(ml, y, cw, 16, 2, 2, "S")
      const colW = cw / 3
      const resumoItems = [
        { label: "PAVILHÕES",        valor: String(Object.keys(pavilhoes).length) },
        { label: "LÍDERES MAPEADOS", valor: String(totalLideres) },
        { label: "COMPETÊNCIA",      valor: formatarMes(competencia) },
      ]
      resumoItems.forEach(({ label, valor }, i) => {
        const cx = ml + colW * i + colW / 2
        doc.setFont("helvetica", "bold")
        doc.setFontSize(14)
        doc.setTextColor(...AZUL)
        doc.text(valor, cx, y + 8, { align: "center" })
        doc.setFont("helvetica", "normal")
        doc.setFontSize(6)
        doc.setTextColor(...CINZA)
        doc.text(label, cx, y + 13, { align: "center" })
        if (i < 2) {
          doc.setDrawColor(...BORDA)
          doc.line(ml + colW * (i + 1), y + 3, ml + colW * (i + 1), y + 13)
        }
      })
      y += 22

      // Pavilhões e líderes
      for (const [nomePav, dadosPav] of Object.entries(pavilhoes)) {
        if (y > 240) { doc.addPage(); desenharCabecalho(); y = 36 }

        const cor = corFaccao(dadosPav.faccao)
        const hexDot = cor.dot
        const rd = parseInt(hexDot.slice(1,3),16)
        const gd = parseInt(hexDot.slice(3,5),16)
        const bd = parseInt(hexDot.slice(5,7),16)

        // Header pavilhão
        doc.setFillColor(...AZUL)
        doc.roundedRect(ml, y, cw, 9, 1, 1, "F")
        doc.setFillColor(rd, gd, bd)
        doc.rect(ml, y + 9, cw, 1.5, "F")
        doc.setFont("helvetica", "bold")
        doc.setFontSize(9)
        doc.setTextColor(...BRANCO)
        doc.text(nomePav.replace(/_/g, " "), ml + 4, y + 6.2)
        doc.setFillColor(rd, gd, bd)
        doc.roundedRect(W - mr - 30, y + 1.5, 30, 6, 1, 1, "F")
        doc.setFontSize(7)
        doc.text(dadosPav.faccao, W - mr - 15, y + 5.8, { align: "center" })
        y += 14

        // Líderes em grade 3 colunas
        const lids = dadosPav.liderancas || []
        const cardW = (cw - 8) / 3
        const cardH = 28

        lids.forEach((lider, i) => {
          const col = i % 3
          const row = Math.floor(i / 3)
          const cx = ml + col * (cardW + 4)
          const cy = y + row * (cardH + 4)

          if (cy + cardH > 270) return

          // Card fundo
          doc.setFillColor(248, 250, 252)
          doc.roundedRect(cx, cy, cardW, cardH, 2, 2, "F")
          doc.setFillColor(rd, gd, bd)
          doc.rect(cx, cy, 2, cardH, "F")
          doc.setDrawColor(rd, gd, bd)
          doc.setLineWidth(0.3)
          doc.roundedRect(cx, cy, cardW, cardH, 2, 2, "S")
          doc.setLineWidth(0.2)

          // Foto placeholder ou área de foto
          doc.setFillColor(30, 41, 59)
          doc.roundedRect(cx + 3, cy + 3, 14, 18, 1, 1, "F")
          doc.setFont("helvetica", "normal")
          doc.setFontSize(5)
          doc.setTextColor(100, 116, 139)
          doc.text(lider.foto_id ? "FOTO" : "S/FOTO", cx + 10, cy + 13, { align: "center" })

          // Dados
          doc.setFont("helvetica", "bold")
          doc.setFontSize(8)
          doc.setTextColor(rd, gd, bd)
          const vulgoCorto = (lider.vulgo || "—").length > 12
            ? (lider.vulgo || "—").slice(0, 11) + "."
            : (lider.vulgo || "—")
          doc.text(vulgoCorto, cx + 20, cy + 8)

          doc.setFont("helvetica", "normal")
          doc.setFontSize(6)
          doc.setTextColor(15, 23, 42)
          const nomeCorto = (lider.nome || "—").length > 16
            ? (lider.nome || "—").slice(0, 14) + "."
            : (lider.nome || "—")
          doc.text(nomeCorto, cx + 20, cy + 13)

          doc.setFont("helvetica", "bold")
          doc.setFontSize(5.5)
          doc.setTextColor(rd, gd, bd)
          const cargoCorto = (lider.cargo || "—").length > 18
            ? (lider.cargo || "—").slice(0, 16) + "."
            : (lider.cargo || "—")
          doc.text(cargoCorto, cx + 20, cy + 18)

          doc.setFont("helvetica", "normal")
          doc.setFontSize(5)
          doc.setTextColor(100, 116, 139)
          const locCorto = (lider.localizacao || "").length > 20
            ? (lider.localizacao || "").slice(0, 18) + "."
            : (lider.localizacao || "")
          doc.text(locCorto, cx + 3, cy + 25)
        })

        const linhasLid = Math.ceil((lids.length || 1) / 3)
        y += linhasLid * (cardH + 4) + 8
      }

      // Rodapé
      const pageCount = doc.getNumberOfPages()
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p)
        doc.setFillColor(...AZUL)
        doc.rect(0, 287, W, 10, "F")
        doc.setFont("helvetica", "normal")
        doc.setFontSize(6)
        doc.setTextColor(...BRANCO)
        doc.text("Agent Bastos · Sistema de Inteligência Corporativa · USO INTERNO · CONFIDENCIAL", ml, 293)
        doc.text(`Página ${p} de ${pageCount}`, W - mr, 293, { align: "right" })
      }

      const nomeMes = formatarMes(competencia).replace(" ", "-")
      doc.save(`liderancas-${unidade}-${nomeMes}.pdf`)
    } catch (e) {
      console.error("Erro ao exportar PDF:", e)
    } finally {
      setExportando(false)
    }
  }

  // Carrega competências disponíveis ao trocar unidade
  useEffect(() => {
    setDados(null)
    setCompetencia(null)
    setErro(null)
    fetch(`${API}/liderancas/${unidade}/competencias`)
      .then(r => r.json())
      .then(d => {
        setCompetencias(d.competencias || [])
        if (d.competencias?.length > 0) setCompetencia(d.competencias[0])
      })
      .catch(() => setErro("Não foi possível carregar as competências."))
  }, [unidade])

  // Carrega dados ao trocar competência
  useEffect(() => {
    if (!competencia) return
    setLoading(true)
    setErro(null)
    fetch(`${API}/liderancas/${unidade}?competencia=${competencia}`)
      .then(r => {
        if (!r.ok) throw new Error("Não encontrado")
        return r.json()
      })
      .then(setDados)
      .catch(() => setErro(`Sem dados para ${unidade} — ${competencia}`))
      .finally(() => setLoading(false))
  }, [unidade, competencia])

  const pavilhoes = dados?.pavilhoes || {}
  const totalLideres = Object.values(pavilhoes)
    .reduce((acc, p) => acc + (p.liderancas?.length || 0), 0)

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100vh",
      background: "#F8FAFC", fontFamily: SANS, overflow: "hidden",
    }}>

      {/* ── Topbar ── */}
      <div style={{
        height: 52, background: "#FFFFFF", borderBottom: "1px solid #E2E8F0",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", flexShrink: 0,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => onNavigate("Controle de Grupos")}
            style={{
              background: "transparent", border: "none",
              cursor: "pointer", fontSize: 18, color: "#64748B",
            }}
          >←</button>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>
              Lideranças por Unidade
            </div>
            <div style={{ fontSize: 9, color: "#94A3B8", fontFamily: MONO, marginTop: 1 }}>
              Mapeamento mensal · Drive institucional
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Seletor de competência */}
          {competencias.length > 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "#F1F5F9", border: "1px solid #E2E8F0",
              borderRadius: 8, padding: "0 4px 0 12px",
            }}>
              <span style={{ fontSize: 10, color: "#64748B", fontFamily: MONO, fontWeight: 700 }}>
                MÊS
              </span>
              <select
                value={competencia || ""}
                onChange={e => setCompetencia(e.target.value)}
                style={{
                  fontSize: 11, fontFamily: MONO, fontWeight: 800,
                  border: "none", borderRadius: 6,
                  padding: "8px 4px", background: "transparent", color: "#0F172A",
                  cursor: "pointer", outline: "none",
                }}
              >
                {competencias.map(c => (
                  <option key={c} value={c}>{formatarMes(c)}</option>
                ))}
              </select>
            </div>
          )}

          {/* Botão PDF */}
          <button
            onClick={exportarPDF}
            disabled={!dados || exportando}
            style={{
              background: !dados || exportando ? "#F1F5F9" : "#B45309",
              color: !dados || exportando ? "#94A3B8" : "#FFFFFF",
              border: "none", borderRadius: 7, padding: "8px 16px",
              fontSize: 11, fontWeight: 800,
              cursor: !dados || exportando ? "not-allowed" : "pointer",
              fontFamily: MONO, letterSpacing: "0.05em",
            }}
          >
            {exportando ? "GERANDO..." : "↓ EXPORTAR PDF"}
          </button>
        </div>
      </div>

      {/* ── Abas de unidade ── */}
      <div style={{
        display: "flex", gap: 4, padding: "10px 20px",
        background: "#FFFFFF", borderBottom: "1px solid #E2E8F0",
        flexShrink: 0, overflowX: "auto",
      }}>
        {Object.entries(UNIDADES).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setUnidade(key)}
            style={{
              background: unidade === key ? "#0F172A" : "#F1F5F9",
              border: unidade === key ? "none" : "1px solid #E2E8F0",
              borderRadius: 8,
              cursor: "pointer",
              padding: "8px 20px",
              fontSize: 12,
              fontWeight: unidade === key ? 800 : 600,
              color: unidade === key ? "#FFFFFF" : "#475569",
              fontFamily: MONO,
              letterSpacing: "0.05em",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
              boxShadow: unidade === key ? "0 2px 8px rgba(15,23,42,0.3)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Resumo rápido ── */}
      {dados && (
        <div style={{
          display: "flex", gap: 10, padding: "12px 20px 0", flexShrink: 0,
        }}>
          {[
            { label: "PAVILHÕES", valor: Object.keys(pavilhoes).length, cor: "#1D4ED8" },
            { label: "LÍDERES MAPEADOS", valor: totalLideres, cor: "#DC2626" },
            { label: "COMPETÊNCIA", valor: formatarMes(dados.competencia), cor: "#B45309" },
          ].map(({ label, valor, cor }) => (
            <div key={label} style={{
              background: "#FFFFFF", border: `1px solid ${cor}25`,
              borderRadius: 8, padding: "8px 16px",
              display: "flex", alignItems: "center", gap: 10,
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            }}>
              <div style={{
                fontSize: 20, fontWeight: 800, color: cor,
                fontFamily: MONO, lineHeight: 1,
              }}>
                {valor}
              </div>
              <div style={{
                fontSize: 8, color: "#64748B", fontFamily: MONO,
                textTransform: "uppercase", letterSpacing: "0.08em",
              }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Conteúdo ── */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>

        {loading && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", flexDirection: "column", gap: 10,
          }}>
            <svg style={{ animation: "spin 1s linear infinite" }} width="24" height="24"
              viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            <span style={{ fontSize: 11, color: "#94A3B8", fontFamily: MONO }}>
              Carregando dados do Drive...
            </span>
          </div>
        )}

        {erro && !loading && (
          <div style={{
            background: "#FEF2F2", border: "1px solid #FECACA",
            borderRadius: 8, padding: "16px 20px",
            fontSize: 12, color: "#DC2626", fontFamily: MONO,
          }}>
            ⚠ {erro}
            <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 6 }}>
              Verifique se o arquivo liderancas_{unidade}_AAAA-MM.json está na pasta dados do Drive.
            </div>
          </div>
        )}

        {!loading && !erro && dados && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {Object.entries(pavilhoes).map(([nomePav, dadosPav]) => (
              <SecaoPavilhao
                key={nomePav}
                nomePav={nomePav}
                dados={dadosPav}
              />
            ))}
          </div>
        )}

        {!loading && !erro && !dados && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: "200px", flexDirection: "column", gap: 8,
          }}>
            <div style={{ fontSize: 12, color: "#94A3B8", fontFamily: MONO }}>
              Nenhum dado disponível para {UNIDADES[unidade]}
            </div>
            <div style={{ fontSize: 10, color: "#CBD5E1", fontFamily: MONO }}>
              Faça upload do arquivo liderancas_{unidade}_AAAA-MM.json na pasta dados do Drive
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
