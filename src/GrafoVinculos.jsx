import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { jsPDF } from "jspdf"
import ForceGraph2D from "react-force-graph-2d"
import api from "./api"
import { getAccessToken } from "./authStore"
import { confirm } from "./ConfirmModal"
import { toast } from "./Toast"
const IMG_BASE = import.meta.env.DEV ? "/api-proxy" : "http://127.0.0.1:8000/api"
import {
  GALERIA, CATEGORIAS, corCategoria, labelCategoria, iconePadrao,
} from "./iconesGrafo"

/* ── Paleta enterprise dark ── */
const C = {
  bg: "#0B1120", surface: "#111827", surfaceUp: "#1A2236", surfaceMid: "#162032",
  border: "rgba(255,255,255,0.07)", borderUp: "rgba(255,255,255,0.13)",
  gold: "#E8A020", goldSoft: "rgba(232,160,32,0.12)", goldBorder: "rgba(232,160,32,0.3)",
  text: "#F1F5F9", textMid: "#94A3B8", textDim: "rgba(255,255,255,0.4)",
  red: "#EF4444", green: "#4ADE80", blue: "#60A5FA",
  oracle: "#7C3AED", oracleLight: "#A78BFA",
  oracleSoft: "rgba(124,58,237,0.15)", oracleBorder: "rgba(167,139,250,0.35)",
}
const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'

const CSS = `
  .gv-item:hover { background: rgba(232,160,32,0.08) !important; }
  .gv-item-active { background: rgba(232,160,32,0.16) !important; border-color: rgba(232,160,32,0.5) !important; }
  .gv-btn { transition: all .12s; }
  .gv-btn:hover { filter: brightness(1.15); transform: translateY(-1px); }
  .gv-ico:hover { background: rgba(232,160,32,0.14) !important; transform: scale(1.08); }
  .gv-oracle-item:hover { background: rgba(124,58,237,0.12) !important; }
  @keyframes gv-pulse { 0%,100%{opacity:.4} 50%{opacity:1} }
  @keyframes gv-oracle-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(124,58,237,0)} 60%{box-shadow:0 0 0 4px rgba(124,58,237,0.22)} }
  .gv-link-mode { animation: gv-pulse 1.2s ease-in-out infinite; }
  .gv-oracle-dot { animation: gv-oracle-pulse 2.5s ease-in-out infinite; }
  @keyframes gv-path-in { 0%{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:none} }
  ::-webkit-scrollbar { width: 6px; height:6px; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius:4px; }
`

/* ── Cache de imagens (fotos de pessoas) ── */
const imgCache = new Map() // url -> HTMLImageElement | 'loading' | 'error'

/* Paleta de clusters (10 cores distintas dark-friendly) */
const CLUSTER_COLORS = [
  "#22D3EE","#4ADE80","#F472B6","#FB923C","#A78BFA",
  "#FBBF24","#38BDF8","#F87171","#34D399","#818CF8"
]

/* ============================================================ */
export default function GrafoVinculos() {
  const [meta, setMeta]         = useState({ rotulos_vinculo: [] })
  const [alvos, setAlvos]       = useState([])
  const [alvoId, setAlvoId]     = useState(null)
  const [busca, setBusca]       = useState("")
  const [hops, setHops]         = useState(1)
  const [graph, setGraph]       = useState({ nodes: [], links: [] })
  const [sel, setSel]           = useState(null)        // {tipo:'node'|'link', data}
  const [edit, setEdit]         = useState(false)
  const [linking, setLinking]   = useState(null)        // {sourceId} enquanto conecta
  const [modal, setModal]       = useState(null)        // 'novoNo' | 'editNo' | 'editLink' | 'novoAlvo'
  // [toast local removido — usa toast global de ./Toast]
  const [carregando, setCarreg] = useState(false)
  const [busy, setBusy]         = useState(false)
  const [dim, setDim]           = useState({ w: 800, h: 600 })
  const [pathMode, setPathMode] = useState(false)
  const [pathSrc,  setPathSrc]  = useState(null)
  const [pathRes,  setPathRes]  = useState(null)
  const pathPhase = useRef(0)
  const [centMode, setCentMode] = useState(false)

  /* Filtros de Camada */
  const ALL_TIPOS   = ["pessoa","faccao","local","crime","juridico","documento","social","geografia","financeiro","organizacao","evento","generico"]
  const ALL_ORIGENS = ["manual","auto:liderancas","auto:citacao","auto:correlacao"]
  const [filtrosOpen,   setFiltrosOpen]   = useState(false)
  const [hiddenTipos,   setHiddenTipos]   = useState(new Set())
  const [hiddenOrigens, setHiddenOrigens] = useState(new Set())

  /* Padrões de Rede */
  const [padroesMode,      setPadroesMode]      = useState(false)
  const [padroesHighlight, setPadroesHighlight] = useState(null) // null | {type,idx}

  /* Timeline Animada */
  const [timelineMode, setTimelineMode] = useState(false)
  const [tlDate,       setTlDate]       = useState(null)   // ISO string | null
  const [tlPlaying,    setTlPlaying]    = useState(false)
  const [tlSpeed,      setTlSpeed]      = useState(5)      // semanas/step

  const [stats,       setStats]       = useState(null)
  const prevHitlNos                   = useRef(0)

  const fgRef   = useRef()
  const wrapRef = useRef()
  const fitOnce = useRef(false)

  /* BFS — caminho mínimo (breadth-first) */
  function bfsPath(srcId, dstId, nodes, links) {
    if (srcId === dstId) return { nodeIds: [srcId], linkIds: [] }
    const adj = {}
    nodes.forEach(n => { adj[n.id] = [] })
    links.forEach(l => {
      const sId = l.source?.id ?? l.source
      const tId = l.target?.id ?? l.target
      if (!sId || !tId) return
      adj[sId]?.push({ nId: tId, lId: l.id })
      adj[tId]?.push({ nId: sId, lId: l.id })
    })
    const visited = new Set([srcId])
    const queue = [{ nId: srcId, nodePath: [srcId], linkPath: [] }]
    while (queue.length) {
      const { nId, nodePath, linkPath } = queue.shift()
      for (const { nId: nx, lId } of (adj[nId] || [])) {
        if (visited.has(nx)) continue
        visited.add(nx)
        const np = [...nodePath, nx], lp = [...linkPath, lId]
        if (nx === dstId) return { nodeIds: np, linkIds: lp }
        queue.push({ nId: nx, nodePath: np, linkPath: lp })
      }
    }
    return null
  }



  /* ── Exportar Relatório PDF do Alvo ── */
  async function exportarPDF(node) {
    const W = 210, ml = 14, mr = 14, cw = W - ml - mr
    const DARK=[15,23,42], GOLD=[232,160,32], MID=[100,116,139], BORDA=[226,232,240], WHITE=[255,255,255]
    const TEXT=[30,41,59], RED=[239,68,68]
    const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" })
    let y = 0

    // — header —
    doc.setFillColor(...DARK); doc.rect(0,0,W,32,"F")
    doc.setFillColor(...GOLD); doc.rect(0,32,W,1.5,"F")
    doc.setTextColor(...WHITE); doc.setFont("helvetica","bold"); doc.setFontSize(16)
    doc.text("AGENT BASTOS", ml, 12)
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(...MID)
    doc.text("INTELIGÊNCIA SOBERANA · Análise Criminal de Vínculos", ml, 18)
    doc.setFontSize(7)
    doc.text("Gerado em: " + new Date().toLocaleString("pt-BR"), ml, 24)
    doc.setFillColor(...RED); doc.roundedRect(W-mr-28,8,28,10,2,2,"F")
    doc.setTextColor(...WHITE); doc.setFont("helvetica","bold"); doc.setFontSize(7)
    doc.text("RESTRITO", W-mr-14, 14.5, {align:"center"})
    y = 40

    // — identidade —
    const det = node.detalhes || {}
    const campos = [
      ["FACÇÃO ATUAL", det.faccao_atual||det.faccao||"–"],
      ["CARGO ATUAL",  det.cargo_atual||det.cargo||"–"],
      ["UNIDADE",      det.unidade_atual||det.unidade||"–"],
      ["PAVILHÃO",     det.pavilhao_atual||det.pavilhao||"–"],
      ["CELA",         det.cela_atual||det.cela||"–"],
    ]
    const pH=50, pW=38
    // foto
    const fotoUrl = node.detalhes?.foto_url
    const cachedImg = fotoUrl ? imgCache.get(fotoUrl) : null
    if (cachedImg && cachedImg !== "loading" && cachedImg !== "error") {
      try {
        const tmp = document.createElement("canvas")
        tmp.width = cachedImg.naturalWidth||200; tmp.height = cachedImg.naturalHeight||250
        tmp.getContext("2d").drawImage(cachedImg, 0, 0)
        doc.addImage(tmp.toDataURL("image/jpeg",0.92),"JPEG",ml,y,pW,pH)
      } catch(e) {
        doc.setFillColor(30,41,59); doc.roundedRect(ml,y,pW,pH,2,2,"F")
      }
    } else {
      doc.setFillColor(30,41,59); doc.roundedRect(ml,y,pW,pH,2,2,"F")
      doc.setTextColor(...MID); doc.setFontSize(7); doc.text("SEM FOTO",ml+pW/2,y+pH/2,{align:"center"})
    }
    // nome / vulgo
    const ix = ml+pW+6
    doc.setFont("helvetica","bold"); doc.setFontSize(15); doc.setTextColor(...TEXT)
    doc.text(det.vulgo||node.rotulo||"–", ix, y+8, {maxWidth: cw-pW-6})
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(...MID)
    doc.text(det.nome||"", ix, y+14, {maxWidth: cw-pW-6})
    // campos
    let iy = y+20
    campos.forEach(([lbl,val]) => {
      doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...MID)
      doc.text(lbl, ix, iy)
      doc.setFont("helvetica","normal"); doc.setFontSize(8.5); doc.setTextColor(...TEXT)
      doc.text(String(val), ix, iy+4)
      iy += 9
    })
    y += pH + 8

    // — grafo —
    const gCanvas = wrapRef.current?.querySelector("canvas")
    if (gCanvas) {
      doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(...TEXT)
      doc.text("GRAFO DE VÍNCULOS", ml, y+5)
      doc.setFillColor(...GOLD); doc.rect(ml, y+6.8, 32, 0.5,"F")
      y += 11
      const gImg = gCanvas.toDataURL("image/jpeg", 0.88)
      const ratio = gCanvas.height/gCanvas.width
      const gW=cw, gH=Math.min(gW*ratio, 72)
      doc.setDrawColor(...BORDA); doc.roundedRect(ml,y,gW,gH,2,2,"S")
      doc.addImage(gImg,"JPEG",ml,y,gW,gH,undefined,"FAST")
      y += gH+10
    }

    // — linha do tempo —
    const movs = det.movimentacoes
    if (movs?.length) {
      if (y > 220) { doc.addPage(); y = 20 }
      doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(...TEXT)
      doc.text("LINHA DO TEMPO", ml, y+5)
      doc.setFillColor(...GOLD); doc.rect(ml, y+6.8, 26, 0.5,"F")
      y += 12
      movs.forEach((m, i) => {
        if (y > 272) { doc.addPage(); y = 20 }
        doc.setFillColor(...GOLD); doc.circle(ml+1.5, y+1.8, 1.4,"F")
        doc.setFont("helvetica","bold"); doc.setFontSize(7.5); doc.setTextColor(...TEXT)
        const period = (m.inicio||m.competencia||"?") + (m.atual?" · atual": m.fim?" → "+m.fim:"")
        doc.text(period, ml+6, y+2)
        doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(...MID)
        const detail=[m.unidade,m.pavilhao,m.cargo,m.faccao].filter(Boolean).join(" · ")
        if (detail) doc.text(detail, ml+6, y+6.5)
        y += 11
      })
      y += 4
    }

    // — metadados extras —
    const ocultar = new Set(["movimentacoes","foto_url","foto_lider_id","foto","nome","vulgo","faccao_atual","cargo_atual","unidade_atual","pavilhao_atual","cela_atual","faccao","cargo","unidade","pavilhao","cela"])
    const extras = Object.entries(det).filter(([k,v])=>!ocultar.has(k)&&v!=null&&v!=="")
    if (extras.length) {
      if (y > 240) { doc.addPage(); y = 20 }
      doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(...TEXT)
      doc.text("DADOS ADICIONAIS", ml, y+5)
      doc.setFillColor(...GOLD); doc.rect(ml, y+6.8, 28, 0.5,"F")
      y += 12
      extras.forEach(([k,v]) => {
        if (y > 272) { doc.addPage(); y = 20 }
        doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...MID)
        doc.text(k.replace(/_/g," ").toUpperCase(), ml, y)
        doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(...TEXT)
        doc.text(String(v).slice(0,80), ml+40, y)
        y += 6
      })
    }

    // — footer —
    const pages = doc.internal.getNumberOfPages()
    for (let p=1; p<=pages; p++) {
      doc.setPage(p)
      doc.setFillColor(...DARK); doc.rect(0,285,W,12,"F")
      doc.setTextColor(...MID); doc.setFont("helvetica","normal"); doc.setFontSize(6.5)
      doc.text("BASTOS-UNIT · Uso restrito · Proibida reprodução não autorizada · LGPD Art. 7º", W/2, 292, {align:"center"})
      doc.text("Pág. "+p+"/"+pages, W-mr, 292, {align:"right"})
    }

    const fname = "relatorio_"+(node.rotulo||node.id||"alvo").replace(/\s+/g,"_").replace(/[^\w-]/g,"").toLowerCase()+"_"+new Date().toISOString().slice(0,10)+".pdf"
    doc.save(fname)
  }

  /* Grafo filtrado por camadas */
  const filteredGraph = useMemo(() => {
    if (!hiddenTipos.size && !hiddenOrigens.size) return graph
    const visIds = new Set(graph.nodes.filter(n => !hiddenTipos.has(n.tipo || "generico")).map(n => n.id))
    const nodes  = graph.nodes.filter(n => !hiddenTipos.has(n.tipo || "generico"))
    const links  = graph.links.filter(l => {
      const sId = l.source?.id ?? l.source
      const tId = l.target?.id ?? l.target
      if (!visIds.has(sId) || !visIds.has(tId)) return false
      const prefix = (l.origem || "manual").startsWith("auto:correlacao") ? "auto:correlacao" : (l.origem || "manual")
      return !hiddenOrigens.has(prefix)
    })
    return { nodes, links }
  }, [graph, hiddenTipos, hiddenOrigens])

  /* Timeline — bounds temporais do grafo */
  const tlBounds = useMemo(() => {
    const dates = [
      ...graph.nodes.map(n => n.criado_em).filter(Boolean),
      ...graph.links.map(l => l.criado_em).filter(Boolean),
    ].sort()
    if (dates.length < 2) return null
    return { min: dates[0], max: dates[dates.length - 1] }
  }, [graph])

  /* displayGraph — camada final: filtros + timeline */
  const displayGraph = useMemo(() => {
    if (!timelineMode || !tlDate) return filteredGraph
    const cutoff = tlDate
    const nodes = filteredGraph.nodes.filter(n => !n.criado_em || n.criado_em <= cutoff)
    const nodeIds = new Set(nodes.map(n => n.id))
    const links = filteredGraph.links.filter(l => {
      if (l.criado_em && l.criado_em > cutoff) return false
      const s = l.source?.id ?? l.source
      const t = l.target?.id ?? l.target
      return nodeIds.has(s) && nodeIds.has(t)
    })
    return { nodes, links }
  }, [filteredGraph, timelineMode, tlDate])

  /* Detecção automática de padrões de rede */
  function detectCommunities(nodes, links) {
    if (!nodes.length) return { clusters: [], nodeCluster: {} }
    const adj = {}
    nodes.forEach(n => { adj[n.id] = [] })
    links.forEach(l => {
      const s = l.source?.id ?? l.source, t = l.target?.id ?? l.target
      if (adj[s] !== undefined) adj[s].push(t)
      if (adj[t] !== undefined) adj[t].push(s)
    })
    const labels = {}
    nodes.forEach(n => { labels[n.id] = n.id })
    const nodeIds = nodes.map(n => n.id).sort()
    for (let iter = 0; iter < 25; iter++) {
      let changed = false
      for (const nid of nodeIds) {
        const nbrs = adj[nid]; if (!nbrs.length) continue
        const cnt = {}
        nbrs.forEach(nb => { const l = labels[nb]; cnt[l] = (cnt[l] || 0) + 1 })
        const best = Object.entries(cnt).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
        if (labels[nid] !== best) { labels[nid] = best; changed = true }
      }
      if (!changed) break
    }
    const groups = {}
    Object.entries(labels).forEach(([nid, lbl]) => { if (!groups[lbl]) groups[lbl] = []; groups[lbl].push(nid) })
    const sorted = Object.values(groups).sort((a, b) => b.length - a.length)
    const nodeCluster = {}
    const clusters = sorted.map((nids, idx) => { nids.forEach(nid => { nodeCluster[nid] = idx }); return { idx, nodeIds: nids, size: nids.length } })
    return { clusters, nodeCluster }
  }

  const padroes = useMemo(() => {
    if (!padroesMode || !filteredGraph.nodes.length) return null
    const { nodes, links } = filteredGraph
    const degree = {}
    nodes.forEach(n => { degree[n.id] = 0 })
    links.forEach(l => {
      const s = l.source?.id ?? l.source, t = l.target?.id ?? l.target
      if (s in degree) degree[s]++; if (t in degree) degree[t]++
    })
    const adjSet = {}
    nodes.forEach(n => { adjSet[n.id] = new Set() })
    links.forEach(l => {
      const s = l.source?.id ?? l.source, t = l.target?.id ?? l.target
      if (adjSet[s]) adjSet[s].add(t); if (adjSet[t]) adjSet[t].add(s)
    })
    const { clusters, nodeCluster } = detectCommunities(nodes, links)
    const brokers = new Set()
    nodes.forEach(n => {
      if (degree[n.id] < 2) return
      const myC = nodeCluster[n.id]
      const otherCs = new Set([...(adjSet[n.id] || [])].map(nb => nodeCluster[nb]).filter(c => c !== undefined && c !== myC))
      if (otherCs.size >= 1) brokers.add(n.id)
    })
    const satellites = new Set(nodes.filter(n => degree[n.id] === 1).map(n => n.id))
    let triCount = 0; const triangleNodes = new Set()
    nodes.forEach(u => {
      const nbrs = [...(adjSet[u.id] || [])]
      for (let i = 0; i < nbrs.length; i++)
        for (let j = i + 1; j < nbrs.length; j++)
          if (adjSet[nbrs[i]]?.has(nbrs[j])) {
            triCount++
            triangleNodes.add(u.id); triangleNodes.add(nbrs[i]); triangleNodes.add(nbrs[j])
          }
    })
    const meaningfulClusters = clusters.filter(c => c.size >= 2)
    return { clusters: meaningfulClusters, nodeCluster, brokers, satellites, triangleNodes, triangleCount: Math.round(triCount / 3) }
  }, [padroesMode, filteredGraph])

  /* Centralidade de grau normalizada */
  const centMap = useMemo(() => {
    if (!centMode || !graph.nodes.length) return null
    const cnt = {}
    graph.nodes.forEach(n => { cnt[n.id] = 0 })
    graph.links.forEach(l => {
      const sId = l.source?.id ?? l.source
      const tId = l.target?.id ?? l.target
      if (sId in cnt) cnt[sId]++
      if (tId in cnt) cnt[tId]++
    })
    const max = Math.max(...Object.values(cnt), 1)
    const norm = {}; graph.nodes.forEach(n => { norm[n.id] = cnt[n.id] / max })
    return { norm, cnt, sorted: [...graph.nodes].sort((a,b) => cnt[b.id]-cnt[a.id]).slice(0,5) }
  }, [centMode, graph])

  function centColor(score) {
    const clamp = v => Math.max(0, Math.min(255, Math.round(v)))
    if (score < 0.5) {
      const t = score * 2
      return 'rgb(' + clamp(100+t*132) + ',' + clamp(116+t*42) + ',' + clamp(139+t*(-128)) + ')'
    }
    const t = (score - 0.5) * 2
    return 'rgb(' + clamp(232+t*7) + ',' + clamp(158+t*(-90)) + ',' + clamp(11+t*57) + ')'
  }

  // Animação de fase para glow do caminho
  useEffect(() => {
    if (!pathMode && !padroesMode) return
    let raf
    const tick = t => { pathPhase.current = t * 0.0025; fgRef.current?.refresh?.(); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [pathMode, padroesMode])

  // ESC cancela modo caminho
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape" && pathMode) { setPathMode(false); setPathSrc(null); setPathRes(null) }
      if (e.key === "Escape") setFiltrosOpen(false)
    }
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h)
  }, [pathMode])

  /* CSS + dimensões */
  useEffect(() => {
    const s = document.createElement("style"); s.textContent = CSS
    document.head.appendChild(s); return () => document.head.removeChild(s)
  }, [])
  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect; setDim({ w: Math.max(320, r.width), h: Math.max(320, r.height) })
    })
    ro.observe(wrapRef.current); return () => ro.disconnect()
  }, [])

  // Timeline: inicializa data ao ativar e reseta ao desativar
  useEffect(() => {
    if (timelineMode && tlBounds && !tlDate) setTlDate(tlBounds.min)
    if (!timelineMode) { setTlDate(null); setTlPlaying(false) }
  }, [timelineMode, tlBounds])

  // Timeline: animação por intervalo
  useEffect(() => {
    if (!timelineMode || !tlPlaying || !tlBounds) return
    const id = setInterval(() => {
      setTlDate(prev => {
        const maxMs = new Date(tlBounds.max).getTime()
        const ms = new Date(prev || tlBounds.min).getTime()
        const stepMs = tlSpeed * 7 * 24 * 60 * 60 * 1000
        const next = ms + stepMs
        if (next >= maxMs) { setTlPlaying(false); return tlBounds.max }
        return new Date(next).toISOString()
      })
    }, 120)
    return () => clearInterval(id)
  }, [timelineMode, tlPlaying, tlBounds, tlSpeed])

  // aviso() substituído por toast global — mapeia cor → tipo
  const aviso = (msg, cor) => {
    if (cor === C.red)   return toast.error(msg)
    if (cor === C.green) return toast.success(msg)
    if (cor === C.textMid || cor === C.oracleLight) return toast.info(msg)
    toast.warn(msg)
  }

  /* Carrega meta + alvos */
  const carregarAlvos = useCallback(async () => {
    try {
      const r = await api.get("/grafo/alvos"); const d = await r.json()
      setAlvos(d.alvos || [])
      return d.alvos || []
    } catch { aviso("Backend offline.", C.red); return [] }
  }, [])

  const carregarRecentes = useCallback(async (recarregarRede = false) => {
    try {
      const rStat = await api.get("/grafo/stats")
      const dStat = await rStat.json()
      setStats(dStat)
      // detecta novos nós HITL desde última verificação
      const hitlNos = dStat.hitl_nos || 0
      if (prevHitlNos.current > 0 && hitlNos > prevHitlNos.current) {
        aviso(`🔮 ORÁCULO: +${hitlNos - prevHitlNos.current} nó(s) adicionados via HITL`, C.oracleLight)
        if (recarregarRede && alvoId) carregarRede(alvoId)
        await carregarAlvos()
      }
      prevHitlNos.current = hitlNos
    } catch { /* silencioso — não quebra o grafo */ }
  }, [alvoId, carregarAlvos]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      try { const r = await api.get("/grafo/meta"); setMeta(await r.json()) } catch {}
      await carregarAlvos()
      await carregarRecentes()
      // foco vindo do Módulo Extrato ("Ver no Grafo")
      const foco = localStorage.getItem("grafo_foco_alvo")
      if (foco) {
        localStorage.removeItem("grafo_foco_alvo")
        setHops(2); setAlvoId(foco); carregarRede(foco, 2)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregarAlvos])

  // Polling ORÁCULO: verifica novos nós HITL a cada 30s
  useEffect(() => {
    const t = setInterval(() => carregarRecentes(true), 30_000)
    return () => clearInterval(t)
  }, [carregarRecentes])

  /* Carrega a rede de um alvo */
  const carregarRede = useCallback(async (id, h = hops) => {
    if (!id) return
    setCarreg(true); fitOnce.current = false
    try {
      const r = await api.get(`/grafo/rede-alvo/${id}?hops=${h}`)
      const d = await r.json()
      const nodes = (d.nodes || []).map(n => {
        const o = { ...n }
        if (n.pos_x != null && n.pos_y != null) { o.fx = n.pos_x; o.fy = n.pos_y; o.x = n.pos_x; o.y = n.pos_y }
        return o
      })
      const links = (d.edges || []).map(e => ({ ...e }))
      preloadFotos(nodes)
      setGraph({ nodes, links })
      setSel(null)
    } catch { aviso("Falha ao carregar a rede.", C.red) }
    finally { setCarreg(false) }
  }, [hops])

  async function fetchFoto(url) {
    if (!url || imgCache.has(url)) return
    imgCache.set(url, "loading")
    try {
      const token = getAccessToken() || ""
      const fullUrl = `${IMG_BASE}${url.replace(/^\/api/, "")}`
      const resp = await fetch(fullUrl, { headers: { Authorization: `Bearer ${token}` } })
      if (!resp.ok) throw new Error(resp.status)
      const blob = await resp.blob()
      const objUrl = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => { imgCache.set(url, img); fgRef.current?.refresh?.() }
      img.src = objUrl
    } catch(e) {
      imgCache.set(url, "error")
    }
  }
  function preloadFotos(nodes) {
    nodes.forEach(n => { const u = n.detalhes?.foto_url; if (u) fetchFoto(u) })
  }

  function focar(id) { setAlvoId(id); carregarRede(id) }

  /* ── Ações automáticas ── */
  async function sincronizar() {
    setBusy(true)
    try {
      const r = await api.post("/grafo/sincronizar"); const d = await r.json()
      if (d.ok) { aviso(`Sincronizado: ${d.pessoas} pessoas no grafo.`, C.green); const a = await carregarAlvos(); if (alvoId) carregarRede(alvoId); else if (a[0]) focar(a[0].id) }
      else aviso("Sincronização falhou.", C.red)
    } catch { aviso("Erro ao sincronizar.", C.red) } finally { setBusy(false) }
  }
  async function varrerCitacoes() {
    if (!alvoId) return
    setBusy(true)
    try {
      const r = await api.post(`/grafo/alvo/${alvoId}/varrer-citacoes`)
      const d = await r.json()
      if (d.ok) { aviso(d.criados > 0 ? `${d.criados} documento(s) citando o alvo.` : "Nenhuma nova citação encontrada.", d.criados > 0 ? C.green : C.textMid); carregarRede(alvoId) }
      else aviso("Varredura indisponível.", C.red)
    } catch { aviso("Erro na varredura.", C.red) } finally { setBusy(false) }
  }

  /* ── CRUD nós/arestas ── */
  async function criarNo(payload, conectar) {
    const r = await api.post("/grafo/no", payload)
    if (!r.ok) { aviso("Falha ao criar nó.", C.red); return null }
    const no = await r.json()
    const novo = { ...no }
    // posiciona perto do alvo/selecionado
    const ref = graph.nodes.find(n => n.id === (conectar?.origem_id)) || graph.nodes.find(n => n.id === alvoId)
    if (ref?.x != null) { novo.x = ref.x + 40; novo.y = ref.y + 30 }
    setGraph(g => ({ ...g, nodes: [...g.nodes, novo] }))
    if (conectar?.origem_id) {
      await criarAresta({ origem_id: conectar.origem_id, destino_id: no.id, rotulo: conectar.rotulo }, true)
    }
    preloadFotos([novo])
    aviso("Nó criado.", C.green)
    return no
  }
  async function criarAresta(payload, silencioso) {
    const r = await api.post("/grafo/aresta", payload)
    if (!r.ok) { if (!silencioso) aviso("Falha ao criar vínculo.", C.red); return null }
    const a = await r.json()
    setGraph(g => ({ ...g, links: [...g.links, { ...a }] }))
    if (!silencioso) aviso("Vínculo criado.", C.green)
    return a
  }
  async function atualizarNo(id, payload) {
    const r = await api.put(`/grafo/no/${id}`, payload)
    if (!r.ok) { aviso("Falha ao salvar.", C.red); return }
    const no = await r.json()
    setGraph(g => ({ ...g, nodes: g.nodes.map(n => n.id === id ? { ...n, ...no, x: n.x, y: n.y, fx: n.fx, fy: n.fy } : n) }))
    setSel(s => s?.tipo === "node" && s.data.id === id ? { tipo: "node", data: { ...s.data, ...no } } : s)
    preloadFotos([no]); aviso("Nó atualizado.", C.green)
  }
  async function atualizarAresta(id, payload) {
    const r = await api.put(`/grafo/aresta/${id}`, payload)
    if (!r.ok) { aviso("Falha ao salvar.", C.red); return }
    const a = await r.json()
    setGraph(g => ({ ...g, links: g.links.map(l => l.id === id ? { ...l, ...a } : l) }))
    setSel(null); aviso("Vínculo atualizado.", C.green)
  }
  async function enviarFoto(no_id, file) {
    if (!file) return
    const fd = new FormData(); fd.append("file", file)
    const r = await api.upload(`/grafo/no/${no_id}/foto`, fd)
    if (!r.ok) { aviso("Falha ao enviar foto.", C.red); return }
    const no = await r.json()
    const url = no.detalhes?.foto_url
    if (url) {
      imgCache.delete(url)
      fetchFoto(url)
    }
    setGraph(g => ({ ...g, nodes: g.nodes.map(n => n.id === no_id ? { ...n, ...no, x: n.x, y: n.y, fx: n.fx, fy: n.fy } : n) }))
    setSel(s => s?.tipo === "node" && s.data.id === no_id ? { tipo: "node", data: { ...s.data, ...no } } : s)
    aviso("Foto anexada à entidade.", C.green)
  }
  async function removerFoto(no_id) {
    const r = await api.delete(`/grafo/no/${no_id}/foto`)
    if (!r.ok) { aviso("Falha ao remover foto.", C.red); return }
    const no = await r.json()
    setGraph(g => ({ ...g, nodes: g.nodes.map(n => n.id === no_id ? { ...n, ...no, x: n.x, y: n.y, fx: n.fx, fy: n.fy } : n) }))
    setSel(s => s?.tipo === "node" && s.data.id === no_id ? { tipo: "node", data: { ...s.data, ...no } } : s)
    fgRef.current?.refresh?.()
    aviso("Foto removida.", C.textMid)
  }
  function excluirNo(id) {
    confirm({
      title: "Excluir nó",
      description: "Isso removerá o nó e todos os vínculos associados do grafo. Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      destructive: true,
      onConfirm: async () => {
        const r = await api.delete(`/grafo/no/${id}`)
        if (!r.ok) { aviso("Falha ao excluir.", C.red); return }
        setGraph(g => ({
          nodes: g.nodes.filter(n => n.id !== id),
          links: g.links.filter(l => (l.source.id || l.source) !== id && (l.target.id || l.target) !== id),
        }))
        setSel(null); aviso("Nó removido.", C.textMid)
      },
    })
  }
  async function excluirAresta(id) {
    const r = await api.delete(`/grafo/aresta/${id}`)
    if (!r.ok) { aviso("Falha ao excluir.", C.red); return }
    setGraph(g => ({ ...g, links: g.links.filter(l => l.id !== id) }))
    setSel(null); aviso("Vínculo removido.", C.textMid)
  }

  /* ── Interações no canvas ── */
  function onNodeClick(node) {
    if (pathMode) {
      if (!pathSrc) { setPathSrc(node); setPathRes(null); return }
      if (pathSrc.id === node.id) { setPathSrc(null); setPathRes(null); return }
      const result = bfsPath(pathSrc.id, node.id, graph.nodes, graph.links)
      if (result) {
        const nodeMap = {}; graph.nodes.forEach(n => { nodeMap[n.id] = n })
        setPathRes({ nodeIds: new Set(result.nodeIds), linkIds: new Set(result.linkIds), chain: result.nodeIds.map(id => nodeMap[id]).filter(Boolean) })
      } else {
        toast.warn(`Sem caminho entre ${pathSrc.rotulo} e ${node.rotulo} com ${hops} salto(s). Aumente os saltos.`)
        setPathSrc(null)
      }
      return
    }
    if (linking) {
      if (linking.sourceId === node.id) { setLinking(null); return }
      setModal({ tipo: "novoLink", origem_id: linking.sourceId, destino_id: node.id }); setLinking(null)
      return
    }
    setSel({ tipo: "node", data: node })
  }
  function onLinkClick(link) { if (!linking) setSel({ tipo: "link", data: link }) }
  function onBgClick() {
    if (pathMode) { setPathSrc(null); setPathRes(null); return }
    if (linking) setLinking(null); else setSel(null)
  }
  function onNodeDragEnd(node) {
    node.fx = node.x; node.fy = node.y
    api.put(`/grafo/no/${node.id}`, { pos_x: node.x, pos_y: node.y }).catch(() => {})
  }

  /* ── Render dos nós ── */
  const nodeCanvas = useCallback((node, ctx, scale) => {
    const cor = corCategoria(node.tipo)
    const isAlvo = !!node.alvo
    const isSel = sel?.tipo === "node" && sel.data.id === node.id
    const isLinkSrc = linking?.sourceId === node.id
    // caminho mínimo — destaque / dim
    const centScore = centMap ? (centMap.norm[node.id] ?? null) : null
    const centR = centScore != null ? 7 + centScore * 13 : (isAlvo ? 11 : 8)
    const r = centR

    // ── Padrões de Rede: halos e dimming ──
    if (padroes) {
      // Highlight exclusivo: dim nós fora do highlight
      if (padroesHighlight) {
        let inHL = false
        if (padroesHighlight.type === 'cluster') inHL = padroes.nodeCluster[node.id] === padroesHighlight.idx
        else if (padroesHighlight.type === 'brokers') inHL = padroes.brokers.has(node.id)
        else if (padroesHighlight.type === 'satellites') inHL = padroes.satellites.has(node.id)
        else if (padroesHighlight.type === 'triangles') inHL = padroes.triangleNodes.has(node.id)
        if (!inHL) ctx.globalAlpha = 0.12
      } else if (padroes.satellites.has(node.id)) {
        ctx.globalAlpha = 0.45
      }
      // Halo de cluster (só sem centMap e sem path ativo)
      if (!centMap && !pathRes) {
        const clIdx = padroes.nodeCluster[node.id]
        if (clIdx !== undefined) {
          const clColor = CLUSTER_COLORS[clIdx % CLUSTER_COLORS.length]
          ctx.beginPath(); ctx.arc(node.x, node.y, r + 9, 0, 2 * Math.PI)
          ctx.fillStyle = clColor + "15"; ctx.fill()
          ctx.strokeStyle = clColor + "55"; ctx.lineWidth = 1.5; ctx.stroke()
        }
      }
      // Anel pulsante para brokers
      if (padroes.brokers.has(node.id)) {
        const pulse = 0.5 + 0.5 * Math.sin(pathPhase.current * 2.5 + node.x * 0.08)
        ctx.beginPath(); ctx.arc(node.x, node.y, r + 5 + pulse * 3, 0, 2 * Math.PI)
        ctx.strokeStyle = "rgba(251,191,36," + (0.55 + pulse * 0.4) + ")"; ctx.lineWidth = 2.2; ctx.stroke()
        ctx.beginPath(); ctx.arc(node.x, node.y, r + 11 + pulse * 2, 0, 2 * Math.PI)
        ctx.strokeStyle = "rgba(251,191,36," + (0.15 + pulse * 0.15) + ")"; ctx.lineWidth = 1.5; ctx.stroke()
      }
    }

    if (centMap && centScore != null && centScore > 0.25) {
      const gSize = centScore * 9
      const alpha = centScore * 0.4
      ctx.beginPath(); ctx.arc(node.x, node.y, r + gSize, 0, 2 * Math.PI)
      const gc = centColor(centScore)
      ctx.strokeStyle = gc.replace('rgb(', 'rgba(').replace(')', ',' + alpha + ')')
      ctx.lineWidth = 3 + centScore * 4; ctx.stroke()
    }
    const onPath   = pathRes?.nodeIds.has(node.id)
    const isOrigin = onPath && pathRes.chain[0]?.id === node.id
    const isDest   = onPath && pathRes.chain[pathRes.chain.length - 1]?.id === node.id
    const isPathSrcNode = pathSrc?.id === node.id && !pathRes
    if (pathRes && !onPath) { ctx.globalAlpha = 0.18 }
    // glow pulsante no nó do caminho
    if (onPath) {
      const pulse = 0.5 + 0.5 * Math.sin(pathPhase.current * 3 + node.x * 0.05)
      const gc = isOrigin ? "#4ADE80" : isDest ? "#F87171" : "#22D3EE"
      ctx.beginPath(); ctx.arc(node.x, node.y, r + 7 + pulse * 3, 0, 2 * Math.PI)
      ctx.strokeStyle = gc + "44"; ctx.lineWidth = 3; ctx.stroke()
      ctx.beginPath(); ctx.arc(node.x, node.y, r + 3.5, 0, 2 * Math.PI)
      ctx.strokeStyle = gc + "cc"; ctx.lineWidth = 2.5; ctx.stroke()
    }
    // destaque do nó origem (antes de selecionar destino)
    if (isPathSrcNode) {
      ctx.beginPath(); ctx.arc(node.x, node.y, r + 5, 0, 2 * Math.PI)
      ctx.strokeStyle = "#4ADE8099"; ctx.lineWidth = 2; ctx.stroke()
    }
    // halo de seleção / origem de vínculo
    if (isSel || isLinkSrc) {
      ctx.beginPath(); ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI)
      ctx.fillStyle = isLinkSrc ? "rgba(74,222,128,0.25)" : "rgba(232,160,32,0.22)"; ctx.fill()
    }
    // disco
    const drawCor = centScore != null ? centColor(centScore) : cor
    ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
    ctx.fillStyle = "#0B1120"; ctx.fill()
    ctx.lineWidth = (isSel || isLinkSrc) ? 2.4 : 1.6
    ctx.strokeStyle = isSel ? C.gold : (isLinkSrc ? C.green : drawCor); ctx.stroke()
    ctx.beginPath(); ctx.arc(node.x, node.y, r - 1.4, 0, 2 * Math.PI)
    ctx.fillStyle = drawCor + "26"; ctx.fill()

    // foto da pessoa (se carregada) ou ícone
    const url = node.detalhes?.foto_url
    const img = url ? imgCache.get(url) : null
    if (img && img !== "loading" && img !== "error") {
      ctx.save(); ctx.beginPath(); ctx.arc(node.x, node.y, r - 1.4, 0, 2 * Math.PI); ctx.clip()
      ctx.drawImage(img, node.x - r, node.y - r, r * 2, r * 2); ctx.restore()
      ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
      ctx.lineWidth = isSel ? 2.4 : 1.6; ctx.strokeStyle = isSel ? C.gold : cor; ctx.stroke()
    } else {
      const icon = node.icone || iconePadrao(node.tipo)
      ctx.font = `${r * 1.25}px ${EMOJI_FONT}`
      ctx.textAlign = "center"; ctx.textBaseline = "middle"
      ctx.fillText(icon, node.x, node.y + 0.5)
    }
    // anel púrpura para nós criados via HITL (auto:correlacao:*)
    const isAutoCorr = node.origem?.startsWith("auto:correlacao:")
    if (isAutoCorr && !isSel) {
      ctx.beginPath(); ctx.arc(node.x, node.y, r + 3.5, 0, 2 * Math.PI)
      ctx.strokeStyle = "rgba(167,139,250,0.65)"; ctx.lineWidth = 1.8; ctx.stroke()
    }
    ctx.globalAlpha = 1
    if (centMap && centScore != null && centMap.cnt[node.id] > 0) {
      const badge = String(centMap.cnt[node.id])
      const bfs = Math.min(5.5, 12 / scale)
      ctx.font = '800 ' + bfs + 'px ' + MONO
      ctx.textAlign = "center"; ctx.textBaseline = "middle"
      ctx.fillStyle = centColor(centScore)
      ctx.fillText(badge, node.x, node.y + r + bfs + 1)
    }
    // rótulo
    if (isAlvo || isSel || scale > 1.1) {
      const label = (node.rotulo || "").slice(0, 22)
      const fs = Math.min(5, 11 / scale)
      ctx.font = `${isAlvo ? 700 : 500} ${fs}px ${SANS}`
      ctx.textAlign = "center"; ctx.textBaseline = "top"
      const w = ctx.measureText(label).width
      ctx.fillStyle = "rgba(11,17,32,0.78)"
      ctx.fillRect(node.x - w / 2 - 2, node.y + r + 1.5, w + 4, fs + 2)
      ctx.fillStyle = isAlvo ? C.gold : (isAutoCorr ? C.oracleLight : C.text)
      ctx.fillText(label, node.x, node.y + r + 2.5)
    }
  }, [sel, linking, pathRes, pathSrc, centMap, padroes, padroesHighlight])

  const nodePointerArea = useCallback((node, color, ctx) => {
    const r = (node.alvo ? 11 : 8) + 3
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, 2 * Math.PI); ctx.fill()
  }, [])

  const onEngineStop = useCallback(() => {
    if (!fitOnce.current && graph.nodes.length) { fitOnce.current = true; try { fgRef.current?.zoomToFit(500, 60) } catch {} }
  }, [graph.nodes.length])

  /* alvos filtrados */
  const alvosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return alvos
    return alvos.filter(a => `${a.rotulo} ${a.nome || ""} ${a.vulgo || ""} ${a.faccao || ""}`.toLowerCase().includes(q))
  }, [alvos, busca])

  const linkColor = useCallback((l) => {
    if (centMap) return "rgba(255,255,255,0.08)"
    if (pathRes?.linkIds.has(l.id)) return "#22D3EE"
    if (pathRes && !pathRes.linkIds.has(l.id)) return "rgba(255,255,255,0.07)"
    if (sel?.tipo === "link" && sel.data.id === l.id) return C.gold
    if (l.origem?.startsWith("auto:correlacao:")) return "rgba(167,139,250,0.55)"
    if (l.origem === "auto:citacao") return "rgba(56,189,248,0.55)"
    if (l.origem === "auto:liderancas") return "rgba(148,163,184,0.4)"
    return "rgba(232,160,32,0.55)"
  }, [sel, pathRes, centMap])

  /* ============================ UI ============================ */
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, height: "100%", overflow: "hidden", background: C.bg, fontFamily: SANS, color: C.text }}>

      {/* ══ TOPBAR ══════════════════════════════════════════════════════════ */}
      <div style={{height:48,flexShrink:0,background:"#0F172A",borderBottom:"1px solid rgba(255,255,255,0.07)",display:"flex",alignItems:"center",padding:"0 14px"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <div style={{width:12,height:12,borderRadius:"50%",background:"#FF5F57"}}/>
            <div style={{width:12,height:12,borderRadius:"50%",background:"#FEBC2E"}}/>
            <div style={{width:12,height:12,borderRadius:"50%",background:"#28C840"}}/>
          </div>
          <div style={{width:1,height:16,background:"rgba(255,255,255,0.12)",margin:"0 4px"}}/>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:"#F1F5F9",letterSpacing:"0.03em"}}>Análise de Vínculos</div>
            <div style={{fontSize:11,color:"#94A3B8",fontFamily:MONO,letterSpacing:"0.06em"}}>BASTOS-UNIT · Grafo de Relações · Motor i2</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, minWidth: 0, overflow: "hidden" }}>
      {/* ── ASIDE: lista de alvos ── */}
      <aside style={{ width: 280, flexShrink: 0, background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 3, height: 16, background: C.gold, borderRadius: 2, boxShadow: `0 0 8px ${C.gold}88` }} />
            <span style={{ fontSize: 12, fontWeight: 800, color: C.gold, letterSpacing: "0.1em", textTransform: "uppercase" }}>Análise de Vínculo</span>
          </div>
          <div style={{ fontSize: 11, color: C.textMid, fontFamily: MONO, marginTop: 6 }}>{alvos.length} alvo(s) no grafo</div>
        </div>

        <div style={{ padding: "10px 14px" }}>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar alvo, vulgo, facção..."
            style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 12px", fontSize: 13, color: C.text, outline: "none", fontFamily: MONO, caretColor: C.gold }} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 10px 10px" }}>
          {alvosFiltrados.length === 0 && (
            <div style={{ padding: 18, textAlign: "center", color: C.textMid, fontSize: 13 }}>
              {alvos.length === 0 ? "Grafo vazio. Clique em Sincronizar para semear das lideranças." : "Nenhum alvo encontrado."}
            </div>
          )}
          {alvosFiltrados.map(a => {
            const ativo = a.id === alvoId
            const cor = corCategoria("pessoa")
            return (
              <button key={a.id} className="gv-item" onClick={() => focar(a.id)}
                style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", marginBottom: 4, borderRadius: 8, cursor: "pointer", background: ativo ? "rgba(232,160,32,0.14)" : "transparent", border: `1px solid ${ativo ? C.goldBorder : "transparent"}` }}>
                <span style={{ fontSize: 18, fontFamily: EMOJI_FONT, lineHeight: 1, flexShrink: 0 }}>{a.icone || "──"}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: ativo ? C.gold : C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.rotulo || a.nome || "–"}</span>
                  <span style={{ display: "block", fontSize: 11, color: C.textMid, fontFamily: MONO, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.faccao || "–"} · {a.vinculos} vínc.</span>
                </span>
                {a.origem !== "manual" && <span style={{ fontSize: 11, color: C.textDim, fontFamily: MONO }}>auto</span>}
              </button>
            )
          })}
        </div>
        <div style={{ padding: "12px 14px", borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
          <button className="gv-btn" onClick={sincronizar} disabled={busy}
            style={btn(C.blue, busy)}>⟳ Sincronizar lideranças</button>
          <button className="gv-btn" onClick={() => setModal({ tipo: "novoAlvo" })}
            style={btn(C.gold)}>+ Novo alvo (manual)</button>
        </div>
      </aside>

      {/* ── MAIN: teia ── */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", height: "100%", background: C.bg }}>
        {/* topbar */}
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: `1px solid ${C.border}`, background: C.surface, flexShrink: 0, gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{alvoId ? (alvos.find(a => a.id === alvoId)?.rotulo || "Rede") : "Motor de Vínculos"}</div>
            <div style={{ fontSize: 11, color: C.textMid, fontFamily: MONO, marginTop: 2 }}>
              {alvoId ? `${graph.nodes.length} nós · ${graph.links.length} vínculos · ${hops} salto(s)` : "Selecione um alvo para abrir a teia"}
            </div>
          </div>
          {alvoId && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {/* saltos */}
              <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.05)", borderRadius: 7, padding: 2 }}>
                {[1, 2, 3].map(h => (
                  <button key={h} onClick={() => { setHops(h); carregarRede(alvoId, h) }}
                    style={{ width: 30, padding: "5px 0", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: MONO, background: hops === h ? C.goldSoft : "transparent", color: hops === h ? C.gold : C.textMid }}>{h}</button>
                ))}
              </div>
              <button className="gv-btn" onClick={() => fgRef.current?.zoomToFit(400, 60)} style={btn(C.textMid)}>⊙ Ajustar</button>
              <button className="gv-btn" onClick={varrerCitacoes} disabled={busy} style={btn(C.blue, busy)}>Varrer Citações</button>
              <button className="gv-btn"
                onClick={() => { if(pathMode){setPathMode(false);setPathSrc(null);setPathRes(null)}else{setPathMode(true);setPathSrc(null);setPathRes(null);setSel(null);setEdit(false)} }}
                style={btn(pathMode ? "#22D3EE" : C.textMid)}>
                {pathMode ? (pathRes ? "✕ Limpar" : pathSrc ? "▸ Clique no destino" : "▸ Clique na origem") : "⬡ Caminho"}
              </button>
              <button className="gv-btn"
                onClick={() => { setCentMode(c => !c); if(pathMode){setPathMode(false);setPathSrc(null);setPathRes(null)} }}
                style={btn(centMode ? "#F59E0B" : C.textMid)}>
                {centMode ? "◉ ON" : "◉ Centralidade"}
              </button>
              <button className="gv-btn"
                onClick={() => { setTimelineMode(m => !m); if(pathMode){setPathMode(false);setPathSrc(null);setPathRes(null)} }}
                style={btn(timelineMode ? "#38BDF8" : (tlBounds ? C.textMid : "rgba(255,255,255,0.2)"), !tlBounds)}
                title={tlBounds ? "Timeline animada" : "Sem dados temporais neste grafo"}>
                {timelineMode ? "⏱ ON" : "⏱ Timeline"}
              </button>
              <button className="gv-btn"
                onClick={() => { setPadroesMode(m => !m); setPadroesHighlight(null); if(pathMode){setPathMode(false);setPathSrc(null);setPathRes(null)} }}
                style={btn(padroesMode ? "#A78BFA" : C.textMid)}>
                {padroesMode ? "⬡ Padrões ON" : "⬡ Padrões"}
              </button>
              <div style={{ position: "relative" }}>
                <button className="gv-btn"
                  onClick={() => setFiltrosOpen(o => !o)}
                  style={btn((hiddenTipos.size || hiddenOrigens.size) ? "#34D399" : C.textMid)}>
                  ⊞ {(hiddenTipos.size || hiddenOrigens.size) ? `Filtros (${hiddenTipos.size + hiddenOrigens.size})` : "Filtros"}
                </button>
                {filtrosOpen && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 999,
                    background: "#111827", border: "1px solid #374151", borderRadius: 10,
                    padding: "14px 16px", minWidth: 220, boxShadow: "0 8px 32px rgba(0,0,0,.6)",
                    fontFamily: "inherit", fontSize: 12
                  }}>
                    {/* Cabeçalho */}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                      <span style={{ fontWeight:700, color:"#E2E8F0", letterSpacing:"0.04em" }}>FILTROS DE CAMADA</span>
                      <button onClick={() => { setHiddenTipos(new Set()); setHiddenOrigens(new Set()) }}
                        style={{ background:"transparent", border:"none", color:"#60A5FA", cursor:"pointer", fontSize:11, padding:0 }}>
                        Mostrar todos
                      </button>
                    </div>

                    {/* Seção NÓS */}
                    <div style={{ marginBottom:12 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                        <span style={{ fontSize:10, fontWeight:700, color:"#6B7280", letterSpacing:"0.1em" }}>NÓS</span>
                        <button onClick={() => setHiddenTipos(hiddenTipos.size === ALL_TIPOS.length ? new Set() : new Set(ALL_TIPOS))}
                          style={{ background:"transparent", border:"none", color:"#6B7280", cursor:"pointer", fontSize:10, padding:0 }}>
                          {hiddenTipos.size === ALL_TIPOS.length ? "nenhum" : "ocultar todos"}
                        </button>
                      </div>
                      {[
                        {id:"pessoa",      label:"Pessoa",       cor:"#E8A020"},
                        {id:"faccao",      label:"Facção",       cor:"#EF4444"},
                        {id:"local",       label:"Local/Unidade",cor:"#60A5FA"},
                        {id:"crime",       label:"Crime",        cor:"#FB923C"},
                        {id:"juridico",    label:"Jurídico",     cor:"#A78BFA"},
                        {id:"documento",   label:"Documento",    cor:"#38BDF8"},
                        {id:"social",      label:"Social/Vínculo",cor:"#4ADE80"},
                        {id:"geografia",   label:"Geografia",    cor:"#2DD4BF"},
                        {id:"financeiro",  label:"Financeiro",   cor:"#FBBF24"},
                        {id:"organizacao", label:"Organização",  cor:"#818CF8"},
                        {id:"evento",      label:"Evento",       cor:"#F472B6"},
                        {id:"generico",    label:"Genérico",     cor:"#94A3B8"},
                      ].map(cat => {
                        const hidden = hiddenTipos.has(cat.id)
                        const cnt = filteredGraph.nodes.filter(n => (n.tipo || "generico") === cat.id).length
                        const total = graph.nodes.filter(n => (n.tipo || "generico") === cat.id).length
                        if (total === 0) return null
                        return (
                          <label key={cat.id} style={{ display:"flex", alignItems:"center", gap:7, marginBottom:4, cursor:"pointer", opacity: hidden ? 0.45 : 1 }}>
                            <input type="checkbox" checked={!hidden}
                              onChange={() => setHiddenTipos(prev => { const n = new Set(prev); hidden ? n.delete(cat.id) : n.add(cat.id); return n })}
                              style={{ accentColor: cat.cor, width:13, height:13, cursor:"pointer" }} />
                            <span style={{ width:9, height:9, borderRadius:"50%", background: cat.cor, flexShrink:0 }} />
                            <span style={{ flex:1, color:"#CBD5E1" }}>{cat.label}</span>
                            <span style={{ color:"#4B5563", fontFamily:"monospace" }}>{cnt}/{total}</span>
                          </label>
                        )
                      })}
                    </div>

                    {/* Seção VÍNCULOS */}
                    <div style={{ borderTop:"1px solid #1F2937", paddingTop:10 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                        <span style={{ fontSize:10, fontWeight:700, color:"#6B7280", letterSpacing:"0.1em" }}>VÍNCULOS</span>
                        <button onClick={() => setHiddenOrigens(hiddenOrigens.size === ALL_ORIGENS.length ? new Set() : new Set(ALL_ORIGENS))}
                          style={{ background:"transparent", border:"none", color:"#6B7280", cursor:"pointer", fontSize:10, padding:0 }}>
                          {hiddenOrigens.size === ALL_ORIGENS.length ? "nenhum" : "ocultar todos"}
                        </button>
                      </div>
                      {[
                        {id:"manual",          label:"Manual",       cor:"#6EE7B7"},
                        {id:"auto:liderancas", label:"Lideranças",   cor:"#FCA5A5"},
                        {id:"auto:citacao",    label:"Citações",     cor:"#93C5FD"},
                        {id:"auto:correlacao", label:"Correlação IA",cor:"#C4B5FD"},
                      ].map(orig => {
                        const hidden = hiddenOrigens.has(orig.id)
                        const cnt = filteredGraph.links.filter(l => {
                          const o = l.origem || "manual"
                          return orig.id === "auto:correlacao" ? o.startsWith("auto:correlacao") : o === orig.id
                        }).length
                        const total = graph.links.filter(l => {
                          const o = l.origem || "manual"
                          return orig.id === "auto:correlacao" ? o.startsWith("auto:correlacao") : o === orig.id
                        }).length
                        if (total === 0) return null
                        return (
                          <label key={orig.id} style={{ display:"flex", alignItems:"center", gap:7, marginBottom:4, cursor:"pointer", opacity: hidden ? 0.45 : 1 }}>
                            <input type="checkbox" checked={!hidden}
                              onChange={() => setHiddenOrigens(prev => { const n = new Set(prev); hidden ? n.delete(orig.id) : n.add(orig.id); return n })}
                              style={{ accentColor: orig.cor, width:13, height:13, cursor:"pointer" }} />
                            <span style={{ width:9, height:2, borderRadius:2, background: orig.cor, flexShrink:0 }} />
                            <span style={{ flex:1, color:"#CBD5E1" }}>{orig.label}</span>
                            <span style={{ color:"#4B5563", fontFamily:"monospace" }}>{cnt}/{total}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
              <button className="gv-btn" onClick={() => setEdit(e => !e)} style={btn(edit ? C.green : C.gold)}>{edit ? "✎ Editando" : "✎ Editar"}</button>
            </div>
          )}
        </header>

        {/* barra de edição */}
        {alvoId && edit && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", background: C.surfaceMid, borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
            <button className="gv-btn" onClick={() => setModal({ tipo: "novoNo" })} style={btn(C.gold)}>+ Nó</button>
            <button className="gv-btn"
              onClick={() => { if (sel?.tipo === "node") setLinking({ sourceId: sel.data.id }); else aviso("Selecione um nó de origem primeiro.", C.textMid) }}
              style={btn(linking ? C.green : C.textMid)}>{linking ? "Clique no destino →" : "+ Vínculo a partir do selecionado"}</button>
            {linking && <span className="gv-link-mode" style={{ fontSize: 12, color: C.green, fontFamily: MONO }}>modo conexão · clique no nó de destino (ESC/clique no fundo cancela)</span>}
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: C.textDim, fontFamily: MONO }}>arraste nós para organizar · a posição é salva</span>
          </div>
        )}

        {/* canvas */}
        <div ref={wrapRef} style={{ flex: 1, position: "relative", overflow: "hidden" }} onClick={() => { /* bg handled by graph */ }}>
          {!alvoId ? (
            <Vazio onSync={sincronizar} busy={busy} temAlvos={alvos.length > 0} />
          ) : (
            <>
              <ForceGraph2D
                ref={fgRef}
                width={dim.w} height={dim.h}
                graphData={displayGraph}
                backgroundColor="#0B1120"
                nodeCanvasObject={nodeCanvas}
                nodePointerAreaPaint={nodePointerArea}
                nodeLabel={() => ""}
                linkColor={linkColor}
                linkWidth={l => pathRes?.linkIds.has(l.id) ? 3.5 : pathRes ? 0.35 : (sel?.tipo === "link" && sel.data.id === l.id) ? 2.5 : 1.2}
                linkDirectionalArrowLength={l => l.direcionada ? 3.5 : 0}
                linkDirectionalArrowRelPos={1}
                linkDirectionalParticles={l => (l.direcionada && (l.rotulo === "MANDA_EM" || l.rotulo === "SUBORDINADO_A")) ? 2 : 0}
                linkDirectionalParticleSpeed={0.006}
                linkDirectionalParticleWidth={2}
                linkCanvasObjectMode={() => "after"}
                linkCanvasObject={(link, ctx, scale) => {
                  const s = link.source, t = link.target
                  if (!s?.x || !t?.x) return
                  // caminho mínimo — linha tracejada animada
                  if (pathRes?.linkIds.has(link.id)) {
                    const phase = pathPhase.current
                    ctx.save()
                    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y)
                    ctx.strokeStyle = `rgba(34,211,238,${0.35 + 0.35 * Math.sin(phase * 3)})`
                    ctx.lineWidth = 5; ctx.setLineDash([9, 5]); ctx.lineDashOffset = -(phase * 20 % 28); ctx.stroke()
                    ctx.strokeStyle = "rgba(34,211,238,0.9)"; ctx.lineWidth = 1.8; ctx.setLineDash([]); ctx.stroke()
                    ctx.restore()
                  }
                  if (scale < 1.3 && !(sel?.tipo === "link" && sel.data.id === link.id)) return
                  const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2
                  const txt = (link.rotulo || "").replace(/_/g, " ")
                  if (!txt) return
                  const fs = Math.min(4.5, 10 / scale)
                  ctx.font = `600 ${fs}px ${SANS}`
                  const w = ctx.measureText(txt).width
                  ctx.fillStyle = "rgba(11,17,32,0.82)"; ctx.fillRect(mx - w / 2 - 2, my - fs / 2 - 1, w + 4, fs + 2)
                  ctx.fillStyle = "#CBD5E1"; ctx.textAlign = "center"; ctx.textBaseline = "middle"
                  ctx.fillText(txt, mx, my)
                }}
                onNodeClick={onNodeClick}
                onLinkClick={onLinkClick}
                onBackgroundClick={onBgClick}
                onNodeDragEnd={onNodeDragEnd}
                onEngineStop={onEngineStop}
                cooldownTicks={timelineMode ? 0 : 120}
                nodeRelSize={6}
              />
              {/* overlay padrões de rede */}
              {padroesMode && padroes && (
                <div style={{ position:"absolute", top:12, left:"50%", transform:"translateX(-50%)", background:"rgba(11,17,32,0.94)", border:"1px solid rgba(167,139,250,0.4)", borderRadius:12, padding:"12px 16px", backdropFilter:"blur(10px)", display:"flex", gap:10, zIndex:10, flexWrap:"wrap", maxWidth:"90%", animation:"gv-path-in .25s ease" }}>
                  <div style={{ fontSize:10, fontFamily:MONO, color:"#A78BFA", fontWeight:800, letterSpacing:"0.12em", width:"100%", marginBottom:4 }}>PADRÕES DE REDE DETECTADOS</div>
                  {/* Clusters */}
                  {padroes.clusters.length > 0 && (
                    <button onClick={() => setPadroesHighlight(h => h?.type==='cluster' && h.idx===-1 ? null : {type:'cluster',idx:-1})}
                      style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"8px 12px", borderRadius:8, border:"1px solid rgba(167,139,250,0.25)", background: padroesHighlight?.type==='cluster' ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.04)", cursor:"pointer", minWidth:80 }}>
                      <span style={{ fontSize:18, fontWeight:800, color:"#A78BFA", fontFamily:MONO }}>{padroes.clusters.length}</span>
                      <span style={{ fontSize:9, color:"#94A3B8", letterSpacing:"0.08em" }}>COMUNIDADES</span>
                      <div style={{ display:"flex", gap:3, marginTop:2 }}>
                        {padroes.clusters.slice(0,5).map((c,i) => (
                          <div key={i} title={"Comunidade "+(i+1)+": "+c.size+" nós"}
                            onClick={e => { e.stopPropagation(); setPadroesHighlight(h => h?.type==='cluster'&&h.idx===c.idx ? null : {type:'cluster',idx:c.idx}) }}
                            style={{ width:c.size>1?Math.min(28,8+c.size*1.5):8, height:8, borderRadius:4, background:CLUSTER_COLORS[c.idx % CLUSTER_COLORS.length], opacity: padroesHighlight?.type==='cluster'&&padroesHighlight.idx===c.idx?1:0.7 }}/>
                        ))}
                      </div>
                    </button>
                  )}
                  {/* Brokers */}
                  {padroes.brokers.size > 0 && (
                    <button onClick={() => setPadroesHighlight(h => h?.type==='brokers' ? null : {type:'brokers'})}
                      style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"8px 12px", borderRadius:8, border:"1px solid rgba(251,191,36,0.25)", background: padroesHighlight?.type==='brokers' ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.04)", cursor:"pointer", minWidth:80 }}>
                      <span style={{ fontSize:18, fontWeight:800, color:"#FBBF24", fontFamily:MONO }}>{padroes.brokers.size}</span>
                      <span style={{ fontSize:9, color:"#94A3B8", letterSpacing:"0.08em" }}>PONTES</span>
                      <span style={{ fontSize:9, color:"#FBBF24", marginTop:2 }}>anel pulsante</span>
                    </button>
                  )}
                  {/* Triângulos */}
                  {padroes.triangleCount > 0 && (
                    <button onClick={() => setPadroesHighlight(h => h?.type==='triangles' ? null : {type:'triangles'})}
                      style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"8px 12px", borderRadius:8, border:"1px solid rgba(74,222,128,0.25)", background: padroesHighlight?.type==='triangles' ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.04)", cursor:"pointer", minWidth:80 }}>
                      <span style={{ fontSize:18, fontWeight:800, color:"#4ADE80", fontFamily:MONO }}>{padroes.triangleCount}</span>
                      <span style={{ fontSize:9, color:"#94A3B8", letterSpacing:"0.08em" }}>TRIÂNGULOS</span>
                      <span style={{ fontSize:9, color:"#4ADE80", marginTop:2 }}>{padroes.triangleNodes.size} nós</span>
                    </button>
                  )}
                  {/* Satélites */}
                  {padroes.satellites.size > 0 && (
                    <button onClick={() => setPadroesHighlight(h => h?.type==='satellites' ? null : {type:'satellites'})}
                      style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"8px 12px", borderRadius:8, border:"1px solid rgba(148,163,184,0.25)", background: padroesHighlight?.type==='satellites' ? "rgba(148,163,184,0.15)" : "rgba(255,255,255,0.04)", cursor:"pointer", minWidth:80 }}>
                      <span style={{ fontSize:18, fontWeight:800, color:"#94A3B8", fontFamily:MONO }}>{padroes.satellites.size}</span>
                      <span style={{ fontSize:9, color:"#94A3B8", letterSpacing:"0.08em" }}>SATÉLITES</span>
                      <span style={{ fontSize:9, color:"#64748B", marginTop:2 }}>grau = 1</span>
                    </button>
                  )}
                  <button onClick={() => { setPadroesMode(false); setPadroesHighlight(null) }}
                    style={{ position:"absolute", top:8, right:10, color:"rgba(255,255,255,0.35)", background:"none", border:"none", cursor:"pointer", fontSize:15, lineHeight:1 }}>✕</button>
                </div>
              )}
              {/* overlay caminho mínimo */}
              {pathRes?.chain && (
                <div style={{ position:"absolute", top:12, left:"50%", transform:"translateX(-50%)", background:"rgba(11,17,32,0.92)", border:"1px solid rgba(34,211,238,0.4)", borderRadius:10, padding:"10px 18px", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", maxWidth:"78%", animation:"gv-path-in .25s ease", zIndex:10 }}>
                  <span style={{ fontSize:11, fontFamily:MONO, color:"#22D3EE", fontWeight:800, letterSpacing:"0.08em", marginRight:4, flexShrink:0 }}>
                    CAMINHO · {pathRes.chain.length - 1} SALTO(S)
                  </span>
                  {pathRes.chain.map((n, i) => (
                    <span key={n.id} style={{ display:"flex", alignItems:"center", gap:6 }}>
                      {i > 0 && <span style={{ color:"rgba(34,211,238,0.55)", fontSize:14, flexShrink:0 }}>→</span>}
                      <span style={{ fontSize:12, fontWeight:700, padding:"3px 10px", borderRadius:6,
                        color: i===0 ? "#4ADE80" : i===pathRes.chain.length-1 ? "#F87171" : "#F1F5F9",
                        background: i===0 ? "rgba(74,222,128,0.15)" : i===pathRes.chain.length-1 ? "rgba(248,113,113,0.15)" : "rgba(255,255,255,0.07)",
                        border: `1px solid ${i===0?"rgba(74,222,128,0.35)":i===pathRes.chain.length-1?"rgba(248,113,113,0.35)":"rgba(255,255,255,0.12)"}` }}>
                        {n.rotulo}
                      </span>
                    </span>
                  ))}
                  <button onClick={() => {setPathRes(null);setPathSrc(null);setPathMode(false)}} style={{ marginLeft:6, color:"rgba(255,255,255,0.45)", background:"none", border:"none", cursor:"pointer", fontSize:16, lineHeight:1, flexShrink:0 }}>✕</button>
                </div>
              )}
              {pathSrc && !pathRes && (
                <div style={{ position:"absolute", top:12, left:"50%", transform:"translateX(-50%)", background:"rgba(11,17,32,0.88)", border:"1px solid rgba(74,222,128,0.4)", borderRadius:8, padding:"8px 16px", backdropFilter:"blur(6px)", display:"flex", alignItems:"center", gap:10, zIndex:10 }}>
                  <span style={{ width:10, height:10, borderRadius:"50%", background:"#4ADE80", flexShrink:0 }}/>
                  <span style={{ fontSize:12, color:"#4ADE80", fontFamily:MONO, fontWeight:700 }}>ORIGEM: {pathSrc.rotulo}</span>
                  <span style={{ fontSize:12, color:C.textMid, fontFamily:MONO }}>→ clique no nó destino</span>
                  <button onClick={() => {setPathSrc(null);setPathMode(false)}} style={{ color:"rgba(255,255,255,0.4)", background:"none", border:"none", cursor:"pointer", fontSize:14 }}>✕</button>
                </div>
              )}
              {centMap && (
                <div style={{ position:"absolute", right:12, top:12, background:"rgba(11,17,32,0.92)", border:"1px solid rgba(245,158,11,0.35)", borderRadius:10, padding:"12px 14px", backdropFilter:"blur(8px)", minWidth:190, zIndex:10, animation:"gv-path-in .25s ease" }}>
                  <div style={{ fontSize:10, fontFamily:MONO, color:"#F59E0B", fontWeight:800, letterSpacing:"0.12em", marginBottom:10 }}>HUBS · TOP {centMap.sorted.length}</div>
                  {centMap.sorted.map((n, i) => {
                    const score = centMap.norm[n.id]
                    const cnt   = centMap.cnt[n.id]
                    return (
                      <div key={n.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7 }}>
                        <span style={{ fontSize:11, fontFamily:MONO, color:"rgba(255,255,255,0.3)", width:14, flexShrink:0 }}>{"#"+(i+1)}</span>
                        <span style={{ flex:1, fontSize:12, fontWeight:600, color:centColor(score), whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{n.rotulo}</span>
                        <span style={{ fontSize:11, fontFamily:MONO, color:"rgba(255,255,255,0.5)", flexShrink:0 }}>{cnt}v</span>
                        <div style={{ width:36, height:5, borderRadius:3, background:"rgba(255,255,255,0.08)", overflow:"hidden", flexShrink:0 }}>
                          <div style={{ height:"100%", width:(score*100)+"%", background:centColor(score), borderRadius:3 }}/>
                        </div>
                      </div>
                    )
                  })}
                  <div style={{ marginTop:8, paddingTop:8, borderTop:"1px solid rgba(255,255,255,0.07)", display:"flex", gap:8, fontSize:10, fontFamily:MONO, color:"rgba(255,255,255,0.35)", alignItems:"center" }}>
                    <span style={{color:"#4B5563",fontSize:12}}>■</span><span>baixo</span>
                    <span style={{color:"#F59E0B",fontSize:12}}>■</span><span>médio</span>
                    <span style={{color:"#EF4444",fontSize:12}}>■</span><span>hub</span>
                  </div>
                </div>
              )}
              {/* overlay timeline */}
              {timelineMode && tlBounds && (
                <div style={{ position:"absolute", bottom:12, left:12, right:12, zIndex:10, pointerEvents:"auto" }}>
                  {/* Data atual em destaque */}
                  <div style={{ textAlign:"center", marginBottom:6 }}>
                    <span style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(11,17,32,0.9)", border:"1px solid rgba(56,189,248,0.5)", borderRadius:8, padding:"5px 14px", backdropFilter:"blur(6px)" }}>
                      <span style={{ fontSize:13, fontFamily:MONO, color:"#38BDF8", fontWeight:800, letterSpacing:"0.06em" }}>
                        {(tlDate||tlBounds.min).slice(0,10)}
                      </span>
                      <span style={{ fontSize:11, color:"#4B5563" }}>·</span>
                      <span style={{ fontSize:11, color:"#94A3B8", fontFamily:MONO }}>
                        {displayGraph.nodes.length}n · {displayGraph.links.length}v
                      </span>
                    </span>
                  </div>
                  {/* Controles */}
                  <div style={{ background:"rgba(11,17,32,0.92)", border:"1px solid rgba(56,189,248,0.25)", borderRadius:10, padding:"10px 14px", backdropFilter:"blur(10px)" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      {/* Botões */}
                      <button onClick={() => { setTlDate(tlBounds.min); setTlPlaying(false) }}
                        style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:6, color:"#94A3B8", cursor:"pointer", padding:"4px 8px", fontSize:13 }}>⏮</button>
                      <button onClick={() => setTlPlaying(p => !p)}
                        style={{ background: tlPlaying ? "rgba(56,189,248,0.2)" : "rgba(255,255,255,0.06)", border:"1px solid "+(tlPlaying?"rgba(56,189,248,0.5)":"rgba(255,255,255,0.1)"), borderRadius:6, color: tlPlaying ? "#38BDF8" : "#94A3B8", cursor:"pointer", padding:"4px 10px", fontSize:13, minWidth:36 }}>
                        {tlPlaying ? "⏸" : "▶"}
                      </button>
                      {/* Scrubber */}
                      <input type="range" style={{ flex:1, accentColor:"#38BDF8", height:4 }}
                        min={new Date(tlBounds.min).getTime()}
                        max={new Date(tlBounds.max).getTime()}
                        value={new Date(tlDate||tlBounds.min).getTime()}
                        onChange={e => { setTlPlaying(false); setTlDate(new Date(+e.target.value).toISOString()) }}
                      />
                      <button onClick={() => { setTlDate(tlBounds.max); setTlPlaying(false) }}
                        style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:6, color:"#94A3B8", cursor:"pointer", padding:"4px 8px", fontSize:13 }}>⏭</button>
                    </div>
                    {/* Segunda linha: datas + velocidade */}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <span style={{ fontSize:10, color:"#4B5563", fontFamily:MONO }}>{tlBounds.min.slice(0,10)}</span>
                      <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                        <span style={{ fontSize:10, color:"#4B5563", marginRight:4 }}>velocidade</span>
                        {[1,5,15,52].map(s => (
                          <button key={s} onClick={() => setTlSpeed(s)}
                            style={{ background: tlSpeed===s ? "rgba(56,189,248,0.2)" : "transparent", border:"1px solid "+(tlSpeed===s?"rgba(56,189,248,0.5)":"rgba(255,255,255,0.1)"), borderRadius:5, color: tlSpeed===s ? "#38BDF8" : "#6B7280", cursor:"pointer", padding:"2px 7px", fontSize:10, fontFamily:MONO }}>
                            {s===1?"1sem":s===5?"5sem":s===15?"1mês":"1ano"}
                          </button>
                        ))}
                      </div>
                      <span style={{ fontSize:10, color:"#4B5563", fontFamily:MONO }}>{tlBounds.max.slice(0,10)}</span>
                    </div>
                  </div>
                </div>
              )}
              {/* legenda */}
              <div style={{ position: "absolute", left: 12, bottom: timelineMode ? 130 : 12, background: "rgba(17,24,39,0.82)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", backdropFilter: "blur(6px)", maxWidth: 220, transition: "bottom .2s" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.textMid, letterSpacing: "0.1em", marginBottom: 6, fontFamily: MONO }}>LEGENDA</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 8px" }}>
                  {CATEGORIAS.map(c => (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.textMid }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.cor, flexShrink: 0 }} />{c.label}
                    </div>
                  ))}
                </div>
              </div>
              {carregando && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(11,17,32,0.5)", color: C.gold, fontFamily: MONO, fontSize: 13 }}>carregando rede?</div>}
            </>
          )}
        </div>
      </main>

      {/* ── PAINEL DE DETALHES ── */}
      {sel && <PainelDetalhe sel={sel} edit={edit}
        onEdit={() => setModal({ tipo: sel.tipo === "node" ? "editNo" : "editLink", data: sel.data })}
        onConnect={() => setLinking({ sourceId: sel.data.id })}
        onDelete={() => sel.tipo === "node" ? excluirNo(sel.data.id) : excluirAresta(sel.data.id)}
        onFoto={(file) => enviarFoto(sel.data.id, file)}
        onExportarPDF={() => exportarPDF(sel.data)}
        onRemoveFoto={() => removerFoto(sel.data.id)}
        onClose={() => setSel(null)} />}

      {/* ── MODAIS ── */}
      {modal?.tipo === "novoNo" && (
        <ModalNo titulo="Novo nó" rotulosVinculo={meta.rotulos_vinculo} podeConectar={!!alvoId}
          alvoLabel={alvos.find(a => a.id === alvoId)?.rotulo}
          onClose={() => setModal(null)}
          onSalvar={async (dados, conectar) => { setModal(null); await criarNo(dados, conectar ? { origem_id: alvoId, rotulo: conectar } : null) }} />
      )}
      {modal?.tipo === "editNo" && (
        <ModalNo titulo="Editar nó" inicial={modal.data} onClose={() => setModal(null)}
          onSalvar={async (dados) => { setModal(null); await atualizarNo(modal.data.id, dados) }} />
      )}
      {modal?.tipo === "novoAlvo" && (
        <ModalNo titulo="Novo alvo" forcarTipo="pessoa" onClose={() => setModal(null)}
          onSalvar={async (dados) => { setModal(null); const no = await criarNo(dados, null); await carregarAlvos(); if (no) focar(no.id) }} />
      )}
      {(modal?.tipo === "novoLink") && (
        <ModalLink rotulos={meta.rotulos_vinculo}
          origem={graph.nodes.find(n => n.id === modal.origem_id)}
          destino={graph.nodes.find(n => n.id === modal.destino_id)}
          onClose={() => setModal(null)}
          onSalvar={async (rotulo, direcionada) => { setModal(null); await criarAresta({ origem_id: modal.origem_id, destino_id: modal.destino_id, rotulo, direcionada }) }} />
      )}
      {modal?.tipo === "editLink" && (
        <ModalLink rotulos={meta.rotulos_vinculo} inicial={modal.data}
          onClose={() => setModal(null)}
          onSalvar={async (rotulo, direcionada) => { setModal(null); await atualizarAresta(modal.data.id, { rotulo, direcionada }) }} />
      )}

      </div>
    </div>
  )
}

/* ── botão helper ── */
function btn(cor, off) {
  return { padding: "7px 12px", borderRadius: 7, border: `1px solid ${cor}44`, background: `${cor}1a`, color: cor, fontSize: 12, fontWeight: 700, cursor: off ? "not-allowed" : "pointer", fontFamily: MONO, opacity: off ? 0.5 : 1, whiteSpace: "nowrap" }
}

/* ── estado vazio ── */
function Vazio({ onSync, busy, temAlvos }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center", padding: 24 }}>
      <div style={{ fontSize: 52, fontFamily: EMOJI_FONT, opacity: 0.85 }}>🕸</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Motor de Vínculos</div>
      <div style={{ fontSize: 13.5, color: C.textMid, maxWidth: 440, lineHeight: 1.6 }}>
        {temAlvos ? "Selecione um alvo na lista à esquerda para abrir a teia de vínculos." : "O grafo está vazio. Sincronize com as lideranças para semear automaticamente pessoas, unidades e facções — depois conecte o resto na mão."}
      </div>
      {!temAlvos && <button className="gv-btn" onClick={onSync} disabled={busy} style={{ ...btn(C.gold, busy), padding: "10px 20px", fontSize: 13.5 }}>⟳ Sincronizar lideranças</button>}
    </div>
  )
}

/* ── painel de detalhe (nó ou vínculo) ── */
function PainelDetalhe({ sel, edit, onEdit, onConnect, onDelete, onClose, onFoto, onRemoveFoto, onExportarPDF }) {
  const isNode = sel.tipo === "node"
  const d = sel.data
  const cor = isNode ? corCategoria(d.tipo) : C.gold
  const det = isNode ? (d.detalhes || {}) : (d.propriedades || {})
  const movs = isNode ? det.movimentacoes : null
  const ocultar = new Set(["movimentacoes", "foto_url", "foto_lider_id", "foto"])
  const [fotoSrc, setFotoSrc] = useState(null)
  useEffect(() => {
    if (!det.foto_url) { setFotoSrc(null); return }
    const token = getAccessToken() || ""
    const fullUrl = `${IMG_BASE}${det.foto_url.replace(/^\/api/, "")}`
    let cancelled = false
    fetch(fullUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.blob() : Promise.reject(r.status))
      .then(blob => { if (!cancelled) setFotoSrc(URL.createObjectURL(blob)) })
      .catch(() => { if (!cancelled) setFotoSrc(null) })
    return () => { cancelled = true }
  }, [det.foto_url])
  const miniBtn = (c) => ({ padding: "6px 12px", borderRadius: 6, border: `1px solid ${c}55`, background: `${c}1a`, color: c, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: MONO })
  return (
    <aside style={{ width: 320, flexShrink: 0, background: C.surface, borderLeft: `1px solid ${C.border}`, display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: 26, fontFamily: EMOJI_FONT, lineHeight: 1 }}>{isNode ? (d.icone || iconePadrao(d.tipo)) : "──"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: cor, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: MONO }}>
            {isNode ? labelCategoria(d.tipo) : "Vínculo"}{isNode && d.alvo ? " · ALVO" : ""}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginTop: 2, wordBreak: "break-word" }}>
            {isNode ? d.rotulo : (d.rotulo || "").replace(/_/g, " ")}
          </div>
        </div>
        <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: "50%", border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.05)", color: C.textMid, cursor: "pointer", flexShrink: 0 }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* foto da entidade (upload individual) */}
        {isNode && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            {fotoSrc ? (
              <img src={fotoSrc} alt="" style={{ width: 104, height: 128, objectFit: "cover", borderRadius: 8, border: `2px solid ${cor}` }} />
            ) : (
              <div style={{ width: 104, height: 128, borderRadius: 8, border: `1px dashed ${C.borderUp}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, fontFamily: EMOJI_FONT, color: C.textMid, background: "rgba(255,255,255,0.02)" }}>
                {d.icone || iconePadrao(d.tipo)}
              </div>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <label style={{ ...miniBtn(C.gold), display: "inline-flex", alignItems: "center" }}>
                {fotoSrc ? "Trocar foto" : "Anexar foto"}
                <input type="file" accept="image/*" style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) onFoto?.(f); e.target.value = "" }} />
              </label>
              {fotoSrc && <button onClick={onRemoveFoto} style={miniBtn(C.textMid)}>Remover</button>}
            </div>
          </div>
        )}

        {/* exportar PDF */}
        {isNode && (
          <button className="gv-btn" onClick={onExportarPDF}
            style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:"1px solid rgba(239,68,68,0.35)", background:"rgba(239,68,68,0.08)", color:"#F87171", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:MONO, letterSpacing:"0.05em", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            ⬇ Exportar Relatório PDF
          </button>
        )}
        {/* metadados */}
        {Object.entries(det).filter(([k, v]) => !ocultar.has(k) && v != null && v !== "").length > 0 && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.textMid, letterSpacing: "0.1em", marginBottom: 8, fontFamily: MONO }}>METADADOS</div>
            {Object.entries(det).filter(([k, v]) => !ocultar.has(k) && v != null && v !== "").map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", fontFamily: MONO, flexShrink: 0 }}>{k.replace(/_/g, " ")}</span>
                <span style={{ fontSize: 12, color: C.text, textAlign: "right", wordBreak: "break-word" }}>{String(v)}</span>
              </div>
            ))}
          </div>
        )}

        {/* timeline (pessoa) */}
        {movs && movs.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.gold, letterSpacing: "0.1em", marginBottom: 8, fontFamily: MONO }}>LINHA DO TEMPO ({movs.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {movs.map((m, i) => (
                <div key={i} style={{ display: "flex", gap: 10, paddingBottom: 12, position: "relative" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: i === 0 ? C.gold : C.textMid, marginTop: 3 }} />
                    {i < movs.length - 1 && <span style={{ flex: 1, width: 2, background: "rgba(255,255,255,0.1)" }} />}
                  </div>
                  <div style={{ flex: 1, paddingBottom: 2 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? C.gold : C.text, fontFamily: MONO }}>{m.competencia || "–"}{i === 0 ? " · atual" : ""}</div>
                    <div style={{ fontSize: 12, color: C.text, marginTop: 2 }}>{m.unidade} · {m.pavilhao}</div>
                    <div style={{ fontSize: 11, color: C.textMid }}>{[m.cargo, m.faccao, m.cela].filter(Boolean).join(" · ")}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* a──es */}
      {edit && (
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}`, display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button className="gv-btn" onClick={onEdit} style={{ ...btn(C.gold), flex: 1 }}>✎ Editar</button>
          {isNode && <button className="gv-btn" onClick={onConnect} style={{ ...btn(C.green), flex: 1 }}>+ Vínculo</button>}
          <button className="gv-btn" onClick={onDelete} style={{ ...btn(C.red), flex: 1 }}>── Excluir</button>
        </div>
      )}
    </aside>
  )
}

/* ── modal de nó (criar/editar) com galeria de ícones ── */
function ModalNo({ titulo, inicial, forcarTipo, podeConectar, alvoLabel, rotulosVinculo = [], onClose, onSalvar }) {
  const [tipo, setTipo]     = useState(inicial?.tipo || forcarTipo || "generico")
  const [icone, setIcone]   = useState(inicial?.icone || iconePadrao(forcarTipo || "generico"))
  const [rotulo, setRotulo] = useState(inicial?.rotulo || "")
  const [obs, setObs]       = useState(inicial?.detalhes?.observacao || "")
  const [data, setData]     = useState(inicial?.detalhes?.data || "")
  const [buscaIco, setBuscaIco] = useState("")
  const [conectar, setConectar] = useState(false)
  const [rotVinc, setRotVinc]   = useState("VINCULADO_A")

  const grupos = useMemo(() => {
    const q = buscaIco.trim().toLowerCase()
    if (!q) return GALERIA
    return GALERIA.map(g => ({ ...g, itens: g.itens.filter(it => it.n.toLowerCase().includes(q)) })).filter(g => g.itens.length)
  }, [buscaIco])

  function salvar() {
    const detalhes = { ...(inicial?.detalhes || {}) }
    detalhes.observacao = obs || undefined
    detalhes.data = data || undefined
    onSalvar({ tipo, icone, rotulo: rotulo || "Sem rótulo", detalhes }, conectar ? rotVinc : false)
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ width: "min(720px,94vw)", maxHeight: "88vh", background: C.surface, borderRadius: 14, border: `1px solid ${C.borderUp}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24, fontFamily: EMOJI_FONT }}>{icone}</span>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{titulo}</span>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.05)", color: C.textMid, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* rótulo */}
          <div>
            <Lbl>Rótulo</Lbl>
            <input value={rotulo} onChange={e => setRotulo(e.target.value)} autoFocus placeholder="Ex.: Tr?fico internacional, Col?mbia, RELINT 001/2026?"
              style={inp()} />
          </div>

          {/* categoria */}
          {!forcarTipo && (
            <div>
              <Lbl>Categoria (define a cor)</Lbl>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {CATEGORIAS.map(c => (
                  <button key={c.id} onClick={() => { setTipo(c.id); if (!inicial && iconePadrao(tipo) === icone) setIcone(iconePadrao(c.id)) }}
                    style={{ padding: "5px 10px", borderRadius: 20, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: MONO, border: `1px solid ${tipo === c.id ? c.cor : C.border}`, background: tipo === c.id ? `${c.cor}22` : "transparent", color: tipo === c.id ? c.cor : C.textMid, display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.cor }} />{c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* galeria de ícones */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <Lbl noMargin>Ícone</Lbl>
              <input value={buscaIco} onChange={e => setBuscaIco(e.target.value)} placeholder="buscar ?cone?"
                style={{ ...inp(), width: 180, padding: "6px 10px", fontSize: 12 }} />
            </div>
            <div style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, maxHeight: 240, overflowY: "auto" }}>
              {grupos.map(g => (
                <div key={g.grupo} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: corCategoria(g.tipo), letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6, fontFamily: MONO }}>{g.grupo}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {g.itens.map(it => (
                      <button key={it.e + it.n} className="gv-ico" title={it.n}
                        onClick={() => { setIcone(it.e); if (!forcarTipo) setTipo(g.tipo) }}
                        style={{ width: 38, height: 38, borderRadius: 9, cursor: "pointer", fontSize: 20, fontFamily: EMOJI_FONT, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${icone === it.e ? C.goldBorder : C.border}`, background: icone === it.e ? C.goldSoft : "rgba(255,255,255,0.03)", transition: "all .1s" }}>{it.e}</button>
                    ))}
                  </div>
                </div>
              ))}
              {grupos.length === 0 && <div style={{ color: C.textMid, fontSize: 12, padding: 8 }}>Nenhum ícone encontrado.</div>}
            </div>
          </div>

          {/* detalhes opcionais */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <Lbl>Data (opcional)</Lbl>
              <input value={data} onChange={e => setData(e.target.value)} placeholder="dd/mm/aaaa" style={inp()} />
            </div>
          </div>
          <div>
            <Lbl>Observação (opcional)</Lbl>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} placeholder="Anotação livre?"
              style={{ ...inp(), resize: "vertical", fontFamily: SANS }} />
          </div>

          {/* conectar ao alvo */}
          {podeConectar && (
            <div style={{ background: "rgba(74,222,128,0.06)", border: `1px solid rgba(74,222,128,0.25)`, borderRadius: 10, padding: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: C.text }}>
                <input type="checkbox" checked={conectar} onChange={e => setConectar(e.target.checked)} style={{ accentColor: C.green }} />
                Ligar ao alvo <b style={{ color: C.gold }}>{alvoLabel}</b>
              </label>
              {conectar && (
                <div style={{ marginTop: 10 }}>
                  <Lbl>Rótulo do vínculo</Lbl>
                  <SelectRotulo valor={rotVinc} onChange={setRotVinc} rotulos={rotulosVinculo} />
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ ...btn(C.textMid), padding: "9px 18px" }}>Cancelar</button>
          <button onClick={salvar} style={{ ...btn(C.gold), padding: "9px 22px", background: C.gold, color: "#0B1120" }}>Salvar</button>
        </div>
      </div>
    </Overlay>
  )
}

/* ── modal de vínculo ── */
function ModalLink({ inicial, origem, destino, rotulos = [], onClose, onSalvar }) {
  const [rotulo, setRotulo] = useState(inicial?.rotulo || "VINCULADO_A")
  const [dir, setDir]       = useState(inicial ? !!inicial.direcionada : true)
  return (
    <Overlay onClose={onClose}>
      <div style={{ width: "min(440px,94vw)", background: C.surface, borderRadius: 14, border: `1px solid ${C.borderUp}`, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{inicial ? "Editar vínculo" : "Novo vínculo"}</span>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.05)", color: C.textMid, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {origem && destino && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.textMid, fontFamily: MONO, flexWrap: "wrap" }}>
              <b style={{ color: C.text }}>{origem.icone} {origem.rotulo}</b> {dir ? "→" : "↔"} <b style={{ color: C.text }}>{destino.icone} {destino.rotulo}</b>
            </div>
          )}
          <div>
            <Lbl>Rótulo do vínculo</Lbl>
            <SelectRotulo valor={rotulo} onChange={setRotulo} rotulos={rotulos} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: C.text }}>
            <input type="checkbox" checked={dir} onChange={e => setDir(e.target.checked)} style={{ accentColor: C.gold }} />
            Direcionado (com seta)
          </label>
        </div>
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ ...btn(C.textMid), padding: "9px 18px" }}>Cancelar</button>
          <button onClick={() => onSalvar(rotulo || "VINCULADO_A", dir)} style={{ ...btn(C.gold), padding: "9px 22px", background: C.gold, color: "#0B1120" }}>Salvar</button>
        </div>
      </div>
    </Overlay>
  )
}

/* ── select de rótulo (lista + livre) ── */
function SelectRotulo({ valor, onChange, rotulos }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {rotulos.map(r => (
          <button key={r} onClick={() => onChange(r)}
            style={{ padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: MONO, border: `1px solid ${valor === r ? C.goldBorder : C.border}`, background: valor === r ? C.goldSoft : "transparent", color: valor === r ? C.gold : C.textMid }}>{r.replace(/_/g, " ")}</button>
        ))}
      </div>
      <input value={valor} onChange={e => onChange(e.target.value.toUpperCase().replace(/\s+/g, "_"))} placeholder="ou digite um rótulo livre" style={inp()} />
    </div>
  )
}

/* ── helpers de UI ── */
function Overlay({ children, onClose }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: "fixed", inset: 0, zIndex: 1500, background: "rgba(7,10,20,0.78)", backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      {children}
    </div>
  )
}
function Lbl({ children, noMargin }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: MONO, marginBottom: noMargin ? 0 : 6 }}>{children}</div>
}
function inp() {
  return { width: "100%", background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 7, padding: "9px 12px", fontSize: 13, color: C.text, outline: "none", fontFamily: MONO, caretColor: C.gold }
}
