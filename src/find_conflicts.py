import os, re

files = ['App.jsx','Alertas.jsx','ChatRAG.jsx','Dashboard.jsx','Transcricao.jsx',
         'Noticias.jsx','Referencias.jsx','Configuracoes.jsx','Agenda.jsx',
         'ListaNegra.jsx','Grafoscopia.jsx','ControleGrupos.jsx',
         'InteligenciaGrupos.jsx','LiderancasUnidade.jsx']

# Cores escuras usadas como cor de TEXTO — erro em fundo dark
FONTES_ESCURAS = ['#0F172A','#1E293B','#334155','#0B1120','#111827','#1A2236','#78350F','#92400E','#7F1D1D']

# Cores claras usadas como cor de TEXTO em contexto de background claro ainda remanescente
FONTES_MUITO_CLARAS = ['#E2E8F0','#CBD5E1','#F1F5F9']

# Backgrounds claros remanescentes (foram para dark mas alguns ficaram)
BGS_CLAROS_RESTANTES = ['"#FFFFFF"','"#F8FAFC"','"#F1F5F9"','"#F0FDF4"','"#FFFBEB"','"#FEF2F2"','"#EDE9FE"','"#DBEAFE"']

results = {}

for fname in files:
    if not os.path.exists(fname):
        continue
    with open(fname,'r',encoding='utf-8') as f:
        lines = f.readlines()
    
    issues = []
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        # Fonte escura (invisível em fundo dark)
        for cor in FONTES_ESCURAS:
            if f'color:"{cor}"' in line or f'color: "{cor}"' in line:
                issues.append(f"FONTE_ESCURA L{i}: {cor} | {stripped[:90]}")
                break
        # Background claro remanescente (texto claro ficaria invisível)
        for bg in BGS_CLAROS_RESTANTES:
            if f'background:{bg}' in line or f'background: {bg}' in line:
                issues.append(f"BG_CLARO    L{i}: {bg} | {stripped[:90]}")
                break
    
    if issues:
        results[fname] = issues

for fname, issues in results.items():
    print(f'\n=== {fname} ({len(issues)} issues) ===')
    for iss in issues[:20]:
        print(iss)

total = sum(len(v) for v in results.values())
print(f'\nTotal issues: {total} em {len(results)} arquivos')
