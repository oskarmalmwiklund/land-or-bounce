/**
 * Turns the worker's measurements into the fly's running commentary. Every sentence is
 * tied to a number that was just measured; the voice is first person because it reads
 * better, not because anything here is cognition.
 */
import type { JudgeEvent, Metrics, Variant } from '../neural/protocol';
import { score, type Score } from './score';

export interface Line { kind: 'step' | 'measure' | 'note' | 'verdict'; text: string; flyMs: number }

const fmt = (x: number, d = 1) => x.toFixed(d);
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** What the scroll found: one entry per fold, the first fold included. */
export interface Scroll { glances: number[]; best: number; total: number }

export class Narrator {
  readonly metrics: Partial<Record<Variant, Metrics>> = {};
  /** metrics for the folds below the first, in order (fold 2 at index 0) */
  readonly folds: Metrics[] = [];
  baselineHz = 0;

  constructor(readonly host: string) {}

  lines(e: JudgeEvent): Line[] {
    const out: Line[] = [];
    const push = (kind: Line['kind'], text: string) => out.push({ kind, text, flyMs: 'flyMs' in e ? e.flyMs : 0 });
    const site = this.host;
    switch (e.type) {
      case 'judge-step':
        if (e.step === 'settle') push('step', 'Grey screen first. Letting my eye settle so nothing carries over from the lamp.');
        else if (e.step === 'baseline') {
          this.baselineHz = e.baselineLaminaHz ?? 0;
          push('measure', `Resting. On grey my lamina fires at ${fmt(this.baselineHz)} Hz. Everything from here is a change from that.`);
        } else if (e.step === 'show') {
          if (e.variant === 'page') push('step', `Here goes. Adapting to how bright ${site} is, then looking at it for one second.`);
          else if (e.variant === 'fold') push('step', e.fold === 2 ? `Now I scroll. Fold ${e.fold} of ${e.folds}, one screen down.` : `Further down. Fold ${e.fold} of ${e.folds}.`);
          else push('step', 'Now the page as a human sees brightness, in grey. I want to know what I am missing.');
        }
        break;
      case 'judge-measure': {
        const m = e.metrics;
        if (e.variant === 'fold') {
          this.folds.push(m);
          const page = this.metrics.page!;
          const ratio = page.glance > 0 ? m.glance / page.glance : 1;
          const where = m.landing ? (m.landing.u < 0.4 ? 'on the left' : m.landing.u > 0.6 ? 'on the right' : 'in the middle') : null;
          push('measure', m.glance < 1.2 ? `Fold ${e.fold}: ${fmt(m.glance)} Hz. Nothing down here. A grey field.`
            : ratio > 1.25 ? `Fold ${e.fold}: ${fmt(m.glance)} Hz. That is more than the top of your page did to me${where ? `, ${where}` : ''}. The good stuff is below the fold.`
            : ratio < 0.6 ? `Fold ${e.fold}: ${fmt(m.glance)} Hz, well under the top of the page. It gets quieter down here.`
            : `Fold ${e.fold}: ${fmt(m.glance)} Hz, about what the top did${where ? `, hottest ${where}` : ''}. It keeps going.`);
          break;
        }
        this.metrics[e.variant] = e.metrics;
        if (e.variant === 'page') {
          push('measure', m.glance < 3 ? `That moved my first synapse by ${fmt(m.glance)} Hz per cell. Barely. Is it on?`
            : m.glance < 7 ? `That moved my first synapse by ${fmt(m.glance)} Hz per cell. I noticed.`
            : `That moved my first synapse by ${fmt(m.glance)} Hz per cell. Oh, I noticed.`);
          const where = m.landing ? (m.landing.v < 0.35 ? 'up top' : m.landing.v > 0.65 ? 'down low' : 'in the middle') + (m.landing.u < 0.4 ? ', on the left' : m.landing.u > 0.6 ? ', on the right' : '') : null;
          push('measure', m.hotFraction < 0.03 ? `${pct(m.hotFraction)} of my columns lit up hard. Nothing stands out. Nowhere to land.`
            : m.hotFraction > 0.22 ? `${pct(m.hotFraction)} of my columns lit up hard. Everything is shouting, so nothing is.`
            : `${pct(m.hotFraction)} of my columns lit up hard, the hottest ${fmt(m.peakRatio)}× above the rest${where ? `, ${where}` : ''}. That is where I would land.`);
          push('measure', m.quietFraction > 0.85 ? `${pct(m.quietFraction)} of my columns are doing nothing. Almost the whole page is quiet. Too quiet.`
            : m.quietFraction > 0.3 ? `${pct(m.quietFraction)} of my columns are at rest. There is room to breathe around the parts that matter.`
            : `Only ${pct(m.quietFraction)} of my columns are at rest. Everything on this page wants my attention at once.`);
          const L = m.leftShare;
          push('measure', L > 0.62 ? `${pct(L)} of that was my left eye. My right eye is on a break. The page leans left.`
            : L < 0.38 ? `${pct(1 - L)} of that was my right eye. My left eye is on a break. The page leans right.`
            : `${pct(L)} left eye, ${pct(1 - L)} right eye. Both eyes working. Balanced.`);
        } else {
          const page = this.metrics.page!;
          const ratio = m.glance > 0 ? page.glance / m.glance : 1;
          push('measure', ratio < 0.8 ? `Human brightness: ${fmt(m.glance)} Hz, against my ${fmt(page.glance)} Hz on the real page. You have contrast I cannot see. I have no red receptors. Whatever is red on ${site} is grey to me.`
            : ratio < 0.95 ? `Human brightness: ${fmt(m.glance)} Hz, against my ${fmt(page.glance)} Hz on the real page. I lose a little. Something on this page is red.`
            : ratio > 1.15 ? `Human brightness: ${fmt(m.glance)} Hz, against my ${fmt(page.glance)} Hz on the real page. I see more than you do. Blue and green carry this page, and those are my colours.`
            : `Human brightness: ${fmt(m.glance)} Hz, against my ${fmt(page.glance)} Hz on the real page. I lose nothing. Your contrast survives a fly.`);
        }
        break;
      }
      case 'judge-done': {
        const s = this.score();
        const sc = this.scroll();
        if (s) push('verdict', `${s.total} out of 100. ${s.band.title} ${s.band.line}` + (sc && sc.total > 1 ? (sc.best === 1 ? ' Everything worth landing on is above the fold.' : ` Fold ${sc.best} of ${sc.total} is where I would land, though; the top is not your best screen.`) : ''));
        push('note', 'I am 29,195 neurons of a fly’s eye and its first synapse. I cannot read, I have never heard of your brand, and I do not know what a button is. This is what your page does to an eye before anyone has thought about it.');
        break;
      }
      case 'judge-aborted':
        push('note', 'Stopped. Back to the lamp.');
        break;
      case 'judge-heat':
        break;
    }
    return out;
  }

  score(): Score | null { return score(this.metrics); }

  /** The folds compared by glance; null before the first fold is measured. */
  scroll(): Scroll | null {
    const page = this.metrics.page;
    if (!page) return null;
    const glances = [page.glance, ...this.folds.map((m) => m.glance)];
    let best = 0;
    for (let k = 1; k < glances.length; k++) if (glances[k] > glances[best] * 1.1) best = k;   // the top wins ties
    return { glances, best: best + 1, total: glances.length };
  }
}
