# -*- coding: utf-8 -*-
"""
modules/hybrid_retriever.py - Busca hibrida (vetorial + lexical) com reranking
================================================================================
Missao 35: o RAG do Agent Bastos ate aqui usava so busca vetorial (cosine
similarity via embeddings). Isso tem um ponto cego conhecido: termos exatos
importantes -- siglas (AIPEN, RELINT, REPEN), nomes proprios, numeros de
artigo -- as vezes se diluem no embedding e perdem pontos para chunks so
"semanticamente parecidos". Busca lexical (BM25) e ruim no sentido oposto:
so acha o que casa a palavra, sem entender sinonimo/parafrase.

A solucao de mercado para isso e HIBRIDA, nao "trocar um pelo outro":

  1. Vetorial (Chroma)  -> ranking A, boa em similaridade semantica.
  2. BM25 (lexical)     -> ranking B, boa em termos exatos/raros.
  3. Reciprocal Rank Fusion (RRF) funde A+B num ranking so. RRF soma
     1/(k + posicao) de cada documento nas duas listas -- funciona bem
     mesmo com escalas de score incompativeis (cosine 0-1 vs BM25 sem
     teto), porque so usa a POSICAO no ranking, nao o valor do score.
     E o mesmo principio usado por Elasticsearch/Weaviate/Azure AI Search
     nos respectivos "hybrid search".
  4. Reranking por cross-encoder: os top-N candidatos da fusao passam por
     um modelo bem mais caro (mas so aplicado a poucos candidatos, entao
     o custo total fica baixo) que le pergunta+trecho JUNTOS e da um score
     de relevancia mais preciso do que a similaridade de embeddings
     isolados. Isso e o que efetivamente decide quais chunks sobrevivem
     ao corte de SCORE_MINIMO_DOUTRINA.

Flag de ativacao: RAG_HYBRID_SEARCH (config/settings.py). Comeca desligada
por padrao ate o ganho ser medido via scripts/avaliar_rag.py (RAGAS —
metrica alvo: Context Recall).
"""

import re
import unicodedata

from rank_bm25 import BM25Okapi
from sentence_transformers import CrossEncoder
from langchain_core.documents import Document

# Modelo multilingue treinado em mMARCO (inclui PT-BR) — pequeno o bastante
# para rerankear em CPU sem pesar no startup do backend.
_CROSS_ENCODER_MODEL = "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1"

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _normalizar(texto: str) -> list[str]:
    """
    Tokenizacao simples para BM25: minuscula + remove acentos + so
    alfanumerico. Remover acento e proposital -- o usuario nem sempre
    digita "informacao" com cedilha/til, e BM25 (ao contrario do
    embedding) nao tem tolerancia nenhuma a essa variacao.
    """
    sem_acento = unicodedata.normalize("NFKD", texto.lower())
    sem_acento = "".join(c for c in sem_acento if not unicodedata.combining(c))
    return _TOKEN_RE.findall(sem_acento)


class HybridRetriever:
    """
    Encapsula o indice BM25 + o cross-encoder de rerank em cima de um
    VectorStore Chroma ja existente (injetado, nao criado aqui -- evita
    carregar o modelo de embeddings duas vezes e evita import circular
    com modules/rag.py).
    """

    def __init__(self, db, rrf_k: int = 60):
        self._db = db
        self._rrf_k = rrf_k
        self._cross_encoder = None  # carregado sob demanda (lazy)
        self._construir_indice_bm25()

    def _construir_indice_bm25(self) -> None:
        colecao = self._db.get(include=["documents", "metadatas"])
        self._documentos = colecao["documents"]
        self._metadatas = colecao["metadatas"]
        corpus_tokenizado = [_normalizar(doc) for doc in self._documentos]
        self._bm25 = BM25Okapi(corpus_tokenizado)
        print(f"[hybrid_retriever] Indice BM25 construido: {len(self._documentos)} chunks.")

    def _cross_encoder_lazy(self) -> CrossEncoder:
        if self._cross_encoder is None:
            print(f"[hybrid_retriever] Carregando cross-encoder ({_CROSS_ENCODER_MODEL})...")
            self._cross_encoder = CrossEncoder(_CROSS_ENCODER_MODEL)
        return self._cross_encoder

    def _busca_vetorial(self, pergunta: str, k: int):
        """Retorna [(indice_no_corpus, rank)] ordenado por similaridade."""
        docs = self._db.similarity_search(pergunta, k=k)
        indices = []
        for doc in docs:
            try:
                idx = self._documentos.index(doc.page_content)
            except ValueError:
                continue
            indices.append(idx)
        return indices

    def _busca_bm25(self, pergunta: str, k: int):
        """Retorna os indices dos top-k chunks por score BM25."""
        scores = self._bm25.get_scores(_normalizar(pergunta))
        ranked = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
        return ranked[:k]

    def _fusao_rrf(self, ranking_vetorial: list[int], ranking_bm25: list[int]) -> list[int]:
        """
        Reciprocal Rank Fusion: score(doc) = soma de 1/(k + posicao) em
        cada lista onde o doc aparece. Retorna indices ordenados pelo
        score fundido (maior primeiro).
        """
        scores_fundidos: dict[int, float] = {}
        for posicao, idx in enumerate(ranking_vetorial):
            scores_fundidos[idx] = scores_fundidos.get(idx, 0.0) + 1.0 / (self._rrf_k + posicao + 1)
        for posicao, idx in enumerate(ranking_bm25):
            scores_fundidos[idx] = scores_fundidos.get(idx, 0.0) + 1.0 / (self._rrf_k + posicao + 1)
        return sorted(scores_fundidos, key=lambda i: scores_fundidos[i], reverse=True)

    def buscar(self, pergunta: str, top_k: int = 6, candidatos_por_fonte: int = 15):
        """
        Pipeline completo: vetorial + BM25 -> RRF -> rerank cross-encoder.
        Retorna [(Document, score_0_a_1)], MESMO FORMATO que
        db.similarity_search_with_relevance_scores() -- drop-in replacement
        para quem consome _buscar_doutrina_com_score() em modules/rag.py.
        """
        ranking_vetorial = self._busca_vetorial(pergunta, candidatos_por_fonte)
        ranking_bm25 = self._busca_bm25(pergunta, candidatos_por_fonte)
        candidatos = self._fusao_rrf(ranking_vetorial, ranking_bm25)

        # So os candidatos fundidos passam pelo cross-encoder -- caro demais
        # para rodar contra a base inteira, barato o bastante para ~20-30.
        candidatos = candidatos[: candidatos_por_fonte * 2]
        if not candidatos:
            return []

        pares = [(pergunta, self._documentos[idx]) for idx in candidatos]
        cross_encoder = self._cross_encoder_lazy()
        logits = cross_encoder.predict(pares)

        # Cross-encoders MS MARCO-style devolvem logit cru, nao score 0-1.
        # Sigmoid para ficar na mesma escala que SCORE_MINIMO_DOUTRINA espera.
        resultados = []
        for idx, logit in zip(candidatos, logits):
            score = 1.0 / (1.0 + pow(2.718281828, -float(logit)))
            doc = Document(page_content=self._documentos[idx], metadata=self._metadatas[idx] or {})
            resultados.append((doc, score))

        resultados.sort(key=lambda r: r[1], reverse=True)
        return resultados[:top_k]
