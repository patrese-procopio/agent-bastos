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

import asyncio
import sys
import time
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# Garante que /app está no path dentro do container
if "/app" not in sys.path:
    sys.path.insert(0, "/app")

from dependencies import get_current_user_media, require_module
from modules.osint import fotos as fotos_mod
from modules.osint import pegada_digital as pegada
from services.rate_limit_service import LIMIT_VARREDURA, limiter
from config.settings import GROQ_MODEL_CHAT
from modules.osint.collectors import build_collectors, run_collectors_parallel
from modules.osint.enrichment import OsintEnrichment
from modules.osint.internal_search import buscar_internas
from modules.osint.lgpd_gate import LgpdGate, LgpdViolationError
from modules.osint.models import (
    LgpdPurpose,
    OsintReport,
    OsintRequest,
    RiskLevel,
    SourceName,
)

router = APIRouter(prefix="/osint", tags=["OSINT — Inteligência de Pessoas"])

# Guard de autenticação aplicado em todos os endpoints deste router.
# require_module("osint") verifica JWT válido + permissão de módulo.
# Se o token for inválido → 401. Se o usuário não tiver acesso → 403.
_GATE = require_module("osint")

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
    operator_id: str | None = None  # ignorado: o operador é sempre o usuário do token
    lgpd_purpose: LgpdPurpose
    nome: str | None = None
    cpf: str | None = None
    data_nascimento: str | None = None  # YYYY-MM-DD
    nome_mae: str | None = None
    nome_pai: str | None = None
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
    achados_internos: int
    fontes_internas: dict
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
async def pesquisar(body: PesquisarRequest, request: Request,
                    user: dict = Depends(_GATE)) -> PesquisarResponse:
    start = time.monotonic()

    # Monta OsintRequest interno
    # Operador vem do JWT (não do body) — o audit LGPD não pode ser forjado.
    operador = user.get("sub") or "desconhecido"
    osint_req_kwargs = {
        "operator_id": operador,
        "lgpd_purpose": body.lgpd_purpose,
        "nome": body.nome,
        "cpf": body.cpf,
        "data_nascimento": body.data_nascimento,
        "nome_mae": body.nome_mae,
        "nome_pai": body.nome_pai,
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

    # Coleta externa + busca nas bases internas, em paralelo
    collectors = build_collectors(osint_req)
    source_results, internas = await asyncio.gather(
        run_collectors_parallel(collectors, osint_req),
        asyncio.to_thread(buscar_internas, osint_req, user.get("modules", [])),
    )

    # Enriquecimento IA
    report = await _enrichment.enrich(osint_req, source_results)
    report.achados_internos = internas["achados"]
    report.fontes_internas = internas["fontes"]
    report.contexto_busca = internas.get("contexto", {})
    # Nível de risco: só processos, lideranças e notícias de crime (ver modules/osint/risco.py)
    from modules.osint import risco as risco_mod
    av = risco_mod.avaliar(internas["achados"], internas["fontes"], mandado_ativo=bool(report.mandados_prisao))
    report.risk_level = RiskLevel(av["nivel"])
    report.risco_pilares = {**av["pilares"], "convergencia": av["convergencia"], "limiar": av["limiar"],
                            "imprecisos_nao_considerados": av["imprecisos_nao_considerados"], "versao_regras": av["versao_regras"]}
    report.resumo_risco = av["resumo"]
    report.risk_indicators = [m for m in av["motivos"]] + [i for i in report.risk_indicators if i not in av["motivos"]
                                                         and "IA indisponível" not in i]
    try:  # fotos de fontes oficiais/internas dos achados confirmados/prováveis
        report.fotos = await asyncio.to_thread(fotos_mod.coletar, str(report.report_id), internas["achados"])
    except Exception:
        report.fotos = []
    for a in internas["achados"]:
        if a["fonte"] == "lista_negra" and a["nivel"] != "possivel":
            report.risk_indicators.append(
                f"Consta na Lista Negra ({a['nivel']}): {a['dados'].get('situacao') or 'sem situação'}"
            )
    for a in internas["achados"]:
        if a["nivel"] == "possivel":
            continue
        if a["fonte"] == "pep_cgu":
            report.risk_indicators.append(
                f"Pessoa Exposta Politicamente ({a['nivel']}): {(a['dados'].get('linhas') or [''])[0][:140]}")
        elif a["fonte"] == "sancoes_cgu":
            tipo = "Empresa vinculada sancionada" if a["dados"].get("tipo") == "empresa" else "Sancionado"
            report.risk_indicators.append(
                f"{tipo} em {a['dados'].get('lista')} ({a['nivel']}): {(a['dados'].get('linhas') or [''])[0][:140]}")
    penalidades = [a for a in internas["achados"] if a["fonte"] in ("querido_diario", "diario_am")
                   and (a["dados"].get("ato") or "").startswith("Penalidade") and a["nivel"] != "possivel"]
    if penalidades:
        report.risk_indicators.append(
            f"Citado em ato de penalidade/processo administrativo em diário oficial "
            f"({penalidades[0]['dados'].get('municipio') or 'DOE-AM'}, {penalidades[0]['dados'].get('data')})"
        )
    seap = [a for a in internas["achados"] if a["fonte"] == "diario_am"
            and a["dados"].get("seap") and a["nivel"] != "possivel"]
    if seap:
        report.risk_indicators.append(
            f"{len(seap)} ato(s) da SEAP no DOE-AM citam esta pessoa (possível vínculo com o sistema "
            f"penitenciário): confirmar identidade"
        )
    criminais = [a for a in internas["achados"]
                 if a["fonte"] == "djen" and a["dados"].get("criminal") and a["nivel"] != "possivel"]
    if criminais:
        report.risk_indicators.append(
            f"{len(criminais)} processo(s) de natureza criminal em publicações do DJEN "
            f"({criminais[0]['nivel']}): confirmar identidade antes de usar"
        )
    report.execution_time_ms = (time.monotonic() - start) * 1000

    # Salva no cache para GET /relatorio/{id}
    _report_cache[str(report.report_id)] = report

    try:
        from services.audit_service import registrar as audit
        audit("osint_pesquisa", "consulta", usuario=operador,
              alvo=body.nome or osint_req.cpf_mascarado(),
              detalhe=(f"risco={report.risk_level.value} finalidade={body.lgpd_purpose.value} "
                       f"internos={len(report.achados_internos)}"),
              ip=ip)
    except Exception:
        pass

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
        achados_internos=len(report.achados_internos),
        fontes_internas=report.fontes_internas,
        execution_time_ms=report.execution_time_ms,
        lgpd_purpose=report.lgpd_purpose.value,
    )


# ─────────────────────────────────────────────
# PEGADA DIGITAL (redes sociais, e-mail, telefone) e FOTOS
# ─────────────────────────────────────────────

class PegadaRequest(BaseModel):
    report_id: str | None = None   # se informado, usa nome/UF do relatório e DESCOBRE identificadores nos achados
    nome: str | None = None
    username: str | None = None
    email: str | None = None
    telefone: str | None = None
    auto: bool = True              # descobrir identificadores nos achados (vulgo, e-mails e telefones em documentos)
    usar_vulgo: bool = True        # incluir o vulgo das Lideranças como username (baixa precisão)
    variacoes_nome: bool = False   # opt-in: usernames derivados do NOME (baixíssima precisão)
    profundidade: str = "padrao"   # rapida | padrao | completa


def _mascara_email(e: str | None) -> str:
    if not e or "@" not in e:
        return "-"
    a, d = e.split("@", 1)
    return f"{a[:2]}***@{d}"


def _mascara_tel(t: str | None) -> str:
    d = "".join(c for c in (t or "") if c.isdigit())
    return f"***{d[-4:]}" if len(d) >= 4 else "-"


@router.post("/pegada-digital", summary="Inicia a busca de redes sociais/e-mail/telefone (segundo plano)")
@limiter.limit(LIMIT_VARREDURA)
async def iniciar_pegada(request: Request, body: PegadaRequest, user: dict = Depends(_GATE)) -> dict:
    if body.profundidade not in pegada.PROFUNDIDADE:
        raise HTTPException(status_code=422, detail=f"profundidade inválida: {', '.join(pegada.PROFUNDIDADE)}")
    report = _report_cache.get(body.report_id) if body.report_id else None
    nome = report.subject_name if report else body.nome
    ufs = list((report.contexto_busca or {}).get("principais") or []) if report else []

    # 1) o que o operador informou
    usernames = [(body.username.strip(), "informado")] if body.username and body.username.strip() else []
    emails = [(body.email.strip(), "informado")] if body.email and body.email.strip() else []
    telefones = [(body.telefone.strip(), "informado")] if body.telefone and body.telefone.strip() else []

    # 2) o que a própria pesquisa encontrou (confirmados/prováveis)
    descobertos = {"usernames": [], "emails": [], "telefones": []}
    if report and body.auto:
        d = pegada.descobrir_identificadores(report.achados_internos)
        if not body.usar_vulgo:
            d["usernames"] = [x for x in d["usernames"] if not x[1].startswith("vulgo")]
        descobertos = d
        usernames += d["usernames"]; emails += d["emails"]; telefones += d["telefones"]

    # 3) opt-in: variações do nome (só se pedido; baixíssima precisão)
    if body.variacoes_nome and nome:
        usernames += [(u, "variação do nome (baixíssima precisão)") for u in pegada.variacoes_nome(nome)]

    if not (usernames or emails or telefones):
        return {"job_id": None, "nada_encontrado": True, "maigret_disponivel": pegada.ferramenta_disponivel(),
                "mensagem": "Nenhum identificador digital (vulgo, e-mail ou telefone) encontrado nos achados desta pesquisa."}

    operador = user.get("sub") or "desconhecido"
    jid = pegada.iniciar(operador, body.report_id, nome, usernames, emails, telefones, ufs, body.profundidade,
                         auto=bool(report and body.auto))
    try:
        from services.audit_service import registrar as audit
        audit("osint_pegada_digital", "consulta", usuario=operador, alvo=nome or "-",
              detalhe=(f"usernames={len(usernames)} emails={[_mascara_email(e) for e, _ in emails]} "
                       f"tels={[_mascara_tel(t) for t, _ in telefones]} auto={bool(report and body.auto)} "
                       f"variacoes={body.variacoes_nome} prof={body.profundidade} job={jid}"),
              ip=request.client.host if request.client else None)
    except Exception:
        pass
    return {"job_id": jid, "nada_encontrado": False, "maigret_disponivel": pegada.ferramenta_disponivel(),
            "descobertos": {k: [{"origem": o} for _, o in v] for k, v in descobertos.items()}}


@router.get("/pegada-digital/{job_id}", summary="Estado/resultado da pegada digital")
async def ver_pegada(job_id: str, user: dict = Depends(_GATE)) -> dict:
    job = pegada.obter(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado (reiniciou o backend ou expirou).")
    rep = _report_cache.get(job.get("report_id") or "")
    if rep and job["estado"] != "executando":
        rep.pegada_digital = job   # fica no relatório (e no PDF)
    return job


class ConfirmarConta(BaseModel):
    url: str
    confirmar: bool = True


@router.post("/pegada-digital/{job_id}/confirmar", summary="Analista confirma (ou desfaz) que a conta é da pessoa")
async def confirmar_conta(job_id: str, body: ConfirmarConta, user: dict = Depends(_GATE)) -> dict:
    contas = pegada.contas_do_job(job_id)
    conta = next((c for c in contas if c.get("url") == body.url), None)
    if not conta:
        raise HTTPException(status_code=404, detail="Conta não encontrada neste job.")
    conta["confirmada"] = body.confirmar
    conta["confirmada_por"] = user.get("sub") if body.confirmar else None
    job = pegada.obter(job_id) or {}
    rep = _report_cache.get(job.get("report_id") or "")
    if rep and conta.get("foto_id"):
        rep.fotos = [f for f in rep.fotos if f.get("id") != conta["foto_id"]]
        if body.confirmar:
            rep.fotos.append({"id": conta["foto_id"], "fonte": f"Perfil confirmado pelo analista — {conta['site']}",
                              "legenda": conta.get("nome_perfil") or conta["username"],
                              "confianca": None, "nivel": "confirmado_analista", "url": conta["url"]})
    if rep:
        rep.pegada_digital = pegada.obter(job_id) or {}
    return {"ok": True, "confirmada": conta["confirmada"]}


@router.get("/foto/{foto_id}", summary="Imagem (rota autenticada; aceita ?token= para <img>)")
async def get_foto(foto_id: str, user: dict = Depends(get_current_user_media)):
    from fastapi.responses import Response
    if "osint" not in user.get("modules", []):
        raise HTTPException(status_code=403, detail="Acesso ao módulo 'osint' não autorizado")
    f = fotos_mod.obter(foto_id)
    if not f:
        raise HTTPException(status_code=404, detail="Foto expirada ou inexistente.")
    return Response(content=f["bytes"], media_type=f["mime"], headers={"Cache-Control": "private, max-age=3600"})


@router.get(
    "/relatorio/{report_id}",
    summary="Busca relatório completo por ID",
    description="Retorna o relatório completo incluindo grafo de vínculos e dados brutos.",
)
async def get_relatorio(report_id: str, user: dict = Depends(_GATE)) -> dict:
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
async def get_auditoria(limit: int = 50, user: dict = Depends(_GATE)) -> dict:
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
async def get_status(user: dict = Depends(_GATE)) -> dict:
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
            "modelo": GROQ_MODEL_CHAT,
            "gratuito": True,
            "nota": "Free tier generoso",
        },
    }

    from modules.osint.receita_cnpj import info_base
    fontes["receita_cnpj"] = {
        **info_base(),
        "gratuito": True,
        "nota": "Base local de sócios PF. Carga: scripts/carregar_cnpj_receita.py",
    }

    from modules.osint.tse import info_base as info_tse
    fontes["tse"] = {
        **info_tse(),
        "gratuito": True,
        "nota": "Base local de candidaturas e bens. Carga: scripts/carregar_tse.py",
    }

    from modules.osint.sancoes_cgu import info_base as info_sanc
    fontes["pep_cgu"] = fontes["sancoes_cgu"] = {
        **info_sanc(), "gratuito": True,
        "nota": "PEP/CEIS/CNEP/CEAF (CGU). Carga: scripts/carregar_sancoes_cgu.py",
    }
    fontes["diario_am"] = {
        "api_key_configurada": True, "url": "https://diario.imprensaoficial.am.gov.br", "gratuito": True,
        "nota": "Diário Oficial do Estado do Amazonas (1956-hoje). Nome enviado a serviço externo.",
    }
    fontes["noticias"] = {
        "api_key_configurada": True, "url": "https://news.google.com/rss", "gratuito": True,
        "nota": "Alertas do monitor + feed de crimes (AM) + Google News pelo nome. Nome enviado a serviço externo.",
    }
    fontes["pegada_digital"] = {
        "maigret_instalado": pegada.ferramenta_disponivel(), "gratuito": True,
        "nota": "Maigret isolado em tools/osint_venv; telefone offline (phonenumbers); e-mail só Gravatar (sem Holehe).",
    }
    fontes["querido_diario"] = {
        "api_key_configurada": True, "url": "https://api.queridodiario.ok.org.br", "gratuito": True,
        "nota": "Diários oficiais municipais (só municípios raspados). Nome enviado a serviço externo.",
    }
    fontes["djen"] = {
        "api_key_configurada": True, "url": "https://comunicaapi.pje.jus.br", "gratuito": True,
        "nota": "Publicações a partir de mai/2022. API do CNJ lenta/instável; nome enviado ao CNJ.",
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
async def download_pdf(report_id: str, user: dict = Depends(_GATE)):
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
