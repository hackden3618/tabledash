import { prisma } from "../../../../../../infrastructure/database/prisma";
import { smsService } from "../sms.service";
import { wsHub } from "../../websocket/hub";

interface AccountAdjustmentPayload {
  customerId: string;
  orderId: string;
  orderNumber: number;
  recordId: string;
  amount: number;
  type: string;
  balance: number;
  hotelId: string;
  reason?: string;
}

export async function handleAccountAdjustment(payload: Record<string, unknown>): Promise<boolean> {
  const data = payload as unknown as AccountAdjustmentPayload;

  const customer = await prisma.customer.findUnique({
    where: { id: data.customerId },
    select: { id: true, firstName: true, knownName: true, phone: true, verifiedAt: true },
  });
  if (!customer) return false;
  if (!customer.verifiedAt) return true; // Skip notifications for unverified customers

  const order = await prisma.order.findUnique({
    where: { id: data.orderId },
    select: { orderNumber: true },
  });
  if (!order) return false;

  const displayName = customer.knownName || customer.firstName;
  const msg = `Dear ${displayName}, your account has been adjusted for your order #${order.orderNumber}, amount: KSh ${data.amount}. New outstanding balance is: KSh ${data.balance}. We hope you enjoy our services.`;

  // SMS
  let smsOk = true;
  if (customer.phone) {
    smsOk = await smsService.sendSms(customer.phone, msg).catch(() => false);
  }

  // In-app notification
  try {
    const notification = await prisma.notification.create({
      data: {
        customerId: data.customerId,
        hotelId: data.hotelId,
        orderId: data.orderId,
        type: "WALLET_ADJUSTMENT",
        title: "Account adjusted",
        body: msg,
      },
    });
    broadcastLive(customer.id, notification.id, "WALLET_ADJUSTMENT", "Account adjusted", msg);
  } catch {
    // Non-critical — notification is a convenience, not a guarantee
  }

  return smsOk;
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
