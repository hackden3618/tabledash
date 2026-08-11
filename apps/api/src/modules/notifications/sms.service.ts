/**
 * Purpose: SMS Notification Service for ladha online ordering system.
 * Responsibilities: Handles dispatching SMS text messages for order placement and updates.
 * Dependencies: textsms.co.ke REST API, Environment configuration from shared/config.ts.
 * When to modify: When switching SMS provider gateways, updating message templates, or adjusting API credentials.
 */

import { env } from "../../../../../shared/config";
import { formatPhone } from "../../../../../shared/phone";

/**
 * True when the message contains any non-ASCII character (emojis, accented
 * letters). GSM-7 (ASCII) messages carry 160 characters per segment; anything
 * requiring the Unicode alphabet drops to 70 per segment and roughly doubles
 * the cost of a long message.
 */
function isUnicodeSms(message: string): boolean {
  for (const char of message) {
    if (char.codePointAt(0)! > 0x7e) return true;
  }
  return false;
}

/**
 * Estimates the number of SMS segments a message will bill as, so senders can
 * observe cost. ASCII → 160 chars/segment, Unicode → 70 chars/segment.
 */
export function estimateSegments(message: string): number {
  const perSegment = isUnicodeSms(message) ? 70 : 160;
  return Math.max(1, Math.ceil(message.length / perSegment));
}

/**
 * Interface defining the contract for SMS dispatch drivers.
 */
export interface ISmsDriver {
  /**
   * Dispatches an SMS message to a mobile number.
   * @param recipientPhone Destination mobile phone number (e.g. 0712345678 or 254712345678).
   * @param message Text message body.
   */
  sendSms(recipientPhone: string, message: string): Promise<boolean>;
}

/**
 * Production driver utilizing TextSMS.co.ke REST API.
 */
export class TextSmsDriver implements ISmsDriver {
  private readonly apiUrl = "https://sms.textsms.co.ke/api/services/sendsms/";

  constructor() {
    console.log(`[SMS Driver] TextSMS.co.ke configured: ${Boolean(env.textSmsApiKey && env.textSmsPartnerId)}`);
  }

  public async sendSms(recipientPhone: string, message: string): Promise<boolean> {
    const formattedPhone = formatPhone(recipientPhone);
    const segments = estimateSegments(message);
    console.log(`[SMS] To ending ${formattedPhone.slice(-4)} chars=${message.length} segments=${segments}`);

    if (!env.textSmsApiKey || !env.textSmsPartnerId) {
      console.log(`\n========================================`);
      console.log(`[DEV SMS — TextSMS credentials missing] To: ${formattedPhone}`);
      console.log(`[Message]: ${message}`);
      console.log(`========================================\n`);
      return true;
    }

    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apikey: env.textSmsApiKey,
          partnerID: env.textSmsPartnerId,
          mobile: formattedPhone,
          message: message,
          shortcode: env.textSmsShortcode,
          pass_type: "plain",
        }),
      });

      // Read the raw text first — TextSMS.co.ke may return plain text or JSON
      const rawText = await response.text();
      console.log(`[SMS Gateway Response] HTTP ${response.status} to recipient ending ${formattedPhone.slice(-4)}`);

      if (env.smsLogMessages) {
        console.log(`[SMS Debug] To: ${formattedPhone}\n[SMS Debug Message]: ${message}\n[SMS Debug Gateway Body]: ${rawText}`);
      }

      // Try parsing JSON; if it fails, treat raw text as the result payload
      let data: unknown;
      try {
        data = JSON.parse(rawText);
      } catch {
        data = rawText;
      }

      if (response.ok) {
        console.log("[SMS Dispatched successfully via TextSMS.co.ke]");
        return true;
      } else {
        console.error(`[SMS Dispatch Failed] HTTP ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error("[SMS Dispatch Error via TextSMS.co.ke]:", error);
      return false;
    }
  }
}

/**
 * Local development driver printing SMS to stdout console without sending real SMS messages.
 */
export class ConsoleSmsDriver implements ISmsDriver {
  public async sendSms(recipientPhone: string, message: string): Promise<boolean> {
    const segments = estimateSegments(message);
    console.log(`\n========================================`);
    console.log(`[DEV SMS SIMULATION] To: ${recipientPhone}`);
    console.log(`[Message]: ${message}`);
    console.log(`[SMS] chars=${message.length} segments=${segments}`);
    console.log(`========================================\n`);
    return true;
  }
}

/**
 * Active SMS Service singleton instance based on environment configuration.
 */
export const smsService: ISmsDriver =
  env.smsProvider === "textsms" ? new TextSmsDriver() : new ConsoleSmsDriver();
