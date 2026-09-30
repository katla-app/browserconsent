// Consent platform JavaScript APIs. `platformAction` is injected into the page's own JavaScript world
// by the background (scripting.executeScript), so it must be fully self-contained: no imports and no
// references to anything outside the function body.
//
// Verified against the live platform scripts (September 2026): Katla, OneTrust, Cookiebot, Didomi,
// Cookie Information, CookieFirst, iubenda, CookieHub, Complianz, Klaro, Shopify.
// From vendor documentation only: Usercentrics, consentmanager.net, Tealium, Piwik PRO, Wix, CookieScript.
//
//   platformAction('accept', id)  -> { status: 'accepted' | 'already' | 'unavailable' | 'error' }
//   platformAction('withdraw')    -> { withdrawn: [ids of platforms that recorded a refusal] }
export async function platformAction(action, cmp) {
  const fn = (value) => typeof value === 'function';
  const withTimeout = (promise, ms = 3000) =>
    Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(undefined), ms))]);

  // accept() returns 'accepted', 'already' (a decision exists, leave it alone) or undefined when the
  // API isn't available (yet). withdraw() returns true once it has recorded a refusal.
  const platforms = {
    katla: {
      accept() {
        const k = window.KatlaConsent;
        if (!fn(k?.acceptAll)) return;
        if (fn(k.hasConsent) && k.hasConsent()) return 'already';
        k.acceptAll();
        return 'accepted';
      },
      withdraw() {
        if (!fn(window.KatlaConsent?.withdrawConsent)) return;
        window.KatlaConsent.withdrawConsent();
        return true;
      },
    },
    onetrust: {
      accept() {
        const ot = fn(window.OneTrust?.AllowAll) ? window.OneTrust : fn(window.Optanon?.AllowAll) ? window.Optanon : null;
        if (!ot) return;
        if (fn(ot.IsAlertBoxClosed) && ot.IsAlertBoxClosed()) return 'already';
        ot.AllowAll();
        return 'accepted';
      },
      withdraw() {
        if (!fn(window.OneTrust?.RejectAll)) return;
        window.OneTrust.RejectAll();
        return true;
      },
    },
    cookiebot: {
      accept() {
        const cb = window.Cookiebot;
        if (!fn(cb?.submitCustomConsent)) return;
        if (cb.hasResponse === true) return 'already';
        cb.submitCustomConsent(true, true, true);
        return 'accepted';
      },
      withdraw() {
        if (!fn(window.Cookiebot?.withdraw)) return;
        window.Cookiebot.withdraw();
        return true;
      },
    },
    didomi: {
      accept() {
        const d = window.Didomi;
        if (!fn(d?.setUserAgreeToAll)) return;
        if (fn(d.shouldConsentBeCollected) && !d.shouldConsentBeCollected()) return 'already';
        d.setUserAgreeToAll();
        return 'accepted';
      },
      withdraw() {
        if (!fn(window.Didomi?.setUserDisagreeToAll)) return;
        window.Didomi.setUserDisagreeToAll();
        return true;
      },
    },
    usercentrics: {
      async accept() {
        const v3 = window.__ucCmp;
        if (fn(v3?.acceptAllConsents)) {
          if (fn(v3.isConsentRequired) && !(await v3.isConsentRequired())) return 'already';
          await v3.acceptAllConsents();
          if (fn(v3.saveConsents)) await v3.saveConsents();
          if (fn(v3.closeCmp)) await v3.closeCmp();
          return 'accepted';
        }
        const v2 = window.UC_UI;
        if (fn(v2?.acceptAllConsents)) {
          if (fn(v2.isInitialized) && !v2.isInitialized()) return;
          if (fn(v2.isConsentRequired) && !v2.isConsentRequired()) return 'already';
          await v2.acceptAllConsents();
          if (fn(v2.closeCMP)) await v2.closeCMP();
          return 'accepted';
        }
      },
      async withdraw() {
        const v3 = window.__ucCmp;
        if (fn(v3?.denyAllConsents)) {
          await v3.denyAllConsents();
          if (fn(v3.saveConsents)) await v3.saveConsents();
          return true;
        }
        if (!fn(window.UC_UI?.denyAllConsents)) return;
        await window.UC_UI.denyAllConsents();
        return true;
      },
    },
    klaro: {
      manager: () => (fn(window.klaro?.getManager) ? window.klaro.getManager() : null),
      accept() {
        const m = this.manager();
        if (!fn(m?.changeAll) || !fn(m.saveAndApplyConsents)) return;
        if (m.confirmed) return 'already';
        m.changeAll(true);
        m.saveAndApplyConsents();
        return 'accepted';
      },
      withdraw() {
        const m = this.manager();
        if (!fn(m?.changeAll) || !fn(m.saveAndApplyConsents)) return;
        m.changeAll(false);
        m.saveAndApplyConsents();
        return true;
      },
    },
    cookieinformation: {
      accept() {
        const ci = window.CookieInformation;
        if (!fn(ci?.submitAllCategories)) return;
        if (fn(ci.wasBannerConfirmed) && ci.wasBannerConfirmed()) return 'already';
        ci.submitAllCategories();
        return 'accepted';
      },
      withdraw() {
        if (!fn(window.CookieInformation?.declineAllCategories)) return;
        window.CookieInformation.declineAllCategories();
        return true;
      },
    },
    cookiefirst: {
      accept() {
        const cf = window.CookieFirst;
        if (!fn(cf?.acceptAllCategories)) return;
        if (cf.hasConsented === true) return 'already';
        cf.acceptAllCategories();
        return 'accepted';
      },
      withdraw() {
        if (!fn(window.CookieFirst?.declineAllCategories)) return;
        window.CookieFirst.declineAllCategories();
        return true;
      },
    },
    iubenda: {
      api: () => window._iub?.cs?.api,
      accept() {
        const api = this.api();
        if (!fn(api?.acceptAll)) return;
        if (fn(api.isPreferenceExpressed) && api.isPreferenceExpressed()) return 'already';
        api.acceptAll();
        return 'accepted';
      },
      withdraw() {
        const api = this.api();
        if (!fn(api?.rejectAll)) return;
        api.rejectAll();
        return true;
      },
    },
    cookiehub: {
      accept() {
        const ch = window.cookiehub;
        if (!fn(ch?.allowAll)) return;
        if (fn(ch.hasAnswered) && ch.hasAnswered()) return 'already';
        ch.allowAll();
        return 'accepted';
      },
      withdraw() {
        if (!fn(window.cookiehub?.denyAll)) return;
        window.cookiehub.denyAll();
        return true;
      },
    },
    complianz: {
      accept() {
        if (!fn(window.cmplz_accept_all)) return;
        if (fn(window.cmplz_get_banner_status) && window.cmplz_get_banner_status() === 'dismissed') return 'already';
        window.cmplz_accept_all();
        return 'accepted';
      },
      withdraw() {
        if (!fn(window.cmplz_deny_all)) return;
        window.cmplz_deny_all();
        return true;
      },
    },
    consentmanager: {
      // `__cmp` is also the legacy IAB TCF v1 API name, so confirm it belongs to consentmanager.net.
      present: () =>
        fn(window.__cmp) && Boolean(document.querySelector('#cmpbox, #cmpwrapper, script[src*="consentmanager"]')),
      accept() {
        if (!this.present()) return;
        window.__cmp('setConsent', 1);
        return 'accepted';
      },
      withdraw() {
        if (!this.present()) return;
        window.__cmp('setConsent', 0);
        return true;
      },
    },
    tealium: {
      accept() {
        if (!fn(window.utag?.gdpr?.setConsentValue)) return;
        window.utag.gdpr.setConsentValue(true);
        return 'accepted';
      },
      withdraw() {
        if (!fn(window.utag?.gdpr?.setConsentValue)) return;
        window.utag.gdpr.setConsentValue(false);
        return true;
      },
    },
    piwikpro: {
      setAll(status) {
        const api = window.ppms?.cm?.api;
        if (!fn(api)) return;
        return withTimeout(
          new Promise((resolve) => {
            api(
              'getComplianceSettings',
              (settings) => {
                const consents = settings?.consents ?? {};
                const decided = Object.keys(consents).length > 0 && Object.values(consents).every((c) => c.status !== -1);
                if (status === 1 && decided) return resolve('already');
                api(
                  'getComplianceTypes',
                  (types) => {
                    const all = Object.fromEntries((types ?? Object.keys(consents)).map((type) => [type, { status }]));
                    api('setComplianceSettings', { consents: all }, () => resolve('accepted'), () => resolve(undefined));
                  },
                  () => resolve(undefined),
                );
              },
              () => resolve(undefined),
            );
          }),
        );
      },
      accept() {
        return this.setAll(1);
      },
      async withdraw() {
        return (await this.setAll(0)) === 'accepted';
      },
    },
    shopify: {
      set(value) {
        const cp = window.Shopify?.customerPrivacy;
        if (!fn(cp?.setTrackingConsent)) return;
        const consent = { analytics: value, marketing: value, preferences: value, sale_of_data: value };
        return withTimeout(new Promise((resolve) => cp.setTrackingConsent(consent, () => resolve('accepted'))));
      },
      accept() {
        const cp = window.Shopify?.customerPrivacy;
        if (fn(cp?.shouldShowBanner) && fn(cp.setTrackingConsent) && !cp.shouldShowBanner()) return 'already';
        return this.set(true);
      },
      async withdraw() {
        return (await this.set(false)) === 'accepted';
      },
    },
    wix: {
      set(value, resolveWith) {
        const cpm = window.consentPolicyManager;
        if (!fn(cpm?.setConsentPolicy)) return;
        const policy = { essential: true, functional: value, analytics: value, advertising: value, dataToThirdParty: value };
        return withTimeout(new Promise((resolve) => cpm.setConsentPolicy(policy, () => resolve(resolveWith), () => resolve(undefined))));
      },
      accept() {
        return this.set(true, 'accepted');
      },
      async withdraw() {
        return (await this.set(false, true)) === true;
      },
    },
    cookiescript: {
      accept() {
        if (!fn(window.CookieScript?.instance?.acceptAllAction)) return;
        window.CookieScript.instance.acceptAllAction();
        return 'accepted';
      },
      withdraw() {
        if (!fn(window.CookieScript?.instance?.rejectAllAction)) return;
        window.CookieScript.instance.rejectAllAction();
        return true;
      },
    },
  };

  if (action === 'accept') {
    const platform = platforms[cmp];
    if (!platform) return { status: 'unavailable' };
    try {
      return { status: (await platform.accept()) ?? 'unavailable' };
    } catch (error) {
      return { status: 'error', error: String(error?.message ?? error) };
    }
  }

  if (action === 'withdraw') {
    const withdrawn = [];
    for (const [id, platform] of Object.entries(platforms)) {
      try {
        if (await platform.withdraw()) withdrawn.push(id);
      } catch {
        // One broken platform API must not stop the others.
      }
    }
    return { withdrawn };
  }

  return { status: 'unavailable' };
}
