import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { put } from '@vercel/blob';
import { db, inferCategory, SCORING_VERSION, SIMULATOR_VERSION } from '../src/server/science-db.js';

const MAX_BODY = 3_500_000;
const MAX_IMAGE = 2_500_000;

function reply(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function bodyOf(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let size = 0;
    req.on('data', (chunk: Buffer) => { size += chunk.length; if (size > MAX_BODY) { reject(new Error('too-large')); req.destroy(); return; } chunks.push(chunk); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('invalid-json')); } });
    req.on('error', reject);
  });
}

type Submission = {
  url?: unknown; hostname?: unknown; screenshot?: unknown; width?: unknown; height?: unknown;
  score?: unknown; metrics?: unknown; consent?: unknown; title?: unknown;
};

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') { reply(res, 405, { error: 'POST a submission.' }); return; }
  if (!process.env.DATABASE_URL || !process.env.BLOB_READ_WRITE_TOKEN) { reply(res, 503, { error: 'Science storage is not configured.' }); return; }
  try {
    const input = await bodyOf(req) as Submission;
    if (input.consent !== true) { reply(res, 400, { error: 'Science-pool consent is required.' }); return; }
    if (typeof input.url !== 'string' || typeof input.hostname !== 'string' || typeof input.screenshot !== 'string') { reply(res, 400, { error: 'Missing submission data.' }); return; }
    const parsed = new URL(input.url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.hostname.replace(/^www\./, '') !== input.hostname.replace(/^www\./, '')) { reply(res, 400, { error: 'The page URL does not match its hostname.' }); return; }
    const match = /^data:image\/jpeg;base64,([a-z0-9+/=]+)$/i.exec(input.screenshot);
    if (!match) { reply(res, 415, { error: 'The screenshot must be a JPEG.' }); return; }
    const image = Buffer.from(match[1], 'base64');
    if (image.length < 100 || image.length > MAX_IMAGE || image[0] !== 0xff || image[1] !== 0xd8) { reply(res, 413, { error: 'The screenshot is invalid or too large.' }); return; }
    const score = input.score as { total?: unknown; parts?: unknown };
    if (!Number.isInteger(score?.total) || Number(score.total) < 0 || Number(score.total) > 100 || !Array.isArray(score.parts)) { reply(res, 400, { error: 'Invalid fly score.' }); return; }
    const part = (key: string) => Number((score.parts as Array<{ key?: string; score?: number }>).find((p) => p.key === key)?.score);
    const parts = ['notice', 'spot', 'calm', 'balance', 'colour'].map(part);
    if (parts.some((value) => !Number.isInteger(value) || value < 0 || value > 100)) { reply(res, 400, { error: 'Invalid score parts.' }); return; }
    const width = Math.max(1, Math.min(4000, Number(input.width) || 1440));
    const height = Math.max(1, Math.min(4000, Number(input.height) || 810));
    const hash = createHash('sha256').update(image).digest('hex');
    const title = typeof input.title === 'string' ? input.title.slice(0, 200) : '';
    const category = inferCategory(input.hostname, title);
    const sql = db();
    const existing = await sql`SELECT c.id FROM science_captures c WHERE c.screenshot_hash = ${hash} LIMIT 1`;
    if (existing.length) { reply(res, 200, { id: existing[0].id, duplicate: true }); return; }
    const imageId = randomUUID();
    const blob = await put(`science/screenshots/${imageId}.jpg`, image, { access: 'public', contentType: 'image/jpeg', addRandomSuffix: false, cacheControlMaxAge: 60 * 60 * 24 * 365 });
    const siteRows = await sql`INSERT INTO science_sites (canonical_url, hostname, page_title, category) VALUES (${parsed.href}, ${input.hostname}, ${title}, ${category}) ON CONFLICT (canonical_url) DO UPDATE SET hostname = EXCLUDED.hostname, page_title = EXCLUDED.page_title, category = EXCLUDED.category RETURNING id`;
    const captureRows = await sql`INSERT INTO science_captures (site_id, screenshot_url, screenshot_hash, viewport_width, viewport_height, consented_for_science) VALUES (${siteRows[0].id}, ${blob.url}, ${hash}, ${width}, ${height}, true) RETURNING id`;
    const captureId = captureRows[0].id;
    await sql`INSERT INTO science_fly_runs (capture_id, total_score, notice, landing_spot, calm, balance, colour, raw_metrics, simulator_version, scoring_version) VALUES (${captureId}, ${score.total as number}, ${parts[0]}, ${parts[1]}, ${parts[2]}, ${parts[3]}, ${parts[4]}, ${JSON.stringify(input.metrics ?? {})}::jsonb, ${SIMULATOR_VERSION}, ${SCORING_VERSION})`;
    reply(res, 201, { id: captureId, category });
  } catch (error) {
    console.error('science submission failed', error);
    reply(res, error instanceof Error && error.message === 'too-large' ? 413 : 500, { error: 'Could not add this page to the experiment.' });
  }
}
