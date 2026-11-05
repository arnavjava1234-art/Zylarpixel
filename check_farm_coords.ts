import { getHubBlockStateId, loadHubChunk } from './src/world/hubRegionProvider';
import { mcData1192 } from './src/world/worldManager';

loadHubChunk(1, -5, true);

console.log('=== Surrounding blocks at Y=69 (floor) and Y=70 (waist) ===');
for (let dz = -2; dz <= 2; dz++) {
  let floorRow = '';
  let waistRow = '';
  for (let dx = -2; dx <= 2; dx++) {
    const x = 16 + dx;
    const z = -71 + dz;
    const floorB = mcData1192.blocksByStateId[getHubBlockStateId(x, 69, z)]?.name || 'air';
    const waistB = mcData1192.blocksByStateId[getHubBlockStateId(x, 70, z)]?.name || 'air';
    floorRow += `${floorB.slice(0, 6).padEnd(8)} `;
    waistRow += `${waistB.slice(0, 6).padEnd(8)} `;
  }
  console.log(`dz=${dz.toString().padStart(2)} | Floor: ${floorRow} | Waist: ${waistRow}`);
}
