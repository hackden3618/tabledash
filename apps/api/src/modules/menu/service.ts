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
import { toPublicMediaUrl } from "../media/service";

export interface CreateProductInput {
  name: string;
  category?: string;
  imageUrl: string;
  price: number;
  available?: boolean;
  stockQty?: number;
  hotelId?: string;
}

/**
 * Retrieves all active (non-deleted) menu items ordered oldest-first.
 * Formats Decimal fields and includes freshness timestamps.
 */
export const getAllMenuItems = async (hotelId?: string) => {
  const where: any = { deleted: false };
  if (hotelId) {
    where.hotelId = hotelId;
  }
  const products = await prisma.product.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });

  return products.map((p) => ({
    ...p,
    price: Number(p.price),
    imageUrl: toPublicMediaUrl(p.imageUrl) ?? p.imageUrl,
  }));
};

/**
 * Creates a new menu item with an initial stock quantity.
 * Automatically marks item unavailable if initial stockQty is <= 0.
 * Sets lastRestockedAt to track the initial stock entry.
 */
export const createMenuItem = async (input: CreateProductInput, hotelIdFromJwt?: string) => {
  const stock = input.stockQty ?? 0;
  const isAvailable = input.available !== undefined ? input.available : stock > 0;
  const hotelId = hotelIdFromJwt || input.hotelId || (await getDefaultHotel())?.id;
  if (!hotelId) throw new Error("Hotel ID is required to create a product");

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
      hotelId,
    },
  });

  return {
    ...product,
    price: Number(product.price),
    imageUrl: toPublicMediaUrl(product.imageUrl) ?? product.imageUrl,
  };
};

/**
 * Toggles product availability and broadcasts update via WebSockets to all connected clients.
 * DOES NOT touch freshness timestamps — toggling availability is not a stock event.
 */
export const updateProductAvailability = async (id: string, available: boolean, hotelId?: string) => {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw new Error("Product not found");
  if (hotelId && existing.hotelId !== hotelId) {
    throw new Error("Product does not belong to your hotel");
  }

  const product = await prisma.product.update({
    where: { id },
    data: { available },
  });

  const formattedProduct = {
    ...product,
    price: Number(product.price),
    imageUrl: toPublicMediaUrl(product.imageUrl) ?? product.imageUrl,
  };

  wsHub.broadcastMenuUpdate({
    type: "MENU_AVAILABILITY_UPDATED",
    payload: formattedProduct,
  }, product.hotelId ?? undefined);

  return formattedProduct;
};

/**
 * Updates the available stock quantity for a product.
 * Admin uses this to set how many portions are available for the day.
 * AUTOMATION: If stockQty <= 0, automatically sets available = false and records outOfStockSince.
 *   If stockQty > 0, automatically sets available = true, clears outOfStockSince, records lastRestockedAt.
 * WHY: Broadcasts immediately so all customer screens reflect the new count in real time.
 */
export const updateProductStock = async (id: string, stockQty: number, hotelId?: string) => {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw new Error("Product not found");
  if (hotelId && existing.hotelId !== hotelId) {
    throw new Error("Product does not belong to your hotel");
  }
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
    imageUrl: toPublicMediaUrl(product.imageUrl) ?? product.imageUrl,
  };

  wsHub.broadcastMenuUpdate({
    type: "MENU_AVAILABILITY_UPDATED",
    payload: formattedProduct,
  }, product.hotelId ?? undefined);

  return formattedProduct;
};

export const updateProduct = async (id: string, input: { name?: string; category?: string; imageUrl?: string; price?: number; available?: boolean }, hotelId?: string) => {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw new Error("Product not found");
  if (hotelId && existing.hotelId !== hotelId) {
    throw new Error("Product does not belong to your hotel");
  }

  const updateData: any = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.category !== undefined) updateData.category = input.category;
  if (input.imageUrl !== undefined) updateData.imageUrl = input.imageUrl;
  if (input.price !== undefined) updateData.price = input.price;
  if (input.available !== undefined) updateData.available = input.available;

  const product = await prisma.product.update({
    where: { id },
    data: updateData,
  });

  const formattedProduct = {
    ...product,
    price: Number(product.price),
    imageUrl: toPublicMediaUrl(product.imageUrl) ?? product.imageUrl,
  };

  wsHub.broadcastMenuUpdate({
    type: "MENU_AVAILABILITY_UPDATED",
    payload: formattedProduct,
  }, product.hotelId ?? undefined);

  return formattedProduct;
};

/**
 * Soft-deletes a menu item to preserve foreign key order history.
 * Marks deleted=true and available=false, and broadcasts update to clients.
 */
export const deleteMenuItem = async (id: string, hotelId?: string) => {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw new Error("Product not found");
  if (hotelId && existing.hotelId !== hotelId) {
    throw new Error("Product does not belong to your hotel");
  }

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
    imageUrl: toPublicMediaUrl(product.imageUrl) ?? product.imageUrl,
  };

  wsHub.broadcastMenuUpdate({
    type: "MENU_AVAILABILITY_UPDATED",
    payload: formattedProduct,
  }, product.hotelId ?? undefined);

  return formattedProduct;
};
