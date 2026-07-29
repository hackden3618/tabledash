/**
 * Purpose: Custom React Hook for WebSocket connection management and event subscription.
 * Responsibilities: Opens WebSocket connection to backend ws://localhost:3000/ws, handles auto-reconnect, and triggers callbacks on event payloads.
 * Dependencies: React useEffect, useRef, useState.
 * When to modify: When adding heartbeat pings, custom channel parameters, or changing reconnection timers.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, getGuestId } from "./api";

export interface WsEventPayload<T = unknown> {
  type: string;
  payload: T;
}

/**
 * Custom React hook for connecting to the Ladha WebSocket server with auto-reconnect.
 * @param role Client role ('admin' | 'customer').
 * @param orderId Optional order ID for customer order tracking topic.
 * @param onMessage Callback function executed when an event message arrives.
 */
export function useWebSocket<T = unknown>(
  role: "admin" | "customer" = "customer",
  orderId?: string,
  onMessage?: (event: WsEventPayload<T>) => void,
  conversationId?: string,
  authToken?: string
) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingMessagesRef = useRef<string[]>([]);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let heartbeatId: ReturnType<typeof setInterval> | null = null;
    let isDisposed = false;

    function connect() {
      if (isDisposed) return;

      void (async () => {
        try {
          const headers: Record<string, string> = { "X-Guest-Id": getGuestId() };
          if (authToken) headers.Authorization = `Bearer ${authToken}`;
          const ticketResponse = await fetch(`${API_BASE}/auth/ws-ticket`, { method: "POST", headers });
          if (!ticketResponse.ok) throw new Error("Realtime authorization failed");
          const ticketData = await ticketResponse.json() as { data?: { ticket?: string } };
          const ticket = ticketData.data?.ticket;
          if (!ticket || isDisposed) return;

          let query = `role=${role}&ticket=${encodeURIComponent(ticket)}`;
          if (orderId) query += `&orderId=${encodeURIComponent(orderId)}`;
          if (conversationId) query += `&conversationId=${encodeURIComponent(conversationId)}`;
          const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
          const base = typeof window !== "undefined" ? `${proto}//${window.location.host}` : "ws://localhost:3000";
          const socket = new WebSocket(`${base}/ws?${query}`);
          attachSocket(socket);
        } catch {
          if (!isDisposed) timerId = setTimeout(connect, 3000);
        }
      })();
    }

    function attachSocket(socket: WebSocket) {
      if (isDisposed) {
        socket.close();
        return;
      }

      socket.onopen = () => {
        if (isDisposed) {
          socket.close();
          return;
        }
        if (!isDisposed) {
          // Never log wsUrl: it contains the bearer token used by the legacy
          // WebSocket handshake and must not appear in browser logs.
          console.log(`[WS Client] Connected (${role})`);
          setIsConnected(true);
          heartbeatId = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "PING" }));
          }, 20_000);
          const pending = pendingMessagesRef.current.splice(0);
          pending.forEach((payload) => socket.send(payload));
        }
      };

      socket.onmessage = (event) => {
        try {
          const parsed: WsEventPayload<T> = JSON.parse(event.data);
          if (onMessageRef.current && !isDisposed) {
            onMessageRef.current(parsed);
          }
        } catch (err) {
          console.error("[WS Client] Error parsing incoming message:", err);
        }
      };

      socket.onclose = () => {
        if (!isDisposed) {
          if (heartbeatId) clearInterval(heartbeatId);
          heartbeatId = null;
          console.log("[WS Client] Connection closed. Retrying in 3 seconds...");
          setIsConnected(false);
          timerId = setTimeout(connect, 3000);
        }
      };

      socket.onerror = (err) => {
        console.error("[WS Client] Socket error:", err);
      };

      wsRef.current = socket;
    }

    connect();

    return () => {
      isDisposed = true;
      pendingMessagesRef.current = [];
      if (timerId) clearTimeout(timerId);
      if (heartbeatId) clearInterval(heartbeatId);
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.close();
    };
  }, [role, orderId, conversationId, authToken]);

  const send = useCallback((payload: unknown) => {
    const serialized = JSON.stringify(payload);
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(serialized);
    else if (wsRef.current?.readyState === WebSocket.CONNECTING) pendingMessagesRef.current.push(serialized);
  }, []);

  return { isConnected, send };
}
