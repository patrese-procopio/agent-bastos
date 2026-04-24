import os, json
from dotenv import load_dotenv
from datasets import Dataset
from ragas.metrics.collections import faithfulness, answer_relevancy, context_precision, context_recall
from ragas import evaluate
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings
from groq import Groq

load_dotenv()

ROOT_DIR    = os.path.dirname(os.path.abspath(__file__))
CHROMA_DIR  = os.path.join(ROOT_DIR, "data", "chroma_db")
REPORT_PATH = os.path.join(ROOT_DIR, "data", "relatorios", "ragas_report.json")

PERGUNTAS = [
    {"question": "O que e contrainteligencia no contexto da inteligencia penitenciaria?",
     "ground_truth": "A Contrainteligencia (CI) e o ramo da atividade de IPEN que se destina a produzir conhecimentos e adotar medidas para proteger a atividade de inteligencia penitenciaria."},
    {"question": "Quantas fases tem o ciclo de inteligencia e quais sao elas?",
     "ground_truth": "O ciclo de inteligencia e composto por cinco fases: objetivar, acompanhar, informar, decidir e agir. As tres primeiras sao realizadas pelos organismos de inteligencia e as duas finais ocorrem em outras esferas."},
    {"question": "Quais sao os tipos de fontes de inteligencia penitenciaria?",
     "ground_truth": "As fontes de inteligencia penitenciaria se dividem em dois tipos: fontes abertas, que sao de livre acesso a Agencia de Inteligencia Penitenciaria (AIPEN), e fontes protegidas, cujos dados sao negados."},
    {"question": "Como o ciclo de inteligencia pode ser esquematizado?",
     "ground_truth": "O funcionamento do ramo inteligencia pode ser esquematizado em um ciclo composto por cinco fases caracterizadas por acoes: objetivar, acompanhar, informar, decidir e agir."},
    {"question": "Qual e o papel dos organismos de inteligencia no ciclo de inteligencia?",
     "ground_truth": "Os organismos de inteligencia realizam as tres primeiras fases do ciclo: objetivar, acompanhar e informar. A decisao e sempre do usuario e a acao e das instancias por ele determinadas."},
]

print("[*] Carregando embeddings e ChromaDB...")
embeddings = HuggingFaceEmbeddings(model_name="intfloat/multilingual-e5-small")
db = Chroma(persist_directory=CHROMA_DIR, embedding_function=embeddings)
print(f"[+] {db._collection.count()} chunks disponiveis.")
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def recuperar_chunks(pergunta, top_k=4):
    docs = db.similarity_search(pergunta, k=top_k)
    return [doc.page_content for doc in docs]

def gerar_resposta(pergunta, contexto):
    ctx = "\n\n".join([f"[TRECHO {i+1}]\n{c}" for i, c in enumerate(contexto)])
    prompt = f"Voce e o BASTOS-UNIT. Responda APENAS com base nos trechos abaixo.\n\n### DOUTRINA\n{ctx}\n\n### PERGUNTA\n{pergunta}\n\n### RESPOSTA:"
    r = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2, max_tokens=512,
    )
    return r.choices[0].message.content

questions, answers, contexts, ground_truths = [], [], [], []

for i, item in enumerate(PERGUNTAS, 1):
    print(f"[{i}/5] {item['question'][:60]}...")
    chunks = recuperar_chunks(item["question"])
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

llm_av = LangchainLLMWrapper(ChatGroq(model="llama-3.3-70b-versatile", api_key=os.getenv("GROQ_API_KEY"), temperature=0))
emb_av = LangchainEmbeddingsWrapper(HuggingFaceEmbeddings(model_name="intfloat/multilingual-e5-small"))

dataset = Dataset.from_dict({"question": questions, "answer": answers, "contexts": contexts, "ground_truth": ground_truths})
resultado = evaluate(dataset=dataset, metrics=[faithfulness, answer_relevancy, context_precision, context_recall], llm=llm_av, embeddings=emb_av)

df = resultado.to_pandas()
scores = df[["faithfulness","answer_relevancy","context_precision","context_recall"]].mean()

print("\n" + "="*55)
print("   RESULTADOS RAGAS v2 - AGENT BASTOS")
print("="*55)
for metrica, score in scores.items():
    nivel = "OTIMO" if score >= 0.8 else "BOM" if score >= 0.6 else "PRECISA MELHORAR"
    print(f"{metrica:25s}: {score:.3f}  [{nivel}]")

os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
with open(REPORT_PATH, "w", encoding="utf-8") as f:
    json.dump({"versao": "v2", "scores": {k: round(float(v), 3) for k, v in scores.items()}}, f, indent=2)
print(f"\n[+] Relatorio salvo em: {REPORT_PATH}")
