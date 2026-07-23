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
