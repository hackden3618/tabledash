/**
 * Purpose: Frontend API Client helper for tableDash web application.
 * Responsibilities: Sends HTTP requests to backend REST API with consistent error handling and JSON parsing.
 * Dependencies: Fetch API.
 * When to modify: When changing API base URLs or adding custom headers.
 */

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api/v1";

/**
 * Standard API response envelope interface.
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Performs a GET request to an API endpoint.
 */
export async function apiGet<T>(endpoint: string, token?: string): Promise<ApiResponse<T>> {
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, { headers });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok && !data.error) {
      return { success: false, error: data.message || `HTTP ${res.status}: ${res.statusText}` };
    }
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || "Network request failed" };
  }
}

/**
 * Performs a POST request to an API endpoint.
 */
export async function apiPost<T, B = unknown>(endpoint: string, body: B, token?: string): Promise<ApiResponse<T>> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok && !data.error) {
      return { success: false, error: data.message || `HTTP ${res.status}: ${res.statusText}` };
    }
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || "Network request failed" };
  }
}

/**
 * Performs a PATCH request to an API endpoint.
 */
export async function apiPatch<T, B = unknown>(endpoint: string, body: B, token?: string): Promise<ApiResponse<T>> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok && !data.error) {
      return { success: false, error: data.message || `HTTP ${res.status}: ${res.statusText}` };
    }
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || "Network request failed" };
  }
}

/**
 * Performs a DELETE request to an API endpoint.
 */
export async function apiDelete<T>(endpoint: string, token?: string): Promise<ApiResponse<T>> {
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: "DELETE",
      headers,
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok && !data.error) {
      return { success: false, error: data.message || `HTTP ${res.status}: ${res.statusText}` };
    }
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || "Network request failed" };
  }
}
