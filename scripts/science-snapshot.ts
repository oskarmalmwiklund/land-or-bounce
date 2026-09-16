/**
 * A snapshot of the human-vs-fly experiment, straight from the science database.
 *
 *   npm run science:snapshot                       # every section, production, as tables
 *   npm run science:snapshot -- --json             # the same as one JSON object
 *   npm run science:snapshot -- --section pairs    # one section (see SECTIONS below)
 *   npm run science:snapshot -- --include-legacy   # count votes with no participant id too
 *   npm run science:snapshot -- --prompt grabs-you-v2-blind   # one experiment design only
 *   npm run science:snapshot -- --env development
 *
 * By default it excludes sessions with no participant id. Those predate the participant
 * dedup commit (15 Sep 2026, before 12:30 UTC) and are mostly the author's own testing; the
 * `legacy` section reports how much was left out. Agreement means the human chose the same
 * page as the fly, whose choice is always the higher total_score of the pair.
 */
import { neon } from '@neondatabase/serverless';
import { describeDatabase, formatTable, loadEnv, parseArgs } from './science-cli';

const flags = parseArgs();
loadEnv(flags.env);
const includeLegacy = flags.flags['include-legacy'] === true;
/** `--prompt grabs-you-v2-blind` restricts every section to one experiment design. */
const promptVersion = typeof flags.flags.prompt === 'string' ? flags.flags.prompt : null;
const sql = neon(process.env.DATABASE_URL!);

/** Every query starts from `votes`: comparisons joined to their session, optionally without legacy rows or other prompt versions. */
const VOTES = `WITH votes AS (
  SELECT c.*, s.participant_id, s.viewport_class, (c.chosen_capture_id = c.fly_choice_id)::int AS agree
  FROM science_comparisons c JOIN science_sessions s ON s.id = c.session_id
  WHERE ($1::boolean OR s.participant_id IS NOT NULL) AND ($2::text IS NULL OR c.prompt_version = $2::text)
), shown AS (
  SELECT id AS vote_id, left_capture_id AS capture_id, chosen_capture_id, fly_choice_id FROM votes
  UNION ALL
  SELECT id, right_capture_id, chosen_capture_id, fly_choice_id FROM votes
), scored AS (
  SELECT v.*, fl.total_score AS left_score, fr.total_score AS right_score, abs(fl.total_score - fr.total_score) AS gap
  FROM votes v JOIN science_fly_runs fl ON fl.capture_id = v.left_capture_id JOIN science_fly_runs fr ON fr.capture_id = v.right_capture_id
)`;

type Row = Record<string, unknown>;
const run = (body: string) => sql.query(`${VOTES} ${body}`, [includeLegacy, promptVersion]) as Promise<Row[]>;

const SECTIONS: Record<string, { title: string; note?: string; query: () => Promise<Row[]> }> = {
  overview: {
    title: 'Overview',
    query: () => run(`SELECT
      (SELECT count(*) FROM votes) AS votes,
      (SELECT sum(agree) FROM votes) AS agree,
      (SELECT round(100.0 * avg(agree), 1) FROM votes) AS agree_pct,
      (SELECT count(DISTINCT session_id) FROM votes) AS sessions,
      (SELECT count(*) FROM science_sessions s WHERE s.completed_at IS NOT NULL AND ($1::boolean OR s.participant_id IS NOT NULL) AND ($2::text IS NULL OR s.prompt_version = $2::text)) AS completed,
      (SELECT count(DISTINCT participant_id) FROM votes WHERE participant_id IS NOT NULL) AS participants,
      (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_ms)) FROM votes) AS median_ms,
      (SELECT min(created_at) FROM votes) AS first_vote,
      (SELECT max(created_at) FROM votes) AS last_vote,
      (SELECT count(*) FROM site_activity WHERE last_seen >= now() - interval '90 seconds') AS here_now`),
  },
  versions: {
    title: 'Agreement by experiment design',
    note: 'grabs-you-v1 showed the fly\'s pick after every round; grabs-you-v2-blind shows all five at the end. Round 1 is uncontaminated in both.',
    query: () => run(`SELECT prompt_version, count(DISTINCT session_id) AS sessions, count(*) AS votes, round(100.0 * avg(agree), 1) AS agree_pct,
      round(100.0 * avg(agree) FILTER (WHERE round_number = 1), 1) AS round1_agree_pct, min(created_at) AS first_vote, max(created_at) AS last_vote
      FROM votes GROUP BY 1 ORDER BY min(created_at)`),
  },
  rounds: {
    title: 'Agreement by round',
    query: () => run(`SELECT round_number, count(*) AS votes, round(100.0 * avg(agree), 1) AS agree_pct,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_ms)) AS median_ms FROM votes GROUP BY 1 ORDER BY 1`),
  },
  categories: {
    title: 'Agreement by category',
    note: 'Category of the pair, taken from its left page.',
    query: () => run(`SELECT s.category, count(*) AS votes, round(100.0 * avg(v.agree), 1) AS agree_pct
      FROM votes v JOIN science_captures c ON c.id = v.left_capture_id JOIN science_sites s ON s.id = c.site_id GROUP BY 1 ORDER BY 2 DESC`),
  },
  viewport: {
    title: 'Agreement by viewport',
    query: () => run(`SELECT viewport_class, count(DISTINCT session_id) AS sessions, count(*) AS votes, round(100.0 * avg(agree), 1) AS agree_pct,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_ms)) AS median_ms FROM votes GROUP BY 1 ORDER BY 1`),
  },
  gap: {
    title: 'Agreement by fly score gap',
    note: 'How far apart the fly scored the two pages. The fly is most confident in the last row.',
    query: () => run(`SELECT CASE WHEN gap < 15 THEN '0-14' WHEN gap < 40 THEN '15-39' ELSE '40+' END AS score_gap,
      count(*) AS votes, round(100.0 * avg(agree), 1) AS agree_pct FROM scored GROUP BY 1 ORDER BY min(gap)`),
  },
  speed: {
    title: 'Agreement by decision time',
    query: () => run(`SELECT CASE WHEN response_ms < 2000 THEN 'under 2 s' WHEN response_ms < 4000 THEN '2-4 s' WHEN response_ms < 8000 THEN '4-8 s' ELSE '8 s and up' END AS decision_time,
      count(*) AS votes, round(100.0 * avg(agree), 1) AS agree_pct FROM votes GROUP BY 1 ORDER BY min(response_ms)`),
  },
  bias: {
    title: 'Side bias',
    note: 'Share of choices that were the left page. Both should sit near 50.',
    query: () => run(`SELECT round(100.0 * avg((chosen_capture_id = left_capture_id)::int), 1) AS human_left_pct,
      round(100.0 * avg((fly_choice_id = left_capture_id)::int), 1) AS fly_left_pct,
      sum((fly_choice_id = CASE WHEN left_score >= right_score THEN left_capture_id ELSE right_capture_id END)::int) AS fly_picked_higher,
      sum((left_score = right_score)::int) AS ties, count(*) AS votes FROM scored`),
  },
  pairs: {
    title: 'Pairs',
    note: 'human_a and fly_a count how often each side picked page a.',
    query: () => run(`, p AS (
        SELECT least(left_capture_id::text, right_capture_id::text) AS a, greatest(left_capture_id::text, right_capture_id::text) AS b, chosen_capture_id::text AS chosen, fly_choice_id::text AS fly, agree FROM votes)
      SELECT sa.hostname AS a_host, fa.total_score AS a_fly, sb.hostname AS b_host, fb.total_score AS b_fly, count(*) AS votes,
        sum((p.chosen = p.a)::int) AS human_a, sum((p.fly = p.a)::int) AS fly_a, round(100.0 * avg(p.agree), 1) AS agree_pct
      FROM p JOIN science_captures ca ON ca.id::text = p.a JOIN science_sites sa ON sa.id = ca.site_id JOIN science_fly_runs fa ON fa.capture_id = ca.id
        JOIN science_captures cb ON cb.id::text = p.b JOIN science_sites sb ON sb.id = cb.site_id JOIN science_fly_runs fb ON fb.capture_id = cb.id
      GROUP BY 1, 2, 3, 4 ORDER BY votes DESC, a_host`),
  },
  sites: {
    title: 'Sites',
    note: 'One row per capture. human_win_pct is how often people chose this page when it was shown.',
    query: () => run(`SELECT s.hostname, s.category, f.total_score AS fly_score, count(sh.vote_id) AS shown,
        sum((sh.chosen_capture_id = c.id)::int) AS human_wins, round(100.0 * avg((sh.chosen_capture_id = c.id)::int), 1) AS human_win_pct,
        sum((sh.fly_choice_id = c.id)::int) AS fly_wins, c.captured_at
      FROM science_captures c JOIN science_sites s ON s.id = c.site_id LEFT JOIN science_fly_runs f ON f.capture_id = c.id
        LEFT JOIN shown sh ON sh.capture_id = c.id
      GROUP BY 1, 2, 3, c.id, c.captured_at ORDER BY s.category, human_win_pct DESC NULLS LAST, s.hostname`),
  },
  participants: {
    title: 'Participants',
    query: () => run(`SELECT coalesce(left(participant_id::text, 8), '(none)') AS participant, count(DISTINCT session_id) AS sessions, count(*) AS votes,
        sum(agree) AS agree, string_agg(DISTINCT viewport_class, ',') AS viewport, min(created_at) AS first_vote,
        round(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_ms)) AS median_ms
      FROM votes GROUP BY 1 ORDER BY first_vote`),
  },
  hourly: {
    title: 'Votes per hour (UTC)',
    query: () => run(`SELECT to_char(date_trunc('hour', created_at), 'YYYY-MM-DD HH24:00') AS hour_utc, count(*) AS votes,
      count(DISTINCT session_id) AS sessions, round(100.0 * avg(agree), 1) AS agree_pct FROM votes GROUP BY 1 ORDER BY 1`),
  },
  pool: {
    title: 'Pool by category',
    note: 'A category needs two hosts before its pages are shown against each other.',
    query: () => run(`SELECT s.category, count(DISTINCT s.hostname) AS hosts, count(*) AS captures,
        sum((c.id NOT IN (SELECT capture_id FROM shown))::int) AS never_shown, round(avg(f.total_score), 1) AS mean_fly_score
      FROM science_captures c JOIN science_sites s ON s.id = c.site_id LEFT JOIN science_fly_runs f ON f.capture_id = c.id
      WHERE c.consented_for_science GROUP BY 1 ORDER BY 1`),
  },
  duplicates: {
    title: 'Hosts with more than one capture',
    note: 'Only the newest capture per host enters new pairs; older ones still appear in past votes.',
    query: () => run(`SELECT s.hostname, count(*) AS captures, string_agg(f.total_score::text, ', ' ORDER BY c.captured_at) AS fly_scores,
        min(c.captured_at) AS first_capture, max(c.captured_at) AS last_capture
      FROM science_captures c JOIN science_sites s ON s.id = c.site_id LEFT JOIN science_fly_runs f ON f.capture_id = c.id
      GROUP BY 1 HAVING count(*) > 1 ORDER BY 2 DESC`),
  },
  legacy: {
    title: 'Sessions with no participant id',
    note: 'Excluded from the other sections unless --include-legacy is given.',
    query: () => sql.query(`SELECT count(DISTINCT s.id) AS sessions, count(c.id) AS votes, sum((c.chosen_capture_id = c.fly_choice_id)::int) AS agree,
        min(c.created_at) AS first_vote, max(c.created_at) AS last_vote
      FROM science_sessions s LEFT JOIN science_comparisons c ON c.session_id = s.id WHERE s.participant_id IS NULL`) as Promise<Row[]>,
  },
};

const wanted = flags.flags.section ? String(flags.flags.section).split(',') : Object.keys(SECTIONS);
const unknown = wanted.filter((k) => !SECTIONS[k]);
if (unknown.length) { console.error(`Unknown section(s): ${unknown.join(', ')}. Choose from ${Object.keys(SECTIONS).join(', ')}.`); process.exit(2); }

const results = Object.fromEntries(await Promise.all(wanted.map(async (key) => [key, await SECTIONS[key].query()] as const)));

if (flags.json) {
  console.log(JSON.stringify({ takenAt: new Date().toISOString(), env: flags.env, database: describeDatabase(), includeLegacy, promptVersion, ...results }, null, 2));
} else {
  console.log(`Land or Bounce · human vs fly · ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC · ${describeDatabase()} (${flags.env})${includeLegacy ? ' · including legacy sessions' : ''}${promptVersion ? ` · ${promptVersion} only` : ''}`);
  for (const key of wanted) {
    const section = SECTIONS[key];
    console.log(`\n## ${section.title}`);
    if (section.note) console.log(section.note);
    console.log(formatTable(results[key]));
  }
  const overview = results.overview?.[0];
  if (overview) {
    const n = Number(overview.votes); const k = Number(overview.agree);
    if (n > 0) {
      // Wilson interval for the agreement rate, so the reader knows how much the number can move.
      const z = 1.96; const p = k / n; const d = 1 + z * z / n;
      const centre = (p + z * z / (2 * n)) / d; const half = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
      console.log(`\nAgreement ${(100 * p).toFixed(1)}% of ${n} votes; 95% interval ${(100 * (centre - half)).toFixed(0)}–${(100 * (centre + half)).toFixed(0)}%. Chance is 50%.`);
    }
  }
}
