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
  conversationIds?: Set<string>;
  identityKey?: string;
  lastActiveAt?: number;
  send: (data: string) => void;
}

export class WebSocketHub {
  private clients: Map<string, ClientSocket> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private static readonly STALE_TIMEOUT_MS = 60_000;
  private static readonly CLEANUP_INTERVAL_MS = 30_000;

  constructor() {
    this.cleanupInterval = setInterval(() => this.sweepStaleClients(), WebSocketHub.CLEANUP_INTERVAL_MS);
    if (typeof globalThis !== "undefined" && (globalThis as any).unref) {
      (this.cleanupInterval as any).unref();
    }
  }

  private sweepStaleClients(): void {
    const now = Date.now();
    const staleIds: string[] = [];
    for (const [id, client] of this.clients) {
      if (client.lastActiveAt && now - client.lastActiveAt > WebSocketHub.STALE_TIMEOUT_MS) {
        staleIds.push(id);
      }
    }
    for (const id of staleIds) {
      this.clients.delete(id);
    }
    if (staleIds.length > 0) {
      console.log(`[WS Hub] Swept ${staleIds.length} stale client(s)`);
    }
  }

  /**
   * Graceful shutdown — stop the cleanup interval and clear all clients.
   */
  public shutdown(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clients.clear();
  }

  /**
   * Registers a connected socket client.
   */
  public registerClient(socket: ClientSocket): void {
    socket.lastActiveAt = Date.now();
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

  public touch(socketId: string): void {
    const client = this.clients.get(socketId);
    if (client) client.lastActiveAt = Date.now();
  }

  public getPresence(identityKey: string) {
    const client = [...this.clients.values()].find((item) => item.identityKey === identityKey);
    return { online: Boolean(client), lastActiveAt: client?.lastActiveAt ?? null };
  }

  public isJoined(socketId: string, conversationId: string): boolean {
    return this.clients.get(socketId)?.conversationIds?.has(conversationId) ?? false;
  }

  /** Adds a server-authorized conversation channel to the root socket. */
  public joinConversation(socketId: string, conversationId: string): void {
    const client = this.clients.get(socketId);
    if (!client) return;
    client.conversationIds ??= new Set<string>();
    client.conversationIds.add(conversationId);
  }

  public getIdentityKey(socketId: string): string | null {
    return this.clients.get(socketId)?.identityKey ?? null;
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
   * An undefined hotelId deliberately sends to nobody. Platform-wide events
   * must use explicit platform identity recipients, rather than treating every
   * connected hotel admin as a platform subscriber.
   * WHY: Tenant isolation — hotel A's staff should never see hotel B's orders.
   */
  public broadcastToHotelAdmins<T>(hotelId: string | undefined, message: WsMessage<T>): void {
    const payloadStr = JSON.stringify(message);
    const staleIds: string[] = [];

    for (const client of this.clients.values()) {
      const matches = Boolean(hotelId) && client.role === "admin" && client.hotelId === hotelId;
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
   *   - The order owner's authenticated and linked guest sessions.
   *
   * A root customer socket must never receive another customer's order update.
   * The caller resolves recipient identities from durable ownership data before
   * handing the event to the hub; `orderId` is retained for event correlation.
   * @param orderId Target order ID being updated.
   * @param message Payload message containing updated order data.
   * @param hotelId Scopes the admin broadcast to a specific hotel.
   * @param recipientIdentityKeys Customer/guest identities authorised for this order.
   */
  public notifyOrderStatusUpdate<T>(
    _orderId: string,
    message: WsMessage<T>,
    hotelId: string | undefined,
    recipientIdentityKeys: string[]
  ): void {
    const payloadStr = JSON.stringify(message);
    const staleIds: string[] = [];
    const recipients = new Set(recipientIdentityKeys);

    for (const client of this.clients.values()) {
      const isAdmin = Boolean(hotelId) && client.role === "admin" && client.hotelId === hotelId;
      const isOrderOwner = client.role === "customer" && client.identityKey !== undefined && recipients.has(client.identityKey);

      if (isAdmin || isOrderOwner) {
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
      const matchesAdmin = Boolean(hotelId) && client.role === "admin" && client.hotelId === hotelId;
      // Generic notifications do not have customer ownership information, so
      // they must not be broadcast to all customer sockets.
      const matchesCustomer = false;
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

  private sendToClients<T>(clients: ClientSocket[], type: string, payload: T): void {
    const payloadStr = JSON.stringify({ version: 1, type, payload });
    for (const client of clients) {
      try { client.send(payloadStr); } catch { this.clients.delete(client.id); }
    }
  }

  /** Messaging channel broadcast. Only explicitly joined conversation channels receive it. */
  public broadcastToConversation<T>(conversationId: string, message: { type: string; payload: T }): void {
    this.sendToClients([...this.clients.values()].filter((client) => client.conversationIds?.has(conversationId)), message.type, message.payload);
  }

  public broadcastToConversationExcept<T>(conversationId: string, exceptSocketId: string, message: { type: string; payload: T }): void {
    this.sendToClients([...this.clients.values()].filter((client) => client.id !== exceptSocketId && client.conversationIds?.has(conversationId)), message.type, message.payload);
  }

  /** Delivers an event to every active session for one authenticated identity. */
  public broadcastToIdentity<T>(identityKey: string, message: { type: string; payload: T }): void {
    this.sendToClients([...this.clients.values()].filter((client) => client.identityKey === identityKey), message.type, message.payload);
  }

  public broadcastToIdentities<T>(identityKeys: string[], message: { type: string; payload: T }): void {
    const targets = new Set(identityKeys);
    this.sendToClients([...this.clients.values()].filter((client) => client.identityKey && targets.has(client.identityKey)), message.type, message.payload);
  }

  public broadcastToIdentitiesExcept<T>(identityKeys: string[], excludedIdentityKey: string | null, message: { type: string; payload: T }): void {
    const targets = new Set(identityKeys);
    this.sendToClients([...this.clients.values()].filter((client) => client.identityKey && targets.has(client.identityKey) && client.identityKey !== excludedIdentityKey), message.type, message.payload);
  }
}

export const wsHub = new WebSocketHub();
