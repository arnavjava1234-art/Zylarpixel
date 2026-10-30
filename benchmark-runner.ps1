# ZylarPixel Benchmark Runner
$cores = [Environment]::ProcessorCount
Write-Host "=========================================================="
Write-Host "ZYLARPIXEL SERVER CPU & RESOURCE STRESS BENCHMARK"
Write-Host "Detected CPU Logical Cores: $cores"
Write-Host "=========================================================="

$islandPid = (Get-CimInstance Win32_Process -Filter "name='node.exe'" | Where-Object { $_.CommandLine -like "*server.ts*" -and $_.CommandLine -notlike "*hubServer*" }).ProcessId
$hubPid    = (Get-CimInstance Win32_Process -Filter "name='node.exe'" | Where-Object { $_.CommandLine -like "*hubServer.ts*" }).ProcessId
$proxyPid  = (Get-CimInstance Win32_Process -Filter "name='node.exe'" | Where-Object { $_.CommandLine -like "*proxy.ts*" -and $_.CommandLine -like "*require*" }).ProcessId

$targets = @(
    [PSCustomObject]@{ Id = [int]$islandPid; Name = "Island Server (:25567)" },
    [PSCustomObject]@{ Id = [int]$hubPid;    Name = "Hub Server    (:25566)" },
    [PSCustomObject]@{ Id = [int]$proxyPid;  Name = "Master Proxy  (:25565)" }
)

Write-Host "Monitored Targets:"
foreach ($t in $targets) {
    Write-Host ("  {0,-24} PID: {1}" -f $t.Name, $t.Id)
}

function Get-TargetSnapshots {
    $map = @{}
    foreach ($t in $targets) {
        $p = Get-Process -Id $t.Id -ErrorAction SilentlyContinue
        if ($p) {
            $map[$t.Id] = @{
                Cpu = $p.CPU
                Ram = [math]::Round($p.WorkingSet64 / 1MB, 1)
            }
        }
    }
    return $map
}

# 1. Baseline
Write-Host "`nMeasuring 3s Idle Baseline..."
$prev = Get-TargetSnapshots
Start-Sleep -Seconds 3
$curr = Get-TargetSnapshots

Write-Host "`n--- BASELINE IDLE (0 BOTS) ---"
foreach ($t in $targets) {
    $sec = $curr[$t.Id].Cpu - $prev[$t.Id].Cpu
    $pct = [math]::Round([math]::Max(0, ($sec / 3.0 / $cores) * 100), 2)
    $ram = $curr[$t.Id].Ram
    Write-Host ("  {0,-24} : {1,5}% CPU | {2,6} MB RAM" -f $t.Name, $pct, $ram)
}

# 2. Launch Bots
Write-Host "`nStarting 8 Stress Bots (Combat, Warps, Rogue Abilities, GUIs)..."
$bot = Start-Process -FilePath "node" -ArgumentList "stress-bots.js" -PassThru -NoNewWindow

# 3. Sample for 18 seconds (9 ticks x 2s)
Write-Host "`nRecording CPU & RAM under peak stress load..."
$history = @{}
foreach ($t in $targets) {
    $history[$t.Id] = @{ Cpu = @(); Ram = @() }
}

$last = Get-TargetSnapshots

for ($tick = 1; $tick -le 9; $tick++) {
    Start-Sleep -Seconds 2
    $now = Get-TargetSnapshots

    $msg = "  [Tick " + ($tick * 2) + "s] "
    foreach ($t in $targets) {
        $sec = $now[$t.Id].Cpu - $last[$t.Id].Cpu
        $pct = [math]::Round([math]::Max(0, ($sec / 2.0 / $cores) * 100), 2)
        $ram = $now[$t.Id].Ram

        $history[$t.Id].Cpu += $pct
        $history[$t.Id].Ram += $ram

        $msg += ("{0}: {1,5}% ({2,5}MB) | " -f $t.Name, $pct, $ram)
    }
    $last = $now
    Write-Host $msg
}

# 4. Wait for bots to finish
if (-not $bot.HasExited) {
    $bot.WaitForExit(6000)
}

# 5. Summary
Write-Host "`n=========================================================="
Write-Host "FINAL BENCHMARK PERFORMANCE RESULTS (8 ACTIVE STRESS BOTS)"
Write-Host "=========================================================="

foreach ($t in $targets) {
    $cpus = $history[$t.Id].Cpu
    $rams = $history[$t.Id].Ram

    $avgCpu = [math]::Round(($cpus | Measure-Object -Average).Average, 2)
    $maxCpu = ($cpus | Measure-Object -Maximum).Maximum
    $avgRam = [math]::Round(($rams | Measure-Object -Average).Average, 1)
    $maxRam = ($rams | Measure-Object -Maximum).Maximum

    Write-Host "`n[*] $($t.Name)"
    Write-Host ("   Average CPU Load: {0,5}%" -f $avgCpu)
    Write-Host ("   Peak CPU Load:    {0,5}%" -f $maxCpu)
    Write-Host ("   Average RAM:      {0,5} MB" -f $avgRam)
    Write-Host ("   Peak RAM:         {0,5} MB" -f $maxRam)
}

Write-Host "`n=========================================================="
