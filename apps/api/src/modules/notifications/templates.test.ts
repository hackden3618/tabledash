import { describe, expect, test } from "bun:test";
import { estimateSegments } from "./sms.service";
import {
  BRAND,
  orderAlertToHotel,
  orderAcceptedToCustomer,
  orderOutForDeliveryToCustomer,
  firstDeliveredToCustomer,
  customerCancellation,
  hotelCancellation,
  paymentReceived,
  partialPayment,
  accountCredit,
  accountPayment,
  accountRefund,
  accountAdjustment,
  hotelWelcome,
  staffWelcome,
  platformAdminWelcome,
  hotelStatusChanged,
} from "./templates";

const sample = {
  orderNumber: 24,
  customerName: "Dennis",
  customerPhone: "0712345678",
  locationDescription: "Opposite Kwa Auntie",
  itemsSummary: "2x Chapati, 1x Tea",
  totalAmount: 80,
  firstName: "Dennis",
  adminUsername: "admin",
  hotelName: "Hotel A",
  link: "https://example.com",
  amountPaid: 50,
  remaining: 30,
  amount: 80,
  balance: 120,
  reason: "Order cancelled",
  setupLink: "https://example.com/set-password?token=x1y2z3",
  role: "hotel staff",
  staffName: "Jane",
  createdBy: "Platform Ops",
  action: "suspended",
  changedBy: "system",
};

const all: Record<string, string> = {
  orderAlertToHotel: orderAlertToHotel(sample),
  orderAcceptedToCustomer: orderAcceptedToCustomer(sample),
  orderOutForDeliveryToCustomer: orderOutForDeliveryToCustomer(sample),
  firstDeliveredToCustomer: firstDeliveredToCustomer(sample),
  customerCancellation: customerCancellation(sample),
  hotelCancellation: hotelCancellation(sample),
  paymentReceived: paymentReceived(sample),
  partialPayment: partialPayment(sample),
  accountCredit: accountCredit(sample),
  accountPayment: accountPayment(sample),
  accountRefund: accountRefund(sample),
  accountAdjustment: accountAdjustment(sample),
  accountAdjustmentNoReason: accountAdjustment({ orderNumber: sample.orderNumber, amount: sample.amount, balance: sample.balance }),
  hotelWelcome: hotelWelcome(sample),
  staffWelcome: staffWelcome(sample),
  staffWelcomeNoSetup: staffWelcome({ staffName: sample.staffName, role: sample.role, hotelName: sample.hotelName }),
  platformAdminWelcome: platformAdminWelcome(sample),
  hotelStatusChanged: hotelStatusChanged(sample),
};

// Templates prefixed with the customer-facing brand.
const branded = [
  "orderAlertToHotel",
  "orderAcceptedToCustomer",
  "orderOutForDeliveryToCustomer",
  "firstDeliveredToCustomer",
  "customerCancellation",
  "hotelCancellation",
  "paymentReceived",
  "partialPayment",
  "accountCredit",
  "accountPayment",
  "accountRefund",
  "accountAdjustment",
  "hotelWelcome",
  "staffWelcome",
  "staffWelcomeNoSetup",
  "hotelStatusChanged",
];

describe("SMS templates", () => {
  test("every template renders non-empty", () => {
    for (const [name, text] of Object.entries(all)) {
      expect(text.trim().length, name).toBeGreaterThan(0);
    }
  });

  test("every template is pure ASCII so it bills at 160 chars/segment", () => {
    for (const [name, text] of Object.entries(all)) {
      expect(text, name).toMatch(/^[\x00-\x7F]*$/);
    }
  });

  test("line breaks are \\n and no line is indented", () => {
    for (const [name, text] of Object.entries(all)) {
      expect(text, name).not.toContain("\r");
      for (const line of text.split("\n")) {
        expect(line, name).not.toMatch(/^[ \t]+/);
      }
    }
  });

  test("customer-facing templates carry the [Ladha] prefix", () => {
    for (const name of branded) {
      expect(all[name]!.startsWith(BRAND), name).toBe(true);
    }
  });

  test("every template stays within a two-segment SMS budget", () => {
    for (const [name, text] of Object.entries(all)) {
      expect(estimateSegments(text), name).toBeLessThanOrEqual(2);
    }
  });

  test("adjustment reason appears only when provided", () => {
    expect(all.accountAdjustment!).toContain("Reason: Order cancelled");
    expect(all.accountAdjustmentNoReason!).not.toContain("Reason:");
  });

  test("staff welcome omits setup lines when no setup token exists", () => {
    expect(all.staffWelcome!).toContain("Set your password:");
    expect(all.staffWelcomeNoSetup!).not.toContain("Set your password:");
  });
});