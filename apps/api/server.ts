/**
 * Purpose: Entrypoint server process runner for tableDash backend API.
 * Responsibilities: Initializes environment configuration, boots up the Elysia app listener on port 3000, and logs startup details.
 * Dependencies: apps/api/app.ts, shared/config.ts.
 * When to modify: When changing server boot parameters or startup lifecycle hooks.
 */

import { env } from "../../shared/config";
import { app } from "./app";

const port = env.backendPort;

app.listen(port, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 tableDash Backend API Server Running`);
  console.log(`🌐 Port: ${port}`);
  console.log(`⚡ WebSocket: /ws`);
  console.log(`==================================================\n`);
});
