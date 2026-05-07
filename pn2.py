path = r'C:\Users\Administrador\agent-bastos-app\src\App.jsx'
with open(path, encoding='utf-8') as f:
    lines = f.readlines()

for i, l in enumerate(lines):
    if 'liveNews.slice(0,4)' in l and 'concat' not in l:
        lines[i] = l.replace(
            '})):NEWS)',
            '})).concat(NEWS).slice(0,4)):NEWS)'
        )
        print(f'Corrigido linha {i+1}')
        break

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)
print('PRONTO')
