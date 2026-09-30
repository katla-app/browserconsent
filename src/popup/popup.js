import { ext } from '../lib/browser.js';
import { clearSiteData, hostFromUrl, isExcluded, normalizeHost } from '../lib/site.js';
import { decisionOnFile } from '../lib/on-file.js';
import {
  answerFor,
  getState,
  isAuthorised,
  setAnswer,
  setSiteExcluded,
  siteRecordFor,
  trackersWatched,
  updateSettings,
  warningsOn,
} from '../lib/storage.js';
import { warningsFor } from '../lib/warnings.js';

const $ = (id) => document.getElementById(id);
const platformName = new Map(globalThis.KATLA_BROWSERCONSENT_RULES.map((rule) => [rule.id, rule.name]));

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

function statusText(authorised, settings, answer) {
  if (!authorised) return 'Not active';
  if (!settings.enabled) return 'Auto consent off';
  return answer === 'accept' ? 'Accept all' : 'Reject all';
}

const ON_FILE = {
  accepted: 'Already accepted',
  rejected: 'Already rejected',
  custom: 'Custom choice on file',
  answered: 'Already answered',
};

function renderWarnings(list, entries) {
  list.replaceChildren(
    ...entries.map(({ tracker, cookies, pixels, earlier }) => {
      const item = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = tracker.name;
      const detail = document.createElement('span');
      detail.className = 'muted';
      detail.textContent = [...cookies, ...pixels].join(', ') + (earlier ? ' · on an earlier visit' : '');
      item.append(name, detail);
      return item;
    }),
  );
  list.parentElement.hidden = entries.length === 0;
}

async function render() {
  const { consent, settings, exceptions } = await getState();
  const authorised = isAuthorised(consent);
  const answer = answerFor(consent, settings);
  const status = $('status');
  status.textContent = statusText(authorised, settings, answer);
  status.className = `status-pill ${authorised && settings.enabled ? 'on' : ''}`;

  $('inactive').hidden = authorised;
  $('active').hidden = !authorised;
  $('open-settings').hidden = !authorised && !consent;
  if (!authorised) return;

  $('enabled').checked = settings.enabled;
  $('enabled-hint').textContent = !settings.enabled
    ? 'Off everywhere'
    : answer === 'accept'
      ? 'Accepts all cookies on every site you haven’t excluded'
      : 'Rejects all cookies on every site you haven’t excluded';
  $('answer').hidden = !settings.enabled;
  for (const input of document.querySelectorAll('input[name="answer"]')) input.checked = input.value === answer;

  $('site-host').textContent = site ?? 'This page';
  $('site-controls').hidden = !site;
  $('warnings').hidden = true;
  if (!site) {
    $('site-state').textContent = 'BrowserConsent only works on websites.';
    return;
  }
  for (const el of document.querySelectorAll('.host-inline')) el.textContent = site;

  const excluded = isExcluded(site, exceptions);
  $('site-enabled').checked = !excluded;
  $('site-enabled').disabled = !settings.enabled;

  const key = `page:${tab.id}`;
  const { [key]: page } = await ext.storage.session.get(key);
  const answered = page?.decisions.findLast((d) => d.by === 'browserconsent');
  const onFile = answered ? null : await decisionOnFile(tab.url);
  const state = $('site-state');
  state.classList.toggle('ok', Boolean(answered || onFile));
  if (answered) {
    state.textContent = `${answered.decision === 'rejected' ? 'Rejected' : 'Accepted'} all on this page · ${answered.cmpName}`;
  } else if (onFile) {
    state.textContent = `${ON_FILE[onFile.decision]} · ${onFile.cmpName}`;
  } else if (!settings.enabled) {
    state.textContent = 'Auto consent is off';
  } else if (excluded) {
    state.textContent = 'Off for this site';
  } else {
    state.textContent = 'No cookie banner answered on this page';
  }

  if (trackersWatched(settings)) {
    const { siteFindings = {} } = await ext.storage.local.get('siteFindings');
    const { beforeConsent, afterReject, count, blocked } = warningsFor(page, settings, siteRecordFor(site, siteFindings));
    renderWarnings($('warnings-before-list'), beforeConsent);
    renderWarnings($('warnings-after-list'), afterReject);
    renderWarnings($('blocked-list'), blocked);
    $('warnings-none').hidden = count > 0 || blocked.length > 0 || !warningsOn(settings);
    $('warnings').hidden = false;
  }
}

$('enabled').addEventListener('change', async (event) => {
  await updateSettings({ enabled: event.target.checked });
  render();
});

// "Accept all" needs the user's consent to it first, which onboarding asks for.
$('answer').addEventListener('change', async (event) => {
  if (!(await setAnswer(event.target.value))) {
    openPage('onboarding/onboarding.html?answer=accept');
    return;
  }
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
    showResult(`Refusal recorded with ${names}. BrowserConsent is off for this site. Reloading the page…`);
    setTimeout(() => ext.tabs.reload(tab.id), 900);
  } else {
    showResult(
      'BrowserConsent is now off for this site, but it couldn’t reach the site’s consent platform. To reset the consent already given, delete this site’s cookies.',
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
  showResult('Cookies deleted and BrowserConsent is off for this site. Reloading the page…');
  setTimeout(() => ext.tabs.reload(tab.id), 900);
});

render();
