@echo off
REM Re-indexa o Google Drive para o RAG. Agendado via Task Scheduler (diario 03h).
cd /d C:\Users\Administrador\Agent_Bastos
echo ============================================== >> logs\drive_sync.log
echo [%date% %time%] Iniciando sync do Drive >> logs\drive_sync.log
.venv\Scripts\python.exe -X utf8 -m drive_indexer.indexer >> logs\drive_sync.log 2>&1
echo [%date% %time%] Fim (exit %errorlevel%) >> logs\drive_sync.log
