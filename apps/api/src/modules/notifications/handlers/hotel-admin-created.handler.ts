import { smsService } from "../sms.service";

interface HotelAdminCreatedPayload {
  adminName: string;
  adminPhone: string;
  hotelName: string;
  tempPassword: string;
}

export async function handleHotelAdminCreated(payload: Record<string, unknown>): Promise<boolean> {
  const data = payload as unknown as HotelAdminCreatedPayload;

  if (!data.adminPhone) return true;

  const message = `Welcome to ${data.hotelName}! You've been added as a hotel admin. Login with username "${data.adminName}" and temporary password: ${data.tempPassword}. Please change your password on first login. - TableDash Deliveries`;

  const result = await smsService.sendSms(data.adminPhone, message);
  return result;
}
