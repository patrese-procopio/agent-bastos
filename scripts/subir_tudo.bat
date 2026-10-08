@echo off
REM Atalho de duplo clique para scripts\subir_tudo.ps1
REM -ExecutionPolicy Bypass vale so para este processo (nao altera a politica da maquina).
REM Argumentos repassados: subir_tudo.bat -Dominio meu.ngrok-free.dev | -SemNgrok | -Parar
title Agent Bastos - Subida completa
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0subir_tudo.ps1" %*
echo.
pause
