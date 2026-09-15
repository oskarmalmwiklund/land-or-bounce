import '@fontsource-variable/fraunces';
import '@fontsource-variable/familjen-grotesk';
import '@fontsource-variable/jetbrains-mono';
import './styles.css';
import { labsBadge } from './labs/badge';
import { copyImage, download, renderCard, shareCard, toJpeg, type CardInput } from './judge/card';
import { variantsOf } from './judge/measure';
import { Narrator, type Line } from './judge/narrator';
import type { Score } from './judge/score';
import { loadCircuit, toData, SCREEN_H, SCREEN_W, type Circuit } from './neural/circuit';
import type { Heat, Snapshot, Variant, WorkerCommand, WorkerEvent } from './neural/protocol';
import { Room } from './render/Room';
import { Screen } from './render/Screen';
import { applyPalette } from './theme/palette';
import { inject } from '@vercel/analytics';
import { activityMarkup, startActivity } from './activity';

applyPalette(document.documentElement.style);

const DT_MS = 0.1;
const MAX_ADVANCE_MS = 40;
const BUDGET_MS = 30;
const EXPOSURE_MS = 1000;
const LOOK_SPEED = 0.5;
const DEFAULT_FOLDS = 2;
const APP_HOST = location.host.replace(/^www\./, '') || 'landorbounce.vercel.app';

type State = 'waking' | 'idle' | 'capturing' | 'judging' | 'result' | 'error';

const ICON = {
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
  bluesky: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M12 3v12m0-12 4 4m-4-4L8 7M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M9 9h10v11H9zM5 15V4h10"/></svg>',
  save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M12 4v11m0 0 4-4m-4 4-4-4M4 19h16"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M10 14a4 4 0 0 0 5.66 0l2.83-2.83a4 4 0 0 0-5.66-5.66L11.5 6.83M14 10a4 4 0 0 0-5.66 0l-2.83 2.83a4 4 0 0 0 5.66 5.66l1.33-1.32"/></svg>',
};

const app = document.getElementById('app')!;
app.innerHTML = `
<canvas id="room" class="room" aria-hidden="true"></canvas>
<div class="grain" aria-hidden="true"></div>
<main class="page" id="page" data-state="waking">
  <header class="top">
    <div class="brand">
      <a class="wordmark" href="/" aria-label="Land or Bounce home">Land <span>or</span> Bounce<i>.</i></a>
      ${labsBadge()}
    </div>
    <nav class="top-nav">
      <span class="live" id="live" title="The eye is running in a Web Worker in this tab"><i></i><b id="liveSpikes">0</b> spikes / 60 ms</span>
      <a class="text-button science-nav" href="/science">Science experiment</a>
      <button type="button" class="text-button" id="aboutButton">How it works</button>
    </nav>
  </header>

  <section class="stage" id="stage">
    <div class="hero" id="hero">
      <p class="kicker" id="kicker">A fruit fly has opinions about your landing page</p>
      <h1 id="title">Land <em>or</em> bounce<span class="dot">.</span></h1>
      <p class="lead" id="lead">Paste your site. 29,195 real neurons of a fruit fly’s eye look at it, live in this tab, and score it 0 to 100. It cannot read. It has no red receptors. It knows what it likes.</p>
      <form class="urlform" id="form" autocomplete="off">
        <label class="sr-only" for="url">Your website</label>
        <span class="proto" aria-hidden="true">https://</span>
        <input id="url" name="url" type="text" inputmode="url" spellcheck="false" placeholder="yoursite.com" required>
        <button type="submit" class="go" id="go"><span class="long">Release the fly</span><span class="short">Go</span></button>
      </form>
      <p class="dataset-notice">By submitting a website, you agree to add its URL, screenshot and fly measurements to our research dataset. Its screenshot may appear in the <a href="/science">science experiment</a>.</p>
      <p class="hero-foot" id="heroFoot"><label class="text-button" for="filePick">or drop a screenshot<input class="hidden-input" type="file" id="filePick" accept="image/*"></label><span class="sep">·</span>Dropped screenshots stay in your browser.</p>
      <a class="science-teaser" href="/science" aria-label="Join the human versus fly science experiment">
        <span class="science-mini-stack" aria-hidden="true"><i></i><i></i><b>← or →</b></span>
        <span><strong>Would you pick the same page as a fly?</strong><small>Join the 5-click science experiment</small></span>
        <b class="science-arrow">→</b>
      </a>
      ${activityMarkup()}
    </div>

    <div class="show" id="show" hidden>
      <div class="screen-frame" id="screenFrame">
        <canvas id="screen" aria-label="The screen the fly is looking at"></canvas>
        <div class="veil" id="veil" hidden><i class="spinner"></i><span id="veilText">Flying to your site…</span></div>
        <span class="variant-tag" id="variantTag" hidden></span>
        <div class="stamp" id="stamp" hidden></div>
        <div class="oops" id="oops" hidden>
          <span class="who">The fly</span>
          <p id="oopsText"></p>
          <p class="hint" id="oopsHint"></p>
          <div class="row"><label class="secondary-button" for="filePick2">Drop a screenshot<input class="hidden-input" type="file" id="filePick2" accept="image/*"></label><button type="button" class="secondary-button" id="oopsAgain">Try another address</button></div>
        </div>
      </div>
      <div class="caption" id="caption"><span class="who">The fly</span><span class="text" id="captionText"></span></div>
    </div>

    <div class="result" id="result" hidden>
      <div class="verdict">
        <div class="score" aria-live="polite"><span class="num" id="scoreNum">0</span><span class="den">/100</span></div>
        <div class="band"><h2 id="bandTitle"></h2><p id="bandLine"></p><p class="scroll-note" id="bandScroll" hidden></p><p class="site" id="bandSite"></p></div>
      </div>
      <ol class="parts" id="parts"></ol>
      <div class="share" id="share">
        <button type="button" class="primary-button share-button" id="shareButton">${ICON.share}<span>Share the card</span></button>
        <div class="folds" id="foldPicker" hidden></div>
      </div>
      <a class="result-science" id="resultScience" href="/science"><span class="who">SCIENCE NEEDS YOUR EYES</span><strong>Would you pick what the fly picks?</strong><small>Five pairs. Five quick choices. Find out where you agree.</small><b>Join the experiment →</b></a>
      <details class="transcript" id="transcriptBox"><summary>Everything the fly said</summary><ol id="transcript"></ol></details>
      <button type="button" class="text-button again" id="againButton">Try another page</button>
    </div>
  </section>

  <footer class="foot">
    <span>Retina and lamina of <a href="https://male-cns.janelia.org/" target="_blank" rel="noopener">MaleCNS v1.0</a> (CC BY 4.0), simulated at 0.1 ms in your browser. Model activity, not fly behaviour.</span>
    <span class="mono" id="footFacts"></span>
    <span class="foot-links">
      <span>A <a href="https://multiply.co" target="_blank" rel="noopener">Multiply</a> experiment. More at <a href="https://multiply.co/labs" target="_blank" rel="noopener">multiply.co/labs</a></span>
      <a href="https://github.com/oskarmalmwiklund/land-or-bounce" target="_blank" rel="noopener">Source</a>
    </span>
  </footer>
</main>

<dialog class="dialog share-dialog" id="shareDialog">
  <div class="dialog-body">
    <button type="button" class="icon-button dialog-close" id="shareClose" aria-label="Close">✕</button>
    <h2 id="shareTitle">Share the verdict</h2>
    <p class="share-sub">This is the card. Pick a place, and the fly comes with a line back here.</p>
    <div class="card-preview"><img id="cardImg" alt="The share card"></div>
    <div class="post-preview"><span class="who">Your post</span><p id="postText"></p></div>
    <div class="share-grid">
      <button type="button" class="share-opt" data-share="x">${ICON.x}<span>Post on X</span></button>
      <button type="button" class="share-opt" data-share="linkedin">${ICON.linkedin}<span>LinkedIn</span></button>
      <button type="button" class="share-opt" data-share="bluesky">${ICON.bluesky}<span>Bluesky</span></button>
      <button type="button" class="share-opt" data-share="facebook">${ICON.facebook}<span>Facebook</span></button>
      <button type="button" class="share-opt" data-share="native" id="nativeShare" hidden>${ICON.share}<span>Share…</span></button>
      <button type="button" class="share-opt quiet" data-share="copy">${ICON.copy}<span>Copy image</span></button>
      <button type="button" class="share-opt quiet" data-share="save">${ICON.save}<span>Save PNG</span></button>
      <button type="button" class="share-opt quiet" data-share="link">${ICON.link}<span>Copy link</span></button>
    </div>
    <p class="share-note" id="shareNote">The link previews your card wherever it is posted. It is also copied to your clipboard on the way out, in case you would rather paste the picture itself.</p>
  </div>
</dialog>

<dialog class="dialog" id="about">
  <div class="dialog-body">
    <button type="button" class="icon-button dialog-close" id="aboutClose" aria-label="Close">✕</button>
    <h2>A fly’s eye, scoring your page</h2>
    <p>Every neuron in the fly is a real cell from the male fruit fly connectome (MaleCNS v1.0): the photoreceptors that sample the screen, the lamina where fly vision makes its first decision, and the cells that feed back onto it. The wiring and synapse counts are the published ones. The dynamics are a simple integrate-and-fire model, the same one the whole-brain fly simulators use, running in a Web Worker in this tab.</p>
    <div class="facts" id="facts"></div>
    <h3>What happens</h3>
    <p>We screenshot your page at 1440×810, one viewport per fold, up to three folds down. Each is shrunk to the fly’s 320×180 screen. The eye adapts to the page’s average brightness, the way real photoreceptors do, then looks at the top of the page for one second. Then it looks at the top in grey, weighted the way a human sees brightness, to find out what it is missing. Then it scrolls, one fold at a time. Everything the fly says is a measurement that just happened.</p>
    <h3>The five parts</h3>
    <dl>
      <dt>Notice <small>25</small></dt><dd>Mean change in firing of the L1–L3 lamina cells against a grey screen, in Hz per cell. Under about 1.2 Hz is a blank to this eye; dark pages with bright elements run past 10.</dd>
      <dt>Landing spot <small>25</small></dt><dd>Whether a few columns light up much harder than the rest: one clear thing to sit on. Everything hot, or nothing hot, both score low. The fly on your page sits at the centre of the hottest columns.</dd>
      <dt>Calm <small>20</small></dt><dd>The share of columns that barely changed: whitespace as the eye sees it. Best between a third and two thirds. All quiet is a blank, no quiet is noise.</dd>
      <dt>Balance <small>15</small></dt><dd>The left eye sees the left 60 % of the screen and the right eye the right 60 %. Both should be working.</dd>
      <dt>Fly-safe colour <small>15</small></dt><dd>The fly’s glance at the real page over its glance at a human-luminance grey version. R1–R6 weight the primaries about 3 % red, 42 % green, 55 % blue; anything that is red on your page is nearly dark to it.</dd>
    </dl>
    <h3>The scroll</h3>
    <p>The score is the top of the page, because that is what a landing page is judged on. The folds below get the same one-second look and the fly reports which fold moved it most. If that is not the top, it says so, on the card too.</p>
    <h3>What it cannot tell you</h3>
    <p>It cannot read. It has no memory of brands and no idea what a button is. In the full 166,700-neuron model the image signal stops at the lamina, so this page shows exactly the part that carries signal: pre-attentive salience at the first synapse, nothing deeper. Dark pages with bright elements are high contrast to this eye and score well on Notice; that is a property of the eye, not a design recommendation.</p>
    <p>Built on <a href="https://github.com/oskarmalmwiklund/swat-or-buy" target="_blank" rel="noopener">Swat or Buy</a>, which judges ads the same way. Simulator lineage: Bananflugakompassen and Stonkfly (MIT).</p>
    <p class="labs-note">This is a <a href="https://multiply.co" target="_blank" rel="noopener">Multiply</a> experiment, one of several at <a href="https://multiply.co/labs" target="_blank" rel="noopener">multiply.co/labs</a>.</p>
  </div>
</dialog>`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const page = $('page'), roomCanvas = $<HTMLCanvasElement>('room'), screenCanvas = $<HTMLCanvasElement>('screen'), screenFrame = $('screenFrame');

interface Current { host: string; url: string | null; title: string; folds: HTMLImageElement[] }

let circuit: Circuit;
let screen: Screen;
let room: Room;
let state: State = 'waking';
let settled = false;
let inFlight = false;
let lastWall = performance.now();
let narrator: Narrator | null = null;
let variantFrames: Record<Exclude<Variant, 'fold'>, Uint8ClampedArray> | null = null;
let heats = new Map<number, Heat>();          // by fold, 1-based
let typeQueue: Line[] = [];
let typing = false;
let current: Current | null = null;
let shownFold = 1;
let lastScore: Score | null = null;
let lastCard: CardInput | null = null;
let cardCanvas: HTMLCanvasElement | null = null;

const worker = new Worker(new URL('./neural/eye.worker.ts', import.meta.url), { type: 'module' });
const send = (c: WorkerCommand, transfer: Transferable[] = []) => worker.postMessage(c, transfer);

function setState(s: State): void { state = s; page.dataset.state = s; }
function toast(text: string): void {
  const el = document.createElement('div');
  el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = text;
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 400); }, 3600);
}
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const hostOf = (u: string) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return u; } };
const foldsWanted = () => { const f = Number(new URLSearchParams(location.search).get('folds')); return Number.isFinite(f) && f >= 1 ? Math.min(4, Math.floor(f)) : DEFAULT_FOLDS; };

// ---- the show -----------------------------------------------------------------------------
function resetShow(): void {
  narrator = null; variantFrames = null; heats = new Map(); typeQueue = []; typing = false; shownFold = 1;
  lastScore = null; lastCard = null; cardCanvas = null; storedCard = null; storing = null;
  screen.override = null; screen.overrideKind = null; screen.heat = null; screen.setLanding(null); screen.resetGlance();
  $('stamp').hidden = true; $('stamp').className = 'stamp';
  $('variantTag').hidden = true; $('oops').hidden = true; $('veil').hidden = true;
  $('result').hidden = true; $('transcript').innerHTML = ''; $('foldPicker').hidden = true; $('bandScroll').hidden = true;
  $('captionText').textContent = ''; $('caption').classList.remove('on');
  room.mood = 'idle';
}

function showOops(text: string, hint?: string): void {
  setState('error');
  $('veil').hidden = true;
  $('oopsText').textContent = text;
  $('oopsHint').textContent = hint ?? '';
  $('oops').hidden = false;
  room.mood = 'idle';
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  return img;
}

/** Fetch screenshots from the API and judge them. */
async function judgeUrl(raw: string): Promise<void> {
  if (state === 'capturing' || state === 'judging' || !settled) return;
  const typed = raw.trim().replace(/^https?:\/\//i, '');
  if (!typed) { $('url').focus(); return; }
  resetShow();
  setState('capturing');
  $('show').hidden = false;
  screen.image = null;
  $('veilText').textContent = `Flying to ${typed.split('/')[0]}…`;
  $('veil').hidden = false;
  room.mood = 'judging';
  const t0 = performance.now();
  try {
    const res = await fetch(`/api/capture?url=${encodeURIComponent(typed)}&folds=${foldsWanted()}`);
    const body = await res.json().catch(() => ({ error: 'The kitchen went quiet.' }));
    if (!res.ok) { showOops(body.error ?? 'I could not get there.', body.hint ?? 'Drop a screenshot and I will judge that.'); return; }
    if ((state as State) !== 'capturing') return;   // the visitor moved on while we were flying
    const srcs: string[] = Array.isArray(body.folds) && body.folds.length ? body.folds : [body.image];
    const folds = await Promise.all(srcs.map(loadImage));
    const host = hostOf(body.finalUrl || body.url);
    current = { host, url: body.finalUrl || body.url, title: body.title || '', folds };
    const q = new URLSearchParams(); q.set('site', host === hostOf(`https://${typed}`) ? typed : body.finalUrl); if (foldsWanted() !== DEFAULT_FOLDS) q.set('folds', String(foldsWanted()));
    history.replaceState(null, '', `/?${q}`);
    document.title = `${host} · Land or Bounce`;
    $('veilText').textContent = `Got ${folds.length === 1 ? 'it' : `${folds.length} folds`} in ${((performance.now() - t0) / 1000).toFixed(1)} s. Waking the eye…`;
    await startJudge();
  } catch (err) {
    showOops('Something in the kitchen went wrong.', err instanceof Error ? err.message : 'Try again, or drop a screenshot.');
  }
}

async function judgeFile(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) { toast('That is not an image.'); return; }
  if (state === 'capturing' || state === 'judging' || !settled) return;
  resetShow();
  setState('capturing');
  $('show').hidden = false;
  $('veilText').textContent = 'Unwrapping the screenshot…';
  $('veil').hidden = false;
  room.mood = 'judging';
  try {
    const url = URL.createObjectURL(file);
    const image = await loadImage(url);
    const host = file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'your screenshot';
    current = { host, url: null, title: '', folds: [image] };
    history.replaceState(null, '', '/');
    document.title = `${host} · Land or Bounce`;
    await startJudge();
  } catch { showOops('I could not open that image.', 'PNG or JPEG, please.'); }
}

async function startJudge(): Promise<void> {
  if (!current) return;
  screen.image = current.folds[0];
  screen.override = null; screen.overrideKind = 'page';
  const frame = screen.paintFlyScreen();
  if (!frame) { showOops('The screenshot came out empty.'); return; }
  variantFrames = variantsOf(frame.data);
  const foldBuffers = current.folds.slice(1).map((img) => screen.frameOf(img)!.data.slice().buffer);
  narrator = new Narrator(current.host);
  setState('judging');
  $('veil').hidden = true;
  $('caption').classList.add('on');
  inFlight = true;    // the worker owns the clock until judge-done
  const buf = frame.data.slice().buffer;
  send({ type: 'judge', frame: buf, exposureMs: EXPOSURE_MS, folds: foldBuffers }, [buf, ...foldBuffers]);
}

function endJudge(): void {
  inFlight = false;
  if (state === 'judging') setState(lastScore ? 'result' : 'idle');
}

// ---- narration --------------------------------------------------------------------------
function stageFor(variant: Variant | 'grey', fold = 1): void {
  const tag = $('variantTag');
  tag.hidden = false;
  if (variant === 'page') { tag.textContent = 'your page, adapted'; screen.scrollTo(current!.folds[0], -1); shownFold = 1; }
  else if (variant === 'grey') { tag.textContent = 'grey screen'; screen.override = null; screen.overrideKind = 'grey'; screen.image = null; }
  else if (variant === 'fold') { tag.textContent = `fold ${fold} of ${current!.folds.length}, adapted`; screen.scrollTo(current!.folds[fold - 1], 1); shownFold = fold; }
  else { tag.textContent = 'human brightness, in grey'; screen.image = current?.folds[0] ?? null; screen.override = variantFrames ? new ImageData(variantFrames.humangrey.slice(), SCREEN_W, SCREEN_H) : null; screen.overrideKind = variant; }
  screen.resetGlance();
}

function enqueue(lines: Line[]): void {
  typeQueue.push(...lines);
  if (!typing) void drain();
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function drain(): Promise<void> {
  typing = true;
  const cap = $('captionText');
  let lastKind: Line['kind'] | null = null;
  while (typeQueue.length) {
    const line = typeQueue.shift()!;
    lastKind = line.kind;
    const li = document.createElement('li'); li.className = line.kind; li.textContent = line.text; $('transcript').append(li);
    if (line.kind === 'verdict') showResult();
    cap.textContent = '';
    cap.parentElement!.dataset.kind = line.kind;
    const perChar = Math.min(16, 1400 / Math.max(20, line.text.length));
    for (let i = 0; i < line.text.length; i++) {
      cap.textContent += line.text[i];
      if (line.text[i] === ' ' || i % 2) await sleep(perChar);
      if (state !== 'judging' && state !== 'result') { typeQueue = []; break; }
    }
    await sleep(line.kind === 'measure' ? 900 : line.kind === 'verdict' ? 1600 : 500);
  }
  typing = false;
  // The worker only waits after a measurement, so only a drained measurement releases it.
  if (state === 'judging' && lastKind === 'measure') send({ type: 'judge-continue' });
}

// ---- the result ---------------------------------------------------------------------------
/** Put fold `k` on the screen with its heat and, where the fly found one, its landing spot. */
function showFold(k: number): void {
  if (!current || !narrator) return;
  const img = current.folds[k - 1];
  if (!img) return;
  screen.scrollTo(img, k >= shownFold ? 1 : -1);
  shownFold = k;
  screen.heat = heats.get(k) ?? null;
  const m = k === 1 ? narrator.metrics.page : narrator.folds[k - 2];
  screen.setLanding(m?.landing ? { u: m.landing.u, v: m.landing.v } : null);
  $('foldPicker').querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.fold) === k)));
}

function showResult(): void {
  if (!narrator || !current) return;
  const s = narrator.score();
  if (!s) return;
  lastScore = s;
  setState('result');
  inFlight = false;
  const scroll = narrator.scroll();
  $('variantTag').hidden = true;
  room.mood = s.landed ? 'landed' : 'bounced';
  showFold(1);
  // the stamp
  const stamp = $('stamp');
  stamp.textContent = s.landed ? 'LANDED' : 'BOUNCED';
  stamp.className = `stamp ${s.landed ? 'landed' : 'bounced'}`;
  stamp.hidden = false;
  requestAnimationFrame(() => stamp.classList.add('in'));
  // the score
  $('result').hidden = false;
  $('bandTitle').textContent = s.band.title;
  $('bandLine').textContent = s.band.line;
  $('bandSite').textContent = current.host;
  if (scroll && scroll.total > 1) {
    $('bandScroll').hidden = false;
    $('bandScroll').textContent = scroll.best === 1 ? `Scrolled ${scroll.total} folds. The top is the best one.` : `Scrolled ${scroll.total} folds. Fold ${scroll.best} is where the fly would land.`;
    const picker = $('foldPicker');
    picker.hidden = false;
    picker.innerHTML = `<span>Look at</span>` + current.folds.map((_, i) => `<button type="button" data-fold="${i + 1}" aria-pressed="${i === 0}">${i === 0 ? 'the top' : `fold ${i + 1}`}${scroll.best === i + 1 && i > 0 ? ' ★' : ''}</button>`).join('');
    picker.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('click', () => showFold(Number(b.dataset.fold))));
  }
  const num = $('scoreNum');
  const t0 = performance.now();
  const count = () => {
    const k = Math.min(1, (performance.now() - t0) / 1400);
    num.textContent = String(Math.round(s.total * (1 - (1 - k) ** 3)));
    if (k < 1) requestAnimationFrame(count);
  };
  count();
  $('parts').innerHTML = s.parts.map((p, i) => `<li style="--d:${i * 90}ms"><div class="head"><b>${p.label}</b><span class="q">${p.question}</span></div><div class="bar"><i style="width:${p.score}%" class="${p.score >= 50 ? 'good' : 'bad'}"></i></div><div class="nums"><span class="mono val">${escapeHtml(p.value)}</span><span class="mono pts">${p.score}<small>/100 · ×${p.weight}</small></span></div></li>`).join('');
  const pageMetrics = narrator.metrics.page!;
  lastCard = { image: current.folds[0], host: current.host, score: s, heat: heats.get(1) ?? null, landing: pageMetrics.landing ? { u: pageMetrics.landing.u, v: pageMetrics.landing.v } : null, appHost: APP_HOST, scroll: scroll && scroll.total > 1 ? { best: scroll.best, total: scroll.total } : null };
  $<HTMLAnchorElement>('resultScience').href = `/science?${new URLSearchParams({ from: current.host, fly: String(s.total) })}`;
  if (current.url) void contributeToScience();
  cardCanvas = null;
  void makeCard();
  setTimeout(() => $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 600);
}

// ---- sharing ------------------------------------------------------------------------------
async function makeCard(): Promise<HTMLCanvasElement | null> {
  if (!lastCard) return null;
  if (!cardCanvas) cardCanvas = await renderCard(lastCard);
  return cardCanvas;
}
const cardName = () => `land-or-bounce-${(current?.host ?? 'page').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${lastScore?.total ?? 0}.png`;
/** The id of this verdict's card in the store, once uploaded, so the link's preview is the card. */
let storedCard: string | null = null;
let storing: Promise<void> | null = null;
const shareLink = () => {
  if (!current?.url) return location.origin;
  const q = new URLSearchParams({ site: current.host });
  // with a stored card the link goes through /verdict, which serves the page with that card as its preview
  if (storedCard && lastScore) { q.set('card', storedCard); q.set('score', String(lastScore.total)); return `${location.origin}/verdict?${q}`; }
  return `${location.origin}/?${q}`;
};
/** Put the card in the store (once per verdict) so a shared link previews it. Quietly does nothing offline. */
function storeCard(cv: HTMLCanvasElement): Promise<void> {
  if (storedCard || !current?.url) return Promise.resolve();
  storing ??= (async () => {
    try {
      const blob = await toJpeg(cv);
      if (blob.size > 2_400_000) return;
      const res = await fetch('/api/card', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      if (res.ok) { const { id } = await res.json(); if (typeof id === 'string') storedCard = id; }
    } catch { /* the link still works, it just previews the house image */ }
  })();
  return storing;
}
/** The post: the verdict, then a line that brings people back here. */
const postText = (withLink: boolean) => {
  if (!current || !lastScore) return 'Land or Bounce';
  const verdict = `${current.host} scored ${lastScore.total}/100 with a fruit fly’s eye. ${lastScore.band.title}`;
  const back = `Release the fly on your own landing page${withLink ? `: ${shareLink()}` : ' at Land or Bounce'}`;
  return `${verdict}\n\n${back}`;
};

async function openShare(): Promise<void> {
  const cv = await makeCard();
  if (!cv) { toast('No verdict to share yet.'); return; }
  $<HTMLImageElement>('cardImg').src = cv.toDataURL('image/png');
  $('postText').textContent = postText(true);
  $('nativeShare').hidden = !navigator.share;
  const dialog = $<HTMLDialogElement>('shareDialog');
  dialog.showModal();
  // store the card so the link previews it; the posting buttons wait for the id so their
  // click stays a plain, synchronous gesture (no awaits before window.open or the clipboard)
  const posting = dialog.querySelectorAll<HTMLButtonElement>('.share-opt:not(.quiet)');
  if (!storedCard && current?.url) {
    posting.forEach((b) => { b.disabled = true; });
    dialog.classList.add('preparing');
    void storeCard(cv).finally(() => { posting.forEach((b) => { b.disabled = false; }); dialog.classList.remove('preparing'); if (dialog.open) $('postText').textContent = postText(true); });
  }
}

/**
 * Open the posting site with the text. The card is already rendered when the dialog is
 * open, so nothing here awaits before the clipboard write or window.open: both need the
 * click. LinkedIn takes the link as `shareUrl`, so its attached preview is our card and
 * not whatever domain appears first in the text.
 */
function shareTo(where: string): void {
  const cv = cardCanvas;
  if (!cv) return;
  const link = shareLink();
  const intents: Record<string, string> = {
    x: `https://x.com/intent/post?text=${encodeURIComponent(postText(false))}&url=${encodeURIComponent(link)}`,
    linkedin: `https://www.linkedin.com/feed/?shareActive=true&shareUrl=${encodeURIComponent(link)}&text=${encodeURIComponent(postText(false))}`,
    bluesky: `https://bsky.app/intent/compose?text=${encodeURIComponent(postText(true))}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
  };
  switch (where) {
    case 'native':
      void shareCard(cv, postText(false), link, cardName()).then((r) => { if (r === 'unsupported') toast('Sharing is not available here. Pick a site below.'); });
      return;
    case 'copy':
      void copyImage(cv).then((ok) => { toast(ok ? 'Card copied. Paste it anywhere.' : 'Could not copy here. Saving instead.'); if (!ok) void download(cv, cardName()); });
      return;
    case 'save': void download(cv, cardName()); return;
    case 'link': navigator.clipboard.writeText(link).then(() => toast('Link copied. It previews your card.'), () => toast(link)); return;
  }
  if (!intents[where]) return;
  // start the copy first (it needs the document focused), then open the site in the same tick
  const copying = copyImage(cv);
  const win = window.open(intents[where], '_blank', 'noopener');
  void copying.then((ok) => toast(storedCard
    ? (ok ? 'The link previews your card. It is on your clipboard too, if you would rather paste it.' : 'The link previews your card.')
    : (ok ? 'Card copied. Paste it into your post.' : 'Could not copy the card here. Use Save PNG and attach it.')));
  if (!win) toast('Your browser blocked the pop-up. Allow it and try again.');
}

// ---- main loop ----------------------------------------------------------------------------
let recentSpikes = 0, spikeShown = 0, lastSpikeDraw = 0;
function tick(): void {
  requestAnimationFrame(tick);
  const now = performance.now();
  const wallDt = Math.min(100, now - lastWall);
  lastWall = now;
  room.screen = state === 'idle' || state === 'waking' ? null : (() => { const r = screenFrame.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })();
  room.render(now);
  if (!settled) return;
  if ($('show').hidden === false) screen.render(now);
  if (state === 'judging' || inFlight) return;
  // look mode: the eye keeps looking at whatever is on the screen, at half speed
  const image = state === 'result' ? screen.paintFlyScreen() : null;
  const flyMs = Math.max(10, Math.min(MAX_ADVANCE_MS, Math.round((wallDt * LOOK_SPEED) / 10) * 10));
  inFlight = true;
  if (image) { const copy = image.data.slice().buffer; send({ type: 'frame', rgba: copy }, [copy]); }
  else send({ type: 'frame', rgba: null });
  send({ type: 'advance', ms: flyMs, budgetMs: BUDGET_MS });
}

function onSnapshot(snap: Snapshot): void {
  if (state !== 'judging') inFlight = false;
  if (state === 'judging') screen.setGlance(snap.glance);
  if (snap.showing && state === 'judging') {
    const v = snap.showing.variant, fold = snap.showing.fold ?? 1;
    if (v === 'fold' ? shownFold !== fold : screen.overrideKind !== v) stageFor(v, fold);
  }
  recentSpikes = recentSpikes * Math.exp(-snap.advancedMs / 60) + snap.spikes;
  const now = performance.now();
  spikeShown += (recentSpikes - spikeShown) * 0.2;
  if (now - lastSpikeDraw > 160) { lastSpikeDraw = now; $('liveSpikes').textContent = Math.round(spikeShown).toLocaleString('en-US'); }
}

worker.onmessage = (e: MessageEvent<WorkerEvent>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'ready':
      send({ type: 'settle', settleMs: 500, measureMs: 500 });
      break;
    case 'settled':
      settled = true;
      if (state === 'waking') setState('idle');
      $('go').classList.add('ready');
      void acceptQuery();
      break;
    case 'snapshot': onSnapshot(msg); break;
    case 'judge-step': case 'judge-measure':
      if (narrator) enqueue(narrator.lines(msg));
      break;
    case 'judge-heat': heats.set(msg.fold ?? 1, msg.heat); break;
    case 'judge-done':
      if (narrator) enqueue(narrator.lines(msg));
      inFlight = false;
      break;
    case 'judge-aborted':
      if (narrator) enqueue(narrator.lines(msg));
      endJudge();
      break;
    case 'error': toast(`Eye error: ${msg.message}`); inFlight = false; break;
  }
};

// ---- boot ---------------------------------------------------------------------------------
let queryDone = false;
async function acceptQuery(): Promise<void> {
  if (queryDone) return;
  queryDone = true;
  const u = new URLSearchParams(location.search).get('site');
  if (u) { $<HTMLInputElement>('url').value = u; void judgeUrl(u); }
}

function goIdle(): void {
  if (state === 'judging' || state === 'capturing') send({ type: 'abort' });
  resetShow();
  current = null;
  screen.image = null;
  $('show').hidden = true;
  setState('idle');
  history.replaceState(null, '', '/');
  document.title = 'Land or Bounce — a fruit fly scores your landing page';
  const input = $<HTMLInputElement>('url'); input.value = ''; input.focus();
}

async function contributeToScience(): Promise<void> {
  if (!current?.url || !current.folds[0] || !lastScore || !narrator?.metrics) {
    return;
  }
  try {
    const source = current.folds[0];
    const canvas = document.createElement('canvas');
    canvas.width = source.naturalWidth || 1440; canvas.height = source.naturalHeight || 810;
    canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
    const screenshot = canvas.toDataURL('image/jpeg', 0.82);
    const response = await fetch('/api/science-submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: current.url, hostname: current.host, title: current.title, screenshot, width: canvas.width, height: canvas.height, score: lastScore, metrics: narrator.metrics, consent: true }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not save the page.');
  } catch (error) {
    toast('Your fly verdict is ready, but we could not save it to the research dataset.');
  }
}

async function boot(): Promise<void> {
  room = new Room(roomCanvas);
  const fitRoom = () => room.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', fitRoom); fitRoom();
  requestAnimationFrame(tick);
  try { circuit = await loadCircuit(); }
  catch (err) { toast(`Could not load the circuit: ${err instanceof Error ? err.message : err}`); return; }
  screen = new Screen(screenCanvas, circuit);
  new ResizeObserver(() => screen.resize(screenFrame.clientWidth, screenFrame.clientHeight)).observe(screenFrame);
  const m = circuit.manifest;
  $('footFacts').textContent = `${m.neurons.toLocaleString('en-US')} neurons · ${m.edges.toLocaleString('en-US')} connections`;
  $('facts').innerHTML = `<span><b>${m.neurons.toLocaleString('en-US')}</b>real neurons</span><span><b>${m.edges.toLocaleString('en-US')}</b>connections</span><span><b>${(m.synaptic_contacts / 1e6).toFixed(2)} M</b>synaptic contacts</span><span><b>${m.types.length}</b>cell types</span><span><b>${DT_MS} ms</b>timestep</span>`;
  send({ type: 'init', circuit: toData(circuit), dtMs: DT_MS });

  $('form').addEventListener('submit', (e) => { e.preventDefault(); void judgeUrl($<HTMLInputElement>('url').value); });
  for (const id of ['filePick', 'filePick2']) $<HTMLInputElement>(id).addEventListener('change', (e) => { const t = e.target as HTMLInputElement; if (t.files?.[0]) void judgeFile(t.files[0]); t.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); page.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); page.classList.remove('is-over'); }));
  document.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (f) void judgeFile(f); });
  document.addEventListener('paste', (e) => {
    const f = e.clipboardData?.files?.[0];
    if (f) { void judgeFile(f); return; }
    const text = e.clipboardData?.getData('text')?.trim();
    if (text && /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(text) && document.activeElement !== $('url') && state === 'idle') { $<HTMLInputElement>('url').value = text; void judgeUrl(text); }
  });
  $('againButton').addEventListener('click', goIdle);
  $('oopsAgain').addEventListener('click', goIdle);
  $('shareButton').addEventListener('click', () => { void openShare(); });
  const shareDialog = $<HTMLDialogElement>('shareDialog');
  $('shareClose').addEventListener('click', () => shareDialog.close());
  shareDialog.addEventListener('click', (e) => { if (e.target === shareDialog) shareDialog.close(); });
  shareDialog.querySelectorAll<HTMLButtonElement>('[data-share]').forEach((b) => b.addEventListener('click', () => shareTo(b.dataset.share!)));
  const about = $<HTMLDialogElement>('about');
  $('aboutButton').addEventListener('click', () => about.showModal());
  $('aboutClose').addEventListener('click', () => about.close());
  about.addEventListener('click', (e) => { if (e.target === about) about.close(); });
  document.addEventListener('keydown', (e) => { if (e.key === '?' && !about.open && !shareDialog.open && document.activeElement !== $('url')) about.showModal(); });
  $('url').focus();
}

// Inject Vercel Web Analytics
inject();
startActivity();

void boot();
