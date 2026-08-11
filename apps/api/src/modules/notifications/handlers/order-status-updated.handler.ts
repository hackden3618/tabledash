import { prisma } from "../../../../../../infrastructure/database/prisma";
import { env } from "../../../../../../shared/config";
import { smsService } from "../sms.service";
import {
  orderAcceptedToCustomer,
  orderOutForDeliveryToCustomer,
  firstDeliveredToCustomer,
  customerCancellation,
  hotelCancellation,
} from "../templates";

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

const CUSTOMER_NOTIFIED_STATUSES = ["ACCEPTED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"];

export async function handleOrderStatusUpdated(payload: Record<string, unknown>): Promise<boolean> {
  const data = payload as unknown as OrderStatusPayload;
  const hotelName = data.hotelName || "Ladha Deliveries";

  if (!CUSTOMER_NOTIFIED_STATUSES.includes(data.newStatus)) return true;
  if (!data.customerPhone) return true;

  const firstName = data.firstName || data.knownName || data.customerName;

  let message: string;
  if (data.newStatus === "ACCEPTED") {
    message = orderAcceptedToCustomer({
      firstName,
      orderNumber: data.orderNumber,
      hotelName,
      link: env.publicUrl,
    });
  } else if (data.newStatus === "OUT_FOR_DELIVERY") {
    message = orderOutForDeliveryToCustomer({
      firstName,
      orderNumber: data.orderNumber,
      totalAmount: data.totalAmount,
    });
  } else if (data.newStatus === "DELIVERED") {
    // The welcome message goes out once, on the very first delivered order.
    if (!(await isFirstDeliveredOrder(data.customerPhone, data.orderId))) return true;
    message = firstDeliveredToCustomer({ firstName, hotelName });
  } else if (data.newStatus === "CANCELLED") {
    const isCustomerCancel = (data.cancelReason || "").toLowerCase().includes("customer");
    if (isCustomerCancel) {
      message = customerCancellation({ orderNumber: data.orderNumber, link: env.publicUrl });
    } else {
      message = hotelCancellation({
        orderNumber: data.orderNumber,
        hotelName,
        reason: data.cancelReason || "we are unable to deliver your order at this time",
        link: env.publicUrl,
      });
    }
  } else {
    return true;
  }

  const result = await smsService.sendSms(data.customerPhone, message);
  return result;
}

/**
 * True when this order is the first one this customer has ever had delivered.
 * The check looks at delivered orders other than the current one; a phone match
 * is used because the status-update event carries no stable customer id.
 */
async function isFirstDeliveredOrder(customerPhone: string, orderId: string): Promise<boolean> {
  const priorDelivered = await prisma.order.count({
    where: {
      id: { not: orderId },
      status: "DELIVERED",
      customer: { phone: customerPhone },
    },
  });
  return priorDelivered === 0;
}