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

export const getAllHotels = async () => {
  return prisma.hotel.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
};
