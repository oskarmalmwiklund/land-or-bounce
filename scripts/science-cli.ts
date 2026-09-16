/**
 * Shared plumbing for the science command-line scripts: which database to talk to, how to
 * print rows, and a small flag parser.
 *
 * Vercel keeps a separate Neon branch per environment, so `.env.local` (pulled from
 * Development) points at an empty database. Analysis wants Production, which lives in
 * `.env.production.local`. Both are gitignored. Pull them with:
 *
 *   vercel env pull .env.production.local --environment production --yes
 *   vercel env pull .env.local --environment development --yes
 *
 * Every script accepts `--env production|preview|development` (default production) and reads
 * the matching file itself, so the npm scripts stay one line and the choice is visible.
 */
import { readFileSync } from 'node:fs';

export type Env = 'production' | 'preview' | 'development';

const ENV_FILES: Record<Env, string> = {
  production: '.env.production.local',
  preview: '.env.preview.local',
  development: '.env.local',
};

export type Flags = { env: Env; json: boolean; csv: boolean; positional: string[]; flags: Record<string, string | true> };

/** Flags that never take a value; every other `--flag value` consumes the next argument. */
const BOOLEAN_FLAGS = new Set(['json', 'csv', 'include-legacy']);

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

/** `--env production --json --section pairs,sites "select 1"` → { env, json, flags: { section: 'pairs,sites' }, positional: ['select 1'] }. */
export function parseArgs(argv: string[] = process.argv.slice(2)): Flags {
  const flags: Record<string, string | true> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const eq = arg.indexOf('=');
    if (eq > 0) { flags[arg.slice(2, eq)] = arg.slice(eq + 1); continue; }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!BOOLEAN_FLAGS.has(key) && next !== undefined && !next.startsWith('--')) { flags[key] = next; i++; continue; }
    flags[key] = true;
  }
  const env = String(flags.env ?? 'production') as Env;
  if (!(env in ENV_FILES)) fail(`Unknown --env "${env}". Use production, preview or development.`);
  return { env, json: flags.json === true, csv: flags.csv === true, positional, flags };
}

/** Load DATABASE_URL (and friends) from the env file for `env` without clobbering the shell. */
export function loadEnv(env: Env): void {
  const file = ENV_FILES[env];
  let text: string;
  try { text = readFileSync(file, 'utf8'); } catch {
    if (process.env.DATABASE_URL) return;
    fail(`No ${file}. Pull it with:\n  vercel env pull ${file} --environment ${env} --yes`);
  }
  for (const line of text.split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
  if (!process.env.DATABASE_URL) fail(`${file} has no DATABASE_URL. Re-pull it:\n  vercel env pull ${file} --environment ${env} --yes`);
}

/** Where the connection string points, for the header line, with credentials removed. */
export function describeDatabase(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    return `${url.hostname.replace(/-pooler\./, '.')}${url.pathname}`;
  } catch { return 'unknown database'; }
}

type Row = Record<string, unknown>;

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().replace('T', ' ').slice(0, 16);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Fixed-width table, numbers right-aligned. Empty result prints "(no rows)". */
export function formatTable(rows: Row[]): string {
  if (!rows.length) return '(no rows)';
  const keys = Object.keys(rows[0]);
  const text = rows.map((r) => keys.map((k) => cell(r[k])));
  const numeric = keys.map((_, i) => text.every((r) => r[i] === '' || /^-?\d+(\.\d+)?$/.test(r[i])));
  const widths = keys.map((k, i) => Math.max(k.length, ...text.map((r) => r[i].length)));
  const pad = (s: string, i: number) => (numeric[i] ? s.padStart(widths[i]) : s.padEnd(widths[i]));
  const lines = [keys.map((k, i) => pad(k, i)).join('  '), widths.map((w) => '-'.repeat(w)).join('  ')];
  for (const r of text) lines.push(r.map(pad).join('  '));
  return lines.join('\n');
}

export function formatCsv(rows: Row[]): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [keys.join(','), ...rows.map((r) => keys.map((k) => q(cell(r[k]))).join(','))].join('\n');
}

/** Print rows in whichever shape the flags ask for. */
export function printRows(rows: Row[], flags: Flags): void {
  if (flags.json) console.log(JSON.stringify(rows, null, 2));
  else if (flags.csv) console.log(formatCsv(rows));
  else console.log(formatTable(rows));
}
