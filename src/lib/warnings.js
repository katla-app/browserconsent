import { trackerById } from './trackers.js';

// Tracker warnings: whether a known tracking cookie or pixel on a page came before the site had the
// user's consent, or after the user (or BrowserConsent) rejected.
//
// The background keeps one record per tab for the page open in it:
//   site          top-level host
//   siteDecision  the decision on file for the site when the page loaded: 'accepted', 'rejected' or null
//   bannerAt      when a first-layer cookie banner was seen asking for consent, or null
//   decisions     decisions made on the page, oldest first: { decision, at, by: 'browserconsent' | 'user', cmp, cmpName }
//   hits          { tracker, kind: 'cookie' | 'pixel', name, consentMode, times: [ms], blocked }, where
//                 `blocked` means the pixel was blocked or the cookie deleted
//   onFile        the decision the site's consent platform had on file (lib/on-file.js), or null
//
// Hits are judged by their timestamps, so a hit that arrives after a decision but was sent before it
// still counts as before.

export const BEFORE_CONSENT = 'before-consent';
export const AFTER_REJECT = 'after-reject';

export function classify(at, page) {
  const decision = page.decisions.findLast((d) => d.at <= at);
  if (decision) return decision.decision === 'rejected' ? AFTER_REJECT : null;
  // Nothing decided on the page yet. A site only shows its first-layer banner while it has no decision.
  if (page.bannerAt) return BEFORE_CONSENT;
  return page.siteDecision === 'rejected' ? AFTER_REJECT : null;
}

function label(hit) {
  if (hit.consentMode === 'denied') return `${hit.name} (cookieless ping, Consent Mode denied)`;
  if (hit.consentMode === 'granted') return `${hit.name} (Consent Mode granted)`;
  return hit.name;
}

// The flagged trackers on a page, per warning the user turned on, and the ones blocked:
//   { beforeConsent: [{ tracker, cookies, pixels, earlier }], afterReject: [...], count, blocked: [...], blockedCount }
// `count` is the number of different trackers flagged, and `blockedCount` the number of different cookies
// and pixel endpoints blocked, for the toolbar badge. `earlier` is what was flagged on earlier visits to
// the site (siteFindings in storage.js); trackers only flagged then are listed with `earlier: true`. With
// blocking on they're left out, as they're blocked now.
export function warningsFor(page, settings, earlier = null) {
  const wanted = { [BEFORE_CONSENT]: settings.warnBeforeConsent, [AFTER_REJECT]: settings.warnAfterReject };
  const groups = { [BEFORE_CONSENT]: new Map(), [AFTER_REJECT]: new Map() };
  const blocked = new Map();
  const add = (group, tracker, hit) => {
    if (!group.has(tracker.id)) group.set(tracker.id, { tracker, cookies: new Set(), pixels: new Set() });
    group.get(tracker.id)[hit.kind === 'cookie' ? 'cookies' : 'pixels'].add(label(hit));
  };
  for (const hit of page?.hits ?? []) {
    const tracker = trackerById.get(hit.tracker);
    if (!tracker) continue;
    if (hit.blocked) {
      add(blocked, tracker, hit);
      continue;
    }
    for (const kind of new Set(hit.times.map((at) => classify(at, page)))) {
      if (kind && wanted[kind]) add(groups[kind], tracker, hit);
    }
  }
  for (const [kind, key] of [[BEFORE_CONSENT, 'beforeConsent'], [AFTER_REJECT, 'afterReject']]) {
    if (!wanted[kind] || settings.blockTrackers) continue;
    for (const entry of earlier?.[key] ?? []) {
      const tracker = trackerById.get(entry.tracker);
      if (!tracker || groups[kind].has(tracker.id)) continue;
      groups[kind].set(tracker.id, { tracker, cookies: new Set(entry.cookies), pixels: new Set(entry.pixels), earlier: true });
    }
  }
  const list = (group) =>
    [...group.values()].map((e) => ({ tracker: e.tracker, cookies: [...e.cookies], pixels: [...e.pixels], earlier: Boolean(e.earlier) }));
  const beforeConsent = list(groups[BEFORE_CONSENT]);
  const afterReject = list(groups[AFTER_REJECT]);
  const count = new Set([...beforeConsent, ...afterReject].map((e) => e.tracker.id)).size;
  const blockedList = list(blocked);
  const blockedCount = blockedList.reduce((n, e) => n + e.cookies.length + e.pixels.length, 0);
  return { beforeConsent, afterReject, count, blocked: blockedList, blockedCount };
}
