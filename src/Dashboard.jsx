import { useState, useEffect, useCallback } from "react"
import api from "./api"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
const HOJE = new Date()
const ANO_ATUAL = HOJE.getFullYear()
const MES_ATUAL = HOJE.getMonth() + 1   // 1-12

const CORES = ["#60A5FA","#A78BFA","#34D399","#E8A020","#F87171","#C2410C","#0EA5E9","#EC4899","#7C3AED"]
const corDe = (i) => CORES[i % CORES.length]

// ── Helpers visuais ─────────────────────────────────────────────────────────
function BarraH({ valor, max, color }) {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0
  return (
    <div style={{ height: 6, background: "#1A2236", borderRadius: 3, overflow: "hidden", flex: 1 }}>
      <div style={{ height: "100%", width: pct + "%", background: color, borderRadius: 3, transition: "width 0.5s ease" }}/>
    </div>
  )
}

function Sparkline({ values, color, width = 70, height = 22 }) {
  if (!values || values.length < 2) return null
  const max = Math.max(...values, 1)
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width
    const y = height - (v / max) * (height - 4) - 2
    return x + "," + y
  }).join(" ")
  return (
    <svg width={width} height={height} viewBox={"0 0 " + width + " " + height} style={{ flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85"/>
    </svg>
  )
}

function KpiCard({ titulo, valor, sub, cor, variacao }) {
  return (
    <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderTop: "3px solid " + cor, borderRadius: 10, padding: "14px 16px", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: MONO, marginBottom: 6 }}>{titulo}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: "#F1F5F9", lineHeight: 1, fontFamily: MONO }}>{valor}</div>
        {variacao !== undefined && variacao !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 4, padding: "2px 7px", borderRadius: 20, background: variacao >= 0 ? "rgba(22,163,74,0.12)" : "rgba(220,38,38,0.12)", border: "1px solid " + (variacao >= 0 ? "#16A34A55" : "#DC262655") }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={variacao >= 0 ? "#16A34A" : "#DC2626"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {variacao >= 0 ? <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></> : <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>}
            </svg>
            <span style={{ fontSize: 13, fontWeight: 700, color: variacao >= 0 ? "#16A34A" : "#DC2626", fontFamily: MONO }}>{Math.abs(variacao)}%</span>
          </div>
        )}
      </div>
      {sub && <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 5, fontFamily: MONO }}>{sub}</div>}
    </div>
  )
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function Dashboard() {
  const [ano, setAno]   = useState(ANO_ATUAL)
  const [mes, setMes]   = useState(MES_ATUAL)        // 1-12
  const [aba, setAba]   = useState("geral")
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState("")

  const [prod, setProd]   = useState({ por_nucleo: [], por_mes_tipo: [], por_unidade: [], ranking_unidades: [] })
  const [kpi, setKpi]     = useState(null)
  const [lancs, setLancs] = useState([])
  const [cat, setCat]     = useState({ tipos: [], nucleos: [], unidades: [] })

  const [formDoc, setFormDoc] = useState({ nome_arquivo: "", tipo_codigo: "RELINT", nucleo_sigla: "NI", unidade_sigla: "", ano: ANO_ATUAL, mes: MES_ATUAL, observacao: "" })
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState("")

  const carregar = useCallback(async () => {
    setLoading(true); setErro("")
    const safe = async (p, def) => { try { const r = await api.get(p); return (r && r.ok) ? await r.json() : def } catch { return def } }
    try {
      const [p, k, l, c] = await Promise.all([
        safe(`/dashboard/producao?ano=${ano}`, { por_nucleo: [], por_mes_tipo: [], por_unidade: [], ranking_unidades: [] }),
        safe(`/dashboard/kpi?ano=${ano}&mes=${mes}`, null),
        safe(`/dashboard/lancamentos?ano=${ano}`, []),
        safe(`/dashboard/catalogos`, { tipos: [], nucleos: [], unidades: [] }),
      ])
      setProd(p || {}); setKpi(k); setLancs(Array.isArray(l) ? l : []); setCat(c || {})
      if (!k) setErro("Backend indisponível — verifique se o servidor está rodando.")
    } catch {
      setErro("Falha ao carregar dados do servidor.")
    } finally {
      setLoading(false)
    }
  }, [ano, mes])

  useEffect(() => { carregar() }, [carregar])

  // ── Agregações (a partir do SQLite real) ──
  const linhasNuc = prod.por_nucleo || []        // {ano,mes,nucleo,tipo,total}
  const linhasTipo = prod.por_mes_tipo || []     // {ano,mes,tipo,tipo_nome,total}

  const totalMesIdx = (m1a12) => linhasNuc.filter(r => r.mes === m1a12).reduce((s, r) => s + r.total, 0)
  const totalAno = linhasNuc.reduce((s, r) => s + r.total, 0)

  // Ranking por núcleo (mês selecionado)
  const nucMap = {}
  linhasNuc.filter(r => r.mes === mes).forEach(r => { nucMap[r.nucleo] = (nucMap[r.nucleo] || 0) + r.total })
  const rankNucleo = Object.entries(nucMap).sort((a, b) => b[1] - a[1])
  const maxNucleo = Math.max(...rankNucleo.map(x => x[1]), 1)
  const nucleosAtivosAno = new Set(linhasNuc.map(r => r.nucleo)).size

  // Por tipo de documento
  const tiposNomes = {}
  linhasTipo.forEach(r => { tiposNomes[r.tipo] = r.tipo_nome || r.tipo })
  ;(cat.tipos || []).forEach(t => { if (!tiposNomes[t.codigo]) tiposNomes[t.codigo] = t.nome })
  const tipoMesMap = {}
  linhasTipo.filter(r => r.mes === mes).forEach(r => { tipoMesMap[r.tipo] = (tipoMesMap[r.tipo] || 0) + r.total })
  const rankTipoMes = Object.entries(tipoMesMap).sort((a, b) => b[1] - a[1])
  const maxTipoMes = Math.max(...rankTipoMes.map(x => x[1]), 1)
  const serieTipo = (cod) => MESES.map((_, i) => linhasTipo.filter(r => r.mes === i + 1 && r.tipo === cod).reduce((s, r) => s + r.total, 0))
  const totalTipoAno = (cod) => linhasTipo.filter(r => r.tipo === cod).reduce((s, r) => s + r.total, 0)
  const tiposComDado = [...new Set(linhasTipo.map(r => r.tipo))].sort((a, b) => totalTipoAno(b) - totalTipoAno(a))

  const variacao = kpi ? kpi.variacao_pct : null
  const totalMes = kpi ? kpi.total_mes : totalMesIdx(mes)
  const mediaMensal = kpi ? kpi.media_mensal : (totalAno ? Math.round(totalAno / 12) : 0)
  const acumulado = kpi ? kpi.acumulado_ano : totalAno
  const maxMesEvol = Math.max(...MESES.map((_, i) => totalMesIdx(i + 1)), 1)

  const semDados = totalAno === 0

  async function lancar() {
    setSalvando(true); setMsg("")
    try {
      const nome = formDoc.nome_arquivo || (formDoc.tipo_codigo + "_" + formDoc.nucleo_sigla + "_" + MESES[formDoc.mes - 1] + "_" + formDoc.ano)
      const res = await api.post("/dashboard/lancar", { ...formDoc, nome_arquivo: nome })
      if (!res || !res.ok) throw new Error(res ? await res.text() : "sem resposta")
      setMsg("OK — Documento registrado!")
      setFormDoc(p => ({ ...p, nome_arquivo: "", observacao: "" }))
      await carregar()
    } catch (e) {
      setMsg("ERRO: " + (e.message || "falha ao registrar"))
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(id) {
    try {
      const res = await api.delete("/dashboard/lancar/" + id)
      if (res && res.ok) await carregar()
    } catch { /* ignora */ }
  }

  const TABS = [["geral", "Visão Geral"], ["documentos", "Por Documento"], ["lancamentos", "Lançamentos"], ["lancamento", "+ Lançamento"]]

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, height: "100%", overflow: "hidden", background: "#0B1120" }}>

      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "#111827", flexShrink: 0, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 16.9, fontWeight: 700, color: "#F1F5F9" }}>Dashboard de Produção</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 11, color: "#64748B", fontFamily: MONO }}>AIPEN · Produção documental · {ano}</span>
            <span style={{ fontSize: 9, fontWeight: 700, fontFamily: MONO, padding: "1px 6px", borderRadius: 4, background: erro ? "rgba(220,38,38,0.12)" : "rgba(22,163,74,0.12)", color: erro ? "#DC2626" : "#16A34A", border: "1px solid " + (erro ? "#DC262655" : "#16A34A55") }}>{erro ? "OFFLINE" : "DADOS REAIS"}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 3 }}>
            {[2025, 2026].map(a => (
              <button key={a} onClick={() => setAno(a)} style={{ padding: "3px 9px", borderRadius: 5, border: "1px solid", fontSize: 11, fontFamily: MONO, cursor: "pointer", background: ano === a ? "#E8A020" : "#111827", color: ano === a ? "#0B1120" : "#64748B", borderColor: ano === a ? "#E8A020" : "rgba(255,255,255,0.1)", fontWeight: ano === a ? 700 : 400 }}>{a}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {MESES.map((m, i) => (
              <button key={i} onClick={() => setMes(i + 1)} style={{ padding: "3px 7px", borderRadius: 5, border: "1px solid", fontSize: 9, fontFamily: MONO, cursor: "pointer", background: mes === i + 1 ? "#0F172A" : "#111827", color: mes === i + 1 ? "#F1F5F9" : "#64748B", borderColor: mes === i + 1 ? "#475569" : "rgba(255,255,255,0.1)", fontWeight: mes === i + 1 ? 700 : 400 }}>{m}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ABAS */}
      <div style={{ display: "flex", gap: 4, padding: "8px 20px", background: "#111827", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setAba(id)} style={{ padding: "5px 14px", borderRadius: 6, border: "1px solid", fontSize: 14.3, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", background: aba === id ? "#E8A020" : "transparent", color: aba === id ? "#0B1120" : "#94A3B8", borderColor: aba === id ? "#E8A020" : "transparent" }}>{label}</button>
        ))}
      </div>

      {/* CONTEÚDO */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>

        {loading && <div style={{ color: "#94A3B8", fontFamily: MONO, fontSize: 14, padding: 20 }}>Carregando dados reais...</div>}
        {!loading && erro && <div style={{ color: "#F87171", fontFamily: MONO, fontSize: 14, padding: "12px 16px", background: "rgba(220,38,38,0.08)", border: "1px solid #DC262655", borderRadius: 8 }}>{erro}</div>}

        {!loading && !erro && (
          <>
            {/* VISÃO GERAL */}
            {aba === "geral" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                  <KpiCard titulo={"Total " + MESES[mes - 1]} valor={totalMes} variacao={variacao} sub={"vs " + MESES[(mes - 2 + 12) % 12]} cor={variacao >= 0 ? "#16A34A" : "#DC2626"} />
                  <KpiCard titulo={"Total Anual " + ano} valor={acumulado} sub="todos os núcleos" cor="#1D4ED8" />
                  <KpiCard titulo="Núcleos Ativos" valor={nucleosAtivosAno} sub="com produção no ano" cor="#6D28D9" />
                  <KpiCard titulo="Média Mensal" valor={mediaMensal} sub="docs/mês" cor="#B45309" />
                </div>

                {semDados && (
                  <div style={{ color: "#94A3B8", fontFamily: MONO, fontSize: 13, padding: "16px", background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, textAlign: "center" }}>
                    Nenhum documento lançado em {ano} ainda. Use a aba <b style={{ color: "#E8A020" }}>+ Lançamento</b> para registrar.
                  </div>
                )}

                {!semDados && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {/* Ranking por núcleo */}
                    <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "14px 16px" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Por Núcleo — {MESES[mes - 1]}</div>
                      {rankNucleo.length === 0 && <div style={{ color: "#64748B", fontFamily: MONO, fontSize: 12 }}>Sem lançamentos neste mês.</div>}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {rankNucleo.map(([nuc, total], i) => (
                          <div key={nuc} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", fontFamily: MONO, width: 16, textAlign: "right" }}>#{i + 1}</span>
                            <span style={{ fontSize: 14, color: "#F1F5F9", width: 64, flexShrink: 0, fontWeight: i === 0 ? 700 : 500 }}>{nuc}</span>
                            <BarraH valor={total} max={maxNucleo} color={corDe(i)} />
                            <span style={{ fontSize: 14, fontWeight: 700, color: corDe(i), fontFamily: MONO, width: 28, textAlign: "right" }}>{total}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Por tipo */}
                    <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "14px 16px" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Por Tipo — {MESES[mes - 1]}</div>
                      {rankTipoMes.length === 0 && <div style={{ color: "#64748B", fontFamily: MONO, fontSize: 12 }}>Sem lançamentos neste mês.</div>}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {rankTipoMes.map(([cod, total], i) => (
                          <div key={cod} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 12.5, color: "#F1F5F9", width: 150, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={tiposNomes[cod]}>{tiposNomes[cod] || cod}</span>
                            <BarraH valor={total} max={maxTipoMes} color={corDe(i + 3)} />
                            <span style={{ fontSize: 14, fontWeight: 700, color: corDe(i + 3), fontFamily: MONO, width: 28, textAlign: "right" }}>{total}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Evolução mensal */}
                {!semDados && (
                  <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Evolução Mensal — {ano}</div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 90, padding: "0 4px" }}>
                      {MESES.map((m, i) => {
                        const val = totalMesIdx(i + 1)
                        const h = Math.max((val / maxMesEvol) * 76, 3)
                        const sel = mes === i + 1
                        return (
                          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                            <span style={{ fontSize: 9, color: sel ? "#E8A020" : "#94A3B8", fontFamily: MONO, fontWeight: sel ? 700 : 400 }}>{val}</span>
                            <div style={{ width: "100%", height: h, background: sel ? "#E8A020" : "#334155", borderRadius: "3px 3px 0 0", transition: "height 0.4s" }}/>
                            <span style={{ fontSize: 8, color: sel ? "#E8A020" : "#94A3B8", fontFamily: MONO, fontWeight: sel ? 700 : 400 }}>{m}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* POR DOCUMENTO */}
            {aba === "documentos" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {tiposComDado.length === 0 && <div style={{ color: "#94A3B8", fontFamily: MONO, fontSize: 13, padding: 16 }}>Nenhum documento lançado em {ano}.</div>}
                {tiposComDado.map((cod) => {
                  const serie = serieTipo(cod)
                  const mesVal = serie[mes - 1]
                  const anoVal = totalTipoAno(cod)
                  return (
                    <div key={cod} style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9" }}>{tiposNomes[cod] || cod}</div>
                        <div style={{ fontSize: 10, color: "#64748B", fontFamily: MONO }}>{cod}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                        <Sparkline values={serie} color="#60A5FA" width={90} height={22} />
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 8, color: "#94A3B8", fontFamily: MONO, textTransform: "uppercase" }}>{MESES[mes - 1]}</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9", fontFamily: MONO }}>{mesVal}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 8, color: "#94A3B8", fontFamily: MONO, textTransform: "uppercase" }}>Anual</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: "#60A5FA", fontFamily: MONO }}>{anoVal}</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* LANÇAMENTOS (lista real + excluir) */}
            {aba === "lancamentos" && (
              <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em", textTransform: "uppercase" }}>Lançamentos {ano} ({lancs.length})</span>
                  <button onClick={carregar} style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94A3B8", fontSize: 12, fontFamily: MONO, cursor: "pointer" }}>↻ Atualizar</button>
                </div>
                {lancs.length === 0 && <div style={{ color: "#64748B", fontFamily: MONO, fontSize: 13, padding: 20, textAlign: "center" }}>Nenhum lançamento em {ano}.</div>}
                {lancs.map((d) => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: MONO, color: "#E8A020", background: "rgba(232,160,32,0.1)", padding: "2px 7px", borderRadius: 4, width: 90, textAlign: "center", flexShrink: 0 }}>{d.tipo}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, color: "#F1F5F9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.nome_arquivo}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8", fontFamily: MONO }}>{d.nucleo}{d.unidade ? " · " + d.unidade : ""} · {MESES[(d.mes || 1) - 1]}/{d.ano}</div>
                    </div>
                    <button onClick={() => excluir(d.id)} title="Excluir" style={{ padding: "5px 9px", borderRadius: 6, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)", color: "#F87171", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* + LANÇAMENTO */}
            {aba === "lancamento" && (
              <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 20, maxWidth: 480 }}>
                <div style={{ fontSize: 14.3, fontWeight: 800, color: "#94A3B8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>Registrar Documento</div>
                {msg && <div style={{ padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 13.5, fontWeight: 600, background: msg.startsWith("OK") ? "rgba(22,163,74,0.12)" : "rgba(220,38,38,0.12)", color: msg.startsWith("OK") ? "#4ADE80" : "#F87171" }}>{msg}</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <Campo label="TIPO DE DOCUMENTO">
                    <select value={formDoc.tipo_codigo} onChange={e => setFormDoc(p => ({ ...p, tipo_codigo: e.target.value }))} style={selStyle}>
                      {(cat.tipos || []).map(t => <option key={t.codigo} value={t.codigo}>{t.nome}</option>)}
                    </select>
                  </Campo>
                  <div style={{ display: "flex", gap: 10 }}>
                    <Campo label="NÚCLEO" flex>
                      <select value={formDoc.nucleo_sigla} onChange={e => setFormDoc(p => ({ ...p, nucleo_sigla: e.target.value }))} style={selStyle}>
                        {(cat.nucleos || []).map(n => <option key={n.sigla} value={n.sigla}>{n.sigla}</option>)}
                      </select>
                    </Campo>
                    <Campo label="UNIDADE (opcional)" flex>
                      <select value={formDoc.unidade_sigla} onChange={e => setFormDoc(p => ({ ...p, unidade_sigla: e.target.value }))} style={selStyle}>
                        <option value="">-- Nenhuma --</option>
                        {(cat.unidades || []).map(u => <option key={u.sigla} value={u.sigla}>{u.sigla}</option>)}
                      </select>
                    </Campo>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <Campo label="MÊS" flex>
                      <select value={formDoc.mes} onChange={e => setFormDoc(p => ({ ...p, mes: parseInt(e.target.value) }))} style={selStyle}>
                        {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                      </select>
                    </Campo>
                    <Campo label="ANO" flex>
                      <select value={formDoc.ano} onChange={e => setFormDoc(p => ({ ...p, ano: parseInt(e.target.value) }))} style={selStyle}>
                        <option value={2025}>2025</option><option value={2026}>2026</option>
                      </select>
                    </Campo>
                  </div>
                  <Campo label="NOME DO ARQUIVO (opcional)">
                    <input value={formDoc.nome_arquivo} onChange={e => setFormDoc(p => ({ ...p, nome_arquivo: e.target.value }))} placeholder="Ex: RELINT Nº 012-2026-AIPEN-SEAP-AM" style={inpStyle} />
                  </Campo>
                  <Campo label="OBSERVAÇÃO">
                    <input value={formDoc.observacao} onChange={e => setFormDoc(p => ({ ...p, observacao: e.target.value }))} placeholder="Opcional" style={inpStyle} />
                  </Campo>
                  <button disabled={salvando} onClick={lancar} style={{ padding: "10px", borderRadius: 7, border: "none", background: salvando ? "#1A2236" : "#B45309", color: salvando ? "#94A3B8" : "#fff", fontWeight: 700, fontSize: 14.3, cursor: salvando ? "not-allowed" : "pointer", textTransform: "uppercase" }}>
                    {salvando ? "Salvando..." : "Registrar Documento"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const selStyle = { width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", fontSize: 14.3, fontFamily: "inherit", background: "#0B1120", color: "#F1F5F9", outline: "none", boxSizing: "border-box" }
const inpStyle = { ...selStyle }

function Campo({ label, children, flex }) {
  return (
    <div style={{ flex: flex ? 1 : undefined }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}
