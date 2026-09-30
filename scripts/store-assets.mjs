// Renders the Chrome Web Store listing images into store/chrome/: the 128px store icon and five 1280x800
// screenshots. The screenshots frame real captures of the built extension (dist/chrome), driven in
// headless Chrome against demo sites served locally under example.com hostnames.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { launchWithExtension } from '../test/browser.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${root}store/chrome`;
const RAW = process.env.STORE_RAW_DIR;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------------------------------
// Demo sites. Each host gets a page with a consent banner; every other host (the trackers) gets a 204.

const MARK_PATH = 'M30.769 9.846A16 16 0 1 1 22.154 1.231A8.615 8.615 0 0 0 30.769 9.846Z';

const BANNERS = {
  // OneTrust with its JavaScript API, answered through the API.
  onetrust: `
    <div id="onetrust-consent-sdk"><div id="onetrust-banner-sdk" class="cmp">
      <p><strong>We value your privacy</strong><br>We and our partners use cookies to personalise content and ads and to analyse our traffic.</p>
      <div class="cmp-actions">
        <button id="onetrust-pc-btn-handler" class="ghost">Cookie settings</button>
        <button id="onetrust-reject-all-handler">Reject all</button>
        <button id="onetrust-accept-btn-handler">Accept all cookies</button>
      </div>
    </div></div>
    <script>
      let closed = false;
      const close = () => { closed = true; document.getElementById('onetrust-banner-sdk')?.remove(); answered(); };
      window.OneTrust = { AllowAll: close, RejectAll: close, IsAlertBoxClosed: () => closed };
      for (const id of ['onetrust-reject-all-handler', 'onetrust-accept-btn-handler']) document.getElementById(id).onclick = close;
    </script>`,
  // Cookiebot without its API, answered by clicking.
  cookiebot: `
    <div id="CybotCookiebotDialog" class="cmp">
      <p><strong>This website uses cookies</strong><br>We use cookies for statistics and marketing, and share information with our advertising partners.</p>
      <div class="cmp-actions">
        <button id="CybotCookiebotDialogBodyButtonDecline">Deny</button>
        <button id="CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll">Allow all</button>
      </div>
    </div>
    <script>
      for (const id of ['CybotCookiebotDialogBodyButtonDecline', 'CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll']) {
        document.getElementById(id).onclick = () => { document.getElementById('CybotCookiebotDialog').remove(); answered(); };
      }
    </script>`,
  // CookieYes, answered by clicking.
  cookieyes: `
    <div class="cky-consent-container cmp">
      <p><strong>We value your privacy</strong><br>We use cookies to enhance your browsing experience and analyse our traffic.</p>
      <div class="cmp-actions">
        <button class="cky-btn cky-btn-reject">Reject All</button>
        <button class="cky-btn cky-btn-accept">Accept All</button>
      </div>
    </div>
    <script>
      for (const button of document.querySelectorAll('.cky-btn')) {
        button.onclick = () => { document.querySelector('.cky-consent-container').remove(); answered(); };
      }
    </script>`,
};

// Trackers a site loads before asking, and once it has an answer whatever the answer was.
const TRACKING = {
  shop: {
    load: {
      cookies: ['_ga=GA1.1.1846.1727', '_ga_7QX2K1=GS1.1.1727.1', '_fbp=fb.1.1727.1846'],
      pixels: ['http://www.google-analytics.com/g/collect?v=2&en=page_view', 'http://www.facebook.com/tr?ev=PageView'],
    },
    answered: {
      cookies: ['_gcl_au=1.1.1846.1727', '_ttp=a1b2c3'],
      pixels: ['http://analytics.tiktok.com/api/v2/pixel?event=ViewContent', 'http://www.googleadservices.com/pagead/conversion/1846/'],
    },
  },
  recipes: {
    load: {
      cookies: ['_ga=GA1.1.2211.1727', '_fbp=fb.1.1727.2211', '_pin_unauth=dWlkPT', '_hjSessionUser_3141=eyJpZCI6'],
      pixels: [
        'http://www.google-analytics.com/g/collect?v=2&en=page_view',
        'http://www.facebook.com/tr?ev=PageView',
        'http://ct.pinterest.com/v3/?event=pagevisit',
        'http://in.hotjar.com/api/v2/client/sites/3141/visit-data',
      ],
    },
    answered: { cookies: [], pixels: ['http://www.facebook.com/tr?ev=ViewContent'] },
  },
};

const SITES = {
  'news.example.com': {
    name: 'The Morning Harbour',
    accent: '#0f4c5c',
    nav: ['World', 'Business', 'Climate', 'Culture', 'Opinion'],
    kicker: 'Climate',
    title: 'Coastal towns are rebuilding their harbours for a wetter century',
    dek: 'From Bergen to Brest, engineers are raising quays and rethinking breakwaters. The bill is large, and so is the ambition.',
    art: 'linear-gradient(160deg, #9fb8c1 0%, #5f8795 45%, #2f5664 100%)',
    banner: 'onetrust',
  },
  'shop.example.com': {
    name: 'Fieldhouse Supply',
    accent: '#7a4a1e',
    nav: ['New in', 'Outerwear', 'Footwear', 'Camping', 'Sale'],
    kicker: 'Autumn collection',
    title: 'Waxed cotton jackets, made to last a decade of weather',
    dek: 'Hand-finished in small batches, with a free repair service for as long as you own it.',
    art: 'linear-gradient(150deg, #d8c3a5 0%, #a57f55 50%, #6b4a2b 100%)',
    banner: 'cookiebot',
    tracking: 'shop',
  },
  'recipes.example.com': {
    name: 'Weeknight Kitchen',
    accent: '#8a3b2e',
    nav: ['Quick dinners', 'Vegetarian', 'Baking', 'Meal plans'],
    kicker: '30-minute dinners',
    title: 'One-pan roasted squash with brown butter and sage',
    dek: 'Four ingredients, one tray, and a sauce that makes itself while the oven does the work.',
    art: 'linear-gradient(145deg, #f0c27b 0%, #d98b4a 45%, #9c4a2c 100%)',
    banner: 'cookieyes',
    tracking: 'recipes',
  },
  // Only visited for the activity log.
  'weather.example.com': { name: 'Weather', accent: '#335', nav: [], title: 'Forecast', banner: 'cookieyes' },
  'travel.example.com': { name: 'Travel', accent: '#353', nav: [], title: 'Trips', banner: 'onetrust' },
  'forum.example.com': { name: 'Forum', accent: '#533', nav: [], title: 'Threads', banner: 'cookiebot' },
};

function sitePage(host) {
  const site = SITES[host];
  const tracking = TRACKING[site.tracking] ?? { load: { cookies: [], pixels: [] }, answered: { cookies: [], pixels: [] } };
  return `<!doctype html><meta charset="utf-8"><title>${site.name}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.6 Georgia, 'Iowan Old Style', serif; color: #1f2328; background: #fbfaf8; }
  header { display: flex; align-items: baseline; gap: 32px; padding: 18px 40px; border-bottom: 1px solid #e6e2dc; background: #fff; }
  .logo { font-weight: 700; font-size: 22px; color: ${site.accent}; letter-spacing: -0.01em; }
  nav { display: flex; gap: 20px; font: 14px system-ui, sans-serif; color: #57606a; }
  main { max-width: 820px; padding: 36px 40px; }
  .kicker { font: 600 12px system-ui, sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: ${site.accent}; }
  h1 { font-size: 36px; line-height: 1.15; margin: 8px 0 12px; letter-spacing: -0.015em; }
  .dek { font-size: 19px; color: #57606a; margin: 0 0 22px; }
  .art { height: 300px; border-radius: 6px; background: ${site.art}; margin-bottom: 22px; }
  .lines span { display: block; height: 11px; margin: 12px 0; border-radius: 3px; background: #e7e3dd; }
  .cmp { position: fixed; left: 24px; right: 24px; bottom: 24px; display: flex; gap: 24px; align-items: center; justify-content: space-between;
         padding: 20px 24px; background: #fff; border-radius: 10px; box-shadow: 0 10px 40px rgb(0 0 0 / 0.18); font: 14px/1.5 system-ui, sans-serif; }
  .cmp p { margin: 0; max-width: 520px; }
  .cmp-actions { display: flex; gap: 8px; flex-shrink: 0; }
  .cmp button { font: 600 14px system-ui, sans-serif; padding: 10px 16px; border-radius: 6px; border: 1px solid #1f2328; background: #1f2328; color: #fff; }
  .cmp button.ghost { background: #fff; color: #1f2328; }
</style>
<header><span class="logo">${site.name}</span><nav>${site.nav.map((item) => `<span>${item}</span>`).join('')}</nav></header>
<main>
  ${site.kicker ? `<div class="kicker">${site.kicker}</div>` : ''}
  <h1>${site.title}</h1>
  ${site.dek ? `<p class="dek">${site.dek}</p>` : ''}
  <div class="art"></div>
  <div class="lines">${[96, 100, 92, 98, 64, 100, 94, 88].map((w) => `<span style="width:${w}%"></span>`).join('')}</div>
</main>
<script>
  const tracking = ${JSON.stringify(tracking)};
  const track = ({ cookies, pixels }) => {
    for (const cookie of cookies) document.cookie = cookie + '; path=/';
    for (const pixel of pixels) fetch(pixel, { mode: 'no-cors', cache: 'no-store' }).catch(() => {});
  };
  const answered = () => setTimeout(() => track(tracking.answered), 300);
  track(tracking.load);
</script>
${BANNERS[site.banner]}`;
}

async function startDemoServer() {
  const server = createServer((req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    if (!SITES[host] || new URL(req.url, 'http://x').pathname !== '/') {
      res.writeHead(204).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(sitePage(host));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { port: server.address().port, close: () => new Promise((resolve) => server.close(resolve)) };
}

// ---------------------------------------------------------------------------------------------------
// Driving the extension.

const server = await startDemoServer();
const { browser, onboarding } = await launchWithExtension('chrome', {
  // Every host resolves to the demo server, so the sites and their trackers are all local. The demo
  // server speaks plain HTTP, so Chrome must not upgrade or block those navigations.
  args: [
    `--host-resolver-rules=MAP * 127.0.0.1:${server.port}`,
    '--disable-features=HttpsUpgrades,HttpsFirstBalancedModeAutoEnable,HttpsFirstModeV2ForTypicallySecureUsers,HttpsFirstModeForAdvancedProtectionUsers',
    // Light mode, whatever the system uses.
    '--blink-settings=preferredColorScheme=1',
  ],
});
const workerTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'));
const worker = await workerTarget.worker();
const extensionOrigin = workerTarget.url().replace(/\/background\.js$/, '');

// Captures are taken at twice the size they're shown at, and kept as data URLs for the frames, with
// their size in CSS pixels (from the PNG header).
const shots = {};
const sizes = {};
async function capture(name, target, options = {}) {
  const png = Buffer.from(await target.screenshot({ type: 'png', ...options }));
  if (RAW) writeFileSync(`${RAW}/${name}.png`, png);
  shots[name] = `data:image/png;base64,${png.toString('base64')}`;
  sizes[name] = { width: png.readUInt32BE(16) / 2, height: png.readUInt32BE(20) / 2 };
}

const tabIdFor = (host) => worker.evaluate(async (h) => (await chrome.tabs.query({ url: `http://${h}/*` }))[0]?.id, host);

async function badgeFor(host) {
  return worker.evaluate(async (tabId) => {
    const text = await chrome.action.getBadgeText({ tabId });
    const color = await chrome.action.getBadgeBackgroundColor({ tabId });
    return { text, color: `rgb(${color.slice(0, 3).join(' ')})` };
  }, await tabIdFor(host));
}

// The toolbar popup for a site's tab. Headless popups are cut off at a fixed height and can't be
// resized or scaled, so the popup page is opened in a tab of its own, with the site's tab as the one
// it reports on.
async function capturePopup(name, host) {
  const tabId = await tabIdFor(host);
  const popup = await browser.newPage();
  await popup.evaluateOnNewDocument((id) => {
    const query = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = async (info) => (info.active ? [await chrome.tabs.get(id)] : query(info));
  }, tabId);
  await popup.setViewport({ width: 348, height: 600, deviceScaleFactor: 2 });
  await popup.goto(`${extensionOrigin}/popup/popup.html`);
  await popup.waitForFunction(() => document.getElementById('site-state')?.textContent);
  await sleep(300);
  const height = await popup.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height));
  await popup.setViewport({ width: 348, height, deviceScaleFactor: 2 });
  await capture(name, popup);
  await popup.close();
}

// Visits a demo site, lets BrowserConsent answer its banner and the site's trackers fire, and captures
// the page, the popup and the toolbar badge.
async function visitSite(host, name) {
  const page = await browser.newPage();
  await page.setViewport({ width: WINDOW.width, height: 720, deviceScaleFactor: 2 });
  await page.goto(`http://${host}/`);
  await page.waitForFunction(() => !document.querySelector('.cmp'), { timeout: 15_000 });
  await sleep(1500);
  if (!name) return page.close();
  await capture(`${name}-page`, page);
  await capturePopup(`${name}-popup`, host);
  const badge = await badgeFor(host);
  await page.close();
  return badge;
}

const WINDOW = { width: 740 };

// Onboarding: Reject all chosen and every statement ticked, just before activating.
await onboarding.setViewport({ width: 720, height: 1400, deviceScaleFactor: 2 });
await onboarding.click('#answer-reject');
const statements = await onboarding.$$eval('#statements .statement input', (inputs) => inputs.length);
for (let i = 1; i <= statements; i++) await onboarding.click(`#statements .statement:nth-child(${i}) input`);
await sleep(300);
await capture('consent', await onboarding.$('#consent-form'));
await onboarding.click('#activate');
await onboarding.waitForSelector('#done-step:not([hidden])', { timeout: 5_000 });
await onboarding.close();

// Sites answered earlier, for the activity log.
for (const host of ['forum.example.com', 'travel.example.com', 'weather.example.com']) await visitSite(host);

// A news site whose OneTrust banner is rejected through its API.
const badges = {};
badges.news = await visitSite('news.example.com', 'news');
// A shop that tracks before consent and carries on after the refusal.
badges.shop = await visitSite('shop.example.com', 'shop');

// Blocking, switched on in Settings.
const settings = await browser.newPage();
await settings.setViewport({ width: 760, height: 1400, deviceScaleFactor: 2 });
await settings.goto(`${extensionOrigin}/options/options.html`);
await settings.waitForSelector('#block-trackers');
await settings.click('#block-trackers');
await sleep(1000);
badges.recipes = await visitSite('recipes.example.com', 'recipes');

// Settings: the receipt and the activity log.
await settings.bringToFront();
await settings.reload();
await settings.waitForSelector('#consent-details:not([hidden])');
await sleep(300);
await capture('receipt', await settings.$('section:has(#consent-title)'));
await capture('activity', await settings.$('section:has(#activity-title)'));
await settings.close();

// ---------------------------------------------------------------------------------------------------
// Framing. Each screenshot is a headline on the left and the captures on the right, on Katla purple.

const markFill = readFileSync(`${root}assets/logo/logo.svg`, 'utf8').match(/fill="(#[0-9a-f]{6})"/i)[1];
const mark = (fill) => `<svg viewBox="0 0 32 32"><path d="${MARK_PATH}" fill="${fill}"/></svg>`;

const ICONS = {
  back: '<path d="M15 6l-6 6 6 6" />',
  forward: '<path d="M9 6l6 6-6 6" />',
  reload: '<path d="M19 12a7 7 0 1 1-2.05-4.95M19 5v4h-4" />',
  tune: '<path d="M5 8h9M18 8h1M5 16h1M10 16h9" /><circle cx="16" cy="8" r="2" /><circle cx="8" cy="16" r="2" />',
  puzzle: '<path d="M9 5h4v2a1.5 1.5 0 0 0 3 0V5h3v4h-2a1.5 1.5 0 0 0 0 3h2v7H5v-7h2a1.5 1.5 0 0 0 0-3H5V5h4z" />',
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

const FRAME_CSS = `
  * { box-sizing: border-box; margin: 0; }
  body { width: 1280px; height: 800px; overflow: hidden; position: relative; color: #fff;
    background: radial-gradient(1100px 900px at 88% 0%, #6d28d9 0%, #4c1d95 45%, #2a0f5c 100%);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
  .brand { position: absolute; left: 72px; top: 60px; display: flex; align-items: center; gap: 12px; font-weight: 600; font-size: 16px; line-height: 1.2; }
  .brand svg { width: 30px; height: 30px; }
  .brand small { display: block; font-weight: 400; font-size: 13px; color: #cbbcf2; }
  .copy { position: absolute; left: 72px; top: 0; bottom: 0; width: 372px; display: flex; flex-direction: column; justify-content: center; gap: 22px; }
  h1 { font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif; font-weight: 600; font-size: 48px; line-height: 1.06; letter-spacing: -0.015em; text-wrap: balance; }
  .copy p { font-size: 18px; line-height: 1.55; color: #e0d6fa; text-wrap: pretty; }
  .window { position: absolute; left: 496px; top: 72px; width: ${WINDOW.width}px; height: 800px; background: #fff; border-radius: 12px 12px 0 0;
    overflow: hidden; box-shadow: 0 40px 90px rgb(10 0 30 / 0.55), 0 0 0 1px rgb(255 255 255 / 0.08); color: #1f1f1f; }
  .tabs { height: 40px; background: #e3e6ec; display: flex; align-items: flex-end; padding: 0 10px; gap: 8px; }
  .dots { display: flex; gap: 8px; align-self: center; margin: 0 10px 0 4px; }
  .dots span { width: 12px; height: 12px; border-radius: 50%; background: #c7ccd4; }
  .tab { width: 230px; height: 32px; background: #fff; border-radius: 10px 10px 0 0; display: flex; align-items: center; gap: 8px; padding: 0 12px; font-size: 12.5px; }
  .tab .favicon { width: 16px; height: 16px; border-radius: 4px; flex-shrink: 0; }
  .toolbar { height: 46px; display: flex; align-items: center; gap: 6px; padding: 0 10px; border-bottom: 1px solid #e3e6ec; color: #5f6368; }
  .icon { width: 20px; height: 20px; margin: 0 4px; flex-shrink: 0; }
  .omnibox { flex: 1; height: 34px; border-radius: 17px; background: #edf0f4; display: flex; align-items: center; gap: 8px; padding: 0 12px; font-size: 14px; color: #1f1f1f; }
  .omnibox .icon { width: 18px; height: 18px; margin: 0; color: #5f6368; }
  .ext { position: relative; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: #ede7fb; }
  .ext svg { width: 18px; height: 18px; }
  .badge { position: absolute; right: -5px; bottom: 1px; min-width: 18px; height: 15px; padding: 0 4px; border-radius: 4px; color: #fff;
    font: 700 10.5px/15px -apple-system, sans-serif; text-align: center; box-shadow: 0 0 0 1.5px #fff; }
  .avatar { width: 26px; height: 26px; border-radius: 50%; background: linear-gradient(135deg, #94a3b8, #64748b); margin-left: 4px; }
  .page { display: block; width: ${WINDOW.width}px; }
  .popup { position: absolute; top: 158px; right: ${1280 - 496 - WINDOW.width + 70}px; width: 348px; border-radius: 10px;
    box-shadow: 0 18px 50px rgb(20 10 40 / 0.35), 0 0 0 1px rgb(0 0 0 / 0.08); }
  .card { position: absolute; border-radius: 12px; box-shadow: 0 30px 80px rgb(10 0 30 / 0.5); }
`;

function frame(copy, stage) {
  return `<!doctype html><meta charset="utf-8"><style>${FRAME_CSS}</style>
<div class="brand">${mark('#fff')}<div>BrowserConsent<small>by Katla</small></div></div>
<div class="copy"><h1>${copy.title}</h1><p>${copy.text}</p></div>
${stage}`;
}

function browserWindow(host, name, badge) {
  const site = SITES[host];
  return `<div class="window">
  <div class="tabs"><div class="dots"><span></span><span></span><span></span></div>
    <div class="tab"><span class="favicon" style="background:${site.accent}"></span>${site.name}</div></div>
  <div class="toolbar">${icon('back')}${icon('forward')}${icon('reload')}
    <div class="omnibox">${icon('tune')}${host}</div>
    <div class="ext">${mark(markFill)}${badge.text ? `<span class="badge" style="background:${badge.color}">${badge.text}</span>` : ''}</div>
    ${icon('puzzle')}<div class="avatar"></div></div>
  <img class="page" src="${shots[`${name}-page`]}">
</div>
<img class="popup" src="${shots[`${name}-popup`]}">`;
}

const SCREENSHOTS = [
  {
    file: 'screenshot-1-answers.png',
    title: 'Set your privacy preferences once.',
    text: 'BrowserConsent answers cookie banners for you, with Reject all or Accept all, the way you chose. It knows 39 consent platforms and uses their own API wherever there is one.',
    stage: () => browserWindow('news.example.com', 'news', badges.news),
  },
  {
    file: 'screenshot-2-tracker-warnings.png',
    title: 'See who tracks you anyway.',
    text: 'A red badge warns you when a site sets tracking cookies or sends pixels before you’ve answered its banner, or after you said no.',
    stage: () => browserWindow('shop.example.com', 'shop', badges.shop),
  },
  {
    file: 'screenshot-3-blocking.png',
    title: 'Block trackers until you say yes.',
    text: 'Switch on blocking, and known trackers’ pixels are blocked and their cookies deleted on sites that don’t have your consent. The green badge counts what was stopped.',
    stage: () => browserWindow('recipes.example.com', 'recipes', badges.recipes),
  },
  {
    file: 'screenshot-4-your-consent.png',
    title: 'Nothing happens until you agree.',
    text: 'Read exactly what BrowserConsent does, choose how it answers, and tick each statement yourself. It doesn’t run on any website before that.',
    stage: () => `<img class="card" src="${shots.consent}" style="left:520px; top:60px; width:688px">`,
  },
  {
    file: 'screenshot-5-receipt-and-activity.png',
    title: 'A receipt for every answer.',
    text: 'Settings keeps the wording you agreed to and a log of every banner answered for you. Withdraw at any time. No servers, no analytics: it all stays in your browser.',
    stage: () => `<img class="card" src="${shots.receipt}" style="left:504px; top:56px; width:728px">
<img class="card" src="${shots.activity}" style="left:504px; top:${56 + sizes.receipt.height + 20}px; width:728px">`,
  },
];

// The store icon: the official mark at 96px with 16px of transparent padding, per the Chrome Web Store
// image guidelines, and a subtle white outer glow so the dark mark holds up on dark backgrounds.
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <filter id="glow" x="-10%" y="-10%" width="120%" height="120%">
    <feMorphology in="SourceAlpha" operator="dilate" radius="1" result="grown" />
    <feGaussianBlur in="grown" stdDeviation="1.2" result="blur" />
    <feFlood flood-color="#fff" flood-opacity="0.9" />
    <feComposite in2="blur" operator="in" result="glow" />
    <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
  </filter>
  <g filter="url(#glow)"><path d="${MARK_PATH}" fill="${markFill}" transform="translate(16 16) scale(3)" /></g>
</svg>`;

mkdirSync(OUT, { recursive: true });
const renderer = await browser.newPage();

await renderer.setViewport({ width: 128, height: 128, deviceScaleFactor: 1 });
await renderer.setContent(`<style>body { margin: 0; background: transparent; }</style>${ICON_SVG}`);
writeFileSync(`${OUT}/icon-128.png`, await renderer.screenshot({ type: 'png', omitBackground: true }));

// Chrome writes opaque screenshots as 24-bit PNGs, which is what the store asks for.
await renderer.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
for (const { file, title, text, stage } of SCREENSHOTS) {
  await renderer.setContent(frame({ title, text }, stage()), { waitUntil: 'load' });
  await renderer.evaluate(() => document.fonts.ready);
  writeFileSync(`${OUT}/${file}`, await renderer.screenshot({ type: 'png' }));
}

await browser.close();
await server.close();
console.log(`Wrote store/chrome/icon-128.png and ${SCREENSHOTS.length} screenshots`);
