/**
 * Purpose: Web Push (browser push notification) delivery for Ladha.
 * Responsibilities: Persists PushSubscription rows, and sends VAPID-signed
 *   pushes to a customer or to all of a hotel's admin/kitchen staff.
 * Dependencies: web-push (VAPID signing + delivery), Prisma.
 * When to modify: When adding a new push-worthy event, or changing payload shape.
 *
 * Non-goals: this module never throws on delivery failure for an individual
 * subscription — a dead/expired subscription is pruned and the rest still send,
 * the same "best effort, never block the request" contract sms.service.ts uses.
 */
import webpush from "web-push";
import { prisma } from "../../../../../infrastructure/database/prisma";
import { env } from "../../../../../shared/config";
import type { PushOwnerType } from "../../../../../generated/prisma/client";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  if (!env.vapidPublicKey || !env.vapidPrivateKey) return;
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  /** Distinguishes the customer app from the kitchen app so the SW opens the right scope. */
  scope?: "customer" | "admin";
}

export interface SubscriptionInput {
  ownerType: PushOwnerType;
  ownerId: string;
  hotelId?: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

export async function saveSubscription(input: SubscriptionInput) {
  return prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: input,
    update: {
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      hotelId: input.hotelId,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent,
    },
  });
}

export async function removeSubscription(endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

async function deliver(sub: { id: string; endpoint: string; p256dh: string; auth: string }, payload: PushPayload): Promise<boolean> {
  ensureConfigured();
  if (!configured) return false;
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return true;
  } catch (err: any) {
    // 404/410 = the browser/OS revoked this subscription — prune it so we stop
    // wasting sends on it. Any other error is transient network/provider noise.
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
    }
    return false;
  }
}

/** Sends to every subscription a single customer has registered (multiple devices/browsers). */
export async function sendPushToCustomer(customerId: string, payload: PushPayload): Promise<number> {
  const subs = await prisma.pushSubscription.findMany({ where: { ownerType: "CUSTOMER", ownerId: customerId } });
  const results = await Promise.allSettled(subs.map((s) => deliver(s, { ...payload, scope: "customer" })));
  return results.filter((r) => r.status === "fulfilled" && r.value).length;
}

/** Sends to every admin/kitchen device subscribed for a hotel — this is the "new order" alert fan-out. */
export async function sendPushToHotelAdmins(hotelId: string, payload: PushPayload): Promise<number> {
  const subs = await prisma.pushSubscription.findMany({ where: { ownerType: "ADMIN", hotelId } });
  const results = await Promise.allSettled(subs.map((s) => deliver(s, { ...payload, scope: "admin" })));
  return results.filter((r) => r.status === "fulfilled" && r.value).length;
}

/** Sends to every customer registered for Web Push (for platform & hotel announcements). */
export async function sendPushToAllCustomers(payload: PushPayload): Promise<number> {
  const subs = await prisma.pushSubscription.findMany({ where: { ownerType: "CUSTOMER" } });
  const results = await Promise.allSettled(subs.map((s) => deliver(s, { ...payload, scope: "customer" })));
  return results.filter((r) => r.status === "fulfilled" && r.value).length;
}

export const pushService = { saveSubscription, removeSubscription, sendPushToCustomer, sendPushToHotelAdmins, sendPushToAllCustomers };
