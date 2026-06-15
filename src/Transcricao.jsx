import { useState, useRef, useEffect } from "react"
import api from "./api"
const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const GLOBAL_CSS = `
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulse-rec {
    0%, 100% { box-shadow: 0 0 4px 2px rgba(220,38,38,0.4); }
    50%       { box-shadow: 0 0 16px 6px rgba(220,38,38,0.0); }
  }
  @keyframes wave {
    0%, 100% { transform: scaleY(0.35); }
    50%       { transform: scaleY(1); }
  }
  @keyframes progress-slide {
    from { width: 8%; }
    to   { width: 88%; }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .rec-pulse  { animation: pulse-rec 1.8s ease-in-out infinite; }
  .wave-bar   { animation: wave 0.7s ease-in-out infinite alternate; }
  .spin       { animation: spin 1s linear infinite; }
  .prog-bar   { animation: progress-slide 2.5s ease-in-out infinite alternate; }
  .enter      { animation: fadeIn 0.22s ease forwards; }
  .seg-row:hover    { background: #FFFBEB !important; }
  .flag-row:hover   { opacity: 0.88; }
  .export-btn:hover { opacity: 0.82 !important; }
  ::-webkit-scrollbar       { width: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 4px; }
`

// ─── Mock de demonstração ────────────────────────────────────────────────────
const MOCK = {
  laudo_number: "0124/2026",
  date: "26 de Abril de 2026",
  filename: "AUDIO_WAV_001.wav",
  duration: "00:00:41",
  speakers: [
    { id: "M1", label: "Voz masculina", role: "Investigado A" },
    { id: "M2", label: "Voz masculina", role: "Agente infiltrado" },
  ],
  segments: [
    { ts: "00:00:01", speaker: "M1", text: 'Ele disse que... que não ia, sabe? Que o "pacote" (sic) estaria no porto às duas. [pausa de 3 segundos] Você confirmou com o despachante?' },
    { ts: "00:00:12", speaker: "M2", text: "Tá tudo certo. O caminhão sai de lá com a nota fria. Ninguém desconfia de carga de... [ruído de tráfego intenso sobrepõe a fala]." },
    { ts: "00:00:20", speaker: "M1", text: "Ótimo. Não quero erros. Se a federal aparecer, você já sabe: [fala sussurrada] descarta o rádio e sai pelo fundo." },
    { ts: "00:00:28", speaker: "M2", text: "Entendido. [sons de batida de porta e ignição de veículo]." },
    { ts: "00:00:35", speaker: "M1", text: "Espera! [eleva o tom de voz] Onde está o celular que te dei?" },
    { ts: "00:00:39", speaker: "M2", text: "Tá no bolso. Por quê?" },
    { ts: "00:00:41", speaker: "M1", text: "[Ininteligível — 00:00:43]. Não usa essa porcaria pra ligar pra sua mulher, ouviu?" },
  ],
  risk_level: "ALTO",
  classification: "Planejamento Logístico Suspeito / Fraude Fiscal",
  summary: "O diálogo estabelece a coordenação de uma entrega no setor portuário. O Interlocutor M1 exerce coordenação sobre M2, instruindo-o sobre rotas de fuga e descarte de provas (rádio) em caso de intervenção policial. Há uma preocupação explícita com o uso de dispositivos de comunicação não autorizados (celular pessoal).",
  red_flags: [
    { id: 1, title: "Admissão de Ilegalidade", text: 'Uso do termo "Nota fria".' },
    { id: 2, title: "Protocolo de Contramedida", text: 'Instrução direta para "descartar o rádio".' },
    { id: 3, title: "Segurança de Comunicação", text: 'Reprimenda sobre uso do celular pessoal ("ligar para a mulher").' },
  ],
}

// ─── Timer ───────────────────────────────────────────────────────────────────
function useTimer(running) {
  const [s, setS] = useState(0)
  useEffect(() => {
    if (!running) { setS(0); return }
    const id = setInterval(() => setS(x => x + 1), 1000)
    return () => clearInterval(id)
  }, [running])
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
}

// ─── Cores de risco ───────────────────────────────────────────────────────────
const RISK = {
  ALTO:  { color: "#F87171", bg: "#FEF2F2", border: "#FCA5A5" },
  MÉDIO: { color: "#FBBF24", bg: "#FFFBEB", border: "#FCD34D" },
  BAIXO: { color: "#4ADE80", bg: "#F0FDF4", border: "#86EFAC" },
}
const risk = (level, key) => (RISK[level] || RISK.MÉDIO)[key]

// ─── Empty state SVG tipográfico (15% opacidade — padrão do sistema) ────────
const EmptyState = () => (
  <svg width="460" height="120" viewBox="0 0 460 120" fill="none"
    xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.15 }}>
    <text x="230" y="46" textAnchor="middle"
      fontFamily={SANS} fontSize="34" fontWeight="800" letterSpacing="5" fill="#1E293B">
      TRANSCRIÇÃO
    </text>
    <line x1="70" y1="58" x2="390" y2="58" stroke="#1E293B" strokeWidth="0.6" strokeDasharray="4 6"/>
    <text x="230" y="90" textAnchor="middle"
      fontFamily={MONO} fontSize="12" fontWeight="400" letterSpacing="3" fill="#1E293B">
      Audio Intelligence · Whisper · Diarização
    </text>
  </svg>
)

// ─── Waveform animado ────────────────────────────────────────────────────────
const RecWave = ({ small }) => {
  const bars = [10, 18, 28, 22, 34, 20, 30, 38, 24, 16, 32, 26, 36, 18, 28]
  return (
    <div style={{ display: "flex", alignItems: "center", gap: small ? 2 : 3, height: small ? 24 : 40 }}>
      {bars.map((h, i) => (
        <div key={i} className="wave-bar" style={{
          width: small ? 2 : 3, borderRadius: 2, background: "#DC2626",
          height: small ? h * 0.6 : h, animationDelay: `${i * 0.05}s`,
        }} />
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
export default function Transcricao({ onNavigate }) {
  const [stage, setStage] = useState("idle")
  const [audioFile, setAudioFile] = useState(null)
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const [exportStatus, setExportStatus] = useState({})
  const [activeFlag, setActiveFlag] = useState(null)

  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const fileInputRef = useRef(null)
  const timer = useTimer(stage === "recording")

  useEffect(() => {
    const style = document.createElement("style")
    style.textContent = GLOBAL_CSS
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  // ── Gravação ─────────────────────────────────────────────────────────────
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : "audio/webm"
      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        const file = new File([blob], `gravacao_${Date.now()}.webm`, { type: mimeType })
        stream.getTracks().forEach(t => t.stop())
        setAudioFile(file)
        processAudio(file)
      }
      mediaRecorderRef.current = recorder
      recorder.start(100)
      setStage("recording")
    } catch (err) {
      setErrorMsg("Microfone não disponível: " + err.message)
      setStage("error")
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setStage("processing")
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  function handleFileSelect(file) {
    if (!file) return
    setAudioFile(file)
    processAudio(file)
  }

  function handleDrop(e) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  // ── Processamento ─────────────────────────────────────────────────────────
  async function processAudio(file) {
    setStage("processing")
    setErrorMsg("")
    try {
      const form = new FormData()
      form.append("audio", file)
      const res = await api.upload("/transcribe", form)
      if (!res || !res.ok) throw new Error(`Erro ${res?.status}: ${res?.statusText}`)
      const data = await res.json()
      setResult(data)
      setStage("done")
    } catch (err) {
      setErrorMsg(err.message)
      setStage("error")
    }
  }

  // ── Exportar ──────────────────────────────────────────────────────────────
  async function exportReport(fmt) {
    if (!result) return
    setExportStatus(s => ({ ...s, [fmt]: "loading" }))
    try {
      const res = await api.post(`/export/${fmt}`, { transcript: result, filename: audioFile?.name })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `laudo_${(result.laudo_number || "").replace("/", "-")}.${fmt}`
      a.click()
      URL.revokeObjectURL(url)
      setExportStatus(s => ({ ...s, [fmt]: "done" }))
      setTimeout(() => setExportStatus(s => ({ ...s, [fmt]: null })), 3000)
    } catch {
      setExportStatus(s => ({ ...s, [fmt]: "error" }))
    }
  }

  function reset() {
    setStage("idle"); setAudioFile(null); setResult(null)
    setErrorMsg(""); setExportStatus({}); setActiveFlag(null)
  }

  function loadMock() {
    setStage("processing")
    setTimeout(() => {
      setAudioFile({ name: MOCK.filename })
      setResult(MOCK)
      setStage("done")
    }, 1800)
  }

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={S.page}>

      {/* ══ ASIDE ESQUERDO ══════════════════════════════════════════════════ */}
      <aside style={S.aside}>

        <div style={S.asideHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="#3730A3" strokeWidth="2" strokeLinecap="round">
              <path d="M2 12h2M6 8v8M10 5v14M14 9v6M18 7v10M22 12h-2"/>
            </svg>
            <span style={{ fontSize: 16.9, fontWeight: 800, color: "#94A3B8", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Transcrição
            </span>
          </div>
          <span style={{ fontSize: 9, color: "#818CF8", fontWeight: 700, fontFamily: MONO, background: "rgba(129,140,248,0.12)", padding: "2px 6px", borderRadius: 4, border: "1px solid #C7D2FE" }}>
            Whisper
          </span>
        </div>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

          {/* IDLE */}
          {stage === "idle" && (
            <div style={{ padding: "12px 12px 0" }}>

              <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: MONO, marginBottom: 6 }}>
                Gravação
              </div>
              <button onClick={startRecording} style={S.actionBtn}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8"/>
                </svg>
                <span style={{ fontSize: 14.3, fontWeight: 600, color: "#F87171" }}>Iniciar Gravação</span>
              </button>
              <div style={{ fontSize: 9, color: "#94A3B8", fontFamily: MONO, marginTop: 4, lineHeight: 1.4, paddingLeft: 2 }}>
                Captura em WebM/Opus — ideal para Whisper
              </div>

              <div style={{ height: 1, background: "#E2E8F0", margin: "12px 0" }} />

              <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: MONO, marginBottom: 6 }}>
                Upload de Arquivo
              </div>
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragging ? "#3730A3" : "#CBD5E1"}`,
                  borderRadius: 8, padding: "16px 10px", textAlign: "center",
                  cursor: "pointer", background: isDragging ? "#EEF2FF" : "#0B1120",
                  transition: "all 0.15s",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke={isDragging ? "#3730A3" : "#94A3B8"} strokeWidth="1.5" strokeLinecap="round"
                  style={{ marginBottom: 6 }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                </svg>
                <div style={{ fontSize: 14.3, fontWeight: 600, color: isDragging ? "#3730A3" : "#475569" }}>
                  {isDragging ? "Solte aqui" : "Arraste ou clique"}
                </div>
                <div style={{ fontSize: 9, color: "#94A3B8", fontFamily: MONO, marginTop: 3 }}>
                  WAV · MP3 · M4A · OGG · FLAC
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept=".wav,.mp3,.m4a,.ogg,.flac,.webm"
                style={{ display: "none" }} onChange={e => handleFileSelect(e.target.files[0])} />

              <div style={{ height: 1, background: "#E2E8F0", margin: "12px 0" }} />

              <button onClick={loadMock} style={S.ghostBtn}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Carregar exemplo de demonstração
              </button>
            </div>
          )}

          {/* RECORDING */}
          {stage === "recording" && (
            <div style={{ padding: "18px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div className="rec-pulse" style={{
                width: 54, height: 54, borderRadius: "50%",
                background: "rgba(239,68,68,0.10)", border: "2px solid #EF4444",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8"/>
                </svg>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#F87171", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>Gravando</div>
                <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: "#F87171" }}>{timer}</div>
              </div>
              <RecWave small />
              <button onClick={stopRecording} style={{ ...S.actionBtn, borderColor: "#FCA5A5", background: "rgba(239,68,68,0.10)" }}>
                <div style={{ width: 10, height: 10, background: "#DC2626", borderRadius: 2 }} />
                <span style={{ fontSize: 14.3, fontWeight: 700, color: "#F87171" }}>Parar Gravação</span>
              </button>
            </div>
          )}

          {/* PROCESSING */}
          {stage === "processing" && (
            <div style={{ padding: "20px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                background: "rgba(129,140,248,0.12)", border: "2px solid #C7D2FE",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg className="spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3730A3" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
              </div>
              <div style={{ fontSize: 14.3, fontWeight: 700, color: "#818CF8" }}>Processando...</div>
              <div style={{ width: "100%", height: 3, background: "#E2E8F0", borderRadius: 2, overflow: "hidden" }}>
                <div className="prog-bar" style={{ height: "100%", background: "linear-gradient(90deg,#3730A3,#6D28D9)", borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: 9, color: "#64748B", fontFamily: MONO, textAlign: "center", lineHeight: 1.7 }}>
                Whisper · Diarização<br/>Análise de inteligência
              </div>
            </div>
          )}

          {/* DONE: Metadados no aside */}
          {stage === "done" && result && (
            <div style={{ padding: "12px 12px 0" }}>

              {/* Arquivo */}
              <div style={S.infoBox}>
                <div style={S.infoLabel}>Arquivo</div>
                <div style={{ fontSize: 16.9, fontWeight: 700, color: "#F1F5F9", fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {audioFile?.name || result.filename}
                </div>
                <div style={{ fontSize: 9, color: "#64748B", fontFamily: MONO, marginTop: 1 }}>
                  {result.duration || "—"} · {result.segments?.length || 0} segmentos
                </div>
              </div>

              {/* Laudo */}
              <div style={S.infoBox}>
                <div style={S.infoLabel}>Laudo n.º</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#F1F5F9", fontFamily: MONO }}>{result.laudo_number}</div>
                <div style={{ fontSize: 9, color: "#64748B", fontFamily: MONO, marginTop: 1 }}>{result.date}</div>
              </div>

              {/* Risco */}
              <div style={{
                ...S.infoBox,
                background: risk(result.risk_level, "bg"),
                borderColor: risk(result.risk_level, "border"),
                borderLeft: `3px solid ${risk(result.risk_level, "color")}`,
              }}>
                <div style={S.infoLabel}>Risco Identificado</div>
                <div style={{ fontSize: 16.9, fontWeight: 800, color: risk(result.risk_level, "color"), fontFamily: MONO, letterSpacing: "0.06em" }}>
                  {result.risk_level}
                </div>
                <div style={{ fontSize: 9, color: "#475569", marginTop: 2, lineHeight: 1.4 }}>
                  {result.classification}
                </div>
              </div>

              {/* Interlocutores */}
              <div style={{ marginBottom: 10 }}>
                <div style={S.infoLabel}>Interlocutores</div>
                {result.speakers?.map(sp => (
                  <div key={sp.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6, marginBottom: 4, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                    <span style={{ fontSize: 16.9, fontWeight: 800, color: "#E8A020", fontFamily: MONO, minWidth: 22 }}>{sp.id}</span>
                    <span style={{ fontSize: 16.9, color: "#475569", lineHeight: 1.3 }}>{sp.label} — <strong>{sp.role}</strong></span>
                  </div>
                ))}
              </div>

              <div style={{ height: 1, background: "#E2E8F0", margin: "4px 0 10px" }} />

              {/* Exportar */}
              <div style={{ marginBottom: 8 }}>
                <div style={S.infoLabel}>Exportar Laudo</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {["pdf", "docx"].map(fmt => {
                    const st = exportStatus[fmt]
                    return (
                      <button key={fmt} onClick={() => exportReport(fmt)} disabled={st === "loading"}
                        className="export-btn"
                        style={{
                          flex: 1, padding: "7px 0", borderRadius: 6, border: "1px solid",
                          borderColor: st === "done" ? "#86EFAC" : "#E2E8F0",
                          background: st === "done" ? "#F0FDF4" : "#0F172A",
                          color: st === "done" ? "#16A34A" : "#111827",
                          fontSize: 14.3, fontWeight: 700, cursor: st === "loading" ? "wait" : "pointer",
                          fontFamily: MONO, transition: "all 0.15s",
                        }}>
                        {st === "loading" ? "..." : st === "done" ? `✓ ${fmt.toUpperCase()}` : fmt.toUpperCase()}
                      </button>
                    )
                  })}
                </div>
              </div>

              <button onClick={reset} style={S.ghostBtn}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round">
                  <polyline points="1 4 1 10 7 10"/>
                  <path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
                </svg>
                Nova transcrição
              </button>
            </div>
          )}

          {/* ERROR */}
          {stage === "error" && (
            <div style={{ padding: "12px" }}>
              <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.10)", border: "1px solid #FCA5A5", borderRadius: 8 }}>
                <div style={{ fontSize: 16.9, fontWeight: 700, color: "#F87171", marginBottom: 4 }}>Erro no processamento</div>
                <div style={{ fontSize: 16.9, color: "#FCA5A5", fontFamily: MONO, lineHeight: 1.5 }}>{errorMsg}</div>
                <button onClick={reset} style={{ marginTop: 8, padding: "5px 12px", background: "#DC2626", color: "#FFF", border: "none", borderRadius: 5, fontSize: 16.9, fontWeight: 700, cursor: "pointer" }}>
                  Tentar novamente
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer do aside */}
        <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.07)", background: "#1A2236", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: stage === "done" ? "#16A34A" : "#3730A3", boxShadow: stage === "done" ? "0 0 5px rgba(22,163,74,0.7)" : "0 0 5px rgba(55,48,163,0.6)" }} />
            <span style={{ fontSize: 9, color: "#475569", fontFamily: MONO }}>Whisper · Diarização automática</span>
          </div>
          <span style={{ fontSize: 9, color: "#94A3B8", fontFamily: MONO }}>WebM/Opus · WAV · MP3 · M4A</span>
        </div>
      </aside>

      {/* ══ ÁREA PRINCIPAL ════════════════════════════════════════════════════ */}
      <div style={S.main}>

        {/* Header da área principal */}
        <div style={S.mainHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: stage === "done" ? "#16A34A" : stage === "recording" ? "#DC2626" : "#3730A3",
              boxShadow: stage === "done" ? "0 0 6px rgba(22,163,74,0.7)" : stage === "recording" ? "0 0 6px rgba(220,38,38,0.7)" : "0 0 5px rgba(55,48,163,0.5)",
            }} />
            <div>
              <div style={{ fontSize: 16.9, fontWeight: 700, color: "#F1F5F9" }}>
                {stage === "done" && result ? `Laudo n.º ${result.laudo_number}` : "Transcrição de Áudio"}
              </div>
              <div style={{ fontSize: 9, color: "#64748B", fontFamily: MONO, marginTop: 1 }}>
                {stage === "idle"       && "Aguardando entrada · Gravação ou upload"}
                {stage === "recording"  && `Gravando · ${timer}`}
                {stage === "processing" && "Processando · Whisper + Diarização + IA"}
                {stage === "done"       && result && `${result.filename} · ${result.speakers?.length || 0} interlocutores`}
                {stage === "error"      && "Falha no processamento"}
              </div>
            </div>
          </div>
        </div>

        {/* Corpo */}
        <div style={S.mainBody}>

          {/* IDLE */}
          {stage === "idle" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 12, padding: 40, height: "100%" }}>
              <EmptyState />
              <p style={{ fontSize: 14.3, color: "#CBD5E1", fontFamily: MONO, margin: 0, textAlign: "center" }}>
                Use o painel lateral para gravar ou enviar um arquivo de áudio
              </p>
            </div>
          )}

          {/* RECORDING */}
          {stage === "recording" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 20, padding: 40 }}>
              <RecWave />
              <div style={{ fontFamily: MONO, fontSize: 44, fontWeight: 800, color: "#F87171", letterSpacing: "0.04em" }}>{timer}</div>
              <p style={{ fontSize: 14.3, color: "#94A3B8", fontFamily: MONO, margin: 0 }}>
                Gravando em WebM/Opus · Pare pelo painel lateral
              </p>
            </div>
          )}

          {/* PROCESSING */}
          {stage === "processing" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 14, padding: 40 }}>
              <svg className="spin" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#3730A3" strokeWidth="1.5" strokeLinecap="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              <div style={{ fontSize: 16.9, fontWeight: 700, color: "#F1F5F9" }}>Processando áudio...</div>
              <div style={{ fontSize: 14.3, color: "#64748B", fontFamily: MONO, textAlign: "center", lineHeight: 1.8 }}>
                Transcrição com Whisper · Identificação de interlocutores<br />Análise de inteligência via IA
              </div>
            </div>
          )}

          {/* DONE: Laudo completo */}
          {stage === "done" && result && (
            <div className="enter" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Cabeçalho formal do laudo */}
              <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "18px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                <div style={{ textAlign: "center", paddingBottom: 12, borderBottom: "2px solid #0F172A", marginBottom: 14 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", color: "#64748B", marginBottom: 4, textTransform: "uppercase" }}>
                    Agent Bastos · Sistema de Inteligência
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#F1F5F9", letterSpacing: "0.04em" }}>
                    TRANSCRIÇÃO DE ÁUDIO NA ÍNTEGRA
                  </div>
                  <div style={{ width: 48, height: 2, background: "#B45309", margin: "8px auto 0" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                  {[["Laudo n.º", result.laudo_number, true], ["Data da Transcrição", result.date, false], ["Arquivo de Origem", result.filename, true]].map(([label, value, mono]) => (
                    <div key={label}>
                      <div style={{ fontSize: 8, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
                      <div style={{ fontSize: 15.6, fontWeight: 700, color: "#F1F5F9", fontFamily: mono ? MONO : SANS }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Transcrição Segmentada */}
              <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "#0B1120" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#475569", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    Transcrição Segmentada
                  </span>
                </div>
                {result.segments?.map((seg, i) => (
                  <div key={i} className="seg-row" style={{
                    display: "grid", gridTemplateColumns: "82px 38px 1fr",
                    gap: "0 10px", padding: "8px 16px",
                    borderBottom: i < result.segments.length - 1 ? "1px solid #0B1120" : "none",
                    background: "#111827", transition: "background 0.12s",
                  }}>
                    <span style={{ fontFamily: MONO, fontSize: 16.9, color: "#94A3B8", paddingTop: 1 }}>[{seg.ts}]</span>
                    <span style={{ fontFamily: MONO, fontSize: 14.3, fontWeight: 700, color: "#E8A020", paddingTop: 1 }}>{seg.speaker}:</span>
                    <span style={{ fontSize: 15.6, color: "#F1F5F9", lineHeight: 1.65 }}>{seg.text}</span>
                  </div>
                ))}
              </div>

              {/* Relatório Analítico */}
              <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "#0B1120", textAlign: "center" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#475569", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                    Relatório Analítico da Transcrição de Áudio
                  </span>
                </div>
                <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

                  {/* Risco */}
                  <div style={{
                    display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px",
                    background: risk(result.risk_level, "bg"),
                    border: `1px solid ${risk(result.risk_level, "border")}`,
                    borderLeft: `4px solid ${risk(result.risk_level, "color")}`,
                    borderRadius: 6,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke={risk(result.risk_level, "color")} strokeWidth="2" strokeLinecap="round"
                      style={{ marginTop: 1, flexShrink: 0 }}>
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <div>
                      <div style={{ fontSize: 16.9, fontWeight: 800, color: risk(result.risk_level, "color"), letterSpacing: "0.08em", fontFamily: MONO, marginBottom: 3 }}>
                        IDENTIFICADOR DE RISCO: {result.risk_level}
                      </div>
                      <div style={{ fontSize: 14.3, color: "#F1F5F9" }}>
                        <strong>Classificação:</strong> {result.classification}
                      </div>
                    </div>
                  </div>

                  {/* Resumo Analítico */}
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 7 }}>Resumo Analítico</div>
                    <div style={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6, padding: "12px 14px", background: "#0B1120", fontSize: 15.6, color: "#F1F5F9", lineHeight: 1.7 }}>
                      {result.summary}
                    </div>
                  </div>

                  {/* Red Flags */}
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 7 }}>Sinalizadores de Alerta (Red Flags)</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {result.red_flags?.map(rf => (
                        <div key={rf.id} className="flag-row"
                          onClick={() => setActiveFlag(activeFlag === rf.id ? null : rf.id)}
                          style={{
                            display: "flex", gap: 10, alignItems: "flex-start",
                            padding: "10px 12px", borderRadius: 6, cursor: "pointer",
                            background: activeFlag === rf.id ? "#FEF2F2" : "#FFFAFA",
                            border: `1px solid ${activeFlag === rf.id ? "#FCA5A5" : "#FEE2E2"}`,
                            transition: "all 0.15s",
                          }}>
                          <span style={{
                            minWidth: 22, height: 22, background: "#DC2626", color: "#FFF",
                            borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 16.9, fontWeight: 800, fontFamily: MONO, flexShrink: 0,
                          }}>{rf.id}</span>
                          <div>
                            <div style={{ fontSize: 15.6, fontWeight: 700, color: "#F1F5F9", marginBottom: 2 }}>{rf.title}</div>
                            <div style={{ fontSize: 14.3, color: "#475569" }}>{rf.text}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              </div>

              {/* Rodapé Institucional */}
              <div style={{
                background: "#0F172A", borderRadius: 8, padding: "11px 18px",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
              }}>
                <span style={{ fontSize: 16.9, color: "#94A3B8", fontFamily: MONO }}>Agent Bastos · Intelligence Analysis Report</span>
                <div style={{ display: "flex", gap: 5 }}>
                  {["PROTEGIDO", "RESERVADO", "USO INTERNO"].map(tag => (
                    <span key={tag} style={{ fontSize: 8, fontWeight: 800, color: "#F1F5F9", fontFamily: MONO, background: "#F59E0B", borderRadius: 3, padding: "2px 7px", letterSpacing: "0.05em" }}>{tag}</span>
                  ))}
                </div>
                <span style={{ fontSize: 9, color: "#64748B", fontFamily: MONO, textAlign: "right", lineHeight: 1.4 }}>
                  Processado via IA · Validação humana obrigatória · Reprodução proibida
                </span>
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Estilos base — mesma arquitetura do ChatRAG ──────────────────────────────
const S = {
  page: { display: "flex", flex: 1, minWidth: 0, height: "100%", overflow: "hidden" },

  aside: {
    width: 268, flexShrink: 0, background: "#0B1120",
    borderRight: "1px solid rgba(255,255,255,0.07)", display: "flex",
    flexDirection: "column", height: "100%", overflow: "hidden",
  },
  asideHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0,
  },

  main: {
    display: "flex", flexDirection: "column", flex: 1,
    minWidth: 0, height: "100%", overflow: "hidden", background: "#111827",
  },
  mainHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.07)",
    background: "#111827", flexShrink: 0, boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  },
  mainBody: {
    flex: 1, overflowY: "auto", display: "flex", flexDirection: "column",
  },

  actionBtn: {
    width: "100%", padding: "9px 12px", borderRadius: 7,
    border: "1px solid #FCA5A5", background: "rgba(239,68,68,0.10)", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
    transition: "all 0.15s",
  },
  ghostBtn: {
    width: "100%", padding: "7px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.07)",
    background: "transparent", fontSize: 16.9, color: "#64748B", cursor: "pointer",
    fontFamily: "'JetBrains Mono','Roboto Mono','Courier New',monospace",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginBottom: 12,
  },
  infoBox: {
    padding: "8px 10px", background: "#0B1120", border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 8, marginBottom: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  },
  infoLabel: {
    fontSize: 8, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.1em",
    textTransform: "uppercase", fontFamily: "'JetBrains Mono','Roboto Mono','Courier New',monospace",
    marginBottom: 3,
  },
}
