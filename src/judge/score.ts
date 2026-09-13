/**
 * From two measurements to one number. Every part is a curve over a quantity the eye
 * actually produced; the ranges come from running real landing pages through the kernel
 * (`npm run calibrate`) and are summarised in README.md. The total is a weighted sum,
 * 0 to 100. Fifty and up lands.
 */
import type { Metrics, Variant } from '../neural/protocol';

export type PartKey = 'notice' | 'spot' | 'calm' | 'balance' | 'colour';

export interface Part {
  key: PartKey;
  label: string;
  /** the question the fly is answering, for the UI */
  question: string;
  score: number;          // 0..100
  value: string;          // the measurement, formatted
  weight: number;         // out of 100
}

export interface Score {
  parts: Part[];
  total: number;          // 0..100, rounded
  landed: boolean;
  /** the band the total falls in */
  band: { title: string; line: string };
  colourRatio: number;
}

export const WEIGHTS: Record<PartKey, number> = { notice: 25, spot: 25, calm: 20, balance: 15, colour: 15 };

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** Linear ramp from 0 at `lo` to 1 at `hi`. */
const ramp = (x: number, lo: number, hi: number) => clamp01((x - lo) / (hi - lo));
/** A flat top between `a` and `b` with linear shoulders of width `wl` and `wr`. */
const plateau = (x: number, a: number, b: number, wl: number, wr: number) => x < a ? ramp(x, a - wl, a) : x > b ? 1 - ramp(x, b, b + wr) : 1;

// Ranges seen on real pages (operating grey 40, 0.1 ms, 1 s exposure, 1440x810 captures):
// a flat frame gives 0.9 Hz of glance, so anything under about 1.2 Hz is a blank to the eye.
// Text-heavy white pages sit at 1.3 to 1.6 Hz, pages with one big hero block at 3 to 8 Hz,
// dark pages with bright elements at 10 to 13 Hz. hotFraction 5 % to 21 %, peakRatio 2.5 to
// 6.5, leftShare 0.3 to 0.5 before the per-eye fix, page over human-grey 0.94 to 1.7.
export const CURVES = {
  notice: (glance: number) => ramp(glance, 1.0, 10),
  /** a clear landing spot needs a signal first; on a blank the "hot" columns are noise */
  spot: (peakRatio: number, hotFraction: number, glance: number) =>
    plateau(peakRatio, 2.8, 4.8, 1.0, 2.5) * plateau(hotFraction, 0.05, 0.16, 0.04, 0.12) * ramp(glance, 1.2, 3),
  /** quiet columns are good up to a point; a page that is all quiet is a blank */
  calm: (quiet: number, glance: number) => plateau(quiet, 0.3, 0.7, 0.25, 0.25) * ramp(glance, 1.2, 3),
  /** balance and colour of a blank are meaningless too, so both need a signal */
  balance: (leftShare: number, glance: number) => plateau(leftShare, 0.44, 0.56, 0.16, 0.16) * ramp(glance, 1.2, 3),
  colour: (ratio: number, glance: number) => ramp(ratio, 0.7, 1.0) * ramp(glance, 1.2, 3),
};

export const BANDS: { min: number; title: string; line: string }[] = [
  { min: 85, title: 'Landed. Laid eggs.', line: 'The fly is not leaving. Neither is anyone else.' },
  { min: 70, title: 'Landed.', line: 'Clean approach, one clear place to sit. The fly stayed.' },
  { min: 50, title: 'Landed, barely.', line: 'Touched down, looked around, is thinking about it.' },
  { min: 35, title: 'Hovered. Left.', line: 'Circled twice, found nowhere to sit, went back to the lamp.' },
  { min: 20, title: 'Bounced.', line: 'Hit the glass and kept going.' },
  { min: 0, title: 'Bounced off the glass.', line: 'The fly did not notice there was a page.' },
];

const fmt = (x: number, d = 1) => x.toFixed(d);
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function score(m: Partial<Record<Variant, Metrics>>): Score | null {
  const page = m.page, hg = m.humangrey;
  if (!page || !hg) return null;
  const colourRatio = hg.glance > 0 ? page.glance / hg.glance : 1;
  const raw: Record<PartKey, number> = {
    notice: CURVES.notice(page.glance),
    spot: CURVES.spot(page.peakRatio, page.hotFraction, page.glance),
    calm: CURVES.calm(page.quietFraction, page.glance),
    balance: CURVES.balance(page.leftShare, page.glance),
    colour: CURVES.colour(colourRatio, page.glance),
  };
  const eye = page.leftShare > 0.5 ? 'left' : 'right';
  const parts: Part[] = [
    { key: 'notice', label: 'Notice', question: 'Did the fly see anything at all?', score: Math.round(raw.notice * 100), value: `${fmt(page.glance)} Hz`, weight: WEIGHTS.notice },
    { key: 'spot', label: 'Landing spot', question: 'Is there one clear place to sit?', score: Math.round(raw.spot * 100), value: `${fmt(page.peakRatio)}× peak`, weight: WEIGHTS.spot },
    { key: 'calm', label: 'Calm', question: 'Is there room to breathe, or is it all noise?', score: Math.round(raw.calm * 100), value: `${pct(page.quietFraction)} quiet`, weight: WEIGHTS.calm },
    { key: 'balance', label: 'Balance', question: 'Are both eyes working, or just one?', score: Math.round(raw.balance * 100), value: `${pct(Math.max(page.leftShare, 1 - page.leftShare))} ${eye}`, weight: WEIGHTS.balance },
    { key: 'colour', label: 'Fly-safe colour', question: 'Does the contrast survive without red?', score: Math.round(raw.colour * 100), value: `${pct(Math.min(colourRatio, 1.5))} kept`, weight: WEIGHTS.colour },
  ];
  const total = Math.round(parts.reduce((s, p) => s + (p.score / 100) * p.weight, 0));
  const band = BANDS.find((b) => total >= b.min)!;
  return { parts, total, landed: total >= 50, band: { title: band.title, line: band.line }, colourRatio };
}
