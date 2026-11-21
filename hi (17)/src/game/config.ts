/**
 * Global constants & tuning values.
 * All movement numbers are in logical pixels / second (the game renders to a
 * 384x216 pixel buffer that is up-scaled to the screen).
 */
export const VIEW_W = 384;
export const VIEW_H = 216;
export const TILE = 16;
/** Fixed simulation step (60 Hz) – keeps physics deterministic and "tight". */
export const DT = 1 / 60;

export const PHYS = {
  gravity: 900,
  maxFall: 280,
  fastFall: 340,
  runSpeed: 92,
  groundAccel: 950,
  groundFriction: 1200,
  airAccel: 680,
  airFriction: 380,
  jumpV: 335,
  doubleJumpV: 292,
  wallSlideSpeed: 42,
  wallJumpX: 140,
  wallJumpY: 312,
  dashSpeed: 295,
  dashTime: 0.15,
  dashCooldown: 0.22,
  coyote: 0.1,
  jumpBuffer: 0.13,
  springV: 470,
  invuln: 1.2,
  boltCost: 20,
  boltSpeed: 240,
};

export const VERSION = '1.0.0';
export const SAVE_KEY = 'lumen-reach-save-v1';
export const SETTINGS_KEY = 'lumen-reach-settings-v1';
export const ANALYTICS_KEY = 'lumen-reach-analytics-v1';
