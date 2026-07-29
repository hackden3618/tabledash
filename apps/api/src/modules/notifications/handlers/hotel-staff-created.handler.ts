import { smsService } from "../sms.service";

interface HotelStaffCreatedPayload {
  staffName: string;
  staffPhone: string;
  hotelName: string;
  username?: string;
  tempPassword?: string;
  role?: string;
  appLink?: string;
}

export async function handleHotelStaffCreated(payload: Record<string, unknown>): Promise<boolean> {
  const data = payload as unknown as HotelStaffCreatedPayload;

  if (!data.staffPhone) return true;

  const login = data.tempPassword ? ` Login: ${data.username}. Temporary password: ${data.tempPassword}. Open ${data.appLink || "https://tabledash.up.railway.app/kitchen"} and change it after signing in.` : "";
  const message = `Hello ${data.staffName}, you've been added as ${data.role === "HOTEL_STAFF" ? "hotel staff" : "staff"} at ${data.hotelName}.${login} You will receive order alerts via SMS. - Ladha Deliveries`;

  const result = await smsService.sendSms(data.staffPhone, message);
  return result;
}
