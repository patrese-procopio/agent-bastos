// navConfig.js — mapeamento de navegação do Agent Bastos.
// NAV_PERMISSIONS liga cada label do menu ao módulo exigido no JWT;
// buildNavGroups filtra os grupos de acordo com os módulos do usuário logado.

export const NAV_PERMISSIONS = {
  "Painel":                  null,
  "Alertas":                 "alertas",
  "ORÁCULO":                 "hitl",
  "Controle de Grupos":      "grupos",
  // "Inteligência de Grupos" movido para aba interna do Controle de Grupos
  "Lideranças por Unidade":  "liderancas",
  // "Líderes Gerais" movido para aba interna de Lideranças por Unidade
  "Análise de Vínculo":      "vinculo",
  "Extrato":                 "extrato",
  "Lista Negra":             "lista_negra",
  "Chat RAG":                "chat_rag",
  "OSINT Pessoas":           "osint",
  "Inteligência Preditiva":  ["sinais_fracos", "matrix_nucadis"],  // OR — basta ter um dos módulos
  "Referências":             "referencias",
  "Agenda de Missão":        "agenda",
  "Dashboard":               "dashboard",
  "Transcrição":             "transcricao",
  "Análise Grafoscópica":    "grafoscopia",
  "Notícias":                "noticias",
  "Operações Drone":         "drone",
}

export const NAV_GROUPS_ALL = [
  { title: "PRINCIPAL", items: [
    { label: "Painel",                  color: "#F59E0B" },
    { label: "Alertas",                 color: "#F87171", pulse: true },
    { label: "ORÁCULO",                  color: "#A78BFA", pulse: true },
    { label: "Controle de Grupos",      color: "#F87171" },
    // "Inteligência de Grupos" movido para aba interna do Controle de Grupos
    { label: "Lideranças por Unidade",  color: "#F87171" },
    // "Líderes Gerais" movido para aba interna de Lideranças por Unidade
    { label: "Análise de Vínculo",      color: "#38BDF8" },
    { label: "Extrato",                 color: "#E8A020" },
    { label: "Lista Negra",             color: "#94A3B8" },
  ]},
  { title: "INTELIGÊNCIA", items: [
    { label: "Chat RAG",        color: "#1D4ED8" },
    { label: "OSINT Pessoas",   color: "#B45309" },
    { label: "Inteligência Preditiva", color: "#FBBF24" },
    { label: "Referências",           color: "#C4B5FD" },
    { label: "Agenda de Missão",color: "#F59E0B", badge: "2" },
  ]},
  { title: "FERRAMENTAS", items: [
    { label: "Dashboard",             color: "#34D399" },
    { label: "Transcrição",           color: "#818CF8" },
    { label: "Análise Grafoscópica",  color: "#FBBF24" },
    { label: "Notícias",              color: "#FB923C" },
    { label: "Operações Drone",       color: "#22D3EE" },
  ]},
]

export function buildNavGroups(modules = []) {
  return NAV_GROUPS_ALL.map(group => ({
    ...group,
    items: group.items.filter(item => {
      const mod = NAV_PERMISSIONS[item.label]
      if (mod === null || mod === undefined) return true
      // Suporte a OR: array de módulos — basta ter ao menos um
      if (Array.isArray(mod)) return mod.some(m => modules.includes(m))
      return modules.includes(mod)
    }),
  })).filter(group => group.items.length > 0)
}
