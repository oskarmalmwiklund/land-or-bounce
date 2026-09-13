/**
 * The share card: a 1200x630 PNG of the page with the fly sitting where it landed, the
 * glance map, the stamp, the score and the five parts. Drawn on a canvas from the same
 * data the page shows. Also the helpers that get it out of the browser.
 */
import type { Heat } from '../neural/protocol';
import { drawFly } from '../render/fly';
import { drawHeat } from '../render/heat';
import { palette } from '../theme/palette';
import type { Score } from './score';

export interface CardInput {
  image: HTMLImageElement | null;
  host: string;
  score: Score;
  heat: Heat | null;
  landing: { u: number; v: number } | null;
  /** where the card points people, e.g. landorbounce.com */
  appHost: string;
  /** what the scroll found, when there was more than one fold */
  scroll?: { best: number; total: number } | null;
}

const DISPLAY = '"Fraunces Variable", Georgia, serif';
const TEXT = '"Familjen Grotesk Variable", system-ui, sans-serif';
const MONO = '"JetBrains Mono Variable", ui-monospace, monospace';

/** Variable-font axes on canvas text: supported in Chromium, ignored elsewhere. */
function setVariation(c: CanvasRenderingContext2D, value: string): void { (c as unknown as { fontVariationSettings?: string }).fontVariationSettings = value; }

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

export function stamp(c: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, ink: string, edge: string, size: number, angle = -12): void {
  c.save();
  c.translate(x, y); c.rotate(angle * Math.PI / 180);
  c.font = `800 ${size}px ${DISPLAY}`;
  c.letterSpacing = `${size * 0.04}px`;
  const w = c.measureText(text).width + size * 0.7, h = size * 1.25;
  c.fillStyle = edge; roundRect(c, -w / 2, -h / 2 + size * 0.1, w, h, size * 0.14); c.fill();
  c.fillStyle = fill; roundRect(c, -w / 2, -h / 2, w, h, size * 0.14); c.fill();
  c.lineWidth = size * 0.08; c.strokeStyle = ink; roundRect(c, -w / 2 + size * 0.1, -h / 2 + size * 0.1, w - size * 0.2, h - size * 0.2, size * 0.1); c.stroke();
  c.fillStyle = ink; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 0, size * 0.05);
  c.restore();
}

export async function renderCard(input: CardInput): Promise<HTMLCanvasElement> {
  try { await Promise.all([document.fonts.load(`800 60px ${DISPLAY}`), document.fonts.load(`600 20px ${TEXT}`), document.fonts.load(`500 20px ${MONO}`)]); } catch { /* system fonts */ }
  const W = 1200, H = 630;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d')!;
  const s = input.score;
  // the room
  c.fillStyle = palette.ground; c.fillRect(0, 0, W, H);
  const glow = c.createRadialGradient(W * 0.78, -40, 0, W * 0.78, -40, 700);
  glow.addColorStop(0, 'rgba(255,179,71,0.35)'); glow.addColorStop(0.5, 'rgba(255,158,44,0.08)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = glow; c.fillRect(0, 0, W, H);
  // the page on the fly's screen
  const sw = 620, sh = sw * 9 / 16, sx = 48, sy = 118;
  c.save(); c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 50; c.shadowOffsetY = 18;
  c.fillStyle = palette.screen; roundRect(c, sx, sy, sw, sh, 12); c.fill(); c.restore();
  c.save(); roundRect(c, sx, sy, sw, sh, 12); c.clip();
  if (input.image && input.image.naturalWidth) {
    const fit = Math.min(sw / input.image.naturalWidth, sh / input.image.naturalHeight);
    const w = input.image.naturalWidth * fit, h = input.image.naturalHeight * fit;
    c.imageSmoothingQuality = 'high';
    c.drawImage(input.image, sx + (sw - w) / 2, sy + (sh - h) / 2, w, h);
  }
  if (input.heat) drawHeat(c, input.heat.u, input.heat.v, input.heat.d, input.heat.d.length, { x: sx, y: sy, w: sw, h: sh }, 0.9);
  c.restore();
  c.strokeStyle = 'rgba(246,236,220,0.14)'; c.lineWidth = 2; roundRect(c, sx - 1, sy - 1, sw + 2, sh + 2, 13); c.stroke();
  if (input.landing) {
    const x = sx + input.landing.u * sw, y = sy + input.landing.v * sh;
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(x + 3, y + 8, 20, 9, 0, 0, Math.PI * 2); c.fill();
    drawFly(c, x, y, -Math.PI / 2, 34, 0, true);
  }
  // the stamp on the corner of the screen
  if (s.landed) stamp(c, 'LANDED', sx + sw - 120, sy + sh - 40, palette.banana, palette.bananaInk, palette.bananaEdge, 44);
  else stamp(c, 'BOUNCED', sx + sw - 130, sy + sh - 40, palette.plum, palette.plumInk, palette.plumEdge, 44);
  // the site under the screen
  c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  c.fillStyle = palette.creamMuted; c.font = `500 18px ${MONO}`;
  c.fillText(input.host.slice(0, 48), sx, sy + sh + 40);
  if (input.scroll && input.scroll.total > 1) {
    c.textAlign = 'right'; c.fillStyle = palette.creamFaint; c.font = `500 14px ${TEXT}`;
    c.fillText(input.scroll.best === 1 ? `Scrolled ${input.scroll.total} folds. The top is the best one.` : `Scrolled ${input.scroll.total} folds. Fold ${input.scroll.best} is where it would land.`, sx + sw, sy + sh + 40);
    c.textAlign = 'left';
  }
  // wordmark
  c.fillStyle = palette.cream; c.font = `700 30px ${DISPLAY}`; setVariation(c, '"SOFT" 100, "WONK" 1');
  c.fillText('Land or Bounce', 48, 72);
  const ww = c.measureText('Land or Bounce').width;
  c.fillStyle = palette.banana; c.fillText('.', 48 + ww, 72);
  c.fillStyle = palette.creamMuted; c.font = `500 15px ${TEXT}`;
  c.fillText('A fruit fly’s eye scores your landing page. 29,195 real neurons. It cannot read.', 48 + ww + 26, 72);
  // the score
  const rx = 720, rw = W - rx - 48;
  c.textAlign = 'left';
  c.fillStyle = s.landed ? palette.banana : palette.plum; c.font = `700 14px ${TEXT}`; c.letterSpacing = '2px';
  c.fillText(s.landed ? 'THE FLY LANDED' : 'THE FLY BOUNCED', rx, 150);
  c.letterSpacing = '0px';
  c.fillStyle = palette.cream; c.font = `800 168px ${DISPLAY}`; setVariation(c, '"SOFT" 100, "WONK" 1, "opsz" 144');
  c.textBaseline = 'alphabetic';
  c.fillText(String(s.total), rx - 6, 300);
  const nw = c.measureText(String(s.total)).width;
  c.fillStyle = palette.creamMuted; c.font = `600 34px ${DISPLAY}`;
  c.fillText('/100', rx + nw + 6, 300);
  c.fillStyle = palette.cream; c.font = `600 30px ${DISPLAY}`; setVariation(c, '"SOFT" 100, "WONK" 1');
  c.fillText(s.band.title, rx, 348);
  c.fillStyle = palette.creamMuted; c.font = `500 16px ${TEXT}`;
  wrap(c, s.band.line, rx, 376, rw, 22);
  // the parts
  let y = 440;
  for (const p of s.parts) {
    c.fillStyle = palette.creamMuted; c.font = `600 14px ${TEXT}`; c.textAlign = 'left'; c.fillText(p.label, rx, y);
    c.fillStyle = palette.creamFaint; c.font = `500 13px ${MONO}`; c.textAlign = 'right'; c.fillText(p.value, rx + rw - 44, y);
    c.fillStyle = palette.cream; c.font = `600 14px ${MONO}`; c.fillText(String(p.score), rx + rw, y);
    c.fillStyle = palette.lineSoft; roundRect(c, rx, y + 7, rw, 5, 2.5); c.fill();
    c.fillStyle = p.score >= 50 ? palette.banana : palette.plum; roundRect(c, rx, y + 7, Math.max(5, rw * p.score / 100), 5, 2.5); c.fill();
    y += 34;
  }
  // footer
  c.textAlign = 'left'; c.fillStyle = palette.creamFaint; c.font = `500 13px ${TEXT}`;
  c.fillText('Retina and lamina of the MaleCNS v1.0 fly connectome, simulated live in the browser. Model activity, not fly behaviour.', 48, H - 28);
  c.textAlign = 'right'; c.fillStyle = palette.creamMuted; c.font = `600 14px ${TEXT}`;
  c.fillText(`Score yours at ${input.appHost}`, W - 48, H - 28);
  return canvas;
}

function wrap(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number): void {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (c.measureText(test).width > maxW && line) { c.fillText(line, x, y); line = w; y += lh; } else line = test;
  }
  if (line) c.fillText(line, x, y);
}

export function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('no blob'))), 'image/png'));
}

export async function download(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const blob = await toBlob(canvas);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** A JPEG of the card, small enough to store and to send as a link preview. */
export function toJpeg(canvas: HTMLCanvasElement, quality = 0.86): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('no blob'))), 'image/jpeg', quality));
}

/**
 * Copy the card to the clipboard. The write is started synchronously, with the PNG as a
 * promise inside the ClipboardItem, so it still counts as part of the click even though
 * encoding takes a moment; an await before the write would lose the gesture (and the
 * document's focus, once a posting site opens in a new tab).
 */
export function copyImage(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    if (!('ClipboardItem' in window) || !navigator.clipboard?.write) return Promise.resolve(false);
    return navigator.clipboard.write([new ClipboardItem({ 'image/png': toBlob(canvas) })]).then(() => true, () => false);
  } catch { return Promise.resolve(false); }
}

/** Web Share with the PNG attached where the platform allows it. */
export async function shareCard(canvas: HTMLCanvasElement, text: string, url: string, filename: string): Promise<'shared' | 'unsupported' | 'cancelled'> {
  if (!navigator.share) return 'unsupported';
  try {
    const blob = await toBlob(canvas);
    const file = new File([blob], filename, { type: 'image/png' });
    const withFile = { text, url, files: [file] };
    if (navigator.canShare?.(withFile)) await navigator.share(withFile);
    else await navigator.share({ text, url });
    return 'shared';
  } catch (err) {
    return err instanceof Error && err.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}
