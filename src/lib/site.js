import { ext, isFirefox } from './browser.js';

export function hostFromUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

export const normalizeHost = (host) => host.trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, '');

// The host is the domain itself or one of its subdomains.
export const onDomain = (host, domain) => host === domain || host.endsWith(`.${domain}`);

export function isExcluded(host, exceptions) {
  const h = normalizeHost(host);
  return exceptions.some((ex) => onDomain(h, ex));
}

// Best-effort registrable domain without a public suffix list: good enough to widen a
// cookie deletion from "www.shop.example.co.uk" to "example.co.uk".
function baseDomain(host) {
  const labels = host.split('.');
  if (labels.length <= 2 || /^\d+$/.test(labels.at(-1))) return host;
  const twoPartSuffix = /^(co|com|org|net|gov|ac|edu|ltd|plc)$/.test(labels.at(-2)) && labels.at(-1).length === 2;
  return labels.slice(twoPartSuffix ? -3 : -2).join('.');
}

// Deletes cookies and site storage, which is where consent platforms keep their record of
// the user's choice. The site shows its banner again on the next visit.
export async function clearSiteData(hosts) {
  const unique = [...new Set(hosts.flatMap((h) => [h, normalizeHost(h), baseDomain(normalizeHost(h))]))];
  if (isFirefox) {
    await ext.browsingData.remove({ hostnames: unique }, { cookies: true, localStorage: true });
  } else {
    // Chrome clears cookies for the whole registrable domain of each origin.
    const origins = unique.flatMap((h) => [`https://${h}`, `http://${h}`]);
    await ext.browsingData.remove({ origins }, { cookies: true, localStorage: true, indexedDB: true, cacheStorage: true, serviceWorkers: true });
  }
}
