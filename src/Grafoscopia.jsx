import { useState, useRef } from "react"
import jsPDF from "jspdf"
import api from "./api"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const TIPO_DOC_OPTIONS = [
  { value: "desconhecido", label: "Desconhecido" },
  { value: "bilhete",      label: "Bilhete" },
  { value: "anotacao",     label: "Anotação" },
  { value: "carta",        label: "Carta" },
  { value: "codigo",       label: "Mensagem Codificada" },
]

const CONFIANCA_COR = {
  alto:    { bg: "#DCFCE7", text: "#15803D", border: "#86EFAC" },
  medio:   { bg: "#FEF9C3", text: "#A16207", border: "#FDE047" },
  baixo:   { bg: "#FEE2E2", text: "#B91C1C", border: "#FCA5A5" },
  critico: { bg: "#FEE2E2", text: "#7F1D1D", border: "#F87171" },
}

// Criticidade → cor da borda esquerda do card
const CRITICIDADE_COR = {
  "ALTA":  { border: "#EF4444", bullet: "#EF4444", bg: "rgba(239,68,68,0.07)"  },
  "MÉDIA": { border: "#EAB308", bullet: "#EAB308", bg: "rgba(234,179,8,0.07)"  },
  "BAIXA": { border: "#3B82F6", bullet: "#3B82F6", bg: "rgba(59,130,246,0.07)" },
}

const TIPO_EVENTO_ICONE = {
  "ORDEM":              "⚡",
  "MOVIMENTAÇÃO":       "🔄",
  "REUNIÃO":            "🤝",
  "ALERTA_DE_VISTORIA": "🚨",
  "PAGAMENTO":          "💰",
  "OUTRO":              "📌",
}

// ── Componente Timeline ────────────────────────────────────────────────────────
function Timeline({ eventos }) {
  if (!eventos?.length) return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: 120, color: "#64748B", fontFamily: MONO, fontSize: 13,
      border: "1px dashed rgba(255,255,255,0.07)", borderRadius: 8,
    }}>
      Nenhum evento cronológico extraído
    </div>
  )

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {eventos.map((ev, i) => {
        const cor = CRITICIDADE_COR[ev.criticidade] || CRITICIDADE_COR["BAIXA"]
        const icone = TIPO_EVENTO_ICONE[ev.tipo_evento] || "📌"
        const isLast = i === eventos.length - 1

        return (
          <div key={i} style={{ display: "flex", gap: 12 }}>

            {/* Linha vertical + bullet */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 24 }}>
              <div style={{
                width: 14, height: 14, borderRadius: "50%",
                background: cor.bullet, flexShrink: 0, marginTop: 4,
                boxShadow: `0 0 6px ${cor.bullet}88`,
              }} />
              {!isLast && (
                <div style={{ width: 2, flex: 1, background: "rgba(255,255,255,0.07)", minHeight: 20 }} />
              )}
            </div>

            {/* Card do evento */}
            <div style={{
              flex: 1, marginBottom: isLast ? 0 : 12,
              background: cor.bg,
              border: "1px solid rgba(255,255,255,0.07)",
              borderLeft: `3px solid ${cor.border}`,
              borderRadius: 8, padding: "12px 14px",
            }}>
              {/* Header do card */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14 }}>{icone}</span>
                  <span style={{
                    fontFamily: MONO, fontSize: 11, color: "#94A3B8",
                    letterSpacing: "0.08em",
                  }}>
                    {ev.tipo_evento}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {/* Badge criticidade */}
                  <span style={{
                    background: cor.bg, color: cor.border,
                    border: `1px solid ${cor.border}`,
                    fontFamily: MONO, fontSize: 10, fontWeight: 700,
                    padding: "2px 8px", borderRadius: 20, letterSpacing: "0.08em",
                  }}>
                    {ev.criticidade}
                  </span>
                  {/* Data */}
                  <span style={{
                    fontFamily: MONO, fontSize: 11, color: "#64748B",
                  }}>
                    {ev.data_isolada !== "DATA_INCERTA" ? ev.data_isolada : "⚠ DATA INCERTA"}
                  </span>
                </div>
              </div>

              {/* Descrição */}
              <p style={{
                fontFamily: SANS, fontSize: 13, color: "#E2E8F0",
                margin: "0 0 8px 0", lineHeight: 1.6,
              }}>
                {ev.descricao_analitica}
              </p>

              {/* Data original */}
              {ev.data_texto_original && (
                <p style={{
                  fontFamily: MONO, fontSize: 11, color: "#475569",
                  margin: "0 0 8px 0", fontStyle: "italic",
                }}>
                  "{ev.data_texto_original}"
                </p>
              )}

              {/* Badges de entidades */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ev.entidades?.atores?.map((ator, j) => (
                  <span key={`a${j}`} style={{
                    background: "rgba(239,68,68,0.15)", color: "#FCA5A5",
                    border: "1px solid rgba(239,68,68,0.3)",
                    fontFamily: MONO, fontSize: 10,
                    padding: "2px 8px", borderRadius: 20,
                  }}>
                    👤 {ator}
                  </span>
                ))}
                {ev.entidades?.locais?.map((local, j) => (
                  <span key={`l${j}`} style={{
                    background: "rgba(59,130,246,0.15)", color: "#93C5FD",
                    border: "1px solid rgba(59,130,246,0.3)",
                    fontFamily: MONO, fontSize: 10,
                    padding: "2px 8px", borderRadius: 20,
                  }}>
                    📍 {local}
                  </span>
                ))}
                {ev.entidades?.organizacoes?.map((org, j) => (
                  <span key={`o${j}`} style={{
                    background: "rgba(16,185,129,0.15)", color: "#6EE7B7",
                    border: "1px solid rgba(16,185,129,0.3)",
                    fontFamily: MONO, fontSize: 10,
                    padding: "2px 8px", borderRadius: 20,
                  }}>
                    🏴 {org}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}


// ── Componente principal ───────────────────────────────────────────────────────
export default function Grafoscopia({ onNavigate }) {
  const [arquivo,    setArquivo]    = useState(null)
  const [preview,    setPreview]    = useState(null)
  const [tipoDoc,    setTipoDoc]    = useState("desconhecido")
  const [contexto,   setContexto]   = useState("")
  const [resultado,  setResultado]  = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [erro,       setErro]       = useState(null)
  const inputRef = useRef(null)

  function aoSelecionarArquivo(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setArquivo(file)
    setResultado(null)
    setErro(null)
    setPreview(URL.createObjectURL(file))
  }

  function aoSoltar(e) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith("image/")) {
      setArquivo(file)
      setResultado(null)
      setErro(null)
      setPreview(URL.createObjectURL(file))
    }
  }

  async function aoDecifrar() {
    if (!arquivo) return
    setCarregando(true)
    setErro(null)
    setResultado(null)
    try {
      const form = new FormData()
      form.append("imagem",         arquivo)
      form.append("tipo_documento", tipoDoc)
      form.append("contexto_extra", contexto)
      const res = await api.upload("/decifrar", form)
      if (!res || !res.ok) {
        const detalhe = await res?.json().catch(() => ({}))
        throw new Error(detalhe?.detail || `Erro ${res?.status}`)
      }
      const raw = await res.json()
      const texto = raw.texto_transcrito || (typeof raw.transcricao === "string" ? raw.transcricao : "") || ""
      setResultado({ ...raw, transcricao: texto })
    } catch (e) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }

  function aoLimpar() {
    setArquivo(null)
    setPreview(null)
    setResultado(null)
    setErro(null)
    setContexto("")
    setTipoDoc("desconhecido")
    if (inputRef.current) inputRef.current.value = ""
  }

  function exportarTxt() {
    if (!resultado) return
    const linhas = [
      "LAUDO DE ANÁLISE GRAFOSCÓPICA",
      "Agent Bastos — Sistema de Inteligência",
      "─".repeat(52),
      `Gerado em:   ${new Date().toLocaleString("pt-BR")}`,
      `Arquivo:     ${resultado.metadados?.arquivo || "—"}`,
      `Tipo doc.:   ${resultado.metadados?.tipo_documento || "—"}`,
      `Modelo IA:   ${resultado.metadados?.modelo || "—"}`,
      `Confiança:   ${resultado.confianca?.toUpperCase() || "—"}`,
      `Revisão:     ${resultado.requer_revisao_humana ? "NECESSÁRIA" : "Não necessária"}`,
      `Idioma:      ${resultado.idioma_detectado || "—"}`,
      "",
      "── TRANSCRIÇÃO FORENSE " + "─".repeat(29),
      resultado.transcricao || "",
      "",
      "── PARECER GRAFOSCÓPICO " + "─".repeat(28),
      resultado.parecer_grafoscopico || "Não disponível.",
      "",
      "── OBSERVAÇÕES FORENSES " + "─".repeat(28),
      resultado.observacoes || "Nenhuma.",
      "",
      "── TRECHOS DUVIDOSOS " + "─".repeat(31),
      ...(resultado.trechos_duvidosos?.length
        ? resultado.trechos_duvidosos.map((t, i) => `  ${i + 1}. ${t}`)
        : ["  Nenhum."]),
      "",
      "── LINHA DO TEMPO ANALÍTICA " + "─".repeat(24),
      ...(resultado.linha_do_tempo?.length
        ? resultado.linha_do_tempo.map((ev, i) =>
            `  [${ev.criticidade}] ${ev.data_isolada} — ${ev.tipo_evento}\n  ${ev.descricao_analitica}\n`
          )
        : ["  Nenhum evento extraído."]),
    ]
    const blob = new Blob([linhas.join("\n")], { type: "text/plain;charset=utf-8" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url; a.download = `grafoscopia_${Date.now()}.txt`; a.click()
    URL.revokeObjectURL(url)
  }

  function exportarPdf() {
    if (!resultado) return
    const doc = new jsPDF({ unit: "mm", format: "a4" })
    const PW = 210, ML = 18, MR = 18, TW = PW - ML - MR
    let y = 20

    doc.setFont("courier", "bold"); doc.setFontSize(13)
    doc.text("LAUDO DE ANÁLISE GRAFOSCÓPICA", ML, y); y += 6
    doc.setFont("courier", "normal"); doc.setFontSize(9); doc.setTextColor(100)
    doc.text("Agent Bastos — Sistema de Inteligência de Segurança", ML, y); y += 4
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, ML, y); y += 2
    doc.setDrawColor(180); doc.line(ML, y + 2, PW - MR, y + 2); y += 7

    doc.setTextColor(0); doc.setFontSize(8)
    const meta = [
      ["Arquivo",   resultado.metadados?.arquivo || "—"],
      ["Tipo",      resultado.metadados?.tipo_documento || "—"],
      ["Modelo IA", resultado.metadados?.modelo || "—"],
      ["Confiança", resultado.confianca?.toUpperCase() || "—"],
      ["Revisão",   resultado.requer_revisao_humana ? "NECESSÁRIA" : "Não necessária"],
      ["Idioma",    resultado.idioma_detectado || "—"],
    ]
    meta.forEach(([k, v]) => {
      doc.setFont("courier", "bold"); doc.text(`${k}:`, ML, y)
      doc.setFont("courier", "normal"); doc.text(v, ML + 28, y); y += 5
    }); y += 2

    const secao = (titulo, cor = [180, 83, 9]) => {
      if (y > 265) { doc.addPage(); y = 20 }
      doc.setFont("courier", "bold"); doc.setFontSize(9); doc.setTextColor(100)
      doc.text(titulo, ML, y); y += 1
      doc.setDrawColor(...cor); doc.setLineWidth(0.5)
      doc.line(ML, y + 1, PW - MR, y + 1); y += 5
      doc.setFont("courier", "normal"); doc.setFontSize(9); doc.setTextColor(20)
    }

    secao("TRANSCRIÇÃO FORENSE")
    doc.splitTextToSize(resultado.transcricao || "", TW).forEach(l => {
      if (y > 275) { doc.addPage(); y = 20 }
      doc.text(l, ML, y); y += 5
    }); y += 4

    if (resultado.parecer_grafoscopico) {
      secao("PARECER GRAFOSCÓPICO", [100, 100, 180])
      doc.splitTextToSize(resultado.parecer_grafoscopico, TW).forEach(l => {
        if (y > 275) { doc.addPage(); y = 20 }
        doc.text(l, ML, y); y += 5
      }); y += 4
    }

    if (resultado.linha_do_tempo?.length) {
      secao("LINHA DO TEMPO ANALÍTICA", [200, 0, 0])
      resultado.linha_do_tempo.forEach((ev, i) => {
        if (y > 265) { doc.addPage(); y = 20 }
        doc.setFont("courier", "bold")
        doc.text(`${i + 1}. [${ev.criticidade}] ${ev.data_isolada} — ${ev.tipo_evento}`, ML, y); y += 5
        doc.setFont("courier", "normal")
        doc.splitTextToSize(ev.descricao_analitica, TW).forEach(l => {
          if (y > 275) { doc.addPage(); y = 20 }
          doc.text(l, ML + 4, y); y += 5
        }); y += 2
      })
    }

    const totalPaginas = doc.getNumberOfPages()
    for (let p = 1; p <= totalPaginas; p++) {
      doc.setPage(p); doc.setFont("courier", "normal")
      doc.setFontSize(7); doc.setTextColor(160)
      doc.text(`Agent Bastos — Análise Grafoscópica — Página ${p}/${totalPaginas} — CONFIDENCIAL`,
        PW / 2, 290, { align: "center" })
    }
    doc.save(`grafoscopia_${Date.now()}.pdf`)
  }

  const conf = resultado ? (CONFIANCA_COR[resultado.confianca] || CONFIANCA_COR.baixo) : null
  const temTimeline = resultado?.linha_do_tempo?.length > 0

  return (
    <div style={{ minHeight: "100vh", background: "#0B1120", fontFamily: SANS }}>

      {/* Header */}
      <div style={{
        background: "#FFF", borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "18px 32px", display: "flex",
        alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 8, background: "#78350F",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>🔬</div>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: "#94A3B8", letterSpacing: "0.1em" }}>
              AGENT BASTOS / FERRAMENTAS
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1E293B", letterSpacing: "-0.02em" }}>
              Análise Grafoscópica
            </div>
          </div>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: "#94A3B8" }}>
          Gemini 2.5 Flash · Transcrição Forense + Cronologia
        </div>
      </div>

      {/* Body */}
      <div style={{
        maxWidth: 1200, margin: "0 auto", padding: "32px 24px",
        display: "flex", gap: 28, alignItems: "flex-start", flexWrap: "wrap",
      }}>

        {/* Coluna esquerda — controles (inalterada) */}
        <div style={{ flex: "0 0 300px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            onDragOver={e => e.preventDefault()} onDrop={aoSoltar}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${preview ? "#B45309" : "#CBD5E1"}`,
              borderRadius: 10, background: preview ? "#FFFBEB" : "#FFF",
              minHeight: 220, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              cursor: "pointer", overflow: "hidden", transition: "border-color .2s",
            }}
          >
            {preview ? (
              <img src={preview} alt="preview" style={{ width: "100%", maxHeight: 280, objectFit: "contain" }} />
            ) : (
              <>
                <span style={{ fontSize: 36 }}>📄</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: "#64748B", marginTop: 10, textAlign: "center", padding: "0 20px" }}>
                  Arraste o documento ou clique para selecionar
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: "#94A3B8", marginTop: 6 }}>
                  JPEG · PNG · WEBP · GIF
                </span>
              </>
            )}
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: "none" }} onChange={aoSelecionarArquivo} />
          </div>

          <div>
            <label style={{ fontFamily: MONO, fontSize: 11, color: "#64748B", letterSpacing: "0.1em" }}>
              TIPO DE DOCUMENTO
            </label>
            <select value={tipoDoc} onChange={e => setTipoDoc(e.target.value)} style={{
              width: "100%", marginTop: 6, padding: "9px 12px",
              fontFamily: MONO, fontSize: 12, color: "#F1F5F9",
              background: "#0B1120", border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 6, cursor: "pointer", outline: "none",
            }}>
              {TIPO_DOC_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontFamily: MONO, fontSize: 11, color: "#64748B", letterSpacing: "0.1em" }}>
              CONTEXTO OPERACIONAL <span style={{ color: "#CBD5E1" }}>/ OPCIONAL</span>
            </label>
            <textarea value={contexto} onChange={e => setContexto(e.target.value)}
              placeholder="Ex: Apreendido em abordagem, zona norte, 09/05/2026"
              maxLength={500} rows={3} style={{
                width: "100%", marginTop: 6, padding: "9px 12px",
                fontFamily: MONO, fontSize: 12, color: "#F1F5F9",
                background: "#0B1120", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 6, resize: "vertical", boxSizing: "border-box", outline: "none",
              }} />
          </div>

          <button onClick={aoDecifrar} disabled={!arquivo || carregando} style={{
            padding: "13px 0",
            background: !arquivo || carregando ? "#1E293B" : "#78350F",
            color: !arquivo || carregando ? "#475569" : "#FFF",
            border: "none", borderRadius: 8,
            fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
            cursor: !arquivo || carregando ? "not-allowed" : "pointer",
            transition: "background .2s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            {carregando ? (
              <>
                <span style={{
                  width: 13, height: 13, border: "2px solid #475569",
                  borderTopColor: "#94A3B8", borderRadius: "50%",
                  animation: "spin 1s linear infinite", display: "inline-block",
                }} />
                ANALISANDO...
              </>
            ) : "INICIAR ANÁLISE"}
          </button>

          {arquivo && (
            <button onClick={aoLimpar} style={{
              padding: "9px 0", background: "transparent",
              border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8,
              fontFamily: MONO, fontSize: 12, color: "#64748B", cursor: "pointer",
            }}>LIMPAR</button>
          )}

          <div style={{
            background: "rgba(232,160,32,0.10)", border: "1px solid #FDE68A",
            borderRadius: 8, padding: "12px 14px",
          }}>
            <div style={{ fontFamily: MONO, fontSize: 11, color: "#E8A020", letterSpacing: "0.08em", marginBottom: 6 }}>
              SOBRE ESTE MÓDULO
            </div>
            <p style={{ fontFamily: MONO, fontSize: 11, color: "#F1F5F9", margin: 0, lineHeight: 1.7 }}>
              Transcrição forense + cronologia analítica de manuscritos.
              Extrai eventos, datas, atores e criticidade operacional.
            </p>
          </div>
        </div>

        {/* Coluna direita — resultado */}
        <div style={{ flex: 1, minWidth: 300 }}>

          {erro && (
            <div style={{
              background: "#FEE2E2", border: "1px solid #FCA5A5",
              borderRadius: 8, padding: "14px 18px",
              fontFamily: MONO, fontSize: 12, color: "#B91C1C",
            }}>⚠ {erro}</div>
          )}

          {!resultado && !erro && !carregando && (
            <div style={{
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              height: 360, color: "#CBD5E1",
              border: "1px dashed rgba(255,255,255,0.07)", borderRadius: 10,
            }}>
              <span style={{ fontSize: 48 }}>🔍</span>
              <span style={{ fontFamily: MONO, fontSize: 12, marginTop: 16, color: "#475569" }}>
                Selecione um documento para iniciar a análise forense
              </span>
            </div>
          )}

          {resultado && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeIn .22s ease" }}>

              {/* Header resultado */}
              <div style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between", flexWrap: "wrap", gap: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{
                    background: conf.bg, color: conf.text, border: `1px solid ${conf.border}`,
                    fontFamily: MONO, fontSize: 11, fontWeight: 700,
                    padding: "4px 12px", borderRadius: 20, letterSpacing: "0.1em",
                  }}>
                    CONFIANÇA {resultado.confianca?.toUpperCase()}
                  </span>
                  {temTimeline && (
                    <span style={{
                      background: "rgba(59,130,246,0.15)", color: "#93C5FD",
                      border: "1px solid rgba(59,130,246,0.3)",
                      fontFamily: MONO, fontSize: 11, fontWeight: 600,
                      padding: "4px 12px", borderRadius: 20,
                    }}>
                      📅 {resultado.linha_do_tempo.length} EVENTO{resultado.linha_do_tempo.length > 1 ? "S" : ""} EXTRAÍDO{resultado.linha_do_tempo.length > 1 ? "S" : ""}
                    </span>
                  )}
                  {resultado.requer_revisao_humana && (
                    <span style={{
                      background: "#FEF9C3", color: "#E8A020", border: "1px solid #FDE047",
                      fontFamily: MONO, fontSize: 11, fontWeight: 600,
                      padding: "4px 12px", borderRadius: 20,
                    }}>⚠ REVISÃO NECESSÁRIA</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={exportarTxt} style={{
                    background: "#475569", color: "#FFF", border: "none",
                    borderRadius: 6, padding: "7px 14px",
                    fontFamily: MONO, fontSize: 11, cursor: "pointer", letterSpacing: "0.08em",
                  }}>EXPORTAR .TXT</button>
                  <button onClick={exportarPdf} style={{
                    background: "#B45309", color: "#FFF", border: "none",
                    borderRadius: 6, padding: "7px 14px",
                    fontFamily: MONO, fontSize: 11, cursor: "pointer", letterSpacing: "0.08em",
                  }}>EXPORTAR .PDF</button>
                </div>
              </div>

              {/* Split-screen quando tem timeline */}
              <div style={{
                display: "flex", gap: 16, alignItems: "flex-start",
                flexWrap: temTimeline ? "nowrap" : "wrap",
              }}>

                {/* Coluna esquerda do resultado — transcrição */}
                <div style={{
                  flex: temTimeline ? "0 0 50%" : "1",
                  display: "flex", flexDirection: "column", gap: 12,
                }}>

                  {/* Transcrição */}
                  <div style={{
                    background: "#111827", border: "1px solid rgba(255,255,255,0.07)",
                    borderLeft: "3px solid #B45309", borderRadius: 8, padding: "16px 18px",
                  }}>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: "#94A3B8", letterSpacing: "0.1em", marginBottom: 10 }}>
                      TRANSCRIÇÃO FORENSE
                    </div>
                    <pre style={{
                      fontFamily: MONO, fontSize: 12, color: "#E2E8F0",
                      whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.8,
                      maxHeight: 320, overflowY: "auto", paddingRight: 8,
                    }}>
                      {resultado.transcricao}
                    </pre>
                  </div>

                  {/* Parecer grafoscópico — campo novo */}
                  {resultado.parecer_grafoscopico && (
                    <div style={{
                      background: "#111827", border: "1px solid rgba(255,255,255,0.07)",
                      borderLeft: "3px solid #6366F1", borderRadius: 8, padding: "16px 18px",
                    }}>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: "#94A3B8", letterSpacing: "0.1em", marginBottom: 8 }}>
                        PARECER GRAFOSCÓPICO
                      </div>
                      <p style={{ fontFamily: SANS, fontSize: 13, color: "#CBD5E1", margin: 0, lineHeight: 1.7 }}>
                        {resultado.parecer_grafoscopico}
                      </p>
                    </div>
                  )}

                  {/* Observações */}
                  {resultado.observacoes && (
                    <div style={{
                      background: "#111827", border: "1px solid rgba(255,255,255,0.07)",
                      borderRadius: 8, padding: "14px 18px",
                    }}>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: "#94A3B8", letterSpacing: "0.1em", marginBottom: 8 }}>
                        OBSERVAÇÕES FORENSES
                      </div>
                      <p style={{ fontFamily: SANS, fontSize: 13, color: "#475569", margin: 0, lineHeight: 1.7 }}>
                        {resultado.observacoes}
                      </p>
                    </div>
                  )}

                  {/* Trechos duvidosos */}
                  {resultado.trechos_duvidosos?.length > 0 && (
                    <div style={{
                      background: "rgba(232,160,32,0.08)", border: "1px solid rgba(253,230,138,0.3)",
                      borderRadius: 8, padding: "14px 18px",
                    }}>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: "#E8A020", letterSpacing: "0.1em", marginBottom: 10 }}>
                        TRECHOS DUVIDOSOS ({resultado.trechos_duvidosos.length})
                      </div>
                      {resultado.trechos_duvidosos.map((t, i) => (
                        <div key={i} style={{
                          fontFamily: MONO, fontSize: 12, color: "#F1F5F9", padding: "5px 0",
                          borderBottom: i < resultado.trechos_duvidosos.length - 1 ? "1px solid rgba(253,230,138,0.2)" : "none",
                        }}>
                          {i + 1}. {t}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Coluna direita do resultado — timeline */}
                {temTimeline && (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      background: "#111827", border: "1px solid rgba(255,255,255,0.07)",
                      borderLeft: "3px solid #6EE7B7", borderRadius: 8, padding: "16px 18px",
                    }}>
                      <div style={{
                        fontFamily: MONO, fontSize: 11, color: "#94A3B8",
                        letterSpacing: "0.1em", marginBottom: 16,
                        display: "flex", alignItems: "center", gap: 8,
                      }}>
                        📅 LINHA DO TEMPO ANALÍTICA
                        <span style={{
                          background: "rgba(110,231,183,0.15)", color: "#6EE7B7",
                          border: "1px solid rgba(110,231,183,0.3)",
                          fontFamily: MONO, fontSize: 10,
                          padding: "2px 8px", borderRadius: 20,
                        }}>
                          {resultado.linha_do_tempo.length} evento{resultado.linha_do_tempo.length > 1 ? "s" : ""}
                        </span>
                      </div>
                      <div style={{ maxHeight: 520, overflowY: "auto", paddingRight: 4 }}>
                        <Timeline eventos={resultado.linha_do_tempo} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Metadados */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  ["ARQUIVO",  resultado.metadados?.arquivo],
                  ["TIPO",     resultado.metadados?.tipo_documento],
                  ["IDIOMA",   resultado.idioma_detectado],
                  ["MODELO",   resultado.metadados?.modelo],
                  ["ANÁLISE",  resultado.metadados?.timestamp?.slice(0, 19).replace("T", " ")],
                ].map(([k, v]) => v && (
                  <span key={k} style={{
                    background: "#1A2236", borderRadius: 6,
                    padding: "4px 10px", fontFamily: MONO, fontSize: 11, color: "#475569",
                  }}>
                    <span style={{ color: "#94A3B8" }}>{k}: </span>{v}
                  </span>
                ))}
              </div>

            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        pre::-webkit-scrollbar { width: 4px; }
        pre::-webkit-scrollbar-track { background: transparent; }
        pre::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
      `}</style>
    </div>
  )
}