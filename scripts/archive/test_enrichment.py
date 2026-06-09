import asyncio, sys, os
sys.path.insert(0, '/app')
os.environ['OSINT_USE_MOCK'] = 'true'

from modules.osint.models import OsintRequest, LgpdPurpose
from modules.osint.lgpd_gate import LgpdGate
from modules.osint.collectors import build_collectors, run_collectors_parallel
from modules.osint.enrichment import OsintEnrichment

async def main():
    print("=" * 50)
    print("  Agent Bastos — Teste Enrichment (Groq)")
    print("=" * 50)

    req = OsintRequest(
        operator_id="patrese_teste",
        lgpd_purpose=LgpdPurpose.SEGURANCA_PUBLICA,
        nome="Joao Silva Santos",
        cpf="12345678901",
    )

    gate = LgpdGate()
    await gate.authorize(req)
    print("OK LGPD Gate")

    collectors = build_collectors(req)
    results = await run_collectors_parallel(collectors, req)
    print(f"OK Collectors — {sum(r.items_found for r in results)} itens coletados")

    print("\n Enviando pro Groq...")
    enrichment = OsintEnrichment()
    report = await enrichment.enrich(req, results)

    print(f"\n RELATÓRIO GERADO")
    print(f"  ID:           {report.report_id}")
    print(f"  Sujeito:      {report.subject_name}")
    print(f"  CPF:          {report.subject_cpf_masked}")
    print(f"  Risco:        {report.risk_level.value.upper()}")
    print(f"  Resumo:       {report.risk_summary}")
    print(f"  Indicadores:  {report.risk_indicators}")
    print(f"  Processos:    {report.total_processos}")
    print(f"  Mandados:     {len(report.mandados_prisao)}")
    print(f"  Empresas:     {len(report.vinculos_empresariais)}")
    print(f"  Noticias:     {len(report.mencoes_midia)}")
    print(f"  Nos no grafo: {len(report.graph.nodes)}")
    print(f"  Arestas:      {len(report.graph.edges)}")

asyncio.run(main())
