import { smsService } from "../sms.service";

interface OrderPaymentUpdatedPayload {
  orderId: string;
  orderNumber: number;
  customerName: string;
  customerPhone: string;
  paymentStatus: string;
  amountPaid: number;
  totalAmount: number;
  hotelName?: string;
}

export async function handleOrderPaymentUpdated(payload: Record<string, unknown>): Promise<boolean> {
  const data = payload as unknown as OrderPaymentUpdatedPayload;

  if (!data.customerPhone || data.paymentStatus === "UNPAID") return true;

  const hotelName = data.hotelName || "TableDash Deliveries";
  const msg = `Hello ${data.customerName}, payment for order #${data.orderNumber} from ${hotelName} has been updated to ${data.paymentStatus === "PAID" ? "PAID ✅" : "PARTIAL"} (KSh ${data.amountPaid}/KSh ${data.totalAmount}). Thank you!`;

  const result = await smsService.sendSms(data.customerPhone, msg);
  return result;
}
