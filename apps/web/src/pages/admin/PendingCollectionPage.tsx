import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiGet, apiPatch } from "../../lib/api";
import { ArrowLeft, UtensilsCrossed, CreditCard, CheckCircle2, Phone, MapPin, Undo2 } from "lucide-react";
import { Button } from "../../components/ui/Button";

interface PendingItem {
    id: string;
    orderNumber: number;
    totalAmount: number;
    amountPaid: number;
    paymentStatus: string;
    paymentOutstanding: boolean;
    utensilsOutstanding: boolean;
    outstandingAmount: number;
    utensilsIssued: boolean;
    utensilsReturnedAt: string | null;
    customer: {
        id: string;
        accountId: string;
        firstName: string;
        lastName: string | null;
        knownName: string | null;
        phone: string;
    } | null;
    orderedAt: string;
    marketSection: string | null;
    locationDescription: string | null;
    stallNumber: string | null;
}

interface RefundItem {
    id: string;
    orderNumber: number;
    status: string;
    totalAmount: number;
    amountPaid: number;
    paymentStatus: string;
    paid: number;
    refunded: number;
    refundOwed: number;
    cancelledAtStatus: string | null;
    cancelReason: string | null;
    refundedAt: string | null;
    customer: {
        id: string;
        accountId: string;
        firstName: string;
        lastName: string | null;
        knownName: string | null;
        phone: string;
    } | null;
    orderItems: any[];
    orderedAt: string;
    marketSection: string | null;
    locationDescription: string | null;
    stallNumber: string | null;
}

interface PendingCollectionPageProps {
    token: string;
    onBack: () => void;
    onOpenOrder: (order: PendingItem | RefundItem) => void;
}

type Tab = "collections" | "refunds";

export const PendingCollectionPage: React.FC<PendingCollectionPageProps> = ({ token, onBack, onOpenOrder }) => {
    const [items, setItems] = useState<PendingItem[]>([]);
    const [refunds, setRefunds] = useState<RefundItem[]>([]);
    const [activeTab, setActiveTab] = useState<Tab>("collections");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [returningId, setReturningId] = useState<string | null>(null);

    const fetchPending = async () => {
        setLoading(true);
        const [collectionsRes, refundsRes] = await Promise.all([
            apiGet<PendingItem[]>("/orders/pending-collection", token),
            apiGet<RefundItem[]>("/orders/refunds-owed", token),
        ]);
        if (collectionsRes.success && collectionsRes.data) {
            setItems(collectionsRes.data);
            setError(null);
        } else {
            setError(collectionsRes.error ?? "Could not load pending collections.");
        }
        if (refundsRes.success && refundsRes.data) {
            setRefunds(refundsRes.data);
        }
        setLoading(false);
    };

    useEffect(() => {
        void fetchPending();
    }, [token]);

    const handleConfirmReturned = async (item: PendingItem) => {
        setReturningId(item.id);
        const res = await apiPatch<any>(`/orders/${item.id}/utensils-returned`, {}, token);
        setReturningId(null);
        if (res.success && res.data) {
            void fetchPending();
        } else {
            setError(res.error ?? "Could not confirm utensil return.");
        }
    };

    const formatKsh = (amount: number) =>
        `KSh ${amount.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

    const counts = {
        payments: items.filter((i) => i.paymentOutstanding).length,
        utensils: items.filter((i) => i.utensilsOutstanding).length,
        refunds: refunds.length,
    };

    return (
        <div className="admin-container">
            <header className="bg-[#114B36] text-white px-4 py-3 sticky top-0 z-40 shadow-[0_2px_8px_rgba(17,75,54,0.15)]">
                <div className="flex items-center gap-3 max-w-4xl mx-auto">
                    <button
                        onClick={onBack}
                        className="p-1 -ml-1 rounded-lg hover:bg-white/10 transition-colors bg-none border-none cursor-pointer text-white"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="font-bold text-lg">Collections & Refunds</h1>
                </div>
            </header>

            <div className="p-4 max-w-4xl mx-auto">
                <div className="flex gap-2 mb-5">
                    <button
                        onClick={() => setActiveTab("collections")}
                        className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors cursor-pointer ${activeTab === "collections" ? "bg-[#114B36] text-white" : "bg-white text-[#6B7280] border border-[#E5E7EB]"}`}
                    >
                        Collections {counts.payments + counts.utensils > 0 ? `(${counts.payments + counts.utensils})` : ""}
                    </button>
                    <button
                        onClick={() => setActiveTab("refunds")}
                        className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors cursor-pointer ${activeTab === "refunds" ? "bg-[#DC2626] text-white" : "bg-white text-[#6B7280] border border-[#E5E7EB]"}`}
                    >
                        Refunds Owed {counts.refunds > 0 ? `(${counts.refunds})` : ""}
                    </button>
                </div>

                {activeTab === "collections" ? (
                    <CollectionsTab
                        items={items}
                        loading={loading}
                        error={error}
                        counts={counts}
                        returningId={returningId}
                        formatKsh={formatKsh}
                        onConfirmReturned={(item) => void handleConfirmReturned(item)}
                        onOpenOrder={onOpenOrder}
                        onRefresh={() => void fetchPending()}
                    />
                ) : (
                    <RefundsTab
                        refunds={refunds}
                        loading={loading}
                        error={error}
                        formatKsh={formatKsh}
                        onOpenOrder={onOpenOrder}
                        onRefresh={() => void fetchPending()}
                    />
                )}
            </div>
        </div>
    );
};

function CollectionsTab({
    items,
    loading,
    error,
    counts,
    returningId,
    formatKsh,
    onConfirmReturned,
    onOpenOrder,
    onRefresh,
}: {
    items: PendingItem[];
    loading: boolean;
    error: string | null;
    counts: { payments: number; utensils: number };
    returningId: string | null;
    formatKsh: (amount: number) => string;
    onConfirmReturned: (item: PendingItem) => void;
    onOpenOrder: (order: PendingItem | RefundItem) => void;
    onRefresh: () => void;
}) {
    return (
        <>
            <div className="flex items-center gap-3 mb-5 flex-wrap">
                <div className="flex items-center gap-2 bg-[#FEE2E2] rounded-xl px-3.5 py-2.5">
                    <CreditCard size={18} className="text-[#DC2626]" />
                    <span className="text-sm font-bold text-[#DC2626]">{counts.payments} unpaid</span>
                </div>
                <div className="flex items-center gap-2 bg-[#FEF3C7] rounded-xl px-3.5 py-2.5">
                    <UtensilsCrossed size={18} className="text-[#D97706]" />
                    <span className="text-sm font-bold text-[#D97706]">{counts.utensils} unreturned</span>
                </div>
                <button
                    onClick={onRefresh}
                    className="ml-auto text-xs font-semibold text-[#6B7280] hover:text-[#114B36] transition-colors bg-none border-none cursor-pointer"
                >
                    Refresh
                </button>
            </div>

            {error && (
                <div className="bg-[#FEE2E2] border border-[#FECACA] rounded-xl px-4 py-3 mb-4 text-sm font-semibold text-[#DC2626]">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="text-center py-16">
                    <div className="w-10 h-10 border-4 border-[#E5E7EB] border-t-[#114B36] rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-[#6B7280]">Loading pending collections...</p>
                </div>
            ) : items.length === 0 ? (
                <div className="text-center py-16 text-sm text-[#6B7280] bg-white rounded-2xl shadow-[0_2px_8px_rgba(17,75,54,0.06)]">
                    <CheckCircle2 size={40} className="mx-auto mb-3 text-[#22C55E]" />
                    <p className="font-semibold">All caught up!</p>
                    <p className="text-[#9CA3AF] mt-1">No outstanding payments or unreturned utensils.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {items.map((item, idx) => (
                        <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.03 }}
                            className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(17,75,54,0.06)]"
                        >
                            <div className="flex items-start justify-between mb-2">
                                <div>
                                    <span className="font-extrabold text-base text-[#114B36]">#{item.orderNumber}</span>
                                    <span className="text-[0.65rem] text-[#6B7280] ml-2">
                                        {new Date(item.orderedAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                </div>
                                <div className="flex gap-1.5">
                                    {item.paymentOutstanding && (
                                        <span className="text-[0.6rem] font-bold px-2 py-0.5 rounded-full bg-[#FEE2E2] text-[#DC2626]">OWES {formatKsh(item.outstandingAmount)}</span>
                                    )}
                                    {item.utensilsOutstanding && (
                                        <span className="text-[0.6rem] font-bold px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#D97706]">UTENSILS OUT</span>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-full bg-[#EBF5F0] flex items-center justify-center text-[#114B36] font-bold text-sm shrink-0">
                                    {item.customer?.firstName?.[0] || "?"}
                                </div>
                                <div>
                                    <p className="font-bold text-sm text-[#1F2937]">
                                        {item.customer?.knownName || item.customer?.firstName || "Unknown customer"}
                                    </p>
                                    <p className="text-xs text-[#6B7280] flex items-center gap-1">
                                        <Phone size={10} /> {item.customer?.phone}
                                        {item.customer?.accountId ? <span className="text-[#9CA3AF]"> · {item.customer.accountId}</span> : null}
                                    </p>
                                </div>
                            </div>

                            <p className="text-xs text-[#4B5563] mb-2 flex items-center gap-1">
                                <MapPin size={12} className="shrink-0" />
                                {item.marketSection || "—"}{item.locationDescription ? ` — ${item.locationDescription}` : ""}{item.stallNumber ? ` (Stall ${item.stallNumber})` : ""}
                            </p>

                            <div className="flex justify-between items-center flex-wrap gap-2 border-t border-[#F3F4F6] pt-3">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm text-[#1F2937]">KSh {item.totalAmount}</span>
                                    <span className="text-[#D1D5DB]">|</span>
                                    <span className="text-[0.65rem] text-[#6B7280]">
                                        {item.paymentStatus === "PAID" ? "Paid in full" : `${formatKsh(item.amountPaid)} collected`}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {item.utensilsOutstanding && (
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            disabled={returningId === item.id}
                                            onClick={() => onConfirmReturned(item)}
                                        >
                                            <UtensilsCrossed size={12} /> Confirm Returned
                                        </Button>
                                    )}
                                    {item.paymentOutstanding && (
                                        <Button size="sm" variant="primary" onClick={() => onOpenOrder(item)}>
                                            <CreditCard size={12} /> Record Payment
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </>
    );
}

function RefundsTab({
    refunds,
    loading,
    error,
    formatKsh,
    onOpenOrder,
    onRefresh,
}: {
    refunds: RefundItem[];
    loading: boolean;
    error: string | null;
    formatKsh: (amount: number) => string;
    onOpenOrder: (order: PendingItem | RefundItem) => void;
    onRefresh: () => void;
}) {
    return (
        <>
            <div className="flex items-center gap-2 mb-5 flex-wrap">
                <div className="flex items-center gap-2 bg-[#EDE9FE] rounded-xl px-3.5 py-2.5">
                    <Undo2 size={18} className="text-[#7C3AED]" />
                    <span className="text-sm font-bold text-[#7C3AED]">{refunds.length} awaiting refund</span>
                </div>
                <button
                    onClick={onRefresh}
                    className="ml-auto text-xs font-semibold text-[#6B7280] hover:text-[#DC2626] transition-colors bg-none border-none cursor-pointer"
                >
                    Refresh
                </button>
            </div>

            {error && (
                <div className="bg-[#FEE2E2] border border-[#FECACA] rounded-xl px-4 py-3 mb-4 text-sm font-semibold text-[#DC2626]">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="text-center py-16">
                    <div className="w-10 h-10 border-4 border-[#E5E7EB] border-t-[#7C3AED] rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-[#6B7280]">Loading refunds owed...</p>
                </div>
            ) : refunds.length === 0 ? (
                <div className="text-center py-16 text-sm text-[#6B7280] bg-white rounded-2xl shadow-[0_2px_8px_rgba(17,75,54,0.06)]">
                    <CheckCircle2 size={40} className="mx-auto mb-3 text-[#22C55E]" />
                    <p className="font-semibold">No refunds outstanding</p>
                    <p className="text-[#9CA3AF] mt-1">Every cancelled order has been fully refunded.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {refunds.map((item, idx) => (
                        <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.03 }}
                            className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(17,75,54,0.06)]"
                        >
                            <div className="flex items-start justify-between mb-2">
                                <div>
                                    <span className="font-extrabold text-base text-[#DC2626]">#{item.orderNumber}</span>
                                    <span className="text-[0.65rem] text-[#6B7280] ml-2">
                                        {new Date(item.orderedAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                </div>
                                <span className="text-[0.6rem] font-bold px-2 py-0.5 rounded-full bg-[#EDE9FE] text-[#7C3AED]">
                                    REFUND {formatKsh(item.refundOwed)}
                                </span>
                            </div>

                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-full bg-[#F5F0FF] flex items-center justify-center text-[#7C3AED] font-bold text-sm shrink-0">
                                    {item.customer?.firstName?.[0] || "?"}
                                </div>
                                <div>
                                    <p className="font-bold text-sm text-[#1F2937]">
                                        {item.customer?.knownName || item.customer?.firstName || "Unknown customer"}
                                    </p>
                                    <p className="text-xs text-[#6B7280] flex items-center gap-1">
                                        <Phone size={10} /> {item.customer?.phone}
                                        {item.customer?.accountId ? <span className="text-[#9CA3AF]"> · {item.customer.accountId}</span> : null}
                                    </p>
                                </div>
                            </div>

                            {item.cancelReason && (
                                <p className="text-xs text-[#6B7280] mb-2">
                                    <span className="font-semibold">Cancelled:</span> &ldquo;{item.cancelReason}&rdquo;
                                </p>
                            )}

                            <div className="flex justify-between items-center flex-wrap gap-2 border-t border-[#F3F4F6] pt-3">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm text-[#1F2937]">{formatKsh(item.totalAmount)} charged</span>
                                    <span className="text-[#D1D5DB]">|</span>
                                    <span className="text-[0.65rem] text-[#6B7280]">
                                        {formatKsh(item.paid)} collected{item.refunded > 0 ? ` · ${formatKsh(item.refunded)} already refunded` : ""}
                                    </span>
                                </div>
                                <Button size="sm" variant="danger" onClick={() => onOpenOrder(item)}>
                                    <Undo2 size={12} /> Process Refund
                                </Button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </>
    );
}
