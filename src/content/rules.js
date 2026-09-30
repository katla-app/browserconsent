// Consent platform rules. Each rule targets the platform's first-layer banner only.
//
//   detect       the platform is on the page
//   banner       the platform is asking for a decision right now (must be visible); defaults to `accept`
//   accept       "accept all" controls, most specific first
//   reject       first-layer "reject all" controls, most specific first. Without them (or when none is
//                visible) a button labelled "Reject all" or similar inside the banner is used.
//   api          the platform has a JavaScript API handler in lib/platforms.js; it is used first, clicking is the fallback
//   apiDecides   act as soon as the platform is present and let its API decide whether consent is still needed
//                (for banners that can't be seen reliably, e.g. in shadow DOM)
//   shadowHosts  elements whose (open or closed) shadow roots are searched as well
//   frameHosts   same-origin iframes (e.g. srcdoc) whose documents are searched as well
//   cookie       the platform's consent cookie, set once a decision is on file: { name, decision(get) }. `decision`
//                reads cookies (URI-decoded) through get(name) and returns 'accepted', 'rejected', 'custom' or
//                'answered'; without it the cookie only says the banner was answered. Used by the popup.
//   headless     installs whose banner can't be recognised, e.g. built with the platform's SDK: while one of these
//                is on the page and the consent cookie isn't set, the platform is asking for a decision
//   frame        'top' (default) or 'iframe' for platforms that render inside their own frame
//   url          iframe rules only: the frame URL must match
// 'accepted' when every optional category is allowed, 'rejected' when none is, 'custom' otherwise.
function consentChoice(allowed) {
  if (!allowed.length) return 'answered';
  if (allowed.every(Boolean)) return 'accepted';
  return allowed.some(Boolean) ? 'custom' : 'rejected';
}

globalThis.KATLA_BROWSERCONSENT_RULES = [
  {
    id: 'katla',
    name: 'Katla',
    detect: ['#katla-widget-root', '.katla-widget', 'aside.katla-banner', 'script#katla-guard-script'],
    // Sites built with Katla's SDK render their own banner, with no markup to go by. The SDK's guard script
    // is always there, and the consent cookie tells whether Katla still wants an answer.
    headless: ['script#katla-guard-script'],
    // "value|consentId|timestamp". rejectAll() stores "functional" (older versions "rejected:<time>"), and a
    // CCPA opt-out "opted_out".
    cookie: {
      name: '_katla_consent',
      decision(get) {
        const value = get('_katla_consent').split('|')[0];
        if (value === 'all') return 'accepted';
        if (value === 'functional' || value === 'opted_out' || value.startsWith('rejected:')) return 'rejected';
        return value ? 'custom' : 'answered';
      },
    },
    // The current widget has minified class names (only .katla-widget is stable). Its banner is a box with
    // the answer buttons; once answered, only the "Cookie settings" button is left in the widget.
    banner: [
      '.katla-widget:not(.katla-hidden) .katla-consent-box',
      '.katla-widget:not(.katla-hidden) > div:has(button ~ button)',
      'aside.katla-banner',
    ],
    // In CCPA layouts the primary button is "Do Not Sell or Share", and the redesigned widget stacks it with
    // "Close", which also records a refusal. Only the side-by-side GDPR layout's primary button is ever clicked to accept.
    accept: [
      '.katla-widget:not(.katla-hidden) .katla-consent-actions:not(.katla-actions-stack):has(.katla-btn-secondary, .katla-btn-equal, .katla-btn-reject-equal) .katla-btn-primary',
      'aside.katla-banner .katla-button-accept',
    ],
    reject: [
      '.katla-widget:not(.katla-hidden) .katla-consent-actions:not(.katla-actions-stack) :is(.katla-btn-secondary, .katla-btn-equal, .katla-btn-reject-equal)',
      // CCPA: "Do Not Sell or Share" is the refusal.
      '.katla-widget:not(.katla-hidden) .katla-actions-stack .katla-btn-primary',
      'aside.katla-banner .katla-button-reject',
    ],
    api: true,
  },
  {
    id: 'onetrust',
    name: 'OneTrust',
    detect: ['#onetrust-consent-sdk', '#onetrust-banner-sdk', '.optanon-alert-box-wrapper'],
    banner: ['#onetrust-banner-sdk', '.optanon-alert-box-wrapper'],
    accept: ['#onetrust-accept-btn-handler', '.optanon-alert-box-wrapper .optanon-allow-all'],
    reject: ['#onetrust-reject-all-handler'],
    // OptanonConsent holds "groups=C0001:1,C0002:0,…"; C0001 is strictly necessary.
    cookie: {
      name: 'OptanonAlertBoxClosed',
      decision(get) {
        const groups = /(?:^|&)groups=([^&]*)/.exec(get('OptanonConsent') ?? '')?.[1] ?? '';
        const optional = groups.split(',').filter((group) => group.includes(':') && !group.startsWith('C0001:'));
        return consentChoice(optional.map((group) => group.endsWith(':1')));
      },
    },
    api: true,
  },
  {
    id: 'cookiebot',
    name: 'Cookiebot',
    detect: ['#CybotCookiebotDialog'],
    accept: [
      '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
      '#CybotCookiebotDialogBodyButtonAccept',
      '#CybotCookiebotDialogBodyLevelButtonAccept',
    ],
    reject: ['#CybotCookiebotDialogBodyButtonDecline'],
    banner: ['#CybotCookiebotDialog'],
    // "{stamp:'…',necessary:true,preferences:false,statistics:false,marketing:false,…}", or "-1" where no
    // consent is needed.
    cookie: {
      name: 'CookieConsent',
      decision(get) {
        const value = get('CookieConsent');
        if (!value.includes('necessary:true')) return null;
        return consentChoice(['preferences', 'statistics', 'marketing'].map((c) => value.includes(`${c}:true`)));
      },
    },
    api: true,
  },
  {
    id: 'usercentrics',
    name: 'Usercentrics',
    detect: ['#usercentrics-root', '#usercentrics-cmp-ui'],
    shadowHosts: ['#usercentrics-root', '#usercentrics-cmp-ui'],
    accept: ['[data-testid="uc-accept-all-button"]', 'button[data-action-type="accept"]'],
    reject: ['[data-testid="uc-deny-all-button"]', 'button[data-action-type="deny"]'],
    api: true,
    apiDecides: true,
  },
  {
    id: 'didomi',
    name: 'Didomi',
    detect: ['#didomi-host'],
    banner: ['#didomi-notice', '.didomi-popup-notice'],
    accept: ['#didomi-notice-agree-button'],
    reject: ['#didomi-notice-disagree-button', '#didomi-notice .didomi-continue-without-agreeing'],
    api: true,
  },
  {
    id: 'inmobi',
    name: 'InMobi Choice (Quantcast)',
    detect: ['#qc-cmp2-container', '.qc-cmp2-container'],
    banner: ['.qc-cmp2-summary-buttons'],
    accept: ['.qc-cmp2-summary-buttons button[mode="primary"]'],
  },
  {
    id: 'sourcepoint',
    name: 'Sourcepoint',
    frame: 'iframe',
    detect: ['.message-container [class*="sp_choice_type"]', '.message [class*="sp_choice_type"]'],
    // Type 11 is "Accept all" in the first-layer message. The privacy manager (opened by the user) is left alone.
    accept: ['button.sp_choice_type_11'],
    // Type 13 is "Reject all".
    reject: ['button.sp_choice_type_13'],
  },
  {
    id: 'trustarc',
    name: 'TrustArc',
    detect: ['#truste-consent-track', '#truste-consent-content'],
    accept: ['#truste-consent-button'],
    reject: ['#truste-consent-required'],
  },
  {
    id: 'trustarc-frame',
    name: 'TrustArc',
    frame: 'iframe',
    url: /^https:\/\/consent-pref\.trustarc\.com\//,
    detect: ['.pdynamicbutton'],
    accept: ['.pdynamicbutton .call'],
  },
  {
    id: 'google-funding-choices',
    name: 'Google Funding Choices',
    detect: ['.fc-consent-root'],
    banner: ['.fc-consent-root .fc-dialog'],
    accept: ['.fc-consent-root .fc-cta-consent'],
    reject: ['.fc-consent-root .fc-cta-do-not-consent'],
  },
  {
    id: 'google',
    name: 'Google',
    detect: ['#L2AGLb'],
    accept: ['#L2AGLb'],
    reject: ['#W0wltc'],
  },
  {
    id: 'complianz',
    name: 'Complianz',
    detect: ['.cmplz-cookiebanner'],
    banner: ['.cmplz-cookiebanner.cmplz-show'],
    accept: ['.cmplz-cookiebanner .cmplz-accept'],
    reject: ['.cmplz-cookiebanner .cmplz-deny'],
    // "dismissed" once answered, then "allow" or "deny" per category.
    cookie: {
      name: 'cmplz_banner-status',
      decision(get) {
        if (get('cmplz_banner-status') !== 'dismissed') return null;
        return consentChoice(['preferences', 'statistics', 'marketing'].map((c) => get(`cmplz_${c}`) === 'allow'));
      },
    },
    api: true,
  },
  {
    id: 'cookieyes',
    name: 'CookieYes',
    detect: ['.cky-consent-container', '#cookie-law-info-bar'],
    banner: ['.cky-consent-container:not(.cky-hide)', '#cookie-law-info-bar'],
    accept: ['.cky-consent-container .cky-btn-accept', '#wt-cli-accept-all-btn', '#cookie_action_close_header'],
    reject: ['.cky-consent-container .cky-btn-reject', '#wt-cli-reject-btn', '#cookie_action_close_header_reject'],
    // "consentid:…,consent:no,action:yes,necessary:yes,functional:no,…"; set before any answer with action:no.
    cookie: {
      name: 'cookieyes-consent',
      decision(get) {
        const fields = Object.fromEntries(get('cookieyes-consent').split(',').map((field) => field.split(':')));
        if (fields.action !== 'yes') return null;
        return consentChoice(['functional', 'analytics', 'performance', 'advertisement'].map((c) => fields[c] === 'yes'));
      },
    },
  },
  {
    id: 'osano',
    name: 'Osano',
    detect: ['.osano-cm-window'],
    banner: ['.osano-cm-dialog:not(.osano-cm-dialog--hidden)'],
    accept: ['.osano-cm-dialog .osano-cm-accept-all', '.osano-cm-dialog .osano-cm-accept'],
    reject: ['.osano-cm-dialog .osano-cm-denyAll'],
  },
  {
    id: 'klaro',
    name: 'Klaro',
    detect: ['.klaro'],
    banner: ['.klaro .cookie-notice:not(.cookie-notice-hidden)', '.klaro .cookie-modal'],
    accept: ['.klaro .cm-btn-accept-all', '.klaro .cookie-notice .cm-btn-success'],
    reject: ['.klaro .cookie-notice .cn-decline', '.klaro .cm-btn-decline'],
    api: true,
  },
  {
    id: 'iubenda',
    name: 'iubenda',
    detect: ['#iubenda-cs-banner'],
    banner: ['#iubenda-cs-banner'],
    accept: ['#iubenda-cs-banner .iubenda-cs-accept-btn'],
    reject: ['#iubenda-cs-banner .iubenda-cs-reject-btn'],
    api: true,
  },
  {
    id: 'termly',
    name: 'Termly',
    detect: ['[data-tid="banner-accept"]'],
    accept: ['[data-tid="banner-accept"]'],
    reject: ['[data-tid="banner-decline"]'],
  },
  {
    id: 'borlabs',
    name: 'Borlabs Cookie',
    detect: ['#BorlabsCookieBox', '.brlbs-cmpnt-container'],
    banner: ['#BorlabsCookieBox ._brlbs-bar', '#BorlabsCookieBox ._brlbs-box', '.brlbs-cmpnt-dialog'],
    accept: [
      '#BorlabsCookieBox a[data-cookie-accept-all]',
      '#BorlabsCookieBox ._brlbs-btn-accept-all',
      '.brlbs-cmpnt-dialog .brlbs-btn-accept-all',
    ],
    reject: ['#BorlabsCookieBox a[data-cookie-refuse]', '.brlbs-cmpnt-dialog .brlbs-btn-accept-only-essential'],
  },
  {
    id: 'cookiefirst',
    name: 'CookieFirst',
    detect: ['.cookiefirst-root'],
    accept: ['.cookiefirst-root [data-cookiefirst-action="accept"]'],
    reject: ['.cookiefirst-root [data-cookiefirst-action="reject"]'],
    // {"necessary":true,"performance":false,"functional":false,"advertising":false,…}
    cookie: {
      name: 'cookiefirst-consent',
      decision(get) {
        const consent = JSON.parse(get('cookiefirst-consent'));
        return consentChoice(['performance', 'functional', 'advertising'].map((c) => consent[c] === true));
      },
    },
    api: true,
  },
  {
    id: 'consentmanager',
    name: 'consentmanager.net',
    detect: ['#cmpbox', '#cmpwrapper'],
    shadowHosts: ['#cmpwrapper'],
    banner: ['#cmpbox'],
    accept: ['#cmpbox .cmpboxbtnyes'],
    reject: ['#cmpbox .cmpboxbtnno'],
    api: true,
  },
  {
    id: 'axeptio',
    name: 'Axeptio',
    detect: ['#axeptio_overlay', '.axeptio_mount'],
    shadowHosts: ['#axeptio_overlay', '.axeptio_mount'],
    accept: ['#axeptio_btn_acceptAll'],
    reject: ['#axeptio_btn_dismiss'],
  },
  {
    id: 'cookieinformation',
    name: 'Cookie Information',
    detect: ['#coiOverlay', '#cookie-information-template-wrapper'],
    banner: ['#coiOverlay'],
    accept: ['#coiOverlay .coi-banner__accept', '#cookie-information-template-wrapper .coi-banner__accept'],
    // {"consents_approved":["cookie_cat_necessary",…],"consents_denied":[…],…}
    cookie: {
      name: 'CookieInformationConsent',
      decision(get) {
        const { consents_approved: approved = [], consents_denied: denied = [] } = JSON.parse(get('CookieInformationConsent'));
        const optional = (list) => list.filter((category) => category !== 'cookie_cat_necessary');
        return consentChoice([...optional(approved).map(() => true), ...optional(denied).map(() => false)]);
      },
    },
    api: true,
  },
  {
    id: 'cookiehub',
    name: 'CookieHub',
    detect: ['.ch2-container'],
    banner: ['.ch2-dialog'],
    accept: ['.ch2-dialog .ch2-allow-all-btn'],
    reject: ['.ch2-dialog .ch2-deny-all-btn'],
    api: true,
  },
  {
    id: 'civic',
    name: 'Civic Cookie Control',
    detect: ['#ccc'],
    banner: ['#ccc-notify'],
    accept: ['#ccc-notify-accept'],
    reject: ['#ccc-notify-reject'],
  },
  {
    id: 'tealium',
    name: 'Tealium',
    detect: ['#__tealiumGDPRecModal'],
    accept: ['#__tealiumGDPRecModal #consent_prompt_submit'],
    api: true,
  },
  {
    id: 'piwikpro',
    name: 'Piwik PRO',
    detect: ['#ppms_cm_popup_overlay', '#ppms_cm_consent_popup'],
    accept: ['#ppms_cm_agree-to-all'],
    reject: ['#ppms_cm_reject-all'],
    api: true,
  },
  {
    id: 'evidon',
    name: 'Crownpeak (Evidon)',
    detect: ['#_evidon_banner'],
    accept: ['#_evidon-accept-button', '#_evidon-banner-acceptbutton'],
    reject: ['#_evidon-decline-button'],
  },
  {
    id: 'cookiescript',
    name: 'CookieScript',
    detect: ['#cookiescript_injected'],
    accept: ['#cookiescript_accept'],
    reject: ['#cookiescript_reject'],
    api: true,
  },
  {
    id: 'moove',
    name: 'GDPR Cookie Compliance (Moove)',
    detect: ['#moove_gdpr_cookie_info_bar'],
    banner: ['#moove_gdpr_cookie_info_bar:not(.moove-gdpr-info-bar-hidden)'],
    accept: ['#moove_gdpr_cookie_info_bar .moove-gdpr-infobar-allow-all'],
    reject: ['#moove_gdpr_cookie_info_bar .moove-gdpr-infobar-reject-btn'],
  },
  {
    id: 'cookienotice',
    name: 'Cookie Notice & Compliance',
    detect: ['#cookie-notice'],
    accept: ['#cookie-notice #cn-accept-cookie'],
    reject: ['#cookie-notice #cn-refuse-cookie'],
  },
  {
    // The banner is an iframe whose content comes from srcdoc, so the content script doesn't run in it; its
    // buttons are reached through the iframe's document. The <dialog> around it has no size of its own.
    id: 'secureprivacy',
    name: 'Secure Privacy',
    detect: ['dialog#main-cookie-banner', 'iframe#ifrmCookieBanner'],
    banner: ['dialog#main-cookie-banner[open] iframe#ifrmCookieBanner'],
    frameHosts: ['dialog#main-cookie-banner iframe#ifrmCookieBanner'],
    accept: ['#sp-accept'],
    reject: ['#sp-decline'],
    api: true,
  },
  {
    // The second button says "Only necessary" until categories are ticked, then "Custom selection", so
    // rejecting goes by its label. Hidden from crawlers, including headless Chrome.
    id: 'cookietractor',
    name: 'Cookie Tractor',
    detect: ['#CookieConsent > dialog.cookie-popup'],
    banner: ['#CookieConsent > dialog.cookie-popup[open]'],
    accept: ['#CookieConsent > dialog.cookie-popup[open] #cc-b-acceptall'],
    // {"consents":["necessary","undefined"],"availableConsents":["undefined","necessary","statistical"],…}
    cookie: {
      name: '_cc_cookieConsent',
      decision(get) {
        const { consents = [], availableConsents = [] } = JSON.parse(get('_cc_cookieConsent'));
        const optional = availableConsents.filter((c) => c !== 'necessary' && c !== 'undefined');
        return consentChoice(optional.map((c) => consents.includes(c)));
      },
    },
  },
  {
    // orestbida's vanilla-cookieconsent v2, also built into Quickbutik shops. v2.3 names its buttons
    // #cm_primary_btn/#cm_secondary_btn, later releases #c-p-bn/#c-s-bn. Their roles are only in the site's
    // config: the primary button is "accept all" unless configured otherwise, and the secondary one either
    // accepts only necessary cookies or opens the settings, so rejecting goes by its label.
    id: 'cookieconsent-v2',
    name: 'CookieConsent',
    detect: ['#cc_div #cm'],
    banner: ['.show--consent #cc_div #cm'],
    accept: ['.show--consent #cc_div #cm :is(#c-p-bn, #cm_primary_btn)'],
    // Which categories are optional is only in the site's config, so the cookie only says it was answered.
    cookie: { name: 'cc_cookie' },
  },
  {
    id: 'cookieconsent-v3',
    name: 'CookieConsent',
    detect: ['#cc-main'],
    banner: ['#cc-main .cm'],
    accept: ['#cc-main .cm .cm__btn[data-role="all"]'],
    reject: ['#cc-main .cm .cm__btn[data-role="necessary"]'],
    cookie: { name: 'cc_cookie' },
  },
  {
    id: 'osano-cookieconsent',
    name: 'Cookie Consent (Insites)',
    detect: ['.cc-window'],
    banner: ['.cc-window:not(.cc-invisible)'],
    // In "opt-in" layouts .cc-dismiss means decline, so it is only used for pure notices.
    accept: ['.cc-window:not(.cc-invisible) .cc-allow', '.cc-window.cc-type-info:not(.cc-invisible) .cc-dismiss'],
    reject: ['.cc-window:not(.cc-invisible) .cc-deny'],
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    detect: ['#hs-eu-cookie-confirmation'],
    accept: ['#hs-eu-confirmation-button'],
    reject: ['#hs-eu-decline-button'],
  },
  {
    id: 'shopify',
    name: 'Shopify',
    detect: ['#shopify-pc__banner'],
    accept: ['#shopify-pc__banner__btn-accept'],
    reject: ['#shopify-pc__banner__btn-decline'],
    api: true,
  },
  {
    id: 'wix',
    name: 'Wix',
    detect: ['[data-hook="consent-banner-root"]'],
    accept: ['[data-hook="consent-banner-root"] [data-hook="consent-banner-apply-button"]'],
    api: true,
  },
  {
    id: 'ezoic',
    name: 'Ezoic',
    detect: ['#ez-cookie-dialog'],
    accept: ['#ez-accept-all'],
  },
  {
    id: 'amazon',
    name: 'Amazon',
    detect: ['form#cos-banner', '#sp-cc'],
    accept: ['#sp-cc-accept'],
    reject: ['#sp-cc-rejectall-link'],
  },
  {
    id: 'meta',
    name: 'Meta (Facebook, Instagram)',
    detect: ['[data-cookiebanner="accept_button"]'],
    accept: ['[data-cookiebanner="accept_button"]'],
    reject: ['[data-cookiebanner="accept_only_essential_button"]'],
  },
];

// Fallback for banners no rule recognises, which is only used when the user opted in to it. Also finds
// "Reject all" in known banners without reject selectors, and tells which answer a clicked button gave.
globalThis.KATLA_BROWSERCONSENT_GENERIC = (() => {
  const CONTAINERS = [
    '[id*="cookie" i]', '[class*="cookie" i]', '[id*="consent" i]', '[class*="consent" i]',
    '[id*="gdpr" i]', '[class*="gdpr" i]', '[aria-label*="cookie" i]', '[role="dialog"]',
    '[role="alertdialog"]', '[aria-modal="true"]', 'dialog[open]',
  ].join(',');
  const BUTTONS = 'button, [role="button"], input[type="button"], input[type="submit"], a';
  const COOKIE_WORDS = /cookie|kakor|samtycke|consent|gdpr|datenschutz|evästee|informasjonskapsl|galletas|biscotti|ciasteczk/i;

  // Exact labels only, grouped from strongest ("accept all") to weakest ("ok").
  const ACCEPT_LABELS = [
    [
      'accept all', 'accept all cookies', 'allow all', 'allow all cookies', 'agree to all', 'accept all and continue',
      'acceptera alla', 'acceptera alla cookies', 'acceptera alla kakor', 'godkänn alla', 'godkänn alla cookies',
      'godkänn alla kakor', 'tillåt alla', 'tillåt alla cookies', 'tillåt alla kakor',
      'alle akzeptieren', 'alle cookies akzeptieren', 'alles akzeptieren', 'allen zustimmen', 'alle zulassen',
      'tout accepter', 'accepter tout', 'tout autoriser', 'accepter tous les cookies',
      'aceptar todo', 'aceptar todas', 'aceptar todas las cookies', 'permitir todas',
      'accetta tutto', 'accetta tutti', 'accetta tutti i cookie',
      'alles accepteren', 'alle cookies accepteren', 'alles toestaan',
      'godta alle', 'aksepter alle', 'tillat alle', 'accepter alle', 'acceptér alle', 'tillad alle',
      'hyväksy kaikki', 'salli kaikki', 'zaakceptuj wszystkie', 'akceptuj wszystkie', 'aceitar todos', 'aceitar tudo',
    ],
    [
      'accept', 'accept cookies', 'i accept', 'agree', 'i agree', 'accept and close', 'accept & close', 'agree and close',
      'agree & close', 'allow cookies', 'accept and continue', 'agree and continue', 'agree and proceed',
      'acceptera', 'godkänn', 'jag godkänner', 'godkänn cookies', 'acceptera cookies',
      'akzeptieren', 'zustimmen', 'einverstanden', 'zustimmen und weiter', 'akzeptieren und schließen',
      'accepter', "j'accepte", 'accepter et fermer', 'aceptar', 'acepto', 'aceptar cookies', 'accetta', 'accetto',
      'accepteren', 'akkoord', 'godta', 'aksepter', 'accepter', 'jeg accepterer', 'hyväksy', 'akceptuję', 'zgadzam się',
      'aceitar', 'concordo',
    ],
    ['ok', 'okay', 'got it', 'jag förstår', 'verstanden', "j'ai compris", 'entendido', 'ho capito', 'begrepen'],
  ];
  const REJECT_LABELS = [
    [
      'reject all', 'reject all cookies', 'decline all', 'decline all cookies', 'deny all', 'refuse all',
      'necessary cookies only', 'only necessary', 'only necessary cookies', 'use necessary cookies only', 'essential cookies only',
      'only essential cookies', 'accept only essential cookies', 'accept necessary cookies only', 'required only',
      'required cookies only', 'continue without accepting', 'do not consent',
      'avvisa alla', 'neka alla', 'avböj alla', 'endast nödvändiga', 'endast nödvändiga cookies', 'endast nödvändiga kakor',
      'tillåt endast nödvändiga', 'tillåt endast nödvändiga cookies', 'godkänn endast nödvändiga',
      'alle ablehnen', 'alles ablehnen', 'nur notwendige', 'nur notwendige cookies', 'nur erforderliche cookies',
      'nur essenzielle cookies', 'tout refuser', 'refuser tout', 'refuser tous les cookies', 'continuer sans accepter',
      'rechazar todo', 'rechazar todas', 'rechazar todas las cookies', 'solo necesarias', 'rifiuta tutto', 'rifiuta tutti',
      'solo necessari', 'alles weigeren', 'alles afwijzen', 'alleen noodzakelijke', 'alleen noodzakelijke cookies',
      'avvis alle', 'avslå alle', 'afvis alle', 'kun nødvendige', 'bare nødvendige', 'hylkää kaikki', 'vain välttämättömät',
      'odrzuć wszystkie', 'rejeitar todos', 'rejeitar tudo', 'recusar todos',
    ],
    [
      'reject', 'decline', 'deny', 'refuse', 'disagree', 'i disagree', 'no thanks', 'reject cookies', 'decline cookies',
      'avvisa', 'neka', 'avböj', 'ablehnen', 'refuser', 'rechazar', 'rifiuta', 'weigeren', 'afwijzen', 'avvis', 'avslå',
      'afvis', 'hylkää', 'odrzuć', 'rejeitar', 'recusar',
    ],
  ];
  const ranks = (groups) => new Map(groups.flatMap((group, i) => group.map((label) => [label, i])));
  const RANKS = { accept: ranks(ACCEPT_LABELS), reject: ranks(REJECT_LABELS) };

  const normalise = (text) =>
    text.toLowerCase().replace(/[\s ]+/g, ' ').replace(/[.!?:"“”«»()✓✔]/g, '').replace(/’/g, "'").trim();

  function labelOf(el) {
    return normalise(el instanceof HTMLInputElement ? el.value : el.getAttribute('aria-label') || el.textContent || '');
  }

  function isOverlay(el) {
    if (el.matches('[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog')) return true;
    for (let node = el, depth = 0; node && depth < 6; node = node.parentElement, depth++) {
      const { position } = getComputedStyle(node);
      if (position === 'fixed' || position === 'sticky') return true;
    }
    return false;
  }

  function isNavigationLink(el) {
    if (el.tagName !== 'A') return false;
    const href = el.getAttribute('href');
    return Boolean(href) && !href.startsWith('#') && !href.toLowerCase().startsWith('javascript:');
  }

  const isCookieText = (text) => text.length >= 20 && text.length <= 5000 && COOKIE_WORDS.test(text);

  // The best-labelled visible button for an answer ('accept' or 'reject') inside a container, or null.
  function buttonIn(container, answer, isVisible) {
    let best = null;
    for (const button of container.querySelectorAll(BUTTONS)) {
      const r = RANKS[answer].get(labelOf(button));
      if (r === undefined || isNavigationLink(button) || !isVisible(button)) continue;
      if (!best || r < best.rank) best = { button, rank: r };
    }
    return best?.button ?? null;
  }

  // A visible cookie notice, as { container, accept, reject } with the button for each answer (or null).
  function find(isVisible) {
    const candidates = [...document.querySelectorAll(CONTAINERS)].slice(0, 80);
    for (const container of candidates) {
      if (!isVisible(container) || !isCookieText(container.textContent ?? '')) continue;
      if (container.querySelector('input[type="password"], input[type="email"], input[type="search"]')) continue;
      if (!isOverlay(container)) continue;
      const accept = buttonIn(container, 'accept', isVisible);
      const reject = buttonIn(container, 'reject', isVisible);
      if (accept || reject) return { container, accept, reject };
    }
    return null;
  }

  // Which answer a clicked element gave in a cookie notice: 'accept', 'reject' or null.
  function answerOf(target) {
    const button = target.closest(BUTTONS);
    const container = button?.closest(CONTAINERS);
    if (!container || !isCookieText(container.textContent ?? '')) return null;
    const label = labelOf(button);
    if (RANKS.reject.has(label)) return 'reject';
    // "OK" on a notice acknowledges it rather than accepting anything.
    return RANKS.accept.get(label) < 2 ? 'accept' : null;
  }

  return { find, buttonIn, answerOf };
})();
