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

type CreateConversationInput = {
  type: "DIRECT" | "GROUP" | "SUPPORT";
  hotelId?: string;
  title?: string;
  targetAdminUserId?: string;
  targetCustomerId?: string;
  targetGuestIdentityId?: string;
  adminUserIds?: string[];
};

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

async function accessibleConversationWhere(actor: MessagingActor) {
  const own = { participants: { some: actorWhere(actor) } };
  if (actor.kind === "HOTEL_STAFF") {
    return { OR: [own, { type: "HOTEL_ANNOUNCEMENT" as const, hotelId: actor.hotelId }] };
  }
  if (actor.kind === "PLATFORM_ADMIN") {
    return { OR: [own, { type: "GLOBAL_ANNOUNCEMENT" as const, hotelId: null }] };
  }
  const hotelIds = await customerHotelIds(actor);
  return { OR: [own, { type: "GLOBAL_ANNOUNCEMENT" as const, hotelId: null }, ...(hotelIds.length ? [{ type: "HOTEL_ANNOUNCEMENT" as const, hotelId: { in: hotelIds } }] : [])] };
}

const conversationInclude = {
  participants: true,
  messages: { orderBy: { createdAt: "desc" as const }, take: 1 },
};

export async function listConversations(actor: MessagingActor) {
  const conversations = await prisma.conversation.findMany({
    where: await accessibleConversationWhere(actor),
    include: conversationInclude,
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
  });
  const own = actorWhere(actor);
  const hotelIds = conversations.flatMap((conversation) => conversation.hotelId ? [conversation.hotelId] : []);
  const hotels = hotelIds.length ? await prisma.hotel.findMany({ where: { id: { in: hotelIds } }, select: { id: true, name: true } }) : [];
  const hotelNames = new Map(hotels.map((hotel) => [hotel.id, hotel.name]));
  const customerIds = [...new Set(conversations.flatMap((conversation) => conversation.participants.flatMap((participant) => participant.customerId ? [participant.customerId] : [])))];
  const adminIds = [...new Set(conversations.flatMap((conversation) => conversation.participants.flatMap((participant) => participant.adminUserId ? [participant.adminUserId] : [])))];
  const platformIds = [...new Set(conversations.flatMap((conversation) => conversation.participants.flatMap((participant) => participant.platformAdminId ? [participant.platformAdminId] : [])))];
  const [customers, admins, platforms] = await Promise.all([
    customerIds.length ? prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, firstName: true, lastName: true, knownName: true } }) : [],
    adminIds.length ? prisma.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true } }) : [],
    platformIds.length ? prisma.platformAdmin.findMany({ where: { id: { in: platformIds } }, select: { id: true, name: true } }) : [],
  ]);
  const customerNames = new Map(customers.map((customer) => [customer.id, customer.knownName || `${customer.firstName} ${customer.lastName || ""}`.trim()]));
  const adminNames = new Map(admins.map((admin) => [admin.id, admin.name]));
  const platformNames = new Map(platforms.map((admin) => [admin.id, admin.name]));

  return Promise.all(conversations.map(async (conversation) => {
    const participant = conversation.participants.find((item) => Object.entries(own).every(([key, value]) => (item as Record<string, unknown>)[key] === value));
    const unreadCount = participant ? await prisma.message.count({ where: { conversationId: conversation.id, senderParticipantId: { not: participant.id }, ...(participant.lastReadAt ? { createdAt: { gt: participant.lastReadAt } } : {}) } }) : 0;
    const other = conversation.participants.find((item) => item.id !== participant?.id);
    const otherName = other?.customerId ? customerNames.get(other.customerId) : other?.adminUserId ? adminNames.get(other.adminUserId) : other?.platformAdminId ? platformNames.get(other.platformAdminId) : undefined;
    const sourceName = conversation.type === "SUPPORT" ? "Ladha Delivery Support" : conversation.type === "GLOBAL_ANNOUNCEMENT" ? (other?.platformAdminId ? platformNames.get(other.platformAdminId) : "Platform Administration") : conversation.type === "HOTEL_ANNOUNCEMENT" ? (conversation.hotelId ? hotelNames.get(conversation.hotelId) : undefined) : conversation.type === "DIRECT" ? (otherName || "Direct conversation") : conversation.type === "GROUP" ? (conversation.title || hotelNames.get(conversation.hotelId || "") || "Hotel team") : undefined;
    const sourceKind = conversation.type === "SUPPORT" ? "Ladha Delivery Support" : conversation.type === "GLOBAL_ANNOUNCEMENT" ? "Platform announcement" : conversation.type === "HOTEL_ANNOUNCEMENT" ? "Hotel announcement" : conversation.type === "GROUP" ? "Hotel group" : "Direct conversation";
    const sourceContext = conversation.type === "SUPPORT" ? "Support conversation for this account" : conversation.type === "GLOBAL_ANNOUNCEMENT" ? "Published by Platform Administration" : conversation.type === "HOTEL_ANNOUNCEMENT" ? `Published by ${sourceName || "hotel management"}` : conversation.type === "GROUP" ? "Private hotel team conversation" : `Private conversation with ${sourceName || "another participant"}`;
    return { ...conversation, title: conversation.type === "SUPPORT" ? "Ladha Delivery Support" : conversation.title, unreadCount, sourceName, sourceKind, sourceContext };
  }));
}

export async function getUnreadCount(actor: MessagingActor) {
  const conversations = await listConversations(actor);
  return conversations.reduce((total, conversation) => total + (conversation.unreadCount || 0), 0);
}

function identityKeyForParticipant(participant: { kind: ParticipantKind; customerId: string | null; guestIdentityId: string | null; adminUserId: string | null; platformAdminId: string | null }) {
  if (participant.kind === "CUSTOMER" && participant.customerId) return `customer:${participant.customerId}`;
  if (participant.kind === "GUEST" && participant.guestIdentityId) return `guest:${participant.guestIdentityId}`;
  if (participant.kind === "HOTEL_STAFF" && participant.adminUserId) return `admin:${participant.adminUserId}`;
  if (participant.kind === "PLATFORM_ADMIN" && participant.platformAdminId) return `platform:${participant.platformAdminId}`;
  return null;
}

export async function getConversationIdentityKeys(conversationId: string) {
  const participants = await prisma.conversationParticipant.findMany({ where: { conversationId }, select: { kind: true, customerId: true, guestIdentityId: true, adminUserId: true, platformAdminId: true } });
  return participants.map(identityKeyForParticipant).filter((key): key is string => Boolean(key));
}

/** Recipients for announcement fan-out. Customers only receive hotel notices
 * for hotels they have ordered from; platform notices are global by design. */
export async function getAnnouncementRecipientIdentityKeys(conversationId: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true, hotelId: true } });
  if (!conversation) return [];
  const [admins, platforms, customerIds] = await Promise.all([
    prisma.adminUser.findMany({ where: conversation.hotelId ? { hotelId: conversation.hotelId } : undefined, select: { id: true } }),
    prisma.platformAdmin.findMany({ select: { id: true } }),
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
  const accessible = (await accessibleConversationWhere(actor)) as { OR: any[] };
  const isAnnouncement = accessible.OR.some((clause) => clause.type === conversation.type && (clause.hotelId === null || clause.hotelId === conversation.hotelId || clause.hotelId?.in?.includes(conversation.hotelId)));
  if (!isParticipant && !isAnnouncement) throw new Error("You do not have access to this conversation");
  return conversation;
}

export async function createConversation(actor: MessagingActor, input: CreateConversationInput) {
  if (input.type === "GROUP" && actor.kind !== "HOTEL_STAFF") throw new Error("Only hotel staff can create group conversations");
  if (input.type === "DIRECT" && !input.targetAdminUserId && !input.targetCustomerId && !input.targetGuestIdentityId) throw new Error("A direct conversation needs a recipient");
  if ((input.type === "GROUP" || (input.type === "DIRECT" && Boolean(input.targetAdminUserId))) && !input.hotelId && actor.kind !== "HOTEL_STAFF") throw new Error("A hotel is required for this conversation");
  if (actor.kind === "HOTEL_STAFF" && input.hotelId && input.hotelId !== actor.hotelId) throw new Error("You can only use your own hotel");

  const participants = [participantData(actor)];
  const hotelId = input.hotelId ?? (actor.kind === "HOTEL_STAFF" ? actor.hotelId : undefined);

  if (input.type === "GROUP") {
    if (actor.kind !== "HOTEL_STAFF") throw new Error("Only hotel staff can create group conversations");
    const adminIds = [...new Set([actor.adminUserId, ...(input.adminUserIds ?? [])])];
    const admins = await prisma.adminUser.findMany({ where: { id: { in: adminIds }, hotelId }, select: { id: true } });
    if (admins.length !== adminIds.length) throw new Error("Every group member must belong to the same hotel");
    return prisma.conversation.create({ data: { type: input.type, hotelId, title: input.title, participants: { create: adminIds.map((adminUserId) => ({ kind: "HOTEL_STAFF", adminUserId, canReply: true })) } }, include: conversationInclude });
  }

  if (input.targetAdminUserId) {
    const target = await prisma.adminUser.findUnique({ where: { id: input.targetAdminUserId }, select: { id: true, hotelId: true } });
    if (!target || !target.hotelId || (hotelId && target.hotelId !== hotelId)) throw new Error("Recipient is not in the selected hotel");
    participants.push({ kind: "HOTEL_STAFF", adminUserId: target.id, canReply: true });
  } else if (input.targetCustomerId) {
    if (actor.kind === "CUSTOMER" || actor.kind === "GUEST") {
      const currentCustomerId = actor.kind === "CUSTOMER" ? actor.customerId : actor.customerId;
      if (!currentCustomerId) throw new Error("Create an account before starting a new user chat");
      const current = await prisma.customer.findUnique({ where: { id: currentCustomerId }, select: { isDiscoverable: true } });
      if (!current?.isDiscoverable) throw new Error("Turn on discoverability before finding other users");
    } else if (actor.kind !== "HOTEL_STAFF" && actor.kind !== "PLATFORM_ADMIN") throw new Error("Only staff can start a customer direct chat");
    const target = await prisma.customer.findUnique({ where: { id: input.targetCustomerId }, select: { id: true, isDiscoverable: true } });
    if (!target) throw new Error("Customer not found");
    if ((actor.kind === "CUSTOMER" || actor.kind === "GUEST") && !target.isDiscoverable) throw new Error("This user is not discoverable");
    participants.push({ kind: "CUSTOMER", customerId: target.id, canReply: true });
  } else if (input.targetGuestIdentityId) {
    if (actor.kind !== "HOTEL_STAFF" && actor.kind !== "PLATFORM_ADMIN") throw new Error("Only staff can start a guest direct chat");
    const target = await prisma.guestIdentity.findUnique({ where: { id: input.targetGuestIdentityId } });
    if (!target) throw new Error("Guest identity not found");
    participants.push({ kind: "GUEST", guestIdentityId: target.id, canReply: true });
  }

  if (input.type === "SUPPORT" && actor.kind !== "PLATFORM_ADMIN") {
    const platform = await prisma.platformAdmin.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    if (!platform) throw new Error("Support is not currently staffed");
    participants.push({ kind: "PLATFORM_ADMIN", platformAdminId: platform.id, canReply: true });
  }

  return prisma.conversation.create({ data: { type: input.type, hotelId: input.type === "SUPPORT" && actor.kind === "HOTEL_STAFF" ? actor.hotelId : hotelId, title: input.title || (input.type === "SUPPORT" ? "Ladha Delivery Support" : undefined), participants: { create: participants } }, include: conversationInclude });
}

export async function getDirectory(actor: MessagingActor, query?: string) {
  const q = query?.trim() ?? "";
  if (actor.kind === "CUSTOMER" || actor.kind === "GUEST") {
    const customerId = actor.kind === "CUSTOMER" ? actor.customerId : actor.customerId;
    if (!customerId) return [];
    const current = await prisma.customer.findUnique({ where: { id: customerId }, select: { isDiscoverable: true } });
    if (!current?.isDiscoverable) return [];
    return prisma.customer.findMany({
      where: { isDiscoverable: true, id: { not: customerId }, ...(q ? { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { knownName: { contains: q, mode: "insensitive" } }] } : {}) },
      select: { id: true, firstName: true, lastName: true, knownName: true }, take: 20,
    });
  }
  if (actor.kind === "HOTEL_STAFF") {
    const current = await prisma.adminUser.findUnique({ where: { id: actor.adminUserId }, select: { isDiscoverable: true } });
    if (!current?.isDiscoverable) return [];
    return prisma.adminUser.findMany({ where: { hotelId: actor.hotelId, isDiscoverable: true, id: { not: actor.adminUserId }, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { username: { contains: q, mode: "insensitive" } }] } : {}) }, select: { id: true, name: true, username: true, role: true }, take: 50 });
  }
  return prisma.adminUser.findMany({ where: { isDiscoverable: true, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { username: { contains: q, mode: "insensitive" } }] } : {}) }, select: { id: true, name: true, username: true, role: true }, take: 50 });
}

export async function updateDiscoverability(actor: MessagingActor, discoverable: boolean) {
  if (actor.kind === "CUSTOMER") return prisma.customer.update({ where: { id: actor.customerId }, data: { isDiscoverable: discoverable }, select: { isDiscoverable: true } });
  if (actor.kind === "HOTEL_STAFF") return prisma.adminUser.update({ where: { id: actor.adminUserId }, data: { isDiscoverable: discoverable }, select: { isDiscoverable: true } });
  throw new Error("This account cannot change discoverability here");
}

export async function getDiscoverability(actor: MessagingActor) {
  if (actor.kind === "CUSTOMER") return prisma.customer.findUnique({ where: { id: actor.customerId }, select: { isDiscoverable: true } });
  if (actor.kind === "HOTEL_STAFF") return prisma.adminUser.findUnique({ where: { id: actor.adminUserId }, select: { isDiscoverable: true } });
  return { isDiscoverable: false };
}

export async function sendMessage(actor: MessagingActor, conversationId: string, body: string, replyToId?: string) {
  const conversation = await assertConversationAccess(actor, conversationId);
  const sender = conversation.participants.find((participant) => Object.entries(actorWhere(actor)).every(([key, value]) => (participant as Record<string, unknown>)[key] === value));
  if (!sender) throw new Error("Only conversation participants can send messages");
  if (!sender.canReply) throw new Error("Replies are disabled for this conversation");
  if (replyToId) {
    const replyTo = await prisma.message.findUnique({ where: { id: replyToId } });
    if (!replyTo || replyTo.conversationId !== conversationId) throw new Error("Reply target message not found");
  }
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({ data: { conversationId, senderParticipantId: sender.id, body: body.trim(), replyToId: replyToId || null } });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: created.createdAt } });
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
  await assertConversationAccess(actor, conversationId);
  await prisma.conversation.delete({ where: { id: conversationId } });
  return { success: true };
}

export async function markConversationRead(actor: MessagingActor, conversationId: string) {
  await assertConversationAccess(actor, conversationId);
  const participant = await prisma.conversationParticipant.findFirst({ where: { conversationId, ...actorWhere(actor) } });
  if (!participant) throw new Error("Only conversation participants can mark messages read");
  return prisma.conversationParticipant.update({ where: { id: participant.id }, data: { lastReadAt: new Date() } });
}

export async function createAnnouncement(actor: MessagingActor, input: { type: "HOTEL_ANNOUNCEMENT" | "GLOBAL_ANNOUNCEMENT"; hotelId?: string; title?: string; body: string }) {
  if (input.type === "GLOBAL_ANNOUNCEMENT" && actor.kind !== "PLATFORM_ADMIN") throw new Error("Only platform admins can send global announcements");
  if (input.type === "HOTEL_ANNOUNCEMENT" && actor.kind !== "HOTEL_STAFF") throw new Error("Only hotel staff can send hotel announcements");
  if (input.type === "HOTEL_ANNOUNCEMENT" && (actor.kind !== "HOTEL_STAFF" || input.hotelId !== actor.hotelId)) throw new Error("You can only announce to your own hotel");
  const sender = participantData(actor, false);
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.create({ data: { type: input.type, hotelId: input.type === "GLOBAL_ANNOUNCEMENT" ? null : input.hotelId, title: input.title } });
    const participant = await tx.conversationParticipant.create({ data: { conversationId: conversation.id, ...sender } });
    const message = await tx.message.create({ data: { conversationId: conversation.id, senderParticipantId: participant.id, body: input.body.trim() } });
    await tx.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: message.createdAt } });
    return { ...conversation, message };
  });
}
