import type { IncomingMessage, ServerResponse } from 'node:http';
import { db, PROMPT_VERSION } from '../src/server/science-db.js';

function reply(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body));
}
function read(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => { const chunks: Buffer[] = []; let n = 0; req.on('data', (c: Buffer) => { n += c.length; if (n > 20_000) { reject(new Error('too-large')); req.destroy(); return; } chunks.push(c); }); req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('invalid-json')); } }); req.on('error', reject); });
}
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') { reply(res, 405, { error: 'POST a vote.' }); return; }
  if (!process.env.DATABASE_URL) { reply(res, 503, { error: 'Science storage is not configured.' }); return; }
  try {
    const data = await read(req);
    const { sessionId, participantId, leftId, rightId, chosenId, flyChoiceId } = data;
    if (![sessionId, participantId, leftId, rightId, chosenId, flyChoiceId].every(uuid) || ![leftId, rightId].includes(chosenId as string) || ![leftId, rightId].includes(flyChoiceId as string)) { reply(res, 400, { error: 'Invalid comparison.' }); return; }
    const responseMs = Math.round(Number(data.responseMs)); const round = Math.round(Number(data.round));
    if (!Number.isFinite(responseMs) || responseMs < 0 || responseMs > 300_000 || !Number.isInteger(round) || round < 1 || round > 100) { reply(res, 400, { error: 'Invalid timing.' }); return; }
    const viewport = ['mobile', 'desktop'].includes(String(data.viewport)) ? String(data.viewport) : 'unknown';
    const sql = db();
    const inserted = await sql`INSERT INTO science_sessions (id, participant_id, prompt_version, viewport_class) VALUES (${sessionId as string}, ${participantId as string}, ${PROMPT_VERSION}, ${viewport}) ON CONFLICT (participant_id, prompt_version) WHERE participant_id IS NOT NULL DO NOTHING RETURNING id`;
    const existing = inserted.length ? inserted : await sql`SELECT id FROM science_sessions WHERE participant_id = ${participantId as string} AND prompt_version = ${PROMPT_VERSION} LIMIT 1`;
    if (!existing.length) throw new Error('Could not resolve participant session');
    const savedSessionId = String(existing[0].id);
    const comparison = await sql`INSERT INTO science_comparisons (session_id, left_capture_id, right_capture_id, chosen_capture_id, fly_choice_id, response_ms, round_number, prompt_version) VALUES (${savedSessionId}, ${leftId as string}, ${rightId as string}, ${chosenId as string}, ${flyChoiceId as string}, ${responseMs}, ${round}, ${PROMPT_VERSION}) ON CONFLICT (session_id, round_number) DO NOTHING RETURNING id`;
    if (data.completed === true) await sql`UPDATE science_sessions SET completed_at = now() WHERE id = ${savedSessionId}`;
    reply(res, 201, { saved: comparison.length > 0, repeatParticipant: savedSessionId !== sessionId });
  } catch (error) { console.error('science vote failed', error); reply(res, 500, { error: 'Could not save this choice.' }); }
}
