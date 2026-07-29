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
      });
      await prisma.hotel.update({
        where: { id: hotel.id },
        data: { isOpen: false, autoCloseAt: null },
      });
      wsHub.broadcastMenuUpdate({
        type: "HOTEL_STATUS_UPDATED",
        payload: { isOpen: false, autoCloseAt: null, hotelId: hotel.id },
      });
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
    wsHub.broadcastMenuUpdate({ type: "HOTEL_STATUS_UPDATED", payload: result });
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
  });

  // After the countdown, broadcast final status update (DB is already closed)
  pendingCloseTimeout = setTimeout(async () => {
    pendingCloseTimeout = null;
    try {
      wsHub.broadcastMenuUpdate({
        type: "HOTEL_STATUS_UPDATED",
        payload: { isOpen: false, autoCloseAt: null, hotelId: hotelUuid },
      });
    } catch (err) {
      console.error("[Hotel Close Timer Error]:", err);
    }
  }, 5000);

  return { isOpen: false, autoCloseAt: null };
};

export const getHotelName = async (hotelId?: string): Promise<string> => {
  const hotel = hotelId ? await prisma.hotel.findUnique({ where: { id: hotelId } }) : await getDefaultHotel();
  return hotel?.name ?? "TableDash Deliveries";
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

  const existing = await prisma.staffUser.findUnique({
    where: { phone: formattedPhone },
  });
  if (existing) {
    throw new Error("A staff member with this phone number already exists.");
  }

  return await prisma.staffUser.create({
    data: {
      name: data.name,
      phone: formattedPhone,
      receiveSms: data.receiveSms,
      hotelId: hotelId || null,
    },
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
      where: { phone: formatted, NOT: { id } },
    });
    if (dup) {
      throw new Error("Another staff member with this phone number already exists.");
    }
  }

  return await prisma.staffUser.update({
    where: { id },
    data: { ...data, phone: formatted ?? data.phone },
  });
};

export const deleteStaffUser = async (id: string, hotelId?: string) => {
  const existing = await prisma.staffUser.findUnique({ where: { id } });
  if (!existing) throw new Error("Staff member not found");
  if (hotelId && existing.hotelId && existing.hotelId !== hotelId) {
    throw new Error("Staff member does not belong to your hotel");
  }

  return await prisma.staffUser.delete({
    where: { id },
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

  // Fallback to legacy single setting if no specific staff users are configured
  const legacyPhone = await getStaffPhone();
  return legacyPhone ? [legacyPhone] : [];
};
