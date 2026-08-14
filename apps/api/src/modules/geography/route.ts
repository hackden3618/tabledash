/**
 * Purpose: Geography administration endpoints (County/City → Town → Local Area).
 * Responsibilities: Surface the hierarchy, run CRUD with full server-side
 *   validation, dependency-count previews, safe deactivation, and the legacy
 *   reclassification workflow. All mutations are audited and role-gated.
 * Dependencies: geography service, platform capability rules.
 */

import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { env } from "../../../../../shared/config";
import {
  getGeographyHierarchy,
  getCountyDetail,
  getTownDetail,
  createMegaRegion,
  updateMegaRegion,
  deactivateCounty,
  createTown,
  updateTown,
  deactivateTown,
  createArea,
  updateArea,
  deactivateArea,
  areaDependencies,
  townDependencies,
  previewReclassification,
  queueReclassification,
  applyReclassification,
  listReclassifications,
} from "./service";
import { requirePlatformActor, PlatformAuthError } from "../platform/capabilities";

export const geographyRoute = new Elysia({
  prefix: `${env.apiPrefix}/platform`,
  detail: { summary: "Geography administration — counties, cities, towns, local areas", tags: ["Platform"] },
})
  .use(jwt({ name: "jwt", secret: env.jwtSecret }))
  .onError(({ set, error }) => {
    if (error instanceof PlatformAuthError) {
      set.status = error.status;
      return { success: false, error: error.message };
    }
    set.status = 400;
    return { success: false, error: error instanceof Error ? error.message : "Geography operation failed" };
  })
  .get("/geography", async ({ headers, jwt, set }) => {
    try {
      await requirePlatformActor(headers, jwt, "geography:read");
      return { success: true, data: await getGeographyHierarchy() };
    } catch (err: any) { set.status = err.status ?? 400; return { success: false, error: err.message }; }
  })
  .get("/geography/:megaRegionId", async ({ params, headers, jwt, set }) => {
    try {
      await requirePlatformActor(headers, jwt, "geography:read");
      return { success: true, data: await getCountyDetail(params.megaRegionId) };
    } catch (err: any) { set.status = err.status ?? 400; return { success: false, error: err.message }; }
  }, { params: t.Object({ megaRegionId: t.String({ format: "uuid" }) }) })
  .get("/towns/:townId", async ({ params, headers, jwt, set }) => {
    try {
      await requirePlatformActor(headers, jwt, "geography:read");
      return { success: true, data: await getTownDetail(params.townId) };
    } catch (err: any) { set.status = err.status ?? 400; return { success: false, error: err.message }; }
  }, { params: t.Object({ townId: t.String({ format: "uuid" }) }) })
  .get("/towns/:townId/dependencies", async ({ params, headers, jwt, set }) => {
    try {
      await requirePlatformActor(headers, jwt, "geography:read");
      return { success: true, data: await townDependencies(params.townId) };
    } catch (err: any) { set.status = err.status ?? 400; return { success: false, error: err.message }; }
  }, { params: t.Object({ townId: t.String({ format: "uuid" }) }) })
  .get("/town-regions/:id/dependencies", async ({ params, headers, jwt, set }) => {
    try {
      await requirePlatformActor(headers, jwt, "geography:read");
      return { success: true, data: await areaDependencies(params.id) };
    } catch (err: any) { set.status = err.status ?? 400; return { success: false, error: err.message }; }
  }, { params: t.Object({ id: t.String({ format: "uuid" }) }) })
  .post("/mega-regions", async ({ body, headers, jwt, set }) => {
    try {
      const actor = await requirePlatformActor(headers, jwt, "geography:write");
      return { success: true, data: await createMegaRegion(body, actor) };
    } catch (err: any) { set.status = err.status ?? 400; return { success: false, error: err.message }; }
  }, { body: t.Object({ name: t.String({ minLength: 2, maxLength: 120 }), type: t.Union([t.Literal("COUNTY"), t.Literal("CITY"), t.Literal("OTHER")]) }) })
  .patch("/mega-regions/:id", async ({ params, body, headers, jwt, set }) => {
    try {
      const actor = await requirePlatformActor(headers, jwt, "geography:write");
      return { success: true, data: await updateMegaRegion(params.id, body, actor) };
    } catch (err: any) { set.status = err.status ?? 400; return { success: false, error: err.message }; }
  }, {
    params: t.Object({ id: t.String({ format: "uuid" }) }),
    body: t.Object({ name: t.Optional(t.String({ minLength: 2, maxLength: 120 })), type: t.Optional(t.Union([t.Literal("COUNTY"), t.Literal("CITY"), t.Literal("OTHER")])), active: t.Optional(t.Boolean()) }),
  })
  .post("/mega-regions/:id/deactivate", async ({ params, headers, jwt, set }) => {
    try {
      const actor = await requirePlatformActor(headers, jwt, "geography:deactivate");
      return { success: true, data: await deactivateCounty(params.id, actor) };
    } catch (err: any) { set.status = err.status ?? 400; return { success: false, error: err.message }; }
  }, { params: t.Object({ id: t.String({ format: "uuid" }) }) })
  .post("/towns", async ({ body, headers, jwt, set }) => {
    try {
      const actor = await requirePlatformActor(headers, jwt, "geography:write");
      const town = await createTown(body, actor);
      set.status = 201;
      return { success: true, data: town };
    } catch (err: any) { set.status = err.status ?? 400; return { success: false, error: err.message }; }
  }, {
    body: t.Object({
      name: t.String({ minLength: 2 }),
      megaRegionId: t.String({ format: "uuid" }),
      type: t.Optional(t.Union([t.Literal("MARKET"), t.Literal("BUS_STATION"), t.Literal("OFFICE_BUILDING"), t.Literal("RESIDENTIAL"), t.Literal("OTHER")])),
      locationLabel: t.Optional(t.String({ minLength: 2 })),
      locationPlaceholder: t.Optional(t.String({ minLength: 2 })),
    }),
  })
  .patch("/towns/:id", async ({ params, body, headers, jwt, set }) => {
    try {
      const actor = await requirePlatformActor(headers, jwt, "geography:write");
      return { success: true, data: await updateTown(params.id, body, actor) };
    } catch (err: any) { set.status = err.status ?? 400; return { success: false, error: err.message }; }
  }, {
    params: t.Object({ id: t.String({ format: "uuid" }) }),
    body: t.Object({
      name: t.Optional(t.String({ minLength: 2 })),
      megaRegionId: t.Optional(t.String({ format: "uuid" })),
      locationLabel: t.Optional(t.String({ minLength: 2 })),
      locationPlaceholder: t.Optional(t.String({ minLength: 2 })),
      active: t.Optional(t.Boolean()),
    }),
  })
  .post("/towns/:townId/areas", async ({ params, body, headers, jwt, set }) => {
    try {
      const actor = await requirePlatformActor(headers, jwt, "geography:write");
      const area = await createArea(params.townId, body, actor);
      set.status = 201;
      return { success: true, data: area };
    } catch (err: any) { set.status = err.status ?? 400; return { success: false, error: err.message }; }
  }, {
    params: t.Object({ townId: t.String({ format: "uuid" }) }),
    body: t.Object({
      name: t.String({ minLength: 2, maxLength: 120 }),
      active: t.Optional(t.Boolean()),
      note: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
      displayOrder: t.Optional(t.Number({ minimum: 0 })),
    }),
  })
  .patch("/town-regions/:id", async ({ params, body, headers, jwt, set }) => {
    try {
      const actor = await requirePlatformActor(headers, jwt, "geography:write");
      return { success: true, data: await updateArea(params.id, body, actor) };
    } catch (err: any) { set.status = err.status ?? 400; return { success: false, error: err.message }; }
  }, {
    params: t.Object({ id: t.String({ format: "uuid" }) }),
    body: t.Object({
      name: t.Optional(t.String({ minLength: 2, maxLength: 120 })),
      active: t.Optional(t.Boolean()),
      note: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
      displayOrder: t.Optional(t.Number({ minimum: 0 })),
    }),
  })
  .post("/town-regions/:id/deactivate", async ({ params, headers, jwt, set }) => {
    try {
      const actor = await requirePlatformActor(headers, jwt, "geography:deactivate");
      // Dependency counts must be known before the impactful flip — return them
      // with the result so the UI can show exactly what changed.
      const deps = await areaDependencies(params.id);
      const area = await deactivateArea(params.id, actor);
      return { success: true, data: { area, dependencies: deps } };
    } catch (err: any) { set.status = err.status ?? 400; return { success: false, error: err.message }; }
  }, { params: t.Object({ id: t.String({ format: "uuid" }) }) })
  .get("/reclassifications", async ({ headers, jwt, set }) => {
    try {
      await requirePlatformActor(headers, jwt, "geography:reclassify");
      return { success: true, data: await listReclassifications() };
    } catch (err: any) { set.status = err.status ?? 400; return { success: false, error: err.message }; }
  })
  .post("/geography/reclassifications/preview", async ({ body, headers, jwt, set }) => {
    try {
      await requirePlatformActor(headers, jwt, "geography:reclassify");
      return { success: true, data: await previewReclassification(body.sourceZoneId) };
    } catch (err: any) { set.status = err.status ?? 400; return { success: false, error: err.message }; }
  }, { body: t.Object({ sourceZoneId: t.String({ format: "uuid" }) }) })
  .post("/geography/reclassifications", async ({ body, headers, jwt, set }) => {
    try {
      const actor = await requirePlatformActor(headers, jwt, "geography:reclassify");
      const queued = await queueReclassification(body, actor);
      set.status = 201;
      return { success: true, data: queued };
    } catch (err: any) { set.status = err.status ?? 400; return { success: false, error: err.message }; }
  }, {
    body: t.Object({
      sourceZoneId: t.String({ format: "uuid" }),
      proposedTownId: t.String({ format: "uuid" }),
      areaName: t.String({ minLength: 2, maxLength: 120 }),
      reassignHotels: t.Optional(t.Boolean()),
    }),
  })
  .post("/geography/reclassifications/apply", async ({ body, headers, jwt, set }) => {
    try {
      const actor = await requirePlatformActor(headers, jwt, "geography:reclassify");
      return { success: true, data: await applyReclassification(body.reclassificationId, actor) };
    } catch (err: any) { set.status = err.status ?? 400; return { success: false, error: err.message }; }
  }, { body: t.Object({ reclassificationId: t.String({ format: "uuid" }) }) });