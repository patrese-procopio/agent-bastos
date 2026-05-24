/**
 * iconesGrafo.js — Galeria de ícones do Motor de Vínculos (mini i2)
 * Foco: atividade policial, investigativa, social, penitenciária e jurídica.
 *
 * CATEGORIAS  → tipos de nó (definem a COR do nó). Espelham TIPOS_NO do backend.
 * GALERIA     → ícones (emoji) agrupados por tema, para escolher ao criar um nó.
 *               Cada item carrega o `tipo` sugerido (categoria/cor).
 */

/* ── Categorias (tipo de nó → cor) ── */
export const CATEGORIAS = [
  { id: "pessoa",      label: "Pessoa",       cor: "#E8A020" },
  { id: "faccao",      label: "Facção",       cor: "#EF4444" },
  { id: "local",       label: "Local/Unidade",cor: "#60A5FA" },
  { id: "crime",       label: "Crime",        cor: "#FB923C" },
  { id: "juridico",    label: "Jurídico",     cor: "#A78BFA" },
  { id: "documento",   label: "Documento",    cor: "#38BDF8" },
  { id: "social",      label: "Social/Vínculo",cor: "#4ADE80" },
  { id: "geografia",   label: "Geografia",    cor: "#2DD4BF" },
  { id: "financeiro",  label: "Financeiro",   cor: "#FBBF24" },
  { id: "organizacao", label: "Organização",  cor: "#818CF8" },
  { id: "evento",      label: "Evento",       cor: "#F472B6" },
  { id: "generico",    label: "Genérico",     cor: "#94A3B8" },
]

const COR = Object.fromEntries(CATEGORIAS.map(c => [c.id, c.cor]))
export const corCategoria = (tipo) => COR[tipo] || COR.generico
export const labelCategoria = (tipo) =>
  (CATEGORIAS.find(c => c.id === tipo) || {}).label || "Genérico"

/* ── Ícone padrão por categoria ── */
export const ICONE_PADRAO = {
  pessoa: "👤", faccao: "🏴", local: "🏛️", crime: "🔫",
  juridico: "⚖️", documento: "📄", social: "🤝", geografia: "🌎",
  financeiro: "💰", organizacao: "🏢", evento: "⚡", generico: "⚪",
}
export const iconePadrao = (tipo) => ICONE_PADRAO[tipo] || "⚪"

/* ── Galeria temática ── */
export const GALERIA = [
  {
    grupo: "Pessoas & Papéis", tipo: "pessoa", itens: [
      { e: "👤", n: "Pessoa" }, { e: "👥", n: "Grupo" }, { e: "🕵️", n: "Investigador" },
      { e: "👮", n: "Policial" }, { e: "🥷", n: "Foragido" }, { e: "🧔", n: "Líder" },
      { e: "🗣️", n: "Porta-voz" }, { e: "👁️", n: "Olheiro/Vigia" }, { e: "🤵", n: "Advogado" },
      { e: "👨‍⚖️", n: "Juiz" }, { e: "👨‍💼", n: "Agente público" }, { e: "🧑‍🤝‍🧑", n: "Apadrinhado" },
      { e: "👶", n: "Aviãozinho" }, { e: "💀", n: "Morto" }, { e: "🚶", n: "Em fuga" },
      { e: "🦹", n: "Comparsa" }, { e: "👷", n: "Trabalhador" }, { e: "🧓", n: "Chefe antigo" },
      { e: "🧑‍🦱", n: "Suspeito" }, { e: "🤰", n: "Mula/gestante" },
    ],
  },
  {
    grupo: "Facções & Organizações", tipo: "faccao", itens: [
      { e: "🏴", n: "Facção" }, { e: "🚩", n: "Domínio" }, { e: "🏳️", n: "Neutro" },
      { e: "⚔️", n: "Guerra de facções" }, { e: "☠️", n: "Comando/ameaça" }, { e: "🐉", n: "Símbolo" },
      { e: "🦅", n: "Símbolo (águia)" }, { e: "🔺", n: "Marca △" }, { e: "🔻", n: "Marca ▽" },
      { e: "♠️", n: "Naipe ♠" }, { e: "♦️", n: "Naipe ♦" }, { e: "🅱️", n: "Sigla B" },
      { e: "Ⓜ️", n: "Sigla M" }, { e: "🏢", n: "Organização" }, { e: "🏭", n: "Empresa de fachada" },
      { e: "⛓️", n: "Estrutura" }, { e: "🤜", n: "Confronto" },
    ],
  },
  {
    grupo: "Sistema Prisional", tipo: "local", itens: [
      { e: "🏛️", n: "Unidade prisional" }, { e: "🏚️", n: "Pavilhão" }, { e: "🔒", n: "Cela/cadeado" },
      { e: "🔓", n: "Evasão" }, { e: "⛓️", n: "Preso/algema" }, { e: "🚔", n: "Viatura" },
      { e: "🚓", n: "Patrulha" }, { e: "🚨", n: "Sirene" }, { e: "🧱", n: "Muro" },
      { e: "🪪", n: "Prontuário" }, { e: "🆔", n: "Identificação" }, { e: "🛏️", n: "Custódia" },
      { e: "🔑", n: "Chave" }, { e: "👮‍♂️", n: "Agente penitenciário" }, { e: "🚧", n: "Barreira" },
      { e: "🏗️", n: "Obra/canteiro" }, { e: "📿", n: "Disciplina" }, { e: "🚪", n: "Acesso/grade" },
    ],
  },
  {
    grupo: "Crime & Operacional", tipo: "crime", itens: [
      { e: "🔫", n: "Arma de fogo" }, { e: "🔪", n: "Arma branca" }, { e: "🗡️", n: "Lâmina" },
      { e: "💣", n: "Explosivo" }, { e: "🧨", n: "Dinamite" }, { e: "💊", n: "Drogas (comprimido)" },
      { e: "🌿", n: "Maconha" }, { e: "💉", n: "Injetável" }, { e: "🚬", n: "Cigarro/contrabando" },
      { e: "⚗️", n: "Refino" }, { e: "📦", n: "Carga/entorpecente" }, { e: "🚗", n: "Roubo de veículo" },
      { e: "🏠", n: "Roubo residência" }, { e: "⚰️", n: "Homicídio" }, { e: "🩸", n: "Violência" },
      { e: "🔥", n: "Incêndio/atentado" }, { e: "🎯", n: "Alvo" }, { e: "🆘", n: "Socorro" },
      { e: "🪓", n: "Ferramenta" }, { e: "🪤", n: "Emboscada" }, { e: "🥊", n: "Agressão" },
    ],
  },
  {
    grupo: "Jurídico & Processual", tipo: "juridico", itens: [
      { e: "⚖️", n: "Justiça/condenação" }, { e: "🔨", n: "Sentença (martelo)" }, { e: "📜", n: "Alvará/decisão" },
      { e: "📋", n: "Processo/inquérito" }, { e: "📑", n: "Autos" }, { e: "⛓️", n: "Prisão decretada" },
      { e: "🔐", n: "Mandado" }, { e: "🆓", n: "Alvará de soltura" }, { e: "⏳", n: "Pena/prazo" },
      { e: "🗓️", n: "Audiência" }, { e: "🔏", n: "Sigilo" }, { e: "✍️", n: "Decisão/assinatura" },
      { e: "📛", n: "Antecedentes" }, { e: "🚫", n: "Medida cautelar" }, { e: "🏷️", n: "Tipificação" },
    ],
  },
  {
    grupo: "Documentos & Inteligência", tipo: "documento", itens: [
      { e: "📄", n: "Documento/RELINT" }, { e: "📝", n: "Catatau/anotação" }, { e: "🗒️", n: "Bloco" },
      { e: "📰", n: "Notícia" }, { e: "📁", n: "Dossiê" }, { e: "🗂️", n: "Arquivo" },
      { e: "🗃️", n: "Fichário" }, { e: "✉️", n: "Missiva/carta" }, { e: "📨", n: "Mensagem" },
      { e: "✂️", n: "Bilhete" }, { e: "📇", n: "Cadastro" }, { e: "📊", n: "Relatório" },
      { e: "📈", n: "Tendência" }, { e: "🔍", n: "Análise/lupa" }, { e: "📡", n: "Interceptação" },
      { e: "🛰️", n: "Monitoramento" }, { e: "📱", n: "Celular" }, { e: "☎️", n: "Telefone" },
      { e: "📞", n: "Escuta telefônica" }, { e: "💬", n: "Conversa/chat" }, { e: "💻", n: "Computador" },
      { e: "📷", n: "Foto/vigilância" }, { e: "🎥", n: "Vídeo/CFTV" }, { e: "🎙️", n: "Áudio/escuta" },
    ],
  },
  {
    grupo: "Social & Vínculos", tipo: "social", itens: [
      { e: "🤝", n: "Aliança/parceria" }, { e: "👨‍👩‍👧", n: "Família" }, { e: "💍", n: "Cônjuge" },
      { e: "❤️", n: "Relacionamento" }, { e: "💔", n: "Rompimento" }, { e: "🩸", n: "Parentesco" },
      { e: "🏘️", n: "Comunidade" }, { e: "⛪", n: "Igreja" }, { e: "🏫", n: "Escola" },
      { e: "💼", n: "Trabalho" }, { e: "🎓", n: "Formação" }, { e: "🍻", n: "Convivência" },
      { e: "👬", n: "Irmandade" }, { e: "🧑‍🍼", n: "Padrinho" }, { e: "🤲", n: "Apoio" },
    ],
  },
  {
    grupo: "Geografia & Rotas", tipo: "geografia", itens: [
      { e: "📍", n: "Local/ponto" }, { e: "🗺️", n: "Região/mapa" }, { e: "🌎", n: "País/internacional" },
      { e: "🏙️", n: "Cidade" }, { e: "🏘️", n: "Favela/comunidade" }, { e: "🛣️", n: "Rota terrestre" },
      { e: "🛂", n: "Fronteira" }, { e: "✈️", n: "Tráfico aéreo" }, { e: "🚢", n: "Tráfico marítimo" },
      { e: "⚓", n: "Porto" }, { e: "🚏", n: "Ponto de encontro" }, { e: "🧭", n: "Direção" },
      { e: "🏞️", n: "Mata/divisa" }, { e: "🚁", n: "Helicóptero" }, { e: "🛻", n: "Comboio" },
    ],
  },
  {
    grupo: "Financeiro & Patrimônio", tipo: "financeiro", itens: [
      { e: "💰", n: "Dinheiro/tesouraria" }, { e: "💵", n: "Cédula" }, { e: "🪙", n: "Moeda" },
      { e: "💳", n: "Cartão" }, { e: "🏦", n: "Banco" }, { e: "🏧", n: "Saque/lavagem" },
      { e: "💸", n: "Transferência" }, { e: "🧾", n: "Comprovante" }, { e: "💹", n: "Contabilidade" },
      { e: "🏠", n: "Imóvel" }, { e: "🚙", n: "Bens/veículo" }, { e: "⌚", n: "Bens de luxo" },
      { e: "💎", n: "Joias" }, { e: "🪪", n: "Conta laranja" },
    ],
  },
  {
    grupo: "Eventos & Tempo", tipo: "evento", itens: [
      { e: "⚡", n: "Evento/operação" }, { e: "💥", n: "Confronto/atentado" }, { e: "📅", n: "Data" },
      { e: "📆", n: "Calendário" }, { e: "⏰", n: "Horário" }, { e: "🚨", n: "Operação policial" },
      { e: "🎯", n: "Ação planejada" }, { e: "🔔", n: "Marco/alerta" }, { e: "🏁", n: "Início" },
      { e: "⚠️", n: "Aviso" }, { e: "📌", n: "Marco fixado" }, { e: "🎆", n: "Rebelião" },
    ],
  },
  {
    grupo: "Genéricos & Marcadores", tipo: "generico", itens: [
      { e: "⚪", n: "Ponto neutro" }, { e: "🔵", n: "Marcador azul" }, { e: "🔴", n: "Marcador vermelho" },
      { e: "🟢", n: "Marcador verde" }, { e: "🟡", n: "Marcador amarelo" }, { e: "🟣", n: "Marcador roxo" },
      { e: "🟠", n: "Marcador laranja" }, { e: "⭐", n: "Destaque" }, { e: "❗", n: "Importante" },
      { e: "❓", n: "A apurar" }, { e: "🏷️", n: "Etiqueta" }, { e: "📌", n: "Pino" },
      { e: "🔗", n: "Vínculo" }, { e: "🧩", n: "Conexão" }, { e: "🎭", n: "Identidade falsa" },
      { e: "♟️", n: "Posição" },
    ],
  },
]
