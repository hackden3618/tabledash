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
 */
export const getAllMenuItems = async () => {
  const products = await prisma.product.findMany({
    where: { deleted: false },
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
 */
export const createMenuItem = async (input: CreateProductInput) => {
  const stock = input.stockQty ?? 0;
  const isAvailable = input.available !== undefined ? input.available : stock > 0;

  const product = await prisma.product.create({
    data: {
      name: input.name,
      category: input.category ?? "General",
      imageUrl: input.imageUrl,
      price: input.price,
      available: isAvailable,
      stockQty: stock,
      deleted: false,
    },
  });

  return {
    ...product,
    price: Number(product.price),
  };
};

/**
 * Toggles product availability and broadcasts update via WebSockets to all connected clients.
 * WHY: Menu availability is broadcast immediately so every customer sees stock changes without refreshing.
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
 * AUTOMATION: If stockQty <= 0, automatically sets available = false.
 *   If stockQty > 0, automatically sets available = true.
 * WHY: Broadcasts immediately so all customer screens reflect the new count in real time.
 */
export const updateProductStock = async (id: string, stockQty: number) => {
  const isAvailable = stockQty > 0;

  const product = await prisma.product.update({
    where: { id },
    data: {
      stockQty,
      available: isAvailable,
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
