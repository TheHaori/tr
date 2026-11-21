/** Shared type definitions (level JSON schema, save data, settings). */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ThemeId = 'forest' | 'ruins' | 'caves' | 'sky';
export type WeatherId = 'none' | 'leaves' | 'rain' | 'fireflies' | 'embers' | 'wind' | 'motes';

export interface QuestDef {
  id: string;
  kind: 'crystals' | 'coins' | 'kills';
  need: number;
  offer: string[];
  waiting: string[];
  done: string[];
  reward: { hearts?: number; crystals?: number };
}

export interface NpcDef {
  name: string;
  style?: 'person' | 'tablet' | 'spirit';
  lines: string[];
  quest?: QuestDef;
}

/**
 * JSON level schema – see README for the tile legend.
 * `tiles` is an array of equally long strings (rows, top to bottom).
 */
export interface LevelData {
  id: string;
  name: string;
  subtitle?: string;
  theme: ThemeId;
  /** Time-of-day range along the level: 0 = day, 1 = dusk, 2 = night. */
  time: [number, number];
  weather: WeatherId;
  music: string;
  par: number; // seconds – speedrun target
  tiles: string[];
  npcs?: Record<string, NpcDef>;
  /** char -> level id (secret challenge portals) */
  portals?: Record<string, string>;
  intro?: string;
  optional?: boolean;
  boss?: 'warden' | 'king';
  /** Optional: crystals granted the first time an optional room is cleared. */
  reward?: number;
}

export interface Settings {
  music: number;
  sfx: number;
  shake: number; // 0..1
  particles: number; // 0 off, 1 low, 2 high
  reduceFlash: boolean;
  assist: boolean; // invincible
  gameSpeed: number; // 1, 0.85, 0.7
  speedrun: boolean;
  touch: 'auto' | 'on' | 'off';
  highContrast: boolean;
}

export interface SaveData {
  version: 1;
  levelId: string;
  checkpoint: { x: number; y: number } | null;
  hp: number;
  coins: number;
  crystals: number;
  upgrades: Record<string, number>;
  collected: Record<string, string[]>;
  completed: string[];
  unlocked: string[];
  best: Record<string, number>;
  quests: Record<string, 'active' | 'done'>;
  bosses: string[];
  secrets: number;
  stats: { deaths: number; kills: number; playMs: number; jumps: number; pogos: number; dashes: number; crystalsEver: number };
  achievements: string[];
  noDamage: string[];
  savedAt: number;
}
