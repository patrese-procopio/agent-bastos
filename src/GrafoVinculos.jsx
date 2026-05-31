import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import GrafoCanvas from "./GrafoCanvas"
import api from "./api"
import { GALERIA, CATEGORIAS, corCategoria, labelCategoria, iconePadrao } from "./iconesGrafo"

const C = {
  bg:"#0B1120", surface:"#111827", surfaceUp:"#1A2236", surfaceMid:"#162032",
  border:"rgba(255,255,255,0.07)", borderUp:"rgba(255,255,255,0.13)",
  gold:"#E8A020", goldSoft:"rgba(232,160,32,0.12)", goldBorder:"rgba(232,160,32,0.3)",
  text:"#F1F5F9", textMid:"#94A3B8", textDim:"rgba(255,255,255,0.4)",
  red:"#EF4444", green:"#4ADE80", blue:"#60A5FA",
}
const MONO       = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
const SANS       = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'

const CSS = `
  .gv-item:hover  { background: rgba(232,160,32,0.08) !important; }
  .gv-btn         { transition: all .12s; }
  .gv-btn:hover   { filter: brightness(1.15); transform: translateY(-1px); }
  .gv-ico:hover   { background: rgba(232,160,32,0.14) !important; transform: scale(1.08); }
  @keyframes gv-pulse { 0%,100%{opacity:.4} 50%{opacity:1} }
  .gv-link-mode   { animation: gv-pulse 1.2s ease-in-out infinite; }
  ::-webkit-scrollbar { width:6px; height:6px; }
  ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.18); border-radius:4px; }
`

const imgCache = new Map()

export default function GrafoVinculos() {
  const [meta,       setMeta]      = useState({ rotulos_vinculo:[] })
  const [alvos,      setAlvos]     = useState([])
  const [alvoId,     setAlvoId]    = useState(null)
  const [busca,      setBusca]     = useState("")
  const [hops,       setHops]      = useState(1)
  const [graph,      setGraph]     = useState({ nodes:[], links:[] })
  const [sel,        setSel]       = useState(null)
  const [edit,       setEdit]      = useState(false)
  const [linking,    setLinking]   = useState(null)
  const [modal,      setModal]     = useState(null)
  const [toast,      setToast]     = useState(null)
  const [carregando, setCarreg]    = useState(false)
  const [busy,       setBusy]      = useState(false)

  const canvasRef = useRef()
  const wrapRef   = useRef()

  useEffect(() => {
    const s = document.createElement("style"); s.textContent = CSS
    document.head.appendChild(s); return () => document.head.removeChild(s)
  }, [])

  const aviso = (msg, cor=C.gold) => { setToast({msg,cor}); setTimeout(()=>setToast(null),2600) }

  const carregarAlvos = useCallback(async () => {
    try {
      const r = await api.get("/grafo/alvos"); const d = await r.json()
      setAlvos(d.alvos||[]); return d.alvos||[]
    } catch { aviso("Backend offline.", C.red); return [] }
  }, [])

  useEffect(() => {
    (async () => {
      try { const r = await api.get("/grafo/meta"); setMeta(await r.json()) } catch {}
      await carregarAlvos()
      const foco = localStorage.getItem("grafo_foco_alvo")
      if (foco) {
        localStorage.removeItem("grafo_foco_alvo")
        setHops(2); setAlvoId(foco); carregarRede(foco, 2)
      }
    })()
  }, [carregarAlvos])

  const carregarRede = useCallback(async (id, h=hops) => {
    if (!id) return
    setCarreg(true)
    try {
      const r = await api.get(`/grafo/rede-alvo/${id}?hops=${h}`)
      const d = await r.json()
      const nodes = (d.nodes||[]).map(n => {
        const o = {...n}
        if (n.pos_x != null && n.pos_y != null) { o.x=n.pos_x; o.y=n.pos_y }
        return o
      })
      const links = (d.edges||[]).map(e => ({...e}))
      preloadFotos(nodes)
      setGraph({nodes, links}); setSel(null)
    } catch { aviso("Falha ao carregar a rede.", C.red) }
    finally { setCarreg(false) }
  }, [hops])

  function preloadFotos(nodes) {
    const token = localStorage.getItem("ab_access_token")
    nodes.forEach(n => {
      const url = n.detalhes?.foto_url
      if (!url || imgCache.has(url)) return
      imgCache.set(url,"loading")
      const img = new Image()
      img.onload  = () => { imgCache.set(url,img) }
      img.onerror = () => { imgCache.set(url,"error") }
      img.src = `/api-proxy${url.replace(/^\/api/,"")}${token?`?token=${token}`:""}`
    })
  }

  function focar(id) { setAlvoId(id); carregarRede(id) }

  async function sincronizar() {
    setBusy(true)
    try {
      const r = await api.post("/grafo/sincronizar"); const d = await r.json()
      if (d.ok) {
        aviso(`Sincronizado: ${d.pessoas} pessoas no grafo.`, C.green)
        const a = await carregarAlvos()
        if (alvoId) carregarRede(alvoId); else if (a[0]) focar(a[0].id)
      } else aviso("Sincronização falhou.", C.red)
    } catch { aviso("Erro ao sincronizar.", C.red) } finally { setBusy(false) }
  }

  async function varrerCitacoes() {
    if (!alvoId) return
    setBusy(true)
    try {
      const r = await api.post(`/grafo/alvo/${alvoId}/varrer-citacoes`)
      const d = await r.json()
      if (d.ok) {
        aviso(d.criados>0?`${d.criados} documento(s) citando o alvo.`:"Nenhuma nova citação.", d.criados>0?C.green:C.textMid)
        carregarRede(alvoId)
      } else aviso("Varredura indisponível.", C.red)
    } catch { aviso("Erro na varredura.", C.red) } finally { setBusy(false) }
  }

  async function criarNo(payload, conectar) {
    const r = await api.post("/grafo/no", payload)
    if (!r.ok) { aviso("Falha ao criar nó.", C.red); return null }
    const no = await r.json()
    const novo = {...no}
    const ref = graph.nodes.find(n=>n.id===(conectar?.origem_id)) || graph.nodes.find(n=>n.id===alvoId)
    if (ref?.x != null) { novo.x=ref.x+60; novo.y=ref.y+40 }
    setGraph(g => ({...g, nodes:[...g.nodes, novo]}))
    if (conectar?.origem_id) await criarAresta({origem_id:conectar.origem_id, destino_id:no.id, rotulo:conectar.rotulo}, true)
    preloadFotos([novo]); aviso("Nó criado.", C.green)
    return no
  }

  async function criarAresta(payload, silencioso) {
    const r = await api.post("/grafo/aresta", payload)
    if (!r.ok) { if (!silencioso) aviso("Falha ao criar vínculo.", C.red); return null }
    const a = await r.json()
    setGraph(g => ({...g, links:[...g.links, {...a}]}))
    if (!silencioso) aviso("Vínculo criado.", C.green)
    return a
  }

  async function atualizarNo(id, payload) {
    const r = await api.put(`/grafo/no/${id}`, payload)
    if (!r.ok) { aviso("Falha ao salvar.", C.red); return }
    const no = await r.json()
    setGraph(g => ({...g, nodes:g.nodes.map(n=>n.id===id?{...n,...no,x:n.x,y:n.y}:n)}))
    setSel(s=>s?.tipo==="node"&&s.data.id===id?{tipo:"node",data:{...s.data,...no}}:s)
    preloadFotos([no]); aviso("Nó atualizado.", C.green)
  }

  async function atualizarAresta(id, payload) {
    const r = await api.put(`/grafo/aresta/${id}`, payload)
    if (!r.ok) { aviso("Falha ao salvar.", C.red); return }
    const a = await r.json()
    setGraph(g => ({...g, links:g.links.map(l=>l.id===id?{...l,...a}:l)}))
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
      const token = localStorage.getItem("ab_access_token")
      const img = new Image()
      img.onload = () => imgCache.set(url, img)
      img.onerror = () => imgCache.set(url, "error")
      img.src = `/api-proxy${url.replace(/^\/api/,"")}${token?`?token=${token}`:""}&_=${Date.now()}`
    }
    setGraph(g => ({...g, nodes:g.nodes.map(n=>n.id===no_id?{...n,...no,x:n.x,y:n.y}:n)}))
    setSel(s=>s?.tipo==="node"&&s.data.id===no_id?{tipo:"node",data:{...s.data,...no}}:s)
    aviso("Foto anexada à entidade.", C.green)
  }

  async function removerFoto(no_id) {
    const r = await api.delete(`/grafo/no/${no_id}/foto`)
    if (!r.ok) { aviso("Falha ao remover foto.", C.red); return }
    const no = await r.json()
    setGraph(g => ({...g, nodes:g.nodes.map(n=>n.id===no_id?{...n,...no,x:n.x,y:n.y}:n)}))
    setSel(s=>s?.tipo==="node"&&s.data.id===no_id?{tipo:"node",data:{...s.data,...no}}:s)
    aviso("Foto removida.", C.textMid)
  }

  async function excluirNo(id) {
    if (!window.confirm("Excluir este nó e seus vínculos?")) return
    const r = await api.delete(`/grafo/no/${id}`)
    if (!r.ok) { aviso("Falha ao excluir.", C.red); return }
    setGraph(g => ({
      nodes: g.nodes.filter(n=>n.id!==id),
      links: g.links.filter(l=>(l.source?.id||l.source)!==id&&(l.target?.id||l.target)!==id),
    }))
    setSel(null); aviso("Nó removido.", C.textMid)
  }

  async function excluirAresta(id) {
    const r = await api.delete(`/grafo/aresta/${id}`)
    if (!r.ok) { aviso("Falha ao excluir.", C.red); return }
    setGraph(g => ({...g, links:g.links.filter(l=>l.id!==id)}))
    setSel(null); aviso("Vínculo removido.", C.textMid)
  }

  function onNodeClick(node) {
    if (linking) {
      if (linking.sourceId===node.id) { setLinking(null); return }
      setModal({tipo:"novoLink", origem_id:linking.sourceId, destino_id:node.id})
      setLinking(null); return
    }
    setSel({tipo:"node", data:node})
  }
  function onConnectRequest(srcId, dstId) {
    setModal({tipo:"novoLink", origem_id:srcId, destino_id:dstId})
  }
  function onLinkClick(link) { if (!linking) setSel({tipo:"link", data:link}) }
  function onBgClick() { if (linking) setLinking(null); else setSel(null) }
  function onNodeDragEnd(node) {
    api.put(`/grafo/no/${node.id}`, {pos_x:node.x, pos_y:node.y}).catch(()=>{})
  }

  const alvosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return alvos
    return alvos.filter(a=>`${a.rotulo} ${a.nome||""} ${a.vulgo||""} ${a.faccao||""}`.toLowerCase().includes(q))
  }, [alvos, busca])

  return (
    <div style={{display:"flex",flex:1,minWidth:0,height:"100%",overflow:"hidden",background:C.bg,fontFamily:SANS,color:C.text}}>

      {/* ASIDE */}
      <aside style={{width:280,flexShrink:0,background:C.surface,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",height:"100%"}}>
        <div style={{padding:"16px 16px 12px",borderBottom:`1px solid ${C.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{width:3,height:16,background:C.gold,borderRadius:2,boxShadow:`0 0 8px ${C.gold}88`}}/>
            <span style={{fontSize:14.3,fontWeight:800,color:C.gold,letterSpacing:"0.1em",textTransform:"uppercase"}}>Análise de Vínculo</span>
          </div>
          <div style={{fontSize:11.7,color:C.textMid,fontFamily:MONO,marginTop:6}}>{alvos.length} alvo(s) no grafo</div>
        </div>
        <div style={{padding:"10px 14px"}}>
          <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar alvo, vulgo, facção…"
            style={{width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,borderRadius:7,padding:"8px 12px",fontSize:13,color:C.text,outline:"none",fontFamily:MONO,caretColor:C.gold}}/>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"0 10px 10px"}}>
          {alvosFiltrados.length===0 && (
            <div style={{padding:18,textAlign:"center",color:C.textMid,fontSize:13}}>
              {alvos.length===0?"Grafo vazio. Clique em Sincronizar para semear das lideranças.":"Nenhum alvo encontrado."}
            </div>
          )}
          {alvosFiltrados.map(a => {
            const ativo = a.id===alvoId
            return (
              <button key={a.id} className="gv-item" onClick={()=>focar(a.id)}
                style={{width:"100%",textAlign:"left",display:"flex",alignItems:"center",gap:10,padding:"9px 10px",marginBottom:4,borderRadius:8,cursor:"pointer",background:ativo?"rgba(232,160,32,0.14)":"transparent",border:`1px solid ${ativo?C.goldBorder:"transparent"}`}}>
                <span style={{fontSize:18,fontFamily:EMOJI_FONT,lineHeight:1,flexShrink:0}}>{a.icone||"👤"}</span>
                <span style={{flex:1,minWidth:0}}>
                  <span style={{display:"block",fontSize:13.5,fontWeight:700,color:ativo?C.gold:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.rotulo||a.nome||"—"}</span>
                  <span style={{display:"block",fontSize:11,color:C.textMid,fontFamily:MONO,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.faccao||"—"} · {a.vinculos} vínc.</span>
                </span>
                {a.origem!=="manual"&&<span style={{fontSize:9,color:C.textDim,fontFamily:MONO}}>auto</span>}
              </button>
            )
          })}
        </div>
        <div style={{padding:"12px 14px",borderTop:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:8}}>
          <button className="gv-btn" onClick={sincronizar} disabled={busy} style={btn(C.blue,busy)}>↻ Sincronizar lideranças</button>
          <button className="gv-btn" onClick={()=>setModal({tipo:"novoAlvo"})} style={btn(C.gold)}>+ Novo alvo (manual)</button>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",height:"100%",background:C.bg}}>
        <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 18px",borderBottom:`1px solid ${C.border}`,background:C.surface,flexShrink:0,gap:12,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:16.9,fontWeight:700}}>{alvoId?(alvos.find(a=>a.id===alvoId)?.rotulo||"Rede"):"Motor de Vínculos"}</div>
            <div style={{fontSize:11.7,color:C.textMid,fontFamily:MONO,marginTop:2}}>
              {alvoId?`${graph.nodes.length} nós · ${graph.links.length} vínculos · ${hops} salto(s)`:"Selecione um alvo para abrir a teia"}
            </div>
          </div>
          {alvoId && (
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <div style={{display:"flex",gap:2,background:"rgba(255,255,255,0.05)",borderRadius:7,padding:2}}>
                {[1,2,3].map(h=>(
                  <button key={h} onClick={()=>{setHops(h);carregarRede(alvoId,h)}}
                    style={{width:30,padding:"5px 0",borderRadius:5,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:MONO,background:hops===h?C.goldSoft:"transparent",color:hops===h?C.gold:C.textMid}}>{h}</button>
                ))}
              </div>
              <button className="gv-btn" onClick={()=>canvasRef.current?.fitAll()} style={btn(C.textMid)}>⊡ Ajustar</button>
              <button className="gv-btn" onClick={varrerCitacoes} disabled={busy} style={btn(C.blue,busy)}>🔍 Varrer citações</button>
              <button className="gv-btn" onClick={()=>setEdit(e=>!e)} style={btn(edit?C.green:C.gold)}>{edit?"✓ Editando":"✎ Editar"}</button>
            </div>
          )}
        </header>

        {alvoId && edit && (
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 18px",background:C.surfaceMid,borderBottom:`1px solid ${C.border}`,flexWrap:"wrap"}}>
            <button className="gv-btn" onClick={()=>setModal({tipo:"novoNo"})} style={btn(C.gold)}>+ Nó</button>
            <button className="gv-btn"
              onClick={()=>{ if(sel?.tipo==="node") setLinking({sourceId:sel.data.id}); else aviso("Selecione um nó de origem primeiro.", C.textMid) }}
              style={btn(linking?C.green:C.textMid)}>{linking?"Clique no destino…":"+ Vínculo a partir do selecionado"}</button>
            {linking&&<span className="gv-link-mode" style={{fontSize:12,color:C.green,fontFamily:MONO}}>modo conexão — clique no destino ou arraste a alça verde (ESC cancela)</span>}
            <span style={{flex:1}}/>
            <span style={{fontSize:11,color:C.textDim,fontFamily:MONO}}>arraste nós · alça verde = novo vínculo</span>
          </div>
        )}

        <div ref={wrapRef} style={{flex:1,position:"relative",overflow:"hidden"}}>
          {!alvoId ? (
            <Vazio onSync={sincronizar} busy={busy} temAlvos={alvos.length>0}/>
          ) : (
            <>
              <GrafoCanvas
                ref={canvasRef}
                nodes={graph.nodes}
                links={graph.links}
                sel={sel}
                linking={linking}
                imgCache={imgCache}
                editMode={edit}
                onNodeClick={onNodeClick}
                onLinkClick={onLinkClick}
                onBgClick={onBgClick}
                onNodeDragEnd={onNodeDragEnd}
                onConnectRequest={onConnectRequest}
              />
              <div style={{position:"absolute",left:12,bottom:12,background:"rgba(17,24,39,0.82)",border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",backdropFilter:"blur(6px)",maxWidth:220}}>
                <div style={{fontSize:10,fontWeight:800,color:C.textMid,letterSpacing:"0.1em",marginBottom:6,fontFamily:MONO}}>LEGENDA</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 8px"}}>
                  {CATEGORIAS.map(c=>(
                    <div key={c.id} style={{display:"flex",alignItems:"center",gap:5,fontSize:10.5,color:C.textMid}}>
                      <span style={{width:8,height:8,borderRadius:"50%",background:c.cor,flexShrink:0}}/>{c.label}
                    </div>
                  ))}
                </div>
              </div>
              {carregando&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(11,17,32,0.5)",color:C.gold,fontFamily:MONO,fontSize:13}}>carregando rede…</div>}
            </>
          )}
        </div>
      </main>

      {sel&&<PainelDetalhe sel={sel} edit={edit}
        onEdit={()=>setModal({tipo:sel.tipo==="node"?"editNo":"editLink",data:sel.data})}
        onConnect={()=>setLinking({sourceId:sel.data.id})}
        onDelete={()=>sel.tipo==="node"?excluirNo(sel.data.id):excluirAresta(sel.data.id)}
        onFoto={file=>enviarFoto(sel.data.id,file)}
        onRemoveFoto={()=>removerFoto(sel.data.id)}
        onClose={()=>setSel(null)}/>}

      {modal?.tipo==="novoNo"&&(
        <ModalNo titulo="Novo nó" rotulosVinculo={meta.rotulos_vinculo} podeConectar={!!alvoId}
          alvoLabel={alvos.find(a=>a.id===alvoId)?.rotulo}
          onClose={()=>setModal(null)}
          onSalvar={async(dados,conectar)=>{setModal(null);await criarNo(dados,conectar?{origem_id:alvoId,rotulo:conectar}:null)}}/>
      )}
      {modal?.tipo==="editNo"&&(
        <ModalNo titulo="Editar nó" inicial={modal.data} onClose={()=>setModal(null)}
          onSalvar={async dados=>{setModal(null);await atualizarNo(modal.data.id,dados)}}/>
      )}
      {modal?.tipo==="novoAlvo"&&(
        <ModalNo titulo="Novo alvo" forcarTipo="pessoa" onClose={()=>setModal(null)}
          onSalvar={async dados=>{setModal(null);const no=await criarNo(dados,null);await carregarAlvos();if(no)focar(no.id)}}/>
      )}
      {modal?.tipo==="novoLink"&&(
        <ModalLink rotulos={meta.rotulos_vinculo}
          origem={graph.nodes.find(n=>n.id===modal.origem_id)}
          destino={graph.nodes.find(n=>n.id===modal.destino_id)}
          onClose={()=>setModal(null)}
          onSalvar={async(rotulo,direcionada)=>{setModal(null);await criarAresta({origem_id:modal.origem_id,destino_id:modal.destino_id,rotulo,direcionada})}}/>
      )}
      {modal?.tipo==="editLink"&&(
        <ModalLink rotulos={meta.rotulos_vinculo} inicial={modal.data}
          onClose={()=>setModal(null)}
          onSalvar={async(rotulo,direcionada)=>{setModal(null);await atualizarAresta(modal.data.id,{rotulo,direcionada})}}/>
      )}

      {toast&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:C.surfaceUp,border:`1px solid ${toast.cor}55`,color:toast.cor,padding:"10px 18px",borderRadius:8,fontSize:13,fontWeight:600,fontFamily:MONO,zIndex:2000,boxShadow:"0 8px 30px rgba(0,0,0,0.5)"}}>{toast.msg}</div>}
    </div>
  )
}

function btn(cor,off) {
  return {padding:"7px 12px",borderRadius:7,border:`1px solid ${cor}44`,background:`${cor}1a`,color:cor,fontSize:12.5,fontWeight:700,cursor:off?"not-allowed":"pointer",fontFamily:MONO,opacity:off?0.5:1,whiteSpace:"nowrap"}
}

function Vazio({onSync,busy,temAlvos}) {
  return (
    <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,textAlign:"center",padding:24}}>
      <div style={{fontSize:52,fontFamily:'"Segoe UI Emoji","Apple Color Emoji",sans-serif',opacity:0.85}}>🕸️</div>
      <div style={{fontSize:18,fontWeight:700,color:C.text}}>Motor de Vínculos</div>
      <div style={{fontSize:13.5,color:C.textMid,maxWidth:440,lineHeight:1.6}}>
        {temAlvos?"Selecione um alvo na lista à esquerda para abrir a teia de vínculos.":"O grafo está vazio. Sincronize com as lideranças para semear automaticamente."}
      </div>
      {!temAlvos&&<button className="gv-btn" onClick={onSync} disabled={busy} style={{...btn(C.gold,busy),padding:"10px 20px",fontSize:13.5}}>↻ Sincronizar lideranças</button>}
    </div>
  )
}

function PainelDetalhe({sel,edit,onEdit,onConnect,onDelete,onClose,onFoto,onRemoveFoto}) {
  const isNode = sel.tipo==="node"
  const d = sel.data
  const cor = isNode?corCategoria(d.tipo):C.gold
  const det = isNode?(d.detalhes||{}):(d.propriedades||{})
  const movs = isNode?det.movimentacoes:null
  const ocultar = new Set(["movimentacoes","foto_url","foto_lider_id","foto"])
  const token = localStorage.getItem("ab_access_token")||""
  const fotoSrc = det.foto_url?`/api-proxy${det.foto_url.replace(/^\/api/,"")}?token=${token}`:null
  const miniBtn = c=>({padding:"6px 12px",borderRadius:6,border:`1px solid ${c}55`,background:`${c}1a`,color:c,fontSize:11.5,fontWeight:700,cursor:"pointer",fontFamily:MONO})
  return (
    <aside style={{width:320,flexShrink:0,background:C.surface,borderLeft:`1px solid ${C.border}`,display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"flex-start",gap:10}}>
        <span style={{fontSize:26,fontFamily:'"Segoe UI Emoji","Apple Color Emoji",sans-serif',lineHeight:1}}>{isNode?(d.icone||iconePadrao(d.tipo)):"🔗"}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:10,fontWeight:800,color:cor,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:MONO}}>
            {isNode?labelCategoria(d.tipo):"Vínculo"}{isNode&&d.alvo?" · ALVO":""}
          </div>
          <div style={{fontSize:16,fontWeight:700,color:C.text,marginTop:2,wordBreak:"break-word"}}>
            {isNode?d.rotulo:(d.rotulo||"").replace(/_/g," ")}
          </div>
        </div>
        <button onClick={onClose} style={{width:26,height:26,borderRadius:"50%",border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.05)",color:C.textMid,cursor:"pointer",flexShrink:0}}>×</button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"14px 16px",display:"flex",flexDirection:"column",gap:14}}>
        {isNode&&(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
            {fotoSrc
              ?<img src={fotoSrc} alt="" style={{width:104,height:128,objectFit:"cover",borderRadius:8,border:`2px solid ${cor}`}}/>
              :<div style={{width:104,height:128,borderRadius:8,border:`1px dashed ${C.borderUp}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:40,fontFamily:'"Segoe UI Emoji",sans-serif',color:C.textMid,background:"rgba(255,255,255,0.02)"}}>
                {d.icone||iconePadrao(d.tipo)}
              </div>}
            <div style={{display:"flex",gap:6}}>
              <label style={{...miniBtn(C.gold),display:"inline-flex",alignItems:"center"}}>
                {fotoSrc?"Trocar foto":"Anexar foto"}
                <input type="file" accept="image/*" style={{display:"none"}}
                  onChange={e=>{const f=e.target.files?.[0];if(f)onFoto?.(f);e.target.value=""}}/>
              </label>
              {fotoSrc&&<button onClick={onRemoveFoto} style={miniBtn(C.textMid)}>Remover</button>}
            </div>
          </div>
        )}
        {Object.entries(det).filter(([k,v])=>!ocultar.has(k)&&v!=null&&v!=="").length>0&&(
          <div style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px"}}>
            <div style={{fontSize:10,fontWeight:800,color:C.textMid,letterSpacing:"0.1em",marginBottom:8,fontFamily:MONO}}>METADADOS</div>
            {Object.entries(det).filter(([k,v])=>!ocultar.has(k)&&v!=null&&v!=="").map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",gap:10,padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                <span style={{fontSize:11,color:C.textDim,textTransform:"uppercase",fontFamily:MONO,flexShrink:0}}>{k.replace(/_/g," ")}</span>
                <span style={{fontSize:12,color:C.text,textAlign:"right",wordBreak:"break-word"}}>{String(v)}</span>
              </div>
            ))}
          </div>
        )}
        {movs&&movs.length>0&&(
          <div>
            <div style={{fontSize:10,fontWeight:800,color:C.gold,letterSpacing:"0.1em",marginBottom:8,fontFamily:MONO}}>LINHA DO TEMPO ({movs.length})</div>
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              {movs.map((m,i)=>(
                <div key={i} style={{display:"flex",gap:10,paddingBottom:12,position:"relative"}}>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0}}>
                    <span style={{width:9,height:9,borderRadius:"50%",background:i===0?C.gold:C.textMid,marginTop:3}}/>
                    {i<movs.length-1&&<span style={{flex:1,width:2,background:"rgba(255,255,255,0.1)"}}/>}
                  </div>
                  <div style={{flex:1,paddingBottom:2}}>
                    <div style={{fontSize:11.5,fontWeight:700,color:i===0?C.gold:C.text,fontFamily:MONO}}>{m.competencia||"—"}{i===0?" · atual":""}</div>
                    <div style={{fontSize:12.5,color:C.text,marginTop:2}}>{m.unidade} · {m.pavilhao}</div>
                    <div style={{fontSize:11.5,color:C.textMid}}>{[m.cargo,m.faccao,m.cela].filter(Boolean).join(" · ")}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {edit&&(
        <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,display:"flex",flexWrap:"wrap",gap:8}}>
          <button className="gv-btn" onClick={onEdit} style={{...btn(C.gold),flex:1}}>✎ Editar</button>
          {isNode&&<button className="gv-btn" onClick={onConnect} style={{...btn(C.green),flex:1}}>+ Vínculo</button>}
          <button className="gv-btn" onClick={onDelete} style={{...btn(C.red),flex:1}}>🗑 Excluir</button>
        </div>
      )}
    </aside>
  )
}

function ModalNo({titulo,inicial,forcarTipo,podeConectar,alvoLabel,rotulosVinculo=[],onClose,onSalvar}) {
  const [tipo,    setTipo]    = useState(inicial?.tipo||forcarTipo||"generico")
  const [icone,   setIcone]   = useState(inicial?.icone||iconePadrao(forcarTipo||"generico"))
  const [rotulo,  setRotulo]  = useState(inicial?.rotulo||"")
  const [obs,     setObs]     = useState(inicial?.detalhes?.observacao||"")
  const [data,    setData]    = useState(inicial?.detalhes?.data||"")
  const [buscaIco,setBuscaIco]= useState("")
  const [conectar,setConectar]= useState(false)
  const [rotVinc, setRotVinc] = useState("VINCULADO_A")
  const grupos = useMemo(()=>{
    const q=buscaIco.trim().toLowerCase()
    if(!q) return GALERIA
    return GALERIA.map(g=>({...g,itens:g.itens.filter(it=>it.n.toLowerCase().includes(q))})).filter(g=>g.itens.length)
  },[buscaIco])
  function salvar() {
    const detalhes={...(inicial?.detalhes||{})}
    detalhes.observacao=obs||undefined; detalhes.data=data||undefined
    onSalvar({tipo,icone,rotulo:rotulo||"Sem rótulo",detalhes},conectar?rotVinc:false)
  }
  return (
    <Overlay onClose={onClose}>
      <div style={{width:"min(720px,94vw)",maxHeight:"88vh",background:C.surface,borderRadius:14,border:`1px solid ${C.borderUp}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:24,fontFamily:'"Segoe UI Emoji",sans-serif'}}>{icone}</span>
            <span style={{fontSize:16,fontWeight:700}}>{titulo}</span>
          </div>
          <button onClick={onClose} style={{width:28,height:28,borderRadius:"50%",border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.05)",color:C.textMid,cursor:"pointer"}}>×</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:20,display:"flex",flexDirection:"column",gap:16}}>
          <div><Lbl>Rótulo</Lbl><input value={rotulo} onChange={e=>setRotulo(e.target.value)} autoFocus placeholder="Ex.: Tráfico internacional…" style={inp()}/></div>
          {!forcarTipo&&(
            <div>
              <Lbl>Categoria</Lbl>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {CATEGORIAS.map(c=>(
                  <button key={c.id} onClick={()=>{setTipo(c.id);if(!inicial&&iconePadrao(tipo)===icone)setIcone(iconePadrao(c.id))}}
                    style={{padding:"5px 10px",borderRadius:20,cursor:"pointer",fontSize:11.5,fontWeight:700,fontFamily:MONO,border:`1px solid ${tipo===c.id?c.cor:C.border}`,background:tipo===c.id?`${c.cor}22`:"transparent",color:tipo===c.id?c.cor:C.textMid,display:"flex",alignItems:"center",gap:5}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:c.cor}}/>{c.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
              <Lbl noMargin>Ícone</Lbl>
              <input value={buscaIco} onChange={e=>setBuscaIco(e.target.value)} placeholder="buscar ícone…" style={{...inp(),width:180,padding:"6px 10px",fontSize:12}}/>
            </div>
            <div style={{background:"rgba(255,255,255,0.02)",border:`1px solid ${C.border}`,borderRadius:10,padding:12,maxHeight:240,overflowY:"auto"}}>
              {grupos.map(g=>(
                <div key={g.grupo} style={{marginBottom:12}}>
                  <div style={{fontSize:10,fontWeight:800,color:corCategoria(g.tipo),letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:6,fontFamily:MONO}}>{g.grupo}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {g.itens.map(it=>(
                      <button key={it.e+it.n} className="gv-ico" title={it.n}
                        onClick={()=>{setIcone(it.e);if(!forcarTipo)setTipo(g.tipo)}}
                        style={{width:38,height:38,borderRadius:9,cursor:"pointer",fontSize:20,fontFamily:'"Segoe UI Emoji",sans-serif',display:"flex",alignItems:"center",justifyContent:"center",border:`1px solid ${icone===it.e?C.goldBorder:C.border}`,background:icone===it.e?C.goldSoft:"rgba(255,255,255,0.03)",transition:"all .1s"}}>{it.e}</button>
                    ))}
                  </div>
                </div>
              ))}
              {grupos.length===0&&<div style={{color:C.textMid,fontSize:12,padding:8}}>Nenhum ícone encontrado.</div>}
            </div>
          </div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:160}}><Lbl>Data (opcional)</Lbl><input value={data} onChange={e=>setData(e.target.value)} placeholder="dd/mm/aaaa" style={inp()}/></div>
          </div>
          <div><Lbl>Observação (opcional)</Lbl><textarea value={obs} onChange={e=>setObs(e.target.value)} rows={2} placeholder="Anotação livre…" style={{...inp(),resize:"vertical",fontFamily:SANS}}/></div>
          {podeConectar&&(
            <div style={{background:"rgba(74,222,128,0.06)",border:"1px solid rgba(74,222,128,0.25)",borderRadius:10,padding:12}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:C.text}}>
                <input type="checkbox" checked={conectar} onChange={e=>setConectar(e.target.checked)} style={{accentColor:C.green}}/>
                Ligar ao alvo <b style={{color:C.gold}}>{alvoLabel}</b>
              </label>
              {conectar&&(<div style={{marginTop:10}}><Lbl>Rótulo do vínculo</Lbl><SelectRotulo valor={rotVinc} onChange={setRotVinc} rotulos={rotulosVinculo}/></div>)}
            </div>
          )}
        </div>
        <div style={{padding:"14px 20px",borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"flex-end",gap:10}}>
          <button onClick={onClose} style={{...btn(C.textMid),padding:"9px 18px"}}>Cancelar</button>
          <button onClick={salvar} style={{...btn(C.gold),padding:"9px 22px",background:C.gold,color:"#0B1120"}}>Salvar</button>
        </div>
      </div>
    </Overlay>
  )
}

function ModalLink({inicial,origem,destino,rotulos=[],onClose,onSalvar}) {
  const [rotulo,setRotulo]=useState(inicial?.rotulo||"VINCULADO_A")
  const [dir,setDir]=useState(inicial?!!inicial.direcionada:true)
  return (
    <Overlay onClose={onClose}>
      <div style={{width:"min(440px,94vw)",background:C.surface,borderRadius:14,border:`1px solid ${C.borderUp}`,overflow:"hidden"}}>
        <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:16,fontWeight:700}}>{inicial?"Editar vínculo":"Novo vínculo"}</span>
          <button onClick={onClose} style={{width:28,height:28,borderRadius:"50%",border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.05)",color:C.textMid,cursor:"pointer"}}>×</button>
        </div>
        <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
          {origem&&destino&&(
            <div style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:C.textMid,fontFamily:MONO,flexWrap:"wrap"}}>
              <b style={{color:C.text}}>{origem.icone} {origem.rotulo}</b> {dir?"→":"—"} <b style={{color:C.text}}>{destino.icone} {destino.rotulo}</b>
            </div>
          )}
          <div><Lbl>Rótulo do vínculo</Lbl><SelectRotulo valor={rotulo} onChange={setRotulo} rotulos={rotulos}/></div>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:C.text}}>
            <input type="checkbox" checked={dir} onChange={e=>setDir(e.target.checked)} style={{accentColor:C.gold}}/> Direcionado (com seta)
          </label>
        </div>
        <div style={{padding:"14px 20px",borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"flex-end",gap:10}}>
          <button onClick={onClose} style={{...btn(C.textMid),padding:"9px 18px"}}>Cancelar</button>
          <button onClick={()=>onSalvar(rotulo||"VINCULADO_A",dir)} style={{...btn(C.gold),padding:"9px 22px",background:C.gold,color:"#0B1120"}}>Salvar</button>
        </div>
      </div>
    </Overlay>
  )
}

function SelectRotulo({valor,onChange,rotulos}) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
        {rotulos.map(r=>(
          <button key={r} onClick={()=>onChange(r)}
            style={{padding:"5px 10px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:MONO,border:`1px solid ${valor===r?C.goldBorder:C.border}`,background:valor===r?C.goldSoft:"transparent",color:valor===r?C.gold:C.textMid}}>{r.replace(/_/g," ")}</button>
        ))}
      </div>
      <input value={valor} onChange={e=>onChange(e.target.value.toUpperCase().replace(/\s+/g,"_"))} placeholder="ou digite um rótulo livre" style={inp()}/>
    </div>
  )
}

function Overlay({children,onClose}) {
  return (
    <div onClick={e=>{if(e.target===e.currentTarget)onClose()}}
      style={{position:"fixed",inset:0,zIndex:1500,background:"rgba(7,10,20,0.78)",backdropFilter:"blur(5px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      {children}
    </div>
  )
}
function Lbl({children,noMargin}) {
  return <div style={{fontSize:10.5,fontWeight:700,color:C.textDim,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:MONO,marginBottom:noMargin?0:6}}>{children}</div>
}
function inp() {
  return {width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,borderRadius:7,padding:"9px 12px",fontSize:13,color:C.text,outline:"none",fontFamily:MONO,caretColor:C.gold}
}
