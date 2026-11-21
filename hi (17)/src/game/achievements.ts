/** Achievement definitions. `check` is evaluated periodically against the save. */
import type { SaveData } from './types';

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  check?: (s: SaveData) => boolean;
}

const spent = (s: SaveData) => Object.values(s.upgrades).reduce((a, b) => a + b, 0);

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', name: 'First Steps', desc: 'Clear your first level', check: (s) => s.completed.length >= 1 },
  { id: 'coins', name: 'Pocketful of Sun', desc: 'Collect 100 coins', check: (s) => s.coins >= 100 },
  { id: 'crystals', name: 'Crystal Hoarder', desc: 'Collect 25 crystals', check: (s) => s.stats.crystalsEver >= 25 },
  { id: 'slayer', name: 'Ruin Cleaner', desc: 'Defeat 40 enemies', check: (s) => s.stats.kills >= 40 },
  { id: 'secrets', name: 'Secret Seeker', desc: 'Find 3 secret relics', check: (s) => s.secrets >= 3 },
  { id: 'warden', name: 'Warden Broken', desc: 'Defeat the Stone Warden', check: (s) => s.bosses.includes('warden') },
  { id: 'king', name: 'Crown Fallen', desc: 'Defeat the Hollow King', check: (s) => s.bosses.includes('king') },
  { id: 'clean', name: 'Untouchable', desc: 'Clear a level without taking damage', check: (s) => s.noDamage.length >= 1 },
  { id: 'pogo', name: 'Pogo Master', desc: 'Pogo off enemies 10 times', check: (s) => s.stats.pogos >= 10 },
  { id: 'dasher', name: 'Wind Rider', desc: 'Dash 100 times', check: (s) => s.stats.dashes >= 100 },
  { id: 'trial', name: 'Trial Survivor', desc: 'Clear an optional challenge room', check: (s) => s.completed.some((c) => c.startsWith('trial')) },
  { id: 'shopper', name: 'Wayfarer\'s Kit', desc: 'Buy 3 upgrades', check: (s) => spent(s) >= 3 },
  { id: 'speed', name: 'Speed Demon', desc: 'Beat a level\'s par time' },
  { id: 'artifact', name: 'Balance Restored', desc: 'Recover the Lumen Heart', check: (s) => s.completed.includes('sky') },
];
