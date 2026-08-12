/**
 * Purpose: Single source of truth for every SMS template in the platform.
 * Responsibilities: Owns all SMS copy so handlers never inline message text.
 *   Customer messages read warm and human but stay transactional; hotel
 *   messages read fast and structured (kitchen-ticket style).
 * When to modify: When changing SMS copy. Every template is typed — a handler
 *   switching to a template gets compile-time guarantees on its fields.
 *
 * Conventions (per §4.1):
 *   - `\n` for intentional line breaks; never indent lines.
 *   - `[Ladha]` is the only customer-facing brand prefix.
 *   - Keep every message short enough that it stays close to a single SMS
 *     segment; correctness of tone beats squeezing the last few characters.
 *   - Never put passwords in an SMS — only setup links to set them.
 */

export const BRAND = "[Ladha]";
export const PLATFORM_BRAND = "[Ladha Platform]";

export interface OrderAlertToHotelParams {
  orderNumber: number;
  customerName: string;
  customerPhone: string;
  locationDescription: string;
  itemsSummary: string;
  totalAmount: number;
}

export const orderAlertToHotel = (p: OrderAlertToHotelParams): string =>
  `${BRAND} NEW ORDER #${p.orderNumber}\n` +
  `${p.customerName} (${p.customerPhone})\n` +
  `Location: ${p.locationDescription}\n\n` +
  `Items:\n` +
  `${p.itemsSummary}\n\n` +
  `Total: KSh ${p.totalAmount}`;

export interface OrderAcceptedToCustomerParams {
  firstName: string;
  orderNumber: number;
  hotelName: string;
  link: string;
}
export const orderAcceptedToCustomer = (p: OrderAcceptedToCustomerParams): string =>
  `${BRAND}\n` +
  `Thank you, ${p.firstName}. Your order #${p.orderNumber} from ${p.hotelName} has been accepted.\n` +
  `Your meal is being prepared now.\n` +
  `Track your order: ${p.link}`;

export interface OrderOutForDeliveryToCustomerParams {
  firstName: string;
  orderNumber: number;
  totalAmount: number;
}
export const orderOutForDeliveryToCustomer = (p: OrderOutForDeliveryToCustomerParams): string =>
  `${BRAND}\n` +
  `Good news, ${p.firstName}! Your order #${p.orderNumber} is on the way.\n` +
  `Please be ready to receive it.\n` +
  `Total: KSh ${p.totalAmount}`;

export interface FirstDeliveredToCustomerParams {
  firstName: string;
  hotelName: string;
}
export const firstDeliveredToCustomer = (p: FirstDeliveredToCustomerParams): string =>
  `${BRAND}\n` +
  `Thank you for trying Ladha, ${p.firstName}.\n` +
  `We hope you enjoyed your meal from ${p.hotelName}.\n` +
  `We look forward to serving you again.`;

export interface CustomerCancellationParams {
  orderNumber: number;
  link: string;
}
export const customerCancellation = (p: CustomerCancellationParams): string =>
  `${BRAND}\n` +
  `Your order #${p.orderNumber} has been cancelled as requested.\n` +
  `You can order again anytime: ${p.link}`;

export interface HotelCancellationParams {
  orderNumber: number;
  hotelName: string;
  reason: string;
  link: string;
}
export const hotelCancellation = (p: HotelCancellationParams): string =>
  `${BRAND}\n` +
  `Your order #${p.orderNumber} from ${p.hotelName} was cancelled.\n` +
  `Reason: ${p.reason}\n` +
  `We are sorry for the inconvenience.\n` +
  `Order again: ${p.link}`;

export interface OrderCancelledToHotelParams {
  hotelName: string;
  orderNumber: number;
  stallNumber?: string;
  reason: string;
}
export const orderCancelledToHotel = (p: OrderCancelledToHotelParams): string => {
  const stallTag = p.stallNumber ? ` | Stall: ${p.stallNumber}` : "";
  return (
    `[${p.hotelName}] ORDER #${p.orderNumber} CANCELLED${stallTag}\n` +
    `Reason: ${p.reason}\n` +
    `No delivery needed.`
  );
};

export interface PaymentReceivedParams {
  orderNumber: number;
  amountPaid: number;
  totalAmount: number;
}
export const paymentReceived = (p: PaymentReceivedParams): string =>
  `${BRAND}\n` +
  `Payment received for order #${p.orderNumber}.\n` +
  `Paid: KSh ${p.amountPaid} of KSh ${p.totalAmount}.\n` +
  `Thank you.`;

export interface PartialPaymentParams {
  orderNumber: number;
  amountPaid: number;
  totalAmount: number;
  remaining: number;
}
export const partialPayment = (p: PartialPaymentParams): string =>
  `${BRAND}\n` +
  `Partial payment recorded for order #${p.orderNumber}.\n` +
  `Paid: KSh ${p.amountPaid} of KSh ${p.totalAmount}.\n` +
  `Remaining balance: KSh ${p.remaining}.`;

export interface AccountCreditParams {
  hotelName: string;
  orderNumber: number;
  amount: number;
  balance: number;
}
export const accountCredit = (p: AccountCreditParams): string =>
  `${BRAND}\n` +
  `[${p.hotelName}] Order #${p.orderNumber} added to your account.\n` +
  `Amount: KSh ${p.amount}\n` +
  `Current balance at ${p.hotelName}: KSh ${p.balance}`;

export interface AccountPaymentParams {
  hotelName: string;
  orderNumber: number;
  amount: number;
  balance: number;
}
export const accountPayment = (p: AccountPaymentParams): string =>
  `${BRAND}\n` +
  `[${p.hotelName}] Payment received for order #${p.orderNumber}.\n` +
  `Amount: KSh ${p.amount}\n` +
  `Current balance at ${p.hotelName}: KSh ${p.balance}`;

export interface AccountRefundParams {
  hotelName: string;
  orderNumber: number;
  amount: number;
  balance: number;
}
export const accountRefund = (p: AccountRefundParams): string =>
  `${BRAND}\n` +
  `[${p.hotelName}] Refund completed for order #${p.orderNumber}.\n` +
  `Amount: KSh ${p.amount}\n` +
  `Current balance at ${p.hotelName}: KSh ${p.balance}\n` +
  `We apologize for the inconvenience.`;

export interface AccountAdjustmentParams {
  hotelName: string;
  orderNumber: number;
  amount: number;
  balance: number;
  reason?: string;
}
export const accountAdjustment = (p: AccountAdjustmentParams): string =>
  `${BRAND}\n` +
  `[${p.hotelName}] Your account balance was adjusted.\n` +
  `Order #${p.orderNumber}: KSh ${p.amount}\n` +
  `Current balance at ${p.hotelName}: KSh ${p.balance}` +
  `${p.reason ? `\nReason: ${p.reason}` : ""}`;

export interface HotelWelcomeParams {
  hotelName: string;
  adminUsername: string;
  setupLink: string;
}
export const hotelWelcome = (p: HotelWelcomeParams): string =>
  `${BRAND}\n` +
  `Welcome to Ladha, ${p.hotelName}.\n` +
  `Your kitchen dashboard is ready.\n` +
  `Username: ${p.adminUsername}\n` +
  `Set your password: ${p.setupLink}\n` +
  `This link expires in 24 hours.`;

export interface StaffWelcomeParams {
  staffName: string;
  role: string;
  hotelName: string;
  username?: string;
  setupLink?: string;
}
export const staffWelcome = (p: StaffWelcomeParams): string => {
  const base =
    `${BRAND}\n` +
    `Welcome ${p.staffName}.\n` +
    `You have been added as ${p.role} at ${p.hotelName}.` +
    `${p.username ? `\nUsername: ${p.username}` : ""}`;
  return p.setupLink
    ? `${base}\nSet your password: ${p.setupLink}\nLink expires in 24 hours.`
    : base;
};

export interface PlatformAdminWelcomeParams {
  createdBy: string;
  setupLink: string;
}
export const platformAdminWelcome = (p: PlatformAdminWelcomeParams): string =>
  `${PLATFORM_BRAND}\n` +
  `${p.createdBy} granted you Platform Admin access.\n` +
  `Set your password: ${p.setupLink}\n` +
  `Link expires in 2 hours.\n` +
  `Enable 2FA after login.`;

export interface HotelStatusChangedParams {
  hotelName: string;
  action: string;
  changedBy: string;
}
export const hotelStatusChanged = (p: HotelStatusChangedParams): string =>
  `${BRAND}\n` +
  `${p.hotelName} has been ${p.action}.\n` +
  `Changed by: ${p.changedBy}\n` +
  `Check your dashboard for details.`;