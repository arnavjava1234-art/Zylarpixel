import { dumpHubChunkPacket } from './src/world/hubRegionProvider';

const spawnCx = -1, spawnCz = -5, radius = 6;
let mapStr = '';
for (let cz = spawnCz - radius; cz <= spawnCz + radius; cz++) {
  let row = 'cz=' + String(cz).padStart(3, ' ') + ': ';
  for (let cx = spawnCx - radius; cx <= spawnCx + radius; cx++) {
    const pkt = dumpHubChunkPacket(cx, cz, true);
    if (pkt.chunkData.length > 200) {
      row += '# '; // Has blocks!
    } else {
      row += '. '; // Empty void!
    }
  }
  mapStr += row + '\n';
}
console.log('       cx: -7-6-5-4-3-2-1 0 1 2 3 4 5');
console.log(mapStr);
