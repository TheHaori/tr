/**
 * PlayScene – owns one level at runtime: world, entities, camera, combat
 * resolution, checkpoints/respawn, boss arenas, NPC dialogue and rendering.
 * It is also the "context" object handed to entities (enemy.think(dt, scene)).
 */
import { VIEW_W, VIEW_H, TILE as T } from './config';
import { World, LAVA } from './world';
import { THEMES, buildTileset } from './themes';
import type { Theme, Tileset } from './themes';
import { Background } from './background';
import { Player } from './player';
import { Enemy, createEnemy } from './enemies';
import { Boss, StoneWarden, HollowKing } from './bosses';
import { Projectiles } from './projectiles';
import { Effects } from './fx';
import { clamp, damp, overlap, rand, sign } from './util';
import { Checkpoint, DartTrap, ExitGate, FallingSpike, MovingPlatform, Npc, Pickup, SecretPortal, Spring } from './objects';
import type { Entity, PickupKind } from './objects';
import type { LevelData, Rect, SaveData, Settings } from './types';
import type { Input } from './input';
import type { AudioEngine } from './audio';
import type { Game } from './game';

export interface Dialogue {
  name: string;
  lines: string[];
  i: number;
  shown: number;
  onDone?: () => void;
}

export interface LevelSummary {
  levelId: string;
  ms: number;
  coins: number; coinsTotal: number;
  crystals: number; crystalsTotal: number;
  secrets: number; secretsTotal: number;
  deaths: number;
  noDamage: boolean;
  rank: string;
  newBest: boolean;
}

const PERSIST: Record<string, PickupKind> = { c: 'coin', g: 'crystal', h: 'heart', q: 'relic' };
const TRANSIENT: Record<string, PickupKind> = { u: 'surge', d: 'dashgem' };

export class PlayScene {
  readonly input: Input;
  readonly audio: AudioEngine;
  readonly fx: Effects;
  readonly settings: Settings;
  readonly save: SaveData;

  world: World;
  theme: Theme;
  tileset: Tileset;
  bg: Background;
  player = new Player();
  enemies: Enemy[] = [];
  entities: Entity[] = [];
  platforms: MovingPlatform[] = [];
  projectiles = new Projectiles();
  boss: Boss | null = null;
  arena = { x0: 0, x1: 0 };
  private bossSpawn: { tx: number; ty: number } | null = null;
  private trigX = -1;
  bossState: 'idle' | 'fighting' | 'done' = 'idle';

  // timing / feedback
  time = 0; // animation clock
  levelMs = 0;
  hitstopT = 0;
  frozen = false;
  flashCol = '#fff'; flashA = 0;
  fadeA = 1; fadeDir = -1; private fadeCb: (() => void) | null = null;
  titleT = 3.2;
  noDamage = true;
  state: 'play' | 'complete' = 'play';
  completeT = 0;

  // progress
  collected = new Set<string>();
  checkpoint: { x: number; y: number } | null = null;
  startPos = { x: 0, y: 0 };
  levelCoins = 0; levelCrystals = 0; levelKills = 0; levelDeaths = 0; secretsFound = 0;
  totals = { coins: 0, crystals: 0, secrets: 0 };
  private relicsFound = 0;
  dialogue: Dialogue | null = null;
  prompt: string | null = null;
  private nearNpc: Npc | null = null;
  private nearPortal: SecretPortal | null = null;
  private achTimer = 0;
  private lightTmp: { x: number; y: number; r: number }[] = [];

  // camera
  cam = { x: 0, y: 0 };
  private look = 0;
  private lookY = 0;
  private shakeX = 0; private shakeY = 0;

  constructor(readonly game: Game, readonly level: LevelData, opts: { spawn?: { x: number; y: number } | null; returnTo?: { levelId: string; x: number; y: number } | null } = {}) {
    this.input = game.input;
    this.audio = game.audio;
    this.fx = game.fx;
    this.settings = game.settings;
    this.save = game.save;
    this.returnTo = opts.returnTo ?? null;
    this.theme = THEMES[level.theme];
    this.tileset = buildTileset(this.theme);
    this.world = new World(level.tiles);
    this.bg = new Background(this.theme, level.weather);
    this.bg.onThunder = () => { this.audio.sfx('thunder'); this.fx.addTrauma(0.15); };
    this.world.onCollapse = (tx, ty) => {
      this.audio.sfx('collapse', 0.7);
      this.fx.burst(tx * T + 8, ty * T + 8, 10, { color: [this.theme.base, this.theme.dark, this.theme.light], speed: 50, life: 0.6, gravity: 300, size: 3 });
      this.fx.addTrauma(0.1);
    };
    (this.save.collected[level.id] ?? []).forEach((k) => this.collected.add(k));
    // totals for the summary screen
    for (const sp of this.world.spawns) {
      if (sp.ch === 'c') this.totals.coins++;
      if (sp.ch === 'g') this.totals.crystals++;
      if (sp.ch === 'q') this.totals.secrets++;
    }
    this.levelCoins = [...this.collected].filter((k) => k[0] === 'c').length;
    this.levelCrystals = [...this.collected].filter((k) => k[0] === 'g').length;
    this.relicsFound = [...this.collected].filter((k) => k[0] === 'q').length;
    this.buildEntities();
    this.checkpoint = opts.spawn ?? null;
    const sp = this.checkpoint ?? this.startPos;
    this.player.hp = Math.min(Math.max(1, this.save.hp), 3 + this.upgrade('vitality'));
    this.player.maxHp = 3 + this.upgrade('vitality');
    if (this.player.hp < 1) this.player.hp = this.player.maxHp;
    this.player.spawnAt(sp.x, sp.y);
    this.snapCamera();
    this.audio.playMusic(level.music);
    this.audio.setAmbience(level.weather === 'rain' ? 'rain' : level.weather === 'wind' ? 'wind' : 'none');
    this.fx.clear();
    this.fx.density = this.settings.particles;
    this.fx.shakeAmount = this.settings.shake;
    // optional levels start with a full heart bar
    if (level.optional) this.player.hp = this.player.maxHp;
  }

  readonly returnTo: { levelId: string; x: number; y: number } | null;

  upgrade(id: string) { return this.save.upgrades[id] ?? 0; }
  addStat(k: 'jumps' | 'pogos' | 'dashes' | 'kills') { this.save.stats[k]++; }
  get exitOpen() { return !this.level.boss || this.bossState === 'done'; }

  // ------------------------------------------------------------- level build
  private buildEntities() {
    this.enemies = []; this.entities = []; this.platforms = [];
    this.projectiles.clear();
    this.boss = null; this.bossSpawn = null; this.trigX = -1;
    this.world.collapse.clear();
    this.world.unseal();
    this.bossState = 'idle';
    const npcs = this.level.npcs ?? {};
    for (const sp of this.world.spawns) {
      const { ch, tx, ty } = sp;
      const key = `${ch}:${tx},${ty}`;
      const px = tx * T, py = ty * T;
      if (ch === 'P') { this.startPos = { x: px, y: py }; continue; }
      if (ch === 'K') { const cp = new Checkpoint(tx, ty); this.entities.push(cp); continue; }
      if (ch === 'E') { this.entities.push(new ExitGate(tx, ty)); continue; }
      if (PERSIST[ch]) { if (!this.collected.has(key)) this.entities.push(new Pickup(PERSIST[ch], px + 3, py + 3, key)); continue; }
      if (TRANSIENT[ch]) { this.entities.push(new Pickup(TRANSIENT[ch], px + 3, py + 3)); continue; }
      if (ch === 'j') { this.entities.push(new Spring(tx, ty)); continue; }
      if (ch === 'M' || ch === 'N') { const m = new MovingPlatform(tx, ty, ch === 'N'); this.platforms.push(m); this.entities.push(m); continue; }
      if (ch === '<' || ch === '>') { this.entities.push(new DartTrap(tx, ty, ch)); continue; }
      if (ch === 'v') { this.entities.push(new FallingSpike(tx, ty)); continue; }
      if (npcs[ch]) { this.entities.push(new Npc(tx, ty, ch, npcs[ch])); continue; }
      if (this.level.portals?.[ch]) { this.entities.push(new SecretPortal(tx, ty, this.level.portals[ch])); continue; }
      if (ch === '!') { this.trigX = tx; continue; }
      if (ch === 'B') { this.bossSpawn = { tx, ty }; continue; }
      const e = createEnemy(ch, tx, ty);
      if (e) this.enemies.push(e);
    }
    if (this.bossSpawn && this.level.boss) {
      const { tx, ty } = this.bossSpawn;
      const b = this.level.boss === 'king' ? new HollowKing(tx * T, ty * T) : new StoneWarden(tx * T, ty * T);
      this.boss = b;
      this.enemies.push(b);
      if (this.save.bosses.includes(b.kind)) {
        // already beaten in a previous run: skip the fight on replay of the level
        this.bossState = 'done'; this.boss = null; this.enemies = this.enemies.filter((e) => e !== b);
      }
    }
    // activate checkpoints at or behind the current checkpoint
    if (this.checkpoint) {
      for (const e of this.entities) if (e instanceof Checkpoint && e.x - 2 <= this.checkpoint.x) e.active = true;
    }
    this.arena = { x0: this.trigX >= 0 ? this.trigX * T : 0, x1: this.world.pixelW };
  }

  // -------------------------------------------------------------- game hooks
  hitstop(sec: number) { this.hitstopT = Math.max(this.hitstopT, sec); }
  freezeFor(sec: number) { this.hitstop(sec); }
  shake(a: number) { this.fx.addTrauma(a); }
  flash(color: string, a: number) {
    this.flashCol = color;
    this.flashA = Math.max(this.flashA, this.settings.reduceFlash ? a * 0.3 : a);
  }

  spawnEnemy(kind: string, x: number, y: number) {
    const e = createEnemy(kind === 'wisp' ? 'w' : kind, Math.floor(x / T), Math.floor(y / T));
    if (e) { e.x = x; e.y = y; e.homeX = x; e.homeY = y; this.enemies.push(e); }
  }

  dropLoot(x: number, y: number, coins: number, heartChance = 0.1) {
    for (let i = 0; i < coins; i++) {
      const p = new Pickup('coin', x - 5, y - 5, '', true);
      p.vx = rand(-60, 60); p.vy = rand(-170, -90);
      this.entities.push(p);
    }
    if (Math.random() < heartChance) { const p = new Pickup('heart', x - 5, y - 5, '', true); p.vy = -140; this.entities.push(p); }
    if (Math.random() < 0.35) { const p = new Pickup('energy', x - 5, y - 5, '', true); p.vx = rand(-40, 40); p.vy = -120; this.entities.push(p); }
  }

  onEnemyKilled(e: Enemy) {
    this.save.stats.kills++;
    this.levelKills++;
    const loot: Record<string, number> = { slime: 1, bat: 1, sentinel: 3, knight: 4, wisp: 2 };
    this.dropLoot(e.cx, e.cy, loot[e.kind] ?? 1);
  }

  onBossDefeated(b: Boss) {
    this.bossState = 'done';
    this.world.unseal();
    if (!this.save.bosses.includes(b.kind)) this.save.bosses.push(b.kind);
    this.audio.playMusic(this.level.music);
    this.audio.sfx('gate');
    this.dropLoot(b.cx, b.cy, 12, 1);
    for (let i = 0; i < 5; i++) {
      const p = new Pickup('crystal', b.cx - 5, b.cy - 5, '', true);
      p.vx = rand(-90, 90); p.vy = rand(-200, -120);
      this.entities.push(p);
    }
    if (b.kind === 'king') this.entities.push(new Pickup('artifact', b.cx - 8, b.cy - 16, ''));
    this.game.toast(`${b.title} DEFEATED`, 'The gate opens');
    this.game.persist(this);
  }

  onPickup(p: Pickup) {
    const pl = this.player;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    if (p.key && p.kind !== 'artifact') this.collected.add(p.key);
    switch (p.kind) {
      case 'coin':
        this.save.coins++; this.levelCoins++;
        this.audio.sfx('coin');
        this.fx.burst(cx, cy, 4, { color: ['#ffd23f', '#fff3a8'], speed: 50, life: 0.3, size: 2, glow: true });
        if (this.save.coins % 100 === 0) { pl.heal(pl.maxHp); this.fx.text(cx, cy - 8, '100 COINS! FULL HEAL', '#ffd23f'); this.audio.sfx('heart'); }
        break;
      case 'crystal':
        this.save.crystals++; this.save.stats.crystalsEver++; this.levelCrystals++;
        this.audio.sfx('crystal');
        this.fx.burst(cx, cy, 8, { color: ['#5ae6ff', '#e8ffff'], speed: 70, life: 0.4, size: 2, glow: true });
        this.fx.text(cx, cy - 6, '+1 crystal', '#7af0ff');
        break;
      case 'heart':
        if (pl.hp >= pl.maxHp) { this.save.coins += 5; this.fx.text(cx, cy - 6, '+5 coins', '#ffd23f'); } else { pl.heal(1); this.fx.text(cx, cy - 6, '+1 HP', '#ff6a8a'); }
        this.audio.sfx('heart');
        this.fx.burst(cx, cy, 8, { color: ['#ff4a6a', '#fff'], speed: 50, angle: -Math.PI / 2, arc: 1, life: 0.6, size: 2, glow: true });
        break;
      case 'surge':
        pl.surge = 10; this.audio.sfx('powerup');
        this.fx.text(cx, cy - 8, 'AETHER SURGE!', '#ffd36a');
        this.fx.ring(cx, cy, '#ffd36a'); this.flash('#ffd36a', 0.2);
        break;
      case 'dashgem':
        pl.refill(); this.audio.sfx('powerup', 0.6); this.fx.ring(cx, cy, '#7dffb0');
        break;
      case 'relic':
        this.relicsFound++; this.save.secrets++; this.secretsFound++;
        this.save.crystals += 3; this.save.stats.crystalsEver += 3;
        this.audio.sfx('powerup'); this.flash('#d79bff', 0.25);
        this.fx.text(cx, cy - 8, 'SECRET RELIC +3', '#d79bff');
        this.fx.ring(cx, cy, '#d79bff');
        this.game.toast('Secret Relic found!', '+3 crystals');
        break;
      case 'energy':
        pl.energy = Math.min(100, pl.energy + 30);
        this.audio.sfx('select', 0.5);
        break;
      case 'artifact':
        this.audio.sfx('victory'); this.flash('#ffffff', 0.9);
        this.fx.burst(cx, cy, 50, { color: ['#fff6c0', '#ffd36a', '#fff'], speed: 140, life: 1, size: 3, size2: 0, glow: true });
        this.state = 'complete'; // freeze gameplay; Game takes over for the ending
        this.completeT = 0;
        this.game.finishLevel(this, true);
        break;
    }
    this.achTimer = 0;
  }

  activateCheckpoint(cp: Checkpoint) {
    cp.active = true;
    this.checkpoint = { x: cp.x - 2, y: cp.y + 8 };
    this.player.heal(this.player.maxHp);
    this.player.energy = 100;
    this.audio.sfx('checkpoint');
    this.fx.text(cp.x + 6, cp.y - 6, 'CHECKPOINT', '#ffe9a0');
    this.fx.burst(cp.x + 6, cp.y + 8, 16, { color: ['#ffb84a', '#ffe27a', '#fff'], speed: 70, angle: -Math.PI / 2, arc: 1.2, life: 0.8, size: 2, size2: 0, glow: true });
    this.game.persist(this);
  }

  /** Called by the player on death. */
  onPlayerDied() {
    this.save.stats.deaths++;
    this.levelDeaths++;
    this.noDamage = false;
    this.game.analytics.log('death', { level: this.level.id, x: Math.round(this.player.cx), y: Math.round(this.player.cy) });
  }

  /** Spikes, lava and pits: hurt + teleport to last safe ground. */
  hazardHit(kind: 'spike' | 'lava' | 'pit') {
    const p = this.player;
    if (p.dead) return;
    if (kind === 'spike' && p.dashTimer > 0) return; // dash through spikes
    const hurt = p.damage(1, p.cx, this);
    if (p.dead) return;
    if (!hurt && kind === 'spike') return;
    this.fx.burst(p.cx, p.cy, 10, { color: kind === 'lava' ? ['#ff9a2a', '#ffd25a'] : ['#fff', '#9ff'], speed: 90, life: 0.4, size: 3, glow: true });
    p.x = p.lastSafe.x; p.y = p.lastSafe.y; p.vx = 0; p.vy = 0; p.hurtTimer = 0; p.dashTimer = 0;
    p.invuln = Math.max(p.invuln, 1.0);
    this.audio.sfx('respawn', 0.5);
    this.hitstop(0.1);
  }

  /** Resolve a melee swing; returns whether anything was hit. */
  meleeHit(p: Player, r: Rect, dirX: number, dmg: number): { hit: boolean } {
    let hit = false;
    for (const e of this.enemies) {
      if (e.dead || p.hitSet.has(e) || !overlap(r, e)) continue;
      p.hitSet.add(e);
      const d = dirX !== 0 ? dirX : sign(e.cx - p.cx) || 1;
      e.hurt(dmg, d, this, 'melee');
      hit = true;
    }
    for (const pr of this.projectiles.pool.items) {
      if (pr.active && pr.owner === 'e' && pr.kind !== 'wave' && overlap(r, pr)) {
        pr.owner = 'p'; pr.vx *= -1.4; pr.vy *= -1.4; pr.dmg = 2; pr.color = '#ffe27a';
        this.audio.sfx('clink'); this.fx.ring(pr.x, pr.y, '#ffe27a'); hit = true;
      }
    }
    if (p.attackDir === 'd' && this.world.hazardAt(r) === 'spike') { hit = true; this.audio.sfx('clink'); }
    return { hit };
  }

  // ----------------------------------------------------------------- dialogue
  private openNpc(n: Npc) {
    const def = n.def;
    const key = `${this.level.id}:${n.ch}`;
    let lines = def.lines;
    let onDone: (() => void) | undefined;
    const q = def.quest;
    if (q) {
      const st = this.save.quests[key];
      const have = q.kind === 'crystals' ? this.levelCrystals : q.kind === 'coins' ? this.levelCoins : this.levelKills;
      if (!st) { lines = [...def.lines, ...q.offer]; onDone = () => { this.save.quests[key] = 'active'; this.game.toast('Quest started', q.offer[q.offer.length - 1].slice(0, 60)); }; }
      else if (st === 'active') {
        if (have >= q.need) {
          lines = q.done;
          onDone = () => {
            this.save.quests[key] = 'done';
            if (q.reward.hearts) this.save.upgrades.vitality = (this.save.upgrades.vitality ?? 0) + q.reward.hearts;
            if (q.reward.crystals) { this.save.crystals += q.reward.crystals; this.save.stats.crystalsEver += q.reward.crystals; }
            this.player.maxHp = 3 + this.upgrade('vitality'); this.player.heal(99);
            this.audio.sfx('powerup');
            this.game.toast('Quest complete!', q.reward.hearts ? '+1 max heart' : `+${q.reward.crystals} crystals`);
            this.game.persist(this);
          };
        } else lines = [...q.waiting, `(${Math.min(have, q.need)} / ${q.need})`];
      } else lines = ['Thank you again, wanderer. Walk gently.'];
    }
    this.dialogue = { name: def.name, lines, i: 0, shown: 0, onDone };
    this.titleT = 0;
    this.audio.sfx('confirm', 0.6);
  }

  private updateDialogue(dt: number) {
    const d = this.dialogue!;
    const line = d.lines[d.i];
    const prev = Math.floor(d.shown);
    d.shown = Math.min(line.length, d.shown + dt * 45);
    if (Math.floor(d.shown) !== prev && Math.floor(d.shown) % 2 === 0) this.audio.sfx('talk', 0.5);
    if (this.input.pressed('confirm') || this.input.pressed('jump') || this.input.pressed('interact') || this.input.pressed('attack')) {
      if (d.shown < line.length) d.shown = line.length;
      else if (d.i < d.lines.length - 1) { d.i++; d.shown = 0; this.audio.sfx('select', 0.5); }
      else { const cb = d.onDone; this.dialogue = null; cb?.(); }
    }
  }

  // ------------------------------------------------------------------ control
  startFade(cb: () => void) { this.fadeDir = 1; this.fadeCb = cb; }

  private respawn() {
    this.buildEntities();
    const p = this.player;
    p.maxHp = 3 + this.upgrade('vitality');
    p.hp = p.maxHp; p.energy = 100;
    const sp = this.checkpoint ?? this.startPos;
    p.spawnAt(sp.x, sp.y);
    this.fx.clear();
    this.snapCamera();
    this.audio.sfx('respawn');
    this.audio.playMusic(this.level.music);
    this.noDamage = this.noDamage && false;
  }

  completeLevel() {
    if (this.state !== 'play') return;
    this.state = 'complete';
    this.completeT = 0;
    this.audio.sfx('victory');
    this.audio.playMusic('victory');
    this.flash('#ffffff', 0.6);
    this.fx.burst(this.player.cx, this.player.cy, 40, { color: ['#fff', '#ffd36a', '#9ff'], speed: 130, life: 0.9, size: 3, size2: 0, glow: true });
    this.game.finishLevel(this, false);
  }

  summary(): LevelSummary {
    const par = this.level.par * 1000;
    let pts = 0;
    if (this.levelMs <= par) pts += 2; else if (this.levelMs <= par * 1.5) pts += 1;
    if (this.levelDeaths === 0) pts += 1;
    if (this.noDamage) pts += 1;
    if (this.levelCrystals >= this.totals.crystals) pts += 1;
    const rank = pts >= 5 ? 'S' : pts >= 4 ? 'A' : pts >= 2 ? 'B' : 'C';
    return {
      levelId: this.level.id, ms: this.levelMs,
      coins: this.levelCoins, coinsTotal: this.totals.coins,
      crystals: this.levelCrystals, crystalsTotal: this.totals.crystals,
      secrets: this.relicsFound, secretsTotal: this.totals.secrets,
      deaths: this.levelDeaths, noDamage: this.noDamage, rank, newBest: false,
    };
  }

  // ------------------------------------------------------------------- update
  update(dt: number) {
    this.time += dt;
    this.frozen = false;
    // fades run in real time
    if (this.fadeDir !== 0) {
      this.fadeA = clamp(this.fadeA + this.fadeDir * dt * 3.2, 0, 1);
      if (this.fadeDir > 0 && this.fadeA >= 1) { const cb = this.fadeCb; this.fadeCb = null; this.fadeDir = -1; cb?.(); }
      else if (this.fadeDir < 0 && this.fadeA <= 0) this.fadeDir = 0;
    }
    this.flashA = Math.max(0, this.flashA - dt * 2.5);
    if (this.hitstopT > 0) { this.hitstopT -= dt; this.frozen = true; this.updateShake(); return; }
    this.titleT = Math.max(0, this.titleT - dt);

    if (this.dialogue) {
      this.updateDialogue(dt);
      this.fx.update(dt); this.bg.update(dt, this.cam.x, true);
      this.updateShake();
      return;
    }
    if (this.state === 'complete') {
      this.completeT += dt;
      this.fx.update(dt); this.bg.update(dt, this.cam.x, true);
      this.updateShake();
      return;
    }

    const p = this.player;
    this.world.update(dt, p);
    for (const pl of this.platforms) pl.update(dt);
    p.update(dt, this);
    for (const e of this.entities) e.update(dt, this);
    this.entities = this.entities.filter((e) => !e.removed);
    for (const e of this.enemies) if (!e.dead) e.update(dt, this);
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.projectiles.update(dt, this);
    this.interactions(dt);
    this.updateBoss();
    this.updateCamera(dt);
    this.fx.update(dt);
    this.bg.update(dt, this.cam.x, !this.settings.reduceFlash);
    this.updateShake();
    if (!p.dead) this.levelMs += dt * 1000;
    this.save.stats.playMs += dt * 1000;

    // death → fade → respawn
    if (p.dead && p.deathT > 1.25 && this.fadeDir === 0) this.startFade(() => this.respawn());

    // achievements (cheap, throttled)
    this.achTimer -= dt;
    if (this.achTimer <= 0) { this.achTimer = 1; this.game.checkAchievements(); }
  }

  private interactions(dt: number) {
    const p = this.player;
    if (p.dead) return;
    // enemies
    for (const e of this.enemies) {
      if (e.dead || e.harmless) continue;
      const box = p.dashTimer > 0 ? { x: p.x - 4, y: p.y - 4, w: p.w + 8, h: p.h + 8 } : p;
      if (!overlap(box, e)) continue;
      if (p.dashTimer > 0) {
        if (!p.dashHit.has(e)) {
          p.dashHit.add(e);
          e.hurt(1, sign(p.dashDirX) || p.facing, this, 'dash');
          this.hitstop(0.05); this.shake(0.25);
        }
        continue;
      }
      if (e.stompable && p.vy > 40 && p.y + p.h - e.y < 9 + p.vy * dt) {
        e.hurt(1, 0, this, 'stomp');
        p.bounce(this.input.held('jump') ? -300 : -230);
        this.audio.sfx('pogo'); this.hitstop(0.04); this.shake(0.15);
        continue;
      }
      if (e.contact > 0) p.damage(e.contact, e.cx, this);
    }
    // hazards
    const hz = this.world.hazardAt({ x: p.x + 1, y: p.y + 2, w: p.w - 2, h: p.h - 3 });
    if (hz) this.hazardHit(hz);
    // secrets
    const tx = Math.floor(p.cx / T), ty = Math.floor(p.cy / T);
    if (this.world.revealAt(tx, ty)) {
      this.audio.sfx('powerup', 0.6);
      this.fx.text(p.cx, p.y - 8, 'SECRET AREA', '#d79bff');
      this.game.toast('Hidden passage discovered', '');
    }
    // NPCs / portals
    this.nearNpc = null; this.nearPortal = null; this.prompt = null;
    for (const e of this.entities) {
      if (e instanceof Npc && e.near) this.nearNpc = e;
      if (e instanceof SecretPortal && overlap({ x: p.x - 6, y: p.y - 6, w: p.w + 12, h: p.h + 12 }, e)) this.nearPortal = e;
    }
    if (this.nearNpc) this.prompt = `${this.input.device === 'gamepad' ? 'D-pad ↑' : 'E'}  Talk`;
    else if (this.nearPortal) this.prompt = `${this.input.device === 'gamepad' ? 'D-pad ↑' : 'E'}  Enter portal`;
    this.input.showInteract(!!this.prompt);
    if (this.prompt && this.input.pressed('interact') && p.onGround) {
      if (this.nearNpc) this.openNpc(this.nearNpc);
      else if (this.nearPortal) {
        const portal = this.nearPortal;
        this.audio.sfx('portal');
        this.startFade(() => this.game.switchLevel(portal.target, { returnTo: { levelId: this.level.id, x: portal.x + 2, y: portal.y + 12 } }));
      }
    }
  }

  private updateBoss() {
    const b = this.boss;
    if (!b || this.bossState === 'done') return;
    const p = this.player;
    if (this.bossState === 'idle' && this.trigX >= 0 && p.x > this.trigX * T + 8 && !p.dead) {
      this.bossState = 'fighting';
      this.world.seal(this.trigX - 1);
      this.audio.sfx('gate');
      this.shake(0.6);
      this.audio.playMusic(this.level.boss === 'king' ? 'final' : 'boss');
      b.active = true;
    }
  }

  // ------------------------------------------------------------------- camera
  private camBounds() {
    const fight = this.bossState === 'fighting' || (this.bossState === 'done' && this.boss === null && false);
    const x0 = fight ? this.arena.x0 : 0;
    const x1 = fight || this.bossState === 'fighting' ? this.arena.x1 : this.world.pixelW;
    return { x0, x1 };
  }

  private snapCamera() {
    this.cam.x = this.player.cx; this.cam.y = this.player.cy - 10;
    this.updateCamera(0.5, true);
  }

  private updateCamera(dt: number, snap = false) {
    const p = this.player;
    const inp = this.input;
    this.look += (clamp(p.vx * 0.3, -36, 36) - this.look) * damp(3, dt);
    const wantDown = inp.axisY > 0.6 && p.onGround && Math.abs(p.vx) < 5;
    const wantUp = inp.axisY < -0.6 && p.onGround && Math.abs(p.vx) < 5;
    this.lookY += ((wantDown ? 46 : wantUp ? -34 : 0) - this.lookY) * damp(wantDown || wantUp ? 1.5 : 6, dt);
    const { x0, x1 } = this.camBounds();
    const half = VIEW_W / 2;
    let tx = p.cx + this.look;
    tx = x1 - x0 <= VIEW_W ? (x0 + x1) / 2 : clamp(tx, x0 + half, x1 - half);
    let ty = p.cy - 8 + this.lookY;
    const dz = 16;
    const dy = ty - this.cam.y;
    if (!snap) ty = Math.abs(dy) < dz ? this.cam.y : this.cam.y + (dy - sign(dy) * dz);
    ty = clamp(ty, VIEW_H / 2, Math.max(VIEW_H / 2, this.world.pixelH - VIEW_H / 2));
    const ry = p.vy > 180 ? 10 : p.onGround ? 6 : 3.4;
    this.cam.x += (tx - this.cam.x) * (snap ? 1 : damp(7, dt));
    this.cam.y += (ty - this.cam.y) * (snap ? 1 : damp(ry, dt));
  }

  private updateShake() {
    const t = this.fx.trauma;
    const amp = t * t * 7;
    this.shakeX = amp ? (Math.random() * 2 - 1) * amp : 0;
    this.shakeY = amp ? (Math.random() * 2 - 1) * amp : 0;
  }

  get camX() { return Math.round(this.cam.x - VIEW_W / 2 + this.shakeX); }
  get camY() { return Math.round(this.cam.y - VIEW_H / 2 + this.shakeY); }

  /** 0 = day … 2 = night, driven by player progress through the level. */
  get phase() {
    const [a, b] = this.level.time;
    const prog = clamp(this.player.cx / this.world.pixelW, 0, 1);
    return a + (b - a) * prog;
  }

  // --------------------------------------------------------------------- draw
  draw(ctx: CanvasRenderingContext2D) {
    const cx = this.camX, cy = this.camY;
    const maxCamY = Math.max(0, this.world.pixelH - VIEW_H);
    this.bg.drawBack(ctx, cx, cy, maxCamY, this.phase, this.time);
    this.world.draw(ctx, cx, cy, this.tileset, this.time);
    for (const e of this.entities) {
      if (e.x + e.w < cx - 40 || e.x > cx + VIEW_W + 40 || e.y + e.h < cy - 80 || e.y > cy + VIEW_H + 40) continue;
      e.draw(ctx, cx, cy, this);
    }
    for (const e of this.enemies) e.draw(ctx, cx, cy, this);
    this.projectiles.draw(ctx, cx, cy);
    this.player.draw(ctx, cx, cy, this);
    this.fx.draw(ctx, cx, cy);
    this.bg.drawWeather(ctx, this.time, this.settings.particles);
    this.bg.drawTint(ctx, this.phase);
    this.drawLights(ctx, cx, cy);
    if (this.game.debug.enabled) this.drawDebug(ctx, cx, cy);
    if (this.flashA > 0.01) {
      ctx.globalAlpha = this.flashA;
      ctx.fillStyle = this.flashCol;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
    }
    if (this.fadeA > 0.001) {
      // iris-style fade towards the player
      ctx.globalAlpha = this.fadeA;
      ctx.fillStyle = '#05030c';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
    }
  }

  private drawLights(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    const night = clamp((this.phase - 1.2) / 0.8, 0, 1);
    const dark = this.theme.darkness > 0 ? this.theme.darkness : night * 0.38;
    if (dark <= 0.01) return;
    const L = this.lightTmp;
    L.length = 0;
    const p = this.player;
    L.push({ x: p.cx - cx, y: p.cy - cy, r: this.theme.darkness > 0 ? 62 : 46 });
    for (const e of this.entities) { const l = e.light?.(); if (l) L.push({ x: l.x - cx, y: l.y - cy, r: l.r }); }
    for (const pr of this.projectiles.pool.items) if (pr.active) L.push({ x: pr.x - cx, y: pr.y - cy, r: 22 });
    if (this.boss && this.bossState === 'fighting') L.push({ x: this.boss.cx - cx, y: this.boss.cy - cy, r: 70 });
    // lava glows
    const x0 = Math.max(0, Math.floor(cx / T)), x1 = Math.min(this.world.w - 1, Math.floor((cx + VIEW_W) / T));
    const y0 = Math.max(0, Math.floor(cy / T)), y1 = Math.min(this.world.h - 1, Math.floor((cy + VIEW_H) / T));
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx += 2) {
      if (this.world.get(tx, ty) === LAVA && this.world.get(tx, ty - 1) !== LAVA) L.push({ x: tx * T + 8 - cx, y: ty * T - cy, r: 36 });
    }
    this.bg.drawLighting(ctx, L, dark);
  }

  private drawDebug(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    const box = (r: Rect, c: string) => { ctx.strokeStyle = c; ctx.strokeRect(Math.round(r.x - cx) + 0.5, Math.round(r.y - cy) + 0.5, r.w - 1, r.h - 1); };
    box(this.player, '#0f0');
    for (const e of this.enemies) box(e, '#f00');
    for (const e of this.entities) box(e, '#ff0');
    for (const pr of this.projectiles.pool.items) if (pr.active) box(pr, '#f0f');
    // death heat-map from analytics
    ctx.fillStyle = 'rgba(255,0,0,0.5)';
    for (const d of this.game.analytics.deathsFor(this.level.id)) ctx.fillRect(d.x - cx - 1, d.y - cy - 1, 3, 3);
  }

  /** Data for debug overlay. */
  debugInfo() {
    return {
      level: this.level.id,
      pos: `${this.player.x.toFixed(1)}, ${this.player.y.toFixed(1)}`,
      vel: `${this.player.vx.toFixed(0)}, ${this.player.vy.toFixed(0)}`,
      enemies: this.enemies.length,
      entities: this.entities.length,
      particles: this.fx.particles.activeCount,
      projectiles: this.projectiles.pool.activeCount,
      ground: this.player.onGround, dashes: this.player.dashes, airJumps: this.player.airJumps,
      boss: this.bossState, phase: this.phase.toFixed(2),
    };
  }
}

