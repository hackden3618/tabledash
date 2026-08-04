import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Landmark, ShoppingBag, CreditCard, RotateCcw, AlertTriangle } from "lucide-react";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { apiGet } from "../../lib/api";
import { Header } from "../../components/ui/Header";
import { PageTransition } from "../../components/ui/PageTransition";
import { Skeleton } from "../../components/ui/Skeleton";

interface SalesRecord {
  id: string;
  type: "ORDER_CHARGE" | "ORDER_PAYMENT" | "REFUND" | "ADJUSTMENT";
  paymentMethod: "CASH" | "MPESA" | "CREDIT";
  amount: number;
  note: string | null;
  orderNumber: number | null;
  createdAt: string;
}

interface HotelWalletData {
  hotelId: string;
  hotelName: string;
  account: { totalOwed: number; totalPaid: number; status: "DUE" | "SETTLED" | "CREDIT" };
  pendingRefunds: { orderId: string; orderNumber: number; amount: number; orderedAt: string }[];
  salesRecords: SalesRecord[];
}

interface WalletHotelDetailPageProps {
  hotelId: string;
  hotelName: string;
  onBack: () => void;
}

export const WalletHotelDetailPage: React.FC<WalletHotelDetailPageProps> = ({ hotelId, hotelName, onBack }) => {
  const { token } = useCustomerAuth();
  const [data, setData] = useState<HotelWalletData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetail = async () => {
      setLoading(true);
      const res = await apiGet<HotelWalletData>(`/finance/wallet/${hotelId}`, token || undefined);
      if (res.success && res.data) setData(res.data);
      setLoading(false);
    };
    void fetchDetail();
  }, [hotelId, token]);

  const formatKsh = (amount: number) =>
    `KSh ${Math.abs(amount).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  const recordIcon = (type: string) => {
    switch (type) {
      case "ORDER_CHARGE": return <ShoppingBag size={16} className="text-[#F59E0B]" />;
      case "ORDER_PAYMENT": return <CreditCard size={16} className="text-[#22C55E]" />;
      case "REFUND": return <RotateCcw size={16} className="text-[#EF4444]" />;
      case "ADJUSTMENT": return <AlertTriangle size={16} className="text-[#F59E0B]" />;
      default: return <CreditCard size={16} className="text-[#6B7280]" />;
    }
  };

  const recordLabel = (r: SalesRecord) => {
    const orderTag = r.orderNumber ? `#${r.orderNumber}` : "";
    switch (r.type) {
      case "ORDER_CHARGE": return `Order ${orderTag} charged`;
      case "ORDER_PAYMENT": return `Payment received${orderTag ? ` — Order ${orderTag}` : ""}`;
      case "REFUND": return `Refund${orderTag ? ` — Order ${orderTag}` : ""}`;
      case "ADJUSTMENT": return `Adjustment${r.note ? `: ${r.note}` : ""}`;
      default: return "Transaction";
    }
  };

  const balance = data ? Number(data.account.totalOwed) - Number(data.account.totalPaid) : 0;

  return (
    <div className="app-container">
      <Header title={hotelName} subtitle="Account statement" onBack={onBack} />

      <PageTransition>
        <div className="px-4 py-5 space-y-5">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : data ? (
            <>
              <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-full bg-[#EBF5F0]">
                    <Landmark size={22} className="text-[#114B36]" />
                  </div>
                  <div>
                    <p className="text-xs text-[#6B7280] font-medium">Current Balance</p>
                    <p className={`text-2xl font-bold font-['League_Spartan'] tracking-tight ${data.account.status === "DUE" ? "text-[#D64045]" : "text-[#22C55E]"}`}>
                      {formatKsh(balance)}
                    </p>
                    <p className={`mt-1 text-xs font-bold ${data.account.status === "DUE" ? "text-[#D64045]" : "text-[#15803D]"}`}>{data.account.status === "DUE" ? "Balance due" : data.account.status === "CREDIT" ? "Credit available" : "Account settled"}</p>
                  </div>
                </div>
                <div className="flex gap-4 mt-3 pt-3 border-t border-[#E5E7EB]">
                  <div className="flex-1">
                    <p className="text-[0.65rem] text-[#6B7280] font-medium uppercase tracking-wide">Total Owed</p>
                    <p className="text-sm font-semibold text-[#1F2937]">{formatKsh(Number(data.account.totalOwed))}</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-[0.65rem] text-[#6B7280] font-medium uppercase tracking-wide">Total Paid</p>
                    <p className="text-sm font-semibold text-[#22C55E]">{formatKsh(Number(data.account.totalPaid))}</p>
                  </div>
                </div>
              </div>

              {data.pendingRefunds && data.pendingRefunds.length > 0 && (
                <div className="bg-[#FFF7ED] border border-[#FED7AA] rounded-2xl p-4">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle size={18} className="text-[#D97706] mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs font-bold text-[#9A3412] uppercase tracking-wider mb-2">Refunds pending</p>
                      <div className="space-y-2">
                        {data.pendingRefunds.map((r) => (
                          <div key={r.orderId} className="flex items-center justify-between text-sm">
                            <span className="font-semibold text-[#78350F]">
                              Order #{r.orderNumber}
                              <span className="block text-xs font-normal text-[#B45309] mt-0.5">
                                {new Date(r.orderedAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })} · awaiting refund from {data.hotelName}
                              </span>
                            </span>
                            <span className="font-bold text-[#9A3412]">{formatKsh(r.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold text-[#6B7280] uppercase tracking-wider mb-3 px-1">
                  Recent Activity
                </h3>
                {data.salesRecords.length === 0 ? (
                  <p className="text-center text-sm text-[#9CA3AF] py-8">No transactions yet.</p>
                ) : (
                  <div className="space-y-2">
                    {data.salesRecords.map((record, index) => (
                      <motion.div
                        key={record.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className="flex items-start gap-3 bg-white p-3.5 rounded-xl border border-[#E5E7EB]"
                      >
                        <div className="p-2 rounded-full bg-gray-50 shrink-0">
                          {recordIcon(record.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#1F2937]">{recordLabel(record)}</p>
                          <p className="text-xs text-[#6B7280] mt-0.5">
                            {new Date(record.createdAt).toLocaleDateString("en-KE", {
                              day: "numeric", month: "short", year: "numeric",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <span className={`text-sm font-semibold shrink-0 ${
                          record.type === "ORDER_PAYMENT" ? "text-[#22C55E]" :
                          record.type === "REFUND" ? "text-[#EF4444]" :
                          "text-[#1F2937]"
                        }`}>
                          {record.type === "ORDER_PAYMENT" ? "+" : record.type === "REFUND" ? "-" : ""}
                          {formatKsh(record.amount)}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-center text-sm text-[#6B7280] py-8">Could not load account details.</p>
          )}
        </div>
      </PageTransition>
    </div>
  );
};
