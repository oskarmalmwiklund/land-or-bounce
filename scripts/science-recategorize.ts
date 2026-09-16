/**
 * Re-run the category classifier over every site in the pool and show what would change.
 *
 *   npm run science:recategorize                     # preview against production
 *   npm run science:recategorize -- --apply          # write the new categories
 *   npm run science:recategorize -- --retire mykold.xyz,zparq.se --apply
 *                                                    # also pull those hosts' captures out of the pool
 *   npm run science:recategorize -- --env development
 *
 * Categories are data, so this takes effect on the live pairing at once, without a deploy.
 * Retiring sets consented_for_science to false on a host's captures; past votes keep pointing
 * at them, only new pairs stop drawing them. It is reversible with plain SQL.
 */
import { neon } from '@neondatabase/serverless';
import { inferCategory } from '../src/server/science-db';
import { describeDatabase, formatTable, loadEnv, parseArgs } from './science-cli';

const flags = parseArgs();
loadEnv(flags.env);
const apply = flags.flags.apply === true;
const retire = typeof flags.flags.retire === 'string' ? flags.flags.retire.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean) : [];
const sql = neon(process.env.DATABASE_URL!);

type Site = { id: string; hostname: string; page_title: string; category: string };
const sites = await sql`SELECT id, hostname, page_title, category FROM science_sites ORDER BY hostname` as Site[];

const changes = sites
  .map((site) => ({ hostname: site.hostname, title: site.page_title.slice(0, 50), from: site.category, to: inferCategory(site.hostname, site.page_title), id: site.id }))
  .filter((row) => row.from !== row.to);

console.log(`${describeDatabase()} (${flags.env}) · ${sites.length} sites · ${changes.length} would change${apply ? '' : ' (preview, add --apply to write)'}\n`);
console.log(formatTable(changes.map(({ hostname, title, from, to }) => ({ hostname, title, from, to }))));

if (retire.length) {
  const unknown = retire.filter((host) => !sites.some((site) => site.hostname === host));
  if (unknown.length) console.log(`\nNot in the pool, so nothing to retire: ${unknown.join(', ')}`);
  console.log(`\nRetire from new pairs: ${retire.filter((host) => !unknown.includes(host)).join(', ') || '(none)'}`);
}

if (apply) {
  for (const change of changes) await sql`UPDATE science_sites SET category = ${change.to} WHERE id = ${change.id}`;
  let retired = 0;
  for (const host of retire) {
    const rows = await sql`UPDATE science_captures SET consented_for_science = false WHERE site_id IN (SELECT id FROM science_sites WHERE hostname = ${host}) AND consented_for_science = true RETURNING id`;
    retired += rows.length;
  }
  console.log(`\nApplied: ${changes.length} categories updated, ${retired} captures retired.`);
}

const after = new Map<string, Set<string>>();
for (const site of sites) {
  const category = changes.find((c) => c.id === site.id)?.to ?? site.category;
  if (retire.includes(site.hostname)) continue;
  after.set(category, (after.get(category) ?? new Set()).add(site.hostname));
}
console.log(`\nPool by category ${apply ? 'now' : 'after applying'}:`);
console.log(formatTable([...after].sort(([a], [b]) => a.localeCompare(b)).map(([category, hosts]) => ({ category, hosts: hosts.size, pairable: hosts.size >= 2 ? 'yes' : 'no', members: [...hosts].sort().join(', ') }))));
