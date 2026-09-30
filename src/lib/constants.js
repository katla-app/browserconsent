// Bump POLICY_VERSION whenever what the user agrees to changes in substance. Existing
// authorisations stop being valid and the extension pauses until the user agrees again.
export const POLICY_VERSION = '1.1';

export const HOST_ORIGINS = ['http://*/*', 'https://*/*'];

export const LOG_LIMIT = 500;

// Sites whose last cookie decision is remembered for tracker warnings.
export const SITE_DECISION_LIMIT = 2000;

// How BrowserConsent answers cookie banners: "Reject all" or "Accept all".
export const ANSWERS = ['reject', 'accept'];

// `enabled` is automatic consent on or off, and `answer` is set by the user's choice during onboarding.
// `generic` widens the scope of the authorisation, so it is opt-in. Tracker warnings only observe and
// nothing leaves the device, so they start on. Blocking trackers changes how websites behave, so it's
// opt-in. `katlaDebug` is for developers.
export const DEFAULT_SETTINGS = {
  enabled: true,
  answer: 'reject',
  generic: false,
  warnBeforeConsent: true,
  warnAfterReject: true,
  blockTrackers: false,
  katlaDebug: false,
};

// The statement that authorises "Accept all". BrowserConsent only ever accepts when the receipt holds it.
export const ACCEPT_STATEMENT = 'accept-all';

// Each statement is shown as its own unticked checkbox and stored verbatim in the receipt. Which
// statements are shown depends on how the user wants cookie banners answered.
export const CONSENT_STATEMENTS = {
  accept: [
    {
      id: ACCEPT_STATEMENT,
      text: 'I authorise Katla BrowserConsent to consent to cookies on my behalf: when a website asks for my cookie consent, it accepts all cookies for me.',
    },
    {
      id: 'understand-effects',
      text: 'I understand this lets websites and their partners use cookies for analytics, personalisation and advertising, which can include tracking and profiling me across websites.',
    },
    {
      id: 'own-decision',
      text: 'I use this browser profile myself, and I am old enough to consent to online services where I live.',
    },
  ],
  reject: [
    {
      id: 'reject-all',
      text: 'I authorise Katla BrowserConsent to answer cookie banners on my behalf: when a website asks for my cookie consent, it rejects all cookies that aren’t strictly necessary.',
    },
    {
      id: 'understand-reject',
      text: 'I understand some websites may then switch off features that depend on those cookies, such as embedded videos, and that I can still accept on a website myself.',
    },
  ],
};
