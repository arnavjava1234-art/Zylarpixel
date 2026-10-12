const { spawn, exec } = require('child_process');
const readline = require('readline');

const PORT = 25565;

console.clear();
console.log('\x1b[36m%s\x1b[0m', '==================================================');
console.log('\x1b[1m\x1b[33m%s\x1b[0m', '⚡ ZYLARPIXEL INSTANT SHAREABLE IP GENERATOR');
console.log('\x1b[36m%s\x1b[0m', '==================================================');
console.log(`🔌 Connecting local Minecraft port [${PORT}] to public tunnel...\n`);

function copyToClipboard(text) {
    exec(`powershell -command "Set-Clipboard -Value '${text}'"`, (err) => {
        if (!err) {
            console.log('\x1b[32m%s\x1b[0m', '📋 Successfully copied IP to clipboard!\n');
        }
    });
}

function startTunnel() {
    const args = [
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ServerAliveInterval=15',
        '-o', 'ServerAliveCountMax=3',
        '-R', `0:localhost:${PORT}`,
        'serveo.net'
    ];

    const tunnel = spawn('ssh', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let allocatedAddress = null;

    const handleOutput = (data) => {
        const text = data.toString();
        // Look for "Allocated port XXXXX" or "Forwarding TCP connections from host:port"
        const portMatch = text.match(/Allocated port (\d+)/i);
        const hostMatch = text.match(/Forwarding TCP connections from ([^\s\r\n]+)/i);

        if (portMatch || hostMatch) {
            const port = portMatch ? portMatch[1] : (hostMatch[1].split(':')[1] || '25565');
            const host = hostMatch ? (hostMatch[1].split(':')[0] || 'serveousercontent.com') : 'serveousercontent.com';
            allocatedAddress = `${host}:${port}`;

            console.log('\x1b[32m%s\x1b[0m', '==================================================');
            console.log('\x1b[1m\x1b[97m%s\x1b[0m', '🎉 YOUR SHAREABLE MINECRAFT IP IS READY!');
            console.log('\x1b[32m%s\x1b[0m', '==================================================');
            console.log(`\n  🎮 Minecraft Server Address: \x1b[1m\x1b[93m${allocatedAddress}\x1b[0m\n`);
            console.log('  👥 Give this address to your friends to paste in:');
            console.log('     Multiplayer ➜ Direct Connection / Add Server\n');
            console.log('\x1b[90m%s\x1b[0m', '--------------------------------------------------');
            console.log('\x1b[36m%s\x1b[0m', `⚡ Tunnel Status: LIVE & Forwarding to 127.0.0.1:${PORT}`);
            console.log('\x1b[90m%s\x1b[0m', 'Keep this window open while your friends are playing!');
            console.log('\x1b[32m%s\x1b[0m', '==================================================\n');

            copyToClipboard(allocatedAddress);
        }
    };

    tunnel.stdout.on('data', handleOutput);
    tunnel.stderr.on('data', handleOutput);

    tunnel.on('close', (code) => {
        console.log(`\x1b[33m[Tunnel] Session ended (code ${code}). Reconnecting in 3s...\x1b[0m`);
        setTimeout(startTunnel, 3000);
    });

    tunnel.on('error', (err) => {
        console.error('\x1b[31m[Tunnel Error]\x1b[0m', err.message);
    });

    process.on('SIGINT', () => {
        tunnel.kill();
        process.exit();
    });
}

startTunnel();
