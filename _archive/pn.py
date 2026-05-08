path = r'C:\Users\Administrador\agent-bastos-app\src\App.jsx'
with open(path, encoding='utf-8') as f:
    lines = f.readlines()

for i, l in enumerate(lines):
    if 'const [showPolicies' in l and 'liveNews' not in l:
        lines[i] = l.replace('const [showPolicies', 'const [liveNews, setLiveNews] = useState([])\n  const [showPolicies')
        print('estado ok', i+1)
        break

inserido = False
for i, l in enumerate(lines):
    if 'chatEndRef.current?.scrollIntoView' in l and not inserido:
        bloco = ''.join(lines[i:i+6])
        if 'noticias' not in bloco:
            novo = '\n  useEffect(() => {\n    fetch("http://127.0.0.1:8000/noticias").then(r=>r.json()).then(d=>{if(d.noticias&&d.noticias.length>0)setLiveNews(d.noticias)}).catch(()=>{})\n  }, [])\n'
            lines.insert(i+3, novo)
            inserido = True
            print('effect ok', i+1)
        break

for i, l in enumerate(lines):
    if 'NEWS.map' in l and 'liveNews' not in l:
        lines[i] = l.replace('{NEWS.map((n,i) => (', '{(liveNews.length>0?liveNews.slice(0,4).map((n,i)=>({title:n.titulo,source:"n8n",time:Math.floor((Date.now()/1000-n.atualizado)/3600)+"h",category:"Intel",bg:"#FFEDD5",color:"#C2410C",img:"https://picsum.photos/seed/"+i+"/400/200"})):NEWS).map((n,i) => (')
        print('map ok', i+1)
        break

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)
print('PRONTO')
