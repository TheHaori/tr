/**
 * Visual themes: palettes for sky (day / dusk / night), tile styles and the
 * procedural tileset generator. Everything is drawn in code – no image files.
 */
import { seeded, mixColor } from './util';
import type { ThemeId } from './types';
import { TILE } from './config';

export interface Theme {
  id: ThemeId;
  /** [top, bottom] for day, dusk, night */
  sky: [string, string][];
  /** overlay [color, alpha] for day, dusk, night */
  tint: [string, number][];
  base: string; dark: string; light: string; top: string; topLight: string;
  style: 'dirt' | 'brick' | 'rock' | 'marble';
  far: string; mid: string; near: string; fog: string; accent: string;
  /** 0..1 darkness – caves use a light mask. */
  darkness: number;
}

export const THEMES: Record<ThemeId, Theme> = {
  forest: {
    id: 'forest',
    sky: [['#79cfe8', '#d9f6cf'], ['#4a4a9a', '#ff9a6a'], ['#0b1030', '#243a63']],
    tint: [['#000000', 0], ['#ff7a30', 0.13], ['#0a1040', 0.34]],
    base: '#6e4b33', dark: '#4b3224', light: '#8a6340', top: '#4fae45', topLight: '#8ee36a',
    style: 'dirt', far: '#5c9fae', mid: '#3d8a62', near: '#24604a', fog: '#cfeede', accent: '#ffe27a', darkness: 0,
  },
  ruins: {
    id: 'ruins',
    sky: [['#8fa4c8', '#e6dcc8'], ['#5a3f8a', '#f0a07a'], ['#10122e', '#3a3c6e']],
    tint: [['#203050', 0.12], ['#ff7a50', 0.14], ['#0a0e3a', 0.36]],
    base: '#7a7f95', dark: '#545a70', light: '#9fa5bd', top: '#6f9a6a', topLight: '#9cc88a',
    style: 'brick', far: '#7886a8', mid: '#59638a', near: '#3d4568', fog: '#c8c8dc', accent: '#9ff0ff', darkness: 0,
  },
  caves: {
    id: 'caves',
    sky: [['#150d2a', '#2a1b48'], ['#150d2a', '#2a1b48'], ['#0a0618', '#1a1030']],
    tint: [['#2a0a50', 0.1], ['#2a0a50', 0.12], ['#10042a', 0.2]],
    base: '#4b4068', dark: '#2f2746', light: '#6c5f95', top: '#8a7ad0', topLight: '#c0b4ff',
    style: 'rock', far: '#33284f', mid: '#261d3d', near: '#1a1330', fog: '#3a2a60', accent: '#7af0ff', darkness: 0.72,
  },
  sky: {
    id: 'sky',
    sky: [['#55b2ff', '#d8f2ff'], ['#6a4aa8', '#ffb38a'], ['#080d36', '#4a3a8a']],
    tint: [['#000000', 0], ['#ff8040', 0.12], ['#0a1050', 0.3]],
    base: '#d9d3c1', dark: '#a79f8b', light: '#f4efdf', top: '#74d68e', topLight: '#b4f2a0',
    style: 'marble', far: '#9cc6f0', mid: '#7ea8e0', near: '#6a8ccc', fog: '#ffffff', accent: '#ffd36a', darkness: 0,
  },
};

export interface Tileset {
  fill: HTMLCanvasElement[];
  top: HTMLCanvasElement;
  oneway: HTMLCanvasElement;
  cracks: HTMLCanvasElement;
  spikeUp: HTMLCanvasElement;
  spikeDown: HTMLCanvasElement;
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Build all static tile sprites for a theme (called once per level load). */
export function buildTileset(th: Theme): Tileset {
  const T = TILE;
  const fill: HTMLCanvasElement[] = [];
  for (let v = 0; v < 4; v++) {
    const c = makeCanvas(T, T);
    const g = c.getContext('2d')!;
    const r = seeded(th.id.length * 100 + v * 7 + 3);
    g.fillStyle = th.base;
    g.fillRect(0, 0, T, T);
    if (th.style === 'brick' || th.style === 'marble') {
      g.fillStyle = th.dark;
      g.fillRect(0, 7, T, 1);
      g.fillRect(0, 15, T, 1);
      const off = v % 2 ? 4 : 10;
      g.fillRect(off, 0, 1, 7);
      g.fillRect((off + 8) % 16, 8, 1, 7);
      g.fillStyle = th.light;
      g.fillRect(0, 0, T, 1);
      g.fillRect(0, 8, T, 1);
    }
    const n = th.style === 'rock' ? 14 : 9;
    for (let i = 0; i < n; i++) {
      g.fillStyle = r() > 0.5 ? th.dark : th.light;
      const s = r() > 0.8 ? 2 : 1;
      g.fillRect(Math.floor(r() * 14), Math.floor(r() * 14), s, s);
    }
    if (th.style === 'rock') {
      g.fillStyle = th.dark;
      g.fillRect(0, 12 + (v % 3), 7, 1);
      g.fillRect(9, 4 + (v % 4), 7, 1);
      g.fillStyle = th.light;
      g.fillRect(2, 5, 1, 1);
    }
    if (th.style === 'dirt') {
      g.fillStyle = th.dark;
      g.fillRect(3 + v * 2, 9, 3, 2);
    }
    fill.push(c);
  }
  // grass / frost / moss overlay
  const top = makeCanvas(T, 5);
  {
    const g = top.getContext('2d')!;
    const r = seeded(77);
    g.fillStyle = th.top;
    g.fillRect(0, 0, T, 3);
    g.fillStyle = th.topLight;
    g.fillRect(0, 0, T, 1);
    for (let x = 0; x < T; x += 2) {
      if (r() > 0.4) { g.fillStyle = th.top; g.fillRect(x, 3, 2, 1 + Math.floor(r() * 2)); }
    }
    g.fillStyle = th.topLight;
    for (let i = 0; i < 3; i++) g.fillRect(Math.floor(r() * 15), 1, 1, 1);
  }
  const oneway = makeCanvas(T, 6);
  {
    const g = oneway.getContext('2d')!;
    g.fillStyle = th.dark;
    g.fillRect(0, 2, T, 4);
    g.fillStyle = th.base;
    g.fillRect(0, 1, T, 3);
    g.fillStyle = th.light;
    g.fillRect(0, 0, T, 2);
    g.fillStyle = th.dark;
    g.fillRect(3, 4, 1, 2);
    g.fillRect(12, 4, 1, 2);
  }
  const cracks = makeCanvas(T, T);
  {
    const g = cracks.getContext('2d')!;
    g.fillStyle = th.dark;
    const pts = [[8, 0], [7, 3], [9, 5], [6, 8], [8, 11], [7, 15]];
    for (const [x, y] of pts) g.fillRect(x, y, 1, 3);
    g.fillRect(2, 6, 4, 1);
    g.fillRect(10, 10, 4, 1);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(0, 0, T, 2);
  }
  const mkSpike = (down: boolean) => {
    const c = makeCanvas(T, T);
    const g = c.getContext('2d')!;
    for (let i = 0; i < 3; i++) {
      const x0 = i * 5 + 0.5;
      g.beginPath();
      if (!down) { g.moveTo(x0, T); g.lineTo(x0 + 2.5, 6); g.lineTo(x0 + 5, T); }
      else { g.moveTo(x0, 0); g.lineTo(x0 + 2.5, 10); g.lineTo(x0 + 5, 0); }
      g.closePath();
      g.fillStyle = '#d6deee';
      g.fill();
      g.fillStyle = '#7e8aa6';
      g.beginPath();
      if (!down) { g.moveTo(x0 + 2.5, 6); g.lineTo(x0 + 5, T); g.lineTo(x0 + 2.5, T); }
      else { g.moveTo(x0 + 2.5, 10); g.lineTo(x0 + 5, 0); g.lineTo(x0 + 2.5, 0); }
      g.closePath();
      g.fill();
    }
    return c;
  };
  return { fill, top, oneway, cracks, spikeUp: mkSpike(false), spikeDown: mkSpike(true) };
}

/** Sky gradient + tint for a day-phase (0 day, 1 dusk, 2 night). */
export function skyAt(th: Theme, phase: number): { top: string; bottom: string; tint: string; tintA: number } {
  const p = Math.max(0, Math.min(2, phase));
  const i = Math.min(1, Math.floor(p));
  const f = p - i;
  return {
    top: mixColor(th.sky[i][0], th.sky[i + 1][0], f),
    bottom: mixColor(th.sky[i][1], th.sky[i + 1][1], f),
    tint: mixColor(th.tint[i][0], th.tint[i + 1][0], f),
    tintA: th.tint[i][1] + (th.tint[i + 1][1] - th.tint[i][1]) * f,
  };
}
