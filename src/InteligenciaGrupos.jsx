import { useState, useEffect } from "react"
import { jsPDF } from "jspdf"
import api from "./api"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const GLOBAL_CSS = `
  @keyframes ig-fade { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:translateY(0)} }
  .ig-card { animation: ig-fade 0.18s ease forwards; }
  .ig-card:hover { transform: translateY(-1px); border-color: rgba(232,160,32,0.30) !important; }
  .ig-btn:hover { color:#E8A020 !important; border-color:rgba(232,160,32,0.4) !important; }
  .ig-scroll::-webkit-scrollbar{width:8px} .ig-scroll::-webkit-scrollbar-track{background:transparent}
  .ig-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.14);border-radius:6px}
  .ig-scroll::-webkit-scrollbar-thumb:hover{background:rgba(232,160,32,0.4)}
`

// Paleta de cores por grupo — expande automaticamente para novos grupos
const GRUPO_CORES = {
  "CV/AM":          "#F87171",
  "PCC":            "#60A5FA",
  "AMARELINHOS":    "#FBBF24",
  "JACK/TDA":       "#A78BFA",
  "RDA":            "#22D3EE",
  "LIDERANÇAS CV":  "#F472B6",
  "LIDERANÇAS PCC": "#818CF8",
  "MED. SEGURANÇA": "#34D399",
  "CRIMES SEXUAIS": "#FB923C",
  "ISOLAMENTO":     "#94A3B8",
  "NEUTROS":        "#CBD5E1",
  "LGBTQIAPN+":     "#F0ABFC",
}
const CORES_FALLBACK = ["#2DD4BF","#FCD34D","#A5B4FC","#38BDF8","#4ADE80","#C084FC","#FB7185"]
function corDoGrupo(grupo, index) {
  return GRUPO_CORES[grupo] || CORES_FALLBACK[index % CORES_FALLBACK.length]
}

// Cores usadas no PDF (tons sólidos p/ impressão clara)
const GRUPO_CORES_PDF = {
  "CV/AM": "#DC2626", "PCC": "#1D4ED8", "AMARELINHOS": "#D97706", "JACK/TDA": "#7C3AED",
  "RDA": "#0891B2", "LIDERANÇAS CV": "#BE185D", "LIDERANÇAS PCC": "#1E40AF",
  "MED. SEGURANÇA": "#065F46", "CRIMES SEXUAIS": "#92400E", "ISOLAMENTO": "#475569",
  "NEUTROS": "#64748B", "LGBTQIAPN+": "#DB2777",
}
const CORES_PDF_FB = ["#0F766E","#B45309","#4338CA","#0369A1","#15803D","#9333EA","#E11D48"]
function corPdf(grupo, i) { return GRUPO_CORES_PDF[grupo] || CORES_PDF_FB[i % CORES_PDF_FB.length] }

// Extrai contagem de grupos de um snapshot
function extrairContagem(dados) {
  const contagem = {}
  if (!dados?.unidades) return contagem
  for (const unidade of Object.values(dados.unidades)) {
    const pavilhoes = unidade.pavilhoes || unidade.pavs || {}
    for (const pav of Object.values(pavilhoes)) {
      const g = pav.grupo || pav.g || ""
      if (g) contagem[g] = (contagem[g] || 0) + 1
    }
  }
  return contagem
}

// Extrai detalhamento por unidade
function extrairPorUnidade(dados) {
  if (!dados?.unidades) return {}
  const resultado = {}
  for (const [nomeUnidade, unidade] of Object.entries(dados.unidades)) {
    const pavilhoes = unidade.pavilhoes || unidade.pavs || {}
    resultado[nomeUnidade] = Object.entries(pavilhoes).map(([key, pav]) => ({
      key,
      label: pav.label || key,
      grupo: pav.grupo || pav.g || "—",
    }))
  }
  return resultado
}

// ── Card de KPI por grupo (com ranking, % de domínio e barra de participação) ──
function KpiCard({ rank, grupo, qtd, total, variacao, cor }) {
  const temVariacao = variacao !== null && variacao !== undefined
  const subiu = variacao > 0
  const desceu = variacao < 0
  const pct = total > 0 ? (qtd / total) * 100 : 0
  return (
    <div className="ig-card" style={{
      background: "#111827",
      borderTop: "1px solid rgba(255,255,255,0.07)",
      borderRight: "1px solid rgba(255,255,255,0.07)",
      borderBottom: "1px solid rgba(255,255,255,0.07)",
      borderLeft: `4px solid ${cor}`,
      borderRadius: 10, padding: "14px 16px",
      display: "flex", flexDirection: "column", gap: 8,
      transition: "all 0.15s",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: cor, flexShrink: 0 }}/>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#F1F5F9", fontFamily: MONO, letterSpacing: "0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={grupo}>
            {grupo}
          </span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#64748B", fontFamily: MONO, flexShrink: 0 }}>#{rank}</span>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: cor, lineHeight: 1, fontFamily: MONO }}>{qtd}</span>
        <span style={{ fontSize: 13, color: "#94A3B8", fontFamily: MONO, marginBottom: 2 }}>
          pavilhões · <b style={{ color: "#CBD5E1" }}>{pct.toFixed(0)}%</b>
        </span>
      </div>

      {/* Barra de participação */}
      <div style={{ height: 6, background: "#1A2236", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: cor, borderRadius: 3, transition: "width 0.5s ease" }}/>
      </div>

      {temVariacao && (
        <div style={{
          display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, fontFamily: MONO,
          color: subiu ? "#F87171" : desceu ? "#4ADE80" : "#94A3B8",
        }}>
          <span>{subiu ? "▲" : desceu ? "▼" : "—"}</span>
          <span>{Math.abs(variacao).toFixed(1)}% vs mês ant.</span>
          {Math.abs(variacao) >= 20 && (
            <span style={{
              background: "rgba(239,68,68,0.14)", color: "#F87171", border: "1px solid rgba(239,68,68,0.35)",
              padding: "1px 6px", borderRadius: 4, fontSize: 9.5, marginLeft: 2, letterSpacing: "0.04em",
            }}>ALERTA</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Card-resumo (KPI agregado) ──
function ResumoCard({ label, valor, sub, cor }) {
  return (
    <div style={{
      flex: 1, minWidth: 160, background: "#111827",
      borderLeft: "1px solid rgba(255,255,255,0.07)",
      borderRight: "1px solid rgba(255,255,255,0.07)",
      borderBottom: "1px solid rgba(255,255,255,0.07)",
      borderTop: `3px solid ${cor}`,
      borderRadius: 10, padding: "12px 16px",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: MONO, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: cor, lineHeight: 1, fontFamily: MONO }}>{valor}</div>
      {sub && <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 5, fontFamily: MONO }}>{sub}</div>}
    </div>
  )
}

// ── Gráfico de barras horizontal ──────────────────────────────────────────────
function GraficoBarras({ series, mesSelecionado, grupos }) {
  const dados = series[mesSelecionado] || {}
  const max = Math.max(...Object.values(dados), 1)
  const total = Object.values(dados).reduce((a, b) => a + b, 0) || 1

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {grupos.map((grupo, i) => {
        const qtd = dados[grupo] || 0
        const pct = (qtd / max) * 100
        const share = (qtd / total) * 100
        const cor = corDoGrupo(grupo, i)
        return (
          <div key={grupo} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 130, fontSize: 12.5, fontWeight: 600, color: "#CBD5E1",
              fontFamily: MONO, textAlign: "right", flexShrink: 0,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }} title={grupo}>{grupo}</div>
            <div style={{ flex: 1, height: 22, background: "#1A2236", borderRadius: 5, overflow: "hidden", position: "relative" }}>
              <div style={{
                height: "100%", width: `${pct}%`,
                background: `linear-gradient(90deg, ${cor}, ${cor}AA)`,
                borderRadius: 5, transition: "width 0.5s ease", minWidth: qtd > 0 ? 4 : 0,
              }}/>
            </div>
            <div style={{ width: 64, fontSize: 13, fontWeight: 800, color: cor, fontFamily: MONO, textAlign: "right", flexShrink: 0 }}>
              {qtd} <span style={{ color: "#64748B", fontWeight: 600, fontSize: 11 }}>{share.toFixed(0)}%</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Tabela de unidades ────────────────────────────────────────────────────────
function TabelaUnidades({ porUnidade }) {
  const [aberta, setAberta] = useState(null)
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Object.entries(porUnidade).map(([unidade, pavilhoes]) => (
        <div key={unidade} style={{
          background: "#111827", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 10, overflow: "hidden",
        }}>
          <button
            onClick={() => setAberta(aberta === unidade ? null : unidade)}
            style={{
              width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: "12px 16px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: "#F1F5F9", letterSpacing: "0.04em", fontFamily: MONO }}>{unidade}</span>
              <span style={{ fontSize: 11, color: "#94A3B8", fontFamily: MONO, background: "#1A2236", padding: "2px 8px", borderRadius: 5 }}>
                {pavilhoes.length} pavilhões
              </span>
            </div>
            <span style={{ fontSize: 14, color: aberta === unidade ? "#E8A020" : "#94A3B8" }}>{aberta === unidade ? "▲" : "▼"}</span>
          </button>

          {aberta === unidade && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", padding: "0 16px 14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 7, marginTop: 12 }}>
                {pavilhoes.map((pav, idx) => {
                  const cor = corDoGrupo(pav.grupo, idx)
                  return (
                    <div key={pav.key} style={{
                      display: "flex", alignItems: "center", gap: 9, padding: "8px 11px",
                      background: "#0B1120",
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                      borderRight: "1px solid rgba(255,255,255,0.06)",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      borderLeft: `3px solid ${cor}`, borderRadius: 7,
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#F1F5F9", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {pav.label}
                        </div>
                        <div style={{ fontSize: 11, color: cor, fontWeight: 700, fontFamily: MONO, marginTop: 1 }}>{pav.grupo}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function InteligenciaGrupos({ onNavigate }) {
  const [meses, setMeses] = useState([])
  const [mesSelecionado, setMesSelecionado] = useState(null)
  const [snapshots, setSnapshots] = useState({})
  const [kpis, setKpis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [abaAtiva, setAbaAtiva] = useState("kpis")

  useEffect(() => {
    const style = document.createElement("style")
    style.textContent = GLOBAL_CSS
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  useEffect(() => {
    const atual = new Date().toISOString().slice(0, 7)
    api.get("/grupos/meses")
      .then(r => r.json())
      .then(data => {
        let lista = data.meses || []
        if (!lista.includes(atual)) lista = [atual, ...lista]
        lista = [...new Set(lista)].sort().reverse()
        setMeses(lista)
        setMesSelecionado(lista[0])
      })
      .catch(() => { setMeses([atual]); setMesSelecionado(atual); setErro("Não foi possível carregar os meses.") })
  }, [])

  useEffect(() => {
    if (!mesSelecionado) return
    if (snapshots[mesSelecionado]) return
    api.get(`/grupos/ocupacao?ano_mes=${mesSelecionado}`)
      .then(r => r.json())
      .then(data => setSnapshots(prev => ({ ...prev, [mesSelecionado]: data })))
      .catch(() => setErro(`Erro ao carregar ${mesSelecionado}`))
  }, [mesSelecionado])

  useEffect(() => {
    api.get("/grupos/kpis")
      .then(r => r.json())
      .then(setKpis)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const snap = snapshots[mesSelecionado]
  const dadosAtual = snap?.unidades ? snap : (snap?.dados || null)
  const contagemAtual = dadosAtual ? extrairContagem(dadosAtual) : {}
  const porUnidade = dadosAtual ? extrairPorUnidade(dadosAtual) : {}
  const grupos = Object.keys(contagemAtual).sort((a, b) => contagemAtual[b] - contagemAtual[a])

  const variacoes = {}
  if (kpis?.series && mesSelecionado) {
    const mesesOrdenados = Object.keys(kpis.series).sort()
    const idxAtual = mesesOrdenados.indexOf(mesSelecionado)
    if (idxAtual > 0) {
      const mesAnterior = mesesOrdenados[idxAtual - 1]
      const ant = kpis.series[mesAnterior] || {}
      const atu = kpis.series[mesSelecionado] || {}
      for (const g of Object.keys(atu)) {
        const qtdAnt = ant[g] || 0
        if (qtdAnt > 0) variacoes[g] = ((atu[g] - qtdAnt) / qtdAnt) * 100
      }
    }
  }

  const idxMes = meses.indexOf(mesSelecionado)
  const podePrev = idxMes < meses.length - 1
  const podeProx = idxMes > 0

  function formatarMes(mes) {
    if (!mes) return ""
    const [ano, m] = mes.split("-")
    const nomes = ["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
    return `${nomes[parseInt(m)]} ${ano}`
  }

  async function forcarSnapshot() {
    setLoading(true)
    try {
      const atual = new Date().toISOString().slice(0, 7)
      const mesesData = await api.get("/grupos/meses").then(r => r?.json())
      let lista = mesesData?.meses || []
      if (!lista.includes(atual)) lista = [atual, ...lista]
      lista = [...new Set(lista)].sort().reverse()
      setMeses(lista)
      setSnapshots({})
      const kpisData = await api.get("/grupos/kpis").then(r => r?.json())
      setKpis(kpisData)
    } catch {}
    finally { setLoading(false) }
  }

  const totalGrupos = grupos.length
  const totalPavilhoes = Object.values(contagemAtual).reduce((a, b) => a + b, 0)
  const alertasAtivos = kpis?.alertas?.length || 0
  const grupoDominante = grupos[0] || null
  const dominanciaPct = grupoDominante && totalPavilhoes > 0 ? (contagemAtual[grupoDominante] / totalPavilhoes) * 100 : 0
  const semDados = grupos.length === 0

  // ── Exportação PDF (documento claro p/ impressão — mantém tema claro) ──
  function exportarPDF() {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
    const W = 210, ml = 18, mr = 18, cw = W - ml - mr
    let y = 0
    const AZUL = [15, 23, 42], GOLD = [180, 83, 9], CINZA = [100, 116, 139], BORDA = [226, 232, 240], BRANCO = [255, 255, 255]

    doc.setFillColor(...AZUL); doc.rect(0, 0, W, 28, "F")
    doc.setFillColor(...GOLD); doc.rect(0, 28, W, 2, "F")
    doc.setTextColor(...BRANCO); doc.setFont("helvetica", "bold"); doc.setFontSize(15)
    doc.text("AGENT BASTOS", ml, 11)
    doc.setFontSize(8); doc.setFont("helvetica", "normal")
    doc.text("Sistema de Inteligência e Segurança Corporativa", ml, 17)
    doc.setFontSize(7); doc.text(`Relatório gerado em: ${new Date().toLocaleString("pt-BR")}`, ml, 22)
    doc.setFillColor(...GOLD); doc.roundedRect(W - mr - 32, 8, 32, 10, 2, 2, "F")
    doc.setTextColor(...BRANCO); doc.setFont("helvetica", "bold"); doc.setFontSize(7)
    doc.text("CONFIDENCIAL", W - mr - 16, 14.5, { align: "center" })
    y = 36

    doc.setTextColor(...AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(13)
    doc.text("RELATÓRIO DE INTELIGÊNCIA DE GRUPOS", ml, y + 7)
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...CINZA)
    doc.text(`Competência: ${formatarMes(mesSelecionado)}  ·  Fonte: Drive Institucional  ·  Atualização automática mensal`, ml, y + 13)
    doc.setDrawColor(...BORDA); doc.line(ml, y + 16, W - mr, y + 16)
    y += 22

    doc.setFillColor(248, 250, 252); doc.roundedRect(ml, y, cw, 18, 2, 2, "F")
    doc.setDrawColor(...BORDA); doc.roundedRect(ml, y, cw, 18, 2, 2, "S")
    const colW = cw / 3
    const resumos = [
      { label: "GRUPOS DISTINTOS", valor: String(totalGrupos) },
      { label: "PAVILHÕES MAPEADOS", valor: String(totalPavilhoes) },
      { label: "ALERTAS DE VARIAÇÃO", valor: String(alertasAtivos) },
    ]
    resumos.forEach(({ label, valor }, i) => {
      const cx = ml + colW * i + colW / 2
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...AZUL)
      doc.text(valor, cx, y + 9, { align: "center" })
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...CINZA)
      doc.text(label, cx, y + 14, { align: "center" })
      if (i < 2) { doc.setDrawColor(...BORDA); doc.line(ml + colW * (i + 1), y + 3, ml + colW * (i + 1), y + 15) }
    })
    y += 24

    if (kpis?.alertas?.length > 0) {
      doc.setFillColor(254, 242, 242); doc.roundedRect(ml, y, cw, 8 + kpis.alertas.length * 6, 2, 2, "F")
      doc.setDrawColor(254, 202, 202); doc.roundedRect(ml, y, cw, 8 + kpis.alertas.length * 6, 2, 2, "S")
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(220, 38, 38)
      doc.text("⚠  ALERTAS DE VARIAÇÃO SIGNIFICATIVA (≥ 20%)", ml + 4, y + 6)
      kpis.alertas.forEach((a, i) => {
        doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(127, 29, 29)
        const seta = a.variacao > 0 ? "▲" : "▼"
        doc.text(`${a.grupo}:  ${seta} ${Math.abs(a.variacao).toFixed(1)}%  (anterior: ${a.anterior}  →  atual: ${a.atual})`, ml + 6, y + 12 + i * 6)
      })
      y += 12 + kpis.alertas.length * 6 + 4
    }

    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...AZUL)
    doc.text("DISTRIBUIÇÃO POR GRUPO", ml, y + 5)
    doc.setFillColor(...GOLD); doc.rect(ml, y + 7, 30, 0.8, "F")
    y += 12
    const cardW = (cw - 8) / 3, cardH = 16
    grupos.forEach((grupo, i) => {
      const col = i % 3, row = Math.floor(i / 3)
      const cx = ml + col * (cardW + 4), cy = y + row * (cardH + 4)
      doc.setFillColor(248, 250, 252); doc.roundedRect(cx, cy, cardW, cardH, 1.5, 1.5, "F")
      const hex = corPdf(grupo, i)
      const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
      doc.setFillColor(r, g, b); doc.rect(cx, cy, 2, cardH, "F")
      doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(r, g, b)
      doc.text(String(contagemAtual[grupo] || 0), cx + 6, cy + 9)
      doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(...AZUL)
      const nomeCorto = grupo.length > 16 ? grupo.slice(0, 14) + "..." : grupo
      doc.text(nomeCorto, cx + 6, cy + 13)
      if (variacoes[grupo] != null) {
        const v = variacoes[grupo]
        doc.setFont("helvetica", "normal"); doc.setFontSize(5.5)
        doc.setTextColor(v > 0 ? 220 : 22, v > 0 ? 38 : 163, v > 0 ? 38 : 74)
        doc.text(`${v > 0 ? "▲" : "▼"} ${Math.abs(v).toFixed(1)}%`, cx + cardW - 14, cy + 13)
      }
    })
    y += Math.ceil(grupos.length / 3) * (cardH + 4) + 8

    if (y > 220) { doc.addPage(); y = 18 }
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...AZUL)
    doc.text("DETALHAMENTO POR UNIDADE", ml, y + 5)
    doc.setFillColor(...GOLD); doc.rect(ml, y + 7, 40, 0.8, "F")
    y += 14
    Object.entries(porUnidade).forEach(([unidade, pavilhoes]) => {
      if (y > 255) { doc.addPage(); y = 18 }
      doc.setFillColor(...AZUL); doc.roundedRect(ml, y, cw, 8, 1, 1, "F")
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...BRANCO)
      doc.text(unidade, ml + 4, y + 5.5)
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5)
      doc.text(`${pavilhoes.length} pavilhões`, W - mr - 4, y + 5.5, { align: "right" })
      y += 10
      pavilhoes.forEach((pav, i) => {
        const col = i % 2, px = ml + col * (cw / 2 + 2), py = y + Math.floor(i / 2) * 8
        if (py > 265) return
        const hex = corPdf(pav.grupo, i)
        const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
        doc.setFillColor(255, 255, 255); doc.setDrawColor(r, g, b)
        doc.roundedRect(px, py, cw/2 - 2, 7, 1, 1, "FD")
        doc.setFillColor(r, g, b); doc.rect(px, py, 2, 7, "F")
        doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(15, 23, 42)
        const labelCorto = pav.label.length > 22 ? pav.label.slice(0,20)+"..." : pav.label
        doc.text(labelCorto, px + 5, py + 3.2)
        doc.setFont("helvetica", "bold"); doc.setFontSize(5.5); doc.setTextColor(r, g, b)
        doc.text(pav.grupo, px + 5, py + 6)
      })
      y += Math.ceil(pavilhoes.length / 2) * 8 + 6
    })

    const pageCount = doc.getNumberOfPages()
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p)
      doc.setFillColor(...AZUL); doc.rect(0, 287, W, 10, "F")
      doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(...BRANCO)
      doc.text("Agent Bastos · Sistema de Inteligência Corporativa · USO INTERNO · CONFIDENCIAL", ml, 293)
      doc.text(`Página ${p} de ${pageCount}`, W - mr, 293, { align: "right" })
    }
    doc.save(`inteligencia-grupos-${formatarMes(mesSelecionado).replace(" ", "-")}.pdf`)
  }

  const navBtn = (txt, on, hab) => (
    <button onClick={on} disabled={!hab} style={{
      background: "transparent", border: "none", cursor: hab ? "pointer" : "not-allowed",
      padding: "6px 12px", fontSize: 17, color: hab ? "#E8A020" : "#475569", lineHeight: 1, fontWeight: 700,
    }}>{txt}</button>
  )

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0B1120", fontFamily: SANS, overflow: "hidden" }}>

      {/* ── TOPBAR ── */}
      <div style={{
        background: "#111827", borderBottom: "1px solid rgba(255,255,255,0.07)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 22px", flexShrink: 0, gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 4, height: 30, background: "#E8A020", borderRadius: 3, flexShrink: 0 }}/>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#F1F5F9", letterSpacing: "0.01em" }}>Inteligência de Grupos</div>
            <div style={{ fontSize: 13, color: "#94A3B8", fontFamily: MONO, marginTop: 2 }}>Histórico mensal · Drive sincronizado</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", background: "#0B1120", borderRadius: 9, overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)" }}>
            {navBtn("‹", () => podePrev && setMesSelecionado(meses[idxMes + 1]), podePrev)}
            <div style={{ padding: "6px 14px", fontSize: 14, fontWeight: 800, color: "#F1F5F9", fontFamily: MONO, minWidth: 92, textAlign: "center" }}>
              {formatarMes(mesSelecionado) || "—"}
            </div>
            {navBtn("›", () => podeProx && setMesSelecionado(meses[idxMes - 1]), podeProx)}
          </div>

          <button onClick={exportarPDF} disabled={semDados} style={{
            background: semDados ? "#1A2236" : "#E8A020", color: semDados ? "#64748B" : "#0B1120",
            border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 800,
            cursor: semDados ? "not-allowed" : "pointer", fontFamily: MONO, letterSpacing: "0.04em",
          }}>↓ EXPORTAR PDF</button>

          <button onClick={forcarSnapshot} disabled={loading} className="ig-btn" style={{
            background: "transparent", color: "#94A3B8", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer", fontFamily: MONO, letterSpacing: "0.04em", opacity: loading ? 0.6 : 1,
          }}>{loading ? "AGUARDE..." : "↻ ATUALIZAR"}</button>
        </div>
      </div>

      {erro && (
        <div style={{ margin: "12px 22px 0", padding: "9px 14px", background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, fontSize: 13.5, color: "#F87171", fontFamily: MONO }}>
          ⚠ {erro}
        </div>
      )}

      {/* ── CARDS-RESUMO ── */}
      <div style={{ display: "flex", gap: 10, padding: "14px 22px 0", flexShrink: 0, flexWrap: "wrap" }}>
        <ResumoCard label="Pavilhões mapeados" valor={loading ? "—" : totalPavilhoes} sub="no mês selecionado" cor="#60A5FA" />
        <ResumoCard label="Grupos distintos" valor={loading ? "—" : totalGrupos} sub="facções/categorias" cor="#A78BFA" />
        <ResumoCard label="Grupo dominante" valor={semDados ? "—" : (grupoDominante || "—")}
          sub={semDados ? "" : `${contagemAtual[grupoDominante]} pavilhões · ${dominanciaPct.toFixed(0)}% do total`} cor="#E8A020" />
        <ResumoCard label="Alertas de variação" valor={loading ? "—" : alertasAtivos} sub="≥ 20% vs mês anterior" cor={alertasAtivos > 0 ? "#F87171" : "#64748B"} />
      </div>

      {/* faixa de alertas de variação */}
      {kpis?.alertas?.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "12px 22px 0", padding: "9px 14px", background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#F87171", fontFamily: MONO, letterSpacing: "0.05em" }}>⚠ VARIAÇÕES</span>
          {kpis.alertas.map((a, i) => (
            <span key={i} style={{ fontSize: 11, fontFamily: MONO, fontWeight: 700, color: a.variacao > 0 ? "#F87171" : "#4ADE80", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", padding: "2px 8px", borderRadius: 5 }}>
              {a.grupo} {a.variacao > 0 ? "▲" : "▼"}{Math.abs(a.variacao).toFixed(0)}%
            </span>
          ))}
        </div>
      )}

      {/* ── ABAS ── */}
      <div style={{ display: "flex", gap: 4, padding: "14px 22px 0", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.07)", marginTop: 10 }}>
        {[
          { id: "kpis", label: "KPIs por Grupo" },
          { id: "evolucao", label: "Evolução Histórica" },
          { id: "unidades", label: "Detalhamento por Unidade" },
        ].map(aba => {
          const ativo = abaAtiva === aba.id
          return (
            <button key={aba.id} onClick={() => setAbaAtiva(aba.id)} style={{
              background: "transparent", border: "none", cursor: "pointer", padding: "9px 16px",
              fontSize: 14, fontWeight: ativo ? 700 : 500, color: ativo ? "#E8A020" : "#94A3B8",
              borderBottom: ativo ? "2px solid #E8A020" : "2px solid transparent", marginBottom: -1, transition: "all 0.15s",
            }}>{aba.label}</button>
          )
        })}
      </div>

      {/* ── CONTEÚDO ── */}
      <div className="ig-scroll" style={{ flex: 1, overflow: "auto", padding: "16px 22px" }}>

        {abaAtiva === "kpis" && (
          loading ? (
            <div style={{ textAlign: "center", color: "#94A3B8", fontFamily: MONO, fontSize: 14, paddingTop: 50 }}>Carregando dados...</div>
          ) : semDados ? (
            <div style={{ textAlign: "center", color: "#64748B", fontFamily: MONO, fontSize: 14, paddingTop: 50 }}>
              Nenhum dado disponível para {formatarMes(mesSelecionado) || "este período"}.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
              {grupos.map((grupo, i) => (
                <KpiCard key={grupo} rank={i + 1} grupo={grupo} qtd={contagemAtual[grupo]} total={totalPavilhoes} variacao={variacoes[grupo] ?? null} cor={corDoGrupo(grupo, i)} />
              ))}
            </div>
          )
        )}

        {abaAtiva === "evolucao" && (
          <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "20px" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#F1F5F9", marginBottom: 4 }}>Distribuição por grupo — {formatarMes(mesSelecionado)}</div>
            <div style={{ fontSize: 12.5, color: "#94A3B8", fontFamily: MONO, marginBottom: 18 }}>Quantidade de pavilhões controlados por cada grupo</div>
            {kpis?.series && Object.keys(kpis.series[mesSelecionado] || {}).length > 0 ? (
              <GraficoBarras series={kpis.series} mesSelecionado={mesSelecionado} grupos={grupos.length > 0 ? grupos : Object.keys(kpis.series[mesSelecionado] || {})} />
            ) : (
              <div style={{ color: "#64748B", fontFamily: MONO, fontSize: 13 }}>Sem dados históricos suficientes.</div>
            )}

            {kpis?.meses?.length > 1 && (
              <div style={{ marginTop: 24, borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: MONO }}>Meses no histórico</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[...kpis.meses].sort().reverse().map(mes => {
                    const ativo = mes === mesSelecionado
                    return (
                      <button key={mes} onClick={() => setMesSelecionado(mes)} className="ig-btn" style={{
                        padding: "5px 12px", borderRadius: 7, fontSize: 13, fontFamily: MONO, fontWeight: 700, cursor: "pointer",
                        border: "1px solid", borderColor: ativo ? "#E8A020" : "rgba(255,255,255,0.10)",
                        background: ativo ? "#E8A020" : "transparent", color: ativo ? "#0B1120" : "#94A3B8",
                      }}>{formatarMes(mes)}</button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {abaAtiva === "unidades" && (
          Object.keys(porUnidade).length === 0 ? (
            <div style={{ textAlign: "center", color: "#64748B", fontFamily: MONO, fontSize: 14, paddingTop: 50 }}>
              Nenhum dado disponível para {formatarMes(mesSelecionado) || "este período"}.
            </div>
          ) : (
            <TabelaUnidades porUnidade={porUnidade} />
          )
        )}
      </div>
    </div>
  )
}
