import { describe, expect, test, mock } from "bun:test";

// ── In-memory database mirroring the geography relations ──
interface Row {
  id: string;
  [key: string]: any;
}

const seedCounty = { id: "county-1", name: "Nakuru County", type: "COUNTY", active: true };
const seedCounty2 = { id: "county-2", name: "Kisumu County", type: "COUNTY", active: false };
const seedTown = {
  id: "town-1",
  megaRegionId: "county-1",
  name: "Naivasha Town",
  type: "OTHER",
  locationLabel: "Delivery point",
  locationPlaceholder: "e.g. building, landmark",
  active: true,
};
const seedFallback = { id: "area-fb-1", townId: "town-1", name: "General Area", active: true, isFallback: true, note: null, displayOrder: 0 };
const seedArea = { id: "area-1", townId: "town-1", name: "Karagita", active: true, isFallback: false, note: null, displayOrder: 1 };
const seedHotel = { id: "hotel-1", name: "Wambu's Corner", slug: "wambu", zoneId: "town-1", deletedAt: null };
const seedCustomer = { id: "cust-1", firstName: "D", phone: "2547", townRegionId: "area-1" };

interface DBSchema {
  megaRegion: Row[];
  zone: Row[];
  townRegion: Row[];
  hotel: Row[];
  customer: Row[];
  hotelDeliveryFee: Row[];
  geographyReclassification: Row[];
  auditLog: Row[];
}

let db: DBSchema;
let idSeq = 1;

function nextId(prefix: string) {
  return `${prefix}-${idSeq++}`;
}

function resetDb() {
  idSeq = 1;
  db = {
    megaRegion: [JSON.parse(JSON.stringify(seedCounty)), JSON.parse(JSON.stringify(seedCounty2))],
    zone: [JSON.parse(JSON.stringify(seedTown))],
    townRegion: [JSON.parse(JSON.stringify(seedFallback)), JSON.parse(JSON.stringify(seedArea))],
    hotel: [JSON.parse(JSON.stringify(seedHotel))],
    customer: [JSON.parse(JSON.stringify(seedCustomer))],
    hotelDeliveryFee: [],
    geographyReclassification: [],
    auditLog: [],
  };
}
resetDb();

// ── Minimal Prisma `where` matcher covering what the service uses ──
function match(row: Row, where: any): boolean {
  if (where === undefined || where === null) return true;
  for (const [key, condition] of Object.entries(where)) {
    if (key === "OR") {
      if (!(condition as any[]).some((c) => match(row, c))) return false;
      continue;
    }
    if (key === "NOT") {
      if (match(row, condition as any)) return false;
      continue;
    }
    if (key === "name") {
      if (typeof condition === "object") {
        const eq = String((condition as any).equals ?? "").toLowerCase();
        const mode = (condition as any).mode;
        const rowName = (row[key] ?? "").toString();
        if (!(mode === "insensitive" ? rowName.toLowerCase() : rowName) || !eq) return false;
        if (rowName.toLowerCase() !== eq) return false;
      } else if (String(row[key] ?? "").toLowerCase() !== String(condition ?? "").toLowerCase()) {
        return false;
      }
      continue;
    }
    if (typeof condition === "object" && condition !== null && !(condition instanceof Date)) {
      if ("equals" in condition) {
        if (row[key] !== condition.equals) return false;
      } else if ("in" in condition) {
        if (!(condition.in as any[]).includes(row[key])) return false;
      } else if ("notIn" in condition) {
        if ((condition.notIn as any[]).includes(row[key])) return false;
      } else if ("not" in condition && condition.not === null) {
        if (row[key] !== null) return false;
      } else if ("lte" in condition || "gt" in condition || "lt" in condition || "gte" in condition) {
        const c = condition as any;
        const v = new Date(row[key]).getTime();
        if (c.lte !== undefined && v > new Date(c.lte).getTime()) return false;
        if (c.lt !== undefined && v >= new Date(c.lt).getTime()) return false;
        if (c.gte !== undefined && v < new Date(c.gte).getTime()) return false;
        if (c.gt !== undefined && v <= new Date(c.gt).getTime()) return false;
      } else {
        return match(row[key] as Row, condition);
      }
    } else if (row[key] !== condition) {
      return false;
    }
  }
  return true;
}

function applySelect(row: Row, select: any): Row {
  if (!select) return row;
  const copy: any = {};
  for (const [key, val] of Object.entries(select)) {
    if (val === true) copy[key] = row[key];
    else if (typeof val === "object") {
      if (key === "megaRegion") {
        const m = db.megaRegion.find((r) => r.id === row.megaRegionId);
        copy[key] = m ? applySelect({ ...m }, val) : null;
      } else if (key === "town") {
        const t = db.zone.find((r) => r.id === row.townId);
        copy[key] = t ? applySelect({ ...t }, val) : null;
      } else if (key === "deliveryRegions") {
        const areas = db.townRegion.filter((a) => a.townId === row.id);
        copy[key] = areas.map((a) => applySelect({ ...a }, val));
      }
    }
  }
  return copy;
}

function applyInclude(row: Row, include: any) {
  if (!include) return row;
  const copy = { ...row };
  if (include.megaRegion === true) {
    copy.megaRegion = db.megaRegion.find((m) => m.id === row.megaRegionId) ?? null;
  }
  if (include.megaRegion === false) {
    copy.megaRegion = null;
  }
  if (include.megaRegion && typeof include.megaRegion === "object") {
    const m = db.megaRegion.find((r) => r.id === row.megaRegionId);
    copy.megaRegion = m ? applySelect({ ...m }, include.megaRegion) : null;
  }
  if (include.town === true) {
    const town = db.zone.find((z) => z.id === row.townId);
    copy.town = town ? applyInclude({ ...town }, include.town) : null;
  }
  if (include.town && typeof include.town === "object") {
    const town = db.zone.find((z) => z.id === row.townId);
    copy.town = town ? applyInclude({ ...town }, include.town) : null;
  }
  if (include.deliveryRegions) {
    let areas = db.townRegion.filter((a) => a.townId === row.id);
    const cond = include.deliveryRegions;
    if (cond.where) areas = areas.filter((a) => match(a, cond.where));
    if (cond.orderBy) areas = sortRows(areas, cond.orderBy);
    copy.deliveryRegions = areas.map((a) => applyInclude(a, cond.include));
  }
  if (include.hotels) {
    let hotels = db.hotel.filter((h) => h.zoneId === row.id);
    const cond = include.hotels;
    if (cond.where) hotels = hotels.filter((h) => match(h, cond.where));
    copy.hotels = hotels.map((h) => ({ ...h }));
  }
  if (include._count) {
    copy._count = {};
    for (const entry of Object.entries(include._count as Record<string, any>)) {
      const rel = entry[0];
      const ctx = entry[1] as any;
      if (ctx && ctx.select && ctx.select.customers) {
        const target = rel === "customers" ? row : { ...row, townId: row.id };
        copy._count[rel] = ctx.select.customers ? db.customer.filter((c) => c.townRegionId === (target.townRegionId ?? target.id)).length : 0;
      } else if (rel === "customers") {
        copy._count[rel] = db.customer.filter((c) => c.townRegionId === row.id).length;
      }
    }
  }
  return copy;
}

function sortRows(rows: Row[], orderBy: any): Row[] {
  const clone = [...rows];
  const by = Array.isArray(orderBy) ? orderBy : [orderBy];
  clone.sort((a, b) => {
    for (const spec of by) {
      const entries = Object.entries(spec as Record<string, string>);
      const field = entries[0]?.[0] ?? "";
      const dir = entries[0]?.[1] ?? "asc";
      let av = (a as any)[field];
      let bv = (b as any)[field];
      if (field === "name") { av = av?.toLowerCase(); bv = bv?.toLowerCase(); }
      if (av === bv) continue;
      const res = av < bv ? -1 : 1;
      return dir === "desc" ? -res : res;
    }
    return 0;
  });
  return clone;
}

function textModel<K extends keyof DBSchema>(model: K) {
  const table = (): Row[] => db[model];
  return {
    create: async (args: any) => {
      const row: Row = { id: args.data.id ?? nextId(model), ...args.data };
      table().push(row);
      return Promise.resolve({ ...row });
    },
    update: async (args: any) => {
      const idx = table().findIndex((r) => r.id === args.where.id);
      if (idx === -1) throw new Error(`${model} not found`);
      table()[idx] = { ...table()[idx], ...args.data };
      const updated = table()[idx] as Row;
      return Promise.resolve(args.include ? applyInclude(updated, args.include) : { ...updated });
    },
    updateMany: async (args: any) => {
      let count = 0;
      for (const r of table()) {
        if (match(r, args.where)) {
          count++;
          Object.assign(r, args.data);
        }
      }
      return Promise.resolve({ count });
    },
    findUnique: async (args: any) => {
      const row = table().find((r) => r.id === args.where.id);
      if (!row) return Promise.resolve(null);
      const projected = args.select ? applySelect({ ...row }, args.select) : applyInclude({ ...row }, args.include);
      return Promise.resolve(projected);
    },
    findFirst: async (args: any) => {
      let rows = table().filter((r) => match(r, args.where));
      if (args.orderBy) rows = sortRows(rows, args.orderBy);
      const row = rows[0];
      if (!row) return Promise.resolve(null);
      const projected = args.select ? applySelect({ ...row }, args.select) : applyInclude({ ...row }, args.include);
      return Promise.resolve(projected);
    },
    findMany: async (args: any) => {
      let rows = table().filter((r) => match(r, args.where));
      if (args.orderBy) rows = sortRows(rows, args.orderBy);
      return Promise.resolve(
        rows.map((r) => (args.select ? applySelect({ ...r }, args.select) : args.include ? applyInclude({ ...r }, args.include) : { ...r }))
      );
    },
    count: async (args: any) => {
      const rows = table().filter((r) => match(r, args.where));
      if (args.select) return Promise.resolve(Object.fromEntries(Object.entries(args.select).map(([k, v]) => [k, v ? rows.length : 0])));
      return Promise.resolve(rows.length);
    },
    groupBy: async (args: any) => {
      const rows = table().filter((r) => match(r, args.where ?? {}));
      const by = Array.isArray(args.by) ? args.by : [args.by];
      const map = new Map<string, Record<string, any>>();
      for (const r of rows) {
        const key = by.map((b: string) => String(r[b] ?? "__null__")).join("::");
        const existing = map.get(key) ?? { _count: { _all: 0 } };
        existing[by[0]] = r[by[0]] ?? null;
        existing._count._all += 1;
        map.set(key, existing);
      }
      return Promise.resolve([...map.values()] as any[]);
    },
  };
}

const mockPrisma = {
  megaRegion: textModel("megaRegion"),
  zone: textModel("zone"),
  townRegion: textModel("townRegion"),
  hotel: textModel("hotel"),
  customer: textModel("customer"),
  hotelDeliveryFee: textModel("hotelDeliveryFee"),
  geographyReclassification: textModel("geographyReclassification"),
  auditLog: textModel("auditLog"),
  $transaction: (fn: (tx: any) => any) => Promise.resolve(fn(mockPrisma)),
} as any;

mock.module("../../../../../infrastructure/database/prisma", () => ({ prisma: mockPrisma }));

const ACTOR = { id: "admin-1", username: "ops", name: "Ops Admin", role: "PLATFORM_OWNER" };

describe("Geography service — hierarchy rules", () => {
  test("a town cannot be created under an inactive county", async () => {
    resetDb();
    const { createTown } = await import("./service");
    await expect(createTown({ name: "Kisumu Town", megaRegionId: "county-2" }, ACTOR)).rejects.toThrow(/inactive/);
  });

  test("a town cannot be created with a duplicate name, case-insensitively", async () => {
    resetDb();
    const { createTown } = await import("./service");
    await expect(createTown({ name: "naivasha town", megaRegionId: "county-1" }, ACTOR)).rejects.toThrow(/already uses that name/i);
  });

  test("creating a town also creates its protected fallback area", async () => {
    resetDb();
    const { createTown } = await import("./service");
    const town = await createTown({ name: "Gilgil Town", megaRegionId: "county-1" }, ACTOR) as any;
    const fallback = db.townRegion.find((a) => a.townId === town.id && a.isFallback);
    expect(fallback?.name).toBe("General Area");
    expect(fallback?.active).toBe(true);
  });

  test("the fallback name is reserved — no explicit area can claim it", async () => {
    resetDb();
    const { createArea } = await import("./service");
    await expect(createArea("town-1", { name: "General Area" }, ACTOR)).rejects.toThrow(/protected fallback/);
  });

  test("cross-parent movement into an inactive county is rejected", async () => {
    resetDb();
    const { updateTown } = await import("./service");
    await expect(updateTown("town-1", { megaRegionId: "county-2" }, ACTOR)).rejects.toThrow(/inactive/);
  });

  test("area names are unique case-insensitively within their town", async () => {
    resetDb();
    const { createArea } = await import("./service");
    await expect(createArea("town-1", { name: "karagita" }, ACTOR)).rejects.toThrow(/already uses that name/i);
  });
});

describe("Geography service — fallback protection", () => {
  test("the fallback area cannot be deactivated", async () => {
    resetDb();
    const { updateArea, deactivateArea } = await import("./service");
    await expect(deactivateArea("area-fb-1", ACTOR)).rejects.toThrow(/fallback.*cannot be deactivated/i);
    await expect(updateArea("area-fb-1", { active: false }, ACTOR)).rejects.toThrow(/fallback.*cannot be deactivated/i);
  });

  test("the fallback area cannot be renamed", async () => {
    resetDb();
    const { updateArea } = await import("./service");
    await expect(updateArea("area-fb-1", { name: "Central" }, ACTOR)).rejects.toThrow(/cannot be renamed/);
  });

  test("deactivating the only remaining active area is blocked (legacy edge case)", async () => {
    resetDb();
    // Simulate a legacy town whose fallback was deactivated before isFallback
    // backfill: the last active area must not be deactivatable.
    db.townRegion.forEach((a) => (a.active = false));
    db.townRegion.push({ id: "only-area", townId: "town-1", name: "Only Area", active: true, isFallback: false, note: null, displayOrder: 5 });
    const { deactivateArea } = await import("./service");
    await expect(deactivateArea("only-area", ACTOR)).rejects.toThrow(/at least one active local area/);
  });

  test("deactivation reports its dependencies and moves saved customers to the fallback", async () => {
    resetDb();
    const { areaDependencies, deactivateArea } = await import("./service");
    const deps = await areaDependencies("area-1");
    expect(deps.customers).toBe(1);
    expect(deps.hotels).toBe(1);
    const result: any = await deactivateArea("area-1", ACTOR);
    expect(result.active).toBe(false);
    expect(result.movedCustomers).toBe(1);
    // no customer is ever left pointing at an inactive area
    expect(db.customer.find((c) => c.id === "cust-1")?.townRegionId).toBe("area-fb-1");
  });

  test("a town with no active area cannot be deactivated", async () => {
    resetDb();
    db.townRegion.forEach((a) => (a.active = false));
    const { updateTown } = await import("./service");
    await expect(updateTown("town-1", { active: false }, ACTOR)).rejects.toThrow(/no active local area/);
  });
});

describe("Geography service — legacy reclassification", () => {
  test("preview exposes dependencies, candidates, and whether the record is safely removable", async () => {
    resetDb();
    db.zone.push({ id: "legacy-zone", megaRegionId: "county-1", name: "General delivery area", type: "OTHER", locationLabel: "x", locationPlaceholder: "y", active: false });
    const { previewReclassification } = await import("./service");
    const preview = await previewReclassification("legacy-zone");
    expect(preview.removable).toBe(true);
    expect(preview.candidateTowns.some((t) => t.id === "town-1")).toBe(true);
  });

  test("applying a queued reclassification is idempotent and moves references atomically", async () => {
    resetDb();
    const { queueReclassification, applyReclassification } = await import("./service");
    db.zone.push({ id: "legacy-zone", megaRegionId: "county-1", name: "Old Market", type: "OTHER", locationLabel: "x", locationPlaceholder: "y", active: true });
    db.townRegion.push({ id: "legacy-area", townId: "legacy-zone", name: "General Area", active: true, isFallback: true, note: null, displayOrder: 0 });
    db.customer.push({ id: "cust-legacy", firstName: "L", phone: "2547000", townRegionId: "legacy-area" });
    db.hotel.push({ id: "hotel-legacy", name: "Old Spot", slug: "old-spot", zoneId: "legacy-zone", deletedAt: null });

    const queued = await queueReclassification({ sourceZoneId: "legacy-zone", proposedTownId: "town-1", areaName: "Old Market" }, ACTOR);

    const first = await applyReclassification(queued.id as string, ACTOR) as any;
    expect(first.alreadyApplied).toBe(false);
    // customer moved to the new area under the target town
    const newArea = db.townRegion.find((a) => a.townId === "town-1" && a.name === "Old Market");
    expect(newArea?.active).toBe(true);
    expect(db.customer.find((c) => c.id === "cust-legacy")?.townRegionId).toBe(newArea?.id);
    // legacy zone retired, not deleted
    expect(db.zone.find((z) => z.id === "legacy-zone")?.active).toBe(false);

    // second call is a no-op
    const second = await applyReclassification(queued.id as string, ACTOR) as any;
    expect(second.alreadyApplied).toBe(true);
  });

  test("every sensitive action writes an attributable audit row in the same transaction", async () => {
    resetDb();
    const { createTown, createArea, updateArea, deactivateArea } = await import("./service");
    await createTown({ name: "Njoro Town", megaRegionId: "county-1" }, ACTOR);
    await createArea("town-1", { name: "Karai" }, ACTOR);
    await updateArea("area-1", { name: "Karabati" }, ACTOR);
    // area-1 has a saved customer: deactivation must succeed and migrate the
    // customer to the fallback, never silently strand them on an inactive area
    await deactivateArea("area-1", ACTOR);
    await deactivateArea(db.townRegion.find((a) => a.name === "Karai")!.id, ACTOR);
    const actions = db.auditLog.map((log) => log.action);
    expect(actions).toContain("create_geography");
    expect(actions).toContain("update_geography");
    expect(actions).toContain("deactivate_geography");
    expect(db.auditLog.every((log) => log.actorId === ACTOR.id)).toBe(true);
  });
});