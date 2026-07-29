export function formatPhone(raw: string): string {
  const cleaned = raw.replace(/\D/g, "");
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    return `254${cleaned.slice(1)}`;
  }
  if ((cleaned.startsWith("7") || cleaned.startsWith("1")) && cleaned.length === 9) {
    return `254${cleaned}`;
  }
  if (cleaned.startsWith("254") && cleaned.length === 12) {
    return cleaned;
  }
  return cleaned;
}

export const PHONE_PATTERN = "^254\\d{9}$";

export const PHONE_MIN = 12;
export const PHONE_MAX = 12;
