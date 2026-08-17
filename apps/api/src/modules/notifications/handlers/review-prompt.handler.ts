import { env } from "../../../../../../shared/config";
import { smsService, type SmsSendResult } from "../sms.service";
import { reviewPromptToCustomer } from "../templates";

interface ReviewPromptPayload {
  orderId: string;
  orderNumber: number;
  customerPhone: string;
  firstName: string;
  hotelName: string;
  itemNames: string[];
}

// Fired at most once per order (see maybeQueueReviewPromptTx in finance/service.ts
// for the atomic claim that guarantees this). Links straight to the review
// widget on the order's tracking page rather than a new page — that widget
// already exists and is what the in-app "How was your order?" prompt uses.
export async function handleReviewPrompt(payload: Record<string, unknown>): Promise<SmsSendResult> {
  const data = payload as unknown as ReviewPromptPayload;

  const link = `${env.publicUrl.replace(/\/$/, "")}/orders/${data.orderId}/tracking#review`;
  const message = reviewPromptToCustomer({
    firstName: data.firstName,
    orderNumber: data.orderNumber,
    hotelName: data.hotelName,
    itemNames: data.itemNames ?? [],
    link,
  });

  return smsService.sendSms(data.customerPhone, message);
}
