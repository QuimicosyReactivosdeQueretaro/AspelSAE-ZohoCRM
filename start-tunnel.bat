@echo off
cd /d "%~dp0"
echo Iniciando Tunel de Cloudflare hacia el puerto 3001...
echo Por favor, espera unos segundos y copia la URL que termine en ".trycloudflare.com"
echo.
cloudflared.exe tunnel --url http://localhost:3001
pause
