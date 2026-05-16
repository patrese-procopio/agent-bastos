import { useState, useEffect } from "react"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
const MES_ATUAL = new Date().getMonth()
const ANO_ATUAL = new Date().getFullYear()

const NUCLEOS = {
  NI:            { label: "Nucleo de Inteligencia",        short: "NI",     color: "#60A5FA", docs: ["RELINT","REPEN","PEDIDO DE BUSCA","MINUTA DE OFICIO","PROJETO"] },
  NCI:           { label: "Nucleo de Contrainteligencia",  short: "NCI",    color: "#A78BFA", docs: ["RELINT","PEDIDO DE BUSCA","RELTEC","MINUTA DE OFICIO","PROJETO"] },
  NBE:           { label: "Nucleo de Busca Eletronica",    short: "NBE",    color: "#34D399", docs: ["RELINT","RELTEC","PROJETO"] },
  NUCADI_UPP:    { label: "NUCADI-UPP",    short: "UPP",    color: "#E8A020", docs: ["RELATORIO INTERNO"] },
  NUCADI_COMPAJ: { label: "NUCADI-COMPAJ", short: "COMPAJ", color: "#C2410C", docs: ["RELATORIO INTERNO"] },
  NUCADI_IPAT:   { label: "NUCADI-IPAT",   short: "IPAT",   color: "#0369A1", docs: ["RELATORIO INTERNO"] },
  NUCADI_CDPM1:  { label: "NUCADI-CDPM1",  short: "CDPM1",  color: "#7C3AED", docs: ["RELATORIO INTERNO"] },
  NUCADI_CDPMII: { label: "NUCADI-CDPMII", short: "CDPMII", color: "#BE185D", docs: ["RELATORIO INTERNO"] },
  NUCADI_CDF:    { label: "NUCADI-CDF",    short: "CDF",    color: "#0F766E", docs: ["RELATORIO INTERNO"] },
}

function gerarDados() {
  const data = {}
  Object.keys(NUCLEOS).forEach(n => {
    data[n] = {}
    MESES.forEach((_, m) => {
      data[n][m] = {}
      NUCLEOS[n].docs.forEach(doc => {
        const base = n.startsWith("NUCADI") ? 8 : 12
        data[n][m][doc] = Math.floor(Math.random() * base) + 2
      })
    })
  })
  return data
}

let DADOS = gerarDados()

function totalNucleoMes(n, m) {
  return Object.values(DADOS[n][m]).reduce((a, b) => a + b, 0)
}
function totalNucleoAno(n) {
  return MESES.reduce((s, _, m) => s + totalNucleoMes(n, m), 0)
}
function totalDocMes(doc, m) {
  return Object.keys(NUCLEOS)
    .filter(n => NUCLEOS[n].docs.includes(doc))
    .reduce((s, n) => s + (DADOS[n][m][doc] || 0), 0)
}
function totalAgenciaMes(m) {
  return Object.keys(NUCLEOS).reduce((s, n) => s + totalNucleoMes(n, m), 0)
}

function Sparkline({ values, color, width, height }) {
  const w = width || 80
  const h = height || 24
  if (!values || values.length < 2) return null
  const max = Math.max(...values, 1)
  const min = Math.min(...values)
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = h - ((v - min) / (max - min + 1)) * (h - 4) - 2
    return x + "," + y
  }).join(" ")
  const last = pts.split(" ").at(-1).split(",")
  return (
    <svg width={w} height={h} viewBox={"0 0 " + w + " " + h} style={{ flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8"/>
      <circle cx={parseFloat(last[0])} cy={parseFloat(last[1])} r="2.5" fill={color}/>
    </svg>
  )
}

function BarraH({ valor, max, color }) {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0
  return (
    <div style={{ height: 5, background: "#1A2236", borderRadius: 3, overflow: "hidden", flex: 1 }}>
      <div style={{ height: "100%", width: pct + "%", background: color, borderRadius: 3, transition: "width 0.5s ease" }}/>
    </div>
  )
}

function Seta({ subiu }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 3,
      padding: "2px 7px", borderRadius: 20,
      background: subiu ? "#F0FDF4" : "#FEF2F2",
      border: "1px solid " + (subiu ? "#86EFAC" : "#FECACA"),
    }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
        stroke={subiu ? "#16A34A" : "#DC2626"} strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round">
        {subiu
          ? <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>
          : <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>
        }
      </svg>
      <span style={{ fontSize: 16.9, fontWeight: 700, color: subiu ? "#16A34A" : "#DC2626", fontFamily: MONO }}>
        {"{pct}"}
      </span>
    </div>
  )
}

function GraficoBarras({ nucleos, mes }) {
  const maxVal = Math.max(...nucleos.map(n => totalNucleoMes(n, mes)), 1)
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100, padding: "0 4px" }}>
      {nucleos.map(n => {
        const val = totalNucleoMes(n, mes)
        const h = Math.max((val / maxVal) * 88, 4)
        return (
          <div key={n} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 8, color: "#64748B", fontFamily: MONO, fontWeight: 600 }}>{val}</span>
            <div style={{ width: "100%", height: h, background: NUCLEOS[n].color, borderRadius: "3px 3px 0 0", opacity: 0.85 }}/>
            <span style={{ fontSize: 7, color: "#94A3B8", fontFamily: MONO, textAlign: "center", lineHeight: 1.2 }}>{NUCLEOS[n].short}</span>
          </div>
        )
      })}
    </div>
  )
}

function GraficoLinha({ nucleo, cor }) {
  const valores = MESES.map((_, m) => totalNucleoMes(nucleo, m))
  const max = Math.max(...valores, 1)
  const w = 320, h = 70
  const pts = valores.map((v, i) => {
    const x = (i / (MESES.length - 1)) * (w - 20) + 10
    const y = h - (v / max) * (h - 10) - 5
    return x + "," + y
  }).join(" ")
  return (
    <svg width={w} height={h} viewBox={"0 0 " + w + " " + h} style={{ width: "100%" }}>
      {[0.25, 0.5, 0.75, 1].map((f, i) => (
        <line key={i} x1="10" y1={h - f * (h - 10) - 5} x2={w - 10} y2={h - f * (h - 10) - 5} stroke="#1A2236" strokeWidth="1"/>
      ))}
      <polyline points={pts} fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {valores.map((v, i) => {
        const x = (i / (MESES.length - 1)) * (w - 20) + 10
        const y = h - (v / max) * (h - 10) - 5
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={i === MES_ATUAL ? 4 : 3} fill={i === MES_ATUAL ? cor : "#111827"} stroke={cor} strokeWidth="1.5"/>
            {i === MES_ATUAL && <circle cx={x} cy={y} r="7" fill="none" stroke={cor} strokeWidth="1" opacity="0.4"/>}
          </g>
        )
      })}
      {MESES.map((m, i) => (
        <text key={i} x={(i / (MESES.length - 1)) * (w - 20) + 10} y={h + 12}
          textAnchor="middle" fontSize="7" fill={i === MES_ATUAL ? cor : "#94A3B8"}
          fontFamily={MONO} fontWeight={i === MES_ATUAL ? "700" : "400"}>{m}</text>
      ))}
    </svg>
  )
}

export default function Dashboard({ onNavigate }) {
  const [mesSel, setMesSel] = useState(MES_ATUAL)
  const [nucleoSel, setNucleoSel] = useState("NI")
  const [aba, setAba] = useState("geral")
  const [gerando, setGerando] = useState(false)
  const [modalRelatorio, setModalRelatorio] = useState(null)
  const [dadosReais, setDadosReais] = useState(false)
  const [formDoc, setFormDoc] = useState({nome_arquivo:"",tipo_codigo:"RELINT",nucleo_sigla:"NI",unidade_sigla:"",ano:2026,mes:MES_ATUAL+1,observacao:""})
  const [salvando, setSalvando] = useState(false)
  const [msgLanc, setMsgLanc] = useState("")
  useEffect(() => {
    fetch("http://127.0.0.1:8000/dashboard/stats")
      .then(r => r.json())
      .then(d => { if (d && Object.keys(d).length > 0) { DADOS = d; setDadosReais(true) } })
      .catch(() => {})
  }, [])

  const totalMesAtual = totalAgenciaMes(mesSel)
  const totalMesAnterior = totalAgenciaMes(mesSel > 0 ? mesSel - 1 : 11)
  const variacaoMes = totalMesAnterior > 0 ? Math.round(((totalMesAtual - totalMesAnterior) / totalMesAnterior) * 100) : 0
  const totalAno = MESES.reduce((s, _, m) => s + totalAgenciaMes(m), 0)
  const totalNucleosMes = Object.keys(NUCLEOS).map(n => ({ nucleo: n, total: totalNucleoMes(n, mesSel) })).sort((a, b) => b.total - a.total)
  const maxNucleo = Math.max(...totalNucleosMes.map(x => x.total), 1)

  async function gerarRelatorio() {
    setGerando(true)
    setModalRelatorio(null)
    const dadosPayload = {
      totalMes: totalMesAtual,
      totalAno,
      variacao: variacaoMes,
      rankingNucleos: Object.keys(NUCLEOS).map(n => ({
        nucleo: NUCLEOS[n].label,
        short: NUCLEOS[n].short,
        totalMes: totalNucleoMes(n, mesSel),
        totalAno: totalNucleoAno(n),
      })),
      tiposDocumento: ["RELINT","RELTEC","REPEN","PEDIDO DE BUSCA","RELATORIO INTERNO","MINUTA DE OFICIO","PROJETO"].map(doc => ({
        documento: doc,
        totalMes: totalDocMes(doc, mesSel),
        totalAno: MESES.reduce((s, _, m) => s + totalDocMes(doc, m), 0)
      }))
    }
    try {
      const res = await fetch("http://127.0.0.1:8000/relatorio-dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mes: MESES[mesSel], ano: ANO_ATUAL, dados: dadosPayload })
      })
      const data = await res.json()
      setModalRelatorio(data.analise)
    } catch {
      setModalRelatorio("FALHA: sem conexao com o backend.")
    } finally {
      setGerando(false)
    }
  }

  function exportarTxt() {
    if (!modalRelatorio) return
    const agora = new Date().toLocaleString("pt-BR")
    const linhas = [
      "AGENT BASTOS - RELATORIO ANALITICO DE PRODUCAO",
      "=".repeat(60),
      "Mes: " + MESES[mesSel] + "/" + ANO_ATUAL,
      "Gerado em: " + agora,
      "Analista: BASTOS-UNIT",
      "=".repeat(60),
      "",
      modalRelatorio,
    ]
    const blob = new Blob([linhas.join("\n")], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "relatorio_" + MESES[mesSel].toLowerCase() + "_" + ANO_ATUAL + ".txt"
    a.click()
    URL.revokeObjectURL(url)
  }

  const corNucleo = NUCLEOS[nucleoSel].color
  const mesNucleo = totalNucleoMes(nucleoSel, mesSel)
  const mesNucleoAnt = totalNucleoMes(nucleoSel, mesSel > 0 ? mesSel - 1 : 11)
  const varNucleo = mesNucleoAnt > 0 ? Math.round(((mesNucleo - mesNucleoAnt) / mesNucleoAnt) * 100) : 0

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, height: "100%", overflow: "hidden", background: "#0B1120" }}>

      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "#111827", flexShrink: 0, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 16.9, fontWeight: 700, color: "#F1F5F9" }}>Dashboard de Producao</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 9, color: "#64748B", fontFamily: MONO }}>Agencia de Inteligencia · {ANO_ATUAL}</span>
            {!dadosReais && <span style={{ fontSize: 8, fontWeight: 700, fontFamily: MONO, padding: "1px 6px", borderRadius: 4, background: "rgba(232,160,32,0.12)", color: "#E8A020", border: "1px solid #FDE68A" }}>SIMULADO</span>}
            <span style={{ fontSize: 8, fontWeight: 700, fontFamily: MONO, padding: "1px 6px", borderRadius: 4, background: dadosReais ? "#F0FDF4" : "#FEF2F2", color: dadosReais ? "#16A34A" : "#DC2626", border: "1px solid " + (dadosReais ? "#86EFAC" : "#FECACA") }}>{dadosReais ? "AO VIVO" : "OFFLINE"}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 16.9, color: "#64748B", fontFamily: MONO }}>Mes:</span>
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {MESES.map((m, i) => (
              <button key={i} onClick={() => setMesSel(i)} style={{
                padding: "3px 7px", borderRadius: 5, border: "1px solid",
                fontSize: 9, fontFamily: MONO, cursor: "pointer",
                background: mesSel === i ? "#0F172A" : "#111827",
                color: mesSel === i ? "#111827" : "#64748B",
                borderColor: mesSel === i ? "#0F172A" : "#E2E8F0",
                fontWeight: mesSel === i ? 700 : 400,
              }}>{m}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ABAS + BOTAO BAIXAR PDF */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 20px", background: "#111827", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 4 }}>
        {[["geral","Visao Geral"],["nucleo","Por Nucleo"],["documentos","Por Documento"],["lancamento","+ Lancamento"]].map(([id, label]) => (
            <button key={id} onClick={() => setAba(id)} style={{
              padding: "5px 14px", borderRadius: 6, border: "1px solid",
              fontSize: 14.3, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit",
              background: aba === id ? "#0F172A" : "transparent",
              color: aba === id ? "#111827" : "#64748B",
              borderColor: aba === id ? "#0F172A" : "transparent",
            }}>{label}</button>
          ))}
        </div>
        <button
          onClick={gerarRelatorio}
          disabled={gerando}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 14px", borderRadius: 7,
            background: gerando ? "#1A2236" : "linear-gradient(135deg, #0F172A, #1E293B)",
            color: gerando ? "#94A3B8" : "#111827",
            border: gerando ? "1px solid rgba(255,255,255,0.07)" : "none",
            cursor: gerando ? "not-allowed" : "pointer",
            fontSize: 14.3, fontWeight: 700, fontFamily: "inherit",
            boxShadow: gerando ? "none" : "0 3px 10px rgba(15,23,42,0.25)",
          }}
        >
          {gerando ? (
            <span style={{ fontFamily: MONO }}>Gerando...</span>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              BAIXAR PDF
            </>
          )}
        </button>
      </div>

      {/* CONTEUDO */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>

        {/* ABA GERAL */}
        {aba === "geral" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
              <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderTop: "3px solid " + (variacaoMes >= 0 ? "#16A34A" : "#DC2626"), borderRadius: 10, padding: "14px 16px", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#64748B", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: MONO, marginBottom: 6 }}>Total {MESES[mesSel]}</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: "#F1F5F9", lineHeight: 1, fontFamily: MONO }}>{totalMesAtual}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 4, padding: "2px 7px", borderRadius: 20, background: variacaoMes >= 0 ? "#F0FDF4" : "#FEF2F2", border: "1px solid " + (variacaoMes >= 0 ? "#86EFAC" : "#FECACA") }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={variacaoMes >= 0 ? "#16A34A" : "#DC2626"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      {variacaoMes >= 0 ? <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></> : <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>}
                    </svg>
                    <span style={{ fontSize: 16.9, fontWeight: 700, color: variacaoMes >= 0 ? "#16A34A" : "#DC2626", fontFamily: MONO }}>{Math.abs(variacaoMes)}%</span>
                  </div>
                </div>
                <div style={{ fontSize: 16.9, color: "#94A3B8", marginTop: 5, fontFamily: MONO }}>vs {MESES[mesSel > 0 ? mesSel - 1 : 11]}</div>
              </div>

              <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderTop: "3px solid #1D4ED8", borderRadius: 10, padding: "14px 16px", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#64748B", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: MONO, marginBottom: 6 }}>Total Anual {ANO_ATUAL}</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: "#F1F5F9", lineHeight: 1, fontFamily: MONO }}>{totalAno}</div>
                <div style={{ fontSize: 16.9, color: "#60A5FA", marginTop: 5, fontFamily: MONO, fontWeight: 600 }}>todos os nucleos</div>
              </div>

              <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderTop: "3px solid #6D28D9", borderRadius: 10, padding: "14px 16px", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#64748B", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: MONO, marginBottom: 6 }}>Nucleos Ativos</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: "#F1F5F9", lineHeight: 1, fontFamily: MONO }}>{Object.keys(NUCLEOS).length}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 9, background: "rgba(167,139,250,0.12)", color: "#A78BFA", padding: "2px 7px", borderRadius: 10, fontWeight: 700, fontFamily: MONO }}>3 Nucleos</span>
                  <span style={{ fontSize: 9, background: "rgba(232,160,32,0.12)", color: "#E8A020", padding: "2px 7px", borderRadius: 10, fontWeight: 700, fontFamily: MONO }}>6 NUCADIs</span>
                </div>
              </div>

              <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderTop: "3px solid #B45309", borderRadius: 10, padding: "14px 16px", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#64748B", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: MONO, marginBottom: 6 }}>Media Mensal</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: "#F1F5F9", lineHeight: 1, fontFamily: MONO }}>{Math.round(totalAno / 12)}</div>
                <div style={{ fontSize: 16.9, color: "#E8A020", marginTop: 5, fontFamily: MONO, fontWeight: 600 }}>docs/mes agencia</div>
              </div>
            </div>

            {/* Ranking + Barras */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "14px 16px", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: 16.9, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Ranking — {MESES[mesSel]}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {totalNucleosMes.map(({ nucleo, total }, i) => (
                    <div key={nucleo} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", fontFamily: MONO, width: 14, textAlign: "right" }}>#{i+1}</span>
                      <span style={{ fontSize: 16.9, color: "#F1F5F9", width: 60, flexShrink: 0, fontWeight: i === 0 ? 700 : 400 }}>{NUCLEOS[nucleo].short}</span>
                      <BarraH valor={total} max={maxNucleo} color={NUCLEOS[nucleo].color}/>
                      <span style={{ fontSize: 16.9, fontWeight: 700, color: NUCLEOS[nucleo].color, fontFamily: MONO, width: 24, textAlign: "right" }}>{total}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "14px 16px", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: 16.9, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Comparativo — {MESES[mesSel]}</div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 9, color: "#94A3B8", fontFamily: MONO, marginBottom: 4 }}>NUCLEOS PRINCIPAIS</div>
                  <GraficoBarras nucleos={["NI","NCI","NBE"]} mes={mesSel}/>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "#94A3B8", fontFamily: MONO, marginBottom: 4 }}>NUCADIs</div>
                  <GraficoBarras nucleos={["NUCADI_UPP","NUCADI_COMPAJ","NUCADI_IPAT","NUCADI_CDPM1","NUCADI_CDPMII","NUCADI_CDF"]} mes={mesSel}/>
                </div>
              </div>
            </div>

            {/* Evolucao anual */}
            <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "14px 16px", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 16.9, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.1em", textTransform: "uppercase" }}>Evolucao Anual — {ANO_ATUAL}</div>
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 10, height: 3, background: "#0F172A", borderRadius: 2 }}/>
                    <span style={{ fontSize: 9, color: "#64748B", fontFamily: MONO }}>Mes atual</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 10, height: 2, background: "#CBD5E1", borderRadius: 2 }}/>
                    <span style={{ fontSize: 9, color: "#64748B", fontFamily: MONO }}>Media: {Math.round(totalAno/12)}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80, padding: "0 4px" }}>
                {MESES.map((m, i) => {
                  const val = totalAgenciaMes(i)
                  const max = Math.max(...MESES.map((_, mm) => totalAgenciaMes(mm)), 1)
                  const h = Math.max((val / max) * 68, 4)
                  const isFuture = i > MES_ATUAL
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <span style={{ fontSize: 7, color: i === mesSel ? "#0F172A" : "#94A3B8", fontFamily: MONO, fontWeight: i === mesSel ? 700 : 400 }}>{val}</span>
                      <div style={{ width: "100%", height: h, background: i === mesSel ? "#0F172A" : isFuture ? "#1A2236" : "#CBD5E1", borderRadius: "3px 3px 0 0" }}/>
                      <span style={{ fontSize: 7, color: i === mesSel ? "#0F172A" : "#94A3B8", fontFamily: MONO, fontWeight: i === mesSel ? 700 : 400 }}>{m}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ABA POR NUCLEO */}
        {aba === "nucleo" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.keys(NUCLEOS).map(n => (
                <button key={n} onClick={() => setNucleoSel(n)} style={{
                  padding: "5px 10px", borderRadius: 6, border: "1px solid",
                  fontSize: 16.9, fontFamily: MONO, cursor: "pointer", fontWeight: 600,
                  background: nucleoSel === n ? NUCLEOS[n].color : "#111827",
                  color: nucleoSel === n ? "#111827" : NUCLEOS[n].color,
                  borderColor: NUCLEOS[n].color + (nucleoSel === n ? "" : "50"),
                }}>{NUCLEOS[n].short}</button>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {[
                { label: "Total " + MESES[mesSel], valor: mesNucleo, tendencia: true },
                { label: "Total Anual", valor: totalNucleoAno(nucleoSel), tendencia: false },
                { label: "Media Mensal", valor: Math.round(totalNucleoAno(nucleoSel) / 12), tendencia: false },
              ].map((k, i) => (
                <div key={i} style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderTop: "3px solid " + corNucleo, borderRadius: 10, padding: "14px 16px", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#64748B", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: MONO, marginBottom: 6 }}>{k.label}</div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: corNucleo, lineHeight: 1, fontFamily: MONO }}>{k.valor}</div>
                    {k.tendencia && (
                      <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 4, padding: "2px 7px", borderRadius: 20, background: varNucleo >= 0 ? "#F0FDF4" : "#FEF2F2", border: "1px solid " + (varNucleo >= 0 ? "#86EFAC" : "#FECACA") }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={varNucleo >= 0 ? "#16A34A" : "#DC2626"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          {varNucleo >= 0 ? <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></> : <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>}
                        </svg>
                        <span style={{ fontSize: 16.9, fontWeight: 700, color: varNucleo >= 0 ? "#16A34A" : "#DC2626", fontFamily: MONO }}>{Math.abs(varNucleo)}%</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "14px 16px", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: 16.9, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{NUCLEOS[nucleoSel].short} — Docs em {MESES[mesSel]}</div>
                {NUCLEOS[nucleoSel].docs.map(doc => {
                  const val = DADOS[nucleoSel][mesSel][doc] || 0
                  const maxDoc = Math.max(...NUCLEOS[nucleoSel].docs.map(d => DADOS[nucleoSel][mesSel][d] || 0), 1)
                  return (
                    <div key={doc} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 16.9, color: "#94A3B8", minWidth: 130, fontWeight: 500 }}>{doc}</span>
                      <BarraH valor={val} max={maxDoc} color={corNucleo}/>
                      <span style={{ fontSize: 16.9, fontWeight: 700, color: corNucleo, fontFamily: MONO, width: 20, textAlign: "right" }}>{val}</span>
                    </div>
                  )
                })}
              </div>

              <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "14px 16px", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: 16.9, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Evolucao Anual — {NUCLEOS[nucleoSel].short}</div>
                <div style={{ marginBottom: 16 }}>
                  <GraficoLinha nucleo={nucleoSel} cor={corNucleo}/>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {NUCLEOS[nucleoSel].docs.map(doc => {
                    const vals = MESES.map((_, m) => DADOS[nucleoSel][m][doc] || 0)
                    const total = vals.reduce((a, b) => a + b, 0)
                    return (
                      <div key={doc} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 9, color: "#475569", flex: 1, fontWeight: 500 }}>{doc}</span>
                        <Sparkline values={vals} color={corNucleo} width={60} height={20}/>
                        <span style={{ fontSize: 9, fontWeight: 700, color: corNucleo, fontFamily: MONO, width: 28, textAlign: "right" }}>{total}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA POR DOCUMENTO */}
        {aba === "documentos" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {["RELINT","RELTEC","REPEN","PEDIDO DE BUSCA","RELATORIO INTERNO","MINUTA DE OFICIO","PROJETO"].map(doc => {
              const isRI = doc === "RELATORIO INTERNO"
              const nucleosProduzem = Object.keys(NUCLEOS).filter(n => NUCLEOS[n].docs.includes(doc))
              const totalDoc = totalDocMes(doc, mesSel)
              const totalDocAno = MESES.reduce((s, _, m) => s + totalDocMes(doc, m), 0)
              return (
                <div key={doc} style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "14px 16px", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 16.9, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.1em", textTransform: "uppercase" }}>{doc}</div>
                      {isRI && <div style={{ fontSize: 9, color: "#94A3B8", fontFamily: MONO, marginTop: 2 }}>6 NUCADIs · detalhamento por unidade</div>}
                    </div>
                    <div style={{ display: "flex", gap: 16 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 8, color: "#94A3B8", fontFamily: MONO, textTransform: "uppercase" }}>{MESES[mesSel]}</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#F1F5F9", fontFamily: MONO }}>{totalDoc}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 8, color: "#94A3B8", fontFamily: MONO, textTransform: "uppercase" }}>Anual</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#60A5FA", fontFamily: MONO }}>{totalDocAno}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isRI ? "repeat(6,1fr)" : "repeat(auto-fill,minmax(130px,1fr))", gap: 8 }}>
                    {nucleosProduzem.map(n => {
                      const val = DADOS[n][mesSel][doc] || 0
                      const valAno = MESES.reduce((s, _, m) => s + (DADOS[n][m][doc] || 0), 0)
                      const vals12 = MESES.map((_, m) => DADOS[n][m][doc] || 0)
                      return (
                        <div key={n} style={{ padding: "10px 12px", background: "#0B1120", borderRadius: 8, border: "1px solid " + NUCLEOS[n].color + "30", borderTop: "3px solid " + NUCLEOS[n].color }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: NUCLEOS[n].color }}/>
                            <span style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.04em" }}>{NUCLEOS[n].short}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 6 }}>
                            <div>
                              <div style={{ fontSize: 7, color: "#94A3B8", fontFamily: MONO, textTransform: "uppercase" }}>{MESES[mesSel]}</div>
                              <div style={{ fontSize: 20, fontWeight: 800, color: NUCLEOS[n].color, fontFamily: MONO, lineHeight: 1 }}>{val}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 7, color: "#94A3B8", fontFamily: MONO, textTransform: "uppercase" }}>Ano</div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: "#64748B", fontFamily: MONO }}>{valAno}</div>
                            </div>
                          </div>
                          <Sparkline values={vals12} color={NUCLEOS[n].color} width={90} height={18}/>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
{aba === "lancamento" && (
          <div style={{padding:"24px",overflowY:"auto",flex:1}}>
            <div style={{background:"#111827",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:20,maxWidth:480}}>
              <div style={{fontSize:14.3,fontWeight:800,color:"#94A3B8",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:16}}>Registrar Documento</div>
              {msgLanc && <div style={{padding:"8px 12px",borderRadius:6,marginBottom:12,fontSize:14.3,fontWeight:600,background:msgLanc.startsWith("OK")?"#F0FDF4":"#FEF2F2",color:msgLanc.startsWith("OK")?"#16A34A":"#DC2626"}}>{msgLanc}</div>}
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div><div style={{fontSize:13,fontWeight:700,color:"#94A3B8",marginBottom:4}}>TIPO DE DOCUMENTO</div>
                  <select value={formDoc.tipo_codigo} onChange={e=>setFormDoc(p=>({...p,tipo_codigo:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.07)",fontSize:14.3,fontFamily:"inherit"}}>
                    <option value="RELINT">Relatorio de Inteligencia</option>
                    <option value="RELTEC">Relatorio Tecnico</option>
                    <option value="REL_INTERNO">Relatorio Interno</option>
                    <option value="PARECER_REM">Parecer Tecnico de Remicao</option>
                    <option value="PED_BUSCA">Pedido de Busca</option>
                    <option value="MEMORANDO">Memorando</option>
                    <option value="REPEN">REPEN</option>
                  </select></div>
                <div style={{display:"flex",gap:10}}>
                  <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:"#94A3B8",marginBottom:4}}>NUCLEO</div>
                    <select value={formDoc.nucleo_sigla} onChange={e=>setFormDoc(p=>({...p,nucleo_sigla:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.07)",fontSize:14.3,fontFamily:"inherit"}}>
                      <option value="NI">NI</option><option value="NCI">NCI</option><option value="NBE">NBE</option>
                    </select></div>
                  <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:"#94A3B8",marginBottom:4}}>UNIDADE</div>
                    <select value={formDoc.unidade_sigla} onChange={e=>setFormDoc(p=>({...p,unidade_sigla:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.07)",fontSize:14.3,fontFamily:"inherit"}}>
                      <option value="">-- Nenhuma --</option>
                      <option value="UPP">UPP</option><option value="COMPAJ">COMPAJ</option>
                      <option value="IPAT">IPAT</option><option value="CDPM1">CDPM1</option>
                      <option value="CDPM2">CDPM2</option><option value="CDF">CDF</option>
                    </select></div>
                </div>
                <div style={{display:"flex",gap:10}}>
                  <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:"#94A3B8",marginBottom:4}}>MES</div>
                    <select value={formDoc.mes} onChange={e=>setFormDoc(p=>({...p,mes:parseInt(e.target.value)}))} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.07)",fontSize:14.3,fontFamily:"inherit"}}>
                      {["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"].map((m,i)=>(
                        <option key={i} value={i+1}>{m}</option>
                      ))}
                    </select></div>
                  <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:"#94A3B8",marginBottom:4}}>ANO</div>
                    <select value={formDoc.ano} onChange={e=>setFormDoc(p=>({...p,ano:parseInt(e.target.value)}))} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.07)",fontSize:14.3,fontFamily:"inherit"}}>
                      <option value={2025}>2025</option><option value={2026}>2026</option>
                    </select></div>
                </div>
                <div><div style={{fontSize:13,fontWeight:700,color:"#94A3B8",marginBottom:4}}>NOME DO ARQUIVO (opcional)</div>
                  <input value={formDoc.nome_arquivo} onChange={e=>setFormDoc(p=>({...p,nome_arquivo:e.target.value}))} placeholder="Ex: RELINT_NI_001_MAI2026.pdf" style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.07)",fontSize:14.3,fontFamily:"inherit",boxSizing:"border-box"}}/></div>
                <div><div style={{fontSize:13,fontWeight:700,color:"#94A3B8",marginBottom:4}}>OBSERVACAO</div>
                  <input value={formDoc.observacao} onChange={e=>setFormDoc(p=>({...p,observacao:e.target.value}))} placeholder="Opcional" style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.07)",fontSize:14.3,fontFamily:"inherit",boxSizing:"border-box"}}/></div>
                <button disabled={salvando} onClick={async()=>{
                  setSalvando(true); setMsgLanc("")
                  try {
                    const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
                    const nome = formDoc.nome_arquivo || (formDoc.tipo_codigo+"_"+formDoc.nucleo_sigla+"_"+meses[formDoc.mes-1]+"_"+formDoc.ano+".pdf")
                    const res = await fetch("http://127.0.0.1:8000/dashboard/lancar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...formDoc,nome_arquivo:nome})})
                    if(!res.ok) throw new Error(await res.text())
                    setMsgLanc("OK - Documento registrado!")
                    setFormDoc(p=>({...p,nome_arquivo:"",observacao:""}))
                  } catch(e){ setMsgLanc("ERRO: "+e.message) }
                  setSalvando(false)
                }} style={{padding:"10px",borderRadius:7,border:"none",background:"#B45309",color:"#fff",fontWeight:700,fontSize:14.3,cursor:"pointer",textTransform:"uppercase"}}>
                  {salvando ? "Salvando..." : "Registrar Documento"}
                </button>
              </div>
            </div>
          </div>
        )}
      {/* MODAL RELATORIO */}
      {modalRelatorio && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "#111827", borderRadius: 12, width: "100%", maxWidth: 760, maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>Relatorio Analitico — {MESES[mesSel]}/{ANO_ATUAL}</div>
                <div style={{ fontSize: 16.9, color: "#64748B", fontFamily: MONO, marginTop: 2 }}>BASTOS-UNIT · Analise gerada por IA · LLaMA 70b</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={exportarTxt} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, background: "linear-gradient(135deg,#F59E0B,#B45309)", color: "#F1F5F9", border: "none", cursor: "pointer", fontSize: 14.3, fontWeight: 700, boxShadow: "0 4px 12px rgba(180,83,9,0.3)" }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Exportar
                </button>
                <button onClick={() => setModalRelatorio(null)} style={{ padding: "6px 12px", borderRadius: 7, background: "#1A2236", border: "1px solid rgba(255,255,255,0.07)", cursor: "pointer", fontSize: 14.3, color: "#475569", fontWeight: 600 }}>Fechar</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
              <div style={{ fontSize: 16.9, color: "#F1F5F9", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{modalRelatorio}</div>
            </div>
            <div style={{ padding: "10px 20px", borderTop: "1px solid rgba(255,255,255,0.07)", background: "#0B1120", flexShrink: 0, borderRadius: "0 0 12px 12px" }}>
              <div style={{ fontSize: 9, color: "#94A3B8", fontFamily: MONO, textAlign: "center" }}>
                Agent Bastos · Sistema de Inteligencia e Seguranca Corporativa · Revisar antes de distribuir
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
