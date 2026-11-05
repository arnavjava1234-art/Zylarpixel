import { getHubBlockName } from './src/world/hubRegionProvider';

console.log('Testing Graveyard Surface & Underground:');
const samplePoints = [
  // Graveyard surface
  [-100, -50], [-100, -70], [-100, -90],
  [-120, -50], [-120, -70], [-120, -90], [-120, -110],
  [-140, -50], [-140, -70], [-140, -90], [-140, -110],
  [-160, -50], [-160, -70], [-160, -90],
  // Crypts area underground
  [-134, -97], [-150, -90], [-160, -80], [-170, -70], [-140, -70]
];

for (const [x, z] of samplePoints) {
  let topY = 0;
  let topBlock = 'none';
  for (let y = 100; y >= 40; y--) {
    const b = getHubBlockName(x, y, z);
    if (b && b !== 'air' && b !== 'cave_air') {
      topY = y;
      topBlock = b;
      break;
    }
  }
  // Check underground cavities (Y: 45 to 65)
  const cavities: number[] = [];
  for (let y = topY - 2; y >= 45; y--) {
    const b = getHubBlockName(x, y, z);
    if (b === 'air' || b === 'cave_air') {
      cavities.push(y);
    }
  }
  console.log(`x: ${x}, z: ${z} | Top Y: ${topY} (${topBlock}) | Cavities Y: ${cavities.length > 0 ? cavities.join(',') : 'none'}`);
}
