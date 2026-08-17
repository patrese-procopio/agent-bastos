import { useState, useEffect, useRef } from "react"
import api from "./api"

const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
const PER_PAGE = 6

const CATS = {
  policia:  { cor: "#10B981", glow: "rgba(16,185,129,0.18)",  label: "POLÍCIA"  },
  trafico:  { cor: "#A78BFA", glow: "rgba(167,139,250,0.18)", label: "TRÁFICO"  },
  operacao: { cor: "#F59E0B", glow: "rgba(245,158,11,0.18)",  label: "OPERAÇÃO" },
  crimes:   { cor: "#F87171", glow: "rgba(248,113,113,0.18)", label: "CRIMES"   },
  corrupcao:{ cor: "#FB923C", glow: "rgba(251,146,60,0.18)",  label: "CORRUPÇÃO"},
  intel:    { cor: "#60A5FA", glow: "rgba(96,165,250,0.18)",  label: "INTEL"    },
}

function getCategoria(titulo, categoria) {
  const t = (titulo + " " + (categoria || "")).toLowerCase()
  if (/polici|delegacia|pm |pf |pcam/.test(t))                      return CATS.policia
  if (/tráfico|trafico|droga|entorpecente|cocaine|cocaína/.test(t)) return CATS.trafico
  if (/operaç|operac|operação/.test(t))                              return CATS.operacao
  if (/corrupc|corrupç|fraude|desvio|lavagem|estelionato/.test(t))  return CATS.corrupcao
  if (/preso|presa|crime|assalto|roubo|homicid|assassin|latrocin/.test(t)) return CATS.crimes
  return CATS.intel
}

function getImageUrl(noticia) {
  if (noticia.imagem && noticia.imagem.startsWith("http")) return noticia.imagem
  return null // sem imagem real → usa placeholder estilizado
}

function formatarData(timestamp) {
  return new Date(timestamp * 1000).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  })
}

function tempoRelativo(timestamp) {
  const diff = Math.floor((Date.now() / 1000) - timestamp)
  if (diff < 60)    return "agora"
  if (diff < 3600)  return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function extrairResumo(conteudo, maxChars = 160) {
  const linhas = conteudo.split("\n").filter(l => l.trim().length > 20)
  const texto = linhas.slice(0, 3).join(" ").replace(/[#*]/g, "").trim()
  return texto.length > maxChars ? texto.slice(0, maxChars) + "…" : texto
}

function ImagePlaceholder({ cat }) {
  return (
    <div style={{
      height: 190, flexShrink: 0,
      background: `linear-gradient(160deg, #0F172A 0%, ${cat.cor}12 100%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      position: "relative", overflow: "hidden",
    }}>
      {/* grade decorativa */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.06,
        backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 20px,rgba(255,255,255,0.5) 20px,rgba(255,255,255,0.5) 21px),repeating-linear-gradient(90deg,transparent,transparent 20px,rgba(255,255,255,0.5) 20px,rgba(255,255,255,0.5) 21px)",
      }}/>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
        stroke={cat.cor} strokeWidth="1" strokeLinecap="round" opacity="0.3">
        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
    </div>
  )
}

function ModalRelatorio({ noticia, onClose }) {
  const cat = getCategoria(noticia.titulo, noticia.categoria)

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(15,23,42,0.75)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        background: "#111827", borderRadius: 12, width: "100%", maxWidth: 760,
        maxHeight: "85vh", display: "flex", flexDirection: "column",
        border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
        overflow: "hidden",
      }}>
        {/* Header modal */}
        <div style={{
          padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          flexShrink: 0, background: "#0B1120",
        }}>
          <div style={{ flex: 1, marginRight: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{
                fontSize: 9.5, fontWeight: 800, padding: "3px 9px", borderRadius: 4,
                background: cat.cor, color: "#000", fontFamily: MONO, letterSpacing: "0.1em",
              }}>{cat.label}</span>
              <span style={{ fontSize: 11, color: "#64748B", fontFamily: MONO }}>
                {formatarData(noticia.atualizado)}
              </span>
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: "#F1F5F9", lineHeight: 1.4 }}>
              {noticia.titulo}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#64748B", fontSize: 18, padding: 4, flexShrink: 0,
          }}>✕</button>
        </div>

        {/* Imagem no modal se disponível */}
        {noticia.imagem && noticia.imagem.startsWith("http") && (
          <img
            src={noticia.imagem}
            alt=""
            style={{ width: "100%", maxHeight: 240, objectFit: "cover", flexShrink: 0 }}
            onError={e => { e.target.style.display = "none" }}
          />
        )}

        {/* Conteúdo */}
        <div style={{ flex: 1, overflowY: "auto", padding: "22px 28px" }}>
          <pre style={{
            fontFamily: MONO, fontSize: 12.5, color: "#CBD5E1",
            lineHeight: 1.9, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
          }}>
            {noticia.conteudo}
          </pre>
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 24px", borderTop: "1px solid rgba(255,255,255,0.07)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0, background: "#0B1120",
        }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#475569", fontFamily: MONO }}>{noticia.arquivo}</span>
            {noticia.link && (
              <a href={noticia.link} target="_blank" rel="noreferrer" style={{
                fontSize: 11, fontWeight: 700, color: "#60A5FA",
                fontFamily: MONO, textDecoration: "none",
                display: "flex", alignItems: "center", gap: 4,
              }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
                  stroke="#60A5FA" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                VER FONTE
              </a>
            )}
          </div>
          <button onClick={onClose} style={{
            fontSize: 11, fontWeight: 700, padding: "6px 18px",
            background: "#1E293B", color: "#F1F5F9", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 6, cursor: "pointer", fontFamily: MONO,
          }}>FECHAR</button>
        </div>
      </div>
    </div>
  )
}

// variant: "featured" | "side" | "normal"
function CardNoticia({ noticia, onClick, variant = "normal" }) {
  const cat = getCategoria(noticia.titulo, noticia.categoria)
  const [hover, setHover] = useState(false)
  const [imgError, setImgError] = useState(false)
  const imgUrl = getImageUrl(noticia)
  const showImg = imgUrl && !imgError

  const imgH    = variant === "featured" ? 310 : variant === "side" ? 120 : 190
  const titleSz = variant === "featured" ? 17   : variant === "side" ? 12  : 13.5
  const titleCl = variant === "featured" ? 3    : variant === "side" ? 2   : 2
  const resumoCl= variant === "featured" ? 4    : variant === "side" ? 2   : 3
  const pad     = variant === "side"     ? "11px 13px 10px" : "14px 16px 12px"

  const badges = (
    <>
      <span style={{
        position: "absolute", top: 10, left: 10,
        fontSize: 9.5, fontWeight: 800, padding: "3px 8px", borderRadius: 4,
        background: cat.cor, color: "#000", fontFamily: MONO, letterSpacing: "0.1em",
      }}>{cat.label}</span>
      <span style={{
        position: "absolute", top: 10, right: 10,
        fontSize: 10, color: "#FFF", fontFamily: MONO, fontWeight: 600,
        background: "rgba(0,0,0,0.55)", padding: "3px 8px", borderRadius: 4,
        backdropFilter: "blur(4px)",
      }}>{tempoRelativo(noticia.atualizado)}</span>
    </>
  )

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        background: hover
          ? "linear-gradient(180deg,#151F2E 0%,#0F172A 100%)"
          : "linear-gradient(180deg,#111827 0%,#0D1424 100%)",
        border: `1px solid ${hover ? cat.cor + "55" : "rgba(255,255,255,0.07)"}`,
        borderTop: `2px solid ${cat.cor}`,
        borderRadius: 12, overflow: "hidden", cursor: "pointer",
        boxShadow: hover
          ? `0 20px 48px rgba(0,0,0,0.4), 0 0 0 1px ${cat.cor}22, inset 0 0 30px ${cat.glow}`
          : "0 4px 16px rgba(0,0,0,0.2)",
        transform: hover ? "translateY(-4px)" : "translateY(0)",
        transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)",
        display: "flex", flexDirection: "column",
        height: variant === "side" ? "100%" : undefined,
      }}>

      {/* Imagem */}
      {showImg ? (
        <div style={{ position: "relative", height: imgH, overflow: "hidden", flexShrink: 0 }}>
          <img src={imgUrl} alt="" onError={() => setImgError(true)}
            style={{
              width: "100%", height: "100%", objectFit: "cover", display: "block",
              transform: hover ? "scale(1.04)" : "scale(1)",
              transition: "transform 0.45s ease",
            }}
          />
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to bottom,rgba(0,0,0,0.05) 0%,rgba(10,18,32,0.80) 100%)",
          }}/>
          {badges}
        </div>
      ) : (
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            height: imgH, background: `linear-gradient(160deg,#0F172A 0%,${cat.cor}12 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
              stroke={cat.cor} strokeWidth="1" strokeLinecap="round" opacity="0.25">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
          {badges}
        </div>
      )}

      {/* Texto */}
      <div style={{ padding: pad, flex: 1, display: "flex", flexDirection: "column", gap: variant === "side" ? 5 : 8 }}>
        <div style={{
          fontSize: titleSz, fontWeight: 700, color: "#F9FAFB",
          lineHeight: 1.45, letterSpacing: "-0.01em",
          display: "-webkit-box", WebkitLineClamp: titleCl,
          WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {noticia.titulo}
        </div>

        {variant !== "side" && (
          <div style={{
            fontSize: 11.5, color: "#94A3B8", lineHeight: 1.65, flex: 1,
            display: "-webkit-box", WebkitLineClamp: resumoCl,
            WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {extrairResumo(noticia.conteudo || noticia.resumo || "")}
          </div>
        )}

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          paddingTop: variant === "side" ? 7 : 10,
          borderTop: `1px solid ${cat.cor}22`, marginTop: "auto",
        }}>
          <span style={{ fontSize: 10, color: "#64748B", fontFamily: MONO }}>
            {formatarData(noticia.atualizado)}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, color: cat.cor,
            fontFamily: MONO, letterSpacing: "0.06em",
            opacity: hover ? 1 : 0.65, transition: "opacity 0.2s",
          }}>LER MAIS →</span>
        </div>
      </div>
    </div>
  )
}

function CardIntelGlobal({ noticia }) {
  const [hover, setHover] = useState(false)
  const [imgError, setImgError] = useState(false)
  const showImg = noticia.imagem && noticia.imagem.startsWith("http") && !imgError

  return (
    <a
      href={noticia.link} target="_blank" rel="noreferrer"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", flexDirection: "column",
        background: hover ? "#151F2E" : "#0F1929",
        border: `1px solid ${hover ? "rgba(251,191,36,0.35)" : "rgba(255,255,255,0.06)"}`,
        borderTop: "2px solid #F59E0B",
        borderRadius: 10, overflow: "hidden", cursor: "pointer",
        boxShadow: hover ? "0 12px 32px rgba(0,0,0,0.35), 0 0 0 1px rgba(245,158,11,0.15)" : "0 2px 10px rgba(0,0,0,0.2)",
        transform: hover ? "translateY(-3px)" : "translateY(0)",
        transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)",
        textDecoration: "none",
      }}>
      {showImg && (
        <div style={{ position: "relative", height: 110, overflow: "hidden", flexShrink: 0 }}>
          <img src={noticia.imagem} alt="" onError={() => setImgError(true)}
            style={{
              width: "100%", height: "100%", objectFit: "cover", display: "block",
              transform: hover ? "scale(1.04)" : "scale(1)", transition: "transform 0.4s ease",
            }}
          />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 40%, rgba(10,18,32,0.85) 100%)" }} />
        </div>
      )}
      <div style={{ padding: "11px 13px 10px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#F9FAFB", lineHeight: 1.4,
          display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {noticia.titulo}
        </div>
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between",
          paddingTop: 8, borderTop: "1px solid rgba(245,158,11,0.15)" }}>
          <span style={{ fontSize: 9.5, color: "#64748B", fontFamily: MONO }}>
            {tempoRelativo(noticia.atualizado)}
          </span>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: "#F59E0B", fontFamily: MONO,
            letterSpacing: "0.06em", opacity: hover ? 1 : 0.6, transition: "opacity 0.2s" }}>
            {noticia.lang === "es" ? "LEER →" : "READ →"}
          </span>
        </div>
      </div>
    </a>
  )
}

export default function Noticias() {
  const [noticias, setNoticias]       = useState([])
  const [intelGlobal, setIntelGlobal] = useState([])
  const [loading, setLoading]         = useState(true)
  const [loadingFresco, setLoadingFresco] = useState(false)
  const [erro, setErro]               = useState(null)
  const [selecionada, setSelecionada] = useState(null)
  const [ultimaAtt, setUltimaAtt]     = useState(null)
  const [pagina, setPagina]           = useState(0)
  const fetchedRef = useRef(false)
  const [abaAtiva, setAbaAtiva] = useState("br") // "br" | "global"

  async function buscarNoticias() {
    setLoading(true)
    setErro(null)
    try {
      const res = await api.get("/noticias")
      if (!res || !res.ok) throw new Error(`HTTP ${res?.status}`)
      const data = await res.json()
      setNoticias(data.noticias || [])
      setIntelGlobal(data.intel_global || [])
      setUltimaAtt(new Date())
      setPagina(0)
    } catch {
      setErro("Falha ao conectar com o backend.")
    } finally {
      setLoading(false)
    }
  }

  // Busca notícias frescas do Google News via backend (pode demorar ~15-30s)
  async function buscarFrescas() {
    setLoadingFresco(true)
    setErro(null)
    try {
      const res = await api.get("/noticias/atualizar")
      if (!res || !res.ok) throw new Error(`HTTP ${res?.status}`)
      // Após atualizar o JSON no backend, recarrega a lista
      await buscarNoticias()
    } catch {
      setErro("Falha ao buscar notícias frescas. Verifique a conexão com a internet.")
    } finally {
      setLoadingFresco(false)
    }
  }

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    buscarNoticias()
    const intervalo = setInterval(buscarNoticias, 5 * 60 * 1000)
    return () => clearInterval(intervalo)
  }, [])

  const totalPages  = Math.ceil(noticias.length / PER_PAGE)
  const paginaItems = noticias.slice(pagina * PER_PAGE, (pagina + 1) * PER_PAGE)

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", fontFamily: SANS, background: "#0B1120" }}>

      {/* Topbar */}
      <header style={{
        height: 48, borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", background: "#0F172A",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button style={{ width: 12, height: 12, borderRadius: "50%", background: "#FF5F57", border: "none", cursor: "pointer" }} onClick={() => window.electronAPI?.close()} />
            <button style={{ width: 12, height: 12, borderRadius: "50%", background: "#FEBC2E", border: "none", cursor: "pointer" }} onClick={() => window.electronAPI?.minimize()} />
            <button style={{ width: 12, height: 12, borderRadius: "50%", background: "#28C840", border: "none", cursor: "pointer" }} onClick={() => window.electronAPI?.maximize()} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#F1F5F9", letterSpacing: "0.02em" }}>Notícias</div>
            <div style={{ fontSize: 10, color: "#475569", fontFamily: MONO, marginTop: 1 }}>Monitor de Inteligência · Amazonas</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {ultimaAtt && (
            <span style={{ fontSize: 10, color: "#475569", fontFamily: MONO }}>
              att {ultimaAtt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={buscarFrescas}
            disabled={loadingFresco || loading}
            title="Busca notícias novas do Google News agora (~20s)"
            style={{
              fontSize: 10, fontWeight: 700, padding: "5px 12px",
              background: (loadingFresco || loading) ? "#1E293B" : "rgba(180,83,9,0.15)",
              color: (loadingFresco || loading) ? "#475569" : "#FCD34D",
              border: "1px solid " + ((loadingFresco || loading) ? "rgba(255,255,255,0.05)" : "rgba(252,211,77,0.25)"),
              borderRadius: 6, cursor: (loadingFresco || loading) ? "not-allowed" : "pointer",
              fontFamily: MONO, letterSpacing: "0.06em", transition: "all 0.15s",
            }}>
            {loadingFresco ? "BUSCANDO…" : "⬇ BUSCAR AGORA"}
          </button>
          <button onClick={buscarNoticias} disabled={loading || loadingFresco} style={{
            fontSize: 10, fontWeight: 700, padding: "5px 12px",
            background: (loading || loadingFresco) ? "#1E293B" : "#1E3A5F",
            color: (loading || loadingFresco) ? "#475569" : "#60A5FA",
            border: "1px solid " + ((loading || loadingFresco) ? "rgba(255,255,255,0.05)" : "rgba(96,165,250,0.25)"),
            borderRadius: 6, cursor: (loading || loadingFresco) ? "not-allowed" : "pointer",
            fontFamily: MONO, letterSpacing: "0.06em", transition: "all 0.15s",
          }}>
            {loading ? "CARREGANDO…" : "↻ ATUALIZAR"}
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div style={{ display:"flex", alignItems:"center", gap:0, padding:"0 20px", background:"#0F172A", borderBottom:"1px solid rgba(255,255,255,0.07)", flexShrink:0 }}>
        {[
          { id:"br",     label:"CRIMES BR",    badge: noticias.length,    cor:"#60A5FA" },
          { id:"global", label:"INTEL GLOBAL",  badge: intelGlobal.length, cor:"#F59E0B" },
        ].map(tab => (
          <button key={tab.id} onClick={() => setAbaAtiva(tab.id)}
            style={{
              display:"flex", alignItems:"center", gap:6,
              padding:"10px 16px", background:"transparent", border:"none", cursor:"pointer",
              borderBottom: abaAtiva===tab.id ? `2px solid ${tab.cor}` : "2px solid transparent",
              marginBottom:-1, transition:"all .15s",
            }}>
            <span style={{ fontSize:10, fontWeight:700, letterSpacing:"0.1em", fontFamily:"'JetBrains Mono','Roboto Mono',monospace",
              color: abaAtiva===tab.id ? tab.cor : "#475569" }}>{tab.label}</span>
            {tab.badge > 0 && (
              <span style={{ fontSize:9, fontWeight:700, padding:"1px 6px", borderRadius:10,
                background: abaAtiva===tab.id ? tab.cor+"22" : "rgba(255,255,255,0.04)",
                color: abaAtiva===tab.id ? tab.cor : "#475569",
                border:"1px solid "+(abaAtiva===tab.id ? tab.cor+"44" : "rgba(255,255,255,0.06)"),
                fontFamily:"'JetBrains Mono','Roboto Mono',monospace",
              }}>{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "18px 22px 10px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Loading */}
        {loading && noticias.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 12 }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", border: "2.5px solid rgba(255,255,255,0.08)", borderTopColor: "#B45309", animation: "spin 0.8s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <span style={{ fontSize: 12, color: "#475569", fontFamily: "'JetBrains Mono','Roboto Mono',monospace" }}>carregando relatórios...</span>
          </div>
        )}

        {/* Erro */}
        {erro && (
          <div style={{
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
            borderRadius: 8, padding: "13px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 12.5, color: "#FCA5A5", fontWeight: 600 }}>⚠ {erro}</span>
            <button onClick={buscarNoticias} style={{
              fontSize: 10, fontWeight: 700, padding: "4px 12px", background: "#DC2626",
              color: "#FFF", border: "none", borderRadius: 4, cursor: "pointer", fontFamily: "'JetBrains Mono','Roboto Mono',monospace",
            }}>TENTAR NOVAMENTE</button>
          </div>
        )}

        {/* ── ABA: CRIMES BR ── */}
        {abaAtiva === "br" && (
          <>
            {!loading && !erro && noticias.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 10 }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="0.9" strokeLinecap="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                </svg>
                <span style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>Nenhum relatório encontrado</span>
                <span style={{ fontSize: 11, color: "#334155", fontFamily: "'JetBrains Mono','Roboto Mono',monospace" }}>Clique em "BUSCAR AGORA" para carregar notícias do Google News</span>
              </div>
            )}
            {noticias.length > 0 && (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, paddingBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 3, height: 16, borderRadius: 2, background: "linear-gradient(to bottom, #60A5FA, #A78BFA)" }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#CBD5E1", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'JetBrains Mono','Roboto Mono',monospace" }}>
                      Monitor de Inteligência
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 20, background: "rgba(96,165,250,0.12)", color: "#60A5FA", fontFamily: "'JetBrains Mono','Roboto Mono',monospace", border: "1px solid rgba(96,165,250,0.2)" }}>{noticias.length} artigos</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: loadingFresco ? "#F59E0B" : "#22C55E", boxShadow: loadingFresco ? "0 0 8px #F59E0B" : "0 0 6px #22C55E", transition: "all 0.3s" }} />
                    <span style={{ fontSize: 10, color: loadingFresco ? "#FCD34D" : "#86EFAC", fontFamily: "'JetBrains Mono','Roboto Mono',monospace", fontWeight: 600 }}>
                      {loadingFresco ? "atualizando…" : "G1 · Polícia · RSS"}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {paginaItems.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "1.85fr 1fr", gap: 18 }}>
                      <CardNoticia key={pagina * PER_PAGE} noticia={paginaItems[0]} variant="featured" onClick={() => setSelecionada(paginaItems[0])} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                        {paginaItems.slice(1, 3).map((n, i) => (
                          <CardNoticia key={pagina * PER_PAGE + i + 1} noticia={n} variant="side" onClick={() => setSelecionada(n)} />
                        ))}
                      </div>
                    </div>
                  )}
                  {paginaItems.length > 3 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
                      {paginaItems.slice(3).map((n, i) => (
                        <CardNoticia key={pagina * PER_PAGE + i + 3} noticia={n} variant="normal" onClick={() => setSelecionada(n)} />
                      ))}
                    </div>
                  )}
                </div>
                {totalPages > 1 && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 6, paddingBottom: 4, flexShrink: 0 }}>
                    <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={pagina === 0}
                      style={{ padding: "5px 14px", borderRadius: 6, fontFamily: "'JetBrains Mono','Roboto Mono',monospace", fontSize: 10, fontWeight: 700, cursor: pagina === 0 ? "not-allowed" : "pointer", background: pagina === 0 ? "#1E293B" : "#1E3A5F", color: pagina === 0 ? "#334155" : "#60A5FA", border: "1px solid " + (pagina === 0 ? "rgba(255,255,255,0.04)" : "rgba(96,165,250,0.2)"), transition: "all 0.15s" }}>
                      ← ANTERIOR</button>
                    <span style={{ fontSize: 10, color: "#475569", fontFamily: "'JetBrains Mono','Roboto Mono',monospace", letterSpacing: "0.06em" }}>{pagina + 1} / {totalPages}</span>
                    <button onClick={() => setPagina(p => Math.min(totalPages - 1, p + 1))} disabled={pagina === totalPages - 1}
                      style={{ padding: "5px 14px", borderRadius: 6, fontFamily: "'JetBrains Mono','Roboto Mono',monospace", fontSize: 10, fontWeight: 700, cursor: pagina === totalPages - 1 ? "not-allowed" : "pointer", background: pagina === totalPages - 1 ? "#1E293B" : "#1E3A5F", color: pagina === totalPages - 1 ? "#334155" : "#60A5FA", border: "1px solid " + (pagina === totalPages - 1 ? "rgba(255,255,255,0.04)" : "rgba(96,165,250,0.2)"), transition: "all 0.15s" }}>
                      PRÓXIMA →</button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── ABA: INTEL GLOBAL ── */}
        {abaAtiva === "global" && (
          <>
            {intelGlobal.length === 0 ? (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flex:1, gap:12 }}>
                {loading || loadingFresco ? (
                  <>
                    <div style={{ width:26, height:26, borderRadius:"50%", border:"2.5px solid rgba(255,255,255,0.08)", borderTopColor:"#F59E0B", animation:"spin 0.8s linear infinite" }} />
                    <span style={{ fontSize:12, color:"#475569", fontFamily:"'JetBrains Mono','Roboto Mono',monospace" }}>buscando intel global...</span>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize:28 }}>🌎</span>
                    <span style={{ fontSize:13, color:"#64748B", fontWeight:600 }}>Nenhum artigo internacional carregado</span>
                    <span style={{ fontSize:11, color:"#334155", fontFamily:"'JetBrains Mono','Roboto Mono',monospace", textAlign:"center", maxWidth:320 }}>
                      Clique em "BUSCAR AGORA" para carregar artigos do InSight Crime (crime organizado na América Latina)
                    </span>
                    <button onClick={buscarFrescas} style={{ marginTop:6, fontSize:10, fontWeight:700, padding:"6px 16px", background:"rgba(245,158,11,0.15)", color:"#FCD34D", border:"1px solid rgba(245,158,11,0.3)", borderRadius:6, cursor:"pointer", fontFamily:"'JetBrains Mono','Roboto Mono',monospace", letterSpacing:"0.06em" }}>
                      ⬇ BUSCAR AGORA
                    </button>
                  </>
                )}
              </div>
            ) : (
              <>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", paddingBottom:12, borderBottom:"1px solid rgba(245,158,11,0.15)", marginBottom:4 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:3, height:16, borderRadius:2, background:"linear-gradient(to bottom, #F59E0B, #FB923C)" }} />
                    <span style={{ fontSize:11, fontWeight:700, color:"#FCD34D", letterSpacing:"0.12em", fontFamily:"'JetBrains Mono','Roboto Mono',monospace" }}>INTEL GLOBAL</span>
                    <span style={{ fontSize:9.5, fontWeight:700, padding:"2px 8px", borderRadius:20, background:"rgba(245,158,11,0.12)", color:"#F59E0B", fontFamily:"'JetBrains Mono','Roboto Mono',monospace", border:"1px solid rgba(245,158,11,0.2)" }}>{intelGlobal.length} artigos</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:10, color:"#64748B", fontFamily:"'JetBrains Mono','Roboto Mono',monospace" }}>InSight Crime · RSS</span>
                    <span style={{ fontSize:9, fontWeight:700, padding:"2px 7px", borderRadius:4, background:"rgba(245,158,11,0.10)", color:"#F59E0B", fontFamily:"'JetBrains Mono','Roboto Mono',monospace", border:"1px solid rgba(245,158,11,0.2)" }}>ES</span>
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:14 }}>
                  {intelGlobal.map((n, i) => (
                    <CardIntelGlobal key={i} noticia={n} />
                  ))}
                </div>
              </>
            )}
          </>
        )}

      </div>

      {selecionada && <ModalRelatorio noticia={selecionada} onClose={() => setSelecionada(null)} />}
    
    </div>
  )
}
