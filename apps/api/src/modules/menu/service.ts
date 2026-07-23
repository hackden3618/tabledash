import { prisma } from "../../../../../infrastructure/database/prisma"
export const getAllMenu = async () => {
    try {
        const menuItems = await prisma.product.findFirst({
            where: {
                id: crypto.randomUUID()
            }
        })
        return menuItems
    } catch (error) {
        throw new Error("Database couldn't find users " + error)
    }
}
