import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { env } from "../../../../../shared/config";
import { resolveMessagingActor } from "./controller";
import { ConversationIdSchema, SendMessageSchema, HotelNoticeSchema, PlatformNoticeSchema, TalkToStaffSchema, PlatformSupportSchema, CommunityChannelSchema } from "./schema";
import {
  getInbox, getUnreadCount, getConversationMessages, getConversationIdentityKeys,
  getAnnouncementRecipientIdentityKeys, sendMessage, sendOrderMessage,
  getOrCreateTalkToStaff, getOrCreatePlatformSupport, sendTalkToStaffMessage,
  createHotelNotice, createPlatformNotice,
  createCommunityChannel,
  updateMessage, deleteMessage, deleteConversation, markConversationRead,
  assertConversationAccess, messagingActorIdentityKey,
} from "./service";
import { wsHub } from "../websocket/hub";
import { prisma } from "../../../../../infrastructure/database/prisma";
import { sendPushToAllCustomers, sendPushToCustomer, sendPushToHotelAdmins } from "../push/service";
import type { MessagingActor } from "./service";

async function dispatchMessagePush(conversationId: string, actor: MessagingActor, bodyText: string) {
  try {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: true },
    });
    if (!conv) return;

    const hotel = conv.hotelId ? await prisma.hotel.findUnique({ where: { id: conv.hotelId }, select: { name: true } }) : null;
    const hotelName = hotel?.name || "Ladha";
    const defaultCustomerTitle = `${hotelName} — ${conv.title || "New Message"}`;
    const defaultStaffTitle = `${hotelName} — ${conv.title || "Customer Message"}`;

    for (const p of conv.participants) {
      if (
        (actor.kind === "CUSTOMER" && p.customerId === actor.customerId) ||
        (actor.kind === "HOTEL_STAFF" && p.adminUserId === actor.adminUserId) ||
        (actor.kind === "GUEST" && p.guestIdentityId === actor.guestIdentityId)
      ) {
        continue;
      }

      if (p.kind === "CUSTOMER" && p.customerId) {
        await sendPushToCustomer(p.customerId, {
          title: defaultCustomerTitle,
          body: bodyText,
          url: conv.orderId ? `/orders/${conv.orderId}/tracking` : "/inbox",
          tag: `chat-${conv.id}`,
        }).catch(() => 0);
      } else if ((p.kind === "HOTEL_STAFF" || actor.kind === "CUSTOMER" || actor.kind === "GUEST") && conv.hotelId) {
        await sendPushToHotelAdmins(conv.hotelId, {
          title: defaultStaffTitle,
          body: bodyText,
          url: "/kitchen/conversations",
          tag: `chat-${conv.id}`,
        }).catch(() => 0);
      }
    }
  } catch {
    // Non-blocking push alert
  }
}

export const messagingRoute = new Elysia({
  prefix: `${env.apiPrefix}/messaging`,
  detail: { summary: "Ladha Conversations messaging", tags: ["Messaging"] },
})
  .use(jwt({ name: "jwt", secret: env.jwtSecret }))

  // ── Inbox ──
  .get("/inbox", async ({ headers, jwt, set }) => {
    try {
      const actor = await resolveMessagingActor(headers, (token) => jwt.verify(token));
      return { success: true, data: await getInbox(actor) };
    } catch (error: any) {
      set.status = 401;
      return { success: false, error: error.message || "Unable to load inbox" };
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

  // ── Messages (shared across channels) ──
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
      const identityKeys = await getConversationIdentityKeys(params.id);
      const conversation = await prisma.conversation.findUnique({ where: { id: params.id }, select: { type: true, hotelId: true } });
      if (conversation && conversation.type === "HOTEL_COMMUNITY" && conversation.hotelId) {
        const hotelCustomers = await prisma.order.findMany({ where: { hotelId: conversation.hotelId }, select: { customerId: true }, distinct: ["customerId"] });
        const customerKeys = hotelCustomers.map((o) => o.customerId ? `customer:${o.customerId}` : "").filter(Boolean);
        const staff = await prisma.adminUser.findMany({ where: { hotelId: conversation.hotelId }, select: { id: true } });
        const staffKeys = staff.map((s) => `admin:${s.id}`);
        wsHub.broadcastToIdentities([...new Set([...identityKeys, ...staffKeys, ...customerKeys])], { type: "MESSAGE_CREATED", payload: { ...message, senderIdentityKey: messagingActorIdentityKey(actor) } });
      } else {
        wsHub.broadcastToIdentities(identityKeys, { type: "MESSAGE_CREATED", payload: { ...message, senderIdentityKey: messagingActorIdentityKey(actor) } });
      }
      await dispatchMessagePush(params.id, actor, body.body);
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

  // ── Order conversations ──
  .post("/orders/:orderId/messages", async ({ headers, jwt, params, body, set }) => {
    try {
      const actor = await resolveMessagingActor(headers, (token) => jwt.verify(token));
      const message = await sendOrderMessage(actor, params.orderId, body.body, body.replyToId);
      const conversation = await prisma.conversation.findFirst({ where: { orderId: params.orderId, type: "ORDER" }, select: { id: true } });
      if (conversation) {
        wsHub.broadcastToIdentities(await getConversationIdentityKeys(conversation.id), { type: "MESSAGE_CREATED", payload: { ...message, senderIdentityKey: messagingActorIdentityKey(actor) } });
        await dispatchMessagePush(conversation.id, actor, body.body);
      }
      return { success: true, data: message };
    } catch (error: any) {
      set.status = 400;
      return { success: false, error: error.message || "Unable to send message" };
    }
  }, { params: t.Object({ orderId: t.String({ format: "uuid" }) }), body: SendMessageSchema })
  .get("/orders/:orderId/conversation", async ({ headers, jwt, params, set }) => {
    try {
      const actor = await resolveMessagingActor(headers, (token) => jwt.verify(token));
      const conversation = await prisma.conversation.findFirst({ where: { orderId: params.orderId, type: "ORDER" }, select: { id: true, orderId: true } });
      if (!conversation) { set.status = 404; return { success: false, error: "Order conversation not found" }; }
      // Verify access
      await assertConversationAccess(actor, conversation.id);
      return { success: true, data: conversation };
    } catch (error: any) {
      set.status = 403;
      return { success: false, error: error.message || "Unable to access order conversation" };
    }
  }, { params: t.Object({ orderId: t.String({ format: "uuid" }) }) })

  // ── Talk to Staff ──
  .post("/talk-to-staff", async ({ headers, jwt, body, set }) => {
    try {
      const actor = await resolveMessagingActor(headers, (token) => jwt.verify(token));
      const result = await getOrCreateTalkToStaff(actor, body.hotelId, body.body);
      const identityKeys = await getConversationIdentityKeys(result.conversation.id);
      const hotelId = result.conversation.hotelId;
      // Also broadcast to all hotel staff so they see the notification
      const staff = hotelId ? await prisma.adminUser.findMany({ where: { hotelId }, select: { id: true } }) : [];
      const staffIdentityKeys = staff.map((s) => `admin:${s.id}`);
      const allRecipients = [...new Set([...identityKeys, ...staffIdentityKeys])];
      if (result.message) {
        wsHub.broadcastToIdentities(allRecipients, { type: "MESSAGE_CREATED", payload: { ...result.message, senderIdentityKey: messagingActorIdentityKey(actor) } });
      }
      wsHub.broadcastToIdentities(allRecipients, { type: "CONVERSATION_CREATED", payload: result.conversation });
      if (result.message?.body) {
        await dispatchMessagePush(result.conversation.id, actor, result.message.body);
      }
      return { success: true, data: result };
    } catch (error: any) {
      set.status = 400;
      return { success: false, error: error.message || "Unable to start conversation" };
    }
  }, { body: TalkToStaffSchema })

  // ─── Platform support (customer/hotel staff → Platform Administration) ───
  .post("/platform-support", async ({ headers, jwt, body, set }) => {
    try {
      const actor = await resolveMessagingActor(headers, (token) => jwt.verify(token));
      const result = await getOrCreatePlatformSupport(actor, body.body);
      const recipients = await getConversationIdentityKeys(result.conversation.id);
      if (result.message) {
        wsHub.broadcastToIdentities(recipients, { type: "MESSAGE_CREATED", payload: { ...result.message, senderIdentityKey: messagingActorIdentityKey(actor) } });
      }
      wsHub.broadcastToIdentities(recipients, { type: "CONVERSATION_CREATED", payload: result.conversation });
      return { success: true, data: result };
    } catch (error: any) {
      set.status = 400;
      return { success: false, error: error.message || "Unable to contact platform support" };
    }
  }, { body: PlatformSupportSchema })

  // ── Hotel notices ──
  .post("/hotel-notices", async ({ headers, jwt, body, set }) => {
    try {
      const actor = await resolveMessagingActor(headers, (token) => jwt.verify(token));
      const created = await createHotelNotice(actor, body);
      const hotel = body.hotelId ? await prisma.hotel.findUnique({ where: { id: body.hotelId }, select: { name: true } }) : null;
      const payload = {
        id: created.id, type: created.type, hotelId: created.hotelId,
        title: created.title, lastMessageAt: created.lastMessageAt, createdAt: created.createdAt,
        sourceName: hotel?.name || "Hotel",
        sourceKind: "Hotel notice",
        sourceContext: `Published by ${hotel?.name || "hotel management"}`,
        unreadCount: 1, messages: [created.message],
      };
      const recipients = await getAnnouncementRecipientIdentityKeys(created.id);
      if (created.created) wsHub.broadcastToIdentities(recipients, { type: "CONVERSATION_CREATED", payload });
      wsHub.broadcastToIdentities(recipients, { type: "MESSAGE_CREATED", payload: { ...created.message, senderIdentityKey: messagingActorIdentityKey(actor) } });
      wsHub.broadcastToIdentities(recipients, { type: "ANNOUNCEMENT_PUBLISHED", payload: { conversationId: created.id, title: created.title, body: created.message.body, sourceName: hotel?.name || "Hotel", senderIdentityKey: messagingActorIdentityKey(actor) } });
      await sendPushToAllCustomers({ title: created.title || "Hotel Announcement", body: created.message.body, url: "/inbox", tag: `notice-${created.id}` }).catch(() => 0);
      return { success: true, data: created };
    } catch (error: any) {
      set.status = 400;
      return { success: false, error: error.message || "Unable to publish notice" };
    }
  }, { body: HotelNoticeSchema })

  // ── Platform notices ──
  .post("/platform-notices", async ({ headers, jwt, body, set }) => {
    try {
      const actor = await resolveMessagingActor(headers, (token) => jwt.verify(token));
      const created = await createPlatformNotice(actor, body);
      const payload = {
        id: created.id, type: created.type, hotelId: null,
        title: created.title, lastMessageAt: created.lastMessageAt, createdAt: created.createdAt,
        sourceName: "Ladha Platform",
        sourceKind: "Platform notice",
        sourceContext: "Published by Platform Administration",
        unreadCount: 1, messages: [created.message],
      };
      const recipients = await getAnnouncementRecipientIdentityKeys(created.id);
      if (created.created) wsHub.broadcastToIdentities(recipients, { type: "CONVERSATION_CREATED", payload });
      wsHub.broadcastToIdentities(recipients, { type: "MESSAGE_CREATED", payload: { ...created.message, senderIdentityKey: messagingActorIdentityKey(actor) } });
      wsHub.broadcastToIdentities(recipients, { type: "ANNOUNCEMENT_PUBLISHED", payload: { conversationId: created.id, title: created.title, body: created.message.body, sourceName: "Ladha Platform", senderIdentityKey: messagingActorIdentityKey(actor) } });
      await sendPushToAllCustomers({ title: created.title || "Ladha Announcement", body: created.message.body, url: "/inbox", tag: `notice-${created.id}` }).catch(() => 0);
      return { success: true, data: created };
    } catch (error: any) {
      set.status = 400;
      return { success: false, error: error.message || "Unable to publish notice" };
    }
  }, { body: PlatformNoticeSchema })

  // ── Community channels ──
  .post("/community-channels", async ({ headers, jwt, body, set }) => {
    try {
      const actor = await resolveMessagingActor(headers, (token) => jwt.verify(token));
      const created = await createCommunityChannel(actor, body);
      const hotelId = created.hotelId;
      const staff = hotelId ? await prisma.adminUser.findMany({ where: { hotelId }, select: { id: true } }) : [];
      const staffKeys = staff.map((s) => `admin:${s.id}`);
      // Also notify hotel customers about the new channel
      const hotelCustomers = hotelId
        ? await prisma.order.findMany({ where: { hotelId }, select: { customerId: true }, distinct: ["customerId"] })
        : [];
      const customerKeys = hotelCustomers.map((o) => o.customerId ? `customer:${o.customerId}` : "").filter(Boolean);
      wsHub.broadcastToIdentities([...new Set([...staffKeys, ...customerKeys])], { type: "CONVERSATION_CREATED", payload: created });
      return { success: true, data: created };
    } catch (error: any) {
      set.status = 400;
      return { success: false, error: error.message || "Unable to create channel" };
    }
  }, { body: CommunityChannelSchema });
