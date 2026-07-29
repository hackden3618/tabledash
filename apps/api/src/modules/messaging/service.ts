import { prisma } from "../../../../../infrastructure/database/prisma";
import type { ParticipantKind } from "../../../../../generated/prisma/client";

export type MessagingActor =
  | { kind: "CUSTOMER"; customerId: string }
  | { kind: "GUEST"; guestIdentityId: string; customerId?: string }
  | { kind: "HOTEL_STAFF"; adminUserId: string; hotelId: string }
  | { kind: "PLATFORM_ADMIN"; platformAdminId: string };

export function messagingActorIdentityKey(actor: MessagingActor) {
  if (actor.kind === "CUSTOMER") return `customer:${actor.customerId}`;
  if (actor.kind === "GUEST") return `guest:${actor.guestIdentityId}`;
  if (actor.kind === "HOTEL_STAFF") return `admin:${actor.adminUserId}`;
  return `platform:${actor.platformAdminId}`;
}

function participantData(actor: MessagingActor, canReply = true) {
  if (actor.kind === "CUSTOMER") return { kind: "CUSTOMER" as ParticipantKind, customerId: actor.customerId, canReply };
  if (actor.kind === "GUEST") return { kind: "GUEST" as ParticipantKind, guestIdentityId: actor.guestIdentityId, canReply };
  if (actor.kind === "HOTEL_STAFF") return { kind: "HOTEL_STAFF" as ParticipantKind, adminUserId: actor.adminUserId, canReply };
  return { kind: "PLATFORM_ADMIN" as ParticipantKind, platformAdminId: actor.platformAdminId, canReply };
}

function actorWhere(actor: MessagingActor) {
  if (actor.kind === "CUSTOMER") return { customerId: actor.customerId };
  if (actor.kind === "GUEST") return { guestIdentityId: actor.guestIdentityId };
  if (actor.kind === "HOTEL_STAFF") return { adminUserId: actor.adminUserId };
  return { platformAdminId: actor.platformAdminId };
}

async function customerHotelIds(actor: MessagingActor) {
  const customerId = actor.kind === "CUSTOMER" ? actor.customerId : actor.kind === "GUEST" ? actor.customerId : undefined;
  if (!customerId) return [];
  const orders = await prisma.order.findMany({ where: { customerId, hotelId: { not: null } }, select: { hotelId: true }, distinct: ["hotelId"] });
  return orders.flatMap((order) => order.hotelId ? [order.hotelId] : []);
}

const conversationInclude = {
  participants: true,
  messages: { orderBy: { createdAt: "desc" as const }, take: 1 },
};

// ── Inbox ──

export async function getInbox(actor: MessagingActor) {
  const all = await prisma.conversation.findMany({
    where: await accessibleConversationWhere(actor),
    include: { ...conversationInclude, order: { select: { orderNumber: true, status: true, hotel: { select: { name: true } } } } },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
  });
  const enriched = await enrichConversations(all, actor);
  return {
    orderConversations: enriched.filter((c) => c.type === "ORDER"),
    hotelNotices: enriched.filter((c) => c.type === "HOTEL_NOTICE"),
    platformNotices: enriched.filter((c) => c.type === "PLATFORM_NOTICE"),
    talkToStaff: enriched.filter((c) => c.type === "TALK_TO_STAFF"),
    communityChannels: enriched.filter((c) => c.type === "HOTEL_COMMUNITY"),
  };
}

export async function getUnreadCount(actor: MessagingActor) {
  const conversations = await prisma.conversation.findMany({
    where: await accessibleConversationWhere(actor),
    select: { id: true },
  });
  const own = actorWhere(actor);
  let total = 0;
  for (const conversation of conversations) {
    const participant = await prisma.conversationParticipant.findFirst({ where: { conversationId: conversation.id, ...own } });
    if (participant) {
      total += await prisma.message.count({
        where: { conversationId: conversation.id, senderParticipantId: { not: participant.id }, ...(participant.lastReadAt ? { createdAt: { gt: participant.lastReadAt } } : {}) },
      });
    }
  }
  return total;
}

// ── Conversation access ──

export async function getConversationIdentityKeys(conversationId: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true, hotelId: true } });
  if (!conversation) return [];
  const participants = await prisma.conversationParticipant.findMany({ where: { conversationId }, select: { kind: true, customerId: true, guestIdentityId: true, adminUserId: true, platformAdminId: true } });
  const participantKeys = participants.map(identityKeyForParticipant).filter((key): key is string => Boolean(key));
  if (conversation.type !== "TALK_TO_STAFF" || conversation.hotelId !== null) return participantKeys;
  const platformAdmins = await prisma.platformAdmin.findMany({ select: { id: true } });
  return [...new Set([...participantKeys, ...platformAdmins.map((admin) => `platform:${admin.id}`)])];
}

export async function getAnnouncementRecipientIdentityKeys(conversationId: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true, hotelId: true } });
  if (!conversation) return [];
  const [admins, platforms, customerIds] = await Promise.all([
    prisma.adminUser.findMany({ where: conversation.hotelId ? { hotelId: conversation.hotelId } : undefined, select: { id: true } }),
    conversation.hotelId ? Promise.resolve([]) : prisma.platformAdmin.findMany({ select: { id: true } }),
    conversation.hotelId
      ? prisma.order.findMany({ where: { hotelId: conversation.hotelId }, select: { customerId: true }, distinct: ["customerId"] })
      : prisma.customer.findMany({ select: { id: true } }),
  ]);
  return [
    ...admins.map((admin) => `admin:${admin.id}`),
    ...platforms.map((platform) => `platform:${platform.id}`),
    ...customerIds.map((customer) => `customer:${"customerId" in customer ? customer.customerId : customer.id}`),
  ];
}

export async function getConversationMessages(actor: MessagingActor, conversationId: string, cursor?: string) {
  const conversation = await assertConversationAccess(actor, conversationId);
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: 50,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { replyTo: { select: { id: true, body: true, deletedAt: true, senderParticipantId: true } } },
  });
  return { conversation, messages: messages.reverse(), nextCursor: messages.length === 50 ? messages[0]?.id : null };
}

export async function assertConversationAccess(actor: MessagingActor, conversationId: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, include: { participants: true } });
  if (!conversation) throw new Error("Conversation not found");
  const isParticipant = conversation.participants.some((participant) =>
    Object.entries(actorWhere(actor)).every(([key, value]) => (participant as Record<string, unknown>)[key] === value)
  );
  if (isParticipant) return conversation;
  const accessible = await accessibleConversationWhere(actor);
  const clauses = "OR" in accessible ? accessible.OR ?? [] : [accessible];
  const canAccess = clauses.some((clause: any) => {
    if (clause.type === "HOTEL_NOTICE" || clause.type === "PLATFORM_NOTICE") {
      return clause.type === conversation.type && (clause.hotelId === null || clause.hotelId === conversation.hotelId || clause.hotelId?.in?.includes(conversation.hotelId));
    }
    if (clause.type === "HOTEL_COMMUNITY") {
      return conversation.type === "HOTEL_COMMUNITY" && clause.hotelId === conversation.hotelId;
    }
    if (clause.type === "TALK_TO_STAFF") {
      return conversation.type === "TALK_TO_STAFF" && clause.hotelId === conversation.hotelId;
    }
    return false;
  });
  if (!canAccess) throw new Error("You do not have access to this conversation");
  // Auto-join shared channels and support queues after the broad access rule has passed.
  if (
    conversation.type === "HOTEL_COMMUNITY" ||
    (conversation.type === "TALK_TO_STAFF" && actor.kind === "HOTEL_STAFF") ||
    (conversation.type === "TALK_TO_STAFF" && actor.kind === "PLATFORM_ADMIN" && conversation.hotelId === null)
  ) {
    const newParticipant = await prisma.conversationParticipant.create({ data: { conversationId, ...participantData(actor) } });
    return { ...conversation, participants: [...conversation.participants, newParticipant] };
  }
  return conversation;
}

// ── ORDER conversations ──

export async function createOrderConversation(tx: any, orderId: string, hotelId: string, customerId: string) {
  const staff = await prisma.adminUser.findMany({ where: { hotelId, role: { in: ["HOTEL_ADMIN", "HOTEL_STAFF"] } }, select: { id: true } });
  const participants: { kind: ParticipantKind; adminUserId?: string; customerId?: string; canReply: boolean }[] = [
    { kind: "CUSTOMER", customerId, canReply: true },
    ...staff.map((admin) => ({ kind: "HOTEL_STAFF" as ParticipantKind, adminUserId: admin.id, canReply: true })),
  ];
  return tx.conversation.create({
    data: {
      type: "ORDER",
      orderId,
      hotelId,
      participants: { create: participants },
    },
  });
}

export async function sendOrderMessage(actor: MessagingActor, orderId: string, body: string, replyToId?: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true, id: true } });
  if (!order) throw new Error("Order not found");
  if (order.status === "DELIVERED" || order.status === "CANCELLED") throw new Error("This order is complete and can no longer receive messages");
  const conversation = await prisma.conversation.findFirst({ where: { orderId, type: "ORDER" }, include: { participants: true } });
  if (!conversation) throw new Error("Order conversation not found");
  return sendMessageToConversation(actor, conversation, body, replyToId);
}

// ── TALK TO STAFF ──

export async function getOrCreateTalkToStaff(actor: MessagingActor, hotelId: string, initialBody?: string) {
  if (actor.kind === "HOTEL_STAFF") throw new Error("Staff cannot start a Talk to Staff conversation");
  const customerId = actor.kind === "CUSTOMER" ? actor.customerId : actor.kind === "GUEST" ? actor.customerId : undefined;
  const guestIdentityId = actor.kind === "GUEST" ? actor.guestIdentityId : undefined;
  if (!customerId && !guestIdentityId) throw new Error("Authentication required");

  const existing = await prisma.conversation.findFirst({
    where: {
      type: "TALK_TO_STAFF",
      hotelId,
      participants: { some: customerId ? { customerId } : { guestIdentityId } },
    },
    include: { participants: true, order: { select: { orderNumber: true, status: true } } },
  });
  if (existing && !initialBody) return { conversation: existing, created: false };
  if (existing && initialBody) {
    const actorParticipant = existing.participants.find((p) =>
      Object.entries(actorWhere(actor)).every(([key, value]) => (p as Record<string, unknown>)[key] === value)
    );
    if (!actorParticipant) throw new Error("You are not a participant in this conversation");
    const message = await prisma.message.create({
      data: { conversationId: existing.id, senderParticipantId: actorParticipant.id, body: initialBody.trim() },
    });
    await prisma.conversation.update({ where: { id: existing.id }, data: { lastMessageAt: message.createdAt } });
    return { conversation: existing, message, created: false };
  }

  const participants: { kind: ParticipantKind; customerId?: string; guestIdentityId?: string; canReply: boolean }[] = [
    customerId
      ? { kind: "CUSTOMER", customerId, canReply: true }
      : { kind: "GUEST", guestIdentityId, canReply: true },
  ];
  const conversation = await prisma.conversation.create({
    data: { type: "TALK_TO_STAFF", hotelId, participants: { create: participants } },
    include: { participants: true },
  });
  let message = null;
  if (initialBody) {
    const sender = conversation.participants.find((p) =>
      Object.entries(actorWhere(actor)).every(([key, value]) => (p as Record<string, unknown>)[key] === value)
    );
    if (sender) {
      message = await prisma.message.create({
        data: { conversationId: conversation.id, senderParticipantId: sender.id, body: initialBody.trim() },
      });
      await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: message.createdAt } });
    }
  }
  return { conversation, message, created: true };
}

/**
 * Opens a durable support thread with Platform Administration. Unlike hotel
 * support, this is deliberately cross-tenant but visible only to its creator
 * and platform administrators.
 */
export async function getOrCreatePlatformSupport(actor: MessagingActor, initialBody?: string) {
  if (actor.kind !== "CUSTOMER" && actor.kind !== "HOTEL_STAFF") {
    throw new Error("Sign in as a customer or hotel staff member to contact platform support");
  }
  const existing = await prisma.conversation.findFirst({
    where: { type: "TALK_TO_STAFF", hotelId: null, participants: { some: actorWhere(actor) } },
    include: { participants: true },
  });
  if (existing && !initialBody) return { conversation: existing, message: null, created: false };
  if (existing && initialBody) {
    const sender = existing.participants.find((participant) =>
      Object.entries(actorWhere(actor)).every(([key, value]) => (participant as Record<string, unknown>)[key] === value)
    );
    if (!sender) throw new Error("You are not a participant in this support conversation");
    const message = await prisma.message.create({ data: { conversationId: existing.id, senderParticipantId: sender.id, body: initialBody.trim() } });
    await prisma.conversation.update({ where: { id: existing.id }, data: { lastMessageAt: message.createdAt } });
    return { conversation: existing, message, created: false };
  }

  const platformAdmins = await prisma.platformAdmin.findMany({ select: { id: true } });
  const participants = [
    { ...participantData(actor), canReply: true },
    ...platformAdmins.map((admin) => ({ kind: "PLATFORM_ADMIN" as ParticipantKind, platformAdminId: admin.id, canReply: true })),
  ];
  const conversation = await prisma.conversation.create({
    data: { type: "TALK_TO_STAFF", hotelId: null, participants: { create: participants } },
    include: { participants: true },
  });
  const sender = conversation.participants.find((participant) =>
    Object.entries(actorWhere(actor)).every(([key, value]) => (participant as Record<string, unknown>)[key] === value)
  );
  const message = initialBody && sender
    ? await prisma.message.create({ data: { conversationId: conversation.id, senderParticipantId: sender.id, body: initialBody.trim() } })
    : null;
  if (message) await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: message.createdAt } });
  return { conversation, message, created: true };
}

export async function sendTalkToStaffMessage(actor: MessagingActor, conversationId: string, body: string, replyToId?: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: true },
  });
  if (!conversation || conversation.type !== "TALK_TO_STAFF") throw new Error("Talk to Staff conversation not found");

  const sender = conversation.participants.find((p) =>
    Object.entries(actorWhere(actor)).every(([key, value]) => (p as Record<string, unknown>)[key] === value)
  );
  if (!sender) {
    if (actor.kind === "PLATFORM_ADMIN" && conversation.hotelId === null) {
      const newParticipant = await prisma.conversationParticipant.create({ data: { conversationId, ...participantData(actor), canReply: true } });
      return sendMessageToConversation(actor, { ...conversation, participants: [...conversation.participants, newParticipant] }, body, replyToId);
    }
    if (actor.kind !== "HOTEL_STAFF" || actor.hotelId !== conversation.hotelId) throw new Error("You cannot message this conversation");
    const newParticipant = await prisma.conversationParticipant.create({
      data: { conversationId, ...participantData(actor), canReply: true },
    });
    if (!conversation.assignedStaffId) {
      await prisma.conversation.update({ where: { id: conversationId }, data: { assignedStaffId: actor.adminUserId } });
    }
    return sendMessageToConversation(actor, { ...conversation, participants: [...conversation.participants, newParticipant] }, body, replyToId);
  }

  const message = await sendMessageToConversation(actor, conversation, body, replyToId);
  if (actor.kind === "HOTEL_STAFF" && !conversation.assignedStaffId) {
    await prisma.conversation.update({ where: { id: conversationId }, data: { assignedStaffId: actor.adminUserId } });
  }
  return message;
}

// ── NOTICES ──

export async function createHotelNotice(actor: MessagingActor, input: { hotelId: string; title?: string; body: string }) {
  if (actor.kind !== "HOTEL_STAFF") throw new Error("Only hotel staff can publish hotel notices");
  if (input.hotelId !== actor.hotelId) throw new Error("You can only publish notices to your own hotel");
  return createNotice(actor, "HOTEL_NOTICE", input.hotelId, input.title, input.body);
}

export async function createPlatformNotice(actor: MessagingActor, input: { title?: string; body: string }) {
  if (actor.kind !== "PLATFORM_ADMIN") throw new Error("Only platform admins can publish platform notices");
  return createNotice(actor, "PLATFORM_NOTICE", null, input.title, input.body);
}

async function createNotice(actor: MessagingActor, type: "HOTEL_NOTICE" | "PLATFORM_NOTICE", hotelId: string | null, title: string | undefined, body: string) {
  // Notices are one-way for recipients, but their publisher must be able to
  // add an official follow-up in the same announcement thread.
  const sender = participantData(actor, true);
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.create({ data: { type, hotelId, title } });
    const participant = await tx.conversationParticipant.create({ data: { conversationId: conversation.id, ...sender } });
    const [admins, platforms, customers] = await Promise.all([
      tx.adminUser.findMany({ where: hotelId ? { hotelId } : undefined, select: { id: true } }),
      hotelId ? Promise.resolve([] as { id: string }[]) : tx.platformAdmin.findMany({ select: { id: true } }),
      hotelId
        ? tx.order.findMany({ where: { hotelId }, select: { customerId: true }, distinct: ["customerId"] })
        : tx.customer.findMany({ select: { id: true } }),
    ]);
    const candidateRows: Array<{ conversationId: string; kind: ParticipantKind; adminUserId?: string; platformAdminId?: string; customerId?: string; canReply: boolean }> = [
      ...admins.map((admin) => ({ conversationId: conversation.id, kind: "HOTEL_STAFF" as ParticipantKind, adminUserId: admin.id, canReply: false })),
      ...platforms.map((platform) => ({ conversationId: conversation.id, kind: "PLATFORM_ADMIN" as ParticipantKind, platformAdminId: platform.id, canReply: false })),
      ...customers.map((customer) => ({ conversationId: conversation.id, kind: "CUSTOMER" as ParticipantKind, customerId: "customerId" in customer ? customer.customerId : customer.id, canReply: false })),
    ];
    const recipientRows = candidateRows.filter((row) => !(
      (actor.kind === "HOTEL_STAFF" && row.adminUserId === actor.adminUserId) ||
      (actor.kind === "PLATFORM_ADMIN" && row.platformAdminId === actor.platformAdminId) ||
      (actor.kind === "CUSTOMER" && row.customerId === actor.customerId)
    ));
    if (recipientRows.length) await tx.conversationParticipant.createMany({ data: recipientRows });
    const message = await tx.message.create({ data: { conversationId: conversation.id, senderParticipantId: participant.id, body: body.trim() } });
    await tx.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: message.createdAt } });
    return { ...conversation, message };
  });
}

// ── HOTEL COMMUNITY CHANNELS ──

export async function createCommunityChannel(actor: MessagingActor, input: { hotelId: string; channelName: string }) {
  if (actor.kind !== "HOTEL_STAFF") throw new Error("Only hotel staff can create community channels");
  if (input.hotelId !== actor.hotelId) throw new Error("You can only create channels for your own hotel");
  const slug = input.channelName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  if (!slug) throw new Error("Channel name must contain at least one letter or number");
  const existing = await prisma.conversation.findFirst({ where: { type: "HOTEL_COMMUNITY", hotelId: input.hotelId, channelName: slug } });
  if (existing) throw new Error(`Channel #${slug} already exists`);
  const sender = participantData(actor);
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.create({ data: { type: "HOTEL_COMMUNITY", hotelId: input.hotelId, channelName: slug } });
    const participant = await tx.conversationParticipant.create({ data: { conversationId: conversation.id, ...sender } });
    const msg = await tx.message.create({ data: { conversationId: conversation.id, senderParticipantId: participant.id, body: `Channel #${slug} created` } });
    await tx.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: msg.createdAt } });
    return { ...conversation, message: msg };
  });
}

// ── Message CRUD (shared across all channel types) ──

export async function sendMessage(actor: MessagingActor, conversationId: string, body: string, replyToId?: string) {
  const conversation = await assertConversationAccess(actor, conversationId);
  return sendMessageToConversation(actor, conversation, body, replyToId);
}

async function sendMessageToConversation(actor: MessagingActor, conversation: { id: string; type: string; participants: Array<{ id: string; canReply: boolean; kind: string; customerId: string | null; guestIdentityId: string | null; adminUserId: string | null; platformAdminId: string | null }> }, body: string, replyToId?: string) {
  const sender = conversation.participants.find((participant) =>
    Object.entries(actorWhere(actor)).every(([key, value]) => (participant as Record<string, unknown>)[key] === value)
  );
  if (!sender) throw new Error("Only conversation participants can send messages");
  if (!sender.canReply) {
    // Backward compatibility: notices published before publisher follow-ups
    // were introduced stored every participant as read-only. Only the author
    // of the original message receives this narrow exception.
    const isNotice = conversation.type === "HOTEL_NOTICE" || conversation.type === "PLATFORM_NOTICE";
    const initialMessage = isNotice
      ? await prisma.message.findFirst({ where: { conversationId: conversation.id }, orderBy: { createdAt: "asc" }, select: { senderParticipantId: true } })
      : null;
    if (!isNotice || initialMessage?.senderParticipantId !== sender.id) throw new Error("Replies are disabled for this conversation");
  }
  if (replyToId) {
    const replyTo = await prisma.message.findUnique({ where: { id: replyToId } });
    if (!replyTo || replyTo.conversationId !== conversation.id) throw new Error("Reply target message not found");
  }
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({ data: { conversationId: conversation.id, senderParticipantId: sender.id, body: body.trim(), replyToId: replyToId || null } });
    await tx.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: created.createdAt } });
    return created;
  });
  if (replyToId) {
    const replyTo = await prisma.message.findUnique({ where: { id: replyToId }, select: { body: true, deletedAt: true, senderParticipantId: true } });
    return { ...message, replyTo: replyTo ? { body: replyTo.body, deletedAt: replyTo.deletedAt, senderParticipantId: replyTo.senderParticipantId } : null };
  }
  return message;
}

export async function updateMessage(actor: MessagingActor, conversationId: string, messageId: string, body: string) {
  const conversation = await assertConversationAccess(actor, conversationId);
  const sender = conversation.participants.find((participant) =>
    Object.entries(actorWhere(actor)).every(([key, value]) => (participant as Record<string, unknown>)[key] === value)
  );
  if (!sender) throw new Error("Only conversation participants can edit messages");
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.conversationId !== conversationId) throw new Error("Message not found");
  if (message.senderParticipantId !== sender.id) throw new Error("You can only edit your own messages");
  return prisma.message.update({ where: { id: messageId }, data: { body: body.trim(), updatedAt: new Date() } });
}

export async function deleteMessage(actor: MessagingActor, conversationId: string, messageId: string) {
  const conversation = await assertConversationAccess(actor, conversationId);
  const sender = conversation.participants.find((participant) =>
    Object.entries(actorWhere(actor)).every(([key, value]) => (participant as Record<string, unknown>)[key] === value)
  );
  if (!sender) throw new Error("Only conversation participants can delete messages");
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.conversationId !== conversationId) throw new Error("Message not found");
  if (message.senderParticipantId !== sender.id) throw new Error("You can only delete your own messages");
  return prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date(), body: "", updatedAt: new Date() } });
}

export async function deleteConversation(actor: MessagingActor, conversationId: string) {
  const conversation = await assertConversationAccess(actor, conversationId);
  // Only remove the actor's participant record so the conversation stays for others
  const participant = await prisma.conversationParticipant.findFirst({
    where: { conversationId, ...actorWhere(actor) },
  });
  if (participant) {
    await prisma.conversationParticipant.delete({ where: { id: participant.id } });
  }
  return { success: true };
}

export async function markConversationRead(actor: MessagingActor, conversationId: string) {
  await assertConversationAccess(actor, conversationId);
  const participant = await prisma.conversationParticipant.findFirst({ where: { conversationId, ...actorWhere(actor) } });
  if (!participant) throw new Error("Only conversation participants can mark messages read");
  return prisma.conversationParticipant.update({ where: { id: participant.id }, data: { lastReadAt: new Date() } });
}

// ── Helpers ──

function identityKeyForParticipant(participant: { kind: ParticipantKind; customerId: string | null; guestIdentityId: string | null; adminUserId: string | null; platformAdminId: string | null }) {
  if (participant.kind === "CUSTOMER" && participant.customerId) return `customer:${participant.customerId}`;
  if (participant.kind === "GUEST" && participant.guestIdentityId) return `guest:${participant.guestIdentityId}`;
  if (participant.kind === "HOTEL_STAFF" && participant.adminUserId) return `admin:${participant.adminUserId}`;
  if (participant.kind === "PLATFORM_ADMIN" && participant.platformAdminId) return `platform:${participant.platformAdminId}`;
  return null;
}

async function accessibleConversationWhere(actor: MessagingActor) {
  if (actor.kind === "HOTEL_STAFF") {
    return {
      OR: [
        { participants: { some: actorWhere(actor) } },
        { type: "HOTEL_NOTICE" as const, hotelId: actor.hotelId },
        { type: "HOTEL_COMMUNITY" as const, hotelId: actor.hotelId },
        { type: "TALK_TO_STAFF" as const, hotelId: actor.hotelId },
      ],
    };
  }
  if (actor.kind === "PLATFORM_ADMIN") {
    return {
      OR: [
        { participants: { some: actorWhere(actor) } },
        { type: "PLATFORM_NOTICE" as const, hotelId: null },
        { type: "TALK_TO_STAFF" as const, hotelId: null },
      ],
    };
  }
  // GUEST actors must not see any communication or hotel notices — only platform announcements.
  if (actor.kind === "GUEST") {
    return { type: "PLATFORM_NOTICE" as const, hotelId: null };
  }
  const hotelIds = await customerHotelIds(actor);
  const communityWhere = actor.kind === "CUSTOMER"
    ? [{ type: "HOTEL_COMMUNITY" as const }]
    : hotelIds.length ? [{ type: "HOTEL_COMMUNITY" as const, hotelId: { in: hotelIds } }] : [];
  return {
    OR: [
      { participants: { some: actorWhere(actor) } },
      { type: "PLATFORM_NOTICE" as const, hotelId: null },
      ...(hotelIds.length ? [{ type: "HOTEL_NOTICE" as const, hotelId: { in: hotelIds } }] : []),
      ...communityWhere,
    ],
  };
}

async function enrichConversations(conversations: any[], actor: MessagingActor) {
  const own = actorWhere(actor);
  const hotelIds = [...new Set(conversations.flatMap((c: any) => c.hotelId ? [c.hotelId] : []))];
  const orderIds = [...new Set(conversations.flatMap((c: any) => c.orderId ? [c.orderId] : []))];
  const customerIds = [...new Set(conversations.flatMap((c: any) => c.type === "TALK_TO_STAFF" ? (c.participants || []).filter((p: any) => p.kind === "CUSTOMER" && p.customerId).map((p: any) => p.customerId) : []))];
  const staffIds = [...new Set(conversations.flatMap((c: any) => c.type === "TALK_TO_STAFF" ? (c.participants || []).filter((p: any) => p.kind === "HOTEL_STAFF" && p.adminUserId).map((p: any) => p.adminUserId) : []))];
  const assignedStaffIds = [...new Set(conversations.filter((c: any) => c.type === "TALK_TO_STAFF" && c.assignedStaffId).map((c: any) => c.assignedStaffId))];
  const [hotels, orders, customers, adminUsers] = await Promise.all([
    hotelIds.length ? prisma.hotel.findMany({ where: { id: { in: hotelIds } }, select: { id: true, name: true } }) : [],
    orderIds.length ? prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, orderNumber: true, status: true } }) : [],
    customerIds.length ? prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, firstName: true, knownName: true, phone: true } }) : [],
    [...staffIds, ...assignedStaffIds].length ? prisma.adminUser.findMany({ where: { id: { in: [...new Set([...staffIds, ...assignedStaffIds])] } }, select: { id: true, name: true } }) : [],
  ]);
  const hotelNames = new Map(hotels.map((h) => [h.id, h.name]));
  const orderStatuses = new Map(orders.map((o) => [o.id, { orderNumber: o.orderNumber, status: o.status }]));
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const adminMap = new Map(adminUsers.map((a) => [a.id, a]));

  return Promise.all(conversations.map(async (conversation: any) => {
    const participant = conversation.participants.find((item: any) =>
      Object.entries(own).every(([key, value]) => (item as Record<string, unknown>)[key] === value)
    );
    const unreadCount = participant
      ? await prisma.message.count({
          where: { conversationId: conversation.id, senderParticipantId: { not: participant.id }, ...(participant.lastReadAt ? { createdAt: { gt: participant.lastReadAt } } : {}) },
        })
      : 0;
    const orderInfo = conversation.orderId ? orderStatuses.get(conversation.orderId) : null;
    const hotelName = conversation.hotelId ? hotelNames.get(conversation.hotelId) : undefined;

    let sourceName: string | undefined;
    let sourceContext: string | undefined;
    if (conversation.type === "ORDER") {
      sourceName = hotelName || "Order";
      sourceContext = orderInfo ? `Order #${orderInfo.orderNumber} · ${orderInfo.status}` : "Order conversation";
    } else if (conversation.type === "TALK_TO_STAFF") {
      if (conversation.hotelId === null && actor.kind !== "PLATFORM_ADMIN") {
        sourceName = "Ladha Support";
        sourceContext = "Platform support";
      } else if (actor.kind === "HOTEL_STAFF" || actor.kind === "PLATFORM_ADMIN") {
        const customerP = conversation.participants?.find((p: any) => p.kind === "CUSTOMER" && p.customerId);
        const guestP = conversation.participants?.find((p: any) => p.kind === "GUEST" && p.guestIdentityId);
        const adminP = conversation.participants?.find((p: any) => p.kind === "HOTEL_STAFF" && p.adminUserId);
        const cust = customerP ? customerMap.get(customerP.customerId) : null;
        const admin = adminP ? adminMap.get(adminP.adminUserId) : null;
        if (cust) {
          sourceName = cust.knownName || cust.firstName || "Customer";
          sourceContext = cust.phone || "";
        } else if (admin) {
          sourceName = admin.name || "Hotel administrator";
          sourceContext = "Platform support request";
        } else if (guestP) {
          sourceName = "Guest";
          sourceContext = "Unregistered customer";
        } else {
          sourceName = hotelName || "Customer";
          sourceContext = "";
        }
      } else {
        const assignedStaff = conversation.assignedStaffId ? adminMap.get(conversation.assignedStaffId) : null;
        const staffP = conversation.participants?.find((p: any) => p.kind === "HOTEL_STAFF" && p.adminUserId);
        const staff = assignedStaff || (staffP ? adminMap.get(staffP.adminUserId) : null);
        if (staff) {
          sourceName = staff.name || "Staff";
          sourceContext = "Hotel team";
        } else {
          sourceName = hotelName || "Staff";
          sourceContext = "Awaiting response";
        }
      }
    } else if (conversation.type === "HOTEL_NOTICE") {
      sourceName = hotelName || "Hotel";
      sourceContext = `Published by ${hotelName || "hotel management"}`;
    } else if (conversation.type === "PLATFORM_NOTICE") {
      sourceName = "Ladha Platform";
      sourceContext = "Platform announcement";
    } else if (conversation.type === "HOTEL_COMMUNITY") {
      sourceName = hotelName || "Team";
      sourceContext = conversation.channelName ? `#${conversation.channelName}` : "Hotel team";
    }
    return { ...conversation, unreadCount, sourceName, sourceContext, orderInfo };
  }));
}
