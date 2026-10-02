# Ferramentas externas do OSINT (Pegada Digital)

O módulo `modules/osint/pegada_digital.py` usa o **Maigret** (busca de username em centenas de sites),
instalado num ambiente virtual ISOLADO para não conflitar com as dependências do backend.

```powershell
cd C:\Users\Administrador\Agent_Bastos
python -m venv tools\osint_venv
tools\osint_venv\Scripts\python.exe -m pip install --upgrade pip
tools\osint_venv\Scripts\python.exe -m pip install maigret
```

O backend usa `phonenumbers` (telefone, offline) no ambiente principal: `pip install phonenumbers`.

- `tools/` está no `.gitignore` (recriável).
- Sem o Maigret instalado a busca de redes sociais responde "ferramenta ausente"; telefone e e-mail seguem funcionando.
- **Não** usamos Holehe (testa cadastro/recuperação de senha em sites e pode alertar o dono do e-mail).
- Atualização do banco de sites do Maigret: `tools\osint_venv\Scripts\python.exe -m pip install -U maigret`.
