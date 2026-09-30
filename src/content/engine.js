// Finds cookie banners and answers them with "accept all", within the limits the user agreed to:
// only after the user's authorisation, never on excluded sites, never when a decision already
// exists, and never once the user has started interacting with the page themselves.
//
// The background registers this script only while the user's consent is valid. For platforms with a
// JavaScript API, the choice is recorded through that API; clicking the banner is the fallback.
(() => {
  'use strict';

  const ext = globalThis.browser ?? globalThis.chrome;
  const RULES = globalThis.KATLA_AUTOCONSENT_RULES;
  const GENERIC = globalThis.KATLA_AUTOCONSENT_GENERIC;
  if (!ext?.runtime?.id || !RULES || globalThis.__katlaAutoConsentEngine) return;
  globalThis.__katlaAutoConsentEngine = true;

  const isTop = window === window.top;
  const RUN_FOR_MS = isTop ? 30_000 : 15_000;
  const TICK_MS = 500;
  const GENERIC_DELAY_MS = 2_000;
  const MAX_ACTIONS_PER_RULE = 3;
  const INPUT_EVENTS = ['pointerdown', 'keydown'];

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const isPrompting = (rule) => Boolean(firstVisible(rule, rule.banner ?? rule.accept));

  async function waitUntil(predicate, timeoutMs) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (predicate()) return true;
      await sleep(150);
    }
    return predicate();
  }

  // ---------------------------------------------------------------- engine

  let stopped = false;
  let busy = false;
  let startedAt = 0;
  let genericAttempts = 0;
  let siteCheck = null;
  const cleanups = [];
  const progress = new Map();

  function stop() {
    if (stopped) return;
    stopped = true;
    for (const cleanup of cleanups.splice(0)) cleanup();
  }

  // Authoritative check (policy version, pause, excluded sites), made once a banner is found.
  // It goes through the background because an iframe cannot see the top-level site's address.
  function checkSite() {
    siteCheck ??= ext.runtime.sendMessage({ type: 'content:check' }).catch(() => null);
    return siteCheck;
  }

  function report(rule, method) {
    stop();
    ext.runtime.sendMessage({ type: 'content:accepted', cmp: rule.id, cmpName: rule.name, method }).catch(() => {});
  }

  async function handle(rule) {
    const state = progress.get(rule.id) ?? { actions: 0, nextTry: 0, done: false };
    progress.set(rule.id, state);
    if (Date.now() < state.nextTry) return;

    const site = await checkSite();
    if (!site?.allowed) return stop();

    // 1. The platform's own JavaScript API (run in the page by the background).
    if (rule.api) {
      const { status } = (await ext.runtime.sendMessage({ type: 'content:platform-accept', cmp: rule.id }).catch(() => null)) ?? {};
      if (stopped) return;
      if (status === 'not-allowed') return stop();
      if (status === 'already') {
        state.done = true;
        return;
      }
      if (status === 'accepted') {
        // Some platforms (Katla among them) record the choice but leave their banner on screen.
        // Pressing the same "accept all" control closes it without changing the decision.
        if (!(await waitUntil(() => !isPrompting(rule), 800))) {
          firstVisible(rule, rule.accept)?.click();
          await waitUntil(() => !isPrompting(rule), 1_500);
        }
        return report(rule, 'api');
      }
    }

    // 2. Fallback: click the banner's "accept all" control.
    const button = firstVisible(rule, rule.accept);
    if (button) {
      state.actions++;
      button.click();
      // A consent iframe is usually removed right after the click, taking this script with it.
      if (rule.frame === 'iframe') return report(rule, 'click');
      if (await waitUntil(() => !isPrompting(rule), 3_000)) return report(rule, 'click');
    }
    state.nextTry = Date.now() + 1_000;
    if (state.actions >= MAX_ACTIONS_PER_RULE) state.done = true;
  }

  async function handleGeneric() {
    const found = GENERIC.find(isVisible);
    if (!found) return;
    const site = await checkSite();
    if (!site?.allowed) return stop();
    if (!site.generic) {
      genericAttempts = Infinity;
      return;
    }
    genericAttempts++;
    found.button.click();
    if (await waitUntil(() => !isVisible(found.container), 3_000)) {
      report({ id: 'generic', name: 'Unrecognised cookie banner' }, 'heuristic');
    }
  }

  function tick() {
    if (stopped || busy) return;
    if (Date.now() - startedAt > RUN_FOR_MS) return stop();

    let knownPlatformPresent = false;
    let job = null;
    for (const rule of rules) {
      if (progress.get(rule.id)?.done || !isPresent(rule)) continue;
      knownPlatformPresent = true;
      if (rule.apiDecides || isPrompting(rule)) {
        job = () => handle(rule);
        break;
      }
    }
    if (!job && isTop && !knownPlatformPresent && genericAttempts < 2 && Date.now() - startedAt > GENERIC_DELAY_MS) {
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

  async function start() {
    if (!rules.length && !isTop) return;
    let stored;
    try {
      stored = await ext.storage.local.get(['consent', 'settings']);
    } catch {
      return;
    }
    // Cheap early exit; the background re-checks everything before any action.
    if (stored.consent?.status !== 'granted' || stored.settings?.enabled === false || stopped) return;

    startedAt = Date.now();

    // The moment the user clicks or types on the page, the decision is theirs. The listener
    // outlives the engine so that a consent iframe the user opens later (for example from a
    // "Privacy settings" link) is left alone too.
    const onUserInput = (event) => {
      if (!event.isTrusted) return;
      stop();
      for (const type of INPUT_EVENTS) window.removeEventListener(type, onUserInput, true);
      ext.runtime.sendMessage({ type: 'content:user-input' }).catch(() => {});
    };
    for (const type of INPUT_EVENTS) window.addEventListener(type, onUserInput, true);

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
