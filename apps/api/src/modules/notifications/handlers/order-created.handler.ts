import { smsService } from "../sms.service";
import { getSmsRecipients } from "../../settings/service";

interface OrderCreatedPayload {
  orderId: string;
  orderNumber: number;
  customerName: string;
  customerPhone: string;
  totalAmount: number;
  itemsSummary: string;
  marketSection?: string;
  locationDescription?: string;
  hotelName?: string;
}

export async function handleOrderCreated(payload: Record<string, unknown>): Promise<boolean> {
  const data = payload as unknown as OrderCreatedPayload;
  const hotelName = data.hotelName || "TableDash Deliveries";

  const staffPhones = await getSmsRecipients();
  if (staffPhones.length === 0) return true;

  const message = `[${hotelName}] NEW ORDER #${data.orderNumber} from ${data.customerName} (${data.customerPhone}). Total: KSh ${data.totalAmount}. Items: ${data.itemsSummary}`;

  const results = await Promise.allSettled(
    staffPhones.map((phone) => smsService.sendSms(phone, message))
  );

  return results.some((r) => r.status === "fulfilled" && r.value);
}
