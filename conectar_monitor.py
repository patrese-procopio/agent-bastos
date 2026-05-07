# -*- coding: utf-8 -*-
import os

BASE = r"C:\Users\Administrador\Agent_Bastos"

# ── 1. Corrige path no monitor.py ────────────────────────────────────────────
monitor_path = os.path.join(BASE, "modules", "monitor.py")
with open(monitor_path, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace(
    'ALVOS_PATH  = os.path.join(BASE_DIR, "alvos.json")',
    'ALVOS_PATH  = os.path.join(BASE_DIR, "data", "alvos.json")'
)

with open(monitor_path, "w", encoding="utf-8") as f:
    f.write(c)

print("OK — monitor.py: path do alvos.json corrigido")

# ── 2. Conecta monitor no api.py ─────────────────────────────────────────────
api_path = os.path.join(BASE, "api.py")
with open(api_path, "r", encoding="utf-8") as f:
    c = f.read()

antigo_rt = 'def varrer_alertas_realtime():\n    return {"ok": True, "mensagem": "Varredura agendada via n8n"}'
novo_rt   = 'def varrer_alertas_realtime():\n    from modules.monitor import varrer_realtime\n    return varrer_realtime()'

antigo_osint = 'def varrer_alertas_osint():\n    return {"ok": True, "mensagem": "Varredura OSINT agendada via n8n"}'
novo_osint   = 'def varrer_alertas_osint():\n    from modules.monitor import varrer_osint\n    return varrer_osint()'

if antigo_rt in c:
    c = c.replace(antigo_rt, novo_rt)
    print("OK — api.py: varrer_alertas_realtime conectado ao monitor")
else:
    print("AVISO — varrer_alertas_realtime não encontrado no api.py (pode já estar conectado)")

if antigo_osint in c:
    c = c.replace(antigo_osint, novo_osint)
    print("OK — api.py: varrer_alertas_osint conectado ao monitor")
else:
    print("AVISO — varrer_alertas_osint não encontrado no api.py (pode já estar conectado)")

with open(api_path, "w", encoding="utf-8") as f:
    f.write(c)

print("\nTudo pronto! Reinicia o backend para aplicar.")
