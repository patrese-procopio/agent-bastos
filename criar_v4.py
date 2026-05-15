# criar_v4.py
# Esse script cria o patch_v4.py no disco sem depender de download
# Execute: python criar_v4.py

script = r'''import sys
SRC = r"C:\Users\Administrador\Agent_Bastos\frontend\src\Transcricao.jsx"

with open(SRC, "r", encoding="latin-1") as f:
    lines = f.readlines()

total = len(lines)
print(f"Lido: {total} linhas")

if total != 737:
    print(f"ERRO: esperado 737, encontrado {total}. Restaure o backup.")
    sys.exit(1)

# PATCH A: estados de missiva (apos linha 131)
STATES = [
    '\n',
    '  // -- modo audio | missiva\n',
    '  const [mode, setMode] = useState("audio")\n',
    '  const [missFile, setMissFile] = useState(null)\n',
    '  const [missStage, setMissStage] = useState("idle")\n',
    '  const [missResult, setMissResult] = useState(null)\n',
    '  const [missError, setMissError] = useState("")\n',
    '  const [isDraggingMiss, setIsDraggingMiss] = useState(false)\n',
    '  const missFileRef = useRef(null)\n',
    '\n',
]
for i, s in enumerate(STATES):
    lines.insert(131 + i, s)
print("Patch A ok")

# PATCH B: funcoes antes de reset()
reset_idx = next(i for i, l in enumerate(lines) if '  function reset() {' in l)
FUNCS = [
    '\n',
    '  async function processMissiva(file) {\n',
    '    if (!file) return\n',
    '    setMissStage("processing")\n',
    '    setMissError("")\n',
    '    try {\n',
    '      const form = new FormData()\n',
    '      form.append("imagem", file)\n',
    '      const res = await fetch("http://127.0.0.1:8000/decifrar", { method: "POST", body: form })\n',
    '      if (!res.ok) throw new Error(res.statusText)\n',
    '      const data = await res.json()\n',
    '      setMissResult(data)\n',
    '      setMissStage("done")\n',
    '    } catch (err) {\n',
    '      setMissError(err.message)\n',
    '      setMissStage("error")\n',
    '    }\n',
    '  }\n',
    '  function resetMissiva() {\n',
    '    setMissFile(null); setMissStage("idle")\n',
    '    setMissResult(null); setMissError("")\n',
    '  }\n',
    '  function handleMissDrop(e) {\n',
    '    e.preventDefault(); setIsDraggingMiss(false)\n',
    '    const f = e.dataTransfer.files[0]\n',
    '    if (f) { setMissFile(f); processMissiva(f) }\n',
    '  }\n',
    '  function handleMissSelect(f) {\n',
    '    if (!f) return\n',
    '    setMissFile(f); processMissiva(f)\n',
    '  }\n',
    '\n',
]
for i, s in enumerate(FUNCS):
    lines.insert(reset_idx + i, s)
print("Patch B ok")

# PATCH C: substituir bloco asideHeader por tabs (localiza por linha)
aside_idx = next(i for i, l in enumerate(lines) if 'style={S.asideHeader}' in l)
# bloco tem 14 linhas
NEW_HEADER = [
    '        {/* tabs Audio / Missiva */}\n',
    '        <div style={{ borderBottom: "1px solid #E2E8F0", padding: "10px 12px 0" }}>\n',
    '          <div style={{ display: "flex", gap: 4 }}>\n',
    '            {[\n',
    '              { id: "audio",   label: "Audio",   icon: "M2 12h2M6 8v8M10 5v14M14 9v6M18 7v10M22 12h-2", badge: "Whisper" },\n',
    '              { id: "missiva", label: "Missiva", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8", badge: "Gemini" },\n',
    '            ].map(tab => (\n',
    '              <button key={tab.id} onClick={() => setMode(tab.id)} style={{\n',
    '                display: "flex", alignItems: "center", gap: 5, padding: "6px 10px",\n',
    '                background: "transparent", border: "none", cursor: "pointer",\n',
    '                borderBottom: mode === tab.id ? "2px solid #3730A3" : "2px solid transparent",\n',
    '                marginBottom: -1, opacity: mode === tab.id ? 1 : 0.5, transition: "all 0.15s",\n',
    '              }}>\n',
    '                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"\n',
    '                  stroke={mode === tab.id ? "#3730A3" : "#64748B"} strokeWidth="2" strokeLinecap="round">\n',
    '                  <path d={tab.icon}/>\n',
    '                </svg>\n',
    '                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase",\n',
    '                  color: mode === tab.id ? "#3730A3" : "#64748B" }}>{tab.label}</span>\n',
    '                <span style={{ fontSize: 8, fontWeight: 700, fontFamily: MONO,\n',
    '                  color: mode === tab.id ? "#3730A3" : "#94A3B8",\n',
    '                  background: mode === tab.id ? "#EEF2FF" : "#F1F5F9",\n',
    '                  padding: "1px 5px", borderRadius: 3,\n',
    '                  border: `1px solid ${mode === tab.id ? "#C7D2FE" : "#E2E8F0"}` }}>{tab.badge}</span>\n',
    '              </button>\n',
    '            ))}\n',
    '          </div>\n',
    '        </div>\n',
]
lines[aside_idx:aside_idx + 14] = NEW_HEADER
print(f"Patch C ok (linha {aside_idx+1})")

# PATCH D1: envolver audio
flex_idx = next(i for i, l in enumerate(lines)
    if 'flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }' in l
    and i > aside_idx)
lines[flex_idx] = '        {mode === "audio" && (\n        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>\n'
print(f"Patch D1 ok (linha {flex_idx+1})")

# PATCH D2: painel missiva antes de </aside>
aside_close = next(i for i, l in enumerate(lines) if l.strip() == '</aside>')
MISSIVA = [
    '        </div>\n',
    '        )}\n',
    '\n',
    '        {mode === "missiva" && (\n',
    '        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", padding: "12px 12px 0" }}>\n',
    '\n',
    '          {missStage === "idle" && (\n',
    '            <div>\n',
    '              <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: MONO, marginBottom: 6 }}>Imagem / Foto</div>\n',
    '              <div onDragOver={e => { e.preventDefault(); setIsDraggingMiss(true) }}\n',
    '                onDragLeave={() => setIsDraggingMiss(false)}\n',
    '                onDrop={handleMissDrop}\n',
    '                onClick={() => missFileRef.current?.click()}\n',
    '                style={{ border: `2px dashed ${isDraggingMiss ? "#B45309" : "#CBD5E1"}`, borderRadius: 8, padding: "20px 10px", textAlign: "center", cursor: "pointer", background: isDraggingMiss ? "#FFFBEB" : "#F8FAFC", transition: "all 0.15s" }}>\n',
    '                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isDraggingMiss ? "#B45309" : "#94A3B8"} strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 6 }}>\n',
    '                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>\n',
    '                </svg>\n',
    '                <div style={{ fontSize: 11, fontWeight: 600, color: isDraggingMiss ? "#B45309" : "#475569" }}>{isDraggingMiss ? "Solte aqui" : "Arraste ou clique"}</div>\n',
    '                <div style={{ fontSize: 9, color: "#94A3B8", fontFamily: MONO, marginTop: 3 }}>JPG · PNG · WEBP · HEIC</div>\n',
    '              </div>\n',
    '              <input ref={missFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleMissSelect(e.target.files[0])} />\n',
    '              <div style={{ fontSize: 9, color: "#94A3B8", fontFamily: MONO, marginTop: 8, lineHeight: 1.6 }}>Analise grafoscopica via Gemini 2.5 Flash</div>\n',
    '            </div>\n',
    '          )}\n',
    '\n',
    '          {missStage === "processing" && (\n',
    '            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 20 }}>\n',
    '              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#FFFBEB", border: "2px solid #FCD34D", display: "flex", alignItems: "center", justifyContent: "center" }}>\n',
    '                <svg className="spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>\n',
    '              </div>\n',
    '              <div style={{ fontSize: 11, fontWeight: 700, color: "#B45309" }}>Analisando manuscrito...</div>\n',
    '              <div style={{ width: "100%", height: 3, background: "#E2E8F0", borderRadius: 2, overflow: "hidden" }}>\n',
    '                <div className="prog-bar" style={{ height: "100%", background: "linear-gradient(90deg,#B45309,#D97706)", borderRadius: 2 }} />\n',
    '              </div>\n',
    '              <div style={{ fontSize: 9, color: "#64748B", fontFamily: MONO, textAlign: "center", lineHeight: 1.7 }}>Gemini 2.5 Flash · Grafoscopia</div>\n',
    '            </div>\n',
    '          )}\n',
    '\n',
    '          {missStage === "error" && (\n',
    '            <div style={{ padding: "12px", background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 8 }}>\n',
    '              <div style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", marginBottom: 4 }}>Erro na analise</div>\n',
    '              <div style={{ fontSize: 9, color: "#DC2626", fontFamily: MONO }}>{missError}</div>\n',
    '              <button onClick={resetMissiva} style={{ marginTop: 10, fontSize: 10, color: "#DC2626", background: "none", border: "1px solid #FCA5A5", borderRadius: 5, padding: "4px 10px", cursor: "pointer" }}>Tentar novamente</button>\n',
    '            </div>\n',
    '          )}\n',
    '\n',
    '          {missStage === "done" && missResult && (() => {\n',
    '            const conf = missResult.confianca || "medio"\n',
    '            const confColor = conf === "alto" ? "#16A34A" : conf === "medio" ? "#D97706" : "#DC2626"\n',
    '            return (\n',
    '              <div className="enter">\n',
    '                <div style={S.infoBox}>\n',
    '                  <div style={S.infoLabel}>Arquivo</div>\n',
    '                  <div style={{ fontSize: 10, fontWeight: 700, color: "#0F172A", fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{missFile?.name || "missiva"}</div>\n',
    '                  <div style={{ fontSize: 9, color: "#64748B", fontFamily: MONO, marginTop: 1 }}>{missResult.metadados?.modelo || "Gemini 2.5 Flash"}</div>\n',
    '                </div>\n',
    '                <div style={S.infoBox}>\n',
    '                  <div style={S.infoLabel}>Confianca</div>\n',
    '                  <span style={{ fontSize: 10, fontWeight: 700, color: confColor, background: confColor + "18", padding: "2px 8px", borderRadius: 4, border: `1px solid ${confColor}40` }}>{conf.toUpperCase()}</span>\n',
    '                  {missResult.requer_revisao_humana && <div style={{ fontSize: 9, color: "#D97706", marginTop: 4 }}>Revisao humana recomendada</div>}\n',
    '                </div>\n',
    '                <div style={{ marginTop: 8 }}>\n',
    '                  <div style={S.infoLabel}>Transcricao</div>\n',
    '                  <div style={{ marginTop: 4, padding: "10px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderLeft: "3px solid #B45309", borderRadius: 6, fontSize: 10, color: "#1E293B", fontFamily: MONO, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>\n',
    '                    {missResult.texto_transcrito || "Sem texto extraido."}\n',
    '                  </div>\n',
    '                </div>\n',
    '                {missResult.observacoes_forenses && missResult.observacoes_forenses.length > 0 && (\n',
    '                  <div style={{ marginTop: 10 }}>\n',
    '                    <div style={S.infoLabel}>Obs. Forenses</div>\n',
    '                    {missResult.observacoes_forenses.map((obs, i) => (\n',
    '                      <div key={i} style={{ fontSize: 9, color: "#64748B", fontFamily: MONO, marginTop: 3, paddingLeft: 8, borderLeft: "2px solid #E2E8F0" }}>{obs}</div>\n',
    '                    ))}\n',
    '                  </div>\n',
    '                )}\n',
    '                <button onClick={resetMissiva} style={{ ...S.ghostBtn, marginTop: 14 }}>\n',
    '                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>\n',
    '                  Nova analise\n',
    '                </button>\n',
    '              </div>\n',
    '            )\n',
    '          })()}\n',
    '\n',
    '        </div>\n',
    '        )}\n',
    '\n',
]
for i, s in enumerate(MISSIVA):
    lines.insert(aside_close + i, s)
print(f"Patch D2 ok (painel missiva inserido)")

with open(SRC, "w", encoding="latin-1") as f:
    f.writelines(lines)

print(f"\nConcluido! Total de linhas: {len(lines)}")
print("Tabs Audio | Missiva prontas.")
'''

with open('patch_v4.py', 'w', encoding='utf-8') as f:
    f.write(script)

print("patch_v4.py criado com sucesso!")
