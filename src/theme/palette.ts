/**
 * Land or Bounce palette: a kitchen at night. Espresso-dark walls, one amber lamp, a bowl
 * of overripe fruit. Banana yellow is the action colour and the LANDED stamp; plum is the
 * BOUNCED stamp; cream is the text. The heat map over the page is lamp-coloured, because
 * to the fly the interesting parts of your page are the light.
 */
export const palette = {
  ground: '#17110E',
  groundDeep: '#0E0A08',
  raised: '#241B16',
  line: '#3B2E26',
  lineSoft: '#2C221C',
  cream: '#F6ECDC',
  creamMuted: '#B9A78F',
  creamFaint: '#7E705F',
  lamp: '#FFB347',
  lampGlow: '#FF9E2C',
  banana: '#FFD23F',
  bananaEdge: '#C99E12',
  bananaInk: '#4A3800',
  plum: '#C2427A',
  plumEdge: '#8A2856',
  plumInk: '#FFE3EF',
  leaf: '#8FD16A',
  flyBody: '#1A1410',
  flyEye: '#B8322E',
  /** The fly's screen at rest: 128 grey, the value the worker uses for blanks. */
  screen: '#808080',
} as const;

export function applyPalette(style: Pick<CSSStyleDeclaration, 'setProperty'>): void {
  for (const [key, value] of Object.entries(palette)) {
    const name = key.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`);
    style.setProperty(`--${name}`, value);
  }
}
