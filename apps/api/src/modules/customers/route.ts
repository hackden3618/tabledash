import { Elysia } from "elysia"
import { Environment } from "../../../../../shared/config";
import { createCustomer, deleteCustomerDetails, getAllCustomers, updateCustomerDetails } from "./service";


// custom imports

const env = new Environment
const { apiPrefix } = env
export const customersRoute = new Elysia({
    prefix: `${apiPrefix}customers`, detail: {
        summary: "All menu items and actions to them",
        tags: ["Customers"]
    }
});
const app = customersRoute;
app.get("/", async () => {
    const customers = await getAllCustomers()
    return customers
})
app.post("/", async ({body}) => {
    const createdData = await createCustomer(body)
    return createdData
})
app.patch("/:id", async ({params, body}) => {
    const updatedCustomer = await updateCustomerDetails(params, body)
    return updatedCustomer
})
app.delete("/:id", async ({params}) => {
    return await deleteCustomerDetails(params)
})
