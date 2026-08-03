import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "../../lib/api";
import { ArrowLeft, Plus, Trash2, Utensils, Upload, Edit, X } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";

interface AdminMenuManagePageProps {
    token: string;
    onBackToOrders: () => void;
}

const MEAL_CATEGORY_OPTIONS: { value: string; label: string }[] = [
    { value: "BREAKFAST", label: "Breakfast" },
    { value: "LUNCH", label: "Lunch" },
    { value: "DINNER", label: "Dinner" },
    { value: "DRINKS", label: "Drinks" },
    { value: "OTHER", label: "Other" },
];

/**
 * A product can belong to several meal times. OTHER is the explicit
 * "not a meal time" catch-all and is mutually exclusive with the meal times.
 */
function MealCategoryPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
    const toggle = (option: string) => {
        if (option === "OTHER") {
            onChange(["OTHER"]);
            return;
        }
        const mealTimes = value.filter((v) => v !== "OTHER");
        const next = mealTimes.includes(option) ? mealTimes.filter((v) => v !== option) : [...mealTimes, option];
        onChange(next.length === 0 ? ["OTHER"] : next);
    };

    return (
        <div className="grid grid-cols-2 gap-2">
            {MEAL_CATEGORY_OPTIONS.map((opt) => {
                const active = value.includes(opt.value);
                return (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggle(opt.value)}
                        className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-colors ${
                            active ? "border-[#114B36] bg-[#EBF5F0] text-[#114B36]" : "border-[#D1D5DB] bg-white text-[#6B7280]"
                        }`}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

export const AdminMenuManagePage: React.FC<AdminMenuManagePageProps> = ({
    token,
    onBackToOrders,
}) => {
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        type?: "info" | "warning" | "danger" | "success" | "confirm";
        title: string;
        message: string;
        primaryAction?: { label: string; onClick: () => void; variant?: "primary" | "danger" };
        secondaryAction?: { label: string; onClick: () => void };
    }>({
        isOpen: false,
        title: "",
        message: "",
    });

    const [name, setName] = useState("");
    const [price, setPrice] = useState("");
    const [imageUrl, setImageUrl] = useState("");
    const [category, setCategory] = useState("Meals");
    const [mealCategories, setMealCategories] = useState<string[]>(["OTHER"]);
    const [stockQty, setStockQty] = useState("10");
    const productImageFileRef = useRef<HTMLInputElement>(null);
    const editImageFileRef = useRef<HTMLInputElement>(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingStock, setEditingStock] = useState<Record<string, string>>({});

    const [editingItem, setEditingItem] = useState<{
        id: string;
        name: string;
        price: string;
        imageUrl: string;
        category: string;
        mealCategories: string[];
        available: boolean;
        stockQty: string;
    } | null>(null);
    const [editIsSubmitting, setEditIsSubmitting] = useState(false);
    const [editingImageFile, setEditingImageFile] = useState<File | null>(null);
    const [editingImagePreview, setEditingImagePreview] = useState<string | null>(null);

    const getFreshnessText = (item: any) => {
      if (item.lastRestockedAt) {
        const diffMs = Date.now() - new Date(item.lastRestockedAt).getTime();
        const diffH = Math.floor(diffMs / (1000 * 60 * 60));
        const diffM = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        if (diffH > 0) return `Restocked ${diffH}h ${diffM} ago`;
        return `Restocked ${diffM}m ago`;
      }
      if (item.outOfStockSince) {
        const diffMs = Date.now() - new Date(item.outOfStockSince).getTime();
        const diffH = Math.floor(diffMs / (1000 * 60 * 60));
        const diffM = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        if (diffH > 0) return `Out of stock ${diffH}h ${diffM}`;
        return `Out of stock ${diffM}m`;
      }
      return null;
    };

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
            primaryAction: { label: "Delete", onClick: async () => {
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
                        primaryAction: { label: "Close", onClick: () => setModalConfig((prev) => ({ ...prev, isOpen: false })) },
                    });
                }
            }, variant: "danger" },
            secondaryAction: { label: "Cancel", onClick: () => setModalConfig((prev) => ({ ...prev, isOpen: false })) },
        });
    };

    const handleAddProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !price || !imageUrl) return;

        setIsSubmitting(true);
        const res = await apiPost<any>("/menu", { name, price: Number(price), imageUrl, category, mealCategories, available: true, stockQty: Number(stockQty) || 0 }, token);
        setIsSubmitting(false);

        if (res.success && res.data) {
            setProducts((prev) => [...prev, res.data]);
            setName(""); setPrice(""); setImageUrl(""); setStockQty("10");
            setMealCategories(["OTHER"]);
            setShowAddForm(false);
        } else {
            setModalConfig({
                isOpen: true, type: "danger", title: "Add Product Failed",
                message: res.error || "Failed to create menu item.",
                primaryAction: { label: "OK", onClick: () => setModalConfig((prev) => ({ ...prev, isOpen: false })) },
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

    const handleEditProduct = (item: any) => {
        setEditingItem({
            id: item.id,
            name: item.name,
            price: String(item.price),
            imageUrl: item.imageUrl,
            category: item.category || "Meals",
            mealCategories: item.mealCategories?.length ? item.mealCategories : ["OTHER"],
            available: item.available,
            stockQty: String(item.stockQty ?? 0),
        });
        setEditingImageFile(null);
        setEditingImagePreview(null);
    };

    const handleSubmitEdit = async () => {
        if (!editingItem) return;
        setEditIsSubmitting(true);
        let imageUrl = editingItem.imageUrl;
        if (editingImageFile) {
            const upload = await apiUpload<{ url: string }>("/upload", editingImageFile, token);
            if (!upload.success || !upload.data?.url) {
                setEditIsSubmitting(false);
                setModalConfig({
                    isOpen: true, type: "danger", title: "Image Upload Failed",
                    message: upload.error || "The image could not be uploaded. Your menu item was not changed.",
                    primaryAction: { label: "OK", onClick: () => setModalConfig((prev) => ({ ...prev, isOpen: false })) },
                });
                return;
            }
            imageUrl = upload.data.url;
        }
        const res = await apiPatch<any>(`/menu/${editingItem.id}`, {
            name: editingItem.name,
            price: Number(editingItem.price),
            imageUrl,
            category: editingItem.category,
            mealCategories: editingItem.mealCategories,
        }, token);
        setEditIsSubmitting(false);
        if (res.success && res.data) {
            setProducts((prev) => prev.map((p) => (p.id === editingItem.id ? res.data : p)));
            setEditingItem(null);
            if (editingImagePreview) URL.revokeObjectURL(editingImagePreview);
            setEditingImagePreview(null);
            setEditingImageFile(null);
        } else {
            setModalConfig({
                isOpen: true, type: "danger", title: "Edit Failed",
                message: res.error || "Failed to update menu item.",
                primaryAction: { label: "OK", onClick: () => setModalConfig((prev) => ({ ...prev, isOpen: false })) },
            });
        }
    };

    const handleCancelEdit = () => {
        if (editingImagePreview) URL.revokeObjectURL(editingImagePreview);
        setEditingImagePreview(null);
        setEditingImageFile(null);
        setEditingItem(null);
    };

    return (
        <div className="admin-container">
            <header className="bg-[#114B36] text-white px-4 py-3 sticky top-0 z-40 shadow-[0_2px_8px_rgba(17,75,54,0.15)]">
                <div className="flex items-center justify-between max-w-4xl mx-auto">
                    <div className="flex items-center gap-3">
                        <button onClick={onBackToOrders} className="p-1 -ml-1 rounded-lg hover:bg-white/10 transition-colors bg-none border-none cursor-pointer text-white">
                            <ArrowLeft size={20} />
                        </button>
                        <h1 className="font-bold text-lg flex items-center gap-2">
                            <Utensils size={20} /> Menu
                        </h1>
                    </div>
                    <button onClick={() => setShowAddForm(!showAddForm)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/15 text-white text-sm font-bold border border-white/20 cursor-pointer hover:bg-white/25 transition-colors bg-none"
                    >
                        {showAddForm ? <X size={16} /> : <Plus size={16} />}
                        {showAddForm ? "Close" : "Add Item"}
                    </button>
                </div>
            </header>

            <div className="p-4 max-w-4xl mx-auto space-y-4">
                <AnimatePresence>
                    {showAddForm && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                            className="bg-[#F9FAFB] rounded-2xl border border-[#E5E7EB] overflow-hidden"
                        >
                            <form onSubmit={handleAddProduct} className="p-4 space-y-3">
                                <h2 className="font-bold text-base text-[#114B36]">Add New Menu Item</h2>
                                <input type="text" placeholder="Product Name (e.g. Mukimo)" value={name} onChange={(e) => setName(e.target.value)} required
                                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#D1D5DB] outline-none text-sm focus:border-[#114B36] focus:ring-3 focus:ring-[rgba(17,75,54,0.1)]"
                                />
                                <select value={category} onChange={(e) => setCategory(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#D1D5DB] outline-none text-sm bg-white focus:border-[#114B36] focus:ring-3 focus:ring-[rgba(17,75,54,0.1)]"
                                >
                                    <option value="Meals">Meals</option>
                                    <option value="Sides">Sides</option>
                                    <option value="Desserts">Desserts</option>
                                    <option value="Snacks">Snacks</option>
                                    <option value="Beverages">Beverages</option>
                                </select>
                                <div>
                                    <label className="block text-xs font-semibold text-[#374151] mb-1">Meal Times (select all that apply)</label>
                                    <MealCategoryPicker value={mealCategories} onChange={setMealCategories} />
                                </div>
                                <input type="number" placeholder="Price in KSh (e.g. 120)" value={price} onChange={(e) => setPrice(e.target.value)} required
                                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#D1D5DB] outline-none text-sm focus:border-[#114B36] focus:ring-3 focus:ring-[rgba(17,75,54,0.1)]"
                                />
                                <div>
                                    <label className="block text-xs font-semibold text-[#374151] mb-1">Product Image</label>
                                    <div className="space-y-2">
                                        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            const upload = await apiUpload<{ url: string }>("/upload", file, token);
                                            if (upload.success && upload.data?.url) setImageUrl(upload.data.url);
                                            else setModalConfig({ isOpen: true, type: "danger", title: "Image Upload Failed", message: upload.error || "Please try another image.", primaryAction: { label: "OK", onClick: () => setModalConfig((prev) => ({ ...prev, isOpen: false })) } });
                                        }} disabled={isSubmitting} ref={productImageFileRef} className="hidden" />
                                        <Button type="button" variant="secondary" size="sm" icon={<Upload size={13} />} onClick={() => productImageFileRef.current?.click()} disabled={isSubmitting}>
                                            Upload Image
                                        </Button>
                                        <input type="url" placeholder="or enter Web Image URL" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} required
                                            className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#D1D5DB] outline-none text-sm focus:border-[#114B36] focus:ring-3 focus:ring-[rgba(17,75,54,0.1)]"
                                        />
                                    </div>
                                    {imageUrl && (
                                        <div className="flex items-center gap-2.5 mt-2">
                                            <img src={imageUrl} alt="Preview" className="w-12 h-12 rounded-xl object-cover" />
                                            <span className="text-xs font-semibold text-[#16A34A]">✓ Image ready</span>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-[#374151] mb-1">Starting Stock (portions)</label>
                                    <input type="number" min="0" placeholder="e.g. 20" value={stockQty} onChange={(e) => setStockQty(e.target.value)}
                                        className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#D1D5DB] outline-none text-sm focus:border-[#114B36] focus:ring-3 focus:ring-[rgba(17,75,54,0.1)]"
                                    />
                                </div>
                                <Button type="submit" disabled={isSubmitting || !name || !price || !imageUrl} loading={isSubmitting} fullWidth>
                                    Save Product
                                </Button>
                            </form>
                        </motion.div>
                    )}
                </AnimatePresence>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="w-8 h-8 border-4 border-[#E5E7EB] border-t-[#114B36] rounded-full animate-spin" />
                    </div>
                ) : products.length === 0 ? (
                    <div className="text-center py-16 text-sm text-[#6B7280]">No menu items yet.</div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {products.map((item) => (
                            <div key={item.id} className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(17,75,54,0.06)] flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <img src={item.imageUrl} alt={item.name} className="w-14 h-14 rounded-xl object-cover shrink-0" />
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-sm text-[#1F2937] truncate">{item.name}</h3>
                                        <p className="font-bold text-sm text-[#114B36]">KSh {item.price}</p>
                                        <span className="mt-1 inline-block rounded-full bg-[#EBF5F0] px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-wide text-[#114B36]">{(item.mealCategories || ["OTHER"]).map((mc: string) => mc.replace("_", " ")).join(" · ")}</span>
                                        {getFreshnessText(item) && (
                                            <p className="text-[0.6rem] font-semibold text-[#6B7280] mt-0.5">{getFreshnessText(item)}</p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                    <div className="flex flex-col items-center gap-0.5">
                                        <span className="text-[0.55rem] font-semibold text-[#6B7280]">Stock</span>
                                        <input type="number" min="0"
                                            value={editingStock[item.id] ?? item.stockQty ?? 0}
                                            onChange={(e) => setEditingStock((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                            onBlur={(e) => handleSetStock(item.id, e.target.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter") handleSetStock(item.id, (e.target as HTMLInputElement).value); }}
                                            className="w-14 text-center py-1.5 rounded-lg border-2 border-[#D1D5DB] text-sm font-bold outline-none focus:border-[#114B36]"
                                        />
                                    </div>
                                    <button onClick={() => handleToggleAvailability(item.id, item.available)}
                                        className={`px-3 py-1.5 rounded-lg text-[0.65rem] font-bold border-none cursor-pointer transition-colors ${
                                            item.available ? "bg-[#DCFCE7] text-[#15803D] hover:bg-[#BBF7D0]" : "bg-[#FEE2E2] text-[#DC2626] hover:bg-[#FECACA]"
                                        }`}
                                    >
                                        {item.available ? "Avail" : "Off"}
                                    </button>
                                    <button onClick={() => handleEditProduct(item)}
                                        className="p-1.5 rounded-lg bg-[#EFF6FF] text-[#2563EB] border-none cursor-pointer hover:bg-[#DBEAFE] transition-colors"
                                        title="Edit"
                                    >
                                        <Edit size={14} />
                                    </button>
                                    <button onClick={() => handleDeleteProduct(item.id, item.name)}
                                        className="p-1.5 rounded-lg bg-[#FEE2E2] text-[#DC2626] border-none cursor-pointer hover:bg-[#FECACA] transition-colors"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <Modal isOpen={modalConfig.isOpen} onClose={() => setModalConfig((prev) => ({ ...prev, isOpen: false }))}
                type={modalConfig.type} title={modalConfig.title} message={modalConfig.message}
                primaryAction={modalConfig.primaryAction} secondaryAction={modalConfig.secondaryAction}
            />
            <Modal
                isOpen={Boolean(editingItem)}
                onClose={handleCancelEdit}
                type="info"
                title="Edit menu item"
                primaryAction={{ label: "Save changes", onClick: () => void handleSubmitEdit(), loading: editIsSubmitting }}
                secondaryAction={{ label: "Cancel", onClick: handleCancelEdit }}
            >
                {editingItem && <div className="space-y-3">
                    <input value={editingItem.name} onChange={(event) => setEditingItem({ ...editingItem, name: event.target.value })} placeholder="Item name" className="w-full rounded-xl border-2 border-[#D1D5DB] px-3 py-2.5 text-sm outline-none focus:border-[#114B36]" />
                    <input type="number" min="0" value={editingItem.price} onChange={(event) => setEditingItem({ ...editingItem, price: event.target.value })} placeholder="Price" className="w-full rounded-xl border-2 border-[#D1D5DB] px-3 py-2.5 text-sm outline-none focus:border-[#114B36]" />
                    <input value={editingItem.category} onChange={(event) => setEditingItem({ ...editingItem, category: event.target.value })} placeholder="Category" className="w-full rounded-xl border-2 border-[#D1D5DB] px-3 py-2.5 text-sm outline-none focus:border-[#114B36]" />
                    <div>
                        <label className="block text-xs font-semibold text-[#374151] mb-1">Meal Times (select all that apply)</label>
                        <MealCategoryPicker value={editingItem.mealCategories} onChange={(next) => setEditingItem({ ...editingItem, mealCategories: next })} />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-xs font-semibold text-[#374151]">Menu image</label>
                        <input ref={editImageFileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            if (editingImagePreview) URL.revokeObjectURL(editingImagePreview);
                            setEditingImageFile(file);
                            setEditingImagePreview(URL.createObjectURL(file));
                        }} />
                        <div className="flex items-center gap-3">
                            <img src={editingImagePreview || editingItem.imageUrl} alt="Menu image preview" className="h-16 w-16 rounded-xl border border-[#E5E7EB] object-cover" />
                            <Button type="button" variant="secondary" size="sm" icon={<Upload size={13} />} onClick={() => editImageFileRef.current?.click()} disabled={editIsSubmitting}>Choose image</Button>
                        </div>
                        <p className="text-xs text-[#6B7280]">PNG, JPEG, or WEBP. Preview first; the file uploads when you save changes.</p>
                        <input value={editingItem.imageUrl} onChange={(event) => { setEditingImageFile(null); if (editingImagePreview) URL.revokeObjectURL(editingImagePreview); setEditingImagePreview(null); setEditingItem({ ...editingItem, imageUrl: event.target.value }); }} placeholder="or enter image URL" className="w-full rounded-xl border-2 border-[#D1D5DB] px-3 py-2.5 text-sm outline-none focus:border-[#114B36]" />
                    </div>
                </div>}
            </Modal>
        </div>
    );
};
