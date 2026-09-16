import { writeFile } from 'node:fs/promises';
import { db, SCIENCE_SCHEMA_VERSION } from '../src/server/science-db';
import { loadEnv, parseArgs } from './science-cli';

loadEnv(parseArgs().env);
const sql = db();
const [captures, comparisons] = await Promise.all([
  sql`SELECT c.id AS capture_id, s.canonical_url, s.hostname, s.page_title, s.category, c.screenshot_url, c.screenshot_hash, c.viewport_width, c.viewport_height, c.fold, c.captured_at, f.total_score, f.notice, f.landing_spot, f.calm, f.balance, f.colour, f.raw_metrics, f.simulator_version, f.scoring_version FROM science_captures c JOIN science_sites s ON s.id = c.site_id JOIN science_fly_runs f ON f.capture_id = c.id WHERE c.consented_for_science = true ORDER BY c.captured_at`,
  sql`SELECT c.id, c.session_id, s.participant_id, c.left_capture_id, c.right_capture_id, c.chosen_capture_id, c.fly_choice_id, c.response_ms, c.round_number, c.prompt_version, c.created_at FROM science_comparisons c JOIN science_sessions s ON s.id = c.session_id ORDER BY c.created_at`,
]);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const path = `science-export-${stamp}.json`;
await writeFile(path, JSON.stringify({ exportedAt: new Date().toISOString(), schemaVersion: SCIENCE_SCHEMA_VERSION, captures, comparisons }, null, 2));
console.log(`Wrote ${captures.length} captures and ${comparisons.length} comparisons to ${path}`);
