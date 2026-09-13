import type { CircuitData, CircuitManifest } from './circuit';

/** What the fly is shown, in order. Every variant is a full 320x180 RGBA frame. */
export type Variant = 'page' | 'humangrey';
export const VARIANTS: Variant[] = ['page', 'humangrey'];

export interface Metrics {
  /** mean |Δ rate| over L1-L3 lamina cells vs grey, steady state (last half of the exposure), Hz */
  glance: number;
  /** fraction of lamina columns changed more than twice the mean */
  hotFraction: number;
  /** 95th percentile change over the mean change */
  peakRatio: number;
  /** the left eye's mean change over the sum of both eyes' mean changes, 0..1 */
  leftShare: number;
  /** fraction of lamina columns that barely changed: the page's quiet areas as the eye sees them */
  quietFraction: number;
  /** glance per 100 ms window over the exposure */
  series: number[];
  /** last window over the peak window: 1 means no fading */
  hold: number;
  /** blue-channel (R8p) minus green-channel (R8y) receptor rate change, Hz */
  blueMinusGreen: number;
  /** mean receptor rate during the exposure, Hz (brightness proxy) */
  receptorHz: number;
  /** share of the lamina change in the top half of the screen, 0..1 */
  topShare: number;
  /** centre of mass of the hottest columns, screen [0,1]; null when nothing stands out */
  landing: { u: number; v: number; strength: number } | null;
}

/** Per-column change for painting on the screenshot: one entry per L1-L3 lamina cell. */
export interface Heat { u: Float32Array; v: Float32Array; d: Float32Array; mean: number; peak: number }

export type WorkerCommand =
  | { type: 'init'; circuit: CircuitData; dtMs?: number }
  | { type: 'reset' }
  | { type: 'settle'; settleMs: number; measureMs: number }
  | { type: 'frame'; rgba: ArrayBuffer | null }
  | { type: 'advance'; ms: number; budgetMs: number }
  | { type: 'judge'; frame: ArrayBuffer; exposureMs: number }
  | { type: 'judge-continue' }
  | { type: 'abort' };

export interface Snapshot {
  type: 'snapshot';
  flyMs: number;
  advancedMs: number;
  spikes: number;
  wallMs: number;
  activity: Float32Array;
  rate: Float32Array;
  /** |rate - baseline| per cell, 0 before a baseline exists */
  glance: Float32Array;
  glanceMeanHz: number;
  hasBaseline: boolean;
  /** during judging: what is on the fly's screen right now */
  showing?: { variant: Variant | 'grey' };
}

export type JudgeEvent =
  | { type: 'judge-step'; step: 'settle' | 'baseline' | 'show'; variant?: Variant; flyMs: number; baselineLaminaHz?: number }
  | { type: 'judge-measure'; variant: Variant; metrics: Metrics; flyMs: number }
  | { type: 'judge-heat'; heat: Heat }
  | { type: 'judge-done'; flyMs: number; wallMs: number }
  | { type: 'judge-aborted' };

export type WorkerEvent =
  | { type: 'ready'; manifest: CircuitManifest; types: string[]; dtMs: number }
  | { type: 'reset' }
  | { type: 'settled'; baselineRate: Float32Array; flyMs: number }
  | Snapshot
  | JudgeEvent
  | { type: 'error'; message: string };
