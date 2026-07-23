/**
 * Purpose: Centralized API validation schemas using Elysia's `t` builder (TypeBox).
 * Responsibilities: Enforces strict request body, params, and query validation across backend routes.
 * Dependencies: elysia (t validator builder).
 * When to modify: When modifying API payloads or adding new request contracts.
 */

import { t } from "elysia";

export const OrderItemSchema = t.Object({
  productId: t.String({ format: "uuid", error: "Invalid product ID format" }),
  quantity: t.Integer({ minimum: 1, error: "Quantity must be at least 1" }),
});

const PhonePattern = "^\\+?\\d{10,13}$";

export const CreateOrderSchema = t.Object({
  customerName: t.String({ minLength: 2, error: "Customer name is required" }),
  phone: t.String({ minLength: 10, maxLength: 14, pattern: PhonePattern, error: "Phone must be 10-13 digits, optionally prefixed with +" }),
  marketSection: t.Optional(t.String()),
  locationDescription: t.Optional(t.String()),
  items: t.Array(OrderItemSchema, { minItems: 1, error: "Order must contain at least one item" }),
});

export const UpdateOrderStatusSchema = t.Object({
  status: t.Union([
    t.Literal("NEW"),
    t.Literal("ACCEPTED"),
    t.Literal("PREPARING"),
    t.Literal("READY_FOR_DELIVERY"),
    t.Literal("OUT_FOR_DELIVERY"),
    t.Literal("DELIVERED"),
    t.Literal("CANCELLED"),
  ]),
  cancelReason: t.Optional(t.String()),
});

export const CreateProductSchema = t.Object({
  name: t.String({ minLength: 2, error: "Product name is required" }),
  category: t.Optional(t.String({ default: "General" })),
  imageUrl: t.String({ minLength: 5, error: "Product image URL is required" }),
  price: t.Number({ minimum: 0, error: "Price must be non-negative" }),
  available: t.Optional(t.Boolean({ default: true })),
  stockQty: t.Optional(t.Integer({ minimum: 0, default: 0 })),
});

export const UpdateProductStockSchema = t.Object({
  stockQty: t.Integer({ minimum: 0, error: "Stock quantity must be a non-negative integer" }),
});

export const UpdateProductAvailabilitySchema = t.Object({
  available: t.Boolean(),
});

export const AdminLoginSchema = t.Object({
  username: t.String({ minLength: 3, error: "Username is required" }),
  password: t.String({ minLength: 4, error: "Password is required" }),
});

export const IdParamSchema = t.Object({
  id: t.String({ format: "uuid", error: "Invalid UUID parameter" }),
});

export const CustomerRegisterSchema = t.Object({
  firstName: t.String({ minLength: 2, error: "First name is required" }),
  phone: t.String({ minLength: 10, maxLength: 14, pattern: PhonePattern, error: "Phone must be 10-13 digits, optionally prefixed with +" }),
  pin: t.String({ minLength: 4, maxLength: 4, pattern: "^[0-9]{4}$", error: "PIN must be exactly 4 digits" }),
});

export const CustomerLoginSchema = t.Object({
  phone: t.String({ minLength: 10, maxLength: 14, pattern: PhonePattern, error: "Phone must be 10-13 digits, optionally prefixed with +" }),
  pin: t.String({ minLength: 4, maxLength: 4, pattern: "^[0-9]{4}$", error: "PIN must be exactly 4 digits" }),
});
