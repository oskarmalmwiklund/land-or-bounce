import '@fontsource-variable/fraunces';
import '@fontsource-variable/familjen-grotesk';
import '@fontsource-variable/jetbrains-mono';
import './styles.css';
import './science.css';
import { labsBadge } from './labs/badge';
import { applyPalette } from './theme/palette';
import { inject } from '@vercel/analytics';
import { activityMarkup, anonymousParticipantId, startActivity } from './activity';

applyPalette(document.documentElement.style);

const SHARE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M12 3v12m0-12 4 4m-4-4L8 7M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/></svg>';

type Candidate = {
  id: string;
  captureId: string;
  screenshotUrl: string;
  category: string;
  host: string;
  fly: number;
};

type Pair = { left: Candidate; right: Candidate; humanLeft?: number; votes?: number; live?: boolean };

const candidates: Candidate[] = [
  { id: '674c06b7-204a-46e5-aebe-b845ac8ceeef', captureId: '674c06b7-204a-46e5-aebe-b845ac8ceeef', host: 'lovable.dev', fly: 24, category: 'ai-builder', screenshotUrl: 'https://hd2ecqjmwbrpkccv.public.blob.vercel-storage.com/science/screenshots/0037ba66-88a4-4b49-83e9-a1c40b1ecd7d.jpg' },
  { id: '038ab07c-c8a0-496c-88bc-71e0beb97abf', captureId: '038ab07c-c8a0-496c-88bc-71e0beb97abf', host: 'bolt.new', fly: 76, category: 'ai-builder', screenshotUrl: 'https://hd2ecqjmwbrpkccv.public.blob.vercel-storage.com/science/screenshots/4b7be83d-a874-462a-a99e-b2b2c596144e.jpg' },
  { id: '892fd2ff-a955-4646-bef2-ee295f9e5040', captureId: '892fd2ff-a955-4646-bef2-ee295f9e5040', host: 'stripe.com', fly: 49, category: 'payments', screenshotUrl: 'https://hd2ecqjmwbrpkccv.public.blob.vercel-storage.com/science/screenshots/9412f78f-58da-4701-b584-83193f1f4edd.jpg' },
  { id: '1de14d8f-0357-44da-9d30-8b01e59101a4', captureId: '1de14d8f-0357-44da-9d30-8b01e59101a4', host: 'mollie.com', fly: 60, category: 'payments', screenshotUrl: 'https://hd2ecqjmwbrpkccv.public.blob.vercel-storage.com/science/screenshots/00e537df-68cf-4fb6-a201-6d5947de8fae.jpg' },
  { id: 'b524b1ed-00d3-4ff5-b53e-527112c71674', captureId: 'b524b1ed-00d3-4ff5-b53e-527112c71674', host: 'linear.app', fly: 91, category: 'productivity', screenshotUrl: 'https://hd2ecqjmwbrpkccv.public.blob.vercel-storage.com/science/screenshots/adfa0412-dda8-484f-9927-11ee0d0271a0.jpg' },
  { id: '9eeaaf7c-230f-4d2e-93c3-bd46778a051f', captureId: '9eeaaf7c-230f-4d2e-93c3-bd46778a051f', host: 'notion.com', fly: 24, category: 'productivity', screenshotUrl: 'https://hd2ecqjmwbrpkccv.public.blob.vercel-storage.com/science/screenshots/4200c6ba-400a-40f8-b88d-149649284768.jpg' },
  { id: '6ce5f443-04ab-4630-a0dd-b612ff8c748c', captureId: '6ce5f443-04ab-4630-a0dd-b612ff8c748c', host: 'shopify.com', fly: 93, category: 'commerce', screenshotUrl: 'https://hd2ecqjmwbrpkccv.public.blob.vercel-storage.com/science/screenshots/dab562b9-65fe-4565-abda-926df9a82474.jpg' },
  { id: 'e3c28591-9c3d-486c-b845-b560c56bab64', captureId: 'e3c28591-9c3d-486c-b845-b560c56bab64', host: 'gumroad.com', fly: 94, category: 'commerce', screenshotUrl: 'https://hd2ecqjmwbrpkccv.public.blob.vercel-storage.com/science/screenshots/3c6854b9-4bbf-4478-8918-6ce7edfa3c9b.jpg' },
  { id: '4ff46ca3-1e58-4946-9445-94706a3edc4a', captureId: '4ff46ca3-1e58-4946-9445-94706a3edc4a', host: 'mailchimp.com', fly: 77, category: 'marketing', screenshotUrl: 'https://hd2ecqjmwbrpkccv.public.blob.vercel-storage.com/science/screenshots/e57a355a-2089-46da-9c3c-315a6c19e98e.jpg' },
  { id: '58da1684-378f-4046-a618-7a89c4372496', captureId: '58da1684-378f-4046-a618-7a89c4372496', host: 'beehiiv.com', fly: 94, category: 'marketing', screenshotUrl: 'https://hd2ecqjmwbrpkccv.public.blob.vercel-storage.com/science/screenshots/c5f2e64a-e814-4ba9-857d-57849ebca980.jpg' },
];

const pairs: Pair[] = [
  { left: candidates[0], right: candidates[1], live: true },
  { left: candidates[2], right: candidates[3], live: true },
  { left: candidates[4], right: candidates[5], live: true },
  { left: candidates[6], right: candidates[7], live: true },
  { left: candidates[8], right: candidates[9], live: true },
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
    ${activityMarkup()}
    <div class="science-demo" aria-hidden="true"><div class="demo-card demo-a"><span>A</span></div><div class="demo-card demo-b"><span>B</span></div><div class="demo-choice"><b>←</b><span>which one?</span><b>→</b></div></div>
  </section>
  <section class="science-game" id="scienceGame" hidden>
    <div class="round-head"><div><span class="round-label">YOUR GUT REACTION</span><h1>Which page grabs you?</h1><p>Click the one you would explore. Don’t overthink it. The fly’s picks stay sealed until the end.</p></div><div class="round-count"><b id="roundNum">1</b><span>/ 5</span></div></div>
    <div class="pair" id="pair"></div>
    <div class="reveal" id="reveal" hidden></div>
    <div class="science-progress"><i id="progress"></i></div>
    <p class="key-hint">Use <kbd>←</kbd> and <kbd>→</kbd> if you like</p>
  </section>
  <section class="science-finish" id="scienceFinish" hidden>
    <div class="confetti" id="confetti" aria-hidden="true"></div>
    <p class="kicker">Your result</p>
    <div class="agreement-orbit"><span id="agreementNum">0%</span><i aria-hidden="true">✦</i></div>
    <h1 id="agreementTitle">You and the fly see eye to eye.</h1>
    <p id="agreementCopy"></p>
    <ol class="recap" id="recap" aria-label="Your five choices against the fly's"></ol>
    <div class="science-share-card" id="scienceSharePreview"><span>LAND OR BOUNCE · SCIENCE</span><strong><b id="shareAgreement">0%</b> fly match</strong><small id="shareLine">I made five gut decisions. The fly had opinions.</small><em>Would your eyes agree? →</em></div>
    <div class="finish-actions"><button class="primary-button share-button" id="shareScience" disabled>${SHARE_ICON}<span id="shareScienceText">Preparing card…</span></button><a class="secondary-button" href="/">Test your own page</a><button class="secondary-button" id="againScience">Play again</button></div>
    ${activityMarkup()}
    <p class="science-note">Your first anonymous five-choice run counts in the dataset. You can replay, but repeat choices from this browser do not add more votes.</p>
  </section>
  <footer class="foot science-foot"><span>A playful study of pre-attentive salience. Model activity, not fly behaviour.</span><span>A <a href="https://multiply.co" target="_blank" rel="noopener">Multiply</a> experiment.</span></footer>
</main>`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const refreshActivity = startActivity();
/** One finished round, kept until the results screen so the fly's picks can be shown all at once. */
type Outcome = { human: Candidate; fly: Candidate; agreed: boolean };

let round = 0;
let agreements = 0;
let history: Outcome[] = [];
let locked = false;
let currentPair: Pair = pairs[0];
let sessionId = crypto.randomUUID();
const participantId = anonymousParticipantId();
let usedCategories = new Set<string>();
let roundStarted = performance.now();
const GLANCE_MS = 5000;
/** The pause after a pick. Nothing is revealed here, so it only needs to register the click. */
const REVEAL_MS = 700;
let countdownFrame = 0;
let advanceTimer = 0;
let scienceShareLink = `${location.origin}/science`;

function stopTimers(): void {
  cancelAnimationFrame(countdownFrame);
  clearTimeout(advanceTimer);
}

function startCountdown(): void {
  const fill = $('glanceTimerFill');
  const tick = () => {
    const remaining = Math.max(0, 1 - (performance.now() - roundStarted) / GLANCE_MS);
    fill.style.transform = `scaleX(${remaining})`;
    if (remaining > 0 && !locked) countdownFrame = requestAnimationFrame(tick);
  };
  tick();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[char]!));
}

function card(candidate: Candidate, side: 'left' | 'right'): string {
  return `<button class="site-choice live-site" data-side="${side}" aria-label="Choose ${escapeHtml(candidate.host)}"><span class="site-browser"><i></i><i></i><i></i><small>${escapeHtml(candidate.host)}</small></span><span class="live-shot"><img src="${escapeHtml(candidate.screenshotUrl)}" alt="Landing page for ${escapeHtml(candidate.host)}"></span><span class="pick-label">Pick this page <b>${side === 'left' ? '←' : '→'}</b></span></button>`;
}

async function livePair(): Promise<Pair | null> {
  try {
    const exclude = encodeURIComponent([...usedCategories].join(','));
    const response = await fetch(`/api/science-pair?exclude=${exclude}`);
    if (!response.ok) return null;
    const data = await response.json();
    const from = (item: { id: string; hostname: string; screenshot_url: string; fly_score: number; category: string }): Candidate => ({ id: item.id, captureId: item.id, host: item.hostname, screenshotUrl: item.screenshot_url, fly: Number(item.fly_score), category: item.category });
    return { left: from(data.left), right: from(data.right), live: true };
  } catch { return null; }
}

async function showRound(): Promise<void> {
  stopTimers();
  locked = true;
  $('reveal').hidden = true;
  $('pair').innerHTML = '<div class="pair-loading">Choosing two pages…</div>';
  currentPair = await livePair() ?? pairs.find((pair) => !usedCategories.has(pair.left.category)) ?? pairs[round];
  const pair = currentPair;
  usedCategories.add(pair.left.category);
  $('roundNum').textContent = String(round + 1);
  $('progress').style.width = `${round * 20}%`;
  $('reveal').hidden = true;
  $('pair').classList.remove('has-pick');
  $('pair').innerHTML = card(pair.left, 'left') + `<span class="versus">OR</span>` + card(pair.right, 'right');
  let timer = document.getElementById('glanceTimer');
  if (!timer) {
    timer = document.createElement('div');
    timer.id = 'glanceTimer';
    timer.className = 'glance-timer';
    timer.setAttribute('aria-hidden', 'true');
    timer.innerHTML = '<i id="glanceTimerFill"></i>';
    $('pair').before(timer);
  }
  $('glanceTimerFill').style.transform = 'scaleX(1)';
  await Promise.all(Array.from($('pair').querySelectorAll('img')).map((image) => image.decode().catch(() => {})));
  roundStarted = performance.now();
  locked = false;
  startCountdown();
  $('pair').querySelectorAll<HTMLButtonElement>('.site-choice').forEach((button) => button.addEventListener('click', () => choose(button.dataset.side as 'left' | 'right')));
}

function choose(side: 'left' | 'right'): void {
  if (locked) return;
  locked = true;
  cancelAnimationFrame(countdownFrame);
  const pair = currentPair;
  const human = side === 'left' ? pair.left : pair.right;
  const fly = pair.left.fly >= pair.right.fly ? pair.left : pair.right;
  const agreed = human.id === fly.id;
  if (agreed) agreements += 1;
  history.push({ human, fly, agreed });
  $('pair').classList.add('has-pick');
  $('pair').querySelectorAll<HTMLButtonElement>('.site-choice').forEach((button) => {
    button.classList.toggle('picked', button.dataset.side === side);
    button.disabled = true;
  });
  // The fly's pick is not shown here on purpose: seeing it would steer the next rounds.
  const reveal = $('reveal');
  reveal.className = 'reveal sealed';
  reveal.innerHTML = `<div><span>LOCKED IN</span><strong>${escapeHtml(human.host)}</strong><small>${round === pairs.length - 1 ? 'The fly’s five picks are up next.' : 'The fly’s pick stays sealed until the end.'}</small></div><span class="auto-next">${round === pairs.length - 1 ? 'Your result' : 'Next pair'} →</span>`;
  reveal.hidden = false;
  $('progress').style.width = `${(round + 1) * 20}%`;
  if (pair.live && pair.left.captureId && pair.right.captureId && human.captureId && fly.captureId) {
    void fetch('/api/science-vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, participantId, leftId: pair.left.captureId, rightId: pair.right.captureId, chosenId: human.captureId, flyChoiceId: fly.captureId, responseMs: Math.round(performance.now() - roundStarted), round: round + 1, viewport: innerWidth < 700 ? 'mobile' : 'desktop', completed: round === pairs.length - 1 }) }).then((response) => { if (response.ok) void refreshActivity(); }).catch(() => {});
  }
  advanceTimer = window.setTimeout(next, REVEAL_MS);
}

function next(): void {
  stopTimers();
  round += 1;
  if (round < pairs.length) { void showRound(); return; }
  localStorage.setItem('land-or-bounce-science', JSON.stringify({ completedAt: Date.now(), agreements, rounds: pairs.length }));
  $('scienceGame').hidden = true;
  $('scienceFinish').hidden = false;
  const pct = Math.round(agreements / pairs.length * 100);
  $('agreementNum').textContent = `${pct}%`;
  $('shareAgreement').textContent = `${pct}%`;
  $('agreementTitle').textContent = agreements >= 4 ? 'You and the fly see eye to eye.' : agreements >= 2 ? 'You agree on some things.' : 'Your eyes live in different worlds.';
  $('agreementCopy').textContent = `You picked the same page as the fly ${agreements} out of ${pairs.length} times. ${agreements >= 3 ? 'Low-level visual contrast often pulled you in the same direction.' : 'Your choices may rely more on meaning, familiarity or taste than the fly’s early visual circuitry.'}`;
  $('recap').innerHTML = history.map((outcome, index) => `<li class="${outcome.agreed ? 'agree' : 'disagree'}"><b>${index + 1}</b><span><small>You</small>${escapeHtml(outcome.human.host)}</span><span><small>Fly</small>${escapeHtml(outcome.fly.host)}</span><i>${outcome.agreed ? 'Same' : 'Split'}</i></li>`).join('');
  $('shareLine').textContent = `I agreed with the fly ${agreements} out of 5 times.`;
  celebrate();
  void prepareScienceShare(pct);
  scrollTo({ top: 0, behavior: 'smooth' });
}

function celebrate(): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = $('confetti'); box.replaceChildren();
  const colours = ['#ffcd3c', '#6dff7a', '#fa9f42', '#a66ca5', '#f6ecdc'];
  for (let i = 0; i < 70; i++) {
    const piece = document.createElement('i');
    piece.style.cssText = `--x:${Math.random() * 100}vw;--dx:${(Math.random() - .5) * 34}vw;--r:${Math.random() * 720 - 360}deg;--d:${Math.random() * .45}s;--c:${colours[i % colours.length]}`;
    box.append(piece);
  }
  setTimeout(() => box.replaceChildren(), 3200);
}

function renderScienceCard(pct: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#17110e'; ctx.fillRect(0, 0, 1200, 630);
  const glow = ctx.createRadialGradient(830, 210, 20, 830, 210, 480); glow.addColorStop(0, 'rgba(255,205,60,.2)'); glow.addColorStop(1, 'rgba(255,205,60,0)'); ctx.fillStyle = glow; ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = '#ffcd3c'; ctx.font = '700 24px sans-serif'; ctx.fillText('LAND OR BOUNCE · SCIENCE EXPERIMENT', 72, 82);
  ctx.fillStyle = '#f6ecdc'; ctx.font = '700 160px serif'; ctx.fillText(`${pct}%`, 65, 300);
  ctx.font = '600 62px serif'; ctx.fillText('fly match', 72, 380);
  ctx.fillStyle = '#bcb0a2'; ctx.font = '32px sans-serif'; ctx.fillText(`I agreed with the fly ${agreements} out of 5 times.`, 74, 465);
  ctx.fillStyle = '#6dff7a'; ctx.font = '700 28px sans-serif'; ctx.fillText('Would your eyes agree?  →', 74, 548);
  ctx.strokeStyle = 'rgba(246,236,220,.16)'; ctx.lineWidth = 2; ctx.strokeRect(28, 28, 1144, 574);
  return canvas;
}

async function prepareScienceShare(pct: number): Promise<void> {
  const button = $<HTMLButtonElement>('shareScience'); button.disabled = true; $('shareScienceText').textContent = 'Preparing card…';
  scienceShareLink = `${location.origin}/science`;
  try {
    const canvas = renderScienceCard(pct);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', .9));
    if (blob) {
      const response = await fetch('/api/card', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      if (response.ok) {
        const { id } = await response.json();
        if (/^[a-f0-9]{24}$/.test(id)) scienceShareLink = `${location.origin}/verdict?${new URLSearchParams({ science: '1', agreement: String(pct), card: id })}`;
      }
    }
  } catch { /* sharing still works with the experiment's regular preview */ }
  button.disabled = false; $('shareScienceText').textContent = 'Share the card';
}

function shareScience(): void {
  const pct = Math.round(agreements / pairs.length * 100);
  const text = `I matched the fruit fly ${pct}% of the time. Five landing-page choices, 29,195 fly neurons. Would your eyes agree?`;
  if (navigator.share) { void navigator.share({ title: `${pct}% fly match`, text, url: scienceShareLink }).catch(() => {}); return; }
  const win = window.open(`https://x.com/intent/post?text=${encodeURIComponent(`${text}\n\n${scienceShareLink}`)}`, '_blank', 'noopener');
  if (!win) void navigator.clipboard.writeText(`${text}\n\n${scienceShareLink}`);
}

function start(): void {
  stopTimers();
  round = 0; agreements = 0; history = [];
  usedCategories = new Set();
  sessionId = crypto.randomUUID();
  $('scienceIntro').hidden = true;
  $('scienceFinish').hidden = true;
  $('scienceGame').hidden = false;
  void showRound();
  scrollTo({ top: 0, behavior: 'smooth' });
}

$('scienceStart').addEventListener('click', start);
$('againScience').addEventListener('click', start);
$<HTMLButtonElement>('shareScience').addEventListener('click', shareScience);
document.addEventListener('keydown', (event) => {
  if ($('scienceGame').hidden || !$('reveal').hidden) return;
  if (event.key === 'ArrowLeft') choose('left');
  if (event.key === 'ArrowRight') choose('right');
});

document.title = 'Human vs Fly — the Land or Bounce experiment';
inject();
