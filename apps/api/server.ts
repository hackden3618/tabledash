import { Elysia } from "elysia"

// custom imports
import { app } from "./app";
import {Environment } from "../../shared/config"

const env = new Environment
const BACKEND_PORT = env.backendPort;
new Elysia()
    .use(app)
    .listen(BACKEND_PORT)
console.log(`server is running on port ${BACKEND_PORT}`);
