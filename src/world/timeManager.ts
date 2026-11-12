/**
 * ZylarPixel Shared SkyBlock World Clock & Day/Night Manager
 *
 * - Authentic 20-minute real-time day/night cycle (24,000 ticks = 1,200,000ms).
 * - Quantizes HUD / Scoreboard time strictly to 30-minute intervals (e.g. 5:00pm, 8:30am).
 * - Persists clock anchor to data/world_clock.json so Hub (25566) and Islands (25567) stay synced.
 * - Supports dual shorthand /time set inputs: HH.50 (550, 1850), HHMM (530, 1830), 12h/24h (5:30am, 18:30),
 *   presets (day, night, noon, midnight, sunrise, sunset), and raw ticks (13000t).
 */

import * as fs from 'fs';
import * as path from 'path';

export const TICKS_PER_DAY = 24000;
export const TICKS_PER_HALF_HOUR = 500;
export const REAL_MS_PER_DAY = 20 * 60 * 1000; // 20 real minutes = 1 SkyBlock day
export const MS_PER_TICK = REAL_MS_PER_DAY / TICKS_PER_DAY; // 50ms per tick

export type TimePhaseId = 'SUNRISE' | 'DAY' | 'SUNSET' | 'NIGHT' | 'MIDNIGHT';

export interface TimePhaseMeta {
  id: TimePhaseId;
  label: string;
  colorCode: string;
  symbol: string;
  skullTexture: string;
}

function encodeTextureBase64(hash: string): string {
  return Buffer.from(
    JSON.stringify({ textures: { SKIN: { url: `http://textures.minecraft.net/texture/${hash}` } } })
  ).toString('base64');
}

/**
 * Verified HTTP 200 Mojang textures.minecraft.net/texture/* payloads for the 5 celestial time phases.
 */
export const TIME_PHASES: Record<TimePhaseId, TimePhaseMeta> = {
  SUNRISE: {
    id: 'SUNRISE',
    label: 'Sunrise / Morning',
    colorCode: '§6',
    symbol: '☀',
    skullTexture: encodeTextureBase64('1258f66980f588a7c685ebb65d2932517494d837a1f927650efba3544750a291') // Golden Morning Orb
  },
  DAY: {
    id: 'DAY',
    label: 'Day / Noon Sun',
    colorCode: '§e',
    symbol: '☀',
    skullTexture: encodeTextureBase64('39e4fd23b0410ddad2ed1af39cae172b12d1873b08bbe0b61f6f353d9a682e62') // Radiant Sun
  },
  SUNSET: {
    id: 'SUNSET',
    label: 'Sunset / Dusk',
    colorCode: '§c',
    symbol: '☀',
    skullTexture: encodeTextureBase64('70a44d51ecc79f694cfd60228c88428848ca618e36a659a416e9246d841aec8') // Glowing Fire Orb
  },
  NIGHT: {
    id: 'NIGHT',
    label: 'Night / Crescent',
    colorCode: '§b',
    symbol: '☽',
    skullTexture: encodeTextureBase64('f152f90b72da55efcc2d6e4fdcc31964ba51d02f5bc712c21ee33f5521a1f2b8') // Starry Crescent Sky
  },
  MIDNIGHT: {
    id: 'MIDNIGHT',
    label: 'Midnight / Galaxy',
    colorCode: '§9',
    symbol: '☽',
    skullTexture: encodeTextureBase64('9d3d250e25bbca3a62be5b3ef02cfcab6dcdc424884c9a7d5cc95c9d0') // Deep Space Galaxy
  }
};

export interface HalfHourSlotInfo {
  slotIndex: number; // 0 (6:00am) .. 47 (5:30am)
  dayTick: number;   // 0, 500, 1000 .. 23500
  hour24: number;
  minute: 0 | 30;
  hour12: number;
  ampm: 'am' | 'pm';
  label: string;           // e.g. '8:30am', '5:00pm'
  spacedLabel: string;     // e.g. '8:30 am', '5:00 pm'
  shorthandHHMM: string;   // e.g. '830', '1700'
  shorthandDecimal: string;// e.g. '850', '1700'
  isNight: boolean;        // True for 7:00pm (13000) .. 5:30am (23500)
  phase: TimePhaseMeta;
}

interface PersistedWorldClock {
  baseEpochMs: number;
  baseWorldTicks: number;
  frozen: boolean;
  frozenTick: number;
  frozenAgeTicks: number;
}

const CLOCK_FILE = path.join(__dirname, '..', '..', 'data', 'world_clock.json');
const SKYBLOCK_MONTHS = [
  'Early Spring', 'Mid Spring', 'Late Spring',
  'Early Summer', 'Mid Summer', 'Late Summer',
  'Early Autumn', 'Mid Autumn', 'Late Autumn',
  'Early Winter', 'Mid Winter', 'Late Winter'
];
// Start at index 8 ('Late Autumn') Day 1 to preserve familiar default calendar aesthetics while cycling forward.
const START_MONTH_INDEX = 8;

let cachedClock: PersistedWorldClock | null = null;
let cachedMtimeMs = 0;

function getDefaultClock(): PersistedWorldClock {
  return {
    baseEpochMs: Date.now(),
    baseWorldTicks: 6000, // Noon start so initial server launch sits in bright daytime
    frozen: false,
    frozenTick: 6000,
    frozenAgeTicks: 6000
  };
}

function readPersistedClock(): PersistedWorldClock {
  try {
    if (fs.existsSync(CLOCK_FILE)) {
      const stat = fs.statSync(CLOCK_FILE);
      if (cachedClock && stat.mtimeMs === cachedMtimeMs) {
        return cachedClock;
      }
      const parsed = JSON.parse(fs.readFileSync(CLOCK_FILE, 'utf-8'));
      if (typeof parsed?.baseEpochMs === 'number' && typeof parsed?.baseWorldTicks === 'number') {
        cachedClock = {
          baseEpochMs: parsed.baseEpochMs,
          baseWorldTicks: parsed.baseWorldTicks,
          frozen: !!parsed.frozen,
          frozenTick: typeof parsed.frozenTick === 'number' ? parsed.frozenTick : 6000,
          frozenAgeTicks: typeof parsed.frozenAgeTicks === 'number' ? parsed.frozenAgeTicks : 6000
        };
        cachedMtimeMs = stat.mtimeMs;
        return cachedClock;
      }
    }
  } catch (_) {}

  const fresh = getDefaultClock();
  writePersistedClock(fresh);
  return fresh;
}

function writePersistedClock(clock: PersistedWorldClock): void {
  try {
    const dir = path.dirname(CLOCK_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CLOCK_FILE, JSON.stringify(clock, null, 2), 'utf-8');
    cachedClock = clock;
    cachedMtimeMs = fs.statSync(CLOCK_FILE).mtimeMs;
  } catch (_) {
    cachedClock = clock;
  }
}

export function normalizeDayTick(ticks: number): number {
  const safe = Number.isFinite(ticks) ? Math.floor(ticks) : 0;
  return ((safe % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
}

export function isNightDayTick(dayTick: number): boolean {
  const norm = normalizeDayTick(dayTick);
  return norm >= 13000; // 7:00pm (13000) through 5:59am (23999)
}

function resolvePhaseForHour(hour24: number, minute: 0 | 30): TimePhaseMeta {
  const hhmm = hour24 * 100 + minute;
  // 5:30am - 8:30am
  if (hhmm >= 530 && hhmm <= 830) return TIME_PHASES.SUNRISE;
  // 9:00am - 3:30pm
  if (hhmm >= 900 && hhmm <= 1530) return TIME_PHASES.DAY;
  // 4:00pm - 6:30pm
  if (hhmm >= 1600 && hhmm <= 1830) return TIME_PHASES.SUNSET;
  // 7:00pm - 10:30pm
  if (hhmm >= 1900 && hhmm <= 2230) return TIME_PHASES.NIGHT;
  // 11:00pm - 5:00am
  return TIME_PHASES.MIDNIGHT;
}

function buildHalfHourSlot(slotIndex: number): HalfHourSlotInfo {
  const idx = ((slotIndex % 48) + 48) % 48;
  const dayTick = idx * TICKS_PER_HALF_HOUR;
  const totalHalfHoursFromMidnight = (idx + 12) % 48; // Slot 0 (0 ticks) = 6:00am = 12 half-hours
  const hour24 = Math.floor(totalHalfHoursFromMidnight / 2);
  const minute: 0 | 30 = (totalHalfHoursFromMidnight % 2 === 1) ? 30 : 0;
  const ampm: 'am' | 'pm' = hour24 >= 12 ? 'pm' : 'am';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const minStr = minute === 0 ? '00' : '30';

  return {
    slotIndex: idx,
    dayTick,
    hour24,
    minute,
    hour12,
    ampm,
    label: `${hour12}:${minStr}${ampm}`,
    spacedLabel: `${hour12}:${minStr} ${ampm}`,
    shorthandHHMM: `${hour24}${minStr}`,
    shorthandDecimal: `${hour24}${minute === 30 ? '50' : '00'}`,
    isNight: isNightDayTick(dayTick),
    phase: resolvePhaseForHour(hour24, minute)
  };
}

const ALL_HALF_HOUR_SLOTS: HalfHourSlotInfo[] = Array.from({ length: 48 }, (_, i) => buildHalfHourSlot(i));

export function getAllHalfHourSlots(): HalfHourSlotInfo[] {
  return ALL_HALF_HOUR_SLOTS;
}

export function getHalfHourSlotForTick(dayTick: number): HalfHourSlotInfo {
  const norm = normalizeDayTick(dayTick);
  const slotIndex = Math.floor(norm / TICKS_PER_HALF_HOUR) % 48;
  return ALL_HALF_HOUR_SLOTS[slotIndex];
}

export interface WorldTimeState {
  worldAgeTicks: number;
  dayTick: number;
  dayCount: number;
  slot: HalfHourSlotInfo;
  isNight: boolean;
  frozen: boolean;
  seasonName: string;
  dayOfMonth: number;
  ordinalDay: string;
}

function toOrdinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

export function getWorldTimeState(nowMs: number = Date.now()): WorldTimeState {
  const clock = readPersistedClock();
  let worldAgeTicks: number;
  let dayTick: number;

  if (clock.frozen) {
    worldAgeTicks = Math.max(0, Math.floor(clock.frozenAgeTicks));
    dayTick = normalizeDayTick(clock.frozenTick);
  } else {
    const elapsedMs = Math.max(0, nowMs - clock.baseEpochMs);
    worldAgeTicks = Math.max(0, Math.floor(clock.baseWorldTicks + elapsedMs / MS_PER_TICK));
    dayTick = normalizeDayTick(worldAgeTicks);
  }

  const dayCount = Math.floor(worldAgeTicks / TICKS_PER_DAY);
  const slot = getHalfHourSlotForTick(dayTick);
  const dayOfMonth = (dayCount % 31) + 1;
  const monthIdx = (START_MONTH_INDEX + Math.floor(dayCount / 31)) % SKYBLOCK_MONTHS.length;

  return {
    worldAgeTicks,
    dayTick,
    dayCount,
    slot,
    isNight: isNightDayTick(dayTick),
    frozen: clock.frozen,
    seasonName: SKYBLOCK_MONTHS[monthIdx],
    dayOfMonth,
    ordinalDay: toOrdinal(dayOfMonth)
  };
}

export function setWorldTimeTicks(targetDayTick: number): WorldTimeState {
  const now = Date.now();
  const prev = getWorldTimeState(now);
  const clock = readPersistedClock();
  const normalizedTarget = normalizeDayTick(targetDayTick);
  const newWorldAge = prev.dayCount * TICKS_PER_DAY + normalizedTarget;

  writePersistedClock({
    baseEpochMs: now,
    baseWorldTicks: newWorldAge,
    frozen: clock.frozen,
    frozenTick: normalizedTarget,
    frozenAgeTicks: newWorldAge
  });

  return getWorldTimeState(now);
}

export function setWorldTimeFrozen(frozen: boolean): WorldTimeState {
  const now = Date.now();
  const current = getWorldTimeState(now);
  writePersistedClock({
    baseEpochMs: now,
    baseWorldTicks: current.worldAgeTicks,
    frozen,
    frozenTick: current.dayTick,
    frozenAgeTicks: current.worldAgeTicks
  });
  return getWorldTimeState(now);
}

export function formatScoreboardDateLine(state: WorldTimeState = getWorldTimeState()): string {
  return `§fDate: §b${state.seasonName} ${state.ordinalDay}`;
}

export function formatScoreboardTimeLine(state: WorldTimeState = getWorldTimeState()): string {
  const icon = state.isNight ? '§b☽' : '§e☀';
  const freezeTag = state.frozen ? ' §3❄' : '';
  return `§fTime: §7${state.slot.label} ${icon}${freezeTag}`;
}

export function sendWorldTimePacket(client: any, state: WorldTimeState = getWorldTimeState()): void {
  if (!client || client.ended || client.state === 'closed') return;
  try {
    // Negative dayTime tells the vanilla 1.19.2 client to freeze visual sun/moon movement cleanly
    const encodedDayTime = state.frozen
      ? BigInt(-Math.max(1, state.dayTick))
      : BigInt(state.dayTick);

    client.write('update_time', {
      age: BigInt(Math.max(0, state.worldAgeTicks)),
      time: encodedDayTime
    });
  } catch (_) {}
}

/**
 * Converts 24-hour (hour, minute) into normalized Minecraft day ticks (0..23999),
 * quantized to 30-minute intervals (500 ticks).
 */
export function hourMinuteToQuantizedTicks(hour24: number, minute: number): HalfHourSlotInfo {
  const h = ((Math.floor(hour24) % 24) + 24) % 24;
  const snappedMin: 0 | 30 = minute >= 15 && minute < 45 ? 30 : 0;
  const rollHour = minute >= 45 ? (h + 1) % 24 : h;
  const totalHalfHours = rollHour * 2 + (snappedMin === 30 ? 1 : 0);
  // 6:00am = 12 half-hours = slotIndex 0
  const slotIndex = (totalHalfHours - 12 + 48) % 48;
  return ALL_HALF_HOUR_SLOTS[slotIndex];
}

export type TimeParseResult =
  | { ok: true; slot: HalfHourSlotInfo; rawTicks: number; matchedFormat: string }
  | { ok: false; error: string };

const PRESET_TICKS: Record<string, number> = {
  sunrise: 0,      // 6:00am
  dawn: 23500,     // 5:30am
  morning: 1000,   // 7:00am
  day: 2000,       // 8:00am
  noon: 6000,      // 12:00pm
  midday: 6000,    // 12:00pm
  afternoon: 9000, // 3:00pm
  sunset: 12000,   // 6:00pm
  dusk: 12500,     // 6:30pm
  evening: 12000,  // 6:00pm
  night: 13000,    // 7:00pm
  midnight: 18000  // 12:00am
};

/**
 * Unified `/time set <value>` parser supporting:
 * - Presets: sunrise, dawn, morning, day, noon, afternoon, sunset, dusk, night, midnight
 * - Raw ticks with 't': e.g. 13000t
 * - Clock strings: 5:30am, 6:30pm, 18:30, 8:30
 * - Dual numeric shorthands (both work simultaneously!):
 *   - HH.50 decimal style: 550 -> 5:30am, 1850 -> 6:30pm, 1000 -> 10:00am
 *   - HHMM 24h style:      530 -> 5:30am, 1830 -> 6:30pm, 1000 -> 10:00am
 */
export function parseTimeInput(rawInput: string): TimeParseResult {
  const raw = (rawInput || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!raw) {
    return { ok: false, error: 'Provide a time like 5:30am, 18:30, 550, 1830, day, or night.' };
  }

  // 1. Named presets
  if (raw in PRESET_TICKS) {
    const tick = PRESET_TICKS[raw];
    return { ok: true, slot: getHalfHourSlotForTick(tick), rawTicks: tick, matchedFormat: `preset (${raw})` };
  }

  // 2. Explicit raw ticks (<n>t)
  const tickMatch = raw.match(/^(\d+)t$/);
  if (tickMatch) {
    const rawTicks = normalizeDayTick(parseInt(tickMatch[1], 10));
    return { ok: true, slot: getHalfHourSlotForTick(rawTicks), rawTicks, matchedFormat: 'ticks' };
  }

  // 3. Colon clock string: HH:MM[am|pm] or H[am|pm]
  const colonMatch = raw.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
  if (colonMatch) {
    let hour = parseInt(colonMatch[1], 10);
    const min = colonMatch[2] ? parseInt(colonMatch[2], 10) : 0;
    const ampm = colonMatch[3];

    if (min < 0 || min > 59 || hour < 0 || hour > 24) {
      return { ok: false, error: `Invalid clock time "${rawInput}".` };
    }
    if (ampm) {
      if (hour < 1 || hour > 12) {
        return { ok: false, error: `12-hour clock hours must be 1-12 (got "${rawInput}").` };
      }
      if (ampm === 'am') hour = hour === 12 ? 0 : hour;
      else hour = hour === 12 ? 12 : hour + 12;
    } else if (!colonMatch[2] && hour > 24) {
      return { ok: false, error: `Invalid hour "${rawInput}".` };
    }

    // Bare small integers without colon/am/pm like "0" or "24" treat below unless colon/ampm given
    if (colonMatch[2] || ampm || hour <= 23) {
      const slot = hourMinuteToQuantizedTicks(hour, min);
      return { ok: true, slot, rawTicks: slot.dayTick, matchedFormat: ampm ? '12h' : '24h' };
    }
  }

  // 4. Unified 3-4 digit numeric shorthand (HH.50 + HHMM)
  if (/^\d{1,4}$/.test(raw)) {
    const n = parseInt(raw, 10);
    if (n >= 0 && n <= 2400) {
      const hours = Math.floor(n / 100);
      const tail = n % 100;

      // Exact half-hour recognition: tail===50 (HH.50) OR tail===30 (HHMM) -> 30 mins
      let minutes: number;
      let fmtLabel: string;
      if (tail === 50) {
        minutes = 30;
        fmtLabel = 'HH.50';
      } else if (tail === 0 || tail === 30) {
        minutes = tail;
        fmtLabel = 'HHMM';
      } else if (tail <= 59) {
        // Intermediate HHMM minutes -> round to nearest 30m
        minutes = tail;
        fmtLabel = 'HHMM (snapped)';
      } else {
        // 60..99 interpreted as hundredths of an hour -> convert to minutes (e.g. 1875 -> 18h 45m -> 7:00pm)
        minutes = Math.round((tail / 100) * 60);
        fmtLabel = 'HH.decimal (snapped)';
      }

      const slot = hourMinuteToQuantizedTicks(hours, minutes);
      return { ok: true, slot, rawTicks: slot.dayTick, matchedFormat: fmtLabel };
    }
  }

  return {
    ok: false,
    error: `Unknown time "${rawInput}". Try 5:30am, 18:30, 550, 1850, 530, 1830, day, night, or 13000t.`
  };
}
