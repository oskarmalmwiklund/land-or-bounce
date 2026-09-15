/**
 * GET /verdict?site=example.com&card=<id>&score=72   (rewritten here by vercel.json; a path
 * with no static file, since Vercel serves an existing file before it applies rewrites)
 *
 * The page itself is static, and link crawlers do not run scripts, so a shared verdict
 * needs its meta tags written on the server. This serves the built index.html with the
 * title, description and preview image swapped for that verdict's card. Everything else
 * about the page is unchanged: the script still reads `site` and re-runs the fly.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * The score bands, copied from src/judge/score.ts: Vercel's function bundler does not resolve
 * a .ts import from outside api/ at runtime. src/judge/score.test.ts checks the two agree.
 */
export const PAGE_BANDS: { min: number; title: string; line: string }[] = [
  { min: 85, title: 'Landed. Laid eggs.', line: 'The fly is not leaving. Neither is anyone else.' },
  { min: 70, title: 'Landed.', line: 'Clean approach, one clear place to sit. The fly stayed.' },
  { min: 50, title: 'Landed, barely.', line: 'Touched down, looked around, is thinking about it.' },
  { min: 35, title: 'Hovered. Left.', line: 'Circled twice, found nowhere to sit, went back to the lamp.' },
  { min: 20, title: 'Bounced.', line: 'Hit the glass and kept going.' },
  { min: 0, title: 'Bounced off the glass.', line: 'The fly did not notice there was a page.' },
];

let indexHtml: { at: number; html: string } | null = null;

async function loadIndex(origin: string): Promise<string> {
  if (indexHtml && Date.now() - indexHtml.at < 5 * 60_000) return indexHtml.html;
  const res = await fetch(`${origin}/index.html`, { headers: { 'x-page-fn': '1' } });
  if (!res.ok) throw new Error(`index.html ${res.status}`);
  const html = await res.text();
  indexHtml = { at: Date.now(), html };
  return html;
}

async function cardImage(id: string): Promise<string | null> {
  if (!/^[a-f0-9]{24}$/.test(id) || !process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const { list } = await import('@vercel/blob');
    const { blobs } = await list({ prefix: `cards/${id}.`, limit: 1 });
    return blobs[0]?.url ?? null;
  } catch { return null; }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const setMeta = (html: string, attr: 'property' | 'name', key: string, value: string) => {
  const re = new RegExp(`<meta ${attr}="${key}" content="[^"]*" />`);
  const tag = `<meta ${attr}="${key}" content="${esc(value)}" />`;
  return re.test(html) ? html.replace(re, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
};

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'land-or-bounce.vercel.app';
  const proto = (req.headers['x-forwarded-proto'] as string) || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https');
  const origin = `${proto}://${host}`;
  const q = new URL(req.url ?? '/', origin).searchParams;
  const site = (q.get('site') ?? '').replace(/^https?:\/\//, '').slice(0, 120);
  const score = Math.max(0, Math.min(100, Math.round(Number(q.get('score')))));
  const hasScore = q.has('score') && Number.isFinite(Number(q.get('score')));
  const science = q.get('science') === '1';
  const agreementValue = Number(q.get('agreement'));
  const agreement = Number.isFinite(agreementValue) ? Math.max(0, Math.min(100, Math.round(agreementValue))) : 0;
  try {
    let html = await loadIndex(origin);
    const image = q.get('card') ? await cardImage(q.get('card')!) : null;
    const band = hasScore ? PAGE_BANDS.find((b) => score >= b.min)! : null;
    const title = science ? `${agreement}% fly match — would your eyes agree?` : site && band ? `${site} scored ${score}/100 with a fruit fly’s eye. ${band.title}` : 'Land or Bounce — a fruit fly scores your landing page';
    const description = science ? `I agreed with the fruit fly ${agreement}% of the time. Make five quick landing-page choices and compare your eyes with 29,195 fly neurons.` : band ? `${band.line} 29,195 real neurons of a fruit fly’s eye looked at ${site}. Release the fly on your own landing page.` : 'Give a fruit fly your landing page. 29,195 real neurons of its eye look at it live in your browser and score it 0 to 100.';
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
    html = setMeta(html, 'property', 'og:title', title);
    html = setMeta(html, 'property', 'og:description', description);
    html = setMeta(html, 'name', 'description', description);
    const canonical = new URLSearchParams(); if (site) canonical.set('site', site); if (q.get('card')) canonical.set('card', q.get('card')!); if (hasScore) canonical.set('score', String(score)); if (science) { canonical.set('science', '1'); canonical.set('agreement', String(agreement)); }
    html = setMeta(html, 'property', 'og:url', `${origin}/verdict?${canonical}`);
    html = setMeta(html, 'property', 'og:image', image ?? `${origin}/og.png`);
    html = setMeta(html, 'property', 'og:image:width', '1200');
    html = setMeta(html, 'property', 'og:image:height', '630');
    html = setMeta(html, 'name', 'twitter:card', 'summary_large_image');
    html = setMeta(html, 'name', 'twitter:image', image ?? `${origin}/og.png`);
    html = setMeta(html, 'name', 'twitter:title', title);
    html = setMeta(html, 'name', 'twitter:description', description);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.end(html);
  } catch (err) {
    console.error('page failed', err);
    res.statusCode = 302;
    res.setHeader('Location', `/?site=${encodeURIComponent(site)}`);
    res.end();
  }
}
