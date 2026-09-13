/** The score rules: blanks bounce, a clear hero on a quiet page lands, and the bands are in order. */
import { describe, expect, it } from 'vitest';
import type { Metrics } from '../neural/protocol';
import { BANDS, WEIGHTS, score } from './score';

function m(over: Partial<Metrics>): Metrics {
  return { glance: 5, hotFraction: 0.1, peakRatio: 3.5, leftShare: 0.5, quietFraction: 0.5, series: [], hold: 1, blueMinusGreen: 0, receptorHz: 20, topShare: 0.5, landing: null, ...over };
}

describe('score', () => {
  it('weights sum to 100', () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it('needs both presentations', () => {
    expect(score({ page: m({}) })).toBeNull();
  });
  it('a blank bounces off the glass', () => {
    const blank = m({ glance: 0.9, hotFraction: 0.36, peakRatio: 4.5, quietFraction: 0.94 });
    const s = score({ page: blank, humangrey: blank })!;
    expect(s.total).toBe(0);
    expect(s.landed).toBe(false);
    expect(s.band.title).toBe(BANDS[BANDS.length - 1].title);
  });
  it('one clear hero on a quiet, balanced page lands', () => {
    const hero = m({ glance: 8, hotFraction: 0.1, peakRatio: 3.6, quietFraction: 0.55, leftShare: 0.5 });
    const s = score({ page: hero, humangrey: hero })!;
    expect(s.total).toBeGreaterThanOrEqual(85);
    expect(s.landed).toBe(true);
  });
  it('red contrast the fly cannot see costs colour points', () => {
    const page = m({ glance: 5 }), grey = m({ glance: 8 });
    const s = score({ page, humangrey: grey })!;
    expect(s.parts.find((p) => p.key === 'colour')!.score).toBe(0);
    expect(s.colourRatio).toBeCloseTo(0.625);
  });
  it('a page that leans on one eye loses balance', () => {
    const lean = m({ leftShare: 0.2 });
    expect(score({ page: lean, humangrey: lean })!.parts.find((p) => p.key === 'balance')!.score).toBe(0);
  });
  it('bands are contiguous and descending', () => {
    expect(BANDS[BANDS.length - 1].min).toBe(0);
    for (let i = 1; i < BANDS.length; i++) expect(BANDS[i].min).toBeLessThan(BANDS[i - 1].min);
    expect(BANDS.find((b) => 50 >= b.min)!.title).toMatch(/Landed/);
    expect(BANDS.find((b) => 49 >= b.min)!.title).not.toMatch(/^Landed/);
  });
});
