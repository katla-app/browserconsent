# Legal design notes

These notes explain how AutoConsent is built so that the consent it gives is, as far as a browser extension can manage, a real expression of the user's will. They are engineering notes for legal review, **not legal advice**. Have counsel in your target markets review them before publishing.

## The model: the user consents in advance and the extension carries it out

Under the GDPR (Art. 4(11), Art. 7) and the ePrivacy Directive (Art. 5(3)), cookie consent must be freely given, specific, informed and unambiguous, and must be as easy to withdraw as to give. AutoConsent does not invent consent. The user gives it once, in advance, with full information. The extension then carries out that instruction on the banners the user meets, much like an agent acting on a standing instruction.

| Requirement | How AutoConsent addresses it | Where |
| --- | --- | --- |
| **Prior** | Before consent the extension has no content scripts, so it doesn't run on any website. `background.js` registers the content script only while a valid receipt exists and AutoConsent isn't paused, and unregisters it on withdrawal. The background re-checks the receipt before every action, including every platform API call. | `background.js` `syncContentScripts()`, `checkSite()` |
| **Informed** | A plain-language notice before activation: what it does, what accepting all cookies means (tracking, profiling, third-party sharing, transfers outside the EU/EEA), what stays in the user's control, and what Katla collects. | `onboarding/onboarding.html` |
| **Unambiguous, affirmative action** | Three separate, unticked statements plus an "Activate" button. No pre-ticked boxes (CJEU C-673/17 *Planet49*). | `lib/constants.js` `CONSENT_STATEMENTS` |
| **Specific / scope** | Scope is "accept all on cookie banners". Answering *unrecognised* banners widens the scope, so it is a separate opt-in, off by default, and changes are written into the receipt and history. | `lib/storage.js` `setGenericScope()` |
| **Freely given** | "Not now" is as prominent as "Activate", and the extension has no other purpose that depends on consent. | Onboarding |
| **Age / personal decision** | The user confirms they use the browser profile themselves and are old enough to consent to online services where they live (GDPR Art. 8). | Statement 3 |
| **Demonstrable (Art. 7(1))** | A receipt with a UUID, timestamp, policy version, the verbatim statements and notice text, and a SHA-256 fingerprint. Exportable as JSON. | Settings, "Export receipt" |
| **Re-consent on material change** | Receipts are bound to `POLICY_VERSION`. Bumping it pauses the extension and reopens onboarding. | `background.js` `onInstalled` |
| **As easy to withdraw (Art. 7(3))** | Withdraw globally in two clicks (Settings). Per website: the toolbar popup asks the site's consent platform to record a refusal through its API (Katla, OneTrust, Cookiebot, Didomi, Usercentrics, Klaro, Cookie Information, CookieFirst, iubenda, CookieHub, Complianz, consentmanager, Tealium, Piwik PRO, Shopify, Wix, CookieScript) or deletes the site's cookies. After a global withdrawal, Settings offers to reset every site where consent was given. | `popup/`, `options/` |
| **Transparency** | Activity log of every banner answered and every withdrawal, stored locally. | Settings, "Activity" |
| **Consent is recorded by the platform itself** | Where a consent platform has a JavaScript API (Katla, OneTrust, Cookiebot, Didomi, Usercentrics, Cookie Information, CookieFirst, iubenda, CookieHub, Complianz and others), AutoConsent records "accept all" through it, so the site's own consent log and signals such as Google Consent Mode are updated exactly as the platform intends. Clicking the banner is the fallback. | `lib/platforms.js` |
| **User's own choice wins** | Existing decisions are never overridden: rules target the first-layer banner only, and API calls check "consent already given" first. The engine stops the moment the user clicks or types on the page, and consent frames opened after that are left alone. The Sourcepoint privacy manager and similar settings screens are not targeted. | `content/engine.js`, `content/rules.js` |
| **Safety on regional layouts** | In Katla's CCPA layout the primary button is "Do Not Sell or Share". Consent goes through `KatlaConsent.acceptAll()`, and the click fallback only presses the primary button next to a reject button (the GDPR layout). Covered by an e2e test. | `content/rules.js`, `test/fixtures/katla-ccpa.html` |
| **Websites can't abuse it** | Platform APIs are run by the background through `scripting.executeScript`, not through page-visible events, so a website can neither trigger AutoConsent nor detect it by messaging it. | `background.js`, e2e test |
| **Data minimisation** | No servers, no telemetry. The log stores host names, not full URLs. Firefox manifest declares `data_collection_permissions: none`. | `PRIVACY.md` |

## Open legal questions (flag these to counsel)

1. **Validity of advance, automated consent.** EDPB Guidelines 05/2020 require consent to be specific to controller and purpose. Whether one advance authorisation covering every website meets that standard is unsettled. Some regulators may see it as too general, and a website may still treat its own banner as the only valid route. The notice tells users this plainly ("Please note" in Settings).
2. **Germany, TDDDG §26 and the EinwV.** Germany has a framework for recognised consent management services (PIMS), in force since 1 April 2025. AutoConsent is not a recognised service, and websites are not obliged to honour such services anyway. Consider whether recognition is worth pursuing.
3. **Browser signals.** If the user has Global Privacy Control enabled, some platforms (Katla among them) record a refusal automatically. AutoConsent does not override an existing decision, so GPC wins on those sites. Decide whether onboarding should mention this.
4. **Shared devices.** Statement 3 covers this, but a household computer may still have several people on one profile.
5. **Store policies.** The Chrome Web Store needs a single-purpose description and a privacy policy (use `PRIVACY.md`). Firefox Add-ons needs the data collection declaration, which is already in the manifest.
6. **Translations.** The notice and statements are in English only. Users must understand what they agree to, so localise them (for example Swedish and German) before launching in those markets, and keep each translation's receipt text verbatim.
