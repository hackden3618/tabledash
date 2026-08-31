import React, { useEffect, useState, useCallback, useRef } from "react";
import { MotionConfig, motion } from "framer-motion";
import { Plus, RefreshCw, Search, ShieldAlert, CheckCircle2, AlertTriangle, Info, ChevronRight, ChevronLeft, X, Sparkles } from "lucide-react";
import { apiGet, apiPost, apiPatch } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";

export interface GeoActor {
  id: string;
  username: string;
  name: string;
  role: string;
}

const G = {
  bg: "#FFF8F0",
  surface: "#FFFFFF",
  border: "#EADFD3",
  primary: "#114B36",
  primaryMuted: "#EBF5F0",
  primaryLight: "#C2E2D3",
  text: "#1F2937",
  textMuted: "#6B7280",
  textDim: "#9CA3AF",
  danger: "#DC2626",
  dangerMuted: "#FEF2F2",
  success: "#15803D",
  successMuted: "#DCFCE7",
  warning: "#A16207",
  warningMuted: "#FFF7D6",
  radius: "14px",
};

const px = (n: number) => `${n * 4}px`;

interface GeoArea {
  id: string;
  townId: string;
  name: string;
  active: boolean;
  isFallback: boolean;
  note: string | null;
  displayOrder: number;
  customerCount: number;
}

interface GeoTown {
  id: string;
  name: string;
  active: boolean;
  type: string;
  locationLabel: string;
  locationPlaceholder: string;
  hotelCount: number;
  areaCount: number;
  activeAreaCount: number;
  areas: GeoArea[];
}

interface GeoCounty {
  id: string;
  name: string;
  type: string;
  active: boolean;
  townCount: number;
  activeTownCount: number;
  areaCount: number;
  activeAreaCount: number;
  towns: GeoTown[];
}

interface GeoHierarchy {
  counties: GeoCounty[];
  summary: { countyCount: number; townCount: number; areaCount: number; hotelCount: number };
}

interface TownDeps { hotels: number; areas: number; activeAreas: number; customers: number; }
interface AreaDeps { areaId: string; townId: string; customers: number; hotels: number; active: boolean; isFallback: boolean; townName: string; }

interface ReclPreview {
  sourceZoneId: string;
  sourceName: string;
  sourceActive: boolean;
  hasHotels: boolean;
  hotelCount: number;
  deliveryFees: number;
  areaCount: number;
  customerCount: number;
  removable: boolean;
  candidateTowns: { id: string; name: string; active: boolean; countyName: string }[];
}

interface ReclRow {
  id: string;
  sourceZoneId: string;
  sourceName: string;
  proposedTownId: string;
  proposedTownName: string;
  areaName: string;
  status: string;
  createdById: string;
  createdAt: string;
  appliedAt: string | null;
  appliesTo: number | null;
  rejectedCount: number | null;
}

type Notice = { kind: "success" | "danger" | "info"; text: string } | null;

type ImpactKind = "county" | "town" | "area";
interface ImpactView {
  kind: ImpactKind;
  id: string;
  name: string;
  loading: boolean;
  deps: { customers: number; hotels: number; areas?: number; activeAreas?: number; towns?: number; activeTowns?: number; blocked: boolean; blockReason?: string; note?: string } | null;
}

const ROLE_LABELS: Record<string, string> = {
  PLATFORM_OWNER: "Owner",
  PLATFORM_OPERATIONS: "Operations",
  PLATFORM_SUPPORT: "Support",
  PLATFORM_AUDITOR: "Auditor",
};

export const GeographyWorkspace: React.FC<{ token: string; user: GeoActor; focusTownId?: string | null; onOpenHotel?: (hotelId: string) => void }> = ({ token, user, focusTownId, onOpenHotel }) => {
  const [hierarchy, setHierarchy] = useState<GeoHierarchy | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [selectedCountyId, setSelectedCountyId] = useState<string | null>(null);
  const [selectedTownId, setSelectedTownId] = useState<string | null>(null);
  const [showCleanup, setShowCleanup] = useState(false);

  const [openModal, setOpenModal] = useState<null | "addCounty" | "editCounty" | "addTown" | "editTown" | "addArea" | "editArea">(null);
  const [modalBusy, setModalBusy] = useState(false);

  const [countyForm, setCountyForm] = useState({ name: "", type: "COUNTY" });
  const [editCountyId, setEditCountyId] = useState<string | null>(null);
  const [townForm, setTownForm] = useState({ name: "", type: "OTHER", locationLabel: "Delivery point", locationPlaceholder: "e.g. building, landmark, stall number" });
  const [editTownId, setEditTownId] = useState<string | null>(null);
  const [areaForm, setAreaForm] = useState({ name: "", active: true, note: "", displayOrder: 0 });
  const [editAreaId, setEditAreaId] = useState<string | null>(null);

  const [impact, setImpact] = useState<ImpactView | null>(null);
  const [impactConfirming, setImpactConfirming] = useState(false);
  const [townHotels, setTownHotels] = useState<{ id: string; name: string; slug: string; isOpen: boolean }[]>([]);

  // ── Hotel Relocation state ──
  const [relocateHotel, setRelocateHotel] = useState<{ id: string; name: string; currentTownId: string } | null>(null);
  const [relocateTargetTownId, setRelocateTargetTownId] = useState("");
  const [relocateTargetAreaId, setRelocateTargetAreaId] = useState("");
  const [relocating, setRelocating] = useState(false);

  // ── Cleanup (legacy reclassification) state ──
  const [queue, setQueue] = useState<ReclRow[]>([]);
  const [previewId, setPreviewId] = useState("");
  const [preview, setPreview] = useState<ReclPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [targetTownId, setTargetTownId] = useState("");
  const [areaName, setAreaName] = useState("");

  const showNotice = useCallback((kind: "success" | "danger" | "info", text: string) => {
    setNotice({ kind, text });
    window.setTimeout(() => setNotice(null), 6000);
  }, []);

  const submitRelocateHotel = async () => {
    if (!relocateHotel || !relocateTargetTownId || !relocateTargetAreaId || relocating) return;
    setRelocating(true);
    const res = await apiPatch(`/platform/hotels/${relocateHotel.id}`, { zoneId: relocateTargetTownId, townRegionId: relocateTargetAreaId }, token);
    setRelocating(false);
    if (res.success) {
      const targetTown = counties.flatMap((c) => c.towns).find((t) => t.id === relocateTargetTownId);
      const targetAreaName = targetTown?.areas.find((area) => area.id === relocateTargetAreaId)?.name ?? "selected delivery area";
      showNotice("success", `Relocated "${relocateHotel.name}" to ${targetAreaName}, ${targetTown?.name ?? "new town"}.`);
      setRelocateHotel(null);
      setRelocateTargetTownId("");
      setRelocateTargetAreaId("");
      await load();
    } else {
      showNotice("danger", res.error || "Could not relocate hotel");
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiGet<GeoHierarchy>("/platform/geography", token);
    if (!res.success) {
      showNotice("danger", res.error || "Could not load geography");
    } else if (res.data) {
      setHierarchy(res.data);
    }
    setLoading(false);
  }, [token, showNotice]);

  const loadQueue = useCallback(async () => {
    const res = await apiGet<ReclRow[]>("/platform/reclassifications", token);
    if (res.success && res.data) setQueue(res.data);
  }, [token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (showCleanup) void loadQueue(); }, [showCleanup, loadQueue]);

  // Deep-link support: when the parent opens this workspace focused on a town
  // (e.g. from a geography health alert), drill straight into it once.
  const focusApplied = useRef<string | null>(null);
  useEffect(() => {
    if (!focusTownId || !hierarchy) return;
    if (focusApplied.current === focusTownId) return;
    focusApplied.current = focusTownId;
    const county = hierarchy.counties.find((c) => c.towns.some((t) => t.id === focusTownId));
    const town = county?.towns.find((t) => t.id === focusTownId);
    if (county && town) {
      setSelectedCountyId(county.id);
      setSelectedTownId(town.id);
      setShowCleanup(false);
    }
  }, [focusTownId, hierarchy]);

  useEffect(() => {
    if (!selectedTownId) { setTownHotels([]); return; }
    let stale = false;
    void (async () => {
      const res = await apiGet<{ hotels: { id: string; name: string; slug: string; isOpen: boolean }[] }>(`/platform/towns/${selectedTownId}`, token);
      if (!stale && res.success && res.data) setTownHotels(res.data.hotels);
    })();
    return () => { stale = true; };
  }, [selectedTownId, token]);

  const counties = hierarchy?.counties ?? [];
  const selectedCounty = counties.find((c) => c.id === selectedCountyId) ?? null;
  const selectedTown = (selectedCounty?.towns ?? counties.flatMap((c) => c.towns)).find((t) => t.id === selectedTownId) ?? null;

  const matchesFilter = (active: boolean) => statusFilter === "all" || (statusFilter === "active" ? active : !active);

  const searching = q.trim().length > 0;
  const term = q.trim().toLowerCase();

  // Levels available for action (mobile drill-down)
  const mobileLevel: "counties" | "towns" | "town" = selectedTownId ? "town" : selectedCountyId ? "towns" : "counties";

  // ── Search results ──
  const searchResults = searching
    ? {
        counties: counties.filter((c) => c.name.toLowerCase().includes(term)),
        towns: counties.flatMap((c) => c.towns.filter((t) => t.name.toLowerCase().includes(term)).map((t) => ({ ...t, countyName: c.name }))),
        areas: counties.flatMap((c) => c.towns.flatMap((t) => t.areas.filter((a) => a.name.toLowerCase().includes(term)).map((a) => ({ ...a, countyName: c.name, townName: t.name })))),
      }
    : null;

  const goToArea = (countyId: string, townId: string) => {
    setSelectedCountyId(countyId);
    setSelectedTownId(townId);
    setQ("");
  };

  // ── CRUD actions ──
  const submitAddCounty = async () => {
    if (!countyForm.name.trim() || modalBusy) return;
    setModalBusy(true);
    const res = await apiPost<GeoCounty>("/platform/mega-regions", { name: countyForm.name.trim(), type: countyForm.type }, token);
    setModalBusy(false);
    if (res.success && res.data) {
      showNotice("success", `${countyForm.name.trim()} added.`);
      setCountyForm({ name: "", type: "COUNTY" });
      setOpenModal(null);
      await load();
    } else showNotice("danger", res.error || "Could not add county or city");
  };

  const submitEditCounty = async () => {
    if (!editCountyId || !countyForm.name.trim() || modalBusy) return;
    setModalBusy(true);
    const res = await apiPatch<GeoCounty>(`/platform/mega-regions/${editCountyId}`, { name: countyForm.name.trim(), type: countyForm.type }, token);
    setModalBusy(false);
    if (res.success) {
      showNotice("success", "County or city updated.");
      setOpenModal(null);
      await load();
    } else showNotice("danger", res.error || "Could not update county or city");
  };

  const submitAddTown = async () => {
    const countyId = selectedCountyId ?? counties[0]?.id;
    if (!countyId || !townForm.name.trim() || modalBusy) return;
    setModalBusy(true);
    const res = await apiPost<GeoTown>("/platform/towns", { name: townForm.name.trim(), megaRegionId: countyId, type: townForm.type, locationLabel: townForm.locationLabel.trim(), locationPlaceholder: townForm.locationPlaceholder.trim() }, token);
    setModalBusy(false);
    if (res.success && res.data) {
      showNotice("success", `${townForm.name.trim()} added with its fallback "${"General Area"}".`);
      setTownForm({ name: "", type: "OTHER", locationLabel: "Delivery point", locationPlaceholder: "e.g. building, landmark, stall number" });
      setOpenModal(null);
      if (!selectedCountyId) setSelectedCountyId(countyId);
      setSelectedTownId(res.data.id);
      await load();
    } else showNotice("danger", res.error || "Could not add town");
  };

  const submitEditTown = async () => {
    if (!editTownId || !townForm.name.trim() || modalBusy) return;
    setModalBusy(true);
    const payload: Record<string, unknown> = { name: townForm.name.trim(), locationLabel: townForm.locationLabel.trim(), locationPlaceholder: townForm.locationPlaceholder.trim() };
    const townCurrentCounty = counties.find((c) => c.towns.some((t) => t.id === editTownId));
    if (selectedCountyId && townCurrentCounty && selectedCountyId !== townCurrentCounty.id) payload.megaRegionId = selectedCountyId;
    const res = await apiPatch<GeoTown>(`/platform/towns/${editTownId}`, payload, token);
    setModalBusy(false);
    if (res.success) {
      showNotice("success", "Town updated.");
      setOpenModal(null);
      await load();
    } else showNotice("danger", res.error || "Could not update town");
  };

  const submitAddArea = async () => {
    if (!selectedTownId || !areaForm.name.trim() || modalBusy) return;
    setModalBusy(true);
    const res = await apiPost<GeoArea>(`/platform/towns/${selectedTownId}/areas`, { name: areaForm.name.trim(), active: areaForm.active, note: areaForm.note.trim() || null, displayOrder: Number(areaForm.displayOrder) || 0 }, token);
    setModalBusy(false);
    if (res.success && res.data) {
      showNotice("success", `Local area "${areaForm.name.trim()}" added.`);
      setAreaForm({ name: "", active: true, note: "", displayOrder: 0 });
      setOpenModal(null);
      await load();
    } else showNotice("danger", res.error || "Could not add local area");
  };

  const submitEditArea = async () => {
    if (!editAreaId || !areaForm.name.trim() || modalBusy) return;
    setModalBusy(true);
    const res = await apiPatch<GeoArea>(`/platform/town-regions/${editAreaId}`, { name: areaForm.name.trim(), active: areaForm.active, note: areaForm.note.trim() || null, displayOrder: Number(areaForm.displayOrder) || 0 }, token);
    setModalBusy(false);
    if (res.success) {
      showNotice("success", "Local area updated.");
      setOpenModal(null);
      await load();
    } else showNotice("danger", res.error || "Could not update local area");
  };

  // ── Deactivation impact flow ──
  const requestDeactivate = async (kind: ImpactKind, id: string) => {
    setImpact({ kind, id, name: "", loading: true, deps: null });
    try {
      if (kind === "area") {
        const res = await apiGet<AreaDeps>(`/platform/town-regions/${id}/dependencies`, token);
        if (!res.success || !res.data) throw new Error(res.error || "Could not load impact");
        const activeAreasInTown = selectedTown?.areas.filter((a) => a.active).length ?? 0;
        setImpact({
          kind, id, name: selectedTown?.areas.find((a) => a.id === id)?.name ?? "this area", loading: false,
          deps: {
            customers: res.data.customers, hotels: res.data.hotels, blocked: activeAreasInTown <= 1,
            blockReason: activeAreasInTown <= 1 ? "A town must always have at least one active local area." : undefined,
            note: res.data.customers > 0 ? `${res.data.customers} customer(s) with this saved area will be moved to the town's "General Area" fallback.` : undefined,
          },
        });
      } else if (kind === "town") {
        const res = await apiGet<TownDeps>(`/platform/towns/${id}/dependencies`, token);
        if (!res.success || !res.data) throw new Error(res.error || "Could not load impact");
        setImpact({ kind, id, name: selectedTown?.name ?? "this town", loading: false, deps: { ...res.data, blocked: res.data.hotels > 0, blockReason: res.data.hotels > 0 ? `${res.data.hotels} hotel(s) are still assigned to this town. Reassign them before retiring the town.` : undefined } });
      } else {
        const county = counties.find((c) => c.id === id);
        const hotels = county?.towns.reduce((sum, t) => sum + t.hotelCount, 0) ?? 0;
        const activeTowns = county?.activeTownCount ?? 0;
        setImpact({ kind, id, name: county?.name ?? "this county/city", loading: false, deps: { customers: 0, hotels, towns: county?.townCount, activeTowns, blocked: activeTowns > 0 || hotels > 0, blockReason: activeTowns > 0 ? "Deactivate the towns inside before deactivating the county/city." : hotels > 0 ? "Hotels are still assigned to towns inside this county/city." : undefined } });
      }
    } catch (err: any) {
      showNotice("danger", err.message || "Could not load impact");
      setImpact(null);
    }
  };

  const confirmDeactivate = async () => {
    if (!impact || impactConfirming) return;
    setImpactConfirming(true);
    let res;
    if (impact.kind === "area") res = await apiPost<{ active: boolean; movedCustomers: number }>(`/platform/town-regions/${impact.id}/deactivate`, {}, token);
    else if (impact.kind === "town") res = await apiPatch<{ active: boolean }>(`/platform/towns/${impact.id}`, { active: false }, token);
    else res = await apiPost<{ active: boolean }>(`/platform/mega-regions/${impact.id}/deactivate`, {}, token);
    setImpactConfirming(false);
    if (res.success) {
      showNotice("success", impact.kind === "area" ? `${impact.name} deactivated.` : `${impact.name} deactivated.`);
      setImpact(null);
      if (impact.kind === "town") setSelectedTownId(null);
      if (impact.kind === "county") setSelectedCountyId(null);
      await load();
    } else {
      showNotice("danger", res.error || "Could not deactivate");
    }
  };

  // ── Cleanup: preview / queue / apply ──
  const runPreview = async () => {
    if (!previewId) return;
    setPreviewLoading(true);
    setPreview(null);
    const res = await apiPost<ReclPreview>("/platform/geography/reclassifications/preview", { sourceZoneId: previewId }, token);
    setPreviewLoading(false);
    if (res.success && res.data) {
      setPreview(res.data);
      setTargetTownId(res.data.candidateTowns[0]?.id ?? "");
      setAreaName(res.data.sourceName);
    } else showNotice("danger", res.error || "Could not preview this record");
  };

  const runQueueAndApply = async () => {
    if (!preview || !targetTownId || !areaName.trim()) return;
    setModalBusy(true);
    const queued = await apiPost<{ id: string }>("/platform/geography/reclassifications", { sourceZoneId: preview.sourceZoneId, proposedTownId: targetTownId, areaName: areaName.trim() }, token);
    if (!queued.success || !queued.data) {
      setModalBusy(false);
      showNotice("danger", queued.error || "Could not queue the reclassification");
      return;
    }
    const applied = await apiPost<{ alreadyApplied?: boolean }>("/platform/geography/reclassifications/apply", { reclassificationId: queued.data.id }, token);
    setModalBusy(false);
    if (applied.success) {
      showNotice("success", `"${preview.sourceName}" now lives as the local area "${areaName.trim()}" under its target town.`);
      setPreview(null);
      setPreviewId("");
      await loadQueue();
      await load();
    } else showNotice("danger", applied.error || "Could not apply the reclassification");
  };

  const applyQueued = async (r: ReclRow) => {
    setModalBusy(true);
    const res = await apiPost<{ alreadyApplied?: boolean }>("/platform/geography/reclassifications/apply", { reclassificationId: r.id }, token);
    setModalBusy(false);
    if (res.success) {
      showNotice("success", `Applied: "${r.sourceName}" now lives as "${r.areaName}" under ${r.proposedTownName}.`);
      await loadQueue();
      await load();
    } else showNotice("danger", res.error || "Could not apply the reclassification");
  };

  const allTownsForPreview = counties.flatMap((c) => c.towns.map((t) => ({ id: t.id, name: t.name, county: c.name, active: t.active })));

  // ── Render helpers ──
  const StatusChip = ({ active }: { active: boolean }) => (
    <span style={{ fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.04em", color: active ? G.success : G.textDim, background: active ? G.successMuted : G.bg, border: `1px solid ${active ? "#BBF7D0" : G.border}`, borderRadius: "999px", padding: `${px(1)} ${px(2)}`, whiteSpace: "nowrap" }}>{active ? "ACTIVE" : "INACTIVE"}</span>
  );
  const FallbackChip = () => (
    <span style={{ fontSize: "0.7rem", fontWeight: 800, color: G.warning, background: G.warningMuted, border: `1px solid #FDE68A`, borderRadius: "999px", padding: `${px(1)} ${px(2)}`, whiteSpace: "nowrap" }}>FALLBACK</span>
  );

  const countyRows = counties.filter((c) => matchesFilter(c.active));
  const townRows = (selectedCounty?.towns ?? counties.flatMap((c) => c.towns)).filter((t) => matchesFilter(t.active) && (!selectedCountyId || t_matchesCounty(t.id)));
  function t_matchesCounty(townId: string): boolean {
    return Boolean(selectedCounty && selectedCounty.towns.some((t) => t.id === townId));
  }

  const CountyPane = ({ counties: rows, compact }: { counties: GeoCounty[]; compact?: boolean }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: px(2) }}>
      {rows.length === 0 && <div style={{ color: G.textDim, fontSize: "0.85rem", padding: px(4), textAlign: "center" }}>No county or city found.</div>}
      {rows.map((c) => (
        <div key={c.id}
          role="button" tabIndex={0}
          onClick={() => { setSelectedCountyId(c.id); setSelectedTownId(null); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedCountyId(c.id); setSelectedTownId(null); } }}
          style={{ background: selectedCountyId === c.id ? G.primaryMuted : G.surface, border: `1px solid ${selectedCountyId === c.id ? G.primaryLight : G.border}`, borderLeft: `4px solid ${selectedCountyId === c.id ? G.primary : "transparent"}`, borderRadius: G.radius, padding: `${px(3)} ${px(4)}`, cursor: "pointer", display: "flex", flexDirection: "column", gap: px(1) }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: px(2) }}>
            <span style={{ fontWeight: 700, color: G.text, fontSize: "0.9rem" }}>{c.name}</span>
            <StatusChip active={c.active} />
          </div>
          {!compact && <div style={{ fontSize: "0.75rem", color: G.textMuted }}>{c.type.toLowerCase()} · {c.activeTownCount}/{c.townCount} towns · {c.activeAreaCount}/{c.areaCount} areas
            <span style={{ marginLeft: px(2), color: G.danger, fontWeight: 600 }}>{(c.towns.reduce((sum, t) => sum + t.hotelCount, 0)) > 0 ? `${c.towns.reduce((sum, t) => sum + t.hotelCount, 0)} hotel(s)` : ""}</span>
          </div>}
          <div style={{ display: "flex", gap: px(1), marginTop: px(1), flexWrap: "wrap" }}>
            <button type="button" onClick={(e) => { e.stopPropagation(); setEditCountyId(c.id); setCountyForm({ name: c.name, type: c.type }); setOpenModal("editCounty"); }} style={linkStyle}>Edit</button>
            <button type="button" onClick={(e) => { e.stopPropagation(); void requestDeactivate("county", c.id); }} style={linkStyleDanger}>Deactivate</button>
          </div>
        </div>
      ))}
    </div>
  );

  const linkStyle: React.CSSProperties = { background: "none", border: "none", padding: 0, color: G.primary, fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" };
  const linkStyleDanger: React.CSSProperties = { ...linkStyle, color: G.danger };

  const TownRow = ({ town, countyName }: { town: GeoTown; countyName: string }) => (
    <div key={town.id}
      role="button" tabIndex={0}
      onClick={() => setSelectedTownId(town.id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedTownId(town.id); } }}
      style={{ background: selectedTownId === town.id ? G.primaryMuted : G.surface, border: `1px solid ${selectedTownId === town.id ? G.primaryLight : G.border}`, borderLeft: `4px solid ${selectedTownId === town.id ? G.primary : "transparent"}`, borderRadius: G.radius, padding: `${px(3)} ${px(4)}`, cursor: "pointer", display: "flex", flexDirection: "column", gap: px(1) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: px(2) }}>
        <span style={{ fontWeight: 700, color: G.text, fontSize: "0.9rem" }}>{town.name}</span>
        <StatusChip active={town.active} />
      </div>
      <div style={{ fontSize: "0.75rem", color: G.textMuted }}>{countyName} · {town.hotelCount} hotel(s) · {town.activeAreaCount}/{town.areaCount} zone(s)</div>
      <div style={{ display: "flex", gap: px(2), marginTop: px(1), flexWrap: "wrap" }}>
        <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedTownId(town.id); }} style={linkStyle}>View zones ({town.areaCount})</button>
        <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedTownId(town.id); setAreaForm({ name: "", active: true, note: "", displayOrder: 0 }); setOpenModal("addArea"); }} style={linkStyle}>+ Add zone</button>
        <button type="button" onClick={(e) => { e.stopPropagation(); setEditTownId(town.id); setTownForm({ name: town.name, type: town.type, locationLabel: town.locationLabel, locationPlaceholder: town.locationPlaceholder }); setOpenModal("editTown"); }} style={linkStyle}>Edit</button>
        <button type="button" onClick={(e) => { e.stopPropagation(); void requestDeactivate("town", town.id); }} style={linkStyleDanger}>Deactivate</button>
      </div>
    </div>
  );

  const areaRows = selectedTown
    ? [...selectedTown.areas].sort((a, b) => (a.displayOrder - b.displayOrder) || a.name.localeCompare(b.name)).filter((a) => matchesFilter(a.active))
    : [];

  return (
    <MotionConfig reducedMotion="user">
      <div className="geography-workspace" style={{ fontFamily: "Inter, system-ui, -apple-system, sans-serif" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: px(4), marginBottom: px(5), flexWrap: "wrap" }}>
          <div>
            <p style={{ color: G.primary, fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: px(1), marginTop: 0 }}>Marketplace geography</p>
            <h1 style={{ fontSize: "clamp(1.4rem, 3.4vw, 1.9rem)", fontWeight: 800, color: G.text, margin: 0 }}>Geography</h1>
            <p style={{ color: G.textMuted, fontSize: "0.88rem", marginTop: px(1), marginBottom: 0 }}>County or city → Town → Local area. Hotels are discovered by town; customers pick their local area.</p>
            <div style={{ display: "flex", alignItems: "center", gap: px(2), marginTop: px(2), fontSize: "0.75rem", color: G.textMuted }}>
              <span style={{ background: G.primaryMuted, color: G.primary, fontWeight: 800, borderRadius: "999px", padding: `${px(1)} ${px(2)}` }}>{ROLE_LABELS[user.role] ?? user.role}</span>
              <span>{user.name} @{user.username}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: px(2), flexWrap: "wrap" }}>
            <Button size="sm" variant="secondary" onClick={() => { setShowCleanup(false); void load(); }} icon={<RefreshCw size={14} />}>Refresh</Button>
            <Button size="sm" variant={showCleanup ? "primary" : "ghost"} onClick={() => setShowCleanup((v) => !v)} icon={<Sparkles size={14} />}>Cleanup</Button>
            <Button size="sm" variant="primary" onClick={() => { setCountyForm({ name: "", type: "COUNTY" }); setOpenModal("addCounty"); }} icon={<Plus size={14} />}>Add County</Button>
          </div>
        </div>

        {notice && (
          <div role="status" style={{ display: "flex", alignItems: "center", gap: px(2), borderRadius: G.radius, padding: `${px(3)} ${px(4)}`, marginBottom: px(4), fontSize: "0.85rem", fontWeight: 600, background: notice.kind === "success" ? G.successMuted : notice.kind === "danger" ? G.dangerMuted : G.warningMuted, color: notice.kind === "success" ? G.success : notice.kind === "danger" ? G.danger : G.warning, border: `1px solid ${notice.kind === "success" ? "#BBF7D0" : notice.kind === "danger" ? "#FECACA" : "#FDE68A"}` }}>
            {notice.kind === "success" ? <CheckCircle2 size={16} /> : notice.kind === "danger" ? <AlertTriangle size={16} /> : <Info size={16} />}
            <span>{notice.text}</span>
            <button onClick={() => setNotice(null)} aria-label="Dismiss" style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0 }}><X size={14} /></button>
          </div>
        )}

        {loading && !hierarchy ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "36vh", color: G.textDim }}>Loading geography…</div>
        ) : (
          <>
            {/* Toolbar */}
            <div style={{ display: "flex", gap: px(2), alignItems: "center", flexWrap: "wrap", marginBottom: px(4) }}>
              <div style={{ position: "relative", flex: "1 1 220px", minWidth: 200 }}>
                <Search size={16} style={{ position: "absolute", left: px(3), top: "50%", transform: "translateY(-50%)", color: G.textDim, pointerEvents: "none" }} />
                <input aria-label="Search counties, towns or local areas" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search counties, towns or local areas…" style={{ width: "100%", padding: `${px(2)} ${px(3)} ${px(2)} ${px(9)}`, border: `1px solid ${G.border}`, borderRadius: G.radius, fontSize: "0.88rem", outline: "none", background: G.surface, fontFamily: "inherit" }} />
                {q && <button onClick={() => setQ("")} aria-label="Clear search" style={{ position: "absolute", right: px(2), top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: G.textDim, padding: px(1) }}><X size={14} /></button>}
              </div>
              <div style={{ display: "flex", gap: px(1), background: G.surface, border: `1px solid ${G.border}`, borderRadius: G.radius, padding: px(1) }}>
                {(["all", "active", "inactive"] as const).map((f) => (
                  <button key={f} onClick={() => setStatusFilter(f)} style={{ background: statusFilter === f ? G.primary : "transparent", color: statusFilter === f ? "#fff" : G.textMuted, border: "none", borderRadius: "10px", padding: `${px(1)} ${px(3)}`, fontSize: "0.8rem", fontWeight: 700, cursor: "pointer" }}>{f === "all" ? "All" : f === "active" ? "Active" : "Inactive"}</button>
                ))}
              </div>
            </div>

            {/* ── Cleanup queue view ── */}
            {showCleanup ? (
              <div style={{ display: "flex", flexDirection: "column", gap: px(5) }}>
                <section style={{ background: G.surface, border: `1px solid ${G.border}`, borderRadius: "18px", padding: px(4) }}>
                  <div style={{ display: "flex", alignItems: "center", gap: px(2), marginBottom: px(2) }}>
                    <ShieldAlert size={18} color={G.warning} />
                    <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: G.text }}>Legacy geography cleanup</h2>
                  </div>
                  <p style={{ color: G.textMuted, fontSize: "0.85rem", marginBottom: px(3) }}>
                    Records created before local areas existed are stored at town level. Review a record, decide whether it is a real town or a local area that lives under a proper town, then apply the change atomically. Applied records keep full audit history.
                  </p>
                  <div style={{ display: "flex", gap: px(2), alignItems: "center", flexWrap: "wrap", marginBottom: px(3) }}>
                    <select value={previewId} onChange={(e) => { setPreviewId(e.target.value); setPreview(null); }} style={{ flex: "1 1 220px", minWidth: 200, padding: px(2.5), border: `1px solid ${G.border}`, borderRadius: G.radius, fontSize: "0.85rem", background: G.surface, fontFamily: "inherit" }}>
                      <option value="">Choose a record to review…</option>
                      {allTownsForPreview.map((z) => <option key={z.id} value={z.id}>{z.name} · {z.county}{z.active ? "" : " (inactive)"}</option>)}
                    </select>
                    <Button size="sm" variant="secondary" onClick={() => void runPreview()} loading={previewLoading} disabled={!previewId}>Review</Button>
                  </div>

                  {preview && (
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ background: G.bg, border: `1px solid ${G.border}`, borderRadius: G.radius, padding: px(4) }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: px(2), flexWrap: "wrap", gap: px(2) }}>
                        <div style={{ fontWeight: 800, color: G.text }}>"{preview.sourceName}"</div>
                        <StatusChip active={preview.sourceActive} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: px(2), marginBottom: px(3) }}>
                        {[
                          { label: "Hotels", value: preview.hotelCount, warn: preview.hasHotels },
                          { label: "Delivery fees", value: preview.deliveryFees, warn: preview.deliveryFees > 0 },
                          { label: "Local areas", value: preview.areaCount },
                          { label: "Customers", value: preview.customerCount },
                        ].map((stat) => (
                          <div key={stat.label} style={{ background: G.surface, border: `1px solid ${stat.warn ? "#FECACA" : G.border}`, borderRadius: "12px", padding: px(3) }}>
                            <div style={{ fontSize: "1.3rem", fontWeight: 800, color: stat.warn ? G.danger : G.text }}>{stat.value}</div>
                            <div style={{ fontSize: "0.72rem", color: G.textMuted }}>{stat.label}</div>
                          </div>
                        ))}
                      </div>

                      {preview.hasHotels || preview.deliveryFees > 0 ? (
                        <div style={{ background: G.dangerMuted, color: G.danger, border: `1px solid #FECACA`, borderRadius: G.radius, padding: px(3), fontSize: "0.82rem", fontWeight: 600, marginBottom: px(3) }}>
                          This record is actively in use as a town. Reassign its hotels to another town before retiring it as a local area.
                        </div>
                      ) : (
                        <div style={{ background: G.successMuted, color: G.success, border: `1px solid #BBF7D0`, borderRadius: G.radius, padding: px(3), fontSize: "0.82rem", fontWeight: 600, marginBottom: px(3) }}>
                          Safe to retire into a local area: it has no hotels or delivery fees of its own. {preview.customerCount > 0 ? `${preview.customerCount} customer reference(s) will move with it.` : "No customer references to migrate."}
                        </div>
                      )}

                      {!preview.removable && (
                        <>
                          <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: G.textMuted, marginBottom: px(1) }}>Keep as a town</label>
                          <p style={{ fontSize: "0.82rem", color: G.textMuted, margin: `0 0 ${px(3)}` }}>This record is still in use. Leave it as a town and manage its local areas normally (or reassign its hotels first).</p>
                        </>
                      )}

                      {preview.candidateTowns.length > 0 && (
                        <div style={{ borderTop: `1px solid ${G.border}`, paddingTop: px(3), display: "flex", flexDirection: "column", gap: px(2) }}>
                          <label style={{ fontSize: "0.78rem", fontWeight: 700, color: G.textMuted }}>Retire as a local area under:</label>
                          <select value={targetTownId} onChange={(e) => setTargetTownId(e.target.value)} style={{ padding: px(2.5), border: `1px solid ${G.border}`, borderRadius: G.radius, fontSize: "0.85rem", background: G.surface, fontFamily: "inherit" }}>
                            {preview.candidateTowns.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.countyName}</option>)}
                          </select>
                          <input aria-label="Local area name" value={areaName} onChange={(e) => setAreaName(e.target.value)} placeholder="Local area name" style={{ padding: px(2.5), border: `1px solid ${G.border}`, borderRadius: G.radius, fontSize: "0.85rem", background: G.surface, fontFamily: "inherit" }} />
                          <Button size="sm" variant="primary" onClick={() => void runQueueAndApply()} loading={modalBusy} disabled={!targetTownId || !areaName.trim()}>
                            Apply reclassification
                          </Button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </section>

                <section>
                  <h2 style={{ margin: `0 0 ${px(3)}`, fontSize: "1rem", fontWeight: 700, color: G.text }}>Reclassification queue</h2>
                  {queue.length === 0 ? (
                    <div style={{ color: G.textMuted, padding: px(6), textAlign: "center", background: G.surface, border: `1px solid ${G.border}`, borderRadius: G.radius, fontSize: "0.85rem" }}>No reclassifications queued yet.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: px(2) }}>
                      {queue.map((r) => (
                        <div key={r.id} style={{ background: G.surface, border: `1px solid ${G.border}`, borderRadius: G.radius, padding: px(3), display: "flex", justifyContent: "space-between", alignItems: "center", gap: px(2), flexWrap: "wrap" }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, color: G.text, fontSize: "0.9rem" }}>"{r.sourceName}" → "{r.areaName}" <span style={{ color: G.textMuted, fontWeight: 600 }}>under {r.proposedTownName}</span></div>
                            <div style={{ fontSize: "0.78rem", color: G.textMuted }}>{r.status === "applied" ? `Applied ${r.appliedAt ? new Date(r.appliedAt).toLocaleString() : ""}` : `Queued ${new Date(r.createdAt).toLocaleString()}`} · moved {r.appliesTo ?? 0} customer refs, {r.rejectedCount ?? 0} hotels</div>
                          </div>
                          {r.status === "pending" && <Button size="sm" variant="secondary" onClick={() => void applyQueued(r)} loading={modalBusy}>Apply</Button>}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            ) : searching ? (
              <div style={{ display: "flex", flexDirection: "column", gap: px(4) }}>
                {[
                  { label: "Counties & cities", items: searchResults!.counties.map((c) => ({ key: c.id, title: c.name, sub: `${c.type.toLowerCase()} · ${c.activeTownCount} towns`, active: c.active, onClick: () => { setSelectedCountyId(c.id); setSelectedTownId(null); setQ(""); setShowCleanup(false); } })) },
                  { label: "Towns", items: searchResults!.towns.map((t) => ({ key: t.id, title: t.name, sub: `${t.countyName} · ${t.hotelCount} hotels · ${t.activeAreaCount} areas`, active: t.active, onClick: () => goToArea(counties.find((c) => c.towns.some((x) => x.id === t.id))?.id ?? "", t.id) })) },
                  { label: "Local areas", items: searchResults!.areas.map((a) => ({ key: a.id, title: a.name, sub: `${a.townName} · ${a.countyName}${a.isFallback ? " · fallback" : ""}`, active: a.active, onClick: () => { goToArea(counties.find((c) => c.towns.some((x) => x.id === a.townId))?.id ?? "", a.townId); } })) },
                ].map((group) => (
                  group.items.length > 0 && (
                    <section key={group.label}>
                      <div style={{ marginBottom: px(2), color: G.textMuted, fontSize: "0.75rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>{group.label}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: px(2) }}>
                        {group.items.map((item) => (
                          <button key={item.key} onClick={item.onClick} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: px(2), background: G.surface, border: `1px solid ${G.border}`, borderRadius: G.radius, padding: `${px(3)} ${px(4)}`, cursor: "pointer", textAlign: "left", width: "100%" }}>
                            <span>
                              <span style={{ display: "block", fontWeight: 700, color: G.text, fontSize: "0.9rem" }}>{item.title}</span>
                              <span style={{ display: "block", fontSize: "0.78rem", color: G.textMuted }}>{item.sub}</span>
                            </span>
                            <StatusChip active={item.active} />
                          </button>
                        ))}
                      </div>
                    </section>
                  )
                ))}
                {searchResults && searchResults.counties.length === 0 && searchResults.towns.length === 0 && searchResults.areas.length === 0 && (
                  <div style={{ color: G.textMuted, textAlign: "center", padding: px(8) }}>No matching counties, towns or local areas.</div>
                )}
              </div>
            ) : (
              <>
                {/* Mobile breadcrumb */}
                <div className="lg:hidden" style={{ display: "flex", alignItems: "center", gap: px(2), marginBottom: px(3), fontSize: "0.82rem", color: G.textMuted }}>
                  {mobileLevel !== "counties" && (
                    <button onClick={() => { setSelectedTownId(null); if (mobileLevel === "town") setSelectedCountyId(null); }} style={linkStyle}><ChevronLeft size={15} /> Back</button>
                  )}
                  <button onClick={() => { setSelectedCountyId(null); setSelectedTownId(null); }} style={mobileLevel === "counties" ? { ...linkStyle, fontWeight: 800, color: G.text } : linkStyle}>Counties & cities</button>
                  {selectedCounty && <><ChevronRight size={14} /><span style={{ fontWeight: selectedTownId ? 600 : 800, color: selectedTownId ? G.textMuted : G.text }}>{selectedCounty.name}</span></>}
                  {selectedTown && <><ChevronRight size={14} /><span style={{ fontWeight: 800, color: G.text }}>{selectedTown.name}</span></>}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)] gap-4">
                  {/* Left: counties */}
                  <div className={mobileLevel === "counties" ? "" : "hidden lg:block"}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: px(2) }}>
                      <div style={{ fontSize: "0.75rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: G.textMuted }}>County / City</div>
                      <button onClick={() => { setCountyForm({ name: "", type: "COUNTY" }); setOpenModal("addCounty"); }} style={{ ...linkStyle, display: "inline-flex", alignItems: "center", gap: px(1) }}><Plus size={13} /> Add</button>
                    </div>
                    <CountyPane counties={countyRows} />
                  </div>

                  {/* Middle+right: towns / town detail */}
                  <div className={mobileLevel === "counties" ? "hidden lg:block" : ""}>
                    {(selectedTown && !showCleanup) ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: px(4) }}>
                        {/* Town summary */}
                        <div style={{ background: G.primary, color: "white", borderRadius: "18px", padding: px(4), display: "flex", flexDirection: "column", gap: px(2) }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: px(2), flexWrap: "wrap" }}>
                            <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>{selectedTown.name}</h2>
                            <span style={{ background: "rgba(255,255,255,0.16)", borderRadius: "999px", padding: `${px(1)} ${px(2)}`, fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.04em" }}>{selectedTown.active ? "ACTIVE" : "INACTIVE"}</span>
                          </div>
                          <div style={{ fontSize: "0.8rem", opacity: 0.85 }}>
                            {selectedCounty?.name} · {selectedTown.hotelCount} hotel(s) selling here · {selectedTown.activeAreaCount}/{selectedTown.areaCount} active local areas
                          </div>
                          <div style={{ fontSize: "0.78rem", opacity: 0.75 }}>Customers in {selectedTown.name} see these hotels; their checkout "area" picker uses the local areas below.</div>
                        </div>

                        {/* Hotels in town */}
                        {townHotels.length > 0 && (
                          <section>
                            <div style={{ marginBottom: px(2), color: G.textMuted, fontSize: "0.75rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Hotels in this town</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: px(2) }}>
                              {townHotels.map((h) => (
                                <div key={h.id}
                                  style={{ background: G.surface, border: `1px solid ${G.border}`, borderRadius: G.radius, padding: `${px(3)} ${px(4)}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: px(2) }}>
                                  <div role="button" tabIndex={0} onClick={() => onOpenHotel?.(h.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenHotel?.(h.id); } }} style={{ cursor: onOpenHotel ? "pointer" : "default", flex: 1 }}>
                                    <div style={{ fontWeight: 700, color: G.text, fontSize: "0.9rem" }}>{h.name}</div>
                                    <div style={{ fontSize: "0.78rem", color: G.textMuted }}>/{h.slug}</div>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: px(3) }}>
                                    <span style={{ fontSize: "0.72rem", fontWeight: 800, color: h.isOpen ? G.success : G.textDim }}>{h.isOpen ? "OPEN" : "CLOSED"}</span>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setRelocateHotel({ id: h.id, name: h.name, currentTownId: selectedTownId! }); setRelocateTargetTownId(""); setRelocateTargetAreaId(""); }} style={linkStyle}>Relocate Hotel</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </section>
                        )}

                        {/* Delivery Zones in Town */}
                        <section>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: px(2) }}>
                            <div style={{ color: G.textMuted, fontSize: "0.75rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Delivery Zones · Sub-areas</div>
                            <button onClick={() => { setAreaForm({ name: "", active: true, note: "", displayOrder: 0 }); setOpenModal("addArea"); }} style={{ ...linkStyle, display: "inline-flex", alignItems: "center", gap: px(1) }}><Plus size={13} /> Add zone</button>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: px(2) }}>
                            {areaRows.length === 0 && <div style={{ color: G.textMuted, background: G.surface, border: `1px solid ${G.border}`, borderRadius: G.radius, padding: px(6), textAlign: "center", fontSize: "0.85rem" }}>No delivery zones{statusFilter !== "all" ? ` matching "${statusFilter}"` : ""} in this town.</div>}
                            {areaRows.map((area) => (
                              <div key={area.id} style={{ background: G.surface, border: `1px solid ${area.isFallback ? "#FDE68A" : G.border}`, borderRadius: G.radius, padding: `${px(3)} ${px(4)}`, display: "flex", flexDirection: "column", gap: px(2) }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: px(2), flexWrap: "wrap" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: px(2), minWidth: 0 }}>
                                    <span style={{ fontWeight: 700, color: G.text, fontSize: "0.92rem" }}>{area.name}</span>
                                    {area.isFallback && <FallbackChip />}
                                    <StatusChip active={area.active} />
                                  </div>
                                  <span style={{ fontSize: "0.75rem", color: G.textMuted, flexShrink: 0 }}>{area.customerCount > 0 ? `${area.customerCount} saved customer${area.customerCount === 1 ? "" : "s"}` : "no customers"}</span>
                                </div>
                                <div style={{ fontSize: "0.8rem", color: G.textMuted }}>
                                  {area.note ? <span>📝 {area.note}</span> : area.isFallback ? "Guaranteed fallback — always available, cannot be removed." : "Operational note (landmarks, boundary hints) — optional."}
                                  {area.isFallback ? "" : ` · ordered ${area.displayOrder}`}
                                </div>
                                <div style={{ display: "flex", gap: px(3), flexWrap: "wrap" }}>
                                  <button type="button" onClick={() => { setEditAreaId(area.id); setAreaForm({ name: area.name, active: area.active, note: area.note ?? "", displayOrder: area.displayOrder }); setOpenModal("editArea"); }} style={linkStyle}>Edit</button>
                                  {area.active && !area.isFallback && <button type="button" onClick={() => void requestDeactivate("area", area.id)} style={linkStyleDanger}>Deactivate</button>}
                                  {!area.active && <button type="button" onClick={async () => { const res = await apiPatch<GeoArea>(`/platform/town-regions/${area.id}`, { active: true }, token); if (res.success) { showNotice("success", `"${area.name}" is active again.`); await load(); } else showNotice("danger", res.error || "Could not reactivate"); }} style={linkStyle}>Reactivate</button>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: px(2) }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: px(2) }}>
                          <div style={{ fontSize: "0.75rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: G.textMuted }}>{selectedCounty ? `Towns in ${selectedCounty.name}` : "All towns"}</div>
                          <button onClick={() => { setTownForm({ name: "", type: "OTHER", locationLabel: "Delivery point", locationPlaceholder: "e.g. building, landmark, stall number" }); setOpenModal("addTown"); }} style={{ ...linkStyle, display: "inline-flex", alignItems: "center", gap: px(1) }}><Plus size={13} /> Add town</button>
                        </div>
                        {townRows.length === 0 && (
                          <div style={{ color: G.textMuted, background: G.surface, border: `1px solid ${G.border}`, borderRadius: G.radius, padding: px(6), textAlign: "center", fontSize: "0.85rem" }}>
                            {selectedCounty ? "No towns in this county or city yet." : "No towns configured yet."}
                            <div style={{ marginTop: px(2) }}><Button size="sm" variant="secondary" onClick={() => { setTownForm({ name: "", type: "OTHER", locationLabel: "Delivery point", locationPlaceholder: "e.g. building, landmark, stall number" }); setOpenModal("addTown"); }}>Add your first town</Button></div>
                          </div>
                        )}
                        {townRows.map((town) => <TownRow key={town.id} town={town} countyName={selectedCounty?.name ?? counties.find((c) => c.towns.some((t) => t.id === town.id))?.name ?? ""} />)}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Modals ── */}
        {/* Add / edit county */}
        <Modal isOpen={openModal === "addCounty" || openModal === "editCounty"} onClose={() => setOpenModal(null)} title={openModal === "addCounty" ? "Add county or city" : "Edit county or city"} type="info">
          <div style={{ display: "flex", flexDirection: "column", gap: px(3) }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: G.textMuted, marginBottom: px(1) }}>Name</label>
              <input autoFocus value={countyForm.name} onChange={(e) => setCountyForm({ ...countyForm, name: e.target.value })} className="input-field" style={{ fontFamily: "inherit" }} placeholder="e.g. Nakuru County" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: G.textMuted, marginBottom: px(1) }}>Type</label>
              <select value={countyForm.type} onChange={(e) => setCountyForm({ ...countyForm, type: e.target.value })} className="input-field" style={{ fontFamily: "inherit" }}>
                <option value="COUNTY">County</option><option value="CITY">City</option><option value="OTHER">Other</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: px(3), marginTop: px(5) }}>
            <Button variant="secondary" fullWidth onClick={() => setOpenModal(null)}>Cancel</Button>
            <Button variant="primary" fullWidth onClick={() => void (openModal === "editCounty" ? submitEditCounty() : submitAddCounty())} loading={modalBusy} disabled={!countyForm.name.trim()}>{openModal === "editCounty" ? "Save changes" : "Add county or city"}</Button>
          </div>
        </Modal>

        {/* Add / edit town */}
        <Modal isOpen={openModal === "addTown" || openModal === "editTown"} onClose={() => setOpenModal(null)} title={openModal === "addTown" ? "Add town" : "Edit town"} type="info">
          <div style={{ display: "flex", flexDirection: "column", gap: px(3) }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: G.textMuted, marginBottom: px(1) }}>Town name</label>
              <input autoFocus value={townForm.name} onChange={(e) => setTownForm({ ...townForm, name: e.target.value })} className="input-field" style={{ fontFamily: "inherit" }} placeholder="e.g. Naivasha Town" />
              <div style={{ fontSize: "0.75rem", color: G.textDim, marginTop: px(1) }}>A protected "General Area" is created automatically as the fallback.</div>
            </div>
            {openModal === "editTown" && (
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: G.textMuted, marginBottom: px(1) }}>County / City (move town)</label>
                <select value={selectedCountyId ?? ""} onChange={(e) => { const val = e.target.value; if (val) setSelectedCountyId(val); }} className="input-field" style={{ fontFamily: "inherit" }}>
                  <option value="">Keep current county/city</option>
                  {counties.filter((c) => c.active !== false).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: G.textMuted, marginBottom: px(1) }}>Type</label>
              <select value={townForm.type} onChange={(e) => setTownForm({ ...townForm, type: e.target.value })} className="input-field" style={{ fontFamily: "inherit" }}>
                <option value="OTHER">Town</option><option value="CITY">City</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: G.textMuted, marginBottom: px(1) }}>Location label</label>
              <input value={townForm.locationLabel} onChange={(e) => setTownForm({ ...townForm, locationLabel: e.target.value })} className="input-field" style={{ fontFamily: "inherit" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: G.textMuted, marginBottom: px(1) }}>Location example</label>
              <input value={townForm.locationPlaceholder} onChange={(e) => setTownForm({ ...townForm, locationPlaceholder: e.target.value })} className="input-field" style={{ fontFamily: "inherit" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: px(3), marginTop: px(5) }}>
            <Button variant="secondary" fullWidth onClick={() => setOpenModal(null)}>Cancel</Button>
            <Button variant="primary" fullWidth onClick={() => void (openModal === "editTown" ? submitEditTown() : submitAddTown())} loading={modalBusy} disabled={!townForm.name.trim()}>{openModal === "editTown" ? "Save changes" : "Add town"}</Button>
          </div>
        </Modal>

        {/* Add / edit zone */}
        <Modal isOpen={openModal === "addArea" || openModal === "editArea"} onClose={() => setOpenModal(null)} title={openModal === "addArea" ? "Add zone to town" : "Edit delivery zone"} type="info">
          {(() => {
            const editingFallback = openModal === "editArea" && selectedTown?.areas.find((a) => a.id === editAreaId)?.isFallback;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: px(3) }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: G.textMuted, marginBottom: px(1) }}>Zone name</label>
                  <input autoFocus disabled={editingFallback} value={areaForm.name} onChange={(e) => setAreaForm({ ...areaForm, name: e.target.value })} className="input-field" style={{ fontFamily: "inherit" }} placeholder="e.g. Sokoni Modern Market, Bus Stage, General Delivery Area" />
                  {editingFallback && <div style={{ fontSize: "0.75rem", color: G.warning, marginTop: px(1) }}>The fallback "General Area" zone cannot be renamed or removed.</div>}
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: px(2), fontSize: "0.85rem", fontWeight: 600, color: G.text, cursor: editingFallback ? "not-allowed" : "pointer" }}>
                  <input type="checkbox" disabled={editingFallback} checked={areaForm.active} onChange={(e) => setAreaForm({ ...areaForm, active: e.target.checked })} style={{ width: "16px", height: "16px", accentColor: G.primary }} />
                  Available to customers
                </label>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: G.textMuted, marginBottom: px(1) }}>Operational note <span style={{ fontWeight: 500 }}>(landmarks, boundary hints)</span></label>
                  <textarea rows={2} value={areaForm.note} onChange={(e) => setAreaForm({ ...areaForm, note: e.target.value })} className="input-field" style={{ fontFamily: "inherit", resize: "vertical" }} placeholder="e.g. covers modern market stalls up to main gate" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: G.textMuted, marginBottom: px(1) }}>Display order</label>
                  <input type="number" value={areaForm.displayOrder} onChange={(e) => setAreaForm({ ...areaForm, displayOrder: Number(e.target.value) })} className="input-field" style={{ fontFamily: "inherit" }} />
                  <div style={{ fontSize: "0.75rem", color: G.textDim, marginTop: px(1) }}>Lower numbers appear first in the customer zone picker.</div>
                </div>
              </div>
            );
          })()}
          <div style={{ display: "flex", gap: px(3), marginTop: px(5) }}>
            <Button variant="secondary" fullWidth onClick={() => setOpenModal(null)}>Cancel</Button>
            <Button variant="primary" fullWidth onClick={() => void (openModal === "editArea" ? submitEditArea() : submitAddArea())} loading={modalBusy} disabled={!areaForm.name.trim()}>{openModal === "editArea" ? "Save changes" : "Add delivery zone"}</Button>
          </div>
        </Modal>

        {/* Relocate Hotel Modal */}
        <Modal isOpen={Boolean(relocateHotel)} onClose={() => setRelocateHotel(null)} title={`Relocate ${relocateHotel?.name ?? "Hotel"}`} type="info">
          <div style={{ display: "flex", flexDirection: "column", gap: px(3) }}>
            <p style={{ color: G.textMuted, fontSize: "0.85rem", margin: 0 }}>Select the destination town and its exact delivery area for <strong>{relocateHotel?.name}</strong>.</p>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: G.textMuted, marginBottom: px(1) }}>Target Town / Delivery Region</label>
              <select value={relocateTargetTownId} onChange={(e) => { const townId = e.target.value; setRelocateTargetTownId(townId); const town = counties.flatMap((c) => c.towns).find((t) => t.id === townId); setRelocateTargetAreaId(town?.areas.find((area) => area.active)?.id ?? ""); }} className="input-field" style={{ fontFamily: "inherit" }}>
                <option value="">Select target town…</option>
                {counties.filter((c) => c.active !== false).map((c) => (
                  <optgroup key={c.id} label={c.name}>
                    {c.towns.filter((t) => t.active !== false).map((t) => (
                      <option key={t.id} value={t.id} disabled={t.id === relocateHotel?.currentTownId}>
                        {t.name} {t.id === relocateHotel?.currentTownId ? " (current)" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <select value={relocateTargetAreaId} onChange={(e) => setRelocateTargetAreaId(e.target.value)} className="input-field" style={{ fontFamily: "inherit" }} disabled={!relocateTargetTownId}>
                <option value="">Select delivery area</option>
                {counties.flatMap((c) => c.towns).find((t) => t.id === relocateTargetTownId)?.areas.filter((area) => area.active).map((area) => <option key={area.id} value={area.id}>{area.name}{area.isFallback ? " · General area" : ""}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: px(3), marginTop: px(5) }}>
            <Button variant="secondary" fullWidth onClick={() => setRelocateHotel(null)}>Cancel</Button>
            <Button variant="primary" fullWidth onClick={() => void submitRelocateHotel()} loading={relocating} disabled={!relocateTargetTownId || !relocateTargetAreaId}>
              Confirm Relocation
            </Button>
          </div>
        </Modal>

        {/* Impact / deactivation confirmation */}
        <Modal isOpen={Boolean(impact)} onClose={() => setImpact(null)} title={`Deactivate ${impact?.kind === "area" ? "local area" : impact?.kind === "town" ? "town" : "county/city"}`} type="danger"
          primaryAction={impact && depsBlocked() ? undefined : { label: "Deactivate", variant: "danger", onClick: () => void confirmDeactivate(), loading: impactConfirming }}
          secondaryAction={{ label: "Cancel", onClick: () => setImpact(null) }}
        >
          {!impact ? null : impact.loading ? (
            <div style={{ color: G.textDim, padding: `${px(4)} 0`, textAlign: "center" }}>Checking dependencies…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: px(3) }}>
              <div style={{ fontWeight: 700, color: G.text }}>"{impact.name}" is used by:</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: px(2) }}>
                {[
                  { label: "Customers", value: depsBlocked() ? (impact.deps?.customers ?? 0) : (impact.deps?.customers ?? 0) },
                  { label: "Hotels", value: impact.deps?.hotels ?? 0 },
                  ...(impact.kind === "town" ? [{ label: "Local areas", value: impact.deps?.areas ?? 0 }, { label: "Active areas", value: impact.deps?.activeAreas ?? 0 }] : []),
                  ...(impact.kind === "county" ? [{ label: "Towns", value: impact.deps?.towns ?? 0 }, { label: "Active towns", value: impact.deps?.activeTowns ?? 0 }] : []),
                ].map((stat) => (
                  <div key={stat.label} style={{ background: G.surface, border: `1px solid ${G.border}`, borderRadius: "12px", padding: px(3) }}>
                    <div style={{ fontSize: "1.2rem", fontWeight: 800, color: G.text }}>{stat.value}</div>
                    <div style={{ fontSize: "0.72rem", color: G.textMuted }}>{stat.label}</div>
                  </div>
                ))}
              </div>
              {impact.deps?.note && <div style={{ background: G.warningMuted, color: G.warning, border: `1px solid #FDE68A`, borderRadius: G.radius, padding: px(3), fontSize: "0.82rem", fontWeight: 600 }}>{impact.deps.note}</div>}
              {depsBlocked() && <div style={{ background: G.dangerMuted, color: G.danger, border: `1px solid #FECACA`, borderRadius: G.radius, padding: px(3), fontSize: "0.82rem", fontWeight: 600 }}>⚠ {impact.deps?.blockReason}</div>}
              {!depsBlocked() && <div style={{ background: G.successMuted, color: G.success, border: `1px solid #BBF7D0`, borderRadius: G.radius, padding: px(3), fontSize: "0.82rem", fontWeight: 600 }}>This is non-destructive. The record stays in the system for audit traceability and can be reactivated anytime.</div>}
            </div>
          )}
        </Modal>
      </div>
    </MotionConfig>
  );

  function depsBlocked(): boolean {
    return Boolean(impact?.deps?.blocked);
  }
};
