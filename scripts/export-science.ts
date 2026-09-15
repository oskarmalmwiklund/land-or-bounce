import { writeFile } from 'node:fs/promises';
import { db, SCIENCE_SCHEMA_VERSION } from '../src/server/science-db';

const sql = db();
const [captures, comparisons] = await Promise.all([
  sql`SELECT c.id AS capture_id, s.canonical_url, s.hostname, s.page_title, s.category, c.screenshot_url, c.screenshot_hash, c.viewport_width, c.viewport_height, c.fold, c.captured_at, f.total_score, f.notice, f.landing_spot, f.calm, f.balance, f.colour, f.raw_metrics, f.simulator_version, f.scoring_version FROM science_captures c JOIN science_sites s ON s.id = c.site_id JOIN science_fly_runs f ON f.capture_id = c.id WHERE c.consented_for_science = true ORDER BY c.captured_at`,
  sql`SELECT id, session_id, left_capture_id, right_capture_id, chosen_capture_id, fly_choice_id, response_ms, round_number, prompt_version, created_at FROM science_comparisons ORDER BY created_at`,
]);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const path = `science-export-${stamp}.json`;
await writeFile(path, JSON.stringify({ exportedAt: new Date().toISOString(), schemaVersion: SCIENCE_SCHEMA_VERSION, captures, comparisons }, null, 2));
console.log(`Wrote ${captures.length} captures and ${comparisons.length} comparisons to ${path}`);
