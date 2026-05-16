import os

files = ['ChatRAG.jsx','Dashboard.jsx','Transcricao.jsx','Noticias.jsx',
         'Referencias.jsx','Configuracoes.jsx','Agenda.jsx','ListaNegra.jsx',
         'Grafoscopia.jsx','ControleGrupos.jsx','InteligenciaGrupos.jsx','LiderancasUnidade.jsx']

subs = [
    ('#F8FAFC', '#0B1120'),
    ('#FFFFFF', '#111827'),
    ('#F1F5F9', '#1A2236'),
    ('#F0F4FF', '#111827'),
    ('1px solid #E2E8F0', '1px solid rgba(255,255,255,0.07)'),
    ('1px solid #CBD5E1', '1px solid rgba(255,255,255,0.07)'),
    ('1px solid #F1F5F9', '1px solid rgba(255,255,255,0.07)'),
    ('color:"#0F172A"', 'color:"#F1F5F9"'),
    ('color: "#0F172A"', 'color: "#F1F5F9"'),
    ('color:"#1E293B"', 'color:"#F1F5F9"'),
    ('color:"#334155"', 'color:"#94A3B8"'),
    ('color:"#475569"', 'color:"#94A3B8"'),
    ('color:"#64748B"', 'color:"#94A3B8"'),
    ('background:"#CBD5E1"', 'background:"rgba(255,255,255,0.15)"'),
    ('fontSize: 10,', 'fontSize: 13,'),
    ('fontSize: 11,', 'fontSize: 14.3,'),
    ('fontSize: 12,', 'fontSize: 15.6,'),
    ('fontSize: 13,', 'fontSize: 16.9,'),
    ('fontSize:10,', 'fontSize:13,'),
    ('fontSize:11,', 'fontSize:14.3,'),
    ('fontSize:12,', 'fontSize:15.6,'),
    ('fontSize:9,', 'fontSize:11.7,'),
]

for fname in files:
    if not os.path.exists(fname):
        print(f'SKIP: {fname}')
        continue
    with open(fname, 'r', encoding='utf-8') as f:
        content = f.read()
    original = content
    for old, new in subs:
        content = content.replace(old, new)
    with open(fname, 'w', encoding='utf-8') as f:
        f.write(content)
    print('OK: ' + fname if content != original else 'NO CHANGE: ' + fname)

print('Concluido!')
