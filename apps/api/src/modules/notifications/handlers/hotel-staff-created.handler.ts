import { smsService } from "../sms.service";

interface HotelStaffCreatedPayload {
  staffName: string;
  staffPhone: string;
  hotelName: string;
}

export async function handleHotelStaffCreated(payload: Record<string, unknown>): Promise<boolean> {
  const data = payload as unknown as HotelStaffCreatedPayload;

  if (!data.staffPhone) return true;

  const message = `Hello ${data.staffName}, you've been added as staff at ${data.hotelName}. You will receive order alerts via SMS. - TableDash Deliveries`;

  const result = await smsService.sendSms(data.staffPhone, message);
  return result;
}
