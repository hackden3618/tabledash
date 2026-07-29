import { smsService } from "../sms.service";

const APP_LINK = "https://tabledash.up.railway.app";

interface OrderStatusPayload {
  orderId: string;
  orderNumber: number;
  customerName: string;
  firstName?: string;
  lastName?: string;
  knownName?: string;
  customerPhone: string;
  totalAmount: number;
  newStatus: string;
  stallNumber?: string;
  cancelReason?: string;
  hotelName?: string;
}

const CUSTOMER_NOTIFIED_STATUSES = ["ACCEPTED", "OUT_FOR_DELIVERY", "CANCELLED"];

export async function handleOrderStatusUpdated(payload: Record<string, unknown>): Promise<boolean> {
  const data = payload as unknown as OrderStatusPayload;
  const hotelName = data.hotelName || "Ladha Deliveries";

  if (!CUSTOMER_NOTIFIED_STATUSES.includes(data.newStatus)) return true;

  const stallInfo = data.stallNumber ? ` at Stall ${data.stallNumber}` : " at your stall";
  const displayName = data.customerName;

  let message: string;
  if (data.newStatus === "ACCEPTED") {
    message = `Hello ${displayName}, your order #${data.orderNumber} from ${hotelName} has been ACCEPTED! It is now being processed. Track your order: ${APP_LINK}`;
  } else if (data.newStatus === "OUT_FOR_DELIVERY") {
    message = `Hello ${displayName}, your order #${data.orderNumber} from ${hotelName} is OUT FOR DELIVERY! Be ready to receive your delivery${stallInfo}. Our rider is on the way. Total: KSh ${data.totalAmount}. Track: ${APP_LINK}`;
  } else if (data.newStatus === "CANCELLED") {
    const isCustomerCancel = (data.cancelReason || "").toLowerCase().includes("customer");
    if (isCustomerCancel) {
      message = `Hello ${displayName}, order #${data.orderNumber} from ${data.hotelName || "Ladha Deliveries"} has been CANCELLED as you requested. Track your orders: ${APP_LINK}`;
    } else {
      const reason = data.cancelReason || "we are unable to deliver your order at this time";
      message = `Hello ${displayName}, we are sorry to inform you that order #${data.orderNumber} has been cancelled. Reason: ${reason}. We appreciate your understanding. Reach us: ${APP_LINK}`;
    }
  } else {
    return true;
  }

  if (!data.customerPhone) return true;

  const result = await smsService.sendSms(data.customerPhone, message);
  return result;
}
