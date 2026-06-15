"""
patch_missiva.py — v2 (encoding fix)
Executa: python patch_missiva.py
O arquivo Transcricao.jsx esta salvo em Latin-1; este script lida com isso.
"""

import sys

SRC = r"C:\Users\Administrador\Agent_Bastos\frontend\src\Transcricao.jsx"

with open(SRC, "r", encoding="latin-1") as f:
    code = f.read()

print(f"Arquivo lido: {len(code)} caracteres (latin-1)")

# PATCH C — header com tabs
OLD_HEADER = '        <div style={S.asideHeader}>\n          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>\n            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"\n              stroke="#3730A3" strokeWidth="2" strokeLinecap="round">\n              <path d="M2 12h2M6 8v8M10 5v14M14 9v6M18 7v10M22 12h-2"/>\n            </svg>\n            <span style={{ fontSize: 10, fontWeight: 800, color: "#334155", letterSpacing: "0.12em", textTransform: "uppercase" }}>\n              Transcri\xc3\x87\xc3\xa3o\n            </span>\n          </div>\n          <span style={{ fontSize: 9, color: "#3730A3", fontWeight: 700, fontFamily: MONO, background: "#EEF2FF", padding: "2px 6px", borderRadius: 4, border: "1px solid #C7D2FE" }}>\n            Whisper\n          </span>\n        </div>'

if OLD_HEADER in code:
    print("Ancora C encontrada via escape hex.")
else:
    # tenta buscar pela linha do asideHeader para debug
    idx = code.find("asideHeader")
    if idx == -1:
        print("ERRO CRITICO: asideHeader nao encontrado no arquivo.")
        sys.exit(1)
    print("Trecho ao redor de asideHeader (repr):")
    print(repr(code[idx-5:idx+500]))
    sys.exit(1)

NEW_HEADER = '''        {/* tabs Audio / Missiva */}
        <div style={{ borderBottom: "1px solid #E2E8F0", padding: "10px 12px 0" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {[
              { id: "audio",   label: "Audio",   icon: "M2 12h2M6 8v8M10 5v14M14 9v6M18 7v10M22 12h-2", badge: "Whisper" },
              { id: "missiva", label: "Missiva", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8", badge: "Gemini" },
            ].map(tab => (
              <button key={tab.id} onClick={() => setMode(tab.id)} style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "6px 10px", background: "transparent", border: "none", cursor: "pointer",
                borderBottom: mode === tab.id ? "2px solid #3730A3" : "2px solid transparent",
                marginBottom: -1, opacity: mode === tab.id ? 1 : 0.5, transition: "all 0.15s",
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                  stroke={mode === tab.id ? "#3730A3" : "#64748B"} strokeWidth="2" strokeLinecap="round">
                  <path d={tab.icon}/>
                </svg>
                <span style={{ fontSize: 10, fontWeight: 800, color: mode === tab.id ? "#3730A3" : "#64748B", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  {tab.label}
                </span>
                <span style={{ fontSize: 8, color: mode === tab.id ? "#3730A3" : "#94A3B8", fontWeight: 700, fontFamily: MONO, background: mode === tab.id ? "#EEF2FF" : "#F1F5F9", padding: "1px 5px", borderRadius: 3, border: `1px solid ${mode === tab.id ? "#C7D2FE" : "#E2E8F0"}` }}>
                  {tab.badge}
                </span>
              </button>
            ))}
          </div>
        </div>'''

code = code.replace(OLD_HEADER, NEW_HEADER, 1)
print("Patch C aplicado.")

# PATCH D — envolver audio e adicionar missiva
ANCHOR_D = '        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>'
NEW_D = '''        {mode === "audio" && (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>'''

if ANCHOR_D not in code:
    print("ERRO: ancora D nao encontrada.")
    sys.exit(1)

code = code.replace(ANCHOR_D, NEW_D, 1)

ANCHOR_ASIDE = '      </aside>'
MISSIVA = '''        </div>
        )}

        {mode === "missiva" && (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", padding: "12px 12px 0" }}>

          {missStage === "idle" && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: MONO, marginBottom: 6 }}>Imagem / Foto</div>
              <div
                onDragOver={e => { e.preventDefault(); setIsDraggingMiss(true) }}
                onDragLeave={() => setIsDraggingMiss(false)}
                onDrop={handleMissDrop}
                onClick={() => missFileRef.current?.click()}
                style={{ border: `2px dashed ${isDraggingMiss ? "#B45309" : "#CBD5E1"}`, borderRadius: 8, padding: "20px 10px", textAlign: "center", cursor: "pointer", background: isDraggingMiss ? "#FFFBEB" : "#F8FAFC", transition: "all 0.15s" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isDraggingMiss ? "#B45309" : "#94A3B8"} strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 6 }}>
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
                <div style={{ fontSize: 11, fontWeight: 600, color: isDraggingMiss ? "#B45309" : "#475569" }}>{isDraggingMiss ? "Solte aqui" : "Arraste ou clique"}</div>
                <div style={{ fontSize: 9, color: "#94A3B8", fontFamily: MONO, marginTop: 3 }}>JPG · PNG · WEBP · HEIC</div>
              </div>
              <input ref={missFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleMissSelect(e.target.files[0])} />
              <div style={{ fontSize: 9, color: "#94A3B8", fontFamily: MONO, marginTop: 8, lineHeight: 1.6 }}>Analise grafoscopica via Gemini 2.5 Flash</div>
            </div>
          )}

          {missStage === "processing" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 20 }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#FFFBEB", border: "2px solid #FCD34D", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg className="spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#B45309" }}>Analisando manuscrito...</div>
              <div style={{ width: "100%", height: 3, background: "#E2E8F0", borderRadius: 2, overflow: "hidden" }}>
                <div className="prog-bar" style={{ height: "100%", background: "linear-gradient(90deg,#B45309,#D97706)", borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: 9, color: "#64748B", fontFamily: MONO, textAlign: "center", lineHeight: 1.7 }}>Gemini 2.5 Flash · Grafoscopia</div>
            </div>
          )}

          {missStage === "error" && (
            <div style={{ padding: "12px", background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", marginBottom: 4 }}>Erro na analise</div>
              <div style={{ fontSize: 9, color: "#DC2626", fontFamily: MONO }}>{missError}</div>
              <button onClick={resetMissiva} style={{ marginTop: 10, fontSize: 10, color: "#DC2626", background: "none", border: "1px solid #FCA5A5", borderRadius: 5, padding: "4px 10px", cursor: "pointer" }}>Tentar novamente</button>
            </div>
          )}

          {missStage === "done" && missResult && (() => {
            const conf = missResult.confianca || "medio"
            const confColor = conf === "alto" ? "#16A34A" : conf === "medio" ? "#D97706" : "#DC2626"
            return (
              <div className="enter">
                <div style={S.infoBox}>
                  <div style={S.infoLabel}>Arquivo</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#0F172A", fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{missFile?.name || "missiva"}</div>
                  <div style={{ fontSize: 9, color: "#64748B", fontFamily: MONO, marginTop: 1 }}>{missResult.metadados?.modelo || "Gemini 2.5 Flash"}</div>
                </div>
                <div style={S.infoBox}>
                  <div style={S.infoLabel}>Confianca</div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: confColor, background: confColor + "18", padding: "2px 8px", borderRadius: 4, border: `1px solid ${confColor}40` }}>{conf.toUpperCase()}</span>
                  {missResult.requer_revisao_humana && <div style={{ fontSize: 9, color: "#D97706", marginTop: 4 }}>Revisao humana recomendada</div>}
                </div>
                <div style={{ marginTop: 8 }}>
                  <div style={S.infoLabel}>Transcricao</div>
                  <div style={{ marginTop: 4, padding: "10px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderLeft: "3px solid #B45309", borderRadius: 6, fontSize: 10, color: "#1E293B", fontFamily: MONO, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {missResult.texto_transcrito || "Sem texto extraido."}
                  </div>
                </div>
                {missResult.observacoes_forenses && missResult.observacoes_forenses.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={S.infoLabel}>Obs. Forenses</div>
                    {missResult.observacoes_forenses.map((obs, i) => (
                      <div key={i} style={{ fontSize: 9, color: "#64748B", fontFamily: MONO, marginTop: 3, paddingLeft: 8, borderLeft: "2px solid #E2E8F0" }}>{obs}</div>
                    ))}
                  </div>
                )}
                <button onClick={resetMissiva} style={{ ...S.ghostBtn, marginTop: 14 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>
                  Nova analise
                </button>
              </div>
            )
          })()}

        </div>
        )}

'''

code = code.replace(ANCHOR_ASIDE, MISSIVA + ANCHOR_ASIDE, 1)
print("Patch D aplicado.")

with open(SRC, "w", encoding="latin-1") as f:
    f.write(code)

print("\nTranscricao.jsx atualizado com sucesso!")
