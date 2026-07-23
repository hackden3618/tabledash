/**
 * Purpose: Analytical Dashboard View for tableDash hotel management.
 * Responsibilities: Renders daily metrics summary cards (Total Orders, Delivered, Pending, Total Sales KSh) and Top Items table.
 *   Clicking on any metric card navigates back to the Orders Management view.
 * Dependencies: React, apiGet helper, lucide-react.
 * When to modify: When adding new business KPIs or time period filters.
 */

import React, { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import { ArrowLeft, CheckCircle2, Clock, ShoppingBag, TrendingUp } from "lucide-react";

interface AdminDashboardPageProps {
  token: string;
  onBackToOrders: () => void;
}

export const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({
  token,
  onBackToOrders,
}) => {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="admin-container">
      {/* Header Bar */}
      <header className="header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            onClick={onBackToOrders}
            style={{
              background: "none",
              border: "none",
              color: "white",
              fontSize: "1.2rem",
              cursor: "pointer",
              display: "flex",
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="header-title">📊 Analytics Dashboard</div>
        </div>
      </header>

      {/* Main Content */}
      <div style={{ padding: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h1 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#1F2937" }}>Performance Overview</h1>
          <span style={{ fontSize: "0.85rem", background: "#E5E7EB", padding: "4px 10px", borderRadius: "999px", fontWeight: 600 }}>
            Today
          </span>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#6B7280" }}>
            Calculating daily metrics...
          </div>
        ) : !metrics ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#6B7280" }}>
            Failed to load metrics.
          </div>
        ) : (
          <div>
            {/* Metric Cards Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginBottom: "24px" }}>
              {/* Card 1: Total Orders */}
              <div
                onClick={onBackToOrders}
                className="card"
                style={{
                  textAlign: "center",
                  padding: "20px 16px",
                  cursor: "pointer",
                  transition: "transform 0.15s, box-shadow 0.15s",
                  border: "1.5px solid #E5E7EB",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#4F46E5"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E5E7EB"; }}
              >
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "6px", color: "#4F46E5" }}>
                  <ShoppingBag size={24} />
                </div>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "#4F46E5" }}>
                  {metrics.totalOrders}
                </div>
                <div style={{ fontSize: "0.85rem", color: "#6B7280", fontWeight: 600, marginTop: "4px" }}>
                  Total Orders
                </div>
                <div style={{ fontSize: "0.72rem", color: "#4F46E5", marginTop: "6px", fontWeight: 700 }}>
                  View All Orders →
                </div>
              </div>

              {/* Card 2: Delivered */}
              <div
                onClick={onBackToOrders}
                className="card"
                style={{
                  textAlign: "center",
                  padding: "20px 16px",
                  cursor: "pointer",
                  transition: "transform 0.15s, box-shadow 0.15s",
                  border: "1.5px solid #E5E7EB",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#22C55E"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E5E7EB"; }}
              >
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "6px", color: "#22C55E" }}>
                  <CheckCircle2 size={24} />
                </div>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "#22C55E" }}>
                  {metrics.deliveredOrders}
                </div>
                <div style={{ fontSize: "0.85rem", color: "#6B7280", fontWeight: 600, marginTop: "4px" }}>
                  Delivered
                </div>
                <div style={{ fontSize: "0.72rem", color: "#22C55E", marginTop: "6px", fontWeight: 700 }}>
                  View Orders →
                </div>
              </div>

              {/* Card 3: Pending */}
              <div
                onClick={onBackToOrders}
                className="card"
                style={{
                  textAlign: "center",
                  padding: "20px 16px",
                  cursor: "pointer",
                  transition: "transform 0.15s, box-shadow 0.15s",
                  border: "1.5px solid #E5E7EB",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#D97706"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E5E7EB"; }}
              >
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "6px", color: "#D97706" }}>
                  <Clock size={24} />
                </div>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "#D97706" }}>
                  {metrics.pendingOrders}
                </div>
                <div style={{ fontSize: "0.85rem", color: "#6B7280", fontWeight: 600, marginTop: "4px" }}>
                  Pending
                </div>
                <div style={{ fontSize: "0.72rem", color: "#D97706", marginTop: "6px", fontWeight: 700 }}>
                  View Pending →
                </div>
              </div>

              {/* Card 4: Total Sales */}
              <div
                onClick={onBackToOrders}
                className="card"
                style={{
                  textAlign: "center",
                  padding: "20px 16px",
                  cursor: "pointer",
                  transition: "transform 0.15s, box-shadow 0.15s",
                  border: "1.5px solid #E5E7EB",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#1E4D36"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E5E7EB"; }}
              >
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "6px", color: "#1E4D36" }}>
                  <TrendingUp size={24} />
                </div>
                <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#1E4D36" }}>
                  KSh {metrics.totalSales}
                </div>
                <div style={{ fontSize: "0.85rem", color: "#6B7280", fontWeight: 600, marginTop: "4px" }}>
                  Total Sales
                </div>
                <div style={{ fontSize: "0.72rem", color: "#1E4D36", marginTop: "6px", fontWeight: 700 }}>
                  View Orders →
                </div>
              </div>
            </div>

            {/* Top Items Breakdown */}
            <div className="card">
              <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#1F2937", marginBottom: "16px" }}>
                Top Ordered Items
              </h2>

              {metrics.topItems?.length === 0 ? (
                <div style={{ color: "#6B7280", fontSize: "0.875rem" }}>No item sales recorded yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {metrics.topItems?.map((item: any, idx: number) => (
                    <div
                      key={item.name}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 14px",
                        borderRadius: "8px",
                        background: "#F9FAFB",
                        border: "1px solid #F3F4F6",
                      }}
                    >
                      <span style={{ fontWeight: 600, color: "#1F2937" }}>
                        {idx + 1}. {item.name}
                      </span>
                      <span style={{ fontWeight: 800, color: "#1E4D36", background: "#EBF4F0", padding: "4px 10px", borderRadius: "999px", fontSize: "0.85rem" }}>
                        {item.count} sold
                      </span>
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
