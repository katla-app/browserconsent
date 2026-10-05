# Developing BrowserConsent

How BrowserConsent is built, tested and released. For what it does and how to install it, see the [README](README.md).

## What's in the box

- **Reject all or Accept all.** The user picks during onboarding and can switch in Settings or the popup, or turn automatic consent off and keep only tracker warnings. Accept all needs its own consent statements in the receipt; switching is written into the receipt and its history. Banners without a first-layer reject control (and no platform API) are left for the user rather than walked through their settings screens.
- **Tracker warnings** (on by default): a list of 34 common trackers (`src/lib/trackers.js`: Google Analytics and Ads, Meta, TikTok, LinkedIn, Microsoft, Hotjar, Pinterest, Snap, X, Adobe, Criteo and others) with their cookie names and pixel endpoints. When a known tracking cookie is set or a pixel is sent *before consent* (while the site's banner is still waiting for an answer) or *after a refusal* (on the page, or on a later visit to a site that was told no), the toolbar badge turns red with the number of trackers, and the popup lists them. Each warning type has its own switch.
- **Blocking** (opt-in): with "Block them" on, those trackers' pixels are blocked and their cookies deleted on every site that doesn't have the user's consent, before its banner is answered and after a refusal. A site gets them back once it has "Accept all" or a custom choice on file, or when BrowserConsent is off for it. The badge turns green with the number of cookies and pixel endpoints blocked on the page.
- **39 consent platforms (41 rules)**, starting with Katla (the hosted widget in GDPR and CCPA layouts, and sites built with the SDK, recognised by its guard script and consent cookie since they render their own banner), OneTrust, Cookiebot, Usercentrics (v2/v3, including closed shadow roots), Didomi, Sourcepoint (cross-origin iframe), TrustArc, InMobi Choice (Quantcast), Google Funding Choices, Complianz, CookieYes, Osano, Klaro, iubenda, Termly, Borlabs, CookieFirst, consentmanager.net, Axeptio, Cookie Information, CookieHub, Civic Cookie Control, Tealium, Piwik PRO, Crownpeak/Evidon, CookieScript, Moove GDPR, Cookie Notice, CookieConsent v2 (also built into Quickbutik shops) and v3, Secure Privacy (its banner is a srcdoc iframe), Cookie Tractor, HubSpot, Shopify, Wix, Ezoic, Amazon, Meta and Google. Full list: `src/content/rules.js`.
- **Platform JavaScript APIs first, clicking as the fallback.** The choice is recorded through the platform's own API wherever one exists (`src/lib/platforms.js`), for example `KatlaConsent.acceptAll()` / `rejectAll()` (`optOutOfSale()` under CCPA), `OneTrust.AllowAll()` / `RejectAll()`, `Cookiebot.submitCustomConsent()`, `Didomi.setUserAgreeToAll()` / `setUserDisagreeToAll()`, `CookieInformation.submitAllCategories()`, `CookieFirst.acceptAllCategories()`, `_iub.cs.api.acceptAll()`, `cookiehub.allowAll()`, `cmplz_accept_all()` and `UC_UI.acceptAllConsents()`. API names were checked against the live scripts on each vendor's own site where possible. Platforms without an accept API (Sourcepoint, TrustArc, Osano, InMobi, Google and others) are clicked.
- **Decision on file.** Once a site has an answer its banner doesn't come back, so the popup reads the consent platform's own cookie (Katla, OneTrust, Cookiebot, Complianz, CookieYes, CookieFirst, Cookie Information, CookieConsent) and shows whether the site already has cookies accepted, rejected or a custom choice.
- **Katla debug log** (for developers, off by default). On sites that use Katla it logs how Katla is set up (hosted widget or SDK guard, site ID, version, regulation, GPC), the consent on file, every consent change and what BrowserConsent did, in the page's console, in Katla's own console style. Katla's own debug output is a build-time SDK option (`<KatlaProvider debug>`), so it can't be switched on from outside.
- **Optional heuristic** for unrecognised banners. It matches exact "Accept all" and "Reject all" labels in 12 languages, including Swedish, German, French, Spanish, Italian, Dutch, the Nordic languages and Polish. Off by default.
- **Consent to automatic consent.** Nothing is injected into any website until the user has read what BrowserConsent does and ticked separate, unticked statements. The content script is registered only while that consent is valid, and removed on withdrawal or pause. The user gets a verbatim receipt with a SHA-256 fingerprint and must agree again when the wording changes. See [LEGAL.md](LEGAL.md).
- **Withdrawal**: globally, per site through the site's consent platform, or by deleting a site's cookies. Settings can reset every site where consent was given.
- **No data collection.** See [PRIVACY.md](PRIVACY.md).

## Build

```bash
npm install
npm run build          # dist/chrome, dist/firefox and a store-ready zip for each
npm run lint:firefox   # Mozilla's add-on linter
npm run icons          # regenerate PNG icons from the official Katla mark in assets/logo (no dependencies)
npm run store-assets   # Chrome Web Store icon and 1280x800 screenshots in store/chrome, from real captures
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
- Katla sites built with the SDK (their own banner markup, answered through the API; a decision on file left alone), and CookieConsent v2 (accepted with its primary button; with Reject all, only answered when its first screen has an "only necessary" button)
- Secure Privacy through its API, and by clicking inside its srcdoc iframe without one; Cookie Tractor by its buttons, never saving a custom selection
- blocking: pixels blocked and tracking cookies deleted on a site without consent, a green count, pixels allowed again once the site has consent, and no rules left when it's switched off
- Reject all through platform APIs (OneTrust, Katla, Katla SDK, Katla CCPA opt-out) and by clicking (Cookiebot, Sourcepoint, unrecognised banners), and that Accept all can't be switched on without its consent statements
- tracker warnings: nothing recorded while off, trackers before consent and after a refusal (kept when a frame loads later), a later visit judged against the refusal on file, nothing flagged after Accept all, and warnings with automatic consent off following the user's own click
- the real Katla widget from `dist.katla.app`

Browsers are found through `CHROME_PATH` / `FIREFOX_PATH`, or in `BROWSERS_DIR`, `./.browsers` or `~/.cache/puppeteer`. To download them:

```bash
npx @puppeteer/browsers install chrome@stable firefox@stable --path .browsers
```

## How it works

```
src/
  background.js          registers the content script only while consent is valid; runs platform APIs;
                         site checks, badge, onboarding on install, activity log; tracker warnings
  lib/platforms.js       consent platform JS APIs (accept / reject / withdraw), injected into the page by the background
  lib/trackers.js        common tracking cookies and pixel endpoints, and their matchers
  lib/warnings.js        judges tracker hits as before consent / after a refusal (background badge and popup)
  content/rules.js       platform rules (accept and reject controls) + unrecognised-banner heuristic
  content/engine.js      finds banners, asks the background to use the platform API, clicks as fallback, reports;
                         with tracker warnings on, also reports banners and the user's own answers
  onboarding/            consent flow and receipt
  popup/                 toolbar: status, pause, per-site off, withdraw, delete cookies
  options/               receipt, history, settings, excluded sites, activity, privacy
  lib/                   shared storage, site and constants modules
scripts/build.mjs        per-browser manifests (service worker vs. background scripts, gecko settings)
```

Until the user consents, the extension has no content scripts at all. Once consent is recorded, `background.js` registers `rules.js` and `engine.js` for http(s) pages while automatic consent or tracker warnings are on. It unregisters them again when the user withdraws, turns both off, or the consent wording changes. For each page (and each frame), the engine:

1. Watches the DOM for up to 30 seconds (15 in iframes) for a visible first-layer banner from a known platform. Platforms whose banner can't be recognised, like Katla sites built with the SDK, count as asking while their marker (the SDK's guard script) is on the page and their consent cookie isn't set.
2. Before acting, asks the background whether the top-level site is allowed and how to answer: valid receipt for the current policy version, automatic consent on, not excluded, and the user hasn't interacted. "Accept all" is only ever used when the receipt holds the user's agreement to it.
3. If the platform has a JavaScript API, asks the background to run it in the page's own JavaScript world (`scripting.executeScript`, re-checking the site first). The API also reports whether a decision already exists, which is then left alone. If the banner stays on screen after the API call, the control for the same answer is pressed to close it.
4. Otherwise clicks the platform's control for the answer (for "Reject all" without a known selector, a button inside the banner labelled "Reject all" or similar) and checks the banner is gone.
5. Stops as soon as the user clicks or types on the page, and logs what it did (method `api` or `click`).

### Tracker warnings

With either warning switched on, the background keeps a record per tab in `storage.session` (shape in `src/lib/warnings.js`):

- **Hits.** `webRequest.onBeforeRequest`, filtered to the pixel endpoints in `trackers.js`, catches pixels. `cookies.onChanged` catches tracking cookies being set or refreshed. A cookie is put down to the tabs of the site it belongs to (or, when partitioned, the site it was set under), otherwise to the tab that just sent a request to the tracker host that set it. Google hits whose `gcs` parameter says Consent Mode was denied are labelled as cookieless pings.
- **Consent state.** The engine reports when a first-layer banner is showing (so no decision exists yet) and, from trusted clicks on known accept/reject controls, the user's own answers. BrowserConsent's answers are recorded with the moment it acted. The last decision per site is remembered (`siteDecisions` in `storage.local`), and once a page has loaded the background reads the decision the site's consent platform has on file from its consent cookie (`src/lib/on-file.js`). A later visit to a site that was told no is judged against that, even when the refusal was given before BrowserConsent was installed, and a decision on file earns the answered tick when the banner doesn't come back.
- **Judging.** Hits are compared by timestamp against the page's decisions: before any decision, with a banner showing, is *before consent*; after a refusal, or on a later visit to a refused site, is *after a refusal*. The badge shows the number of trackers flagged, in red, over the answered tick.
- **Remembered per site.** What's flagged is also kept per site (`siteFindings` in `storage.local`, up to 10 cookie and pixel names per tracker), so a later visit, when the banner doesn't come back, still shows it, marked as seen on an earlier visit. Deleting a site's cookies from the popup or Settings forgets it, along with the site's decision.

The two listeners are removed while warnings and blocking are off, so the browser doesn't wake the service worker for every cookie it sets.

### Blocking

With blocking on, `background.js` keeps a set of `declarativeNetRequest` dynamic rules: one block rule per pixel endpoint in `trackers.js`, and a higher-priority allow rule for requests from sites that keep their trackers (`initiatorDomains`: sites with "accept all" or a custom choice in `siteDecisions`, and excluded sites). The rules are rewritten when settings, excluded sites or site decisions change, and removed when blocking is switched off. The decision a site's consent cookie has on file is checked as soon as a page starts loading, so a consent given before BrowserConsent was installed counts from the first request. Cookies can't be stopped before they're set, so a known tracking cookie on a site without consent is deleted as soon as `cookies.onChanged` reports it. Blocked hits are recorded like the others, marked `blocked`, and counted in green instead of red.

### Adding a tracker

Add an entry to `TRACKERS` in `src/lib/trackers.js`: cookie names (with `*` wildcards, and `@domain` for names too generic to recognise alone) and the endpoints its tags send hits to, not the scripts that load them. Keep to trackers whose names and endpoints mean the same thing on every site.

### Adding a platform

Add a rule to `src/content/rules.js` with its `accept` and first-layer `reject` controls, and its consent `cookie` so the popup can show the decision on file (check the cookie's format on a live site after both answers). Target the first-layer banner only, never a settings screen the user opened. If the platform has a JS API, add `api`, `decided`, `accept` and `refuse` handlers (and `withdraw` if it differs from `refuse`) to `platformAction` in `src/lib/platforms.js` and set `api: true` on the rule. The function is serialised into the page, so keep everything inside it. Check the API names on a live site that uses the platform, then add a fixture and a test in `test/`.

## Releasing

1. Bump `version` in `package.json`. If the notice or statements change in substance, also bump `POLICY_VERSION` in `src/lib/constants.js`, which asks every user to consent again.
2. `npm run build && npm run lint:firefox && npm test && node test/e2e.mjs --firefox`
3. If the UI changed, `npm run store-assets` to refresh the store images. The listing text and privacy answers are in `store/chrome/listing.md`.
4. Tag the commit: `git tag v<version> && git push origin v<version>`. The Release workflow (`.github/workflows/release.yml`) builds both zips and attaches them to a GitHub release. The tag has to match `version` in `package.json`. Running the workflow by hand from the Actions tab tags the commit it runs on instead.
5. Upload `dist/katla-browserconsent-chrome-<version>.zip` to the Chrome Web Store and `dist/katla-browserconsent-firefox-<version>.zip` to addons.mozilla.org. Use `PRIVACY.md` as the privacy policy. The code is unminified, so AMO needs no separate source upload.
