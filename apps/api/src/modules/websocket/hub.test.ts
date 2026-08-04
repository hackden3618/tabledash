import { describe, expect, test } from "bun:test";
import { WebSocketHub } from "./hub";

function socket(id: string, role: "admin" | "customer", hotelId?: string, identityKey?: string) {
  const messages: string[] = [];
  return {
    client: { id, role, hotelId, identityKey, conversationIds: new Set<string>(), send: (message: string) => messages.push(message) },
    messages,
  };
}

describe("WebSocketHub tenant routing", () => {
  test("routes menu updates only to the target hotel and platform admins", () => {
    const hub = new WebSocketHub();
    const hotelA = socket("hotel-a", "admin", "hotel-a");
    const hotelB = socket("hotel-b", "admin", "hotel-b");
    const platform = socket("platform", "admin");
    const customer = socket("customer", "customer", undefined, "customer:one");
    [hotelA, hotelB, platform, customer].forEach(({ client }) => hub.registerClient(client));

    hub.broadcastMenuUpdate({ type: "MENU_AVAILABILITY_UPDATED", payload: { id: "product-1" } }, "hotel-a");

    expect(hotelA.messages).toHaveLength(1);
    expect(hotelB.messages).toHaveLength(0);
    expect(platform.messages).toHaveLength(1);
    expect(customer.messages).toHaveLength(1);
    hub.shutdown();
  });

  test("routes order updates to the hotel and authorized order owner only", () => {
    const hub = new WebSocketHub();
    const admin = socket("admin", "admin", "hotel-a");
    const owner = socket("owner", "customer", undefined, "customer:one");
    const other = socket("other", "customer", undefined, "customer:two");
    [admin, owner, other].forEach(({ client }) => hub.registerClient(client));

    hub.notifyOrderStatusUpdate("order-1", { type: "ORDER_STATUS_UPDATED", payload: { status: "DELIVERED" } }, "hotel-a", ["customer:one"]);

    expect(admin.messages).toHaveLength(1);
    expect(owner.messages).toHaveLength(1);
    expect(other.messages).toHaveLength(0);
    hub.shutdown();
  });

  test("notifications are scoped to hotel admins only — cross hotel isolation enforced", () => {
    const hub = new WebSocketHub();
    const hotelA = socket("hotel-a", "admin", "hotel-a");
    const hotelB = socket("hotel-b", "admin", "hotel-b");
    const platform = socket("platform", "admin");
    const customer = socket("customer", "customer", undefined, "customer:one");
    [hotelA, hotelB, platform, customer].forEach(({ client }) => hub.registerClient(client));

    hub.broadcastNotification({ type: "ORDER_PAYMENT_UPDATED", payload: { orderId: "order-1" } }, "hotel-a");

    expect(hotelA.messages).toHaveLength(1);
    expect(hotelB.messages).toHaveLength(0);
    expect(platform.messages).toHaveLength(0);
    expect(customer.messages).toHaveLength(0);
    hub.shutdown();
  });

  test("hotel admin does not receive other hotel's order notifications", () => {
    const hub = new WebSocketHub();
    const hotelAAdmin = socket("admin-a", "admin", "hotel-a");
    const hotelBAdmin = socket("admin-b", "admin", "hotel-b");
    const owner = socket("owner", "customer", undefined, "customer:one");
    [hotelAAdmin, hotelBAdmin, owner].forEach(({ client }) => hub.registerClient(client));

    hub.notifyOrderStatusUpdate("order-1", { type: "ORDER_STATUS_UPDATED", payload: { status: "DELIVERED" } }, "hotel-b", ["customer:one"]);

    expect(hotelAAdmin.messages).toHaveLength(0);
    expect(hotelBAdmin.messages).toHaveLength(1);
    expect(owner.messages).toHaveLength(1);
    hub.shutdown();
  });

  test("customer does not receive their order notifications on other hotel subscriptions", () => {
    const hub = new WebSocketHub();
    const hotelAdmin = socket("admin", "admin", "hotel-a");
    const customer = socket("customer", "customer", undefined, "customer:one");
    [hotelAdmin, customer].forEach(({ client }) => hub.registerClient(client));

    hub.notifyOrderStatusUpdate("order-1", { type: "ORDER_STATUS_UPDATED", payload: { status: "DELIVERED" } }, "hotel-a", ["customer:one"]);

    expect(hotelAdmin.messages).toHaveLength(1);
    expect(customer.messages).toHaveLength(1);
    hub.shutdown();
  });

  test("broadcastToConversation routes only to conversation members", () => {
    const hub = new WebSocketHub();
    const admin = socket("admin", "admin", "hotel-a");
    const memberA = socket("m-a", "customer", undefined, "customer:one");
    const memberB = socket("m-b", "customer", undefined, "customer:two");
    const outsider = socket("outsider", "customer", undefined, "customer:three");
    [admin, memberA, memberB, outsider].forEach(({ client }) => hub.registerClient(client));

    admin.client.conversationIds = new Set(["conv-1"]);
    memberA.client.conversationIds = new Set(["conv-1"]);
    memberB.client.conversationIds = new Set(["conv-1"]);
    outsider.client.conversationIds = new Set(["conv-2"]);

    hub.broadcastToConversation("conv-1", { type: "MESSAGE_CREATED", payload: { id: "msg-1" } });

    expect(memberA.messages).toHaveLength(1);
    expect(memberB.messages).toHaveLength(1);
    expect(admin.messages).toHaveLength(1);
    expect(outsider.messages).toHaveLength(0);
    hub.shutdown();
  });

  test("broadcastToIdentity delivers only to the matching identity", () => {
    const hub = new WebSocketHub();
    const target = socket("target", "customer", undefined, "customer:one");
    const other = socket("other", "customer", undefined, "customer:two");
    [target, other].forEach(({ client }) => hub.registerClient(client));

    hub.broadcastToIdentity("customer:one", { type: "WALLET_UPDATED", payload: { balance: 500 } });

    expect(target.messages).toHaveLength(1);
    expect(other.messages).toHaveLength(0);
    hub.shutdown();
  });

});