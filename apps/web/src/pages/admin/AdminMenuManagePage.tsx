/**
 * Purpose: Admin Menu Catalog Management view.
 * Responsibilities: Allows admin to toggle product availability (which instantly broadcasts to all customer screens via WebSockets) and add new products.
 * Dependencies: React, apiGet helper, apiPatch helper, apiPost helper.
 * When to modify: When adding new product categories or editing product details.
 */

import React, { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api";
import { ArrowLeft, Plus, Trash2, Utensils } from "lucide-react";
import { Modal } from "../../components/Modal";

interface AdminMenuManagePageProps {
  token: string;
  onBackToOrders: () => void;
}

export const AdminMenuManagePage: React.FC<AdminMenuManagePageProps> = ({
  token,
  onBackToOrders,
}) => {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type?: "info" | "warning" | "danger" | "success" | "confirm";
    title: string;
    message: string;
    confirmText?: string;
    onConfirm: () => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // New Product Form State
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [category, setCategory] = useState("Meals");
  const [stockQty, setStockQty] = useState("10");
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Per-product inline stock editing state
  const [editingStock, setEditingStock] = useState<Record<string, string>>({});

  const fetchMenu = async () => {
    setLoading(true);
    const res = await apiGet<any[]>("/menu", token);
    if (res.success && res.data) {
      setProducts(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMenu();
  }, []);

  const handleToggleAvailability = async (productId: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    const res = await apiPatch<any>(`/menu/${productId}/availability`, { available: newStatus }, token);
    if (res.success && res.data) {
      setProducts((prev) => prev.map((p) => (p.id === productId ? res.data : p)));
    }
  };

  const handleDeleteProduct = (productId: string, productName: string) => {
    setModalConfig({
      isOpen: true,
      type: "danger",
      title: "Delete Item",
      message: `Are you sure you want to permanently delete "${productName}"?`,
      confirmText: "Delete",
      onCancel: () => setModalConfig((prev) => ({ ...prev, isOpen: false })),
      onConfirm: async () => {
        setModalConfig((prev) => ({ ...prev, isOpen: false }));
        const res = await apiDelete<any>(`/menu/${productId}`, token);
        if (res.success) {
          setProducts((prev) => prev.filter((p) => p.id !== productId));
        } else {
          setModalConfig({
            isOpen: true,
            type: "danger",
            title: "Delete Failed",
            message: res.error || "Failed to delete product.",
            confirmText: "Close",
            onConfirm: () => setModalConfig((prev) => ({ ...prev, isOpen: false })),
          });
        }
      },
    });
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !price || !imageUrl) return;

    setIsSubmitting(true);
    const res = await apiPost<any>(
      "/menu",
      {
        name,
        price: Number(price),
        imageUrl,
        category,
        available: true,
        stockQty: Number(stockQty) || 0,
      },
      token
    );
    setIsSubmitting(false);

    if (res.success && res.data) {
      setProducts((prev) => [...prev, res.data]);
      setName("");
      setPrice("");
      setImageUrl("");
      setStockQty("10");
      setShowAddForm(false);
    } else {
      setModalConfig({
        isOpen: true,
        type: "danger",
        title: "Add Product Failed",
        message: res.error || "Failed to create menu item. Please check fields and try again.",
        confirmText: "OK",
        onConfirm: () => setModalConfig((prev) => ({ ...prev, isOpen: false })),
      });
    }
  };

  const handleSetStock = async (productId: string, value: string) => {
    const qty = parseInt(value, 10);
    if (isNaN(qty) || qty < 0) return;
    const res = await apiPatch<any>(`/menu/${productId}/stock`, { stockQty: qty }, token);
    if (res.success && res.data) {
      setProducts((prev) => prev.map((p) => (p.id === productId ? res.data : p)));
    }
  };

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
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="header-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Utensils size={20} /> Wambu's Corner Hotel Catalog
          </div>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            background: "#22C55E",
            color: "white",
            border: "none",
            padding: "6px 12px",
            borderRadius: "6px",
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          {showAddForm ? "Close" : <><Plus size={16} /> Add Item</>}
        </button>
      </header>

      {/* Main Content */}
      <div style={{ padding: "20px" }}>
        {/* Add Product Form Modal / Section */}
        {showAddForm && (
          <div className="card" style={{ marginBottom: "20px", background: "#F9FAFB" }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#1E4D36", marginBottom: "12px" }}>
              Add New Menu Item
            </h2>
            <form onSubmit={handleAddProduct} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <input
                type="text"
                placeholder="Product Name (e.g. Mukimo)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
                required
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="input-field"
              >
                <option value="Meals">Meals</option>
                <option value="Sides">Sides</option>
                <option value="Beverages">Beverages</option>
              </select>
              <input
                type="number"
                placeholder="Price in KSh (e.g. 120)"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="input-field"
                required
              />
              <input
                type="url"
                placeholder="Image URL"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="input-field"
                required
              />
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>
                  Starting Stock (portions)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 20"
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                  className="input-field"
                />
              </div>
              <button type="submit" disabled={isSubmitting} className="btn btn-primary">
                {isSubmitting ? "Adding..." : "Save Product"}
              </button>
            </form>
          </div>
        )}

        {/* Product Catalog List */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#6B7280" }}>
            Loading menu catalog...
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "14px" }}>
            {products.map((item) => (
              <div
                key={item.id}
                className="card"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    style={{ width: "60px", height: "60px", borderRadius: "10px", objectFit: "cover" }}
                  />
                  <div>
                    <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#1F2937" }}>{item.name}</h3>
                    <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#1E4D36" }}>
                      KSh {item.price}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {/* Inline stock editor */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                    <label style={{ fontSize: "0.68rem", color: "#6B7280", fontWeight: 600 }}>Stock</label>
                    <input
                      type="number"
                      min="0"
                      value={editingStock[item.id] ?? item.stockQty ?? 0}
                      onChange={(e) => setEditingStock((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      onBlur={(e) => handleSetStock(item.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSetStock(item.id, (e.target as HTMLInputElement).value); }}
                      style={{ width: "56px", textAlign: "center", padding: "6px 4px", borderRadius: "6px", border: "1.5px solid #D1D5DB", fontSize: "0.9rem", fontWeight: 700 }}
                    />
                  </div>

                  <button
                    onClick={() => handleToggleAvailability(item.id, item.available)}
                    style={{ padding: "8px 12px", borderRadius: "8px", border: "none", fontWeight: 700, cursor: "pointer", fontSize: "0.8rem", background: item.available ? "#DCFCE7" : "#FEE2E2", color: item.available ? "#15803D" : "#DC2626" }}
                  >
                    {item.available ? "Available" : "Off"}
                  </button>

                  <button
                    onClick={() => handleDeleteProduct(item.id, item.name)}
                    title="Delete product"
                    style={{ padding: "8px", borderRadius: "8px", border: "none", background: "#FEE2E2", color: "#DC2626", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={modalConfig.isOpen}
        type={modalConfig.type}
        title={modalConfig.title}
        message={modalConfig.message}
        confirmText={modalConfig.confirmText}
        onConfirm={modalConfig.onConfirm}
        onCancel={modalConfig.onCancel}
      />
    </div>
  );
};
