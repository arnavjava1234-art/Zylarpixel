const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const REPO_DIR = path.resolve(__dirname);
let debounceTimer = null;
let isSyncing = false;

console.log(`[Auto-Sync Daemon] Started monitoring: ${REPO_DIR}`);

function runGitSync() {
  if (isSyncing) return;
  isSyncing = true;

  exec('git status --porcelain', { cwd: REPO_DIR }, (err, stdout) => {
    if (err) {
      console.error('[Auto-Sync] Error checking status:', err.message);
      isSyncing = false;
      return;
    }

    if (!stdout.trim()) {
      isSyncing = false;
      return;
    }

    console.log('[Auto-Sync] Changes detected, staging & committing...');
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

    exec('git add . && git diff --cached --quiet', { cwd: REPO_DIR }, (addErr) => {
      // If exit code is 1, there ARE staged changes to commit
      exec(`git commit -m "auto-sync: ${timestamp} workspace update" && git push origin main`, { cwd: REPO_DIR }, (commitErr, commitOut) => {
        if (commitErr) {
          // If nothing to commit, ignore
          if (!commitErr.message.includes('nothing to commit')) {
            console.error('[Auto-Sync] Push error:', commitErr.message);
          }
        } else {
          console.log(`[Auto-Sync] Successfully pushed update at ${timestamp} to origin/main!`);
        }
        isSyncing = false;
      });
    });
  });
}

function queueSync(filename) {
  if (!filename) return;
  const normalized = filename.replace(/\\/g, '/');

  // Ignore patterns
  if (
    normalized.startsWith('.git') ||
    normalized.includes('node_modules') ||
    normalized.includes('logs/') ||
    normalized.endsWith('.log') ||
    normalized.startsWith('.gemini') ||
    normalized.includes('dist/') ||
    normalized.includes('syncDaemon.js')
  ) {
    return;
  }

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    runGitSync();
  }, 3500); // 3.5s debounce
}

// Watch directory recursively
fs.watch(REPO_DIR, { recursive: true }, (eventType, filename) => {
  queueSync(filename);
});

// Periodic fallback check every 3 minutes in case fs.watch missed an event
setInterval(() => {
  runGitSync();
}, 180000);
