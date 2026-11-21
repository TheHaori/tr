/**
 * Level builder – generates the sample level JSON files in src/game/data/levels.
 * Run with:  node tools/build-levels.mjs
 *
 * You can also hand-write / edit the JSON files directly (see README for the
 * tile legend), or drag & drop your own .json level onto the game window.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'game', 'data', 'levels');
mkdirSync(OUT, { recursive: true });

class Grid {
  constructor(w, h) { this.w = w; this.h = h; this.g = Array.from({ length: h }, () => Array(w).fill('.')); }
  set(x, y, c) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.g[y][x] = c; return this; }
  rect(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c); return this; }
  ground(x0, x1, top, c = '#') { return this.rect(x0, top, x1, this.h - 1, c); }
  plat(x, y, len, c = '=') { return this.rect(x, y, x + len - 1, y, c); }
  many(ch, pts) { for (const [x, y] of pts) this.set(x, y, ch); return this; }
  rows() { return this.g.map((r) => r.join('')); }
}
const save = (lvl) => { writeFileSync(join(OUT, `${lvl.id}.json`), JSON.stringify(lvl, null, 1)); console.log('wrote', lvl.id, lvl.tiles[0].length + 'x' + lvl.tiles.length); };
const coins = (g, x0, x1, y) => { for (let x = x0; x <= x1; x++) g.set(x, y, 'c'); };

/* ------------------------------------------------------------------ 1. FOREST */
{
  const W = 140, H = 16, g = new Grid(W, H);
  g.ground(0, 26, 12).ground(30, 56, 12);
  g.rect(36, 11, 40, 11, '#').rect(41, 10, 43, 11, '#');
  // wall-jump chimney (cavity x54-56, door on row 11) with a hidden chamber behind the right wall
  g.rect(53, 3, 53, 10, '#').rect(57, 3, 70, 15, '#');
  g.rect(57, 10, 57, 11, 'S').rect(58, 10, 63, 11, '.');
  g.many('g', [[60, 11], [61, 11], [24, 8], [55, 5], [73, 3], [113, 9], [126, 8]]).set(62, 11, 'q');
  g.plat(72, 5, 3).plat(76, 7, 3).plat(80, 9, 3);
  g.ground(84, 99, 12).ground(108, 139, 12);
  g.rect(112, 12, 117, 15, '.').rect(112, 12, 117, 12, 'C');
  g.rect(90, 11, 92, 11, '^');
  g.set(2, 11, 'P').set(5, 11, '1').set(55, 11, '2').set(98, 11, '3').set(103, 9, 'd');
  g.many('K', [[33, 11], [59, 2], [109, 11], [121, 11]]).set(137, 11, 'E');
  g.many('s', [[22, 11], [46, 11], [88, 11], [95, 11], [131, 11], [134, 11]]).many('b', [[96, 6], [65, 1]]).set(126, 11, 'r');
  coins(g, 14, 18, 9); coins(g, 36, 40, 9); coins(g, 72, 74, 4); coins(g, 78, 80, 6); coins(g, 82, 84, 8); coins(g, 101, 106, 10); coins(g, 112, 117, 10); coins(g, 124, 128, 9);
  g.many('h', [[100, 11]]).set(46, 8, 'u');
  save({
    id: 'forest', name: 'Mossroot Wilds', subtitle: 'The Whispering Edge', theme: 'forest', time: [0, 1.1], weather: 'leaves', music: 'forest', par: 110,
    intro: 'The Lumen Heart has shattered. Follow the glow.', tiles: g.rows(),
    npcs: {
      1: { name: 'Elder Moss', lines: ['Wanderer! The Lumen Heart has shattered, and the world is slipping out of balance.', 'Four shards sleep beyond these woods. Recover them before the Hush swallows everything.', 'Run with A/D, jump with Space. Press toward a wall while falling to slide, then jump to leap off it. Jump again in mid-air!'], quest: { id: 'moss', kind: 'crystals', need: 3, offer: ['Crystals still hum with the Heart\'s light. Bring me three, and I will bless your heartwood.'], waiting: ['Three crystals, wanderer. Look high... and look strange.'], done: ['Wonderful! The light remembers you. Your heart grows stronger.'], reward: { hearts: 1 } } },
      2: { name: 'Wall Rune', style: 'tablet', lines: ['Slide down a wall by pressing toward it. Jump to leap away.', 'Some walls remember being doors...'] },
      3: { name: 'Dash Rune', style: 'tablet', lines: ['Press Shift / X (B on pad) to dash in 8 directions.', 'Green gems refill your dash in mid-air. While dashing you cannot be hurt - and thorns cannot bite.', 'Attack with J / C. Hold DOWN in the air to strike downward and bounce off foes. Fire bolts with K / V.'] },
    },
  });
}

/* ------------------------------------------------------------------ 2. RUINS */
{
  const W = 150, H = 16, g = new Grid(W, H);
  g.ground(0, 31, 12);
  // spike pit with oneway stepping stones
  g.ground(32, 49, 12).rect(34, 11, 44, 11, '^').rect(34, 12, 44, 12, '#');
  g.plat(33, 9, 2).plat(37, 8, 2).plat(41, 9, 2).plat(45, 8, 2);
  g.ground(46, 150, 12);
  // dart & falling spike corridor
  g.rect(58, 0, 72, 8, '#').set(56, 11, '>').set(76, 11, '<');
  g.many('v', [[62, 9], [66, 9], [70, 9]]);
  // moving platform gap
  g.rect(80, 12, 96, 15, '.').set(84, 9, 'M').set(92, 8, 'N');
  // secret mound with portal to the Trial of Echoes
  g.rect(98, 9, 106, 11, '#').rect(99, 10, 105, 11, '.').rect(98, 10, 98, 11, 'S');
  g.set(102, 11, 'O').set(104, 10, 'q').many('g', [[100, 10], [101, 10]]);
  // boss gate tunnel + arena
  g.rect(118, 0, 125, 8, '#');
  g.plat(131, 8, 4).plat(141, 8, 4);
  g.set(126, 11, '!').set(141, 11, 'B').set(147, 11, 'E');
  g.set(2, 11, 'P').set(5, 11, '1').set(30, 11, '2').set(112, 11, '3');
  g.many('K', [[8, 11], [77, 11], [114, 11]]);
  g.many('k', [[24, 11], [108, 11]]).many('r', [[16, 11], [52, 11], [74, 11], [110, 11]]).many('b', [[101 - 2, 5], [106, 5], [88, 4]]).many('s', [[20, 11], [48, 11]]);
  g.many('g', [[19, 7], [36, 6], [43, 6], [64, 10], [86, 6], [95, 9], [120, 10]]);
  coins(g, 12, 14, 8); coins(g, 34, 36, 7); coins(g, 41, 44, 7); coins(g, 60, 70, 10); coins(g, 82, 86, 7); coins(g, 90, 95, 6);
  g.many('h', [[78, 11], [96, 11]]).many('u', [[121, 11]]);
  g.many('d', [[88, 7]]);
  save({
    id: 'ruins', name: 'Sunken Ruins', subtitle: 'Where the Old Gates Weep', theme: 'ruins', time: [0.8, 1.6], weather: 'rain', music: 'ruins', par: 150, boss: 'warden',
    intro: 'Rain has worn the old stones thin. Something sleeps beneath.', tiles: g.rows(),
    npcs: {
      1: { name: 'Keeper Pell', lines: ['These ruins once guarded the Heart\'s first shard. Now the stones themselves have turned on us.', 'Knights in shell-armour raise their shields when you face them. Strike from behind, bounce on their heads, or bait their charge into a wall.'], quest: { id: 'pell', kind: 'kills', need: 5, offer: ['Clear five of those husks from the ruins, and I\'ll share what the Keeper saved.'], waiting: ['The ruins are still crawling, friend. Five husks.'], done: ['The path is quieter. Take these crystals - they were the Keeper\'s.'], reward: { crystals: 5 } } },
      2: { name: 'Thorn Tablet', style: 'tablet', lines: ['"Spikes cut the careless. Dash through them, or bounce upon them."', 'Hold DOWN and strike while falling to pogo off thorns and enemies.'] },
      3: { name: 'Lost Spirit', style: 'spirit', lines: ['Beyond this gate sleeps the Stone Warden...', 'He slams, he rains rubble, he charges. When he crashes into stone, he is dazed. Strike then.', 'Rest at the lantern before you go. Good luck, wanderer.'] },
    },
    portals: { O: 'trial1' },
  });
}

/* ------------------------------------------------------------------ 3. CAVES */
{
  const W = 150, H = 16, g = new Grid(W, H);
  g.rect(0, 0, W - 1, 1, '#');
  g.ground(0, 28, 12);
  g.rect(29, 13, 59, 15, '~');
  for (const x of [31, 36, 41, 46]) g.rect(x, 12, x + 1, 12, 'C');
  g.set(53, 10, 'M');
  g.ground(60, 71, 12);
  g.plat(64, 10, 3).plat(68, 8, 3);
  g.rect(72, 6, 85, 15, '#').rect(73, 10, 79, 11, '.').rect(72, 10, 72, 11, 'S');
  g.ground(86, 88, 12);
  g.rect(89, 13, 110, 15, '~');
  g.rect(92, 9, 93, 12, '#').rect(98, 7, 99, 12, '#').rect(104, 8, 105, 12, '#');
  g.ground(111, 149, 12);
  g.rect(138, 12, 141, 15, '.').rect(138, 12, 141, 12, 'C');
  g.rect(128, 5, 136, 6, '#');
  g.set(2, 11, 'P').set(5, 11, '1').set(60, 11, '2').set(146, 11, 'E');
  g.many('K', [[74, 5], [113, 11], [90 - 1, 11 - 0]].slice(0, 2));
  g.many('K', [[87, 11]]);
  g.many('w', [[16, 9], [118, 9], [124, 9], [66, 6]]).many('s', [[22, 11], [62, 11], [130, 11]]).many('b', [[40, 5], [52, 5], [96, 4]]);
  g.many('r', [[80, 5], [120, 11]]).many('k', [[117, 11], [133, 11]]);
  g.many('v', [[95, 2], [101, 2], [20, 2]]);
  g.many('d', [[44, 9], [95, 7], [108, 9]]);
  g.many('g', [[12, 8], [18, 8], [25, 9], [33, 9], [38, 9], [77, 4], [83, 4], [75, 11], [76, 11], [77, 11], [129, 4], [135, 4], [127, 9]]);
  g.set(78, 11, 'q').set(131, 4, 'O');
  g.set(125, 11, 'j');
  coins(g, 8, 10, 8); coins(g, 60, 62, 9); coins(g, 74, 84, 5); coins(g, 112, 114, 9); coins(g, 140, 144, 10);
  g.many('h', [[85, 5], [114, 11]]).many('u', [[104 - 3, 6]]);
  save({
    id: 'caves', name: 'Glimmer Caverns', subtitle: 'The Lantern Deep', theme: 'caves', time: [1.7, 2], weather: 'embers', music: 'caves', par: 140,
    intro: 'Light is scarce here. Lava and shy spirits wait below.', tiles: g.rows(),
    npcs: {
      1: { name: 'Lumi', style: 'spirit', lines: ['Shhh. The Glimmer Caverns remember the Heart\'s light, and so do I.', 'Shy wisps only drift towards you when you look away. Face them and they freeze - then you can strike.'], quest: { id: 'lumi', kind: 'crystals', need: 5, offer: ['Gather five crystals for me? Their song keeps the dark away.'], waiting: ['Five crystals... I can still hear the dark, wanderer.'], done: ['Oh, how bright! Take this - a gift of the deep.'], reward: { crystals: 6 } } },
      2: { name: 'Spring Rune', style: 'tablet', lines: ['Springs hurl the bold skyward. Some ledges can only be reached that way.', 'A distant glow hums where the cave ends - a door beyond the dark.'] },
    },
    portals: { O: 'trial2' },
  });
}

/* ------------------------------------------------------------------ 4. SKY */
{
  const W = 170, H = 16, g = new Grid(W, H);
  const island = (x0, x1, top, th = 2) => { g.rect(x0, top, x1, top + th - 1, '#'); g.rect(x0 + 1, top + th, x1 - 1, top + th, '#'); };
  island(0, 14, 11); island(18, 30, 11);
  g.set(36, 9, 'M');
  island(44, 52, 9);
  g.many('d', [[56, 7], [60, 5]]);
  island(64, 76, 4);
  g.set(80, 6, 'N');
  island(86, 100, 12); g.rect(94, 9, 99, 11, '#').rect(95, 10, 98, 11, '.').rect(94, 10, 94, 11, 'S');
  g.plat(103, 11, 2).plat(107, 10, 2).plat(111, 11, 2);
  island(116, 130, 12, 4);
  g.set(117, 11, '>').set(129, 11, '<');
  g.ground(131, 169, 12).rect(138, 0, 145, 8, '#');
  g.plat(150, 9, 4).plat(162, 9, 4);
  g.set(146, 11, '!').set(160, 11, 'B').set(167, 11, 'E');
  g.set(2, 10, 'P').set(6, 10, '1').set(66 + 8, 3, '2').set(134, 11, '3');
  g.many('K', [[20, 10], [66, 3], [88, 11], [133, 11]]);
  g.many('s', [[26, 10], [48, 8]]).many('b', [[47, 5], [112, 6], [70, 0]]).many('r', [[72, 3], [124, 11]]).many('k', [[92, 11], [121, 11]]).many('w', [[104, 8], [96, 7]]);
  g.set(97, 11, 'q').many('g', [[96, 11], [98, 11]]);
  g.many('g', [[8, 8], [24, 8], [50, 7], [68, 2], [74, 2], [92, 9], [108, 8], [122, 9], [135, 10]]);
  coins(g, 4, 8, 9); coins(g, 20, 28, 9); coins(g, 45, 52, 7); coins(g, 65, 75, 2); coins(g, 118, 128, 10);
  g.many('h', [[89, 11], [132, 11]]).many('u', [[130 - 1, 8]]).many('d', [[100, 9], [114, 9]]);
  save({
    id: 'sky', name: 'Aerie of Dawn', subtitle: 'Where the Heart Was Kept', theme: 'sky', time: [1, 1.9], weather: 'wind', music: 'sky', par: 180, boss: 'king',
    intro: 'The last shard lies at the top of the sky.', tiles: g.rows(),
    npcs: {
      1: { name: 'Sky Hermit', lines: ['You made it this far! The air up here is thin, but the view... it tells of the Hush below.', 'Remember: dash resets when you land, and green gems restore it mid-air. Chain them.'], quest: { id: 'hermit', kind: 'coins', need: 25, offer: ['I collect shiny things. Fetch 25 coins and I\'ll trade you something precious.'], waiting: ['Only a few coins so far. The islands are full of them.'], done: ['Splendid! A true gatherer. Take this - for your heart.'], reward: { hearts: 1 } } },
      2: { name: 'Fallen Tablet', style: 'tablet', lines: ['"The Hollow King kept the Heart for ten thousand years. Grief emptied him, and the Heart broke."'] },
      3: { name: 'Last Light', style: 'spirit', lines: ['Beyond this door waits the Hollow King - once the Heart\'s guardian.', 'He vanishes, he casts rings of grief, and in his final phase he calls beams of light from the sky. Dash through them. Free him.'] },
    },
  });
}

/* ------------------------------------------------------------ TRIAL 1: echoes */
{
  const W = 110, H = 16, g = new Grid(W, H);
  g.ground(0, 24, 12);
  g.rect(12, 11, 21, 11, '^').plat(13, 9, 2).plat(17, 9, 2).plat(21, 9, 2);
  for (const x of [27, 30, 33, 36, 39, 42]) g.set(x, 12, 'C');
  g.ground(46, 62, 12);
  g.rect(58, 3, 58, 10, '#').rect(62, 3, 70, 15, '#');
  g.plat(73, 5, 2).plat(77, 7, 2);
  g.rect(80, 13, 95, 15, '~').set(84, 10, 'M').set(91, 10, 'M');
  g.ground(96, 109, 12);
  g.set(2, 11, 'P').set(6, 11, '1').set(47, 11, 'K').set(97, 11, 'K').set(106, 11, 'E');
  g.many('d', [[28, 9], [34, 9], [40, 9], [88, 8]]);
  g.many('g', [[14, 7], [18, 7], [22, 7], [29, 8], [35, 8], [41, 8], [60, 4], [74, 3], [78, 5], [88, 9]]).set(66, 2, 'q');
  coins(g, 64, 68, 2); coins(g, 100, 104, 10);
  g.many('b', [[52, 6], [66, 0]]);
  g.many('v', [[26, 0]].slice(0, 0));
  save({
    id: 'trial1', name: 'Trial of Echoes', subtitle: 'Optional Challenge', theme: 'ruins', time: [2, 2], weather: 'motes', music: 'ruins', par: 90, optional: true, reward: 10,
    intro: 'Precision. Rhythm. Nerve.', tiles: g.rows(),
    npcs: { 1: { name: 'Echo', style: 'spirit', lines: ['A trial of echoes: spikes, crumbling stone and long falls.', 'Reach the far gate and take what the ancients left behind.'] } },
  });
}

/* ------------------------------------------------------------ TRIAL 2: thorns */
{
  const W = 100, H = 16, g = new Grid(W, H);
  g.rect(0, 0, W - 1, 1, '#');
  g.ground(0, 99, 12);
  g.set(2, 11, 'P').set(5, 11, '1').set(56, 11, 'K').set(96, 11, 'E');
  g.many('s', [[14, 11], [18, 11], [42, 11]]).many('k', [[28, 11], [70, 11], [76, 11]]).many('b', [[34, 6], [38, 6], [88, 5], [90, 5]]);
  g.many('r', [[46, 11], [52, 11], [82, 11]]).many('w', [[60, 9], [64, 9], [66, 7]]);
  g.plat(30, 9, 4).plat(48, 9, 3).plat(72, 9, 4);
  g.rect(22, 11, 24, 11, '^').rect(78, 11, 79, 11, '^');
  g.many('h', [[26, 11], [55, 11], [86, 11]]).many('u', [[44, 8], [68, 8]]);
  g.many('g', [[31, 8], [49, 8], [73, 8], [74, 8], [92, 10]]).set(58, 5, 'q');
  g.plat(57, 7, 3);
  coins(g, 8, 12, 9); coins(g, 90, 94, 10);
  save({
    id: 'trial2', name: 'Gauntlet of Thorns', subtitle: 'Optional Challenge', theme: 'caves', time: [2, 2], weather: 'embers', music: 'boss', par: 100, optional: true, reward: 12,
    intro: 'Everything here wants a fight.', tiles: g.rows(),
    npcs: { 1: { name: 'Thorn', style: 'spirit', lines: ['A gauntlet of every foe the ruins remember.', 'Use your blade, your bolts and your dash. There is a lantern halfway.'] } },
  });
}
