"""
models.py — Contratos de dados do módulo OSINT
Agent Bastos | Segurança Pública/Corporativa

Filosofia: cada modelo representa uma "camada" do pipeline.
  OsintRequest      → o que entra (input do operador)
  SourceResult      → o que cada collector retorna (padronizado)
  PersonNode        → nó do grafo (pessoa/empresa/processo)
  RelationEdge      → aresta do grafo (vínculo entre nós)
  OsintReport       → o que sai (output completo)

Por que Pydantic?
  - Validação automática de tipos em runtime
  - Serialização JSON nativa (essencial pro FastAPI)
  - Documentação automática no Swagger
  - LGPD: o campo `lgpd_purpose` é obrigatório por design —
    o sistema não deixa rodar sem finalidade registrada
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator


# ─────────────────────────────────────────────
# ENUMS — valores controlados, sem string livre
# ─────────────────────────────────────────────

class LgpdPurpose(str, Enum):
    """
    Finalidades legítimas conforme Art. 7º LGPD.
    Operador DEVE escolher uma — não existe 'outros'.
    """
    SEGURANCA_PUBLICA       = "seguranca_publica"       # Art. 7º, IX
    PREVENCAO_FRAUDE        = "prevencao_fraude"         # Art. 7º, VII
    DUE_DILIGENCE           = "due_diligence_corporativa"
    INVESTIGACAO_INTERNA    = "investigacao_interna"
    COMPLIANCE_REGULATORIO  = "compliance_regulatorio"


class RiskLevel(str, Enum):
    CRITICO  = "critico"   # mandado ativo, crime grave
    ALTO     = "alto"      # processo criminal em curso
    MEDIO    = "medio"     # processos cíveis, restrições
    BAIXO    = "baixo"     # sem pendências relevantes
    SEM_DADO = "sem_dado"  # fontes não retornaram resultado


class NodeType(str, Enum):
    PESSOA   = "pessoa"
    EMPRESA  = "empresa"
    PROCESSO = "processo"
    VEICULO  = "veiculo"
    IMOVEL   = "imovel"
    EVENTO   = "evento"   # menção em mídia, DOU, etc.


class EdgeType(str, Enum):
    SOCIO_DE        = "socio_de"
    FAMILIAR_DE     = "familiar_de"
    REU_EM          = "reu_em"
    AUTOR_EM        = "autor_em"
    CITADO_EM       = "citado_em"       # mídia, DOU
    MANDADO_ATIVO   = "mandado_ativo"
    DOOU_PARA       = "doou_para"       # dados eleitorais
    PROPRIETARIO_DE = "proprietario_de"


class SourceName(str, Enum):
    DATAJUD  = "datajud"
    CNPJ_WS  = "cnpj_ws"
    BRASIL_IO = "brasil_io"
    DOU      = "diario_oficial"
    GNEWS    = "gnews"
    BNMP     = "bnmp_portal"
    MOCK     = "mock"  # para dev/testes


# ─────────────────────────────────────────────
# INPUT
# ─────────────────────────────────────────────

class OsintRequest(BaseModel):
    """
    Entrada da requisição OSINT.
    Campos mínimos: nome OU cpf (pelo menos um obrigatório).
    """
    request_id: UUID = Field(default_factory=uuid4)
    operator_id: str = Field(..., description="ID do operador — obrigatório para audit log")
    lgpd_purpose: LgpdPurpose = Field(..., description="Finalidade LGPD — obrigatório por design")

    # Identificadores da pessoa pesquisada
    nome: str | None = Field(None, min_length=3)
    cpf: str | None = Field(None, description="Somente dígitos: 11 chars")
    data_nascimento: str | None = Field(None, description="YYYY-MM-DD")
    nome_mae: str | None = None

    # Controle de fontes — permite desligar fontes individualmente
    fontes_ativas: list[SourceName] = Field(
        default_factory=lambda: [
            SourceName.DATAJUD,
            SourceName.CNPJ_WS,
            SourceName.BRASIL_IO,
            SourceName.DOU,
            SourceName.GNEWS,
        ]
    )

    created_at: datetime = Field(default_factory=datetime.utcnow)

    @field_validator("cpf")
    @classmethod
    def cpf_apenas_digitos(cls, v: str | None) -> str | None:
        if v is None:
            return v
        digits = "".join(c for c in v if c.isdigit())
        if len(digits) != 11:
            raise ValueError("CPF deve ter exatamente 11 dígitos")
        return digits

    def cpf_mascarado(self) -> str:
        """Retorna CPF mascarado para logs — nunca loga CPF completo."""
        if not self.cpf:
            return "N/A"
        return f"***.{self.cpf[3:6]}.{self.cpf[6:9]}-**"

    def model_post_init(self, __context: Any) -> None:
        if not self.nome and not self.cpf:
            raise ValueError("Informe ao menos nome ou CPF para a pesquisa")


# ─────────────────────────────────────────────
# RESULTADO DE CADA FONTE (collector output)
# ─────────────────────────────────────────────

class SourceResult(BaseModel):
    """
    Saída padronizada de cada collector.
    Todos os collectors devem retornar esse formato — é o adapter pattern.
    """
    source: SourceName
    success: bool
    raw_data: list[dict[str, Any]] = Field(default_factory=list)
    error_message: str | None = None
    items_found: int = 0
    fetched_at: datetime = Field(default_factory=datetime.utcnow)
    latency_ms: float | None = None


# ─────────────────────────────────────────────
# GRAFO DE VÍNCULOS
# ─────────────────────────────────────────────

class PersonNode(BaseModel):
    """
    Nó do grafo — representa qualquer entidade relevante.
    Pode ser a pessoa pesquisada, um sócio, uma empresa, um processo.
    """
    node_id: str = Field(default_factory=lambda: str(uuid4()))
    node_type: NodeType
    label: str                          # nome para exibição
    properties: dict[str, Any] = Field(default_factory=dict)
    is_subject: bool = False            # True = pessoa pesquisada (nó raiz)
    risk_level: RiskLevel = RiskLevel.SEM_DADO
    source: SourceName | None = None


class RelationEdge(BaseModel):
    """
    Aresta do grafo — vínculo entre dois nós.
    source_id → target_id com tipo e metadados.
    """
    edge_id: str = Field(default_factory=lambda: str(uuid4()))
    source_id: str
    target_id: str
    edge_type: EdgeType
    label: str | None = None            # descrição legível
    weight: float = 1.0                 # força do vínculo (0-1)
    properties: dict[str, Any] = Field(default_factory=dict)
    data_source: SourceName | None = None


class VinculoGraph(BaseModel):
    """Grafo completo de vínculos da pessoa pesquisada."""
    nodes: list[PersonNode] = Field(default_factory=list)
    edges: list[RelationEdge] = Field(default_factory=list)

    def add_node(self, node: PersonNode) -> None:
        # Evita nós duplicados pelo label + tipo
        exists = any(
            n.label == node.label and n.node_type == node.node_type
            for n in self.nodes
        )
        if not exists:
            self.nodes.append(node)

    def get_node_by_label(self, label: str) -> PersonNode | None:
        return next((n for n in self.nodes if n.label == label), None)


# ─────────────────────────────────────────────
# OUTPUT FINAL
# ─────────────────────────────────────────────

class OsintReport(BaseModel):
    """
    Relatório final consolidado — é isso que o endpoint FastAPI retorna
    e que o report_gen.py vai transformar em PDF.
    """
    report_id: UUID = Field(default_factory=uuid4)
    request_id: UUID

    # Metadados de execução
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    operator_id: str
    lgpd_purpose: LgpdPurpose
    execution_time_ms: float | None = None

    # Dados consolidados pela IA (Groq)
    subject_name: str | None = None
    subject_cpf_masked: str | None = None  # NUNCA armazena CPF completo
    risk_level: RiskLevel = RiskLevel.SEM_DADO
    risk_summary: str | None = None        # resumo gerado pelo Groq
    risk_indicators: list[str] = Field(default_factory=list)

    # Resultados por fonte
    source_results: list[SourceResult] = Field(default_factory=list)

    # Grafo de vínculos
    graph: VinculoGraph = Field(default_factory=VinculoGraph)

    # Dados estruturados extraídos
    processos_criminais: list[dict[str, Any]] = Field(default_factory=list)
    processos_civeis: list[dict[str, Any]] = Field(default_factory=list)
    mandados_prisao: list[dict[str, Any]] = Field(default_factory=list)
    vinculos_empresariais: list[dict[str, Any]] = Field(default_factory=list)
    mencoes_midia: list[dict[str, Any]] = Field(default_factory=list)
    mencoes_dou: list[dict[str, Any]] = Field(default_factory=list)

    # Contadores rápidos para o dashboard
    @property
    def total_processos(self) -> int:
        return len(self.processos_criminais) + len(self.processos_civeis)

    @property
    def tem_mandado_ativo(self) -> bool:
        return len(self.mandados_prisao) > 0

    @property
    def fontes_com_erro(self) -> list[str]:
        return [r.source.value for r in self.source_results if not r.success]


# ─────────────────────────────────────────────
# AUDIT LOG — LGPD Art. 37
# ─────────────────────────────────────────────

class AuditLog(BaseModel):
    """
    Registro imutável de cada operação OSINT.
    Art. 37 LGPD: controlador deve manter registro das operações de tratamento.
    Este model NÃO deve ser alterado após criação — append only.
    """
    log_id: UUID = Field(default_factory=uuid4)
    report_id: UUID
    request_id: UUID
    operator_id: str
    lgpd_purpose: LgpdPurpose
    subject_name: str | None = None
    subject_cpf_masked: str | None = None   # CPF mascarado, nunca completo
    fontes_consultadas: list[str] = Field(default_factory=list)
    items_retornados: int = 0
    ip_address: str | None = None           # IP do operador
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    success: bool = True
    error_detail: str | None = None
