@echo off
title ZylarPixel SkyBlock Engine
echo ===================================================
echo   Starting ZylarPixel SkyBlock Services:
echo   - 🏛️ Integrated Hub & Multi-Islands (Port 25565)
echo   - 🌐 Playit.gg Public Tunnel
echo   - 🤖 ZylarBot
echo ===================================================

cd /d "C:\Users\Wing\.gemini\antigravity\scratch\arena-server"
if not exist "logs" mkdir logs

:: 1. Launch Playit Tunnel
echo [1/3] Launching Playit Tunnel...
start "Playit Tunnel" "C:\Program Files\playit_gg\bin\playit.exe" start

:: 2. Launch ZylarPixel Game Server (:25565)
echo [2/3] Launching ZylarPixel Engine (:25565)...
start "ZylarPixel Server" cmd /k "npx tsx server.ts"

:: Wait 3 seconds for server to bind
timeout /t 3 /nobreak >nul

:: 3. Launch ZylarBot
echo [3/3] Launching ZylarBot...
start "ZylarBot" cmd /k "node bot.js"

echo ===================================================
echo   All services online! Connect to port 25565!
echo ===================================================
