// shellTheme.js — tokens visuais específicos do "casco" do app (App.jsx,
// AppRouter.jsx, Painel.jsx): sidebar, topbar, tabs, Painel. É DIFERENTE do
// src/theme.js do design system das 20+ telas de módulo (Extrato, Drone,
// etc.) — aquele já existia antes da Missão 34 e continua intocado.
// Motivo de existir dois: o C daqui usa CSS custom properties
// (var(--ab-bg)) porque o casco suporta troca de tema em runtime (Padrão/
// Tático/Claro); o C das telas de módulo usa hex fixo.

export const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
export const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

export const DOT_GRID = `url("data:image/svg+xml,%3Csvg width='28' height='28' viewBox='0 0 28 28' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1' cy='1' r='0.9' fill='%23FFFFFF' fill-opacity='0.04'/%3E%3C/svg%3E")`

// Referencia CSS custom properties — permite trocar tema sem tocar nos componentes
export const C = {
  bg:        "var(--ab-bg)",
  surface:   "var(--ab-surface)",
  surfaceUp: "var(--ab-surface2)",
  border:    "var(--ab-border)",
  borderUp:  "var(--ab-border-up)",
  gold:      "#E8A020",
  goldSoft:  "rgba(232,160,32,0.15)",
  text:      "var(--ab-text)",
  textMid:   "var(--ab-text-mid)",
  textDim:   "var(--ab-text-dim)",
}

export const GLOBAL_CSS = `
  /* ── CSS Custom Properties por tema ──────────────────────────────────── */
  :root {
    --ab-bg:         #0B1120;
    --ab-surface:    #111827;
    --ab-surface2:   #1A2236;
    --ab-border:     rgba(255,255,255,0.07);
    --ab-border-up:  rgba(255,255,255,0.13);
    --ab-text:       #F1F5F9;
    --ab-text-mid:   #94A3B8;
    --ab-text-dim:   rgba(255,255,255,0.35);
  }
  /* Tema Tático */
  body.theme-tactico {
    --ab-bg:         #070c05;
    --ab-surface:    #0c1309;
    --ab-surface2:   #111f0c;
    --ab-border:     rgba(130,170,60,0.12);
    --ab-border-up:  rgba(130,170,60,0.22);
    --ab-text:       #b8d890;
    --ab-text-mid:   rgba(140,185,85,0.68);
    --ab-text-dim:   rgba(130,170,60,0.42);
  }
  /* Tema Claro */
  body.theme-claro {
    --ab-bg:         #F1F5F9;
    --ab-surface:    #FFFFFF;
    --ab-surface2:   #F8FAFC;
    --ab-border:     rgba(0,0,0,0.08);
    --ab-border-up:  rgba(0,0,0,0.14);
    --ab-text:       #0F172A;
    --ab-text-mid:   #64748B;
    --ab-text-dim:   rgba(0,0,0,0.35);
  }

  * { box-sizing: border-box; }
  body { background: var(--ab-bg); }

  /* ── Seleção de texto ──────────────────────────────────────────────── */
  ::selection { background: rgba(232,160,32,0.28); color: #F1F5F9; }

  /* ── Scrollbar premium ─────────────────────────────────────────────── */
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(232,160,32,0.22); border-radius: 99px; transition: background 0.2s; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(232,160,32,0.55); }

  /* ── Inputs ────────────────────────────────────────────────────────── */
  input, textarea { caret-color: ${C.gold}; transition: box-shadow 0.2s, border-color 0.2s; }
  input::placeholder, textarea::placeholder { color: var(--ab-text-dim) !important; font-weight: 500 !important; opacity:1 !important; }
  input:focus, textarea:focus, select:focus { outline: none; box-shadow: 0 0 0 2px rgba(232,160,32,0.22) !important; border-color: rgba(232,160,32,0.55) !important; }

  /* ── Keyframes ─────────────────────────────────────────────────────── */
  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 5px 1px rgba(22,163,74,0.5); }
    50%       { box-shadow: 0 0 14px 4px rgba(22,163,74,0.9); }
  }
  @keyframes amber-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(232,160,32,0); }
    50%       { box-shadow: 0 0 0 5px rgba(232,160,32,0.14); }
  }
  @keyframes screenIn {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
  @keyframes logoOrbit {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes goldShimmer {
    0%   { background-position: -300% center; }
    100% { background-position:  300% center; }
  }
  @keyframes navBarGrow {
    from { height: 0; opacity: 0; }
    to   { height: 60%; opacity: 1; }
  }
  @keyframes ticker-scroll {
    0%   { transform: translateX(60%); }
    100% { transform: translateX(-120%); }
  }
  @keyframes breathe {
    0%,100% { opacity:0.5; transform:scale(1); }
    50%     { opacity:1;   transform:scale(1.05); }
  }
  @keyframes scan-line {
    0%   { transform: translateY(-100%); }
    100% { transform: translateY(200vh); }
  }
  @keyframes toastIn {
    from { opacity: 0; transform: translateX(-50%) translateY(18px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0);    }
  }
  @keyframes toastProgress {
    from { width: 100%; }
    to   { width: 0%; }
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes dotPulseRed {
    0%, 100% { box-shadow: 0 0 0 0 rgba(248,113,113,0); transform: scale(1); }
    50%       { box-shadow: 0 0 0 5px rgba(248,113,113,0.2); transform: scale(1.15); }
  }
  @keyframes dot-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.6; transform: scale(0.85); }
  }

  /* ── Classes utilitárias ───────────────────────────────────────────── */
  .chip-dot-pulse  { animation: pulse-glow 2.4s ease-in-out infinite; }
  .alert-dot-pulse { animation: dotPulseRed 2s ease-in-out infinite; }
  .screen-enter    { animation: screenIn 0.28s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .fade-up         { animation: fadeUp 0.32s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .toast-anim      { animation: toastIn 0.26s cubic-bezier(0.16, 1, 0.3, 1) both; }

  /* ── Logo orbital ring ─────────────────────────────────────────────── */
  .logo-ring-orbit {
    position: absolute; inset: -5px; border-radius: 50%;
    border: 1.5px dashed rgba(245,158,11,0.4);
    animation: logoOrbit 12s linear infinite;
    pointer-events: none;
  }

  /* ── Group label shimmer ───────────────────────────────────────────── */
  .group-label-shimmer {
    background: linear-gradient(90deg, #E8A020 0%, #FDE68A 35%, #E8A020 55%, #B45309 100%);
    background-size: 300% auto;
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: goldShimmer 4s linear infinite;
  }

  /* ── Nav item ──────────────────────────────────────────────────────── */
  .nav-item { position: relative; overflow: hidden; }
  .nav-item::before {
    content: ''; position: absolute; inset: 0; opacity: 0;
    background: radial-gradient(ellipse at left center, rgba(232,160,32,0.14) 0%, transparent 70%);
    transition: opacity 0.25s ease; pointer-events: none;
  }
  .nav-item::after {
    content: '›'; position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
    font-size: 14px; line-height:1; color: transparent;
    transition: color 0.18s ease, right 0.18s ease; pointer-events: none;
  }
  .nav-item:hover::before { opacity: 1; }
  .nav-item:hover { background: rgba(232,160,32,0.09) !important; border-left-color: rgba(232,160,32,0.65) !important; }
  .nav-item:hover::after { color: rgba(232,160,32,0.65); right: 9px; }
  .nav-item:active { transform: scale(0.981); transition: transform 0.07s ease; }
  .nav-item-active-glow { box-shadow: inset 0 0 0 1px rgba(255,255,255,0.09), 0 2px 12px rgba(0,0,0,0.25) !important; }

  /* ── News / ref cards ──────────────────────────────────────────────── */
  .news-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; overflow:hidden; cursor:pointer; transition: all 0.22s cubic-bezier(0.16,1,0.3,1); backdrop-filter: blur(8px); }
  .news-card:hover { background: rgba(255,255,255,0.075); border-color: rgba(232,160,32,0.28); transform: translateY(-3px); box-shadow: 0 10px 28px rgba(0,0,0,0.38); }
  .ref-btn { background: rgba(255,255,255,0.05) !important; border: 1px solid rgba(255,255,255,0.1) !important; transition: all 0.18s ease; }
  .ref-btn:hover { background: ${C.goldSoft} !important; border-color: rgba(232,160,32,0.4) !important; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(0,0,0,0.2); }
  .config-btn:hover { background: rgba(255,255,255,0.07) !important; }

  /* ── Toast ─────────────────────────────────────────────────────────── */
  .toast-progress {
    position: absolute; bottom: 0; left: 0; height: 2px; border-radius: 0 0 8px 8px;
    animation: toastProgress 2.6s linear forwards;
  }
`

export const S = {
  app:{display:"flex",height:"100vh",background:C.bg,overflow:"hidden",fontFamily:SANS,position:"relative",color:C.text},
  dotGrid:{position:"fixed",inset:0,backgroundImage:DOT_GRID,backgroundSize:"28px 28px",pointerEvents:"none",zIndex:0},
  sidebar:{
    background:"linear-gradient(180deg,#0D3F74 0%,#0A3362 35%,#071F42 75%,#050E20 100%)",
    borderRight:"1px solid rgba(255,255,255,0.07)",display:"flex",flexDirection:"column",
    flexShrink:0,height:"100vh",position:"relative",zIndex:10,overflow:"hidden",
    boxShadow:"4px 0 32px rgba(0,0,0,0.45), inset -1px 0 0 rgba(255,255,255,0.04)",
    backdropFilter:"blur(18px)",WebkitBackdropFilter:"blur(18px)",
    transition:"width 0.22s cubic-bezier(0.16,1,0.3,1)"},
  logoArea:{padding:"14px 16px 12px",borderBottom:"1px solid rgba(255,255,255,0.08)",
    display:"flex",flexDirection:"column",alignItems:"center",gap:10,flexShrink:0,
    background:"rgba(0,0,0,0.12)"},
  logoRing:{width:50,height:50,borderRadius:"50%",border:"2px solid rgba(245,158,11,0.9)",
    overflow:"hidden",flexShrink:0,background:"rgba(245,158,11,0.12)",position:"relative",
    boxShadow:"0 0 20px rgba(245,158,11,0.4), 0 0 40px rgba(245,158,11,0.12), 0 3px 10px rgba(0,0,0,0.4)"},
  logoText:{display:"flex",flexDirection:"column",alignItems:"center",gap:2},
  logoName:{fontSize:14,fontWeight:800,color:"#FFFFFF",letterSpacing:"0.01em",textAlign:"center"},
  logoTagline:{fontSize:11,color:"#F59E0B",letterSpacing:"0.18em",textTransform:"uppercase",fontWeight:700,textAlign:"center"},
  nav:{padding:"3px 8px 0",flexShrink:0},
  groupLabel:{display:"flex",alignItems:"center",gap:7,fontSize:14.3,fontWeight:900,color:"#E8A020",
    letterSpacing:"0.03em",padding:"0 10px 2px",marginBottom:2,textTransform:"uppercase",
    textShadow:"0 1px 4px rgba(0,0,0,0.7),0 -1px 0 rgba(255,200,50,0.2)"},
  groupLabelBar:{display:"inline-block",width:3,height:13,background:"#E8A020",borderRadius:2,
    flexShrink:0,boxShadow:"0 0 6px rgba(232,160,32,0.5)"},
  ni:{display:"flex",alignItems:"center",gap:10,padding:"6px 10px",paddingRight:28,
    borderRadius:7,cursor:"pointer",marginBottom:3,border:"none",background:"transparent",
    width:"100%",textAlign:"left",transition:"all 0.12s ease"},
  sidebarFooter:{padding:"0 12px 12px",flexShrink:0},
  footerDivider:{height:1,background:"linear-gradient(90deg,transparent,rgba(245,158,11,0.4),transparent)",marginBottom:10},
  configBtn:{display:"flex",alignItems:"center",gap:10,padding:"9px 10px",cursor:"pointer",
    border:"none",background:"transparent",width:"100%",textAlign:"left",borderRadius:7,
    transition:"background 0.12s",marginBottom:4},
  policyBtn:{display:"block",width:"100%",textAlign:"center",fontSize:11,color:"#F59E0B",
    background:"transparent",border:"none",cursor:"pointer",padding:"4px 0",fontWeight:600,
    letterSpacing:"0.04em",opacity:0.85},
  copyright:{fontSize:11,color:"#FFFFFF",textAlign:"center",padding:"5px 0 0",lineHeight:1.5,fontWeight:500,opacity:0.75},
  main:{flex:1,display:"flex",flexDirection:"column",minWidth:0,height:"100vh",position:"relative",zIndex:10,background:C.bg},
  topbar:{height:52,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",
    justifyContent:"space-between",padding:"0 22px",background:C.surface,flexShrink:0,
    boxShadow:"0 1px 0 rgba(232,160,32,0.08)"},
  wc:{display:"flex",gap:6,alignItems:"center",marginRight:14},
  wb:{width:12,height:12,borderRadius:"50%",border:"none",cursor:"pointer",flexShrink:0},
  ttitle:{fontSize:17,fontWeight:700,color:C.text,letterSpacing:"-0.01em"},
  tsub:{fontSize:13,color:C.textMid,marginTop:2,fontFamily:MONO},
  chip:{display:"flex",alignItems:"center",gap:6,padding:"5px 14px",
    background:"rgba(22,163,74,0.1)",borderRadius:20,border:"1px solid rgba(22,163,74,0.3)"},
  chipDot:{width:7,height:7,borderRadius:"50%",background:"#16A34A",flexShrink:0},
  chipText:{fontSize:13,color:"#4ADE80",fontWeight:600},
  body:{flex:1,overflow:"hidden",padding:"12px 22px 14px",display:"flex",flexDirection:"column",gap:10},
  alert:{background:"rgba(220,38,38,0.08)",borderRadius:10,padding:"10px 16px",
    display:"flex",alignItems:"center",justifyContent:"space-between",
    border:"1px solid rgba(220,38,38,0.25)",boxShadow:"0 2px 12px rgba(220,38,38,0.1)",
    flexShrink:0,backdropFilter:"blur(8px)"},
  alertBadge:{fontSize:11,fontWeight:700,padding:"3px 10px",background:"#DC2626",color:"#FFFFFF",
    borderRadius:5,letterSpacing:"0.06em",whiteSpace:"nowrap",flexShrink:0,fontFamily:MONO},
  alertText:{fontSize:15.6,color:"#FCA5A5",lineHeight:1.4,marginLeft:12,fontWeight:600},
  alertTime:{fontSize:13,color:"rgba(252,165,165,0.6)",whiteSpace:"nowrap",marginLeft:12,flexShrink:0,fontFamily:MONO},
  secHeader:{display:"flex",alignItems:"center",gap:8,marginBottom:8},
  secBar:{display:"inline-block",width:3,height:16,background:C.gold,borderRadius:2,flexShrink:0,boxShadow:`0 0 8px ${C.gold}88`},
  secLabel:{fontSize:11.7,fontWeight:800,color:C.gold,letterSpacing:"0.12em",textTransform:"uppercase",margin:0},
  refsBar:{display:"flex",alignItems:"center",gap:12,background:"rgba(255,255,255,0.03)",
    border:`1px solid ${C.border}`,borderRadius:10,padding:"9px 14px",flexShrink:0,overflow:"hidden",backdropFilter:"blur(8px)"},
  refsBarLeft:{display:"flex",alignItems:"center",gap:8,paddingRight:12,borderRight:`1px solid ${C.border}`,flexShrink:0},
  chatArea:{flex:1,background:"rgba(255,255,255,0.02)",border:`1px solid ${C.border}`,
    borderRadius:10,position:"relative",overflow:"hidden",minHeight:60,backdropFilter:"blur(8px)"},
  emptyState:{position:"absolute",inset:0,display:"flex",flexDirection:"column",
    alignItems:"center",justifyContent:"center",pointerEvents:"none",userSelect:"none"},
  emptyText:{fontSize:15.6,color:"rgba(255,255,255,0.35)",fontWeight:600,marginTop:10,letterSpacing:"0.04em"},
  emptySubtext:{fontSize:13,color:"rgba(255,255,255,0.18)",fontFamily:MONO,marginTop:4},
  chatFadeMask:{position:"absolute",top:0,left:0,right:0,height:28,
    background:`linear-gradient(to bottom,${C.bg},transparent)`,zIndex:2,pointerEvents:"none"},
  chatMessages:{padding:"14px 16px 10px",display:"flex",flexDirection:"column",gap:10,height:"100%",overflowY:"auto"},
  chatBar:{borderTop:`1px solid ${C.border}`,background:C.surface,padding:"10px 22px 12px",flexShrink:0},
  chatBarFocused:{background:C.surfaceUp},
  chatRow:{display:"flex",gap:10,alignItems:"center"},
  chatIconWrap:{width:38,height:38,borderRadius:8,background:`${C.goldSoft}`,
    border:`1px solid rgba(232,160,32,0.25)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},
  chatIn:{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,
    borderRadius:8,padding:"11px 16px",fontSize:16.9,color:C.text,outline:"none",fontFamily:SANS,
    transition:"border-color 0.2s,box-shadow 0.2s"},
  sendBtn:{width:40,height:40,background:`linear-gradient(135deg,#F59E0B,#B45309)`,
    border:"none",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",
    cursor:"pointer",flexShrink:0,boxShadow:"0 4px 14px rgba(180,83,9,0.4)",transition:"opacity 0.2s"},
  chatHint:{fontSize:13,color:C.textDim,textAlign:"center",marginTop:7,letterSpacing:"0.03em",fontWeight:500,fontFamily:MONO},
}

