import { dumpHubChunkPacket, loadHubChunk } from './src/world/hubRegionProvider';
import * as fs from 'fs';

console.log('Testing chunks in grid cx: -10 to 6, cz: -14 to 2...');

const results: any[] = [];
for (let cx = -10; cx <= 6; cx++) {
  for (let cz = -14; cz <= 2; cz++) {
    try {
      const pkt = dumpHubChunkPacket(cx, cz, true);
      const nonZero = pkt.chunkData.some((b: number) => b !== 0);
      if (!nonZero) {
        results.push({ cx, cz, status: 'EMPTY_ALL_AIR' });
      }
    } catch (e: any) {
      results.push({ cx, cz, status: 'ERROR: ' + e.message });
    }
  }
}

console.log('Found empty or error chunks:');
console.log(JSON.stringify(results, null, 2));
