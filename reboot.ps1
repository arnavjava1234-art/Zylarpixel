$ports = Get-NetTCPConnection -LocalPort 25565 -ErrorAction SilentlyContinue
foreach ($p in $ports) {
    if ($p.OwningProcess) {
        Stop-Process -Id $p.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

# Quick typecheck / dist build
& npx tsc

# Launch server
Start-Process -NoNewWindow cmd.exe -ArgumentList '/c npx tsx server.ts'

Start-Sleep -Seconds 2

# Launch bot
Start-Process -NoNewWindow node -ArgumentList 'bot.js'

Write-Host "✅ [REBOOT] Server and ZylarBot reloaded successfully in 1 step!"
