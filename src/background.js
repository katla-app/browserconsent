import { ext } from './lib/browser.js';
import { HOST_ORIGINS, POLICY_VERSION } from './lib/constants.js';
import { platformAction } from './lib/platforms.js';
import { hostFromUrl, isExcluded } from './lib/site.js';
import { appendLog, getState, isAuthorised } from './lib/storage.js';

const ONBOARDING_PAGE = 'onboarding/onboarding.html';
const tabKey = (tabId) => `tab:${tabId}`;
const inputKey = (tabId) => `input:${tabId}`;

// The content script is registered only while the user's consent is valid and AutoConsent isn't
// paused. Before consent, after withdrawal and while paused, nothing is injected into any website.
const ENGINE_SCRIPT = {
  id: 'katla-autoconsent-engine',
  matches: HOST_ORIGINS,
  js: ['content/rules.js', 'content/engine.js'],
  runAt: 'document_end',
  allFrames: true,
};

let syncQueue = Promise.resolve();

function syncContentScripts() {
  syncQueue = syncQueue
    .then(async () => {
      const { consent, settings } = await getState();
      const shouldRun = isAuthorised(consent) && settings.enabled;
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
    .catch((error) => console.error('[Katla AutoConsent] content script sync failed', error));
  return syncQueue;
}

syncContentScripts();

ext.runtime.onInstalled.addListener(async ({ reason }) => {
  const { consent } = await getState();
  const firstInstall = reason === 'install' && !consent;
  const policyChanged = reason === 'update' && consent?.status === 'granted' && consent.policyVersion !== POLICY_VERSION;
  if (firstInstall || policyChanged) {
    await ext.tabs.create({ url: ext.runtime.getURL(ONBOARDING_PAGE) });
  }
  await Promise.all([refreshBadge(), syncContentScripts()]);
});

ext.runtime.onStartup.addListener(() => Promise.all([refreshBadge(), syncContentScripts()]));

ext.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !(changes.consent || changes.settings)) return;
  refreshBadge();
  syncContentScripts();
});

async function refreshBadge() {
  const { consent, settings } = await getState();
  const authorised = isAuthorised(consent);
  const active = authorised && settings.enabled;
  const title = active
    ? 'Katla AutoConsent: active'
    : authorised
      ? 'Katla AutoConsent: paused'
      : 'Katla AutoConsent: not activated';
  await Promise.all([
    ext.action.setBadgeBackgroundColor({ color: '#6B7280' }),
    ext.action.setBadgeText({ text: active ? '' : 'off' }),
    ext.action.setTitle({ title }),
  ]);
}

// A new document in the tab starts with a clean per-tab record.
ext.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status !== 'loading') return;
  ext.storage.session.remove([tabKey(tabId), inputKey(tabId)]);
  ext.action.setBadgeText({ tabId, text: null }).catch(() => {});
});

ext.tabs.onRemoved.addListener((tabId) => ext.storage.session.remove([tabKey(tabId), inputKey(tabId)]));

async function checkSite(sender) {
  const site = hostFromUrl(sender.tab?.url ?? '');
  const { consent, settings, exceptions } = await getState();
  // Once the user has interacted with the page, consent frames opened afterwards are theirs to answer.
  const key = inputKey(sender.tab?.id);
  const userInteracted = sender.frameId !== 0 && Boolean((await ext.storage.session.get(key))[key]);
  const allowed =
    Boolean(site) && isAuthorised(consent) && settings.enabled && !isExcluded(site, exceptions) && !userInteracted;
  return { allowed, generic: allowed && settings.generic };
}

async function recordAccepted(msg, sender) {
  const tabId = sender.tab?.id;
  const site = hostFromUrl(sender.tab?.url ?? '');
  if (tabId == null || !site) return;
  const entry = {
    at: new Date().toISOString(),
    action: 'accepted',
    site,
    cmp: String(msg.cmp).slice(0, 40),
    cmpName: String(msg.cmpName).slice(0, 80),
    method: String(msg.method).slice(0, 20),
    frame: sender.frameId === 0 ? null : hostFromUrl(sender.url ?? ''),
  };
  await appendLog(entry);
  const key = tabKey(tabId);
  const { [key]: previous = [] } = await ext.storage.session.get(key);
  await ext.storage.session.set({ [key]: [...previous, entry] });
  await ext.action.setBadgeBackgroundColor({ tabId, color: '#5B21B6' });
  await ext.action.setBadgeText({ tabId, text: '✓' });
}

// Runs a consent platform's own "accept all" API in the page (or frame) that asked, after
// re-checking that the user's consent covers this site right now.
async function acceptThroughPlatformApi(msg, sender) {
  if (typeof msg.cmp !== 'string' || sender.tab?.id == null) return null;
  const { allowed } = await checkSite(sender);
  if (!allowed) return { status: 'not-allowed' };
  const [injection] = await ext.scripting.executeScript({
    target: { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] },
    world: 'MAIN',
    func: platformAction,
    args: ['accept', msg.cmp],
  });
  return injection?.result ?? { status: 'unavailable' };
}

// "Withdraw consent on this site": asks every consent platform on the page to record a refusal.
// Works on any open tab, whether or not AutoConsent is currently active there.
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
}

const handlers = {
  'content:check': (msg, sender) => checkSite(sender),
  'content:accepted': (msg, sender) => recordAccepted(msg, sender),
  'content:platform-accept': (msg, sender) => acceptThroughPlatformApi(msg, sender),
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
      console.error('[Katla AutoConsent]', error);
      sendResponse(null);
    });
  return true;
});
