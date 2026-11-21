/** Save / load (localStorage), settings persistence and the upgrade (skill tree) table. */
import { SAVE_KEY, SETTINGS_KEY } from './config';
import type { SaveData, Settings } from './types';

export const defaultSettings = (): Settings => ({
  music: 0.6, sfx: 0.8, shake: 1, particles: 2, reduceFlash: false, assist: false,
  gameSpeed: 1, speedrun: false, touch: 'auto', highContrast: false,
});

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch { /* ignore corrupt data */ }
  return defaultSettings();
}
export function storeSettings(s: Settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

export const newSave = (): SaveData => ({
  version: 1, levelId: 'forest', checkpoint: null, hp: 3, coins: 0, crystals: 0,
  upgrades: {}, collected: {}, completed: [], unlocked: ['forest'], best: {}, quests: {},
  bosses: [], secrets: 0,
  stats: { deaths: 0, kills: 0, playMs: 0, jumps: 0, pogos: 0, dashes: 0, crystalsEver: 0 },
  achievements: [], noDamage: [], savedAt: Date.now(),
});

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    if (d.version !== 1) return null;
    const base = newSave();
    return { ...base, ...d, stats: { ...base.stats, ...d.stats } };
  } catch { return null; }
}
export function writeSave(d: SaveData) {
  d.savedAt = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch { /* storage unavailable */ }
}
export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export interface UpgradeDef { id: string; name: string; desc: string[]; cost: number[] }

/** Skill tree: spend crystals in the pause menu. */
export const UPGRADES: UpgradeDef[] = [
  { id: 'vitality', name: 'Heartwood', desc: ['+1 max heart', '+1 max heart', '+1 max heart'], cost: [4, 8, 12] },
  { id: 'aether', name: 'Aether Focus', desc: ['Faster energy regen', '+1 bolt damage', 'Bolts pierce enemies'], cost: [4, 8, 12] },
  { id: 'blade', name: 'Moonblade', desc: ['Longer sword reach', '+1 sword damage'], cost: [5, 10] },
  { id: 'twin', name: 'Twin Dash', desc: ['Two dashes before landing'], cost: [10] },
  { id: 'magnet', name: 'Coin Magnet', desc: ['Coins drift to you', 'Wider magnet'], cost: [3, 6] },
];
