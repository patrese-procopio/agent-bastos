"""
enrichment.py — Enriquecimento via IA (Groq)
Agent Bastos | Segurança Pública/Corporativa

Responsabilidades:
  1. Consolidar dados brutos de múltiplas fontes
  2. Entity resolution — "João Silva" e "J. Silva Santos" são a mesma pessoa?
  3. Extrair vínculos estruturados (pessoa → empresa → processo)
  4. Gerar risk score fundamentado
  5. Produzir resumo executivo para o relatório

Por que Groq aqui e não regras fixas?
  Dados OSINT são sujos: nomes inconsistentes, datas faltando,
  textos livres em notícias e processos. LLM resolve o que
  regex e lógica if/else não conseguem — entende contexto,
  deduplica entidades, extrai relações de texto narrativo.

Arquitetura:
  SourceResult[] → _build_prompt() → Groq → JSON → OsintReport
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from groq import AsyncGroq

from .models import (
    EdgeType,
    NodeType,
    OsintReport,
    OsintRequest,
    PersonNode,
    RelationEdge,
    RiskLevel,
    SourceName,
    SourceResult,
    VinculoGraph,
)

logger = logging.getLogger(__name__)

# Modelo Groq — llama3 é rápido e preciso para extração estruturada
GROQ_MODEL = "llama-3.3-70b-versatile"

# Schema JSON que o Groq deve retornar — instrução explícita evita alucinação
EXPECTED_SCHEMA = """
{
  "risk_level": "critico|alto|medio|baixo|sem_dado",
  "risk_summary": "resumo executivo em 2-3 frases",
  "risk_indicators": ["lista", "de", "fatores", "de", "risco"],
  "processos_criminais": [
    {
      "numero": "...",
      "tribunal": "...",
      "classe": "...",
      "assuntos": ["..."],
      "status": "...",
      "data": "..."
    }
  ],
  "processos_civeis": [...],
  "mandados_prisao": [
    {
      "numero": "...",
      "tipo": "...",
      "status": "ativo|cumprido|revogado",
      "data_expedicao": "..."
    }
  ],
  "vinculos_empresariais": [
    {
      "cnpj": "...",
      "razao_social": "...",
      "qualificacao": "...",
      "situacao": "..."
    }
  ],
  "mencoes_midia": [
    {
      "titulo": "...",
      "veiculo": "...",
      "data": "...",
      "relevancia": "alta|media|baixa",
      "sentimento": "negativo|neutro|positivo"
    }
  ],
  "mencoes_dou": [
    {
      "titulo": "...",
      "orgao": "...",
      "data": "...",
      "tipo": "nomeacao|exoneracao|sancao|contrato|outro"
    }
  ],
  "vinculos_identificados": [
    {
      "entidade": "nome da entidade",
      "tipo": "pessoa|empresa|processo|evento",
      "relacao": "socio_de|familiar_de|reu_em|citado_em|mandado_ativo|doou_para",
      "fonte": "datajud|cnpj_ws|brasil_io|diario_oficial|gnews|bnmp_portal"
    }
  ],
  "subject_name_normalizado": "nome completo normalizado da pessoa pesquisada"
}
"""


class OsintEnrichment:
    """
    Camada de enriquecimento via Groq.

    Uso:
        enrichment = OsintEnrichment()
        report = await enrichment.enrich(request, source_results)
    """

    def __init__(self) -> None:
        self.client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY", ""))

    async def enrich(
        self,
        request: OsintRequest,
        source_results: list[SourceResult],
    ) -> OsintReport:
        """
        Ponto de entrada principal.
        Recebe os dados brutos e devolve o OsintReport completo.
        """
        # Guarda temporariamente para uso no fallback (thread-safe em async)
        self._current_source_results = source_results

        # Monta o contexto que vai pro Groq
        prompt = self._build_prompt(request, source_results)

        # Chama o Groq
        ai_response = await self._call_groq(prompt)

        # Monta o relatório com os dados estruturados
        report = self._build_report(request, source_results, ai_response)

        return report

    # ── privados ──────────────────────────────

    def _build_prompt(
        self,
        request: OsintRequest,
        source_results: list[SourceResult],
    ) -> str:
        """
        Constrói o prompt de análise.

        Estratégia de prompt:
          - Papel claro: analista de inteligência (não chatbot genérico)
          - Dados estruturados por fonte (facilita referência cruzada)
          - Schema JSON explícito (evita formato livre)
          - Instrução de output: APENAS JSON, sem texto antes ou depois
          - LGPD: instrui a não inventar dados que não estão nas fontes
        """
        # Serializa dados de cada fonte
        dados_por_fonte = []
        for result in source_results:
            if result.success and result.raw_data:
                dados_por_fonte.append(
                    f"### Fonte: {result.source.value} "
                    f"({result.items_found} registros)\n"
                    + json.dumps(result.raw_data, ensure_ascii=False, indent=2)
                )

        dados_texto = "\n\n".join(dados_por_fonte) if dados_por_fonte else "Nenhuma fonte retornou dados."

        fontes_com_erro = [r for r in source_results if not r.success]
        erros_texto = ""
        if fontes_com_erro:
            erros_texto = "\n### Fontes com erro (não incluídas na análise):\n"
            erros_texto += "\n".join(f"- {r.source.value}: {r.error_message}" for r in fontes_com_erro)

        return f"""Você é um analista de inteligência de segurança corporativa e pública.
Sua tarefa é analisar dados OSINT coletados de fontes públicas sobre uma pessoa
e produzir uma avaliação estruturada de risco.


ATENÇÃO — REGRAS DE RISCO (analise TODOS os dados, incluindo títulos de notícias e DOU):

PROCESSOS ESTRUTURADOS:
- Se o campo "resumo" mencionar Ministério Público como parte recorrente → risco ALTO ou CRITICO
- Se houver 10 ou mais processos no total → risco ALTO no mínimo
- Se houver processos criminais envolvendo MP ou Polícia → risco ALTO ou CRITICO
- Nunca classifique como BAIXO ou MÉDIO se houver múltiplos processos com MP como parte

LEITURA TEXTUAL DE NOTÍCIAS E DOU (CRÍTICO — não ignore):
- Analise CADA título de notícia retornada. Notícias são fontes legítimas de sinais de risco.
- Termos que indicam risco CRÍTICO: "tráfico", "traficante", "homicídio", "facção", "PCC", "Comando Vermelho", "CV", "FDN", "associação criminosa", "crime organizado", "operação policial", "mandado de prisão", "indiciado", "preso em", "apreensão"
- Termos que indicam risco ALTO: "investigação", "denúncia", "réu", "indiciamento", "Polícia Federal", "Polícia Civil", "Ministério Público"
- 3 OU MAIS notícias com vocabulário criminal → risco ALTO no mínimo
- 5 OU MAIS notícias com vocabulário criminal OU menção a facção → risco CRITICO
- O nome ser citado em bilhetes/cartas/missivas de facções é indicador CRÍTICO
- NUNCA retorne "SEM DADO" se há 3+ notícias com vocabulário criminal — extraia os sinais e classifique

INDICADORES DE RISCO: extraia em risk_indicators os sinais textuais detectados (ex: "Citado em bilhetes do CV", "Operação policial em Manaus", "3 menções a facção")

## Pessoa pesquisada
- Nome informado: {request.nome or 'não informado'}
- CPF: {request.cpf_mascarado()} (mascarado por LGPD)
- Finalidade da pesquisa: {request.lgpd_purpose.value}

## Dados coletados das fontes públicas

{dados_texto}
{erros_texto}

## Instruções de análise

1. **Entity resolution**: os dados podem mencionar variações do nome.
   Identifique quais registros se referem à pessoa pesquisada com confiança.
   Ignore registros que claramente são de outra pessoa homônima.

2. **Risk scoring**:
   - CRÍTICO: mandado de prisão ativo OU condenação criminal transitada em julgado
   - ALTO: processo criminal em curso como réu OU indiciamento policial
   - MÉDIO: processos cíveis relevantes, sanções administrativas, restrições
   - BAIXO: apenas menções neutras, processos antigos encerrados, dados cadastrais limpos
   - SEM_DADO: fontes não retornaram informações suficientes

3. **Vínculos**: extraia APENAS vínculos que aparecem explicitamente nos dados.
   Não infira ou invente conexões que não estão documentadas.

4. **LGPD**: não reproduza CPF completo, dados bancários ou informações
   que não estavam nas fontes originais.

## Output

Responda SOMENTE com JSON válido, sem texto antes ou depois, sem markdown,
sem blocos de código. Use exatamente este schema:

{EXPECTED_SCHEMA}"""

    async def _call_groq(self, prompt: str) -> dict[str, Any]:
        """
        Chama o Groq e parseia o JSON retornado.

        Usa temperature=0 para máxima consistência — análise de risco
        não é criativa, precisa ser determinística.
        """
        try:
            response = await self.client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                max_tokens=4096,
            )

            content = response.choices[0].message.content.strip()

            # Remove markdown se o modelo ignorou a instrução
            if content.startswith("```"):
                lines = content.split("\n")
                content = "\n".join(
                    line for line in lines
                    if not line.startswith("```")
                )

            return json.loads(content)

        except json.JSONDecodeError as e:
            logger.error("Groq retornou JSON inválido: %s", str(e))
            return self._fallback_response(getattr(self, "_current_source_results", None))
        except Exception as e:
            logger.error("Erro ao chamar Groq: %s", str(e))
            return self._fallback_response(getattr(self, "_current_source_results", None))

    def _build_report(
        self,
        request: OsintRequest,
        source_results: list[SourceResult],
        ai_data: dict[str, Any],
    ) -> OsintReport:
        """
        Monta o OsintReport final combinando:
          - Metadados da requisição
          - Resultados brutos das fontes
          - Dados estruturados pelo Groq
          - Grafo de vínculos construído
        """
        # Monta o grafo de vínculos
        graph = self._build_graph(request, ai_data)

        # Converte risk_level string → enum
        risk_str = ai_data.get("risk_level", "sem_dado")
        try:
            risk_level = RiskLevel(risk_str)
        except ValueError:
            risk_level = RiskLevel.SEM_DADO

        # Override de risco baseado em dados objetivos do BuscaProcessos
        # O Groq pode ser conservador — dados estruturados têm precedência
        for result in source_results:
            for item in result.raw_data:
                risco_dado = item.get("risco_sugerido", "")
                if risco_dado == "critico":
                    risk_level = RiskLevel.CRITICO
                    break
                elif risco_dado == "alto" and risk_level not in [RiskLevel.CRITICO]:
                    risk_level = RiskLevel.ALTO

        return OsintReport(
            request_id=request.request_id,
            operator_id=request.operator_id,
            lgpd_purpose=request.lgpd_purpose,
            subject_name=ai_data.get("subject_name_normalizado") or request.nome,
            subject_cpf_masked=request.cpf_mascarado(),
            risk_level=risk_level,
            risk_summary=ai_data.get("risk_summary"),
            risk_indicators=ai_data.get("risk_indicators", []),
            source_results=source_results,
            graph=graph,
            processos_criminais=ai_data.get("processos_criminais", []),
            processos_civeis=ai_data.get("processos_civeis", []),
            mandados_prisao=ai_data.get("mandados_prisao", []),
            vinculos_empresariais=ai_data.get("vinculos_empresariais", []),
            mencoes_midia=ai_data.get("mencoes_midia", []),
            mencoes_dou=ai_data.get("mencoes_dou", []),
        )

    def _build_graph(
        self,
        request: OsintRequest,
        ai_data: dict[str, Any],
    ) -> VinculoGraph:
        """
        Constrói o grafo de vínculos a partir dos vínculos extraídos pelo Groq.

        Estrutura:
          Nó raiz (pessoa pesquisada) → arestas → nós vinculados

        O grafo é serializado como JSON no relatório e renderizado
        no front-end com vis.js ou D3.
        """
        graph = VinculoGraph()

        # Nó raiz — a pessoa pesquisada
        subject_name = ai_data.get("subject_name_normalizado") or request.nome or "Pessoa pesquisada"
        root = PersonNode(
            node_type=NodeType.PESSOA,
            label=subject_name,
            is_subject=True,
            risk_level=RiskLevel(ai_data.get("risk_level", "sem_dado")),
        )
        graph.nodes.append(root)

        # Adiciona vínculos identificados pelo Groq
        for vinculo in ai_data.get("vinculos_identificados", []):
            entidade = vinculo.get("entidade", "")
            if not entidade:
                continue

            # Mapeia tipo de nó
            tipo_str = vinculo.get("tipo", "pessoa")
            try:
                node_type = NodeType(tipo_str)
            except ValueError:
                node_type = NodeType.PESSOA

            # Cria nó vinculado
            node = PersonNode(
                node_type=node_type,
                label=entidade,
                source=self._parse_source(vinculo.get("fonte")),
            )
            graph.add_node(node)

            # Mapeia tipo de aresta
            relacao_str = vinculo.get("relacao", "citado_em")
            try:
                edge_type = EdgeType(relacao_str)
            except ValueError:
                edge_type = EdgeType.CITADO_EM

            # Cria aresta root → nó
            edge = RelationEdge(
                source_id=root.node_id,
                target_id=node.node_id,
                edge_type=edge_type,
                label=relacao_str.replace("_", " "),
                data_source=self._parse_source(vinculo.get("fonte")),
            )
            graph.edges.append(edge)

        # Adiciona nós de processos criminais como nós do grafo
        for proc in ai_data.get("processos_criminais", []):
            node = PersonNode(
                node_type=NodeType.PROCESSO,
                label=proc.get("numero", "Processo"),
                properties=proc,
                risk_level=RiskLevel.ALTO,
                source=SourceName.DATAJUD,
            )
            graph.add_node(node)
            edge = RelationEdge(
                source_id=root.node_id,
                target_id=node.node_id,
                edge_type=EdgeType.REU_EM,
                label="réu em",
                weight=0.9,
                data_source=SourceName.DATAJUD,
            )
            graph.edges.append(edge)

        return graph

    def _parse_source(self, fonte_str: str | None) -> SourceName | None:
        if not fonte_str:
            return None
        try:
            return SourceName(fonte_str)
        except ValueError:
            return None


    def _fallback_response(
        self,
        source_results: list[SourceResult] | None = None,
    ) -> dict[str, Any]:
        """
        Fallback inteligente — quando o Groq falha, analisa os dados brutos
        e monta um sumário estruturado com regras determinísticas.

        Por que isso importa operacionalmente:
          O analista precisa tomar decisão. "Verifique os resultados brutos"
          não serve — ele precisa saber quantos processos, qual risco mínimo,
          quais fontes retornaram dado. Este método entrega isso sem IA.

        Padrão de design: Rule-Based NLG (Natural Language Generation).
        Clássico em sistemas de BI críticos onde previsibilidade > criatividade.
        """
        if not source_results:
            return {
                "risk_level": "sem_dado",
                "risk_summary": "IA indisponível. Nenhuma fonte retornou dados para análise automática.",
                "risk_indicators": ["IA indisponível", "Sem dados de fontes"],
                "processos_criminais": [],
                "processos_civeis": [],
                "mandados_prisao": [],
                "vinculos_empresariais": [],
                "mencoes_midia": [],
                "mencoes_dou": [],
                "vinculos_identificados": [],
                "subject_name_normalizado": None,
            }

        summary = self._fallback_summary_from_data(source_results)

        return {
            "risk_level": summary["risk_level"],
            "risk_summary": summary["texto"],
            "risk_indicators": summary["indicadores"],
            "processos_criminais": summary["processos_criminais"],
            "processos_civeis": [],
            "mandados_prisao": summary["mandados"],
            "vinculos_empresariais": summary["empresas"],
            "mencoes_midia": summary["noticias"],
            "mencoes_dou": [],
            "vinculos_identificados": [],
            "subject_name_normalizado": None,
        }

    def _fallback_summary_from_data(
        self,
        source_results: list[SourceResult],
    ) -> dict[str, Any]:
        """
        Lê os raw_data de cada SourceResult e extrai métricas objetivas.

        Campos que cada collector pode trazer (não obrigatórios — usa .get()):
          BuscaProcessos / Datajud:
            quantidade_processos, risco_sugerido, resumo, processos[]
          BNMP:
            mandados[], quantidade_mandados
          CNPJ_WS:
            empresas[]
          GNews:
            noticias[], artigos[]
        """
        # ── acumuladores ──────────────────────────────────────────────────────
        total_processos    = 0
        processos_extraidos: list[dict] = []
        mandados_extraidos: list[dict]  = []
        empresas_extraidas: list[dict]  = []
        noticias_extraidas: list[dict]  = []
        indicadores: list[str]          = []
        fontes_ok: list[str]            = []
        risco_maximo                    = "sem_dado"

        ORDEM_RISCO = ["sem_dado", "baixo", "medio", "alto", "critico"]

        def _eleva_risco(atual: str, novo: str) -> str:
            """Sobe o risco se o novo for mais grave que o atual."""
            idx_atual = ORDEM_RISCO.index(atual) if atual in ORDEM_RISCO else 0
            idx_novo  = ORDEM_RISCO.index(novo)  if novo  in ORDEM_RISCO else 0
            return ORDEM_RISCO[max(idx_atual, idx_novo)]

        # ── itera fontes ──────────────────────────────────────────────────────
        for result in source_results:
            if not result.success or not result.raw_data:
                continue

            fontes_ok.append(result.source.value)

            for item in result.raw_data:

                # ── BuscaProcessos / Datajud ──────────────────────────────────
                qtd = item.get("quantidade_processos", 0)
                if qtd:
                    total_processos += int(qtd)
                    if int(qtd) >= 10:
                        indicadores.append(f"{qtd} processos encontrados")
                    elif int(qtd) >= 1:
                        indicadores.append(f"{qtd} processo(s) encontrado(s)")

                risco_dado = item.get("risco_sugerido", "")
                if risco_dado:
                    risco_maximo = _eleva_risco(risco_maximo, risco_dado)

                resumo = item.get("resumo", "")
                if resumo:
                    # Detecta keywords de risco no resumo textual
                    resumo_lower = resumo.lower()
                    if any(k in resumo_lower for k in ["tráfico", "trafico", "homicídio", "homicidio", "crime organizado", "associação criminosa"]):
                        risco_maximo = _eleva_risco(risco_maximo, "critico")
                        indicadores.append("Crime grave identificado no resumo")
                    if "ministério público" in resumo_lower or "ministério publico" in resumo_lower:
                        risco_maximo = _eleva_risco(risco_maximo, "alto")
                        indicadores.append("Ministério Público como parte")
                    if "indiciado" in resumo_lower or "indiciamento" in resumo_lower:
                        risco_maximo = _eleva_risco(risco_maximo, "alto")
                        indicadores.append("Indiciamento policial")

                # Lista de processos individuais (quando disponível)
                for proc in item.get("processos", []):
                    processos_extraidos.append({
                        "numero":   proc.get("numero", "N/D"),
                        "tribunal": proc.get("tribunal", "N/D"),
                        "classe":   proc.get("classe", "N/D"),
                        "assuntos": proc.get("assuntos", []),
                        "status":   proc.get("status", "N/D"),
                        "data":     proc.get("data_ajuizamento", "N/D"),
                    })

                # ── BNMP (mandados) ───────────────────────────────────────────
                for mandado in item.get("mandados", []):
                    mandados_extraidos.append({
                        "numero":           mandado.get("numero", "N/D"),
                        "tipo":             mandado.get("tipo", "N/D"),
                        "status":           mandado.get("status", "ativo"),
                        "data_expedicao":   mandado.get("data", "N/D"),
                    })
                    risco_maximo = _eleva_risco(risco_maximo, "critico")
                    indicadores.append("Mandado de prisão identificado")

                qtd_mandados = item.get("quantidade_mandados", 0)
                if qtd_mandados:
                    risco_maximo = _eleva_risco(risco_maximo, "critico")
                    indicadores.append(f"{qtd_mandados} mandado(s) de prisão")

                # ── CNPJ_WS (empresas) ────────────────────────────────────────
                for empresa in item.get("empresas", []):
                    empresas_extraidas.append({
                        "cnpj":         empresa.get("cnpj", "N/D"),
                        "razao_social": empresa.get("razao_social", "N/D"),
                        "qualificacao": empresa.get("qualificacao", "sócio"),
                        "situacao":     empresa.get("situacao", "N/D"),
                    })

                # ── GNews (notícias) ──────────────────────────────────────────
                for noticia in item.get("noticias", item.get("artigos", [])):
                    noticias_extraidas.append({
                        "titulo":     noticia.get("titulo", noticia.get("title", "N/D")),
                        "veiculo":    noticia.get("fonte",  noticia.get("source", "N/D")),
                        "data":       noticia.get("data",   noticia.get("date",   "N/D")),
                        "relevancia": "alta",
                        "sentimento": "negativo",
                    })

        # ── Remove duplicatas em indicadores ──────────────────────────────────
        indicadores = list(dict.fromkeys(indicadores))

        if not indicadores:
            indicadores = ["Análise automática — IA indisponível"]

        if risco_maximo == "sem_dado" and total_processos > 0:
            risco_maximo = "medio"

        # ── Monta o texto do sumário ──────────────────────────────────────────
        partes: list[str] = ["[MODO OFFLINE — análise automática sem IA]"]

        if total_processos > 0:
            partes.append(f"{total_processos} processo(s) identificado(s) nas fontes consultadas.")

        if mandados_extraidos or any("mandado" in i.lower() for i in indicadores):
            partes.append("Mandado(s) de prisão detectado(s) — verificação imediata recomendada.")

        if empresas_extraidas:
            partes.append(f"Vínculo(s) empresarial(is) encontrado(s): {len(empresas_extraidas)} empresa(s).")

        if noticias_extraidas:
            partes.append(f"{len(noticias_extraidas)} menção(ões) na mídia.")

        if fontes_ok:
            partes.append(f"Fontes com retorno: {', '.join(fontes_ok)}.")

        if risco_maximo in ("alto", "critico"):
            partes.append("Groq indisponível — revise os dados brutos para análise completa.")

        texto = " ".join(partes)

        return {
            "risk_level":         risco_maximo,
            "texto":              texto,
            "indicadores":        indicadores,
            "processos_criminais": processos_extraidos,
            "mandados":           mandados_extraidos,
            "empresas":           empresas_extraidas,
            "noticias":           noticias_extraidas,
        }


