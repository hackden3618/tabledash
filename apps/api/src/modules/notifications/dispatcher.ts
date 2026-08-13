/**
 * Purpose: Transactional Outbox Dispatcher for ladha.
 * Responsibilities: Polls EventOutbox for unprocessed events, dispatches via the appropriate handler,
 *   marks done on success, retries with capped attempts on failure.
 * Dependencies: Prisma client, notification handlers.
 * When to modify: When adding new event handlers or changing dispatch/retry logic.
 */

import { prisma } from "../../../../../infrastructure/database/prisma";
import type { SmsSendResult } from "./sms.service";
import { handleOrderCreated } from "./handlers/order-created.handler";
import { handleOrderStatusUpdated } from "./handlers/order-status-updated.handler";
import { handleOrderPaymentUpdated } from "./handlers/order-payment-updated.handler";
import { handleHotelCreated } from "./handlers/hotel-created.handler";
import { handleHotelAdminCreated } from "./handlers/hotel-admin-created.handler";
import { handleHotelStaffCreated } from "./handlers/hotel-staff-created.handler";
import { handleHotelStatusUpdated } from "./handlers/hotel-status-updated.handler";
import { handlePlatformAdminCreated } from "./handlers/platform-admin-created.handler";
import { handleAccountLedgerEvent } from "./handlers/account-ledger.handler";

const MAX_RETRIES = 7;
const POLL_INTERVAL_MS = 3000;
const GRACE_PERIOD_MS = 5000;

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
};

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let processing = false;

function retryAt(attempt: number): Date {
  // 3s, 6s, 12s, 24s, 48s, 96s — bounded exponential backoff.
  return new Date(Date.now() + Math.min(96_000, 3_000 * 2 ** Math.max(0, attempt - 1)));
}

function resultDetails(result: HandlerResult) {
  if (typeof result === "boolean") return { success: result, providerMessageId: undefined, providerStatus: undefined, error: undefined };
  return { success: result.accepted, providerMessageId: result.messageId, providerStatus: result.providerStatus, error: result.error };
}

async function processOutbox(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    const cutoff = new Date(Date.now() - GRACE_PERIOD_MS);

    const rows = await prisma.eventOutbox.findMany({
      where: {
        status: { in: ["initialized", "pending"] },
        createdAt: { lte: cutoff },
        nextAttemptAt: { lte: new Date() },
        attempts: { lt: MAX_RETRIES },
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
          await prisma.eventOutbox.update({
            where: { id: row.id },
            data: { status: "done", completedAt: new Date(), lastError: null, providerMessageId: details.providerMessageId, providerStatus: details.providerStatus ?? "accepted" },
          });
        } else {
          const newAttempts = row.attempts + 1;
          if (newAttempts >= MAX_RETRIES) {
            await prisma.eventOutbox.update({
              where: { id: row.id },
              data: { status: "failed", attempts: newAttempts, lastError: details.error || "SMS provider did not accept the message", providerStatus: details.providerStatus ?? "rejected" },
            });
          } else {
            await prisma.eventOutbox.update({
              where: { id: row.id },
              data: { status: "pending", attempts: newAttempts, lastError: details.error || "SMS provider did not accept the message", providerStatus: details.providerStatus ?? "retrying", nextAttemptAt: retryAt(newAttempts) },
            });
          }
        }
      } catch (err: any) {
        const newAttempts = row.attempts + 1;
        const lastError = err?.message || "Unknown handler error";
        if (newAttempts >= MAX_RETRIES) {
          await prisma.eventOutbox.update({
            where: { id: row.id },
              data: { status: "failed", attempts: newAttempts, lastError, providerStatus: "error" },
          });
        } else {
          await prisma.eventOutbox.update({
            where: { id: row.id },
              data: { status: "pending", attempts: newAttempts, lastError, providerStatus: "retrying", nextAttemptAt: retryAt(newAttempts) },
          });
        }
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
