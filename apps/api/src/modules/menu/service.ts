/**
 * Purpose: Menu & Product Management Service for tableDash.
 * Responsibilities: Handles querying menu items, creating products, updating details/stock, soft-deleting, and toggling availability with real-time WebSocket broadcast.
 *   Automatically sets available=false when stockQty reaches 0 or below, and available=true when stock is replenished > 0.
 *   Soft deletes items so foreign key relations in order history are preserved.
 * Dependencies: Prisma database client, WebSocket Hub for live broadcasts.
 * When to modify: When adding new product fields, menu categories, or altering availability/stock logic.
 */

import { prisma } from "../../../../../infrastructure/database/prisma";
import { wsHub } from "../websocket/hub";
import { getDefaultHotel } from "../hotels/service";

export interface CreateProductInput {
  name: string;
  category?: string;
  imageUrl: string;
  price: number;
  available?: boolean;
  stockQty?: number;
}

/**
 * Retrieves all active (non-deleted) menu items ordered oldest-first.
 * Formats Decimal fields and includes freshness timestamps.
 */
export const getAllMenuItems = async () => {
  const hotel = await getDefaultHotel();
  const where: any = { deleted: false };
  if (hotel) where.hotelId = hotel.id;
  const products = await prisma.product.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });

  return products.map((p) => ({
    ...p,
    price: Number(p.price),
  }));
};

/**
 * Creates a new menu item with an initial stock quantity.
 * Automatically marks item unavailable if initial stockQty is <= 0.
 * Sets lastRestockedAt to track the initial stock entry.
 */
export const createMenuItem = async (input: CreateProductInput) => {
  const stock = input.stockQty ?? 0;
  const isAvailable = input.available !== undefined ? input.available : stock > 0;
  const hotel = await getDefaultHotel();

  const product = await prisma.product.create({
    data: {
      name: input.name,
      category: input.category ?? "General",
      imageUrl: input.imageUrl,
      price: input.price,
      available: isAvailable,
      stockQty: stock,
      lastRestockedAt: stock > 0 ? new Date() : null,
      deleted: false,
      hotelId: hotel?.id,
    },
  });

  return {
    ...product,
    price: Number(product.price),
  };
};

/**
 * Toggles product availability and broadcasts update via WebSockets to all connected clients.
 * DOES NOT touch freshness timestamps — toggling availability is not a stock event.
 */
export const updateProductAvailability = async (id: string, available: boolean) => {
  const product = await prisma.product.update({
    where: { id },
    data: { available },
  });

  const formattedProduct = {
    ...product,
    price: Number(product.price),
  };

  wsHub.broadcastMenuUpdate({
    type: "MENU_AVAILABILITY_UPDATED",
    payload: formattedProduct,
  });

  return formattedProduct;
};

/**
 * Updates the available stock quantity for a product.
 * Admin uses this to set how many portions are available for the day.
 * AUTOMATION: If stockQty <= 0, automatically sets available = false and records outOfStockSince.
 *   If stockQty > 0, automatically sets available = true, clears outOfStockSince, records lastRestockedAt.
 * WHY: Broadcasts immediately so all customer screens reflect the new count in real time.
 */
export const updateProductStock = async (id: string, stockQty: number) => {
  const existing = await prisma.product.findUnique({ where: { id } });
  const wasOutOfStock = existing ? existing.stockQty <= 0 : false;
  const isInStock = stockQty > 0;

  const updateData: any = {
    stockQty,
    available: isInStock,
  };

  if (isInStock && wasOutOfStock) {
    updateData.outOfStockSince = null;
    updateData.lastRestockedAt = new Date();
  } else if (!isInStock) {
    updateData.outOfStockSince = existing?.outOfStockSince ?? new Date();
  }

  const product = await prisma.product.update({
    where: { id },
    data: updateData,
  });

  const formattedProduct = {
    ...product,
    price: Number(product.price),
  };

  wsHub.broadcastMenuUpdate({
    type: "MENU_AVAILABILITY_UPDATED",
    payload: formattedProduct,
  });

  return formattedProduct;
};

/**
 * Soft-deletes a menu item to preserve foreign key order history.
 * Marks deleted=true and available=false, and broadcasts update to clients.
 */
export const deleteMenuItem = async (id: string) => {
  const product = await prisma.product.update({
    where: { id },
    data: {
      deleted: true,
      available: false,
    },
  });

  const formattedProduct = {
    ...product,
    price: Number(product.price),
  };

  wsHub.broadcastMenuUpdate({
    type: "MENU_AVAILABILITY_UPDATED",
    payload: formattedProduct,
  });

  return formattedProduct;
};
