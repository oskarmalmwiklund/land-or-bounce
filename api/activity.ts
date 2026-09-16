import type { IncomingMessage, ServerResponse } from 'node:http';
import { db } from '../src/server/science-db.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'GET activity or POST a heartbeat.' })); return; }
  if (!process.env.DATABASE_URL) { res.statusCode = 503; res.end(JSON.stringify({ error: 'Activity is unavailable.' })); return; }
  try {
    const sql = db();
    if (req.method === 'POST') {
      const id = new URL(req.url ?? '/', 'http://localhost').searchParams.get('visit');
      if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid visit.' })); return;
      }
      await sql`INSERT INTO site_activity (id, last_seen) VALUES (${id}, now()) ON CONFLICT (id) DO UPDATE SET last_seen = now()`;
      await sql`DELETE FROM site_activity WHERE last_seen < now() - interval '90 seconds'`;
    }
    const [totals] = await sql`SELECT
      (SELECT count(*) FROM site_activity WHERE last_seen >= now() - interval '90 seconds') AS active_visits,
      (SELECT count(*) FROM (
        SELECT s.id FROM science_sessions s JOIN science_comparisons c ON c.session_id = s.id
        WHERE s.completed_at IS NOT NULL AND c.round_number BETWEEN 1 AND 5
        GROUP BY s.id HAVING count(DISTINCT c.round_number) = 5
      ) completed) AS completed_experiments`;
    res.statusCode = 200;
    res.end(JSON.stringify({ activeVisits: Number(totals.active_visits), completedExperiments: Number(totals.completed_experiments) }));
  } catch (error) {
    console.error('activity failed', error);
    res.statusCode = 500; res.end(JSON.stringify({ error: 'Activity is unavailable.' }));
  }
}
