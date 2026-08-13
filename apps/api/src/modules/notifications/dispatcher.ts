/**
 * Purpose: Transactional Outbox Dispatcher for ladha.
 * Responsibilities: Polls EventOutbox for unprocessed events, dispatches via the appropriate handler,
 *   marks done on success, retries with capped attempts on failure.
 * Dependencies: Prisma client, notification handlers.
 * When to modify: When adding new event handlers or changing dispatch/retry logic.
 */

import { prisma } from "../../../../../infrastructure/database/prisma";
import { env } from "../../../../../shared/config";
import { smsService, type SmsSendResult } from "./sms.service";
import { handleOrderCreated } from "./handlers/order-created.handler";
import { handleOrderStatusUpdated } from "./handlers/order-status-updated.handler";
import { handleOrderPaymentUpdated } from "./handlers/order-payment-updated.handler";
import { handleHotelCreated } from "./handlers/hotel-created.handler";
import { handleHotelAdminCreated } from "./handlers/hotel-admin-created.handler";
import { handleHotelStaffCreated } from "./handlers/hotel-staff-created.handler";
import { handleHotelStatusUpdated } from "./handlers/hotel-status-updated.handler";
import { handlePlatformAdminCreated } from "./handlers/platform-admin-created.handler";
import { handleAccountLedgerEvent } from "./handlers/account-ledger.handler";
import { handleSmsDeliveryFailed } from "./handlers/sms-delivery-failed.handler";

const POLL_INTERVAL_MS = 3000;
const GRACE_PERIOD_MS = 5000;
const DELIVERY_POLL_MS = 30_000;
// A notification is sent once, then retried at most twice after confirmed
// delivery failures. More automatic sends turn a delivery problem into
// duplicate messages for real customers.
const MAX_SMS_SEND_ATTEMPTS = 3;

type HandlerResult = boolean | SmsSendResult;
type HandlerFn = (payload: Record<string, unknown>) => Promise<HandlerResult>;

const HANDLER_MAP: Record<string, HandlerFn> = {
  order_created: handleOrderCreated,
  order_status_updated: handleOrderStatusUpdated,
  order_payment_updated: handleOrderPaymentUpdated,
  hotel_created: handleHotelCreated,
  hotel_status_updated: handleHotelStatusUpdated,
  hotel_admin_created: handleHotelAdminCreated,
  hotel_staff_created: handleHotelStaffCreated,
  platform_admin_created: handlePlatformAdminCreated,
  customer_account_credited: (payload) => handleAccountLedgerEvent("credited", payload),
  customer_account_payment_recorded: (payload) => handleAccountLedgerEvent("payment", payload),
  customer_account_refund_recorded: (payload) => handleAccountLedgerEvent("refund", payload),
  customer_account_adjusted: (payload) => handleAccountLedgerEvent("adjustment", payload),
  sms_delivery_failed: handleSmsDeliveryFailed,
};

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let processing = false;

function retryAt(attempt: number): Date {
  // The sole automatic resend is delayed briefly to let transient gateway
  // failures clear; further resends require an explicit platform-admin retry.
  return new Date(Date.now() + Math.min(96_000, 3_000 * 2 ** Math.max(0, attempt - 1)));
}

function deliveryCheckAt(): Date { return new Date(Date.now() + DELIVERY_POLL_MS); }
function isAbsentSubscriber(status: string): boolean { return /absent\s*subscriber|absentsubscriber/.test(status.toLowerCase()); }

function resultDetails(result: HandlerResult) {
  if (typeof result === "boolean") return { success: result, providerMessageId: undefined, providerStatus: undefined, error: undefined };
  return { success: result.accepted, providerMessageId: result.messageId, providerStatus: result.providerStatus, error: result.error };
}

async function alertResponsibleHotelAdmin(row: { id: string; eventName: string; hotelId: string | null; payload: string; providerStatus: string | null }) {
  // The alert itself must never cause another alert event, otherwise an
  // unreachable admin phone would create an infinite event chain.
  if (!row.hotelId || row.eventName === "sms_delivery_failed") return;
  let orderNumber: number | undefined;
  try {
    const payload = JSON.parse(row.payload) as { orderNumber?: unknown };
    if (typeof payload.orderNumber === "number") orderNumber = payload.orderNumber;
  } catch { /* The original row is already terminal; omit optional context. */ }
  await prisma.eventOutbox.create({
    data: {
      eventName: "sms_delivery_failed",
      hotelId: row.hotelId,
      status: "initialized",
      payload: JSON.stringify({ hotelId: row.hotelId, eventName: row.eventName, orderNumber, providerStatus: row.providerStatus }),
    },
  });
}

async function processOutbox(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    const cutoff = new Date(Date.now() - GRACE_PERIOD_MS);

    const deliveryRows = await prisma.eventOutbox.findMany({
      where: { status: "awaiting_delivery", nextAttemptAt: { lte: new Date() }, providerMessageId: { not: null } },
      orderBy: { nextAttemptAt: "asc" }, take: 20,
    });

    for (const row of deliveryRows) {
      const report = await smsService.getDelivery?.(row.providerMessageId!);
      if (!report || report.state === "pending") {
        const checks = row.deliveryChecks + 1;
        await prisma.eventOutbox.update({ where: { id: row.id }, data: { deliveryChecks: checks, providerStatus: report?.providerStatus ?? "awaiting_delivery_report", lastError: report?.error ?? null, nextAttemptAt: deliveryCheckAt() } });
        continue;
      }
      if (report.state === "delivered") {
        await prisma.eventOutbox.update({ where: { id: row.id }, data: { status: "delivered", completedAt: new Date(), providerStatus: report.providerStatus, lastError: null } });
        continue;
      }
      const absent = isAbsentSubscriber(report.providerStatus);
      const maxResends = absent ? 1 : MAX_SMS_SEND_ATTEMPTS - 1;
      const exhausted = row.deliveryRetryCount >= maxResends;
      if (exhausted) {
        await prisma.eventOutbox.update({ where: { id: row.id }, data: { status: "failed", completedAt: new Date(), providerStatus: report.providerStatus, lastError: absent ? "Absent subscriber after one resend" : report.error || "SMS was not delivered after 3 attempts" } });
        await alertResponsibleHotelAdmin({ ...row, providerStatus: report.providerStatus });
      } else {
        const resendCount = row.deliveryRetryCount + 1;
        await prisma.eventOutbox.update({ where: { id: row.id }, data: { status: "pending", attempts: 1, providerMessageId: null, providerStatus: absent ? "absent_subscriber_retrying_once" : "delivery_failed_retrying_once", deliveryRetryCount: resendCount, deliveryChecks: 0, lastError: report.error || report.providerStatus, nextAttemptAt: retryAt(resendCount) } });
      }
    }

    const rows = await prisma.eventOutbox.findMany({
      where: {
        status: { in: ["initialized", "pending"] },
        createdAt: { lte: cutoff },
        nextAttemptAt: { lte: new Date() },
      },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    for (const row of rows) {
      const handler = HANDLER_MAP[row.eventName as string];
      if (!handler) {
        await prisma.eventOutbox.update({
          where: { id: row.id },
          data: { status: "failed", lastError: `No handler for event: ${row.eventName}` },
        });
        continue;
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(row.payload);
      } catch {
        await prisma.eventOutbox.update({
          where: { id: row.id },
          data: { status: "failed", lastError: "Invalid JSON payload" },
        });
        continue;
      }

      try {
        const details = resultDetails(await handler(payload));
        if (details.success) {
          // Without a provider ID there can be no delivery report. Do not
          // resend blindly: a gateway may have already accepted the SMS.
          if (env.smsProvider === "textsms" && !details.providerMessageId) {
            await prisma.eventOutbox.update({
              where: { id: row.id },
              data: { status: "failed", completedAt: new Date(), attempts: row.attempts + 1, lastError: "SMS gateway accepted the message but returned no delivery-report ID; no resend was made", providerStatus: details.providerStatus ?? "unverifiable_acceptance" },
            });
            continue;
          }
          const awaitDelivery = env.smsProvider === "textsms" && Boolean(details.providerMessageId && smsService.getDelivery);
          await prisma.eventOutbox.update({
            where: { id: row.id },
            data: awaitDelivery
              ? { status: "awaiting_delivery", lastError: null, providerMessageId: details.providerMessageId, providerStatus: details.providerStatus ?? "accepted", nextAttemptAt: deliveryCheckAt() }
              : { status: "delivered", completedAt: new Date(), lastError: null, providerMessageId: details.providerMessageId, providerStatus: details.providerStatus ?? "accepted" },
          });
        } else {
          const newAttempts = row.attempts + 1;
          await prisma.eventOutbox.update({
            where: { id: row.id },
            data: { status: "failed", completedAt: new Date(), attempts: newAttempts, lastError: details.error || "SMS provider did not accept the message; no resend was made without a failed delivery report", providerStatus: details.providerStatus ?? "rejected" },
          });
        }
      } catch (err: any) {
        const newAttempts = row.attempts + 1;
        const lastError = err?.message || "Unknown handler error";
        await prisma.eventOutbox.update({
          where: { id: row.id },
          data: { status: "failed", completedAt: new Date(), attempts: newAttempts, lastError: `${lastError}; no resend was made without a failed delivery report`, providerStatus: "dispatch_error" },
        });
      }
    }
  } catch (err) {
    console.error("[Outbox Dispatcher] Poll error:", err);
  } finally { processing = false; }
}

export function startDispatcher(): void {
  if (intervalHandle) return;
  console.log("[Outbox Dispatcher] Starting — polling every", POLL_INTERVAL_MS, "ms");
  processOutbox();
  intervalHandle = setInterval(processOutbox, POLL_INTERVAL_MS);
}

export function stopDispatcher(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[Outbox Dispatcher] Stopped");
  }
}
