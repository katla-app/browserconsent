// End-to-end tests: loads the built extension into a real browser and runs it against fixture pages.
//
//   node test/e2e.mjs            Chrome (Chrome for Testing or Chromium)
//   node test/e2e.mjs --firefox  Firefox
//
// Browser binaries: see findBrowser() in test/browser.mjs.
import { setTimeout as sleep } from 'node:timers/promises';
import { bringToFront, click, launchWithExtension, openSettingsFromOnboarding, storageCall } from './browser.mjs';
import { startServer } from './server.mjs';

const target = process.argv.includes('--firefox') ? 'firefox' : 'chrome';
const skipLive = process.argv.includes('--offline');

// ------------------------------------------------------------------ harness

const outcomes = [];
const pages = [];
async function test(name, fn) {
  const started = Date.now();
  try {
    const note = await fn();
    outcomes.push({ name, status: note === 'skip' ? 'SKIP' : 'PASS', ms: Date.now() - started });
  } catch (error) {
    outcomes.push({ name, status: 'FAIL', ms: Date.now() - started, error: error.message });
  }
  for (const page of pages.splice(0)) await page.close().catch(() => {});
  const last = outcomes.at(-1);
  console.log(`${last.status.padEnd(4)}  ${name}${last.error ? `\n      ${last.error}` : ''}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const server = await startServer();
const fixture = (name, host = '127.0.0.1') => `http://${host}:${server.port}/${name}`;

const { browser, executablePath, onboarding } = await launchWithExtension(target);
console.log(`Testing dist/${target} in ${executablePath}\n`);

async function open(url) {
  const page = await browser.newPage();
  pages.push(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return page;
}

const results = (page) => page.evaluate(() => window.__results ?? []).catch(() => []);

async function waitForResult(page, expected, timeoutMs = 8_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const current = await results(page);
    if (current.includes(expected)) return current;
    await sleep(200);
  }
  throw new Error(`Expected "${expected}" within ${timeoutMs} ms, got ${JSON.stringify(await results(page))}`);
}

async function expectNothing(page, waitMs = 4_000) {
  await sleep(waitMs);
  const current = await results(page);
  assert(current.length === 0, `Expected no action, got ${JSON.stringify(current)}`);
}

let control;
const storage = (method, arg) => storageCall(control, method, arg);

const registeredScripts = (page) =>
  page.evaluate(async () => (await (globalThis.browser ?? globalThis.chrome).scripting.getRegisteredContentScripts()).map((s) => s.id));

// Registration follows consent and settings asynchronously, so wait for it to settle.
async function waitForRegistration(page, active, timeoutMs = 5_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if ((await registeredScripts(page)).length > 0 === active) return;
    await sleep(100);
  }
  throw new Error(`Content script should be ${active ? 'registered' : 'unregistered'}`);
}

// Background tabs don't render in headless mode, so bring the settings page forward before clicking in it.
async function useControl() {
  await bringToFront(control);
  // A plain page reload also works on Firefox extension pages, where BiDi's reload is refused.
  await control.evaluate(() => location.reload());
  await sleep(500);
  await control.waitForFunction(() => document.readyState === 'complete');
  return control;
}

// ------------------------------------------------------------------ tests

await test('does nothing before the user consents', async () => {
  assert((await registeredScripts(onboarding)).length === 0, 'no content script may be registered before consent');
  await expectNothing(await open(fixture('onetrust.html')), 3_500);
});

await test('activation needs every statement ticked', async () => {
  await bringToFront(onboarding);
  const statement = (n) => `#statements .statement:nth-child(${n}) input`;
  const count = await onboarding.$$eval('#statements .statement input', (inputs) => inputs.length);
  assert(count === 3, `Expected 3 statements, found ${count}`);
  assert(await onboarding.$eval('#activate', (b) => b.disabled), 'Activate should start disabled');
  assert(!(await onboarding.$eval('#generic', (i) => i.checked)), 'Unrecognised banners must be off by default');
  await click(onboarding, statement(1));
  await click(onboarding, statement(2));
  assert(await onboarding.$eval('#activate', (b) => b.disabled), 'Activate should stay disabled with 2 of 3 ticked');
  await click(onboarding, statement(3));
  assert(!(await onboarding.$eval('#activate', (b) => b.disabled)), 'Activate should be enabled');
  await click(onboarding, '#activate');
  await onboarding.waitForSelector('#done-step:not([hidden])', { timeout: 5_000 });
  await waitForRegistration(onboarding, true);
});

control = await openSettingsFromOnboarding(onboarding);

await test('consent receipt is stored with the exact wording', async () => {
  const { consent, consentHistory, settings } = await storage('get', ['consent', 'consentHistory', 'settings']);
  assert(consent?.status === 'granted', 'consent.status should be granted');
  assert(/^[0-9a-f-]{36}$/.test(consent.receiptId), 'receiptId should be a UUID');
  assert(consent.statements.length === 3 && consent.statements.every((s) => s.text.length > 20), 'statements stored verbatim');
  assert(consent.noticeText.includes('What AutoConsent does'), 'notice text stored');
  assert(/^sha256:[0-9a-f]{64}$/.test(consent.noticeHash), 'notice hash stored');
  assert(consentHistory.length === 1 && consentHistory[0].type === 'granted', 'history has the grant');
  assert(settings.enabled === true && settings.generic === false, 'settings default to enabled, generic off');
});

await test('OneTrust: accepts through its JavaScript API', async () => {
  const page = await open(fixture('onetrust.html'));
  const r = await waitForResult(page, 'onetrust:api');
  await sleep(500);
  const after = await results(page);
  assert(!after.includes('onetrust:click') && !r.includes('onetrust:reject'), `expected API only, got ${JSON.stringify(after)}`);
});

await test('OneTrust: leaves an existing decision alone', async () => {
  await expectNothing(await open(fixture('onetrust-decided.html')), 3_500);
});

await test('Cookiebot without an API: clicks, even when the banner appears late', async () => {
  const r = await waitForResult(await open(fixture('cookiebot-delayed.html')), 'cookiebot:click', 9_000);
  assert(r.length === 1, `Expected a single action, got ${JSON.stringify(r)}`);
});

await test('Didomi: falls back to the platform API', async () => {
  await waitForResult(await open(fixture('didomi-api.html')), 'didomi:api');
});

await test('Usercentrics: API decides, waits for initialisation', async () => {
  await waitForResult(await open(fixture('usercentrics-api.html')), 'usercentrics:api');
});

await test('Usercentrics without an API: clicks inside a closed shadow root', async () => {
  await waitForResult(await open(fixture('usercentrics-shadow.html')), 'usercentrics:click', 10_000);
});

await test('Katla: accepts through KatlaConsent.acceptAll(), then closes the widget', async () => {
  const page = await open(fixture('katla-gdpr.html'));
  await waitForResult(page, 'katla:api');
  // Like the live widget, the fixture stays open after acceptAll(), so AutoConsent closes it.
  await page.waitForFunction(() => !document.querySelector('.katla-widget:not(.katla-hidden) .katla-consent-box'), { timeout: 4_000 });
  const r = await results(page);
  assert(r[0] === 'katla:api' && !r.includes('katla:reject'), `API must come first, got ${JSON.stringify(r)}`);
});

await test('Katla: CCPA widget, never clicks "Do Not Sell"', async () => {
  const page = await open(fixture('katla-ccpa.html'));
  await waitForResult(page, 'katla:api');
  await sleep(1_000);
  assert(!(await results(page)).includes('katla:opt-out'), 'clicked Do Not Sell');
});

await test('Katla: redesigned CCPA widget, never clicks "Do Not Sell" or "Close"', async () => {
  const page = await open(fixture('katla-ccpa-stacked.html'));
  await waitForResult(page, 'katla:api');
  await sleep(1_500);
  const r = await results(page);
  assert(!r.includes('katla:opt-out') && !r.includes('katla:close-refuses'), `clicked a refusal: ${JSON.stringify(r)}`);
});

await test('Sourcepoint: cross-origin consent iframe', async () => {
  const r = await waitForResult(await open(fixture('sourcepoint.html')), 'sourcepoint:click');
  assert(!r.includes('sourcepoint:reject'), 'must not reject');
});

await test('Unrecognised banner: ignored while that option is off', async () => {
  await expectNothing(await open(fixture('generic.html')), 4_500);
});

await test('Unrecognised banner: accepted once the user opts in', async () => {
  await useControl();
  await control.waitForSelector('#generic');
  await click(control, '#generic');
  await sleep(300);
  const { consent, settings, consentHistory } = await storage('get', ['consent', 'settings', 'consentHistory']);
  assert(settings.generic === true && consent.scope.unrecognisedBanners === true, 'scope recorded in receipt');
  assert(consentHistory.at(-1).type === 'scope-extended', 'scope change recorded in history');
  const r = await waitForResult(await open(fixture('generic.html')), 'generic:click', 8_000);
  assert(!r.includes('generic:necessary'), 'clicked the wrong button');
});

await test('Steps aside once the user interacts with the page', async () => {
  const page = await open(fixture('interaction.html'));
  await sleep(700);
  await page.click('#search');
  await expectNothing(page, 5_000);
  assert(await page.$('#onetrust-banner-sdk'), 'banner should still be showing for the user');
});

await test('A site cannot use the extension to accept on its own behalf', async () => {
  await storage('set', { exceptions: ['localhost'] });
  const page = await open(fixture('onetrust.html', 'localhost'));
  // Even if a page imitates the content script's request, the background re-checks the site.
  const response = await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('katla-autoconsent:request', { detail: JSON.stringify({ id: 'x', action: 'accept', cmp: 'onetrust' }) }));
    return new Promise((resolve) => setTimeout(() => resolve(window.__results.slice()), 500));
  });
  await storage('set', { exceptions: [] });
  assert(!response.includes('onetrust:api'), 'page-dispatched events must not trigger anything');
});

await test('Excluded site is left alone', async () => {
  await storage('set', { exceptions: ['localhost'] });
  await expectNothing(await open(fixture('onetrust.html', 'localhost')), 3_500);
  await storage('set', { exceptions: [] });
});

await test('Paused: nothing is injected and nothing happens', async () => {
  const { settings } = await storage('get', 'settings');
  await storage('set', { settings: { ...settings, enabled: false } });
  await waitForRegistration(control, false);
  await expectNothing(await open(fixture('onetrust.html')), 3_500);
  await storage('set', { settings: { ...settings, enabled: true } });
  await waitForRegistration(control, true);
});

await test('Withdraw on a site records a refusal through the platform', async () => {
  const page = await open(fixture('katla-gdpr.html?withdraw'));
  await waitForResult(page, 'katla:click');
  const url = page.url();
  const response = await control.evaluate(async (pageUrl) => {
    const api = globalThis.browser ?? globalThis.chrome;
    const [tab] = (await api.tabs.query({})).filter((t) => t.url === pageUrl);
    return api.runtime.sendMessage({ type: 'site:withdraw', tabId: tab.id });
  }, url);
  assert(response?.withdrawn?.includes('katla'), `withdraw response: ${JSON.stringify(response)}`);
  await waitForResult(page, 'katla:withdraw', 2_000);
});

await test('Activity log has every accepted banner', async () => {
  await sleep(500);
  const { log } = await storage('get', 'log');
  const cmps = new Set(log.filter((e) => e.action === 'accepted').map((e) => e.cmp));
  for (const cmp of ['onetrust', 'cookiebot', 'didomi', 'usercentrics', 'katla', 'sourcepoint', 'generic']) {
    assert(cmps.has(cmp), `missing ${cmp} in log (${[...cmps].join(', ')})`);
  }
  const expectedMethods = { onetrust: 'api', didomi: 'api', usercentrics: 'api', katla: 'api', cookiebot: 'click', sourcepoint: 'click' };
  for (const [cmp, method] of Object.entries(expectedMethods)) {
    assert(log.some((e) => e.cmp === cmp && e.method === method), `expected a ${cmp} entry logged as ${method}`);
  }
  const sp = log.find((e) => e.cmp === 'sourcepoint');
  assert(sp.site === '127.0.0.1' && sp.frame === 'localhost', `sourcepoint entry should name the top site: ${JSON.stringify(sp)}`);
  assert(!log.some((e) => e.site === 'localhost'), 'excluded site must not appear');
});

await test('Settings page shows the receipt and activity', async () => {
  await useControl();
  await control.waitForSelector('#log tr');
  const receipt = await control.$eval('#receipt-id', (el) => el.textContent);
  const rows = await control.$$eval('#log tr', (rows) => rows.length);
  assert(/^[0-9a-f-]{36}$/.test(receipt), 'receipt id shown');
  assert(rows >= 7, `expected at least 7 log rows, got ${rows}`);
});

await test('Withdrawing consent stops everything', async () => {
  await useControl();
  await control.waitForSelector('#withdraw-start');
  await click(control, '#withdraw-start');
  await click(control, '#withdraw');
  await sleep(300);
  const { consent, consentHistory } = await storage('get', ['consent', 'consentHistory']);
  assert(consent.status === 'withdrawn' && consent.withdrawnAt, 'consent withdrawn');
  assert(consentHistory.at(-1).type === 'withdrawn', 'withdrawal in history');
  await waitForRegistration(control, false);
  await expectNothing(await open(fixture('onetrust.html')), 3_500);
});

await test('Live Katla widget from dist.katla.app', async () => {
  if (skipLive) return 'skip';
  const { consent } = await storage('get', 'consent');
  await storage('set', { consent: { ...consent, status: 'granted', withdrawnAt: undefined } });
  await waitForRegistration(control, true);
  const page = await open(fixture('katla-live.html'));
  const loaded = await page
    .waitForFunction(() => window.KatlaConsent, { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!loaded) return 'skip';
  const end = Date.now() + 10_000;
  let cookie = '';
  while (Date.now() < end && !cookie.includes('_katla_consent=all')) {
    await sleep(300);
    cookie = await page.evaluate(() => document.cookie);
  }
  assert(cookie.includes('_katla_consent=all'), `expected _katla_consent=all, cookies: ${cookie || '(none)'}`);
  const hidden = await page
    .waitForFunction(() => !document.querySelector('.katla-widget:not(.katla-hidden) .katla-consent-box'), { timeout: 5_000 })
    .then(() => true, () => false);
  assert(hidden, 'widget should be hidden after accepting');
  const { log } = await storage('get', 'log');
  assert(log[0]?.cmp === 'katla' && log[0].method === 'api', `live widget should be accepted through the API, got ${JSON.stringify(log[0])}`);
  await page.evaluate(() => window.KatlaConsent.withdrawConsent());
});

// ------------------------------------------------------------------ report

await browser.close();
await server.close();
const failed = outcomes.filter((o) => o.status === 'FAIL');
const skipped = outcomes.filter((o) => o.status === 'SKIP');
console.log(`\n${outcomes.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} skipped (${target})`);
process.exit(failed.length ? 1 : 0);
