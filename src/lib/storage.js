import { ext } from './browser.js';
import { ACCEPT_STATEMENT, ANSWERS, DEFAULT_SETTINGS, LOG_LIMIT, POLICY_VERSION, SITE_DECISION_LIMIT } from './constants.js';
import { normalizeHost, onDomain } from './site.js';

const local = ext.storage.local;

export async function getState() {
  const s = await local.get(['consent', 'consentHistory', 'settings', 'exceptions', 'log']);
  return {
    consent: s.consent ?? null,
    consentHistory: s.consentHistory ?? [],
    settings: { ...DEFAULT_SETTINGS, ...s.settings },
    exceptions: s.exceptions ?? [],
    log: s.log ?? [],
  };
}

// The part of the state every check needs, without the history and log.
export async function getConfig() {
  const s = await local.get(['consent', 'settings', 'exceptions']);
  return { consent: s.consent ?? null, settings: { ...DEFAULT_SETTINGS, ...s.settings }, exceptions: s.exceptions ?? [] };
}

export const isAuthorised = (consent) => consent?.status === 'granted' && consent.policyVersion === POLICY_VERSION;

// "Accept all" needs the user's agreement to it in the receipt. "Reject all" only narrows what
// BrowserConsent does for them, so every valid receipt covers it.
export const acceptAuthorised = (consent) =>
  isAuthorised(consent) && consent.statements.some((statement) => statement.id === ACCEPT_STATEMENT);

export const answerFor = (consent, settings) =>
  settings.answer === 'accept' && acceptAuthorised(consent) ? 'accept' : 'reject';

export const warningsOn = (settings) => Boolean(settings.warnBeforeConsent || settings.warnAfterReject);

// Tracker warnings and blocking both need to know which trackers a page uses, and when it asked for consent.
export const trackersWatched = (settings) => warningsOn(settings) || Boolean(settings.blockTrackers);

// A site decision that lets the site use its trackers: "accept all", or a custom choice the user made.
export const consentedTo = (record) => record?.decision === 'accepted' || record?.decision === 'custom';

export async function grantConsent(record, settings) {
  const current = await getState();
  await local.set({
    consent: record,
    settings: { ...current.settings, ...settings },
    consentHistory: [
      ...current.consentHistory,
      { type: 'granted', at: record.grantedAt, receiptId: record.receiptId, policyVersion: record.policyVersion },
    ],
  });
}

export async function withdrawConsent() {
  const { consent, consentHistory } = await getState();
  if (consent?.status !== 'granted') return;
  const at = new Date().toISOString();
  await local.set({
    consent: { ...consent, status: 'withdrawn', withdrawnAt: at },
    consentHistory: [...consentHistory, { type: 'withdrawn', at, receiptId: consent.receiptId, policyVersion: consent.policyVersion }],
  });
}

export async function updateSettings(patch) {
  const { settings } = await getState();
  await local.set({ settings: { ...settings, ...patch } });
}

// Answering unrecognised banners changes the scope of the authorisation, so the change is
// written into the receipt and its history rather than only into settings.
export async function setGenericScope(enabled) {
  const { consent, consentHistory, settings } = await getState();
  if (!isAuthorised(consent)) return;
  const at = new Date().toISOString();
  await local.set({
    settings: { ...settings, generic: enabled },
    consent: { ...consent, scope: { ...consent.scope, unrecognisedBanners: enabled } },
    consentHistory: [
      ...consentHistory,
      { type: enabled ? 'scope-extended' : 'scope-reduced', at, receiptId: consent.receiptId, detail: 'Unrecognised cookie banners' },
    ],
  });
}

// Switching between "Reject all" and "Accept all" changes what BrowserConsent does on the user's behalf,
// so it goes into the receipt and its history too. Returns false when "Accept all" hasn't been
// agreed to yet; the user has to go through onboarding for it.
export async function setAnswer(answer) {
  const { consent, consentHistory, settings } = await getState();
  if (!ANSWERS.includes(answer) || !isAuthorised(consent)) return false;
  if (answer === 'accept' && !acceptAuthorised(consent)) return false;
  if (settings.answer === answer) return true;
  const at = new Date().toISOString();
  await local.set({
    settings: { ...settings, answer },
    consent: { ...consent, scope: { ...consent.scope, answer } },
    consentHistory: [...consentHistory, { type: `answer-${answer}`, at, receiptId: consent.receiptId }],
  });
  return true;
}

export async function setSiteExcluded(host, excluded) {
  const h = normalizeHost(host);
  const { exceptions } = await getState();
  const next = excluded ? [...new Set([...exceptions, h])].sort() : exceptions.filter((ex) => ex !== h);
  await local.set({ exceptions: next });
}

let logQueue = Promise.resolve();

// Serialised so concurrent reports from several frames don't overwrite each other.
export function appendLog(entry) {
  logQueue = logQueue.then(async () => {
    const { log } = await getState();
    await local.set({ log: [entry, ...log].slice(0, LOG_LIMIT) });
  });
  return logQueue;
}

export const clearLog = () => local.set({ log: [] });

// ---------------------------------------------------------------- site records

// Kept per site across visits, because once a site has an answer its banner doesn't come back:
//   siteDecisions  the last cookie decision ({ decision: 'accepted' | 'rejected' | 'custom', at, by }), made
//                  by BrowserConsent ('browserconsent') or the user ('user'), or found in the site's consent
//                  cookie ('site'), so tracker warnings and blocking know whether the site has consent
//   siteFindings   what tracker warnings flagged on the site ({ at, beforeConsent, afterReject }, each a list of
//                  { tracker, cookies, pixels }), so a warning isn't lost when the page is reloaded
// Both keep the latest SITE_DECISION_LIMIT sites, and a site is forgotten when its cookies are deleted.

const NAMES_PER_FINDING = 10;

let siteQueue = Promise.resolve();

// `change` gets a copy of the records and returns the new ones, or null to leave them as they are.
function changeSites(key, change) {
  siteQueue = siteQueue
    .then(async () => {
      const { [key]: records = {} } = await local.get(key);
      const next = change({ ...records });
      if (!next) return;
      const sites = Object.keys(next);
      if (sites.length > SITE_DECISION_LIMIT) {
        sites.sort((a, b) => next[a].at - next[b].at);
        for (const site of sites.slice(0, sites.length - SITE_DECISION_LIMIT)) delete next[site];
      }
      await local.set({ [key]: next });
    })
    .catch((error) => console.error(`[Katla BrowserConsent] ${key} update failed`, error));
  return siteQueue;
}

export const recordSiteDecision = (host, decision) =>
  changeSites('siteDecisions', (decisions) => ({ ...decisions, [normalizeHost(host)]: decision }));

// Adds what tracker warnings flagged on a page (warningsFor's lists) to what's remembered for its site.
export const rememberFindings = (host, { beforeConsent, afterReject }) =>
  changeSites('siteFindings', (findings) => {
    const site = normalizeHost(host);
    let changed = false;
    const merge = (remembered = [], flagged) => {
      const next = remembered.map((entry) => ({ ...entry, cookies: [...entry.cookies], pixels: [...entry.pixels] }));
      for (const { tracker, cookies, pixels } of flagged) {
        let entry = next.find((e) => e.tracker === tracker.id);
        if (!entry) {
          entry = { tracker: tracker.id, cookies: [], pixels: [] };
          next.push(entry);
          changed = true;
        }
        for (const [field, names] of [['cookies', cookies], ['pixels', pixels]]) {
          for (const name of names) {
            if (entry[field].includes(name) || entry[field].length >= NAMES_PER_FINDING) continue;
            entry[field].push(name);
            changed = true;
          }
        }
      }
      return next;
    };
    const next = {
      beforeConsent: merge(findings[site]?.beforeConsent, beforeConsent),
      afterReject: merge(findings[site]?.afterReject, afterReject),
    };
    return changed ? { ...findings, [site]: { at: Date.now(), ...next } } : null;
  });

// After a site's cookies are deleted, its consent platform no longer knows what was decided, and the
// site asks again.
export const forgetSites = (hosts) =>
  Promise.all(
    ['siteDecisions', 'siteFindings'].map((key) =>
      changeSites(key, (records) => {
        for (const host of hosts.map(normalizeHost)) {
          for (const site of Object.keys(records)) {
            if (onDomain(host, site) || onDomain(site, host)) delete records[site];
          }
        }
        return records;
      }),
    ),
  );

// The record for a host, or for the site it belongs to.
export function siteRecordFor(host, records) {
  for (let h = normalizeHost(host); h.includes('.'); h = h.slice(h.indexOf('.') + 1)) {
    if (records[h]) return records[h];
  }
  return records[normalizeHost(host)] ?? null;
}
