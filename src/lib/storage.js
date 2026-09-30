import { ext } from './browser.js';
import { DEFAULT_SETTINGS, LOG_LIMIT, POLICY_VERSION } from './constants.js';
import { normalizeHost } from './site.js';

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

export const isAuthorised = (consent) => consent?.status === 'granted' && consent.policyVersion === POLICY_VERSION;

export async function grantConsent(record, settings) {
  const { consentHistory } = await getState();
  await local.set({
    consent: record,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    consentHistory: [
      ...consentHistory,
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
