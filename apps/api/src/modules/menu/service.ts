/**
 * Purpose: Menu & Product Management Service for tableDash.
 * Responsibilities: Handles querying menu items, creating products, updating details/stock, and toggling availability with real-time WebSocket broadcast.
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
 * Retrieves all menu items ordered oldest-first (stable display order).
 */
export const getAllMenuItems = async () => {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "asc" },
  });

  return products.map((p) => ({
    ...p,
    price: Number(p.price),
  }));
};

/**
 * Creates a new menu item with an initial stock quantity.
 */
export const createMenuItem = async (input: CreateProductInput) => {
  const product = await prisma.product.create({
    data: {
      name: input.name,
      category: input.category ?? "General",
      imageUrl: input.imageUrl,
      price: input.price,
      available: input.available ?? true,
      stockQty: input.stockQty ?? 0,
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
 * WHY: Broadcasts immediately so all customer screens reflect the new count in real time.
 */
export const updateProductStock = async (id: string, stockQty: number) => {
  const product = await prisma.product.update({
    where: { id },
    data: { stockQty },
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
 * Deletes a menu item.
 */
export const deleteMenuItem = async (id: string) => {
  return await prisma.product.delete({
    where: { id },
  });
};
