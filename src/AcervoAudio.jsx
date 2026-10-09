import { useState, useEffect, useRef, useCallback } from "react"
import api from "./api"
import { getApiBase } from "./backendConfig"
import { getAccessToken } from "./authStore"
import { C, MONO, SANS, RISK_COLORS } from "./theme"
import { toast } from "./Toast"
import { confirm } from "./ConfirmModal"

/*
  ACERVO DE ÁUDIOS — Fase 1 do Extrator de Áudio
  Fila em lote, transcrição com tempo, busca em texto integral, player sincronizado,
  correção humana, cadeia de custódia (SHA-256 + trilha encadeada) e laudo.
  Backend: /api/audio/*  (módulo "transcricao")
*/

const CSS = `
  .aa-tab:hover { background: rgba(232,160,32,0.06) !important; }
  .aa-row:hover { background: rgba(232,160,32,0.06) !important; cursor:pointer; }
  .aa-seg:hover { background: rgba(255,255,255,0.04) !important; }
  .aa-btn { transition: all .12s; }
  .aa-btn:hover:not(:disabled) { filter: brightness(1.15); transform: translateY(-1px); }
  .aa-btn:disabled { opacity:.45; cursor:not-allowed; }
  .aa-scroll::-webkit-scrollbar { width:6px; height:6px; }
  .aa-scroll::-webkit-scrollbar-track { background:transparent; }
  .aa-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.14);border-radius:6px; }
  .aa-scroll::-webkit-scrollbar-thumb:hover { background:rgba(232,160,32,0.4); }
  .aa-drop:hover { border-color: rgba(232,160,32,0.55) !important; background: rgba(232,160,32,0.05) !important; }
  @keyframes aa-bar { 0%{background-position:0 0} 100%{background-position:28px 0} }
  input::placeholder, textarea::placeholder { color:#64748B !important; }
  select option { background:#111827; color:#F1F5F9; }
  mark.aa-hit { background: rgba(232,160,32,0.28); color:#F1F5F9; border-radius:3px; padding:0 2px; }
`

const STATUS = {
  pendente:   { l: "NA FILA",    c: "#FBBF24", b: "rgba(251,191,36,0.12)" },
  processando:{ l: "PROCESSANDO",c: "#60A5FA", b: "rgba(96,165,250,0.12)" },
  concluido:  { l: "CONCLUÍDO",  c: "#4ADE80", b: "rgba(74,222,128,0.12)" },
  erro:       { l: "ERRO",       c: "#F87171", b: "rgba(239,68,68,0.12)" },
  bloqueado:  { l: "BLOQUEADO",  c: "#FB923C", b: "rgba(251,146,60,0.14)" },
}
const CLASSIF = {
  teste:     { c: "#4ADE80", b: "rgba(74,222,128,0.12)" },
  sintetico: { c: "#4ADE80", b: "rgba(74,222,128,0.12)" },
  publico:   { c: "#60A5FA", b: "rgba(96,165,250,0.12)" },
  interno:   { c: "#FBBF24", b: "rgba(251,191,36,0.12)" },
  reservado: { c: "#FB923C", b: "rgba(251,146,60,0.12)" },
  sigiloso:  { c: "#F87171", b: "rgba(239,68,68,0.12)" },
  secreto:   { c: "#F87171", b: "rgba(239,68,68,0.16)" },
}
const EM_ANDAMENTO = s => s === "pendente" || s === "processando"

const badge = (color, bg, border) => ({
  fontSize: 12, fontWeight: 800, padding: "3px 9px", borderRadius: 5, letterSpacing: "0.04em",
  fontFamily: MONO, color, background: bg, border: `1px solid ${border || color + "55"}`, whiteSpace: "nowrap",
})
const StatusTag = ({ s }) => { const x = STATUS[s] || STATUS.pendente; return <span style={badge(x.c, x.b)}>{x.l}</span> }
const ClassifTag = ({ c }) => { const x = CLASSIF[c] || { c: C.textMid, b: "rgba(255,255,255,0.06)" }; return <span style={badge(x.c, x.b)}>{(c || "—").toUpperCase()}</span> }
const RiscoTag = ({ r }) => {
  if (!r) return <span style={{ color: C.textDim, fontSize: 13, fontFamily: MONO }}>—</span>
  const x = RISK_COLORS[r] || RISK_COLORS.MÉDIO
  return <span style={badge(x.color, x.bg, x.border)}>{r}</span>
}

const fmtDur = s => {
  if (s == null) return "—"
  s = Math.max(0, Math.round(s))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`
}
const fmtDT = iso => {
  if (!iso) return "—"
  const d = new Date(iso)
  return isNaN(d) ? iso : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}
const fmtBytes = n => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`

const input = {
  width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 7,
  padding: "9px 12px", color: C.text, fontSize: 15, fontFamily: SANS, outline: "none",
}
const btn = (primary, danger) => ({
  background: danger ? C.redSoft : primary ? C.gold : "rgba(255,255,255,0.05)",
  color: danger ? "#F87171" : primary ? "#0B1120" : C.text,
  border: `1px solid ${danger ? C.redBorder : primary ? C.gold : C.borderUp}`,
  borderRadius: 7, padding: "8px 14px", fontSize: 14, fontWeight: 700, fontFamily: SANS, cursor: "pointer",
})
const Campo = ({ label, children }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 12, fontWeight: 700, color: C.textDim, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: MONO, marginBottom: 6 }}>{label}</div>
    {children}
  </div>
)
const SectionBar = ({ label, right }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
    <span style={{ width: 3, height: 16, background: C.gold, borderRadius: 2, boxShadow: "0 0 8px rgba(232,160,32,0.5)" }} />
    <h2 style={{ fontSize: 14, fontWeight: 800, color: C.gold, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0, flex: 1 }}>{label}</h2>
    {right}
  </div>
)
const Card = ({ children, style }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, ...style }}>{children}</div>
)

// destaca [[trecho]] vindo da busca FTS
const Destaque = ({ texto }) => {
  const partes = String(texto || "").split(/(\[\[.*?\]\])/g)
  return <>{partes.map((p, i) => p.startsWith("[[") ? <mark key={i} className="aa-hit">{p.slice(2, -2)}</mark> : <span key={i}>{p}</span>)}</>
}

const mediaUrl = id => `${getApiBase()}/audio/${id}/arquivo?token=${encodeURIComponent(getAccessToken() || "")}`

// ── KPIs ──────────────────────────────────────────────────────────────────────
function Kpis({ p }) {
  if (!p) return null
  const fila = (p.por_status?.pendente || 0) + (p.por_status?.processando || 0)
  const cad = p.cadeia_custodia || {}
  const itens = [
    { l: "Gravações", v: p.total, s: `${p.ultimas_24h} nas últimas 24 h` },
    { l: "Horas transcritas", v: p.horas_transcritas.toLocaleString("pt-BR"), s: `${p.por_status?.concluido || 0} concluídas` },
    { l: "Na fila", v: fila, s: fila ? `≈ ${p.fila_horas} h de áudio` : "fila vazia", cor: fila ? "#FBBF24" : undefined },
    { l: "Risco alto", v: p.por_risco?.ALTO || 0, s: "gravações concluídas", cor: (p.por_risco?.ALTO || 0) ? "#F87171" : undefined },
    { l: "Bloqueadas", v: p.por_status?.bloqueado || 0, s: "aguardam transcrição local", cor: (p.por_status?.bloqueado || 0) ? "#FB923C" : undefined },
    { l: "Cadeia de custódia", v: cad.ok ? "ÍNTEGRA" : "ROMPIDA", s: `${cad.total ?? 0} eventos`, cor: cad.ok ? "#4ADE80" : "#F87171" },
  ]
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginBottom: 16 }}>
      {itens.map(k => (
        <Card key={k.l} style={{ padding: "12px 14px" }}>
          <div style={{ fontSize: 11.5, color: C.textDim, fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase" }}>{k.l}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: k.cor || C.text, margin: "4px 0 2px" }}>{k.v}</div>
          <div style={{ fontSize: 12.5, color: C.textMid }}>{k.s}</div>
        </Card>
      ))}
    </div>
  )
}

// ── Detalhe da gravação ───────────────────────────────────────────────────────
function Detalhe({ id, seekReq, classifs, onMudou, onFechar }) {
  const [d, setD] = useState(null)
  const [t, setT] = useState(0)
  const [editId, setEditId] = useState(null)
  const [editTxt, setEditTxt] = useState("")
  const [cust, setCust] = useState(null)
  const [novaClassif, setNovaClassif] = useState("")
  const audioRef = useRef(null)
  const ativoRef = useRef(null)
  const [src, setSrc] = useState("")

  const carregar = useCallback(async () => {
    try {
      const r = await api.get(`/audio/${id}`)
      if (r.ok) setD(await r.json())
    } catch { /* mantém o que já está na tela */ }
  }, [id])

  useEffect(() => { setD(null); setCust(null); setEditId(null); setT(0); setSrc(""); carregar() }, [id, carregar])
  useEffect(() => {
    if (!d || !EM_ANDAMENTO(d.audio.status)) return
    const iv = setInterval(carregar, 3000)
    return () => clearInterval(iv)
  }, [d, carregar])
  useEffect(() => { if (d && !src) setSrc(mediaUrl(id)) }, [d, id, src])

  // pedido de salto vindo da busca / flags
  useEffect(() => {
    if (!seekReq || !audioRef.current) return
    audioRef.current.currentTime = seekReq.t
    audioRef.current.play().catch(() => {})
  }, [seekReq, src])

  // token do <audio> expira em 15 min: renova e retoma do mesmo ponto
  async function aoErroAudio() {
    const pos = audioRef.current?.currentTime || 0
    await api.get("/audio/classificacoes")
    setSrc(mediaUrl(id))
    setTimeout(() => { if (audioRef.current) audioRef.current.currentTime = pos }, 300)
  }

  const segs = d?.segmentos || []
  const idxAtivo = segs.reduce((acc, s, i) => (s.inicio <= t ? i : acc), -1)
  useEffect(() => {
    if (idxAtivo >= 0 && audioRef.current && !audioRef.current.paused) ativoRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [idxAtivo])

  function saltar(seg) {
    if (!audioRef.current) return
    audioRef.current.currentTime = Math.max(0, seg)
    audioRef.current.play().catch(() => {})
  }

  async function salvarEdicao(seg) {
    const r = await api.patch(`/audio/${id}/segmentos/${seg.id}`, { texto: editTxt })
    if (r.ok) { toast.success("Trecho corrigido. O original foi preservado e a alteração ficou na custódia."); setEditId(null); carregar(); if (cust) abrirCustodia() }
    else toast.error((await r.json().catch(() => ({}))).detail || "Falha ao salvar a correção.")
  }

  async function abrirCustodia() {
    const r = await api.get(`/audio/${id}/custodia`)
    if (r.ok) setCust(await r.json())
  }
  async function verificar() {
    const r = await api.post(`/audio/${id}/verificar-integridade`)
    const j = await r.json().catch(() => ({}))
    j.ok ? toast.success("Integridade confirmada: o arquivo original não foi alterado desde a ingestão.")
         : toast.error(`ARQUIVO ALTERADO ou ausente. ${j.motivo || ""}`, 9000)
    abrirCustodia()
  }
  async function reprocessar() {
    const r = await api.post(`/audio/${id}/reprocessar`)
    if (r.ok) { toast.info("Gravação reenfileirada."); carregar(); onMudou() }
    else toast.error((await r.json().catch(() => ({}))).detail || "Não foi possível reprocessar.")
  }
  function reclassificar() {
    if (!novaClassif || novaClassif === d.audio.classificacao) return
    const publica = (classifs?.publicas || []).includes(novaClassif)
    confirm({
      title: "Reclassificar gravação",
      description: publica
        ? `ATENÇÃO: "${novaClassif}" libera o envio do áudio ao provedor de transcrição em NUVEM. Use apenas para áudio de teste, sintético ou público. A mudança fica registrada na custódia.`
        : `A gravação passará a "${novaClassif}" (processamento restrito ao servidor local). A mudança fica registrada na custódia.`,
      confirmLabel: "Reclassificar", destructive: publica,
      onConfirm: async () => {
        const r = await api.patch(`/audio/${id}/classificacao`, { classificacao: novaClassif })
        if (r.ok) { toast.success("Classificação alterada. Use “Reprocessar” para aplicar."); carregar(); onMudou() }
        else toast.error("Falha ao reclassificar.")
      },
    })
  }
  async function exportar(fmt) {
    const r = await api.get(`/audio/${id}/exportar/${fmt}`)
    if (!r.ok) return toast.error(`Falha ao gerar ${fmt.toUpperCase()}.`)
    const url = URL.createObjectURL(await r.blob())
    const a = document.createElement("a"); a.href = url; a.download = `laudo_AUD-${id.slice(0, 8).toUpperCase()}.${fmt}`; a.click()
    URL.revokeObjectURL(url)
  }

  if (!d) return <Card><div style={{ color: C.textMid }}>Carregando…</div></Card>
  const a = d.audio
  const meta = [["Unidade", a.unidade], ["Local", a.local], ["Data da gravação", a.data_gravacao], ["Custodiado", a.custodiado],
    ["Interlocutor", a.interlocutor], ["Duração", fmtDur(a.duracao_s)], ["Tamanho", fmtBytes(a.tamanho)], ["Enviado por", `${a.criado_por || "—"} · ${fmtDT(a.criado_em)}`]]

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text, wordBreak: "break-all" }}>🎙️ {a.nome_original}</div>
          <div style={{ fontSize: 12, color: C.textDim, fontFamily: MONO, marginTop: 3 }} title={a.sha256}>SHA-256 {a.sha256.slice(0, 20)}…</div>
        </div>
        <StatusTag s={a.status} /><ClassifTag c={a.classificacao} /><RiscoTag r={a.risco} />
        <button className="aa-btn" style={btn()} onClick={onFechar} title="Fechar">✕</button>
      </div>

      <div className="aa-scroll" style={{ padding: 18, maxHeight: "calc(100vh - 250px)", overflowY: "auto" }}>
        {a.status === "processando" && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: "#60A5FA", fontFamily: MONO, marginBottom: 6 }}>{(a.etapa || "processando").toUpperCase()} · {a.progresso}%</div>
            <div style={{ height: 8, borderRadius: 5, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
              <div style={{ width: `${a.progresso}%`, height: "100%", transition: "width .4s",
                backgroundImage: "linear-gradient(45deg,rgba(255,255,255,.18) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.18) 50%,rgba(255,255,255,.18) 75%,transparent 75%)",
                backgroundSize: "28px 28px", backgroundColor: "#60A5FA", animation: "aa-bar 1s linear infinite" }} />
            </div>
          </div>
        )}
        {a.status === "pendente" && <div style={{ ...badge("#FBBF24", "rgba(251,191,36,0.1)"), display: "block", marginBottom: 14, padding: "10px 14px", fontSize: 14 }}>Aguardando na fila de processamento.</div>}
        {(a.status === "erro" || a.status === "bloqueado") && (
          <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 8, border: `1px solid ${a.status === "erro" ? C.redBorder : "rgba(251,146,60,0.4)"}`,
            background: a.status === "erro" ? C.redSoft : "rgba(251,146,60,0.1)", color: C.text, fontSize: 14, lineHeight: 1.5 }}>
            <b>{a.status === "erro" ? "Falha no processamento." : "Bloqueado pelo guardrail de soberania."}</b> {a.erro}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, marginBottom: 14 }}>
          {meta.map(([k, v]) => (
            <div key={k}><div style={{ fontSize: 11.5, color: C.textDim, fontFamily: MONO, textTransform: "uppercase", letterSpacing: "0.06em" }}>{k}</div>
              <div style={{ fontSize: 14.5, color: C.text, marginTop: 2 }}>{v || "—"}</div></div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
          <select value={novaClassif || a.classificacao} onChange={e => setNovaClassif(e.target.value)} style={{ ...input, width: "auto", padding: "7px 10px", fontSize: 14 }}>
            {(classifs?.validas || [a.classificacao]).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="aa-btn" style={btn()} disabled={!novaClassif || novaClassif === a.classificacao} onClick={reclassificar}>Reclassificar</button>
          <button className="aa-btn" style={btn()} disabled={a.status === "processando"} onClick={reprocessar}>↻ Reprocessar</button>
          <span style={{ flex: 1 }} />
          {a.status === "concluido" && ["txt", "pdf", "docx"].map(f => <button key={f} className="aa-btn" style={btn()} onClick={() => exportar(f)}>⬇ {f.toUpperCase()}</button>)}
        </div>

        {a.resumo && (
          <div style={{ marginBottom: 16 }}>
            <SectionBar label={`Resumo analítico${a.classificacao_conteudo ? " · " + a.classificacao_conteudo : ""}`} />
            <div style={{ color: C.text, fontSize: 15, lineHeight: 1.6 }}>{a.resumo}</div>
            {!a.analise_ok && a.status === "concluido" && <div style={{ fontSize: 12.5, color: C.textDim, marginTop: 6 }}>Análise por IA indisponível para esta gravação (dado sensível ou falha do provedor) — risco calculado por regras.</div>}
          </div>
        )}
        {a.status === "concluido" && !a.resumo && !a.analise_ok && (
          <div style={{ fontSize: 13, color: C.textDim, marginBottom: 14 }}>Sem análise por IA (dado sensível ou provedor indisponível). A transcrição está completa e pesquisável.</div>
        )}

        {a.flags?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <SectionBar label={`Pontos de atenção (${a.flags.length})`} />
            {a.flags.map((f, i) => (
              <div key={i} style={{ padding: "10px 12px", marginBottom: 8, borderRadius: 8, background: "rgba(239,68,68,0.06)", borderTop: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, borderLeft: `3px solid ${f.origem === "regra" ? "#F87171" : "#FBBF24"}` }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <b style={{ color: C.text, fontSize: 15 }}>{f.title}</b>
                  <span style={badge(f.origem === "regra" ? "#F87171" : "#FBBF24", "rgba(255,255,255,0.05)")}>{f.origem === "regra" ? "REGRA" : "IA"}</span>
                  {f.verificado ? <span style={badge("#4ADE80", "rgba(74,222,128,0.1)")}>✓ TRECHO CONFERE</span>
                                : <span style={badge("#FB923C", "rgba(251,146,60,0.1)")}>⚠ NÃO VERIFICADO</span>}
                  {f.inicio != null && <button className="aa-btn" style={{ ...btn(), padding: "3px 10px", fontSize: 13, fontFamily: MONO }} onClick={() => saltar(f.inicio)}>▶ {fmtDur(f.inicio)}</button>}
                </div>
                <div style={{ color: C.textMid, fontSize: 14, marginTop: 6 }}>{f.text}</div>
                {f.trecho && <div style={{ color: C.textDim, fontSize: 13.5, marginTop: 4, fontStyle: "italic" }}>“{f.trecho}”</div>}
              </div>
            ))}
          </div>
        )}

        {a.cruzamentos?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <SectionBar label={`Nomes monitorados citados (${a.cruzamentos.length})`} />
            {a.cruzamentos.map((c, i) => (
              <div key={i} style={{ fontSize: 14, color: C.text, marginBottom: 4 }}>👤 <b>{c.nome}</b> <span style={{ color: C.textDim, fontFamily: MONO, fontSize: 12.5 }}>[{c.fonte}]</span> <span style={{ color: C.textMid }}>{c.detalhe}</span></div>
            ))}
          </div>
        )}

        <SectionBar label="Gravação original" />
        <audio ref={audioRef} controls preload="metadata" src={src} onTimeUpdate={e => setT(e.currentTarget.currentTime)} onError={aoErroAudio}
          style={{ width: "100%", marginBottom: 16, colorScheme: "dark" }} />

        <SectionBar label={`Transcrição (${segs.length} trechos)`} />
        {segs.length === 0 && <div style={{ color: C.textDim, fontSize: 14 }}>Sem transcrição ainda.</div>}
        {segs.map((s, i) => {
          const ativo = i === idxAtivo
          const baixa = s.confianca != null && s.confianca < 0.5 && !s.texto_corrigido
          const emEdicao = editId === s.id
          return (
            <div key={s.id} ref={ativo ? ativoRef : null} className="aa-seg"
              style={{ display: "flex", gap: 10, padding: "7px 10px", borderRadius: 7, marginBottom: 2,
                background: ativo ? "rgba(232,160,32,0.12)" : "transparent", borderLeft: `3px solid ${ativo ? C.gold : "transparent"}` }}>
              <button className="aa-btn" onClick={() => saltar(s.inicio)} title="Ouvir este trecho"
                style={{ background: "none", border: "none", color: C.gold, fontFamily: MONO, fontSize: 13, cursor: "pointer", padding: 0, minWidth: 52, textAlign: "left" }}>▶ {fmtDur(s.inicio)}</button>
              <div style={{ flex: 1, minWidth: 0 }}>
                {emEdicao ? (
                  <>
                    <textarea value={editTxt} onChange={e => setEditTxt(e.target.value)} rows={3} style={{ ...input, fontSize: 15, resize: "vertical" }} autoFocus />
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <button className="aa-btn" style={btn(true)} onClick={() => salvarEdicao(s)}>Salvar correção</button>
                      <button className="aa-btn" style={btn()} onClick={() => setEditId(null)}>Cancelar</button>
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 15, color: C.text, lineHeight: 1.55 }}>
                    {s.texto_corrigido || s.texto}
                    {baixa && <span title={`Confiança do reconhecimento: ${Math.round(s.confianca * 100)}%`} style={{ ...badge("#FB923C", "rgba(251,146,60,0.1)"), marginLeft: 8, fontSize: 11 }}>⚠ REVISAR · {Math.round(s.confianca * 100)}%</span>}
                    {s.texto_corrigido && <span title={`Original: ${s.texto}`} style={{ ...badge("#60A5FA", "rgba(96,165,250,0.1)"), marginLeft: 8, fontSize: 11 }}>✎ REVISADO · {s.revisado_por}</span>}
                  </div>
                )}
              </div>
              {!emEdicao && <button className="aa-btn" title="Corrigir texto" onClick={() => { setEditId(s.id); setEditTxt(s.texto_corrigido || s.texto) }}
                style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 15 }}>✎</button>}
            </div>
          )
        })}

        <div style={{ marginTop: 20 }}>
          <SectionBar label="Cadeia de custódia" right={
            <>
              <button className="aa-btn" style={btn()} onClick={cust ? () => setCust(null) : abrirCustodia}>{cust ? "Ocultar" : "Ver trilha"}</button>
              <button className="aa-btn" style={{ ...btn(), marginLeft: 6 }} onClick={verificar}>Verificar integridade do original</button>
            </>} />
          {cust && (
            <div>
              <div style={{ marginBottom: 8 }}><span style={badge(cust.cadeia.ok ? "#4ADE80" : "#F87171", cust.cadeia.ok ? C.greenSoft : C.redSoft)}>
                {cust.cadeia.ok ? `✓ TRILHA ÍNTEGRA (${cust.cadeia.total} eventos no sistema)` : "✗ TRILHA ADULTERADA"}</span></div>
              {cust.eventos.map(e => (
                <div key={e.id} style={{ display: "grid", gridTemplateColumns: "150px 120px 1fr", gap: 10, fontSize: 13, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.textDim, fontFamily: MONO }}>{fmtDT(e.ts)}</span>
                  <span style={{ color: C.gold, fontFamily: MONO }}>{e.acao}</span>
                  <span style={{ color: C.textMid, wordBreak: "break-all" }}>{e.usuario} — {e.detalhe}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

// ── Envio em lote ─────────────────────────────────────────────────────────────
function Enviar({ classifs, onEnviado }) {
  const [arquivos, setArquivos] = useState([])
  const [f, setF] = useState({ unidade: "", local: "", data_gravacao: "", custodiado: "", interlocutor: "", observacoes: "", classificacao: "" })
  const [enviando, setEnviando] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const inputRef = useRef(null)
  const classif = f.classificacao || classifs?.padrao || "reservado"
  const sensivel = !(classifs?.publicas || []).includes(classif)

  function adicionar(lista) {
    const novos = Array.from(lista || []).filter(x => /\.(wav|mp3|mp4|ogg|webm|flac|m4a|mpga|mpeg|opus)$/i.test(x.name))
    if (novos.length < (lista?.length || 0)) toast.warn("Alguns arquivos foram ignorados (formato não suportado).")
    setArquivos(a => [...a, ...novos].slice(0, 50))
  }
  async function enviar() {
    if (!arquivos.length) return
    setEnviando(true)
    try {
      const form = new FormData()
      arquivos.forEach(a => form.append("arquivos", a))
      Object.entries({ ...f, classificacao: classif }).forEach(([k, v]) => form.append(k, v || ""))
      const r = await api.upload("/audio/upload", form)
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.detail || `Erro ${r.status}`)
      toast.success(`${j.enfileirados} gravação(ões) na fila${j.duplicados ? ` · ${j.duplicados} já existia(m) (mesmo SHA-256)` : ""}${j.erros?.length ? ` · ${j.erros.length} com erro` : ""}.`)
      setArquivos([]); onEnviado()
    } catch (e) { toast.error(e.message || "Falha no envio.") }
    finally { setEnviando(false) }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(300px,1fr) minmax(300px,1fr)", gap: 16 }}>
      <Card>
        <SectionBar label="Gravações" />
        <div className="aa-drop" onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setArrastando(true) }} onDragLeave={() => setArrastando(false)}
          onDrop={e => { e.preventDefault(); setArrastando(false); adicionar(e.dataTransfer.files) }}
          style={{ border: `2px dashed ${arrastando ? C.gold : C.borderUp}`, borderRadius: 10, padding: "34px 16px", textAlign: "center", cursor: "pointer", background: arrastando ? C.goldSoft : "transparent", transition: "all .12s" }}>
          <div style={{ fontSize: 34 }}>🎙️</div>
          <div style={{ color: C.text, fontSize: 16, fontWeight: 700, marginTop: 6 }}>Arraste os áudios ou clique para escolher</div>
          <div style={{ color: C.textDim, fontSize: 13, marginTop: 4 }}>WAV, MP3, FLAC, OGG, M4A, WEBM… até 50 arquivos por envio, sem limite de duração</div>
          <input ref={inputRef} type="file" multiple accept="audio/*,.opus,.mpga" style={{ display: "none" }} onChange={e => { adicionar(e.target.files); e.target.value = "" }} />
        </div>
        {arquivos.length > 0 && (
          <div className="aa-scroll" style={{ marginTop: 12, maxHeight: 260, overflowY: "auto" }}>
            {arquivos.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px", borderBottom: `1px solid ${C.border}`, fontSize: 14 }}>
                <span style={{ flex: 1, color: C.text, wordBreak: "break-all" }}>{a.name}</span>
                <span style={{ color: C.textDim, fontFamily: MONO, fontSize: 12.5 }}>{fmtBytes(a.size)}</span>
                <button className="aa-btn" onClick={() => setArquivos(x => x.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer" }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionBar label="Dados da gravação (valem para todos do envio)" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Campo label="Unidade"><input style={input} value={f.unidade} onChange={e => setF({ ...f, unidade: e.target.value })} placeholder="Ex.: CDPM1" /></Campo>
          <Campo label="Local / parlatório"><input style={input} value={f.local} onChange={e => setF({ ...f, local: e.target.value })} placeholder="Ex.: Parlatório 2" /></Campo>
          <Campo label="Data da gravação"><input style={input} type="datetime-local" value={f.data_gravacao} onChange={e => setF({ ...f, data_gravacao: e.target.value })} /></Campo>
          <Campo label="Custodiado"><input style={input} value={f.custodiado} onChange={e => setF({ ...f, custodiado: e.target.value })} /></Campo>
        </div>
        <Campo label="Interlocutor / visitante"><input style={input} value={f.interlocutor} onChange={e => setF({ ...f, interlocutor: e.target.value })} /></Campo>
        <Campo label="Observações"><textarea style={{ ...input, resize: "vertical" }} rows={2} value={f.observacoes} onChange={e => setF({ ...f, observacoes: e.target.value })} /></Campo>
        <Campo label="Classificação do material">
          <select style={input} value={classif} onChange={e => setF({ ...f, classificacao: e.target.value })}>
            {(classifs?.validas || []).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Campo>
        <div style={{ padding: "10px 12px", borderRadius: 8, fontSize: 13.5, lineHeight: 1.5, marginBottom: 14,
          background: sensivel ? "rgba(251,146,60,0.1)" : "rgba(74,222,128,0.08)", border: `1px solid ${sensivel ? "rgba(251,146,60,0.35)" : "rgba(74,222,128,0.3)"}`, color: C.text }}>
          {sensivel
            ? <>🔒 <b>Material sensível:</b> o áudio <b>nunca</b> vai para a nuvem. {classifs?.stt_local_disponivel
                ? "Será transcrito no servidor local."
                : "Este servidor ainda não tem transcrição local instalada — a gravação ficará BLOQUEADA (guardada e protegida) até haver."}</>
            : <>☁️ <b>Material de teste/público:</b> será transcrito pelo provedor em nuvem ({classifs?.stt_provedor || "groq"}). Não use para gravação real.</>}
        </div>
        <button className="aa-btn" style={{ ...btn(true), width: "100%", padding: "12px", fontSize: 15 }} disabled={!arquivos.length || enviando} onClick={enviar}>
          {enviando ? "Enviando…" : `Enviar ${arquivos.length || ""} gravaç${arquivos.length === 1 ? "ão" : "ões"} para a fila`}
        </button>
      </Card>
    </div>
  )
}

// ── Busca ─────────────────────────────────────────────────────────────────────
function Busca({ onAbrir }) {
  const [q, setQ] = useState("")
  const [res, setRes] = useState(null)
  const [buscando, setBuscando] = useState(false)
  async function buscar(e) {
    e?.preventDefault()
    if (q.trim().length < 2) return toast.warn("Digite ao menos 2 caracteres.")
    setBuscando(true)
    try {
      const r = await api.get(`/audio/busca?q=${encodeURIComponent(q.trim())}`)
      if (!r.ok) throw new Error()
      setRes((await r.json()).resultados)
    } catch { toast.error("Falha na busca.") } finally { setBuscando(false) }
  }
  return (
    <div>
      <form onSubmit={buscar} style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <input style={{ ...input, fontSize: 16 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Busque em todas as transcrições: nome, vulgo, local, palavra…  (sem acento, vários termos = todos)" autoFocus />
        <button className="aa-btn" style={{ ...btn(true), padding: "0 24px" }} disabled={buscando}>{buscando ? "…" : "Buscar"}</button>
      </form>
      {res && <div style={{ color: C.textMid, fontSize: 14, marginBottom: 10 }}>{res.length} ocorrência(s)</div>}
      {res?.map(r => (
        <div key={r.seg_id} className="aa-row" onClick={() => onAbrir(r.audio_id, r.inicio)}
          style={{ padding: "12px 14px", borderRadius: 9, background: C.surface, border: `1px solid ${C.border}`, marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 5 }}>
            <b style={{ color: C.text }}>🎙️ {r.nome_original}</b>
            <span style={badge(C.gold, C.goldSoft)}>▶ {fmtDur(r.inicio)}</span>
            {r.unidade && <span style={{ color: C.textMid, fontSize: 13, fontFamily: MONO }}>{r.unidade}</span>}
            {r.custodiado && <span style={{ color: C.textMid, fontSize: 13 }}>· {r.custodiado}</span>}
            <RiscoTag r={r.risco} />
          </div>
          <div style={{ color: C.text, fontSize: 15, lineHeight: 1.55 }}><Destaque texto={r.trecho} /></div>
        </div>
      ))}
      {res && res.length === 0 && <Card><div style={{ color: C.textMid }}>Nenhuma ocorrência. Lembre: só gravações já transcritas entram na busca.</div></Card>}
    </div>
  )
}

// ── Tela principal ────────────────────────────────────────────────────────────
export default function AcervoAudio() {
  const [aba, setAba] = useState("acervo")
  const [painel, setPainel] = useState(null)
  const [lista, setLista] = useState({ total: 0, itens: [] })
  const [classifs, setClassifs] = useState(null)
  const [filtro, setFiltro] = useState({ status: "", risco: "", q: "" })
  const [sel, setSel] = useState(null)
  const [seekReq, setSeekReq] = useState(null)
  const [erroConexao, setErroConexao] = useState(false)

  useEffect(() => {
    const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s)
    return () => document.head.removeChild(s)
  }, [])

  const carregar = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ limite: "100" })
      if (filtro.status) qs.set("status", filtro.status)
      if (filtro.risco) qs.set("risco", filtro.risco)
      if (filtro.q) qs.set("q", filtro.q)
      const [p, l] = await Promise.all([api.get("/audio/painel"), api.get(`/audio?${qs}`)])
      if (p.ok) setPainel(await p.json())
      if (l.ok) setLista(await l.json())
      setErroConexao(false)
    } catch { setErroConexao(true) }
  }, [filtro])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { // atualização contínua (mais rápida enquanto há fila)
    const iv = setInterval(carregar, lista.itens.some(i => EM_ANDAMENTO(i.status)) ? 4000 : 15000)
    return () => clearInterval(iv)
  }, [carregar, lista])
  useEffect(() => {
    api.get("/audio/classificacoes").then(r => r.ok && r.json()).then(j => j && setClassifs(j)).catch(() => {})
  }, [])

  function abrir(id, t = null) {
    setSel(id); setAba("acervo")
    if (t != null) setSeekReq({ t, n: Date.now() })
  }

  const abas = [["acervo", "Acervo"], ["enviar", "Enviar gravações"], ["busca", "Busca nas transcrições"]]
  return (
    <div style={{ padding: "24px 28px", color: C.text, fontFamily: SANS, minHeight: "100%", background: C.bg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Acervo de Áudios</h1>
          <div style={{ color: C.textMid, fontSize: 14.5, marginTop: 3 }}>Transcrição em lote, busca, custódia e laudo · áudio sensível nunca sai do servidor</div>
        </div>
        {painel && <span style={badge(painel.stt_provedor === "local" ? "#4ADE80" : "#60A5FA", "rgba(255,255,255,0.05)")}>TRANSCRIÇÃO: {painel.stt_provedor === "local" ? "LOCAL" : "NUVEM (" + painel.stt_provedor.toUpperCase() + ")"}</span>}
        {classifs && <span style={badge(classifs.stt_local_disponivel ? "#4ADE80" : "#FB923C", "rgba(255,255,255,0.05)")}>{classifs.stt_local_disponivel ? "MOTOR LOCAL INSTALADO" : "SEM MOTOR LOCAL"}</span>}
      </div>

      {erroConexao && <div style={{ ...badge("#F87171", C.redSoft), display: "block", padding: "10px 14px", marginBottom: 12, fontSize: 14 }}>Sem conexão com o servidor — tentando de novo…</div>}
      <Kpis p={painel} />

      <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: `1px solid ${C.border}` }}>
        {abas.map(([id, l]) => (
          <button key={id} className="aa-tab" onClick={() => setAba(id)}
            style={{ background: aba === id ? C.goldSoft : "transparent", color: aba === id ? C.gold : C.textMid, border: "none", borderBottom: `2px solid ${aba === id ? C.gold : "transparent"}`,
              padding: "10px 18px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: SANS }}>{l}</button>
        ))}
      </div>

      {aba === "enviar" && <Enviar classifs={classifs} onEnviado={() => { carregar(); setAba("acervo") }} />}
      {aba === "busca" && <Busca onAbrir={abrir} />}
      {aba === "acervo" && (
        <div style={{ display: "grid", gridTemplateColumns: sel ? "minmax(340px,0.9fr) minmax(420px,1.4fr)" : "1fr", gap: 16, alignItems: "start" }}>
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <input style={{ ...input, flex: 1, minWidth: 160 }} placeholder="Nome do arquivo, custodiado, interlocutor…" value={filtro.q} onChange={e => setFiltro({ ...filtro, q: e.target.value })} />
              <select style={{ ...input, width: "auto" }} value={filtro.status} onChange={e => setFiltro({ ...filtro, status: e.target.value })}>
                <option value="">Todos os status</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
              </select>
              <select style={{ ...input, width: "auto" }} value={filtro.risco} onChange={e => setFiltro({ ...filtro, risco: e.target.value })}>
                <option value="">Qualquer risco</option><option>ALTO</option><option>MÉDIO</option><option>BAIXO</option>
              </select>
            </div>
            <div className="aa-scroll" style={{ maxHeight: "calc(100vh - 360px)", overflowY: "auto" }}>
              {lista.itens.length === 0 && (
                <Card><div style={{ color: C.textMid, fontSize: 15, lineHeight: 1.6 }}>
                  Nenhuma gravação ainda. Use <b>Enviar gravações</b> para colocar áudios na fila — ou solte arquivos na pasta monitorada pelo n8n.
                </div></Card>
              )}
              {lista.itens.map(i => (
                <div key={i.id} className="aa-row" onClick={() => { setSel(i.id); setSeekReq(null) }}
                  style={{ padding: "11px 14px", borderRadius: 9, marginBottom: 6, background: sel === i.id ? C.goldSoft : C.surface, border: `1px solid ${sel === i.id ? C.goldBorder : C.border}` }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <b style={{ flex: 1, color: C.text, fontSize: 15, wordBreak: "break-all", minWidth: 140 }}>🎙️ {i.nome_original}</b>
                    <StatusTag s={i.status} /><RiscoTag r={i.risco} />
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 13, color: C.textMid, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: MONO }}>{fmtDur(i.duracao_s)}</span>
                    {i.unidade && <span>{i.unidade}</span>}{i.custodiado && <span>👤 {i.custodiado}</span>}
                    <ClassifTag c={i.classificacao} />
                    <span style={{ marginLeft: "auto", color: C.textDim }}>{fmtDT(i.criado_em)}</span>
                  </div>
                  {i.status === "processando" && <div style={{ height: 4, borderRadius: 3, background: "rgba(255,255,255,0.07)", marginTop: 8 }}><div style={{ width: `${i.progresso}%`, height: "100%", background: "#60A5FA", borderRadius: 3, transition: "width .4s" }} /></div>}
                </div>
              ))}
              {lista.total > lista.itens.length && <div style={{ textAlign: "center", color: C.textDim, fontSize: 13, padding: 8 }}>Mostrando {lista.itens.length} de {lista.total}. Use os filtros para refinar.</div>}
            </div>
          </div>
          {sel && <Detalhe key={sel} id={sel} seekReq={seekReq} classifs={classifs} onMudou={carregar} onFechar={() => setSel(null)} />}
        </div>
      )}
    </div>
  )
}
