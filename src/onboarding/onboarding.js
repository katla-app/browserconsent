import { ext, isFirefox } from '../lib/browser.js';
import { CONSENT_STATEMENTS, HOST_ORIGINS, POLICY_VERSION } from '../lib/constants.js';
import { getState, grantConsent, isAuthorised } from '../lib/storage.js';

const $ = (id) => document.getElementById(id);
const form = $('consent-form');

const platformNames = new Set(globalThis.KATLA_AUTOCONSENT_RULES.map((rule) => rule.name));
$('platform-count').textContent = `${platformNames.size - 1} other`;

for (const statement of CONSENT_STATEMENTS) {
  const label = document.createElement('label');
  label.className = 'statement';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.name = statement.id;
  const text = document.createElement('span');
  text.textContent = statement.text;
  label.append(input, text);
  $('statements').append(label);
}

const statementInputs = [...form.querySelectorAll('.statement input')];
form.addEventListener('change', () => {
  $('activate').disabled = !statementInputs.every((input) => input.checked);
});

const normalise = (text) => text.replace(/\s+/g, ' ').trim();

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!statementInputs.every((input) => input.checked)) return;

  // Must be the first await: browsers only show the permission prompt in direct response to the click.
  let hasAccess;
  try {
    hasAccess = await ext.permissions.request({ origins: HOST_ORIGINS });
  } catch {
    hasAccess = await ext.permissions.contains({ origins: HOST_ORIGINS });
  }
  $('permission-error').hidden = hasAccess;
  if (!hasAccess) return;

  const generic = $('generic').checked;
  const noticeText = normalise($('notice').textContent);
  const statements = CONSENT_STATEMENTS.map(({ id, text }) => ({ id, text }));
  const record = {
    status: 'granted',
    receiptId: crypto.randomUUID(),
    policyVersion: POLICY_VERSION,
    grantedAt: new Date().toISOString(),
    method: 'Ticked each statement separately and clicked "Activate AutoConsent"',
    statements,
    noticeText,
    noticeHash: `sha256:${await sha256(JSON.stringify({ policyVersion: POLICY_VERSION, noticeText, statements }))}`,
    scope: { acceptAll: true, unrecognisedBanners: generic },
    extensionVersion: ext.runtime.getManifest().version,
    browser: isFirefox ? 'firefox' : 'chromium',
  };
  await grantConsent(record, { enabled: true, generic });
  showDone(record);
});

$('not-now').addEventListener('click', () => window.close());
$('close').addEventListener('click', () => window.close());

function showDone(record) {
  $('receipt-id').textContent = record.receiptId;
  $('receipt-date').textContent = new Date(record.grantedAt).toLocaleString();
  $('consent-step').hidden = true;
  $('done-step').hidden = false;
  window.scrollTo({ top: 0 });
}

const { consent } = await getState();
if (isAuthorised(consent)) {
  showDone(consent);
} else if (consent?.status === 'granted') {
  $('reconsent-note').hidden = false;
}
