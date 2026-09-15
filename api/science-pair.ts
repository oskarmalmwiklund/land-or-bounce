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
    const rows = await sql`SELECT c.id, c.screenshot_url, c.viewport_width, c.viewport_height, s.hostname, f.total_score AS fly_score
      FROM science_captures c JOIN science_sites s ON s.id = c.site_id JOIN science_fly_runs f ON f.capture_id = c.id
      WHERE c.consented_for_science = true ORDER BY random() LIMIT 2`;
    if (rows.length < 2) { reply(res, 404, { error: 'The live pool needs two pages.' }); return; }
    // Left/right ordering comes from this random query and is stored again with every vote.
    reply(res, 200, { left: rows[0], right: rows[1] });
  } catch (error) { console.error('science pair failed', error); reply(res, 500, { error: 'Could not choose a pair.' }); }
}
