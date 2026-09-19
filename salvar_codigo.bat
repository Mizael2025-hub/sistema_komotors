@echo off
chcp 65001 >nul
color 0B

echo ==================================================
echo        ASSISTENTE DE VERSIONAMENTO SEGURO
echo ==================================================
echo.
echo Estas sao as suas branches atuais:
echo.
git branch
echo.
echo ==================================================
echo.
set /p BRANCH="Digite o nome da branch (ex: melhorias) ou digite um novo nome para criar: "

:: Tenta verificar se a branch já existe
git rev-parse --verify %BRANCH% >nul 2>&1
if %errorlevel% equ 0 (
    echo.
    echo [INFO] A branch '%BRANCH%' ja existe. Mudando para ela...
    git checkout %BRANCH%
) else (
    echo.
    echo [INFO] Criando nova branch chamada '%BRANCH%'...
    git checkout -b %BRANCH%
)

echo.
echo ==================================================
set /p MSG="Digite a descricao da melhoria (ex: Corrigido lentidao na tela de estoque): "

echo.
echo [INFO] Salvando o codigo na branch '%BRANCH%'...
git add .
git commit -m "%MSG%"
git push -u origin %BRANCH%

echo.
echo ==================================================
echo               PROTECAO DA MAIN
echo ==================================================
set /p MERGE="Deseja enviar essas alteracoes para a MAIN agora (Gatilho para Vercel)? [S/N]: "

if /I "%MERGE%"=="S" (
    echo.
    echo [INFO] Sincronizando com a Main...
    git checkout main
    git pull origin main
    git merge %BRANCH%
    git push origin main
    echo.
    echo [SUCESSO] Codigo na main! A Vercel ja esta atualizando o sistema em producao.
) else (
    echo.
    echo [SUCESSO] Operacao finalizada. Codigo salvo na branch '%BRANCH%'. A main nao foi tocada.
)

echo.
pause