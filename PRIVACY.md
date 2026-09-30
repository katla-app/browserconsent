# Privacy policy: Katla BrowserConsent

_Last updated: 30 September 2026_

Katla BrowserConsent ("BrowserConsent") is a browser extension for Chrome and Firefox that answers cookie banners for you, with your prior consent, by rejecting or accepting all cookies as you choose. It can also warn you when a website uses common trackers before you've answered its banner or after you've rejected, and, if you switch it on, block them.

## What we collect

Nothing. BrowserConsent has no servers, no analytics, no crash reporting and no remote code. We never receive, sell or share any information about you or the websites you visit.

## What the extension stores on your device

The following is kept in your browser's extension storage and never leaves your device:

| Data | Why | How long |
| --- | --- | --- |
| Consent receipt: receipt ID, date and time, the exact wording you agreed to, a SHA-256 fingerprint of that wording, extension version | Proof of what you authorised, and when | Until you uninstall |
| Consent history: when you gave, withdrew or changed the scope of your consent, and when you switched between Reject all and Accept all | Accountability | Until you uninstall |
| Settings and the list of websites where BrowserConsent is off | To respect your choices | Until you uninstall |
| Activity log: time, website address (host name only), consent platform, and whether BrowserConsent accepted, rejected or you withdrew | Transparency about what was done on your behalf | Last 500 entries; clearable at any time |
| Last cookie choice per website (host name, accepted, rejected or a custom choice, when, and whether BrowserConsent or you made it, or it was found in the website's consent cookie). Choices you make on a website's own banner are only noted while tracker warnings are on | Tracker warnings and blocking on later visits | Last 2,000 websites; removed for a site when you delete its cookies |
| Trackers flagged per website (host name, which known trackers, the names of their cookies and pixel endpoints, and whether before consent or after a refusal), only while tracker warnings are on | Keeping a warning on later visits, when the website's banner doesn't come back | Last 2,000 websites; removed for a site when you delete its cookies |
| Per-tab status: which banner was answered on the open page, the cookie choice the website has on file and, with tracker warnings on, which known tracking cookies and pixels the page used and when | Toolbar status and tracker warnings | Until the tab is closed or navigates |

You can export your receipt and activity log as JSON, and clear the log, from the Settings page. Uninstalling the extension deletes all of it.

## Permissions

| Permission | Used for |
| --- | --- |
| Access to websites (`http://*/*`, `https://*/*`) | Finding cookie banners on the pages you visit and answering them, only after you have given your consent. Page content is read locally and never stored or sent anywhere. |
| `scripting` | Starting BrowserConsent on websites only after you consent (and stopping it when you withdraw or pause), and asking a site's consent platform to record your choice through its own JavaScript API. With the Katla debug log on (off by default, for developers), reading Katla's settings on a page to show them in that page's console. |
| `storage` | Keeping the data described above on your device. |
| `browsingData` | Only when you ask it to delete a website's cookies and site data to withdraw consent there. |
| `webRequest` | Tracker warnings and blocking, only while they're on: noticing requests to the pixel endpoints of known trackers. Requests are observed, never changed. Only the endpoint's host and path are kept, not the full address, and nothing leaves your device. |
| `declarativeNetRequest` | Blocking, only while it's on: blocking requests to the pixel endpoints of known trackers on websites that don't have your consent. |
| `cookies` | Tracker warnings and blocking, only while they're on: noticing when a website sets a known tracking cookie, and with blocking on, deleting it if the website doesn't have your consent. Only the cookie's name is kept, never its value. When a page has loaded, and when you open the toolbar popup, reading that website's consent platform cookie to see the cookie choice it has on file. Only the choice is kept (accepted, rejected or custom), in the per-tab status. |

## Websites you visit

When BrowserConsent accepts cookies on a website, that website and its partners may process your personal data under their own privacy policies. Katla is not responsible for their processing.

## Contact

Katla, [katla.app](https://katla.app)
