/**
 * ZylarPixel Automated Server Resource & CPU Profiler
 * Spawns 8 high-stress bots performing complex workloads and records live metrics.
 */

const os = require('os');
const { execSync, spawn } = require('child_process');

const logicalCores = os.cpus().length;

console.log('==========================================================');
console.log('🚀 ZYLARPIXEL SERVER CPU & RESOURCE STRESS BENCHMARK');
console.log(`💻 Hardware: ${os.cpus()[0]?.model || 'CPU'} (${logicalCores} Logical Cores)`);
console.log(`💾 Total System RAM: ${(os.totalmem() / (1024 ** 3)).toFixed(1)} GB`);
console.log('==========================================================');

// Helper to get PIDs
function getProcessInfo() {
  const psCmd = `Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress`;
  const raw = execSync(`powershell -Command "${psCmd}"`, { encoding: 'utf8' }).trim();
  const list = JSON.parse(raw);

  let islandPid, hubPid, proxyPid;
  for (const item of list) {
    const cmd = item.CommandLine || '';
    if (cmd.includes('server.ts')) islandPid = item.ProcessId;
    else if (cmd.includes('hubServer.ts')) hubPid = item.ProcessId;
    else if (cmd.includes('proxy.ts') && cmd.includes('require')) proxyPid = item.ProcessId;
  }
  return { islandPid, hubPid, proxyPid };
}

const pids = getProcessInfo();
console.log('🔍 Monitored Targets:');
console.log(`   🏝️  Island Server PID: ${pids.islandPid}`);
console.log(`   🏛️  Hub Server PID:    ${pids.hubPid}`);
console.log(`   🌐 Master Proxy PID:  ${pids.proxyPid}\n`);

if (!pids.islandPid || !pids.hubPid || !pids.proxyPid) {
  console.error('❌ Could not locate all 3 server processes!');
  process.exit(1);
}

const pidList = [pids.islandPid, pids.hubPid, pids.proxyPid].join(',');
const labels = {
  [pids.islandPid]: 'Island (:25567)',
  [pids.hubPid]:    'Hub    (:25566)',
  [pids.proxyPid]:  'Proxy  (:25565)'
};

function sampleProcesses() {
  const cmd = `Get-Process -Id ${pidList} | Select-Object Id, CPU, WorkingSet64 | ConvertTo-Json -Compress`;
  try {
    const out = execSync(`powershell -Command "${cmd}"`, { encoding: 'utf8' }).trim();
    const data = JSON.parse(out);
    const map = {};
    for (const d of data) {
      map[d.Id] = {
        cpuSec: d.CPU,
        ramMB: Math.round((d.WorkingSet64 / (1024 * 1024)) * 10) / 10
      };
    }
    return map;
  } catch (e) {
    return null;
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runBenchmark() {
  // 1. Measure Baseline Idle (3s)
  console.log('⏳ Measuring 3-second Idle Baseline...');
  const baseStart = sampleProcesses();
  await sleep(3000);
  const baseEnd = sampleProcesses();

  console.log('\n--- 🟢 BASELINE IDLE METRICS (0 BOTS) ---');
  for (const pid of [pids.islandPid, pids.hubPid, pids.proxyPid]) {
    const deltaCpu = (baseEnd[pid].cpuSec - baseStart[pid].cpuSec) / 3.0;
    const cpuPct = Math.round((deltaCpu / logicalCores) * 10000) / 100;
    const ram = baseEnd[pid].ramMB;
    console.log(`  ${labels[pid]}: ${cpuPct.toFixed(2)}% CPU | ${ram} MB RAM`);
  }

  // 2. Launch 8 Stress Bots
  console.log('\n⚡ Launching 8 Stress Bots (PvP, Cross-Server Warps, Abilities, GUIs)...');
  const botProcess = spawn('node', ['stress-bots.js'], { stdio: 'pipe' });

  botProcess.stdout.on('data', (d) => {
    const text = d.toString().trim();
    if (text.includes('spawned') || text.includes('Engaging') || text.includes('Quitting')) {
      console.log(`  [BOTS] ${text}`);
    }
  });

  // 3. Monitor for 20 seconds during the test
  console.log('\n📈 Sampling CPU & RAM during heavy multi-bot load (10 samples)...');
  const history = {
    [pids.islandPid]: { cpu: [], ram: [] },
    [pids.hubPid]: { cpu: [], ram: [] },
    [pids.proxyPid]: { cpu: [], ram: [] }
  };

  let prev = sampleProcesses();
  for (let i = 1; i <= 10; i++) {
    await sleep(2000);
    const curr = sampleProcesses();
    if (!curr) break;

    const row = [];
    for (const pid of [pids.islandPid, pids.hubPid, pids.proxyPid]) {
      const deltaCpu = (curr[pid].cpuSec - prev[pid].cpuSec) / 2.0;
      const cpuPct = Math.max(0, Math.round((deltaCpu / logicalCores) * 10000) / 100);
      const ram = curr[pid].ramMB;

      history[pid].cpu.push(cpuPct);
      history[pid].ram.push(ram);

      row.push(`${labels[pid]}: ${cpuPct.toFixed(1)}% (${ram}MB)`);
    }
    prev = curr;
    console.log(`  [Tick ${i * 2}s] ${row.join(' | ')}`);
  }

  await sleep(1000);

  // 4. Final Aggregation
  console.log('\n==========================================================');
  console.log('📊 FINAL BENCHMARK PERFORMANCE RESULTS (8 ACTIVE STRESS BOTS)');
  console.log('==========================================================');

  for (const pid of [pids.islandPid, pids.hubPid, pids.proxyPid]) {
    const cpuArr = history[pid].cpu;
    const ramArr = history[pid].ram;

    const avgCpu = Math.round((cpuArr.reduce((a, b) => a + b, 0) / cpuArr.length) * 100) / 100;
    const peakCpu = Math.max(...cpuArr);
    const avgRam = Math.round((ramArr.reduce((a, b) => a + b, 0) / ramArr.length) * 10) / 10;
    const peakRam = Math.max(...ramArr);

    console.log(`\n🔹 ${labels[pid]}`);
    console.log(`   Avg CPU Load:   ${avgCpu.toFixed(2)} %`);
    console.log(`   Peak CPU Load:  ${peakCpu.toFixed(2)} %`);
    console.log(`   Avg Memory:     ${avgRam.toFixed(1)} MB`);
    console.log(`   Peak Memory:    ${peakRam.toFixed(1)} MB`);
  }

  console.log('\n==========================================================');
  process.exit(0);
}

runBenchmark().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
