const { spawn } = require('child_process');
const path = require('path');

console.log('================================================================');
console.log('   🏎️  CUSTOM 1.21.1 ARENA ENGINE BENCHMARK HARNESS');
console.log('================================================================\n');

const serverProc = spawn('node', ['server.js'], {
  cwd: __dirname,
  stdio: ['inherit', 'pipe', 'pipe']
});

serverProc.stdout.on('data', (data) => {
  const text = data.toString();
  process.stdout.write(text);

  if (text.includes('ARENA SERVER READY')) {
    console.log('\n[BENCHMARK] Server is ready! Launching test bot in 300ms...\n');
    setTimeout(() => {
      runBot();
    }, 300);
  }
});

serverProc.stderr.on('data', (data) => {
  process.stderr.write(data.toString());
});

function runBot() {
  const botProc = spawn('node', ['test-client.js'], {
    cwd: __dirname,
    stdio: 'inherit'
  });

  botProc.on('exit', (code) => {
    console.log(`\n[BENCHMARK] Bot exited with code ${code}.`);
    console.log('[BENCHMARK] Shutting down Arena server...');
    serverProc.kill('SIGINT');
    setTimeout(() => {
      process.exit(code);
    }, 500);
  });
}
