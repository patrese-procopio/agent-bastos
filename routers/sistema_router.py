"""
routers/sistema_router.py
─────────────────────────────────────────────────────────────────────────────
Rotas de sistema, saúde, notícias, dashboard stats legado e análise grafoscópica.

Rotas registradas:
  GET  /health                → liveness check (pública — usada pelo Docker healthcheck)
  GET  /status                → versão + modelo ativo
  GET  /status/firebase       → testa conectividade com Firestore
  GET  /noticias              → lista notícias de crimes (JSON ou TXT local)
  POST /noticias/salvar       → persiste notícias vindas do n8n
  GET  /dashboard/stats       → stats legado em JSON (producao.json)
  POST /dashboard/stats       → salva stats legado
  POST /decifrar              → análise grafoscópica de documentos/imagens
"""

import glob
import json
import os

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Depends
from modules.decifrar import transcrever_documento_bytes, TipoDocumento
from dependencies import get_current_user, require_module

router = APIRouter(tags=["sistema"])

# ─── Constantes ──────────────────────────────────────────────────────────────

BASE_DIR              = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SA_KEY_PATH          = os.path.join(BASE_DIR, "serviceAccountKey.json")
PASTA_RELATORIOS      = os.path.join(BASE_DIR, "data", "relatorios")
_DASHBOARD_STATS_PATH = os.path.join(PASTA_RELATORIOS, "producao.json")
_MAX_IMG_BYTES        = 25 * 1024 * 1024
_IMG_MIME_MAP         = {
    "image/jpeg": ".jpg",
    "image/png":  ".png",
    "image/webp": ".webp",
    "image/gif":  ".gif",
}


# ─── Rotas ───────────────────────────────────────────────────────────────────

@router.get("/health")
async def health():
    # Pública — Docker healthcheck e monitoramento externo precisam bater aqui
    return {"status": "ok", "version": "1.0.0"}


@router.get("/status")
def status(user: dict = Depends(get_current_user)):
    return {"status": "online", "version": "1.0.0", "model": "llama-3.3-70b-versatile"}


@router.get("/status/firebase")
def status_firebase(user: dict = Depends(get_current_user)):
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore as _fs
        if not firebase_admin._apps:
            cred = credentials.Certificate(_SA_KEY_PATH)
            firebase_admin.initialize_app(cred)
        db      = _fs.client()
        db.collection("missoes").limit(1).get()
        projeto = firebase_admin.get_app().project_id
        return {"ok": True, "projeto": projeto}
    except Exception as e:
        return {"ok": False, "projeto": str(e)}


@router.get("/noticias")
def noticias(user: dict = Depends(get_current_user)):
    json_path = os.path.join(PASTA_RELATORIOS, "noticias_crimes.json")
    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                dados = json.load(f)
            stat          = os.stat(json_path)
            noticias_list = dados.get("noticias")
            if not noticias_list and "texto" in dados:
                noticias_list = json.loads(dados["texto"]).get("noticias")
            if noticias_list:
                arquivos = [
                    {
                        "titulo":    n.get("titulo", "Sem titulo"),
                        "resumo":    n.get("resumo", ""),
                        "link":      n.get("link", ""),
                        "imagem":    n.get("imagem", ""),
                        "data_pub":  n.get("data", ""),
                        "categoria": n.get("categoria", "CRIMES"),
                        "conteudo":  n.get("resumo", ""),
                        "arquivo":   "noticias_crimes.json",
                        "atualizado": stat.st_mtime,
                        "formato":   "estruturado",
                    }
                    for n in noticias_list
                ]
                return {"noticias": arquivos}
        except Exception:
            pass

    arquivos = []
    for caminho in glob.glob(os.path.join(PASTA_RELATORIOS, "*.txt")):
        nome = os.path.basename(caminho)
        try:
            with open(caminho, "r", encoding="utf-8") as f:
                conteudo = f.read()
        except Exception:
            continue
        stat   = os.stat(caminho)
        titulo = (
            "Monitor Crimes AM"
            if nome == "relatorio.txt"
            else nome.replace(".txt", "").replace("_", " ").title()
        )
        arquivos.append({
            "titulo":    titulo,
            "resumo":    conteudo[:200],
            "link":      "",
            "imagem":    "",
            "data_pub":  "",
            "categoria": "CRIMES",
            "conteudo":  conteudo,
            "arquivo":   nome,
            "atualizado": stat.st_mtime,
            "formato":   "texto",
        })

    arquivos.sort(key=lambda x: x["atualizado"], reverse=True)
    return {"noticias": arquivos}

@router.post("/noticias/salvar")
async def salvar_noticias(dados: dict):
    caminho = os.path.join(PASTA_RELATORIOS, "noticias_crimes.json")
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
    return {"status": "salvo", "total": len(dados.get("noticias", []))}


@router.get("/dashboard/stats")
def get_dashboard_stats(user: dict = Depends(get_current_user)):
    if not os.path.exists(_DASHBOARD_STATS_PATH):
        return {}
    try:
        with open(_DASHBOARD_STATS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


@router.post("/dashboard/stats")
async def salvar_dashboard_stats(dados: dict, user: dict = Depends(require_module("dashboard"))):
    os.makedirs(os.path.dirname(_DASHBOARD_STATS_PATH), exist_ok=True)
    with open(_DASHBOARD_STATS_PATH, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
    return {"status": "salvo"}


@router.post("/decifrar")
async def decifrar_missiva(
    imagem:         UploadFile = File(...),
    tipo_documento: str        = Form("desconhecido"),
    contexto_extra: str        = Form(""),
    user: dict = Depends(require_module("grafoscopia")),
):
    """Análise grafoscópica — transcreve e analisa documentos manuscritos/impressos."""
    if imagem.content_type not in _IMG_MIME_MAP:
        raise HTTPException(status_code=415, detail=f"Formato nao suportado: {imagem.content_type}")
    dados = await imagem.read()
    if len(dados) > _MAX_IMG_BYTES:
        raise HTTPException(status_code=413, detail="Imagem excede o limite de 25MB.")
    try:
        tipo_enum = TipoDocumento(tipo_documento.lower())
    except ValueError:
        tipo_enum = TipoDocumento.DESCONHECIDO
    return transcrever_documento_bytes(
        dados=dados,
        media_type=imagem.content_type,
        nome_arquivo=imagem.filename or "documento",
        tipo_documento=tipo_enum,
        contexto_extra=contexto_extra,
    )