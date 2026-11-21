/**
 * Game – top-level controller: fixed-timestep loop, scene/screen stack,
 * progression & saving, achievements, custom level loading and the final
 * render pipeline (pixel buffer → display canvas → crisp UI layer).
 */
import { VIEW_W, VIEW_H, DT } from './config';
import { Input } from './input';
import { AudioEngine } from './audio';
import { Effects } from './fx';
import { Analytics, DebugTools } from './debug';
import { PlayScene } from './play';
import type { LevelSummary } from './play';
import { UI, drawHud, drawToasts, drawDebug } from './ui';
import { CutsceneScreen, INTRO_PAGES, ENDING_PAGES, SummaryScreen, mainMenu, pauseMenu } from './screens';
import type { Screen } from './screens';
import { loadSave, loadSettings, newSave, storeSettings, writeSave, clearSave } from './save';
import { ACHIEVEMENTS } from './achievements';
import { getLevel, nextCampaignLevel, registerCustomLevel } from './levels';
import { Background } from './background';
import { THEMES } from './themes';
import { makeCanvas } from './themes';
import type { LevelData, SaveData, Settings } from './types';

interface StartOpts {
  spawn?: { x: number; y: number } | null;
  returnTo?: { levelId: string; x: number; y: number } | null;
}

export class Game {
  readonly canvas: HTMLCanvasElement;
  private dctx: CanvasRenderingContext2D;
  private buf = makeCanvas(VIEW_W, VIEW_H);
  private bctx = this.buf.getContext('2d')!;
  readonly input = new Input();
  readonly audio = new AudioEngine();
  readonly fx = new Effects();
  readonly analytics = new Analytics();
  readonly debug = new DebugTools();
  readonly ui = new UI();
  settings: Settings = loadSettings();
  save: SaveData = loadSave() ?? newSave();
  scene: PlayScene | null = null;
  screens: Screen[] = [];
  toasts: { title: string; sub: string; t: number }[] = [];
  pointer = { x: 0, y: 0, moved: false, clicked: false };

  private titleBg: Background;
  private titleT = 0;
  private savedExists = loadSave() !== null;
  private pending: { sum: LevelSummary; final: boolean; scene: PlayScene } | null = null;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private S = 1; private ox = 0; private oy = 0; private dpr = 1;
  private fileInput: HTMLInputElement | null = null;
  private cleanup: (() => void)[] = [];
  private coarse = false;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLElement) {
    this.canvas = canvas;
    this.dctx = canvas.getContext('2d')!;
    this.titleBg = new Background(THEMES.forest, 'fireflies');
    this.input.attachTouch(overlay);
    this.coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    this.applySettings();
    this.bindEvents();
    this.resize();
    this.showTitle();
  }

  // ------------------------------------------------------------------ setup
  private on<K extends keyof WindowEventMap>(t: K, f: (e: WindowEventMap[K]) => void) {
    window.addEventListener(t, f as EventListener);
    this.cleanup.push(() => window.removeEventListener(t, f as EventListener));
  }

  private bindEvents() {
    this.on('resize', () => this.resize());
    const unlock = () => { this.audio.init(); };
    this.on('pointerdown', unlock);
    this.on('keydown', unlock);
    this.on('keydown', (e) => {
      if (e.code === 'F3') { e.preventDefault(); this.debug.enabled = !this.debug.enabled; }
      if (e.code === 'F4') { e.preventDefault(); this.debug.god = !this.debug.god; this.toast(`God mode ${this.debug.god ? 'ON' : 'OFF'}`, ''); }
      if (e.code === 'KeyN' && this.debug.enabled && this.scene && this.scene.state === 'play') this.scene.completeLevel();
    });
    const toLogical = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      this.pointer.x = ((e.clientX - r.left) * this.dpr - this.ox) / this.S;
      this.pointer.y = ((e.clientY - r.top) * this.dpr - this.oy) / this.S;
    };
    this.canvas.addEventListener('pointermove', (e) => { toLogical(e); this.pointer.moved = true; });
    this.canvas.addEventListener('pointerdown', (e) => {
      toLogical(e); this.pointer.clicked = true; this.pointer.moved = true;
      if (this.scene?.dialogue && !this.screens.length) this.input.tap('confirm');
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.on('dragover', (e) => e.preventDefault());
    this.on('drop', (e) => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f) void f.text().then((t) => this.loadCustomText(t));
    });
    document.addEventListener('visibilitychange', this.onVis);
    this.cleanup.push(() => document.removeEventListener('visibilitychange', this.onVis));
  }
  private onVis = () => {
    if (document.hidden && this.scene && !this.screens.length && this.scene.state === 'play') this.pushScreen(pauseMenu(this));
  };

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.dpr = dpr;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.S = Math.min(this.canvas.width / VIEW_W, this.canvas.height / VIEW_H);
    this.ox = Math.floor((this.canvas.width - VIEW_W * this.S) / 2);
    this.oy = Math.floor((this.canvas.height - VIEW_H * this.S) / 2);
  }

  applySettings() {
    this.audio.setVolumes(this.settings.music, this.settings.sfx);
    this.fx.density = this.settings.particles;
    this.fx.shakeAmount = this.settings.shake;
    this.ui.hc = this.settings.highContrast;
    storeSettings(this.settings);
  }

  start() {
    this.last = performance.now();
    const loop = (now: number) => {
      const real = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.debug.tick(real);
      this.acc += real * (this.scene && !this.screens.length ? this.settings.gameSpeed : 1);
      let n = 0;
      while (this.acc >= DT && n < 5) { this.step(DT); this.acc -= DT; n++; }
      if (n === 5) this.acc = 0;
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach((f) => f());
    this.audio.stopMusic();
    this.input.touchRoot?.remove();
  }

  // ----------------------------------------------------------------- screens
  pushScreen(s: Screen) { this.screens.push(s); }
  popScreen() { this.screens.pop(); }
  toast(title: string, sub = '') { this.toasts.push({ title, sub, t: 3.4 }); if (this.toasts.length > 3) this.toasts.shift(); }

  showTitle() {
    this.scene = null;
    this.pending = null;
    this.screens = [mainMenu(this)];
    this.audio.playMusic('menu');
    this.audio.setAmbience('none');
    this.input.showInteract(false);
  }

  hasSave() { return this.savedExists; }

  // ------------------------------------------------------------- game flow
  newGame() {
    this.save = newSave();
    writeSave(this.save);
    this.savedExists = true;
    this.screens = [new CutsceneScreen(INTRO_PAGES, () => { this.screens = []; this.startLevelById('forest'); })];
    this.audio.playMusic('menu');
  }

  continueGame() {
    const d = loadSave();
    if (!d) return;
    this.save = d;
    this.startLevelById(d.levelId, { spawn: d.checkpoint });
  }

  deleteSave() {
    clearSave();
    this.save = newSave();
    this.savedExists = false;
    this.toast('Save data deleted', '');
  }

  startLevelById(id: string, opts: StartOpts = {}) {
    const level = getLevel(id);
    if (!level) { this.toast('Level not found', id); return; }
    this.startLevel(level, opts);
  }

  private startLevel(level: LevelData, opts: StartOpts) {
    const custom = level.id.startsWith('custom-');
    if (!this.save.unlocked.includes(level.id) && !custom) this.save.unlocked.push(level.id);
    if (!opts.spawn) this.save.hp = 3 + (this.save.upgrades.vitality ?? 0);
    this.screens = [];
    this.pending = null;
    this.scene = new PlayScene(this, level, opts);
    if (!level.optional && !custom) {
      this.save.levelId = level.id;
      this.save.checkpoint = opts.spawn ?? null;
      writeSave(this.save);
      this.savedExists = true;
    }
    this.analytics.log('level_start', { level: level.id });
  }

  /** Portal travel (called from the play scene after a fade-out). */
  switchLevel(id: string, opts: StartOpts) {
    const level = getLevel(id);
    if (level && !this.save.unlocked.includes(id)) { this.save.unlocked.push(id); this.toast('Secret challenge unlocked', level.name); }
    this.startLevelById(id, { returnTo: opts.returnTo ?? null });
  }

  restartLevel() {
    const s = this.scene;
    if (!s) return;
    this.save.hp = 3 + (this.save.upgrades.vitality ?? 0);
    this.startLevelById(s.level.id, { spawn: s.checkpoint, returnTo: s.returnTo });
  }

  quitToTitle() {
    this.persist();
    this.showTitle();
  }

  /** Write progress to localStorage. */
  persist(scene: PlayScene | null = this.scene) {
    if (scene) {
      const l = scene.level;
      if (!l.id.startsWith('custom-')) {
        this.save.collected[l.id] = [...scene.collected];
        if (!l.optional) {
          this.save.levelId = l.id;
          this.save.checkpoint = scene.checkpoint;
          this.save.hp = scene.player.hp;
        }
      }
    }
    writeSave(this.save);
    this.savedExists = true;
  }

  /** Called by the scene when a level is completed. */
  finishLevel(scene: PlayScene, final: boolean) {
    const sum = scene.summary();
    const l = scene.level;
    const custom = l.id.startsWith('custom-');
    if (!custom) {
      const first = !this.save.completed.includes(l.id);
      if (first) this.save.completed.push(l.id);
      const best = this.save.best[l.id];
      if (!best || sum.ms < best) { this.save.best[l.id] = Math.round(sum.ms); sum.newBest = true; }
      if (sum.noDamage && !this.save.noDamage.includes(l.id)) this.save.noDamage.push(l.id);
      if (!l.optional && sum.ms <= l.par * 1000) this.unlock('speed');
      const next = nextCampaignLevel(l.id);
      if (next && !this.save.unlocked.includes(next)) this.save.unlocked.push(next);
      if (l.optional && first && l.reward) {
        this.save.crystals += l.reward; this.save.stats.crystalsEver += l.reward;
        this.toast('Challenge cleared!', `+${l.reward} crystals`);
      }
      this.save.collected[l.id] = [...scene.collected];
      if (!l.optional) { this.save.levelId = next ?? l.id; this.save.checkpoint = null; this.save.hp = 3 + (this.save.upgrades.vitality ?? 0); }
    }
    this.analytics.log('complete', { level: l.id });
    this.checkAchievements();
    writeSave(this.save);
    this.savedExists = true;
    this.pending = { sum, final: final || l.boss === 'king', scene };
  }

  private afterSummary(p: { sum: LevelSummary; final: boolean; scene: PlayScene }) {
    const l = p.scene.level;
    this.screens = [];
    this.pending = null;
    if (p.final) {
      this.scene = null;
      this.audio.playMusic('victory');
      this.screens = [new CutsceneScreen(ENDING_PAGES, () => { this.showTitle(); this.toast('Thanks for playing!', 'The Lumen Heart is whole again'); })];
      return;
    }
    if (p.scene.returnTo) {
      const r = p.scene.returnTo;
      this.startLevelById(r.levelId, { spawn: { x: r.x, y: r.y } });
      return;
    }
    const next = nextCampaignLevel(l.id);
    if (next) this.startLevelById(next);
    else this.showTitle();
  }

  // -------------------------------------------------------- achievements/UI
  unlock(id: string) {
    if (this.save.achievements.includes(id)) return;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return;
    this.save.achievements.push(id);
    this.audio.sfx('achievement');
    this.toast(`★ ${a.name}`, a.desc);
    this.analytics.log('achievement');
  }
  checkAchievements() {
    for (const a of ACHIEVEMENTS) if (a.check && !this.save.achievements.includes(a.id) && a.check(this.save)) this.unlock(a.id);
  }

  // ---------------------------------------------------------- custom levels
  pickCustomLevel() {
    if (!this.fileInput) {
      const f = document.createElement('input');
      f.type = 'file'; f.accept = '.json,application/json'; f.style.display = 'none';
      f.addEventListener('change', () => { const file = f.files?.[0]; if (file) void file.text().then((t) => this.loadCustomText(t)); f.value = ''; });
      document.body.appendChild(f);
      this.fileInput = f;
      this.cleanup.push(() => f.remove());
    }
    this.fileInput.click();
  }
  loadCustomText(text: string) {
    try {
      const id = registerCustomLevel(JSON.parse(text));
      this.toast('Custom level loaded', getLevel(id)?.name ?? '');
      this.audio.init();
      this.startLevelById(id);
    } catch (err) {
      this.toast('Could not load level', err instanceof Error ? err.message.slice(0, 60) : 'invalid JSON');
    }
  }

  // ------------------------------------------------------------------- step
  private step(dt: number) {
    const inp = this.input;
    inp.update();
    const top = this.screens[this.screens.length - 1];
    if (top) {
      top.update(this);
      inp.endStep();
      if (!this.scene) { this.titleT += dt; this.titleBg.update(dt, this.titleT * 14, true); }
    } else if (this.scene) {
      const s = this.scene;
      if (inp.pressed('pause') && s.state === 'play' && !s.dialogue && !s.player.dead) {
        this.pushScreen(pauseMenu(this));
        this.audio.sfx('select');
        inp.endStep();
      } else {
        s.update(dt);
        if (!s.frozen) inp.endStep();
        const p = this.pending;
        if (p && s.completeT > 1.7 && !this.screens.length) {
          const l = s.level;
          const lastCampaign = !nextCampaignLevel(l.id) && !l.optional;
          const label = p.final ? 'Continue' : p.scene.returnTo ? 'Return to the ruins' : lastCampaign ? 'Back to title' : 'Next level';
          this.pushScreen(new SummaryScreen(p.sum, `${l.name} - ${l.subtitle ?? ''}`, () => this.afterSummary(p), label));
        }
      }
    } else {
      this.showTitle();
    }
    for (const t of this.toasts) t.t -= dt;
    this.toasts = this.toasts.filter((t) => t.t > 0);
    this.pointer.moved = false;
    this.pointer.clicked = false;
    // touch overlay only during play
    const show = (this.settings.touch === 'on' || (this.settings.touch === 'auto' && (this.coarse || inp.device === 'touch'))) && !!this.scene && !this.screens.length;
    inp.setTouchVisible(show);
  }

  // ----------------------------------------------------------------- render
  private drawTitleBackdrop(b: CanvasRenderingContext2D) {
    const camX = this.titleT * 14;
    this.titleBg.drawBack(b, camX, 0, 0, 2, this.titleT);
    // silhouette hills + ground
    b.fillStyle = '#0a0a1e';
    for (let x = 0; x < VIEW_W; x += 2) {
      const y = 186 + Math.sin((x + camX * 0.6) * 0.04) * 4 + Math.sin((x + camX * 0.6) * 0.11) * 2;
      b.fillRect(x, Math.round(y), 2, VIEW_H);
    }
    // glowing shard on the horizon
    const t = this.titleT;
    this.titleBg.drawGlow(b, VIEW_W / 2, 150 + Math.sin(t * 1.3) * 3, 60, 0.35);
    b.fillStyle = '#fff6c0';
    b.fillRect(VIEW_W / 2 - 2, 148 + Math.round(Math.sin(t * 1.3) * 3), 4, 4);
    this.titleBg.drawWeather(b, t, this.settings.particles);
    this.titleBg.drawTint(b, 2);
  }

  private render() {
    const b = this.bctx;
    if (this.scene) this.scene.draw(b); else this.drawTitleBackdrop(b);
    const d = this.dctx;
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.fillStyle = '#000';
    d.fillRect(0, 0, this.canvas.width, this.canvas.height);
    d.imageSmoothingEnabled = false;
    d.drawImage(this.buf, this.ox, this.oy, VIEW_W * this.S, VIEW_H * this.S);
    d.save();
    d.setTransform(this.S, 0, 0, this.S, this.ox, this.oy);
    d.beginPath(); d.rect(0, 0, VIEW_W, VIEW_H); d.clip();
    this.ui.ctx = d;
    if (this.scene) drawHud(this.ui, this, this.scene);
    const top = this.screens[this.screens.length - 1];
    if (top) {
      if (top.dim) { d.fillStyle = `rgba(5,3,14,${top.dim})`; d.fillRect(0, 0, VIEW_W, VIEW_H); }
      top.draw(this.ui, this);
    }
    drawToasts(this.ui, this);
    if (this.debug.enabled) drawDebug(this.ui, this);
    d.restore();
  }
}
