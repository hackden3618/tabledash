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

  const stall = data.stallNumber || data.marketSection;
  const stallStr = stall ? (stall.toLowerCase().startsWith("stall") ? stall : `Stall ${stall}`) : "";
  const locParts = [stallStr, data.locationDescription].filter(Boolean);
  const location = locParts.length > 0 ? locParts.join(" — ") : "N/A";

  const items = data.itemsSummary
    ? (data.itemsSummary.includes("\n") ? data.itemsSummary : data.itemsSummary.split(/,\s*/).join("\n"))
    : "";

  const message = orderAlertToHotel({
    orderNumber: data.orderNumber,
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    locationDescription: location,
    itemsSummary: items,
    totalAmount: data.totalAmount,
  });

  const results = await Promise.allSettled(
    staffPhones.map((phone) => smsService.sendSms(phone, message))
  );

  return results.some((r) => r.status === "fulfilled" && r.value);
}