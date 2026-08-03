/**
 * Purpose: Application Settings Service for tableDash.
 * Responsibilities: Handles reading and updating key-value application settings
 *   (e.g. hotel staff phone number for SMS alerts, and hotel open/closed status with auto-close schedule).
 * Dependencies: Prisma database client, WebSocket hub.
 * When to modify: When adding new configurable settings or changing storage formats.
 */

import { prisma } from "../../../../../infrastructure/database/prisma";
import { wsHub } from "../websocket/hub";
import { formatPhone } from "../../../../../shared/phone";
import { getDefaultHotel } from "../hotels/service";

export const getStaffPhone = async (): Promise<string> => {
  const setting = await prisma.setting.findUnique({
    where: { key: "staff_phone" },
  });
  return setting?.value ?? "";
};

export const updateStaffPhone = async (phone: string): Promise<string> => {
  const formatted = formatPhone(phone);
  const setting = await prisma.setting.upsert({
    where: { key: "staff_phone" },
    update: { value: formatted },
    create: { key: "staff_phone", value: formatted },
  });
  return setting.value;
};

export const getHotelImageUrl = async (hotelId?: string): Promise<string | null> => {
  const hotel = hotelId ? await prisma.hotel.findUnique({ where: { id: hotelId } }) : await getDefaultHotel();
  return hotel?.imageUrl ?? null;
};

export const updateHotelImageUrl = async (imageUrl: string, hotelId?: string): Promise<string> => {
  const hotel = hotelId ? await prisma.hotel.findUnique({ where: { id: hotelId } }) : await getDefaultHotel();
  if (!hotel) throw new Error("No hotel configured");
  const updated = await prisma.hotel.update({
    where: { id: hotel.id },
    data: { imageUrl },
  });
  return updated.imageUrl ?? "";
};

export interface HotelStatusResult {
  isOpen: boolean;
  autoCloseAt: string | null;
}

export const getHotelIsOpen = async (hotelId?: string): Promise<HotelStatusResult> => {
  const hotel = hotelId ? await prisma.hotel.findUnique({ where: { id: hotelId } }) : await getDefaultHotel();
  if (!hotel) return { isOpen: true, autoCloseAt: null };

  if (hotel.isOpen && hotel.autoCloseAt) {
    const closeTime = hotel.autoCloseAt.getTime();
    if (!isNaN(closeTime) && Date.now() >= closeTime) {
      wsHub.broadcastMenuUpdate({
        type: "HOTEL_CLOSING",
        payload: { closingIn: 0, isOpen: false, hotelId: hotel.id },
      }, hotel.id);
      await prisma.hotel.update({
        where: { id: hotel.id },
        data: { isOpen: false, autoCloseAt: null },
      });
      wsHub.broadcastMenuUpdate({
        type: "HOTEL_STATUS_UPDATED",
        payload: { isOpen: false, autoCloseAt: null, hotelId: hotel.id },
      }, hotel.id);
      return { isOpen: false, autoCloseAt: null };
    }
  }
  return { isOpen: hotel.isOpen, autoCloseAt: hotel.autoCloseAt?.toISOString() ?? null };
};

let pendingCloseTimeout: ReturnType<typeof setTimeout> | null = null;

export const updateHotelIsOpen = async (
  isOpen: boolean,
  autoCloseAt?: string | null,
  hotelId?: string
): Promise<HotelStatusResult> => {
  const hotel = hotelId ? await prisma.hotel.findUnique({ where: { id: hotelId } }) : await getDefaultHotel();
  if (!hotel) throw new Error("No hotel configured");

  // Cancel any pending close timer if we're reopening or toggling again
  if (pendingCloseTimeout) {
    clearTimeout(pendingCloseTimeout);
    pendingCloseTimeout = null;
  }

  if (isOpen) {
    await prisma.hotel.update({
      where: { id: hotel.id },
      data: { isOpen: true, autoCloseAt: autoCloseAt ? new Date(autoCloseAt) : null },
    });
    const result = { isOpen: true, autoCloseAt: autoCloseAt ?? null, hotelId: hotel.id };
    wsHub.broadcastMenuUpdate({ type: "HOTEL_STATUS_UPDATED", payload: result }, hotel.id);
    return result;
  }

  // Closing — update DB immediately so a page-refresh shows closed, then broadcast countdown
  const hotelUuid = hotel.id;
  await prisma.hotel.update({
    where: { id: hotelUuid },
    data: { isOpen: false, autoCloseAt: null },
  });

  wsHub.broadcastMenuUpdate({
    type: "HOTEL_CLOSING",
    payload: { closingIn: 5, isOpen: false, hotelId: hotelUuid },
  }, hotelUuid);

  // After the countdown, broadcast final status update (DB is already closed)
  pendingCloseTimeout = setTimeout(async () => {
    pendingCloseTimeout = null;
    try {
      wsHub.broadcastMenuUpdate({
        type: "HOTEL_STATUS_UPDATED",
        payload: { isOpen: false, autoCloseAt: null, hotelId: hotelUuid },
      }, hotelUuid);
    } catch (err) {
      console.error("[Hotel Close Timer Error]:", err);
    }
  }, 5000);

  return { isOpen: false, autoCloseAt: null };
};

export const getHotelName = async (hotelId?: string): Promise<string> => {
  const hotel = hotelId ? await prisma.hotel.findUnique({ where: { id: hotelId } }) : await getDefaultHotel();
  return hotel?.name ?? "Ladha Deliveries";
};

export interface StaffUserPayload {
  name: string;
  phone: string;
  receiveSms: boolean;
}

export const getStaffUsers = async (hotelId?: string) => {
  return await prisma.staffUser.findMany({
    where: hotelId ? { hotelId } : undefined,
    orderBy: { createdAt: "desc" },
  });
};

export const addStaffUser = async (data: StaffUserPayload, hotelId?: string) => {
  const formattedPhone = formatPhone(data.phone);

  const existing = await prisma.staffUser.findFirst({
    where: { phone: formattedPhone, hotelId },
  });
  if (existing) {
    throw new Error("A staff member with this phone number already exists at this hotel.");
  }

  if (!hotelId) throw new Error("A hotel is required before adding staff");
  const existingLogin = await prisma.adminUser.findUnique({ where: { username: formattedPhone } });
  if (existingLogin) throw new Error("A login already exists for this phone number.");
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { name: true } });
  if (!hotel) throw new Error("Hotel not found");
  const tempPassword = crypto.randomUUID().split("-")[0]!;
  const passwordHash = await Bun.password.hash(tempPassword);

  return prisma.$transaction(async (tx) => {
    const adminUser = await tx.adminUser.create({ data: { username: formattedPhone, passwordHash, name: data.name, role: "HOTEL_STAFF", hotelId } });
    const staff = await tx.staffUser.create({ data: { name: data.name, phone: formattedPhone, receiveSms: data.receiveSms, hotelId, adminUserId: adminUser.id } });
    await tx.eventOutbox.create({
      data: {
        eventName: "hotel_staff_created",
        hotelId,
        payload: JSON.stringify({ staffName: data.name, staffPhone: formattedPhone, hotelName: hotel.name, username: formattedPhone, tempPassword, role: "HOTEL_STAFF", appLink: "https://tabledash.up.railway.app/kitchen" }),
        status: "initialized",
      },
    });
    return staff;
  });
};

export const updateStaffUser = async (id: string, data: Partial<StaffUserPayload>, hotelId?: string) => {
  const existing = await prisma.staffUser.findUnique({ where: { id } });
  if (!existing) throw new Error("Staff member not found");
  if (hotelId && existing.hotelId && existing.hotelId !== hotelId) {
    throw new Error("Staff member does not belong to your hotel");
  }

  const formatted = data.phone ? formatPhone(data.phone) : undefined;

  if (formatted) {
    const dup = await prisma.staffUser.findFirst({
      where: { phone: formatted, hotelId, NOT: { id } },
    });
    if (dup) {
      throw new Error("Another staff member with this phone number already exists at this hotel.");
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.staffUser.update({
      where: { id },
      data: { ...data, phone: formatted ?? data.phone },
    });
    if (formatted && existing.adminUserId) {
      await tx.adminUser.update({ where: { id: existing.adminUserId }, data: { username: formatted } });
    }
    return updated;
  });
};

export const provisionStaffLogin = async (id: string, hotelId?: string) => {
  const existing = await prisma.staffUser.findUnique({ where: { id } });
  if (!existing) throw new Error("Staff member not found");
  if (hotelId && existing.hotelId !== hotelId) throw new Error("Staff member does not belong to your hotel");
  if (existing.adminUserId) throw new Error("This staff member already has a login");
  if (!existing.hotelId) throw new Error("Staff member is not assigned to a hotel");
  if (await prisma.adminUser.findUnique({ where: { username: existing.phone } })) throw new Error("A login already exists for this phone number");
  const hotel = await prisma.hotel.findUnique({ where: { id: existing.hotelId }, select: { name: true } });
  if (!hotel) throw new Error("Hotel not found");
  const tempPassword = crypto.randomUUID().split("-")[0]!;
  const passwordHash = await Bun.password.hash(tempPassword);
  return prisma.$transaction(async (tx) => {
    const adminUser = await tx.adminUser.create({ data: { username: existing.phone, passwordHash, name: existing.name, role: "HOTEL_STAFF", hotelId: existing.hotelId! } });
    const staff = await tx.staffUser.update({ where: { id }, data: { adminUserId: adminUser.id } });
    await tx.eventOutbox.create({ data: { eventName: "hotel_staff_created", hotelId: existing.hotelId, payload: JSON.stringify({ staffName: existing.name, staffPhone: existing.phone, hotelName: hotel.name, username: existing.phone, tempPassword, role: "HOTEL_STAFF", appLink: "https://tabledash.up.railway.app/kitchen" }), status: "initialized" } });
    return staff;
  });
};

export const deleteStaffUser = async (id: string, hotelId?: string) => {
  const existing = await prisma.staffUser.findUnique({ where: { id } });
  if (!existing) throw new Error("Staff member not found");
  if (hotelId && existing.hotelId && existing.hotelId !== hotelId) {
    throw new Error("Staff member does not belong to your hotel");
  }

  return prisma.$transaction(async (tx) => {
    if (existing.adminUserId) await tx.adminUser.delete({ where: { id: existing.adminUserId } });
    return tx.staffUser.delete({ where: { id } });
  });
};

/**
 * Returns an array of phone numbers for all staff configured to receive SMS.
 * If no staff users exist, falls back to the legacy settings-based staff_phone configuration
 * to maintain backward compatibility.
 */
export const getSmsRecipients = async (hotelId?: string): Promise<string[]> => {
  const where: any = { receiveSms: true };
  if (hotelId) where.hotelId = hotelId;

  const staff = await prisma.staffUser.findMany({
    where,
    select: { phone: true },
  });

  if (staff.length > 0) {
    return staff.map((s) => s.phone);
  }

  if (hotelId) {
    const fallback = await prisma.staffUser.findFirst({
      where: { hotelId },
      orderBy: { createdAt: "asc" },
      select: { phone: true },
    });
    if (fallback?.phone) return [fallback.phone];
  }

  return [];
};
