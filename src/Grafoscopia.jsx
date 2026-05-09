import { useState, useRef } from "react"

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
      const res = await fetch("http://localhost:8000/decifrar", {
        method: "POST",
        body: form,
      })
      if (!res.ok) {
        const detalhe = await res.json().catch(() => ({}))
        throw new Error(detalhe.detail || `Erro ${res.status}`)
      }
      setResultado(await res.json())
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

  const conf = resultado ? (CONFIANCA_COR[resultado.confianca] || CONFIANCA_COR.baixo) : null

  return (
    <div style={{
      minHeight: "100vh",
      background: "#F8FAFC",
      fontFamily: SANS,
    }}>
      {/* ── Header ── */}
      <div style={{
        background: "#FFF",
        borderBottom: "1px solid #E2E8F0",
        padding: "18px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 8,
            background: "#78350F",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>🔬</div>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: "#94A3B8", letterSpacing: "0.1em" }}>
              AGENT BASTOS / FERRAMENTAS
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em" }}>
              Análise Grafoscópica
            </div>
          </div>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: "#94A3B8" }}>
          Gemini 2.5 Flash · Transcrição Forense
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "32px 24px",
        display: "flex",
        gap: 28,
        alignItems: "flex-start",
        flexWrap: "wrap",
      }}>

        {/* ── Coluna esquerda: controles ── */}
        <div style={{ flex: "0 0 320px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Drop zone */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={aoSoltar}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${preview ? "#B45309" : "#CBD5E1"}`,
              borderRadius: 10,
              background: preview ? "#FFFBEB" : "#FFF",
              minHeight: 220,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              overflow: "hidden",
              transition: "border-color .2s",
            }}
          >
            {preview ? (
              <img
                src={preview}
                alt="preview"
                style={{ width: "100%", maxHeight: 280, objectFit: "contain" }}
              />
            ) : (
              <>
                <span style={{ fontSize: 36 }}>📄</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: "#64748B", marginTop: 10, textAlign: "center", padding: "0 20px" }}>
                  Arraste o documento ou clique para selecionar
                </span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: "#94A3B8", marginTop: 6 }}>
                  JPEG · PNG · WEBP · GIF
                </span>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: "none" }}
              onChange={aoSelecionarArquivo}
            />
          </div>

          {/* Tipo de documento */}
          <div>
            <label style={{ fontFamily: MONO, fontSize: 10, color: "#64748B", letterSpacing: "0.1em" }}>
              TIPO DE DOCUMENTO
            </label>
            <select
              value={tipoDoc}
              onChange={e => setTipoDoc(e.target.value)}
              style={{
                width: "100%", marginTop: 6, padding: "9px 12px",
                fontFamily: MONO, fontSize: 12, color: "#1E293B",
                background: "#F8FAFC", border: "1px solid #E2E8F0",
                borderRadius: 6, cursor: "pointer", outline: "none",
              }}
            >
              {TIPO_DOC_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Contexto operacional */}
          <div>
            <label style={{ fontFamily: MONO, fontSize: 10, color: "#64748B", letterSpacing: "0.1em" }}>
              CONTEXTO OPERACIONAL <span style={{ color: "#CBD5E1" }}>/ OPCIONAL</span>
            </label>
            <textarea
              value={contexto}
              onChange={e => setContexto(e.target.value)}
              placeholder="Ex: Apreendido em abordagem, zona norte, 09/05/2026"
              maxLength={500}
              rows={3}
              style={{
                width: "100%", marginTop: 6, padding: "9px 12px",
                fontFamily: MONO, fontSize: 11, color: "#1E293B",
                background: "#F8FAFC", border: "1px solid #E2E8F0",
                borderRadius: 6, resize: "vertical", boxSizing: "border-box",
                outline: "none",
              }}
            />
          </div>

          {/* Botão analisar */}
          <button
            onClick={aoDecifrar}
            disabled={!arquivo || carregando}
            style={{
              padding: "13px 0",
              background: !arquivo || carregando ? "#E2E8F0" : "#78350F",
              color: !arquivo || carregando ? "#94A3B8" : "#FFF",
              border: "none", borderRadius: 8,
              fontFamily: MONO, fontSize: 12, fontWeight: 700,
              letterSpacing: "0.08em",
              cursor: !arquivo || carregando ? "not-allowed" : "pointer",
              transition: "background .2s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {carregando ? (
              <>
                <span style={{
                  width: 13, height: 13,
                  border: "2px solid #94A3B8",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                  display: "inline-block",
                }} />
                ANALISANDO...
              </>
            ) : "INICIAR ANÁLISE"}
          </button>

          {arquivo && (
            <button
              onClick={aoLimpar}
              style={{
                padding: "9px 0", background: "transparent",
                border: "1px solid #E2E8F0", borderRadius: 8,
                fontFamily: MONO, fontSize: 11, color: "#64748B",
                cursor: "pointer",
              }}
            >
              LIMPAR
            </button>
          )}

          {/* Info box */}
          <div style={{
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            borderRadius: 8, padding: "12px 14px",
          }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: "#92400E", letterSpacing: "0.08em", marginBottom: 6 }}>
              SOBRE ESTE MÓDULO
            </div>
            <p style={{ fontFamily: MONO, fontSize: 11, color: "#78350F", margin: 0, lineHeight: 1.7 }}>
              Utiliza visão computacional para transcrição forense de manuscritos apreendidos.
              Preserva grafia original, identifica codinomes e sinaliza trechos duvidosos.
            </p>
          </div>
        </div>

        {/* ── Coluna direita: resultado ── */}
        <div style={{ flex: 1, minWidth: 300 }}>

          {/* Erro */}
          {erro && (
            <div style={{
              background: "#FEE2E2", border: "1px solid #FCA5A5",
              borderRadius: 8, padding: "14px 18px",
              fontFamily: MONO, fontSize: 12, color: "#B91C1C",
            }}>
              ⚠ {erro}
            </div>
          )}

          {/* Estado vazio */}
          {!resultado && !erro && !carregando && (
            <div style={{
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              height: 360, color: "#CBD5E1",
              border: "1px dashed #E2E8F0", borderRadius: 10,
              background: "#FFF",
            }}>
              <span style={{ fontSize: 48 }}>🔍</span>
              <span style={{ fontFamily: MONO, fontSize: 11, marginTop: 16, color: "#94A3B8" }}>
                Selecione um documento para iniciar a análise forense
              </span>
            </div>
          )}

          {/* Resultado */}
          {resultado && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeIn .22s ease" }}>

              {/* Header resultado */}
              <div style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between", flexWrap: "wrap", gap: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{
                    background: conf.bg, color: conf.text,
                    border: `1px solid ${conf.border}`,
                    fontFamily: MONO, fontSize: 10, fontWeight: 700,
                    padding: "4px 12px", borderRadius: 20, letterSpacing: "0.1em",
                  }}>
                    CONFIANÇA {resultado.confianca?.toUpperCase()}
                  </span>
                  {resultado.requer_revisao_humana && (
                    <span style={{
                      background: "#FEF9C3", color: "#92400E",
                      border: "1px solid #FDE047",
                      fontFamily: MONO, fontSize: 10, fontWeight: 600,
                      padding: "4px 12px", borderRadius: 20, letterSpacing: "0.08em",
                    }}>
                      ⚠ REVISÃO NECESSÁRIA
                    </span>
                  )}
                </div>
                <button
                  onClick={exportarTxt}
                  style={{
                    background: "#1E293B", color: "#FFF", border: "none",
                    borderRadius: 6, padding: "7px 16px",
                    fontFamily: MONO, fontSize: 10, cursor: "pointer",
                    letterSpacing: "0.08em", transition: "opacity .2s",
                  }}
                  onMouseOver={e => e.target.style.opacity = ".8"}
                  onMouseOut={e => e.target.style.opacity = "1"}
                >
                  EXPORTAR .TXT
                </button>
              </div>

              {/* Transcrição */}
              <div style={{
                background: "#FFF",
                border: "1px solid #E2E8F0",
                borderLeft: "3px solid #B45309",
                borderRadius: 8, padding: "18px 20px",
              }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: "#94A3B8", letterSpacing: "0.1em", marginBottom: 12 }}>
                  TRANSCRIÇÃO FORENSE
                </div>
                <pre style={{
                  fontFamily: MONO, fontSize: 13, color: "#1E293B",
                  whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.8,
                }}>
                  {resultado.transcricao}
                </pre>
              </div>

              {/* Observações */}
              {resultado.observacoes && (
                <div style={{
                  background: "#F8FAFC", border: "1px solid #E2E8F0",
                  borderRadius: 8, padding: "14px 18px",
                }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: "#94A3B8", letterSpacing: "0.1em", marginBottom: 8 }}>
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
                  background: "#FFFBEB", border: "1px solid #FDE68A",
                  borderRadius: 8, padding: "14px 18px",
                }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: "#92400E", letterSpacing: "0.1em", marginBottom: 10 }}>
                    TRECHOS DUVIDOSOS ({resultado.trechos_duvidosos.length})
                  </div>
                  {resultado.trechos_duvidosos.map((t, i) => (
                    <div key={i} style={{
                      fontFamily: MONO, fontSize: 12, color: "#78350F",
                      padding: "5px 0",
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
                    background: "#F1F5F9", borderRadius: 6,
                    padding: "4px 10px", fontFamily: MONO, fontSize: 10, color: "#475569",
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
      `}</style>
    </div>
  )
}
