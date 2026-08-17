/**
 * OperacoesDrone.jsx — Operações Drone (Missão 31)
 * ─────────────────────────────────────────────────────────────────────────
 * Gestão de missões de voo, importação de mídia do cartão SD e acervo
 * aéreo georreferenciado. O trajeto do voo é reconstruído a partir do
 * EXIF das fotos (GPS + timestamp) — sem integração com o drone.
 *
 * Segurança: thumbnails são buscados via fetch autenticado (JWT) e
 * exibidos como objectURL — <img src> direto não envia Authorization.
 */
import { useState, useEffect, useRef } from "react"
import api from "./api"
import { C, T, MONO, SANS, BASE_CSS } from "./theme"
// Leaflet embutido no bundle (CSP script-src 'self' bloqueia CDN).
// Tiles OSM são <img> https: — já permitidos pelo img-src do electron.cjs.
import L from "leaflet"
import "leaflet/dist/leaflet.css"

// Contraste reforçado (pedido operacional): os tons padrão do theme
// (textDim rgba 0.32 / textMid #94A3B8) somem no fundo escuro.
const TXT_MID = "#E6EBF2"   // texto secundário — quase branco
const TXT_DIM = "#C3CEDC"   // rótulos e metadados — cinza claro legível

const FINALIDADES = {
  vigilancia_perimetro: { label: "Vigilância de Perímetro", color: "#60A5FA" },
  cobertura_vegetal:    { label: "Cobertura Vegetal",       color: "#4ADE80" },
  apoio_operacao:       { label: "Apoio a Operação",        color: "#F59E0B" },
  outra:                { label: "Outra",                   color: "#94A3B8" },
}

const STATUS_STYLE = {
  planejada:         { label: "PLANEJADA",  color: "#FDE68A", bg: "rgba(251,191,36,0.14)", border: "rgba(251,191,36,0.35)" },
  realizada:         { label: "REALIZADA",  color: "#86EFAC", bg: "rgba(74,222,128,0.14)", border: "rgba(74,222,128,0.35)" },
  relatorio_emitido: { label: "RELATÓRIO",  color: "#93C5FD", bg: "rgba(96,165,250,0.14)", border: "rgba(96,165,250,0.35)" },
  arquivada:         { label: "ARQUIVADA",  color: "#CBD5E1", bg: "rgba(148,163,184,0.14)", border: "rgba(148,163,184,0.30)" },
}

const CHECKLIST_ITENS = [
  { key: "sarpas",   label: "Autorização SARPAS/DECEA emitida" },
  { key: "bateria",  label: "Baterias carregadas e inspecionadas" },
  { key: "helices",  label: "Hélices e gimbal verificados" },
  { key: "clima",    label: "Condições meteorológicas avaliadas" },
  { key: "area",     label: "Área de decolagem/pouso isolada" },
  { key: "cartao",   label: "Cartão SD formatado e com espaço" },
]

function fmtBytes(b) {
  if (!b) return "0 MB"
  const gb = b / (1024 ** 3)
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(b / (1024 ** 2)).toFixed(1)} MB`
}
function fmtData(iso) {
  if (!iso) return "—"
  try { return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) }
  catch { return iso }
}

/* ── Imagem autenticada: fetch com JWT → blob → objectURL ──
   `midiaId` busca o thumb da mídia; `path` busca qualquer endpoint de
   imagem da API (ex.: heatmaps de comparação). <img src> não envia JWT. */
function ThumbAuth({ midiaId, path, alt, style, onClick }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let revoke = null, vivo = true
    api.get(path || `/drone/midia/${midiaId}/thumb`)
      .then(r => (r && r.ok ? r.blob() : null))
      .then(b => { if (b && vivo) { revoke = URL.createObjectURL(b); setUrl(revoke) } })
      .catch(() => {})
    return () => { vivo = false; if (revoke) URL.revokeObjectURL(revoke) }
  }, [midiaId, path])
  if (!url) return <div style={{ ...style, display: "flex", alignItems: "center", justifyContent: "center", background: C.surfaceUp, color: TXT_DIM, fontSize: 11 }}>…</div>
  return <img src={url} alt={alt} style={style} onClick={onClick} loading="lazy" />
}

/* ── Slider antes/depois: a imagem "antes" é recortada pela posição ── */
function SliderComparacao({ par, onClose }) {
  const [pos, setPos] = useState(50)
  const W = 620, H = 465
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1100,
      background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center",
      justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface,
        border: `1px solid ${C.borderUp}`, borderRadius: 12, padding: 16, maxWidth: W + 32 }}>
        <div style={{ position: "relative", width: W, maxWidth: "82vw", height: H,
          borderRadius: 8, overflow: "hidden" }}>
          <ThumbAuth midiaId={par.b.id} alt="depois"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", top: 0, left: 0, height: "100%",
            width: `${pos}%`, overflow: "hidden" }}>
            <ThumbAuth midiaId={par.a.id} alt="antes"
              style={{ width: W, maxWidth: "82vw", height: H, objectFit: "cover" }} />
          </div>
          <div style={{ position: "absolute", top: 0, bottom: 0, left: `${pos}%`,
            width: 2, background: C.gold, boxShadow: "0 0 8px rgba(232,160,32,0.9)" }} />
          <span style={{ position: "absolute", top: 8, left: 8, fontSize: 10, fontFamily: MONO,
            padding: "2px 8px", borderRadius: 4, background: "rgba(0,0,0,0.65)", color: "#4ADE80" }}>
            ANTES · {par.a.capturado_em?.slice(0, 10) || ""}</span>
          <span style={{ position: "absolute", top: 8, right: 8, fontSize: 10, fontFamily: MONO,
            padding: "2px 8px", borderRadius: 4, background: "rgba(0,0,0,0.65)", color: "#F87171" }}>
            DEPOIS · {par.b.capturado_em?.slice(0, 10) || ""}</span>
        </div>
        <input type="range" min="0" max="100" value={pos}
          onChange={e => setPos(Number(e.target.value))}
          style={{ width: "100%", marginTop: 12, accentColor: C.gold }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
          <span style={{ fontSize: 11, color: TXT_DIM, fontFamily: MONO }}>
            Δ vegetação {par.delta_veg > 0 ? "+" : ""}{par.delta_veg}% · mudança {par.diff_pct}% · pareadas a {par.dist_m} m
          </span>
          <button onClick={onClose} style={{ padding: "7px 16px", borderRadius: 7,
            border: `1px solid ${C.border}`, background: "transparent", color: TXT_MID,
            fontSize: 12, cursor: "pointer" }}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

/* ── Estatísticas do voo — calculadas dos pontos EXIF já importados ── */
function haversine(a, b) {
  // Distância em metros entre 2 coordenadas (fórmula de Haversine).
  // Aproximação esférica da Terra: erro < 0.5% — suficiente para voo local.
  const R = 6371000, rad = d => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon)
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

function statsVoo(pontos) {
  if (!pontos || pontos.length < 2) return null
  let dist = 0
  for (let i = 1; i < pontos.length; i++) dist += haversine(pontos[i - 1], pontos[i])
  const lats = pontos.map(p => p.lat), lons = pontos.map(p => p.lon)
  const alts = pontos.map(p => p.alt).filter(a => a != null)
  const bbox = { minLat: Math.min(...lats), maxLat: Math.max(...lats),
                 minLon: Math.min(...lons), maxLon: Math.max(...lons) }
  const larguraM = haversine({ lat: bbox.minLat, lon: bbox.minLon }, { lat: bbox.minLat, lon: bbox.maxLon })
  const alturaM  = haversine({ lat: bbox.minLat, lon: bbox.minLon }, { lat: bbox.maxLat, lon: bbox.minLon })
  const t0 = new Date(pontos[0].capturado_em), t1 = new Date(pontos[pontos.length - 1].capturado_em)
  return {
    n: pontos.length,
    distM: dist,
    durMin: Math.max(0, (t1 - t0) / 60000),
    altMin: alts.length ? Math.min(...alts) : null,
    altMax: alts.length ? Math.max(...alts) : null,
    areaHa: (larguraM * alturaM) / 10000,
    larguraM,
  }
}

function FlightStats({ s }) {
  if (!s) return null
  const chip = { background: C.surfaceUp, border: `1px solid ${C.border}`, borderRadius: 7,
    padding: "7px 12px", minWidth: 108 }
  const num = { fontSize: 15.5, fontWeight: 800, color: C.text, fontFamily: MONO }
  const cap = { fontSize: 9.5, color: TXT_DIM, fontFamily: MONO, letterSpacing: "0.07em",
    textTransform: "uppercase", marginTop: 1 }
  const fmtDist = m => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`)
  const fmtDur = min => (min >= 60 ? `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, "0")}` : `${min.toFixed(min < 10 ? 1 : 0)} min`)
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
      <div style={chip}><div style={num}>{s.n}</div><div style={cap}>pontos GPS</div></div>
      <div style={chip}><div style={num}>{fmtDist(s.distM)}</div><div style={cap}>percorrido</div></div>
      <div style={chip}><div style={num}>{fmtDur(s.durMin)}</div><div style={cap}>duração</div></div>
      {s.altMax != null &&
        <div style={chip}><div style={num}>{Math.round(s.altMin)}–{Math.round(s.altMax)} m</div><div style={cap}>altitude</div></div>}
      <div style={chip}><div style={num}>{s.areaHa >= 1 ? s.areaHa.toFixed(1) : s.areaHa.toFixed(2)} ha</div><div style={cap}>área varrida</div></div>
    </div>
  )
}

/* ── Camadas base compartilhadas: Mapa (OSM) × Satélite (Esri) ──
   O seletor nasce no canto do mapa. Satélite é essencial p/ conferir o
   encaixe do mosaico: compara a foto aérea do drone com a imagem orbital. */
function adicionarCamadasBase(mapa) {
  const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    { maxZoom: 19, attribution: "© OpenStreetMap" })
  const sat = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19, attribution: "© Esri · World Imagery" })
  osm.addTo(mapa)
  L.control.layers({ "Mapa": osm, "Satélite": sat }, null,
    { position: "topright", collapsed: false }).addTo(mapa)
  return osm
}

/* ── Trajeto sobre mapa real (Leaflet + OSM/Satélite) — requer internet ── */
function TrajetoLeaflet({ pontos, onPonto, onSemTiles }) {
  const divRef = useRef(null)
  useEffect(() => {
    if (!divRef.current || !pontos || pontos.length < 2) return
    const mapa = L.map(divRef.current, { zoomControl: true, attributionControl: true })
    const tiles = adicionarCamadasBase(mapa)
    // Rede fechada: 1º tile que falhar → avisa o pai p/ trocar pro esquema SVG
    let avisou = false
    tiles.on("tileerror", () => { if (!avisou) { avisou = true; onSemTiles?.() } })

    const linha = L.polyline(pontos.map(p => [p.lat, p.lon]),
      { color: "#E8A020", weight: 3, opacity: 0.9 }).addTo(mapa)
    pontos.forEach((p, i) => {
      const cor = i === 0 ? "#4ADE80" : i === pontos.length - 1 ? "#EF4444" : "#E8A020"
      L.circleMarker([p.lat, p.lon], { radius: 6, color: cor, fillColor: cor,
        fillOpacity: 0.85, weight: 1.5 })
        .addTo(mapa)
        .on("click", () => onPonto?.(p))
        .bindTooltip(`#${i + 1} · ${fmtData(p.capturado_em)}${p.alt ? ` · ${Math.round(p.alt)}m` : ""}`)
    })
    mapa.fitBounds(linha.getBounds().pad(0.25))
    return () => mapa.remove()
  }, [pontos])
  return <div ref={divRef} style={{ height: 360, borderRadius: 8, overflow: "hidden",
    border: `1px solid ${C.border}`, background: "#0D1526" }} />
}

/* ── Mosaico georreferenciado sobre o mapa (imageOverlay + opacidade) ── */
function MosaicoMapa({ jobId, bounds }) {
  const divRef = useRef(null)
  const overlayRef = useRef(null)
  const [opacidade, setOpacidade] = useState(0.85)
  const [url, setUrl] = useState(null)
  const [erroImg, setErroImg] = useState(null)

  useEffect(() => {
    let revoke = null, vivo = true
    setUrl(null); setErroImg(null)
    async function carregar() {
      // 1º tenta o preview PNG transparente; se não existir (mosaico gerado
      // por versão antiga do backend), cai para o JPEG completo.
      let r = await api.get(`/drone/mosaico/${jobId}/preview`).catch(() => null)
      if (!r || !r.ok) r = await api.get(`/drone/mosaico/${jobId}/imagem`).catch(() => null)
      if (!r || !r.ok) {
        if (vivo) setErroImg(`Falha ao carregar a imagem (HTTP ${r ? r.status : "sem conexão"}). ` +
          "Gere um novo mosaico — os antigos podem não ter arquivo de exibição.")
        return
      }
      const b = await r.blob()
      if (vivo) { revoke = URL.createObjectURL(b); setUrl(revoke) }
    }
    carregar()
    return () => { vivo = false; if (revoke) URL.revokeObjectURL(revoke) }
  }, [jobId])

  useEffect(() => {
    if (!url || !divRef.current) return
    const mapa = L.map(divRef.current)
    adicionarCamadasBase(mapa)
    overlayRef.current = L.imageOverlay(url, bounds, { opacity: 0.85 }).addTo(mapa)
    mapa.fitBounds(bounds)
    return () => { overlayRef.current = null; mapa.remove() }
  }, [url])

  useEffect(() => { overlayRef.current?.setOpacity(opacidade) }, [opacidade])

  if (!url) return <div style={{ height: 420, display: "flex", alignItems: "center",
    justifyContent: "center", background: "#0D1526", borderRadius: 8, padding: 20,
    textAlign: "center", color: erroImg ? "#FCA5A5" : TXT_DIM, fontFamily: MONO,
    fontSize: 12, lineHeight: 1.6 }}>{erroImg || "Carregando mosaico… (varreduras grandes podem levar alguns segundos)"}</div>
  return (
    <div>
      <div ref={divRef} style={{ height: 420, borderRadius: 8, overflow: "hidden",
        border: `1px solid ${C.border}`, background: "#0D1526" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
        <span style={{ fontSize: 10.5, color: TXT_DIM, fontFamily: MONO }}>Opacidade</span>
        <input type="range" min="10" max="100" value={opacidade * 100}
          onChange={e => setOpacidade(Number(e.target.value) / 100)}
          style={{ flex: 1, accentColor: C.gold }} />
        <span style={{ fontSize: 10.5, color: TXT_MID, fontFamily: MONO, minWidth: 34 }}>
          {Math.round(opacidade * 100)}%</span>
      </div>
    </div>
  )
}

/* ── Modal: foto tirada no ponto clicado do trajeto ── */
function FotoModal({ ponto, midias, onClose }) {
  const md = (midias || []).find(m => m.id === ponto.id)
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center",
      justifyContent: "center", padding: 30 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface,
        border: `1px solid ${C.borderUp}`, borderRadius: 12, overflow: "hidden",
        maxWidth: 640, width: "100%" }}>
        <ThumbAuth midiaId={ponto.id} alt={md?.nome_original || "foto"}
          style={{ width: "100%", maxHeight: 420, objectFit: "contain",
            display: "block", background: "#000" }} />
        <div style={{ padding: "12px 16px", display: "flex",
          justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{md?.nome_original || "—"}</div>
            <div style={{ fontSize: 11, color: TXT_DIM, fontFamily: MONO, marginTop: 3 }}>
              {fmtData(ponto.capturado_em)} · {ponto.lat.toFixed(5)}, {ponto.lon.toFixed(5)}
              {ponto.alt != null && ` · ${Math.round(ponto.alt)} m`}
              {md && ` · ${fmtBytes(md.tamanho)}`}
            </div>
          </div>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 7,
            border: `1px solid ${C.border}`, background: "transparent", color: TXT_MID,
            fontSize: 12.5, cursor: "pointer", flexShrink: 0 }}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

/* ── Trajeto do voo em SVG puro — funciona 100% offline ── */
function TrajetoSVG({ pontos, onPonto }) {
  if (!pontos || pontos.length < 2) {
    return <div style={{ padding: 18, color: TXT_DIM, fontSize: 13, fontFamily: MONO }}>
      {pontos?.length === 1 ? "Apenas 1 ponto GPS — trajeto precisa de 2+." : "Sem dados GPS nesta missão."}
    </div>
  }
  const W = 560, H = 300, PAD = 28
  const lats = pontos.map(p => p.lat), lons = pontos.map(p => p.lon)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const spanLat = (maxLat - minLat) || 1e-6, spanLon = (maxLon - minLon) || 1e-6
  const x = lon => PAD + ((lon - minLon) / spanLon) * (W - 2 * PAD)
  const y = lat => H - PAD - ((lat - minLat) / spanLat) * (H - 2 * PAD)
  const path = pontos.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.lon).toFixed(1)},${y(p.lat).toFixed(1)}`).join(" ")
  const ini = pontos[0], fim = pontos[pontos.length - 1]

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ background: "#0D1526", borderRadius: 8, border: `1px solid ${C.border}` }}>
      {/* grade de referência */}
      {[0.25, 0.5, 0.75].map(f => (
        <g key={f} stroke="rgba(255,255,255,0.05)">
          <line x1={PAD + f * (W - 2 * PAD)} y1={PAD} x2={PAD + f * (W - 2 * PAD)} y2={H - PAD} />
          <line x1={PAD} y1={PAD + f * (H - 2 * PAD)} x2={W - PAD} y2={PAD + f * (H - 2 * PAD)} />
        </g>
      ))}
      <path d={path} fill="none" stroke={C.gold} strokeWidth="2" strokeLinejoin="round" strokeDasharray="1 0" opacity="0.9" />
      {pontos.map((p, i) => (
        <circle key={i} cx={x(p.lon)} cy={y(p.lat)} r="5" fill="#0B1120" stroke={C.gold}
          strokeWidth="1.5" style={{ cursor: "pointer" }} onClick={() => onPonto?.(p)}>
          <title>{`#${i + 1} · ${fmtData(p.capturado_em)} · ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}${p.alt ? ` · ${p.alt}m` : ""} — clique p/ ver a foto`}</title>
        </circle>
      ))}
      {/* Escala real: largura do gráfico em metros (evita ilusão de distância) */}
      <text x={PAD} y={H - 8} fill={TXT_DIM} fontSize="10" fontFamily={MONO}>
        {(() => {
          const m = haversine({ lat: minLat, lon: minLon }, { lat: minLat, lon: maxLon })
          return `largura ≈ ${m >= 1000 ? (m / 1000).toFixed(2) + " km" : Math.round(m) + " m"}`
        })()}
      </text>
      <circle cx={x(ini.lon)} cy={y(ini.lat)} r="6" fill="#4ADE80" opacity="0.9"><title>Início</title></circle>
      <circle cx={x(fim.lon)} cy={y(fim.lat)} r="6" fill="#EF4444" opacity="0.9"><title>Fim</title></circle>
      <text x={PAD} y={16} fill={TXT_DIM} fontSize="10" fontFamily={MONO}>
        {pontos.length} pontos GPS · {minLat.toFixed(4)},{minLon.toFixed(4)} → {maxLat.toFixed(4)},{maxLon.toFixed(4)}
      </text>
      <g fontSize="10" fontFamily={MONO}>
        <circle cx={W - 150} cy={13} r="4" fill="#4ADE80" /><text x={W - 142} y={16} fill={TXT_MID}>decolagem</text>
        <circle cx={W - 66} cy={13} r="4" fill="#EF4444" /><text x={W - 58} y={16} fill={TXT_MID}>final</text>
      </g>
    </svg>
  )
}

export default function OperacoesDrone({ onNavigate }) {
  const [missoes, setMissoes]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [erro, setErro]               = useState(null)
  const [selecionada, setSelecionada] = useState(null)   // missão detalhada
  const [trajeto, setTrajeto]         = useState([])
  const [filtro, setFiltro]           = useState("TODAS")

  // formulário nova missão
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nome: "", perimetro: "", finalidade: "vigilancia_perimetro",
    piloto: "", drone_modelo: "", data_voo: "", sarpas_protocolo: "", observacoes: "", checklist: {} })
  const [salvando, setSalvando] = useState(false)

  // importação
  const [origemPath, setOrigemPath] = useState("")
  const [job, setJob]               = useState(null)
  const [importErro, setImportErro] = useState(null)
  const pollRef = useRef(null)

  // trajeto: mapa real (online) ou esquema SVG (offline) + foto do ponto clicado
  const [modoMapa, setModoMapa]   = useState(true)
  const [fotoModal, setFotoModal] = useState(null)

  // relatório de voo (Fase 2)
  const [parecer, setParecer] = useState("")
  const [gerando, setGerando] = useState(null)   // "docx" | "pdf" | null

  // mosaico rápido (Fase 4)
  const [mosaicos, setMosaicos]         = useState([])
  const [qualidadeMos, setQualidadeMos] = useState("rapida")
  const [jobMos, setJobMos]             = useState(null)
  const [mosaicoAtivo, setMosaicoAtivo] = useState(null)
  const pollMosRef = useRef(null)

  function carregarMosaicos(id) {
    api.get(`/drone/missoes/${id}/mosaicos`)
      .then(r => r?.json())
      .then(d => setMosaicos(d?.mosaicos || []))
      .catch(() => setMosaicos([]))
  }

  async function gerarMosaico() {
    if (!selecionada || jobMos?.status === "executando") return
    const res = await api.post(`/drone/missoes/${selecionada.id}/mosaico`,
      { qualidade: qualidadeMos })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setErro(d.detail || "Erro ao iniciar mosaico."); return }
    setJobMos({ id: d.job_id, total: d.total, processados: 0, status: "executando" })
    clearInterval(pollMosRef.current)
    pollMosRef.current = setInterval(async () => {
      const r = await api.get(`/drone/mosaico/${d.job_id}`)
      if (!r.ok) return
      const j = await r.json()
      setJobMos(j)
      if (j.status !== "executando") {
        clearInterval(pollMosRef.current)
        if (j.status === "concluido") {
          carregarMosaicos(selecionada.id)
          setMosaicoAtivo(j)
        }
      }
    }, 2000)
  }
  useEffect(() => () => clearInterval(pollMosRef.current), [])

  // comparação de voos (Fase 3)
  const [alvoComp, setAlvoComp]       = useState("")
  const [comparando, setComparando]   = useState(false)
  const [resultComp, setResultComp]   = useState(null)
  const [erroComp, setErroComp]       = useState(null)
  const [parSlider, setParSlider]     = useState(null)

  async function compararVoos() {
    if (!selecionada || !alvoComp || comparando) return
    setComparando(true); setErroComp(null); setResultComp(null)
    try {
      // Convenção: missão selecionada = "depois" (atual); alvo = "antes" (referência)
      const res = await api.post("/drone/comparar",
        { missao_a: alvoComp, missao_b: selecionada.id, raio_m: 15 })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) setErroComp(d.detail || "Erro na comparação.")
      else setResultComp(d)
    } catch { setErroComp("Falha de conexão.") }
    setComparando(false)
  }

  async function gerarRelatorio(formato) {
    if (!selecionada || gerando) return
    setGerando(formato)
    try {
      const res = await api.post(`/drone/missoes/${selecionada.id}/relatorio`, { formato, parecer })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setErro(d.detail || "Erro ao gerar relatório.")
      } else {
        // Baixa o arquivo: blob autenticado → link temporário → clique programático
        const blob = await res.blob()
        const cd = res.headers.get("Content-Disposition") || ""
        const nome = (cd.match(/filename="(.+?)"/) || [])[1] || `relatorio_voo.${formato}`
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url; a.download = nome; a.click()
        URL.revokeObjectURL(url)
        abrirMissao(selecionada.id); carregar()   // status → RELATÓRIO
      }
    } catch { setErro("Falha de conexão ao gerar relatório.") }
    setGerando(null)
  }

  useEffect(() => {
    const style = document.createElement("style")
    style.textContent = BASE_CSS
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  function carregar() {
    api.get("/drone/missoes")
      .then(r => r?.json())
      .then(d => { setMissoes(d?.missoes || []); setLoading(false) })
      .catch(() => { setErro("Falha ao conectar com o backend."); setLoading(false) })
  }
  useEffect(carregar, [])

  function abrirMissao(id) {
    setJob(null); setImportErro(null); setOrigemPath("")
    setResultComp(null); setErroComp(null); setAlvoComp(""); setParSlider(null)
    setJobMos(null); setMosaicoAtivo(null); carregarMosaicos(id)
    api.get(`/drone/missoes/${id}`).then(r => r?.json()).then(setSelecionada).catch(() => {})
    api.get(`/drone/missoes/${id}/trajeto`).then(r => r?.json()).then(d => setTrajeto(d?.pontos || [])).catch(() => setTrajeto([]))
  }

  async function criarMissao() {
    if (form.nome.trim().length < 3) { setErro("Nome da missão precisa de 3+ caracteres."); return }
    setSalvando(true); setErro(null)
    try {
      const res = await api.post("/drone/missoes", form)
      if (res.ok) {
        const nova = await res.json()
        setShowForm(false)
        setForm({ nome: "", perimetro: "", finalidade: "vigilancia_perimetro", piloto: "",
          drone_modelo: "", data_voo: "", sarpas_protocolo: "", observacoes: "", checklist: {} })
        carregar(); abrirMissao(nova.id)
      } else setErro("Erro ao criar missão.")
    } catch { setErro("Falha de conexão.") }
    setSalvando(false)
  }

  async function procurarPasta() {
    // Diálogo nativo do SO via IPC do Electron. No navegador (npm run dev
    // aberto no Chrome) a API não existe — o campo de texto continua valendo.
    if (!window.electronAPI?.selecionarPasta) {
      setImportErro("Seletor nativo disponível apenas no app Electron. No navegador, digite o caminho manualmente.")
      return
    }
    const pasta = await window.electronAPI.selecionarPasta("Selecionar pasta do cartão SD")
    if (pasta) { setOrigemPath(pasta); setImportErro(null) }
  }

  async function importar() {
    if (!selecionada) return
    // Validação com feedback — botão silencioso parece botão quebrado
    if (!origemPath.trim()) {
      setImportErro("Informe o caminho da pasta com as fotos/vídeos. Ex.: E:\\DCIM\\100MEDIA ou C:\\Users\\voce\\Pictures\\voo01")
      return
    }
    setImportErro(null)
    const res = await api.post(`/drone/missoes/${selecionada.id}/importar`, { origem: origemPath.trim() })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setImportErro(d.detail || "Erro ao iniciar importação.")
      return
    }
    const d = await res.json()
    setJob({ id: d.job_id, total: d.total, processados: 0, status: "executando" })
    // polling do progresso a cada 1.5s
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const r = await api.get(`/drone/importacao/${d.job_id}`)
      if (!r.ok) return
      const j = await r.json()
      setJob({ id: j.id, total: j.total, processados: j.processados, duplicados: j.duplicados,
               erros: j.erros, status: j.status, msg: j.msg })
      if (j.status !== "executando") {
        clearInterval(pollRef.current)
        abrirMissao(selecionada.id); carregar()
      }
    }, 1500)
  }
  useEffect(() => () => clearInterval(pollRef.current), [])

  const filtradas = filtro === "TODAS" ? missoes : missoes.filter(m => m.status === filtro)
  const inp = { width: "100%", padding: "9px 11px", borderRadius: 7, border: `1px solid ${C.borderUp}`,
    background: C.surfaceUp, color: C.text, fontSize: 13.5, fontFamily: SANS, outline: "none", marginBottom: 10 }
  const lbl = { fontSize: 11, fontWeight: 700, color: TXT_DIM, letterSpacing: "0.08em",
    textTransform: "uppercase", display: "block", marginBottom: 4, fontFamily: MONO }

  return (
    <div style={T.page}>

      {/* ═══ ASIDE — lista de missões ═══ */}
      <aside style={T.aside}>
        <div style={T.asideHeader}>
          <span style={T.asideTitle}>✈ Operações Drone</span>
        </div>

        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
          <button onClick={() => { setShowForm(true); setSelecionada(null) }} style={{
            width: "100%", padding: "10px 0", borderRadius: 8, border: `1px solid ${C.goldBorder}`,
            background: C.goldSoft, color: C.gold, fontWeight: 800, fontSize: 13.5, cursor: "pointer",
            letterSpacing: "0.05em" }}>
            + NOVA MISSÃO
          </button>
          <div style={{ display: "flex", gap: 5, marginTop: 9, flexWrap: "wrap" }}>
            {["TODAS", "planejada", "realizada", "arquivada"].map(f => (
              <button key={f} onClick={() => setFiltro(f)} style={{
                padding: "3px 8px", borderRadius: 5, fontSize: 10.5, fontFamily: MONO, cursor: "pointer",
                border: `1px solid ${filtro === f ? C.goldBorder : C.border}`,
                background: filtro === f ? C.goldSoft : "transparent",
                color: filtro === f ? C.gold : TXT_DIM }}>
                {f === "TODAS" ? "TODAS" : STATUS_STYLE[f]?.label || f}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
          {loading && <div style={{ color: TXT_DIM, fontSize: 13, padding: 10 }}>Carregando…</div>}
          {!loading && filtradas.length === 0 &&
            <div style={{ color: TXT_DIM, fontSize: 12.5, padding: 10, lineHeight: 1.5 }}>
              Nenhuma missão registrada.<br />Crie a primeira com o botão acima.
            </div>}
          {filtradas.map(m => {
            const st = STATUS_STYLE[m.status] || STATUS_STYLE.planejada
            const fin = FINALIDADES[m.finalidade] || FINALIDADES.outra
            const ativa = selecionada?.id === m.id
            return (
              <button key={m.id} onClick={() => { setShowForm(false); abrirMissao(m.id) }} style={{
                width: "100%", textAlign: "left", padding: "10px 11px", borderRadius: 8, marginBottom: 6,
                cursor: "pointer", background: ativa ? C.surfaceUp : "transparent",
                border: `1px solid ${ativa ? C.goldBorder : C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{m.nome}</span>
                  <span style={{ fontSize: 9, fontWeight: 800, fontFamily: MONO, padding: "2px 6px",
                    borderRadius: 4, color: st.color, background: st.bg, border: `1px solid ${st.border}`,
                    flexShrink: 0, marginLeft: 6 }}>{st.label}</span>
                </div>
                <div style={{ fontSize: 11, color: TXT_DIM, fontFamily: MONO }}>
                  <span style={{ color: fin.color }}>●</span> {fin.label} · {m.data_voo}
                </div>
                {m.midia?.total > 0 &&
                  <div style={{ fontSize: 10.5, color: TXT_MID, fontFamily: MONO, marginTop: 3 }}>
                    {m.midia.fotos} fotos · {m.midia.videos} vídeos · {fmtBytes(m.midia.bytes)}
                  </div>}
              </button>
            )
          })}
        </div>
      </aside>

      {/* ═══ MAIN ═══ */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <header style={{ padding: "16px 22px", borderBottom: `1px solid ${C.border}`, display: "flex",
          alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 18.2, fontWeight: 800, color: C.text }}>
              {showForm ? "Nova Missão de Voo" : selecionada ? selecionada.nome : "Operações Drone"}
            </div>
            <div style={{ fontSize: 12, color: TXT_DIM, fontFamily: MONO, marginTop: 2 }}>
              {showForm ? "Planejamento e conformidade SARPAS/DECEA"
                : selecionada ? `${selecionada.perimetro || "sem perímetro"} · piloto: ${selecionada.piloto || "—"} · ${selecionada.drone_modelo || "—"}`
                : "Gestão de voos, acervo aéreo e trajetos reconstruídos por EXIF"}
            </div>
          </div>
          <button onClick={() => onNavigate?.("Painel")} style={{ padding: "7px 14px", borderRadius: 7,
            border: `1px solid ${C.border}`, background: "transparent", color: TXT_MID, fontSize: 12.5,
            cursor: "pointer" }}>← Painel</button>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: 22 }}>
          {erro && <div style={{ padding: "10px 14px", borderRadius: 8, background: C.redSoft,
            border: `1px solid ${C.redBorder}`, color: "#FCA5A5", fontSize: 13, marginBottom: 14 }}>{erro}</div>}

          {/* ── Estado vazio ── */}
          {!showForm && !selecionada && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", height: "70%", color: TXT_DIM, textAlign: "center" }}>
              <div style={{ fontSize: 42, marginBottom: 10, opacity: 0.5 }}>✈</div>
              <div style={{ fontSize: 15, color: TXT_MID, marginBottom: 6 }}>Selecione uma missão ou crie uma nova</div>
              <div style={{ fontSize: 12.5, fontFamily: MONO, maxWidth: 420, lineHeight: 1.6 }}>
                Importe a pasta do cartão SD e o sistema reconstrói o voo automaticamente
                a partir do EXIF das fotos: trajeto, horários e área coberta.
              </div>
            </div>
          )}

          {/* ── Formulário nova missão ── */}
          {showForm && (
            <div style={{ maxWidth: 620 }}>
              <label style={lbl}>Nome da missão *</label>
              <input style={inp} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex.: Vigilância Perímetro Norte — Julho/2026" />
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Perímetro / área</label>
                  <input style={inp} value={form.perimetro} onChange={e => setForm({ ...form, perimetro: e.target.value })}
                    placeholder="Setor N-3" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Finalidade</label>
                  <select style={inp} value={form.finalidade} onChange={e => setForm({ ...form, finalidade: e.target.value })}>
                    {Object.entries(FINALIDADES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Piloto responsável</label>
                  <input style={inp} value={form.piloto} onChange={e => setForm({ ...form, piloto: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Drone / modelo</label>
                  <input style={inp} value={form.drone_modelo} onChange={e => setForm({ ...form, drone_modelo: e.target.value })}
                    placeholder="DJI Mavic 3" />
                </div>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Data do voo</label>
                  <input style={inp} type="date" value={form.data_voo} onChange={e => setForm({ ...form, data_voo: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Protocolo SARPAS</label>
                  <input style={inp} value={form.sarpas_protocolo} onChange={e => setForm({ ...form, sarpas_protocolo: e.target.value })}
                    placeholder="Nº da solicitação no SARPAS" />
                </div>
              </div>

              <label style={lbl}>Checklist pré-voo</label>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                padding: "10px 14px", marginBottom: 12 }}>
                {CHECKLIST_ITENS.map(item => (
                  <label key={item.key} style={{ display: "flex", alignItems: "center", gap: 9,
                    padding: "5px 0", fontSize: 13, color: TXT_MID, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!form.checklist[item.key]}
                      onChange={e => setForm({ ...form, checklist: { ...form.checklist, [item.key]: e.target.checked } })} />
                    {item.label}
                  </label>
                ))}
              </div>

              <label style={lbl}>Observações</label>
              <textarea style={{ ...inp, minHeight: 70, resize: "vertical" }} value={form.observacoes}
                onChange={e => setForm({ ...form, observacoes: e.target.value })} />

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={criarMissao} disabled={salvando} style={{ padding: "11px 26px", borderRadius: 8,
                  border: "none", background: C.gold, color: "#0B1120", fontWeight: 800, fontSize: 13.5,
                  cursor: "pointer", opacity: salvando ? 0.6 : 1 }}>
                  {salvando ? "Salvando…" : "CRIAR MISSÃO"}
                </button>
                <button onClick={() => setShowForm(false)} style={{ padding: "11px 18px", borderRadius: 8,
                  border: `1px solid ${C.border}`, background: "transparent", color: TXT_MID,
                  fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              </div>
            </div>
          )}

          {/* ── Detalhe da missão ── */}
          {!showForm && selecionada && (
            <>
              {/* Conformidade + checklist */}
              <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 260px", background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: 16 }}>
                  <div style={{ ...lbl, marginBottom: 8 }}>Conformidade</div>
                  <div style={{ fontSize: 13, color: TXT_MID, lineHeight: 1.8, fontFamily: MONO }}>
                    SARPAS: <span style={{ color: selecionada.sarpas_protocolo ? "#86EFAC" : "#FCA5A5" }}>
                      {selecionada.sarpas_protocolo || "não informado"}</span><br />
                    Status: {(STATUS_STYLE[selecionada.status] || {}).label || selecionada.status}<br />
                    Criada por: {selecionada.criado_por} · {fmtData(selecionada.criado_em)}
                  </div>
                </div>
                <div style={{ flex: "1 1 260px", background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: 16 }}>
                  <div style={{ ...lbl, marginBottom: 8 }}>Checklist pré-voo</div>
                  {CHECKLIST_ITENS.map(item => (
                    <div key={item.key} style={{ fontSize: 12.5, color: TXT_MID, padding: "2px 0" }}>
                      <span style={{ color: selecionada.checklist?.[item.key] ? "#4ADE80" : "#64748B",
                        fontFamily: MONO, marginRight: 7 }}>
                        {selecionada.checklist?.[item.key] ? "✓" : "○"}</span>
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Importação */}
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
                padding: 16, marginBottom: 18 }}>
                <div style={{ ...lbl, marginBottom: 8 }}>Importar mídia do cartão SD</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <input style={{ ...inp, marginBottom: 0, flex: 1 }} value={origemPath}
                    onChange={e => setOrigemPath(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && importar()}
                    placeholder="Caminho da pasta — ex.: E:\DCIM\100MEDIA" />
                  <button onClick={procurarPasta} style={{
                    padding: "0 18px", borderRadius: 7, border: `1px solid ${C.borderUp}`,
                    background: C.surfaceUp, color: TXT_MID, fontWeight: 700, fontSize: 13,
                    cursor: "pointer", whiteSpace: "nowrap" }}>📁 PROCURAR…</button>
                  <button onClick={importar} disabled={job?.status === "executando"} style={{
                    padding: "0 22px", borderRadius: 7, border: `1px solid ${C.goldBorder}`,
                    background: C.goldSoft, color: C.gold, fontWeight: 800, fontSize: 13,
                    cursor: "pointer", whiteSpace: "nowrap",
                    opacity: job?.status === "executando" ? 0.5 : 1 }}>IMPORTAR</button>
                </div>
                <div style={{ fontSize: 11, color: TXT_DIM, fontFamily: MONO, marginTop: 6 }}>
                  A cópia roda em segundo plano no servidor — vídeos grandes não travam a interface.
                  Duplicatas são detectadas por hash e ignoradas.
                </div>
                {importErro && <div style={{ color: "#FCA5A5", fontSize: 12.5, marginTop: 8 }}>{importErro}</div>}
                {job && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ height: 6, borderRadius: 3, background: C.surfaceUp, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 3, transition: "width .6s",
                        width: `${job.total ? Math.round((job.processados / job.total) * 100) : 0}%`,
                        background: job.status === "executando" ? C.gold : job.erros ? "#F59E0B" : "#4ADE80" }} />
                    </div>
                    <div style={{ fontSize: 11.5, color: TXT_MID, fontFamily: MONO, marginTop: 5 }}>
                      {job.status === "executando"
                        ? `Importando… ${job.processados}/${job.total}`
                        : `Concluído: ${job.msg || `${job.processados}/${job.total}`}`}
                    </div>
                  </div>
                )}
              </div>

              {/* Trajeto */}
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
                padding: 16, marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "center", marginBottom: 10 }}>
                  <span style={lbl}>Trajeto do voo — reconstruído por EXIF</span>
                  {trajeto.length >= 2 && (
                    <div style={{ display: "flex", gap: 5 }}>
                      {[["Mapa", true], ["Esquema", false]].map(([rot, val]) => (
                        <button key={rot} onClick={() => setModoMapa(val)} style={{
                          padding: "4px 12px", borderRadius: 5, fontSize: 11, fontFamily: MONO,
                          cursor: "pointer",
                          border: `1px solid ${modoMapa === val ? C.goldBorder : C.border}`,
                          background: modoMapa === val ? C.goldSoft : "transparent",
                          color: modoMapa === val ? C.gold : TXT_DIM }}>{rot}</button>
                      ))}
                    </div>
                  )}
                </div>
                <FlightStats s={statsVoo(trajeto)} />
                {trajeto.length >= 2 && modoMapa
                  ? <TrajetoLeaflet pontos={trajeto} onPonto={setFotoModal}
                      onSemTiles={() => setModoMapa(false)} />
                  : <TrajetoSVG pontos={trajeto} onPonto={setFotoModal} />}
                {trajeto.length >= 2 && (
                  <div style={{ fontSize: 10.5, color: TXT_DIM, fontFamily: MONO, marginTop: 7 }}>
                    Clique em um ponto para ver a foto capturada ali.
                    {modoMapa ? " Sem internet, o mapa troca automaticamente para o esquema." : ""}
                  </div>
                )}
              </div>

              {/* Mosaico Rápido (Fase 4) */}
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
                padding: 16, marginBottom: 18 }}>
                <div style={{ ...lbl, marginBottom: 8 }}>Mosaico da varredura — visão geral georreferenciada</div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <select value={qualidadeMos} onChange={e => setQualidadeMos(e.target.value)}
                    style={{ ...inp, marginBottom: 0, width: 300 }}>
                    <option value="rapida">Rápido — ~30 cm/px (milhares de fotos em minutos)</option>
                    <option value="media">Médio — ~12 cm/px (usa originais reduzidas)</option>
                    <option value="alta">Alto — ~6 cm/px (mais RAM e tempo)</option>
                  </select>
                  <button onClick={gerarMosaico} disabled={jobMos?.status === "executando"} style={{
                    padding: "10px 22px", borderRadius: 7, border: `1px solid ${C.goldBorder}`,
                    background: C.goldSoft, color: C.gold, fontWeight: 800, fontSize: 12.5,
                    cursor: "pointer", opacity: jobMos?.status === "executando" ? 0.5 : 1 }}>
                    {jobMos?.status === "executando" ? "MONTANDO…" : "▦ GERAR MOSAICO"}
                  </button>
                </div>
                <div style={{ fontSize: 10.5, color: TXT_DIM, fontFamily: MONO, marginTop: 6 }}>
                  Georreferenciamento direto: cada foto é colada na sua posição GPS/EXIF — sem fotogrametria.
                  Visão operacional em minutos; para produto cartográfico de medição, use ODM --fast-orthophoto.
                </div>

                {jobMos?.status === "executando" && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ height: 6, borderRadius: 3, background: C.surfaceUp, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 3, transition: "width .8s",
                        width: `${jobMos.total ? Math.round((jobMos.processados / jobMos.total) * 100) : 0}%`,
                        background: C.gold }} />
                    </div>
                    <div style={{ fontSize: 11.5, color: TXT_MID, fontFamily: MONO, marginTop: 5 }}>
                      Colando fotos… {jobMos.processados}/{jobMos.total}
                    </div>
                  </div>
                )}
                {jobMos?.status === "erro" && (
                  <div style={{ color: "#FCA5A5", fontSize: 12.5, marginTop: 8 }}>{jobMos.msg}</div>
                )}

                {mosaicos.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                    {mosaicos.map(mos => (
                      <button key={mos.id} onClick={() => setMosaicoAtivo(mos)} style={{
                        padding: "5px 10px", borderRadius: 6, fontSize: 10.5, fontFamily: MONO,
                        cursor: "pointer",
                        border: `1px solid ${mosaicoAtivo?.id === mos.id ? C.goldBorder : C.border}`,
                        background: mosaicoAtivo?.id === mos.id ? C.goldSoft : "transparent",
                        color: mosaicoAtivo?.id === mos.id ? C.gold : TXT_MID }}>
                        {mos.qualidade} · {mos.gsd_cm} cm/px · {(mos.finalizado_em || "").slice(0, 10)}
                      </button>
                    ))}
                  </div>
                )}

                {mosaicoAtivo?.bounds && (
                  <div style={{ marginTop: 12 }}>
                    <MosaicoMapa jobId={mosaicoAtivo.id} bounds={mosaicoAtivo.bounds} />
                    <button onClick={async () => {
                      const r = await api.get(`/drone/mosaico/${mosaicoAtivo.id}/imagem`)
                      if (!r.ok) return
                      const blob = await r.blob()
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement("a")
                      a.href = url; a.download = `mosaico_${mosaicoAtivo.id.slice(0, 8)}.jpg`; a.click()
                      URL.revokeObjectURL(url)
                    }} style={{ marginTop: 10, padding: "8px 18px", borderRadius: 7,
                      border: `1px solid ${C.border}`, background: "transparent", color: TXT_MID,
                      fontSize: 12, cursor: "pointer" }}>⬇ Baixar JPEG (com world file p/ QGIS no servidor)</button>
                  </div>
                )}
              </div>

              {/* Relatório de Voo (Fase 2) */}
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
                padding: 16, marginBottom: 18 }}>
                <div style={{ ...lbl, marginBottom: 8 }}>Relatório de voo</div>
                <textarea value={parecer} onChange={e => setParecer(e.target.value)}
                  placeholder="Parecer do analista — este texto entra na seção final do relatório…"
                  style={{ ...inp, minHeight: 64, resize: "vertical", marginBottom: 10 }} />
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {["docx", "pdf"].map(fmt => (
                    <button key={fmt} onClick={() => gerarRelatorio(fmt)} disabled={!!gerando}
                      style={{ padding: "10px 22px", borderRadius: 7,
                        border: `1px solid ${C.goldBorder}`, background: C.goldSoft,
                        color: C.gold, fontWeight: 800, fontSize: 12.5, cursor: "pointer",
                        opacity: gerando && gerando !== fmt ? 0.4 : 1 }}>
                      {gerando === fmt ? "GERANDO…" : `⬇ GERAR ${fmt.toUpperCase()}`}
                    </button>
                  ))}
                  <span style={{ fontSize: 10.5, color: TXT_DIM, fontFamily: MONO }}>
                    Inclui metadados, checklist, estatísticas, croqui e até 6 fotos com GPS.
                    SHA-256 registrado na auditoria.
                  </span>
                </div>
              </div>

              {/* Comparação de Voos (Fase 3) */}
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
                padding: 16, marginBottom: 18 }}>
                <div style={{ ...lbl, marginBottom: 8 }}>Comparação de voos — detecção de mudanças</div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <select value={alvoComp} onChange={e => setAlvoComp(e.target.value)}
                    style={{ ...inp, marginBottom: 0, flex: 1, minWidth: 240 }}>
                    <option value="">Comparar este voo com… (voo de referência/anterior)</option>
                    {missoes.filter(m => m.id !== selecionada.id && m.midia?.fotos > 0).map(m => (
                      <option key={m.id} value={m.id}>{m.nome} · {m.data_voo} · {m.midia.fotos} fotos</option>
                    ))}
                  </select>
                  <button onClick={compararVoos} disabled={!alvoComp || comparando} style={{
                    padding: "10px 22px", borderRadius: 7, border: `1px solid ${C.goldBorder}`,
                    background: C.goldSoft, color: C.gold, fontWeight: 800, fontSize: 12.5,
                    cursor: "pointer", opacity: !alvoComp || comparando ? 0.5 : 1 }}>
                    {comparando ? "ANALISANDO…" : "◈ COMPARAR"}
                  </button>
                </div>
                <div style={{ fontSize: 10.5, color: TXT_DIM, fontFamily: MONO, marginTop: 6 }}>
                  Pareia fotos por GPS (raio 15 m), mede vegetação (ExG) e destaca em vermelho onde a cena mudou.
                  O heatmap é apoio à análise — confirme no lado a lado.
                </div>
                {erroComp && <div style={{ color: "#FCA5A5", fontSize: 12.5, marginTop: 8 }}>{erroComp}</div>}

                {resultComp && (
                  <div style={{ marginTop: 14 }}>
                    {/* Resumo */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                      {[[resultComp.resumo.pares, "pares casados"],
                        [`${resultComp.resumo.diff_medio_pct}%`, "mudança média"],
                        [`${resultComp.resumo.delta_veg_medio > 0 ? "+" : ""}${resultComp.resumo.delta_veg_medio}%`, "Δ vegetação"],
                        [resultComp.resumo.fotos_sem_par, "fotos sem par"]].map(([v, k]) => (
                        <div key={k} style={{ background: C.surfaceUp, border: `1px solid ${C.border}`,
                          borderRadius: 7, padding: "7px 12px", minWidth: 104 }}>
                          <div style={{ fontSize: 15.5, fontWeight: 800, fontFamily: MONO,
                            color: k === "Δ vegetação" && resultComp.resumo.delta_veg_medio < -5 ? "#F87171" : C.text }}>{v}</div>
                          <div style={{ fontSize: 9.5, color: TXT_DIM, fontFamily: MONO,
                            letterSpacing: "0.07em", textTransform: "uppercase", marginTop: 1 }}>{k}</div>
                        </div>
                      ))}
                    </div>
                    {resultComp.resumo.delta_veg_medio < -5 && (
                      <div style={{ padding: "8px 12px", borderRadius: 7, background: "rgba(239,68,68,0.12)",
                        border: "1px solid rgba(239,68,68,0.3)", color: "#FCA5A5", fontSize: 12,
                        marginBottom: 12, fontFamily: MONO }}>
                        ⚠ Redução significativa de vegetação detectada entre os voos — verificar pares abaixo.
                      </div>
                    )}

                    {/* Pares ordenados por mudança */}
                    {resultComp.pares.map(par => (
                      <div key={par.idx} style={{ display: "flex", gap: 10, alignItems: "center",
                        padding: 10, borderRadius: 8, border: `1px solid ${par.diff_pct > 10 ? "rgba(239,68,68,0.35)" : C.border}`,
                        background: C.surfaceUp, marginBottom: 8, flexWrap: "wrap" }}>
                        {[["ANTES", <ThumbAuth key="a" midiaId={par.a.id} alt="antes"
                            style={{ width: 148, height: 100, objectFit: "cover", borderRadius: 6, display: "block" }} />],
                          ["DEPOIS", <ThumbAuth key="b" midiaId={par.b.id} alt="depois"
                            style={{ width: 148, height: 100, objectFit: "cover", borderRadius: 6, display: "block" }} />],
                          ["MUDANÇAS", <ThumbAuth key="h" alt="heatmap"
                            path={`/drone/comparacao/${resultComp.resumo.comp_id}/heatmap/${par.idx}`}
                            style={{ width: 148, height: 100, objectFit: "cover", borderRadius: 6, display: "block" }} />]
                        ].map(([rot, img]) => (
                          <div key={rot}>
                            <div style={{ fontSize: 8.5, color: TXT_DIM, fontFamily: MONO, marginBottom: 3 }}>{rot}</div>
                            {img}
                          </div>
                        ))}
                        <div style={{ flex: 1, minWidth: 150 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO,
                            color: par.diff_pct > 10 ? "#F87171" : C.text }}>
                            {par.diff_pct}% de mudança
                          </div>
                          <div style={{ fontSize: 11, color: TXT_MID, fontFamily: MONO, marginTop: 3, lineHeight: 1.6 }}>
                            vegetação {par.veg_a_pct}% → {par.veg_b_pct}%
                            ({par.delta_veg > 0 ? "+" : ""}{par.delta_veg}%)<br />
                            pareadas a {par.dist_m} m
                          </div>
                          <button onClick={() => setParSlider(par)} style={{ marginTop: 8,
                            padding: "6px 14px", borderRadius: 6, border: `1px solid ${C.goldBorder}`,
                            background: "transparent", color: C.gold, fontSize: 11, fontWeight: 700,
                            cursor: "pointer" }}>⇆ SOBREPOR</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Galeria */}
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
                <div style={{ ...lbl, marginBottom: 10 }}>
                  Acervo — {selecionada.midias?.length || 0} arquivos
                </div>
                {(!selecionada.midias || selecionada.midias.length === 0) &&
                  <div style={{ color: TXT_DIM, fontSize: 12.5, fontFamily: MONO }}>Nenhuma mídia importada ainda.</div>}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                  {(selecionada.midias || []).map(md => (
                    <div key={md.id} style={{ borderRadius: 8, overflow: "hidden",
                      border: `1px solid ${C.border}`, background: C.surfaceUp }}>
                      {md.tipo === "foto" && md.tem_thumb
                        ? <ThumbAuth midiaId={md.id} alt={md.nome_original}
                            style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }} />
                        : <div style={{ height: 100, display: "flex", alignItems: "center",
                            justifyContent: "center", fontSize: 26, color: TXT_DIM }}>
                            {md.tipo === "video" ? "🎬" : "🖼"}</div>}
                      <div style={{ padding: "6px 8px" }}>
                        <div style={{ fontSize: 10.5, color: TXT_MID, fontFamily: MONO, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{md.nome_original}</div>
                        <div style={{ fontSize: 9.5, color: TXT_DIM, fontFamily: MONO }}>
                          {fmtBytes(md.tamanho)}{md.alt ? ` · ${md.alt}m` : ""}{md.lat ? " · GPS" : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {fotoModal && selecionada && (
        <FotoModal ponto={fotoModal} midias={selecionada.midias}
          onClose={() => setFotoModal(null)} />
      )}

      {parSlider && (
        <SliderComparacao par={parSlider} onClose={() => setParSlider(null)} />
      )}
    </div>
  )
}
