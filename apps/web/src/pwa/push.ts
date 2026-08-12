import { apiPost } from "../lib/api";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    const buffer = new ArrayBuffer(rawData.length);
    const outputArray = new Uint8Array(buffer);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!("serviceWorker" in navigator)) return null;
    try {
        return await navigator.serviceWorker.register("/sw.js");
    } catch {
        return null;
    }
}

export type PushSubscribeResult = "subscribed" | "denied" | "unsupported" | "error";

/**
 * Requests notification permission and registers a push subscription.
 *
 * IMPORTANT: This function must be called directly from a click/touch handler
 * on iOS Safari — Notification.requestPermission() will silently no-op if the
 * gesture context is broken by prior awaits. We therefore call it first,
 * before any network or serviceWorker awaits.
 */
export async function subscribeToPush(token?: string): Promise<PushSubscribeResult> {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
    if (!("Notification" in window)) return "unsupported";

    // ─── Step 1: Request permission FIRST (must be synchronous-ish on iOS) ───
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "denied";

    // ─── Step 2: Ensure service worker is registered & active ────────────────
    try {
        let registration = await navigator.serviceWorker.getRegistration("/sw.js");
        if (!registration) {
            registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        }
        // Wait for the SW to fully activate before using PushManager
        const ready = await navigator.serviceWorker.ready;

        // ─── Step 3: Fetch VAPID public key ──────────────────────────────────
        const vapidRes = await fetch("/api/v1/push/vapid-public-key")
            .then((r) => r.json())
            .catch(() => null);
        const vapidKey = vapidRes?.data?.key;
        if (!vapidKey) {
            console.error("[Push] VAPID public key not found — check VAPID_PUBLIC_KEY env var on Railway");
            return "error";
        }

        // ─── Step 4: Get or create push subscription ─────────────────────────
        let subscription = await ready.pushManager.getSubscription();
        if (!subscription) {
            subscription = await ready.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
            });
        }

        // ─── Step 5: Register with backend (best-effort, non-blocking) ───────
        const json = subscription.toJSON();
        if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
            const effectiveToken =
                token ||
                localStorage.getItem("ladha_customer_token") ||
                localStorage.getItem("ladha_admin_token") ||
                "";
            if (effectiveToken) {
                await apiPost(
                    "/push/subscribe",
                    { endpoint: json.endpoint, keys: json.keys },
                    effectiveToken
                ).catch((err) => console.warn("[Push] Backend registration failed:", err));
            }
        }

        return "subscribed";
    } catch (err) {
        console.error("[Push Subscribe Error]:", err);
        return "error";
    }
}

export function getNotificationPermissionState(): NotificationPermission | "unsupported" {
    if (!("Notification" in window)) return "unsupported";
    return Notification.permission;
}
