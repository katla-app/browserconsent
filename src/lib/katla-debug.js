// Katla debug log, for developers: logs what Katla reports on a page, and what BrowserConsent did there,
// in the page's console. Katla's own debug output is a build-time SDK option, so it can't be switched on
// from outside. Like platformAction, `katlaDebug` is injected into the page's own JavaScript world by the
// background, so it must be fully self-contained: no imports and no references outside the function body.
//
//   katlaDebug('detected')                     how Katla is installed and the consent it has on file,
//                                              then every consent change
//   katlaDebug('answered', { answer, status }) what BrowserConsent did through Katla's API
export async function katlaDebug(event, detail = {}) {
  // Katla's own console style (see the SDK's katlaLog).
  const log = (message, extra) => {
    const args = [`%c Katla %c ${message}`, 'background:#6366f1;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold', 'color:#6366f1'];
    if (extra !== undefined) args.push(extra);
    console.log(...args);
  };

  const end = Date.now() + 5000;
  while (!window.KatlaConsent && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 250));
  const k = window.KatlaConsent;
  const call = (name, ...args) => {
    try {
      return typeof k?.[name] === 'function' ? k[name](...args) : undefined;
    } catch (error) {
      return `error: ${error.message}`;
    }
  };

  if (event === 'answered') {
    const method = detail.answer === 'accept' ? 'acceptAll()' : call('getRegulation') === 'ccpa' ? 'optOutOfSale()' : 'rejectAll()';
    const messages = {
      accepted: `BrowserConsent accepted all through KatlaConsent.${method}`,
      rejected: `BrowserConsent rejected all through KatlaConsent.${method}`,
      already: 'BrowserConsent left the consent already on file alone',
    };
    log(messages[detail.status] ?? `BrowserConsent couldn't answer through KatlaConsent (${detail.status})`);
    return;
  }

  const guard = document.getElementById('katla-guard-script');
  const hosted = [...document.scripts].find((script) => /\/\/(cdn|dist)\.katla\.app\//.test(script.src));
  const integration = guard
    ? `SDK guard (${guard.src ? guard.src : 'inline'})`
    : hosted
      ? `hosted widget (${hosted.src.split('?')[0]})`
      : 'banner markup only';
  if (!k) {
    log(`BrowserConsent found Katla (${integration}), but window.KatlaConsent isn't available`);
    return;
  }
  log(`BrowserConsent found Katla: ${integration}`, {
    siteId: k.siteId,
    version: k.version,
    mode: k.mode,
    regulation: call('getRegulation'),
    gpc: call('isGPCEnabled'),
    consent: call('getConsent') ?? 'none yet',
    allowedCategories: call('getAllowedCategories'),
  });
  call('subscribe', (change) => log('Consent changed', change));
}
