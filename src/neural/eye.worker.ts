/// <reference lib="webworker" />
/**
 * The eye lives here. Two modes: "look", where the page streams frames and asks for fly
 * time to pass; and "judge", where the worker shows one landing page through a fixed
 * protocol (the page, then the page as a human sees its brightness) and reports
 * measurements as it goes. No DOM, no rendering.
 */
import { groups, heat, metrics, OPERATING_GREY, variantsOf, type Groups } from '../judge/measure';
import { EyeBrain } from './EyeBrain';
import { type Circuit, fromData } from './circuit';
import { VARIANTS, type Snapshot, type WorkerCommand, type WorkerEvent } from './protocol';

let brain: EyeBrain | null = null;
let circuit: Circuit | null = null;
let g: Groups | null = null;
let baseline: Float32Array | null = null;      // per-cell EMA rate on grey, for the live glance map
let baseCounts: Int32Array | null = null;      // per-cell spikes over the baseline window
let baseSec = 0.5;
let abortRequested = false;
let clock = 0;                                 // fly ms since the judge started (restores do not rewind it)
let continueResolve: (() => void) | null = null;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Pause the protocol until the page says the narration has caught up. The eye keeps
 *  looking at the current frame meanwhile, so nothing freezes. */
async function waitForNarration(showing: NonNullable<Snapshot['showing']>): Promise<void> {
  const b = brain!;
  let resolved = false;
  const gate = new Promise<void>((res) => { continueResolve = () => { resolved = true; res(); }; });
  let acc = 0, spikes = 0, wall = performance.now();
  while (!resolved && !abortRequested) {
    spikes += b.advance(10); clock += 10; acc += 10;
    if (acc >= 50) { postSnapshot(snapshot(50, spikes, performance.now() - wall, showing, clock)); acc = 0; spikes = 0; wall = performance.now(); }
    await sleep(18);
  }
  continueResolve = null;
  await gate.catch(() => undefined);
}

const post = (e: WorkerEvent, transfer: Transferable[] = []) => (self as any).postMessage(e, transfer);

function snapshot(ms: number, spikes: number, wallMs: number, showing?: Snapshot['showing'], flyMs?: number): Snapshot {
  const b = brain!;
  const glance = new Float32Array(b.n);
  let glanceMean = 0;
  for (let i = 0; i < b.n; i++) glance[i] = baseline ? Math.abs(b.rate[i] - baseline[i]) : 0;
  for (let k = 0; k < g!.lamina.length; k++) glanceMean += glance[g!.lamina[k]];
  return {
    type: 'snapshot', flyMs: flyMs ?? b.step * b.dt, advancedMs: ms, spikes, wallMs,
    activity: b.activity.slice(), rate: b.rate.slice(), glance,
    glanceMeanHz: g!.lamina.length ? glanceMean / g!.lamina.length : 0,
    hasBaseline: baseline !== null, showing,
  };
}

function postSnapshot(snap: Snapshot) { post(snap, [snap.activity.buffer, snap.rate.buffer, snap.glance.buffer]); }

/** Grey settle, then a baseline window. Leaves the brain in the settled state. */
function settleAndBaseline(settleMs: number, measureMs: number): void {
  const b = brain!;
  b.reset();
  b.setFrame(null, OPERATING_GREY);
  for (let t = 0; t < settleMs; t += 10) b.advance(10);
  b.resetCounts();
  for (let t = 0; t < measureMs; t += 10) b.advance(10);
  baseline = b.rate.slice();
  baseCounts = b.counts.slice();
  baseSec = measureMs / 1000;
  b.resetCounts();
}

/** Show one frame for `exposureMs`, returning steady counts and per-window counts. */
function present(frame: Uint8ClampedArray, exposureMs: number, showing: NonNullable<Snapshot['showing']>, windowMs = 100): { steady: Int32Array; windows: Int32Array[] } {
  const b = brain!;
  const windows: Int32Array[] = [];
  const steady = new Int32Array(b.n);
  const half = exposureMs / 2;
  let windowStart = 0;
  let wallStart = performance.now();
  b.setFrame(frame);
  for (let t = 0; t < exposureMs; t += 10) {
    b.resetCounts();
    const spikes = b.advance(10);
    clock += 10;
    if (t >= half) for (let i = 0; i < b.n; i++) steady[i] += b.counts[i];
    if (!windows.length || t - windowStart >= windowMs) { windows.push(new Int32Array(b.n)); windowStart = t; }
    const w = windows[windows.length - 1];
    for (let i = 0; i < b.n; i++) w[i] += b.counts[i];
    if ((t + 10) % 50 === 0) { postSnapshot(snapshot(50, spikes * 5, performance.now() - wallStart, showing, clock)); wallStart = performance.now(); }
  }
  return { steady, windows };
}

async function runJudge(frame: ArrayBuffer, exposureMs: number): Promise<void> {
  const b = brain!;
  const t0 = performance.now();
  abortRequested = false;
  clock = 0;
  post({ type: 'judge-step', step: 'settle', flyMs: clock });
  settleAndBaseline(500, 500);
  clock = 1000;
  let laminaBase = 0;
  for (let k = 0; k < g!.lamina.length; k++) laminaBase += baseCounts![g!.lamina[k]];
  post({ type: 'judge-step', step: 'baseline', flyMs: clock, baselineLaminaHz: laminaBase / g!.lamina.length / baseSec });
  const settled = b.snapshot();
  await waitForNarration({ variant: 'grey' });
  const frames = variantsOf(new Uint8ClampedArray(frame));
  for (const variant of VARIANTS) {
    if (abortRequested) { post({ type: 'judge-aborted' }); return; }
    b.restore(settled);
    post({ type: 'judge-step', step: 'show', variant, flyMs: clock });
    const { steady, windows } = present(frames[variant], exposureMs, { variant });
    const m = metrics(g!, steady, exposureMs / 2000, baseCounts!, baseSec, windows, 0.1);
    if (variant === 'page') {
      const h = heat(g!, steady, exposureMs / 2000, baseCounts!, baseSec);
      post({ type: 'judge-heat', heat: h }, [h.u.buffer, h.v.buffer, h.d.buffer]);
    }
    post({ type: 'judge-measure', variant, metrics: m, flyMs: clock });
    await waitForNarration({ variant });
  }
  if (abortRequested) { post({ type: 'judge-aborted' }); return; }
  b.restore(settled);
  b.setFrame(frames.page);
  post({ type: 'judge-done', flyMs: clock, wallMs: performance.now() - t0 });
}

self.onmessage = async (event: MessageEvent<WorkerCommand>) => {
  const msg = event.data;
  try {
    if (msg.type === 'init') {
      circuit = fromData(msg.circuit);
      brain = new EyeBrain(circuit, msg.dtMs ?? 0.1);
      g = groups(circuit);
      post({ type: 'ready', manifest: circuit.manifest, types: circuit.manifest.types, dtMs: brain.dt });
      return;
    }
    if (!brain || !circuit) throw new Error('worker not initialised');
    switch (msg.type) {
      case 'reset':
        brain.reset(); baseline = null; post({ type: 'reset' }); return;
      case 'settle':
        settleAndBaseline(msg.settleMs, msg.measureMs);
        post({ type: 'settled', baselineRate: baseline!.slice(), flyMs: brain.step * brain.dt });
        return;
      case 'frame':
        brain.setFrame(msg.rgba ? new Uint8ClampedArray(msg.rgba) : null, OPERATING_GREY); return;
      case 'advance': {
        const t0 = performance.now();
        let spikes = 0, left = msg.ms;
        while (left > 0) {
          spikes += brain.advance(Math.min(10, left)); left -= 10;
          if (performance.now() - t0 > msg.budgetMs) break;
        }
        postSnapshot(snapshot(msg.ms - Math.max(0, left), spikes, performance.now() - t0));
        return;
      }
      case 'judge': void runJudge(msg.frame, msg.exposureMs); return;
      case 'judge-continue': continueResolve?.(); return;
      case 'abort': abortRequested = true; continueResolve?.(); return;
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
