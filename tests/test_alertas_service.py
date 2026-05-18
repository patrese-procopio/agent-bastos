"""
tests/test_alertas_service.py
─────────────────────────────────────────────────────────────────────────────
Testes unitários para services/alertas_service.py

Conceito importante: tmp_path
  pytest fornece a fixture `tmp_path` automaticamente — ela cria um
  diretório temporário único por teste e apaga após o teste terminar.
  Isso significa que cada teste roda isolado, sem poluir o disco real
  e sem depender de estado de outro teste. Padrão de mercado.
"""

import json
import pytest
from services.alertas_service import ler_alertas, salvar_alertas


# ─── Testes: ler_alertas ─────────────────────────────────────────────────────

class TestLerAlertas:
    def test_arquivo_inexistente_retorna_lista_vazia(self, tmp_path):
        """
        Se o arquivo não existe, retorna [] em vez de lançar exceção.
        Comportamento de fallback crítico para produção.
        """
        caminho = str(tmp_path / "nao_existe.json")
        resultado = ler_alertas(caminho)
        assert resultado == []

    def test_le_lista_valida(self, tmp_path):
        caminho = str(tmp_path / "alertas.json")
        alertas = [{"id": "a1", "titulo": "Teste", "risco": "ALTO"}]
        with open(caminho, "w", encoding="utf-8") as f:
            json.dump(alertas, f)

        resultado = ler_alertas(caminho)
        assert len(resultado) == 1
        assert resultado[0]["id"] == "a1"

    def test_le_multiplos_alertas(self, tmp_path):
        caminho = str(tmp_path / "alertas.json")
        alertas = [
            {"id": "a1", "risco": "ALTO"},
            {"id": "a2", "risco": "MEDIO"},
            {"id": "a3", "risco": "BAIXO"},
        ]
        with open(caminho, "w", encoding="utf-8") as f:
            json.dump(alertas, f)

        resultado = ler_alertas(caminho)
        assert len(resultado) == 3

    def test_arquivo_corrompido_retorna_lista_vazia(self, tmp_path):
        """JSON inválido não deve derrubar o servidor — retorna []."""
        caminho = str(tmp_path / "corrompido.json")
        with open(caminho, "w") as f:
            f.write("{ isso nao e json valido ][")

        resultado = ler_alertas(caminho)
        assert resultado == []

    def test_arquivo_vazio_retorna_lista_vazia(self, tmp_path):
        caminho = str(tmp_path / "vazio.json")
        with open(caminho, "w") as f:
            f.write("")

        resultado = ler_alertas(caminho)
        assert resultado == []

    def test_preserva_campos_unicode(self, tmp_path):
        """Acentos e caracteres especiais devem ser preservados."""
        caminho = str(tmp_path / "alertas.json")
        alertas = [{"id": "x1", "titulo": "Movimentação suspeita — Zona Norte"}]
        with open(caminho, "w", encoding="utf-8") as f:
            json.dump(alertas, f, ensure_ascii=False)

        resultado = ler_alertas(caminho)
        assert "Movimentação suspeita — Zona Norte" in resultado[0]["titulo"]


# ─── Testes: salvar_alertas ───────────────────────────────────────────────────

class TestSalvarAlertas:
    def test_cria_arquivo_se_nao_existe(self, tmp_path):
        caminho = str(tmp_path / "novo.json")
        alertas = [{"id": "b1", "titulo": "Novo alerta"}]
        salvar_alertas(caminho, alertas)
        assert (tmp_path / "novo.json").exists()

    def test_conteudo_salvo_corretamente(self, tmp_path):
        caminho = str(tmp_path / "alertas.json")
        alertas = [{"id": "c1", "risco": "ALTO", "lido": False}]
        salvar_alertas(caminho, alertas)

        with open(caminho, encoding="utf-8") as f:
            lido = json.load(f)

        assert lido[0]["id"] == "c1"
        assert lido[0]["risco"] == "ALTO"
        assert lido[0]["lido"] is False

    def test_sobrescreve_conteudo_anterior(self, tmp_path):
        caminho = str(tmp_path / "alertas.json")
        salvar_alertas(caminho, [{"id": "v1"}])
        salvar_alertas(caminho, [{"id": "v2"}, {"id": "v3"}])

        with open(caminho, encoding="utf-8") as f:
            lido = json.load(f)

        assert len(lido) == 2
        assert lido[0]["id"] == "v2"

    def test_salva_lista_vazia(self, tmp_path):
        caminho = str(tmp_path / "vazio.json")
        salvar_alertas(caminho, [])

        with open(caminho, encoding="utf-8") as f:
            lido = json.load(f)
        assert lido == []

    def test_preserva_unicode_ao_salvar(self, tmp_path):
        caminho = str(tmp_path / "alertas.json")
        alertas = [{"id": "u1", "titulo": "Ação policial — Compensa"}]
        salvar_alertas(caminho, alertas)

        with open(caminho, encoding="utf-8") as f:
            lido = json.load(f)
        assert "Ação policial — Compensa" in lido[0]["titulo"]

    def test_encoding_utf8_no_arquivo(self, tmp_path):
        """Garante que o arquivo é salvo em UTF-8, não ASCII."""
        caminho = str(tmp_path / "alertas.json")
        alertas = [{"id": "e1", "vulgo": "Carnauçaba"}]
        salvar_alertas(caminho, alertas)

        with open(caminho, "rb") as f:
            raw = f.read()
        # UTF-8 válido — não lança exceção
        raw.decode("utf-8")


# ─── Testes de roundtrip: salvar → ler ───────────────────────────────────────

class TestRoundtrip:
    def test_salvar_e_ler_retorna_mesmo_dado(self, tmp_path):
        """
        Roundtrip: salva N alertas, lê de volta, verifica igualdade.
        Testa a integração entre as duas funções — não apenas cada uma isolada.
        """
        caminho = str(tmp_path / "roundtrip.json")
        original = [
            {"id": "r1", "tipo": "telegram", "risco": "ALTO",  "lido": False},
            {"id": "r2", "tipo": "noticia",  "risco": "MEDIO", "lido": True},
        ]
        salvar_alertas(caminho, original)
        recuperado = ler_alertas(caminho)

        assert len(recuperado) == len(original)
        for orig, rec in zip(original, recuperado):
            assert orig["id"]   == rec["id"]
            assert orig["risco"] == rec["risco"]
            assert orig["lido"]  == rec["lido"]

    def test_multiplos_ciclos_salvar_ler(self, tmp_path):
        """Simula múltiplas escritas consecutivas — thread safety básico."""
        caminho = str(tmp_path / "ciclos.json")
        for i in range(10):
            alertas = [{"id": f"x{i}", "ciclo": i}]
            salvar_alertas(caminho, alertas)
            lido = ler_alertas(caminho)
            assert lido[0]["ciclo"] == i
