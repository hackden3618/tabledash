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

export interface HotelStatusResult {
  isOpen: boolean;
  autoCloseAt: string | null;
}

export const getHotelIsOpen = async (): Promise<HotelStatusResult> => {
  const hotel = await getDefaultHotel();
  if (!hotel) return { isOpen: true, autoCloseAt: null };

  if (hotel.isOpen && hotel.autoCloseAt) {
    const closeTime = hotel.autoCloseAt.getTime();
    if (!isNaN(closeTime) && Date.now() >= closeTime) {
      await prisma.hotel.update({
        where: { id: hotel.id },
        data: { isOpen: false, autoCloseAt: null },
      });
      wsHub.broadcastMenuUpdate({
        type: "HOTEL_STATUS_UPDATED",
        payload: { isOpen: false, autoCloseAt: null },
      });
      return { isOpen: false, autoCloseAt: null };
    }
  }
  return { isOpen: hotel.isOpen, autoCloseAt: hotel.autoCloseAt?.toISOString() ?? null };
};

export const updateHotelIsOpen = async (
  isOpen: boolean,
  autoCloseAt?: string | null
): Promise<HotelStatusResult> => {
  const hotel = await getDefaultHotel();
  if (!hotel) throw new Error("No hotel configured");

  const closeDate = isOpen && autoCloseAt ? new Date(autoCloseAt) : null;
  await prisma.hotel.update({
    where: { id: hotel.id },
    data: { isOpen, autoCloseAt: closeDate },
  });

  const result = { isOpen, autoCloseAt: autoCloseAt ?? null };
  wsHub.broadcastMenuUpdate({ type: "HOTEL_STATUS_UPDATED", payload: result });
  return result;
};

export const getHotelName = async (): Promise<string> => {
  const hotel = await getDefaultHotel();
  return hotel?.name ?? "TableDash Deliveries";
};

export interface StaffUserPayload {
  name: string;
  phone: string;
  receiveSms: boolean;
}

export const getStaffUsers = async () => {
  return await prisma.staffUser.findMany({
    orderBy: { createdAt: "desc" },
  });
};

export const addStaffUser = async (data: StaffUserPayload) => {
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
    },
  });
};

export const updateStaffUser = async (id: string, data: Partial<StaffUserPayload>) => {
  const formatted = data.phone ? formatPhone(data.phone) : undefined;

  if (formatted) {
    const existing = await prisma.staffUser.findFirst({
      where: {
        phone: formatted,
        NOT: { id },
      },
    });
    if (existing) {
      throw new Error("Another staff member with this phone number already exists.");
    }
  }

  return await prisma.staffUser.update({
    where: { id },
    data: { ...data, phone: formatted ?? data.phone },
  });
};

export const deleteStaffUser = async (id: string) => {
  return await prisma.staffUser.delete({
    where: { id },
  });
};

/**
 * Returns an array of phone numbers for all staff configured to receive SMS.
 * If no staff users exist, falls back to the legacy settings-based staff_phone configuration
 * to maintain backward compatibility.
 */
export const getSmsRecipients = async (): Promise<string[]> => {
  const staff = await prisma.staffUser.findMany({
    where: { receiveSms: true },
    select: { phone: true },
  });

  if (staff.length > 0) {
    return staff.map((s) => s.phone);
  }

  // Fallback to legacy single setting if no specific staff users are configured
  const legacyPhone = await getStaffPhone();
  return legacyPhone ? [legacyPhone] : [];
};
