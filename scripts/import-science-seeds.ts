import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { put } from '@vercel/blob';
import { db, SCORING_VERSION, SIMULATOR_VERSION } from '../src/server/science-db';

const seeds = [
  ['https://lovable.dev/', 'ai-builder'], ['https://bolt.new/', 'ai-builder'],
  ['https://stripe.com/en-se', 'payments'], ['https://www.mollie.com/', 'payments'],
  ['https://linear.app/', 'productivity'], ['https://www.notion.com/product', 'productivity'],
  ['https://www.shopify.com/', 'commerce'], ['https://gumroad.com/', 'commerce'],
  ['https://mailchimp.com/', 'marketing'], ['https://www.beehiiv.com/', 'marketing'],
] as const;
const nameOf = (url: string) => url.replace(/^https?:\/\//, '').replace(/[^a-z0-9.]+/gi, '_').slice(0, 60);
const results = JSON.parse(await readFile(new URL('../scratch/calibrate/results.json', import.meta.url), 'utf8')) as Array<Record<string, unknown>>;
const sql = db();

for (const [url, category] of seeds) {
  const name = nameOf(url); const result = results.find((row) => row.name === name);
  if (!result) { console.log(`Skipping ${url}: no successful calibration`); continue; }
  const image = await readFile(new URL(`../scratch/calibrate/${name}.jpg`, import.meta.url));
  const hash = createHash('sha256').update(image).digest('hex');
  const existing = await sql`SELECT id FROM science_captures WHERE screenshot_hash = ${hash} LIMIT 1`;
  if (existing.length) { console.log(`Already seeded ${url}`); continue; }
  const id = randomUUID();
  const blob = await put(`science/screenshots/${id}.jpg`, image, { access: 'public', contentType: 'image/jpeg', addRandomSuffix: false, cacheControlMaxAge: 31536000 });
  const hostname = new URL(url).hostname.replace(/^www\./, '');
  const site = await sql`INSERT INTO science_sites (canonical_url, hostname, page_title, category) VALUES (${url}, ${hostname}, ${hostname}, ${category}) ON CONFLICT (canonical_url) DO UPDATE SET category = EXCLUDED.category RETURNING id`;
  const capture = await sql`INSERT INTO science_captures (site_id, screenshot_url, screenshot_hash, viewport_width, viewport_height, consented_for_science) VALUES (${site[0].id}, ${blob.url}, ${hash}, 1440, 810, true) RETURNING id`;
  const partMap = Object.fromEntries(String(result.parts).split(' ').map((entry) => entry.split(':')));
  await sql`INSERT INTO science_fly_runs (capture_id, total_score, notice, landing_spot, calm, balance, colour, raw_metrics, simulator_version, scoring_version) VALUES (${capture[0].id}, ${Number(result.total)}, ${Number(partMap.notice)}, ${Number(partMap.spot)}, ${Number(partMap.calm)}, ${Number(partMap.balance)}, ${Number(partMap.colour)}, ${JSON.stringify(result.rawMetrics ?? result)}::jsonb, ${SIMULATOR_VERSION}, ${SCORING_VERSION})`;
  console.log(`Seeded ${url} in ${category}`);
}
