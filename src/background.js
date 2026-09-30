// The platform rules, for reading each platform's consent cookie (lib/on-file.js).
import './content/rules.js';
import { ext } from './lib/browser.js';
import { HOST_ORIGINS, POLICY_VERSION } from './lib/constants.js';
import { katlaDebug } from './lib/katla-debug.js';
import { decisionOnFile } from './lib/on-file.js';
import { platformAction } from './lib/platforms.js';
import { hostFromUrl, isExcluded, onDomain } from './lib/site.js';
import {
  answerFor,
  appendLog,
  forgetSites,
  getConfig,
  isAuthorised,
  recordSiteDecision,
  rememberFindings,
  siteRecordFor,
  consentedTo,
  trackersWatched,
} from './lib/storage.js';
import { PIXEL_BLOCK_CONDITIONS, PIXEL_URL_PATTERNS, matchCookie, matchPixel } from './lib/trackers.js';
import { warningsFor } from './lib/warnings.js';

const ONBOARDING_PAGE = 'onboarding/onboarding.html';
const pageKey = (tabId) => `page:${tabId}`;
const inputKey = (tabId) => `input:${tabId}`;

const BRAND_COLOR = '#5B21B6';
const WARNING_COLOR = '#B42318';
const BLOCKED_COLOR = '#15803D';
const HIT_LIMIT = 200;
const TIMES_PER_HIT = 20;
const DECISION_LIMIT = 20;

// The content script is registered only while the user's consent is valid and automatic consent,
// tracker warnings or blocking are on. Before consent, after withdrawal and while both are off, nothing is
// injected into any website.
const ENGINE_SCRIPT = {
  id: 'katla-browserconsent-engine',
  matches: HOST_ORIGINS,
  js: ['content/rules.js', 'content/engine.js'],
  runAt: 'document_end',
  allFrames: true,
};

// Consent, settings and excluded sites, read once and kept until they change.
let configCache = null;
const config = () =>
  (configCache ??= getConfig().catch((error) => {
    configCache = null;
    throw error;
  }));

const watchingTrackers = ({ consent, settings }) => isAuthorised(consent) && trackersWatched(settings);

let syncQueue = Promise.resolve();

function syncContentScripts() {
  syncQueue = syncQueue
    .then(async () => {
      const { consent, settings } = await config();
      const shouldRun = isAuthorised(consent) && (settings.enabled || trackersWatched(settings));
      const registered = await ext.scripting.getRegisteredContentScripts({ ids: [ENGINE_SCRIPT.id] });
      if (shouldRun && registered.length === 0) {
        try {
          await ext.scripting.registerContentScripts([{ ...ENGINE_SCRIPT, persistAcrossSessions: true }]);
        } catch {
          // Browsers without persistAcrossSessions re-register on every startup instead.
          await ext.scripting.registerContentScripts([ENGINE_SCRIPT]);
        }
      } else if (!shouldRun && registered.length > 0) {
        await ext.scripting.unregisterContentScripts({ ids: [ENGINE_SCRIPT.id] });
      }
    })
    .catch((error) => console.error('[Katla BrowserConsent] content script sync failed', error));
  return syncQueue;
}

syncContentScripts();

ext.runtime.onInstalled.addListener(async ({ reason }) => {
  const { consent } = await config();
  const firstInstall = reason === 'install' && !consent;
  const policyChanged = reason === 'update' && consent?.status === 'granted' && consent.policyVersion !== POLICY_VERSION;
  if (firstInstall || policyChanged) {
    await ext.tabs.create({ url: ext.runtime.getURL(ONBOARDING_PAGE) });
  }
  await Promise.all([refreshBadge(), syncContentScripts()]);
});

ext.runtime.onStartup.addListener(() => Promise.all([refreshBadge(), syncContentScripts()]));

ext.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.consent || changes.settings || changes.exceptions || changes.siteDecisions) {
    configCache = null;
    syncBlocking();
  }
  if (!(changes.consent || changes.settings)) return;
  refreshBadge();
  syncContentScripts();
  config().then((c) => {
    listenForTrackers(watchingTrackers(c));
    refreshTabBadges();
  });
});

async function refreshBadge() {
  const { consent, settings } = await config();
  const authorised = isAuthorised(consent);
  const active = authorised && settings.enabled;
  const title = active
    ? `Katla BrowserConsent: ${answerFor(consent, settings) === 'accept' ? 'accepting' : 'rejecting'} all`
    : authorised
      ? 'Katla BrowserConsent: automatic consent off'
      : 'Katla BrowserConsent: not activated';
  await Promise.all([
    ext.action.setBadgeBackgroundColor({ color: '#6B7280' }),
    ext.action.setBadgeText({ text: active ? '' : 'off' }),
    ext.action.setTitle({ title }),
  ]);
}

// ---------------------------------------------------------------- per-tab page records

// One record per tab for the page open in it (see lib/warnings.js for its shape). Records are changed
// from many events at once, so every change goes through one queue.
let pageQueue = Promise.resolve();

function queuePageChange(change) {
  const run = pageQueue.then(change);
  pageQueue = run.catch((error) => console.error('[Katla BrowserConsent] page record update failed', error));
  return run;
}

async function newPage(site) {
  const { siteDecisions = {} } = await ext.storage.local.get('siteDecisions');
  return { site, siteDecision: siteRecordFor(site, siteDecisions)?.decision ?? null, bannerAt: null, decisions: [], hits: [] };
}

// Applies `mutate` to the tab's record for `site`, starting a new one if the tab has moved on to
// another site. Resolves the updated record.
const updatePage = (tabId, site, mutate) =>
  queuePageChange(async () => {
    const key = pageKey(tabId);
    let { [key]: page } = await ext.storage.session.get(key);
    if (page?.site !== site) page = await newPage(site);
    mutate(page);
    await ext.storage.session.set({ [key]: page });
    return page;
  });

const clearTab = (tabId) => queuePageChange(() => ext.storage.session.remove([pageKey(tabId), inputKey(tabId)]));

// A new document in the tab starts with a clean record. The tab's "loading" status can't tell: Chrome also
// sets it when a frame in the page loads, which would throw away what was seen on the page so far.
// Prerendered pages load in the background and don't replace the page yet.
// The decision on file is checked right away too, so blocking knows about a consent given before the
// page loads its trackers.
ext.webRequest.onBeforeRequest.addListener(
  ({ tabId, documentLifecycle, url }) => {
    if (tabId < 0 || documentLifecycle === 'prerender') return;
    clearTab(tabId);
    ext.action.setBadgeText({ tabId, text: null }).catch(() => {});
    checkPageOnFile(tabId, url).catch(() => {});
  },
  { urls: HOST_ORIGINS, types: ['main_frame'] },
);

ext.tabs.onRemoved.addListener((tabId) => clearTab(tabId));

// Once a page has loaded, the decision the site's consent platform has on file. On later visits the banner
// doesn't come back, so this is what earns the "answered" tick, and a refusal on file (made before
// BrowserConsent was installed, say) is what later trackers are judged against. It's also remembered
// for the site, which is what blocking goes by.
ext.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete') checkPageOnFile(tabId, tab.url).catch(() => {});
});

async function checkPageOnFile(tabId, url) {
  const site = hostFromUrl(url ?? '');
  const { consent, settings } = await config();
  if (!site || !isAuthorised(consent) || !(settings.enabled || trackersWatched(settings))) return;
  const onFile = await decisionOnFile(url);
  const known = ['accepted', 'rejected', 'custom'].includes(onFile?.decision);
  if (known && siteRecordFor(site, await siteDecisions())?.decision !== onFile.decision) {
    await recordSiteDecision(site, { decision: onFile.decision, at: Date.now(), by: 'site' });
  }
  const page = await updatePage(tabId, site, (p) => {
    p.onFile = onFile;
    const loadedWithIt = !p.bannerAt && !p.decisions.length;
    if (loadedWithIt && !p.siteDecision && known) p.siteDecision = onFile.decision;
  });
  await refreshTabBadge(tabId, page);
}

// Tracker warnings (red) win over blocked trackers (green), which win over the "answered" tick. What's
// flagged on the page is remembered for the site, and what was flagged on earlier visits counts too.
async function refreshTabBadge(tabId, page) {
  const { settings } = await config();
  const onPage = warningsFor(page, settings);
  if (onPage.count > 0) await rememberFindings(page.site, onPage);
  const { siteFindings = {} } = await ext.storage.local.get('siteFindings');
  const { count, blockedCount } = warningsFor(page, settings, siteRecordFor(page.site, siteFindings));
  // Answered on the page, or a decision already on file.
  const answered = Boolean(page.decisions.length || page.onFile);
  const [text, color] =
    count > 0
      ? [String(count), WARNING_COLOR]
      : blockedCount > 0
        ? [String(blockedCount), BLOCKED_COLOR]
        : answered
          ? ['✓', BRAND_COLOR]
          : [null, null];
  try {
    if (color) await ext.action.setBadgeBackgroundColor({ tabId, color });
    await ext.action.setBadgeText({ tabId, text });
  } catch {
    // The tab has closed.
  }
}

async function refreshTabBadges() {
  const records = await ext.storage.session.get(null);
  for (const [key, page] of Object.entries(records)) {
    if (key.startsWith('page:')) await refreshTabBadge(Number(key.slice(5)), page);
  }
}

async function recordDecision(tabId, site, decision) {
  const page = await updatePage(tabId, site, (p) => {
    // Answering a first-layer banner means the site had no decision on file when the page loaded.
    if (!p.decisions.length && !p.bannerAt && !p.siteDecision) p.bannerAt = decision.at;
    p.decisions = [...p.decisions, decision].sort((a, b) => a.at - b.at).slice(-DECISION_LIMIT);
  });
  await recordSiteDecision(site, { decision: decision.decision, at: decision.at, by: decision.by });
  await refreshTabBadge(tabId, page);
}

// A time a content script reports, or now if it's missing or implausible.
function reportedTime(at) {
  const now = Date.now();
  return Number.isFinite(at) && at <= now && at > now - 120_000 ? at : now;
}

// ---------------------------------------------------------------- content script messages

async function checkSite(sender) {
  const site = hostFromUrl(sender.tab?.url ?? '');
  const { consent, settings, exceptions } = await config();
  // Once the user has interacted with the page, consent frames opened afterwards are theirs to answer.
  const key = inputKey(sender.tab?.id);
  const userInteracted = sender.frameId !== 0 && Boolean((await ext.storage.session.get(key))[key]);
  const allowed =
    Boolean(site) && isAuthorised(consent) && settings.enabled && !isExcluded(site, exceptions) && !userInteracted;
  return { allowed, answer: answerFor(consent, settings), generic: allowed && settings.generic };
}

async function recordAnswered(msg, sender) {
  const tabId = sender.tab?.id;
  const site = hostFromUrl(sender.tab?.url ?? '');
  if (tabId == null || !site) return;
  const decision = msg.decision === 'rejected' ? 'rejected' : 'accepted';
  const entry = {
    at: new Date().toISOString(),
    action: decision,
    site,
    cmp: String(msg.cmp).slice(0, 40),
    cmpName: String(msg.cmpName).slice(0, 80),
    method: String(msg.method).slice(0, 20),
    frame: sender.frameId === 0 ? null : hostFromUrl(sender.url ?? ''),
  };
  await appendLog(entry);
  await recordDecision(tabId, site, { decision, at: reportedTime(msg.at), by: 'browserconsent', cmp: entry.cmp, cmpName: entry.cmpName });
}

// The user answered a cookie banner themselves. Only needed for tracker warnings and blocking.
async function recordUserDecision(msg, sender) {
  const tabId = sender.tab?.id;
  const site = hostFromUrl(sender.tab?.url ?? '');
  if (tabId == null || !site || !['accepted', 'rejected'].includes(msg.decision) || !watchingTrackers(await config())) return;
  await recordDecision(tabId, site, { decision: msg.decision, at: reportedTime(msg.at), by: 'user', cmp: String(msg.cmp).slice(0, 40) });
}

// A first-layer banner is asking for consent on the page, so nothing has been decided yet.
async function recordBanner(msg, sender) {
  const tabId = sender.tab?.id;
  const site = hostFromUrl(sender.tab?.url ?? '');
  if (tabId == null || !site || !watchingTrackers(await config())) return;
  const page = await updatePage(tabId, site, (p) => {
    if (p.decisions.length || p.bannerAt) return;
    p.bannerAt = Date.now();
    p.bannerCmp = String(msg.cmp).slice(0, 40);
  });
  await refreshTabBadge(tabId, page);
}

// Runs a consent platform's own "accept all" or "reject all" API in the page (or frame) that asked,
// after re-checking that the user's consent covers this site right now.
async function answerThroughPlatformApi(msg, sender) {
  if (typeof msg.cmp !== 'string' || sender.tab?.id == null) return null;
  const { allowed, answer } = await checkSite(sender);
  if (!allowed) return { status: 'not-allowed' };
  const [injection] = await ext.scripting.executeScript({
    target: { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] },
    world: 'MAIN',
    func: platformAction,
    args: [answer, msg.cmp],
  });
  const result = injection?.result ?? { status: 'unavailable' };
  if (msg.cmp === 'katla') logKatla(sender, 'answered', { answer, status: result.status });
  return result;
}

// Katla debug log (for developers, off by default). It runs in the page, so it shows in the page's console.
async function logKatla(sender, ...args) {
  const { consent, settings } = await config();
  if (sender.tab?.id == null || !isAuthorised(consent) || !settings.katlaDebug) return;
  await ext.scripting
    .executeScript({ target: { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] }, world: 'MAIN', func: katlaDebug, args })
    .catch(() => {});
}

// "Withdraw consent on this site": asks every consent platform on the page to record a refusal.
// Works on any open tab, whether or not BrowserConsent is currently active there.
async function withdrawOnTab(msg) {
  if (!Number.isInteger(msg.tabId)) return null;
  const [injection] = await ext.scripting.executeScript({
    target: { tabId: msg.tabId },
    world: 'MAIN',
    func: platformAction,
    args: ['withdraw'],
  });
  return injection?.result ?? { withdrawn: [] };
}

const fromExtensionPage = (sender) => Boolean(sender.url?.startsWith(ext.runtime.getURL('')));

// Popup and settings pages log through here so every write goes through one queue.
async function recordUserAction(msg) {
  const site = hostFromUrl(`https://${msg.site}/`);
  if (!site || !['withdrawn', 'site-data-cleared'].includes(msg.action)) return;
  await appendLog({
    at: new Date().toISOString(),
    action: msg.action,
    site,
    cmp: msg.cmp ?? null,
    cmpName: msg.cmpName ?? null,
    method: msg.method ?? 'user',
    frame: null,
  });
  // A refusal the site's consent platform recorded is one it should now respect. Deleted cookies
  // take the platform's record of any decision with them.
  if (msg.action === 'withdrawn' && msg.method === 'api') {
    await recordSiteDecision(site, { decision: 'rejected', at: Date.now(), by: 'user' });
  } else if (msg.action === 'site-data-cleared') {
    await forgetSites([site]);
  }
}

const handlers = {
  'content:check': (msg, sender) => checkSite(sender),
  'content:answered': (msg, sender) => recordAnswered(msg, sender),
  'content:platform-answer': (msg, sender) => answerThroughPlatformApi(msg, sender),
  'content:banner': (msg, sender) => recordBanner(msg, sender),
  'content:decision': (msg, sender) => recordUserDecision(msg, sender),
  'content:katla-found': (msg, sender) => logKatla(sender, 'detected'),
  'content:user-input': (msg, sender) =>
    sender.frameId === 0 && sender.tab?.id != null ? ext.storage.session.set({ [inputKey(sender.tab.id)]: true }) : null,
  // Only extension pages (popup, settings) may do these, never content scripts.
  'log:user-action': (msg, sender) => (fromExtensionPage(sender) ? recordUserAction(msg) : null),
  'site:withdraw': (msg, sender) => (fromExtensionPage(sender) ? withdrawOnTab(msg) : null),
};

ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = sender.id === ext.runtime.id ? handlers[msg?.type] : undefined;
  if (!handler) return false;
  Promise.resolve(handler(msg, sender))
    .then((result) => sendResponse(result ?? null))
    .catch((error) => {
      console.error('[Katla BrowserConsent]', error);
      sendResponse(null);
    });
  return true;
});

// ---------------------------------------------------------------- tracker warnings

// Which tab last sent a request to each tracker host, so a third-party cookie that host sets can be
// put down to that tab.
const recentTrackerHosts = new Map();
const RECENT_MS = 10_000;

async function recordHit(tabId, site, hit) {
  const page = await updatePage(tabId, site, (p) => {
    const same = p.hits.find(
      (h) =>
        h.tracker === hit.tracker &&
        h.kind === hit.kind &&
        h.name === hit.name &&
        h.consentMode === hit.consentMode &&
        Boolean(h.blocked) === Boolean(hit.blocked),
    );
    if (!same) {
      if (p.hits.length < HIT_LIMIT) p.hits.push({ ...hit, times: [hit.at] });
    } else if (same.times.length < TIMES_PER_HIT) {
      same.times.push(hit.at);
    } else {
      // Keeps the first ones and the latest.
      same.times[same.times.length - 1] = hit.at;
    }
  });
  await refreshTabBadge(tabId, page);
}

const tabSite = (tabId) =>
  ext.tabs.get(tabId).then(
    (tab) => hostFromUrl(tab.url ?? ''),
    () => null,
  );

async function onPixelRequest(details) {
  // Prerendered pages aren't in front of the user yet (Chrome only).
  if (details.tabId < 0 || details.documentLifecycle === 'prerender') return;
  const match = matchPixel(details.url);
  if (!match) return;
  for (const [host, seen] of recentTrackerHosts) if (Date.now() - seen.at > RECENT_MS) recentTrackerHosts.delete(host);
  recentTrackerHosts.set(new URL(details.url).hostname, { tabId: details.tabId, at: Date.now() });
  if (!watchingTrackers(await config())) return;
  // The tab's address changes when the new page commits, so hits the old page sends while it
  // unloads still count against the old site.
  const site = await tabSite(details.tabId);
  if (!site) return;
  await recordHit(details.tabId, site, {
    tracker: match.tracker.id,
    kind: 'pixel',
    name: match.endpoint,
    consentMode: match.consentMode,
    at: Math.round(details.timeStamp),
    // The blocking rules stop it; this listener still sees it first.
    blocked: await blocksOn(site),
  });
}

// The tabs a cookie belongs to: the tabs of the site it was set for or partitioned under, or else
// the tab that just sent a request to the tracker host that set it.
async function tabsForCookie(cookie) {
  const domain = cookie.domain.replace(/^\./, '').toLowerCase();
  const topLevel = hostFromUrl(cookie.partitionKey?.topLevelSite ?? '');
  const tabs = await ext.tabs.query({ url: HOST_ORIGINS });
  const firstParty = tabs.flatMap((tab) => {
    const host = hostFromUrl(tab.url ?? '');
    return host && onDomain(host, topLevel ?? domain) ? [{ tabId: tab.id, site: host }] : [];
  });
  if (firstParty.length) return firstParty;
  for (const [host, { tabId, at }] of recentTrackerHosts) {
    if (!onDomain(host, domain) || Date.now() - at > RECENT_MS) continue;
    const site = await tabSite(tabId);
    return site ? [{ tabId, site }] : [];
  }
  return [];
}

async function onCookieChanged({ removed, cookie }) {
  if (removed) return;
  const tracker = matchCookie(cookie.name, cookie.domain);
  if (!tracker || !watchingTrackers(await config())) return;
  const at = Date.now();
  const tabs = await tabsForCookie(cookie);
  // A cookie can't be stopped before it's set, so a blocked one is deleted straight away. It's kept if
  // any site it belongs to has consent.
  const blocked = tabs.length > 0 && (await Promise.all(tabs.map(({ site }) => blocksOn(site)))).every(Boolean);
  if (blocked) await deleteCookie(cookie);
  for (const { tabId, site } of tabs) {
    await recordHit(tabId, site, { tracker: tracker.id, kind: 'cookie', name: cookie.name, consentMode: null, at, blocked });
  }
}

function deleteCookie(cookie) {
  const host = cookie.domain.replace(/^\./, '');
  return ext.cookies
    .remove({
      url: `http${cookie.secure ? 's' : ''}://${host}${cookie.path}`,
      name: cookie.name,
      storeId: cookie.storeId,
      ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {}),
      // Firefox, with first-party isolation.
      ...('firstPartyDomain' in cookie ? { firstPartyDomain: cookie.firstPartyDomain } : {}),
    })
    .catch(() => {});
}

// The listeners are dropped while tracker warnings are off, so the browser doesn't wake BrowserConsent
// for every cookie it sets. They're added in the first turn of every start, as the browser only
// delivers the events that woke it to listeners added then.
function listenForTrackers(on) {
  const events = [
    [ext.webRequest.onBeforeRequest, onPixelRequest, { urls: PIXEL_URL_PATTERNS }],
    [ext.cookies.onChanged, onCookieChanged],
  ];
  for (const [event, listener, filter] of events) {
    if (on && !event.hasListener(listener)) event.addListener(listener, ...(filter ? [filter] : []));
    else if (!on && event.hasListener(listener)) event.removeListener(listener);
  }
}

listenForTrackers(true);
config().then((c) => listenForTrackers(watchingTrackers(c)));

// ---------------------------------------------------------------- blocking

// With blocking on, known tracking pixels are blocked and known tracking cookies deleted on every site
// that doesn't have the user's consent: before its banner is answered and after a refusal. A site gets its
// trackers back once it has "accept all" or a custom choice on file, and keeps them while BrowserConsent
// is off for it. Pixels are blocked by declarativeNetRequest rules; a higher-priority rule lets through
// requests from the sites that keep their trackers.
const ALLOW_RULE_ID = 1;

const blockingActive = ({ consent, settings }) => isAuthorised(consent) && Boolean(settings.blockTrackers);

const siteDecisions = () => ext.storage.local.get('siteDecisions').then(({ siteDecisions = {} }) => siteDecisions);

// Whether trackers on a site are blocked right now.
async function blocksOn(site) {
  const c = await config();
  if (!blockingActive(c) || isExcluded(site, c.exceptions)) return false;
  return !consentedTo(siteRecordFor(site, await siteDecisions()));
}

async function blockingRules() {
  const c = await config();
  if (!blockingActive(c)) return [];
  const decisions = await siteDecisions();
  const allowed = [...new Set([...c.exceptions, ...Object.keys(decisions).filter((site) => consentedTo(decisions[site]))])];
  return [
    ...(allowed.length
      ? [{ id: ALLOW_RULE_ID, priority: 2, action: { type: 'allow' }, condition: { initiatorDomains: allowed.sort() } }]
      : []),
    ...PIXEL_BLOCK_CONDITIONS.map((condition, i) => ({ id: ALLOW_RULE_ID + 1 + i, priority: 1, action: { type: 'block' }, condition })),
  ];
}

let blockQueue = Promise.resolve();

// Brings the rules in line with the settings and site decisions, only writing them when they differ.
function syncBlocking() {
  blockQueue = blockQueue
    .then(async () => {
      const [current, wanted] = await Promise.all([ext.declarativeNetRequest.getDynamicRules(), blockingRules()]);
      const key = (rules) => JSON.stringify(rules.map(({ id, priority, action, condition }) => ({ id, priority, action, condition })));
      if (key(current) === key(wanted)) return;
      await ext.declarativeNetRequest.updateDynamicRules({ removeRuleIds: current.map((rule) => rule.id), addRules: wanted });
    })
    .catch((error) => console.error('[Katla BrowserConsent] blocking rules update failed', error));
  return blockQueue;
}

syncBlocking();
