import os, asyncio, httpx
from dotenv import load_dotenv
load_dotenv('/app/.env', override=True)

async def test():
    key = os.getenv('DATAJUD_API_KEY')
    async with httpx.AsyncClient(timeout=20) as c:
        # Teste 1: busca por nome simples no TJAM
        r = await c.post(
            'https://api-publica.datajud.cnj.jus.br/api_publica_tjam/_search',
            json={
                'size': 3,
                'query': {
                    'match': {
                        'partes.nome': {
                            'query': 'Ocimar',
                            'fuzziness': 'AUTO'
                        }
                    }
                }
            },
            headers={'Authorization': f'APIKey {key}', 'Content-Type': 'application/json'}
        )
        data = r.json()
        total = data.get('hits', {}).get('total', {}).get('value', 0)
        print(f'Total Ocimar no TJAM: {total}')
        hits = data.get('hits', {}).get('hits', [])
        for h in hits:
            src = h.get('_source', {})
            partes = src.get('partes', [])
            nomes = [p.get('nome', '') for p in partes[:2]]
            print(f'  Processo: {src.get("numeroProcesso", "")} Partes: {nomes}')

        # Teste 2: busca qualquer processo no TJAM pra confirmar que tem dados
        r2 = await c.post(
            'https://api-publica.datajud.cnj.jus.br/api_publica_tjam/_search',
            json={'size': 1, 'query': {'match_all': {}}},
            headers={'Authorization': f'APIKey {key}', 'Content-Type': 'application/json'}
        )
        data2 = r2.json()
        total2 = data2.get('hits', {}).get('total', {}).get('value', 0)
        print(f'Total processos no TJAM: {total2}')
        if data2.get('hits', {}).get('hits'):
            src2 = data2['hits']['hits'][0].get('_source', {})
            print('Campos disponiveis:', list(src2.keys()))
            partes2 = src2.get('partes', [])
            print('Estrutura partes:', partes2[:1])

asyncio.run(test())
