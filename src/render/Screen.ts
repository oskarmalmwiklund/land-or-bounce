/**
 * The screen the fly looks at. Shows the captured page (or, while judging, exactly the
 * 320x180 frame the worker has on the fly's screen), with the glance map painted over it
 * and, once there is a verdict, the fly sitting where it would land.
 */
import type { Circuit } from '../neural/circuit';
import { SCREEN_H, SCREEN_W } from '../neural/circuit';
import type { Heat, Variant } from '../neural/protocol';
import { OPERATING_GREY } from '../judge/measure';
import { drawFly } from './fly';
import { drawHeat } from './heat';

export class Screen {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly fly = document.createElement('canvas');
  private readonly flyCtx: CanvasRenderingContext2D;
  private readonly laminaCells: Int32Array;
  private readonly laminaU: Float32Array;
  private readonly laminaV: Float32Array;
  private smooth: Float32Array | null = null;
  private liveD: Float32Array;
  private width = 640; private height = 360;
  /** The captured page at full resolution. */
  image: HTMLImageElement | null = null;
  /** While judging: exactly what the worker has on the fly's screen. */
  override: ImageData | null = null;
  overrideKind: Variant | 'grey' | null = null;
  /** After the verdict: the per-column change from the page presentation. */
  heat: Heat | null = null;
  landing: { u: number; v: number } | null = null;
  showHeat = true;
  private landingBorn = 0;
  /** A scroll in progress: the image that was on screen, sliding up. */
  private prevImage: HTMLImageElement | null = null;
  private scrollStart = 0;
  private scrollDir = 1;

  constructor(readonly canvas: HTMLCanvasElement, readonly circuit: Circuit) {
    this.ctx = canvas.getContext('2d')!;
    this.fly.width = SCREEN_W; this.fly.height = SCREEN_H;
    this.flyCtx = this.fly.getContext('2d', { willReadFrequently: true })!;
    const cells: number[] = [], u: number[] = [], v: number[] = [];
    for (let i = 0; i < circuit.n; i++) {
      const t = circuit.typeName(i);
      if ((t === 'L1' || t === 'L2' || t === 'L3') && circuit.uvSource[i] === 2) { cells.push(i); u.push(circuit.colU[i]); v.push(circuit.colV[i]); }
    }
    this.laminaCells = Int32Array.from(cells); this.laminaU = Float32Array.from(u); this.laminaV = Float32Array.from(v);
    this.liveD = new Float32Array(cells.length);
  }

  resize(width: number, height: number): void {
    this.width = width; this.height = height;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  get hasSource(): boolean { return this.image !== null || this.override !== null; }

  /** Any image letterboxed onto the fly's 320x180 screen, for the photoreceptors. */
  frameOf(image: HTMLImageElement | null): ImageData | null {
    const c = this.flyCtx;
    const g = OPERATING_GREY;
    c.fillStyle = `rgb(${g},${g},${g})`;
    c.fillRect(0, 0, SCREEN_W, SCREEN_H);
    if (!image || !image.naturalWidth) return null;
    const fit = Math.min(SCREEN_W / image.naturalWidth, SCREEN_H / image.naturalHeight);
    const w = image.naturalWidth * fit, h = image.naturalHeight * fit;
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(image, (SCREEN_W - w) / 2, (SCREEN_H - h) / 2, w, h);
    return c.getImageData(0, 0, SCREEN_W, SCREEN_H);
  }

  /** The current page on the fly's screen. */
  paintFlyScreen(): ImageData | null { return this.frameOf(this.image); }

  /** Feed a new per-cell change-vs-grey estimate; the map keeps a smoothed copy. */
  setGlance(glance: Float32Array | null): void {
    if (!glance) { this.smooth = null; return; }
    if (!this.smooth || this.smooth.length !== glance.length) { this.smooth = glance.slice(); return; }
    const s = this.smooth;
    for (let k = 0; k < this.laminaCells.length; k++) { const i = this.laminaCells[k]; s[i] += (glance[i] - s[i]) * 0.12; }
  }

  resetGlance(): void { this.smooth = null; }

  /** Slide to another fold of the same page: the old image leaves upward, the new one arrives from below. */
  scrollTo(image: HTMLImageElement, dir = 1): void {
    if (this.image && this.image !== image) { this.prevImage = this.image; this.scrollStart = performance.now(); this.scrollDir = dir; }
    this.image = image;
    this.override = null; this.overrideKind = 'page';
    this.heat = null;
  }

  private drawImageAt(c: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number, dy: number): void {
    const fit = Math.min(W / img.naturalWidth, H / img.naturalHeight);
    const w = img.naturalWidth * fit, h = img.naturalHeight * fit;
    c.drawImage(img, (W - w) / 2, (H - h) / 2 + dy, w, h);
  }

  setLanding(l: { u: number; v: number } | null): void {
    if (l && !this.landing) this.landingBorn = performance.now();
    this.landing = l;
  }

  render(now = performance.now()): void {
    const c = this.ctx, W = this.width, H = this.height;
    const rect = { x: 0, y: 0, w: W, h: H };
    const g = OPERATING_GREY;
    c.fillStyle = `rgb(${g},${g},${g})`; c.fillRect(0, 0, W, H);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    if (this.override && this.overrideKind !== 'page' && this.overrideKind !== 'grey') {
      // the fly's own view of a variant, at the fly's resolution
      this.flyCtx.putImageData(this.override, 0, 0);
      c.drawImage(this.fly, 0, 0, W, H);
    } else if (this.image && this.image.naturalWidth) {
      const t = this.prevImage ? Math.min(1, (now - this.scrollStart) / 650) : 1;
      if (this.prevImage && t < 1) {
        const e = 1 - (1 - t) ** 3;
        this.drawImageAt(c, this.prevImage, W, H, -e * H * this.scrollDir);
        this.drawImageAt(c, this.image, W, H, (1 - e) * H * this.scrollDir);
      } else { this.prevImage = null; this.drawImageAt(c, this.image, W, H, 0); }
    } else if (this.override) {
      this.flyCtx.putImageData(this.override, 0, 0);
      c.drawImage(this.fly, 0, 0, W, H);
    }
    if (this.showHeat && this.hasSource && !this.prevImage) {
      if (this.heat) drawHeat(c, this.heat.u, this.heat.v, this.heat.d, this.heat.d.length, rect, 0.9);
      else if (this.smooth) {
        for (let k = 0; k < this.laminaCells.length; k++) this.liveD[k] = this.smooth[this.laminaCells[k]];
        drawHeat(c, this.laminaU, this.laminaV, this.liveD, this.liveD.length, rect, 0.8);
      }
    }
    if (this.landing) {
      const age = Math.min(1, (now - this.landingBorn) / 700);
      const ease = 1 - (1 - age) ** 3;
      const x = this.landing.u * W, y = this.landing.v * H - (1 - ease) * 60;
      const size = Math.max(22, W * 0.05);
      c.save();
      c.globalAlpha = ease;
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.beginPath(); c.ellipse(x + size * 0.1, y + size * 0.25, size * 0.6, size * 0.28, 0, 0, Math.PI * 2); c.fill();
      c.restore();
      drawFly(c, x, y, -Math.PI / 2 + Math.sin(now / 900) * 0.05, size, age < 1 ? now / 8 : 0, age >= 1, ease);
    }
  }
}
