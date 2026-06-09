"""
lgpd_gate.py — Portão de conformidade LGPD
Agent Bastos | Segurança Pública/Corporativa

O gate é chamado ANTES de qualquer collector.
Se falhar, nada é coletado. Sem exceções.

Responsabilidades:
  1. Validar finalidade legítima
  2. Mascarar CPF para todos os logs
  3. Registrar audit log (append-only)
  4. Retornar contexto autorizado para os collectors
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

from .models import AuditLog, LgpdPurpose, OsintRequest

logger = logging.getLogger(__name__)

# Arquivo de audit log — em produção, substitua por banco de dados
AUDIT_LOG_PATH = Path("logs/osint_audit.jsonl")


class LgpdViolationError(Exception):
    """Levantado quando a requisição viola alguma regra LGPD."""
    pass


class LgpdGate:
    """
    Portão de conformidade LGPD.

    Uso:
        gate = LgpdGate()
        context = await gate.authorize(request)
        # se não levantar exceção, está autorizado
    """

    # Finalidades que permitem acesso a dados mais sensíveis
    # (processos criminais, mandados)
    FINALIDADES_SENSÍVEIS = {
        LgpdPurpose.SEGURANCA_PUBLICA,
        LgpdPurpose.INVESTIGACAO_INTERNA,
    }

    def __init__(self, audit_path: Path = AUDIT_LOG_PATH) -> None:
        self.audit_path = audit_path
        self.audit_path.parent.mkdir(parents=True, exist_ok=True)

    async def authorize(self, request: OsintRequest) -> dict[str, Any]:
        """
        Valida a requisição e retorna contexto autorizado.

        Returns:
            dict com metadados de autorização para os collectors

        Raises:
            LgpdViolationError: se alguma regra for violada
        """
        self._validate_request(request)
        context = self._build_context(request)
        await self._write_audit_log(request, success=True)
        logger.info(
            "LGPD autorizado | operador=%s | finalidade=%s | cpf=%s",
            request.operator_id,
            request.lgpd_purpose.value,
            request.cpf_mascarado(),
        )
        return context

    async def register_failure(
        self,
        request: OsintRequest,
        error: str,
        ip_address: str | None = None,
    ) -> None:
        """Registra falha de execução no audit log."""
        await self._write_audit_log(request, success=False, error=error, ip=ip_address)

    # ── privados ──────────────────────────────

    def _validate_request(self, request: OsintRequest) -> None:
        """
        Regras de validação LGPD.
        Adicione novas regras aqui conforme o sistema evoluir.
        """
        # Regra 1: operador não pode ser anônimo
        if not request.operator_id or request.operator_id.strip() == "":
            raise LgpdViolationError("operator_id obrigatório para rastreabilidade LGPD")

        # Regra 2: finalidade deve ser explícita (já garantido pelo Enum,
        # mas validamos novamente para clareza)
        if not request.lgpd_purpose:
            raise LgpdViolationError("Finalidade LGPD obrigatória — Art. 7º LGPD")

        # Regra 3: pelo menos um identificador
        if not request.nome and not request.cpf:
            raise LgpdViolationError("Nome ou CPF obrigatório para a pesquisa")

        # Regra 4: acesso a dados sensíveis exige finalidade adequada
        fontes_sensiveis = {"bnmp_portal", "datajud"}
        fontes_solicitadas = {f.value for f in request.fontes_ativas}
        if fontes_solicitadas & fontes_sensiveis:
            if request.lgpd_purpose not in self.FINALIDADES_SENSÍVEIS:
                raise LgpdViolationError(
                    f"Finalidade '{request.lgpd_purpose.value}' não autoriza "
                    f"acesso a fontes sensíveis (BNMP, processos criminais). "
                    f"Use: seguranca_publica ou investigacao_interna."
                )

    def _build_context(self, request: OsintRequest) -> dict[str, Any]:
        """
        Monta o contexto de autorização que os collectors recebem.
        Inclui o CPF mascarado — collectors NUNCA recebem CPF completo nos logs.
        """
        return {
            "request_id": str(request.request_id),
            "operator_id": request.operator_id,
            "lgpd_purpose": request.lgpd_purpose.value,
            "cpf_masked": request.cpf_mascarado(),
            "authorized_at": datetime.utcnow().isoformat(),
            "fontes_ativas": [f.value for f in request.fontes_ativas],
            # Flags de permissão por nível de sensibilidade
            "can_access_criminal": request.lgpd_purpose in self.FINALIDADES_SENSÍVEIS,
            "can_access_warrants": request.lgpd_purpose in self.FINALIDADES_SENSÍVEIS,
        }

    async def _write_audit_log(
        self,
        request: OsintRequest,
        success: bool,
        error: str | None = None,
        ip: str | None = None,
    ) -> None:
        """
        Escreve linha no arquivo JSONL de audit log.
        JSONL = uma linha JSON por registro — fácil de indexar no Elasticsearch.
        Em produção: substitua por INSERT em tabela append-only no PostgreSQL.
        """
        log = AuditLog(
            request_id=request.request_id,
            report_id=request.request_id,  # mesmo ID até o report ser gerado
            operator_id=request.operator_id,
            lgpd_purpose=request.lgpd_purpose,
            subject_name=request.nome,
            subject_cpf_masked=request.cpf_mascarado(),
            fontes_consultadas=[f.value for f in request.fontes_ativas],
            ip_address=ip,
            success=success,
            error_detail=error,
        )
        line = log.model_dump_json() + "\n"
        with open(self.audit_path, "a", encoding="utf-8") as f:
            f.write(line)
