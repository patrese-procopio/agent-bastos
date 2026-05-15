f = open(r'C:\Users\Administrador\agent-bastos-app\src\Dashboard.jsx', encoding='latin-1')
c = f.read()
f.close()

# 1. Adiciona aba no array
old = '[["geral","Visao Geral"],["nucleo","Por Nucleo"],["documentos","Por Documento"]]'
new = '[["geral","Visao Geral"],["nucleo","Por Nucleo"],["documentos","Por Documento"],["lancamento","Lancamento"]]'
c = c.replace(old, new, 1)

# 2. Adiciona estados para lancamento
old2 = '  const [dadosReais, setDadosReais] = useState(false)'
new2 = '''  const [dadosReais, setDadosReais] = useState(false)
  const [catalogos, setCatalogos] = useState({tipos:[],nucleos:[],unidades:[]})
  const [lancamentos, setLancamentos] = useState([])
  const [formDoc, setFormDoc] = useState({nome_arquivo:"",tipo_codigo:"RELINT",nucleo_sigla:"NI",unidade_sigla:"",ano:2026,mes:MES_ATUAL+1,observacao:""})
  const [salvando, setSalvando] = useState(false)
  const [msgLanc, setMsgLanc] = useState("")'''
c = c.replace(old2, new2, 1)

open(r'C:\Users\Administrador\agent-bastos-app\src\Dashboard.jsx', 'w', encoding='latin-1').write(c)
print('ok patch 1')
