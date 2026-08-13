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
  sendSms(recipientPhone: string, message: string): Promise<SmsSendResult>;
  getDelivery?(messageId: string): Promise<SmsDeliveryResult>;
}

/** A gateway acceptance is not the same thing as handset delivery. The gateway
 * message ID is retained so delivery-report polling can be added without
 * changing the send contract. */
export interface SmsSendResult {
  accepted: boolean;
  messageId?: string;
  providerStatus: string;
  error?: string;
}

export type SmsDeliveryState = "delivered" | "pending" | "failed";
export interface SmsDeliveryResult {
  state: SmsDeliveryState;
  providerStatus: string;
  error?: string;
}

function gatewayEntry(data: unknown): any | null {
  return typeof data === "object" && data && Array.isArray((data as any).responses) ? (data as any).responses[0] : null;
}

function parseGatewayResponse(rawText: string): unknown {
  try { return JSON.parse(rawText); } catch { return rawText; }
}

/**
 * Production driver utilizing TextSMS.co.ke REST API.
 */
export class TextSmsDriver implements ISmsDriver {
  private readonly apiUrl = "https://sms.textsms.co.ke/api/services/sendsms/";

  constructor() {
    console.log(`[SMS Driver] TextSMS.co.ke configured: ${Boolean(env.textSmsApiKey && env.textSmsPartnerId)}`);
  }

  public async sendSms(recipientPhone: string, message: string): Promise<SmsSendResult> {
    const formattedPhone = formatPhone(recipientPhone);
    const segments = estimateSegments(message);
    console.log(`[SMS] To ending ${formattedPhone.slice(-4)} chars=${message.length} segments=${segments}`);

    if (!env.textSmsApiKey || !env.textSmsPartnerId) {
      console.log(`\n========================================`);
      console.log(`[DEV SMS — TextSMS credentials missing] To: ${formattedPhone}`);
      console.log(`[Message]: ${message}`);
      console.log(`========================================\n`);
      return { accepted: true, providerStatus: "simulated" };
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
      const data = parseGatewayResponse(rawText);

      const gateway = gatewayEntry(data);
      const code = gateway?.["respose-code"] ?? gateway?.["response-code"] ?? gateway?.code;
      const description = gateway?.["response-description"] ?? gateway?.description;
      const accepted = response.ok && Number(code) === 200;
      if (accepted) {
        const messageId = gateway?.messageid ? String(gateway.messageid) : undefined;
        console.log(`[SMS Accepted by TextSMS] messageId=${messageId ?? "not returned"}`);
        return { accepted: true, messageId, providerStatus: description || "accepted" };
      }
      const error = description || `TextSMS rejected request (HTTP ${response.status}${code ? `, code ${code}` : ""})`;
      console.error(`[SMS Dispatch Failed] ${error}`);
      return { accepted: false, providerStatus: "rejected", error };
    } catch (error) {
      console.error("[SMS Dispatch Error via TextSMS.co.ke]:", error);
      return { accepted: false, providerStatus: "transport_error", error: error instanceof Error ? error.message : "SMS transport error" };
    }
  }

  /** TextSMS returns the message ID at submission. Querying its documented
   * getdlr endpoint distinguishes gateway acceptance from handset delivery. */
  public async getDelivery(messageId: string): Promise<SmsDeliveryResult> {
    if (!env.textSmsApiKey || !env.textSmsPartnerId) return { state: "delivered", providerStatus: "simulated" };
    try {
      const response = await fetch("https://sms.textsms.co.ke/api/services/getdlr/", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apikey: env.textSmsApiKey, partnerID: env.textSmsPartnerId, messageID: messageId }),
      });
      const rawText = await response.text();
      const entry = gatewayEntry(parseGatewayResponse(rawText));
      const description = String(entry?.["response-description"] ?? entry?.description ?? rawText).trim();
      const normalized = description.toLowerCase();
      if (!response.ok || /no delivery report|details not found|pending|submitted|sent to operator|queued|processing/.test(normalized)) {
        return { state: "pending", providerStatus: description || `HTTP ${response.status}` };
      }
      if (/delivered|delivrd|deliveredtoterminal/.test(normalized) && !/not delivered|undelivered/.test(normalized)) {
        return { state: "delivered", providerStatus: description };
      }
      if (/absent subscriber|absentsubscriber|not delivered|undelivered|expired|failed|rejected|invalid|unknown subscriber|number error|blocked/.test(normalized)) {
        return { state: "failed", providerStatus: description, error: description };
      }
      // A new/undocumented DLR response is never treated as successful.
      return { state: "pending", providerStatus: description || "DLR response not yet recognized" };
    } catch (error) {
      return { state: "pending", providerStatus: "dlr_transport_error", error: error instanceof Error ? error.message : "Unable to query SMS delivery report" };
    }
  }
}

/**
 * Local development driver printing SMS to stdout console without sending real SMS messages.
 */
export class ConsoleSmsDriver implements ISmsDriver {
  public async sendSms(recipientPhone: string, message: string): Promise<SmsSendResult> {
    const segments = estimateSegments(message);
    console.log(`\n========================================`);
    console.log(`[DEV SMS SIMULATION] To: ${recipientPhone}`);
    console.log(`[Message]: ${message}`);
    console.log(`[SMS] chars=${message.length} segments=${segments}`);
    console.log(`========================================\n`);
    return { accepted: true, providerStatus: "simulated" };
  }

  public async getDelivery(_messageId: string): Promise<SmsDeliveryResult> {
    return { state: "delivered", providerStatus: "simulated" };
  }
}

/**
 * Active SMS Service singleton instance based on environment configuration.
 */
export const smsService: ISmsDriver =
  env.smsProvider === "textsms" ? new TextSmsDriver() : new ConsoleSmsDriver();
