import { useState, useRef } from "react"
import { jsPDF } from "jspdf"
import api from "./api"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const C = {
  bg:          "#070D1A",
  surface:     "#0D1526",
  surfaceUp:   "#111E33",
  border:      "rgba(255,255,255,0.07)",
  borderHover: "rgba(255,255,255,0.14)",
  accent:      "#C26A1A",
  accentHover: "#D97C20",
  accentDim:   "rgba(194,106,26,0.12)",
  accentBorder:"rgba(194,106,26,0.35)",
  text:        "#E8EDF5",
  textDim:     "#6B7A99",
  textMid:     "#94A3B8",
  success:     "#10B981",
  warning:     "#F59E0B",
  danger:      "#EF4444",
  blue:        "#3B82F6",
  green:       "#10B981",
  headerBg:    "#050C18",
}

const TIPO_DOC_OPTIONS = [
  { value: "desconhecido", label: "Desconhecido" },
  { value: "bilhete",      label: "Bilhete" },
  { value: "anotacao",     label: "Anotação" },
  { value: "carta",        label: "Carta" },
  { value: "codigo",       label: "Mensagem Codificada" },
]

const CONFIANCA_MAP = {
  alto:    { label: "ALTO",    color: "#10B981", bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.3)"  },
  medio:   { label: "MÉDIO",   color: "#F59E0B", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.3)"  },
  baixo:   { label: "BAIXO",   color: "#EF4444", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.3)"   },
  critico: { label: "CRÍTICO", color: "#DC2626", bg: "rgba(220,38,38,0.1)",   border: "rgba(220,38,38,0.3)"   },
}

const CRITICIDADE_MAP = {
  "ALTA":  { color: "#EF4444", bg: "rgba(239,68,68,0.08)",  border: "#EF4444" },
  "MÉDIA": { color: "#F59E0B", bg: "rgba(245,158,11,0.08)", border: "#F59E0B" },
  "BAIXA": { color: "#3B82F6", bg: "rgba(59,130,246,0.08)", border: "#3B82F6" },
}

const TIPO_ICONE = {
  "ORDEM":              "⚡", "MOVIMENTAÇÃO": "↗",
  "REUNIÃO":            "◎", "ALERTA_DE_VISTORIA": "⚠",
  "PAGAMENTO":          "₿", "OUTRO": "◆",
}

function Badge({ children, color, bg, border }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      background: bg, color, border: `1px solid ${border}`,
      fontFamily: MONO, fontSize: 10, fontWeight: 700,
      padding: "3px 10px", borderRadius: 3,
      letterSpacing: "0.1em", whiteSpace: "nowrap",
    }}>{children}</span>
  )
}

function SectionLabel({ children, accent }) {
  return (
    <div style={{
      fontFamily: MONO, fontSize: 10, fontWeight: 700,
      color: accent ? C.accent : C.textDim,
      letterSpacing: "0.18em", marginBottom: 10,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{
        display: "inline-block", width: 3, height: 12,
        background: accent ? C.accent : C.textDim, borderRadius: 1,
      }}/>
      {children}
    </div>
  )
}

function Timeline({ eventos }) {
  if (!eventos?.length) return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      height: 160, gap: 12,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: "50%",
        border: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: C.textDim, fontSize: 18,
      }}>◷</div>
      <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, letterSpacing: "0.1em" }}>
        NENHUM EVENTO EXTRAÍDO
      </span>
    </div>
  )

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {eventos.map((ev, i) => {
        const crit = CRITICIDADE_MAP[ev.criticidade] || CRITICIDADE_MAP["BAIXA"]
        const icone = TIPO_ICONE[ev.tipo_evento] || "◆"
        const isLast = i === eventos.length - 1

        return (
          <div key={i} style={{ display: "flex", gap: 14, position: "relative" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20, flexShrink: 0 }}>
              <div style={{
                width: 10, height: 10, borderRadius: "50%",
                background: crit.color, marginTop: 6, flexShrink: 0,
                boxShadow: `0 0 8px ${crit.color}66`,
              }}/>
              {!isLast && <div style={{ width: 1, flex: 1, background: C.border, minHeight: 24, marginTop: 4 }}/>}
            </div>

            <div style={{
              flex: 1, marginBottom: isLast ? 0 : 14,
              background: crit.bg,
              border: `1px solid ${C.border}`,
              borderLeft: `2px solid ${crit.border}`,
              borderRadius: 6, padding: "12px 14px",
            }}>
              <div style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 6,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: crit.color, fontSize: 13, fontWeight: 700 }}>{icone}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.12em" }}>
                    {ev.tipo_evento}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Badge color={crit.color} bg={crit.bg} border={`${crit.color}44`}>
                    {ev.criticidade}
                  </Badge>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>
                    {ev.data_isolada !== "DATA_INCERTA" ? ev.data_isolada : "⚠ INCERTA"}
                  </span>
                </div>
              </div>

              <p style={{ fontFamily: SANS, fontSize: 13, color: C.text, margin: "0 0 8px 0", lineHeight: 1.65 }}>
                {ev.descricao_analitica}
              </p>

              {ev.data_texto_original && (
                <p style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, margin: "0 0 10px 0", fontStyle: "italic" }}>
                  "{ev.data_texto_original}"
                </p>
              )}

              {(ev.entidades?.atores?.length > 0 || ev.entidades?.locais?.length > 0 || ev.entidades?.organizacoes?.length > 0) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {ev.entidades?.atores?.map((a, j) => (
                    <span key={`a${j}`} style={{
                      fontFamily: MONO, fontSize: 10, padding: "2px 8px", borderRadius: 3,
                      background: "rgba(239,68,68,0.1)", color: "#FCA5A5",
                      border: "1px solid rgba(239,68,68,0.25)",
                    }}>● {a}</span>
                  ))}
                  {ev.entidades?.locais?.map((l, j) => (
                    <span key={`l${j}`} style={{
                      fontFamily: MONO, fontSize: 10, padding: "2px 8px", borderRadius: 3,
                      background: "rgba(59,130,246,0.1)", color: "#93C5FD",
                      border: "1px solid rgba(59,130,246,0.25)",
                    }}>◎ {l}</span>
                  ))}
                  {ev.entidades?.organizacoes?.map((o, j) => (
                    <span key={`o${j}`} style={{
                      fontFamily: MONO, fontSize: 10, padding: "2px 8px", borderRadius: 3,
                      background: "rgba(16,185,129,0.1)", color: "#6EE7B7",
                      border: "1px solid rgba(16,185,129,0.25)",
                    }}>▲ {o}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function Grafoscopia({ onNavigate }) {
  const [arquivo,    setArquivo]    = useState(null)
  const [preview,    setPreview]    = useState(null)
  const [tipoDoc,    setTipoDoc]    = useState("desconhecido")
  const [contexto,   setContexto]   = useState("")
  const [resultado,  setResultado]  = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [erro,       setErro]       = useState(null)
  const [dragOver,   setDragOver]   = useState(false)
  const inputRef = useRef(null)

  function aoSelecionarArquivo(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setArquivo(file); setResultado(null); setErro(null)
    setPreview(URL.createObjectURL(file))
  }

  function aoSoltar(e) {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith("image/")) {
      setArquivo(file); setResultado(null); setErro(null)
      setPreview(URL.createObjectURL(file))
    }
  }

  async function aoDecifrar() {
    if (!arquivo) return
    setCarregando(true); setErro(null); setResultado(null)
    try {
      const form = new FormData()
      form.append("imagem", arquivo)
      form.append("tipo_documento", tipoDoc)
      form.append("contexto_extra", contexto)
      const res = await api.upload("/decifrar", form)
      if (!res || !res.ok) {
        const d = await res?.json().catch(() => ({}))
        throw new Error(d?.detail || `Erro ${res?.status}`)
      }
      const raw = await res.json()
      const texto = raw.texto_transcrito || (typeof raw.transcricao === "string" ? raw.transcricao : "") || ""
      setResultado({ ...raw, transcricao: texto })
    } catch (e) { setErro(e.message) }
    finally { setCarregando(false) }
  }

  function aoLimpar() {
    setArquivo(null); setPreview(null); setResultado(null)
    setErro(null); setContexto(""); setTipoDoc("desconhecido")
    if (inputRef.current) inputRef.current.value = ""
  }

  function exportarTxt() {
    if (!resultado) return
    const linhas = [
      "LAUDO DE ANÁLISE GRAFOSCÓPICA — AGENT BASTOS",
      "=".repeat(56),
      `Gerado em:  ${new Date().toLocaleString("pt-BR")}`,
      `Arquivo:    ${resultado.metadados?.arquivo || "—"}`,
      `Tipo:       ${resultado.metadados?.tipo_documento || "—"}`,
      `Confiança:  ${resultado.confianca?.toUpperCase() || "—"}`,
      `Revisão:    ${resultado.requer_revisao_humana ? "NECESSÁRIA" : "Não necessária"}`,
      "", "TRANSCRIÇÃO FORENSE", "-".repeat(56),
      resultado.transcricao || "",
      "", "PARECER GRAFOSCÓPICO", "-".repeat(56),
      resultado.parecer_grafoscopico || "Não disponível.",
      "", "LINHA DO TEMPO", "-".repeat(56),
      ...(resultado.linha_do_tempo?.length
        ? resultado.linha_do_tempo.map((ev, i) =>
            `[${ev.criticidade}] ${ev.data_isolada} — ${ev.tipo_evento}\n${ev.descricao_analitica}\n`)
        : ["Nenhum evento extraído."]),
    ]
    const blob = new Blob([linhas.join("\n")], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
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
    doc.text("Agent Bastos — Sistema de Inteligência", ML, y); y += 4
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, ML, y); y += 2
    doc.setDrawColor(180); doc.line(ML, y + 2, PW - MR, y + 2); y += 7
    doc.setTextColor(0); doc.setFontSize(8)
    const meta = [
      ["Arquivo", resultado.metadados?.arquivo || "—"],
      ["Tipo", resultado.metadados?.tipo_documento || "—"],
      ["Confiança", resultado.confianca?.toUpperCase() || "—"],
      ["Revisão", resultado.requer_revisao_humana ? "NECESSÁRIA" : "Não necessária"],
    ]
    meta.forEach(([k, v]) => {
      doc.setFont("courier", "bold"); doc.text(`${k}:`, ML, y)
      doc.setFont("courier", "normal"); doc.text(v, ML + 24, y); y += 5
    }); y += 4
    const secao = (titulo) => {
      if (y > 265) { doc.addPage(); y = 20 }
      doc.setFont("courier", "bold"); doc.setFontSize(9); doc.setTextColor(100)
      doc.text(titulo, ML, y); y += 1
      doc.setDrawColor(180, 83, 9); doc.setLineWidth(0.5)
      doc.line(ML, y + 1, PW - MR, y + 1); y += 5
      doc.setFont("courier", "normal"); doc.setFontSize(9); doc.setTextColor(20)
    }
    secao("TRANSCRIÇÃO FORENSE")
    doc.splitTextToSize(resultado.transcricao || "", TW).forEach(l => {
      if (y > 275) { doc.addPage(); y = 20 }
      doc.text(l, ML, y); y += 5
    }); y += 4
    if (resultado.linha_do_tempo?.length) {
      secao("LINHA DO TEMPO ANALÍTICA")
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
    const total = doc.getNumberOfPages()
    for (let p = 1; p <= total; p++) {
      doc.setPage(p); doc.setFont("courier", "normal")
      doc.setFontSize(7); doc.setTextColor(160)
      doc.text(`Agent Bastos — Análise Grafoscópica — Pág. ${p}/${total} — CONFIDENCIAL`, PW / 2, 290, { align: "center" })
    }
    doc.save(`grafoscopia_${Date.now()}.pdf`)
  }

  const conf = resultado ? (CONFIANCA_MAP[resultado.confianca] || CONFIANCA_MAP.baixo) : null
  const temTimeline = resultado?.linha_do_tempo?.length > 0

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: SANS, color: C.text }}>

      {/* Header */}
      <div style={{
        background: C.headerBg, borderBottom: `1px solid ${C.border}`,
        padding: "0 32px", display: "flex", alignItems: "stretch",
        justifyContent: "space-between", height: 56,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          <div style={{
            width: 56, height: "100%", background: C.accent,
            display: "flex", alignItems: "center", justifyContent: "center",
            marginRight: 20, flexShrink: 0,
            clipPath: "polygon(0 0, 100% 0, 88% 100%, 0% 100%)",
          }}>
            <span style={{ fontSize: 20 }}>🔬</span>
          </div>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.2em" }}>
              AGENT BASTOS / FERRAMENTAS
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
              Análise Grafoscópica
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.success }}/>
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.1em" }}>
              GEMINI 2.5 FLASH
            </span>
          </div>
          <div style={{ height: 28, width: 1, background: C.border }}/>
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.1em" }}>
            TRANSCRIÇÃO FORENSE + CRONOLOGIA
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{
        maxWidth: 1280, margin: "0 auto", padding: "24px 28px",
        display: "flex", gap: 24, alignItems: "flex-start",
      }}>

        {/* Painel de controle */}
        <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={aoSoltar}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `1px solid ${dragOver ? C.accent : preview ? C.accentBorder : C.border}`,
              borderRadius: 6,
              background: dragOver ? C.accentDim : preview ? "transparent" : C.surface,
              minHeight: 200, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              cursor: "pointer", overflow: "hidden", transition: "all .2s", position: "relative",
            }}
          >
            {preview ? (
              <>
                <img src={preview} alt="preview" style={{ width: "100%", maxHeight: 260, objectFit: "contain" }} />
                <div style={{
                  position: "absolute", bottom: 0, left: 0, right: 0,
                  background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
                  padding: "20px 12px 10px",
                  fontFamily: MONO, fontSize: 10, color: C.textMid,
                }}>
                  {arquivo?.name}
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "0 24px" }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 8, border: `1px solid ${C.border}`,
                  background: C.surfaceUp, display: "flex", alignItems: "center",
                  justifyContent: "center", margin: "0 auto 12px", fontSize: 20,
                }}>📄</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMid, lineHeight: 1.6 }}>
                  Arraste o documento<br/>ou clique para selecionar
                </div>
                <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.15em" }}>
                  JPEG · PNG · WEBP · GIF
                </div>
              </div>
            )}
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: "none" }} onChange={aoSelecionarArquivo} />
          </div>

          {/* Tipo */}
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.18em", marginBottom: 6 }}>
              TIPO DE DOCUMENTO
            </div>
            <select value={tipoDoc} onChange={e => setTipoDoc(e.target.value)} style={{
              width: "100%", padding: "9px 12px", fontFamily: MONO, fontSize: 11, color: C.text,
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 4, cursor: "pointer", outline: "none", appearance: "none",
            }}>
              {TIPO_DOC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Contexto */}
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.18em", marginBottom: 6 }}>
              CONTEXTO OPERACIONAL
              <span style={{ color: C.textDim, marginLeft: 6, fontWeight: 400 }}>/ OPCIONAL</span>
            </div>
            <textarea value={contexto} onChange={e => setContexto(e.target.value)}
              placeholder="Ex: Apreendido em abordagem, zona norte, 09/05/2026"
              maxLength={500} rows={3} style={{
                width: "100%", padding: "9px 12px", fontFamily: MONO, fontSize: 11, color: C.text,
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 4, resize: "vertical", boxSizing: "border-box", outline: "none", lineHeight: 1.6,
              }} />
          </div>

          {/* Botão */}
          <button onClick={aoDecifrar} disabled={!arquivo || carregando} style={{
            padding: "11px 0",
            background: !arquivo || carregando ? C.surface : `linear-gradient(135deg, ${C.accent} 0%, ${C.accentHover} 100%)`,
            color: !arquivo || carregando ? C.textDim : "#fff",
            border: `1px solid ${!arquivo || carregando ? C.border : C.accent}`,
            borderRadius: 4, fontFamily: MONO, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.15em", cursor: !arquivo || carregando ? "not-allowed" : "pointer",
            transition: "all .2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            {carregando ? (
              <>
                <span style={{
                  width: 12, height: 12, border: `2px solid ${C.textDim}`,
                  borderTopColor: C.accent, borderRadius: "50%",
                  animation: "spin 0.8s linear infinite", display: "inline-block",
                }}/>
                PROCESSANDO...
              </>
            ) : "▶  INICIAR ANÁLISE"}
          </button>

          {arquivo && (
            <button onClick={aoLimpar} style={{
              padding: "9px 0", background: "transparent", border: `1px solid ${C.border}`,
              borderRadius: 4, fontFamily: MONO, fontSize: 10, color: C.textDim,
              cursor: "pointer", letterSpacing: "0.12em", transition: "border-color .2s",
            }}
              onMouseOver={e => e.currentTarget.style.borderColor = C.borderHover}
              onMouseOut={e => e.currentTarget.style.borderColor = C.border}
            >LIMPAR</button>
          )}

          {/* Info box */}
          <div style={{
            background: C.accentDim, border: `1px solid ${C.accentBorder}`,
            borderLeft: `3px solid ${C.accent}`, borderRadius: 4, padding: "12px 14px", marginTop: 4,
          }}>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.accent, letterSpacing: "0.18em", marginBottom: 8 }}>
              CAPACIDADES DO MÓDULO
            </div>
            {[
              "Transcrição forense fiel ao original",
              "Extração de cronologia e eventos",
              "Mapeamento de atores e locais",
              "Classificação de criticidade operacional",
            ].map((item, i) => (
              <div key={i} style={{
                fontFamily: MONO, fontSize: 10, color: C.textMid,
                padding: "4px 0", lineHeight: 1.5,
                borderBottom: i < 3 ? `1px solid ${C.border}` : "none",
                display: "flex", gap: 8, alignItems: "flex-start",
              }}>
                <span style={{ color: C.accent, flexShrink: 0 }}>›</span>{item}
              </div>
            ))}
          </div>
        </div>

        {/* Área de resultado */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Estado vazio */}
          {!resultado && !erro && !carregando && (
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", minHeight: 420, gap: 16,
            }}>
              <div style={{
                width: 60, height: 60, border: `1px solid ${C.border}`, borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: C.surfaceUp, fontSize: 28,
              }}>🔍</div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMid, letterSpacing: "0.1em", marginBottom: 6 }}>
                  AGUARDANDO DOCUMENTO
                </div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>
                  Selecione uma imagem para iniciar a análise forense
                </div>
              </div>
            </div>
          )}

          {/* Erro */}
          {erro && (
            <div style={{
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
              borderLeft: "3px solid #EF4444", borderRadius: 4, padding: "14px 18px",
              fontFamily: MONO, fontSize: 11, color: "#FCA5A5",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ fontSize: 16 }}>⚠</span> {erro}
            </div>
          )}

          {/* Resultado */}
          {resultado && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, animation: "fadeIn .25s ease" }}>

              {/* Barra de status */}
              <div style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 4, padding: "10px 16px",
                display: "flex", alignItems: "center",
                justifyContent: "space-between", flexWrap: "wrap", gap: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {conf && (
                    <Badge color={conf.color} bg={conf.bg} border={conf.border}>
                      CONFIANÇA {conf.label}
                    </Badge>
                  )}
                  {temTimeline && (
                    <Badge color="#6EE7B7" bg="rgba(16,185,129,0.1)" border="rgba(16,185,129,0.3)">
                      {resultado.linha_do_tempo.length} EVENTO{resultado.linha_do_tempo.length > 1 ? "S" : ""} EXTRAÍDO{resultado.linha_do_tempo.length > 1 ? "S" : ""}
                    </Badge>
                  )}
                  {resultado.requer_revisao_humana && (
                    <Badge color="#F59E0B" bg="rgba(245,158,11,0.1)" border="rgba(245,158,11,0.3)">
                      ⚠ REVISÃO NECESSÁRIA
                    </Badge>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={exportarTxt} style={{
                    padding: "6px 14px", background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 4, fontFamily: MONO, fontSize: 10, color: C.textMid,
                    cursor: "pointer", letterSpacing: "0.1em", transition: "all .2s",
                  }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = C.borderHover; e.currentTarget.style.color = C.text }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMid }}
                  >EXPORTAR .TXT</button>
                  <button onClick={exportarPdf} style={{
                    padding: "6px 14px",
                    background: `linear-gradient(135deg, ${C.accent}, ${C.accentHover})`,
                    border: `1px solid ${C.accent}`, borderRadius: 4,
                    fontFamily: MONO, fontSize: 10, color: "#fff",
                    cursor: "pointer", letterSpacing: "0.1em", transition: "opacity .2s",
                  }}
                    onMouseOver={e => e.currentTarget.style.opacity = ".85"}
                    onMouseOut={e => e.currentTarget.style.opacity = "1"}
                  >EXPORTAR .PDF</button>
                </div>
              </div>

              {/* Split-screen */}
              <div style={{
                display: "grid",
                gridTemplateColumns: temTimeline ? "1fr 1fr" : "1fr",
                gap: 14, alignItems: "start",
              }}>

                {/* Coluna esquerda */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                  {/* Transcrição */}
                  <div style={{
                    background: C.surface, border: `1px solid ${C.border}`,
                    borderTop: `2px solid ${C.accent}`, borderRadius: 4, padding: "14px 16px",
                  }}>
                    <SectionLabel accent>TRANSCRIÇÃO FORENSE</SectionLabel>
                    <pre style={{
                      fontFamily: MONO, fontSize: 13, color: C.text,
                      whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.9,
                      maxHeight: 280, overflowY: "auto", paddingRight: 6,
                    }}>
                      {resultado.transcricao}
                    </pre>
                  </div>

                  {/* Parecer */}
                  {resultado.parecer_grafoscopico && (
                    <div style={{
                      background: C.surface, border: `1px solid ${C.border}`,
                      borderTop: `2px solid #6366F1`, borderRadius: 4, padding: "14px 16px",
                    }}>
                      <SectionLabel>PARECER GRAFOSCÓPICO</SectionLabel>
                      <p style={{ fontFamily: SANS, fontSize: 13.5, color: C.text, margin: 0, lineHeight: 1.7 }}>
                        {resultado.parecer_grafoscopico}
                      </p>
                    </div>
                  )}
                </div>

                {/* Coluna direita — timeline + trechos duvidosos + observações */}
                {temTimeline && (
                  <div style={{
                    background: C.surface, border: `1px solid ${C.border}`,
                    borderTop: `2px solid #10B981`, borderRadius: 4, padding: "14px 16px",
                    display: "flex", flexDirection: "column", gap: 12,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <SectionLabel>LINHA DO TEMPO ANALÍTICA</SectionLabel>
                      <span style={{
                        fontFamily: MONO, fontSize: 9, color: "#10B981",
                        background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)",
                        padding: "3px 10px", borderRadius: 3, letterSpacing: "0.1em",
                      }}>
                        {resultado.linha_do_tempo.length} EVENTO{resultado.linha_do_tempo.length > 1 ? "S" : ""}
                      </span>
                    </div>
                    <div style={{ overflowY: "auto", paddingRight: 4 }}>
                      <Timeline eventos={resultado.linha_do_tempo} />
                    </div>

                    {/* Trechos duvidosos — abaixo da timeline */}
                    {resultado.trechos_duvidosos?.length > 0 && (
                      <div style={{
                        background: "rgba(245,158,11,0.05)",
                        border: `1px solid rgba(245,158,11,0.2)`,
                        borderLeft: `2px solid #F59E0B`,
                        borderRadius: 4, padding: "14px 16px",
                      }}>
                        <SectionLabel>TRECHOS DUVIDOSOS ({resultado.trechos_duvidosos.length})</SectionLabel>
                        {resultado.trechos_duvidosos.map((t, i) => (
                          <div key={i} style={{
                            fontFamily: MONO, fontSize: 12, color: C.text,
                            padding: "5px 0",
                            borderBottom: i < resultado.trechos_duvidosos.length - 1 ? `1px solid ${C.border}` : "none",
                            display: "flex", gap: 8,
                          }}>
                            <span style={{ color: "#F59E0B", flexShrink: 0 }}>{i + 1}.</span> {t}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Observações — abaixo dos trechos */}
                    {resultado.observacoes && (
                      <div style={{
                        background: C.surfaceUp, border: `1px solid ${C.border}`,
                        borderRadius: 4, padding: "14px 16px",
                      }}>
                        <SectionLabel>OBSERVAÇÕES FORENSES</SectionLabel>
                        <p style={{ fontFamily: SANS, fontSize: 13.5, color: C.text, margin: 0, lineHeight: 1.7 }}>
                          {resultado.observacoes}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Metadados rodapé */}
              <div style={{
                display: "flex", gap: 6, flexWrap: "wrap",
                padding: "10px 0", borderTop: `1px solid ${C.border}`,
              }}>
                {[
                  ["ARQ",    resultado.metadados?.arquivo],
                  ["TIPO",   resultado.metadados?.tipo_documento],
                  ["IDIOMA", resultado.idioma_detectado],
                  ["MODEL",  resultado.metadados?.modelo],
                  ["TS",     resultado.metadados?.timestamp?.slice(0, 19).replace("T", " ")],
                ].map(([k, v]) => v && (
                  <span key={k} style={{
                    background: C.surfaceUp, borderRadius: 3,
                    padding: "3px 10px", fontFamily: MONO, fontSize: 9,
                    color: C.textDim, border: `1px solid ${C.border}`,
                  }}>
                    <span style={{ color: C.textMid, marginRight: 4 }}>{k}:</span>{v}
                  </span>
                ))}
              </div>

            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        *::-webkit-scrollbar { width: 4px; height: 4px; }
        *::-webkit-scrollbar-track { background: transparent; }
        *::-webkit-scrollbar-thumb { background: #1E2D4A; border-radius: 2px; }
        select option { background: #0D1526; }
        textarea::placeholder { color: #3A4A6B; }
      `}</style>
    </div>
  )
}
