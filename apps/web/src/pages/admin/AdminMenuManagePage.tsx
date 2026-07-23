/**
 * Purpose: Admin Menu Catalog Management view.
 * Responsibilities: Allows admin to toggle product availability (which instantly broadcasts to all customer screens via WebSockets) and add new products.
 * Dependencies: React, apiGet helper, apiPatch helper, apiPost helper.
 * When to modify: When adding new product categories or editing product details.
 */

import React, { useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost } from "../../lib/api";

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

  // New Product Form State
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [category, setCategory] = useState("Meals");
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      },
      token
    );
    setIsSubmitting(false);

    if (res.success && res.data) {
      setProducts((prev) => [...prev, res.data]);
      setName("");
      setPrice("");
      setImageUrl("");
      setShowAddForm(false);
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
              fontSize: "1.2rem",
              cursor: "pointer",
            }}
          >
            ←
          </button>
          <div className="header-title">🍲 Manage Menu Catalog</div>
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
          }}
        >
          {showAddForm ? "Close" : "+ Add Item"}
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

                <button
                  onClick={() => handleToggleAvailability(item.id, item.available)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    border: "none",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: item.available ? "#DCFCE7" : "#FEE2E2",
                    color: item.available ? "#15803D" : "#DC2626",
                  }}
                >
                  {item.available ? "Available" : "Sold Out"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
