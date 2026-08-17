# -*- coding: utf-8 -*-
"""
routers/drone_router.py — Rotas HTTP de Operações Drone (Missão 31)
─────────────────────────────────────────────────────────────────────────────
Endpoints REST para gestão de missões de voo, importação de mídia
do cartão SD e acervo aéreo georreferenciado.

Todas as rotas exigem o módulo "drone" no token JWT (require_module).
Concessão do módulo: Configurações → Gerenciar Usuários.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from dependencies import require_module
from services import drone_service

router = APIRouter(prefix="/drone", tags=["drone"])


# ─── Schemas (Pydantic valida ANTES da rota executar) ─────────────────────────

class MissaoIn(BaseModel):
    nome:             str = Field(min_length=3, max_length=120)
    perimetro:        str = ""
    finalidade:       str = "vigilancia_perimetro"   # ou: cobertura_vegetal, apoio_operacao
    piloto:           str = ""
    drone_modelo:     str = ""
    data_voo:         Optional[str] = None            # ISO: 2026-07-07
    sarpas_protocolo: str = ""
    checklist:        Optional[dict] = None
    observacoes:      str = ""


class MissaoPatch(BaseModel):
    nome:             Optional[str] = None
    perimetro:        Optional[str] = None
    finalidade:       Optional[str] = None
    piloto:           Optional[str] = None
    drone_modelo:     Optional[str] = None
    data_voo:         Optional[str] = None
    status:           Optional[str] = None            # planejada|realizada|relatorio_emitido|arquivada
    sarpas_protocolo: Optional[str] = None
    checklist:        Optional[dict] = None
    observacoes:      Optional[str] = None


class ImportacaoIn(BaseModel):
    origem: str = Field(min_length=2, description="Pasta local, ex.: E:\\DCIM\\100MEDIA")


class RelatorioIn(BaseModel):
    formato:   str = Field(default="docx", pattern="^(docx|pdf)$")
    parecer:   str = ""
    midia_ids: Optional[list[str]] = None   # fotos escolhidas; None = auto (com GPS)


class ComparacaoIn(BaseModel):
    missao_a: str = Field(description="Voo de referência (antes)")
    missao_b: str = Field(description="Voo atual (depois)")
    raio_m:   float = Field(default=15.0, ge=1, le=200)


class MosaicoIn(BaseModel):
    qualidade:    str = Field(default="rapida", pattern="^(rapida|media|alta)$")
    agl_padrao_m: float = Field(default=60.0, ge=5, le=500,
                                description="Altura de voo usada quando a foto não traz AGL")


# ─── Missões ──────────────────────────────────────────────────────────────────

@router.post("/missoes")
def criar_missao(body: MissaoIn, user: dict = Depends(require_module("drone"))):
    return drone_service.criar_missao(body.model_dump(), usuario=user["sub"])


@router.get("/missoes")
def listar_missoes(status: Optional[str] = None,
                   user: dict = Depends(require_module("drone"))):
    return {"missoes": drone_service.listar_missoes(status=status)}


@router.get("/missoes/{mid}")
def obter_missao(mid: str, user: dict = Depends(require_module("drone"))):
    missao = drone_service.obter_missao(mid)
    if not missao:
        raise HTTPException(404, "Missão não encontrada")
    return missao


@router.patch("/missoes/{mid}")
def atualizar_missao(mid: str, body: MissaoPatch,
                     user: dict = Depends(require_module("drone"))):
    missao = drone_service.atualizar_missao(
        mid, body.model_dump(exclude_none=True), usuario=user["sub"])
    if not missao:
        raise HTTPException(404, "Missão não encontrada")
    return missao


@router.delete("/missoes/{mid}")
def excluir_missao(mid: str, user: dict = Depends(require_module("drone"))):
    # Exclusão de acervo é ato administrativo — só admin (LGPD: descarte auditado)
    if user.get("level") != "admin":
        raise HTTPException(403, "Apenas administradores podem excluir missões")
    if not drone_service.excluir_missao(mid, usuario=user["sub"]):
        raise HTTPException(404, "Missão não encontrada")
    return {"ok": True}


# ─── Importação de mídia ──────────────────────────────────────────────────────

@router.post("/missoes/{mid}/importar")
def importar_midia(mid: str, body: ImportacaoIn,
                   user: dict = Depends(require_module("drone"))):
    """
    Dispara importação da pasta do cartão SD em background.
    5-30 GB não trafega por HTTP: o backend copia direto do volume local.
    A UI acompanha o progresso em GET /drone/importacao/{job_id}.
    """
    try:
        return drone_service.iniciar_importacao(mid, body.origem, usuario=user["sub"])
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/importacao/{job_id}")
def status_importacao(job_id: str, user: dict = Depends(require_module("drone"))):
    job = drone_service.obter_job(job_id)
    if not job:
        raise HTTPException(404, "Job não encontrado")
    return job


# ─── Galeria e trajeto ────────────────────────────────────────────────────────

@router.get("/midia/{midia_id}/thumb")
def thumb_midia(midia_id: str, user: dict = Depends(require_module("drone"))):
    path = drone_service.caminho_midia(midia_id, thumb=True)
    if not path:
        raise HTTPException(404, "Thumbnail não disponível")
    return FileResponse(path, media_type="image/jpeg")


@router.get("/midia/{midia_id}/arquivo")
def arquivo_midia(midia_id: str, user: dict = Depends(require_module("drone"))):
    path = drone_service.caminho_midia(midia_id, thumb=False)
    if not path:
        raise HTTPException(404, "Arquivo não encontrado")
    return FileResponse(path, filename=path.name)


@router.get("/missoes/{mid}/trajeto")
def trajeto(mid: str, user: dict = Depends(require_module("drone"))):
    """Pontos GPS (EXIF) ordenados no tempo — o voo reconstruído."""
    return {"pontos": drone_service.trajeto_missao(mid)}


# ─── Relatório de Voo (Fase 2) ────────────────────────────────────────────────

_RELATORIO_MIME = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf":  "application/pdf",
}


@router.post("/missoes/{mid}/relatorio")
def gerar_relatorio(mid: str, body: RelatorioIn,
                    user: dict = Depends(require_module("drone"))):
    """
    Gera o Relatório de Voo (docx/pdf) com metadados, checklist, estatísticas,
    croqui do trajeto e fotos. SHA-256 do arquivo vai para a auditoria
    (cadeia de custódia). Status da missão avança para 'relatorio_emitido'.
    """
    from fastapi.responses import Response
    from services import drone_relatorio

    try:
        dados, nome = drone_relatorio.gerar_relatorio(
            mid, formato=body.formato, parecer=body.parecer,
            midia_ids=body.midia_ids, usuario=user["sub"])
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    drone_service.atualizar_missao(mid, {"status": "relatorio_emitido"},
                                   usuario=user["sub"])
    return Response(
        content=dados,
        media_type=_RELATORIO_MIME[body.formato],
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )


# ─── Comparação de Voos (Fase 3) ──────────────────────────────────────────────

@router.post("/comparar")
def comparar_voos(body: ComparacaoIn, user: dict = Depends(require_module("drone"))):
    """
    Compara dois voos do mesmo perímetro: pareia fotos por GPS, mede
    vegetação (ExG) e mudança estrutural, gera heatmaps das zonas alteradas.
    """
    from services import drone_comparacao
    try:
        return drone_comparacao.comparar(body.missao_a, body.missao_b,
                                         raio_m=body.raio_m, usuario=user["sub"])
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/comparacao/{comp_id}/heatmap/{idx}")
def heatmap_comparacao(comp_id: str, idx: int,
                       user: dict = Depends(require_module("drone"))):
    from services import drone_comparacao
    path = drone_comparacao.caminho_heatmap(comp_id, idx)
    if not path:
        raise HTTPException(404, "Heatmap não encontrado")
    return FileResponse(path, media_type="image/png")


# ─── Mosaico Rápido (Fase 4) ──────────────────────────────────────────────────

@router.post("/missoes/{mid}/mosaico")
def gerar_mosaico(mid: str, body: MosaicoIn,
                  user: dict = Depends(require_module("drone"))):
    """
    Monta o mosaico da varredura por georreferenciamento direto (EXIF/XMP),
    em background. O(n) — milhares de fotos em minutos, não dias.
    Acompanhe em GET /drone/mosaico/{job_id}.
    """
    from services import drone_mosaico
    try:
        return drone_mosaico.iniciar_mosaico(mid, qualidade=body.qualidade,
                                             agl_padrao_m=body.agl_padrao_m,
                                             usuario=user["sub"])
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/mosaico/{job_id}")
def status_mosaico(job_id: str, user: dict = Depends(require_module("drone"))):
    from services import drone_mosaico
    job = drone_mosaico.obter_job(job_id)
    if not job:
        raise HTTPException(404, "Job não encontrado")
    return job


@router.get("/missoes/{mid}/mosaicos")
def mosaicos_da_missao(mid: str, user: dict = Depends(require_module("drone"))):
    from services import drone_mosaico
    return {"mosaicos": drone_mosaico.listar_mosaicos(mid)}


@router.get("/mosaico/{job_id}/imagem")
def imagem_mosaico(job_id: str, user: dict = Depends(require_module("drone"))):
    from services import drone_mosaico
    path = drone_mosaico.caminho_imagem(job_id)
    if not path:
        raise HTTPException(404, "Mosaico não encontrado")
    return FileResponse(path, media_type="image/jpeg",
                        filename=f"mosaico_{job_id[:8]}.jpg")


@router.get("/mosaico/{job_id}/preview")
def preview_mosaico(job_id: str, user: dict = Depends(require_module("drone"))):
    """PNG com transparência p/ overlay no mapa — só as fotos, sem fundo."""
    from services import drone_mosaico
    path = drone_mosaico.caminho_imagem(job_id, preview=True)
    if not path:
        raise HTTPException(404, "Preview não encontrado")
    return FileResponse(path, media_type="image/png")
