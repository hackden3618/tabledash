/**
 * Purpose: Application Settings Service for tableDash.
 * Responsibilities: Handles reading and updating key-value application settings (e.g. hotel staff phone number for SMS notifications).
 * Dependencies: Prisma database client.
 * When to modify: When adding new configurable settings or changing storage formats.
 */

import { prisma } from "../../../../../infrastructure/database/prisma";

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
