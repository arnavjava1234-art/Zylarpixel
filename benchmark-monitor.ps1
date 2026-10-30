# ZylarPixel Benchmark & CPU Profiler
$cores = [Environment]::ProcessorCount
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🚀 ZYLARPIXEL SERVER CPU & RESOURCE STRESS BENCHMARK" -ForegroundColor Yellow
Write-Host "Detected CPU Logical Cores: $cores" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Identify Server Processes
$islandProc = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object { $_.CommandLine -like "*server.ts*" } | Select-Object -First 1
$hubProc    = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object { $_.CommandLine -like "*hubServer.ts*" } | Select-Object -First 1
$proxyProc  = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object { $_.CommandLine -like "*proxy.ts*" -and $_.CommandLine -like "*require*" } | Select-Object -First 1

if (-not $islandProc -or -not $hubProc -or -not $proxyProc) {
    Write-Host "❌ Could not find all 3 server processes! Check that server.ts, hubServer.ts, and proxy.ts are running." -ForegroundColor Red
    exit 1
}

$pids = @($islandProc.ProcessId, $hubProc.ProcessId, $proxyProc.ProcessId)
$labels = @{
    $islandProc.ProcessId = "Island Server (:25567)"
    $hubProc.ProcessId    = "Hub Server    (:25566)"
    $proxyProc.ProcessId  = "Master Proxy  (:25565)"
}

Write-Host "Monitoring Targets:" -ForegroundColor Gray
Write-Host "  Island Server PID: $($islandProc.ProcessId)"
Write-Host "  Hub Server PID:    $($hubProc.ProcessId)"
Write-Host "  Master Proxy PID:  $($proxyProc.ProcessId)"
Write-Host ""

# 2. Measure 3 Seconds Idle Baseline
Write-Host "⏳ Step 1: Measuring 3s Idle Baseline..." -ForegroundColor Yellow
$prev = Get-Process -Id $pids
Start-Sleep -Seconds 3
$curr = Get-Process -Id $pids

Write-Host "`n--- BASELINE IDLE METRICS ---" -ForegroundColor Cyan
for ($i = 0; $i -lt $pids.Count; $i++) {
    $cpuSec = $curr[$i].CPU - $prev[$i].CPU
    $pct = [math]::Round(($cpuSec / 3.0 / $cores) * 100, 2)
    $ram = [math]::Round($curr[$i].WorkingSet64 / 1MB, 1)
    $name = $labels[$pids[$i]]
    Write-Host ("  {0,-24} CPU: {1,5}% | RAM: {2,6} MB" -f $name, $pct, $ram)
}

# 3. Launch 8 Stress Bots in Background
Write-Host "`n⚡ Step 2: Spawning 8 Stress Bots (Combat, Warps, Abilities, GUIs)..." -ForegroundColor Yellow
$botProcess = Start-Process -FilePath "node" -ArgumentList "stress-bots.js" -PassThru -NoNewWindow

# 4. Profile Per-Second During Stress Test (18 samples)
Write-Host "📈 Step 3: Recording CPU & RAM samples during peak load..." -ForegroundColor Yellow
$samples = @()

$lastSnap = Get-Process -Id $pids
$sampleCount = 18

for ($s = 1; $s -le $sampleCount; $s++) {
    Start-Sleep -Seconds 1
    $nowSnap = Get-Process -Id $pids -ErrorAction SilentlyContinue
    if (-not $nowSnap) { break }

    $sampleData = @{
        Second = $s
    }

    for ($i = 0; $i -lt $pids.Count; $i++) {
        $sec = $nowSnap[$i].CPU - $lastSnap[$i].CPU
        $pct = [math]::Round(($sec / 1.0 / $cores) * 100, 2)
        $ram = [math]::Round($nowSnap[$i].WorkingSet64 / 1MB, 1)
        $pidNum = $pids[$i]
        $sampleData["CPU_$pidNum"] = $pct
        $sampleData["RAM_$pidNum"] = $ram
    }

    $lastSnap = $nowSnap
    $samples += [PSCustomObject]$sampleData

    Write-Host ("  [Sample {0,2}s] Island: {1,5}% ({2,5}MB) | Hub: {3,5}% ({4,5}MB) | Proxy: {5,5}% ({6,5}MB)" -f `
        $s, `
        $sampleData["CPU_$($islandProc.ProcessId)"], $sampleData["RAM_$($islandProc.ProcessId)"], `
        $sampleData["CPU_$($hubProc.ProcessId)"], $sampleData["RAM_$($hubProc.ProcessId)"], `
        $sampleData["CPU_$($proxyProc.ProcessId)"], $sampleData["RAM_$($proxyProc.ProcessId)"])
}

# 5. Wait for bots to complete
if (-not $botProcess.HasExited) {
    $botProcess.WaitForExit(5000)
}

# 6. Calculate Final Averages & Peaks
Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "📊 FINAL BENCHMARK PERFORMANCE RESULTS (8 ACTIVE STRESS BOTS)" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

foreach ($pidNum in $pids) {
    $name = $labels[$pidNum]
    $cpuVals = $samples | ForEach-Object { $_."CPU_$pidNum" }
    $ramVals = $samples | ForEach-Object { $_."RAM_$pidNum" }

    $avgCpu = [math]::Round(($cpuVals | Measure-Object -Average).Average, 2)
    $peakCpu = ($cpuVals | Measure-Object -Maximum).Maximum
    $avgRam = [math]::Round(($ramVals | Measure-Object -Average).Average, 1)
    $peakRam = ($ramVals | Measure-Object -Maximum).Maximum

    Write-Host "`n🔹 $name" -ForegroundColor Yellow
    Write-Host "   Avg CPU:  $avgCpu %"
    Write-Host "   Peak CPU: $peakCpu %"
    Write-Host "   Avg RAM:  $avgRam MB"
    Write-Host "   Peak RAM: $peakRam MB"
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
