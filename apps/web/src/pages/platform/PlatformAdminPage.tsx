import React, { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
import { useNotifications } from "../../context/NotificationsContext";
import { Loader2, RefreshCw, Server } from "lucide-react";

interface Hotel {
  id: string;
  name: string;
  slug: string;
  isOpen: boolean;
  autoCloseAt: string | null;
  createdAt: string;
  deletedAt: string | null;
}

interface PlatformDashboard {
  hotelCount: number;
  activeHotelCount: number;
  platformBrand: string;
}

export const PlatformAdminPage: React.FC<{ token?: string; onBack: () => void; onLogout?: () => void }> = ({ token, onBack, onLogout }) => {
  const [dashboard, setDashboard] = useState<PlatformDashboard | null>(null);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [outboxEvents, setOutboxEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [outboxLoading, setOutboxLoading] = useState(false);
  const { pushNotification } = useNotifications();

  const loadDashboard = async () => {
    const res = await apiGet<PlatformDashboard>("/platform/dashboard", token);
    if (res.success && res.data) {
      setDashboard(res.data);
    }
  };

  const loadHotels = async () => {
    const res = await apiGet<Hotel[]>("/platform/hotels", token);
    if (res.success && res.data) {
      setHotels(res.data);
    }
  };

  const loadOutbox = async () => {
    setOutboxLoading(true);
    const res = await apiGet<any[]>("/platform/outbox?failed=true", token);
    if (res.success && res.data) {
      setOutboxEvents(res.data);
    }
    setOutboxLoading(false);
  };

  const handleToggleHotel = async (id: string) => {
    const res = await apiPost<Hotel>(`/platform/hotels/${id}/toggle`, {}, token);
    if (res.success && res.data) {
      pushNotification("info", "Hotel updated", `${res.data.name} is now ${res.data.isOpen ? "open" : "closed"}`);
      await loadHotels();
      await loadDashboard();
    } else {
      pushNotification("danger", "Error", res.error || "Failed to toggle hotel");
    }
  };

  useEffect(() => {
    const loadAll = async () => {
      await Promise.all([loadDashboard(), loadHotels(), loadOutbox()]);
      setLoading(false);
    };
    loadAll();
  }, []);

  if (loading) {
    return (
      <div className="app-container" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <Loader2 size={32} className="animate-spin" style={{ color: "#1E4D36" }} />
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: "white", fontSize: "1.2rem", cursor: "pointer" }}>
            ←
          </button>
          <div className="header-title">TableDash Platform</div>
        </div>
      </header>

      <div style={{ padding: "20px" }}>
        {/* Dashboard summary */}
        {dashboard && (
          <div style={{ background: "#EBF4F0", borderRadius: "16px", padding: "20px", marginBottom: "24px", border: "1.5px solid #1E4D36" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#1E4D36", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Server size={18} /> {dashboard.platformBrand} Admin
            </h2>
            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#1F2937" }}>{dashboard.hotelCount}</div>
                <div style={{ fontSize: "0.8rem", color: "#6B7280" }}>Total Hotels</div>
              </div>
              <div>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#16A34A" }}>{dashboard.activeHotelCount}</div>
                <div style={{ fontSize: "0.8rem", color: "#6B7280" }}>Currently Open</div>
              </div>
            </div>
          </div>
        )}

        {/* Hotels management */}
        <div style={{ marginBottom: "24px" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#1F2937", marginBottom: "12px" }}>Hotels</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {hotels.map((hotel) => (
              <div
                key={hotel.id}
                style={{
                  background: "white",
                  borderRadius: "12px",
                  padding: "14px 16px",
                  border: "1px solid #E5E7EB",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: "#1F2937" }}>{hotel.name}</div>
                  <div style={{ fontSize: "0.8rem", color: "#9CA3AF" }}>
                    {hotel.slug} • {hotel.isOpen ? "Open" : "Closed"}
                    {hotel.autoCloseAt && ` • Auto-close: ${new Date(hotel.autoCloseAt).toLocaleString()}`}
                  </div>
                </div>
                <button
                  onClick={() => handleToggleHotel(hotel.id)}
                  style={{
                    background: hotel.isOpen ? "#FEE2E2" : "#DCFCE7",
                    color: hotel.isOpen ? "#DC2626" : "#16A34A",
                    border: "none",
                    padding: "8px 14px",
                    borderRadius: "8px",
                    fontWeight: 700,
                    fontSize: "0.8rem",
                    cursor: "pointer",
                  }}
                >
                  {hotel.isOpen ? "Suspend" : "Activate"}
                </button>
              </div>
            ))}
            {hotels.length === 0 && (
              <div style={{ textAlign: "center", padding: "20px", color: "#9CA3AF" }}>No hotels registered yet.</div>
            )}
          </div>
        </div>

        {/* Outbox dead-letter */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#1F2937" }}>Outbox Dead Letters</h3>
            <button
              onClick={loadOutbox}
              disabled={outboxLoading}
              style={{
                background: "#F3F4F6",
                border: "1px solid #D1D5DB",
                fontSize: "0.8rem",
                color: "#374151",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "5px",
                cursor: "pointer",
                padding: "4px 10px",
                borderRadius: "16px",
              }}
            >
              <RefreshCw size={11} style={{ opacity: outboxLoading ? 0.5 : 1 }} /> Refresh
            </button>
          </div>
          {outboxLoading && <div style={{ padding: "12px", textAlign: "center", color: "#9CA3AF" }}>Loading…</div>}
          {!outboxLoading && outboxEvents.length === 0 && (
            <div style={{ textAlign: "center", padding: "16px", color: "#6B7280", background: "#F9FAFB", borderRadius: "10px" }}>
              All clear — no failed outbox events.
            </div>
          )}
          {!outboxLoading && outboxEvents.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {outboxEvents.map((ev: any) => (
                <div
                  key={ev.id}
                  style={{
                    background: "#FEF2F2",
                    border: "1px solid #FECACA",
                    borderRadius: "10px",
                    padding: "10px 14px",
                    fontSize: "0.85rem",
                  }}
                >
                  <div style={{ fontWeight: 700, color: "#DC2626" }}>
                    {ev.eventName} — {ev.status} (attempts: {ev.attempts})
                  </div>
                  <div style={{ color: "#991B1B", marginTop: "4px", fontSize: "0.8rem" }}>
                    {ev.lastError && <div>Error: {ev.lastError}</div>}
                    <div>{new Date(ev.createdAt).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};