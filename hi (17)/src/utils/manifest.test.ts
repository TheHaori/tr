import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

interface ManifestScreenshot {
  src: string;
  sizes: string;
  type: string;
  form_factor?: 'wide' | 'narrow';
  label?: string;
}

interface WebAppManifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  lang: string;
  dir: string;
  start_url: string;
  scope: string;
  display: string;
  display_override?: string[];
  orientation?: string;
  theme_color: string;
  background_color: string;
  categories?: string[];
  prefer_related_applications?: boolean;
  launch_handler?: { client_mode: string };
  icons: ManifestIcon[];
  screenshots?: ManifestScreenshot[];
}

const rootDir = path.resolve(process.cwd());
const publicDir = path.join(rootDir, 'public');
const manifestPath = path.join(publicDir, 'manifest.json');

function loadManifest(): WebAppManifest {
  const raw = fs.readFileSync(manifestPath, 'utf-8');
  return JSON.parse(raw) as WebAppManifest;
}

function readPngDimensions(filePath: string): { width: number; height: number } {
  const buf = fs.readFileSync(filePath);
  // PNG signature is 8 bytes; IHDR width at offset 16 (4B BE), height at offset 20 (4B BE)
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${filePath} must be a valid PNG`);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

test('manifest.json contains all PWABuilder required and recommended fields', () => {
  const manifest = loadManifest();

  assert.equal(manifest.id, '/');
  assert.ok(manifest.name.length > 0);
  assert.ok(manifest.short_name.length > 0 && manifest.short_name.length <= 12, 'short_name must be <= 12 chars');
  assert.ok(manifest.description.length >= 20);
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(Array.isArray(manifest.display_override) && manifest.display_override.includes('standalone'));
  assert.match(manifest.theme_color, /^#[0-9a-fA-F]{6}$/);
  assert.match(manifest.background_color, /^#[0-9a-fA-F]{6}$/);
  assert.ok(Array.isArray(manifest.categories) && manifest.categories.includes('games'));
  assert.equal(manifest.prefer_related_applications, false);
  assert.equal(manifest.launch_handler?.client_mode, 'focus-existing');
});

test('manifest icons satisfy 192px & 512px PNG requirements with separate any and maskable purposes', () => {
  const manifest = loadManifest();
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 4);

  for (const icon of manifest.icons) {
    assert.notEqual(icon.purpose, 'any maskable', 'Never combine any and maskable on a single icon');
    const diskPath = path.join(publicDir, icon.src.replace(/^\//, ''));
    assert.ok(fs.existsSync(diskPath), `Icon missing on disk: ${icon.src}`);

    if (icon.type === 'image/png') {
      const [expectedW, expectedH] = icon.sizes.split('x').map(Number);
      const { width, height } = readPngDimensions(diskPath);
      assert.equal(width, expectedW, `${icon.src} width mismatch`);
      assert.equal(height, expectedH, `${icon.src} height mismatch`);
    }
  }

  assert.ok(manifest.icons.some((i) => i.sizes === '192x192' && i.purpose === 'any'));
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any'));
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
});

test('iOS apple-touch-icon.png exists and is 180x180 PNG', () => {
  const appleIcon = path.join(publicDir, 'apple-touch-icon.png');
  assert.ok(fs.existsSync(appleIcon), 'apple-touch-icon.png must exist');
  const dims = readPngDimensions(appleIcon);
  assert.deepEqual(dims, { width: 180, height: 180 });
});

test('manifest screenshots include both wide and narrow PNG assets matching declared dimensions', () => {
  const manifest = loadManifest();
  assert.ok(Array.isArray(manifest.screenshots) && manifest.screenshots.length >= 2);
  assert.ok(manifest.screenshots.some((s) => s.form_factor === 'wide'));
  assert.ok(manifest.screenshots.some((s) => s.form_factor === 'narrow'));

  for (const shot of manifest.screenshots) {
    const diskPath = path.join(publicDir, shot.src.replace(/^\//, ''));
    assert.ok(fs.existsSync(diskPath), `Screenshot missing on disk: ${shot.src}`);
    const [expectedW, expectedH] = shot.sizes.split('x').map(Number);
    const { width, height } = readPngDimensions(diskPath);
    assert.equal(width, expectedW, `${shot.src} width mismatch`);
    assert.equal(height, expectedH, `${shot.src} height mismatch`);
  }
});
