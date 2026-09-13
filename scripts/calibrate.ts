/**
 * Run real landing pages through the eye and print the numbers the score curves are built
 * on. `npm run calibrate -- https://a.com https://b.com` or with local PNG/JPEG files.
 * Needs a local Chrome (see api/capture.ts) for both the capture and the downsampling.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { capture, WIDTH, HEIGHT } from '../api/capture';
import { groups, heat, metrics, OPERATING_GREY, setOperatingGrey, variantsOf } from '../src/judge/measure';
import { score } from '../src/judge/score';
import { EyeBrain } from '../src/neural/EyeBrain';
import { parseCircuit, SCREEN_H, SCREEN_W } from '../src/neural/circuit';
import { VARIANTS, type Metrics, type Variant } from '../src/neural/protocol';

const EXPOSURE_MS = 1000;
const DT = Number(process.env.DT ?? 0.1);
if (process.env.GREY) setOperatingGrey(Number(process.env.GREY));
const OUT = new URL('../scratch/calibrate/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const circuit = parseCircuit(JSON.parse(readFileSync(new URL('../public/data/eye-circuit.json', import.meta.url), 'utf8')));
const g = groups(circuit);
const brain = new EyeBrain(circuit, DT);

/** Draw a data URL into a 320x180 canvas inside a headless page and return the pixels. */
async function downsample(dataUrl: string): Promise<Uint8ClampedArray> {
  const puppeteer = (await import('puppeteer-core')).default;
  const executablePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<canvas id="c" width="320" height="180"></canvas>');
    const data: number[] = await page.evaluate(async (src: string, w: number, h: number) => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.getElementById('c') as HTMLCanvasElement; const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, w, h);
      const fit = Math.min(w / img.naturalWidth, h / img.naturalHeight); const dw = img.naturalWidth * fit, dh = img.naturalHeight * fit;
      ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      return Array.from(ctx.getImageData(0, 0, w, h).data);
    }, dataUrl, SCREEN_W, SCREEN_H);
    return new Uint8ClampedArray(data);
  } finally { await browser.close(); }
}

function settle(): { settled: ReturnType<EyeBrain['snapshot']>; base: Int32Array } {
  brain.reset(); brain.setFrame(null, OPERATING_GREY);
  for (let t = 0; t < 500; t += 10) brain.advance(10);
  brain.resetCounts();
  for (let t = 0; t < 500; t += 10) brain.advance(10);
  const base = brain.counts.slice();
  brain.resetCounts();
  return { settled: brain.snapshot(), base };
}

function present(frame: Uint8ClampedArray, settled: ReturnType<EyeBrain['snapshot']>, base: Int32Array): { m: Metrics; steady: Int32Array } {
  brain.restore(settled);
  brain.setFrame(frame);
  const steady = new Int32Array(brain.n); const windows: Int32Array[] = [];
  for (let t = 0; t < EXPOSURE_MS; t += 10) {
    brain.resetCounts(); brain.advance(10);
    if (t >= EXPOSURE_MS / 2) for (let i = 0; i < brain.n; i++) steady[i] += brain.counts[i];
    if (t % 100 === 0) windows.push(new Int32Array(brain.n));
    const w = windows[windows.length - 1]; for (let i = 0; i < brain.n; i++) w[i] += brain.counts[i];
  }
  return { m: metrics(g, steady, EXPOSURE_MS / 2000, base, 0.5, windows, 0.1), steady };
}

const COLS = ['name', 'glance', 'humangrey', 'quiet', 'colourRatio', 'hot', 'peak', 'left', 'hold', 'parts', 'total'];

async function main(): Promise<void> {
  const inputs = process.argv.slice(2);
  if (!inputs.length) { console.error('usage: npm run calibrate -- <url or image> ...'); process.exit(1); }
  const rows: Record<string, unknown>[] = [];
  for (const input of inputs) {
    const name = input.replace(/^https?:\/\//, '').replace(/[^a-z0-9.]+/gi, '_').slice(0, 60);
    let dataUrl: string;
    if (input === 'synthetic:flat' || input === 'synthetic:textpage' || input === 'synthetic:hero') {
      const f = new Uint8ClampedArray(SCREEN_W * SCREEN_H * 4);
      for (let y = 0; y < SCREEN_H; y++) for (let x = 0; x < SCREEN_W; x++) {
        let v = 255;
        if (input === 'synthetic:flat') v = 200;
        else if (input === 'synthetic:textpage') { const line = y % 6 < 2 && y > 20 && y < 160 && x > 30 && x < 290 && (x * 7 + y) % 11 > 3; v = line ? 60 : 255; }
        else { const inHero = x > 40 && x < 160 && y > 60 && y < 100; const inBtn = x > 40 && x < 90 && y > 110 && y < 125; v = inBtn ? 20 : inHero ? 90 : 245; }
        const p = (y * SCREEN_W + x) * 4; f[p] = f[p + 1] = f[p + 2] = v; f[p + 3] = 255;
      }
      rows.push(run(name, f)); continue;
    }
    if (existsSync(input)) {
      const mime = input.endsWith('.png') ? 'image/png' : 'image/jpeg';
      dataUrl = `data:${mime};base64,${readFileSync(input).toString('base64')}`;
    } else {
      const t0 = Date.now();
      try { const cap = await capture(input); dataUrl = cap.image; console.log(`captured ${cap.finalUrl} (${cap.title}) ${cap.width}x${cap.height} in ${Date.now() - t0} ms`); }
      catch (err) { console.log(`capture failed for ${input}: ${err instanceof Error ? err.message : err}`); continue; }
      writeFileSync(new URL(`${name}.jpg`, OUT), Buffer.from(dataUrl.split(',')[1], 'base64'));
    }
    const frame = await downsample(dataUrl);
    rows.push(run(name, frame));
  }
  console.log('\n' + COLS.join('\t'));
  for (const r of rows) console.log(COLS.map((k) => String((r as any)[k])).join('\t'));
  writeFileSync(new URL('results.json', OUT), JSON.stringify(rows, null, 2));
}

function run(name: string, frame: Uint8ClampedArray): Record<string, unknown> {
  const { settled, base } = settle();
  {
    const frames = variantsOf(frame);
    const ms: Partial<Record<Variant, Metrics>> = {};
    const t0 = performance.now();
    for (const v of VARIANTS) {
      const { m, steady } = present(frames[v], settled, base);
      ms[v] = m;
      if (v === 'page') { const h = heat(g, steady, EXPOSURE_MS / 2000, base, 0.5); (ms as any).heatPeak = h.peak; }
    }
    const s = score(ms)!;
    const p = ms.page!, hg = ms.humangrey!;
    const row = {
      name, glance: +p.glance.toFixed(2), humangrey: +hg.glance.toFixed(2),
      quiet: +p.quietFraction.toFixed(3), colourRatio: +s.colourRatio.toFixed(3), hot: +p.hotFraction.toFixed(3), peak: +p.peakRatio.toFixed(2), left: +p.leftShare.toFixed(2),
      hold: +p.hold.toFixed(3), top: +p.topShare.toFixed(2), bmg: +p.blueMinusGreen.toFixed(1), recHz: +p.receptorHz.toFixed(1),
      landing: p.landing ? `${p.landing.u.toFixed(2)},${p.landing.v.toFixed(2)} @${p.landing.strength.toFixed(0)}` : '-',
      parts: s.parts.map((x) => `${x.key}:${x.score}`).join(' '), total: s.total, kernelMs: Math.round(performance.now() - t0),
    };
    console.log(JSON.stringify(row));
    return row;
  }
}

void main();
