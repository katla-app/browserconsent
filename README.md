# Katla AutoConsent - Automatic Cookie Consent

**AutoConsent by Katla.** Set your privacy preferences once. Katla handles cookie banners for you.

A Manifest V3 browser extension for **Chrome** (and other Chromium browsers) and **Firefox**. After the user gives informed consent once, it answers cookie banners with "Accept all" on their behalf. It keeps a receipt and an activity log, and makes withdrawal easy.

## What's in the box

- **37 consent platforms (38 rules)**, starting with Katla (GDPR and CCPA layouts, plus the React `CookieBanner`), OneTrust, Cookiebot, Usercentrics (v2/v3, including closed shadow roots), Didomi, Sourcepoint (cross-origin iframe), TrustArc, InMobi Choice (Quantcast), Google Funding Choices, Complianz, CookieYes, Osano, Klaro, iubenda, Termly, Borlabs, CookieFirst, consentmanager.net, Axeptio, Cookie Information, CookieHub, Civic Cookie Control, Tealium, Piwik PRO, Crownpeak/Evidon, CookieScript, Moove GDPR, Cookie Notice, CookieConsent v3, HubSpot, Shopify, Wix, Ezoic, Amazon, Meta and Google. Full list: `src/content/rules.js`.
- **Platform JavaScript APIs first, clicking as the fallback.** Consent is recorded through the platform's own API wherever one exists (`src/lib/platforms.js`), for example `KatlaConsent.acceptAll()`, `OneTrust.AllowAll()`, `Cookiebot.submitCustomConsent()`, `Didomi.setUserAgreeToAll()`, `CookieInformation.submitAllCategories()`, `CookieFirst.acceptAllCategories()`, `_iub.cs.api.acceptAll()`, `cookiehub.allowAll()`, `cmplz_accept_all()` and `UC_UI.acceptAllConsents()`. API names were checked against the live scripts on each vendor's own site where possible. Platforms without an accept API (Sourcepoint, TrustArc, Osano, InMobi, Google and others) are clicked.
- **Optional heuristic** for unrecognised banners. It matches exact "Accept all" labels in 12 languages, including Swedish, German, French, Spanish, Italian, Dutch, the Nordic languages and Polish. Off by default.
- **Consent to automatic consent.** Nothing is injected into any website until the user has read what AutoConsent does and ticked separate, unticked statements. The content script is registered only while that consent is valid, and removed on withdrawal or pause. The user gets a verbatim receipt with a SHA-256 fingerprint and must agree again when the wording changes. See [LEGAL.md](LEGAL.md).
- **Withdrawal**: globally, per site through the site's consent platform, or by deleting a site's cookies. Settings can reset every site where consent was given.
- **No data collection.** See [PRIVACY.md](PRIVACY.md).

## Build

```bash
npm install
npm run build          # dist/chrome, dist/firefox and a store-ready zip for each
npm run lint:firefox   # Mozilla's add-on linter
npm run icons          # regenerate PNG icons from the official Katla mark in assets/logo (no dependencies)
```

Load for development:

- **Chrome:** `chrome://extensions` → Developer mode → *Load unpacked* → `dist/chrome`
- **Firefox:** `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* → `dist/firefox/manifest.json`

Minimum versions: Chrome 111, Firefox 140 (desktop) and Firefox for Android 142. Both are needed for `world: "MAIN"` content scripts and Firefox's data collection declaration.

## Test

```bash
npm test                          # builds, then runs the e2e suite in Chrome
node test/e2e.mjs --firefox       # the same suite in Firefox
node test/e2e.mjs --offline       # skip the live Katla widget test
```

The suite loads the built extension into a real browser and runs it against fixture pages in `test/fixtures/`. It checks:

- nothing is registered or happens before consent, and the onboarding gate works
- API first and click fallback (closed shadow DOM, delayed banners, cross-origin iframes)
- the Katla CCPA "Do Not Sell" button is never clicked
- existing decisions and user interaction are respected
- pages can't trigger the extension
- excluded and paused sites, and scripts are unregistered on pause and withdrawal
- per-site and global withdrawal, and the activity log
- the real Katla widget from `dist.katla.app`

Browsers are found through `CHROME_PATH` / `FIREFOX_PATH`, or in `BROWSERS_DIR`, `./.browsers` or `~/.cache/puppeteer`. To download them:

```bash
npx @puppeteer/browsers install chrome@stable firefox@stable --path .browsers
```

## How it works

```
src/
  background.js          registers the content script only while consent is valid; runs platform APIs;
                         site checks, badge, onboarding on install, activity log
  lib/platforms.js       consent platform JS APIs (accept / withdraw), injected into the page by the background
  content/rules.js       platform rules + unrecognised-banner heuristic
  content/engine.js      finds banners, asks the background to use the platform API, clicks as fallback, reports
  onboarding/            consent flow and receipt
  popup/                 toolbar: status, pause, per-site off, withdraw, delete cookies
  options/               receipt, history, settings, excluded sites, activity, privacy
  lib/                   shared storage, site and constants modules
scripts/build.mjs        per-browser manifests (service worker vs. background scripts, gecko settings)
```

Until the user consents, the extension has no content scripts at all. Once consent is recorded, `background.js` registers `rules.js` and `engine.js` for http(s) pages. It unregisters them again when the user withdraws, pauses, or the consent wording changes. For each page (and each frame), the engine:

1. Watches the DOM for up to 30 seconds (15 in iframes) for a visible first-layer banner from a known platform.
2. Before acting, asks the background whether the top-level site is allowed: valid receipt for the current policy version, not paused, not excluded, and the user hasn't interacted.
3. If the platform has a JavaScript API, asks the background to run it in the page's own JavaScript world (`scripting.executeScript`, re-checking the site first). The API also reports whether a decision already exists, which is then left alone. If the banner stays on screen after the API call, the same "accept all" control is pressed to close it.
4. Otherwise clicks the platform's "accept all" control and checks the banner is gone.
5. Stops as soon as the user clicks or types on the page, and logs what it did (method `api` or `click`).

### Adding a platform

Add a rule to `src/content/rules.js`. Target the first-layer banner only, never a settings screen the user opened. If the platform has a JS API, add `accept`/`withdraw` handlers to `platformAction` in `src/lib/platforms.js` and set `api: true` on the rule. The function is serialised into the page, so keep everything inside it. Check the API names on a live site that uses the platform, then add a fixture and a test in `test/`.

## Releasing

1. Bump `version` in `package.json`. If the notice or statements change in substance, also bump `POLICY_VERSION` in `src/lib/constants.js`, which asks every user to consent again.
2. `npm run build && npm run lint:firefox && npm test && node test/e2e.mjs --firefox`
3. Upload `dist/katla-autoconsent-chrome-<version>.zip` to the Chrome Web Store and `dist/katla-autoconsent-firefox-<version>.zip` to addons.mozilla.org. Use `PRIVACY.md` as the privacy policy. The code is unminified, so AMO needs no separate source upload.
