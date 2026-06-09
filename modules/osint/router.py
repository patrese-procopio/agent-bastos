"""
router.py — Endpoints FastAPI do módulo OSINT
Agent Bastos | Segurança Pública/Corporativa

Endpoints:
  POST /osint/pesquisar     — pipeline completo (coleta + enriquecimento)
  GET  /osint/relatorio/{id} — busca relatório já gerado
  GET  /osint/auditoria      — lista audit log (acesso restrito)
  GET  /osint/status         — health check das fontes

Por que separar em endpoints distintos?
  O pipeline completo pode levar 5-15s (I/O de múltiplas fontes).
  No mundo real você vai querer: POST dispara o job, retorna um ID,
  o front faz polling no GET /relatorio/{id}.
  Por ora implementamos síncrono — simples e funciona para MVP.
  Refatorar para async job é um upgrade natural depois.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# Garante que /app está no path dentro do container
if "/app" not in sys.path:
    sys.path.insert(0, "/app")

from modules.osint.collectors import build_collectors, run_collectors_parallel
from modules.osint.enrichment import OsintEnrichment
from modules.osint.lgpd_gate import LgpdGate, LgpdViolationError
from modules.osint.models import (
    LgpdPurpose,
    OsintReport,
    OsintRequest,
    RiskLevel,
    SourceName,
)

router = APIRouter(prefix="/osint", tags=["OSINT — Inteligência de Pessoas"])

# Instâncias reutilizadas entre requests
_gate = LgpdGate()
_enrichment = OsintEnrichment()

# Cache simples em memória — em produção use Redis
_report_cache: dict[str, OsintReport] = {}


# ─────────────────────────────────────────────
# SCHEMAS DE REQUEST/RESPONSE DA API
# ─────────────────────────────────────────────

class PesquisarRequest(BaseModel):
    """
    Body do POST /osint/pesquisar.
    Separado do OsintRequest interno para controlar
    o que fica exposto na API pública.
    """
    operator_id: str
    lgpd_purpose: LgpdPurpose
    nome: str | None = None
    cpf: str | None = None
    data_nascimento: str | None = None
    fontes_ativas: list[SourceName] | None = None

    model_config = {
        "json_schema_extra": {
            "example": {
                "operator_id": "agente_001",
                "lgpd_purpose": "seguranca_publica",
                "nome": "João Silva Santos",
                "cpf": "12345678901",
            }
        }
    }


class PesquisarResponse(BaseModel):
    """Resposta resumida — dados sensíveis omitidos."""
    report_id: str
    subject_name: str | None
    subject_cpf_masked: str | None
    risk_level: str
    risk_summary: str | None
    risk_indicators: list[str]
    total_processos: int
    tem_mandado_ativo: bool
    total_empresas: int
    total_noticias: int
    total_dou: int
    nos_grafo: int
    arestas_grafo: int
    fontes_com_erro: list[str]
    execution_time_ms: float | None
    lgpd_purpose: str


# ─────────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────────

@router.post(
    "/pesquisar",
    response_model=PesquisarResponse,
    status_code=status.HTTP_200_OK,
    summary="Pesquisa OSINT completa de pessoa",
    description="""
    Executa o pipeline completo de inteligência:
    1. Validação LGPD (finalidade obrigatória)
    2. Coleta paralela em fontes públicas
    3. Enriquecimento via IA (Groq)
    4. Retorna relatório estruturado com risk score e grafo de vínculos

    **Fontes consultadas:** DataJud, CNPJ.ws, Brasil.io, DOU, GNews
    **Tempo médio:** 5-15 segundos (depende das fontes ativas)
    """,
)
async def pesquisar(body: PesquisarRequest, request: Request) -> PesquisarResponse:
    start = time.monotonic()

    # Monta OsintRequest interno
    osint_req_kwargs = {
        "operator_id": body.operator_id,
        "lgpd_purpose": body.lgpd_purpose,
        "nome": body.nome,
        "cpf": body.cpf,
        "data_nascimento": body.data_nascimento,
    }
    if body.fontes_ativas:
        osint_req_kwargs["fontes_ativas"] = body.fontes_ativas

    try:
        osint_req = OsintRequest(**osint_req_kwargs)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )

    # LGPD Gate — falha aqui = 403
    try:
        ip = request.client.host if request.client else None
        await _gate.authorize(osint_req)
    except LgpdViolationError as e:
        await _gate.register_failure(osint_req, str(e))
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"LGPD: {str(e)}",
        )

    # Coleta paralela
    collectors = build_collectors(osint_req)
    source_results = await run_collectors_parallel(collectors, osint_req)

    # Enriquecimento IA
    report = await _enrichment.enrich(osint_req, source_results)
    report.execution_time_ms = (time.monotonic() - start) * 1000

    # Salva no cache para GET /relatorio/{id}
    _report_cache[str(report.report_id)] = report

    return PesquisarResponse(
        report_id=str(report.report_id),
        subject_name=report.subject_name,
        subject_cpf_masked=report.subject_cpf_masked,
        risk_level=report.risk_level.value,
        risk_summary=report.risk_summary,
        risk_indicators=report.risk_indicators,
        total_processos=report.total_processos,
        tem_mandado_ativo=report.tem_mandado_ativo,
        total_empresas=len(report.vinculos_empresariais),
        total_noticias=len(report.mencoes_midia),
        total_dou=len(report.mencoes_dou),
        nos_grafo=len(report.graph.nodes),
        arestas_grafo=len(report.graph.edges),
        fontes_com_erro=report.fontes_com_erro,
        execution_time_ms=report.execution_time_ms,
        lgpd_purpose=report.lgpd_purpose.value,
    )


@router.get(
    "/relatorio/{report_id}",
    summary="Busca relatório completo por ID",
    description="Retorna o relatório completo incluindo grafo de vínculos e dados brutos.",
)
async def get_relatorio(report_id: str) -> dict:
    report = _report_cache.get(report_id)
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Relatório {report_id} não encontrado. Cache reiniciado ou ID inválido.",
        )
    return report.model_dump(mode="json")


@router.get(
    "/auditoria",
    summary="Lista audit log LGPD",
    description="Retorna os últimos registros do audit log. Acesso restrito ao operador.",
)
async def get_auditoria(limit: int = 50) -> dict:
    audit_path = Path("logs/osint_audit.jsonl")
    if not audit_path.exists():
        return {"registros": [], "total": 0}

    import json
    lines = audit_path.read_text(encoding="utf-8").strip().split("\n")
    lines = [l for l in lines if l.strip()]

    registros = []
    for line in lines[-limit:]:
        try:
            registros.append(json.loads(line))
        except Exception:
            continue

    return {
        "registros": list(reversed(registros)),
        "total": len(lines),
        "exibindo": len(registros),
    }


@router.get(
    "/status",
    summary="Health check das fontes OSINT",
    description="Verifica disponibilidade de cada fonte e configuração de variáveis.",
)
async def get_status() -> dict:
    import os

    fontes = {
        "datajud": {
            "api_key_configurada": bool(os.getenv("DATAJUD_API_KEY")),
            "url": "https://api-publica.datajud.cnj.jus.br",
            "gratuito": True,
        },
        "cnpj_ws": {
            "api_key_configurada": True,  # sem auth
            "url": "https://publica.cnpj.ws",
            "gratuito": True,
        },
        "brasil_io": {
            "api_key_configurada": bool(os.getenv("BRASIL_IO_TOKEN")),
            "url": "https://brasil.io/api",
            "gratuito": True,
            "nota": "Token opcional — sem token tem rate limit menor",
        },
        "dou": {
            "api_key_configurada": True,  # sem auth
            "url": "https://www.in.gov.br",
            "gratuito": True,
        },
        "gnews": {
            "api_key_configurada": bool(os.getenv("GNEWS_API_KEY")),
            "url": "https://gnews.io",
            "gratuito": True,
            "nota": "Free tier: 100 req/dia",
        },
        "groq": {
            "api_key_configurada": bool(os.getenv("GROQ_API_KEY")),
            "modelo": "llama-3.3-70b-versatile",
            "gratuito": True,
            "nota": "Free tier generoso",
        },
    }

    modo_mock = os.getenv("OSINT_USE_MOCK", "false").lower() == "true"

    return {
        "status": "ok",
        "modo_mock": modo_mock,
        "fontes": fontes,
        "aviso_lgpd": "Todas as pesquisas são registradas em audit log conforme Art. 37 LGPD",
    }


@router.get(
    "/relatorio/{report_id}/pdf",
    summary="Baixa relatório em PDF",
    description="Gera e retorna o PDF do relatório. Requer que o relatório já tenha sido gerado via POST /pesquisar.",
    response_class=None,
)
async def download_pdf(report_id: str):
    from fastapi.responses import Response
    from modules.osint.report_gen import OsintReportGenerator

    report = _report_cache.get(report_id)
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Relatório {report_id} não encontrado.",
        )

    gen = OsintReportGenerator()
    pdf_bytes = gen.generate(report)

    nome_arquivo = f"osint_{report.subject_name or 'relatorio'}_{report_id[:8]}.pdf"
    nome_arquivo = nome_arquivo.replace(" ", "_").lower()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{nome_arquivo}"'},
    )
