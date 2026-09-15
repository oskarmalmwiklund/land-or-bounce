import { neon } from '@neondatabase/serverless';

export const SCIENCE_SCHEMA_VERSION = '1';
export const SIMULATOR_VERSION = 'malecns-lamina-v1';
export const SCORING_VERSION = 'land-or-bounce-v1';
export const PROMPT_VERSION = 'grabs-you-v1';

const CATEGORY_RULES: Array<[string, RegExp]> = [
  ['ai-builder', /\b(ai app|app builder|build apps?|website builder|no.?code|vibe cod|lovable|bolt|v0)\b/i],
  ['payments', /\b(payment|payments|financial infrastructure|checkout|billing|fintech|stripe|mollie|adyen)\b/i],
  ['productivity', /\b(project management|workspace|productivity|collaboration|notes|docs|linear|notion|asana)\b/i],
  ['commerce', /\b(ecommerce|e-commerce|online store|commerce|sell online|shopify|gumroad)\b/i],
  ['marketing', /\b(marketing|email platform|newsletter|campaign|crm|mailchimp|hubspot)\b/i],
];

export function inferCategory(hostname: string, title = ''): string {
  const text = `${hostname.replace(/[.-]/g, ' ')} ${title}`;
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? 'other';
}

export function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return neon(url);
}

/** Safe to call during deploys and local setup. Production handlers assume this has run. */
export async function migrateScience(): Promise<void> {
  const sql = db();
  await sql`CREATE TABLE IF NOT EXISTS site_activity (
    id uuid PRIMARY KEY,
    last_seen timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS site_activity_seen_idx ON site_activity (last_seen)`;
  await sql`CREATE TABLE IF NOT EXISTS science_sites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_url text NOT NULL UNIQUE,
    hostname text NOT NULL,
    page_title text NOT NULL DEFAULT '',
    category text NOT NULL DEFAULT 'other',
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`ALTER TABLE science_sites ADD COLUMN IF NOT EXISTS page_title text NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE science_sites ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other'`;
  await sql`CREATE TABLE IF NOT EXISTS science_captures (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id uuid NOT NULL REFERENCES science_sites(id) ON DELETE CASCADE,
    screenshot_url text NOT NULL,
    screenshot_hash text NOT NULL UNIQUE,
    viewport_width integer NOT NULL,
    viewport_height integer NOT NULL,
    fold integer NOT NULL DEFAULT 1,
    consented_for_science boolean NOT NULL DEFAULT false,
    captured_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS science_fly_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    capture_id uuid NOT NULL REFERENCES science_captures(id) ON DELETE CASCADE,
    total_score integer NOT NULL CHECK (total_score BETWEEN 0 AND 100),
    notice integer NOT NULL,
    landing_spot integer NOT NULL,
    calm integer NOT NULL,
    balance integer NOT NULL,
    colour integer NOT NULL,
    raw_metrics jsonb NOT NULL,
    simulator_version text NOT NULL,
    scoring_version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (capture_id, simulator_version, scoring_version)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS science_sessions (
    id uuid PRIMARY KEY,
    prompt_version text NOT NULL,
    viewport_class text NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
  )`;
  await sql`CREATE TABLE IF NOT EXISTS science_comparisons (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES science_sessions(id) ON DELETE CASCADE,
    left_capture_id uuid NOT NULL REFERENCES science_captures(id),
    right_capture_id uuid NOT NULL REFERENCES science_captures(id),
    chosen_capture_id uuid NOT NULL REFERENCES science_captures(id),
    fly_choice_id uuid NOT NULL REFERENCES science_captures(id),
    response_ms integer NOT NULL CHECK (response_ms BETWEEN 0 AND 300000),
    round_number integer NOT NULL CHECK (round_number BETWEEN 1 AND 100),
    prompt_version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (left_capture_id <> right_capture_id),
    CHECK (chosen_capture_id IN (left_capture_id, right_capture_id)),
    CHECK (fly_choice_id IN (left_capture_id, right_capture_id)),
    UNIQUE (session_id, round_number)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS science_captures_pool_idx ON science_captures (consented_for_science, captured_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS science_sites_category_idx ON science_sites (category)`;
  await sql`CREATE INDEX IF NOT EXISTS science_comparisons_pair_idx ON science_comparisons (left_capture_id, right_capture_id)`;
}
