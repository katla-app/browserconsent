import { onDomain } from './site.js';

// The most common tracking cookies and pixels, for tracker warnings.
//
//   cookies  cookie names. `*` matches any run of characters. `name@domain` only matches a cookie on
//            that domain (or below it), for names too generic to recognise on their own. Exact names
//            are matched before patterns, then the first pattern in list order wins.
//   pixels   `host/path` endpoints the tags send their hits to. The host includes its subdomains and
//            `*` stands for any host. A path matches itself and anything below it; no path means
//            every request to the host.
//
// Only endpoints that collect data are listed, not the scripts that set them up: loading a tag
// manager isn't tracking, the hit it sends is.
export const TRACKERS = [
  {
    id: 'google-analytics',
    name: 'Google Analytics',
    category: 'analytics',
    cookies: ['_ga', '_ga_*', '_gid', '_gat', '_gat_*', '__utma', '__utmb', '__utmc', '__utmt', '__utmz', 'AMP_TOKEN', 'FPID', 'FPLC'],
    pixels: [
      'google-analytics.com/g/collect',
      'google-analytics.com/collect',
      'google-analytics.com/j/collect',
      'google-analytics.com/r/collect',
      'analytics.google.com/g/collect',
    ],
  },
  {
    id: 'google-ads',
    name: 'Google Ads and DoubleClick',
    category: 'advertising',
    cookies: ['_gcl_*', '__gads', '__gpi', 'IDE@doubleclick.net', 'DSID@doubleclick.net', 'test_cookie@doubleclick.net'],
    pixels: [
      'googleadservices.com/pagead/conversion',
      'doubleclick.net/pagead/viewthroughconversion',
      'doubleclick.net/activity',
      'doubleclick.net/ddm/activity',
      'doubleclick.net/g/collect',
      'doubleclick.net/td/rul',
      'google.com/pagead/1p-conversion',
      'google.com/pagead/1p-user-list',
      'google.com/ccm/collect',
    ],
  },
  {
    id: 'meta',
    name: 'Meta Pixel',
    category: 'advertising',
    cookies: ['_fbp', '_fbc', 'fr@facebook.com'],
    pixels: ['facebook.com/tr'],
  },
  {
    id: 'tiktok',
    name: 'TikTok Pixel',
    category: 'advertising',
    cookies: ['_ttp', '_tt_enable_cookie', 'ttcsid', 'ttcsid_*'],
    pixels: ['analytics.tiktok.com/api/v2/pixel'],
  },
  {
    id: 'linkedin',
    name: 'LinkedIn Insight Tag',
    category: 'advertising',
    cookies: [
      'li_fat_id',
      'li_giant',
      'li_sugr@linkedin.com',
      'bcookie@linkedin.com',
      'lidc@linkedin.com',
      'UserMatchHistory@linkedin.com',
      'AnalyticsSyncHistory@linkedin.com',
    ],
    pixels: ['ads.linkedin.com'],
  },
  {
    id: 'microsoft-ads',
    name: 'Microsoft Advertising (Bing UET)',
    category: 'advertising',
    cookies: ['_uetsid', '_uetvid', '_uetmsclkid', 'MUID@bing.com'],
    pixels: ['bat.bing.com'],
  },
  {
    id: 'clarity',
    name: 'Microsoft Clarity',
    category: 'analytics',
    cookies: ['_clck', '_clsk', 'CLID@clarity.ms', 'MUID@clarity.ms'],
    pixels: ['clarity.ms/collect'],
  },
  {
    id: 'hotjar',
    name: 'Hotjar',
    category: 'analytics',
    cookies: ['_hj*'],
    pixels: ['in.hotjar.com'],
  },
  {
    id: 'pinterest',
    name: 'Pinterest Tag',
    category: 'advertising',
    cookies: ['_pin_unauth', '_pinterest_ct_ua', '_pinterest_ct_rt', '_epik', '_derived_epik'],
    pixels: ['ct.pinterest.com'],
  },
  {
    id: 'snapchat',
    name: 'Snap Pixel',
    category: 'advertising',
    cookies: ['_scid', '_scid_r', '_sctr', 'sc_at@snapchat.com'],
    pixels: ['tr.snapchat.com', 'tr-shadow.snapchat.com'],
  },
  {
    id: 'x',
    name: 'X (Twitter) Pixel',
    category: 'advertising',
    cookies: [
      '_twclid',
      'muc_ads@twitter.com',
      'muc_ads@x.com',
      'personalization_id@twitter.com',
      'personalization_id@x.com',
      'guest_id_ads@twitter.com',
      'guest_id_ads@x.com',
      'guest_id_marketing@twitter.com',
      'guest_id_marketing@x.com',
    ],
    pixels: ['analytics.twitter.com', 't.co/i/adsct', 't.co/1/i/adsct'],
  },
  {
    id: 'reddit',
    name: 'Reddit Pixel',
    category: 'advertising',
    cookies: ['_rdt_uuid', '_rdt_cid'],
    pixels: ['alb.reddit.com'],
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    category: 'analytics',
    cookies: ['__hstc', '__hssc', '__hssrc', 'hubspotutk'],
    pixels: ['hubspot.com/__ptq.gif'],
  },
  {
    id: 'adobe',
    name: 'Adobe Analytics',
    category: 'analytics',
    cookies: ['s_cc', 's_sq', 's_vi', 's_fid', 's_ecid', 'AMCV_*', 'AMCVS_*', 'demdex@demdex.net', 'dextp@demdex.net'],
    // `/b/ss/` is also served from sites' own domains, so it is matched on any host.
    pixels: ['*/b/ss', 'omtrdc.net', '2o7.net', 'demdex.net', 'adobedc.net/ee'],
  },
  {
    id: 'criteo',
    name: 'Criteo',
    category: 'advertising',
    cookies: ['cto_bundle', 'cto_bidid', 'uid@criteo.com'],
    pixels: ['criteo.com/event', 'gum.criteo.com'],
  },
  {
    id: 'yandex',
    name: 'Yandex Metrica',
    category: 'analytics',
    cookies: ['_ym_*', 'yandexuid@yandex.ru', 'yandexuid@yandex.com'],
    pixels: ['mc.yandex.ru', 'mc.yandex.com'],
  },
  {
    id: 'amplitude',
    name: 'Amplitude',
    category: 'analytics',
    cookies: ['AMP_*', 'amplitude_id*'],
    pixels: ['api2.amplitude.com', 'api.eu.amplitude.com'],
  },
  {
    id: 'mixpanel',
    name: 'Mixpanel',
    category: 'analytics',
    cookies: ['mp_*_mixpanel'],
    pixels: ['api-js.mixpanel.com', 'api.mixpanel.com', 'api-eu.mixpanel.com'],
  },
  {
    id: 'segment',
    name: 'Segment',
    category: 'analytics',
    cookies: ['ajs_anonymous_id', 'ajs_user_id'],
    pixels: ['api.segment.io'],
  },
  {
    id: 'heap',
    name: 'Heap',
    category: 'analytics',
    cookies: ['_hp2_*'],
    pixels: ['heapanalytics.com/h'],
  },
  {
    id: 'fullstory',
    name: 'FullStory',
    category: 'analytics',
    cookies: ['fs_uid', 'fs_lua'],
    pixels: ['rs.fullstory.com'],
  },
  {
    id: 'matomo',
    name: 'Matomo and Piwik PRO',
    category: 'analytics',
    // No pixels: both are self-hosted, and cookieless set-ups can be exempt from consent.
    cookies: ['_pk_id.*', '_pk_ses.*', '_pk_ref.*'],
    pixels: [],
  },
  {
    id: 'snowplow',
    name: 'Snowplow',
    category: 'analytics',
    cookies: ['_sp_id.*', '_sp_ses.*'],
    pixels: [],
  },
  {
    id: 'optimizely',
    name: 'Optimizely',
    category: 'analytics',
    cookies: ['optimizelyEndUserId'],
    pixels: [],
  },
  {
    id: 'vwo',
    name: 'VWO',
    category: 'analytics',
    cookies: ['_vwo_*', '_vis_opt_*'],
    pixels: [],
  },
  {
    id: 'tealium-iq',
    name: 'Tealium iQ',
    category: 'analytics',
    cookies: ['utag_main', 'utag_main_*'],
    pixels: [],
  },
  {
    id: 'quantcast',
    name: 'Quantcast',
    category: 'advertising',
    cookies: ['__qca', 'mc@quantserve.com'],
    pixels: ['pixel.quantserve.com'],
  },
  {
    id: 'taboola',
    name: 'Taboola',
    category: 'advertising',
    cookies: ['t_gid@taboola.com', 't_pt_gid@taboola.com'],
    pixels: ['trc-events.taboola.com'],
  },
  {
    id: 'outbrain',
    name: 'Outbrain',
    category: 'advertising',
    cookies: ['obuid@outbrain.com'],
    pixels: ['tr.outbrain.com'],
  },
  {
    id: 'adform',
    name: 'Adform',
    category: 'advertising',
    cookies: ['uid@adform.net', 'C@adform.net', 'TPC@adform.net', 'cid@adform.net'],
    pixels: ['track.adform.net'],
  },
  {
    id: 'xandr',
    name: 'Xandr (AppNexus)',
    category: 'advertising',
    cookies: ['uuid2@adnxs.com', 'anj@adnxs.com'],
    pixels: ['adnxs.com/px', 'adnxs.com/seg', 'adnxs.com/getuid'],
  },
  {
    id: 'tradedesk',
    name: 'The Trade Desk',
    category: 'advertising',
    cookies: ['TDID@adsrvr.org', 'TDCPM@adsrvr.org'],
    pixels: ['insight.adsrvr.org', 'match.adsrvr.org'],
  },
  {
    id: 'adroll',
    name: 'AdRoll',
    category: 'advertising',
    cookies: ['__adroll', '__adroll_fpc', '__ar_v4'],
    pixels: ['d.adroll.com'],
  },
  {
    id: 'klaviyo',
    name: 'Klaviyo',
    category: 'advertising',
    cookies: ['__kla_id'],
    pixels: [],
  },
];

export const trackerById = new Map(TRACKERS.map((tracker) => [tracker.id, tracker]));

const globToRegExp = (glob) =>
  new RegExp(`^${glob.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);

const cookieSpecs = TRACKERS.flatMap((tracker) =>
  tracker.cookies.map((spec) => {
    const [name, domain = null] = spec.split('@');
    return { tracker, name, domain, pattern: name.includes('*') ? globToRegExp(name) : null };
  }),
);
const exactCookies = new Map();
for (const spec of cookieSpecs.filter((s) => !s.pattern)) {
  exactCookies.set(spec.name, [...(exactCookies.get(spec.name) ?? []), spec]);
}
const cookiePatterns = cookieSpecs.filter((spec) => spec.pattern);

// The tracker that sets a cookie with this name on this domain, or null.
export function matchCookie(name, domain) {
  const host = domain.replace(/^\./, '').toLowerCase();
  const fits = (spec) => !spec.domain || onDomain(host, spec.domain);
  const spec = exactCookies.get(name)?.find(fits) ?? cookiePatterns.find((s) => s.pattern.test(name) && fits(s));
  return spec?.tracker ?? null;
}

const pixelSpecs = TRACKERS.flatMap((tracker) =>
  tracker.pixels.map((endpoint) => {
    const slash = endpoint.indexOf('/');
    return slash === -1
      ? { tracker, host: endpoint, path: '' }
      : { tracker, host: endpoint.slice(0, slash), path: endpoint.slice(slash) };
  }),
);

// Match patterns for webRequest, so the browser only reports requests to these endpoints.
export const PIXEL_URL_PATTERNS = [
  ...new Set(pixelSpecs.map(({ host, path }) => `*://${host === '*' ? '*' : `*.${host}`}${path || '/'}*`)),
];

// declarativeNetRequest conditions for every endpoint, for blocking them. With no resource types given,
// a rule covers every kind of request except the page itself.
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const PIXEL_BLOCK_CONDITIONS = [
  ...new Map(
    pixelSpecs.map(({ host, path }) => {
      const condition =
        host === '*'
          ? { regexFilter: `^https?://[^/]+${escapeRegExp(path)}(?:[/;?#]|$)` }
          : { urlFilter: `||${host}${path || '^'}` };
      return [JSON.stringify(condition), condition];
    }),
  ).values(),
];

// Floodlight puts its parameters after a semicolon (/activity;src=…).
const pathMatches = (pathname, path) =>
  !path || pathname === path || pathname.startsWith(`${path}/`) || pathname.startsWith(`${path};`);

// Google tags report in `gcs` what Consent Mode allowed: G1, then ad_storage and analytics_storage,
// each 1 (granted), 0 (denied) or - (not set). With both denied the hit is a "cookieless ping".
function consentModeOf(url) {
  const gcs = url.searchParams.get('gcs');
  if (!gcs || !/^G1[01-]{2}$/.test(gcs)) return null;
  return gcs.slice(2).includes('1') ? 'granted' : 'denied';
}

// The tracker a request goes to, as { tracker, endpoint, consentMode }, or null.
export function matchPixel(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const spec = pixelSpecs.find((s) => (s.host === '*' || onDomain(host, s.host)) && pathMatches(url.pathname, s.path));
  if (!spec) return null;
  return { tracker: spec.tracker, endpoint: `${host}${spec.path}`, consentMode: consentModeOf(url) };
}
