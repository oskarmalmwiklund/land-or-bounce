/**
 * POST /api/card  (body: image/jpeg or image/png, at most 2.5 MB)
 *
 * Stores a verdict card in Vercel Blob so a shared link can carry it as its preview image.
 * Returns { id, url }. The id goes into the share link as `card=`; /api/page turns it back
 * into an og:image. Anything that is not a JPEG or PNG is refused. Without a Blob token (local dev
 * before `vercel env pull`) it answers 503 and the page shares without a preview.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';

const MAX_BYTES = 2_500_000;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => { size += c.length; if (size > limit) { resolve(null); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') { json(res, 405, { error: 'POST a PNG' }); return; }
  if (!process.env.BLOB_READ_WRITE_TOKEN) { json(res, 503, { error: 'No card store here.' }); return; }
  const body = await readBody(req, MAX_BYTES).catch(() => null);
  if (!body) { json(res, 413, { error: 'That card is too big.' }); return; }
  const kind = body.length > 100 && body.subarray(0, 8).equals(PNG_MAGIC) ? 'png' : body.length > 100 && body.subarray(0, 3).equals(JPEG_MAGIC) ? 'jpg' : null;
  if (!kind) { json(res, 415, { error: 'JPEG or PNG only.' }); return; }
  try {
    const { put } = await import('@vercel/blob');
    const id = randomBytes(12).toString('hex');
    const blob = await put(`cards/${id}.${kind}`, body, { access: 'public', contentType: kind === 'png' ? 'image/png' : 'image/jpeg', addRandomSuffix: false, cacheControlMaxAge: 60 * 60 * 24 * 365 });
    json(res, 200, { id, url: blob.url });
  } catch (err) {
    console.error('card upload failed', err);
    json(res, 500, { error: 'Could not store the card.' });
  }
}
