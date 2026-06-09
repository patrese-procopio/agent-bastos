import asyncio, httpx, json

async def test():
    key = 'bp_live_12edce04ade0167add8ae4779a69074941c88d04'
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as c:

        # Testa endpoint de pessoa com status
        r = await c.get(
            'https://api.buscaprocessos.app.br/v1/pessoas/52231692',
            headers={'Authorization': f'Bearer {key}', 'Accept': 'application/json'}
        )
        print(f'GET /pessoas/52231692: {r.status_code} bytes={len(r.content)}')
        if r.text: print(r.text[:200])

        # Tenta processos da pessoa
        r2 = await c.get(
            'https://api.buscaprocessos.app.br/v1/pessoas/52231692/processos',
            headers={'Authorization': f'Bearer {key}', 'Accept': 'application/json'}
        )
        print(f'\nGET /pessoas/52231692/processos: {r2.status_code} bytes={len(r2.content)}')
        if r2.text: print(r2.text[:300])

        # Tenta busca por CPF (endpoint principal)
        r3 = await c.get(
            'https://api.buscaprocessos.app.br/v1/processos',
            params={'cpf_cnpj': '00000000000'},
            headers={'Authorization': f'Bearer {key}', 'Accept': 'application/json'}
        )
        print(f'\nGET /processos?cpf: {r3.status_code}')
        if r3.text: print(r3.text[:200])

asyncio.run(test())
