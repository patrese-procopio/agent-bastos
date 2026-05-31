import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react"

const SANS       = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'
const MONO       = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const C = { bg:"#0B1120", gold:"#E8A020", green:"#4ADE80", text:"#F1F5F9", textMid:"#94A3B8" }
const NODE_R    = 26
const ALVO_R    = 34
const CONNECT_R = 10
const HIT_EXTRA = 8

function corCategoria(tipo) {
  const MAP = {
    pessoa:"#E8A020", local:"#38BDF8", faccao:"#F87171", crime:"#FB923C",
    juridico:"#A78BFA", documento:"#34D399", social:"#EC4899", evento:"#FBBF24",
    generico:"#94A3B8", financeiro:"#6EE7B7", organizacao:"#93C5FD", geografia:"#6EE7B7",
  }
  return MAP[tipo] || "#94A3B8"
}
function iconePadrao(tipo) {
  const MAP = {
    pessoa:"👤", local:"🏛️", faccao:"🏴", crime:"🔫", juridico:"⚖️",
    documento:"📄", social:"🤝", evento:"⚡", generico:"⚪", financeiro:"💰",
    organizacao:"🏢", geografia:"🌍",
  }
  return MAP[tipo] || "⚪"
}
function handlePos(node) {
  const r = node.alvo ? ALVO_R : NODE_R
  return { x: node.x + r * 0.75, y: node.y - r * 0.75 }
}
function hitNode(node, wx, wy) {
  const r = (node.alvo ? ALVO_R : NODE_R) + HIT_EXTRA
  return Math.hypot(wx - node.x, wy - node.y) < r
}
function hitHandle(node, wx, wy) {
  const h = handlePos(node)
  return Math.hypot(wx - h.x, wy - h.y) < CONNECT_R + 4
}
function hitLink(link, wx, wy) {
  const s = link._src, t = link._dst
  if (!s || !t) return false
  const dx = t.x - s.x, dy = t.y - s.y
  const len = Math.hypot(dx, dy)
  if (len < 1) return false
  const t2 = ((wx - s.x) * dx + (wy - s.y) * dy) / (len * len)
  if (t2 < 0 || t2 > 1) return false
  const px = s.x + t2 * dx, py = s.y + t2 * dy
  return Math.hypot(wx - px, wy - py) < 6
}

const GrafoCanvas = forwardRef(function GrafoCanvas({
  nodes, links, sel, linking, imgCache,
  onNodeClick, onLinkClick, onBgClick, onNodeDragEnd, onConnectRequest,
  editMode,
}, ref) {
  const canvasRef = useRef(null)
  const stateRef  = useRef({
    pan:{ x:0, y:0 }, zoom:1,
    drag:null, panDrag:null, connectDrag:null,
    nodes:[], links:[],
    sel:null, linking:null, imgCache:null, editMode:false,
  })
  const rafRef = useRef(null)

  useEffect(() => {
    const s = stateRef.current
    s.sel = sel; s.linking = linking; s.imgCache = imgCache; s.editMode = editMode
    schedDraw()
  })

  useEffect(() => {
    const s = stateRef.current
    const posMap = {}
    s.nodes.forEach(n => { posMap[n.id] = { x: n.x, y: n.y } })
    const canvas = canvasRef.current
    const cx = (canvas?.width  || 800) / 2
    const cy = (canvas?.height || 600) / 2
    const noPos = nodes.filter(n => n.pos_x == null && n.pos_y == null && !posMap[n.id])
    noPos.forEach((n, i) => {
      const angle = (i / Math.max(noPos.length, 1)) * Math.PI * 2
      const rad   = Math.min(200, 70 + noPos.length * 20)
      posMap[n.id] = { x: cx + Math.cos(angle) * rad, y: cy + Math.sin(angle) * rad }
    })
    s.nodes = nodes.map(n => ({
      ...n,
      x: n.pos_x ?? posMap[n.id]?.x ?? cx,
      y: n.pos_y ?? posMap[n.id]?.y ?? cy,
    }))
    const nodeById = Object.fromEntries(s.nodes.map(n => [n.id, n]))
    s.links = links.map(l => ({
      ...l,
      _src: nodeById[l.source?.id ?? l.source] || null,
      _dst: nodeById[l.target?.id ?? l.target] || null,
    }))
    schedDraw()
  }, [nodes, links])

  function schedDraw() {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => { rafRef.current = null; draw() })
  }

  function draw() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    const s   = stateRef.current
    const { pan, zoom } = s
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = C.bg
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // grid
    ctx.save()
    ctx.strokeStyle = "rgba(255,255,255,0.035)"
    ctx.lineWidth   = 0.5
    const gs = 40 * zoom
    const ox = ((pan.x % gs) + gs) % gs
    const oy = ((pan.y % gs) + gs) % gs
    for (let x = ox; x < canvas.width;  x += gs) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke() }
    for (let y = oy; y < canvas.height; y += gs) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke() }
    ctx.restore()
    ctx.save()
    ctx.translate(pan.x, pan.y)
    ctx.scale(zoom, zoom)
    s.links.forEach(l => drawLink(ctx, l, s))
    if (s.connectDrag) {
      const src = s.nodes.find(n => n.id === s.connectDrag.srcId)
      if (src) {
        ctx.save()
        ctx.strokeStyle = C.green; ctx.lineWidth = 1.5/zoom
        ctx.setLineDash([5/zoom, 3/zoom])
        ctx.beginPath(); ctx.moveTo(src.x, src.y)
        ctx.lineTo(s.connectDrag.cx, s.connectDrag.cy); ctx.stroke()
        ctx.restore()
      }
    }
    s.nodes.forEach(n => drawNode(ctx, n, s, zoom))
    ctx.restore()
  }

  function drawLink(ctx, link, s) {
    const { _src:src, _dst:dst } = link
    if (!src || !dst) return
    const isSel = s.sel?.tipo === "link" && s.sel.data.id === link.id
    let color = "rgba(232,160,32,0.55)"
    if (link.origem === "auto:citacao")    color = "rgba(56,189,248,0.55)"
    if (link.origem === "auto:liderancas") color = "rgba(148,163,184,0.4)"
    if (isSel)                             color = C.gold
    const dx = dst.x-src.x, dy = dst.y-src.y
    const len = Math.hypot(dx, dy)
    if (len < 1) return
    const srcR = src.alvo ? ALVO_R : NODE_R
    const dstR = dst.alvo ? ALVO_R : NODE_R
    const ux = dx/len, uy = dy/len
    const x1 = src.x+ux*srcR, y1 = src.y+uy*srcR
    const x2 = dst.x-ux*dstR, y2 = dst.y-uy*dstR
    ctx.save()
    ctx.strokeStyle = color; ctx.lineWidth = isSel ? 2.5 : 1.4
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke()
    if (link.direcionada) {
      const ax=x2-ux*10, ay=y2-uy*10, px=-uy*5, py=ux*5
      ctx.fillStyle = color
      ctx.beginPath(); ctx.moveTo(x2,y2); ctx.lineTo(ax+px,ay+py); ctx.lineTo(ax-px,ay-py)
      ctx.closePath(); ctx.fill()
    }
    const txt = (link.rotulo||"").replace(/_/g," ")
    if (txt && (isSel || len > 80)) {
      const mx=(src.x+dst.x)/2, my=(src.y+dst.y)/2, fs=11
      ctx.font = `600 ${fs}px ${SANS}`
      const tw = ctx.measureText(txt).width
      ctx.fillStyle = "rgba(11,17,32,0.82)"
      ctx.fillRect(mx-tw/2-3, my-fs/2-2, tw+6, fs+4)
      ctx.fillStyle = "#CBD5E1"; ctx.textAlign="center"; ctx.textBaseline="middle"
      ctx.fillText(txt, mx, my)
    }
    ctx.restore()
  }

  function drawNode(ctx, node, s, zoom) {
    const cor   = corCategoria(node.tipo)
    const r     = node.alvo ? ALVO_R : NODE_R
    const isSel = s.sel?.tipo === "node" && s.sel.data.id === node.id
    const isLnk = s.linking?.sourceId === node.id
    if (isSel || isLnk) {
      ctx.beginPath(); ctx.arc(node.x, node.y, r+7, 0, Math.PI*2)
      ctx.fillStyle = isLnk ? "rgba(74,222,128,0.18)" : "rgba(232,160,32,0.18)"; ctx.fill()
    }
    ctx.save()
    ctx.shadowColor = cor+"55"; ctx.shadowBlur = node.alvo ? 18 : 10
    ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, Math.PI*2)
    ctx.fillStyle = "#0B1120"; ctx.fill()
    ctx.strokeStyle = isSel ? C.gold : (isLnk ? C.green : cor)
    ctx.lineWidth = isSel ? 3 : (node.alvo ? 2.5 : 2); ctx.stroke()
    ctx.restore()
    ctx.beginPath(); ctx.arc(node.x, node.y, r-2, 0, Math.PI*2)
    ctx.fillStyle = cor+"1a"; ctx.fill()
    const url = node.detalhes?.foto_url
    const img = url ? s.imgCache?.get(url) : null
    if (img && img !== "loading" && img !== "error") {
      ctx.save()
      ctx.beginPath(); ctx.arc(node.x, node.y, r-2.5, 0, Math.PI*2); ctx.clip()
      ctx.drawImage(img, node.x-r, node.y-r, r*2, r*2)
      ctx.restore()
      ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, Math.PI*2)
      ctx.strokeStyle = isSel ? C.gold : cor; ctx.lineWidth = isSel?3:2; ctx.stroke()
    } else {
      const icon = node.icone || iconePadrao(node.tipo)
      ctx.font = `${r*0.9}px ${EMOJI_FONT}`
      ctx.textAlign = "center"; ctx.textBaseline = "middle"
      ctx.fillText(icon, node.x, node.y+1)
    }
    const label = (node.rotulo||"").slice(0,20)
    const fs = node.alvo ? 12 : 11
    ctx.font = `${node.alvo?700:500} ${fs}px ${SANS}`
    ctx.textAlign = "center"; ctx.textBaseline = "top"
    const tw = ctx.measureText(label).width
    ctx.fillStyle = "rgba(11,17,32,0.82)"
    ctx.fillRect(node.x-tw/2-3, node.y+r+3, tw+6, fs+3)
    ctx.fillStyle = node.alvo ? C.gold : C.text
    ctx.fillText(label, node.x, node.y+r+4)
    if (s.editMode) {
      const h = handlePos(node)
      ctx.beginPath(); ctx.arc(h.x, h.y, CONNECT_R, 0, Math.PI*2)
      ctx.fillStyle   = "rgba(74,222,128,0.85)"
      ctx.strokeStyle = "#0B1120"; ctx.lineWidth = 1.5
      ctx.fill(); ctx.stroke()
      ctx.fillStyle = "#0B1120"
      ctx.font = `bold ${CONNECT_R*1.1}px ${MONO}`
      ctx.textAlign = "center"; ctx.textBaseline = "middle"
      ctx.fillText("+", h.x, h.y+0.5)
    }
  }

  function toWorld(ex, ey) {
    const canvas = canvasRef.current
    const rect   = canvas.getBoundingClientRect()
    const { pan, zoom } = stateRef.current
    return { x:(ex-rect.left-pan.x)/zoom, y:(ey-rect.top-pan.y)/zoom }
  }

  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    const s = stateRef.current
    const { x, y } = toWorld(e.clientX, e.clientY)
    if (s.editMode) {
      for (const node of [...s.nodes].reverse()) {
        if (hitHandle(node, x, y)) {
          s.connectDrag = { srcId:node.id, cx:x, cy:y }
          e.preventDefault(); return
        }
      }
    }
    for (const node of [...s.nodes].reverse()) {
      if (hitNode(node, x, y)) {
        s.drag = { nodeId:node.id, ox:x-node.x, oy:y-node.y }
        e.preventDefault(); return
      }
    }
    for (const link of s.links) {
      if (hitLink(link, x, y)) { onLinkClick(link); return }
    }
    s.panDrag = { sx:e.clientX, sy:e.clientY, px:s.pan.x, py:s.pan.y }
  }, [onLinkClick])

  const onMouseMove = useCallback((e) => {
    const s = stateRef.current
    const { x, y } = toWorld(e.clientX, e.clientY)
    if (s.connectDrag) { s.connectDrag.cx=x; s.connectDrag.cy=y; schedDraw(); return }
    if (s.drag) {
      const node = s.nodes.find(n => n.id === s.drag.nodeId)
      if (node) {
        node.x = x-s.drag.ox; node.y = y-s.drag.oy
        s.links.forEach(l => {
          if (l._src?.id===node.id) l._src=node
          if (l._dst?.id===node.id) l._dst=node
        })
      }
      schedDraw(); return
    }
    if (s.panDrag) {
      s.pan.x = s.panDrag.px+(e.clientX-s.panDrag.sx)
      s.pan.y = s.panDrag.py+(e.clientY-s.panDrag.sy)
      schedDraw()
    }
  }, [])

  const onMouseUp = useCallback((e) => {
    const s = stateRef.current
    const { x, y } = toWorld(e.clientX, e.clientY)
    if (s.connectDrag) {
      const srcId = s.connectDrag.srcId; s.connectDrag = null
      for (const node of [...s.nodes].reverse()) {
        if (node.id !== srcId && hitNode(node, x, y)) {
          onConnectRequest(srcId, node.id); schedDraw(); return
        }
      }
      schedDraw(); return
    }
    if (s.drag) {
      const node = s.nodes.find(n => n.id === s.drag.nodeId)
      s.drag = null
      if (node) onNodeDragEnd(node)
      schedDraw(); return
    }
    s.panDrag = null
    for (const node of [...s.nodes].reverse()) {
      if (hitNode(node, x, y)) { onNodeClick(node); schedDraw(); return }
    }
    onBgClick(); schedDraw()
  }, [onNodeClick, onBgClick, onNodeDragEnd, onConnectRequest])

  const onWheel = useCallback((e) => {
    e.preventDefault()
    const s = stateRef.current
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX-rect.left, my = e.clientY-rect.top
    const delta = e.deltaY > 0 ? 0.88 : 1.14
    const newZ  = Math.min(4, Math.max(0.15, s.zoom*delta))
    s.pan.x = mx-(mx-s.pan.x)*(newZ/s.zoom)
    s.pan.y = my-(my-s.pan.y)*(newZ/s.zoom)
    s.zoom  = newZ; schedDraw()
  }, [])

  const fitAll = useCallback(() => {
    const s = stateRef.current
    const canvas = canvasRef.current
    if (!canvas || !s.nodes.length) return
    const xs=s.nodes.map(n=>n.x), ys=s.nodes.map(n=>n.y)
    const minX=Math.min(...xs), maxX=Math.max(...xs)
    const minY=Math.min(...ys), maxY=Math.max(...ys)
    const pad=80
    const scaleX=(canvas.width-pad*2)/((maxX-minX)||1)
    const scaleY=(canvas.height-pad*2)/((maxY-minY)||1)
    s.zoom  = Math.min(2, Math.min(scaleX,scaleY))
    s.pan.x = canvas.width/2-((minX+maxX)/2)*s.zoom
    s.pan.y = canvas.height/2-((minY+maxY)/2)*s.zoom
    schedDraw()
  }, [])

  useImperativeHandle(ref, () => ({ fitAll }))

  useEffect(() => {
    const onKey = (e) => {
      if (e.key==="Escape") {
        const s = stateRef.current
        if (s.connectDrag) { s.connectDrag=null; schedDraw() }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      schedDraw()
    })
    ro.observe(canvas)
    canvas.width  = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
    schedDraw()
    return () => ro.disconnect()
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ width:"100%", height:"100%", display:"block", cursor:"default" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onWheel={onWheel}
      onDoubleClick={fitAll}
    />
  )
})

export default GrafoCanvas
