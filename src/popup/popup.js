import { ext } from '../lib/browser.js';
import { clearSiteData, hostFromUrl, isExcluded, normalizeHost } from '../lib/site.js';
import { getState, isAuthorised, setSiteExcluded, updateSettings } from '../lib/storage.js';

const $ = (id) => document.getElementById(id);
const platformName = new Map(globalThis.KATLA_AUTOCONSENT_RULES.map((rule) => [rule.id, rule.name]));

const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
const host = hostFromUrl(tab?.url ?? '');
const site = host ? normalizeHost(host) : null;

const openPage = (path) => {
  ext.tabs.create({ url: ext.runtime.getURL(path) });
  window.close();
};
$('activate').addEventListener('click', () => openPage('onboarding/onboarding.html'));
$('open-settings').addEventListener('click', () => openPage('options/options.html'));
$('open-privacy').addEventListener('click', () => openPage('options/options.html#privacy'));

async function render() {
  const { consent, settings, exceptions } = await getState();
  const authorised = isAuthorised(consent);
  const status = $('status');
  status.textContent = !authorised ? 'Not active' : settings.enabled ? 'Active' : 'Paused';
  status.className = `status-pill ${authorised && settings.enabled ? 'on' : ''}`;

  $('inactive').hidden = authorised;
  $('active').hidden = !authorised;
  $('open-settings').hidden = !authorised && !consent;
  if (!authorised) return;

  $('enabled').checked = settings.enabled;
  $('enabled-hint').textContent = settings.enabled ? 'On every site you haven’t excluded' : 'Paused everywhere';

  $('site-host').textContent = site ?? 'This page';
  $('site-controls').hidden = !site;
  if (!site) {
    $('site-state').textContent = 'AutoConsent only works on websites.';
    return;
  }
  for (const el of document.querySelectorAll('.host-inline')) el.textContent = site;

  const excluded = isExcluded(site, exceptions);
  $('site-enabled').checked = !excluded;
  $('site-enabled').disabled = !settings.enabled;

  const key = `tab:${tab.id}`;
  const { [key]: answered = [] } = await ext.storage.session.get(key);
  const state = $('site-state');
  state.classList.toggle('ok', answered.length > 0);
  if (answered.length > 0) {
    const last = answered.at(-1);
    state.textContent = `Accepted all on this page · ${last.cmpName}`;
  } else if (!settings.enabled) {
    state.textContent = 'Paused';
  } else if (excluded) {
    state.textContent = 'Off for this site';
  } else {
    state.textContent = 'No cookie banner answered on this page';
  }
}

$('enabled').addEventListener('change', async (event) => {
  await updateSettings({ enabled: event.target.checked });
  render();
});

$('site-enabled').addEventListener('change', async (event) => {
  await setSiteExcluded(site, !event.target.checked);
  render();
});

function showConfirm(which) {
  $('site-actions').hidden = Boolean(which);
  $('confirm-withdraw').hidden = which !== 'withdraw';
  $('confirm-clear').hidden = which !== 'clear';
}

for (const button of document.querySelectorAll('[data-confirm]')) {
  button.addEventListener('click', () => {
    $('site-result').hidden = true;
    showConfirm(button.dataset.confirm);
  });
}
for (const button of document.querySelectorAll('[data-cancel]')) {
  button.addEventListener('click', () => showConfirm(null));
}

function showResult(text) {
  showConfirm(null);
  $('site-result').textContent = text;
  $('site-result').hidden = false;
}

const logUserAction = (entry) => ext.runtime.sendMessage({ type: 'log:user-action', site, ...entry }).catch(() => {});

$('withdraw').addEventListener('click', async () => {
  await setSiteExcluded(site, true);
  let withdrawn = [];
  try {
    const response = await ext.runtime.sendMessage({ type: 'site:withdraw', tabId: tab.id });
    withdrawn = response?.withdrawn ?? [];
  } catch {
    // The page can't be scripted (for example, a browser error page).
  }
  const names = withdrawn.map((id) => platformName.get(id) ?? id).join(', ');
  await logUserAction({
    action: 'withdrawn',
    cmp: withdrawn.join(',') || null,
    cmpName: names || null,
    method: withdrawn.length ? 'api' : 'excluded',
  });
  await render();
  if (withdrawn.length) {
    showResult(`Refusal recorded with ${names}. AutoConsent is off for this site. Reloading the page…`);
    setTimeout(() => ext.tabs.reload(tab.id), 900);
  } else {
    showResult(
      'AutoConsent is now off for this site, but it couldn’t reach the site’s consent platform. To reset the consent already given, delete this site’s cookies.',
    );
  }
});

$('clear').addEventListener('click', async () => {
  await setSiteExcluded(site, true);
  try {
    await clearSiteData([host]);
  } catch (error) {
    showResult(`Couldn’t delete this site’s data: ${error.message}`);
    return;
  }
  await logUserAction({ action: 'site-data-cleared', method: 'user' });
  await render();
  showResult('Cookies deleted and AutoConsent is off for this site. Reloading the page…');
  setTimeout(() => ext.tabs.reload(tab.id), 900);
});

render();
