import { smsService } from "../sms.service";

interface OrderStatusPayload {
  orderId: string;
  orderNumber: number;
  customerName: string;
  customerPhone: string;
  totalAmount: number;
  newStatus: string;
  cancelReason?: string;
  hotelName?: string;
}

const CUSTOMER_NOTIFIED_STATUSES = ["OUT_FOR_DELIVERY", "CANCELLED"];

export async function handleOrderStatusUpdated(payload: Record<string, unknown>): Promise<boolean> {
  const data = payload as unknown as OrderStatusPayload;
  const hotelName = data.hotelName || "TableDash Deliveries";

  if (!CUSTOMER_NOTIFIED_STATUSES.includes(data.newStatus)) return true;

  let message: string;
  if (data.newStatus === "OUT_FOR_DELIVERY") {
    message = `Hello ${data.customerName}, your order #${data.orderNumber} from ${hotelName} is OUT FOR DELIVERY! Be ready to receive your delivery at your stall. Our rider is on the way. Total: KSh ${data.totalAmount}.`;
  } else if (data.newStatus === "CANCELLED") {
    const reason = data.cancelReason || "we are unable to deliver your order at this time";
    message = `Hello ${data.customerName}, we are sorry to inform you that order #${data.orderNumber} has been cancelled. Reason: ${reason}. We appreciate your understanding and hope to serve you next time!`;
  } else {
    return true;
  }

  if (!data.customerPhone) return true;

  const result = await smsService.sendSms(data.customerPhone, message);
  return result;
}
