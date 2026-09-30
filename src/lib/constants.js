// Bump POLICY_VERSION whenever what the user agrees to changes in substance. Existing
// authorisations stop being valid and the extension pauses until the user agrees again.
export const POLICY_VERSION = '1.0';

export const HOST_ORIGINS = ['http://*/*', 'https://*/*'];

export const LOG_LIMIT = 500;

// `generic` widens the scope of the authorisation, so it is opt-in (never pre-ticked).
export const DEFAULT_SETTINGS = { enabled: true, generic: false };

// Each statement is shown as its own unticked checkbox and stored verbatim in the receipt.
export const CONSENT_STATEMENTS = [
  {
    id: 'accept-all',
    text: 'I authorise Katla AutoConsent to consent to cookies on my behalf: when a website asks for my cookie consent, it accepts all cookies for me.',
  },
  {
    id: 'understand-effects',
    text: 'I understand this lets websites and their partners use cookies for analytics, personalisation and advertising, which can include tracking and profiling me across websites.',
  },
  {
    id: 'own-decision',
    text: 'I use this browser profile myself, and I am old enough to consent to online services where I live.',
  },
];
