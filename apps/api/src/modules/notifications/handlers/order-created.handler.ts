import { smsService } from "../sms.service";
import { getSmsRecipients } from "../../settings/service";
import { orderAlertToHotel } from "../templates";

interface OrderCreatedPayload {
  orderId: string;
  orderNumber: number;
  customerName: string;
  firstName?: string;
  lastName?: string;
  knownName?: string;
  customerPhone: string;
  totalAmount: number;
  itemsSummary: string;
  stallNumber?: string;
  marketSection?: string;
  locationDescription?: string;
  hotelId?: string;
  hotelName?: string;
}

export async function handleOrderCreated(payload: Record<string, unknown>): Promise<boolean> {
  const data = payload as unknown as OrderCreatedPayload;

  const staffPhones = await getSmsRecipients(data.hotelId);
  if (staffPhones.length === 0) return true;

  const message = orderAlertToHotel({
    orderNumber: data.orderNumber,
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    totalAmount: data.totalAmount,
    stallNumber: data.stallNumber || data.marketSection,
    locationDescription: data.locationDescription,
    itemsSummary: data.itemsSummary,
  });

  const results = await Promise.allSettled(
    staffPhones.map((phone) => smsService.sendSms(phone, message))
  );

  return results.some((r) => r.status === "fulfilled" && r.value);
}