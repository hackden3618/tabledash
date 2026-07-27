import React from "react";
import { LayoutDashboard, ShoppingBag, Utensils, Settings, Calendar } from "lucide-react";

export type AdminTab = "orders" | "dashboard" | "menu" | "settings" | "history";

interface AdminBottomNavBarProps {
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
}

export const AdminBottomNavBar: React.FC<AdminBottomNavBarProps> = ({
  activeTab,
  onSelectTab,
}) => {
  const tabs: { key: AdminTab; label: string; icon: React.ReactNode }[] = [
    { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
    { key: "menu", label: "Menu", icon: <Utensils size={20} /> },
    { key: "orders", label: "Orders", icon: <ShoppingBag size={24} /> },
    { key: "settings", label: "Settings", icon: <Settings size={20} /> },
    { key: "history", label: "History", icon: <Calendar size={20} /> },
  ];

  return (
    <nav className="admin-bottom-nav">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={`admin-nav-item ${activeTab === tab.key ? "active" : ""} ${tab.key === "orders" ? "admin-nav-highlight" : ""}`}
          onClick={() => onSelectTab(tab.key)}
        >
          <div className={`admin-nav-icon-wrap ${tab.key === "orders" ? "admin-nav-highlight-icon" : ""}`}>
            {tab.icon}
          </div>
          <span className="admin-nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
};
