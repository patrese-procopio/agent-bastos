import asyncio, sys, os
sys.path.insert(0, '/app')
os.environ['OSINT_USE_MOCK'] = 'true'

from modules.osint.models import OsintRequest, LgpdPurpose
from modules.osint.lgpd_gate import LgpdGate, LgpdViolationError
from modules.osint.collectors import build_collectors, run_collectors_parallel

async def main():
    print("=" * 50)
    print("  Agent Bastos — Teste OSINT")
    print("=" * 50)

    req = OsintRequest(
        operator_id="patrese_teste",
        lgpd_purpose=LgpdPurpose.SEGURANCA_PUBLICA,
        nome="Joao Silva Santos",
        cpf="12345678901",
    )
    print(f"\n✅ Request criado: {req.request_id}")
    print(f"   CPF mascarado: {req.cpf_mascarado()}")

    gate = LgpdGate()
    try:
        context = await gate.authorize(req)
        print(f"\n✅ LGPD Gate autorizado")
        print(f"   Finalidade: {context['lgpd_purpose']}")
        print(f"   Acessa dados criminais: {context['can_access_criminal']}")
    except LgpdViolationError as e:
        print(f"\n❌ LGPD bloqueou: {e}")
        return

    print(f"\n⏳ Rodando collectors (modo MOCK)...")
    collectors = build_collectors(req)
    results = await run_collectors_parallel(collectors, req)

    print(f"\n📊 Resultados:")
    for r in results:
        status = "✅" if r.success else "❌"
        print(f"   {status} [{r.source.value}] {r.items_found} itens | {r.latency_ms:.0f}ms")
        if r.raw_data:
            item = r.raw_data[0]
            print(f"      Exemplo: {dict(list(item.items())[:2])}")

    print(f"\n🔒 Testando bloqueio LGPD...")
    req2 = OsintRequest(
        operator_id="patrese_teste",
        lgpd_purpose=LgpdPurpose.DUE_DILIGENCE,
        nome="Teste Bloqueio",
    )
    try:
        await gate.authorize(req2)
        print("   ⚠️  Deveria ter bloqueado!")
    except LgpdViolationError as e:
        print(f"   ✅ Bloqueio correto: {str(e)[:60]}")

    print(f"\n✅ Teste concluído!")

asyncio.run(main())
