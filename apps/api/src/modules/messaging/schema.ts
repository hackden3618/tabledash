import { t } from "elysia";

export const ConversationIdSchema = t.Object({ id: t.String({ format: "uuid" }) });

export const CreateConversationSchema = t.Object({
  type: t.Union([t.Literal("DIRECT"), t.Literal("GROUP"), t.Literal("SUPPORT")]),
  hotelId: t.Optional(t.String({ format: "uuid" })),
  title: t.Optional(t.String({ maxLength: 120 })),
  targetAdminUserId: t.Optional(t.String({ format: "uuid" })),
  targetCustomerId: t.Optional(t.String({ format: "uuid" })),
  targetGuestIdentityId: t.Optional(t.String({ format: "uuid" })),
  adminUserIds: t.Optional(t.Array(t.String({ format: "uuid" }), { maxItems: 50 })),
});

export const SendMessageSchema = t.Object({
  body: t.String({ minLength: 1, maxLength: 4000 }),
  replyToId: t.Optional(t.String({ format: "uuid" })),
});

export const AnnouncementSchema = t.Object({
  type: t.Union([t.Literal("HOTEL_ANNOUNCEMENT"), t.Literal("GLOBAL_ANNOUNCEMENT")]),
  hotelId: t.Optional(t.String({ format: "uuid" })),
  title: t.Optional(t.String({ maxLength: 120 })),
  body: t.String({ minLength: 1, maxLength: 4000 }),
});
