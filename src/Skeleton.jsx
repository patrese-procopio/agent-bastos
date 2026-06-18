/**
 * Skeleton.jsx — Componentes de loading skeleton
 *
 * Uso:
 *   import { SkeletonLine, SkeletonCard, SkeletonListItem, SkeletonGrid } from "./Skeleton"
 *
 *   // Linha simples
 *   <SkeletonLine width="60%" height={12} />
 *
 *   // Card com linhas
 *   <SkeletonCard lines={3} />
 *
 *   // Item de lista (avatar + linhas)
 *   <SkeletonListItem />
 *
 *   // Grid de cards
 *   <SkeletonGrid cols={4} rows={2} />
 *
 *   // Tabela
 *   <SkeletonTable rows={5} cols={4} />
 */

const PULSE = `
  @keyframes sk-pulse {
    0%, 100% { opacity: 0.40; }
    50%       { opacity: 0.80; }
  }
`

const BASE = {
  background: "rgba(255,255,255,0.07)",
  borderRadius: 5,
  animation: "sk-pulse 1.6s ease-in-out infinite",
}

// ── Primitivo: linha ────────────────────────────────────────────────────────
export function SkeletonLine({
  width  = "100%",
  height = 12,
  style  = {},
  delay  = 0,
}) {
  return (
    <>
      <style>{PULSE}</style>
      <div style={{
        ...BASE,
        width, height,
        animationDelay: `${delay}s`,
        ...style,
      }}/>
    </>
  )
}

// ── Card com múltiplas linhas ───────────────────────────────────────────────
export function SkeletonCard({
  lines   = 3,
  padding = "14px 16px",
  style   = {},
}) {
  const widths = ["70%", "90%", "55%", "80%", "65%", "45%"]
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 10,
      padding,
      ...style,
    }}>
      <style>{PULSE}</style>
      {/* Título */}
      <div style={{...BASE, width: "45%", height: 10, marginBottom: 14}}/>
      {/* Valor grande */}
      <div style={{...BASE, width: "30%", height: 28, marginBottom: 10, animationDelay:"0.1s"}}/>
      {/* Linhas de texto */}
      {Array.from({length: lines - 1}).map((_, i) => (
        <div key={i} style={{
          ...BASE,
          width: widths[i % widths.length],
          height: 10,
          marginBottom: i < lines - 2 ? 8 : 0,
          animationDelay: `${(i + 2) * 0.08}s`,
        }}/>
      ))}
    </div>
  )
}

// ── Item de lista (avatar circular + linhas) ────────────────────────────────
export function SkeletonListItem({
  avatarSize = 40,
  lines      = 2,
  style      = {},
  delay      = 0,
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 0",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
      ...style,
    }}>
      <style>{PULSE}</style>
      {/* Avatar */}
      <div style={{
        ...BASE,
        width: avatarSize, height: avatarSize,
        borderRadius: "50%", flexShrink: 0,
        animationDelay: `${delay}s`,
      }}/>
      {/* Linhas */}
      <div style={{flex: 1, display: "flex", flexDirection: "column", gap: 7}}>
        <div style={{...BASE, width: "55%", height: 12, animationDelay: `${delay + 0.05}s`}}/>
        {lines > 1 && <div style={{...BASE, width: "35%", height: 9, animationDelay: `${delay + 0.1}s`}}/>}
        {lines > 2 && <div style={{...BASE, width: "45%", height: 9, animationDelay: `${delay + 0.15}s`}}/>}
      </div>
      {/* Badge direita */}
      <div style={{...BASE, width: 52, height: 22, borderRadius: 6, flexShrink: 0, animationDelay: `${delay + 0.1}s`}}/>
    </div>
  )
}

// ── Grid de cards ───────────────────────────────────────────────────────────
export function SkeletonGrid({
  cols  = 4,
  rows  = 2,
  gap   = 12,
  style = {},
}) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap,
      ...style,
    }}>
      {Array.from({length: cols * rows}).map((_, i) => (
        <SkeletonCard key={i} lines={3} style={{animationDelay: `${i * 0.06}s`}}/>
      ))}
    </div>
  )
}

// ── Tabela ──────────────────────────────────────────────────────────────────
export function SkeletonTable({
  rows   = 5,
  cols   = 4,
  style  = {},
}) {
  const colWidths = ["30%", "20%", "25%", "15%", "10%"]
  return (
    <div style={style}>
      <style>{PULSE}</style>
      {/* Header */}
      <div style={{
        display: "flex", gap: 12, padding: "10px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 4,
      }}>
        {Array.from({length: cols}).map((_, i) => (
          <div key={i} style={{
            ...BASE, flex: 1, height: 9,
            background: "rgba(255,255,255,0.10)",
            maxWidth: colWidths[i % colWidths.length],
          }}/>
        ))}
      </div>
      {/* Rows */}
      {Array.from({length: rows}).map((_, r) => (
        <div key={r} style={{
          display: "flex", gap: 12, padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}>
          {Array.from({length: cols}).map((_, c) => (
            <div key={c} style={{
              ...BASE, flex: 1, height: 11,
              maxWidth: colWidths[c % colWidths.length],
              animationDelay: `${(r * cols + c) * 0.04}s`,
            }}/>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Sidebar list (para menus laterais) ─────────────────────────────────────
export function SkeletonSidebarList({ items = 6 }) {
  return (
    <div style={{padding: "8px 0"}}>
      <style>{PULSE}</style>
      {Array.from({length: items}).map((_, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "9px 12px", marginBottom: 2,
        }}>
          <div style={{...BASE, width: 8, height: 8, borderRadius: "50%", flexShrink: 0, animationDelay: `${i*0.06}s`}}/>
          <div style={{...BASE, flex: 1, height: 11, animationDelay: `${i*0.06+0.03}s`}}/>
          <div style={{...BASE, width: 24, height: 18, borderRadius: 5, flexShrink: 0, animationDelay: `${i*0.06+0.06}s`}}/>
        </div>
      ))}
    </div>
  )
}
