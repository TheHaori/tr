/**
 * Player controller: run, variable jump, coyote time, jump buffering,
 * double jump, wall slide / wall jump, 8-way dash, melee (with pogo),
 * ranged aether bolts, health with i-frames, and death.
 *
 * All the "feel" constants live in config.ts (PHYS).
 */
import { PHYS, TILE } from './config';
import { approach, clamp, rand, sign } from './util';
import { R } from './enemies';
import type { Rect } from './types';
import type { PlayScene } from './play';
import type { MovingPlatform } from './objects';

export class Player implements Rect {
  x = 0; y = 0; w = 10; h = 14;
  vx = 0; vy = 0;
  facing = 1;
  onGround = false;
  sliding = false;
  coyote = 0; buffer = 0; wallCoyote = 0; lastWall = 0;
  airJumps = 1; dashes = 1; maxDashes = 1;
  dashTimer = 0; dashCool = 0; dashDirX = 1; dashDirY = 0;
  dashHit = new Set<object>();
  attackTimer = 0; attackCool = 0; attackDir: 'f' | 'u' | 'd' = 'f';
  hitSet = new Set<object>();
  shootCool = 0;
  hp = 3; maxHp = 3;
  invuln = 0; hurtTimer = 0;
  dead = false; deathT = 0;
  energy = 100;
  surge = 0;
  lock = 0; dropT = 0;
  sx = 1; sy = 1;
  anim = 0;
  riding: MovingPlatform | null = null;
  lastSafe = { x: 0, y: 0 };
  private safeT = 0;
  private dustT = 0;
  scarf: { x: number; y: number }[] = [];
  private trailT = 0;

  constructor() {
    for (let i = 0; i < 7; i++) this.scarf.push({ x: 0, y: 0 });
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  /** Place the player at a pixel position (feet-centred on a tile). */
  spawnAt(px: number, py: number) {
    this.x = px + (TILE - this.w) / 2;
    this.y = py + TILE - this.h;
    this.vx = this.vy = 0;
    this.dead = false; this.deathT = 0;
    this.dashTimer = 0; this.attackTimer = 0; this.hurtTimer = 0;
    this.invuln = 1.0;
    this.riding = null;
    this.lastSafe = { x: this.x, y: this.y };
    for (const p of this.scarf) { p.x = this.cx; p.y = this.y + 5; }
  }

  refill() {
    this.dashes = this.maxDashes;
    this.airJumps = 1;
  }

  /** Spring / pogo bounce. */
  bounce(vy: number) {
    this.vy = vy;
    this.onGround = false;
    this.riding = null;
    this.coyote = 0;
    this.refill();
    this.sx = 0.75; this.sy = 1.3;
  }

  // ------------------------------------------------------------------ update
  update(dt: number, s: PlayScene) {
    const inp = s.input;
    this.anim += dt;
    this.updateScarf(dt);
    if (this.dead) { this.deathT += dt; return; }

    const w = s.world;
    this.maxHp = 3 + s.upgrade('vitality');
    this.maxDashes = 1 + (s.upgrade('twin') > 0 ? 1 : 0);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.lock = Math.max(0, this.lock - dt);
    this.dropT = Math.max(0, this.dropT - dt);
    this.dashCool = Math.max(0, this.dashCool - dt);
    this.attackCool = Math.max(0, this.attackCool - dt);
    this.shootCool = Math.max(0, this.shootCool - dt);
    this.surge = Math.max(0, this.surge - dt);
    this.energy = Math.min(100, this.energy + (12 + s.upgrade('aether') * 6) * dt);
    this.sx = approach(this.sx, 1, dt * 5);
    this.sy = approach(this.sy, 1, dt * 5);
    this.buffer = Math.max(0, this.buffer - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    this.wallCoyote = Math.max(0, this.wallCoyote - dt);

    const ax = inp.axisX, ay = inp.axisY;
    const mx = this.hurtTimer > 0 ? 0 : Math.abs(ax) > 0.2 ? ax : 0;
    const speedMul = this.surge > 0 ? 1.25 : 1;
    const jumpPressed = inp.pressed('jump');
    const jumpHeld = inp.held('jump');
    if (jumpPressed) this.buffer = PHYS.jumpBuffer;
    const wasGround = this.onGround;
    const prevVy = this.vy;

    // ------------------------------------------------------ wall detection
    const touchL = w.solidRect(this.x - 1, this.y + 3, 1, this.h - 6);
    const touchR = w.solidRect(this.x + this.w, this.y + 3, 1, this.h - 6);
    const wall = touchL ? -1 : touchR ? 1 : 0;
    if (!this.onGround && wall !== 0) {
      this.wallCoyote = 0.11; this.lastWall = wall;
      this.airJumps = 1;
    }
    this.sliding = !this.onGround && wall !== 0 && this.vy >= 0 && sign(mx) === wall && this.dashTimer <= 0 && this.hurtTimer <= 0;
    if (this.onGround) { this.coyote = PHYS.coyote; }

    // --------------------------------------------------------------- dash
    if (this.dashTimer <= 0 && inp.pressed('dash') && this.dashes > 0 && this.dashCool <= 0 && this.hurtTimer <= 0) {
      let dx = Math.abs(ax) > 0.35 ? sign(ax) : 0;
      let dy = Math.abs(ay) > 0.35 ? sign(ay) : 0;
      if (this.onGround && dy > 0) dy = 0;
      if (dx === 0 && dy === 0) dx = this.facing;
      const len = Math.hypot(dx, dy);
      this.dashDirX = dx / len; this.dashDirY = dy / len;
      this.dashTimer = PHYS.dashTime;
      this.dashes--;
      this.dashHit.clear();
      this.dashCool = PHYS.dashCooldown;
      if (dx !== 0) this.facing = dx;
      this.sliding = false;
      s.audio.sfx('dash');
      s.shake(0.12);
      s.addStat('dashes');
      s.fx.burst(this.cx, this.cy, 8, { color: ['#fff', '#9ff'], speed: 60, angle: Math.atan2(-this.dashDirY, -this.dashDirX), arc: 0.6, life: 0.3, size: 3, size2: 0, glow: true });
      this.buffer = 0;
    }

    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      this.vx = this.dashDirX * PHYS.dashSpeed * speedMul;
      this.vy = this.dashDirY * PHYS.dashSpeed * speedMul;
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.025;
        s.fx.emit(this.cx, this.cy, { color: this.dashes > 0 ? '#ff9a9a' : '#7ab4ff', speed: 0, life: 0.28, size: 9, size2: 2, glow: true });
      }
      // wall-kick out of dash: jumping during a dash cancels it (feels snappy)
      if (this.buffer > 0 && (this.coyote > 0 || this.wallCoyote > 0)) this.dashTimer = 0;
      if (this.dashTimer <= 0) {
        this.vx = this.dashDirX * PHYS.runSpeed * 1.15;
        this.vy = this.dashDirY < 0 ? this.dashDirY * 140 : this.dashDirY > 0 ? 110 : 0;
      }
    } else {
      this.regularMove(dt, s, mx, ax, ay, jumpHeld, jumpPressed, speedMul);
    }

    // ------------------------------------------------------- attacks / bolts
    if (this.hurtTimer <= 0) this.combat(dt, s, ay);

    // -------------------------------------------------------- integrate move
    this.integrate(dt, s);

    // landing feedback
    if (this.onGround && !wasGround && prevVy > 110) {
      this.sx = 1.3; this.sy = 0.72;
      s.fx.dust(this.cx - 3, this.y + this.h, -1); s.fx.dust(this.cx + 3, this.y + this.h, 1);
      s.audio.sfx('land', clamp(prevVy / 280, 0.3, 1));
    }
    // refill when grounded (after dash is over)
    if (this.onGround && this.dashTimer <= 0) this.refill();

    // running dust
    this.dustT -= dt;
    if (this.onGround && Math.abs(this.vx) > 60 && this.dustT <= 0) {
      this.dustT = 0.13;
      s.fx.dust(this.cx - this.facing * 4, this.y + this.h, -this.facing);
    }
    if (this.sliding && Math.random() < 0.4) s.fx.emit(this.cx + sign(this.lastWall) * 5, this.cy + 2, { color: '#d8d0c0', speed: 15, angle: -Math.PI / 2, arc: 0.4, life: 0.3, size: 2 });
    if (this.surge > 0 && Math.random() < 0.5) s.fx.emit(this.cx + rand(-4, 4), this.cy + rand(-6, 6), { color: ['#ffe27a', '#ff9a2a'], speed: 20, angle: -Math.PI / 2, arc: 1, life: 0.4, size: 2, size2: 0, glow: true });

    // standing on crumbling floor
    if (this.onGround) {
      const ty = Math.floor((this.y + this.h + 0.5) / TILE);
      for (let tx = Math.floor(this.x / TILE); tx <= Math.floor((this.x + this.w - 0.01) / TILE); tx++) w.stepOn(tx, ty);
    }

    // remember a safe position to return to after hazards
    this.safeT -= dt;
    if (this.onGround && !this.riding && this.safeT <= 0 && this.dashTimer <= 0 && this.hurtTimer <= 0) {
      const ty = Math.floor((this.y + this.h + 0.5) / TILE);
      const tx = Math.floor(this.cx / TILE);
      const under = w.get(tx, ty);
      if ((under === 1) && !w.hazardAt({ x: this.x - 14, y: this.y - 4, w: this.w + 28, h: this.h + 8 })) {
        this.lastSafe = { x: this.x, y: this.y };
        this.safeT = 0.2;
      }
    }
  }

  private regularMove(dt: number, s: PlayScene, mx: number, ax: number, ay: number, jumpHeld: boolean, jumpPressed: boolean, speedMul: number) {
    const w = s.world;
    const maxRun = PHYS.runSpeed * speedMul;
    // horizontal
    if (this.lock <= 0 && this.hurtTimer <= 0) {
      if (mx !== 0) {
        const target = mx * maxRun * (Math.abs(mx) < 1 ? 1 : 1);
        const turning = sign(this.vx) !== 0 && sign(this.vx) !== sign(mx);
        const acc = (this.onGround ? PHYS.groundAccel : PHYS.airAccel) * (turning ? 1.8 : 1);
        if (Math.abs(this.vx) > maxRun && sign(this.vx) === sign(mx)) this.vx = approach(this.vx, target, (this.onGround ? PHYS.groundFriction : PHYS.airFriction) * dt * 0.6);
        else this.vx = approach(this.vx, target, acc * dt);
        this.facing = sign(mx);
      } else {
        this.vx = approach(this.vx, 0, (this.onGround ? PHYS.groundFriction : PHYS.airFriction) * dt);
      }
    } else if (this.hurtTimer <= 0) {
      this.vx = approach(this.vx, mx * maxRun, PHYS.airAccel * 0.4 * dt);
    }

    // gravity
    let g = PHYS.gravity;
    if (this.vy < 0 && !jumpHeld) g *= 2.2; // variable jump height
    else if (Math.abs(this.vy) < 45 && jumpHeld) g *= 0.55; // floaty apex
    this.vy += g * dt;
    const fall = this.sliding ? PHYS.wallSlideSpeed : ay > 0.6 ? PHYS.fastFall : PHYS.maxFall;
    if (this.vy > fall) this.vy = approach(this.vy, fall, 1200 * dt);

    // jumping ------------------------------------------------------------
    const downHeld = ay > 0.6;
    if (this.buffer > 0) {
      if (downHeld && jumpPressed && this.onGround && w.oneWayBelow(this) && !w.solidRect(this.x, this.y + this.h, this.w, 2)) {
        this.dropT = 0.22; this.buffer = 0; this.onGround = false; this.y += 2; // drop through
      } else if (this.coyote > 0) {
        this.vy = -PHYS.jumpV; this.vx += mx * 6;
        this.buffer = 0; this.coyote = 0; this.onGround = false; this.riding = null;
        this.sx = 0.75; this.sy = 1.3;
        s.audio.sfx('jump'); s.addStat('jumps');
        s.fx.dust(this.cx, this.y + this.h, 0);
      } else if (this.wallCoyote > 0 && !this.onGround) {
        this.vx = -this.lastWall * PHYS.wallJumpX;
        this.vy = -PHYS.wallJumpY;
        this.lock = 0.13; this.buffer = 0; this.wallCoyote = 0;
        this.facing = -this.lastWall;
        this.sx = 0.75; this.sy = 1.25;
        s.audio.sfx('walljump'); s.addStat('jumps');
        s.fx.burst(this.cx + this.lastWall * 5, this.cy, 6, { color: '#d8d0c0', speed: 40, angle: this.lastWall > 0 ? Math.PI : 0, arc: 0.7, life: 0.3, size: 2 });
      } else if (this.airJumps > 0 && jumpPressed) {
        this.vy = -PHYS.doubleJumpV;
        this.airJumps--; this.buffer = 0;
        this.sx = 0.8; this.sy = 1.25;
        s.audio.sfx('doublejump'); s.addStat('jumps');
        s.fx.ring(this.cx, this.y + this.h, '#bff');
      }
    }
    void ax;
  }

  private combat(dt: number, s: PlayScene, ay: number) {
    const inp = s.input;
    void dt;
    if (inp.pressed('attack') && this.attackCool <= 0) {
      this.attackDir = ay < -0.5 ? 'u' : ay > 0.5 && !this.onGround ? 'd' : 'f';
      this.attackTimer = 0.14;
      this.attackCool = 0.28;
      this.hitSet.clear();
      s.audio.sfx('slash');
    }
    if (this.attackTimer > 0) {
      this.attackTimer -= dt;
      const reach = 22 + 4 * s.upgrade('blade');
      let r: Rect;
      if (this.attackDir === 'u') r = { x: this.x - 5, y: this.y - reach + 4, w: this.w + 10, h: reach };
      else if (this.attackDir === 'd') r = { x: this.x - 4, y: this.y + this.h - 3, w: this.w + 8, h: reach - 4 };
      else r = { x: this.facing > 0 ? this.x + this.w - 2 : this.x - reach + 2, y: this.y - 3, w: reach, h: this.h + 6 };
      const dmg = 1 + (s.upgrade('blade') >= 2 ? 1 : 0);
      const res = s.meleeHit(this, r, this.attackDir === 'f' ? this.facing : 0, dmg);
      if (res.hit) {
        s.hitstop(0.055);
        s.shake(0.22);
        if (this.attackDir === 'd') {
          this.vy = -265; this.onGround = false; this.refill(); this.attackTimer = 0;
          s.audio.sfx('pogo'); s.addStat('pogos');
          this.sx = 0.8; this.sy = 1.25;
        } else if (this.attackDir === 'f') {
          this.vx -= this.facing * 40;
        }
      }
    }
    // ranged aether bolt
    const cost = this.surge > 0 ? 0 : PHYS.boltCost;
    if (inp.pressed('shoot') && this.shootCool <= 0 && this.energy >= cost) {
      this.energy -= cost;
      this.shootCool = 0.2;
      const up = ay < -0.5 && Math.abs(inp.axisX) < 0.3;
      const dmg = 1 + (s.upgrade('aether') >= 2 ? 1 : 0) + (this.surge > 0 ? 1 : 0);
      const n = this.surge > 0 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const a = (up ? -Math.PI / 2 : this.facing > 0 ? 0 : Math.PI) + (i - (n - 1) / 2) * 0.22;
        s.projectiles.fire({
          x: this.cx + Math.cos(a) * 8, y: this.cy - 1 + Math.sin(a) * 8,
          vx: Math.cos(a) * PHYS.boltSpeed, vy: Math.sin(a) * PHYS.boltSpeed,
          owner: 'p', dmg, color: '#7af0ff', w: 7, h: 7, life: 1.1, pierce: s.upgrade('aether') >= 3,
        });
      }
      s.audio.sfx('bolt');
      this.vx -= this.facing * 15;
    }
  }

  private integrate(dt: number, s: PlayScene) {
    const w = s.world;
    // ride moving platform
    if (this.riding) {
      const r = this.riding;
      w.move(this, r.dx, 0);
      w.move(this, 0, r.dy);
    }
    const prevBottom = this.y + this.h;
    const hx = w.move(this, this.vx * dt, 0);
    const hy = w.move(this, 0, this.vy * dt, this.dropT > 0);
    if (hx.l || hx.r) { if (this.dashTimer <= 0) this.vx = 0; }
    if (hy.u) {
      if (this.vy < 0) {
        // corner correction: slide round tiny ceiling lips
        let fixed = false;
        for (let n = 1; n <= 4 && !fixed; n++) {
          for (const sg of [1, -1]) {
            if (!w.solidRect(this.x + sg * n, this.y - 3, this.w, this.h)) { this.x += sg * n; this.y -= 3; fixed = true; break; }
          }
        }
        if (!fixed) this.vy = 0;
      }
    }
    if (hy.d) this.vy = 0;
    let landed = hy.d;
    let plat: MovingPlatform | null = null;
    if (!landed && this.vy >= 0 && this.dropT <= 0) {
      for (const pl of s.platforms) {
        if (this.x + this.w > pl.x + 1 && this.x < pl.x + pl.w - 1 && prevBottom <= pl.y + 4 && this.y + this.h >= pl.y) {
          this.y = pl.y - this.h; this.vy = 0; landed = true; plat = pl; break;
        }
      }
    }
    this.riding = plat;
    this.onGround = landed;
    if (this.dashTimer > 0 && hy.d && this.dashDirY > 0) this.dashTimer = 0;
    // fell out of the world
    if (this.y > w.pixelH + 40) s.hazardHit('pit');
  }

  private updateScarf(dt: number) {
    const ax = this.cx - this.facing * 2, ay = this.y + 5;
    let px = ax, py = ay;
    for (let i = 0; i < this.scarf.length; i++) {
      const q = this.scarf[i];
      q.x += -this.vx * dt * 0.7 - this.facing * 0.3;
      q.y += 0.35 - this.vy * dt * 0.25 + Math.sin(this.anim * 6 + i) * 0.1;
      const dx = q.x - px, dy = q.y - py;
      const d = Math.hypot(dx, dy) || 1;
      const seg = 2.4;
      q.x = px + (dx / d) * seg; q.y = py + (dy / d) * seg;
      px = q.x; py = q.y;
    }
  }

  // ------------------------------------------------------------------ damage
  damage(dmg: number, srcX: number, s: PlayScene): boolean {
    if (this.dead || this.invuln > 0 || this.dashTimer > 0 || s.settings.assist || s.game.debug.god) return false;
    this.hp -= dmg;
    this.invuln = PHYS.invuln;
    this.hurtTimer = 0.22;
    this.attackTimer = 0;
    const dir = sign(this.cx - srcX) || -this.facing;
    this.vx = dir * 130; this.vy = -190;
    this.onGround = false; this.riding = null;
    s.hitstop(0.09);
    s.shake(0.55);
    s.flash('#ff2a2a', 0.3);
    s.audio.sfx('hurt');
    s.noDamage = false;
    s.fx.burst(this.cx, this.cy, 12, { color: ['#ff5a5a', '#fff', '#ffb0b0'], speed: 100, life: 0.4, size: 3, size2: 0 });
    if (this.hp <= 0) this.die(s);
    return true;
  }

  die(s: PlayScene) {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    this.deathT = 0;
    s.audio.sfx('death');
    s.shake(0.9);
    s.fx.burst(this.cx, this.cy, 40, { color: ['#4fd1c5', '#fff', '#7af0ff', '#ff6b6b'], speed: 150, life: 1.0, size: 3, size2: 0, gravity: 80, glow: true });
    s.fx.ring(this.cx, this.cy, '#fff');
    s.onPlayerDied();
  }

  heal(n: number) { this.hp = Math.min(this.maxHp, this.hp + n); }

  // -------------------------------------------------------------------- draw
  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, s: PlayScene) {
    if (this.dead) {
      // spirit orb rises and fades
      const k = Math.min(1, this.deathT / 0.9);
      ctx.globalAlpha = 1 - k;
      R(ctx, '#bff', this.cx - camX - 2, this.cy - camY - 2 - k * 24, 5, 5);
      ctx.globalAlpha = 1;
      return;
    }
    if (this.invuln > 0 && this.dashTimer <= 0 && Math.floor(this.invuln * 18) % 2 === 0) return;
    const dashing = this.dashTimer > 0;
    const scarfCol = this.dashes > 0 ? '#ff6b6b' : '#6ba8ff';
    // scarf (behind body)
    for (let i = 0; i < this.scarf.length; i++) {
      const q = this.scarf[i];
      const sz = i < 3 ? 3 : 2;
      R(ctx, i % 2 ? scarfCol : (this.dashes > 0 ? '#ff9a8a' : '#9ac4ff'), q.x - camX - 1, q.y - camY - 1, sz, sz);
    }
    ctx.save();
    ctx.translate(Math.round(this.cx - camX), Math.round(this.y + this.h - camY));
    ctx.scale(this.facing * this.sx, this.sy);
    const t = this.anim;
    const air = !this.onGround;
    const run = this.onGround && Math.abs(this.vx) > 12;
    const ph = t * 15;
    const bob = !air && !run ? Math.round(Math.sin(t * 3) * 0.5 + 0.5) : 0;
    const cloak = dashing ? '#ffffff' : this.surge > 0 ? '#ffd36a' : '#3fc2b8';
    const cloakD = dashing ? '#bff' : this.surge > 0 ? '#e0902a' : '#25857f';
    const out = '#14203a';
    // legs
    let l1x = -4, l2x = 1, l1y = 0, l2y = 0;
    if (run) { l1x += Math.round(Math.sin(ph) * 2); l2x -= Math.round(Math.sin(ph) * 2); l1y = Math.max(0, Math.round(Math.sin(ph + 1.6) * 2)); l2y = Math.max(0, Math.round(-Math.sin(ph + 1.6) * 2)); }
    else if (air) { l1x = -4; l2x = this.vy < 0 ? 2 : 1; l1y = 2; l2y = this.vy < 0 ? 1 : 0; }
    if (this.sliding) { l1x = 0; l2x = 2; l1y = 1; l2y = 3; }
    R(ctx, out, l1x - 1, -4 - l1y, 5, 4);
    R(ctx, out, l2x - 1, -4 - l2y, 5, 4);
    R(ctx, '#6a4a3a', l1x, -3 - l1y, 3, 3);
    R(ctx, '#6a4a3a', l2x, -3 - l2y, 3, 3);
    // body
    R(ctx, out, -5, -11 + bob, 10, 8);
    R(ctx, cloak, -4, -10 + bob, 8, 6);
    R(ctx, cloakD, -4, -6 + bob, 8, 2);
    R(ctx, '#ffd36a', -4, -8 + bob, 8, 1);
    // flowing cape back
    const flow = clamp(Math.abs(this.vx) / 30 + (air ? 1 : 0), 0, 3);
    R(ctx, cloakD, -5 - Math.round(flow), -9 + bob, 2 + Math.round(flow), 5);
    // head / hood
    R(ctx, out, -5, -16 + bob, 10, 8);
    R(ctx, cloak, -4, -15 + bob, 8, 6);
    R(ctx, cloakD, -4, -15 + bob, 8, 1);
    R(ctx, out, -2, -17 + bob, 4, 2);
    R(ctx, cloak, -1, -16 + bob, 2, 1);
    // face
    R(ctx, '#171028', 0, -13 + bob, 4, 3);
    R(ctx, dashing ? '#fff' : '#9ff6ff', 1, -12 + bob, 1, 1);
    R(ctx, dashing ? '#fff' : '#9ff6ff', 3, -12 + bob, 1, 1);
    // wall grip hand
    if (this.sliding) R(ctx, cloakD, 3, -12, 3, 2);
    ctx.restore();

    // sword slash arc
    if (this.attackTimer > 0) {
      const k = 1 - this.attackTimer / 0.14;
      const a0 = this.attackDir === 'u' ? -Math.PI / 2 : this.attackDir === 'd' ? Math.PI / 2 : this.facing > 0 ? 0 : Math.PI;
      const rad = 16 + s.upgrade('blade') * 3;
      const dirSign = this.facing > 0 || this.attackDir !== 'f' ? 1 : -1;
      for (let i = 0; i < 9; i++) {
        const u = i / 8;
        const ang = a0 + (u - 0.5 + (k - 0.5) * 0.5) * 2.1 * dirSign;
        const px = this.cx + Math.cos(ang) * rad - camX, py = this.cy + Math.sin(ang) * rad - camY;
        ctx.globalAlpha = Math.max(0, 1 - Math.abs(u - k) * 1.3);
        R(ctx, u > 0.5 ? '#ffffff' : '#9ff6ff', px - 1, py - 1, 3, 3);
      }
      ctx.globalAlpha = 1;
    }
  }
}
