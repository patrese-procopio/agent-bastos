import os

files = ['App.jsx','Alertas.jsx','ChatRAG.jsx','Dashboard.jsx','Transcricao.jsx',
         'Noticias.jsx','Referencias.jsx','Configuracoes.jsx','Agenda.jsx',
         'ListaNegra.jsx','Grafoscopia.jsx','ControleGrupos.jsx',
         'InteligenciaGrupos.jsx','LiderancasUnidade.jsx']

# FONTES ESCURAS em fundo dark → trocar por claro
font_fixes = [
    ('color:"#0F172A"',  'color:"#F1F5F9"'),
    ('color: "#0F172A"', 'color: "#F1F5F9"'),
    ('color:"#1E293B"',  'color:"#F1F5F9"'),
    ('color: "#1E293B"', 'color: "#F1F5F9"'),
    ('color:"#334155"',  'color:"#94A3B8"'),
    ('color: "#334155"', 'color: "#94A3B8"'),
    ('color:"#111827"',  'color:"#F1F5F9"'),
    ('color: "#111827"', 'color: "#F1F5F9"'),
    ('color:"#78350F"',  'color:"#F1F5F9"'),
    ('color: "#78350F"', 'color: "#F1F5F9"'),
    ('color:"#92400E"',  'color:"#E8A020"'),
    ('color: "#92400E"', 'color: "#E8A020"'),
    ('color:"#7F1D1D"',  'color:"#FCA5A5"'),
    ('color: "#7F1D1D"', 'color: "#FCA5A5"'),
    ('color:"#166534"',  'color:"#4ADE80"'),
    ('color: "#166534"', 'color: "#4ADE80"'),
    ('color:"#065F46"',  'color:"#34D399"'),
    ('color: "#065F46"', 'color: "#34D399"'),
    ('color:"#1D4ED8"',  'color:"#60A5FA"'),
    ('color: "#1D4ED8"', 'color: "#60A5FA"'),
    ('color:"#6D28D9"',  'color:"#A78BFA"'),
    ('color: "#6D28D9"', 'color: "#A78BFA"'),
    ('color:"#3730A3"',  'color:"#818CF8"'),
    ('color: "#3730A3"', 'color: "#818CF8"'),
    ('color:"#B45309"',  'color:"#E8A020"'),
    ('color: "#B45309"', 'color: "#E8A020"'),
    ('color:"#D97706"',  'color:"#FBBF24"'),
    ('color: "#D97706"', 'color: "#FBBF24"'),
    ('color:"#DC2626"',  'color:"#F87171"'),
    ('color: "#DC2626"', 'color: "#F87171"'),
    ('color:"#16A34A"',  'color:"#4ADE80"'),
    ('color: "#16A34A"', 'color: "#4ADE80"'),
    ('color:"#C2410C"',  'color:"#FB923C"'),
    ('color: "#C2410C"', 'color: "#C2410C"'),
]

# BACKGROUNDS CLAROS remanescentes → versão dark com transparência
bg_fixes = [
    ('background:"#FFFBEB"',   'background:"rgba(232,160,32,0.10)"'),
    ('background: "#FFFBEB"',  'background: "rgba(232,160,32,0.10)"'),
    ('background:"#FEF3C7"',   'background:"rgba(232,160,32,0.12)"'),
    ('background: "#FEF3C7"',  'background: "rgba(232,160,32,0.12)"'),
    ('background:"#FEF2F2"',   'background:"rgba(239,68,68,0.10)"'),
    ('background: "#FEF2F2"',  'background: "rgba(239,68,68,0.10)"'),
    ('background:"#FEF9C3"',   'background:"rgba(232,160,32,0.10)"'),
    ('background:"#ECFDF5"',   'background:"rgba(52,211,153,0.10)"'),
    ('background: "#ECFDF5"',  'background: "rgba(52,211,153,0.10)"'),
    ('background:"#F0FDF4"',   'background:"rgba(74,222,128,0.08)"'),
    ('background: "#F0FDF4"',  'background: "rgba(74,222,128,0.08)"'),
    ('background:"#EDE9FE"',   'background:"rgba(167,139,250,0.12)"'),
    ('background: "#EDE9FE"',  'background: "rgba(167,139,250,0.12)"'),
    ('background:"#DBEAFE"',   'background:"rgba(96,165,250,0.12)"'),
    ('background: "#DBEAFE"',  'background: "rgba(96,165,250,0.12)"'),
    ('background:"#EEF2FF"',   'background:"rgba(129,140,248,0.12)"'),
    ('background: "#EEF2FF"',  'background: "rgba(129,140,248,0.12)"'),
    ('background:"#FFEDD5"',   'background:"rgba(251,146,60,0.12)"'),
    ('background: "#FFEDD5"',  'background: "rgba(251,146,60,0.12)"'),
    ('background:"#D1FAE5"',   'background:"rgba(52,211,153,0.10)"'),
    ('background: "#D1FAE5"',  'background: "rgba(52,211,153,0.10)"'),
    ('background:"#F8F8FF"',   'background:"rgba(255,255,255,0.03)"'),
    ('background: "#F8F8FF"',  'background: "rgba(255,255,255,0.03)"'),
    ('background:"#FAFBFF"',   'background:"rgba(255,255,255,0.02)"'),
    ('background: "#FAFBFF"',  'background: "rgba(255,255,255,0.02)"'),
    ('background:"#FAFAFA"',   'background:"rgba(255,255,255,0.03)"'),
    ('background: "#FAFAFA"',  'background: "rgba(255,255,255,0.03)"'),
]

# BORDAS claras remanescentes
border_fixes = [
    ('border:"1px solid #FECACA"',   'border:"1px solid rgba(239,68,68,0.3)"'),
    ('border: "1px solid #FECACA"',  'border: "1px solid rgba(239,68,68,0.3)"'),
    ('border:"1px solid #FCA5A5"',   'border:"1px solid rgba(239,68,68,0.3)"'),
    ('border:"1px solid #FCD34D"',   'border:"1px solid rgba(251,191,36,0.3)"'),
    ('border:"1px solid #FDE68A"',   'border:"1px solid rgba(232,160,32,0.3)"'),
    ('border:"1px solid #86EFAC"',   'border:"1px solid rgba(74,222,128,0.3)"'),
    ('border:"1px solid #A7F3D0"',   'border:"1px solid rgba(52,211,153,0.3)"'),
    ('border:"1px solid #C7D2FE"',   'border:"1px solid rgba(129,140,248,0.3)"'),
    ('border:"1px solid #C4B5FD"',   'border:"1px solid rgba(167,139,250,0.3)"'),
    ('border:"1px solid #93C5FD"',   'border:"1px solid rgba(96,165,250,0.3)"'),
]

all_fixes = font_fixes + bg_fixes + border_fixes

total_changes = 0
for fname in files:
    if not os.path.exists(fname):
        print(f'SKIP: {fname}')
        continue
    with open(fname,'r',encoding='utf-8') as f:
        content = f.read()
    original = content
    for old, new in all_fixes:
        content = content.replace(old, new)
    changes = sum(1 for o,n in all_fixes if o in original)
    with open(fname,'w',encoding='utf-8') as f:
        f.write(content)
    total_changes += changes
    status = f'OK ({changes} fixes)' if content != original else 'NO CHANGE'
    print(f'{status}: {fname}')

print(f'\nTotal substituicoes: {total_changes}')
