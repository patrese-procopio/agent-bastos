/**
 * AGENT BASTOS — Design System Dark
 * Fonte de verdade única para cores, fontes e estilos compartilhados.
 * Todas as telas importam daqui — mudança em um lugar propaga em tudo.
 *
 * Escala de fontes +30%:
 *   9px → 11.7  | 10px → 13  | 10.5 → 13.7
 *   11px → 14.3 | 12px → 15.6 | 13px → 16.9
 */

export const MONO = "'JetBrains Mono','Roboto Mono','Courier New',monospace"
export const SANS = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

/* ── Paleta principal ── */
export const C = {
  bg:        "#0B1120",                    /* fundo principal slate escuro       */
  surface:   "#111827",                    /* cards, painéis, topbars            */
  surfaceUp: "#1A2236",                    /* cards elevados / hover             */
  surfaceMid:"#162032",                    /* filtros, aside                     */
  border:    "rgba(255,255,255,0.07)",     /* bordas padrão                      */
  borderUp:  "rgba(255,255,255,0.13)",     /* bordas destacadas                  */
  gold:      "#E8A020",                    /* dourado âmbar — fio condutor       */
  goldSoft:  "rgba(232,160,32,0.12)",      /* fundo dourado suave                */
  goldBorder:"rgba(232,160,32,0.25)",      /* borda dourada                      */
  text:      "#F1F5F9",                    /* texto principal                    */
  textMid:   "#94A3B8",                    /* texto secundário                   */
  textDim:   "rgba(255,255,255,0.32)",     /* placeholders, rótulos              */
  red:       "#EF4444",
  redSoft:   "rgba(239,68,68,0.12)",
  redBorder: "rgba(239,68,68,0.3)",
  green:     "#4ADE80",
  greenSoft: "rgba(74,222,128,0.1)",
  blue:      "#60A5FA",
  blueSoft:  "rgba(96,165,250,0.1)",
  purple:    "#A78BFA",
}

/* ── CSS global — injete uma vez por tela via useEffect ── */
export const BASE_CSS = `
  * { box-sizing: border-box; }

  @keyframes fadeIn {
    from { opacity:0; transform:translateY(6px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes pulse-glow {
    0%,100% { box-shadow: 0 0 4px 2px rgba(232,160,32,0.3); }
    50%      { box-shadow: 0 0 12px 4px rgba(232,160,32,0.7); }
  }
  @keyframes pulse-red {
    0%,100% { box-shadow: 0 0 4px 2px rgba(239,68,68,0.3); }
    50%      { box-shadow: 0 0 12px 4px rgba(239,68,68,0.7); }
  }
  @keyframes pulse-green {
    0%,100% { box-shadow: 0 0 4px 1px rgba(74,222,128,0.4); }
    50%      { box-shadow: 0 0 10px 3px rgba(74,222,128,0.8); }
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes thinking {
    0%,100% { opacity:0.3; }
    50%      { opacity:1; }
  }

  .fade-in      { animation: fadeIn 0.22s ease forwards; }
  .pulse-gold   { animation: pulse-glow 2.5s ease-in-out infinite; }
  .pulse-red    { animation: pulse-red  2.5s ease-in-out infinite; }
  .pulse-green  { animation: pulse-green 2.5s ease-in-out infinite; }
  .spin         { animation: spin 1s linear infinite; }
  .dot1 { animation: thinking 1.2s ease infinite 0s; }
  .dot2 { animation: thinking 1.2s ease infinite 0.2s; }
  .dot3 { animation: thinking 1.2s ease infinite 0.4s; }

  /* scrollbar discreta no fundo escuro */
  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 4px; }

  input, textarea { caret-color: #E8A020; }
  input::placeholder, textarea::placeholder {
    color: rgba(255,255,255,0.3) !important;
    font-weight: 500 !important;
    opacity: 1 !important;
  }

  /* linhas de tabela / lista */
  .row-hover:hover {
    background: rgba(232,160,32,0.06) !important;
    cursor: pointer;
  }

  /* botão de filtro ativo */
  .filter-active {
    background: rgba(232,160,32,0.15) !important;
    border-color: rgba(232,160,32,0.4) !important;
    color: #E8A020 !important;
  }
`

/* ── Estilos de layout reutilizáveis ── */
export const T = {

  /* página full com aside + main */
  page: {
    display:"flex", flex:1, minWidth:0,
    height:"100%", overflow:"hidden",
    background:"#0B1120",
  },

  /* painel lateral (aside) */
  aside: {
    width: 268,
    flexShrink: 0,
    background: "#111827",
    borderRight: "1px solid rgba(255,255,255,0.07)",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },

  /* cabeçalho do aside */
  asideHeader: {
    display:"flex", alignItems:"center", justifyContent:"space-between",
    padding:"16px 16px 12px",
    borderBottom:"1px solid rgba(255,255,255,0.07)",
    flexShrink:0,
  },

  /* título do aside */
  asideTitle: {
    fontSize: 14.3,     /* 11px +30% */
    fontWeight: 800,
    color: "#E8A020",
    letterSpacing:"0.1em",
    textTransform:"uppercase",
  },

  /* área principal */
  main: {
    display:"flex", flexDirection:"column",
    flex:1, minWidth:0, height:"100%",
    overflow:"hidden",
    background:"#0B1120",
  },

  /* topbar da área principal */
  mainHeader: {
    display:"flex", alignItems:"center", justifyContent:"space-between",
    padding:"14px 22px",
    borderBottom:"1px solid rgba(255,255,255,0.07)",
    background:"#111827",
    flexShrink:0,
  },

  /* título do mainHeader */
  mainTitle: {
    fontSize: 16.9,    /* 13px +30% */
    fontWeight: 700,
    color: "#F1F5F9",
    letterSpacing:"-0.01em",
  },

  /* subtítulo/meta do mainHeader */
  mainSub: {
    fontSize: 11.7,    /* 9px +30% */
    color: "#94A3B8",
    fontFamily: "'JetBrains Mono','Roboto Mono','Courier New',monospace",
    marginTop: 2,
  },

  /* corpo scrollável */
  mainBody: {
    flex:1, overflowY:"auto",
    display:"flex", flexDirection:"column",
    padding:"18px 22px",
    gap: 14,
  },

  /* card glass */
  card: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 10,
    padding:"16px 18px",
    backdropFilter: "blur(8px)",
  },

  /* cabeçalho de seção com barrinha dourada */
  sectionHeader: (label) => ({
    display:"flex", alignItems:"center", gap:8, marginBottom:10,
  }),
  sectionBar: {
    display:"inline-block", width:3, height:16,
    background:"#E8A020", borderRadius:2, flexShrink:0,
    boxShadow:"0 0 8px rgba(232,160,32,0.5)",
  },
  sectionLabel: {
    fontSize: 11.7,    /* 9px +30% */
    fontWeight: 800,
    color: "#E8A020",
    letterSpacing:"0.12em",
    textTransform:"uppercase",
    margin:0,
  },

  /* badge de risco */
  badge: (color, bg, border) => ({
    fontSize: 10,      /* 7.7px arredondado → 10 */
    fontWeight: 800,
    padding:"2px 8px",
    borderRadius:4,
    letterSpacing:"0.06em",
    fontFamily:"'JetBrains Mono','Roboto Mono','Courier New',monospace",
    color, background:bg,
    border:`1px solid ${border}`,
    whiteSpace:"nowrap",
    flexShrink:0,
  }),

  /* label de filtro */
  filterLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: "rgba(255,255,255,0.32)",
    letterSpacing:"0.1em",
    textTransform:"uppercase",
    fontFamily:"'JetBrains Mono','Roboto Mono','Courier New',monospace",
    marginBottom: 6,
  },

  /* botão de filtro */
  filterBtn: (active) => ({
    width:"100%",
    padding:"7px 10px",
    borderRadius:6,
    fontSize: 13,      /* 10px +30% */
    fontWeight: active ? 700 : 500,
    cursor:"pointer",
    display:"flex", alignItems:"center", gap:6,
    fontFamily:"'JetBrains Mono','Roboto Mono','Courier New',monospace",
    transition:"all 0.12s",
    textAlign:"left",
    background: active ? "rgba(232,160,32,0.15)" : "transparent",
    color: active ? "#E8A020" : "#94A3B8",
    border: `1px solid ${active ? "rgba(232,160,32,0.4)" : "rgba(255,255,255,0.07)"}`,
  }),

  /* botão de ação no aside */
  actionBtn: {
    width:"100%",
    padding:"9px",
    borderRadius:7,
    border:"1px solid rgba(255,255,255,0.1)",
    background:"rgba(255,255,255,0.04)",
    fontSize: 13,      /* 10px +30% */
    color: "#94A3B8",
    cursor:"pointer",
    fontFamily:"'JetBrains Mono','Roboto Mono','Courier New',monospace",
    display:"flex", alignItems:"center", justifyContent:"center", gap:6,
    transition:"all 0.12s",
  },

  /* input de busca */
  searchInput: {
    background:"rgba(255,255,255,0.05)",
    border:"1px solid rgba(255,255,255,0.1)",
    borderRadius:7,
    padding:"8px 12px 8px 32px",
    fontSize: 13,      /* 10px+30% */
    color:"#F1F5F9",
    outline:"none",
    fontFamily:"'JetBrains Mono','Roboto Mono','Courier New',monospace",
    width:240,
    caretColor:"#E8A020",
  },

  /* texto corpo */
  bodyText: {
    fontSize: 15.6,    /* 12px +30% */
    color: "#F1F5F9",
    lineHeight: 1.65,
  },

  /* texto secundário */
  metaText: {
    fontSize: 13,      /* 10px +30% */
    color: "#94A3B8",
    fontFamily:"'JetBrains Mono','Roboto Mono','Courier New',monospace",
  },

  /* footer do aside */
  asideFooter: {
    padding:"12px 16px",
    borderTop:"1px solid rgba(255,255,255,0.07)",
    background:"rgba(255,255,255,0.02)",
    flexShrink:0,
  },
}

/* ── Helpers de risco — usados em Alertas, ListaNegra, Controle ── */
export const RISK_COLORS = {
  ALTO:     { color:"#F87171", bg:"rgba(239,68,68,0.12)",  border:"rgba(239,68,68,0.3)",  dot:"#EF4444" },
  MÉDIO:    { color:"#FBBF24", bg:"rgba(251,191,36,0.12)", border:"rgba(251,191,36,0.3)", dot:"#F59E0B" },
  BAIXO:    { color:"#4ADE80", bg:"rgba(74,222,128,0.12)", border:"rgba(74,222,128,0.3)", dot:"#22C55E" },
  CRÍTICO:  { color:"#F87171", bg:"rgba(239,68,68,0.18)",  border:"rgba(239,68,68,0.5)",  dot:"#DC2626" },
}
export const riskColor = (level, key) => (RISK_COLORS[level] || RISK_COLORS.MÉDIO)[key]
