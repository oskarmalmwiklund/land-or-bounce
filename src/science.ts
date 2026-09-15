import '@fontsource-variable/fraunces';
import '@fontsource-variable/familjen-grotesk';
import '@fontsource-variable/jetbrains-mono';
import './styles.css';
import './science.css';
import { labsBadge } from './labs/badge';
import { applyPalette } from './theme/palette';
import { inject } from '@vercel/analytics';

applyPalette(document.documentElement.style);

type Candidate = {
  id: string;
  captureId?: string;
  screenshotUrl?: string;
  host: string;
  fly: number;
  palette: [string, string, string];
  eyebrow: string;
  headline: string;
  copy: string;
  action: string;
  style: 'editorial' | 'product' | 'minimal' | 'bold';
};

type Pair = { left: Candidate; right: Candidate; humanLeft?: number; votes?: number; live?: boolean };

const candidates: Candidate[] = [
  { id: 'north', host: 'north.studio', fly: 78, palette: ['#f4efdf', '#172119', '#d2ff55'], eyebrow: 'NORTH / CREATIVE STUDIO', headline: 'Ideas worth\ngetting lost in.', copy: 'Strategy, identity and digital experiences for people building what comes next.', action: 'See our work', style: 'editorial' },
  { id: 'orbit', host: 'orbit.run', fly: 64, palette: ['#101225', '#f6f2ff', '#826cff'], eyebrow: 'ORBIT', headline: 'Ship together.\nStay in orbit.', copy: 'One calm home for projects, decisions and the people moving them forward.', action: 'Start for free', style: 'product' },
  { id: 'field', host: 'fieldnotes.co', fly: 42, palette: ['#f4f0e8', '#2f2d2a', '#e26742'], eyebrow: 'FIELD NOTES № 24', headline: 'A slower way\nto see the world.', copy: 'Independent stories about craft, place and the people who care for both.', action: 'Read the journal', style: 'minimal' },
  { id: 'volt', host: 'volt.energy', fly: 91, palette: ['#181818', '#ffffff', '#f4ff32'], eyebrow: 'ENERGY, REWIRED', headline: 'POWER\nEVERYTHING.', copy: 'Clean energy that works harder for your home, your car and the grid.', action: 'Make the switch', style: 'bold' },
  { id: 'morrow', host: 'morrow.health', fly: 57, palette: ['#e9f1ee', '#173d36', '#f6a78d'], eyebrow: 'CARE THAT LISTENS', headline: 'Feel better,\nat your pace.', copy: 'Everyday healthcare designed around real conversations and your real life.', action: 'Meet your care team', style: 'minimal' },
  { id: 'relay', host: 'relay.dev', fly: 73, palette: ['#ecf0ff', '#15204a', '#ff6f61'], eyebrow: 'RELAY FOR TEAMS', headline: 'Work moves.\nRelay keeps up.', copy: 'Automate the handoffs that slow your team down without losing the human touch.', action: 'Build a workflow', style: 'product' },
];

const pairs: Pair[] = [
  { left: candidates[0], right: candidates[1], humanLeft: 62, votes: 184 },
  { left: candidates[2], right: candidates[3], humanLeft: 44, votes: 137 },
  { left: candidates[4], right: candidates[5], humanLeft: 55, votes: 211 },
  { left: candidates[1], right: candidates[2], humanLeft: 59, votes: 166 },
  { left: candidates[3], right: candidates[0], humanLeft: 47, votes: 192 },
];

const query = new URLSearchParams(location.search);
const submitted = query.get('from');
const submittedFly = query.get('fly');
const app = document.getElementById('app')!;

app.innerHTML = `
<div class="science-grain" aria-hidden="true"></div>
<main class="science-page">
  <header class="top science-top">
    <div class="brand"><a class="wordmark" href="/">Land <span>or</span> Bounce<i>.</i></a>${labsBadge()}</div>
    <nav class="top-nav"><span class="science-live"><i></i> LIVE EXPERIMENT</span><a class="text-button" href="/">Score your site</a></nav>
  </header>
  <section class="science-intro" id="scienceIntro">
    <p class="kicker">Human eyes wanted</p>
    <h1>Would you land<br><em>where the fly lands?</em></h1>
    <p class="science-lead">Five pairs. Five gut reactions. Help us learn where 29,195 fruit-fly neurons agree with human taste.</p>
    ${submitted ? `<p class="science-submitted">Your verdict for <strong>${escapeHtml(submitted)}</strong>${submittedFly ? ` was <b>${escapeHtml(submittedFly)}/100</b>` : ''}. Now be the human in the experiment.</p>` : ''}
    <button class="primary-button science-start" id="scienceStart">Make 5 choices <span>→</span></button>
    <p class="science-time">No signup · about 20 seconds</p>
    <div class="science-demo" aria-hidden="true"><div class="demo-card demo-a"><span>A</span></div><div class="demo-card demo-b"><span>B</span></div><div class="demo-choice"><b>←</b><span>which one?</span><b>→</b></div></div>
  </section>
  <section class="science-game" id="scienceGame" hidden>
    <div class="round-head"><div><span class="round-label">YOUR GUT REACTION</span><h1>Which page grabs you?</h1><p>Click the one you would explore. Don’t overthink it.</p></div><div class="round-count"><b id="roundNum">1</b><span>/ 5</span></div></div>
    <div class="pair" id="pair"></div>
    <div class="reveal" id="reveal" hidden></div>
    <div class="science-progress"><i id="progress"></i></div>
    <p class="key-hint">Use <kbd>←</kbd> and <kbd>→</kbd> if you like</p>
  </section>
  <section class="science-finish" id="scienceFinish" hidden>
    <p class="kicker">Your result</p>
    <div class="agreement-orbit"><span id="agreementNum">0%</span><i aria-hidden="true">✦</i></div>
    <h1 id="agreementTitle">You and the fly see eye to eye.</h1>
    <p id="agreementCopy"></p>
    <div class="finish-actions"><a class="primary-button" href="/">Test your own page</a><button class="secondary-button" id="againScience">Play again</button></div>
    <p class="science-note">This demo keeps your choices in this browser. The production study will aggregate anonymous comparisons from submitted sites.</p>
  </section>
  <footer class="foot science-foot"><span>A playful study of pre-attentive salience. Model activity, not fly behaviour.</span><span>A <a href="https://multiply.co" target="_blank" rel="noopener">Multiply</a> experiment.</span></footer>
</main>`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let round = 0;
let agreements = 0;
let locked = false;
let currentPair: Pair = pairs[0];
let sessionId = crypto.randomUUID();
let roundStarted = performance.now();

function escapeHtml(value: string): string {
  return value.replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[char]!));
}

function card(candidate: Candidate, side: 'left' | 'right'): string {
  if (candidate.screenshotUrl) return `<button class="site-choice live-site" data-side="${side}" aria-label="Choose ${escapeHtml(candidate.host)}"><span class="site-browser"><i></i><i></i><i></i><small>${escapeHtml(candidate.host)}</small></span><span class="live-shot"><img src="${escapeHtml(candidate.screenshotUrl)}" alt="Landing page for ${escapeHtml(candidate.host)}"></span><span class="pick-label">Pick this page <b>${side === 'left' ? '←' : '→'}</b></span></button>`;
  const [bg, ink, accent] = candidate.palette;
  return `<button class="site-choice site-${candidate.style}" data-side="${side}" style="--site-bg:${bg};--site-ink:${ink};--site-accent:${accent}" aria-label="Choose ${candidate.host}">
    <span class="site-browser"><i></i><i></i><i></i><small>${candidate.host}</small></span>
    <span class="site-canvas"><span class="site-nav"><b>${candidate.eyebrow.split(' ')[0]}</b><i></i><i></i></span><span class="site-copy"><small>${candidate.eyebrow}</small><strong>${candidate.headline.replace('\n', '<br>')}</strong><span>${candidate.copy}</span><em>${candidate.action} →</em></span><span class="site-art"><i></i><b></b><u></u></span></span>
    <span class="pick-label">Pick this page <b>${side === 'left' ? '←' : '→'}</b></span>
  </button>`;
}

async function livePair(): Promise<Pair | null> {
  try {
    const response = await fetch('/api/science-pair');
    if (!response.ok) return null;
    const data = await response.json();
    const from = (item: { id: string; hostname: string; screenshot_url: string; fly_score: number }): Candidate => ({ id: item.id, captureId: item.id, host: item.hostname, screenshotUrl: item.screenshot_url, fly: Number(item.fly_score), palette: ['#eee', '#111', '#fc3'], eyebrow: '', headline: '', copy: '', action: '', style: 'minimal' });
    return { left: from(data.left), right: from(data.right), live: true };
  } catch { return null; }
}

async function showRound(): Promise<void> {
  locked = false;
  $('pair').innerHTML = '<div class="pair-loading">Choosing two pages…</div>';
  currentPair = await livePair() ?? pairs[round];
  const pair = currentPair;
  roundStarted = performance.now();
  $('roundNum').textContent = String(round + 1);
  $('progress').style.width = `${round * 20}%`;
  $('reveal').hidden = true;
  $('pair').classList.remove('has-pick');
  $('pair').innerHTML = card(pair.left, 'left') + `<span class="versus">OR</span>` + card(pair.right, 'right');
  $('pair').querySelectorAll<HTMLButtonElement>('.site-choice').forEach((button) => button.addEventListener('click', () => choose(button.dataset.side as 'left' | 'right')));
}

function choose(side: 'left' | 'right'): void {
  if (locked) return;
  locked = true;
  const pair = currentPair;
  const human = side === 'left' ? pair.left : pair.right;
  const fly = pair.left.fly >= pair.right.fly ? pair.left : pair.right;
  const agreed = human.id === fly.id;
  if (agreed) agreements += 1;
  $('pair').classList.add('has-pick');
  $('pair').querySelectorAll<HTMLButtonElement>('.site-choice').forEach((button) => {
    button.classList.toggle('picked', button.dataset.side === side);
    button.disabled = true;
  });
  const humanPercent = pair.humanLeft == null ? null : side === 'left' ? pair.humanLeft : 100 - pair.humanLeft;
  const reveal = $('reveal');
  reveal.className = `reveal ${agreed ? 'agree' : 'disagree'}`;
  reveal.innerHTML = `<div><span>${agreed ? 'SAME INSTINCT' : 'SPLIT DECISION'}</span><strong>${agreed ? 'The fly picked it too.' : `The fly picked ${escapeHtml(fly.host)}.`}</strong><small>${humanPercent == null ? 'Your choice is now part of the study.' : `${humanPercent}% of humans picked ${escapeHtml(human.host)} in this demo.`}</small></div><button id="nextRound">${round === pairs.length - 1 ? 'See my result' : 'Next pair'} →</button>`;
  reveal.hidden = false;
  $('progress').style.width = `${(round + 1) * 20}%`;
  $('nextRound').addEventListener('click', next);
  if (pair.live && pair.left.captureId && pair.right.captureId && human.captureId && fly.captureId) {
    void fetch('/api/science-vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, leftId: pair.left.captureId, rightId: pair.right.captureId, chosenId: human.captureId, flyChoiceId: fly.captureId, responseMs: Math.round(performance.now() - roundStarted), round: round + 1, viewport: innerWidth < 700 ? 'mobile' : 'desktop', completed: round === pairs.length - 1 }) });
  }
  window.setTimeout(() => $('nextRound').focus(), 100);
}

function next(): void {
  round += 1;
  if (round < pairs.length) { void showRound(); return; }
  localStorage.setItem('land-or-bounce-science', JSON.stringify({ completedAt: Date.now(), agreements, rounds: pairs.length }));
  $('scienceGame').hidden = true;
  $('scienceFinish').hidden = false;
  const pct = Math.round(agreements / pairs.length * 100);
  $('agreementNum').textContent = `${pct}%`;
  $('agreementTitle').textContent = agreements >= 4 ? 'You and the fly see eye to eye.' : agreements >= 2 ? 'You agree on some things.' : 'Your eyes live in different worlds.';
  $('agreementCopy').textContent = `You picked the same page as the fly ${agreements} out of ${pairs.length} times. ${agreements >= 3 ? 'Low-level visual contrast often pulled you in the same direction.' : 'Your choices may rely more on meaning, familiarity or taste than the fly’s early visual circuitry.'}`;
  scrollTo({ top: 0, behavior: 'smooth' });
}

function start(): void {
  round = 0; agreements = 0;
  sessionId = crypto.randomUUID();
  $('scienceIntro').hidden = true;
  $('scienceFinish').hidden = true;
  $('scienceGame').hidden = false;
  void showRound();
  scrollTo({ top: 0, behavior: 'smooth' });
}

$('scienceStart').addEventListener('click', start);
$('againScience').addEventListener('click', start);
document.addEventListener('keydown', (event) => {
  if ($('scienceGame').hidden || !$('reveal').hidden) return;
  if (event.key === 'ArrowLeft') choose('left');
  if (event.key === 'ArrowRight') choose('right');
});

document.title = 'Human vs Fly — the Land or Bounce experiment';
inject();
