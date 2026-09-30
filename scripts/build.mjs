// Builds dist/chrome and dist/firefox from src/ and packages each into a zip for store upload.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'));

const icons = Object.fromEntries([16, 32, 48, 96, 128].map((size) => [size, `icons/icon-${size}.png`]));
const matches = ['http://*/*', 'https://*/*'];

const base = {
  manifest_version: 3,
  name: pkg.displayName,
  short_name: 'Katla BrowserConsent',
  version: pkg.version,
  description: pkg.description,
  homepage_url: 'https://katla.app',
  icons,
  action: {
    default_title: 'Katla BrowserConsent',
    default_popup: 'popup/popup.html',
    default_icon: { 16: icons[16], 32: icons[32], 48: icons[48] },
  },
  options_ui: { page: 'options/options.html', open_in_tab: true },
  // No static content scripts: background.js registers them only once the user has consented.
  // webRequest and cookies are for tracker warnings; their listeners are only kept while those are on.
  permissions: ['storage', 'scripting', 'browsingData', 'webRequest', 'cookies', 'declarativeNetRequest'],
  host_permissions: matches,
};

const targets = {
  chrome: {
    ...base,
    minimum_chrome_version: '111',
    background: { service_worker: 'background.js', type: 'module' },
  },
  firefox: {
    ...base,
    action: {
      ...base.action,
      // White mark on dark toolbars, purple on light ones.
      theme_icons: [16, 32, 48].map((size) => ({ light: `icons/icon-light-${size}.png`, dark: icons[size], size })),
    },
    background: { scripts: ['background.js'], type: 'module' },
    browser_specific_settings: {
      gecko: {
        id: 'autoconsent@katla.app',
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['none'] },
      },
      gecko_android: { strict_min_version: '142.0' },
    },
  },
};

const only = process.argv[2];
for (const [name, manifest] of Object.entries(targets)) {
  if (only && only !== name) continue;
  const out = `${root}/dist/${name}`;
  rmSync(out, { recursive: true, force: true });
  cpSync(`${root}/src`, out, { recursive: true, filter: (path) => !path.endsWith('.DS_Store') });
  writeFileSync(`${out}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);

  const zip = `${root}/dist/katla-browserconsent-${name}-${pkg.version}.zip`;
  rmSync(zip, { force: true });
  if (existsSync('/usr/bin/zip')) {
    execFileSync('zip', ['-qrX', zip, '.'], { cwd: out });
    console.log(`Built dist/${name} and ${zip.slice(root.length + 1)}`);
  } else {
    console.log(`Built dist/${name} (zip not found, skipped packaging)`);
  }
}
