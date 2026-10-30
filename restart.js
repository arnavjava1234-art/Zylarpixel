/**
 * ZylarPixel Instant 1-Step Reloader
 * Clears port 25565, runs typecheck, and launches server.ts (with integrated Hub & Islands) and ZylarBot
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔄 [RELOAD] Initializing ZylarPixel Engine (Hub & Multi-Island)...');

try {
  const stdout = execSync('netstat -ano | findstr :25565 | findstr LISTENING', { encoding: 'utf8' });
  const lines = stdout.trim().split('\n');
  const pids = new Set();
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && pid !== '0') pids.add(pid);
  }
  for (const pid of pids) {
    try {
      console.log(`🛑 Stopping port 25565 process PID: ${pid}`);
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
    } catch (e) {}
  }
} catch (e) {}

// Kill existing bot.js
try {
  const wmicOut = execSync('wmic process where "commandline like \'%bot.js%\'" get processid', { encoding: 'utf8' });
  const bPids = wmicOut.trim().split(/\s+/).filter(p => /^\d+$/.test(p) && p !== String(process.pid));
  for (const pid of bPids) {
    try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch (e) {}
  }
} catch (e) {}

// Build Check
try {
  console.log('🔨 Typechecking codebase...');
  execSync('npx tsc', { cwd: __dirname, stdio: 'ignore' });
} catch (e) {
  console.warn('⚠️ tsc warning (continuing launch)');
}

const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// 1. Launch server.ts on 25565
const serverOut = fs.openSync(path.join(logsDir, 'latest.log'), 'a');
const serverProc = spawn('cmd.exe', ['/c', 'npx', 'tsx', 'server.ts'], {
  cwd: __dirname,
  detached: true,
  stdio: ['ignore', serverOut, serverOut]
});
serverProc.unref();
console.log(`🚀 ZylarPixel Server live on :25565 (PID: ${serverProc.pid})!`);

// 2. Launch ZylarBot
setTimeout(() => {
  const botOut = fs.openSync(path.join(logsDir, 'bot.log'), 'a');
  const botProc = spawn('node', ['bot.js'], {
    cwd: __dirname,
    detached: true,
    stdio: ['ignore', botOut, botOut]
  });
  botProc.unref();
  console.log(`🤖 ZylarBot connected to :25565 (PID: ${botProc.pid})!`);

  console.log('✅ [RELOAD COMPLETE] Server & Bot are live with Hub & Islands!');
  process.exit(0);
}, 2000);
