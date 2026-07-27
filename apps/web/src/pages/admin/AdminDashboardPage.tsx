import React, { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import { useWebSocket } from "../../lib/websocket";
import {
  ArrowLeft, CheckCircle2, Clock, Settings,
  ShoppingBag, TrendingUp, Utensils, Wallet, XCircle, Calendar
} from "lucide-react";

interface AdminDashboardPageProps {
  token: string;
  onBackToOrders: () => void;
  onNavigateToOrders?: () => void;
  onNavigateToMenu?: () => void;
  onNavigateToSettings?: () => void;
  onNavigateToHistory?: () => void;
}

export const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({
  token,
  onBackToOrders,
  onNavigateToOrders,
  onNavigateToMenu,
  onNavigateToSettings,
  onNavigateToHistory,
}) => {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newOrderAlert, setNewOrderAlert] = useState(false);

  useWebSocket("admin", undefined, (event) => {
    if (event.type === "ORDER_CREATED") {
      setNewOrderAlert(true);
      setTimeout(() => setNewOrderAlert(false), 10000);
    }
  });

  const fetchMetrics = async () => {
    setLoading(true);
    const res = await apiGet<any>("/orders/dashboard/metrics", token);
    if (res.success && res.data) {
      setMetrics(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const actions = [
    { label: "Orders", icon: <ShoppingBag size={28} />, color: "#4F46E5", bg: "#EEF2FF", onClick: onNavigateToOrders ?? onBackToOrders },
    { label: "Menu", icon: <Utensils size={28} />, color: "#D97706", bg: "#FEF3C7", onClick: onNavigateToMenu ?? onBackToOrders },
    { label: "Settings", icon: <Settings size={28} />, color: "#1E4D36", bg: "#EBF4F0", onClick: onNavigateToSettings ?? onBackToOrders },
    { label: "History", icon: <Calendar size={28} />, color: "#7C3AED", bg: "#EDE9FE", onClick: onNavigateToHistory ?? onBackToOrders },
  ];

  return (
    <div className="admin-container">
      {/* Header Bar */}
      <header className="header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            onClick={onBackToOrders}
            style={{ background: "none", border: "none", color: "white", fontSize: "1.2rem", cursor: "pointer", display: "flex" }}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="header-title">Dashboard</div>
        </div>
      </header>

      {/* Main Content */}
      <div style={{ padding: "20px" }}>
        {/* Action Menu Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px", marginBottom: "24px" }}>
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              className="card"
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                padding: "24px 16px", gap: "10px", cursor: "pointer", border: "none",
                background: action.bg, color: action.color, fontWeight: 700, fontSize: "0.95rem",
                borderRadius: "14px", transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          ))}
        </div>

        {/* Performance Metrics */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#1F2937" }}>Today's Metrics</h2>
          <span style={{ fontSize: "0.8rem", background: "#E5E7EB", padding: "3px 10px", borderRadius: "999px", fontWeight: 600 }}>
            Today
          </span>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#6B7280" }}>Calculating daily metrics...</div>
        ) : !metrics ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#6B7280" }}>Failed to load metrics.</div>
        ) : (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "24px" }}>
              <div onClick={onBackToOrders} className="card" style={{ textAlign: "center", padding: "16px 12px", cursor: "pointer", border: newOrderAlert ? "2px solid #22C55E" : "1.5px solid #E5E7EB", position: "relative" }}>
                {newOrderAlert && (
                  <span style={{ position: "absolute", top: "-6px", right: "-6px", background: "#22C55E", color: "white", borderRadius: "50%", width: "22px", height: "22px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 800 }}>!</span>
                )}
                <ShoppingBag size={20} style={{ color: "#4F46E5", marginBottom: "4px" }} />
                <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#4F46E5" }}>{metrics.totalOrders}</div>
                <div style={{ fontSize: "0.75rem", color: "#6B7280", fontWeight: 600 }}>Total Orders</div>
              </div>

              <div className="card" style={{ textAlign: "center", padding: "16px 12px", border: "1.5px solid #E5E7EB" }}>
                <CheckCircle2 size={20} style={{ color: "#22C55E", marginBottom: "4px" }} />
                <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#22C55E" }}>{metrics.deliveredOrders}</div>
                <div style={{ fontSize: "0.75rem", color: "#6B7280", fontWeight: 600 }}>Delivered</div>
              </div>

              <div className="card" style={{ textAlign: "center", padding: "16px 12px", border: "1.5px solid #E5E7EB" }}>
                <Clock size={20} style={{ color: "#D97706", marginBottom: "4px" }} />
                <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#D97706" }}>{metrics.pendingOrders}</div>
                <div style={{ fontSize: "0.75rem", color: "#6B7280", fontWeight: 600 }}>Pending</div>
              </div>

              <div className="card" style={{ textAlign: "center", padding: "16px 12px", border: "1.5px solid #E5E7EB" }}>
                <TrendingUp size={20} style={{ color: "#1E4D36", marginBottom: "4px" }} />
                <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#1E4D36" }}>KSh {metrics.totalSales}</div>
                <div style={{ fontSize: "0.7rem", color: "#6B7280", fontWeight: 600 }}>Sales (excl. cancelled)</div>
              </div>

              <div className="card" style={{ textAlign: "center", padding: "16px 12px", border: "1.5px solid #F59E0B" }}>
                <Wallet size={20} style={{ color: "#D97706", marginBottom: "4px" }} />
                <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#D97706" }}>KSh {metrics.outstandingBalance}</div>
                <div style={{ fontSize: "0.7rem", color: "#6B7280", fontWeight: 600 }}>Outstanding</div>
              </div>

              <div className="card" style={{ textAlign: "center", padding: "16px 12px", border: "1.5px solid #FCA5A5" }}>
                <XCircle size={20} style={{ color: "#EF4444", marginBottom: "4px" }} />
                <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#EF4444" }}>{metrics.cancelledOrders}</div>
                <div style={{ fontSize: "0.75rem", color: "#6B7280", fontWeight: 600 }}>Cancelled</div>
              </div>

              {metrics.refundsDue > 0 && (
                <div className="card" style={{ textAlign: "center", padding: "16px 12px", border: "1.5px solid #F97316" }}>
                  <Wallet size={20} style={{ color: "#EA580C", marginBottom: "4px" }} />
                  <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#EA580C" }}>KSh {metrics.refundsDue}</div>
                  <div style={{ fontSize: "0.7rem", color: "#6B7280", fontWeight: 600 }}>Refunds Due</div>
                </div>
              )}

              <div className="card" style={{ textAlign: "center", padding: "16px 12px", border: "1.5px solid #A78BFA" }}>
                <TrendingUp size={20} style={{ color: "#7C3AED", marginBottom: "4px" }} />
                <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#7C3AED" }}>KSh {metrics.averageOrderValue?.toFixed(2)}</div>
                <div style={{ fontSize: "0.7rem", color: "#6B7280", fontWeight: 600 }}>Avg Value</div>
              </div>
            </div>

            {/* Top Items */}
            <div className="card">
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#1F2937", marginBottom: "12px" }}>Top Ordered Items</h3>
              {metrics.topItems?.length === 0 ? (
                <div style={{ color: "#6B7280", fontSize: "0.85rem" }}>No item sales recorded yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {metrics.topItems?.map((item: any, idx: number) => (
                    <div key={item.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: "8px", background: "#F9FAFB", border: "1px solid #F3F4F6" }}>
                      <span style={{ fontWeight: 600, color: "#1F2937", fontSize: "0.85rem" }}>{idx + 1}. {item.name}</span>
                      <span style={{ fontWeight: 800, color: "#1E4D36", background: "#EBF4F0", padding: "3px 8px", borderRadius: "999px", fontSize: "0.78rem" }}>{item.count} sold</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
