/**
 * Boss encounters.
 *  - StoneWarden : ancient golem. Slam (shockwaves), rock rain, charge (stuns on walls).
 *  - HollowKing  : teleporting, spell-casting final boss with 3 phases.
 */
import { Enemy, R } from './enemies';
import type { HitSource } from './enemies';
import { rand, sign, clamp, pick } from './util';
import type { PlayScene } from './play';

export abstract class Boss extends Enemy {
  active = false;
  dying = 0;
  title: string;
  protected phase = 1;
  constructor(kind: string, title: string, x: number, y: number, w: number, h: number, hp: number) {
    super(kind, x, y, w, h, hp);
    this.title = title;
    this.stompable = false;
    this.contact = 1;
  }
  get dyingNow() { return this.dying > 0; }

  hurt(dmg: number, dir: number, s: PlayScene, src: HitSource): boolean {
    if (this.dead || this.invulnerable || this.dying > 0 || !this.active) return false;
    this.hp -= dmg;
    this.flash = 0.1;
    s.audio.sfx('hit');
    s.fx.burst(this.cx, this.cy, 6, { color: ['#fff', '#ffe27a'], speed: 90, life: 0.3, size: 2 });
    s.fx.text(this.cx + rand(-8, 8), this.y - 6, `-${dmg}`, '#ffe27a');
    void dir; void src;
    if (this.hp <= 0) { this.hp = 0; this.startDying(s); }
    return true;
  }

  protected startDying(s: PlayScene) {
    this.dying = 2.6;
    this.invulnerable = true;
    this.harmless = true;
    s.projectiles.clear();
    s.audio.sfx('bossdie');
    s.freezeFor(0.35);
    s.shake(0.8);
  }

  /** Common death animation tick. Returns true while dying. */
  protected tickDying(dt: number, s: PlayScene): boolean {
    if (this.dying <= 0) return false;
    this.dying -= dt;
    if (Math.random() < 0.5) {
      s.fx.burst(this.x + rand(0, this.w), this.y + rand(0, this.h), 4, { color: ['#fff', '#ffb05a', '#ff6a3a'], speed: 80, life: 0.5, size: 3, size2: 0, gravity: 100 });
      if (Math.random() < 0.2) { s.audio.sfx('enemydie', 0.5); s.shake(0.25); }
    }
    if (this.dying <= 0) {
      this.dead = true;
      s.fx.ring(this.cx, this.cy, '#fff');
      s.fx.burst(this.cx, this.cy, 60, { color: ['#fff', '#ffe27a', '#9ff'], speed: 160, life: 1, size: 3, size2: 0 });
      s.flash('#ffffff', 0.9);
      s.onBossDefeated(this);
    }
    return true;
  }
}

// ------------------------------------------------------------ Stone Warden
type WState = 'sleep' | 'intro' | 'idle' | 'slamPrep' | 'slamAir' | 'rainPrep' | 'chargePrep' | 'charge' | 'stun';

export class StoneWarden extends Boss {
  state: WState = 'sleep';
  timer = 0;
  last: WState = 'idle';
  rocks: { x: number; t: number }[] = [];
  constructor(x: number, y: number) { super('warden', 'THE STONE WARDEN', x - 12, y - 32, 40, 48, 26); this.facing = -1; }

  private go(st: WState, t: number) { this.state = st; this.timer = t; }

  think(dt: number, s: PlayScene) {
    if (this.tickDying(dt, s)) { this.physics(dt, s); return; }
    this.phase = this.hp < this.maxHp * 0.5 ? 2 : 1;
    const p = s.player;
    const spd = this.phase === 2 ? 1.35 : 1;
    this.timer -= dt;
    this.harmless = this.state === 'sleep' || this.state === 'intro';
    this.invulnerable = this.state === 'sleep' || this.state === 'intro';
    // rock rain scheduler
    for (const r of this.rocks) {
      r.t -= dt;
      if (r.t <= 0 && r.x > -9000) {
        s.projectiles.fire({ x: r.x, y: 4, vx: 0, vy: 40, gravity: 520, w: 12, h: 12, kind: 'rock', life: 3 });
        r.x = -9999;
      }
    }
    this.rocks = this.rocks.filter((r) => r.x > -9000);

    switch (this.state) {
      case 'sleep':
        if (this.active) { this.go('intro', 1.8); s.audio.sfx('roar'); s.shake(0.7); }
        break;
      case 'intro':
        if (Math.random() < 0.3) s.fx.dust(this.cx + rand(-20, 20), this.y + this.h);
        if (this.timer <= 0) this.go('idle', 0.6);
        break;
      case 'idle': {
        this.vx = 0;
        this.facing = sign(p.cx - this.cx) || this.facing;
        if (this.timer <= 0) {
          const opts: WState[] = ['slamPrep', 'rainPrep', 'chargePrep'].filter((o) => o !== this.last) as WState[];
          const n = pick(opts);
          this.last = n;
          if (n === 'slamPrep') this.go(n, 0.4 / spd);
          else if (n === 'rainPrep') { this.go(n, 0.9 / spd); s.audio.sfx('roar', 0.7); }
          else { this.go(n, 0.7 / spd); s.audio.sfx('warn'); }
        }
        break;
      }
      case 'slamPrep':
        if (this.timer <= 0) {
          this.vy = -400; this.vx = clamp((p.cx - this.cx) * 1.1, -150, 150); this.onGround = false;
          this.state = 'slamAir'; this.timer = 0.2;
        }
        break;
      case 'slamAir':
        if (this.onGround && this.timer <= 0) {
          s.shake(0.8); s.audio.sfx('slam');
          s.fx.burst(this.cx, this.y + this.h, 20, { color: ['#8a8fa6', '#d8d0c0'], speed: 100, arc: 0.5, angle: -Math.PI / 2, life: 0.6, gravity: 200, size: 3 });
          for (const d of [-1, 1]) {
            s.projectiles.fire({ x: this.cx + d * 24, y: this.y + this.h - 5, vx: d * (this.phase === 2 ? 130 : 105), vy: 0, w: 12, h: 10, kind: 'wave', life: 4 });
          }
          if (this.phase === 2) this.queueRocks(s, 3);
          this.go('idle', 1.0 / spd);
        }
        break;
      case 'rainPrep':
        this.vx = 0;
        if (this.rocks.length === 0 && this.timer > 0.5) this.queueRocks(s, this.phase === 2 ? 8 : 5);
        if (this.timer <= 0) this.go('idle', 1.6 / spd);
        break;
      case 'chargePrep':
        this.facing = sign(p.cx - this.cx) || this.facing;
        this.x += Math.sin(this.t * 90) * 0.5;
        if (this.timer <= 0) { this.go('charge', 2); s.audio.sfx('roar', 0.6); }
        break;
      case 'charge':
        this.vx = this.facing * (this.phase === 2 ? 200 : 160);
        if (this.onGround && Math.random() < 0.6) s.fx.dust(this.cx - this.facing * 18, this.y + this.h, -this.facing);
        break;
      case 'stun':
        this.vx = 0;
        if (this.timer <= 0) this.go('idle', 0.5);
        break;
    }
    const r = this.physics(dt, s);
    if (this.state === 'charge' && (r.wall || this.timer <= 0)) {
      if (r.wall) {
        s.shake(1); s.audio.sfx('slam');
        s.fx.burst(this.cx + this.facing * 20, this.cy, 16, { color: ['#8a8fa6', '#fff'], speed: 100, life: 0.5, gravity: 220, size: 3 });
        this.queueRocks(s, 3);
        this.go('stun', 1.8);
      } else this.go('idle', 0.5);
      this.vx = 0;
    }
    if (this.state === 'stun' && Math.random() < 0.15) s.fx.emit(this.cx + rand(-14, 14), this.y - 2, { color: '#ffe27a', speed: 20, angle: -Math.PI / 2, arc: 0.6, life: 0.6, size: 2 });
  }

  private queueRocks(s: PlayScene, n: number) {
    const a = s.arena;
    for (let i = 0; i < n; i++) {
      const x = clamp(s.player.cx + rand(-110, 110), a.x0 + 16, a.x1 - 16);
      this.rocks.push({ x, t: 0.6 + i * 0.18 });
    }
  }

  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    const x = this.x - cx, y = this.y - cy;
    const f = this.flash > 0;
    const stone = f ? '#fff' : this.state === 'sleep' ? '#4a4f66' : '#7a8098';
    const dark = f ? '#fff' : '#454b62', light = f ? '#fff' : '#a2a9c4', moss = f ? '#fff' : '#5f9a5a';
    const crouch = this.state === 'slamPrep' ? 6 : 0;
    const shake = this.state === 'chargePrep' ? Math.round(Math.sin(this.t * 90)) : 0;
    const ox = x + shake;
    const oy = y + crouch;
    const armUp = this.state === 'rainPrep' ? -14 : this.state === 'slamAir' ? -10 : 0;
    const bodyH = this.h - crouch;
    // legs
    R(ctx, dark, ox + 6, oy + bodyH - 14, 10, 14);
    R(ctx, dark, ox + 24, oy + bodyH - 14, 10, 14);
    // torso
    R(ctx, '#2a2f48', ox + 2, oy + 12, 36, bodyH - 22);
    R(ctx, stone, ox + 3, oy + 13, 34, bodyH - 24);
    R(ctx, light, ox + 3, oy + 13, 34, 3);
    R(ctx, dark, ox + 8, oy + 24, 24, 2);
    R(ctx, moss, ox + 3, oy + 13, 8, 2); R(ctx, moss, ox + 26, oy + 14, 6, 1);
    // arms
    const lx = this.facing > 0 ? 0 : 0;
    R(ctx, stone, ox - 6 + lx, oy + 16 + armUp, 9, 22);
    R(ctx, stone, ox + 37, oy + 16 + armUp, 9, 22);
    R(ctx, dark, ox - 7, oy + 34 + armUp, 11, 8);
    R(ctx, dark, ox + 36, oy + 34 + armUp, 11, 8);
    // head
    R(ctx, '#2a2f48', ox + 9, oy + 1, 22, 15);
    R(ctx, stone, ox + 10, oy + 2, 20, 13);
    R(ctx, light, ox + 10, oy + 2, 20, 2);
    const awake = this.state !== 'sleep';
    const eye = this.state === 'stun' ? '#ffe27a' : this.phase === 2 ? '#ff5a3a' : '#7af0ff';
    if (awake) {
      const ex = this.facing > 0 ? 3 : 0;
      R(ctx, eye, ox + 13 + ex, oy + 7, 4, 3);
      R(ctx, eye, ox + 22 + ex, oy + 7, 4, 3);
      if (this.phase === 2) R(ctx, 'rgba(255,90,58,0.25)', ox + 8, oy + 4, 24, 9);
    } else {
      R(ctx, dark, ox + 13, oy + 8, 5, 1); R(ctx, dark, ox + 22, oy + 8, 5, 1);
    }
    R(ctx, moss, ox + 12, oy, 6, 2);
    // rock rain telegraphs
    for (const r of this.rocks) {
      if (r.x < -9000) continue;
      ctx.fillStyle = 'rgba(255,80,80,0.6)';
      const fy = this.y + this.h - cy;
      ctx.fillRect(Math.round(r.x - cx - 6), Math.round(fy - 2), 12, 2);
    }
  }
  protected deathColors() { return ['#8a8fa6', '#555b70', '#fff']; }
}

// ------------------------------------------------------------- Hollow King
type KState = 'sleep' | 'intro' | 'idle' | 'vanish' | 'appear' | 'ring' | 'sweepPrep' | 'sweep' | 'beams' | 'summon';

export class HollowKing extends Boss {
  state: KState = 'sleep';
  timer = 0;
  alpha = 1;
  next: KState = 'vanish';
  shots = 0;
  ringsLeft = 0;
  beams: { x: number; age: number }[] = [];
  sweepY = 0;
  last = '';
  constructor(x: number, y: number) { super('king', 'THE HOLLOW KING', x + 2, y - 20, 22, 30, 38); this.floats = true; this.facing = -1; }

  private go(st: KState, t: number) { this.state = st; this.timer = t; }

  think(dt: number, s: PlayScene) {
    const a = s.arena;
    const p = s.player;
    if (this.tickDying(dt, s)) { this.x += rand(-0.5, 0.5); this.y += 6 * dt; this.beams = []; return; }
    this.phase = this.hp < this.maxHp * 0.34 ? 3 : this.hp < this.maxHp * 0.67 ? 2 : 1;
    this.timer -= dt;
    this.harmless = this.state === 'sleep' || this.state === 'intro' || this.state === 'vanish' || this.state === 'appear';
    this.invulnerable = this.state === 'sleep' || this.state === 'intro' || this.state === 'vanish';
    // beams
    for (const b of this.beams) {
      b.age += dt;
      if (b.age > 0.9 && b.age < 1.25 && Math.abs(p.cx - b.x) < 10 + p.w / 2) p.damage(1, b.x, s);
      if (Math.abs(b.age - 0.9) < dt) { s.shake(0.4); s.audio.sfx('slam', 0.5); }
    }
    this.beams = this.beams.filter((b) => b.age < 1.3);

    switch (this.state) {
      case 'sleep':
        this.y = this.homeY + Math.sin(this.t * 2) * 1;
        if (this.active) { this.go('intro', 2.2); s.audio.sfx('roar'); s.shake(0.6); }
        break;
      case 'intro':
        this.y -= 8 * dt;
        if (this.timer <= 0) this.go('idle', 0.7);
        break;
      case 'idle': {
        this.facing = sign(p.cx - this.cx) || this.facing;
        this.y += Math.sin(this.t * 3) * 0.3;
        this.x += clamp(p.cx - this.cx, -1, 1) * 18 * dt;
        this.x = clamp(this.x, a.x0 + 20, a.x1 - 20 - this.w);
        if (this.timer <= 0) this.choose(s);
        break;
      }
      case 'vanish':
        this.alpha = Math.max(0, this.timer / 0.35);
        if (this.timer <= 0) {
          // teleport somewhere high in the arena
          this.x = rand(a.x0 + 30, a.x1 - 30 - this.w);
          this.y = this.homeY - rand(30, 60);
          this.go('appear', 0.35);
          s.audio.sfx('teleport');
        }
        break;
      case 'appear':
        this.alpha = 1 - Math.max(0, this.timer / 0.35);
        this.facing = sign(p.cx - this.cx) || this.facing;
        if (this.timer <= 0) {
          this.alpha = 1;
          this.shots = this.phase === 1 ? 3 : 5;
          this.fanShot(s, this.shots);
          if (this.phase === 3) this.ringsLeft = 1; // delayed second volley
          this.go('idle', this.phase === 3 ? 0.9 : 1.2);
        }
        break;
      case 'ring':
        this.x += Math.sin(this.t * 60) * 0.4;
        if (this.timer <= 0) {
          this.ring(s, this.phase === 1 ? 10 : 14, 0);
          if (this.phase >= 2) this.ring(s, 14, Math.PI / 14); 
          this.go('idle', 1.1);
        }
        break;
      case 'sweepPrep':
        this.sweepY = clamp(p.cy - this.h / 2, this.homeY - 30, this.homeY + 4);
        this.y += (this.sweepY - this.y) * 0.2;
        this.facing = this.x < (a.x0 + a.x1) / 2 ? 1 : -1;
        if (this.timer <= 0) { this.go('sweep', 1.6); s.audio.sfx('dash'); }
        break;
      case 'sweep':
        this.x += this.facing * 270 * dt;
        if (Math.random() < 0.7) s.fx.emit(this.cx, this.cy, { color: '#b78cff', speed: 10, life: 0.4, size: 4, size2: 0, glow: true });
        if (this.x < a.x0 + 4 || this.x + this.w > a.x1 - 4 || this.timer <= 0) { this.x = clamp(this.x, a.x0 + 8, a.x1 - 8 - this.w); this.go('idle', 0.9); }
        break;
      case 'beams':
        if (this.timer <= 0) this.go('idle', 1.3);
        break;
      case 'summon':
        if (this.timer <= 0) this.go('idle', 1.0);
        break;
    }
    if (this.ringsLeft > 0 && this.state === 'idle' && this.timer < 0.5) { this.ringsLeft = 0; this.fanShot(s, 5); }
    if (this.state !== 'sweep') this.y = clamp(this.y, 10, this.homeY + 4);
    this.flash = Math.max(0, this.flash);
  }

  private choose(s: PlayScene) {
    const opts = ['vanish', 'ring', 'sweepPrep'];
    if (this.phase >= 2) opts.push('beams');
    if (this.phase === 3) opts.push('summon');
    let n = pick(opts);
    if (n === this.last) n = pick(opts);
    this.last = n;
    switch (n) {
      case 'vanish': this.go('vanish', 0.35); s.audio.sfx('teleport'); break;
      case 'ring': this.go('ring', 0.7); s.audio.sfx('warn'); break;
      case 'sweepPrep': this.go('sweepPrep', 0.75); s.audio.sfx('warn'); break;
      case 'beams': {
        const px = s.player.cx;
        const cols = this.phase === 3 ? 5 : 3;
        for (let i = 0; i < cols; i++) this.beams.push({ x: clamp(px + (i - (cols - 1) / 2) * 44 + rand(-8, 8), s.arena.x0 + 12, s.arena.x1 - 12), age: -i * 0.08 });
        this.go('beams', 1.6); s.audio.sfx('roar', 0.5);
        break;
      }
      case 'summon': {
        const alive = s.enemies.filter((e) => !e.dead && e.kind === 'wisp').length;
        if (alive < 2) { s.spawnEnemy('wisp', this.cx - 30, this.cy); s.spawnEnemy('wisp', this.cx + 30, this.cy); s.audio.sfx('teleport'); }
        this.go('summon', 0.9);
        break;
      }
    }
  }

  private fanShot(s: PlayScene, n: number) {
    const p = s.player;
    const base = Math.atan2(p.cy - this.cy, p.cx - this.cx);
    for (let i = 0; i < n; i++) {
      const ang = base + (i - (n - 1) / 2) * 0.28;
      s.projectiles.fire({ x: this.cx, y: this.cy, vx: Math.cos(ang) * 110, vy: Math.sin(ang) * 110, color: '#c58cff', w: 7, h: 7 });
    }
    s.audio.sfx('dart');
  }

  private ring(s: PlayScene, n: number, off: number) {
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + off;
      s.projectiles.fire({ x: this.cx, y: this.cy, vx: Math.cos(ang) * 75, vy: Math.sin(ang) * 75, color: '#ff7ab8', w: 6, h: 6, life: 5 });
    }
    s.audio.sfx('bolt');
    s.shake(0.2);
  }

  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: PlayScene) {
    // beams first (behind the king)
    for (const b of this.beams) {
      const bx = Math.round(b.x - cx);
      if (b.age < 0) continue;
      if (b.age < 0.9) {
        ctx.fillStyle = `rgba(255,120,200,${0.25 + 0.25 * Math.sin(b.age * 30)})`;
        ctx.fillRect(bx - 1, 0, 2, 216);
      } else {
        ctx.fillStyle = 'rgba(255,200,240,0.9)'; ctx.fillRect(bx - 9, 0, 18, 216);
        ctx.fillStyle = '#fff'; ctx.fillRect(bx - 4, 0, 8, 216);
      }
    }
    const x = this.x - cx, y = this.y - cy;
    const f = this.flash > 0;
    ctx.globalAlpha = this.state === 'sleep' ? 0.9 : this.alpha;
    const robe = f ? '#fff' : this.phase === 3 ? '#5a1f5a' : '#3a2b6e';
    const trim = f ? '#fff' : '#b78cff';
    const bob = Math.round(Math.sin(this.t * 3) * 1.5);
    // robe with ragged hem
    R(ctx, robe, x + 3, y + 10 + bob, 16, 16);
    R(ctx, robe, x + 1, y + 16 + bob, 20, 10);
    for (let i = 0; i < 5; i++) R(ctx, robe, x + 1 + i * 4, y + 26 + bob, 3, 3 + Math.round(Math.sin(this.t * 5 + i) * 1.5 + 1.5));
    R(ctx, trim, x + 10, y + 12 + bob, 2, 14);
    // arms
    const raise = this.state === 'ring' || this.state === 'beams' || this.state === 'summon' ? -8 : 0;
    R(ctx, robe, x - 3, y + 14 + bob + raise, 5, 10);
    R(ctx, robe, x + 20, y + 14 + bob + raise, 5, 10);
    // head + crown
    R(ctx, '#d8d4e8', x + 5, y + 2 + bob, 12, 11);
    R(ctx, '#1a1230', x + 6, y + 5 + bob, 10, 5);
    const eye = this.phase === 3 ? '#ff5a5a' : '#7af0ff';
    R(ctx, eye, x + 7, y + 6 + bob, 3, 2); R(ctx, eye, x + 12, y + 6 + bob, 3, 2);
    for (let i = 0; i < 4; i++) R(ctx, '#ffd36a', x + 5 + i * 3, y - 2 + bob - (i % 2) * 2, 2, 4);
    // glowing orb held (the artifact's shadow)
    R(ctx, trim, x + 9, y + 20 + bob + raise, 4, 4);
    if (this.state === 'ring' || this.state === 'sweepPrep') R(ctx, 'rgba(255,255,255,0.35)', x - 4, y - 4, 30, 38);
    ctx.globalAlpha = 1;
    void s;
  }
  protected deathColors() { return ['#b78cff', '#fff', '#ff7ab8']; }
}
