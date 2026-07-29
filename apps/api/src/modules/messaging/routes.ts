import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { env } from "../../../../../shared/config";
import { resolveMessagingActor } from "./controller";
import { AnnouncementSchema, ConversationIdSchema, CreateConversationSchema, SendMessageSchema } from "./schema";
import { createAnnouncement, createConversation, getAnnouncementRecipientIdentityKeys, getConversationIdentityKeys, getConversationMessages, getDirectory, getDiscoverability, getUnreadCount, listConversations, markConversationRead, messagingActorIdentityKey, sendMessage, updateDiscoverability, updateMessage, deleteMessage, deleteConversation } from "./service";
import { wsHub } from "../websocket/hub";
import { prisma } from "../../../../../infrastructure/database/prisma";

export const messagingRoute = new Elysia({
  prefix: `${env.apiPrefix}/messaging`,
  detail: { summary: "Ladha Conversations messaging", tags: ["Messaging"] },
})
  .use(jwt({ name: "jwt", secret: env.jwtSecret }))
  .get("/conversations", async ({ headers, jwt, set }) => {
    try {
      const actor = await resolveMessagingActor(headers, (token) => jwt.verify(token));
      return { success: true, data: await listConversations(actor) };
    } catch (error: any) {
      set.status = 401;
      return { success: false, error: error.message || "Unable to load conversations" };
    }
  })
  .get("/unread-count", async ({ headers, jwt, set }) => {
    try {
      const actor = await resolveMessagingActor(headers, (token) => jwt.verify(token));
      return { success: true, data: { unreadCount: await getUnreadCount(actor) } };
    } catch (error: any) {
      set.status = 403;
      return { success: false, error: error.message || "Unable to load unread count" };
    }
  })
  .get("/directory", async ({ headers, jwt, query, set }) => {
    try {
      const actor = await resolveMessagingActor(headers, (token) => jwt.verify(token));
      const people = await getDirectory(actor, query.q);
      return { success: true, data: people.map((person: any) => ({ ...person, presence: wsHub.getPresence(person.firstName ? `customer:${person.id}` : `admin:${person.id}`) })) };
    } catch (error: any) {
      set.status = 403;
      return { success: false, error: error.message || "Directory unavailable" };
    }
  }, { query: t.Object({ q: t.Optional(t.String({ maxLength: 80 })) }) })
  .patch("/discoverability", async ({ headers, jwt, body, set }) => {
    try {
      const actor = await resolveMessagingActor(headers, (token) => jwt.verify(token));
      return { success: true, data: await updateDiscoverability(actor, body.discoverable) };
    } catch (error: any) {
      set.status = 400;
      return { success: false, error: error.message || "Unable to update discoverability" };
    }
  }, { body: t.Object({ discoverable: t.Boolean() }) })
  .get("/discoverability", async ({ headers, jwt, set }) => {
    try {
      const actor = await resolveMessagingActor(headers, (token) => jwt.verify(token));
      return { success: true, data: await getDiscoverability(actor) };
    } catch (error: any) {
      set.status = 403;
      return { success: false, error: error.message || "Unable to load discoverability" };
    }
  })
  .post("/conversations", async ({ headers, jwt, body, set }) => {
    try {
      const actor = await resolveMessagingActor(headers, (token) => jwt.verify(token));
      const conversation = await createConversation(actor, body);
      const presentedConversation = (await listConversations(actor)).find((item) => item.id === conversation.id) || conversation;
      wsHub.broadcastToIdentities(await getConversationIdentityKeys(conversation.id), { type: "CONVERSATION_CREATED", payload: presentedConversation });
      return { success: true, data: presentedConversation };
    } catch (error: any) {
      set.status = 400;
      return { success: false, error: error.message || "Unable to create conversation" };
    }
  }, { body: CreateConversationSchema })
  .get("/conversations/:id/messages", async ({ headers, jwt, params, query, set }) => {
    try {
      const actor = await resolveMessagingActor(headers, (token) => jwt.verify(token));
      return { success: true, data: await getConversationMessages(actor, params.id, query.cursor) };
    } catch (error: any) {
      set.status = error.message === "Conversation not found" ? 404 : 403;
      return { success: false, error: error.message || "Unable to load messages" };
    }
  }, { params: ConversationIdSchema, query: t.Object({ cursor: t.Optional(t.String({ format: "uuid" })) }) })
  .post("/conversations/:id/messages", async ({ headers, jwt, params, body, set }) => {
    try {
      const actor = await resolveMessagingActor(headers, (token) => jwt.verify(token));
      const message = await sendMessage(actor, params.id, body.body, body.replyToId);
      wsHub.broadcastToIdentities(await getConversationIdentityKeys(params.id), { type: "MESSAGE_CREATED", payload: { ...message, senderIdentityKey: messagingActorIdentityKey(actor) } });
      return { success: true, data: message };
    } catch (error: any) {
      set.status = 400;
      return { success: false, error: error.message || "Unable to send message" };
    }
  }, { params: ConversationIdSchema, body: SendMessageSchema })
  .post("/conversations/:id/read", async ({ headers, jwt, params, set }) => {
    try {
      const actor = await resolveMessagingActor(headers, (token) => jwt.verify(token));
      const read = await markConversationRead(actor, params.id);
      wsHub.broadcastToIdentities(await getConversationIdentityKeys(params.id), { type: "CONVERSATION_READ", payload: { conversationId: params.id, participantId: read.id, lastReadAt: read.lastReadAt } });
      return { success: true, data: read };
    } catch (error: any) {
      set.status = 403;
      return { success: false, error: error.message || "Unable to mark conversation read" };
    }
  }, { params: ConversationIdSchema })
  .patch("/conversations/:id/messages/:mid", async ({ headers, jwt, params, body, set }) => {
    try {
      const actor = await resolveMessagingActor(headers, (token) => jwt.verify(token));
      const message = await updateMessage(actor, params.id, params.mid, body.body);
      wsHub.broadcastToIdentities(await getConversationIdentityKeys(params.id), { type: "MESSAGE_UPDATED", payload: message });
      return { success: true, data: message };
    } catch (error: any) {
      set.status = 403;
      return { success: false, error: error.message || "Unable to edit message" };
    }
  }, { params: t.Object({ id: t.String(), mid: t.String({ format: "uuid" }) }), body: t.Object({ body: t.String({ minLength: 1, maxLength: 2000 }) }) })
  .delete("/conversations/:id/messages/:mid", async ({ headers, jwt, params, set }) => {
    try {
      const actor = await resolveMessagingActor(headers, (token) => jwt.verify(token));
      const message = await deleteMessage(actor, params.id, params.mid);
      wsHub.broadcastToIdentities(await getConversationIdentityKeys(params.id), { type: "MESSAGE_UPDATED", payload: message });
      return { success: true, data: message };
    } catch (error: any) {
      set.status = 403;
      return { success: false, error: error.message || "Unable to delete message" };
    }
  }, { params: t.Object({ id: t.String(), mid: t.String({ format: "uuid" }) }) })
  .delete("/conversations/:id", async ({ headers, jwt, params, set }) => {
    try {
      const actor = await resolveMessagingActor(headers, (token) => jwt.verify(token));
      const result = await deleteConversation(actor, params.id);
      wsHub.broadcastToIdentities(await getConversationIdentityKeys(params.id), { type: "CONVERSATION_DELETED", payload: { conversationId: params.id } });
      return { success: true, data: result };
    } catch (error: any) {
      set.status = 403;
      return { success: false, error: error.message || "Unable to delete conversation" };
    }
  }, { params: ConversationIdSchema })
  .post("/announcements", async ({ headers, jwt, body, set }) => {
    try {
      const actor = await resolveMessagingActor(headers, (token) => jwt.verify(token));
      const created = await createAnnouncement(actor, body);
      const hotel = created.hotelId ? await prisma.hotel.findUnique({ where: { id: created.hotelId }, select: { name: true } }) : null;
      const payload = {
        id: created.id,
        type: created.type,
        hotelId: created.hotelId,
        title: created.title,
        lastMessageAt: created.message.createdAt,
        createdAt: created.createdAt,
        sourceName: hotel?.name || "Ladha Deliveries",
        sourceKind: created.type === "GLOBAL_ANNOUNCEMENT" ? "Platform announcement" : "Hotel announcement",
        sourceContext: `Published by ${hotel?.name || "Ladha Deliveries"}`,
        unreadCount: 1,
        messages: [created.message],
      };
      const recipients = await getAnnouncementRecipientIdentityKeys(created.id);
      wsHub.broadcastToIdentities(recipients, { type: "CONVERSATION_CREATED", payload });
      wsHub.broadcastToIdentities(recipients, { type: "ANNOUNCEMENT_PUBLISHED", payload: { conversationId: created.id, title: created.title, body: created.message.body, sourceName: hotel?.name || "Ladha Deliveries", senderIdentityKey: messagingActorIdentityKey(actor) } });
      return { success: true, data: created };
    } catch (error: any) {
      set.status = 400;
      return { success: false, error: error.message || "Unable to publish announcement" };
    }
  }, { body: AnnouncementSchema });
