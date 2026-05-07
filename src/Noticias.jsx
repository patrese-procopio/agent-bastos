import { useState, useEffect, useRef } from "react"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const CATEGORIAS = {
  "monitor crimes": { cor: "#C2410C", bg: "#FFEDD5", label: "CRIMES" },
  "alerta":         { cor: "#DC2626", bg: "#FEE2E2", label: "ALERTA" },
  "default":        { cor: "#1D4ED8", bg: "#DBEAFE", label: "INTEL"  },
}

function getCategoria(titulo) {
  const t = titulo.toLowerCase()
  for (const [key, val] of Object.entries(CATEGORIAS)) {
    if (key !== "default" && t.includes(key.split(" ")[0])) return val
  }
  return CATEGORIAS["default"]
}

// Gera seed de imagem baseada no título — determinístico por notícia
function getImageSeed(titulo) {
  let hash = 0
  for (let i = 0; i < titulo.length; i++) {
    hash = ((hash << 5) - hash) + titulo.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) % 1000
}

// Temas de imagem por categoria
function getImageQuery(titulo) {
  const t = titulo.toLowerCase()
  if (t.includes("droga") || t.includes("tráfico") || t.includes("preso") || t.includes("presa")) return "police-operation"
  if (t.includes("morte") || t.includes("mata") || t.includes("acidente")) return "crime-scene"
  if (t.includes("fronteira") || t.includes("amazo")) return "amazon-river"
  if (t.includes("operação") || t.includes("polícia")) return "law-enforcement"
  return "security-intelligence"
}

function getImageUrl(noticia) {
  if (noticia.imagem && noticia.imagem.startsWith("http")) return noticia.imagem
  const seed = getImageSeed(noticia.titulo)
  return `https://picsum.photos/seed/${seed}/400/200`
}

function formatarData(timestamp) {
  return new Date(timestamp * 1000).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  })
}

function tempoRelativo(timestamp) {
  const diff = Math.floor((Date.now() / 1000) - timestamp)
  if (diff < 60) return "agora"
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function extrairResumo(conteudo, maxChars = 240) {
  const linhas = conteudo.split("\n").filter(l => l.trim().length > 20)
  const texto = linhas.slice(0, 4).join(" ").replace(/[#*]/g, "").trim()
  return texto.length > maxChars ? texto.slice(0, maxChars) + "…" : texto
}

function ModalRelatorio({ noticia, onClose }) {
  const cat = getCategoria(noticia.titulo)

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(15,23,42,0.7)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        background: "#FFFFFF", borderRadius: 12, width: "100%", maxWidth: 780,
        maxHeight: "85vh", display: "flex", flexDirection: "column",
        border: "1px solid #E2E8F0", boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
        overflow: "hidden",
      }}>
        <div style={{
          padding: "16px 24px", borderBottom: "1px solid #E2E8F0",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          flexShrink: 0, background: "#F8FAFC",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 3, background: cat.bg, color: cat.cor, fontFamily: MONO, letterSpacing: "0.08em" }}>{cat.label}</span>
              <span style={{ fontSize: 10, color: "#94A3B8", fontFamily: MONO }}>{formatarData(noticia.atualizado)}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>{noticia.titulo}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", fontSize: 20, padding: 4, flexShrink: 0, marginLeft: 16 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
          <pre style={{ fontFamily: MONO, fontSize: 12.5, color: "#1E293B", lineHeight: 1.9, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
            {noticia.conteudo}
          </pre>
        </div>

        <div style={{
          padding: "12px 24px", borderTop: "1px solid #E2E8F0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0, background: "#F8FAFC",
        }}>
          <span style={{ fontSize: 9, color: "#94A3B8", fontFamily: MONO }}>{noticia.arquivo}</span>
          <button onClick={onClose} style={{ fontSize: 11, fontWeight: 700, padding: "6px 20px", background: "#0F172A", color: "#FFF", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: MONO }}>FECHAR</button>
        </div>
      </div>
    </div>
  )
}

function CardNoticia({ noticia, onClick, grande }) {
  const cat = getCategoria(noticia.titulo)
  const [hover, setHover] = useState(false)
  const [imgError, setImgError] = useState(false)

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12,
        overflow: "hidden", cursor: "pointer",
        boxShadow: hover ? "0 12px 32px rgba(0,0,0,0.12)" : "0 2px 8px rgba(0,0,0,0.05)",
        transform: hover ? "translateY(-3px)" : "translateY(0)",
        transition: "all 0.18s", display: "flex", flexDirection: "column",
      }}>

      {/* Imagem do card */}
      {!imgError && (
        <div style={{ position: "relative", height: grande ? 160 : 120, overflow: "hidden", flexShrink: 0 }}>
          <img
            src={getImageUrl(noticia)}
            alt=""
            onError={() => setImgError(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          {/* Overlay gradiente */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 40%, rgba(15,23,42,0.55))" }}/>
          {/* Badge categoria sobre a imagem */}
          <span style={{
            position: "absolute", top: 10, left: 10,
            fontSize: 9, fontWeight: 700, padding: "3px 9px", borderRadius: 4,
            background: cat.bg, color: cat.cor, fontFamily: MONO, letterSpacing: "0.08em",
            backdropFilter: "blur(4px)",
          }}>{cat.label}</span>
          {/* Tempo sobre a imagem */}
          <span style={{
            position: "absolute", top: 10, right: 10,
            fontSize: 9, color: "#FFF", fontFamily: MONO,
            background: "rgba(0,0,0,0.4)", padding: "2px 7px", borderRadius: 4,
          }}>{tempoRelativo(noticia.atualizado)}</span>
        </div>
      )}

      {/* Barra colorida (fallback quando sem imagem) */}
      {imgError && <div style={{ height: 5, background: `linear-gradient(90deg, ${cat.cor}, ${cat.cor}88)` }} />}

      <div style={{ padding: grande ? "16px 18px" : "14px 16px", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>

        {/* Badge + tempo (só quando sem imagem) */}
        {imgError && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 9, fontWeight: 700, padding: "3px 9px", borderRadius: 4, background: cat.bg, color: cat.cor, fontFamily: MONO, letterSpacing: "0.08em" }}>{cat.label}</span>
            <span style={{ fontSize: 9, color: "#94A3B8", fontFamily: MONO }}>{tempoRelativo(noticia.atualizado)}</span>
          </div>
        )}

        {/* Título */}
        <div
          onClick={onClick}
          style={{ fontSize: grande ? 14 : 13, fontWeight: 700, color: "#0F172A", lineHeight: 1.4, cursor: "pointer" }}
        >
          {noticia.titulo}
        </div>

        {/* Resumo */}
        <div style={{ fontSize: grande ? 12 : 11.5, color: "#475569", lineHeight: 1.65, flex: 1 }}>
          {extrairResumo(noticia.conteudo, grande ? 280 : 180)}
        </div>

        {/* Footer — data + link */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          paddingTop: 10, borderTop: "1px solid #F1F5F9", marginTop: 4, gap: 8,
        }}>
          <span style={{ fontSize: 9, color: "#94A3B8", fontFamily: MONO, flexShrink: 0 }}>
            {formatarData(noticia.atualizado)}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {noticia.link && (
              <a
                href={noticia.link}
                target="_blank"
                rel="noreferrer"
                onClick={e => e.stopPropagation()}
                style={{
                  fontSize: 9, fontWeight: 700, color: "#1D4ED8",
                  fontFamily: MONO, letterSpacing: "0.05em",
                  display: "flex", alignItems: "center", gap: 4,
                  textDecoration: "none",
                }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                FONTE
              </a>
            )}
            <span
              onClick={onClick}
              style={{ fontSize: 10, fontWeight: 700, color: cat.cor, fontFamily: MONO, letterSpacing: "0.06em", cursor: "pointer" }}
            >
              VER RELATÓRIO →
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Noticias({ onNavigate }) {
  const [noticias, setNoticias] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [selecionada, setSelecionada] = useState(null)
  const [ultimaAtt, setUltimaAtt] = useState(null)
  const fetchedRef = useRef(false)

  async function buscarNoticias() {
    setLoading(true)
    setErro(null)
    try {
      const res = await fetch("http://127.0.0.1:8000/noticias")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setNoticias(data.noticias || [])
      setUltimaAtt(new Date())
    } catch {
      setErro("Falha ao conectar com o backend.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    buscarNoticias()
    const intervalo = setInterval(buscarNoticias, 5 * 60 * 1000)
    return () => clearInterval(intervalo)
  }, [])

  // Define layout baseado na quantidade de cards
  const getGridStyle = (total) => {
    if (total === 1) return { display: "grid", gridTemplateColumns: "1fr", maxWidth: 560, gap: 16 }
    if (total === 2) return { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }
    if (total === 3) return { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }
    return { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", fontFamily: SANS }}>

      {/* Topbar */}
      <header style={{
        height: 44, borderBottom: "1px solid #E2E8F0", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 18px", background: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginRight: 4 }}>
            <button style={{ width: 12, height: 12, borderRadius: "50%", background: "#FF5F57", border: "none", cursor: "pointer" }} onClick={() => window.electronAPI?.close()} />
            <button style={{ width: 12, height: 12, borderRadius: "50%", background: "#FEBC2E", border: "none", cursor: "pointer" }} onClick={() => window.electronAPI?.minimize()} />
            <button style={{ width: 12, height: 12, borderRadius: "50%", background: "#28C840", border: "none", cursor: "pointer" }} onClick={() => window.electronAPI?.maximize()} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Notícias</div>
            <div style={{ fontSize: 10, color: "#64748B", fontFamily: MONO }}>Monitor de Inteligência · Amazonas</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {ultimaAtt && <span style={{ fontSize: 9, color: "#94A3B8", fontFamily: MONO }}>att {ultimaAtt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>}
          <button onClick={buscarNoticias} disabled={loading} style={{
            fontSize: 10, fontWeight: 700, padding: "4px 12px",
            background: loading ? "#F1F5F9" : "#0F172A",
            color: loading ? "#94A3B8" : "#FFFFFF",
            border: "none", borderRadius: 6, cursor: loading ? "not-allowed" : "pointer",
            fontFamily: MONO, letterSpacing: "0.06em",
          }}>
            {loading ? "CARREGANDO…" : "↻ ATUALIZAR"}
          </button>
        </div>
      </header>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "18px 22px" }}>

        {loading && noticias.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60%", gap: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid #E2E8F0", borderTopColor: "#B45309", animation: "spin 0.8s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <span style={{ fontSize: 11, color: "#94A3B8", fontFamily: MONO }}>carregando relatórios...</span>
          </div>
        )}

        {erro && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "14px 18px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "#7F1D1D", fontWeight: 600 }}>⚠ {erro}</span>
            <button onClick={buscarNoticias} style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", background: "#DC2626", color: "#FFF", border: "none", borderRadius: 4, cursor: "pointer", fontFamily: MONO, marginLeft: "auto" }}>TENTAR NOVAMENTE</button>
          </div>
        )}

        {!loading && !erro && noticias.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "70%", gap: 10 }}>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="0.8" strokeLinecap="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
            <span style={{ fontSize: 13, color: "#94A3B8", fontWeight: 600 }}>Nenhum relatório encontrado</span>
            <span style={{ fontSize: 11, color: "#CBD5E1", fontFamily: MONO }}>Execute o workflow no n8n para gerar relatórios</span>
          </div>
        )}

        {noticias.length > 0 && (
          <>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: "#334155", letterSpacing: "0.14em", textTransform: "uppercase" }}>Relatórios Ativos</span>
                <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 10, background: "#0F172A", color: "#FFF", fontFamily: MONO }}>{noticias.length}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16A34A", flexShrink: 0 }} />
                <span style={{ fontSize: 9, color: "#16A34A", fontFamily: MONO, fontWeight: 600 }}>n8n conectado</span>
              </div>
            </div>

            {/* Grid adaptativo */}
            <div style={getGridStyle(noticias.length)}>
              {noticias.map((n, i) => (
                <CardNoticia
                  key={i}
                  noticia={n}
                  grande={noticias.length <= 2}
                  onClick={() => setSelecionada(n)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {selecionada && <ModalRelatorio noticia={selecionada} onClose={() => setSelecionada(null)} />}
    </div>
  )
}
