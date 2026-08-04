import { prisma } from "../../../../../../infrastructure/database/prisma";
import { smsService } from "../sms.service";
import { env } from "../../../../../../shared/config";
import { wsHub } from "../../websocket/hub";

interface AccountPaymentPayload {
  customerId: string;
  orderId: string;
  orderNumber: number;
  recordId: string;
  amount: number;
  type: string;
  paymentMethod: string;
  balance: number;
  hotelId: string;
}

export async function handleAccountPayment(payload: Record<string, unknown>): Promise<boolean> {
  const data = payload as unknown as AccountPaymentPayload;

  const customer = await prisma.customer.findUnique({
    where: { id: data.customerId },
    select: { id: true, firstName: true, knownName: true, phone: true, verifiedAt: true },
  });
  if (!customer) return false;
  if (!customer.verifiedAt) return true; // Skip notifications for unverified customers

  const hotel = await prisma.hotel.findUnique({
    where: { id: data.hotelId },
    select: { name: true },
  });

  const displayName = customer.knownName || customer.firstName;
  const orderNumber = data.orderNumber;
  const publicLink = env.publicUrl;
  const hotelName = hotel?.name || "Ladha Deliveries";
  const msg = `Dear ${displayName}, your payment has been recorded for your order #${orderNumber}, for hotel ${hotelName} amount: KSh ${data.amount}. New outstanding balance is: KSh ${data.balance}. We hope you enjoy our services and come back next time on Ladha Deliveries on ${publicLink}.`;

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
        type: "WALLET_PAYMENT",
        title: "Payment recorded",
        body: msg,
      },
    });
    broadcastLive(customer.id, notification.id, "WALLET_PAYMENT", "Payment recorded", msg);
  } catch {
    // Non-critical
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
