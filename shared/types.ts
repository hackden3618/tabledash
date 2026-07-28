/**
 * Purpose: Shared TypeScript interfaces and type definitions for tableDash monorepo.
 * Responsibilities: Provides common domain types, order structures, websocket event definitions, and dashboard summary interfaces.
 * Dependencies: None (pure TypeScript contract file).
 * When to modify: When adding new domain data structures or updating WebSocket message contracts.
 */

export type OrderStatus =
  | "NEW"
  | "ACCEPTED"
  | "PREPARING"
  | "READY_FOR_DELIVERY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

export type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

export interface CustomerData {
  id: string;
  firstName: string;
  lastName?: string | null;
  phone: string;
  knownName?: string | null;
  stallNumber?: string | null;
  locationDescription?: string | null;
  marketSection?: string | null;
  createdAt: string;
}

export interface ProductData {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
  price: number;
  available: boolean;
  stockQty: number;
  lastRestockedAt?: string | null;
  outOfStockSince?: string | null;
  createdAt: string;
}

export interface OrderItemData {
  id: string;
  orderId: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface OrderData {
  id: string;
  orderNumber: number;
  customerId: string;
  status: OrderStatus;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  marketSection?: string | null;
  locationDescription?: string | null;
  stallNumber?: string | null;
  knownName?: string | null;
  orderedAt: string;
  completedAt?: string | null;
  cancelReason?: string | null;
  cancelledAtStatus?: string | null;
  customer?: CustomerData;
  orderItems?: OrderItemData[];
}

export interface DashboardMetrics {
  totalOrders: number;
  deliveredOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  totalSales: number;
  outstandingBalance: number;
  refundsDue: number;
  averageOrderValue: number;
  topItems: {
    name: string;
    count: number;
  }[];
}

/** WebSocket message types */
export type WsEventType =
  | "ORDER_CREATED"
  | "ORDER_STATUS_UPDATED"
  | "MENU_AVAILABILITY_UPDATED"
  | "ORDER_BOUNCED"    // Fired when an order fails at placement (e.g. stock shortage); urgent flag for admins.
  | "HOTEL_STATUS_UPDATED"  // Fired when hotel open/close status changes
  | "HOTEL_CLOSING"         // Fired when hotel is closing — carries closingIn seconds for frontend countdown
  | "ORDER_PAYMENT_UPDATED" // Fired when payment status changes
  | "NOTIFICATION";         // Fired for general in-app notifications (dispatch, cancellation, payment, OOS)

export interface WsMessage<T = unknown> {
  type: WsEventType;
  payload: T;
}

/** Logged-in customer profile returned from /customers/me */
export interface CustomerProfileData {
  id: string;
  firstName: string;
  lastName?: string | null;
  phone: string;
  knownName?: string | null;
  stallNumber?: string | null;
  marketSection?: string | null;
  locationDescription?: string | null;
  hasPin: boolean;
  recentOrders?: OrderData[];
}
