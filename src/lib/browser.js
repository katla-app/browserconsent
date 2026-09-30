// Firefox exposes the promise-based `browser` namespace; Chrome MV3 returns promises from `chrome`.
export const ext = globalThis.browser ?? globalThis.chrome;

export const isFirefox = typeof ext.runtime.getBrowserInfo === 'function';
