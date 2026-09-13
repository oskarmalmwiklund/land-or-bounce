/** Screenshot the app with local Chrome at several moments: node scripts/shot.mjs <url> <prefix> <ms,ms,...> [width] [height] */
import puppeteer from 'puppeteer-core';
const [url, prefix, waits = '3000', width = '1440', height = '960'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() !== 'debug') console.log('[console]', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.setViewport({ width: Number(width), height: Number(height), deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
let t = 0;
for (const w of waits.split(',').map(Number)) {
  await new Promise((r) => setTimeout(r, w - t)); t = w;
  const out = `${prefix}-${w}.png`;
  await page.screenshot({ path: out, fullPage: true });
  const caption = await page.evaluate(() => document.getElementById('captionText')?.textContent);
  console.log('wrote', out, '| state', await page.evaluate(() => document.getElementById('page')?.dataset.state), '| caption:', caption);
}
await browser.close();
