/** Pure functions the worker uses to turn spike counts into the metrics the fly reasons with. */
import type { Circuit } from '../neural/circuit';
import { SCREEN_H, SCREEN_W } from '../neural/circuit';
import type { Heat, Metrics, Variant } from '../neural/protocol';
import { FLY_LUMA, LINEAR, linearToSrgb8 } from '../neural/spectral';

export interface Groups {
  lamina: Int32Array;        // L1-L3 with a column position
  laminaLeft: Uint8Array;    // 1 if that lamina cell belongs to the left eye
  laminaU: Float32Array;     // column screen position, 0..1
  laminaV: Float32Array;
  r8p: Int32Array;
  r8y: Int32Array;
  receptors: Int32Array;
}

export function groups(c: Circuit): Groups {
  const lam: number[] = [], left: number[] = [], u: number[] = [], v: number[] = [], r8p: number[] = [], r8y: number[] = [], rec: number[] = [];
  for (let i = 0; i < c.n; i++) {
    const t = c.typeName(i);
    if ((t === 'L1' || t === 'L2' || t === 'L3') && c.uvSource[i] === 2) { lam.push(i); left.push(c.side[i] === 'L' ? 1 : 0); u.push(c.colU[i]); v.push(c.colV[i]); }
    if (c.driveChannel[i] === 2) r8p.push(i);
    if (c.driveChannel[i] === 3) r8y.push(i);
    if (c.driveChannel[i] > 0) rec.push(i);
  }
  return { lamina: Int32Array.from(lam), laminaLeft: Uint8Array.from(left), laminaU: Float32Array.from(u), laminaV: Float32Array.from(v), r8p: Int32Array.from(r8p), r8y: Int32Array.from(r8y), receptors: Int32Array.from(rec) };
}

function meanRate(counts: Int32Array, cells: Int32Array, seconds: number): number {
  let s = 0;
  for (let k = 0; k < cells.length; k++) s += counts[cells[k]];
  return cells.length ? s / cells.length / seconds : 0;
}

/** Per-lamina-cell change against grey, in Hz, plus the summary the heat map needs. */
export function heat(g: Groups, steady: Int32Array, steadySec: number, base: Int32Array, baseSec: number): Heat {
  const n = g.lamina.length;
  const d = new Float32Array(n);
  let sum = 0, peak = 0;
  for (let k = 0; k < n; k++) {
    const i = g.lamina[k];
    d[k] = Math.abs(steady[i] / steadySec - base[i] / baseSec);
    sum += d[k]; if (d[k] > peak) peak = d[k];
  }
  return { u: g.laminaU.slice(), v: g.laminaV.slice(), d, mean: n ? sum / n : 0, peak };
}

/** A lamina column that changed less than this against grey is counted as quiet. On a
 *  flat frame the mean change is about 0.9 Hz with a long tail, so this is roughly the
 *  noise floor's 90th percentile. */
export const QUIET_HZ = 2.5;

/**
 * @param steady   spike counts over the steady window (last half of the exposure)
 * @param steadySec length of that window in seconds
 * @param base     spike counts over the baseline window on grey
 * @param baseSec  length of the baseline window
 * @param windows  per-cell counts for each 100 ms window of the exposure, in order
 */
export function metrics(g: Groups, steady: Int32Array, steadySec: number, base: Int32Array, baseSec: number,
  windows: Int32Array[], windowSec: number): Metrics {
  const n = g.lamina.length;
  const delta = new Float32Array(n);
  let sum = 0, leftSum = 0, leftN = 0, topSum = 0, quiet = 0;
  for (let k = 0; k < n; k++) {
    const i = g.lamina[k];
    const d = Math.abs(steady[i] / steadySec - base[i] / baseSec);
    delta[k] = d; sum += d;
    if (g.laminaLeft[k]) { leftSum += d; leftN++; }
    if (g.laminaV[k] < 0.5) topSum += d;
    if (d < QUIET_HZ) quiet++;
  }
  const glance = n ? sum / n : 0;
  // the two eyes do not have the same number of mapped columns, so compare means, not sums
  const leftMean = leftN ? leftSum / leftN : 0, rightMean = n - leftN ? (sum - leftSum) / (n - leftN) : 0;
  let hot = 0;
  for (let k = 0; k < n; k++) if (delta[k] > 2 * glance) hot++;
  const sorted = Float32Array.from(delta).sort();
  const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
  const series = windows.map((w) => {
    let s = 0;
    for (let k = 0; k < n; k++) { const i = g.lamina[k]; s += Math.abs(w[i] / windowSec - base[i] / baseSec); }
    return n ? s / n : 0;
  });
  const peak = Math.max(1e-9, ...series);
  const hold = series.length ? series[series.length - 1] / peak : 1;
  const blue = meanRate(steady, g.r8p, steadySec) - meanRate(base, g.r8p, baseSec);
  const green = meanRate(steady, g.r8y, steadySec) - meanRate(base, g.r8y, baseSec);
  // The landing spot: centre of mass of the columns that stand out from the field by more
  // than 1.5 standard deviations, so it sits on a region and not on estimation noise.
  let landing: Metrics['landing'] = null;
  if (n && glance > 0) {
    let sq = 0;
    for (let k = 0; k < n; k++) sq += delta[k] * delta[k];
    const sd = Math.sqrt(Math.max(0, sq / n - glance * glance));
    const floor = glance + 1.5 * sd;
    let sw = 0, su = 0, sv = 0, top = 0;
    for (let k = 0; k < n; k++) if (delta[k] > floor) { const w = delta[k] - floor; sw += w; su += w * g.laminaU[k]; sv += w * g.laminaV[k]; if (delta[k] > top) top = delta[k]; }
    if (sw > 0 && top > 4) landing = { u: su / sw, v: sv / sw, strength: top };
  }
  return {
    glance, hotFraction: n ? hot / n : 0, peakRatio: glance > 0 ? p95 / glance : 0,
    leftShare: leftMean + rightMean > 0 ? leftMean / (leftMean + rightMean) : 0.5, quietFraction: n ? quiet / n : 1, series, hold, blueMinusGreen: blue - green,
    receptorHz: meanRate(steady, g.receptors, steadySec), topShare: sum > 0 ? topSum / sum : 0.5, landing,
  };
}

/**
 * The page as a human sees its brightness: greyscale by Rec. 709 luminance (21 % red,
 * 72 % green, 7 % blue in linear light). Shown to the fly so the two glances can be
 * compared: whatever contrast the fly loses between this and the real page lived in
 * colours it cannot see, which on a screen means red.
 */
export function humanGrey(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const y = 0.2126 * LINEAR[rgba[i]] + 0.7152 * LINEAR[rgba[i + 1]] + 0.0722 * LINEAR[rgba[i + 2]];
    const v = linearToSrgb8(y);
    out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255;
  }
  return out;
}

/**
 * The grey the eye settles on and adapts every page to, as an sRGB level. The kernel's
 * receptor curve is drive = 30 mV · L / (0.02 + L): half-saturated at a linear luminance
 * of 0.02, which is sRGB 40, and nearly flat above 0.1. Settling there puts the receptors
 * in the middle of their range, so that darker and brighter than the page's mean both
 * register. (The upstream kernel settles on 128, where the receptors are 93 % saturated;
 * the reference-rate test still runs at 128 and is unaffected.)
 */
export let OPERATING_GREY = 40;
export function setOperatingGrey(level: number): void { OPERATING_GREY = level; }

/**
 * Light adaptation. Real photoreceptors move their operating point to the mean of the
 * scene within a second or two; the kernel's cannot. This does it up front: every pixel's
 * linear light is scaled so the frame's mean fly luminance equals the grey the eye
 * settled on. Brightness is gone from the measurement, as it should be; contrast against
 * the mean is what remains.
 */
export function adapt(rgba: Uint8ClampedArray): Uint8ClampedArray {
  let y = 0; const n = rgba.length / 4;
  for (let i = 0; i < rgba.length; i += 4) y += FLY_LUMA[0] * LINEAR[rgba[i]] + FLY_LUMA[1] * LINEAR[rgba[i + 1]] + FLY_LUMA[2] * LINEAR[rgba[i + 2]];
  const mean = y / n;
  const k = mean > 1e-6 ? LINEAR[OPERATING_GREY] / mean : 1;
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    out[i] = linearToSrgb8(Math.min(1, LINEAR[rgba[i]] * k));
    out[i + 1] = linearToSrgb8(Math.min(1, LINEAR[rgba[i + 1]] * k));
    out[i + 2] = linearToSrgb8(Math.min(1, LINEAR[rgba[i + 2]] * k));
    out[i + 3] = 255;
  }
  return out;
}

/** Everything the fly is shown, from one page frame. The eye adapts to each first. */
export function variantsOf(page: Uint8ClampedArray): Record<Variant, Uint8ClampedArray> {
  return { page: adapt(page), humangrey: adapt(humanGrey(page)) };
}
