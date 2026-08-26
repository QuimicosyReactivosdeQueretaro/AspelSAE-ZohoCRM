@echo off
echo Iniciando el Servidor de Node.js...
start "Servidor API SAE" /min cmd /c "npm start"

echo Iniciando el Tunel Seguro de Ngrok...
start "Tunel Ngrok" cmd /c "ngrok http --domain=elderly-figurine-elephant.ngrok-free.dev 3001"

echo.
echo Todo listo! Puedes cerrar esta ventana negra. 
echo La otra ventana que dice "ngrok" debe quedarse abierta.
timeout /t 5 >nul
