"""
tests/test_drive_service.py
─────────────────────────────────────────────────────────────────────────────
Testes unitários para services/drive_service.py

Conceito importante: Mock
  drive_service.py chama a API do Google Drive — não podemos testar isso
  em CI sem credenciais reais. A solução é mock: substituímos o cliente
  real por um objeto falso que simula as respostas.

  unittest.mock.patch substitui temporariamente um objeto durante o teste:
    - O serviço recebe um Mock em vez do cliente real
    - O Mock registra todas as chamadas feitas a ele
    - O teste verifica se as chamadas certas foram feitas com os args certos

  Isso testa a LÓGICA do service (upsert, loop de download)
  sem depender de credenciais, internet ou estado externo.
"""

import io
import json
from unittest.mock import MagicMock, patch, call

import pytest
from services.drive_service import upload_json, download_json, download_bytes


# ─── Helpers de mock ──────────────────────────────────────────────────────────

def _make_service_mock(list_files=None, file_content=None):
    """
    Cria um mock do cliente Google Drive com comportamento configurável.

    list_files: lista de dicts {"id": "..."}  simulando results["files"]
    file_content: bytes a serem "baixados" pelo MediaIoBaseDownload
    """
    service = MagicMock()

    # Simula service.files().list().execute()
    service.files().list().execute.return_value = {
        "files": list_files or []
    }

    # Simula service.files().get_media() + MediaIoBaseDownload
    if file_content is not None:
        def fake_download(buf, request):
            dl = MagicMock()
            # Simula next_chunk retornando (None, True) em uma chamada
            dl.next_chunk.side_effect = [
                (None, False),  # primeira chamada: não terminou
                (None, True),   # segunda chamada: terminou
            ]
            # Escreve o conteúdo no buffer quando next_chunk for chamado
            original_side_effect = dl.next_chunk.side_effect

            def write_and_return(idx=[0]):
                if idx[0] == 0:
                    buf.write(file_content)
                result = original_side_effect[idx[0]]
                idx[0] += 1
                return result

            dl.next_chunk.side_effect = write_and_return
            return dl

        service.files().get_media.return_value = MagicMock()

    return service


# ─── Testes: upload_json ─────────────────────────────────────────────────────

class TestUploadJson:
    @patch("services.drive_service.get_service")
    @patch("services.drive_service.MediaIoBaseUpload")
    def test_cria_arquivo_quando_nao_existe(self, mock_media, mock_get_service):
        """
        Se list retorna [] (arquivo não existe), deve chamar files().create().
        Estratégia upsert: create quando não encontra, update quando encontra.
        """
        service = MagicMock()
        service.files().list().execute.return_value = {"files": []}
        mock_get_service.return_value = service

        upload_json("teste.json", {"chave": "valor"}, "folder_123")

        service.files().create.assert_called_once()
        service.files().update.assert_not_called()

    @patch("services.drive_service.get_service")
    @patch("services.drive_service.MediaIoBaseUpload")
    def test_atualiza_arquivo_quando_ja_existe(self, mock_media, mock_get_service):
        """Se list retorna arquivo existente, deve chamar update em vez de create."""
        service = MagicMock()
        service.files().list().execute.return_value = {"files": [{"id": "file_abc"}]}
        mock_get_service.return_value = service

        upload_json("existe.json", {"dado": 42}, "folder_123")

        service.files().update.assert_called_once()
        service.files().create.assert_not_called()

    @patch("services.drive_service.get_service")
    @patch("services.drive_service.MediaIoBaseUpload")
    def test_serializa_dados_como_json(self, mock_media, mock_get_service):
        """Verifica que o dict é serializado para JSON antes do upload."""
        service = MagicMock()
        service.files().list().execute.return_value = {"files": []}
        mock_get_service.return_value = service

        dados = {"nucleo": "NI", "mes": "2026-05", "total": 42}
        upload_json("producao.json", dados, "folder_xyz")

        # MediaIoBaseUpload foi chamado com BytesIO contendo JSON válido
        args = mock_media.call_args
        buf = args[0][0]  # primeiro argumento posicional
        conteudo = json.loads(buf.getvalue().decode("utf-8"))
        assert conteudo["nucleo"] == "NI"
        assert conteudo["total"] == 42

    @patch("services.drive_service.get_service")
    @patch("services.drive_service.MediaIoBaseUpload")
    def test_usa_folder_id_correto_no_create(self, mock_media, mock_get_service):
        """O folder_id deve aparecer no body do create."""
        service = MagicMock()
        service.files().list().execute.return_value = {"files": []}
        mock_get_service.return_value = service

        upload_json("arquivo.json", {}, "minha_pasta_id")

        create_call = service.files().create.call_args
        body = create_call[1]["body"] if "body" in create_call[1] else create_call[0][0]
        assert "minha_pasta_id" in str(body)


# ─── Testes: download_json ────────────────────────────────────────────────────

class TestDownloadJson:
    @patch("services.drive_service.get_service")
    def test_retorna_none_quando_arquivo_nao_existe(self, mock_get_service):
        """Se list retorna [], retorna None — sem exceção."""
        service = MagicMock()
        service.files().list().execute.return_value = {"files": []}
        mock_get_service.return_value = service

        resultado = download_json("nao_existe.json", "folder_123")
        assert resultado is None

    @patch("services.drive_service.MediaIoBaseDownload")
    @patch("services.drive_service.get_service")
    def test_retorna_dict_quando_arquivo_existe(self, mock_get_service, mock_dl_class):
        """Simula download de JSON e verifica que retorna dict parseado."""
        dados = {"meses": ["2026-01", "2026-02"]}
        conteudo = json.dumps(dados).encode("utf-8")

        service = MagicMock()
        service.files().list().execute.return_value = {"files": [{"id": "file_abc"}]}
        mock_get_service.return_value = service

        # Configura o mock do downloader para escrever no buffer
        def fake_dl(buf, request):
            dl = MagicMock()
            calls = [False, True]
            idx = [0]
            def next_chunk():
                if idx[0] == 0:
                    buf.write(conteudo)
                done = calls[idx[0]]
                idx[0] += 1
                return None, done
            dl.next_chunk.side_effect = next_chunk
            return dl

        mock_dl_class.side_effect = fake_dl

        resultado = download_json("indice.json", "folder_123")
        assert resultado == dados
        assert resultado["meses"] == ["2026-01", "2026-02"]


# ─── Testes: download_bytes ───────────────────────────────────────────────────

class TestDownloadBytes:
    @patch("services.drive_service.MediaIoBaseDownload")
    @patch("services.drive_service.get_service")
    def test_retorna_bytes_do_arquivo(self, mock_get_service, mock_dl_class):
        """Verifica que download_bytes retorna os bytes corretos do Drive."""
        conteudo_esperado = b"PK\x03\x04"  # assinatura ZIP/DOCX

        service = MagicMock()
        mock_get_service.return_value = service

        def fake_dl(buf, request):
            dl = MagicMock()
            idx = [0]
            def next_chunk():
                if idx[0] == 0:
                    buf.write(conteudo_esperado)
                done = idx[0] >= 1
                idx[0] += 1
                return None, done
            dl.next_chunk.side_effect = next_chunk
            return dl

        mock_dl_class.side_effect = fake_dl

        resultado = download_bytes("file_id_123")
        assert resultado == conteudo_esperado

    @patch("services.drive_service.get_service")
    def test_usa_file_id_correto(self, mock_get_service):
        """Verifica que get_media é chamado com o file_id correto."""
        service = MagicMock()
        mock_get_service.return_value = service

        # Configura download mínimo para não travar
        dl_mock = MagicMock()
        dl_mock.next_chunk.return_value = (None, True)

        with patch("services.drive_service.MediaIoBaseDownload") as mock_dl:
            mock_dl.return_value = dl_mock
            download_bytes("meu_file_id_especifico")

        service.files().get_media.assert_called_once_with(fileId="meu_file_id_especifico")
