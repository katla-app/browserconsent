import { ext } from '../lib/browser.js';
import { clearSiteData, hostFromUrl, normalizeHost } from '../lib/site.js';
import {
  clearLog,
  getState,
  isAuthorised,
  setGenericScope,
  setSiteExcluded,
  updateSettings,
  withdrawConsent,
} from '../lib/storage.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

const formatDate = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const METHOD_LABELS = { click: 'clicked Accept all', api: 'via the platform API', heuristic: 'recognised by text' };
const HISTORY_LABELS = {
  granted: 'Consent given',
  withdrawn: 'Consent withdrawn',
  'scope-extended': 'Extended to unrecognised banners',
  'scope-reduced': 'Limited to recognised consent platforms',
};

function download(filename, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = el('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

// Sites where AutoConsent's latest action was to accept (not later withdrawn or reset).
function sitesWithConsent(log) {
  const sites = new Set();
  for (const entry of [...log].reverse()) {
    if (entry.action === 'accepted') sites.add(entry.site);
    else sites.delete(entry.site);
  }
  return [...sites];
}

function describe(entry) {
  if (entry.action === 'withdrawn') {
    return entry.cmpName ? `You withdrew consent (${entry.cmpName})` : 'You turned AutoConsent off for this site';
  }
  if (entry.action === 'site-data-cleared') return 'You deleted the site’s cookies';
  const where = entry.frame ? ` in ${entry.frame}` : '';
  return `Accepted all · ${entry.cmpName}${where} (${METHOD_LABELS[entry.method] ?? entry.method})`;
}

async function render() {
  const { consent, consentHistory, settings, exceptions, log } = await getState();
  const authorised = isAuthorised(consent);

  const status = $('status');
  status.textContent = !authorised ? 'Not active' : settings.enabled ? 'Active' : 'Paused';
  status.className = `status-pill ${authorised && settings.enabled ? 'on' : ''}`;

  // Consent
  $('consent-none').hidden = Boolean(consent);
  $('consent-details').hidden = !consent;
  $('export-receipt').hidden = !consent;
  if (consent) {
    const withdrawn = consent.status === 'withdrawn';
    const outdated = consent.status === 'granted' && !authorised;
    $('consent-summary').textContent = withdrawn
      ? 'You withdrew your consent. AutoConsent isn’t answering any cookie banners.'
      : outdated
        ? 'What AutoConsent does has changed since you agreed. It’s paused until you review and agree again.'
        : 'You’ve allowed AutoConsent to accept all cookies for you when websites show a cookie banner.';
    $('receipt-id').textContent = consent.receiptId;
    $('receipt-granted').textContent = formatDate(consent.grantedAt);
    $('receipt-withdrawn-row').hidden = !withdrawn;
    if (withdrawn) $('receipt-withdrawn').textContent = formatDate(consent.withdrawnAt);
    $('receipt-version').textContent = `v${consent.policyVersion}`;
    $('receipt-hash').textContent = consent.noticeHash;
    $('receipt-statements').replaceChildren(...consent.statements.map((s) => el('li', { textContent: s.text })));
    $('receipt-notice').textContent = `Information shown: “${consent.noticeText}”`;
    $('consent-history').replaceChildren(
      ...consentHistory
        .slice()
        .reverse()
        .map((h) => el('li', { textContent: `${HISTORY_LABELS[h.type] ?? h.type} · ${formatDate(h.at)}` })),
    );
    $('withdraw-actions').hidden = withdrawn || outdated;
    $('regrant').hidden = !(withdrawn || outdated);
  }

  // Settings
  $('settings-block').hidden = !authorised;
  $('enabled').checked = settings.enabled;
  $('generic').checked = settings.generic;

  // Exceptions
  $('exceptions').replaceChildren(
    ...exceptions.map((site) => {
      const remove = el('button', { type: 'button', textContent: '×', title: `Turn AutoConsent back on for ${site}` });
      remove.setAttribute('aria-label', `Turn AutoConsent back on for ${site}`);
      remove.addEventListener('click', async () => {
        await setSiteExcluded(site, false);
        render();
      });
      return el('li', {}, [el('span', { textContent: site }), remove]);
    }),
  );
  $('exceptions-empty').hidden = exceptions.length > 0;

  // Activity
  $('log').replaceChildren(
    ...log.map((entry) =>
      el('tr', {}, [
        el('td', { textContent: formatDate(entry.at) }),
        el('td', { textContent: entry.site }),
        el('td', { textContent: describe(entry) }),
      ]),
    ),
  );
  $('log-empty').hidden = log.length > 0;

  const sites = sitesWithConsent(log);
  $('sites-reset').hidden = sites.length === 0;
  $('sites-count').textContent =
    sites.length === 1 ? 'AutoConsent has consent in place on 1 site.' : `AutoConsent has consent in place on ${sites.length} sites.`;
  $('clear-sites').onclick = () => clearSites(sites);
}

async function clearSites(sites) {
  const result = $('clear-sites-result');
  $('clear-sites').disabled = true;
  try {
    await clearSiteData(sites);
    for (const site of sites) {
      await ext.runtime.sendMessage({ type: 'log:user-action', action: 'site-data-cleared', site });
    }
    result.textContent = `Deleted cookies on ${sites.length} site${sites.length === 1 ? '' : 's'}.`;
  } catch (error) {
    result.textContent = `Couldn’t delete cookies: ${error.message}`;
  } finally {
    result.hidden = false;
    $('clear-sites').disabled = false;
  }
  render();
}

$('export-receipt').addEventListener('click', async () => {
  const { consent, consentHistory, settings, exceptions } = await getState();
  download(`katla-autoconsent-receipt-${consent.receiptId}.json`, {
    type: 'Katla AutoConsent consent receipt',
    exportedAt: new Date().toISOString(),
    consent,
    history: consentHistory,
    currentSettings: { ...settings, excludedSites: exceptions },
  });
});

$('export-log').addEventListener('click', async () => {
  const { log } = await getState();
  download(`katla-autoconsent-activity-${new Date().toISOString().slice(0, 10)}.json`, log);
});

$('clear-log').addEventListener('click', async () => {
  await clearLog();
  render();
});

$('withdraw-start').addEventListener('click', () => {
  $('withdraw-actions').hidden = true;
  $('withdraw-confirm').hidden = false;
});
$('withdraw-cancel').addEventListener('click', () => {
  $('withdraw-actions').hidden = false;
  $('withdraw-confirm').hidden = true;
});
$('withdraw').addEventListener('click', async () => {
  await withdrawConsent();
  $('withdraw-confirm').hidden = true;
  render();
});

$('enabled').addEventListener('change', (event) => updateSettings({ enabled: event.target.checked }));
$('generic').addEventListener('change', (event) => setGenericScope(event.target.checked));

$('exception-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const raw = $('exception-input').value.trim();
  if (!raw) return;
  const host = hostFromUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  if (!host || !host.includes('.')) {
    $('exception-input').setCustomValidity('Enter a website like example.com');
    $('exception-input').reportValidity();
    return;
  }
  $('exception-input').setCustomValidity('');
  await setSiteExcluded(normalizeHost(host), true);
  $('exception-input').value = '';
  render();
});
$('exception-input').addEventListener('input', (event) => event.target.setCustomValidity(''));

$('platforms').replaceChildren(
  ...[...new Set(globalThis.KATLA_AUTOCONSENT_RULES.map((rule) => rule.name))]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => el('li', { textContent: name })),
);

ext.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') render();
});

render();
