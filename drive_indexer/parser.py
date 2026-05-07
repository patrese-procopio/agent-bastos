# drive_indexer/parser.py
#
# CONCEITO: Regex com grupos nomeados
# Em vez de regex genérico que retorna posições numéricas (grupo 1, grupo 2...),
# grupos nomeados (?P<nome>) deixam o código legível e à prova de reordenação.
# É o padrão de mercado para extração de dados não estruturados.

import re
from dataclasses import dataclass
from typing import Optional


@dataclass
class DocumentoMetadata:
    """
    Dataclass é como um dicionário com tipos definidos.
    Mais seguro que dict puro — o editor já avisa se você errar o nome do campo.
    """
    tipo: str                    # RELINT ou RELTEC
    numero: str                  # 274
    ano: str                     # 2019
    assunto: str                 # PESQUISA SOCIAL ESTAGIARIOS
    mes: Optional[str]           # Agosto (só para 2019/2020)
    formato: str                 # docx ou pdf
    nome_original: str           # nome bruto do arquivo para auditoria
    classificado: bool = True    # False = parser não conseguiu extrair


# Todos os padrões mapeados nos 6 anos, do mais específico para o mais genérico
# A ordem importa: o regex tenta cada padrão em sequência e para no primeiro match
PADROES_REGEX = [

    # 2020: RELINT Nº 128-2020 - ASSUNTO ou RELINT Nº128-2020 ASSUNTO
    re.compile(
        r"^(?P<tipo>RELINT|RELTEC)\s+N[ºo°]?\s*(?P<numero>\d{3})-(?P<ano>20\d{2})\s*[-–]?\s*(?P<assunto>.+)",
        re.IGNORECASE
    ),

    # 2018/2019: RELINT - 047-2018 ASSUNTO
    re.compile(
        r"^(?P<tipo>RELINT|RELTEC)\s*[-–]\s*(?P<numero>\d{3})-(?P<ano>20\d{2})\s*[-–]?\s*(?P<assunto>.*)",
        re.IGNORECASE
    ),

    # 2017: RELINT - 091-2017 INFORMAÇÃO (ano no meio, sem hífen orgão)
    re.compile(
        r"^(?P<tipo>RELINT|RELTEC)\s*[-–]\s*(?P<numero>\d{3})\s+(?P<ano>20\d{2})\s+(?P<assunto>.+)",
        re.IGNORECASE
    ),

    # 2016: RELINT 001 - DIPEN SEAP - ASSUNTO (sem ano no nome)
    re.compile(
        r"^(?P<tipo>RELINT|RELTEC)\s+(?P<numero>\d{3})\s*[-–]\s*(?P<orgao>[A-Z\s\-]+?)\s*[-–]\s*(?P<assunto>.+)",
        re.IGNORECASE
    ),

    # 2015: RELINT - 068-DIPEN-SEAP - ASSUNTO
    re.compile(
        r"^(?P<tipo>ADITIVO\s+RELINT|RELINT|RELTEC)\s*[-–]\s*(?P<numero>\d{3})-(?P<orgao>[A-Z]+-[A-Z]+(?:-[A-Z]+)?)\s*[-–]\s*(?P<assunto>.+)",
        re.IGNORECASE
    ),

    # Fallback genérico: captura qualquer coisa com número de 3 dígitos
    re.compile(
        r"^(?P<tipo>RELINT|RELTEC).*?(?P<numero>\d{3}).*?(?P<assunto>[A-Z]{3}.+)",
        re.IGNORECASE
    ),
]

# Arquivos temporários do Word — descartar silenciosamente
PATTERN_TEMP = re.compile(r"^\~\$")

# Mapa de número do mês para nome
MESES = {
    "1": "Janeiro", "2": "Fevereiro", "3": "Março", "4": "Abril",
    "5": "Maio", "6": "Junho", "7": "Julho", "8": "Agosto",
    "9": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembro"
}


def extrair_mes_da_pasta(nome_pasta: str) -> Optional[str]:
    """
    Extrai o mês do nome da subpasta.
    '8.AGOSTO' → 'Agosto'
    '10. OUTUBRO' → 'Outubro'
    """
    match = re.match(r"^(\d{1,2})\.\s*([A-ZÇÃÕ]+)", nome_pasta.strip(), re.IGNORECASE)
    if match:
        return match.group(2).capitalize()
    return None


def parsear_nome_arquivo(
    nome: str,
    ano_pasta: str,
    mes_pasta: Optional[str] = None
) -> DocumentoMetadata:
    """
    Tenta extrair metadados do nome do arquivo.
    Se nenhum padrão bater, retorna registro com classificado=False
    para revisão manual — nunca descarta silenciosamente.
    """
    # Remove extensão
    nome_sem_ext = re.sub(r"\.(docx?|pdf)$", "", nome, flags=re.IGNORECASE)
    formato = "pdf" if nome.lower().endswith(".pdf") else "docx"

    # Descarta arquivos temporários do Word
    if PATTERN_TEMP.match(nome):
        return None

    for padrao in PADROES_REGEX:
        match = padrao.match(nome_sem_ext.strip())
        if match:
            grupos = match.groupdict()
            tipo = grupos.get("tipo", "RELINT").upper().replace(" ", "_")
            return DocumentoMetadata(
                tipo=tipo,
                numero=grupos.get("numero", "???"),
                ano=grupos.get("ano", ano_pasta),
                assunto=grupos.get("assunto", "").strip().title(),
                mes=mes_pasta,
                formato=formato,
                nome_original=nome,
                classificado=True
            )

    # Nenhum padrão bateu — registra para revisão
    return DocumentoMetadata(
        tipo="DESCONHECIDO",
        numero="???",
        ano=ano_pasta,
        assunto=nome_sem_ext,
        mes=mes_pasta,
        formato=formato,
        nome_original=nome,
        classificado=False
    )