/**
 * Purpose: Frontend API Client helper for Ladha web application.
 * Responsibilities: Sends HTTP requests to backend REST API with consistent error handling and JSON parsing.
 * Dependencies: Fetch API.
 * When to modify: When changing API base URLs or adding custom headers.
 */

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api/v1";

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

export async function apiGet<T>(endpoint: string, token?: string): Promise<ApiResponse<T>> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
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
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
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
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
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
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${endpoint}`, { method: "DELETE", headers });
    const text = await res.text();
    const data = text ? safeParse(text) : {};
    if (!res.ok) return { success: false, error: makeError(res, text) };
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || "Network request failed" };
  }
}
