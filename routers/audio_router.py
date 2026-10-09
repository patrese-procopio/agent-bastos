"""
routers/audio_router.py — Acervo de Áudios (Fase 1 do Extrator de Áudio)
─────────────────────────────────────────────────────────────────────────────
Só transporte HTTP; a lógica fica em modules/audio_acervo.py.

  POST   /audio/upload                       envia 1..N gravações (entram na fila)
  GET    /audio                              lista com filtros
  GET    /audio/painel                       volume, fila, risco, por unidade
  GET    /audio/busca?q=                     busca em texto integral nas transcrições
  GET    /audio/classificacoes               classificações válidas + estado do provedor
  GET    /audio/{id}                         detalhe + segmentos
  GET    /audio/{id}/arquivo                 stream do original (registra o acesso)
  PATCH  /audio/{id}/segmentos/{seg_id}      correção humana de um trecho
  PATCH  /audio/{id}/classificacao           reclassifica (registrado na custódia)
  POST   /audio/{id}/reprocessar             reenfileira
  GET    /audio/{id}/custodia                trilha de custódia (+ verificação da cadeia)
  POST   /audio/{id}/verificar-integridade   recalcula o SHA-256 do original
  GET    /audio/{id}/exportar/{fmt}          laudo txt | pdf | docx

Permissão: módulo "transcricao". Todo acesso ao áudio original e toda exportação ficam na
trilha de custódia. (Acesso por unidade / necessidade de conhecer é decisão a definir.)
"""

import time

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response

from dependencies import get_current_user_media, require_module
from modules import audio_acervo as ac
from services.logging_service import get_logger
from services.rate_limit_service import limiter, LIMIT_ESCRITA

_log = get_logger("audio")
router = APIRouter(prefix="/audio", tags=["audio"])

_MIME = {
    "txt": "text/plain",
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
_acessos: dict[tuple, float] = {}   # (usuario, audio) -> última vez registrada (evita 1 log por Range)


def _ou_404(audio_id: str) -> dict:
    a = ac.obter(audio_id)
    if not a:
        raise HTTPException(status_code=404, detail="Gravação não encontrada.")
    return a


@router.post("/upload")
@limiter.limit(LIMIT_ESCRITA)
async def upload(
    request: Request,
    arquivos: list[UploadFile] = File(...),
    unidade: str = Form(""), local: str = Form(""), data_gravacao: str = Form(""),
    custodiado: str = Form(""), interlocutor: str = Form(""), observacoes: str = Form(""),
    classificacao: str = Form(""),
    user: dict = Depends(require_module("transcricao")),
):
    meta = {"unidade": unidade, "local": local, "data_gravacao": data_gravacao, "custodiado": custodiado,
            "interlocutor": interlocutor, "observacoes": observacoes, "classificacao": classificacao}
    usuario = user.get("sub", "desconhecido")
    itens, erros = [], []
    for up in arquivos[:50]:
        try:
            r = ac.ingerir_stream(up.file, up.filename or "audio", meta, usuario)
            itens.append({"arquivo": up.filename, **r})
        except ValueError as e:
            erros.append({"arquivo": up.filename, "erro": str(e)})
        except Exception as e:
            _log.error(f"upload falhou para {up.filename}: {e}", exc_info=True)
            erros.append({"arquivo": up.filename, "erro": "Falha ao gravar o arquivo."})
    _log.info(f"upload de áudio por {usuario}: {len(itens)} ok, {len(erros)} erro(s)")
    return {"ok": not erros, "enfileirados": sum(1 for i in itens if not i["duplicado"]),
            "duplicados": sum(1 for i in itens if i["duplicado"]), "itens": itens, "erros": erros}


@router.get("/classificacoes")
def classificacoes(user: dict = Depends(require_module("transcricao"))):
    return {
        "validas": ac.CLASSIF_VALIDAS, "padrao": ac.CLASSIF_PADRAO, "publicas": sorted(ac.CLASSIF_PUBLICAS),
        "stt_provedor": ac.STT_PROVEDOR, "stt_local_disponivel": ac.local_disponivel(),
    }


@router.get("/painel")
def painel(user: dict = Depends(require_module("transcricao"))):
    return ac.painel()


@router.get("/busca")
def busca(q: str, unidade: str | None = None, limite: int = 50,
          user: dict = Depends(require_module("transcricao"))):
    if len(q.strip()) < 2:
        raise HTTPException(status_code=400, detail="Digite ao menos 2 caracteres.")
    _log.info(f"busca em áudios por {user.get('sub')}: '{q[:60]}'")
    return {"q": q, "resultados": ac.buscar(q, unidade, limite)}


@router.get("")
def listar(status: str | None = None, risco: str | None = None, unidade: str | None = None,
           q: str | None = None, limite: int = 50, offset: int = 0,
           user: dict = Depends(require_module("transcricao"))):
    return ac.listar(status, risco, unidade, q, limite, offset)


@router.get("/{audio_id}")
def detalhe(audio_id: str, user: dict = Depends(require_module("transcricao"))):
    a = _ou_404(audio_id)
    a.pop("arquivo", None)   # caminho interno não vai para o cliente
    return {"audio": a, "segmentos": ac.segmentos(audio_id)}


@router.get("/{audio_id}/arquivo")
def arquivo(audio_id: str, user: dict = Depends(get_current_user_media)):
    if "transcricao" not in user.get("modules", []):
        raise HTTPException(status_code=403, detail="Acesso ao módulo 'transcricao' não autorizado.")
    a = _ou_404(audio_id)
    p = ac.caminho_original(audio_id)
    if not p:
        raise HTTPException(status_code=404, detail="Arquivo original ausente no acervo.")
    usuario = user.get("sub", "desconhecido")
    agora = time.time()
    if agora - _acessos.get((usuario, audio_id), 0) > 600:
        _acessos[(usuario, audio_id)] = agora
        ac.registrar_evento(audio_id, usuario, "audio_acessado", "reprodução/download do original")
    mime = {"wav": "audio/wav", "mp3": "audio/mpeg", "ogg": "audio/ogg", "flac": "audio/flac",
            "opus": "audio/ogg", "webm": "audio/webm", "m4a": "audio/mp4", "mp4": "audio/mp4"}.get(a.get("formato"), "application/octet-stream")
    return FileResponse(p, media_type=mime, filename=a["nome_original"], content_disposition_type="inline")


@router.patch("/{audio_id}/segmentos/{seg_id}")
@limiter.limit(LIMIT_ESCRITA)
def corrigir(request: Request, audio_id: str, seg_id: int, payload: dict,
             user: dict = Depends(require_module("transcricao"))):
    try:
        r = ac.corrigir_segmento(audio_id, seg_id, payload.get("texto", ""), user.get("sub", "desconhecido"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not r:
        raise HTTPException(status_code=404, detail="Trecho não encontrado.")
    return r


@router.patch("/{audio_id}/classificacao")
@limiter.limit(LIMIT_ESCRITA)
def reclassificar(request: Request, audio_id: str, payload: dict,
                  user: dict = Depends(require_module("transcricao"))):
    try:
        return ac.reclassificar(audio_id, payload.get("classificacao", ""), user.get("sub", "desconhecido"))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{audio_id}/reprocessar")
@limiter.limit(LIMIT_ESCRITA)
def reprocessar(request: Request, audio_id: str, user: dict = Depends(require_module("transcricao"))):
    try:
        return ac.reprocessar(audio_id, user.get("sub", "desconhecido"))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/{audio_id}/custodia")
def custodia(audio_id: str, user: dict = Depends(require_module("transcricao"))):
    a = _ou_404(audio_id)
    return {"sha256": a["sha256"], "eventos": ac.custodia_do_audio(audio_id), "cadeia": ac.verificar_cadeia()}


@router.post("/{audio_id}/verificar-integridade")
def verificar(audio_id: str, user: dict = Depends(require_module("transcricao"))):
    _ou_404(audio_id)
    return ac.verificar_integridade(audio_id, user.get("sub", "desconhecido"))


@router.get("/{audio_id}/exportar/{fmt}")
def exportar(audio_id: str, fmt: str, user: dict = Depends(require_module("transcricao"))):
    if fmt not in _MIME:
        raise HTTPException(status_code=400, detail="Formato inválido. Use txt, pdf ou docx.")
    dados = ac.dados_laudo(audio_id)
    if not dados:
        raise HTTPException(status_code=404, detail="Gravação não encontrada.")
    from services.export_service import build_txt, build_pdf, build_docx
    try:
        conteudo = {"txt": build_txt, "pdf": build_pdf, "docx": build_docx}[fmt](dados)
    except Exception as e:
        _log.error(f"exportação {fmt} falhou: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Falha ao gerar {fmt.upper()}.")
    ac.registrar_evento(audio_id, user.get("sub", "desconhecido"), "laudo_exportado", fmt)
    nome = f"laudo_{dados['laudo_number']}.{fmt}"
    return Response(content=conteudo, media_type=_MIME[fmt],
                    headers={"Content-Disposition": f'attachment; filename="{nome}"'})
