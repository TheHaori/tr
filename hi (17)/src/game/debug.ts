/**
 * Basic analytics + debug tooling.
 *  - Analytics: stores death positions / events locally (never sent anywhere)
 *    and renders them as a heat-map when the debug overlay is on (F3).
 *  - Debug overlay: FPS, frame time, pool usage, player state.
 */
import { ANALYTICS_KEY } from './config';

interface AEvent { t: number; type: string; level?: string; x?: number; y?: number }

export class Analytics {
  private events: AEvent[] = [];
  constructor() {
    try {
      const raw = localStorage.getItem(ANALYTICS_KEY);
      if (raw) this.events = JSON.parse(raw);
    } catch { this.events = []; }
  }
  log(type: string, d: { level?: string; x?: number; y?: number } = {}) {
    this.events.push({ t: Date.now(), type, ...d });
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
    try { localStorage.setItem(ANALYTICS_KEY, JSON.stringify(this.events)); } catch { /* ignore */ }
  }
  deathsFor(level: string) { return this.events.filter((e) => e.type === 'death' && e.level === level) as { x: number; y: number }[]; }
  summary(): string {
    const by: Record<string, number> = {};
    for (const e of this.events) if (e.type === 'death' && e.level) by[e.level] = (by[e.level] ?? 0) + 1;
    return Object.entries(by).map(([k, v]) => `${k}:${v}`).join('  ') || 'no deaths logged';
  }
  clear() { this.events = []; try { localStorage.removeItem(ANALYTICS_KEY); } catch { /* ignore */ } }
}

export class DebugTools {
  enabled = false;
  god = false;
  private frames = 0;
  private acc = 0;
  fps = 0;
  frameMs = 0;
  tick(realDt: number) {
    this.frames++;
    this.acc += realDt;
    this.frameMs = this.frameMs * 0.9 + realDt * 1000 * 0.1;
    if (this.acc >= 0.5) { this.fps = Math.round(this.frames / this.acc); this.frames = 0; this.acc = 0; }
  }
}
