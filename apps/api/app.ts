import { Elysia } from "elysia"
import { openapi } from "@elysia/openapi"

// custom imports
import { menuRoute } from "@/modules/menu/route";
import { customersRoute } from "@/modules/customers/route";

export const app = new Elysia({});
app.use(openapi({
    documentation: {
        info: {
            title: "Tabledash",
            version: "1.0.0"
        }
    }
}))
app.use(menuRoute)
app.use(customersRoute)
