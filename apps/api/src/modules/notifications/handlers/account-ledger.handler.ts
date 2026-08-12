import { prisma } from "../../../../../../infrastructure/database/prisma";
import type { NotificationType } from "../../../../../../generated/prisma/client";
import { smsService } from "../sms.service";
import { wsHub } from "../../websocket/hub";
import {
  accountCredit,
  accountPayment,
  accountRefund,
  accountAdjustment,
} from "../templates";
import { sendPushToCustomer } from "../../push/service";

/**
 * Purpose: Single outbox handler for the four customer-account ledger events.
 * Responsibilities: Loads the customer + order, builds the SMS via the typed
 *   templates, sends the SMS, and fans out the in-app notification. All four
 *   events share one code path so behavior cannot drift between them.
 * When to modify: When an account financial movement's SMS/notification copy
 *   or delivery rules change.
 */

export type AccountLedgerEventType = "credited" | "payment" | "refund" | "adjustment";

interface AccountLedgerPayload {
  customerId: string;
  orderId: string;
  orderNumber?: number;
  amount: number;
  balance: number;
  hotelId: string;
  reason?: string;
}

const NOTIFICATION_META: Record<AccountLedgerEventType, { type: NotificationType; title: string }> = {
  credited: { type: "WALLET_CREDIT", title: "Account credited" },
  payment: { type: "WALLET_PAYMENT", title: "Payment recorded" },
  refund: { type: "WALLET_REFUND", title: "Refund issued" },
  adjustment: { type: "WALLET_ADJUSTMENT", title: "Account adjusted" },
};

export async function handleAccountLedgerEvent(type: AccountLedgerEventType, payload: Record<string, unknown>): Promise<boolean> {
  const data = payload as unknown as AccountLedgerPayload;

  const customer = await prisma.customer.findUnique({
    where: { id: data.customerId },
    select: { id: true, firstName: true, knownName: true, phone: true, verifiedAt: true },
  });
  if (!customer) return false;
  if (!customer.verifiedAt) return true; // Skip notifications for unverified customers

  const orderNumber = data.orderNumber ?? await resolveOrderNumber(data.orderId);
  if (!orderNumber) return false;

  const msg = buildLedgerSms(type, {
    orderNumber,
    amount: data.amount,
    balance: data.balance,
    reason: data.reason,
  });

  // SMS
  let smsOk = true;
  if (customer.phone) {
    smsOk = await smsService.sendSms(customer.phone, msg).catch(() => false);
  }

  // In-app notification + Web Push to OS notification shade
  try {
    const meta = NOTIFICATION_META[type];
    const hotel = await prisma.hotel.findUnique({ where: { id: data.hotelId }, select: { name: true } });
    const hotelName = hotel?.name || "Ladha";
    const notificationTitle = `${hotelName} — ${meta.title}`;

    const notification = await prisma.notification.create({
      data: {
        customerId: data.customerId,
        hotelId: data.hotelId,
        orderId: data.orderId,
        type: meta.type,
        title: notificationTitle,
        body: msg,
      },
    });
    broadcastLive(customer.id, notification.id, meta.type, notificationTitle, msg);
    // Push notification — reaches the customer's device even when app/browser is closed
    await sendPushToCustomer(data.customerId, {
      title: notificationTitle,
      body: msg,
      url: "/wallet",
      tag: `ledger-${data.orderId}`,
    }).catch(() => 0);
  } catch {
    // Non-critical — notification is a convenience, not a guarantee
  }

  return smsOk;
}

function buildLedgerSms(
  type: AccountLedgerEventType,
  p: { orderNumber: number; amount: number; balance: number; reason?: string },
): string {
  switch (type) {
    case "credited":
      return accountCredit({ orderNumber: p.orderNumber, amount: p.amount, balance: p.balance });
    case "payment":
      return accountPayment({ orderNumber: p.orderNumber, amount: p.amount, balance: p.balance });
    case "refund":
      return accountRefund({ orderNumber: p.orderNumber, amount: p.amount, balance: p.balance });
    case "adjustment":
      return accountAdjustment({ orderNumber: p.orderNumber, amount: p.amount, balance: p.balance, reason: p.reason });
  }
}

async function resolveOrderNumber(orderId: string): Promise<number | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { orderNumber: true },
  });
  return order?.orderNumber ?? null;
}

/** Pushes the persisted notification live over the single WS connection. */
async function broadcastLive(
  customerId: string,
  notificationId: string,
  type: string,
  title: string,
  body: string,
) {
  try {
    const sessions = await prisma.guestIdentity.findMany({
      where: { customerId },
      select: { id: true },
    });
    const identityKeys = [`customer:${customerId}`, ...sessions.map((s) => `guest:${s.id}`)];
    wsHub.broadcastToIdentities(identityKeys, {
      type: "WALLET_UPDATED",
      payload: { notification: { id: notificationId, type, title, body, read: false } },
    });
  } catch {
    // Live push is convenience only — the DB row is already the source of truth.
  }
}