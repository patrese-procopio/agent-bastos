f = open('api.py', encoding='latin-1')
c = f.read()
f.close()
old = 'from modules.monitor import varrer_osint'
new = 'from modules.monitor import varrer_osint\nfrom modules.dashboard_routes import registrar_rotas_dashboard'
c = c.replace(old, new, 1)
old2 = 'if __name__ == "__main__":'
new2 = 'registrar_rotas_dashboard(app)\n\nif __name__ == "__main__":'
c = c.replace(old2, new2, 1)
open('api.py', 'w', encoding='latin-1').write(c)
print('ok' if 'registrar_rotas_dashboard' in c else 'FALHOU')
