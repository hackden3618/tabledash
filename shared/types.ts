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

export interface CustomerData {
  id: string;
  firstName: string;
  lastName?: string | null;
  phone: string;
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
  marketSection?: string | null;
  locationDescription?: string | null;
  orderedAt: string;
  completedAt?: string | null;
  customer?: CustomerData;
  orderItems?: OrderItemData[];
}

export interface DashboardMetrics {
  totalOrders: number;
  deliveredOrders: number;
  pendingOrders: number;
  totalSales: number;
  topItems: {
    name: string;
    count: number;
  }[];
}

/** WebSocket message types */
export type WsEventType =
  | "ORDER_CREATED"
  | "ORDER_STATUS_UPDATED"
  | "MENU_AVAILABILITY_UPDATED";

export interface WsMessage<T = unknown> {
  type: WsEventType;
  payload: T;
}
