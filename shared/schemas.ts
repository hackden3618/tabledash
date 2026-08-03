/**
 * Purpose: Centralized API validation schemas using Elysia's `t` builder (TypeBox).
 * Responsibilities: Enforces strict request body, params, and query validation across backend routes.
 * Dependencies: elysia (t validator builder).
 * When to modify: When modifying API payloads or adding new request contracts.
 */

import { t } from "elysia";
import { PHONE_PATTERN, PHONE_MIN, PHONE_MAX } from "./phone";

export const OrderItemSchema = t.Object({
  productId: t.String({ format: "uuid", error: "Invalid product ID format" }),
  quantity: t.Integer({ minimum: 1, error: "Quantity must be at least 1" }),
});

const PhoneString = t.String({
  minLength: PHONE_MIN,
  maxLength: PHONE_MAX,
  pattern: PHONE_PATTERN,
  error: `Phone must be ${PHONE_MIN} digits in format 2547XXXXXXXX`,
});

export const CreateOrderSchema = t.Object({
  firstName: t.String({ minLength: 2, error: "First name is required" }),
  lastName: t.Optional(t.String()),
  phone: PhoneString,
  knownName: t.Optional(t.String()),
  stallNumber: t.Optional(t.String()),
  marketSection: t.Optional(t.String()),
  locationDescription: t.Optional(t.String()),
  items: t.Array(OrderItemSchema, { minItems: 1, error: "Order must contain at least one item" }),
  guestId: t.Optional(t.String({ format: "uuid" })),
  paymentMethod: t.Optional(t.Union([
    t.Literal("PAY_LATER"),
    t.Literal("PAY_ON_DELIVERY"),
  ])),
  orderingForOther: t.Optional(t.Boolean()),
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
  mealCategories: t.Optional(t.Array(t.Union([t.Literal("BREAKFAST"), t.Literal("LUNCH"), t.Literal("DRINKS"), t.Literal("DINNER"), t.Literal("OTHER")]))),
  imageUrl: t.String({ minLength: 5, error: "Product image URL is required" }),
  price: t.Number({ minimum: 0, error: "Price must be non-negative" }),
  available: t.Optional(t.Boolean({ default: true })),
  stockQty: t.Optional(t.Integer({ minimum: 0, default: 0 })),
});

export const UpdateProductSchema = t.Object({
  name: t.Optional(t.String({ minLength: 2, error: "Product name must be at least 2 characters" })),
  category: t.Optional(t.String()),
  mealCategories: t.Optional(t.Array(t.Union([t.Literal("BREAKFAST"), t.Literal("LUNCH"), t.Literal("DRINKS"), t.Literal("DINNER"), t.Literal("OTHER")]))),
  imageUrl: t.Optional(t.String({ minLength: 5, error: "Image URL must be at least 5 characters" })),
  price: t.Optional(t.Number({ minimum: 0, error: "Price must be non-negative" })),
  available: t.Optional(t.Boolean()),
});

export const UpdateProductStockSchema = t.Object({
  stockQty: t.Integer({ minimum: 0, error: "Stock quantity must be a non-negative integer" }),
});

export const UpdateProductAvailabilitySchema = t.Object({
  available: t.Boolean(),
});

export const AdminLoginSchema = t.Object({
  username: t.String({ minLength: 3, error: "Username is required" }),
  password: t.String({ minLength: 8, error: "Password must be at least 8 characters" }),
});

export const IdParamSchema = t.Object({
  id: t.String({ format: "uuid", error: "Invalid UUID parameter" }),
});

export const CustomerSendOtpSchema = t.Object({
  phone: PhoneString,
});

export const CustomerRegisterSchema = t.Object({
  firstName: t.String({ minLength: 2, error: "First name is required" }),
  lastName: t.Optional(t.String()),
  knownName: t.Optional(t.String()),
  phone: PhoneString,
  pin: t.String({ minLength: 4, maxLength: 4, pattern: "^[0-9]{4}$", error: "PIN must be exactly 4 digits" }),
  otp: t.String({ minLength: 4, maxLength: 4, pattern: "^[0-9]{4}$", error: "Verification code must be exactly 4 digits" }),
});

export const CustomerLoginSchema = t.Object({
  phone: PhoneString,
  pin: t.String({ minLength: 4, maxLength: 4, pattern: "^[0-9]{4}$", error: "PIN must be exactly 4 digits" }),
});

export const CancelOrderSchema = t.Object({
  reason: t.Optional(t.String({ maxLength: 500, error: "Cancellation reason is too long" })),
});

export const CustomerForgotPinSchema = t.Object({
  phone: PhoneString,
});

export const CustomerResetPinSchema = t.Object({
  phone: PhoneString,
  otp: t.String({ minLength: 4, maxLength: 4, pattern: "^[0-9]{4}$", error: "OTP must be exactly 4 digits" }),
  newPin: t.String({ minLength: 4, maxLength: 4, pattern: "^[0-9]{4}$", error: "PIN must be exactly 4 digits" }),
});
