import { ext, isFirefox } from '../lib/browser.js';
import { ANSWERS, CONSENT_STATEMENTS, HOST_ORIGINS, POLICY_VERSION } from '../lib/constants.js';
import { acceptAuthorised, getState, grantConsent, isAuthorised } from '../lib/storage.js';

const $ = (id) => document.getElementById(id);
const form = $('consent-form');

const platformNames = new Set(globalThis.KATLA_BROWSERCONSENT_RULES.map((rule) => rule.name));
$('platform-count').textContent = `${platformNames.size - 1} other`;

const chosenAnswer = () => form.querySelector('input[name="answer"]:checked')?.value ?? null;
const statementInputs = () => [...form.querySelectorAll('.statement input')];
const allTicked = () => statementInputs().length > 0 && statementInputs().every((input) => input.checked);

// The statements depend on the answer, and start unticked whenever it changes.
function showStatements(answer) {
  $('statements').replaceChildren(
    ...CONSENT_STATEMENTS[answer].map((statement) => {
      const label = document.createElement('label');
      label.className = 'statement';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = statement.id;
      const text = document.createElement('span');
      text.textContent = statement.text;
      label.append(input, text);
      return label;
    }),
  );
  $('statements-step').hidden = false;
}

form.addEventListener('change', (event) => {
  if (event.target.name === 'answer') showStatements(event.target.value);
  $('activate').disabled = !chosenAnswer() || !allTicked();
});

const normalise = (text) => text.replace(/\s+/g, ' ').trim();

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const answer = chosenAnswer();
  if (!answer || !allTicked()) return;

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
  const statements = CONSENT_STATEMENTS[answer].map(({ id, text }) => ({ id, text }));
  const record = {
    status: 'granted',
    receiptId: crypto.randomUUID(),
    policyVersion: POLICY_VERSION,
    grantedAt: new Date().toISOString(),
    method: `Chose "${answer === 'accept' ? 'Accept all' : 'Reject all'}", ticked each statement separately and clicked "Activate BrowserConsent"`,
    statements,
    noticeText,
    noticeHash: `sha256:${await sha256(JSON.stringify({ policyVersion: POLICY_VERSION, noticeText, statements }))}`,
    scope: { answer, unrecognisedBanners: generic },
    extensionVersion: ext.runtime.getManifest().version,
    browser: isFirefox ? 'firefox' : 'chromium',
  };
  await grantConsent(record, { enabled: true, answer, generic });
  showDone(record);
});

$('not-now').addEventListener('click', () => window.close());
$('close').addEventListener('click', () => window.close());

function showDone(record) {
  $('receipt-id').textContent = record.receiptId;
  $('receipt-date').textContent = new Date(record.grantedAt).toLocaleString();
  $('done-lede').textContent =
    record.scope?.answer === 'accept'
      ? 'From now on, Katla accepts all cookies for you when a website asks.'
      : 'From now on, Katla rejects all cookies that aren’t strictly necessary when a website asks.';
  $('consent-step').hidden = true;
  $('done-step').hidden = false;
  window.scrollTo({ top: 0 });
}

// Settings links here with ?answer=accept when the user switches to "Accept all" without having
// agreed to it yet.
const requested = new URLSearchParams(location.search).get('answer');
const { consent, settings } = await getState();
const needsAcceptConsent = requested === 'accept' && !acceptAuthorised(consent);
if (isAuthorised(consent) && !needsAcceptConsent) {
  showDone(consent);
} else {
  if (consent?.status === 'granted' && !isAuthorised(consent)) $('reconsent-note').hidden = false;
  else if (needsAcceptConsent && isAuthorised(consent)) $('accept-note').hidden = false;
  if (consent) $('generic').checked = settings.generic;
  if (ANSWERS.includes(requested)) {
    $(`answer-${requested}`).checked = true;
    showStatements(requested);
  }
}
