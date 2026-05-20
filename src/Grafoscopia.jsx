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
      const texto = raw.texto_transcrito || (typeof raw.transcricao === 'string' ? raw.transcricao : '') || ''
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

  // ── Exportar TXT ──────────────────────────────────────────────────────────
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
      "── OBSERVAÇÕES FORENSES " + "─".repeat(28),
      resultado.observacoes || "Nenhuma.",
      "",
      "── TRECHOS DUVIDOSOS " + "─".repeat(31),
      ...(resultado.trechos_duvidosos?.length
        ? resultado.trechos_duvidosos.map((t, i) => `  ${i + 1}. ${t}`)
        : ["  Nenhum."]),
    ]
    const blob = new Blob([linhas.join("\n")], { type: "text/plain;charset=utf-8" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = `grafoscopia_${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Exportar PDF ──────────────────────────────────────────────────────────
  // jsPDF trabalha com coordenadas em mm. Usamos fonte Courier (monospace
  // nativa) para manter a identidade forense do laudo.
  function exportarPdf() {
    if (!resultado) return

    const doc  = new jsPDF({ unit: "mm", format: "a4" })
    const PW   = 210  // largura A4
    const ML   = 18   // margem esquerda
    const MR   = 18   // margem direita
    const TW   = PW - ML - MR  // largura útil
    let   y    = 20   // cursor vertical

    // Cabeçalho
    doc.setFont("courier", "bold")
    doc.setFontSize(13)
    doc.text("LAUDO DE ANÁLISE GRAFOSCÓPICA", ML, y)
    y += 6

    doc.setFont("courier", "normal")
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text("Agent Bastos — Sistema de Inteligência de Segurança", ML, y)
    y += 4
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, ML, y)
    y += 2

    // Linha separadora
    doc.setDrawColor(180)
    doc.line(ML, y + 2, PW - MR, y + 2)
    y += 7

    // Metadados em grid
    doc.setTextColor(0)
    doc.setFontSize(8)
    const meta = [
      ["Arquivo",    resultado.metadados?.arquivo    || "—"],
      ["Tipo",       resultado.metadados?.tipo_documento || "—"],
      ["Modelo IA",  resultado.metadados?.modelo     || "—"],
      ["Confiança",  resultado.confianca?.toUpperCase() || "—"],
      ["Revisão",    resultado.requer_revisao_humana ? "NECESSÁRIA" : "Não necessária"],
      ["Idioma",     resultado.idioma_detectado      || "—"],
    ]
    meta.forEach(([k, v]) => {
      doc.setFont("courier", "bold")
      doc.text(`${k}:`, ML, y)
      doc.setFont("courier", "normal")
      doc.text(v, ML + 28, y)
      y += 5
    })
    y += 2

    // Seção: Transcrição
    doc.setFont("courier", "bold")
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text("TRANSCRIÇÃO FORENSE", ML, y)
    y += 1
    doc.setDrawColor(180, 83, 9)
    doc.setLineWidth(0.5)
    doc.line(ML, y + 1, PW - MR, y + 1)
    y += 5

    doc.setFont("courier", "normal")
    doc.setFontSize(9)
    doc.setTextColor(20)
    // splitTextToSize quebra o texto na largura útil automaticamente
    const linhasTranscricao = doc.splitTextToSize(resultado.transcricao || "", TW)
    linhasTranscricao.forEach(linha => {
      if (y > 275) { doc.addPage(); y = 20 }  // nova página se necessário
      doc.text(linha, ML, y)
      y += 5
    })
    y += 4

    // Seção: Observações
    if (resultado.observacoes) {
      doc.setFont("courier", "bold")
      doc.setFontSize(9)
      doc.setTextColor(100)
      doc.text("OBSERVAÇÕES FORENSES", ML, y)
      y += 1
      doc.setDrawColor(200)
      doc.setLineWidth(0.3)
      doc.line(ML, y + 1, PW - MR, y + 1)
      y += 5

      doc.setFont("courier", "normal")
      doc.setTextColor(20)
      const linhasObs = doc.splitTextToSize(resultado.observacoes, TW)
      linhasObs.forEach(linha => {
        if (y > 275) { doc.addPage(); y = 20 }
        doc.text(linha, ML, y)
        y += 5
      })
      y += 4
    }

    // Seção: Trechos duvidosos
    if (resultado.trechos_duvidosos?.length > 0) {
      doc.setFont("courier", "bold")
      doc.setFontSize(9)
      doc.setTextColor(100)
      doc.text(`TRECHOS DUVIDOSOS (${resultado.trechos_duvidosos.length})`, ML, y)
      y += 1
      doc.setDrawColor(200)
      doc.line(ML, y + 1, PW - MR, y + 1)
      y += 5

      doc.setFont("courier", "normal")
      doc.setTextColor(20)
      resultado.trechos_duvidosos.forEach((t, i) => {
        if (y > 275) { doc.addPage(); y = 20 }
        doc.text(`${i + 1}. ${t}`, ML, y)
        y += 5
      })
    }

    // Rodapé em todas as páginas
    const totalPaginas = doc.getNumberOfPages()
    for (let p = 1; p <= totalPaginas; p++) {
      doc.setPage(p)
      doc.setFont("courier", "normal")
      doc.setFontSize(7)
      doc.setTextColor(160)
      doc.text(
        `Agent Bastos — Análise Grafoscópica — Página ${p}/${totalPaginas} — CONFIDENCIAL`,
        PW / 2, 290, { align: "center" }
      )
    }

    doc.save(`grafoscopia_${Date.now()}.pdf`)
  }

  const conf = resultado ? (CONFIANCA_COR[resultado.confianca] || CONFIANCA_COR.baixo) : null

  return (
    <div style={{ minHeight: "100vh", background: "#0B1120", fontFamily: SANS }}>

      {/* ── Header ── */}
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
            <div style={{ fontFamily: MONO, fontSize: 14.3, color: "#94A3B8", letterSpacing: "0.1em" }}>
              AGENT BASTOS / FERRAMENTAS
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#F1F5F9", letterSpacing: "-0.02em" }}>
              Análise Grafoscópica
            </div>
          </div>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 14.3, color: "#94A3B8" }}>
          Gemini 2.5 Flash · Transcrição Forense
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{
        maxWidth: 1100, margin: "0 auto", padding: "32px 24px",
        display: "flex", gap: 28, alignItems: "flex-start", flexWrap: "wrap",
      }}>

        {/* ── Coluna esquerda ── */}
        <div style={{ flex: "0 0 320px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Drop zone */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={aoSoltar}
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
                <span style={{ fontFamily: MONO, fontSize: 15.6, color: "#64748B", marginTop: 10, textAlign: "center", padding: "0 20px" }}>
                  Arraste o documento ou clique para selecionar
                </span>
                <span style={{ fontFamily: MONO, fontSize: 16.9, color: "#94A3B8", marginTop: 6 }}>
                  JPEG · PNG · WEBP · GIF
                </span>
              </>
            )}
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: "none" }} onChange={aoSelecionarArquivo} />
          </div>

          {/* Tipo de documento */}
          <div>
            <label style={{ fontFamily: MONO, fontSize: 16.9, color: "#64748B", letterSpacing: "0.1em" }}>
              TIPO DE DOCUMENTO
            </label>
            <select value={tipoDoc} onChange={e => setTipoDoc(e.target.value)} style={{
              width: "100%", marginTop: 6, padding: "9px 12px",
              fontFamily: MONO, fontSize: 15.6, color: "#F1F5F9",
              background: "#0B1120", border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 6, cursor: "pointer", outline: "none",
            }}>
              {TIPO_DOC_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Contexto */}
          <div>
            <label style={{ fontFamily: MONO, fontSize: 16.9, color: "#64748B", letterSpacing: "0.1em" }}>
              CONTEXTO OPERACIONAL <span style={{ color: "#CBD5E1" }}>/ OPCIONAL</span>
            </label>
            <textarea value={contexto} onChange={e => setContexto(e.target.value)}
              placeholder="Ex: Apreendido em abordagem, zona norte, 09/05/2026"
              maxLength={500} rows={3} style={{
                width: "100%", marginTop: 6, padding: "9px 12px",
                fontFamily: MONO, fontSize: 14.3, color: "#F1F5F9",
                background: "#0B1120", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 6, resize: "vertical", boxSizing: "border-box", outline: "none",
              }} />
          </div>

          {/* Botão analisar */}
          <button onClick={aoDecifrar} disabled={!arquivo || carregando} style={{
            padding: "13px 0",
            background: !arquivo || carregando ? "#E2E8F0" : "#78350F",
            color: !arquivo || carregando ? "#94A3B8" : "#FFF",
            border: "none", borderRadius: 8,
            fontFamily: MONO, fontSize: 15.6, fontWeight: 700, letterSpacing: "0.08em",
            cursor: !arquivo || carregando ? "not-allowed" : "pointer",
            transition: "background .2s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            {carregando ? (
              <>
                <span style={{
                  width: 13, height: 13, border: "2px solid #94A3B8",
                  borderTopColor: "transparent", borderRadius: "50%",
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
              fontFamily: MONO, fontSize: 14.3, color: "#64748B", cursor: "pointer",
            }}>LIMPAR</button>
          )}

          {/* Info box */}
          <div style={{
            background: "rgba(232,160,32,0.10)", border: "1px solid #FDE68A",
            borderRadius: 8, padding: "12px 14px",
          }}>
            <div style={{ fontFamily: MONO, fontSize: 16.9, color: "#E8A020", letterSpacing: "0.08em", marginBottom: 6 }}>
              SOBRE ESTE MÓDULO
            </div>
            <p style={{ fontFamily: MONO, fontSize: 14.3, color: "#F1F5F9", margin: 0, lineHeight: 1.7 }}>
              Utiliza visão computacional para transcrição forense de manuscritos apreendidos.
              Preserva grafia original, identifica codinomes e sinaliza trechos duvidosos.
            </p>
          </div>
        </div>

        {/* ── Coluna direita: resultado ── */}
        <div style={{ flex: 1, minWidth: 300 }}>

          {erro && (
            <div style={{
              background: "#FEE2E2", border: "1px solid #FCA5A5",
              borderRadius: 8, padding: "14px 18px",
              fontFamily: MONO, fontSize: 15.6, color: "#B91C1C",
            }}>⚠ {erro}</div>
          )}

          {!resultado && !erro && !carregando && (
            <div style={{
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              height: 360, color: "#CBD5E1",
              border: "1px dashed #E2E8F0", borderRadius: 10, background: "#FFF",
            }}>
              <span style={{ fontSize: 48 }}>🔍</span>
              <span style={{ fontFamily: MONO, fontSize: 14.3, marginTop: 16, color: "#94A3B8" }}>
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
                    fontFamily: MONO, fontSize: 16.9, fontWeight: 700,
                    padding: "4px 12px", borderRadius: 20, letterSpacing: "0.1em",
                  }}>
                    CONFIANÇA {resultado.confianca?.toUpperCase()}
                  </span>
                  {resultado.requer_revisao_humana && (
                    <span style={{
                      background: "#FEF9C3", color: "#E8A020", border: "1px solid #FDE047",
                      fontFamily: MONO, fontSize: 16.9, fontWeight: 600,
                      padding: "4px 12px", borderRadius: 20, letterSpacing: "0.08em",
                    }}>⚠ REVISÃO NECESSÁRIA</span>
                  )}
                </div>

                {/* Botões de exportação */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={exportarTxt} style={{
                    background: "#475569", color: "#FFF", border: "none",
                    borderRadius: 6, padding: "7px 14px",
                    fontFamily: MONO, fontSize: 16.9, cursor: "pointer",
                    letterSpacing: "0.08em", transition: "opacity .2s",
                  }}
                    onMouseOver={e => e.target.style.opacity = ".8"}
                    onMouseOut={e => e.target.style.opacity = "1"}
                  >
                    EXPORTAR .TXT
                  </button>
                  <button onClick={exportarPdf} style={{
                    background: "#B45309", color: "#FFF", border: "none",
                    borderRadius: 6, padding: "7px 14px",
                    fontFamily: MONO, fontSize: 16.9, cursor: "pointer",
                    letterSpacing: "0.08em", transition: "opacity .2s",
                  }}
                    onMouseOver={e => e.target.style.opacity = ".8"}
                    onMouseOut={e => e.target.style.opacity = "1"}
                  >
                    EXPORTAR .PDF
                  </button>
                </div>
              </div>

              {/* Transcrição — com scroll */}
              <div style={{
                background: "#FFF", border: "1px solid rgba(255,255,255,0.07)",
                borderLeft: "3px solid #B45309",
                borderRadius: 8, padding: "18px 20px",
              }}>
                <div style={{ fontFamily: MONO, fontSize: 16.9, color: "#94A3B8", letterSpacing: "0.1em", marginBottom: 12 }}>
                  TRANSCRIÇÃO FORENSE
                </div>
                {/* maxHeight + overflowY criam o scroll interno */}
                <pre style={{
                  fontFamily: MONO, fontSize: 16.9, color: "#F1F5F9",
                  whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.8,
                  maxHeight: 420,
                  overflowY: "auto",
                  paddingRight: 8,
                }}>
                  {resultado.transcricao}
                </pre>
              </div>

              {/* Observações */}
              {resultado.observacoes && (
                <div style={{
                  background: "#0B1120", border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 8, padding: "14px 18px",
                }}>
                  <div style={{ fontFamily: MONO, fontSize: 16.9, color: "#94A3B8", letterSpacing: "0.1em", marginBottom: 8 }}>
                    OBSERVAÇÕES FORENSES
                  </div>
                  <p style={{ fontFamily: SANS, fontSize: 16.9, color: "#475569", margin: 0, lineHeight: 1.7 }}>
                    {resultado.observacoes}
                  </p>
                </div>
              )}

              {/* Trechos duvidosos */}
              {resultado.trechos_duvidosos?.length > 0 && (
                <div style={{
                  background: "rgba(232,160,32,0.10)", border: "1px solid #FDE68A",
                  borderRadius: 8, padding: "14px 18px",
                }}>
                  <div style={{ fontFamily: MONO, fontSize: 16.9, color: "#E8A020", letterSpacing: "0.1em", marginBottom: 10 }}>
                    TRECHOS DUVIDOSOS ({resultado.trechos_duvidosos.length})
                  </div>
                  {resultado.trechos_duvidosos.map((t, i) => (
                    <div key={i} style={{
                      fontFamily: MONO, fontSize: 15.6, color: "#F1F5F9", padding: "5px 0",
                      borderBottom: i < resultado.trechos_duvidosos.length - 1 ? "1px solid #FDE68A" : "none",
                    }}>
                      {i + 1}. {t}
                    </div>
                  ))}
                </div>
              )}

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
                    padding: "4px 10px", fontFamily: MONO, fontSize: 16.9, color: "#475569",
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
        pre::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 4px; }
      `}</style>
    </div>
  )
}
