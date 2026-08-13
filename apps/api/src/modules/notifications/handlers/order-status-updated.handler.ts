import { prisma } from "../../../../../../infrastructure/database/prisma";
import { env } from "../../../../../../shared/config";
import { smsService } from "../sms.service";
import { getSmsRecipients } from "../../settings/service";
import { sendPushToCustomer, sendPushToHotelAdmins } from "../../push/service";
import {
  orderAcceptedToCustomer,
  orderOutForDeliveryToCustomer,
  firstDeliveredToCustomer,
  customerCancellation,
  hotelCancellation,
  orderCancelledToHotel,
} from "../templates";

interface OrderStatusPayload {
  orderId: string;
  hotelId?: string;
  customerId?: string;
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

  // Push — independent of SMS delivery below; reaches the customer's phone
  // even with the tab closed, which is the whole point of "not excusable."
  if (data.customerId) {
    await sendPushToCustomer(data.customerId, {
      title: hotelName,
      body: message,
      url: `/orders/${data.orderId}/tracking`,
      tag: `order-${data.orderId}`,
    }).catch(() => 0);
  }

  const customerSent = data.customerPhone ? (await smsService.sendSms(data.customerPhone, message)).accepted : false;

  // Hotel staff abort alert — sent in addition to the customer SMS on cancellation.
  if (data.newStatus === "CANCELLED" && data.hotelId) {
    const cancelPushTitle = `Order #${data.orderNumber} cancelled`;
    const cancelPushBody = `${data.stallNumber ? `Stall ${data.stallNumber} — ` : ""}${data.cancelReason || "Staff unavailable"}`;
    await sendPushToHotelAdmins(data.hotelId, { title: cancelPushTitle, body: cancelPushBody, url: "/kitchen/orders", tag: `order-${data.orderId}` }).catch(() => 0);

    const staffPhones = await getSmsRecipients(data.hotelId).catch(() => []);
    if (staffPhones.length > 0) {
      const abortMsg = orderCancelledToHotel({
        hotelName,
        orderNumber: data.orderNumber,
        stallNumber: data.stallNumber,
        reason: data.cancelReason || "Staff unavailable",
      });
      await Promise.all(staffPhones.map((phone) => smsService.sendSms(phone, abortMsg).catch(() => ({ accepted: false }))));
    }
  }

  return customerSent;
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
