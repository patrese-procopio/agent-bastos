"""
pegada_digital.py — Redes sociais, e-mail e telefone a partir de IDENTIFICADORES informados
Agent Bastos | Segurança Pública/Corporativa

O que faz (em segundo plano, como "job"):
  username → Maigret (ferramenta isolada em tools/osint_venv): procura o username em centenas
             de sites e extrai nome/foto/local do perfil. Sem recursão (não segue para outras pessoas).
  telefone → análise offline (biblioteca phonenumbers): validade, tipo, UF/região pelo DDD, operadora
             de origem (pode ter mudado por portabilidade) e links de busca. NÃO consulta ninguém.
  e-mail   → análise local + Gravatar (existência de avatar/perfil público pelo hash do e-mail).
             NÃO usa Holehe nem testa cadastros/recuperação de senha em sites (poderia alertar o alvo).

Regras de projeto:
  - username igual NÃO prova identidade: uma conta só vira "provável" se o NOME do perfil bate com o
    pesquisado; senão fica "possível (só username)". O analista confirma manualmente.
  - nunca parte do nome da pessoa: só de identificadores que o operador informou (ou o vulgo, se ele
    autorizar, com aviso de baixa precisão).
  - um job pesado por vez; limite de usernames por job; tempo máximo; registro no audit LGPD.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Any

import httpx

from .receita_cnpj import norm, tokens

try:
    from config.paths import BASE_DIR
    _BASE = Path(BASE_DIR)
except Exception:
    _BASE = Path(__file__).resolve().parents[2]

_WIN = os.name == "nt"
TOOLS_PY = _BASE / "tools" / "osint_venv" / ("Scripts" if _WIN else "bin") / ("python.exe" if _WIN else "python")
PROFUNDIDADE = {"rapida": 100, "padrao": 250, "completa": 500}   # nº de sites (Maigret, por Alexa rank)
MAX_USERNAMES = 4
MAX_POR_TIPO = 3          # e-mails / telefones / usernames descobertos por tipo
TIMEOUT_MAIGRET_S = 12 * 60
MAX_JOBS = 60

_jobs: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()
_um_por_vez = threading.Semaphore(1)  # Maigret é pesado: um job por vez

ESTADOS = {"AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas", "BA": "Bahia", "CE": "Ceará",
           "DF": "Distrito Federal", "ES": "Espírito Santo", "GO": "Goiás", "MA": "Maranhão", "MT": "Mato Grosso",
           "MS": "Mato Grosso do Sul", "MG": "Minas Gerais", "PA": "Pará", "PB": "Paraíba", "PR": "Paraná",
           "PE": "Pernambuco", "PI": "Piauí", "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte",
           "RS": "Rio Grande do Sul", "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina", "SP": "São Paulo",
           "SE": "Sergipe", "TO": "Tocantins"}
CAPITAIS = {"AC": "Rio Branco", "AL": "Maceió", "AP": "Macapá", "AM": "Manaus", "BA": "Salvador", "CE": "Fortaleza",
            "DF": "Brasília", "ES": "Vitória", "GO": "Goiânia", "MA": "São Luís", "MT": "Cuiabá", "MS": "Campo Grande",
            "MG": "Belo Horizonte", "PA": "Belém", "PB": "João Pessoa", "PR": "Curitiba", "PE": "Recife",
            "PI": "Teresina", "RJ": "Rio de Janeiro", "RN": "Natal", "RS": "Porto Alegre", "RO": "Porto Velho",
            "RR": "Boa Vista", "SC": "Florianópolis", "SP": "São Paulo", "SE": "Aracaju", "TO": "Palmas"}

DDD_UF = {'11': 'SP', '12': 'SP', '13': 'SP', '14': 'SP', '15': 'SP', '16': 'SP', '17': 'SP', '18': 'SP', '19': 'SP', '21': 'RJ', '22': 'RJ', '24': 'RJ', '27': 'ES', '28': 'ES', '31': 'MG', '32': 'MG', '33': 'MG', '34': 'MG', '35': 'MG', '37': 'MG', '38': 'MG', '41': 'PR', '42': 'PR', '43': 'PR', '44': 'PR', '45': 'PR', '46': 'PR', '47': 'SC', '48': 'SC', '49': 'SC', '51': 'RS', '53': 'RS', '54': 'RS', '55': 'RS', '61': 'DF', '62': 'GO', '64': 'GO', '63': 'TO', '65': 'MT', '66': 'MT', '67': 'MS', '68': 'AC', '69': 'RO', '71': 'BA', '73': 'BA', '74': 'BA', '75': 'BA', '77': 'BA', '79': 'SE', '81': 'PE', '87': 'PE', '82': 'AL', '83': 'PB', '84': 'RN', '85': 'CE', '88': 'CE', '86': 'PI', '89': 'PI', '91': 'PA', '93': 'PA', '94': 'PA', '92': 'AM', '97': 'AM', '95': 'RR', '96': 'AP', '98': 'MA', '99': 'MA'}

PROVEDORES_LIVRES = {"gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.com.br", "live.com",
                     "icloud.com", "bol.com.br", "uol.com.br", "terra.com.br", "protonmail.com", "proton.me"}


# ─────────────────────────────────────────────
# TELEFONE (offline)
# ─────────────────────────────────────────────

def analisar_telefone(numero: str) -> dict[str, Any]:
    try:
        import phonenumbers
        from phonenumbers import PhoneNumberFormat as F, PhoneNumberType as T
        from phonenumbers import carrier, geocoder, timezone
    except ImportError:
        return {"erro": "biblioteca phonenumbers não instalada"}
    try:
        n = phonenumbers.parse(numero, "BR")
    except Exception as exc:
        return {"valido": False, "erro": f"número ilegível: {exc}"}
    tipos = {T.MOBILE: "celular", T.FIXED_LINE: "fixo", T.FIXED_LINE_OR_MOBILE: "fixo ou celular",
             T.VOIP: "VoIP", T.TOLL_FREE: "0800", T.UNKNOWN: "desconhecido"}
    e164 = phonenumbers.format_number(n, F.E164)
    nacional = phonenumbers.format_number(n, F.NATIONAL)
    local = geocoder.description_for_number(n, "pt") or ""
    ddd = re.sub(r"\D", "", nacional)[:2] if n.country_code == 55 else None
    uf = DDD_UF.get(ddd or "")  # o DDD é mais confiável que o texto da região
    digitos = re.sub(r"\D", "", e164)
    return {
        "valido": phonenumbers.is_valid_number(n), "formatado": nacional, "internacional": phonenumbers.format_number(n, F.INTERNATIONAL),
        "pais_codigo": n.country_code, "ddd": ddd, "tipo": tipos.get(phonenumbers.number_type(n), "outro"),
        "regiao": local or None, "uf": uf,
        "operadora_origem": carrier.name_for_number(n, "pt") or None,
        "nota_operadora": "operadora de ORIGEM da faixa; pode ter mudado por portabilidade",
        "fuso": list(timezone.time_zones_for_number(n)),
        "links": [
            {"rotulo": "Google (número entre aspas)", "url": f'https://www.google.com/search?q="{nacional}" OR "{digitos}"'},
            {"rotulo": "WhatsApp (abrir conversa — não consulta nada)", "url": f"https://wa.me/{digitos}"},
        ],
    }


# ─────────────────────────────────────────────
# E-MAIL (local + Gravatar)
# ─────────────────────────────────────────────

def analisar_email(email: str) -> dict[str, Any]:
    email = email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return {"valido": False, "erro": "e-mail inválido"}
    local, dominio = email.split("@", 1)
    r: dict[str, Any] = {
        "valido": True, "dominio": dominio, "parte_local": local,
        "tipo": "institucional (governo)" if dominio.endswith(".gov.br") else
                ("provedor gratuito" if dominio in PROVEDORES_LIVRES else "domínio próprio/corporativo"),
        "candidatos_username": sorted({local, re.sub(r"[._\-]", "", local)} - {""}),
        "links": [{"rotulo": "Google (e-mail entre aspas)", "url": f'https://www.google.com/search?q="{email}"'}],
    }
    # Gravatar: só pelo hash; não notifica ninguém
    h = hashlib.md5(email.encode()).hexdigest()
    try:
        a = httpx.get(f"https://www.gravatar.com/avatar/{h}?d=404&s=200", timeout=15, headers={"User-Agent": "AgentBastos/1.0"})
        r["gravatar"] = {"existe": a.status_code == 200}
        if a.status_code == 200 and a.headers.get("content-type", "").startswith("image/") and len(a.content) <= 2_000_000:
            r["gravatar"]["_bytes"] = a.content
            r["gravatar"]["_mime"] = a.headers["content-type"].split(";")[0]
        p = httpx.get(f"https://gravatar.com/{h}.json", timeout=15, headers={"User-Agent": "AgentBastos/1.0"}, follow_redirects=True)
        if p.status_code == 200:
            e = (p.json().get("entry") or [{}])[0]
            r["gravatar"].update(nome=e.get("displayName"), local=e.get("currentLocation"), sobre=(e.get("aboutMe") or "")[:200],
                                 contas=[x.get("url") for x in (e.get("accounts") or []) if x.get("url")][:8])
    except Exception:
        r["gravatar"] = {"existe": None, "erro": "Gravatar indisponível"}
    return r


# ─────────────────────────────────────────────
# USERNAME (Maigret)
# ─────────────────────────────────────────────

def ferramenta_disponivel() -> bool:
    return TOOLS_PY.exists()


def _variantes_vulgo(vulgo: str) -> list[str]:
    base = norm(vulgo).lower().replace(" ", "")
    out = [base] if len(base) >= 4 else []
    com_sep = norm(vulgo).lower().replace(" ", "_")
    if com_sep != base and len(com_sep) >= 4:
        out.append(com_sep)
    return out


def _pontuar(conta: dict[str, Any], nome: str | None, ufs: list[str]) -> tuple[int, list[str]]:
    """Pontua a chance de a conta ser DA PESSOA. Username igual, sozinho, vale pouco."""
    pontos, motivos = 20, ["username igual ao informado (não prova identidade)"]
    perfil = str(conta.get("nome_perfil") or "")
    if nome and tokens(nome):
        qt, pt = tokens(nome), set(tokens(perfil))
        if qt and set(qt) <= pt and len(qt) >= 2:
            pontos, motivos = 70, ["nome do perfil contém o nome completo pesquisado"]
        elif len(qt) >= 2 and qt[0] in pt and qt[-1] in pt:
            pontos, motivos = 55, ["nome do perfil tem o primeiro e o último nome"]
        elif len(qt) >= 2 and (qt[0] in pt or qt[-1] in pt):
            pontos += 10; motivos.append("nome do perfil tem parte do nome pesquisado")
    texto = norm(f"{conta.get('local') or ''} {conta.get('bio') or ''}")
    for uf in ufs:
        if norm(ESTADOS.get(uf, "")) and norm(ESTADOS[uf]) in texto or norm(CAPITAIS.get(uf, "")) in texto:
            pontos += 15; motivos.append(f"local/bio coerente com {uf} (contexto da pesquisa)"); break
    return min(pontos, 95), motivos


def _baixar_imagem(url: str) -> tuple[bytes, str] | None:
    try:
        r = httpx.get(url, timeout=15, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"})
        mime = (r.headers.get("content-type") or "").split(";")[0]
        if r.status_code == 200 and mime.startswith("image/") and 300 < len(r.content) <= 2_000_000:
            return r.content, mime
    except Exception:
        pass
    return None


def _rodar_maigret(username: str, n_sites: int, job: dict[str, Any], nome: str | None, ufs: list[str]) -> list[dict[str, Any]]:
    saida = tempfile.mkdtemp(prefix="mg_")
    env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
    cmd = [str(TOOLS_PY), "-X", "utf8", "-m", "maigret", username, "--top-sites", str(n_sites), "--timeout", "12",
           "--retries", "1", "--no-recursion", "--no-progressbar", "--no-color", "--no-autoupdate",
           "-J", "simple", "-fo", saida]
    prog = job["etapas"]["maigret"]["progresso"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8",
                            errors="replace", env=env, cwd=str(_BASE))
    t0 = time.monotonic()

    def _ler():
        for linha in proc.stdout:  # type: ignore[union-attr]
            if linha.startswith("[+]"):
                prog["encontradas"] += 1
    leitor = threading.Thread(target=_ler, daemon=True); leitor.start()
    try:
        while proc.poll() is None:
            prog["decorrido_s"] = int(time.monotonic() - t0)
            if time.monotonic() - t0 > TIMEOUT_MAIGRET_S:
                proc.kill(); job["avisos"].append(f"Maigret excedeu {TIMEOUT_MAIGRET_S // 60} min em '{username}' — resultado parcial descartado")
                return []
            time.sleep(1)
    finally:
        leitor.join(timeout=3)

    arq = next(Path(saida).glob("report_*_simple.json"), None)
    if not arq:
        return []
    dados = json.loads(arq.read_text(encoding="utf-8", errors="replace"))
    contas = []
    for site, v in dados.items():
        st = v.get("status") or {}
        if st.get("status") != "Claimed":
            continue
        ids = st.get("ids") or {}
        c = {"site": site, "url": v.get("url_user"), "username": username, "tags": (v.get("site") or {}).get("tags", []),
             "nome_perfil": ids.get("fullname") or ids.get("name"), "username_perfil": ids.get("username") or ids.get("tiktok_username"),
             "local": ids.get("location"), "bio": ids.get("bio") or ids.get("description"), "criada_em": ids.get("created_at"),
             "seguidores": ids.get("follower_count"), "imagem_url": ids.get("image"), "ranking": v.get("rank"),
             "confirmada": False}
        c["confianca"], c["motivos"] = _pontuar(c, nome, ufs)
        contas.append(c)
    return contas


def _nivel(p: int) -> str:
    return "confirmado" if p >= 90 else "provavel" if p >= 55 else "possivel"


# ─────────────────────────────────────────────
# DESCOBERTA AUTOMÁTICA DE IDENTIFICADORES
# ─────────────────────────────────────────────

_RE_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]{2,}@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
_RE_TEL = re.compile(r"(?<!\d)(?:\+?55[\s.\-]?)?\(?0?([1-9]{2})\)?[\s.\-]?(9?\d{4})[\s.\-]?(\d{4})(?!\d)")
_FONTES_TEXTO = ("referencias", "djen", "diario_am", "querido_diario", "lista_negra", "liderancas")


def _textos(a: dict[str, Any]) -> list[str]:
    d = a.get("dados") or {}
    return [str(d.get(k)) for k in ("trecho", "descricao", "observacao", "assunto") if d.get(k)]


def descobrir_identificadores(achados: list[dict[str, Any]]) -> dict[str, list[tuple[str, str]]]:
    """
    Procura identificadores digitais NOS ACHADOS já confirmados/prováveis (nunca nos "possíveis",
    que podem ser homônimos):
      - vulgo das Lideranças → username (baixa precisão);
      - e-mails e telefones que aparecem nos trechos de documentos/publicações/observações.
    Retorna {"usernames": [(valor, origem)], "emails": [...], "telefones": [...]}.
    """
    r: dict[str, list[tuple[str, str]]] = {"usernames": [], "emails": [], "telefones": []}
    vistos: set[str] = set()

    def add(tipo: str, valor: str, origem: str) -> None:
        chave = f"{tipo}:{valor.lower()}"
        if chave not in vistos:
            vistos.add(chave); r[tipo].append((valor, origem))

    for a in achados:
        if a.get("nivel") not in ("confirmado", "provavel"):
            continue
        d, fonte = a.get("dados") or {}, a.get("fonte")
        if fonte == "liderancas" and d.get("vulgo"):
            for u in _variantes_vulgo(d["vulgo"]):
                add("usernames", u, "vulgo (Lideranças)")
        if fonte == "tse":
            for e in d.get("emails") or []:
                add("emails", e, "e-mail público de campanha (TSE)")
        if fonte in _FONTES_TEXTO:
            rotulo = {"referencias": "Referências", "djen": "DJEN", "diario_am": "DOE-AM", "querido_diario": "Diário Oficial",
                      "lista_negra": "Lista Negra", "liderancas": "Lideranças"}[fonte]
            for t in _textos(a):
                for e in _RE_EMAIL.findall(t):
                    add("emails", e.lower().strip(".,;"), f"encontrado em {rotulo}")
                for ddd, p1, p2 in _RE_TEL.findall(t):
                    add("telefones", f"({ddd}) {p1}-{p2}", f"encontrado em {rotulo}")
    for k in r:
        r[k] = r[k][:MAX_POR_TIPO]
    return r


def variacoes_nome(nome: str) -> list[str]:
    """Variações de username a partir do NOME (opt-in do analista; baixíssima precisão)."""
    t = tokens(nome)
    if len(t) < 2:
        return []
    a, b = t[0].lower(), t[-1].lower()
    cand = [f"{a}.{b}", f"{a}{b}", f"{a}_{b}"]
    return [c for c in dict.fromkeys(cand) if len(c) >= 5][:3]


# ─────────────────────────────────────────────
# JOBS
# ─────────────────────────────────────────────

def _podar() -> None:
    while len(_jobs) > MAX_JOBS:
        _jobs.pop(next(iter(_jobs)))


def _mask_email(e: str) -> str:
    a, _, d = e.partition("@")
    return f"{a[:2]}***@{d}"


def _mask_tel(t: str) -> str:
    d = re.sub(r"\D", "", t)
    return f"***{d[-4:]}"


def iniciar(operador: str, report_id: str | None, nome: str | None,
            usernames: list[tuple[str, str]], emails: list[tuple[str, str]], telefones: list[tuple[str, str]],
            ufs: list[str], profundidade: str, auto: bool = False) -> str:
    """usernames/emails/telefones: listas de (valor, origem). Origem: 'informado', 'vulgo…', 'encontrado em …'."""
    jid = uuid.uuid4().hex[:12]
    job: dict[str, Any] = {
        "id": jid, "estado": "executando", "iniciado": time.strftime("%Y-%m-%dT%H:%M:%S"), "fim": None,
        "operador": operador, "report_id": report_id, "avisos": [], "auto": auto,
        "entrada": {  # valores mascarados: o resultado pode ir para o relatório/PDF
            "usernames": [{"valor": u, "origem": o} for u, o in usernames],
            "emails": [{"valor": _mask_email(e), "origem": o} for e, o in emails],
            "telefones": [{"valor": _mask_tel(t), "origem": o} for t, o in telefones],
            "profundidade": profundidade},
        "etapas": {"telefones": [], "emails": [],
                   "maigret": {"estado": "pendente", "usernames": [], "progresso": {"encontradas": 0, "decorrido_s": 0}, "contas": []}},
    }
    with _lock:
        _jobs[jid] = job
        _podar()
    threading.Thread(target=_executar, daemon=True,
                     args=(job, nome, usernames, emails, telefones, ufs, profundidade)).start()
    return jid


def obter(jid: str) -> dict[str, Any] | None:
    j = _jobs.get(jid)
    if not j:
        return None
    return json.loads(json.dumps(j, default=lambda o: None))  # não expõe bytes internos


def contas_do_job(jid: str) -> list[dict[str, Any]]:
    j = _jobs.get(jid)
    return j["etapas"]["maigret"]["contas"] if j else []


def _executar(job, nome, usernames, emails, telefones, ufs, profundidade) -> None:
    from . import fotos as F
    try:
        for tel, origem in telefones[:MAX_POR_TIPO]:
            t = analisar_telefone(tel)
            t["origem"] = origem
            job["etapas"]["telefones"].append(t)
            uf_ddd = t.get("uf")
            if uf_ddd and ufs and uf_ddd not in ufs:
                job["avisos"].append(f"DDD de {t.get('formatado') or 'um telefone'} indica {uf_ddd}, diferente do contexto da pesquisa ({'/'.join(ufs)})")

        candidatos: list[tuple[str, str]] = []
        for em, origem in emails[:MAX_POR_TIPO]:
            e = analisar_email(em)
            e["origem"] = origem
            e["email_mascarado"] = _mask_email(em)
            gv = e.get("gravatar") or {}
            if gv.get("_bytes"):
                gv["foto_id"] = F.guardar_externa(gv.pop("_bytes"), gv.pop("_mime", "image/jpeg"),
                                                  {"report_id": job["report_id"], "fonte": "Gravatar (e-mail)", "legenda": _mask_email(em)})
            e.pop("parte_local", None)  # evita repetir o e-mail em claro no resultado
            job["etapas"]["emails"].append(e)
            candidatos += [(u, f"e-mail ({origem})") for u in (e.get("candidatos_username") or []) if len(u) >= 4]
        candidatos = list(usernames) + candidatos

        vistos, finais = set(), []
        for u, origem in candidatos:
            u = u.strip().lstrip("@")
            if u and u.lower() not in vistos:
                vistos.add(u.lower()); finais.append((u, origem))
        finais = finais[:MAX_USERNAMES]

        mg = job["etapas"]["maigret"]
        if not finais:
            mg["estado"] = "sem_username"
        elif not ferramenta_disponivel():
            mg["estado"] = "ferramenta_ausente"
            job["avisos"].append("Maigret não instalado (tools/osint_venv). Veja scripts/instalar_ferramentas_osint.md")
        else:
            mg["estado"] = "executando"; mg["usernames"] = [{"username": u, "origem": o} for u, o in finais]
            n_sites = PROFUNDIDADE.get(profundidade, PROFUNDIDADE["padrao"])
            with _um_por_vez:
                todas: list[dict[str, Any]] = []
                for u, origem in finais:
                    try:
                        for c in _rodar_maigret(u, n_sites, job, nome, ufs):
                            c["origem_username"] = origem
                            if origem.startswith(("vulgo", "variação")):
                                c["confianca"] = min(c["confianca"], 40)
                                c["motivos"].append("username derivado de " + origem.split(" (")[0] + ": baixa precisão")
                            todas.append(c)
                    except Exception as exc:
                        job["avisos"].append(f"Maigret falhou em '{u}': {str(exc)[:120]}")
                todas.sort(key=lambda c: c["confianca"], reverse=True)
                for c in todas:
                    c["nivel"] = _nivel(c["confianca"])
                # miniaturas só p/ as contas mais relevantes (revisão do analista); só vão à galeria após confirmação
                for c in todas[:20]:
                    if c.get("imagem_url"):
                        img = _baixar_imagem(c["imagem_url"])
                        if img:
                            c["foto_id"] = F.guardar_externa(img[0], img[1], {"report_id": job["report_id"],
                                                                                "fonte": f"Perfil — {c['site']}", "legenda": c.get("nome_perfil") or c["username"]})
                mg["contas"] = todas
            mg["estado"] = "concluido"
        job["estado"] = "concluido"
    except Exception as exc:
        job["estado"] = "erro"; job["avisos"].append(f"erro inesperado: {str(exc)[:160]}")
    finally:
        job["fim"] = time.strftime("%Y-%m-%dT%H:%M:%S")
