import { ext } from './browser.js';

// A site's banner isn't shown again once its consent platform has a decision on file. The platform's own
// consent cookie says what that decision is: { decision: 'accepted' | 'rejected' | 'custom' | 'answered',
// cmp, cmpName }, or null. Needs content/rules.js loaded first.
export async function decisionOnFile(url) {
  let cookies;
  try {
    cookies = await ext.cookies.getAll({ url });
  } catch {
    return null;
  }
  const values = new Map(cookies.map((cookie) => [cookie.name, cookie.value]));
  const get = (name) => {
    const value = values.get(name);
    try {
      return value === undefined ? undefined : decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  for (const rule of globalThis.KATLA_BROWSERCONSENT_RULES) {
    if (!rule.cookie || get(rule.cookie.name) === undefined) continue;
    let decision;
    try {
      decision = rule.cookie.decision ? rule.cookie.decision(get) : 'answered';
    } catch {
      decision = 'answered';
    }
    if (decision) return { decision, cmp: rule.id, cmpName: rule.name };
  }
  return null;
}
