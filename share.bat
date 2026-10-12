@echo off
cls
color 0B
echo ================================================================
echo    [ZYLARPIXEL] INSTANT SHAREABLE MINECRAFT IP GENERATOR
echo ================================================================
echo.
echo  [*] Connecting port 25565 to public internet...
echo  [*] Friends can join by pasting the assigned IP:PORT in Minecraft!
echo.
echo ----------------------------------------------------------------
ssh -o StrictHostKeyChecking=no -R 0:localhost:25565 serveo.net
echo.
echo Tunnel closed. Press any key to exit...
pause >nul
