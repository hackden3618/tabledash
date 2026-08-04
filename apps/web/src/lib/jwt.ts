export function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

export function isJwtExpired(token: string): boolean {
  const decoded = decodeJwt(token);
  if (!decoded || typeof decoded.exp !== "number") return true;
  return Date.now() >= decoded.exp * 1000;
}

export function getJwtExpiry(token: string): number | null {
  const decoded = decodeJwt(token);
  if (!decoded || typeof decoded.exp !== "number") return null;
  return decoded.exp * 1000;
}
