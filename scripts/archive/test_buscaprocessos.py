import asyncio, httpx, json

async def test():
    key = 'bp_live_12edce04ade0167add8ae4779a69074941c88d04'
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as c:
        r = await c.get(
            'https://api.buscaprocessos.app.br/v1/busca',
            params={'q': 'Ocimar Prado Junior', 'qo': 'p'},
            headers={'Authorization': f'Bearer {key}', 'Accept': 'application/json'}
        )
        data = r.json()
        print('Total:', data.get('paginator', {}).get('total'))
        items = data.get('data', [])
        if items:
            print('Primeiro resultado:')
            print(json.dumps(items[0], indent=2, ensure_ascii=False))
        else:
            print('Chave data nao encontrada. Keys:', list(data.keys()))

asyncio.run(test())
