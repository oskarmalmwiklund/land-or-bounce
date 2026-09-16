/**
 * Run one SQL statement against the science database and print the rows.
 *
 *   npm run science:sql -- "select count(*) from science_comparisons"
 *   npm run science:sql -- --csv "select * from science_sites" > sites.csv
 *   echo "select 1" | npm run science:sql
 *   npm run science:sql -- --env development "select 1"
 *
 * Neon's HTTP driver takes one statement per call. Tables: science_sites, science_captures,
 * science_fly_runs, science_sessions, science_comparisons, site_activity
 * (see migrateScience in src/server/science-db.ts). Production is the default target.
 */
import { neon } from '@neondatabase/serverless';
import { describeDatabase, loadEnv, parseArgs, printRows } from './science-cli';

const flags = parseArgs();
loadEnv(flags.env);

let statement = flags.positional.join(' ').trim();
if (!statement && !process.stdin.isTTY) {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  statement = Buffer.concat(chunks).toString('utf8').trim();
}
if (!statement) {
  console.error('Usage: npm run science:sql -- [--env production|development] [--json|--csv] "<sql>"');
  process.exit(2);
}

const sql = neon(process.env.DATABASE_URL!, { fullResults: true });
const started = Date.now();
try {
  const result = await sql.query(statement);
  const rows = result.rows as Record<string, unknown>[];
  if (rows.length || result.command === 'SELECT') printRows(rows, flags);
  if (!flags.json && !flags.csv) console.error(`${result.command} ${result.rowCount ?? rows.length} row(s) · ${describeDatabase()} (${flags.env}) · ${Date.now() - started} ms`);
} catch (error) {
  const err = error as { message?: string; position?: string; hint?: string };
  console.error(`SQL error: ${err.message ?? error}${err.position ? ` at character ${err.position}` : ''}${err.hint ? `\nHint: ${err.hint}` : ''}`);
  process.exit(1);
}
