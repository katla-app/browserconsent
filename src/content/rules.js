// Consent platform rules. Each rule targets the platform's first-layer banner only.
//
//   detect       the platform is on the page
//   banner       the platform is asking for a decision right now (must be visible); defaults to `accept`
//   accept       "accept all" controls, most specific first
//   api          the platform has a JavaScript API handler in lib/platforms.js; it is used first, clicking is the fallback
//   apiDecides   act as soon as the platform is present and let its API decide whether consent is still needed
//                (for banners that can't be seen reliably, e.g. in shadow DOM)
//   shadowHosts  elements whose (open or closed) shadow roots are searched as well
//   frame        'top' (default) or 'iframe' for platforms that render inside their own frame
//   url          iframe rules only: the frame URL must match
globalThis.KATLA_AUTOCONSENT_RULES = [
  {
    id: 'katla',
    name: 'Katla',
    detect: ['#katla-widget-root', '.katla-widget', 'aside.katla-banner'],
    banner: ['.katla-widget:not(.katla-hidden) .katla-consent-box', 'aside.katla-banner'],
    // In CCPA layouts the primary button is "Do Not Sell or Share", and the redesigned widget stacks it with
    // "Close", which also records a refusal. Only the side-by-side GDPR layout's primary button is ever clicked.
    accept: [
      '.katla-widget:not(.katla-hidden) .katla-consent-actions:not(.katla-actions-stack):has(.katla-btn-secondary, .katla-btn-equal, .katla-btn-reject-equal) .katla-btn-primary',
      'aside.katla-banner .katla-button-accept',
    ],
    api: true,
  },
  {
    id: 'onetrust',
    name: 'OneTrust',
    detect: ['#onetrust-consent-sdk', '#onetrust-banner-sdk', '.optanon-alert-box-wrapper'],
    banner: ['#onetrust-banner-sdk', '.optanon-alert-box-wrapper'],
    accept: ['#onetrust-accept-btn-handler', '.optanon-alert-box-wrapper .optanon-allow-all'],
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
    banner: ['#CybotCookiebotDialog'],
    api: true,
  },
  {
    id: 'usercentrics',
    name: 'Usercentrics',
    detect: ['#usercentrics-root', '#usercentrics-cmp-ui'],
    shadowHosts: ['#usercentrics-root', '#usercentrics-cmp-ui'],
    accept: ['[data-testid="uc-accept-all-button"]', 'button[data-action-type="accept"]'],
    api: true,
    apiDecides: true,
  },
  {
    id: 'didomi',
    name: 'Didomi',
    detect: ['#didomi-host'],
    banner: ['#didomi-notice', '.didomi-popup-notice'],
    accept: ['#didomi-notice-agree-button'],
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
  },
  {
    id: 'trustarc',
    name: 'TrustArc',
    detect: ['#truste-consent-track', '#truste-consent-content'],
    accept: ['#truste-consent-button'],
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
  },
  {
    id: 'google',
    name: 'Google',
    detect: ['#L2AGLb'],
    accept: ['#L2AGLb'],
  },
  {
    id: 'complianz',
    name: 'Complianz',
    detect: ['.cmplz-cookiebanner'],
    banner: ['.cmplz-cookiebanner.cmplz-show'],
    accept: ['.cmplz-cookiebanner .cmplz-accept'],
    api: true,
  },
  {
    id: 'cookieyes',
    name: 'CookieYes',
    detect: ['.cky-consent-container', '#cookie-law-info-bar'],
    banner: ['.cky-consent-container:not(.cky-hide)', '#cookie-law-info-bar'],
    accept: ['.cky-consent-container .cky-btn-accept', '#wt-cli-accept-all-btn', '#cookie_action_close_header'],
  },
  {
    id: 'osano',
    name: 'Osano',
    detect: ['.osano-cm-window'],
    banner: ['.osano-cm-dialog:not(.osano-cm-dialog--hidden)'],
    accept: ['.osano-cm-dialog .osano-cm-accept-all', '.osano-cm-dialog .osano-cm-accept'],
  },
  {
    id: 'klaro',
    name: 'Klaro',
    detect: ['.klaro'],
    banner: ['.klaro .cookie-notice:not(.cookie-notice-hidden)', '.klaro .cookie-modal'],
    accept: ['.klaro .cm-btn-accept-all', '.klaro .cookie-notice .cm-btn-success'],
    api: true,
  },
  {
    id: 'iubenda',
    name: 'iubenda',
    detect: ['#iubenda-cs-banner'],
    banner: ['#iubenda-cs-banner'],
    accept: ['#iubenda-cs-banner .iubenda-cs-accept-btn'],
    api: true,
  },
  {
    id: 'termly',
    name: 'Termly',
    detect: ['[data-tid="banner-accept"]'],
    accept: ['[data-tid="banner-accept"]'],
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
  },
  {
    id: 'cookiefirst',
    name: 'CookieFirst',
    detect: ['.cookiefirst-root'],
    accept: ['.cookiefirst-root [data-cookiefirst-action="accept"]'],
    api: true,
  },
  {
    id: 'consentmanager',
    name: 'consentmanager.net',
    detect: ['#cmpbox', '#cmpwrapper'],
    shadowHosts: ['#cmpwrapper'],
    banner: ['#cmpbox'],
    accept: ['#cmpbox .cmpboxbtnyes'],
    api: true,
  },
  {
    id: 'axeptio',
    name: 'Axeptio',
    detect: ['#axeptio_overlay', '.axeptio_mount'],
    shadowHosts: ['#axeptio_overlay', '.axeptio_mount'],
    accept: ['#axeptio_btn_acceptAll'],
  },
  {
    id: 'cookieinformation',
    name: 'Cookie Information',
    detect: ['#coiOverlay', '#cookie-information-template-wrapper'],
    banner: ['#coiOverlay'],
    accept: ['#coiOverlay .coi-banner__accept', '#cookie-information-template-wrapper .coi-banner__accept'],
    api: true,
  },
  {
    id: 'cookiehub',
    name: 'CookieHub',
    detect: ['.ch2-container'],
    banner: ['.ch2-dialog'],
    accept: ['.ch2-dialog .ch2-allow-all-btn'],
    api: true,
  },
  {
    id: 'civic',
    name: 'Civic Cookie Control',
    detect: ['#ccc'],
    banner: ['#ccc-notify'],
    accept: ['#ccc-notify-accept'],
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
    api: true,
  },
  {
    id: 'evidon',
    name: 'Crownpeak (Evidon)',
    detect: ['#_evidon_banner'],
    accept: ['#_evidon-accept-button', '#_evidon-banner-acceptbutton'],
  },
  {
    id: 'cookiescript',
    name: 'CookieScript',
    detect: ['#cookiescript_injected'],
    accept: ['#cookiescript_accept'],
    api: true,
  },
  {
    id: 'moove',
    name: 'GDPR Cookie Compliance (Moove)',
    detect: ['#moove_gdpr_cookie_info_bar'],
    banner: ['#moove_gdpr_cookie_info_bar:not(.moove-gdpr-info-bar-hidden)'],
    accept: ['#moove_gdpr_cookie_info_bar .moove-gdpr-infobar-allow-all'],
  },
  {
    id: 'cookienotice',
    name: 'Cookie Notice & Compliance',
    detect: ['#cookie-notice'],
    accept: ['#cookie-notice #cn-accept-cookie'],
  },
  {
    id: 'cookieconsent-v3',
    name: 'CookieConsent',
    detect: ['#cc-main'],
    banner: ['#cc-main .cm'],
    accept: ['#cc-main .cm .cm__btn[data-role="all"]'],
  },
  {
    id: 'osano-cookieconsent',
    name: 'Cookie Consent (Insites)',
    detect: ['.cc-window'],
    banner: ['.cc-window:not(.cc-invisible)'],
    // In "opt-in" layouts .cc-dismiss means decline, so it is only used for pure notices.
    accept: ['.cc-window:not(.cc-invisible) .cc-allow', '.cc-window.cc-type-info:not(.cc-invisible) .cc-dismiss'],
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    detect: ['#hs-eu-cookie-confirmation'],
    accept: ['#hs-eu-confirmation-button'],
  },
  {
    id: 'shopify',
    name: 'Shopify',
    detect: ['#shopify-pc__banner'],
    accept: ['#shopify-pc__banner__btn-accept'],
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
  },
  {
    id: 'meta',
    name: 'Meta (Facebook, Instagram)',
    detect: ['[data-cookiebanner="accept_button"]'],
    accept: ['[data-cookiebanner="accept_button"]'],
  },
];

// Fallback for banners no rule recognises. Only used when the user opted in to it.
globalThis.KATLA_AUTOCONSENT_GENERIC = (() => {
  const CONTAINERS = [
    '[id*="cookie" i]', '[class*="cookie" i]', '[id*="consent" i]', '[class*="consent" i]',
    '[id*="gdpr" i]', '[class*="gdpr" i]', '[aria-label*="cookie" i]', '[role="dialog"]',
    '[role="alertdialog"]', '[aria-modal="true"]', 'dialog[open]',
  ].join(',');
  const BUTTONS = 'button, [role="button"], input[type="button"], input[type="submit"], a';
  const COOKIE_WORDS = /cookie|kakor|samtycke|consent|gdpr|datenschutz|evästee|informasjonskapsl|galletas|biscotti|ciasteczk/i;

  // Exact labels only, grouped from strongest ("accept all") to weakest ("ok").
  const LABELS = [
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
  const rank = new Map(LABELS.flatMap((group, i) => group.map((label) => [label, i])));

  const normalise = (text) =>
    text.toLowerCase().replace(/[\s ]+/g, ' ').replace(/[.!?:"“”«»()✓✔]/g, '').replace(/’/g, "'").trim();

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

  function find(isVisible) {
    const candidates = [...document.querySelectorAll(CONTAINERS)].slice(0, 80);
    for (const container of candidates) {
      if (!isVisible(container)) continue;
      const text = container.textContent ?? '';
      if (text.length < 20 || text.length > 5000 || !COOKIE_WORDS.test(text)) continue;
      if (container.querySelector('input[type="password"], input[type="email"], input[type="search"]')) continue;
      if (!isOverlay(container)) continue;
      let best = null;
      for (const button of container.querySelectorAll(BUTTONS)) {
        const r = rank.get(labelOf(button));
        if (r === undefined || isNavigationLink(button) || !isVisible(button)) continue;
        if (!best || r < best.rank) best = { button, rank: r };
      }
      if (best) return { container, button: best.button };
    }
    return null;
  }

  return { find };
})();
