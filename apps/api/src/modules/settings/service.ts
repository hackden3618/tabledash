/**
 * Purpose: Application Settings Service for ladha.
 * Responsibilities: Handles reading and updating key-value application settings
 *   (e.g. hotel staff phone number for SMS alerts, and hotel open/closed status with auto-close schedule).
 * Dependencies: Prisma database client, WebSocket hub.
 * When to modify: When adding new configurable settings or changing storage formats.
 */

import { prisma } from "../../../../../infrastructure/database/prisma";
import { wsHub } from "../websocket/hub";
import { formatPhone } from "../../../../../shared/phone";
import { getDefaultHotel } from "../hotels/service";
import { createPasswordSetupToken } from "../auth/password-setup.service";

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

import { deleteMediaByUrl } from "../media/service";

export const getHotelImageUrl = async (hotelId?: string): Promise<string | null> => {
  const hotel = hotelId ? await prisma.hotel.findUnique({ where: { id: hotelId } }) : await getDefaultHotel();
  return hotel?.imageUrl ?? null;
};

export const updateHotelImageUrl = async (imageUrl: string, hotelId?: string): Promise<string> => {
  const hotel = hotelId ? await prisma.hotel.findUnique({ where: { id: hotelId } }) : await getDefaultHotel();
  if (!hotel) throw new Error("No hotel configured");

  if (hotel.imageUrl && hotel.imageUrl !== imageUrl) {
    void deleteMediaByUrl(hotel.imageUrl);
  }

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

export interface DeliveryFeeSetting {
  zoneId: string;
  amount: number;
}

export async function getHotelDeliverySettings(hotelId: string) {
  const [hotel, zones] = await Promise.all([
    prisma.hotel.findUnique({
      where: { id: hotelId },
      select: { genericDeliveryFee: true, deliveryFees: { select: { zoneId: true, amount: true } } },
    }),
    prisma.zone.findMany({ where: { active: true }, select: { id: true, name: true, type: true }, orderBy: { name: "asc" } }),
  ]);
  if (!hotel) throw new Error("Hotel not found");
  const fees = new Map(hotel.deliveryFees.map((fee) => [fee.zoneId, Number(fee.amount)]));
  return {
    genericDeliveryFee: Number(hotel.genericDeliveryFee),
    deliveryFees: zones.map((zone) => ({ ...zone, amount: fees.get(zone.id) ?? null })),
  };
}

export async function updateHotelDeliverySettings(hotelId: string, genericDeliveryFee: number, deliveryFees: DeliveryFeeSetting[]) {
  if (!Number.isFinite(genericDeliveryFee) || genericDeliveryFee < 0) throw new Error("Generic delivery fee must be zero or greater");
  for (const fee of deliveryFees) {
    if (!Number.isFinite(fee.amount) || fee.amount < 0) throw new Error("Delivery fees must be zero or greater");
  }
  await prisma.$transaction(async (tx) => {
    await tx.hotel.update({ where: { id: hotelId }, data: { genericDeliveryFee } });
    for (const fee of deliveryFees) {
      await tx.hotelDeliveryFee.upsert({
        where: { hotelId_zoneId: { hotelId, zoneId: fee.zoneId } },
        create: { hotelId, zoneId: fee.zoneId, amount: fee.amount },
        update: { amount: fee.amount },
      });
    }
  });
  return getHotelDeliverySettings(hotelId);
}

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
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { name: true } });
  if (!hotel) throw new Error("Hotel not found");

  // One phone may now be staff (and a login) at many hotels. Reuse an existing login instead of
  // throwing: same password everywhere, and no setup link is sent for a login they already have.
  const existingLogin = await prisma.adminUser.findFirst({ where: { username: formattedPhone } });
  const localLogin = existingLogin && existingLogin.hotelId === hotelId ? existingLogin : null;
  const remoteLogin = existingLogin && existingLogin.hotelId !== hotelId ? existingLogin : null;
  const passwordHash = localLogin ? localLogin.passwordHash : remoteLogin ? remoteLogin.passwordHash : await Bun.password.hash(crypto.randomUUID());

  return prisma.$transaction(async (tx) => {
    const adminUser = localLogin ?? (await tx.adminUser.create({ data: { username: formattedPhone, passwordHash, name: data.name, role: "HOTEL_STAFF", hotelId } }));
    const staff = await tx.staffUser.create({ data: { name: data.name, phone: formattedPhone, receiveSms: data.receiveSms, hotelId, adminUserId: adminUser.id } });
    // A brand-new login starts locked; the SMS carries a one-time setup link.
    const { rawToken } = localLogin || remoteLogin ? { rawToken: undefined as string | undefined } : await createPasswordSetupToken(adminUser.id, "HOTEL_STAFF", tx);
    await tx.eventOutbox.create({
      data: {
        eventName: "hotel_staff_created",
        hotelId,
        payload: JSON.stringify({ staffName: data.name, staffPhone: formattedPhone, hotelName: hotel.name, username: localLogin || remoteLogin ? undefined : formattedPhone, setupToken: rawToken, role: "HOTEL_STAFF" }),
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
      const usernameTaken = await tx.adminUser.findFirst({
        where: { username: formatted, hotelId: existing.hotelId, NOT: { id: existing.adminUserId } },
      });
      if (usernameTaken) {
        throw new Error("Another login at this hotel already uses that phone number.");
      }
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
  const hotel = await prisma.hotel.findUnique({ where: { id: existing.hotelId }, select: { name: true } });
  if (!hotel) throw new Error("Hotel not found");

  // The phone may already be a login elsewhere — reuse that password instead of creating a new one.
  const existingLogin = await prisma.adminUser.findFirst({ where: { username: existing.phone } });
  const localLogin = existingLogin && existingLogin.hotelId === existing.hotelId ? existingLogin : null;
  const remoteLogin = existingLogin && existingLogin.hotelId !== existing.hotelId ? existingLogin : null;
  const passwordHash = localLogin ? localLogin.passwordHash : remoteLogin ? remoteLogin.passwordHash : await Bun.password.hash(crypto.randomUUID());

  return prisma.$transaction(async (tx) => {
    const adminUser = localLogin ?? (await tx.adminUser.create({ data: { username: existing.phone, passwordHash, name: existing.name, role: "HOTEL_STAFF", hotelId: existing.hotelId! } }));
    const staff = await tx.staffUser.update({ where: { id }, data: { adminUserId: adminUser.id } });
    const { rawToken } = localLogin || remoteLogin ? { rawToken: undefined as string | undefined } : await createPasswordSetupToken(adminUser.id, "HOTEL_STAFF", tx);
    await tx.eventOutbox.create({ data: { eventName: "hotel_staff_created", hotelId: existing.hotelId, payload: JSON.stringify({ staffName: existing.name, staffPhone: existing.phone, hotelName: hotel.name, username: localLogin || remoteLogin ? undefined : existing.phone, setupToken: rawToken, role: "HOTEL_STAFF" }), status: "initialized" } });
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
    if (existing.adminUserId) {
      const sharedCount = await tx.staffUser.count({ where: { adminUserId: existing.adminUserId } });
      if (sharedCount <= 1) {
        await tx.adminUser.delete({ where: { id: existing.adminUserId } });
      }
    }
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
