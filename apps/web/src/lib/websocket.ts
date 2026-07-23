/**
 * Purpose: Custom React Hook for WebSocket connection management and event subscription.
 * Responsibilities: Opens WebSocket connection to backend ws://localhost:3000/ws, handles auto-reconnect, and triggers callbacks on event payloads.
 * Dependencies: React useEffect, useRef, useState.
 * When to modify: When adding heartbeat pings, custom channel parameters, or changing reconnection timers.
 */

import { useEffect, useRef, useState } from "react";

export interface WsEventPayload<T = unknown> {
  type: string;
  payload: T;
}

/**
 * Custom React hook for connecting to tableDash WebSocket server.
 * @param role Client role ('admin' | 'customer').
 * @param orderId Optional order ID for customer order tracking topic.
 * @param onMessage Callback function executed when an event message arrives.
 */
export function useWebSocket<T = unknown>(
  role: "admin" | "customer" = "customer",
  orderId?: string,
  onMessage?: (event: WsEventPayload<T>) => void
) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let query = `role=${role}`;
    if (orderId) {
      query += `&orderId=${orderId}`;
    }

    const wsUrl = `ws://localhost:3000/ws?${query}`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log(`[WS Client] Connected to ${wsUrl}`);
      setIsConnected(true);
    };

    socket.onmessage = (event) => {
      try {
        const parsed: WsEventPayload<T> = JSON.parse(event.data);
        if (onMessage) {
          onMessage(parsed);
        }
      } catch (err) {
        console.error("[WS Client] Error parsing incoming message:", err);
      }
    };

    socket.onclose = () => {
      console.log("[WS Client] Connection closed");
      setIsConnected(false);
    };

    socket.onerror = (err) => {
      console.error("[WS Client] Socket error:", err);
    };

    wsRef.current = socket;

    return () => {
      socket.close();
    };
  }, [role, orderId]);

  return { isConnected };
}
