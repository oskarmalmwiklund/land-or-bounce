import { neon } from '@neondatabase/serverless';

export const SCIENCE_SCHEMA_VERSION = '1';
export const SIMULATOR_VERSION = 'malecns-lamina-v1';
export const SCORING_VERSION = 'land-or-bounce-v1';
/** v1 revealed the fly's pick after every round; v2 keeps it sealed until the results screen. */
export const PROMPT_VERSION = 'grabs-you-v2-blind';

/**
 * Categories for pairing: two pages are only compared within one category, so every category
 * needs at least two hosts before its pages are shown. Rules run in order and the first match
 * wins, so the specific ones come first and the broad software and agency rules last. The
 * text tested is the hostname with dots and dashes turned to spaces, then the page title.
 */
const CATEGORY_RULES: Array<[string, RegExp]> = [
  ['ai-builder', /\b(ai app|app builder|build apps?|website builder|no.?code|vibe cod\w*|lovable|bolt|v0)\b/i],
  ['payments', /\b(payment|payments|financial infrastructure|checkout|billing|fintech|stripe|mollie|adyen)\b/i],
  ['productivity', /\b(project management|workspace|productivity|collaboration|notes|docs|linear|notion|asana)\b/i],
  ['commerce', /\b(ecommerce|e-commerce|online store|commerce|sell online|shopify|gumroad|home goods|ceramics|accessories|shop|store|merch)\b/i],
  ['marketing', /\b(marketing|email platform|newsletter|campaign|crm|mailchimp|hubspot|klaviyo|beehiiv)\b/i],
  ['dev-tools', /\b(github actions|ci\b|cd pipeline|runners?|developer tools?|devtools|sdk|api|checker|compiler|debugger|observability)\b/i],
  ['security', /surveillance|intrusion|defsec|defen[cs]e|security|threat detection|perimeter/i],
  ['consulting', /\b(consulting|consultancy|consultants?|advisory|advisors?|audit|strategy|management consulting)\b/i],
  ['media', /\b(news|nyheter|newspaper|magazine|tidning|podcast|journalism|editorial|media)\b/i],
  ['portfolio', /\b(portfolio|art direction|motion design|3d design|storyteller|designer|freelance|photographer|illustrator)\b/i],
  ['health', /\b(health|biology|supplements?|clinic|medical|wellness|fertility|surrogacy|parenthood|föräldraskap|therapy|nutrition)\b/i],
  ['services', /\b(offert|quote|quotes|plumbing|roofing|insulation|isolering|venue|hotel|breeding|seminar|cleaning|electrician|builder|renovation)\b/i],
  ['consumer', /\b(language learning|learn \w+|athletes?|fans?|ranking|games?|fitness|travel app|dating|recipes?|streaming)\b/i],
  ['software', /\b(platform|software|operating system|bi|enterprise|analytics|research|ai-native|saas|automation|infrastructure|cloud|data)\b/i],
  ['agency', /\b(agency|agencies|studio|web design|webbyrå|byrå|comms|communications|marknadsavdelning|branding|translate|translation|publishing|rights holders)\b/i],
];

/**
 * Hosts whose title says nothing useful. Checked before the rules. Keep this short: it is for
 * pages already in the pool, not a second classifier.
 */
const CATEGORY_OVERRIDES: Record<string, string> = {
  'aftonbladet.se': 'media',
  'feber.se': 'media',
  'google.com': 'consumer',
  'minpingis.se': 'consumer',
  'aniara.one': 'agency',
  'fastest.ee': 'dev-tools',
};

export const CATEGORIES = [...new Set([...Object.values(CATEGORY_OVERRIDES), ...CATEGORY_RULES.map(([name]) => name), 'other'])];

export function inferCategory(hostname: string, title = ''): string {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  if (CATEGORY_OVERRIDES[host]) return CATEGORY_OVERRIDES[host];
  const text = `${host.replace(/[.-]/g, ' ')} ${title}`;
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
    participant_id uuid,
    prompt_version text NOT NULL,
    viewport_class text NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
  )`;
  await sql`ALTER TABLE science_sessions ADD COLUMN IF NOT EXISTS participant_id uuid`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS science_sessions_participant_prompt_idx ON science_sessions (participant_id, prompt_version) WHERE participant_id IS NOT NULL`;
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
