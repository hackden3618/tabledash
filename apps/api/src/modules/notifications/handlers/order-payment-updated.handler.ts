import { smsService } from "../sms.service";
import { paymentReceived, partialPayment } from "../templates";

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

  const msg =
    data.paymentStatus === "PAID"
      ? paymentReceived({ orderNumber: data.orderNumber, amountPaid: data.amountPaid, totalAmount: data.totalAmount })
      : partialPayment({
          orderNumber: data.orderNumber,
          amountPaid: data.amountPaid,
          totalAmount: data.totalAmount,
          remaining: data.totalAmount - data.amountPaid,
        });

  return (await smsService.sendSms(data.customerPhone, msg)).accepted;
}
