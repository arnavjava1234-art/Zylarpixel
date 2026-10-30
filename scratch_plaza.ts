import { loadHubChunk } from './src/world/hubRegionProvider';
const Vec3 = require('vec3');

// Check coordinates around (-2.5, -69.5) to find where the solid plaza is!
// The portal is around (-2.5, -69.5).
// Let's test offsets: dz = -5 to +5, dx = -5 to +5
for (let dz = -5; dz <= 5; dz++) {
  for (let dx = -5; dx <= 5; dx++) {
    const x = Math.round(-2.5 + dx);
    const z = Math.round(-69.5 + dz);
    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    const c = loadHubChunk(cx, cz, true);
    const rx = ((x % 16) + 16) % 16;
    const rz = ((z % 16) + 16) % 16;
    
    // Check block at Y = 70
    const b70 = c.getBlock(new Vec3(rx, 70, rz));
    const b71 = c.getBlock(new Vec3(rx, 71, rz));
    if (b70 && b70.name !== 'air' && (!b71 || b71.name === 'air')) {
      console.log(`Solid ground at (${x}, 70, ${z}): ${b70.name} (air above: ${b71?.name || 'air'})`);
    }
  }
}
