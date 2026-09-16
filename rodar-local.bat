@echo off
title Sistema Komotors - Local
cd /d "%~dp0"

echo ^>^> Prisma: generate + migrate + seed
call pnpm --filter web db:generate || goto :erro
call pnpm --filter web db:deploy || goto :erro
call pnpm --filter web db:seed || goto :erro

echo ^>^> API: http://localhost:3000  (admin@fabrica.local / cafe)
echo ^>^> Abrindo: http://localhost:3000/login
start "" "http://localhost:3000/login"
call pnpm dev
goto :fim

:erro
echo.
echo *** ERRO no provisioning. Verifique a mensagem acima. ***
pause

:fim
