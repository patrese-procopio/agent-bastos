# services/ — camada de lógica de negócio e integrações externas
# Cada módulo aqui é independente de FastAPI (sem rotas, sem Request/Response).
# Isso permite testar as funções isoladamente com pytest, sem subir o servidor.
