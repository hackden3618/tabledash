import { t } from "elysia";

export const ConversationIdSchema = t.Object({ id: t.String({ format: "uuid" }) });

export const SendMessageSchema = t.Object({
  body: t.String({ minLength: 1, maxLength: 4000 }),
  replyToId: t.Optional(t.String({ format: "uuid" })),
});

export const HotelNoticeSchema = t.Object({
  hotelId: t.String({ format: "uuid" }),
  title: t.Optional(t.String({ maxLength: 120 })),
  body: t.String({ minLength: 1, maxLength: 4000 }),
});

export const PlatformNoticeSchema = t.Object({
  title: t.Optional(t.String({ maxLength: 120 })),
  body: t.String({ minLength: 1, maxLength: 4000 }),
});

export const TalkToStaffSchema = t.Object({
  hotelId: t.String({ format: "uuid" }),
  body: t.Optional(t.String({ minLength: 1, maxLength: 4000 })),
});

/** Authenticated customer or hotel-staff request to Ladha platform support. */
export const PlatformSupportSchema = t.Object({
  body: t.Optional(t.String({ minLength: 1, maxLength: 4000 })),
});

export const CommunityChannelSchema = t.Object({
  hotelId: t.String({ format: "uuid" }),
  channelName: t.String({ minLength: 1, maxLength: 60 }),
});
