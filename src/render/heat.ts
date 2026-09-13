/**
 * The glance map: lamp-coloured light painted at each lamina column's screen position,
 * brighter where that column changed more against grey. Thresholded against the field's
 * own spread so a blank stays blank and only what stands out is lit.
 */
export interface Rect { x: number; y: number; w: number; h: number }

const HEAT_FLOOR_HZ = 2.5;      // never paint a column that changed less than this
const HEAT_REF_HZ = 12;         // full brightness at this change

let sprite: HTMLCanvasElement | null = null;
function getSprite(): HTMLCanvasElement {
  if (sprite) return sprite;
  const S = 64;
  sprite = document.createElement('canvas');
  sprite.width = sprite.height = S;
  const sc = sprite.getContext('2d')!;
  const grad = sc.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,158,44,0.95)');
  grad.addColorStop(0.4, 'rgba(255,140,30,0.5)');
  grad.addColorStop(1, 'rgba(255,120,20,0)');
  sc.fillStyle = grad;
  sc.fillRect(0, 0, S, S);
  return sprite;
}

/** Threshold and scale for a field of per-column changes. Null when nothing stands out. */
export function heatScale(d: ArrayLike<number>, n: number): { floor: number; span: number } | null {
  let sum = 0, sq = 0, peak = 0;
  for (let k = 0; k < n; k++) { const g = d[k]; sum += g; sq += g * g; if (g > peak) peak = g; }
  if (!n) return null;
  const mean = sum / n, sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
  const floor = Math.max(HEAT_FLOOR_HZ, mean + 1.5 * sd);
  const span = Math.max(HEAT_REF_HZ, peak) - floor;
  if (peak <= floor || span <= 0) return null;
  return { floor, span };
}

/**
 * Paint the map into `rect` on `c`. `u`, `v` are column positions in [0,1], `d` the change
 * per column in Hz, all of length `n`. Returns the centre of mass of the hottest columns,
 * or null.
 */
export function drawHeat(c: CanvasRenderingContext2D, u: ArrayLike<number>, v: ArrayLike<number>, d: ArrayLike<number>, n: number, rect: Rect, alpha = 1): { u: number; v: number } | null {
  const scale = heatScale(d, n);
  if (!scale) return null;
  const { floor, span } = scale;
  const sp = getSprite();
  const radius = rect.w / 30;
  c.save();
  c.beginPath(); c.rect(rect.x, rect.y, rect.w, rect.h); c.clip();
  // plain alpha, not 'lighter': on a white page an additive glow is invisible
  let sumW = 0, su = 0, sv = 0;
  for (let k = 0; k < n; k++) {
    const g = (d[k] - floor) / span;
    if (g <= 0) continue;
    c.globalAlpha = Math.min(0.85, 0.25 + g * 0.75) * alpha;
    c.drawImage(sp, rect.x + u[k] * rect.w - radius, rect.y + v[k] * rect.h - radius, radius * 2, radius * 2);
    if (g > 0.55) { const w = g; sumW += w; su += w * u[k]; sv += w * v[k]; }
  }
  c.restore();
  return sumW > 0 ? { u: su / sumW, v: sv / sumW } : null;
}
