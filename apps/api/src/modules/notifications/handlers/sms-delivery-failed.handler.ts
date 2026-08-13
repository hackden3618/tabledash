import { prisma } from "../../../../../../infrastructure/database/prisma";
import { smsService, type SmsSendResult } from "../sms.service";

interface SmsDeliveryFailedPayload {
  hotelId?: string;
  eventName: string;
  orderNumber?: number;
  providerStatus?: string;
}

/** Alerts the hotel administrator after the customer's SMS has exhausted all
 * delivery attempts. This event is intentionally not allowed to create another
 * alert if its own SMS fails, preventing an alert loop. */
export async function handleSmsDeliveryFailed(payload: Record<string, unknown>): Promise<boolean | SmsSendResult> {
  const data = payload as unknown as SmsDeliveryFailedPayload;
  if (!data.hotelId) return true;

  const responsibleAdmin = await prisma.staffUser.findFirst({
    where: { hotelId: data.hotelId, receiveSms: true, adminUser: { is: { role: "HOTEL_ADMIN" } } },
    select: { phone: true, hotel: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!responsibleAdmin) return true;

  const subject = data.orderNumber ? `order #${data.orderNumber}` : "a customer notification";
  const message = `[Ladha] ${responsibleAdmin.hotel.name}: SMS for ${subject} was not delivered after 3 attempts (${data.providerStatus || "delivery failed"}). Please contact the customer directly.`;
  return smsService.sendSms(responsibleAdmin.phone, message);
}
