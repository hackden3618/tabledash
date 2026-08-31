import { prisma } from "../../../../../infrastructure/database/prisma";

export const getDefaultHotel = async () => {
  return prisma.hotel.findFirst({ where: { deletedAt: null } });
};

export const getHotelById = async (id: string) => {
  return prisma.hotel.findUnique({ where: { id } });
};

export const getHotelBySlug = async (slug: string) => {
  return prisma.hotel.findUnique({ where: { slug } });
};

export const getAllHotels = async (zoneId?: string) => {
  return prisma.hotel.findMany({
    where: { deletedAt: null, isListed: true, ...(zoneId ? { zoneId } : {}) },
    select: { id: true, name: true, slug: true, imageUrl: true, isOpen: true, townRegion: { select: { name: true } }, zone: { select: { id: true, name: true, type: true } } },
    orderBy: { name: "asc" },
  });
};
