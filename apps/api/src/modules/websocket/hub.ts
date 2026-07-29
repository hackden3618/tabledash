/**
 * Purpose: Centralized WebSocket Broadcast Hub for tableDash real-time updates.
 * Responsibilities: Manages WebSocket client connections, channel subscriptions, and event broadcasting to admin & customer clients.
 * Dependencies: shared/types.ts for WsMessage contracts.
 * When to modify: When adding new WebSocket channels or event notification types.
 */

import type { WsMessage } from "../../../../../shared/types";

/**
 * Interface representing an active subscriber socket.
 */
interface ClientSocket {
  id: string;
  role: "admin" | "customer";
  hotelId?: string;
  orderId?: string;
  send: (data: string) => void;
}

export class WebSocketHub {
  private clients: Map<string, ClientSocket> = new Map();

  /**
   * Registers a connected socket client.
   */
  public registerClient(socket: ClientSocket): void {
    this.clients.set(socket.id, socket);
    console.log(`[WS Hub] Client registered: ${socket.id} (Role: ${socket.role})`);
  }

  /**
   * Removes a disconnected socket client.
   */
  public unregisterClient(socketId: string): void {
    this.clients.delete(socketId);
    console.log(`[WS Hub] Client disconnected: ${socketId}`);
  }

  /**
   * Broadcasts a message to all connected admin clients.
   * NOTE: Prefer broadcastToHotelAdmins for tenant-scoped sends.
   */
  public broadcastToAdmins<T>(message: WsMessage<T>): void {
    this.broadcastToHotelAdmins(undefined, message);
  }

  /**
   * Broadcasts a message to admin clients belonging to a specific hotel.
   * When hotelId is undefined, sends to all admin clients (platform-level).
   * WHY: Tenant isolation — hotel A's staff should never see hotel B's orders.
   */
  public broadcastToHotelAdmins<T>(hotelId: string | undefined, message: WsMessage<T>): void {
    const payloadStr = JSON.stringify(message);
    const staleIds: string[] = [];

    for (const client of this.clients.values()) {
      const matches = hotelId !== undefined
        ? client.role === "admin" && client.hotelId === hotelId
        : client.role === "admin";
      if (matches) {
        try {
          client.send(payloadStr);
        } catch (err) {
          console.error(`[WS Hub] Stale socket detected for admin ${client.id}:`, err);
          staleIds.push(client.id);
        }
      }
    }

    staleIds.forEach((id) => this.clients.delete(id));
  }

  /**
   * Broadcasts a status update to:
   *   - Admin clients (optionally scoped by hotelId)
   *   - Customers subscribed to this specific orderId (Order Tracker page)
   *   - Customers with NO orderId subscription (My Orders page — browsing history)
   * WHY: My Orders page connects without an orderId, so it must also receive status
   *   patches to stay live without requiring a full profile refetch.
   * @param orderId Target order ID being updated.
   * @param message Payload message containing updated order data.
   * @param hotelId Optional — scopes admin broadcast to a specific hotel.
   */
  public notifyOrderStatusUpdate<T>(orderId: string, message: WsMessage<T>, hotelId?: string): void {
    const payloadStr = JSON.stringify(message);
    const staleIds: string[] = [];

    for (const client of this.clients.values()) {
      const isAdmin             = client.role === "admin" && (hotelId === undefined || client.hotelId === hotelId);
      const isOrderTracker      = client.role === "customer" && client.orderId === orderId;
      const isMyOrdersBrowser   = client.role === "customer" && !client.orderId;

      if (isAdmin || isOrderTracker || isMyOrdersBrowser) {
        try {
          client.send(payloadStr);
        } catch (err) {
          console.error(`[WS Hub] Stale socket detected for client ${client.id}:`, err);
          staleIds.push(client.id);
        }
      }
    }

    staleIds.forEach((id) => this.clients.delete(id));
  }

  /**
   * Broadcasts menu availability changes to all connected clients (customers & admins).
   */
  public broadcastMenuUpdate<T>(message: WsMessage<T>): void {
    const payloadStr = JSON.stringify(message);
    const staleIds: string[] = [];

    for (const client of this.clients.values()) {
      try {
        client.send(payloadStr);
      } catch (err) {
        console.error(`[WS Hub] Stale socket detected for client ${client.id}:`, err);
        staleIds.push(client.id);
      }
    }

    staleIds.forEach((id) => this.clients.delete(id));
  }

  /**
   * Broadcasts a bounced-order alert to admin clients.
   * WHY: When an order fails at placement (e.g. stock shortage), admins need immediate
   *      visibility so they can restock or reach the customer. Shown as an urgent red alert.
   * @param message Event payload.
   * @param hotelId Optional — scopes to a specific hotel's admins.
   */
  public broadcastOrderBounced<T>(message: WsMessage<T>, hotelId?: string): void {
    this.broadcastToHotelAdmins(hotelId, message);
  }

  /**
   * Broadcasts a notification event to connected clients.
   * Used for in-app toasts: dispatch alerts, payment received, OOS warnings, cancellations.
   * @param message Event payload.
   * @param hotelId Optional — scopes admin recipients to a specific hotel.
   */
  public broadcastNotification<T>(message: WsMessage<T>, hotelId?: string): void {
    const payloadStr = JSON.stringify(message);
    const staleIds: string[] = [];

    for (const client of this.clients.values()) {
      const matchesAdmin = client.role === "admin" && (hotelId === undefined || client.hotelId === hotelId);
      const matchesCustomer = client.role === "customer";
      if (matchesAdmin || matchesCustomer) {
        try {
          client.send(payloadStr);
        } catch (err) {
          console.error(`[WS Hub] Stale socket detected for client ${client.id}:`, err);
          staleIds.push(client.id);
        }
      }
    }

    staleIds.forEach((id) => this.clients.delete(id));
  }
}

export const wsHub = new WebSocketHub();
