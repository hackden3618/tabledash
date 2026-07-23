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
   * WHY: Admins need immediate push notifications for new orders and status changes without polling.
   */
  public broadcastToAdmins<T>(message: WsMessage<T>): void {
    const payloadStr = JSON.stringify(message);
    const staleIds: string[] = [];

    for (const client of this.clients.values()) {
      if (client.role === "admin") {
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
   * Broadcasts a status update to a specific customer order channel and all admins.
   * @param orderId Target order ID being updated.
   * @param message Payload message containing updated order data.
   */
  public notifyOrderStatusUpdate<T>(orderId: string, message: WsMessage<T>): void {
    const payloadStr = JSON.stringify(message);
    const staleIds: string[] = [];

    for (const client of this.clients.values()) {
      if (client.role === "admin" || (client.role === "customer" && client.orderId === orderId)) {
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
   * Broadcasts a bounced-order alert to all connected admin clients.
   * WHY: When an order fails at placement (e.g. stock shortage), admins need immediate
   *      visibility so they can restock or reach the customer. Shown as an urgent red alert.
   */
  public broadcastOrderBounced<T>(message: WsMessage<T>): void {
    this.broadcastToAdmins(message);
  }
}

export const wsHub = new WebSocketHub();
