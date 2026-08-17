/**
 * localStorage.setItem can throw (Safari private-mode quota=0, storage
 * disabled by a webview/MDM policy, quota exceeded). Reads (getItem) do not
 * throw in practice, so this only wraps writes. Used on the write paths
 * where a throw would otherwise crash the whole app: auth token persistence
 * and the cart, both of which fire on every login and every add-to-cart.
 *
 * Failure just means the value won't persist across a reload — degraded,
 * not broken. That's the correct tradeoff here.
 */
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn(`[storage] Failed to persist "${key}":`, err);
    return false;
  }
}
