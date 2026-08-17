import { lazy, Suspense } from "react"
import ErrorBoundary from "./ErrorBoundary"
import Painel from "./Painel"
import { C, MONO } from "./shellTheme"

// Lazy imports — cada módulo vira chunk separado, carregado só na primeira navegação
const ChatRAG          = lazy(() => import("./ChatRAG"))
const Dashboard        = lazy(() => import("./Dashboard"))
const Transcricao      = lazy(() => import("./Transcricao"))
const Alertas          = lazy(() => import("./Alertas"))
const Noticias         = lazy(() => import("./Noticias"))
const Referencias      = lazy(() => import("./Referencias"))
const Configuracoes    = lazy(() => import("./Configuracoes"))
const Agenda           = lazy(() => import("./Agenda"))
const ListaNegra       = lazy(() => import("./ListaNegra"))
const OsintPesquisa    = lazy(() => import("./OsintPesquisa"))
const Grafoscopia      = lazy(() => import("./Grafoscopia"))
const ControleGrupos   = lazy(() => import("./ControleGrupos"))
// InteligenciaGrupos movido para dentro de ControleGrupos (lazy interno)
const LiderancasUnidade  = lazy(() => import("./LiderancasUnidade"))
const GrafoVinculos    = lazy(() => import("./GrafoVinculos"))
const Extrato          = lazy(() => import("./Extrato"))
const InteligenciaPreditiva = lazy(() => import("./InteligenciaPreditiva"))
// LideresGerais movido para dentro de LiderancasUnidade (lazy interno)
const HitlDashboard    = lazy(() => import("./HitlDashboard"))
const OperacoesDrone   = lazy(() => import("./OperacoesDrone"))
// GerenciarUsuarios e AuditoriaLog movidos para dentro de Configuracoes (admin tabs)

const TELAS_CONHECIDAS = [
  "Painel","Chat RAG","Dashboard","Transcrição","Alertas","Notícias","Referências",
  "Configurações","Agenda de Missão","Lista Negra","Controle de Grupos",
  "Lideranças por Unidade","Análise de Vínculo","Análise Grafoscópica",
  "Extrato","Inteligência Preditiva","OSINT Pessoas","ORÁCULO",
  "Operações Drone",
]

// AppRouter — Missão 34: centraliza o mapeamento "tela ativa → componente".
// Antes era uma sequência de 19 `{active==="X" && <Comp/>}` soltos dentro do
// App.jsx; extrair pra cá deixa o App.jsx livre de conhecer os módulos, e
// adicionar uma tela nova vira só uma linha aqui em vez de mexer no shell.
export default function AppRouter({ active, onNavigate, tema, setTema, user, painelProps }) {
  return (
    <Suspense fallback={
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#94A3B8",fontSize:14}}>
        Carregando módulo...
      </div>
    }>
      <div key={active} className="screen-enter" style={{display:"contents"}}>
        {active==="Painel"                 && <Painel {...painelProps}/>}
        {active==="Chat RAG"               && <ErrorBoundary modulo="Chat RAG"><ChatRAG      onNavigate={onNavigate}/></ErrorBoundary>}
        {active==="Dashboard"              && <ErrorBoundary modulo="Dashboard"><Dashboard    onNavigate={onNavigate}/></ErrorBoundary>}
        {active==="Transcrição"            && <ErrorBoundary modulo="Transcrição"><Transcricao  onNavigate={onNavigate}/></ErrorBoundary>}
        {active==="Análise Grafoscópica"   && <ErrorBoundary modulo="Análise Grafoscópica"><Grafoscopia  onNavigate={onNavigate}/></ErrorBoundary>}
        {active==="Alertas"                && <ErrorBoundary modulo="Alertas"><Alertas      onNavigate={onNavigate}/></ErrorBoundary>}
        {active==="Notícias"               && <ErrorBoundary modulo="Notícias"><Noticias     onNavigate={onNavigate}/></ErrorBoundary>}
        {active==="Referências"            && <ErrorBoundary modulo="Referências"><Referencias  onNavigate={onNavigate}/></ErrorBoundary>}
        {active==="Configurações"          && <ErrorBoundary modulo="Configurações"><Configuracoes onNavigate={onNavigate} tema={tema} setTema={setTema} user={user}/></ErrorBoundary>}
        {active==="Controle de Grupos"     && <ErrorBoundary modulo="Controle de Grupos"><ControleGrupos onNavigate={onNavigate}/></ErrorBoundary>}
        {/* Inteligência de Grupos agora é aba interna do Controle de Grupos */}
        {active==="Lideranças por Unidade" && <ErrorBoundary modulo="Lideranças por Unidade"><LiderancasUnidade onNavigate={onNavigate}/></ErrorBoundary>}
        {/* Líderes Gerais agora é aba interna de Lideranças por Unidade */}
        {active==="Análise de Vínculo"     && <ErrorBoundary modulo="Análise de Vínculo"><GrafoVinculos onNavigate={onNavigate}/></ErrorBoundary>}
        {active==="Extrato"                && <ErrorBoundary modulo="Extrato"><Extrato      onNavigate={onNavigate}/></ErrorBoundary>}
        {active==="Inteligência Preditiva"  && <ErrorBoundary modulo="Inteligência Preditiva"><InteligenciaPreditiva onNavigate={onNavigate}/></ErrorBoundary>}
        {active==="Agenda de Missão"       && <ErrorBoundary modulo="Agenda de Missão"><Agenda       onNavigate={onNavigate}/></ErrorBoundary>}
        {active === "Lista Negra"          && <ErrorBoundary modulo="Lista Negra"><ListaNegra     onNavigate={onNavigate} /></ErrorBoundary>}
        {active === "OSINT Pessoas"        && <ErrorBoundary modulo="OSINT Pessoas"><OsintPesquisa  onNavigate={onNavigate} /></ErrorBoundary>}
        {active === "ORÁCULO"              && <ErrorBoundary modulo="ORÁCULO"><HitlDashboard         onNavigate={onNavigate} /></ErrorBoundary>}
        {active === "Operações Drone"      && <ErrorBoundary modulo="Operações Drone"><OperacoesDrone onNavigate={onNavigate} /></ErrorBoundary>}
        {/* Gerenciar Usuários e Auditoria movidos para Configurações (abas admin) */}

        {!TELAS_CONHECIDAS.includes(active) && (
          <div style={{display:"flex",flex:1,alignItems:"center",justifyContent:"center",flexDirection:"column",gap:10}}>
            <div style={{fontSize:17,fontWeight:700,color:C.text}}>{active}</div>
            <div style={{fontSize:13,color:C.textMid,fontFamily:MONO}}>Em desenvolvimento</div>
          </div>
        )}
      </div>
    </Suspense>
  )
}
