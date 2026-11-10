/**
 * ZylarPixel 1.21.8 Tag Registry Manager
 * Loads and provides full tag catalog extracted from client jar (1.21.8)
 */

import * as fs from 'fs';
import * as path from 'path';

export interface TagEntry {
  tagName: string;
  entries: number[];
}

export interface TagTypeGroup {
  tagType: string;
  tags: TagEntry[];
}

let cachedTags: TagTypeGroup[] | null = null;

export function getTagPacketData(): TagTypeGroup[] {
  if (cachedTags) return cachedTags;

  const candidates = [
    path.join(__dirname, 'allTags1218.json'),
    path.join(__dirname, '..', '..', 'data', 'allTags1218.json'),
    path.join(process.cwd(), 'data', 'allTags1218.json'),
    path.join(process.cwd(), 'src', 'world', 'allTags1218.json')
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        cachedTags = JSON.parse(fs.readFileSync(c, 'utf8'));
        return cachedTags!;
      } catch (_) {}
    }
  }

  return [];
}

export const allTags1218: TagTypeGroup[] = getTagPacketData();

export const tagRegistryManager = {
  getTagPacketData,
  getAllTags: getTagPacketData,
  allTags1218
};

export default tagRegistryManager;
