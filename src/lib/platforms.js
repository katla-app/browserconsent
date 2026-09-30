// Consent platform JavaScript APIs. `platformAction` is injected into the page's own JavaScript world
// by the background (scripting.executeScript), so it must be fully self-contained: no imports and no
// references to anything outside the function body.
//
// Verified against the live platform scripts (September 2026): Katla, OneTrust, Cookiebot, Didomi,
// Cookie Information, CookieFirst, iubenda, CookieHub, Complianz, Klaro, Shopify, Secure Privacy.
// From vendor documentation only: Usercentrics, consentmanager.net, Tealium, Piwik PRO, Wix, CookieScript.
//
//   platformAction('accept', id)  -> { status: 'accepted' | 'already' | 'unavailable' | 'error' }
//   platformAction('reject', id)  -> { status: 'rejected' | 'already' | 'unavailable' | 'error' }
//   platformAction('withdraw')    -> { withdrawn: [ids of platforms that recorded a refusal] }
export async function platformAction(action, cmp) {
  const fn = (value) => typeof value === 'function';
  const withTimeout = (promise, fallback, ms = 3000) =>
    Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(fallback), ms))]);

  // Piwik PRO's API takes success and error callbacks. Resolves { value }, or undefined on timeout.
  const ppms = (api, method, ...args) =>
    withTimeout(new Promise((resolve, reject) => api(method, ...args, (value) => resolve({ value }), reject)));

  //   api()          the platform's API once it has loaded, otherwise undefined
  //   decided(api)   true when a choice is already on file, which is then left alone (optional)
  //   accept(api)    records "accept all"; refuse(api) records "reject all". Returning false means it didn't work.
  //   withdraw(api)  records a refusal over an existing choice (optional, refuse() otherwise)
  const platforms = {
    katla: {
      api: () => (fn(window.KatlaConsent?.acceptAll) ? window.KatlaConsent : undefined),
      decided: (k) => fn(k.hasConsent) && k.hasConsent(),
      accept: (k) => k.acceptAll(),
      // Under CCPA the refusal is "Do Not Sell or Share".
      refuse: (k) => (fn(k.getRegulation) && k.getRegulation() === 'ccpa' && fn(k.optOutOfSale) ? k.optOutOfSale() : k.rejectAll()),
      withdraw: (k) => k.withdrawConsent(),
    },
    onetrust: {
      api: () => (fn(window.OneTrust?.AllowAll) ? window.OneTrust : fn(window.Optanon?.AllowAll) ? window.Optanon : undefined),
      decided: (ot) => fn(ot.IsAlertBoxClosed) && ot.IsAlertBoxClosed(),
      accept: (ot) => ot.AllowAll(),
      refuse: (ot) => ot.RejectAll(),
    },
    cookiebot: {
      api: () => (fn(window.Cookiebot?.submitCustomConsent) ? window.Cookiebot : undefined),
      decided: (cb) => cb.hasResponse === true,
      // Preferences, statistics, marketing.
      accept: (cb) => cb.submitCustomConsent(true, true, true),
      refuse: (cb) => cb.submitCustomConsent(false, false, false),
      withdraw: (cb) => cb.withdraw(),
    },
    didomi: {
      api: () => (fn(window.Didomi?.setUserAgreeToAll) ? window.Didomi : undefined),
      decided: (d) => fn(d.shouldConsentBeCollected) && !d.shouldConsentBeCollected(),
      accept: (d) => d.setUserAgreeToAll(),
      refuse: (d) => d.setUserDisagreeToAll(),
    },
    usercentrics: {
      // v3 (`__ucCmp`) first, then v2 (`UC_UI`), which can't be used until it has initialised.
      api() {
        if (fn(window.__ucCmp?.acceptAllConsents)) return { v3: window.__ucCmp };
        const v2 = window.UC_UI;
        if (fn(v2?.acceptAllConsents) && (!fn(v2.isInitialized) || v2.isInitialized())) return { v2 };
      },
      async decided({ v3, v2 }) {
        if (v3) return fn(v3.isConsentRequired) && !(await v3.isConsentRequired());
        return fn(v2.isConsentRequired) && !v2.isConsentRequired();
      },
      async set({ v3, v2 }, allow, close) {
        if (v3) {
          await (allow ? v3.acceptAllConsents() : v3.denyAllConsents());
          if (fn(v3.saveConsents)) await v3.saveConsents();
          if (close && fn(v3.closeCmp)) await v3.closeCmp();
        } else {
          await (allow ? v2.acceptAllConsents() : v2.denyAllConsents());
          if (close && fn(v2.closeCMP)) await v2.closeCMP();
        }
      },
      accept(api) {
        return this.set(api, true, true);
      },
      refuse(api) {
        return this.set(api, false, true);
      },
      withdraw(api) {
        return this.set(api, false, false);
      },
    },
    klaro: {
      api() {
        const m = fn(window.klaro?.getManager) ? window.klaro.getManager() : null;
        return fn(m?.changeAll) && fn(m.saveAndApplyConsents) ? m : undefined;
      },
      decided: (m) => Boolean(m.confirmed),
      accept(m) {
        m.changeAll(true);
        m.saveAndApplyConsents();
      },
      refuse(m) {
        m.changeAll(false);
        m.saveAndApplyConsents();
      },
    },
    cookieinformation: {
      api: () => (fn(window.CookieInformation?.submitAllCategories) ? window.CookieInformation : undefined),
      decided: (ci) => fn(ci.wasBannerConfirmed) && ci.wasBannerConfirmed(),
      accept: (ci) => ci.submitAllCategories(),
      refuse: (ci) => ci.declineAllCategories(),
    },
    cookiefirst: {
      api: () => (fn(window.CookieFirst?.acceptAllCategories) ? window.CookieFirst : undefined),
      decided: (cf) => cf.hasConsented === true,
      accept: (cf) => cf.acceptAllCategories(),
      refuse: (cf) => cf.declineAllCategories(),
    },
    iubenda: {
      api: () => (fn(window._iub?.cs?.api?.acceptAll) ? window._iub.cs.api : undefined),
      decided: (api) => fn(api.isPreferenceExpressed) && api.isPreferenceExpressed(),
      accept: (api) => api.acceptAll(),
      refuse: (api) => api.rejectAll(),
    },
    cookiehub: {
      api: () => (fn(window.cookiehub?.allowAll) ? window.cookiehub : undefined),
      decided: (ch) => fn(ch.hasAnswered) && ch.hasAnswered(),
      accept: (ch) => ch.allowAll(),
      refuse: (ch) => ch.denyAll(),
    },
    complianz: {
      api: () => (fn(window.cmplz_accept_all) ? window : undefined),
      decided: () => fn(window.cmplz_get_banner_status) && window.cmplz_get_banner_status() === 'dismissed',
      accept: () => window.cmplz_accept_all(),
      refuse: () => window.cmplz_deny_all(),
    },
    secureprivacy: {
      // `sp` is a common global name, so it only counts with both of these.
      api: () => (fn(window.sp?.saveAllConsents) && fn(window.sp.hasConsent) ? window.sp : undefined),
      decided: (sp) => sp.hasConsent(),
      accept: (sp) => sp.saveAllConsents('acceptAll', 'cb'),
      refuse: (sp) => sp.saveAllConsents('declineAll', 'cb'),
    },
    consentmanager: {
      // `__cmp` is also the legacy IAB TCF v1 API name, so confirm it belongs to consentmanager.net.
      api: () =>
        fn(window.__cmp) && document.querySelector('#cmpbox, #cmpwrapper, script[src*="consentmanager"]') ? window : undefined,
      accept: () => window.__cmp('setConsent', 1),
      refuse: () => window.__cmp('setConsent', 0),
    },
    tealium: {
      api: () => (fn(window.utag?.gdpr?.setConsentValue) ? window.utag.gdpr : undefined),
      accept: (gdpr) => gdpr.setConsentValue(true),
      refuse: (gdpr) => gdpr.setConsentValue(false),
    },
    piwikpro: {
      api: () => (fn(window.ppms?.cm?.api) ? window.ppms.cm.api : undefined),
      async decided(api) {
        const consents = Object.values((await ppms(api, 'getComplianceSettings'))?.value?.consents ?? {});
        return consents.length > 0 && consents.every((c) => c.status !== -1);
      },
      async setAll(api, status) {
        const settings = await ppms(api, 'getComplianceSettings');
        const types = (await ppms(api, 'getComplianceTypes'))?.value ?? Object.keys(settings?.value?.consents ?? {});
        if (!types.length) return false;
        const consents = Object.fromEntries(types.map((type) => [type, { status }]));
        return Boolean(await ppms(api, 'setComplianceSettings', { consents }));
      },
      accept(api) {
        return this.setAll(api, 1);
      },
      refuse(api) {
        return this.setAll(api, 0);
      },
    },
    shopify: {
      api: () => (fn(window.Shopify?.customerPrivacy?.setTrackingConsent) ? window.Shopify.customerPrivacy : undefined),
      decided: (cp) => fn(cp.shouldShowBanner) && !cp.shouldShowBanner(),
      set: (cp, value) =>
        withTimeout(
          new Promise((resolve) =>
            cp.setTrackingConsent({ analytics: value, marketing: value, preferences: value, sale_of_data: value }, () => resolve(true)),
          ),
          false,
        ),
      accept(cp) {
        return this.set(cp, true);
      },
      refuse(cp) {
        return this.set(cp, false);
      },
    },
    wix: {
      api: () => (fn(window.consentPolicyManager?.setConsentPolicy) ? window.consentPolicyManager : undefined),
      set(cpm, value) {
        const policy = { essential: true, functional: value, analytics: value, advertising: value, dataToThirdParty: value };
        return withTimeout(new Promise((resolve) => cpm.setConsentPolicy(policy, () => resolve(true), () => resolve(false))), false);
      },
      accept(cpm) {
        return this.set(cpm, true);
      },
      refuse(cpm) {
        return this.set(cpm, false);
      },
    },
    cookiescript: {
      api: () => (fn(window.CookieScript?.instance?.acceptAllAction) ? window.CookieScript.instance : undefined),
      accept: (cs) => cs.acceptAllAction(),
      refuse: (cs) => cs.rejectAllAction(),
    },
  };

  async function answer(platform, allow) {
    const api = platform?.api();
    if (!api) return 'unavailable';
    if (platform.decided && (await platform.decided(api))) return 'already';
    const done = await (allow ? platform.accept(api) : platform.refuse(api));
    if (done === false) return 'unavailable';
    return allow ? 'accepted' : 'rejected';
  }

  if (action === 'accept' || action === 'reject') {
    try {
      return { status: await answer(platforms[cmp], action === 'accept') };
    } catch (error) {
      return { status: 'error', error: String(error?.message ?? error) };
    }
  }

  if (action === 'withdraw') {
    const withdrawn = [];
    for (const [id, platform] of Object.entries(platforms)) {
      try {
        const api = platform.api();
        if (!api) continue;
        const done = await (platform.withdraw ? platform.withdraw(api) : platform.refuse(api));
        if (done !== false) withdrawn.push(id);
      } catch {
        // One broken platform API must not stop the others.
      }
    }
    return { withdrawn };
  }

  return { status: 'unavailable' };
}
