import { Elysia } from "elysia"


// custom imports
import { Environment } from "../../../../../shared/config";
import { getAllMenu } from "./service";

const env = new Environment
const { apiPrefix } = env

export const menuRoute = new Elysia({
    prefix: `${apiPrefix}menu`, detail: {
        summary: "All menu items and actions to them",
        tags: ["Menu"]
    }
});
const app = menuRoute;
app.get("/", async () => {
    console.log(await getAllMenu());
    return "List all menu items"
})
app.post("/", () => {
    return "Add a menu item"
})
app.patch("/:id", ({ params }) => {
    return `Update a menu item with id ${params.id}`
})
app.delete("/:id", ({ params }) => {
    return `Delete a menu item with id ${params.id}`
})
