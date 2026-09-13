# Land or Bounce

Paste a landing page. A fruit fly's eye looks at it, live in the browser, and scores it 0 to
100. The eye is the retina and lamina of the MaleCNS v1.0 connectome (29,195 neurons, 592,137
connections) simulated as leaky integrate-and-fire cells at 0.1 ms in a Web Worker. It cannot
read. It has no red receptors. Fifty and up lands.

Sibling of [Swat or Buy](https://github.com/oskarmalmwiklund/swat-or-buy), which judges two ads
side by side with the same eye. The kernel, retinal mapping and the eye circuit data are copied
from there; see `THIRD_PARTY.md`.

## What happens on the page

1. **The room.** A kitchen at night, one lamp, a bowl of fruit past its best, and eighteen
   fruit flies drawn to the light. The address field sits in the middle.
2. **Capture.** `/api/capture` screenshots the page at 1440×810 with a headless Chromium,
   one viewport per fold, scrolling between shots, up to three folds (`&folds=`, max 4) and
   sends back JPEGs. Nothing else leaves the browser. A screenshot can be dropped instead,
   for local pages or pages that will not let a bot in.
3. **The show.** The top fold becomes the fly's 320×180 screen. The eye adapts to the page's
   average brightness, looks at it for a second, then looks at a grey version weighted the
   way a human sees brightness. Then it scrolls: each fold below gets the same one-second
   look, the screen sliding down between them. The fly narrates every measurement as it
   lands; the glance map paints the lamina columns that stand out. The flies in the room
   move to the screen.
4. **The verdict.** A score out of 100 for the top fold, a LANDED or BOUNCED stamp, the fly
   sitting where it would land, five parts with the numbers behind them, and which fold moved
   the eye most. A picker flips the screen between folds, each with its own glance map. If it
   landed, the flies settle on the frame. If it bounced, they leave.
5. **Share.** One button opens the card (1200×630) with the post text, which always ends with
   a line back to the site. Buttons for X, LinkedIn, Bluesky and Facebook open the posting
   site with the text prefilled and copy the card to the clipboard on the way, since intent
   links cannot carry an image; plus native Web Share with the PNG attached, copy image, save
   PNG and copy link. The link, `?site=yoursite.com`, re-runs the fly.

## How the score is built

Every part is a curve over something the eye produced (`src/judge/score.ts`). The total is a
weighted sum.

| Part | Weight | Measures | Curve |
|---|---|---|---|
| Notice | 25 | Mean change in L1–L3 lamina firing against grey, Hz per cell | 0 at 1 Hz, 100 at 10 Hz |
| Landing spot | 25 | Whether a few columns light up much harder than the rest: peak ratio 2.8–4.8× and 5–16 % hot columns is ideal | plateau, gated by Notice |
| Calm | 20 | Share of columns that changed under 2.5 Hz: whitespace as the eye sees it | plateau at 30–70 %, gated by Notice |
| Balance | 15 | Left eye's mean change over both eyes' | plateau at 44–56 %, gated by Notice |
| Fly-safe colour | 15 | Glance at the real page over glance at its human-luminance grey twin | 0 at 0.7, 100 at 1.0 |

The score is the top fold only, because that is what a landing page is judged on; the folds
below are reported, not scored.

Ranges from `npm run calibrate` on a dozen real pages, at the operating grey of 40: a flat
frame gives 0.9 Hz of glance (the noise floor), text-heavy white pages 1.3–1.6 Hz, pages with
one big hero block 3–8 Hz, dark pages with bright elements 10–13 Hz. Dark pages score high
on Notice because they are high contrast to this eye; that is a property of the eye, not a
recommendation.

Two things were added to the Swat or Buy kernel to make white pages visible to it:

- **Light adaptation.** The kernel's photoreceptors have a fixed operating point and saturate
  above mid-grey, so a white page read as a blank. Every frame is now scaled in linear light so
  its mean fly luminance equals the grey the eye settled on, the way real photoreceptors move
  their operating point within a second or two (`adapt` in `src/judge/measure.ts`).
- **Operating grey 40.** The eye settles on sRGB 40 instead of 128. That is the receptor curve's
  half-saturation point, so darker and brighter than the page mean both register. The
  reference-rate test still runs at 128 and still passes.

## What it cannot tell you

It cannot read, has no memory of brands and no idea what a button is. In the full
166,700-neuron model the image signal stops at the lamina, so this shows exactly the part that
carries signal: pre-attentive salience at the first synapse. Every number is a readout of an
engineered model, not fly behaviour, and the simulator is deterministic: the same screenshot
gives the same score forever.

## Run it

Node 22+ and a local Chrome (for `/api/capture` in development; set `CHROME_PATH` if it is not
in the usual place).

```sh
npm ci
npm run dev                       # http://127.0.0.1:5173
npm test                          # kernel validation against the Python reference, score rules
npm run calibrate -- https://a.com https://b.com   # print the eye's numbers for real pages
npm run build                     # dist/
node scripts/shot.mjs "http://127.0.0.1:5173/?site=stripe.com" scratch/shot 8000,50000
```

## Deploy

Vercel: import the repository, framework Vite. `api/capture.ts` runs as a Node function with
`@sparticuz/chromium` (2 GB, 60 s, set in `vercel.json`). Everything else is static.
The capture endpoint refuses private, loopback and link-local hosts before and after redirects
and caches a capture for fifteen minutes.

## Layout

```
api/capture.ts            headless screenshot endpoint (Vercel function, also Vite dev middleware)
src/neural/EyeBrain.ts    the kernel (from Swat or Buy), validated by EyeBrain.test.ts
src/neural/eye.worker.ts  look mode and the judging protocol
src/judge/measure.ts      adaptation, metrics, the human-grey twin
src/judge/score.ts        the five parts, weights, curves, bands
src/judge/narrator.ts     measurements to sentences
src/judge/card.ts         the share card and the ways out of the browser
src/render/Room.ts        the kitchen and the flies
src/render/Screen.ts      the fly's screen, glance map, the landed fly
src/main.ts               the page
scripts/calibrate.ts      real pages through the eye, for tuning the curves
public/data/              the eye circuit (2 MB gzipped) and reference rates
```

## Licence

MIT for the experiment code. Simulator lineage and data attribution in `THIRD_PARTY.md`.
