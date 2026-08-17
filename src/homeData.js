// homeData.js — dados estáticos da tela Painel (referências rápidas do chat).
// NEWS/liveNews (widget de notícias na home) foi removido nesta refatoração:
// era código morto — o estado `liveNews` e o polling em /noticias existiam,
// mas nada em tela consumia o resultado (`newsToShow` nunca era renderizado).
export const REFS = [
  { label: "Relatórios operacionais",  color: "#A78BFA", query: "Liste os relatórios operacionais disponíveis na base doutrinária." },
  { label: "Documentos históricos",    color: "#A78BFA", query: "Quais documentos históricos estão catalogados no sistema?" },
  { label: "Arquivos de inteligência", color: "#60A5FA", query: "Apresente os arquivos de inteligência disponíveis." },
  { label: "Busca por período",        color: "#60A5FA", query: "Pesquise documentos produzidos no último mês." },
  { label: "Drive institucional",      color: "#34D399", query: "Liste o conteúdo do drive institucional." },
]
