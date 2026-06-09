import asyncio, httpx, json

async def test():
    key = 'bp_live_12edce04ade0167add8ae4779a69074941c88d04'
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as c:
        # Busca detalhes da pessoa
        r = await c.get(
            'https://api.buscaprocessos.app.br/v1/pessoas/52231692',
            headers={'Authorization': f'Bearer {key}', 'Accept': 'application/json'}
        )
        data = r.json()
        print('Keys:', list(data.keys()))
        print(json.dumps(data, indent=2, ensure_ascii=False)[:1500])

asyncio.run(test())
