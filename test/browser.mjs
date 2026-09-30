// Shared browser setup for the e2e and live test suites.
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = fileURLToPath(new URL('..', import.meta.url));

const BINARIES = {
  chrome: [
    'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-linux64/chrome',
  ],
  firefox: ['Firefox.app/Contents/MacOS/firefox', 'firefox/firefox'],
};

const versionOf = (build) => (build.match(/\d+(\.\d+)*/)?.[0] ?? '0').split('.').map(Number);

function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  }
  return 0;
}

// CHROME_PATH / FIREFOX_PATH, otherwise the newest build in BROWSERS_DIR, ./.browsers or ~/.cache/puppeteer.
export function findBrowser(target) {
  const fromEnv = process.env[target === 'chrome' ? 'CHROME_PATH' : 'FIREFOX_PATH'];
  if (fromEnv) return fromEnv;
  const caches = [process.env.BROWSERS_DIR, join(root, '.browsers'), join(homedir(), '.cache/puppeteer')].filter(Boolean);
  const found = [];
  for (const cache of caches) {
    const dir = join(cache, target);
    if (!existsSync(dir)) continue;
    for (const build of readdirSync(dir)) {
      for (const binary of BINARIES[target]) {
        const path = join(dir, build, binary);
        if (existsSync(path)) found.push({ version: versionOf(build), path });
      }
    }
  }
  if (!found.length) {
    throw new Error(`No ${target} binary found. Set ${target === 'chrome' ? 'CHROME_PATH' : 'FIREFOX_PATH'} or BROWSERS_DIR.`);
  }
  return found.sort((a, b) => compareVersions(b.version, a.version))[0].path;
}

// Launches the browser with dist/<target> installed. Resolves once the onboarding page is open.
export async function launchWithExtension(target) {
  const extensionPath = resolve(root, 'dist', target);
  const executablePath = findBrowser(target);
  const browser = await puppeteer.launch({
    browser: target,
    executablePath,
    headless: !process.env.HEADFUL,
    ...(target === 'chrome'
      ? { pipe: true, enableExtensions: [extensionPath], args: ['--no-first-run', '--no-default-browser-check'] }
      : // Lets WebDriver BiDi script moz-extension: pages.
        { args: ['--remote-allow-system-access'] }),
  });
  if (target === 'firefox') await browser.installExtension(extensionPath);

  // The extension opens its onboarding tab on install. Tests drive that tab rather than navigating to
  // it (BiDi refuses to navigate to moz-extension: URLs, and reports their URL as about:blank).
  const end = Date.now() + 15_000;
  let onboarding;
  while (!onboarding && Date.now() < end) {
    for (const page of await browser.pages()) {
      const href = await page.evaluate(() => location.href).catch(() => '');
      if (href.endsWith('/onboarding/onboarding.html')) onboarding = page;
    }
    if (!onboarding) await new Promise((r) => setTimeout(r, 250));
  }
  if (!onboarding) throw new Error('The extension did not open its onboarding page after install');
  await onboarding.waitForSelector('#statements .statement');
  return { browser, executablePath, onboarding };
}

const isPrivilegedScopeError = (error) => /privileged scope/i.test(error.message);

// Firefox's WebDriver BiDi can script extension pages but not send them real input or focus them,
// so fall back to a programmatic click there.
export async function click(page, selector) {
  try {
    await page.click(selector);
  } catch (error) {
    if (!isPrivilegedScopeError(error)) throw error;
    await page.$eval(selector, (el) => el.click());
  }
}

export async function bringToFront(page) {
  await page.bringToFront().catch((error) => {
    if (!isPrivilegedScopeError(error)) throw error;
  });
}

// From the onboarding "done" step, follows its "Open settings" link so the tab becomes the settings page.
export async function openSettingsFromOnboarding(page) {
  await bringToFront(page);
  await click(page, '#done-step a[href$="options.html"]');
  await page.waitForFunction(() => location.pathname.endsWith('/options/options.html') && document.readyState !== 'loading');
  await page.waitForSelector('#consent-title');
  return page;
}

// Ticks every statement and activates, exactly as a user would.
export async function activate(onboarding) {
  await bringToFront(onboarding);
  const count = await onboarding.$$eval('#statements .statement input', (inputs) => inputs.length);
  for (let i = 1; i <= count; i++) await click(onboarding, `#statements .statement:nth-child(${i}) input`);
  await click(onboarding, '#activate');
  await onboarding.waitForSelector('#done-step:not([hidden])', { timeout: 5_000 });
}

export const storageCall = (page, method, arg) =>
  page.evaluate((m, a) => (globalThis.browser ?? globalThis.chrome).storage.local[m](a), method, arg);
