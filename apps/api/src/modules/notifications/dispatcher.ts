/**
 * Purpose: Transactional Outbox Dispatcher for tableDash.
 * Responsibilities: Polls EventOutbox for unprocessed events, dispatches via the appropriate handler,
 *   marks done on success, retries with capped attempts on failure.
 * Dependencies: Prisma client, notification handlers.
 * When to modify: When adding new event handlers or changing dispatch/retry logic.
 */

import { prisma } from "../../../../../infrastructure/database/prisma";
import type { EventName } from "../../../../../generated/prisma/client";
import { handleOrderCreated } from "./handlers/order-created.handler";
import { handleOrderStatusUpdated } from "./handlers/order-status-updated.handler";
import { handleHotelCreated } from "./handlers/hotel-created.handler";
import { handleHotelAdminCreated } from "./handlers/hotel-admin-created.handler";
import { handleHotelStaffCreated } from "./handlers/hotel-staff-created.handler";
import { handlePlatformAdminCreated } from "./handlers/platform-admin-created.handler";

const MAX_RETRIES = 5;
const POLL_INTERVAL_MS = 3000;
const GRACE_PERIOD_MS = 5000;

type HandlerFn = (payload: Record<string, unknown>) => Promise<boolean>;

const HANDLER_MAP: Record<string, HandlerFn> = {
  order_created: handleOrderCreated,
  order_status_updated: handleOrderStatusUpdated,
  hotel_created: handleHotelCreated,
  hotel_admin_created: handleHotelAdminCreated,
  hotel_staff_created: handleHotelStaffCreated,
  platform_admin_created: handlePlatformAdminCreated,
};

let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function processOutbox(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - GRACE_PERIOD_MS);

    const rows = await prisma.eventOutbox.findMany({
      where: {
        status: { in: ["initialized", "pending"] },
        createdAt: { lte: cutoff },
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
        const success = await handler(payload);
        if (success) {
          await prisma.eventOutbox.update({
            where: { id: row.id },
            data: { status: "done", completedAt: new Date() },
          });
        } else {
          const newAttempts = row.attempts + 1;
          if (newAttempts >= MAX_RETRIES) {
            await prisma.eventOutbox.update({
              where: { id: row.id },
              data: { status: "failed", attempts: newAttempts, lastError: "Max retries exceeded" },
            });
          } else {
            await prisma.eventOutbox.update({
              where: { id: row.id },
              data: { status: "pending", attempts: newAttempts, lastError: "Handler returned false" },
            });
          }
        }
      } catch (err: any) {
        const newAttempts = row.attempts + 1;
        const lastError = err?.message || "Unknown handler error";
        if (newAttempts >= MAX_RETRIES) {
          await prisma.eventOutbox.update({
            where: { id: row.id },
            data: { status: "failed", attempts: newAttempts, lastError },
          });
        } else {
          await prisma.eventOutbox.update({
            where: { id: row.id },
            data: { status: "pending", attempts: newAttempts, lastError },
          });
        }
      }
    }
  } catch (err) {
    console.error("[Outbox Dispatcher] Poll error:", err);
  }
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
