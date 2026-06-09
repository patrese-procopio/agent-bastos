import os, json
from dotenv import load_dotenv
from datasets import Dataset
from ragas.metrics import Faithfulness, AnswerRelevancy, ContextPrecision, ContextRecall
from ragas import evaluate
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from groq import Groq

load_dotenv()

ROOT_DIR    = os.path.dirname(os.path.abspath(__file__))
CHROMA_DIR  = os.path.join(ROOT_DIR, "data", "chroma_db")
REPORT_PATH = os.path.join(ROOT_DIR, "data", "relatorios", "ragas_report.json")

PERGUNTAS = [
    {
        "question": "O que e contrainteligencia e qual e sua finalidade na atividade de inteligencia penitenciaria?",
        "ground_truth": (
            "A Contrainteligencia (CI) e o ramo da atividade de IPEN que se destina a produzir "
            "conhecimentos e adotar medidas para proteger a atividade de inteligencia penitenciaria. "
            "Sua finalidade e neutralizar acoes adversas de qualquer natureza que possam comprometer "
            "a seguranca das informacoes e das operacoes dos organismos de inteligencia penitenciaria."
        ),
    },
    {
        "question": "Quais sao as cinco fases do ciclo de inteligencia e quem executa cada uma delas?",
        "ground_truth": (
            "O ciclo de inteligencia e composto por cinco fases: objetivar, acompanhar, informar, "
            "decidir e agir. As tres primeiras fases — objetivar, acompanhar e informar — sao "
            "realizadas pelos organismos de inteligencia penitenciaria. A fase de decidir e sempre "
            "responsabilidade do usuario da inteligencia, e a fase de agir cabe as instancias "
            "determinadas pelo usuario."
        ),
    },
    {
        "question": "Como se classificam as fontes de inteligencia penitenciaria e quais sao suas caracteristicas?",
        "ground_truth": (
            "As fontes de inteligencia penitenciaria se dividem em dois tipos: fontes abertas, "
            "que sao de livre acesso a Agencia de Inteligencia Penitenciaria (AIPEN), e fontes "
            "protegidas, cujos dados sao negados ao acesso publico. As fontes abertas incluem "
            "documentos publicos, midia e informacoes de livre circulacao. As fontes protegidas "
            "exigem tecnicas especiais de coleta e autorizacao para acesso."
        ),
    },
    {
        "question": "Quais sao os principios fundamentais que regem a atividade de inteligencia penitenciaria?",
        "ground_truth": (
            "A atividade de inteligencia penitenciaria e regida por principios fundamentais que "
            "orientam sua execucao, incluindo a oportunidade, a objetividade, a seguranca e a "
            "imparcialidade. Esses principios garantem que os conhecimentos produzidos sejam "
            "uteis, precisos, protegidos e isentos de influencias externas, assegurando a "
            "qualidade e a confiabilidade das informacoes para o processo decisorio."
        ),
    },
    {
        "question": "Como a AIPEN se organiza e quais sao suas principais atribuicoes no sistema penitenciario?",
        "ground_truth": (
            "A Agencia de Inteligencia Penitenciaria (AIPEN) e o organismo central do sistema de "
            "inteligencia penitenciaria, responsavel por coordenar, planejar e executar as "
            "atividades de inteligencia no ambito do sistema prisional. Suas principais atribuicoes "
            "incluem a producao de conhecimentos sobre grupos criminosos, o monitoramento de "
            "liderancas, a protecao das informacoes institucionais e o assessoramento dos gestores "
            "com base em dados qualificados."
        ),
    },
    {
        "question": "O que e o ciclo de producao do conhecimento e como ele se relaciona com a tomada de decisao?",
        "ground_truth": (
            "O ciclo de producao do conhecimento e o processo sistematico pelo qual dados brutos "
            "sao transformados em conhecimento acionavel para o processo decisorio. Ele envolve "
            "coleta, processamento, analise e disseminacao de informacoes. A relacao com a tomada "
            "de decisao e direta: o conhecimento produzido pelos organismos de inteligencia "
            "subsidia o usuario — o gestor ou autoridade competente — que decide e determina "
            "as acoes a serem executadas pelas instancias responsaveis."
        ),
    },
    {
        "question": "Quais documentos sao produzidos pela atividade de inteligencia penitenciaria?",
        "ground_truth": (
            "A atividade de inteligencia penitenciaria produz diversos tipos de documentos, "
            "incluindo o Relatorio de Inteligencia (RELINT), o Relatorio Especial (REPEN), "
            "o Pedido de Busca, a Minuta de Oficio e o Projeto. Cada documento possui finalidade "
            "especifica: o RELINT sintetiza conhecimentos produzidos, o REPEN trata de situacoes "
            "especiais, e o Pedido de Busca solicita informacoes a outros organismos."
        ),
    },
    {
        "question": "Como se define dado, informacao e conhecimento no contexto da inteligencia penitenciaria?",
        "ground_truth": (
            "No contexto da inteligencia penitenciaria, dado e o elemento bruto ainda nao "
            "processado, sem significado estabelecido. Informacao e o dado processado que adquire "
            "significado em determinado contexto. Conhecimento e o produto final da atividade de "
            "inteligencia, resultante da analise e interpretacao de informacoes, com valor para "
            "o processo decisorio. A transformacao de dado em conhecimento e o objetivo central "
            "do ciclo de inteligencia."
        ),
    },
]

print("[*] Carregando embeddings e ChromaDB...")
embeddings = HuggingFaceEmbeddings(model_name="intfloat/multilingual-e5-small")
db = Chroma(persist_directory=CHROMA_DIR, embedding_function=embeddings)
print(f"[+] {db._collection.count()} chunks disponiveis.")
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))


def recuperar_chunks(pergunta, top_k=6):
    docs = db.similarity_search(pergunta, k=top_k)
    return [doc.page_content for doc in docs]


def gerar_resposta(pergunta, contexto):
    ctx = "\n\n".join([f"[TRECHO {i+1}]\n{c}" for i, c in enumerate(contexto)])
    prompt = (
        "Voce e o BASTOS-UNIT, analista de inteligencia penitenciaria da SEAP/AM. "
        "Responda APENAS com base nos trechos abaixo. Seja completo e preciso.\n\n"
        f"### DOUTRINA\n{ctx}\n\n"
        f"### PERGUNTA\n{pergunta}\n\n"
        "### RESPOSTA:"
    )
    r = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=768,
    )
    return r.choices[0].message.content


questions, answers, contexts, ground_truths = [], [], [], []

for i, item in enumerate(PERGUNTAS, 1):
    print(f"[{i}/{len(PERGUNTAS)}] {item['question'][:60]}...")
    chunks   = recuperar_chunks(item["question"])
    resposta = gerar_resposta(item["question"], chunks)
    questions.append(item["question"])
    answers.append(resposta)
    contexts.append(chunks)
    ground_truths.append(item["ground_truth"])
    print(f"  OK resposta gerada.")

print("\n[*] Calculando metricas RAGAS...")
from ragas.llms import LangchainLLMWrapper
from ragas.embeddings import LangchainEmbeddingsWrapper
from langchain_groq import ChatGroq

llm_av = LangchainLLMWrapper(ChatGroq(
    model="llama-3.3-70b-versatile",
    api_key=os.getenv("GROQ_API_KEY"),
    temperature=0,
))
emb_av = LangchainEmbeddingsWrapper(
    HuggingFaceEmbeddings(model_name="intfloat/multilingual-e5-small")
)

dataset = Dataset.from_dict({
    "question":     questions,
    "answer":       answers,
    "contexts":     contexts,
    "ground_truth": ground_truths,
})

resultado = evaluate(
    dataset=dataset,
    metrics=[Faithfulness(), AnswerRelevancy(), ContextPrecision(), ContextRecall()],
    llm=llm_av,
    embeddings=emb_av,
    run_config={"max_workers": 1, "timeout": 120},
)

df     = resultado.to_pandas()
scores = df[["faithfulness", "answer_relevancy", "context_precision", "context_recall"]].mean()

print("\n" + "="*55)
print("   RESULTADOS RAGAS v3 — AGENT BASTOS")
print("="*55)
for metrica, score in scores.items():
    nivel = "OTIMO" if score >= 0.85 else "BOM" if score >= 0.7 else "PRECISA MELHORAR"
    emoji = "✅" if score >= 0.85 else "🟡" if score >= 0.7 else "❌"
    print(f"{emoji} {metrica:25s}: {score:.3f}  [{nivel}]")

os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
with open(REPORT_PATH, "w", encoding="utf-8") as f:
    json.dump({
        "versao": "v3",
        "scores": {k: round(float(v), 3) for k, v in scores.items()},
    }, f, indent=2)
print(f"\n[+] Relatorio salvo em: {REPORT_PATH}")