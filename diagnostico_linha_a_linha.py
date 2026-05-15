# -*- coding: utf-8 -*-
"""
diagnostico_linha_a_linha.py
Executa o api.py linha a linha e mostra onde trava.
"""
import subprocess, sys

result = subprocess.run(
    [sys.executable, "-c", """
import sys, traceback

# Intercepta sys.exit
_exit_orig = sys.exit
def _exit_trap(code=0):
    print(f"\\n*** sys.exit({code}) chamado! ***")
    traceback.print_stack()
    _exit_orig(code)
sys.exit = _exit_trap

try:
    with open("api.py", encoding="utf-8-sig") as f:
        src = f.read()
    exec(compile(src, "api.py", "exec"), {"__file__": "api.py", "__name__": "__main__"})
except SystemExit as e:
    print(f"\\n*** SystemExit({e.code}) capturado ***")
    traceback.print_exc()
except Exception as e:
    print(f"\\n*** ERRO: {e} ***")
    traceback.print_exc()
"""],
    capture_output=True, text=True, cwd=r"C:\Users\Administrador\Agent_Bastos"
)

print("=== STDOUT ===")
print(result.stdout[-3000:] if len(result.stdout) > 3000 else result.stdout)
print("=== STDERR ===")
print(result.stderr[-3000:] if len(result.stderr) > 3000 else result.stderr)
print(f"=== Return code: {result.returncode} ===")
