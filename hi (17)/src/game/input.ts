/**
 * Unified input: keyboard + gamepad + on-screen touch controls all feed the
 * same set of logical actions. Gameplay code never looks at raw devices.
 */
export type Action =
  | 'left' | 'right' | 'up' | 'down'
  | 'jump' | 'dash' | 'attack' | 'shoot'
  | 'interact' | 'pause' | 'confirm' | 'back';

const ACTIONS: Action[] = [
  'left', 'right', 'up', 'down', 'jump', 'dash', 'attack', 'shoot', 'interact', 'pause', 'confirm', 'back',
];

const KEYMAP: Record<string, Action[]> = {
  ArrowLeft: ['left'], KeyA: ['left'],
  ArrowRight: ['right'], KeyD: ['right'],
  ArrowUp: ['up'], KeyW: ['up'],
  ArrowDown: ['down'], KeyS: ['down'],
  Space: ['jump', 'confirm'], KeyZ: ['jump', 'confirm'],
  ShiftLeft: ['dash'], ShiftRight: ['dash'], KeyX: ['dash', 'back'], KeyL: ['dash'],
  KeyJ: ['attack'], KeyC: ['attack'],
  KeyK: ['shoot'], KeyV: ['shoot'],
  KeyE: ['interact', 'confirm'], Enter: ['interact', 'confirm'],
  Escape: ['pause', 'back'], KeyP: ['pause'], Backspace: ['back'],
};

/** Standard-mapping gamepad buttons → actions. */
const PADMAP: Record<number, Action[]> = {
  0: ['jump', 'confirm'], 1: ['dash', 'back'], 2: ['attack'], 3: ['shoot'],
  4: ['shoot'], 5: ['dash'], 6: ['shoot'], 7: ['dash'],
  8: ['interact'], 9: ['pause'],
  12: ['up', 'interact'], 13: ['down'], 14: ['left'], 15: ['right'],
};

type ActionState = Record<Action, boolean>;
const blank = (): ActionState => Object.fromEntries(ACTIONS.map((a) => [a, false])) as ActionState;

export class Input {
  private keys = blank();
  private tapped = blank(); // presses shorter than one frame
  private pad = blank();
  private touch = blank();
  private cur = blank();
  private prev = blank();
  private latch = blank(); // edge presses persist until a real sim step consumes them
  private padAxisX = 0;
  private padAxisY = 0;
  device: 'keyboard' | 'gamepad' | 'touch' = 'keyboard';
  padConnected = false;
  touchRoot: HTMLDivElement | null = null;
  private interactBtn: HTMLElement | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      const acts = KEYMAP[e.code];
      if (!acts) return;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) for (const a of acts) this.tapped[a] = true;
      for (const a of acts) this.keys[a] = true;
      this.device = 'keyboard';
    });
    window.addEventListener('keyup', (e) => {
      const acts = KEYMAP[e.code];
      if (acts) for (const a of acts) this.keys[a] = false;
    });
    window.addEventListener('blur', () => {
      this.keys = blank();
      this.touch = blank();
    });
  }

  /** Poll devices; call once per simulation step. */
  update() {
    this.prev = this.cur;
    this.pollPad();
    const next = blank();
    for (const a of ACTIONS) {
      next[a] = this.keys[a] || this.tapped[a] || this.pad[a] || this.touch[a];
      this.tapped[a] = false;
    }
    this.cur = next;
    for (const a of ACTIONS) if (next[a] && !this.prev[a]) this.latch[a] = true;
  }

  private pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let p: Gamepad | null = null;
    for (const g of pads) if (g && g.connected) { p = g; break; }
    this.padConnected = !!p;
    const st = blank();
    this.padAxisX = 0;
    this.padAxisY = 0;
    if (p) {
      let any = false;
      p.buttons.forEach((b, i) => {
        if (b.pressed && PADMAP[i]) { for (const a of PADMAP[i]) st[a] = true; any = true; }
      });
      const ax = p.axes[0] ?? 0;
      const ay = p.axes[1] ?? 0;
      if (Math.abs(ax) > 0.25) { this.padAxisX = ax; any = true; }
      if (Math.abs(ay) > 0.25) { this.padAxisY = ay; any = true; }
      if (ax < -0.4) st.left = true;
      if (ax > 0.4) st.right = true;
      if (ay < -0.5) st.up = true;
      if (ay > 0.5) st.down = true;
      if (any) this.device = 'gamepad';
    }
    this.pad = st;
  }

  held(a: Action) { return this.cur[a]; }
  pressed(a: Action) { return this.latch[a]; }
  /** Call after a simulation step that actually consumed input (not during hit-stop). */
  endStep() { this.latch = blank(); }
  released(a: Action) { return !this.cur[a] && this.prev[a]; }
  /** -1..1, analog when a stick is used. */
  get axisX() {
    const d = (this.cur.right ? 1 : 0) - (this.cur.left ? 1 : 0);
    return d !== 0 ? d : Math.abs(this.padAxisX) > 0.25 ? this.padAxisX : 0;
  }
  get axisY() {
    const d = (this.cur.down ? 1 : 0) - (this.cur.up ? 1 : 0);
    return d !== 0 ? d : Math.abs(this.padAxisY) > 0.25 ? this.padAxisY : 0;
  }
  /** Any confirm-ish button pressed this frame. */
  get anyConfirm() { return this.pressed('confirm') || this.pressed('jump') || this.pressed('interact'); }
  /** Inject a one-frame press (e.g. tapping the canvas to advance dialogue). */
  tap(a: Action) { this.tapped[a] = true; }
  setTouchAction(a: Action, v: boolean) {
    this.touch[a] = v;
    if (v) { this.tapped[a] = true; this.device = 'touch'; }
  }
  showInteract(v: boolean) {
    if (this.interactBtn) this.interactBtn.style.opacity = v ? '1' : '0.0';
  }

  /** Build the on-screen controls (only displayed on touch devices / when forced on). */
  attachTouch(root: HTMLElement) {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'position:absolute;inset:0;pointer-events:none;touch-action:none;user-select:none;-webkit-user-select:none;display:none;z-index:5;';
    const mk = (label: string, act: Action, css: string, size = 15) => {
      const b = document.createElement('div');
      b.textContent = label;
      b.style.cssText =
        `position:absolute;${css};width:${size}vmin;height:${size}vmin;border-radius:50%;` +
        'background:rgba(255,255,255,0.14);border:2px solid rgba(255,255,255,0.35);color:#fff;' +
        `font:bold ${size * 0.34}vmin monospace;display:flex;align-items:center;justify-content:center;` +
        'pointer-events:auto;touch-action:none;backdrop-filter:blur(2px);';
      const on = (e: Event) => { e.preventDefault(); this.setTouchAction(act, true); b.style.background = 'rgba(255,255,255,0.35)'; };
      const off = (e: Event) => { e.preventDefault(); this.setTouchAction(act, false); b.style.background = 'rgba(255,255,255,0.14)'; };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('pointerleave', off);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      wrap.appendChild(b);
      return b;
    };
    mk('◀', 'left', 'left:3vmin;bottom:4vmin', 16);
    mk('▶', 'right', 'left:21vmin;bottom:4vmin', 16);
    mk('▲', 'up', 'left:12vmin;bottom:21vmin', 11);
    mk('▼', 'down', 'left:12vmin;bottom:1vmin;opacity:0.0', 1);
    mk('A', 'jump', 'right:4vmin;bottom:5vmin', 18);
    mk('⚡', 'dash', 'right:24vmin;bottom:5vmin', 13);
    mk('⚔', 'attack', 'right:5vmin;bottom:25vmin', 13);
    mk('✦', 'shoot', 'right:20vmin;bottom:21vmin', 13);
    mk('❚❚', 'pause', 'right:3vmin;top:3vmin', 9);
    this.interactBtn = mk('E', 'interact', 'right:36vmin;bottom:12vmin', 11);
    this.interactBtn.style.opacity = '0';
    root.appendChild(wrap);
    this.touchRoot = wrap;
  }
  setTouchVisible(v: boolean) {
    if (this.touchRoot) this.touchRoot.style.display = v ? 'block' : 'none';
  }
}
