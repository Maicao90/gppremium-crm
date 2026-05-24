@echo off
echo ==============================================
echo        INICIANDO O CRM DO WHATSAPP
echo ==============================================
echo.

echo 1. Iniciando o Banco de Dados e Servidor (Backend)...
start cmd /k "cd backend && npm run dev"

echo 2. Iniciando a Interface Visual (Extensao)...
start cmd /k "cd extension && pnpm dev"

echo.
echo Tudo iniciado com sucesso em janelas separadas!
echo.
echo PASSOS FINAIS:
echo 1. Abra o Chrome e va em chrome://extensions/
echo 2. Ative o "Modo do desenvolvedor" no canto superior direito.
echo 3. Clique em "Carregar sem compactacao".
echo 4. Selecione a pasta: "extencao GP\whatsapp-crm\extension\build\chrome-mv3-dev"
echo.
pause
