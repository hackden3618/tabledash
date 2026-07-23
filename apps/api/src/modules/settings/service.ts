/**
 * Purpose: Application Settings Service for tableDash.
 * Responsibilities: Handles reading and updating key-value application settings
 *   (e.g. hotel staff phone number for SMS alerts, and hotel open/closed status with auto-close schedule).
 * Dependencies: Prisma database client, WebSocket hub.
 * When to modify: When adding new configurable settings or changing storage formats.
 */

import { prisma } from "../../../../../infrastructure/database/prisma";
import { wsHub } from "../websocket/hub";

export const getStaffPhone = async (): Promise<string> => {
  const setting = await prisma.setting.findUnique({
    where: { key: "staff_phone" },
  });
  return setting?.value ?? "";
};

export const updateStaffPhone = async (phone: string): Promise<string> => {
  const setting = await prisma.setting.upsert({
    where: { key: "staff_phone" },
    update: { value: phone },
    create: { key: "staff_phone", value: phone },
  });
  return setting.value;
};

export interface HotelStatusResult {
  isOpen: boolean;
  autoCloseAt: string | null;
}

export const getHotelIsOpen = async (): Promise<HotelStatusResult> => {
  const openSetting = await prisma.setting.findUnique({
    where: { key: "hotel_is_open" },
  });
  const autoCloseSetting = await prisma.setting.findUnique({
    where: { key: "auto_close_at" },
  });

  const manualOpen = openSetting ? openSetting.value === "true" : true;
  const autoCloseAt = autoCloseSetting?.value ?? null;

  // Check if auto-close time has passed
  if (manualOpen && autoCloseAt) {
    const closeTime = new Date(autoCloseAt).getTime();
    if (!isNaN(closeTime) && Date.now() >= closeTime) {
      // Auto-close threshold passed: transition to closed state
      await prisma.setting.upsert({
        where: { key: "hotel_is_open" },
        update: { value: "false" },
        create: { key: "hotel_is_open", value: "false" },
      });
      await prisma.setting.deleteMany({
        where: { key: "auto_close_at" },
      });

      wsHub.broadcastMenuUpdate({
        type: "HOTEL_STATUS_UPDATED",
        payload: { isOpen: false, autoCloseAt: null },
      });

      return { isOpen: false, autoCloseAt: null };
    }
  }

  return { isOpen: manualOpen, autoCloseAt };
};

export const updateHotelIsOpen = async (
  isOpen: boolean,
  autoCloseAt?: string | null
): Promise<HotelStatusResult> => {
  const valStr = isOpen ? "true" : "false";

  await prisma.setting.upsert({
    where: { key: "hotel_is_open" },
    update: { value: valStr },
    create: { key: "hotel_is_open", value: valStr },
  });

  if (isOpen && autoCloseAt) {
    await prisma.setting.upsert({
      where: { key: "auto_close_at" },
      update: { value: autoCloseAt },
      create: { key: "auto_close_at", value: autoCloseAt },
    });
  } else {
    await prisma.setting.deleteMany({
      where: { key: "auto_close_at" },
    });
  }

  const result: HotelStatusResult = {
    isOpen,
    autoCloseAt: isOpen ? autoCloseAt ?? null : null,
  };

  // Broadcast hotel status change to all connected clients
  wsHub.broadcastMenuUpdate({
    type: "HOTEL_STATUS_UPDATED",
    payload: result,
  });

  return result;
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
  // Enforce unique phone check
  const existing = await prisma.staffUser.findUnique({
    where: { phone: data.phone },
  });
  if (existing) {
    throw new Error("A staff member with this phone number already exists.");
  }

  return await prisma.staffUser.create({
    data: {
      name: data.name,
      phone: data.phone,
      receiveSms: data.receiveSms,
    },
  });
};

export const updateStaffUser = async (id: string, data: Partial<StaffUserPayload>) => {
  if (data.phone) {
    const existing = await prisma.staffUser.findFirst({
      where: {
        phone: data.phone,
        NOT: { id },
      },
    });
    if (existing) {
      throw new Error("Another staff member with this phone number already exists.");
    }
  }

  return await prisma.staffUser.update({
    where: { id },
    data,
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
