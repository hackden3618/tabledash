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
 * Requests notification permission and registers a push subscription for the
 * current session (customer or admin token — the backend infers which from
 * the Authorization header). Safe to call repeatedly; browsers no-op a
 * subscribe() call for an already-subscribed endpoint.
 */
export async function subscribeToPush(token: string): Promise<PushSubscribeResult> {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";

    try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return "denied";

        let registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
            registration = await navigator.serviceWorker.register("/sw.js");
        }
        await navigator.serviceWorker.ready;

        const vapidRes = await fetch("/api/v1/push/vapid-public-key").then((r) => r.json()).catch(() => null);
        const vapidKey = vapidRes?.data?.key;
        if (!vapidKey) return "error";

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
            });
        }

        const json = subscription.toJSON();
        if (json.endpoint && json.keys) {
            const effectiveToken = token || localStorage.getItem("ladha_customer_token") || localStorage.getItem("ladha_admin_token") || "";
            if (effectiveToken) {
                await apiPost("/push/subscribe", { endpoint: json.endpoint, keys: json.keys }, effectiveToken).catch(() => 0);
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
