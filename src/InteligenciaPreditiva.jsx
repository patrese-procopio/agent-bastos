import { useState, lazy, Suspense } from "react"
import { C, MONO, SANS } from "./theme"

/**
 * InteligenciaPreditiva.jsx — Agent Bastos
 * Tela unificada de análise preditiva com dois módulos:
 *   1. Sinais Fracos  — léxico de jargões operacionais (HITL)
 *   2. Matriz NUCADIs — mapa de calor de produção por sub-unidade
 *
 * Arquitetura: wrapper leve com tab switcher no header.
 * Cada sub-módulo é lazy-loaded e mantém seu próprio estado.
 */

const SinaisFracos  = lazy(() => import("./SinaisFracos"))
const MatrizNucadis = lazy(() => import("./MatrizNucadis"))

const ABAS = [
  { id:"sinais", label:"Sinais Fracos",  icon:"🧩", desc:"Léxico de jargões operacionais" },
  { id:"matriz", label:"Matriz NUCADIs", icon:"🔥", desc:"Mapa de calor por sub-unidade"  },
]

function Spinner() {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flex:1, gap:10 }}>
      <style>{`@keyframes ip-spin{to{transform:rotate(360deg)}}`}</style>
      <svg style={{ animation:"ip-spin 1s linear infinite" }} width="18" height="18"
        viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.5" strokeLinecap="round">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      <span style={{ fontSize:14, color:C.textMid, fontFamily:MONO }}>Carregando módulo...</span>
    </div>
  )
}

export default function InteligenciaPreditiva() {
  const [aba, setAba] = useState("sinais")
  const atual = ABAS.find(a => a.id === aba)

  return (
    <div style={{
      display:"flex", flexDirection:"column",
      flex:1, minWidth:0, height:"100%", overflow:"hidden",
      background:C.bg, fontFamily:SANS,
    }}>

      {/* ── Header com tab switcher ──────────────────────────────────────── */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"0 20px", height:52,
        borderBottom:`1px solid ${C.border}`,
        background:C.surface, flexShrink:0, gap:16,
      }}>
        {/* Identidade da tela */}
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{
            width:30, height:30, borderRadius:8,
            background:"rgba(232,160,32,0.12)", border:`1px solid rgba(232,160,32,0.25)`,
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke={C.gold} strokeWidth="1.8" strokeLinecap="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:C.text, letterSpacing:"-0.01em" }}>
              Inteligência Preditiva
            </div>
            <div style={{ fontSize:11, color:C.textDim, fontFamily:MONO, marginTop:1 }}>
              {atual.desc}
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{
          display:"flex", gap:3,
          background:"rgba(255,255,255,0.03)", padding:4,
          borderRadius:9, border:`1px solid ${C.border}`,
        }}>
          {ABAS.map(a => {
            const ativo = aba === a.id
            return (
              <button key={a.id} onClick={() => setAba(a.id)} style={{
                padding:"6px 16px", borderRadius:6, border:"none", cursor:"pointer",
                fontSize:13, fontWeight:700, fontFamily:MONO, letterSpacing:"0.03em",
                transition:"all 0.15s",
                background: ativo ? "rgba(232,160,32,0.15)" : "transparent",
                color: ativo ? C.gold : C.textMid,
                boxShadow: ativo ? `inset 0 0 0 1px rgba(232,160,32,0.30)` : "none",
              }}>
                <span style={{ marginRight:5 }}>{a.icon}</span>{a.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Conteúdo do módulo ativo ────────────────────────────────────── */}
      {/* Lazy-load: o chunk do módulo é baixado na primeira visita a cada aba */}
      <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column", minWidth:0 }}>
        <Suspense fallback={<Spinner />}>
          {aba === "sinais" && <SinaisFracos />}
          {aba === "matriz" && <MatrizNucadis />}
        </Suspense>
      </div>

    </div>
  )
}
