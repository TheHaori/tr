/**
 * Level registry. Built-in levels are JSON files (src/game/data/levels).
 * Custom levels can be registered at runtime (drag & drop a .json file).
 */
import forest from './data/levels/forest.json';
import ruins from './data/levels/ruins.json';
import caves from './data/levels/caves.json';
import sky from './data/levels/sky.json';
import trial1 from './data/levels/trial1.json';
import trial2 from './data/levels/trial2.json';
import type { LevelData } from './types';

/** Main campaign order. */
export const CAMPAIGN: string[] = ['forest', 'ruins', 'caves', 'sky'];

const registry = new Map<string, LevelData>();
for (const l of [forest, ruins, caves, sky, trial1, trial2]) registry.set(l.id, l as unknown as LevelData);

export const getLevel = (id: string) => registry.get(id);
export const allLevels = () => [...registry.values()];
export const nextCampaignLevel = (id: string) => {
  const i = CAMPAIGN.indexOf(id);
  return i >= 0 && i < CAMPAIGN.length - 1 ? CAMPAIGN[i + 1] : null;
};

/** Validate & register a user supplied level. Returns the level id or throws. */
export function registerCustomLevel(raw: unknown): string {
  const d = raw as Partial<LevelData>;
  if (!d || !Array.isArray(d.tiles) || d.tiles.length < 8 || !d.tiles.every((r) => typeof r === 'string')) {
    throw new Error('Level JSON needs a "tiles" array of strings (min 8 rows).');
  }
  if (!d.tiles.some((r) => r.includes('P'))) throw new Error('Level needs a player start tile "P".');
  const level: LevelData = {
    id: `custom-${d.id ?? Date.now()}`,
    name: d.name ?? 'Custom Level',
    subtitle: d.subtitle ?? 'Community level',
    theme: d.theme && ['forest', 'ruins', 'caves', 'sky'].includes(d.theme) ? d.theme : 'forest',
    time: d.time ?? [0, 0],
    weather: d.weather ?? 'none',
    music: d.music ?? 'forest',
    par: d.par ?? 120,
    tiles: d.tiles,
    npcs: d.npcs, portals: d.portals, intro: d.intro, boss: d.boss, optional: true, reward: 0,
  };
  registry.set(level.id, level);
  return level.id;
}
