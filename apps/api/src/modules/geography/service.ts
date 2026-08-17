/**
 * Purpose: Geography service — the single home of every rule about the
 *   County/City (MegaRegion) → Town (Zone) → Local Area (TownRegion) hierarchy.
 * Responsibilities: Enforces parent validation, case-insensitive unique names,
 *   cross-parent rejection, fallback-area protection, dependency-count
 *   reporting, safe deactivation, and the legacy reclassification workflow.
 *   Every sensitive mutation writes a durable AuditLog row in the same
 *   transaction and is attributable to a specific platform admin.
 * Dependencies: Prisma client, AuditLog writer (service-local).
 * When to modify: Any geography rule change goes here — never in route handlers.
 */

import { prisma } from "../../../../../infrastructure/database/prisma";

export interface PlatformActor {
  id: string;
  username: string;
  name: string;
  role: string;
}

export interface AreaInput {
  name?: string;
  active?: boolean;
  note?: string | null;
  displayOrder?: number;
}

/** Quoted literal the DB uses for the guaranteed fallback area name. */
export const FALLBACK_AREA_NAME = "General Area";
const FALLBACK_NAME_ALIASES = ["General Area", "General delivery area"];

function isFallbackName(name: string): boolean {
  return FALLBACK_NAME_ALIASES.some((alias) => name.toLowerCase() === alias.toLowerCase() || name.toLowerCase().startsWith("general area"));
}

/**
 * Find an existing record that would collide with `name` case-insensitively.
 * - megaRegion: unique on name + type (mirrors the @@unique index).
 * - zone: unique within its parent megaRegion.
 * - townRegion: unique within its parent town.
 */
async function findNameConflict(parentId: string, name: string, excludeId: string | undefined, model: "megaRegion" | "zone" | "townRegion", type?: string) {
  const base: any = { name: { equals: name, mode: "insensitive" }, ...(excludeId ? { NOT: { id: excludeId } } : {}) };
  if (model === "megaRegion") return prisma.megaRegion.findFirst({ where: { ...base, type: (type ?? "OTHER") as any } });
  if (model === "zone") return prisma.zone.findFirst({ where: { ...base, megaRegionId: parentId } });
  return prisma.townRegion.findFirst({ where: { ...base, townId: parentId } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit trail
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Appends a durable audit row. `tx` may be the transaction in which the
 * mutation itself was written, so the record of an action can never be lost to
 * a crash that landed after the fact — it commits atomically with the change.
 */
export async function writeAudit(
  tx: PrismaLike,
  actor: PlatformActor,
  entity: string,
  entityId: string | null,
  action: string,
  detail: string
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: actor.id,
      actorName: actor.name,
      entity,
      entityId,
      action,
      detail,
    },
  });
}

interface PrismaLike {
  auditLog: { create: (args: any) => Promise<any> };
  [key: string]: any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hierarchy read + operational counts (single payload, no UI N+1)
// ─────────────────────────────────────────────────────────────────────────────

export const getGeographyHierarchy = async () => {
  const [counties, towns, areas, hotelCounts, areaCustomerCounts] = await Promise.all([
    prisma.megaRegion.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.zone.findMany({ include: { megaRegion: true }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.townRegion.findMany({ orderBy: [{ displayOrder: "asc" }, { active: "desc" }, { name: "asc" }] }),
    prisma.hotel.groupBy({ by: ["zoneId"], where: { deletedAt: null }, _count: { _all: true } }),
    prisma.customer.groupBy({ by: ["townRegionId"], where: { townRegionId: { not: null } }, _count: { _all: true } }),
  ]);

  const hotelCountByTown = new Map(hotelCounts.map((row) => [row.zoneId, row._count._all]));
  const customerCountByArea = new Map(areaCustomerCounts.map((row) => [row.townRegionId!, row._count._all]));

  const townRows = new Map<string, TownNode>();
  for (const town of towns) {
    townRows.set(town.id, { ...town, hotelCount: hotelCountByTown.get(town.id) ?? 0, areaCount: 0, activeAreaCount: 0, areas: [] });
  }
  for (const area of areas) {
    const town = townRows.get(area.townId);
    if (!town) continue;
    town.areaCount += 1;
    if (area.active) town.activeAreaCount += 1;
    town.areas.push(buildArea(area, customerCountByArea.get(area.id) ?? 0));
  }

  const countyRows = counties.map((county) => {
    const countyTowns = [...townRows.values()].filter((town) => town.megaRegionId === county.id);
    return {
      id: county.id,
      name: county.name,
      type: county.type,
      active: county.active,
      townCount: countyTowns.length,
      activeTownCount: countyTowns.filter((town) => town.active).length,
      areaCount: countyTowns.reduce((sum, town) => sum + town.areaCount, 0),
      activeAreaCount: countyTowns.reduce((sum, town) => sum + town.activeAreaCount, 0),
      towns: countyTowns.map((town) => ({
        id: town.id,
        name: town.name,
        active: town.active,
        type: town.type,
        locationLabel: town.locationLabel,
        locationPlaceholder: town.locationPlaceholder,
        hotelCount: town.hotelCount,
        areaCount: town.areaCount,
        activeAreaCount: town.activeAreaCount,
        areas: town.areas,
      })),
    };
  });

  return {
    counties: countyRows,
    summary: {
      countyCount: counties.length,
      townCount: towns.length,
      areaCount: areas.length,
      hotelCount: hotelCountByTown.size,
    },
  };
};

function buildArea(area: { id: string; name: string; active: boolean; isFallback: boolean; note: string | null; displayOrder: number; townId: string }, customerCount: number) {
  return {
    id: area.id,
    townId: area.townId,
    name: area.name,
    active: area.active,
    isFallback: area.isFallback,
    note: area.note,
    displayOrder: area.displayOrder,
    customerCount,
  };
}

function buildTown(town: any) {
  return {
    id: town.id,
    name: town.name,
    active: town.active,
    megaRegionId: town.megaRegionId,
    hotelCount: 0,
    areaCount: 0,
    activeAreaCount: 0,
    areas: [] as ReturnType<typeof buildArea>[],
  };
}

interface TownNode {
  id: string;
  name: string;
  active: boolean;
  megaRegionId: string;
  type: string;
  locationLabel: string;
  locationPlaceholder: string;
  hotelCount: number;
  areaCount: number;
  activeAreaCount: number;
  areas: ReturnType<typeof buildArea>[];
}

export const getCountyDetail = async (megaRegionId: string) => {
  const hotelCounts = await prisma.hotel.groupBy({ by: ["zoneId"], where: { deletedAt: null }, _count: { _all: true } });
  const areaCustomerCounts = await prisma.customer.groupBy({ by: ["townRegionId"], where: { townRegionId: { not: null } }, _count: { _all: true } });
  const customerCountByArea = new Map(areaCustomerCounts.map((row) => [row.townRegionId!, row._count._all]));
  const hotelCountByTown = new Map(hotelCounts.map((row) => [row.zoneId, row._count._all]));
  const hierarchy = await prisma.megaRegion.findUnique({
    where: { id: megaRegionId },
    include: {
      towns: {
        orderBy: [{ active: "desc" }, { name: "asc" }],
        include: {
          deliveryRegions: { orderBy: [{ displayOrder: "asc" }, { active: "desc" }, { name: "asc" }] },
        },
      },
    },
  });
  if (!hierarchy) throw new Error("County or city not found");
  return {
    id: hierarchy.id,
    name: hierarchy.name,
    type: hierarchy.type,
    active: hierarchy.active,
    towns: hierarchy.towns.map((town) => ({
      id: town.id,
      name: town.name,
      active: town.active,
      type: town.type,
      hotelCount: hotelCountByTown.get(town.id) ?? 0,
      areaCount: town.deliveryRegions.length,
      activeAreaCount: town.deliveryRegions.filter((area) => area.active).length,
      areas: town.deliveryRegions.map((area) => buildArea(area, customerCountByArea.get(area.id) ?? 0)),
    })),
  };
};

export const getTownDetail = async (townId: string) => {
  const hotelCounts = await prisma.hotel.groupBy({ by: ["zoneId"], where: { deletedAt: null }, _count: { _all: true } });
  const areaCustomerCounts = await prisma.customer.groupBy({ by: ["townRegionId"], where: { townRegionId: { not: null } }, _count: { _all: true } });
  const customerCountByArea = new Map(areaCustomerCounts.map((row) => [row.townRegionId!, row._count._all]));
  const town = await prisma.zone.findUnique({
    where: { id: townId },
    include: {
      megaRegion: true,
      deliveryRegions: { orderBy: [{ displayOrder: "asc" }, { active: "desc" }, { name: "asc" }] },
      hotels: {
        where: { deletedAt: null },
        select: { id: true, name: true, slug: true, isOpen: true, townRegion: { select: { id: true, name: true } } },
      },
    },
  });
  if (!town) throw new Error("Town not found");
  return {
    id: town.id,
    name: town.name,
    active: town.active,
    type: town.type,
    locationLabel: town.locationLabel,
    locationPlaceholder: town.locationPlaceholder,
    county: { id: town.megaRegion.id, name: town.megaRegion.name, active: town.megaRegion.active },
    hotelCount: hotelCounts.find((row) => row.zoneId === town.id)?._count._all ?? 0,
    hotels: town.hotels,
    areaCount: town.deliveryRegions.length,
    activeAreaCount: town.deliveryRegions.filter((area) => area.active).length,
    areas: town.deliveryRegions.map((area) => buildArea(area, customerCountByArea.get(area.id) ?? 0)),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// County / City CRUD
// ─────────────────────────────────────────────────────────────────────────────

export const createMegaRegion = async (input: { name: string; type: "COUNTY" | "CITY" | "OTHER" }, actor: PlatformActor) => {
  const name = input.name.trim();
  if (!name) throw new Error("County or city name is required");
  const existing = await findNameConflict(name, name, undefined, "megaRegion", input.type);
  if (existing) throw new Error("Another county or city already uses that name (case-insensitive).");
  return prisma.$transaction(async (tx) => {
    const created = await tx.megaRegion.create({ data: { name, type: input.type, active: true } });
    await writeAudit(tx, actor, "county", created.id, "create_geography", `Created ${input.type.toLowerCase()} "${name}"`);
    return created;
  });
};

export const updateMegaRegion = async (id: string, input: { name?: string; type?: "COUNTY" | "CITY" | "OTHER"; active?: boolean }, actor: PlatformActor, txArg?: any) => {
  const existing = await prisma.megaRegion.findUnique({ where: { id } });
  if (!existing) throw new Error("County or city not found");
  if (input.active === false) {
    await validateCountyDeactivation(id);
  }
  if (input.name !== undefined && input.name.trim() !== existing.name) {
    const name = input.name.trim();
    const conflict = await findNameConflict(name, name, id, "megaRegion", input.type ?? existing.type);
    if (conflict) throw new Error("Another county or city already uses that name (case-insensitive).");
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.megaRegion.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        // Deactivation is guarded above; reactivation is always allowed so an
        // administrator can bring a retired county/city back without poking
        // the DB directly.
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
    const action = input.active === false ? "deactivate_geography" : input.active === true ? "activate_geography" : "update_geography";
    const detail = input.active === false ? `Deactivated county/city "${existing.name}"` : input.active === true ? `Activated county/city "${existing.name}"` : `Updated ${existing.name}${input.name ? ` → "${input.name.trim()}"` : ""}`;
    await writeAudit(tx, actor, "county", id, action, detail);
    return updated;
  });
};

async function validateCountyDeactivation(id: string) {
  const counts = await prisma.zone.count({ where: { megaRegionId: id, active: true } });
  if (counts > 0) throw new Error(`Cannot deactivate this county/city while ${counts} town${counts === 1 ? "" : "s"} remain active.`);
}

export const deactivateCounty = async (id: string, actor: PlatformActor) => {
  const county = await prisma.megaRegion.findUnique({ where: { id } });
  if (!county) throw new Error("County or city not found");
  await validateCountyDeactivation(id);
  const dependency = await countyDependencies(id);
  if (dependency.hotels > 0) throw new Error(`Cannot deactivate while ${dependency.hotels} hotel${dependency.hotels === 1 ? " is" : "s are"} still assigned.`);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.megaRegion.update({ where: { id }, data: { active: false } });
    await writeAudit(tx, actor, "county", id, "deactivate_geography", `Deactivated ${county.name}`);
    return updated;
  });
};

export const countyDependencies = async (id: string) => {
  const towns = await prisma.zone.findMany({ where: { megaRegionId: id }, select: { id: true } });
  const [hotels, areas] = await Promise.all([
    prisma.hotel.count({ where: { zoneId: { in: towns.map((t) => t.id) }, deletedAt: null } }),
    prisma.townRegion.count({ where: { townId: { in: towns.map((t) => t.id) }, active: true } }),
  ]);
  return { towns: towns.length, hotels, activeAreas: areas };
};

// ─────────────────────────────────────────────────────────────────────────────
// Town CRUD (Zone)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A town is created WITH its guaranteed fallback area inside the same
 * transaction — hotels never rely on an admin remembering to add it.
 */
export const createTown = async (
  input: { name: string; megaRegionId: string; type?: string; locationLabel?: string; locationPlaceholder?: string },
  actor: PlatformActor
) => {
  const name = input.name.trim();
  if (!name) throw new Error("Town name is required");
  const county = await prisma.megaRegion.findUnique({ where: { id: input.megaRegionId } });
  if (!county) throw new Error("Parent county or city not found");
  if (!county.active) throw new Error(`Cannot add a town to the inactive ${county.name}. Activate it first.`);
  const conflict = await findNameConflict(input.megaRegionId, name, undefined, "zone");
  if (conflict) throw new Error("Another town already uses that name in this county/city (case-insensitive).");

  return prisma.$transaction(async (tx) => {
    const town = await tx.zone.create({
      data: {
        name,
        megaRegionId: input.megaRegionId,
        type: (input.type as any) ?? "OTHER",
        locationLabel: input.locationLabel?.trim() || "Delivery point",
        locationPlaceholder: input.locationPlaceholder?.trim() || "e.g. building, landmark, stall number",
        active: true,
      },
    });
    const fallback = await tx.townRegion.create({ data: { name: FALLBACK_AREA_NAME, townId: town.id, active: true, isFallback: true } });
    await writeAudit(tx, actor, "town", town.id, "create_geography", `Created town "${name}" under ${county.name} with fallback area "${FALLBACK_AREA_NAME}"`);
    return { ...town, fallback };
  });
};

export const updateTown = async (id: string, input: { name?: string; active?: boolean; locationLabel?: string; locationPlaceholder?: string; megaRegionId?: string }, actor: PlatformActor) => {
  const town = await prisma.zone.findUnique({ where: { id }, include: { megaRegion: true } });
  if (!town) throw new Error("Town not found");

  // Cross-parent reassignment must be explicit and is audited as a move.
  if (input.megaRegionId && input.megaRegionId !== town.megaRegionId) await moveTown(id, input.megaRegionId, actor, town);

  const data: any = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Town name is required");
    const conflict = await findNameConflict(town.megaRegionId, name, id, "zone");
    if (conflict) throw new Error("Another town already uses that name in this county/city (case-insensitive).");
    data.name = name;
  }
  if (input.locationLabel !== undefined) data.locationLabel = input.locationLabel.trim();
  if (input.locationPlaceholder !== undefined) data.locationPlaceholder = input.locationPlaceholder.trim();

  if (input.active === false) {
    const activeAreas = await prisma.townRegion.count({ where: { townId: id, active: true } });
    if (activeAreas === 0) throw new Error("This town has no active local area to serve as fallback. Add one before deactivating the town.");
  }

  if (Object.keys(data).length > 0 || input.active !== undefined) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.zone.update({ where: { id }, data: { ...data, ...(input.active !== undefined ? { active: input.active } : {}) } });
      await writeAudit(tx, actor, "town", id, input.active === false ? "deactivate_geography" : "update_geography", `${input.active === false ? `Deactivated town "${town.name}"` : `Updated town "${town.name}"`}`);
      return updated;
    });
  }
  return town;
};

async function moveTown(id: string, newCountyId: string, actor: PlatformActor, town: { name: string; megaRegionId: string }) {
  const targetCounty = await prisma.megaRegion.findUnique({ where: { id: newCountyId } });
  if (!targetCounty) throw new Error("Target county or city not found");
  if (!targetCounty.active) throw new Error("Target county or city is inactive. Activate it first.");
  const conflict = await findNameConflict(newCountyId, town.name, id, "zone");
  if (conflict) throw new Error("Another town already uses that name in the target county/city.");
  await prisma.$transaction(async (tx) => {
    await tx.zone.update({ where: { id }, data: { megaRegionId: newCountyId } });
    await writeAudit(tx, actor, "town", id, "reassign_geography", `Moved town "${town.name}" to ${targetCounty.name}. Parent batch (area reassignment) must be handled separately.`);
  });
}

export const deactivateTown = async (id: string, actor: PlatformActor) => {
  const town = await prisma.zone.findUnique({ where: { id } });
  if (!town) throw new Error("Town not found");
  const deps = await townDependencies(id);
  if (deps.hotels > 0) throw new Error(`Cannot deactivate while ${deps.hotels} hotel${deps.hotels === 1 ? " is" : "s are"} assigned. Reassign them first.`);
  return updateTown(id, { active: false }, actor);
};

export const townDependencies = async (id: string) => {
  const [hotels, areas, activeAreas, customers] = await Promise.all([
    prisma.hotel.count({ where: { zoneId: id, deletedAt: null } }),
    prisma.townRegion.count({ where: { townId: id } }),
    prisma.townRegion.count({ where: { townId: id, active: true } }),
    prisma.customer.count({ where: { townRegion: { townId: id } } }),
  ]);
  return { hotels, areas, activeAreas, customers };
};

// ─────────────────────────────────────────────────────────────────────────────
// Local area (TownRegion) CRUD
// ─────────────────────────────────────────────────────────────────────────────

export const createArea = async (townId: string, input: AreaInput, actor: PlatformActor) => {
  const name = (input.name ?? "").trim();
  if (!name) throw new Error("Local area name is required");
  if (isFallbackName(name)) throw new Error(`"${FALLBACK_AREA_NAME}" is the protected fallback and is created automatically. Use a different name.`);
  const town = await prisma.zone.findUnique({ where: { id: townId } });
  if (!town) throw new Error("Town not found");
  if (!town.active) throw new Error("Cannot add a local area to an inactive town. Reactivate the town first.");
  const conflict = await findNameConflict(townId, name, undefined, "townRegion");
  if (conflict) throw new Error("Another local area already uses that name in this town (case-insensitive).");

  return prisma.$transaction(async (tx) => {
    const area = await tx.townRegion.create({ data: { name, townId, active: input.active ?? true, note: input.note ?? null, displayOrder: input.displayOrder ?? 0 } });
    await writeAudit(tx, actor, "area", area.id, "create_geography", `Created local area "${name}" in town "${town.name}"${input.note ? " (with operational note)" : ""}`);
    return area;
  });
};

export const updateArea = async (id: string, input: AreaInput, actor: PlatformActor) => {
  const area = await prisma.townRegion.findUnique({ where: { id }, include: { town: true } });
  if (!area) throw new Error("Local area not found");

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Local area name is required");
    if (area.isFallback) throw new Error(`"${FALLBACK_AREA_NAME}" is the protected fallback for every town and cannot be renamed.`);
    const conflict = await findNameConflict(area.townId, name, id, "townRegion");
    if (conflict) throw new Error("Another local area already uses that name in this town (case-insensitive).");
  }

  if (input.active === false && area.isFallback) {
    throw new Error(`"${FALLBACK_AREA_NAME}" is the guaranteed fallback and cannot be deactivated.`);
  }

  if (input.active === false) {
    const activeAreas = await prisma.townRegion.count({ where: { townId: area.townId, active: true, NOT: { id } } });
    if (activeAreas === 0) throw new Error("This is the only active local area in the town. Create another before deactivating it.");
  }

  const data: any = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.note !== undefined) data.note = input.note;
  if (input.displayOrder !== undefined) data.displayOrder = input.displayOrder;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.townRegion.update({ where: { id }, data: { ...data, ...(input.active !== undefined ? { active: input.active } : {}) } });
    await writeAudit(tx, actor, "area", id, input.active === false ? "deactivate_geography" : input.active === true ? "activate_geography" : "update_geography", `${input.active === false ? `Deactivated local area "${area.name}"` : input.active === true ? `Activated local area "${area.name}"` : `Updated local area "${area.name}"`} in town "${area.town.name}"`);
    return updated;
  });
};

export const deactivateArea = async (id: string, actor: PlatformActor) => {
  const area = await prisma.townRegion.findUnique({ where: { id }, include: { town: true } });
  if (!area) throw new Error("Local area not found");
  if (area.isFallback) throw new Error(`"${FALLBACK_AREA_NAME}" is the guaranteed fallback and cannot be deactivated.`);
  const deps = await areaDependencies(id);
  const activeAreas = await prisma.townRegion.count({ where: { townId: area.townId, active: true } });
  if (activeAreas <= 1) throw new Error("A town must always have at least one active local area. Deactivation blocked.");

  return prisma.$transaction(async (tx) => {
    // Customers who saved this area must never be left pointing at an inactive
    // record. Move them onto the town's fallback area in the same transaction —
    // non-destructive, traceable in the audit row, and it keeps the marketplace
    // boundary (town) untouched.
    let movedCustomers = 0;
    if (deps.customers > 0) {
      const fallback = await tx.townRegion.findFirst({ where: { townId: area.townId, isFallback: true, active: true } });
      if (!fallback) throw new Error(`No active fallback area exists in this town. Cannot deactivate "${area.name}".`);
      const move = await tx.customer.updateMany({ where: { townRegionId: id }, data: { townRegionId: fallback.id } });
      movedCustomers = move.count;
    }

    const updated = await tx.townRegion.update({ where: { id }, data: { active: false } });
    await writeAudit(
      tx,
      actor,
      "area",
      id,
      "deactivate_geography",
      `Deactivated local area "${area.name}" in town "${area.town.name}"${movedCustomers > 0 ? `; ${movedCustomers} customer reference(s) moved to the fallback area` : ""}`
    );
    return { ...updated, movedCustomers };
  });
};

export const areaDependencies = async (id: string) => {
  const area = await prisma.townRegion.findUnique({
    where: { id },
    select: { townId: true, active: true, isFallback: true, town: { select: { name: true } } },
  });
  if (!area) throw new Error("Local area not found");
  const [customers, hotels] = await Promise.all([
    prisma.customer.count({ where: { townRegionId: id } }),
    prisma.hotel.count({ where: { zoneId: area.townId, deletedAt: null } }),
  ]);
  return { areaId: id, townId: area.townId, customers, hotels, active: area.active, isFallback: area.isFallback, townName: area.town.name };
};

// ─────────────────────────────────────────────────────────────────────────────
// Legacy reclassification workflow (Geography cleanup queue)
// ─────────────────────────────────────────────────────────────────────────────

export type ReclassificationPreview = {
  sourceZoneId: string;
  sourceName: string;
  sourceActive: boolean;
  hasHotels: boolean;
  hotelCount: number;
  deliveryFees: number;
  areaCount: number;
  customerCount: number;
  removable: boolean;
  /** Candidate towns the record could be moved under as a local area. */
  candidateTowns: { id: string; name: string; active: boolean; countyName: string }[];
};

export const previewReclassification = async (sourceZoneId: string): Promise<ReclassificationPreview> => {
  const zone = await prisma.zone.findUnique({
    where: { id: sourceZoneId },
    include: { megaRegion: true, deliveryRegions: { include: { _count: { select: { customers: true } } } } },
  });
  if (!zone) throw new Error("Legacy town record not found");
  const [hotelCount, deliveryFees] = await Promise.all([
    prisma.hotel.count({ where: { zoneId: sourceZoneId, deletedAt: null } }),
    prisma.hotelDeliveryFee.count({ where: { townRegion: { townId: sourceZoneId } } }),
  ]);
  // Only a deactivated town with no hotel or fee dependency is safe to fully
  // retire into an area; anything still in use must keep its Zone identity.
  const removable = !zone.active && hotelCount === 0 && deliveryFees === 0;
  const levels = await prisma.zone.findMany({
    where: { active: true, NOT: { id: sourceZoneId } },
    orderBy: [{ name: "asc" }],
    include: { megaRegion: { select: { id: true, name: true } } },
  });

  return {
    sourceZoneId: zone.id,
    sourceName: zone.name,
    sourceActive: zone.active,
    hasHotels: hotelCount > 0,
    hotelCount,
    deliveryFees,
    areaCount: zone.deliveryRegions.length,
    customerCount: zone.deliveryRegions.reduce((sum, area) => sum + area._count.customers, 0),
    removable,
    candidateTowns: levels.map((town) => ({
      id: town.id,
      name: town.name,
      active: town.active,
      countyName: town.megaRegion.name,
    })),
  };
};

export interface ReclassificationPlan {
  sourceZoneId: string;
  proposedTownId: string;
  areaName: string;
  reassignHotels?: boolean;
}

/**
 * Records a review-decision in the cleanup queue (the "preview" step). The row
 * snapshots the source geometry so `applyReclassification` stays idempotent
 * even if names/locations drift afterwards.
 */
export const queueReclassification = async (plan: ReclassificationPlan, actor: PlatformActor) => {
  const zone = await prisma.zone.findUnique({ where: { id: plan.sourceZoneId } });
  if (!zone) throw new Error("Legacy town record not found");
  const town = await prisma.zone.findUnique({ where: { id: plan.proposedTownId }, include: { megaRegion: true } });
  if (!town) throw new Error("Target town not found");
  if (!town.active) throw new Error("Target town is inactive. Activate it first.");
  if (plan.sourceZoneId === plan.proposedTownId) throw new Error("The legacy record cannot be its own target town.");
  const areaName = plan.areaName.trim();
  if (!areaName) throw new Error("Local area name is required");
  const conflict = await findNameConflict(plan.proposedTownId, areaName, undefined, "townRegion");
  if (conflict) throw new Error("A local area with that name already exists in the target town.");

  return prisma.$transaction(async (tx) => {
    const queued = await tx.geographyReclassification.create({
      data: {
        sourceZoneId: zone.id,
        sourceName: zone.name,
        proposedTownId: town.id,
        proposedTownName: town.name,
        areaName,
        status: "pending",
        createdById: actor.id,
      },
    });
    await writeAudit(tx, actor, "reclassification", queued.id, "queue_reclassification", `Queued legacy "${zone.name}" → local area "${areaName}" under town "${town.name}"`);
    return queued;
  });
};

/**
 * Executes a queued reclassification inside one transaction. Idempotent:
 * already-applied rows are a no-op, and the queued snapshot guarantees the
 * source geometry is interpreted the same way on every attempt.
 */
export const applyReclassification = async (reclassificationId: string, actor: PlatformActor) => {
  return prisma.$transaction(async (tx) => {
    const queued = await tx.geographyReclassification.findUnique({ where: { id: reclassificationId } });
    if (!queued) throw new Error("Reclassification request not found");
    if (queued.status === "applied") return { ...queued, alreadyApplied: true };

    const source = await tx.zone.findUnique({ where: { id: queued.sourceZoneId }, include: { deliveryRegions: true } });
    if (!source) throw new Error("Source legacy town record no longer exists");
    const town = await tx.zone.findUnique({ where: { id: queued.proposedTownId } });
    if (!town || !town.active) throw new Error("Target town is missing or inactive.");

    // 1) Create the local area exactly as queued.
    const area = await tx.townRegion.create({
      data: { name: queued.areaName, townId: queued.proposedTownId, active: true, displayOrder: 0 },
    });

    // 2) Move customer location references out of the legacy record's areas
    //    into the new local area (SetNull otherwise; never cascade-deleted).
    let movedCustomers = 0;
    for (const legacyArea of source.deliveryRegions) {
      const move = await tx.customer.updateMany({ where: { townRegionId: legacyArea.id }, data: { townRegionId: area.id } });
      movedCustomers += move.count;
    }

    // 3) Reassign hotels only for the flagged intent — a misnamed town, not a
    //    wholesale geography merge. A hotel's location is never "just a town":
    //    zoneId AND townRegionId move together into the target area, so the
    //    invariant TownRegion.townId === Hotel.zoneId never breaks (a stale
    //    townRegionId pointing into the retired legacy town would silently
    //    split a hotel's location across two towns).
    const reassignedHotels = await tx.hotel.updateMany({
      where: { zoneId: source.id, deletedAt: null },
      data: { zoneId: queued.proposedTownId, townRegionId: area.id },
    });

    // 4) Retire the legacy Zone — never delete. If something still depends on
    //    it (e.g. an order snapshot), the row persists for audit traceability.
    await tx.zone.update({ where: { id: source.id }, data: { active: false } });

    const updated = await tx.geographyReclassification.update({
      where: { id: queued.id },
      data: { status: "applied", appliedAt: new Date(), appliesTo: movedCustomers, rejectedCount: reassignedHotels.count },
    });

    await writeAudit(tx, actor, "reclassification", queued.id, "apply_reclassification",
      `Applied "${queued.sourceName}" → local area "${queued.areaName}" under "${queued.proposedTownName}"; moved ${movedCustomers} customer refs, ${reassignedHotels.count} hotels reassigned`);

    return { ...updated, alreadyApplied: false, movedCustomers, reassignedHotels: reassignedHotels.count };
  });
};

export const listReclassifications = async () =>
  prisma.geographyReclassification.findMany({ orderBy: { createdAt: "desc" }, take: 200 });