// Finds cookie banners and answers them the way the user chose ("Reject all" or "Accept all"), within
// the limits the user agreed to: only after the user's authorisation, never on excluded sites, never
// when a decision already exists, and never once the user has started interacting with the page.
//
// With tracker warnings or blocking on it also observes: it tells the background when a site asks for
// consent and which answer the user gave, so trackers can be put down to before consent or after a refusal.
//
// The background registers this script only while the user's consent is valid and automatic consent,
// tracker warnings or blocking are on. For platforms with a JavaScript API, the choice is recorded through that
// API; clicking the banner is the fallback.
(() => {
  'use strict';

  const ext = globalThis.browser ?? globalThis.chrome;
  const RULES = globalThis.KATLA_BROWSERCONSENT_RULES;
  const GENERIC = globalThis.KATLA_BROWSERCONSENT_GENERIC;
  if (!ext?.runtime?.id || !RULES || globalThis.__katlaBrowserConsentEngine) return;
  globalThis.__katlaBrowserConsentEngine = true;

  const isTop = window === window.top;
  const RUN_FOR_MS = isTop ? 30_000 : 15_000;
  const TICK_MS = 500;
  const GENERIC_DELAY_MS = 2_000;
  const MAX_ACTIONS_PER_RULE = 3;
  const INPUT_EVENTS = ['pointerdown', 'keydown'];
  const DECISIONS = { accept: 'accepted', reject: 'rejected' };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const send = (message) => ext.runtime.sendMessage(message).catch(() => null);

  // ---------------------------------------------------------------- DOM helpers

  // Chrome exposes closed shadow roots through chrome.dom.openOrClosedShadowRoot(el); Firefox gives
  // content scripts an el.openOrClosedShadowRoot property.
  function shadowRootOf(el) {
    try {
      if (typeof ext.dom?.openOrClosedShadowRoot === 'function') return ext.dom.openOrClosedShadowRoot(el);
      return el.openOrClosedShadowRoot ?? el.shadowRoot;
    } catch {
      return el.shadowRoot;
    }
  }

  function rootsFor(rule) {
    const roots = [document];
    for (const selector of rule.shadowHosts ?? []) {
      for (const host of document.querySelectorAll(selector)) {
        const root = shadowRootOf(host);
        if (root) roots.push(root);
      }
    }
    for (const selector of rule.frameHosts ?? []) {
      for (const frame of document.querySelectorAll(selector)) {
        try {
          if (frame.contentDocument?.body) roots.push(frame.contentDocument);
        } catch {
          // Not same-origin after all.
        }
      }
    }
    return roots;
  }

  function* queryAll(rule, selectors) {
    for (const root of rootsFor(rule)) {
      for (const selector of selectors) {
        try {
          yield* root.querySelectorAll(selector);
        } catch {
          // Unsupported selector in this browser; skip it.
        }
      }
    }
  }

  function isVisible(el) {
    if (!el?.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    if (typeof el.checkVisibility === 'function') {
      return el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true });
    }
    const style = getComputedStyle(el);
    return style.visibility === 'visible' && Number(style.opacity) > 0;
  }

  const isPresent = (rule) => !queryAll(rule, rule.detect).next().done;
  const firstVisible = (rule, selectors) => {
    for (const el of queryAll(rule, selectors)) if (isVisible(el)) return el;
    return null;
  };
  const hasCookie = (name) => document.cookie.split(/;\s*/).some((cookie) => cookie.startsWith(`${name}=`));
  // A visible banner, or a headless install whose consent cookie hasn't been set yet.
  const isPrompting = (rule) =>
    Boolean(firstVisible(rule, rule.banner ?? rule.accept)) ||
    Boolean(rule.headless && !queryAll(rule, rule.headless).next().done && !hasCookie(rule.cookie.name));

  // The control that gives this answer on the rule's banner. For "Reject all" without a known
  // control, a button labelled that way inside the banner.
  function controlFor(rule, answer) {
    if (answer === 'accept') return firstVisible(rule, rule.accept);
    const control = firstVisible(rule, rule.reject ?? []);
    if (control) return control;
    const banner = firstVisible(rule, rule.banner ?? rule.detect);
    return banner ? GENERIC.buttonIn(banner, 'reject', isVisible) : null;
  }

  async function waitUntil(predicate, timeoutMs) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (predicate()) return true;
      await sleep(150);
    }
    return predicate();
  }

  // ---------------------------------------------------------------- engine

  let acting = false;
  let observing = false;
  let busy = false;
  let startedAt = 0;
  let genericAttempts = 0;
  let siteCheck = null;
  let bannerReported = false;
  let katlaReported = false;
  const cleanups = [];
  const progress = new Map();

  const stopActing = () => {
    acting = false;
  };

  function stopLooking() {
    for (const cleanup of cleanups.splice(0)) cleanup();
  }

  // Authoritative check (policy version, pause, excluded sites, how to answer), made once a banner
  // is found. It goes through the background because an iframe cannot see the top-level site's address.
  function checkSite() {
    siteCheck ??= send({ type: 'content:check' });
    return siteCheck;
  }

  // `at` is when BrowserConsent acted, so trackers the answer sets off count as after it.
  function report(rule, method, answer, at) {
    stopActing();
    send({ type: 'content:answered', cmp: rule.id, cmpName: rule.name, method, decision: DECISIONS[answer], at });
  }

  function reportBanner(cmp) {
    if (!observing || bannerReported) return;
    bannerReported = true;
    send({ type: 'content:banner', cmp });
  }

  async function handle(rule) {
    const state = progress.get(rule.id) ?? { actions: 0, nextTry: 0, done: false };
    progress.set(rule.id, state);
    if (Date.now() < state.nextTry) return;

    const site = await checkSite();
    if (!site?.allowed || !acting) return stopActing();

    // 1. The platform's own JavaScript API (run in the page by the background).
    if (rule.api) {
      const at = Date.now();
      const { status } = (await send({ type: 'content:platform-answer', cmp: rule.id })) ?? {};
      if (!acting) return;
      if (status === 'not-allowed') return stopActing();
      if (status === 'already') {
        state.done = true;
        return;
      }
      if (status === 'accepted' || status === 'rejected') {
        // Some platforms (Katla among them) record the choice but leave their banner on screen.
        // Pressing the control for the same answer closes it without changing the decision.
        const answer = status === 'accepted' ? 'accept' : 'reject';
        if (!(await waitUntil(() => !isPrompting(rule), 800))) {
          controlFor(rule, answer)?.click();
          await waitUntil(() => !isPrompting(rule), 1_500);
        }
        return report(rule, 'api', answer, at);
      }
    }

    // 2. Fallback: click the banner's control for the answer.
    const button = controlFor(rule, site.answer);
    if (button) {
      state.actions++;
      const at = Date.now();
      button.click();
      // A consent iframe is usually removed right after the click, taking this script with it.
      if (rule.frame === 'iframe') return report(rule, 'click', site.answer, at);
      if (await waitUntil(() => !isPrompting(rule), 3_000)) return report(rule, 'click', site.answer, at);
    }
    state.nextTry = Date.now() + 1_000;
    if (state.actions >= MAX_ACTIONS_PER_RULE) state.done = true;
  }

  async function handleGeneric() {
    const found = GENERIC.find(isVisible);
    if (!found) return;
    reportBanner('generic');
    if (!acting) return;
    const site = await checkSite();
    if (!site?.allowed || !acting) return stopActing();
    const button = found[site.answer];
    if (!site.generic || !button) {
      genericAttempts = Infinity;
      return;
    }
    genericAttempts++;
    const at = Date.now();
    button.click();
    if (await waitUntil(() => !isVisible(found.container), 3_000)) {
      report({ id: 'generic', name: 'Unrecognised cookie banner' }, 'heuristic', site.answer, at);
    }
  }

  function tick() {
    if (busy) return;
    const lookingForBanner = observing && !bannerReported;
    if (Date.now() - startedAt > RUN_FOR_MS || !(acting || lookingForBanner)) return stopLooking();

    let knownPlatformPresent = false;
    let job = null;
    for (const rule of rules) {
      if (!isPresent(rule)) continue;
      knownPlatformPresent = true;
      // For the Katla debug log, which the background only runs when the user switched it on.
      if (rule.id === 'katla' && isTop && !katlaReported) {
        katlaReported = true;
        send({ type: 'content:katla-found' });
      }
      if (observing) watchShadowRoots(rule);
      const prompting = isPrompting(rule);
      if (prompting) reportBanner(rule.id);
      if (acting && !progress.get(rule.id)?.done && (rule.apiDecides || prompting)) {
        job = () => handle(rule);
        break;
      }
    }
    const genericWanted = (acting && genericAttempts < 2) || lookingForBanner;
    if (!job && isTop && !knownPlatformPresent && genericWanted && Date.now() - startedAt > GENERIC_DELAY_MS) {
      job = handleGeneric;
    }
    if (!job) return;
    busy = true;
    job()
      .catch(() => {})
      .finally(() => {
        busy = false;
      });
  }

  const rules = RULES.filter((rule) =>
    isTop ? rule.frame !== 'iframe' : rule.frame === 'iframe' && (!rule.url || rule.url.test(location.href)),
  );

  // ---------------------------------------------------------------- the user's own answers

  // Which answer a click on a banner control gave, from the platform rules or, in the top frame, by label.
  function decisionFor(target) {
    for (const rule of rules) {
      for (const [answer, selectors] of [['reject', rule.reject ?? []], ['accept', rule.accept]]) {
        for (const selector of selectors) {
          try {
            if (target.closest(selector)) return { cmp: rule.id, decision: DECISIONS[answer] };
          } catch {
            // Unsupported selector in this browser; skip it.
          }
        }
      }
    }
    const answer = isTop ? GENERIC.answerOf(target) : null;
    return answer ? { cmp: 'generic', decision: DECISIONS[answer] } : null;
  }

  // A click inside a shadow root reaches the document listener first, retargeted to the shadow host,
  // so an event only counts as handled once a decision has been found in it.
  const handledClicks = new WeakSet();
  function onUserClick(event) {
    if (!event.isTrusted || handledClicks.has(event)) return;
    const [target] = event.composedPath();
    const found = target instanceof Element ? decisionFor(target) : null;
    if (!found) return;
    handledClicks.add(event);
    send({ type: 'content:decision', ...found, at: Date.now() });
  }

  // Clicks inside closed shadow roots only reach listeners on the root itself, and clicks inside a frame
  // never reach this document.
  const watchedRoots = new WeakSet();
  function watchShadowRoots(rule) {
    for (const root of rootsFor(rule).slice(1)) {
      if (watchedRoots.has(root)) continue;
      watchedRoots.add(root);
      root.addEventListener('click', onUserClick, true);
    }
  }

  async function start() {
    if (!rules.length && !isTop) return;
    let stored;
    try {
      stored = await ext.storage.local.get(['consent', 'settings']);
    } catch {
      return;
    }
    // Cheap early exit; the background re-checks everything before any action.
    if (stored.consent?.status !== 'granted') return;
    acting = stored.settings?.enabled !== false;
    observing = Boolean(stored.settings?.warnBeforeConsent || stored.settings?.warnAfterReject || stored.settings?.blockTrackers);
    if (!acting && !observing) return;

    startedAt = Date.now();

    if (acting) {
      // The moment the user clicks or types on the page, the decision is theirs. The listener
      // outlives the engine so that a consent iframe the user opens later (for example from a
      // "Privacy settings" link) is left alone too.
      const onUserInput = (event) => {
        if (!event.isTrusted) return;
        stopActing();
        for (const type of INPUT_EVENTS) window.removeEventListener(type, onUserInput, true);
        send({ type: 'content:user-input' });
      };
      for (const type of INPUT_EVENTS) window.addEventListener(type, onUserInput, true);
    }

    // For as long as the page is open, since the user may answer the banner at any time.
    if (observing) document.addEventListener('click', onUserClick, true);

    if (isTop) {
      let scheduled = false;
      const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        setTimeout(() => {
          scheduled = false;
          tick();
        }, 100);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      cleanups.push(() => observer.disconnect());
    }
    const interval = setInterval(tick, TICK_MS);
    cleanups.push(() => clearInterval(interval));
    tick();
  }

  start();
})();
