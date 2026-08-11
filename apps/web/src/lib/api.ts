/**
 * Purpose: Frontend API Client helper for Ladha web application.
 * Responsibilities: Sends HTTP requests to backend REST API with consistent error handling and JSON parsing.
 * Dependencies: Fetch API.
 * When to modify: When changing API base URLs or adding custom headers.
 */

export const API_BASE = import.meta.env.VITE_API_BASE ?? "/api/v1";
const GUEST_ID_KEY = "ladha_guest_id";

const GUEST_STORAGE_KEYS = [
  "ladha_guest_id",
  "ladha_last_order",
  "ladha_guest_delivery",
  "ladha_zone_id",
  "ladha_recent_searches",
  "ladha_cart",
];

/** Device-local identity for guest conversations; never treated as auth. */
export function getGuestId(): string {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(GUEST_ID_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(GUEST_ID_KEY, created);
  for (const key of GUEST_STORAGE_KEYS) {
    if (key !== GUEST_ID_KEY) window.localStorage.removeItem(key);
  }
  return created;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

function safeParse(text: string): any {
  try { return JSON.parse(text); } catch { return {}; }
}

function makeError(res: Response, text: string): string {
  const parsed = safeParse(text);
  return parsed?.error || parsed?.message || text || `HTTP ${res.status}: ${res.statusText}`;
}

function makeHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = { "X-Guest-Id": getGuestId() };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export async function apiGet<T>(endpoint: string, token?: string): Promise<ApiResponse<T>> {
  try {
    const headers = makeHeaders(token);
    const res = await fetch(`${API_BASE}${endpoint}`, { headers });
    const text = await res.text();
    const data = text ? safeParse(text) : {};
    if (!res.ok) return { success: false, error: makeError(res, text) };
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || "Network request failed" };
  }
}

export async function apiPost<T, B = unknown>(endpoint: string, body: B, token?: string): Promise<ApiResponse<T>> {
  try {
    const headers = { ...makeHeaders(token), "Content-Type": "application/json" };
    const res = await fetch(`${API_BASE}${endpoint}`, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await res.text();
    const data = text ? safeParse(text) : {};
    if (!res.ok) return { success: false, error: makeError(res, text) };
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || "Network request failed" };
  }
}

export async function apiPatch<T, B = unknown>(endpoint: string, body: B, token?: string): Promise<ApiResponse<T>> {
  try {
    const headers = { ...makeHeaders(token), "Content-Type": "application/json" };
    const res = await fetch(`${API_BASE}${endpoint}`, { method: "PATCH", headers, body: JSON.stringify(body) });
    const text = await res.text();
    const data = text ? safeParse(text) : {};
    if (!res.ok) return { success: false, error: makeError(res, text) };
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || "Network request failed" };
  }
}

export async function apiDelete<T>(endpoint: string, token?: string): Promise<ApiResponse<T>> {
  try {
    const headers = makeHeaders(token);
    const res = await fetch(`${API_BASE}${endpoint}`, { method: "DELETE", headers });
    const text = await res.text();
    const data = text ? safeParse(text) : {};
    if (!res.ok) return { success: false, error: makeError(res, text) };
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || "Network request failed" };
  }
}

/** Uploads multipart data while retaining the same auth and guest identity headers as other API calls. */
export async function apiUpload<T>(endpoint: string, file: File, token?: string): Promise<ApiResponse<T>> {
  try {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}${endpoint}`, { method: "POST", headers: makeHeaders(token), body: formData });
    const text = await res.text();
    const data = text ? safeParse(text) : {};
    if (!res.ok) return { success: false, error: makeError(res, text) };
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || "Image upload failed" };
  }
}
