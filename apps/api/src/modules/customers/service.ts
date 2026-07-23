import { prisma } from "../../../../../infrastructure/database/prisma"

export const createCustomer = async (body: any) => {
    const data = {
        firstName: body.firstName,
        knownName: body.knownName,
        phone: body.phone,
        location: body.location

    }
    const existingCustomer = await prisma.customer.findFirst({
        where: {
            firstName: data.firstName,
            phone: data.phone
        }
    })
    if (existingCustomer) return "Customer already exists, updating their records..."
    try {
        const creationData = await prisma.customer.create({ data })
        return creationData
    } catch (error: any) {
        console.log(error.message);
        return "failed to create customer"
    }
}

export const getAllCustomers = async () => {
    return await prisma.customer.findMany()
}

export const updateCustomerDetails = async (params: any, body: any)=>{
    const updatedCustomer = await prisma.customer.update({
        where: {
            id: params.id
        },
        data: {
            location: body.newLocation
        } 
    })
    return updatedCustomer
}

export const deleteCustomerDetails = async (params: any)=>{
    const deletedCustomer = await prisma.customer.delete({
        where: {
            id: params.id
        }
    })
    return deletedCustomer
}
