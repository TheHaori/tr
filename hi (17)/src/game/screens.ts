/**
 * Menu & overlay screens (stack-based): main menu, pause, settings, level
 * select, skill tree, achievements, controls, level summary, cutscenes.
 */
import { VIEW_W, VIEW_H, VERSION } from './config';
import { Menu, UI } from './ui';
import type { MenuItem } from './ui';
import { UPGRADES } from './save';
import { ACHIEVEMENTS } from './achievements';
import { allLevels, CAMPAIGN, getLevel } from './levels';
import { fmtTime } from './util';
import type { Game } from './game';
import type { LevelSummary } from './play';
import type { Settings } from './types';

export interface Screen {
  update(g: Game): void;
  draw(ui: UI, g: Game): void;
  /** Dim the scene behind (0..1). */
  dim?: number;
}

/** A screen that just hosts a Menu. */
export class MenuScreen implements Screen {
  dim = 0.62;
  constructor(public menu: Menu, public onBack?: () => void, public closeOnPause = false, private extra?: (ui: UI) => void) {}
  update(g: Game) {
    this.menu.update(g);
    if (g.input.pressed('back') || (this.closeOnPause && g.input.pressed('pause'))) {
      g.audio.sfx('back');
      if (this.onBack) this.onBack(); else g.popScreen();
    }
  }
  draw(ui: UI) {
    this.extra?.(ui);
    this.menu.draw(ui);
  }
}

const slider = (label: string, get: () => number, set: (v: number) => void, step = 0.1, min = 0, max = 1): MenuItem => ({
  label: () => {
    const n = Math.round(((get() - min) / (max - min)) * 10);
    return `${label.padEnd(14)} ${'█'.repeat(n)}${'░'.repeat(10 - n)}`;
  },
  adjust: (d) => set(Math.min(max, Math.max(min, Math.round((get() + d * step) * 100) / 100))),
});
const choice = <T,>(label: string, opts: { v: T; n: string }[], get: () => T, set: (v: T) => void): MenuItem => ({
  label: () => `${label.padEnd(14)} ${opts.find((o) => o.v === get())?.n ?? ''}`,
  adjust: (d) => { const i = opts.findIndex((o) => o.v === get()); set(opts[(i + d + opts.length) % opts.length].v); },
});
const toggle = (label: string, get: () => boolean, set: (v: boolean) => void): MenuItem =>
  choice(label, [{ v: false, n: 'OFF' }, { v: true, n: 'ON' }], get, set);

// ---------------------------------------------------------------- main menu
export function mainMenu(g: Game): Screen {
  const items: MenuItem[] = [
    { label: () => 'Continue', action: () => g.continueGame(), disabled: () => !g.hasSave(), hint: () => (g.hasSave() ? 'Resume from your last checkpoint' : 'No saved game yet') },
    { label: () => 'New Game', action: () => (g.hasSave() ? g.pushScreen(confirmNew(g)) : g.newGame()) },
    { label: () => 'Level Select', action: () => g.pushScreen(levelSelect(g)), hint: () => 'Replay unlocked levels & secret trials' },
    { label: () => 'Achievements', action: () => g.pushScreen(new AchievementsScreen()) },
    { label: () => 'Settings', action: () => g.pushScreen(settingsMenu(g)), hint: () => 'Audio, accessibility, assists' },
    { label: () => 'Controls', action: () => g.pushScreen(new ControlsScreen()) },
    { label: () => 'Load Custom Level (.json)', action: () => g.pickCustomLevel(), hint: () => 'Mod support: play your own level file (or drop it on the window)' },
  ];
  const menu = new Menu('', items);
  const s = new MenuScreen(menu, () => { /* no back from root */ }, false, (ui) => {
    const t = performance.now() / 1000;
    ui.text('LUMEN REACH', VIEW_W / 2, 14 + Math.round(Math.sin(t * 1.5)), { size: 28, align: 'center', color: '#ffe9a0' });
    ui.text('R E C O V E R   T H E   L U M E N   H E A R T', VIEW_W / 2, 48, { size: 7, align: 'center', color: '#bfb4ff' });
    ui.text(`v${VERSION}   ${g.input.padConnected ? 'Gamepad connected' : 'Keyboard / Gamepad / Touch'}`, VIEW_W - 6, VIEW_H - 10, { size: 6, align: 'right', color: '#7a72a8', shadow: false });
  });
  s.dim = 0;
  return s;
}

function confirmNew(g: Game): Screen {
  return new MenuScreen(new Menu('Overwrite save?', [
    { label: () => 'Yes, start a new game', action: () => { g.popScreen(); g.newGame(); } },
    { label: () => 'No, go back', action: () => g.popScreen() },
  ], () => 'Your current progress will be lost.'));
}

// ----------------------------------------------------------------- settings
export function settingsMenu(g: Game): Screen {
  const S = g.settings;
  const a = () => g.applySettings();
  const items: MenuItem[] = [
    slider('Music', () => S.music, (v) => { S.music = v; a(); }),
    slider('Sound FX', () => S.sfx, (v) => { S.sfx = v; a(); g.audio.sfx('coin'); }),
    slider('Screen shake', () => S.shake, (v) => { S.shake = v; a(); }, 0.2),
    choice('Particles', [{ v: 0, n: 'OFF' }, { v: 1, n: 'LOW' }, { v: 2, n: 'HIGH' }], () => S.particles, (v) => { S.particles = v; a(); }),
    toggle('Reduce flashes', () => S.reduceFlash, (v) => { S.reduceFlash = v; a(); }),
    toggle('High contrast', () => S.highContrast, (v) => { S.highContrast = v; a(); }),
    toggle('Assist: no dmg', () => S.assist, (v) => { S.assist = v; a(); }),
    choice('Game speed', [{ v: 1, n: '100%' }, { v: 0.85, n: '85%' }, { v: 0.7, n: '70%' }], () => S.gameSpeed, (v) => { S.gameSpeed = v; a(); }),
    toggle('Speedrun timer', () => S.speedrun, (v) => { S.speedrun = v; a(); }),
    choice<Settings['touch']>('Touch controls', [{ v: 'auto', n: 'AUTO' }, { v: 'on', n: 'ON' }, { v: 'off', n: 'OFF' }], () => S.touch, (v) => { S.touch = v; a(); }),
    { label: () => 'Delete save data', action: () => { g.deleteSave(); }, hint: () => 'Erases progress (settings are kept)' },
    { label: () => 'Back', action: () => g.popScreen() },
  ];
  return new MenuScreen(new Menu('Settings', items, () => 'Accessibility: assists never lock achievements'));
}

// ------------------------------------------------------------------- pause
export function pauseMenu(g: Game): Screen {
  const items: MenuItem[] = [
    { label: () => 'Resume', action: () => g.popScreen() },
    { label: () => 'Upgrades (skill tree)', action: () => g.pushScreen(upgradesMenu(g)), hint: () => 'Spend crystals on permanent upgrades' },
    { label: () => 'Settings', action: () => g.pushScreen(settingsMenu(g)) },
    { label: () => 'Controls', action: () => g.pushScreen(new ControlsScreen()) },
    { label: () => 'Restart from checkpoint', action: () => g.restartLevel() },
    { label: () => 'Save & quit to title', action: () => g.quitToTitle(), hint: () => 'Progress saves automatically at each lantern' },
  ];
  const sc = g.scene;
  return new MenuScreen(new Menu('Paused', items, () => (sc ? `${sc.level.name}   ${fmtTime(sc.levelMs)}   deaths ${sc.levelDeaths}` : '')), undefined, true);
}

// ------------------------------------------------------------ level select
export function levelSelect(g: Game): Screen {
  const ids = allLevels().filter((l) => !l.id.startsWith('custom-') && (g.save.unlocked.includes(l.id) || g.save.completed.includes(l.id))).map((l) => l.id);
  const items: MenuItem[] = ids.map((id) => {
    const l = getLevel(id)!;
    return {
      label: () => `${l.optional ? '★ ' : `${CAMPAIGN.indexOf(id) + 1}. `}${l.name}${g.save.completed.includes(id) ? ' ✓' : ''}`,
      action: () => g.startLevelById(id),
      hint: () => (g.save.best[id] ? `Best: ${fmtTime(g.save.best[id])}   Par: ${fmtTime(l.par * 1000)}` : `Par: ${fmtTime(l.par * 1000)}`),
    };
  });
  items.push({ label: () => 'Back', action: () => g.popScreen() });
  return new MenuScreen(new Menu('Level Select', items));
}

// --------------------------------------------------------------- skill tree
export function upgradesMenu(g: Game): Screen {
  const items: MenuItem[] = UPGRADES.map((u) => {
    const lvl = () => g.save.upgrades[u.id] ?? 0;
    return {
      label: () => `${u.name.padEnd(13)} ${'◆'.repeat(lvl())}${'◇'.repeat(Math.max(0, u.cost.length - lvl()))} ${lvl() >= u.cost.length ? ' MAX' : `${u.cost[lvl()]} ✦`}`,
      action: () => {
        const l = lvl();
        if (l >= u.cost.length) return;
        if (g.save.crystals >= u.cost[l]) {
          g.save.crystals -= u.cost[l];
          g.save.upgrades[u.id] = l + 1;
          g.audio.sfx('powerup');
          g.toast(`${u.name} upgraded`, u.desc[l]);
          g.persist();
          g.checkAchievements();
        } else g.audio.sfx('back');
      },
      hint: () => (lvl() >= u.cost.length ? 'Fully upgraded' : u.desc[lvl()]),
    };
  });
  items.push({ label: () => 'Back', action: () => g.popScreen() });
  return new MenuScreen(new Menu('Upgrades', items, () => `Crystals: ${g.save.crystals} ✦`));
}

// ----------------------------------------------------------------- controls
export class ControlsScreen implements Screen {
  dim = 0.75;
  update(g: Game) { if (g.input.pressed('back') || g.input.pressed('confirm') || g.input.pressed('pause')) { g.audio.sfx('back'); g.popScreen(); } }
  draw(ui: UI) {
    ui.panel(30, 20, VIEW_W - 60, VIEW_H - 40);
    ui.text('CONTROLS', VIEW_W / 2, 28, { size: 14, align: 'center', color: '#ffe9a0' });
    const rows: [string, string, string][] = [
      ['Move', 'A / D  or  ← →', 'Left stick / D-pad'],
      ['Jump / Double jump', 'Space / Z', 'A'],
      ['Wall slide / jump', 'Hold toward wall, jump', 'same'],
      ['Dash (8-way)', 'Shift / X / L', 'B / RB / RT'],
      ['Sword (↑ up, ↓ pogo)', 'J / C', 'X'],
      ['Aether bolt', 'K / V', 'Y / LB'],
      ['Drop through ledge', '↓ + Jump', '↓ + A'],
      ['Talk / Enter portal', 'E / Enter', 'D-pad ↑ / Select'],
      ['Pause', 'Esc / P', 'Start'],
      ['Debug overlay', 'F3 (F4 god, N skip)', ''],
    ];
    ui.text('Action', 42, 48, { size: 7, color: '#bfb4ff' });
    ui.text('Keyboard', 150, 48, { size: 7, color: '#bfb4ff' });
    ui.text('Gamepad', 270, 48, { size: 7, color: '#bfb4ff' });
    rows.forEach((r, i) => {
      const y = 60 + i * 13;
      ui.text(r[0], 42, y, { size: 8 });
      ui.text(r[1], 150, y, { size: 8, color: '#cfc8ee', bold: false });
      ui.text(r[2], 270, y, { size: 8, color: '#cfc8ee', bold: false });
    });
    ui.text('Touch: on-screen buttons appear automatically on mobile.', VIEW_W / 2, VIEW_H - 38, { size: 7, align: 'center', color: '#a9a0d8', bold: false });
  }
}

// ------------------------------------------------------------- achievements
export class AchievementsScreen implements Screen {
  dim = 0.75;
  private top = 0;
  update(g: Game) {
    if (g.input.pressed('down')) this.top = Math.min(ACHIEVEMENTS.length - 7, this.top + 1);
    if (g.input.pressed('up')) this.top = Math.max(0, this.top - 1);
    if (g.input.pressed('back') || g.input.pressed('confirm')) { g.audio.sfx('back'); g.popScreen(); }
  }
  draw(ui: UI, g: Game) {
    ui.panel(30, 14, VIEW_W - 60, VIEW_H - 28);
    ui.text(`ACHIEVEMENTS  ${g.save.achievements.length}/${ACHIEVEMENTS.length}`, VIEW_W / 2, 22, { size: 12, align: 'center', color: '#ffe9a0' });
    ACHIEVEMENTS.slice(this.top, this.top + 7).forEach((a, i) => {
      const y = 46 + i * 21;
      const got = g.save.achievements.includes(a.id);
      ui.ctx.fillStyle = got ? 'rgba(255,233,160,0.15)' : 'rgba(255,255,255,0.04)';
      ui.ctx.fillRect(40, y - 2, VIEW_W - 80, 19);
      ui.text(got ? '★' : '☆', 46, y + 2, { size: 10, color: got ? '#ffe9a0' : '#5a5478' });
      ui.text(a.name, 64, y, { size: 8, color: got ? '#fff' : '#8a84aa' });
      ui.text(a.desc, 64, y + 9, { size: 7, color: got ? '#cfc8ee' : '#6a6488', bold: false });
    });
    ui.text('↑ ↓ scroll   Esc back', VIEW_W / 2, VIEW_H - 24, { size: 6, align: 'center', color: '#a9a0d8' });
  }
}

// ----------------------------------------------------------------- summary
export class SummaryScreen implements Screen {
  dim = 0.5;
  private t = 0;
  constructor(private s: LevelSummary, private title: string, private onContinue: () => void, private cont: string) {}
  update(g: Game) {
    this.t += 1 / 60;
    if (this.t > 0.6 && (g.input.pressed('confirm') || g.input.pressed('jump') || g.pointer.clicked)) {
      if (this.t < 2.2) { this.t = 2.2; return; }
      g.audio.sfx('confirm');
      this.onContinue();
    }
  }
  draw(ui: UI) {
    const s = this.s;
    ui.panel(72, 22, VIEW_W - 144, VIEW_H - 44, { fill: 'rgba(14,10,34,0.94)', border: '#ffe9a0' });
    ui.text('LEVEL CLEAR', VIEW_W / 2, 30, { size: 14, align: 'center', color: '#ffe9a0' });
    ui.text(this.title, VIEW_W / 2, 48, { size: 8, align: 'center', color: '#cfc8ee' });
    const rows: [string, string][] = [
      ['Time', `${fmtTime(s.ms)}${s.newBest ? '  NEW BEST!' : ''}`],
      ['Coins', `${s.coins} / ${s.coinsTotal}`],
      ['Crystals', `${s.crystals} / ${s.crystalsTotal}`],
      ['Secrets', `${s.secrets} / ${s.secretsTotal}`],
      ['Deaths', String(s.deaths)],
      ['No damage', s.noDamage ? 'YES' : 'no'],
    ];
    rows.forEach((r, i) => {
      if (this.t < 0.3 + i * 0.22) return;
      const y = 66 + i * 14;
      ui.text(r[0], 92, y, { size: 9, color: '#bfb4ff' });
      ui.text(r[1], VIEW_W - 92, y, { size: 9, align: 'right' });
    });
    if (this.t > 1.8) {
      const k = Math.min(1, (this.t - 1.8) * 4);
      const col = s.rank === 'S' ? '#ffd36a' : s.rank === 'A' ? '#aef5b0' : s.rank === 'B' ? '#9ac4ff' : '#ddd';
      ui.ctx.save();
      ui.ctx.translate(VIEW_W / 2, 164);
      ui.ctx.scale(1 + (1 - k) * 1.5, 1 + (1 - k) * 1.5);
      ui.text(`RANK ${s.rank}`, 0, -10, { size: 20, align: 'center', color: col, alpha: k });
      ui.ctx.restore();
    }
    if (this.t > 2.2) ui.text(`${this.cont}`, VIEW_W / 2, 186, { size: 8, align: 'center', color: '#ffe9a0', alpha: 0.6 + 0.4 * Math.sin(this.t * 5) });
  }
}

// --------------------------------------------------------------- cutscenes
export interface CutPage { text: string; art: 'whole' | 'shatter' | 'shards' | 'hush' | 'restore' | 'end' }

export class CutsceneScreen implements Screen {
  dim = 0;
  private i = 0;
  private shown = 0;
  private t = 0;
  constructor(private pages: CutPage[], private done: () => void) {}
  update(g: Game) {
    this.t += 1 / 60;
    const len = this.pages[this.i].text.length;
    const prev = Math.floor(this.shown);
    this.shown = Math.min(len, this.shown + 0.7);
    if (Math.floor(this.shown) !== prev && Math.floor(this.shown) % 3 === 0) g.audio.sfx('talk', 0.35);
    const adv = g.input.pressed('confirm') || g.input.pressed('jump') || g.pointer.clicked;
    if (adv) {
      if (this.shown < len) this.shown = len;
      else if (this.i < this.pages.length - 1) { this.i++; this.shown = 0; this.t = 0; g.audio.sfx('select'); }
      else this.done();
    }
    if (g.input.pressed('pause') || g.input.pressed('back')) this.done(); // skip
  }
  draw(ui: UI) {
    const c = ui.ctx;
    const page = this.pages[this.i];
    c.fillStyle = 'rgba(4,2,14,0.55)';
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    const cx = VIEW_W / 2, cy = 82;
    const t = this.t + this.i * 3;
    const glow = (r: number, a: number, col = '255,226,140') => {
      const gr = c.createRadialGradient(cx, cy, 2, cx, cy, r);
      gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = gr; c.fillRect(cx - r, cy - r, r * 2, r * 2);
    };
    switch (page.art) {
      case 'whole':
      case 'restore':
      case 'end': {
        const k = page.art === 'whole' ? 1 : 1.5 + Math.sin(t * 2) * 0.2;
        glow(70 * k, 0.5);
        c.fillStyle = '#fff6c0'; c.beginPath(); c.arc(cx, cy, 15 + Math.sin(t * 3), 0, 6.3); c.fill();
        c.fillStyle = '#ffd36a'; c.beginPath(); c.arc(cx, cy, 10, 0, 6.3); c.fill();
        for (let r = 0; r < 12; r++) { const a = r / 12 * 6.28 + t * 0.4; c.fillStyle = 'rgba(255,240,180,0.5)'; c.fillRect(cx + Math.cos(a) * (28 + (t * 20) % 40) - 1, cy + Math.sin(a) * (28 + (t * 20) % 40) - 1, 2, 2); }
        break;
      }
      case 'shatter':
      case 'shards': {
        const spread = page.art === 'shatter' ? Math.min(60, t * 30) : 60 + t * 3;
        glow(page.art === 'shatter' ? 70 - spread * 0.5 : 28, 0.3, '180,140,255');
        for (let r = 0; r < 9; r++) {
          const a = r / 9 * 6.28 + 0.4;
          c.save(); c.translate(cx + Math.cos(a) * spread, cy + Math.sin(a) * spread * 0.7); c.rotate(a + t * 0.8);
          c.fillStyle = '#ffd36a'; c.fillRect(-4, -3, 8, 6); c.fillStyle = '#fff6c0'; c.fillRect(-4, -3, 8, 2);
          c.restore();
        }
        break;
      }
      case 'hush': {
        glow(80, 0.15, '120,100,200');
        for (let r = 0; r < 18; r++) { c.fillStyle = `rgba(20,10,40,${0.3 + (r % 3) * 0.1})`; c.fillRect(((r * 47 + t * 12) % 420) - 20, 40 + (r * 13) % 90, 30 + (r % 4) * 10, 8); }
        c.fillStyle = '#6a5a9a'; c.beginPath(); c.arc(cx, cy, 10, 0, 6.3); c.fill();
        break;
      }
    }
    // letterbox + text
    c.fillStyle = '#000'; c.fillRect(0, 0, VIEW_W, 20); c.fillRect(0, VIEW_H - 62, VIEW_W, 62);
    const lines = ui.wrap(page.text, 320, 9);
    let left = Math.floor(this.shown);
    lines.forEach((l, i) => {
      ui.text(l.slice(0, Math.max(0, left)), VIEW_W / 2, VIEW_H - 54 + i * 12, { size: 9, align: 'center', color: '#f4f0ff' });
      left -= l.length + 1;
    });
    ui.text('Press any button  ·  Esc to skip', VIEW_W / 2, VIEW_H - 12, { size: 6, align: 'center', color: '#7a72a8', shadow: false });
  }
}

export const INTRO_PAGES: CutPage[] = [
  { art: 'whole', text: 'Long ago, the Lumen Heart held the world in balance: day and night, root and sky, ruin and bloom.' },
  { art: 'shatter', text: 'Then it shattered. Its light scattered across forest, ruin, cavern and cloud - and the Hush began to spread.' },
  { art: 'hush', text: 'Silence crept over the land. Springs stopped singing. Stones began to walk.' },
  { art: 'shards', text: 'You are the last Wayfarer: an ember-thread scarf, a moonlit blade, and one stubborn heart. Recover the Lumen Heart.' },
];

export const ENDING_PAGES: CutPage[] = [
  { art: 'restore', text: 'The Hollow King\'s grief dissolves like mist. The Lumen Heart rises from the dark - whole again.' },
  { art: 'end', text: 'Light floods the land. Forests sing, ruins glow, caverns shimmer, and the sky blushes with dawn.' },
  { art: 'end', text: 'Balance is restored. But the world is wide, and secrets remain. Thank you for playing LUMEN REACH.' },
];
