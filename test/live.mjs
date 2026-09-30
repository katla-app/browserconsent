// Live smoke test: visits real websites that use each major consent platform and reports whether
// AutoConsent answered their banner. Results depend on your location (banners are often only shown
// in the EU/EEA), bot protection and site changes, so treat it as a selector health check.
//
//   node test/live.mjs [--firefox] [site ...]
//   SCREENSHOTS=dir node test/live.mjs     save a screenshot of every site that wasn't answered
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import vm from 'node:vm';
import { activate, launchWithExtension, openSettingsFromOnboarding, storageCall } from './browser.mjs';

const target = process.argv.includes('--firefox') ? 'firefox' : 'chrome';
const only = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));

const SITES = [
  ['katla.app', 'Katla'],
  ['www.onetrust.com', 'OneTrust'],
  ['www.cookiebot.com', 'Cookiebot'],
  ['usercentrics.com', 'Usercentrics'],
  ['www.didomi.io', 'Didomi'],
  ['www.theguardian.com', 'Sourcepoint'],
  ['www.spiegel.de', 'Sourcepoint'],
  ['www.trustarc.com', 'TrustArc'],
  ['www.google.com', 'Google'],
  ['www.cookieyes.com', 'CookieYes'],
  ['complianz.io', 'Complianz'],
  ['www.osano.com', 'Osano'],
  ['www.iubenda.com', 'iubenda'],
  ['www.consentmanager.net', 'consentmanager.net'],
  ['cookiefirst.com', 'CookieFirst'],
  ['cookieinformation.com', 'Cookie Information'],
  ['www.axeptio.eu', 'Axeptio'],
  ['www.cookiehub.com', 'CookieHub'],
  ['www.amazon.de', 'Amazon'],
  ['www.facebook.com', 'Meta'],
].filter(([site]) => !only.length || only.some((o) => site.includes(o)));

const sandbox = vm.createContext({});
vm.runInContext(readFileSync(new URL('../src/content/rules.js', import.meta.url), 'utf8'), sandbox);
const ruleSelectors = sandbox.KATLA_AUTOCONSENT_RULES.map((r) => ({ name: r.name, selectors: r.banner ?? r.accept }));

const { browser, onboarding } = await launchWithExtension(target);
await activate(onboarding);
const control = await openSettingsFromOnboarding(onboarding);

const bare = (host) => host.replace(/^www\./, '');
const rows = [];

for (const [site, expected] of SITES) {
  const page = await browser.newPage();
  let outcome;
  try {
    await page.goto(`https://${site}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const end = Date.now() + 20_000;
    while (!outcome && Date.now() < end) {
      await sleep(500);
      const { log = [] } = await storageCall(control, 'get', 'log');
      const entry = log.find((e) => e.action === 'accepted' && bare(e.site).endsWith(bare(site)));
      if (entry) outcome = { status: 'answered', detail: `${entry.cmpName} (${entry.method}${entry.frame ? ` in ${entry.frame}` : ''})` };
    }
    if (!outcome) {
      const visible = await page.evaluate((rules) => {
        const shown = (el) => el.getBoundingClientRect().width > 0 && el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true });
        return rules
          .filter((rule) => rule.selectors.some((s) => { try { return [...document.querySelectorAll(s)].some(shown); } catch { return false; } }))
          .map((rule) => rule.name);
      }, ruleSelectors);
      outcome = visible.length
        ? { status: 'NOT ANSWERED', detail: `banner still visible: ${visible.join(', ')}` }
        : { status: 'no banner', detail: 'no recognised banner visible (region, bot check, or markup changed)' };
      if (process.env.SCREENSHOTS) {
        mkdirSync(process.env.SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: join(process.env.SCREENSHOTS, `${site}.png`) });
      }
    }
  } catch (error) {
    outcome = { status: 'error', detail: error.message.split('\n')[0] };
  }
  rows.push({ site, expected, ...outcome });
  console.log(`${outcome.status.padEnd(12)} ${site.padEnd(24)} expected ${expected.padEnd(20)} ${outcome.detail}`);
  await page.close();
}

await browser.close();
const answered = rows.filter((r) => r.status === 'answered').length;
console.log(`\n${answered}/${rows.length} sites answered (${target})`);
process.exit(rows.some((r) => r.status === 'NOT ANSWERED') ? 1 : 0);
