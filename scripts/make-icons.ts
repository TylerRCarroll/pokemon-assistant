// Renders assets/icon.svg to every icon size the PWA and the Android app need.
// Run: npm run icons   (re-run after changing the SVG; Android icons need android/ to exist)
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';

const svg = await readFile('assets/icon.svg');
const png = async (size: number, out: string) => {
  await mkdir(out.slice(0, out.lastIndexOf('/')), { recursive: true });
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(out);
};

// web: manifest icons (also used as maskable, since the art is full-bleed), iOS home screen, favicon
await png(192, 'public/icons/icon-192.png');
await png(512, 'public/icons/icon-512.png');
await png(180, 'public/icons/apple-touch-icon.png');
await png(48, 'public/icons/favicon-48.png');

// Android launcher icons (legacy square + round), per density
const DENSITIES: Record<string, number> = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
if (existsSync('android/app/src/main/res')) {
  for (const [d, size] of Object.entries(DENSITIES)) {
    for (const name of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground']) {
      // adaptive foreground is drawn at 108dp with the visible area in the middle 72dp
      const s = name === 'ic_launcher_foreground' ? Math.round((size * 108) / 72) : size;
      await png(s, `android/app/src/main/res/mipmap-${d}/${name}.png`);
    }
  }
  // splash screens: the emblem centred on the app's dark background, at each file's existing size
  const { readdir } = await import('node:fs/promises');
  for (const dir of await readdir('android/app/src/main/res')) {
    const file = `android/app/src/main/res/${dir}/splash.png`;
    if (!existsSync(file)) continue;
    const { width = 480, height = 320 } = await sharp(file).metadata();
    const emblem = await sharp(svg, { density: 384 }).resize(Math.round(Math.min(width, height) * 0.45)).png().toBuffer();
    await sharp({ create: { width, height, channels: 4, background: '#0f172a' } })
      .composite([{ input: emblem, gravity: 'center' }])
      .png()
      .toFile(`${file}.tmp`);
    const { rename } = await import('node:fs/promises');
    await rename(`${file}.tmp`, file);
  }
  console.log('android icons and splash screens written');
}
console.log('web icons written');
