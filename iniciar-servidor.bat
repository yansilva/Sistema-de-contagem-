@echo off
title Servidor - Estoque SaaS
color 0B

echo ========================================================
echo   Iniciando o Servidor - Estoque SaaS...
echo ========================================================
echo.

:: Vai para a pasta do backend e inicia o servidor
cd backend
call npm start

:: Caso o servidor feche por algum erro, pausa para o usuario conseguir ler
echo.
echo ========================================================
echo   O servidor foi encerrado.
echo ========================================================
pause
