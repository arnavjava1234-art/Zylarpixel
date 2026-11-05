import { getHubBlockStateId, loadHubChunk } from './src/world/hubRegionProvider';
import { mcData1192 } from './src/world/worldManager';

// Load chunks around X=16, Z=-71 (cx = 1, cz = -5)
loadHubChunk(1, -5, true);

console.log('=== Voxel Scan around X: 16, Z: -71 ===');
for (let y = 68; y <= 75; y++) {
  const stateId = getHubBlockStateId(16, y, -71);
  const b = mcData1192.blocksByStateId[stateId];
  console.log(`(16, ${y}, -71): ${b ? b.name : 'empty'} (state: ${stateId})`);
}
