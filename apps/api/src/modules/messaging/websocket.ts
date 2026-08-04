import { wsHub } from "../websocket/hub";

/** Live messaging is a convenience layer; persisted Message rows remain authoritative. */
export function broadcastMessage(conversationId: string, payload: unknown) {
  wsHub.broadcastToConversation(conversationId, { type: "MESSAGE_CREATED", payload });
}

export function broadcastTyping(conversationId: string, payload: unknown) {
  wsHub.broadcastToConversation(conversationId, { type: "TYPING", payload });
}
