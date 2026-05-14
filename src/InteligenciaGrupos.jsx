import { useState, useEffect } from "react"
import { jsPDF } from "jspdf"

const API = "http://127.0.0.1:8000"
const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

// Paleta de cores por grupo — expande automaticamente para novos grupos
const GRUPO_CORES = {
  "CV/AM":          "#DC2626",
  "PCC":            "#1D4ED8",
  "AMARELINHOS":    "#D97706",
  "JACK/TDA":       "#7C3AED",
  "RDA":            "#0891B2",
  "LIDERANÇAS CV":  "#BE185D",
  "LIDERANÇAS PCC": "#1E40AF",
  "MED. SEGURANÇA": "#065F46",
  "CRIMES SEXUAIS": "#92400E",
  "ISOLAMENTO":     "#475569",
  "NEUTROS":        "#64748B",
  "LGBTQIAPN+":     "#DB2777",
}
const CORES_FALLBACK = ["#0F766E","#B45309","#4338CA","#0369A1","#15803D","#9333EA","#E11D48"]
function corDoGrupo(grupo, index) {
  return GRUPO_CORES[grupo] || CORES_FALLBACK[index % CORES_FALLBACK.length]
}

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

// ── Componente de KPI card ────────────────────────────────────────────────────
function KpiCard({ grupo, qtd, variacao, cor, index }) {
  const temVariacao = variacao !== null && variacao !== undefined
  const subiu = variacao > 0
  const desceu = variacao < 0
  return (
    <div style={{
      background: "#FFFFFF",
      border: `1px solid ${cor}30`,
      borderLeft: `4px solid ${cor}`,
      borderRadius: 8,
      padding: "12px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 4,
      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, right: 0, bottom: 0,
        width: 3, background: cor, opacity: 0.15,
      }}/>
      <div style={{ fontSize: 9, fontWeight: 800, color: "#64748B", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: MONO }}>
        {grupo}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: cor, lineHeight: 1, fontFamily: MONO }}>
        {qtd}
      </div>
      <div style={{ fontSize: 9, color: "#94A3B8", fontFamily: MONO }}>pavilhões</div>
      {temVariacao && (
        <div style={{
          display: "flex", alignItems: "center", gap: 3, marginTop: 2,
          fontSize: 9, fontWeight: 700, fontFamily: MONO,
          color: subiu ? "#DC2626" : desceu ? "#16A34A" : "#94A3B8",
        }}>
          <span>{subiu ? "▲" : desceu ? "▼" : "—"}</span>
          <span>{Math.abs(variacao).toFixed(1)}% vs mês anterior</span>
          {Math.abs(variacao) >= 20 && (
            <span style={{
              background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA",
              padding: "0px 4px", borderRadius: 3, fontSize: 8, marginLeft: 2,
            }}>ALERTA</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Gráfico de barras horizontal ──────────────────────────────────────────────
function GraficoBarras({ series, mesSelecionado, grupos }) {
  const dados = series[mesSelecionado] || {}
  const max = Math.max(...Object.values(dados), 1)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {grupos.map((grupo, i) => {
        const qtd = dados[grupo] || 0
        const pct = (qtd / max) * 100
        const cor = corDoGrupo(grupo, i)
        return (
          <div key={grupo} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 120, fontSize: 9, fontWeight: 600, color: "#475569",
              fontFamily: MONO, textAlign: "right", flexShrink: 0,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {grupo}
            </div>
            <div style={{
              flex: 1, height: 18, background: "#F1F5F9",
              borderRadius: 4, overflow: "hidden", position: "relative",
            }}>
              <div style={{
                height: "100%", width: `${pct}%`,
                background: `linear-gradient(90deg, ${cor}, ${cor}BB)`,
                borderRadius: 4,
                transition: "width 0.5s ease",
                minWidth: qtd > 0 ? 4 : 0,
              }}/>
            </div>
            <div style={{
              width: 24, fontSize: 10, fontWeight: 800,
              color: cor, fontFamily: MONO, textAlign: "right",
            }}>
              {qtd}
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
          background: "#FFFFFF",
          border: "1px solid #E2E8F0",
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}>
          <button
            onClick={() => setAberta(aberta === unidade ? null : unidade)}
            style={{
              width: "100%", background: "transparent", border: "none",
              cursor: "pointer", padding: "10px 14px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                fontSize: 11, fontWeight: 800, color: "#0F172A",
                letterSpacing: "0.05em", fontFamily: MONO,
              }}>
                {unidade}
              </span>
              <span style={{
                fontSize: 9, color: "#64748B", fontFamily: MONO,
                background: "#F1F5F9", padding: "1px 6px", borderRadius: 4,
              }}>
                {pavilhoes.length} pavilhões
              </span>
            </div>
            <span style={{ fontSize: 12, color: "#94A3B8" }}>
              {aberta === unidade ? "▲" : "▼"}
            </span>
          </button>

          {aberta === unidade && (
            <div style={{ borderTop: "1px solid #F1F5F9", padding: "0 14px 12px" }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 6, marginTop: 10,
              }}>
                {pavilhoes.map((pav, idx) => {
                  const cor = corDoGrupo(pav.grupo, idx)
                  return (
                    <div key={pav.key} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 10px",
                      background: `${cor}10`,
                      border: `1px solid ${cor}30`,
                      borderRadius: 6,
                    }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: cor, flexShrink: 0,
                      }}/>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: "#0F172A", lineHeight: 1.3 }}>
                          {pav.label}
                        </div>
                        <div style={{ fontSize: 9, color: cor, fontWeight: 700, fontFamily: MONO }}>
                          {pav.grupo}
                        </div>
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
  const [snapshots, setSnapshots] = useState({}) // { "2026-05": { dados, gerado_em } }
  const [kpis, setKpis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [abaAtiva, setAbaAtiva] = useState("kpis") // "kpis" | "unidades" | "evolucao"

  // 1. Carrega índice de meses disponíveis
  useEffect(() => {
    fetch(`${API}/historico/indice`)
      .then(r => r.json())
      .then(data => {
        const lista = (data.meses || []).sort().reverse() // mais recente primeiro
        setMeses(lista)
        if (lista.length > 0) setMesSelecionado(lista[0])
      })
      .catch(() => setErro("Não foi possível carregar o índice de meses."))
  }, [])

  // 2. Carrega snapshot do mês selecionado
  useEffect(() => {
    if (!mesSelecionado) return
    if (snapshots[mesSelecionado]) return // já está em cache

    fetch(`${API}/historico/${mesSelecionado}`)
      .then(r => r.json())
      .then(data => {
        setSnapshots(prev => ({ ...prev, [mesSelecionado]: data }))
      })
      .catch(() => setErro(`Erro ao carregar snapshot de ${mesSelecionado}`))
  }, [mesSelecionado])

  // 3. Carrega KPIs (séries históricas + alertas)
  useEffect(() => {
    fetch(`${API}/kpis`)
      .then(r => r.json())
      .then(setKpis)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const snap = snapshots[mesSelecionado]
  const dadosAtual = snap?.dados || null
  const contagemAtual = dadosAtual ? extrairContagem(dadosAtual) : {}
  const porUnidade = dadosAtual ? extrairPorUnidade(dadosAtual) : {}
  const grupos = Object.keys(contagemAtual).sort((a, b) => contagemAtual[b] - contagemAtual[a])

  // Calcula variações para o mês selecionado vs anterior
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
        if (qtdAnt > 0) {
          variacoes[g] = ((atu[g] - qtdAnt) / qtdAnt) * 100
        }
      }
    }
  }

  // ── Exportação PDF ─────────────────────────────────────────────────────────
  function exportarPDF() {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
    const W = 210, ml = 18, mr = 18, cw = W - ml - mr
    let y = 0

    // Paleta
    const AZUL  = [15, 23, 42]    // #0F172A
    const GOLD  = [180, 83, 9]    // #B45309
    const CINZA = [100, 116, 139] // #64748B
    const BORDA = [226, 232, 240] // #E2E8F0
    const BRANCO = [255, 255, 255]

    // ── Cabeçalho ──────────────────────────────────────────────────────────────
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

    // Selo CONFIDENCIAL
    doc.setFillColor(...GOLD)
    doc.roundedRect(W - mr - 32, 8, 32, 10, 2, 2, "F")
    doc.setTextColor(...BRANCO)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7)
    doc.text("CONFIDENCIAL", W - mr - 16, 14.5, { align: "center" })

    y = 36

    // ── Título do relatório ────────────────────────────────────────────────────
    doc.setTextColor(...AZUL)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
    doc.text("RELATÓRIO DE INTELIGÊNCIA DE GRUPOS", ml, y + 7)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...CINZA)
    doc.text(`Competência: ${formatarMes(mesSelecionado)}  ·  Fonte: Drive Institucional  ·  Atualização automática mensal`, ml, y + 13)
    doc.setDrawColor(...BORDA)
    doc.line(ml, y + 16, W - mr, y + 16)
    y += 22

    // ── Resumo executivo ───────────────────────────────────────────────────────
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(ml, y, cw, 18, 2, 2, "F")
    doc.setDrawColor(...BORDA)
    doc.roundedRect(ml, y, cw, 18, 2, 2, "S")

    const colW = cw / 3
    const resumos = [
      { label: "GRUPOS DISTINTOS",    valor: String(totalGrupos) },
      { label: "PAVILHÕES MAPEADOS",  valor: String(totalPavilhoes) },
      { label: "ALERTAS DE VARIAÇÃO", valor: String(alertasAtivos) },
    ]
    resumos.forEach(({ label, valor }, i) => {
      const cx = ml + colW * i + colW / 2
      doc.setFont("helvetica", "bold")
      doc.setFontSize(16)
      doc.setTextColor(...AZUL)
      doc.text(valor, cx, y + 9, { align: "center" })
      doc.setFont("helvetica", "normal")
      doc.setFontSize(6.5)
      doc.setTextColor(...CINZA)
      doc.text(label, cx, y + 14, { align: "center" })
      if (i < 2) {
        doc.setDrawColor(...BORDA)
        doc.line(ml + colW * (i + 1), y + 3, ml + colW * (i + 1), y + 15)
      }
    })
    y += 24

    // ── Alertas de variação ────────────────────────────────────────────────────
    if (kpis?.alertas?.length > 0) {
      doc.setFillColor(254, 242, 242)
      doc.roundedRect(ml, y, cw, 8 + kpis.alertas.length * 6, 2, 2, "F")
      doc.setDrawColor(254, 202, 202)
      doc.roundedRect(ml, y, cw, 8 + kpis.alertas.length * 6, 2, 2, "S")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(7.5)
      doc.setTextColor(220, 38, 38)
      doc.text("⚠  ALERTAS DE VARIAÇÃO SIGNIFICATIVA (≥ 20%)", ml + 4, y + 6)
      kpis.alertas.forEach((a, i) => {
        doc.setFont("helvetica", "normal")
        doc.setFontSize(7)
        doc.setTextColor(127, 29, 29)
        const seta = a.variacao > 0 ? "▲" : "▼"
        doc.text(
          `${a.grupo}:  ${seta} ${Math.abs(a.variacao).toFixed(1)}%  (anterior: ${a.anterior}  →  atual: ${a.atual})`,
          ml + 6, y + 12 + i * 6
        )
      })
      y += 12 + kpis.alertas.length * 6 + 4
    }

    // ── Seção: KPIs por grupo ──────────────────────────────────────────────────
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.setTextColor(...AZUL)
    doc.text("DISTRIBUIÇÃO POR GRUPO", ml, y + 5)
    doc.setFillColor(...GOLD)
    doc.rect(ml, y + 7, 30, 0.8, "F")
    y += 12

    // Grade 3 colunas
    const cardW = (cw - 8) / 3
    const cardH = 16
    grupos.forEach((grupo, i) => {
      const col = i % 3
      const row = Math.floor(i / 3)
      const cx = ml + col * (cardW + 4)
      const cy = y + row * (cardH + 4)

      // Fundo do card
      doc.setFillColor(248, 250, 252)
      doc.roundedRect(cx, cy, cardW, cardH, 1.5, 1.5, "F")

      // Borda esquerda colorida
      const hex = corDoGrupo(grupo, i)
      const r = parseInt(hex.slice(1,3),16)
      const g = parseInt(hex.slice(3,5),16)
      const b = parseInt(hex.slice(5,7),16)
      doc.setFillColor(r, g, b)
      doc.rect(cx, cy, 2, cardH, "F")

      // Número grande
      doc.setFont("helvetica", "bold")
      doc.setFontSize(14)
      doc.setTextColor(r, g, b)
      doc.text(String(contagemAtual[grupo] || 0), cx + 6, cy + 9)

      // Nome do grupo
      doc.setFont("helvetica", "bold")
      doc.setFontSize(6)
      doc.setTextColor(...AZUL)
      const nomeCorto = grupo.length > 16 ? grupo.slice(0, 14) + "..." : grupo
      doc.text(nomeCorto, cx + 6, cy + 13)

      // Variação
      if (variacoes[grupo] != null) {
        const v = variacoes[grupo]
        doc.setFont("helvetica", "normal")
        doc.setFontSize(5.5)
        doc.setTextColor(v > 0 ? 220 : 22, v > 0 ? 38 : 163, v > 0 ? 38 : 74)
        doc.text(`${v > 0 ? "▲" : "▼"} ${Math.abs(v).toFixed(1)}%`, cx + cardW - 14, cy + 13)
      }
    })

    const linhasKpi = Math.ceil(grupos.length / 3)
    y += linhasKpi * (cardH + 4) + 8

    // ── Seção: Detalhamento por unidade ───────────────────────────────────────
    // Verifica se cabe na página, senão adiciona nova
    if (y > 220) { doc.addPage(); y = 18 }

    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.setTextColor(...AZUL)
    doc.text("DETALHAMENTO POR UNIDADE", ml, y + 5)
    doc.setFillColor(...GOLD)
    doc.rect(ml, y + 7, 40, 0.8, "F")
    y += 14

    Object.entries(porUnidade).forEach(([unidade, pavilhoes]) => {
      if (y > 255) { doc.addPage(); y = 18 }

      // Header da unidade
      doc.setFillColor(...AZUL)
      doc.roundedRect(ml, y, cw, 8, 1, 1, "F")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(7.5)
      doc.setTextColor(...BRANCO)
      doc.text(unidade, ml + 4, y + 5.5)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(6.5)
      doc.text(`${pavilhoes.length} pavilhões`, W - mr - 4, y + 5.5, { align: "right" })
      y += 10

      // Pavilhões em grade 2 colunas
      pavilhoes.forEach((pav, i) => {
        const col = i % 2
        const px = ml + col * (cw / 2 + 2)
        const py = y + Math.floor(i / 2) * 8

        if (py > 265) return

        const hex = corDoGrupo(pav.grupo, i)
        const r = parseInt(hex.slice(1,3),16)
        const g = parseInt(hex.slice(3,5),16)
        const b = parseInt(hex.slice(5,7),16)

        // Fundo branco com borda colorida
        doc.setFillColor(255, 255, 255)
        doc.setDrawColor(r, g, b)
        doc.roundedRect(px, py, cw/2 - 2, 7, 1, 1, "FD")

        // Barra colorida esquerda
        doc.setFillColor(r, g, b)
        doc.rect(px, py, 2, 7, "F")

        // Label do pavilhão
        doc.setFont("helvetica", "normal")
        doc.setFontSize(6)
        doc.setTextColor(15, 23, 42)
        const labelCorto = pav.label.length > 22 ? pav.label.slice(0,20)+"..." : pav.label
        doc.text(labelCorto, px + 5, py + 3.2)

        // Grupo
        doc.setFont("helvetica", "bold")
        doc.setFontSize(5.5)
        doc.setTextColor(r, g, b)
        doc.text(pav.grupo, px + 5, py + 6)
      })

      y += Math.ceil(pavilhoes.length / 2) * 8 + 6
    })

    // ── Rodapé ────────────────────────────────────────────────────────────────
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

    const nomeMes = formatarMes(mesSelecionado).replace(" ", "-")
    doc.save(`inteligencia-grupos-${nomeMes}.pdf`)
  }
  // ─────────────────────────────────────────────────────────────────────────────

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
      const r = await fetch(`${API}/snapshot/forcar`, { method: "POST" })
      const data = await r.json()
      if (data.ok) {
        // Recarrega índice e snapshot
        const indice = await fetch(`${API}/historico/indice`).then(r => r.json())
        const lista = (indice.meses || []).sort().reverse()
        setMeses(lista)
        setMesSelecionado(lista[0])
        setSnapshots({}) // limpa cache para forçar reload
        const kpisData = await fetch(`${API}/kpis`).then(r => r.json())
        setKpis(kpisData)
      }
    } catch {}
    finally { setLoading(false) }
  }

  const totalGrupos = grupos.length
  const totalPavilhoes = Object.values(contagemAtual).reduce((a, b) => a + b, 0)
  const alertasAtivos = kpis?.alertas?.length || 0

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100vh",
      background: "#F8FAFC", fontFamily: SANS, overflow: "hidden",
    }}>

      {/* ── Topbar ── */}
      <div style={{
        height: 52, background: "#FFFFFF", borderBottom: "1px solid #E2E8F0",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", flexShrink: 0, boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => onNavigate("Controle de Grupos")}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              fontSize: 18, color: "#64748B", lineHeight: 1,
            }}
          >←</button>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A", letterSpacing: "0.02em" }}>
              Inteligência de Grupos
            </div>
            <div style={{ fontSize: 9, color: "#94A3B8", fontFamily: MONO, marginTop: 1 }}>
              Histórico mensal · Drive sincronizado
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Navegação por mês */}
          <div style={{
            display: "flex", alignItems: "center", gap: 0,
            background: "#F1F5F9", borderRadius: 8, overflow: "hidden",
            border: "1px solid #E2E8F0",
          }}>
            <button
              onClick={() => podePrev && setMesSelecionado(meses[idxMes + 1])}
              disabled={!podePrev}
              style={{
                background: "transparent", border: "none", cursor: podePrev ? "pointer" : "not-allowed",
                padding: "6px 10px", fontSize: 14, color: podePrev ? "#0F172A" : "#CBD5E1",
              }}
            >‹</button>
            <div style={{
              padding: "4px 12px", fontSize: 11, fontWeight: 700,
              color: "#0F172A", fontFamily: MONO, minWidth: 80, textAlign: "center",
            }}>
              {formatarMes(mesSelecionado)}
            </div>
            <button
              onClick={() => podeProx && setMesSelecionado(meses[idxMes - 1])}
              disabled={!podeProx}
              style={{
                background: "transparent", border: "none", cursor: podeProx ? "pointer" : "not-allowed",
                padding: "6px 10px", fontSize: 14, color: podeProx ? "#0F172A" : "#CBD5E1",
              }}
            >›</button>
          </div>

          <button
            onClick={exportarPDF}
            disabled={grupos.length === 0}
            style={{
              background: grupos.length === 0 ? "#F1F5F9" : "#B45309",
              color: grupos.length === 0 ? "#94A3B8" : "#FFFFFF",
              border: "none", borderRadius: 7, padding: "6px 14px",
              fontSize: 10, fontWeight: 700,
              cursor: grupos.length === 0 ? "not-allowed" : "pointer",
              fontFamily: MONO, letterSpacing: "0.05em",
            }}
          >
            ↓ EXPORTAR PDF
          </button>

          <button
            onClick={forcarSnapshot}
            disabled={loading}
            style={{
              background: "#0F172A", color: "#FFFFFF", border: "none",
              borderRadius: 7, padding: "6px 14px", fontSize: 10,
              fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
              fontFamily: MONO, letterSpacing: "0.05em",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "AGUARDE..." : "↻ ATUALIZAR"}
          </button>
        </div>
      </div>

      {/* ── Erro ── */}
      {erro && (
        <div style={{
          margin: "12px 20px 0", padding: "8px 14px",
          background: "#FEF2F2", border: "1px solid #FECACA",
          borderRadius: 7, fontSize: 11, color: "#DC2626",
        }}>
          ⚠ {erro}
        </div>
      )}

      {/* ── Resumo rápido (3 chips) ── */}
      <div style={{
        display: "flex", gap: 10, padding: "12px 20px 0", flexShrink: 0,
      }}>
        {[
          { label: "Grupos distintos", valor: totalGrupos, cor: "#1D4ED8" },
          { label: "Pavilhões mapeados", valor: totalPavilhoes, cor: "#065F46" },
          { label: "Alertas de variação", valor: alertasAtivos, cor: alertasAtivos > 0 ? "#DC2626" : "#64748B" },
        ].map(({ label, valor, cor }) => (
          <div key={label} style={{
            background: "#FFFFFF", border: `1px solid ${cor}25`,
            borderRadius: 8, padding: "8px 16px",
            display: "flex", alignItems: "center", gap: 10,
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: cor, fontFamily: MONO, lineHeight: 1 }}>
              {loading ? "—" : valor}
            </div>
            <div style={{ fontSize: 9, color: "#64748B", fontFamily: MONO, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {label}
            </div>
          </div>
        ))}

        {/* Alertas de variação */}
        {kpis?.alertas?.length > 0 && (
          <div style={{
            flex: 1, background: "#FEF2F2", border: "1px solid #FECACA",
            borderRadius: 8, padding: "8px 14px",
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: "#DC2626", fontFamily: MONO }}>⚠ VARIAÇÕES</span>
            {kpis.alertas.map((a, i) => (
              <span key={i} style={{
                fontSize: 9, fontFamily: MONO, color: "#7F1D1D",
                background: "#FECACA", padding: "2px 7px", borderRadius: 4,
              }}>
                {a.grupo} {a.variacao > 0 ? "▲" : "▼"}{Math.abs(a.variacao)}%
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Abas ── */}
      <div style={{
        display: "flex", gap: 0, padding: "12px 20px 0", flexShrink: 0,
        borderBottom: "1px solid #E2E8F0", marginTop: 8,
      }}>
        {[
          { id: "kpis", label: "KPIs por Grupo" },
          { id: "evolucao", label: "Evolução Histórica" },
          { id: "unidades", label: "Detalhamento por Unidade" },
        ].map(aba => (
          <button
            key={aba.id}
            onClick={() => setAbaAtiva(aba.id)}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              padding: "8px 16px", fontSize: 11, fontWeight: abaAtiva === aba.id ? 700 : 500,
              color: abaAtiva === aba.id ? "#0F172A" : "#64748B",
              borderBottom: abaAtiva === aba.id ? "2px solid #B45309" : "2px solid transparent",
              marginBottom: -1, transition: "all 0.15s",
            }}
          >
            {aba.label}
          </button>
        ))}
      </div>

      {/* ── Conteúdo das abas ── */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>

        {/* ABA: KPIs por grupo */}
        {abaAtiva === "kpis" && (
          loading ? (
            <div style={{ textAlign: "center", color: "#94A3B8", fontFamily: MONO, fontSize: 11, paddingTop: 40 }}>
              Carregando dados...
            </div>
          ) : grupos.length === 0 ? (
            <div style={{ textAlign: "center", color: "#94A3B8", fontFamily: MONO, fontSize: 11, paddingTop: 40 }}>
              Nenhum dado disponível para {formatarMes(mesSelecionado)}
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 10,
            }}>
              {grupos.map((grupo, i) => (
                <KpiCard
                  key={grupo}
                  grupo={grupo}
                  qtd={contagemAtual[grupo]}
                  variacao={variacoes[grupo] ?? null}
                  cor={corDoGrupo(grupo, i)}
                  index={i}
                />
              ))}
            </div>
          )
        )}

        {/* ABA: Evolução histórica */}
        {abaAtiva === "evolucao" && (
          <div style={{
            background: "#FFFFFF", border: "1px solid #E2E8F0",
            borderRadius: 10, padding: "20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>
              Distribuição por grupo — {formatarMes(mesSelecionado)}
            </div>
            <div style={{ fontSize: 9, color: "#94A3B8", fontFamily: MONO, marginBottom: 16 }}>
              Quantidade de pavilhões controlados por cada grupo
            </div>
            {kpis?.series ? (
              <GraficoBarras
                series={kpis.series}
                mesSelecionado={mesSelecionado}
                grupos={grupos.length > 0 ? grupos : Object.keys(kpis.series[mesSelecionado] || {})}
              />
            ) : (
              <div style={{ color: "#94A3B8", fontFamily: MONO, fontSize: 11 }}>
                Sem dados históricos suficientes.
              </div>
            )}

            {/* Mini linha do tempo */}
            {kpis?.meses?.length > 1 && (
              <div style={{ marginTop: 24, borderTop: "1px solid #F1F5F9", paddingTop: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#334155", marginBottom: 10 }}>
                  Meses disponíveis no histórico
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[...kpis.meses].sort().reverse().map(mes => (
                    <button
                      key={mes}
                      onClick={() => setMesSelecionado(mes)}
                      style={{
                        padding: "4px 12px", borderRadius: 6, fontSize: 10,
                        fontFamily: MONO, fontWeight: 700, cursor: "pointer",
                        border: "1px solid",
                        borderColor: mes === mesSelecionado ? "#B45309" : "#E2E8F0",
                        background: mes === mesSelecionado ? "#FEF3C7" : "#F8FAFC",
                        color: mes === mesSelecionado ? "#92400E" : "#64748B",
                      }}
                    >
                      {formatarMes(mes)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ABA: Detalhamento por unidade */}
        {abaAtiva === "unidades" && (
          Object.keys(porUnidade).length === 0 ? (
            <div style={{ textAlign: "center", color: "#94A3B8", fontFamily: MONO, fontSize: 11, paddingTop: 40 }}>
              Nenhum dado disponível para {formatarMes(mesSelecionado)}
            </div>
          ) : (
            <TabelaUnidades porUnidade={porUnidade} />
          )
        )}

      </div>
    </div>
  )
}
