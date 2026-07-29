import { describe, expect, test } from "bun:test";
import { WebSocketHub } from "./hub";

function socket(id: string, role: "admin" | "customer", hotelId?: string, identityKey?: string) {
  const messages: string[] = [];
  return {
    client: { id, role, hotelId, identityKey, send: (message: string) => messages.push(message) },
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
});
