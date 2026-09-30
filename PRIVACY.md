# Privacy policy: Katla AutoConsent

_Last updated: 16 September 2026_

Katla AutoConsent ("AutoConsent") is a browser extension for Chrome and Firefox that answers cookie banners for you, with your prior consent.

## What we collect

Nothing. AutoConsent has no servers, no analytics, no crash reporting and no remote code. We never receive, sell or share any information about you or the websites you visit.

## What the extension stores on your device

The following is kept in your browser's extension storage and never leaves your device:

| Data | Why | How long |
| --- | --- | --- |
| Consent receipt: receipt ID, date and time, the exact wording you agreed to, a SHA-256 fingerprint of that wording, extension version | Proof of what you authorised, and when | Until you uninstall |
| Consent history: when you gave, withdrew or changed the scope of your consent | Accountability | Until you uninstall |
| Settings and the list of websites where AutoConsent is off | To respect your choices | Until you uninstall |
| Activity log: time, website address (host name only), consent platform, and whether AutoConsent accepted or you withdrew | Transparency about what was done on your behalf | Last 500 entries; clearable at any time |
| Per-tab status (which banner was answered on the open page) | Toolbar status | Until the tab is closed or navigates |

You can export your receipt and activity log as JSON, and clear the log, from the Settings page. Uninstalling the extension deletes all of it.

## Permissions

| Permission | Used for |
| --- | --- |
| Access to websites (`http://*/*`, `https://*/*`) | Finding cookie banners on the pages you visit and answering them, only after you have given your consent. Page content is read locally and never stored or sent anywhere. |
| `scripting` | Starting AutoConsent on websites only after you consent (and stopping it when you withdraw or pause), and asking a site's consent platform to record your choice through its own JavaScript API. |
| `storage` | Keeping the data described above on your device. |
| `browsingData` | Only when you ask it to delete a website's cookies and site data to withdraw consent there. |

## Websites you visit

When AutoConsent accepts cookies on a website, that website and its partners may process your personal data under their own privacy policies. Katla is not responsible for their processing.

## Contact

Katla, [katla.app](https://katla.app)
