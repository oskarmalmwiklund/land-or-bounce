import type { IncomingMessage, ServerResponse } from 'node:http';
import { db } from '../src/server/science-db';

function reply(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body));
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') { reply(res, 405, { error: 'GET a pair.' }); return; }
  if (!process.env.DATABASE_URL) { reply(res, 503, { error: 'Science storage is not configured.' }); return; }
  try {
    const sql = db();
    const rows = await sql`SELECT c.id, c.screenshot_url, c.viewport_width, c.viewport_height, s.hostname, s.category, f.total_score AS fly_score
      FROM science_captures c JOIN science_sites s ON s.id = c.site_id JOIN science_fly_runs f ON f.capture_id = c.id
      WHERE c.consented_for_science = true ORDER BY random() LIMIT 200`;
    if (rows.length < 2) { reply(res, 404, { error: 'The live pool needs two pages.' }); return; }
    const groups = new Map<string, typeof rows>();
    for (const row of rows) groups.set(String(row.category), [...(groups.get(String(row.category)) ?? []), row]);
    const eligible = [...groups.values()].filter((group) => group.length >= 2);
    const pool = eligible.length ? eligible[Math.floor(Math.random() * eligible.length)] : rows;
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    // Left/right ordering comes from this random query and is stored again with every vote.
    reply(res, 200, { left: pool[0], right: pool[1], matched_on: pool[0].category === pool[1].category ? 'category' : 'fallback' });
  } catch (error) { console.error('science pair failed', error); reply(res, 500, { error: 'Could not choose a pair.' }); }
}
