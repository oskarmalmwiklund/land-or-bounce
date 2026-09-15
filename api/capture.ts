/**
 * GET /api/capture?url=https://example.com
 *
 * Screenshots a landing page at 1440x810 (16:9, the fly's screen shape) with a headless
 * Chromium, one viewport per fold, scrolling between shots (`folds`, default 3, max 4), and
 * returns them as JPEG data URLs plus the final URL and title.
 * Runs on Vercel with @sparticuz/chromium and locally with the machine's Chrome
 * (`CHROME_PATH`, or the macOS default). Written against Node's http types only, so the
 * same function serves Vercel and the Vite dev middleware.
 *
 * Only public http(s) hosts are fetched: private, loopback and link-local addresses are
 * refused before and after redirects. This is a toy, not a proxy.
 */
import { lookup } from 'node:dns/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isIP } from 'node:net';
import type { Browser } from 'puppeteer-core';

export const WIDTH = 1440;
export const HEIGHT = 810;
const NAV_TIMEOUT_MS = 14_000;
const CAPTURE_DEADLINE_MS = 45_000;
const SETTLE_MS = 650;
const FOLD_SETTLE_MS = 300;
export const MAX_FOLDS = 4;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export class CaptureError extends Error {
  constructor(readonly status: number, message: string, readonly hint?: string) { super(message); }
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6 === '::' || v6 === '::1' || v6.startsWith('fe80') || v6.startsWith('fc') || v6.startsWith('fd')) return true;
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return false;
}

/** Normalise what the visitor typed into a public http(s) URL, or throw. */
export function normaliseUrl(raw: string): URL {
  let text = raw.trim();
  if (!text) throw new CaptureError(400, 'Give me a website.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
  let url: URL;
  try { url = new URL(text); } catch { throw new CaptureError(400, 'That does not look like a web address.'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new CaptureError(400, 'Only http and https, please.');
  if (url.username || url.password) throw new CaptureError(400, 'No credentials in the address.');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') && !isIP(host))
    throw new CaptureError(400, 'I can only fly to public websites.', 'For a local page, drop a screenshot instead.');
  if (isIP(host) && isPrivateIp(host)) throw new CaptureError(400, 'I can only fly to public websites.', 'For a local page, drop a screenshot instead.');
  return url;
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) { if (isPrivateIp(host)) throw new CaptureError(400, 'I can only fly to public websites.'); return; }
  let addresses: { address: string }[];
  try { addresses = await lookup(host, { all: true }); }
  catch { throw new CaptureError(404, `I could not find ${host}.`, 'Check the spelling, or drop a screenshot.'); }
  if (!addresses.length || addresses.some((a) => isPrivateIp(a.address))) throw new CaptureError(400, 'I can only fly to public websites.');
}

async function launch(): Promise<Browser> {
  const puppeteer = (await import('puppeteer-core')).default;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import('@sparticuz/chromium')).default;
    return puppeteer.launch({ args: [...chromium.args, '--hide-scrollbars', '--lang=en-US'], executablePath: await chromium.executablePath(), headless: true, defaultViewport: null });
  }
  const executablePath = process.env.CHROME_PATH
    || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/usr/bin/google-chrome');
  return puppeteer.launch({ executablePath, headless: true, args: ['--hide-scrollbars', '--lang=en-US', '--disable-gpu'], defaultViewport: null });
}

export interface Capture {
  url: string; finalUrl: string; title: string;
  /** the first fold */
  image: string;
  /** every fold captured, the first included, top to bottom */
  folds: string[];
  pageHeight: number; width: number; height: number; ms: number;
}

/** Screenshot the page. Throws CaptureError with a message the fly can say out loud. */
export async function capture(raw: string, folds = 3): Promise<Capture> {
  folds = Math.max(1, Math.min(MAX_FOLDS, Math.floor(folds) || 1));
  const t0 = Date.now();
  const url = normaliseUrl(raw);
  await assertPublicHost(url.hostname);
  const browser = await launch();
  let deadlineReached = false;
  const deadline = setTimeout(() => {
    deadlineReached = true;
    void browser.close();
  }, CAPTURE_DEADLINE_MS);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      let ok = false;
      try {
        const u = new URL(req.url());
        const h = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
        ok = (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'data:' || u.protocol === 'blob:')
          && h !== 'localhost' && !(isIP(h) && isPrivateIp(h)) && !h.endsWith('.internal') && !h.endsWith('.local');
        if (req.resourceType() === 'media') ok = false;
      } catch { ok = false; }
      void (ok ? req.continue() : req.abort('blockedbyclient'));
    });
    let response;
    try {
      response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/ERR_NAME_NOT_RESOLVED/.test(msg)) throw new CaptureError(404, `I could not find ${url.hostname}.`, 'Check the spelling, or drop a screenshot.');
      if (/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_SSL|ERR_CERT/.test(msg)) throw new CaptureError(502, `${url.hostname} would not let me in.`, 'Drop a screenshot and I will judge that.');
      if (/timeout/i.test(msg)) throw new CaptureError(504, `${url.hostname} took too long to open.`, 'Try again, or drop a screenshot.');
      throw new CaptureError(502, `I could not open ${url.hostname}.`, 'Drop a screenshot and I will judge that.');
    }
    if (response && response.status() >= 400) throw new CaptureError(502, `${url.hostname} answered ${response.status()}.`, 'Drop a screenshot and I will judge that.');
    // Let the network go quiet for a moment if it will, then give fonts and entrance animations a beat.
    await Promise.race([page.waitForNetworkIdle({ idleTime: 350, timeout: 3500 }).catch(() => undefined), new Promise((r) => setTimeout(r, 3500))]);
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    const finalUrl = page.url();
    try { await assertPublicHost(new URL(finalUrl).hostname); } catch { throw new CaptureError(400, 'That address led somewhere I will not go.'); }
    const title = (await page.title().catch(() => '')).slice(0, 120);
    // `clip` is in document coordinates, so the viewport is clipped at the current scroll offset
    const shot = async (scrollY = 0) => `data:image/jpeg;base64,${Buffer.from(await page.screenshot({ type: 'jpeg', quality: 82, captureBeyondViewport: false, clip: { x: 0, y: scrollY, width: WIDTH, height: HEIGHT } })).toString('base64')}`;
    const images = [await shot()];
    let pageHeight = HEIGHT;
    try { pageHeight = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0)); } catch { /* keep one fold */ }
    // the folds below: scroll one viewport at a time, give lazy images a beat, shoot the viewport
    for (let k = 1; k < folds; k++) {
      const target = k * HEIGHT;
      if (target >= pageHeight - HEIGHT * 0.25) break;
      let y = 0;
      try { y = await page.evaluate((t: number) => { window.scrollTo({ top: t, behavior: 'instant' as ScrollBehavior }); return window.scrollY; }, target); } catch { break; }
      if (y < target * 0.5) break;                 // the page would not scroll (a fixed-height app shell)
      await new Promise((r) => setTimeout(r, FOLD_SETTLE_MS));
      images.push(await shot(y));
    }
    return { url: url.href, finalUrl, title, image: images[0], folds: images, pageHeight, width: WIDTH, height: HEIGHT, ms: Date.now() - t0 };
  } catch (error) {
    if (deadlineReached) throw new CaptureError(504, `${url.hostname} took too long to capture.`, 'Try again, or drop a screenshot.');
    throw error;
  } finally {
    clearTimeout(deadline);
    await browser.close().catch(() => undefined);
  }
}

function json(res: ServerResponse, status: number, body: unknown, cache?: string): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (cache) res.setHeader('Cache-Control', cache);
  res.end(JSON.stringify(body));
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') { json(res, 405, { error: 'GET only' }); return; }
  const q = new URL(req.url ?? '/', 'http://x').searchParams;
  const raw = q.get('url') ?? '';
  const folds = Number(q.get('folds') ?? 3);
  try {
    const result = await capture(raw, Number.isFinite(folds) ? folds : 3);
    json(res, 200, result, 'public, s-maxage=900, stale-while-revalidate=3600');
  } catch (err) {
    if (err instanceof CaptureError) { json(res, err.status, { error: err.message, hint: err.hint }, 'no-store'); return; }
    console.error('capture failed', err);
    json(res, 500, { error: 'Something in the kitchen went wrong.', hint: 'Try again, or drop a screenshot.' }, 'no-store');
  }
}
