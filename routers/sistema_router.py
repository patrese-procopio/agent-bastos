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

import asyncio
import glob
import json
import os
import re
import urllib.parse
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from datetime import datetime


def _parse_article_date(data_str: str, fallback: float) -> float:
    """Converte string de data do artigo (RFC-2822 ou ISO) em Unix timestamp."""
    if not data_str:
        return fallback
    # RFC-2822: "Wed, 20 May 2026 13:34:59 -0000"
    try:
        return parsedate_to_datetime(data_str).timestamp()
    except Exception:
        pass
    # ISO / brasileiro: "2026-05-20" ou "20/05/2026"
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(data_str, fmt).timestamp()
        except ValueError:
            continue
    return fallback

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Depends
from modules.decifrar import transcrever_documento_bytes, TipoDocumento
from dependencies import get_current_user, require_module

router = APIRouter(tags=["sistema"])

# ─── Constantes ──────────────────────────────────────────────────────────────

BASE_DIR              = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SA_KEY_PATH          = os.path.join(BASE_DIR, "serviceAccountKey.json")
from config.paths import DIR_RELATORIOS
PASTA_RELATORIOS      = str(DIR_RELATORIOS)
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
                        "atualizado": _parse_article_date(n.get("data", ""), stat.st_mtime),
                        "formato":   "estruturado",
                    }
                    for n in noticias_list
                ]
                intel_raw = dados.get("intel_global", [])
                intel_list = [
                    {
                        "titulo":    n.get("titulo", ""),
                        "resumo":    n.get("resumo", ""),
                        "link":      n.get("link", ""),
                        "imagem":    n.get("imagem", ""),
                        "data_pub":  n.get("data", ""),
                        "lang":      n.get("lang", "es"),
                        "conteudo":  n.get("resumo", ""),
                        "arquivo":   "insightcrime",
                        "atualizado": _parse_article_date(n.get("data", ""), stat.st_mtime),
                        "fonte":     "insightcrime",
                    }
                    for n in intel_raw
                ]
                return {"noticias": arquivos, "intel_global": intel_list}
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

@router.get("/noticias/atualizar")
async def atualizar_noticias(user: dict = Depends(get_current_user)):
    """
    Busca notícias de segurança pública / crimes do Amazonas via:
      1. RSS nativo do G1 Amazonas + G1 Polícia  →  inclui <media:thumbnail> com imagem real
      2. Google News RSS como complemento          →  sem imagem (redirect JS não rastreável)
    Salva em noticias_crimes.json e retorna o total.
    """
    import httpx

    # Namespace do media RSS (Yahoo MRss) — usado pelo G1/Globo
    MEDIA_NS = "http://search.yahoo.com/mrss/"

    UA = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
    HDR = {
        "User-Agent": UA,
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
        "Accept-Language": "pt-BR,pt;q=0.9",
    }

    # ── Fontes RSS com imagem nativa ─────────────────────────────────────────
    # G1 retorna <media:thumbnail url="..."/> diretamente no feed — sem scraping
    G1_FEEDS = [
        "https://g1.globo.com/rss/g1/am/amazonas/",      # G1 Amazonas (regional)
        "https://g1.globo.com/rss/g1/policia/",           # G1 Polícia (nacional)
        "https://g1.globo.com/rss/g1/politica/",          # G1 Política
    ]

    # Google News RSS — sem imagem nativa (links são redirects JS), mas cobre mais temas
    GNEWS_QUERIES = [
        "crime Manaus",
        "operacao policial Manaus",
        "seguranca publica Amazonas",
        "preso Manaus",
    ]

    from email.utils import parsedate_to_datetime as _pdt
    agora = datetime.now().timestamp()
    LIMITE_DIAS = 30 * 86400

    def _ts(pub_date: str) -> float:
        try:
            return _pdt(pub_date).timestamp()
        except Exception:
            return agora

    # Remove tags HTML do texto de resumo (description do G1 vem com HTML)
    _TAG_RE = re.compile(r"<[^>]+>")
    def _strip_html(text: str) -> str:
        import html as _h
        return _TAG_RE.sub(" ", _h.unescape(text or "")).strip()

    # Palavras-chave: artigo DEVE conter pelo menos uma para ser incluído
    _KEYWORDS = re.compile(
        r"preso|presa|presos|prisão|detido|detidos|detida"
        r"|policia|policial|operacao|operação"
        r"|crime|crimes|criminal|criminoso"
        r"|assassin|homicidio|homicídio|morto|morte|vitima|vítima"
        r"|trafico|tráfico|droga|entorpecente"
        r"|investigad|inquérito|inquerito"
        r"|condenado|condena|sentença|julgamento"
        r"|sequestro|rapto|rehém|rehen"
        r"|roubo|furto|assalto|latrocinio|latrocínio"
        r"|apreensão|apreensao|apreendido"
        r"|flagrante|suspeito"
        r"|fraude|corrupcao|corrupção|desvio|lavagem"
        r"|extorsao|extorsão|golpe|estelionato"
        r"|feminicidio|feminicídio|estupro|abuso"
        r"|seguranca publica|segurança pública"
        r"|delegacia|penitenciaria|presidio|presídio",
        re.IGNORECASE,
    )

    # Palavras de exclusão: título com qualquer uma dessas = descarta
    _EXCLUDE = re.compile(
        r"\bcontrato\b|\bfestival\b|\bcultura\b|\bturismo\b|\besporte\b"
        r"|\bcobra\b|\banimal(is)?\b|\bvaquejada\b|\bbumba\b|\bcarnaval\b"
        r"|\beleicao\b|\beleição\b|\bpartido\b|\bpolitico\b|\bpolítico\b"
        r"|\bconcurso\b|\bpremio\b|\bprêmio\b|\bshow\b|\bforró\b|\bforro\b",
        re.IGNORECASE,
    )

    # Score de relevância: conta quantas vezes keywords aparecem no texto
    def _score(titulo: str, resumo: str) -> int:
        texto = titulo + " " + resumo
        return len(_KEYWORDS.findall(texto))

    seen_urls: set[str] = set()
    artigos: list[dict] = []

    async with httpx.AsyncClient(timeout=14.0, follow_redirects=True) as client:

        # ── 1. G1 RSS (imagem garantida via media:thumbnail) ─────────────────
        for feed_url in G1_FEEDS:
            if len(artigos) >= 18:
                break
            try:
                resp = await client.get(feed_url, headers=HDR)
                if resp.status_code != 200:
                    continue
                # ElementTree não registra namespaces automaticamente — usa prefix explícito
                xml_text = resp.text
                root = ET.fromstring(xml_text)
            except Exception:
                continue

            for item in root.findall(".//item"):
                if len(artigos) >= 18:
                    break

                link = (item.findtext("link") or "").strip()
                if not link or link in seen_urls:
                    continue

                pub_date = item.findtext("pubDate", "")
                if (agora - _ts(pub_date)) > LIMITE_DIAS:
                    continue

                titulo = _strip_html(item.findtext("title") or "")
                resumo = _strip_html(item.findtext("description") or titulo)[:300]
                if not resumo or resumo == titulo:
                    resumo = titulo

                # media:thumbnail ou media:content — G1 usa ambos
                imagem = ""
                thumb = item.find(f"{{{MEDIA_NS}}}thumbnail")
                if thumb is not None:
                    imagem = thumb.get("url", "")
                if not imagem:
                    content = item.find(f"{{{MEDIA_NS}}}content")
                    if content is not None:
                        imagem = content.get("url", "")
                # Fallback: procura qualquer URL de CDN Globo no XML bruto do item
                if not imagem:
                    frag = ET.tostring(item, encoding="unicode")
                    glb = re.search(r'(https://s\d+-g1\.glbimg\.com/[^\s"\'<>&]+)', frag)
                    if glb:
                        imagem = glb.group(1)

                # Filtra: exclui off-topic pelo título
                if _EXCLUDE.search(titulo):
                    continue
                # Filtra: só aceita se título ou resumo tiver palavra de segurança/crime
                texto_check = titulo + " " + resumo
                if not _KEYWORDS.search(texto_check):
                    continue

                # Categoria: detecta se é AM
                cat = "AM" if ("am/" in link or "amazonas" in link.lower()) else "CRIMES"

                seen_urls.add(link)
                artigos.append({
                    "titulo":    titulo,
                    "resumo":    resumo,
                    "link":      link,
                    "imagem":    imagem,
                    "data":      pub_date,
                    "categoria": cat,
                })

        # ── 2. Google News RSS como complemento (sem imagem) ─────────────────
        for query in GNEWS_QUERIES:
            if len(artigos) >= 18:
                break
            params = {"q": query, "hl": "pt-BR", "gl": "BR", "ceid": "BR:pt-419"}
            rss_url = f"https://news.google.com/rss/search?{urllib.parse.urlencode(params)}"
            try:
                resp = await client.get(rss_url, headers=HDR)
                if resp.status_code != 200:
                    continue
                root = ET.fromstring(resp.text)
            except Exception:
                continue

            import html as _html
            for item in root.findall(".//item")[:4]:
                if len(artigos) >= 18:
                    break

                titulo_raw = (item.findtext("title") or "")
                titulo = titulo_raw.rsplit(" - ", 1)[0].strip()

                pub_date = item.findtext("pubDate", "")
                if (agora - _ts(pub_date)) > LIMITE_DIAS:
                    continue

                # Tenta extrair URL real da description (Google codifica como HTML entities)
                desc_enc = item.findtext("description", "") or ""
                desc = _html.unescape(desc_enc)
                href = re.search(r'href="(https?://[^"]+)"', desc)
                link = href.group(1) if href else (item.findtext("link") or "").strip()

                if not link or link in seen_urls or "news.google.com" in link:
                    continue
                seen_urls.add(link)

                artigos.append({
                    "titulo":    titulo,
                    "resumo":    titulo,
                    "link":      link,
                    "imagem":    "",       # sem imagem do Google News
                    "data":      pub_date,
                    "categoria": "CRIMES",
                })

    # ── 3. Ordena por relevância (+ keywords = card de destaque mais impactante)
    artigos.sort(key=lambda a: _score(a["titulo"], a["resumo"]), reverse=True)

    # ── 4. InSight Crime RSS (espanhol → fallback inglês) ────────────────────
    IC_FEEDS = [
        ("https://es.insightcrime.org/feed/", "es"),   # preferido
        ("https://insightcrime.org/feed/",    "en"),   # fallback
    ]
    intel_global: list[dict] = []
    async with httpx.AsyncClient(timeout=14.0, follow_redirects=True) as ic_client:
        for ic_url, lang in IC_FEEDS:
            try:
                ic_resp = await ic_client.get(ic_url, headers=HDR)
                if ic_resp.status_code != 200:
                    continue
                ic_root = ET.fromstring(ic_resp.text)
            except Exception:
                continue

            for item in ic_root.findall(".//item")[:8]:
                titulo = _strip_html(item.findtext("title") or "")
                link   = (item.findtext("link") or "").strip()
                if not titulo or not link:
                    continue
                pub_date = item.findtext("pubDate", "")
                if (agora - _ts(pub_date)) > LIMITE_DIAS:
                    continue
                resumo = _strip_html(item.findtext("description") or "")[:300]

                # Extração de imagem — WordPress coloca featured image no content:encoded
                CONTENT_NS = "http://purl.org/rss/1.0/modules/content/"
                _IMG_URL   = re.compile(r'https?://[^\s"\'<>&]*\.(?:jpg|jpeg|png|webp)(?:\?[^\s"\'<>&]*)?', re.IGNORECASE)
                imagem = ""
                # 1) media:content / media:thumbnail
                for _tag in (f"{{{MEDIA_NS}}}content", f"{{{MEDIA_NS}}}thumbnail"):
                    _el = item.find(_tag)
                    if _el is not None and _el.get("url", ""):
                        imagem = _el.get("url", "")
                        break
                # 2) enclosure
                if not imagem:
                    enc = item.find("enclosure")
                    if enc is not None and enc.get("type", "").startswith("image"):
                        imagem = enc.get("url", "")
                # 3) content:encoded — HTML com <img src="...">
                if not imagem:
                    encoded = item.findtext(f"{{{CONTENT_NS}}}encoded") or ""
                    _im = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', encoded)
                    if _im:
                        imagem = _im.group(1)
                # 4) Varredura bruta no XML serializado do item
                if not imagem:
                    _frag = ET.tostring(item, encoding="unicode")
                    _im2  = _IMG_URL.search(_frag)
                    if _im2:
                        imagem = _im2.group(0)

                intel_global.append({
                    "titulo": titulo,
                    "resumo": resumo,
                    "link":   link,
                    "imagem": imagem,
                    "data":   pub_date,
                    "lang":   lang,
                    "fonte":  "insightcrime",
                })

            if intel_global:  # conseguiu artigos → não tenta o fallback
                break

    # ── 5. Salva e retorna ───────────────────────────────────────────────────
    hoje = datetime.now().strftime("%d/%m/%Y")
    dados = {
        "noticias":     artigos,
        "intel_global": intel_global,
        "total":        len(artigos),
        "data":         hoje,
    }
    caminho = os.path.join(PASTA_RELATORIOS, "noticias_crimes.json")
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)

    return {"status": "ok", "total": len(artigos), "data": hoje}


@router.post("/noticias/salvar")
async def salvar_noticias(dados: dict, user: dict = Depends(require_module("dashboard"))):
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