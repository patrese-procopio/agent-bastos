import { useState, useEffect, useMemo } from "react"
import api from "./api"
const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"

export default function Referencias({ onNavigate }) {
  const [todos, setTodos]   = useState([])
  const [anos, setAnos]     = useState([])
  const [total, setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [erro, setErro]     = useState(false)
  const [q, setQ]           = useState("")
  const [ano, setAno]       = useState("")
  const [tipo, setTipo]     = useState("")

  useEffect(() => {
    api.get("/referencias")
  .then(r => r?.json())
  .then(d => {
    setTodos(d.documentos || [])
    setAnos(d.anos || [])
    setTotal(d.total_indexados || 0)
    setLoading(false)
  })
  .catch(() => { setErro(true); setLoading(false) })
  }, [])

  const resultados = useMemo(() => {
    const termo = q.trim().toUpperCase()
    return todos.filter(doc => {
      if (ano  && doc.ano  !== ano)  return false
      if (tipo && doc.tipo !== tipo) return false
      if (termo) {
        const assunto = (doc.assunto || "").toUpperCase()
        const numero  = doc.numero || ""
        if (!assunto.includes(termo) && !numero.includes(termo)) return false
      }
      return true
    }).slice(0, 150)
  }, [todos, q, ano, tipo])

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, height: "100%", overflow: "hidden", background: "#0B1120" }}>

      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "#111827", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 16.9, fontWeight: 700, color: "#F1F5F9" }}>Busca de Referências</div>
          <div style={{ fontSize: 9, color: "#64748B", fontFamily: MONO, marginTop: 2 }}>
            {loading
              ? "Carregando índice..."
              : erro
                ? "Backend offline — verifique o api.py"
                : `${total} documentos indexados · Google Drive`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ fontSize: 8, fontWeight: 700, fontFamily: MONO, padding: "2px 8px", borderRadius: 4, background: "rgba(96,165,250,0.12)", color: "#60A5FA", border: "1px solid #BFDBFE" }}>RELINT</span>
          <span style={{ fontSize: 8, fontWeight: 700, fontFamily: MONO, padding: "2px 8px", borderRadius: 4, background: "rgba(167,139,250,0.12)", color: "#A78BFA", border: "1px solid #DDD6FE" }}>RELTEC</span>
        </div>
      </div>

      {/* BARRA DE BUSCA */}
      <div style={{ padding: "10px 20px", background: "#111827", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220, position: "relative" }}>
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.4, pointerEvents: "none" }}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar alvo por nome, vulgo ou assunto do documento..."
            style={{
              width: "100%", boxSizing: "border-box",
              paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
              fontSize: 15.6, border: "1px solid rgba(255,255,255,0.07)", borderRadius: 7,
              background: "#0B1120", outline: "none", fontFamily: "inherit", color: "#F1F5F9",
            }}
          />
        </div>

        <select
          value={ano}
          onChange={e => setAno(e.target.value)}
          style={{ padding: "7px 10px", fontSize: 14.3, border: "1px solid rgba(255,255,255,0.07)", borderRadius: 7, background: "#0B1120", fontFamily: MONO, color: "#F1F5F9", cursor: "pointer", outline: "none" }}
        >
          <option value="">Todos os anos</option>
          {anos.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <div style={{ display: "flex", gap: 3 }}>
          {[["", "TODOS"], ["RELINT", "RELINT"], ["RELTEC", "RELTEC"]].map(([val, label]) => (
            <button key={val} onClick={() => setTipo(val)} style={{
              padding: "6px 12px", borderRadius: 7, fontSize: 16.9, fontWeight: 700,
              fontFamily: MONO, cursor: "pointer", border: "1px solid",
              background: tipo === val
                ? (val === "RELINT" ? "#1D4ED8" : val === "RELTEC" ? "#6D28D9" : "#0F172A")
                : "#111827",
              color: tipo === val ? "#111827" : "#64748B",
              borderColor: tipo === val ? "transparent" : "#E2E8F0",
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* CONTADOR */}
      <div style={{ padding: "5px 20px", background: "#0B1120", borderBottom: "1px solid #1A2236", flexShrink: 0 }}>
        <span style={{ fontSize: 16.9, color: "#64748B", fontFamily: MONO }}>
          {loading ? "—" : `${resultados.length} resultado(s)`}
          {q.trim() && (
            <span style={{ color: "#A78BFA", fontWeight: 700 }}> · "{q.trim()}"</span>
          )}
        </span>
      </div>

      {/* LISTA */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 20px" }}>

        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 220 }}>
            <span style={{ fontSize: 14.3, color: "#94A3B8", fontFamily: MONO }}>Carregando índice do Drive...</span>
          </div>
        )}

        {erro && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 220, gap: 8 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span style={{ fontSize: 15.6, color: "#F87171", fontWeight: 700 }}>Backend offline</span>
            <span style={{ fontSize: 16.9, color: "#94A3B8", fontFamily: MONO }}>Verifique se o api.py está rodando na porta 8000</span>
          </div>
        )}

        {!loading && !erro && resultados.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 220, gap: 6 }}>
            <span style={{ fontSize: 15.6, color: "#64748B", fontWeight: 600 }}>Nenhum documento encontrado</span>
            {q.trim() && (
              <span style={{ fontSize: 16.9, color: "#94A3B8", fontFamily: MONO }}>Tente outro nome ou vulgo</span>
            )}
          </div>
        )}

        {!loading && !erro && resultados.map((doc, i) => (
          <DocCard key={i} doc={doc} termo={q} />
        ))}

        {!loading && !erro && resultados.length === 150 && (
          <div style={{ textAlign: "center", padding: "12px 0", fontSize: 16.9, color: "#94A3B8", fontFamily: MONO }}>
            Exibindo os primeiros 150 resultados — refine a busca para ver mais
          </div>
        )}
      </div>
    </div>
  )
}

function DocCard({ doc, termo }) {
  const isRelint  = doc.tipo === "RELINT"
  const cor       = isRelint ? "#1D4ED8" : "#6D28D9"
  const bgBadge   = isRelint ? "#DBEAFE" : "#EDE9FE"
  const bordBadge = isRelint ? "#BFDBFE" : "#DDD6FE"

  function highlight(text) {
    const t = termo.trim()
    if (!t) return text
    const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi")
    return text.split(re).map((p, i) =>
      re.test(p)
        ? <mark key={i} style={{ background: "#FEF9C3", color: "#854D0E", padding: "0 2px", borderRadius: 2, fontWeight: 700 }}>{p}</mark>
        : p
    )
  }

  return (
    <div style={{
      background: "#111827",
      border: "1px solid rgba(255,255,255,0.07)",
      borderLeft: `3px solid ${cor}`,
      borderRadius: 8,
      padding: "10px 14px",
      marginBottom: 6,
      boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 4, fontFamily: MONO, background: bgBadge, color: cor, border: `1px solid ${bordBadge}`, flexShrink: 0 }}>
          {doc.tipo}
        </span>
        <span style={{ fontSize: 14.3, fontWeight: 700, color: "#F1F5F9", fontFamily: MONO }}>
          Nº {doc.numero}
        </span>
        <span style={{ fontSize: 16.9, color: "#64748B", fontFamily: MONO }}>
          · {doc.ano}{doc.mes ? ` · ${doc.mes}` : ""}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 9, color: "#94A3B8", fontFamily: MONO, flexShrink: 0 }}>
          {doc.data_modificacao}
        </span>
      </div>

      <div style={{ fontSize: 15.6, color: "#F1F5F9", lineHeight: 1.55, fontWeight: 500 }}>
        {highlight(doc.assunto || "—")}
      </div>

      {doc.file_id && (
        <div style={{display:"flex",gap:6,marginTop:8}}>
          <a href={`http://127.0.0.1:8000/referencias/download/docx/${doc.file_id}`} target="_blank" rel="noreferrer" style={{fontSize:13,fontWeight:700,color:"#FFF",background:"#1D4ED8",padding:"4px 10px",borderRadius:5,textDecoration:"none"}}>
            DOCX
          </a>
        </div>
      )}
    </div>
  )
}
