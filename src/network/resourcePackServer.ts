import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as https from 'https';
import { spawn, ChildProcess } from 'child_process';

export interface ResourcePackPayload {
  url: string;
  hash: string;
  size: number;
}

const PACK_HTTP_PORT = Number(process.env.RESOURCE_PACK_PORT || 25580);
const PACK_ZIP_PATH = path.resolve(__dirname, '..', '..', 'resourcepack', 'zylarpixel-pack.zip');
const PACK_CONFIG_PATH = path.resolve(__dirname, '..', '..', 'resourcepack', 'pack-config.json');
const CLOUDFLARED_PATH = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';

let packBuffer: Buffer = Buffer.alloc(0);
let packSha1 = '';
let activePublicBaseUrl = '';
let httpServer: http.Server | null = null;
let cloudflaredProc: ChildProcess | null = null;
let readyPromise: Promise<ResourcePackPayload | null> | null = null;
let readyResolved = false;
let tunnelRegistered = false;

function loadPackBytes(): boolean {
  if (!fs.existsSync(PACK_ZIP_PATH)) {
    console.warn(`[RESOURCE-PACK] Pack zip not found at ${PACK_ZIP_PATH}`);
    return false;
  }
  packBuffer = fs.readFileSync(PACK_ZIP_PATH);
  packSha1 = crypto.createHash('sha1').update(packBuffer).digest('hex').toLowerCase();
  return packBuffer.length > 0 && packSha1.length === 40;
}

function readConfiguredPublicUrl(): string {
  const envUrl = (process.env.RESOURCE_PACK_URL || '').trim();
  if (envUrl) return envUrl;
  try {
    if (fs.existsSync(PACK_CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(PACK_CONFIG_PATH, 'utf-8'));
      if (typeof cfg?.publicUrl === 'string' && cfg.publicUrl.trim()) {
        return cfg.publicUrl.trim();
      }
    }
  } catch (_) {}
  return '';
}

function probeUrlReady(targetUrl: string): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const lib = targetUrl.startsWith('https://') ? https : http;
      const req = lib.request(targetUrl, { method: 'GET', timeout: 4000 }, res => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        try { req.destroy(); } catch (_) {}
        resolve(false);
      });
      req.end();
    } catch (_) {
      resolve(false);
    }
  });
}

async function waitForTunnelDns(url: string, maxAttempts: number = 15): Promise<boolean> {
  // Wait for cloudflared edge registration (or 3.5s grace) BEFORE first DNS lookup
  // so Windows DNS resolver doesn't negatively cache NXDOMAIN on a freshly minted subdomain.
  const waitUntil = Date.now() + 3500;
  while (!tunnelRegistered && Date.now() < waitUntil) {
    await new Promise(r => setTimeout(r, 250));
  }
  await new Promise(r => setTimeout(r, 500));

  for (let i = 0; i < maxAttempts; i++) {
    if (await probeUrlReady(url)) return true;
    await new Promise(r => setTimeout(r, 1500));
  }
  return false;
}

function startHttpServer(): Promise<void> {
  return new Promise(resolve => {
    if (httpServer) {
      resolve();
      return;
    }
    httpServer = http.createServer((req, res) => {
      const reqUrl = (req.url || '/').split('?')[0];
      if (reqUrl === '/' || reqUrl === '/pack.zip' || reqUrl === '/zylarpixel-pack.zip') {
        loadPackBytes();
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Length': packBuffer.length,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'ETag': `"${packSha1}"`
        });
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        console.log(`[RESOURCE-PACK] Served zylarpixel-pack.zip (${packBuffer.length} bytes, sha1=${packSha1}) to ${req.socket.remoteAddress}`);
        res.end(packBuffer);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    httpServer.on('error', (err: any) => {
      console.warn(`[RESOURCE-PACK] HTTP server error on port ${PACK_HTTP_PORT}:`, err?.message || err);
      resolve();
    });

    httpServer.listen(PACK_HTTP_PORT, '0.0.0.0', () => {
      console.log(`[RESOURCE-PACK] Local HTTP pack server listening on http://127.0.0.1:${PACK_HTTP_PORT}/zylarpixel-pack.zip (SHA1: ${packSha1})`);
      resolve();
    });
  });
}

function startCloudflaredTunnel(): Promise<string> {
  return new Promise(resolve => {
    if (!fs.existsSync(CLOUDFLARED_PATH)) {
      console.warn(`[RESOURCE-PACK] cloudflared.exe not found at ${CLOUDFLARED_PATH}; falling back to localhost URL`);
      resolve(`http://127.0.0.1:${PACK_HTTP_PORT}`);
      return;
    }

    let settled = false;
    const finish = (baseUrl: string) => {
      if (settled) return;
      settled = true;
      resolve(baseUrl);
    };

    try {
      cloudflaredProc = spawn(
        CLOUDFLARED_PATH,
        ['tunnel', '--url', `http://127.0.0.1:${PACK_HTTP_PORT}`, '--no-autoupdate'],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
      );
    } catch (err: any) {
      console.warn(`[RESOURCE-PACK] Failed launching cloudflared:`, err?.message || err);
      finish(`http://127.0.0.1:${PACK_HTTP_PORT}`);
      return;
    }

    const onChunk = (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      if (text.includes('Registered tunnel connection')) {
        tunnelRegistered = true;
      }
      const m = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (m && m[0]) {
        const tunnelBase = m[0];
        console.log(`[RESOURCE-PACK] Cloudflared public tunnel assigned: ${tunnelBase}/zylarpixel-pack.zip`);
        finish(tunnelBase);
      }
    };

    cloudflaredProc.stdout?.on('data', onChunk);
    cloudflaredProc.stderr?.on('data', onChunk);
    cloudflaredProc.on('exit', code => {
      if (!settled) {
        console.warn(`[RESOURCE-PACK] cloudflared exited early (code=${code}); using localhost URL`);
        finish(`http://127.0.0.1:${PACK_HTTP_PORT}`);
      }
    });

    setTimeout(() => {
      if (!settled) {
        console.warn(`[RESOURCE-PACK] Timed out waiting for cloudflared URL after 25s; using localhost URL until tunnel announces`);
        finish(`http://127.0.0.1:${PACK_HTTP_PORT}`);
      }
    }, 25000);
  });
}

export function startResourcePackServer(): Promise<ResourcePackPayload | null> {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    if (!loadPackBytes()) {
      readyResolved = true;
      return null;
    }

    const configuredUrl = readConfiguredPublicUrl();
    if (configuredUrl) {
      readyResolved = true;
      console.log(`[RESOURCE-PACK] Using configured public pack URL: ${configuredUrl} (SHA1: ${packSha1})`);
      return { url: configuredUrl, hash: packSha1, size: packBuffer.length };
    }

    await startHttpServer();
    const base = await startCloudflaredTunnel();
    const fullUrl = `${base}/zylarpixel-pack.zip`;

    if (base.startsWith('https://')) {
      const ok = await waitForTunnelDns(fullUrl, 12);
      if (ok) {
        console.log(`[RESOURCE-PACK] Verified public HTTPS pack URL reachable (HTTP 200): ${fullUrl}`);
        activePublicBaseUrl = base;
      } else {
        console.warn(`[RESOURCE-PACK] Cloudflared URL not yet resolved; using localhost fallback while continuing background DNS check`);
        activePublicBaseUrl = `http://127.0.0.1:${PACK_HTTP_PORT}`;
        // Upgrade automatically once DNS propagates
        (async () => {
          if (await waitForTunnelDns(fullUrl, 20)) {
            activePublicBaseUrl = base;
            console.log(`[RESOURCE-PACK] Background DNS check succeeded! Switched public pack URL -> ${fullUrl}`);
          }
        })();
      }
    } else {
      activePublicBaseUrl = base;
    }

    readyResolved = true;
    return {
      url: `${activePublicBaseUrl}/zylarpixel-pack.zip`,
      hash: packSha1,
      size: packBuffer.length
    };
  })();

  return readyPromise;
}

export async function waitForResourcePackPayload(timeoutMs: number = 22000): Promise<ResourcePackPayload | null> {
  const configuredUrl = readConfiguredPublicUrl();
  if (configuredUrl && loadPackBytes()) {
    return { url: configuredUrl, hash: packSha1, size: packBuffer.length };
  }
  const p = readyPromise || startResourcePackServer();
  if (readyResolved) {
    loadPackBytes();
    const base = activePublicBaseUrl || `http://127.0.0.1:${PACK_HTTP_PORT}`;
    return { url: `${base}/zylarpixel-pack.zip`, hash: packSha1, size: packBuffer.length };
  }

  return Promise.race([
    p,
    new Promise<ResourcePackPayload | null>(resolve =>
      setTimeout(() => {
        if (!loadPackBytes()) return resolve(null);
        const base = activePublicBaseUrl || `http://127.0.0.1:${PACK_HTTP_PORT}`;
        resolve({ url: `${base}/zylarpixel-pack.zip`, hash: packSha1, size: packBuffer.length });
      }, timeoutMs)
    )
  ]);
}

export function stopResourcePackServer(): void {
  if (cloudflaredProc) {
    try { cloudflaredProc.kill(); } catch (_) {}
    cloudflaredProc = null;
  }
  if (httpServer) {
    try { httpServer.close(); } catch (_) {}
    httpServer = null;
  }
}
