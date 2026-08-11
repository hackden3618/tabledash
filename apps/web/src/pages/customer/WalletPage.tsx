import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, ChevronRight, Wallet, CreditCard, Landmark, Bell } from "lucide-react";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { apiGet } from "../../lib/api";
import { Header } from "../../components/ui/Header";
import { PageTransition } from "../../components/ui/PageTransition";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";

interface AccountData {
  hotelId: string;
  hotelName: string;
  balance: number;
  totalOwed: number;
  totalPaid: number;
  status: "DUE" | "SETTLED" | "CREDIT";
  lastUpdated: string;
}

interface WalletData {
  combinedBalance: number;
  accounts: AccountData[];
}

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

interface WalletPageProps {
  onBack: () => void;
  onSelectHotel: (hotelId: string, hotelName: string) => void;
  onOpenActivity: () => void;
}

export const WalletPage: React.FC<WalletPageProps> = ({ onBack, onSelectHotel, onOpenActivity }) => {
  const { token } = useCustomerAuth();
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAmounts, setShowAmounts] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchWallet = useCallback(async () => {
    const res = await apiGet<WalletData>("/finance/wallet", token || undefined);
    if (res.success && res.data) setData(res.data);
  }, [token]);

  const fetchUnreadCount = useCallback(async () => {
    const res = await apiGet<ActivityItem[]>("/finance/notifications", token || undefined);
    if (res.success && res.data) setUnreadCount(res.data.filter((a) => !a.read).length);
  }, [token]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchWallet(), fetchUnreadCount()]);
      setLoading(false);
    };
    void load();
  }, [fetchWallet, fetchUnreadCount]);

  // Live refresh: wallet-scoped financial events arrive over the single WS
  // connection. The DB write is already the source of truth — this just keeps
  // the unread badge current without a reload.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as { type: string; payload: any };
      if (detail.type === "WALLET_UPDATED") {
        setUnreadCount((prev) => prev + 1);
        void fetchWallet();
      }
    };
    window.addEventListener("ladha:realtime", handler);
    return () => window.removeEventListener("ladha:realtime", handler);
  }, [fetchWallet]);

  const formatKsh = (amount: number) => {
    return `KSh ${Math.abs(amount).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  const maskAmount = (amount: number) => {
    return showAmounts ? formatKsh(amount) : "KSh ••••";
  };

  return (
    <div className="app-container">
      <Header title="Wallet" subtitle="Your account balances across all hotels" onBack={onBack} />

      <PageTransition>
        <div className="px-4 py-5 space-y-5">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full rounded-2xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ) : !data || data.accounts.length === 0 ? (
            <EmptyState
              icon={<Wallet size={48} className="text-[#6B7280]" />}
              title="No accounts yet"
              description="Place an order at any hotel to get started."
            />
          ) : (
            <>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowAmounts((v) => !v)}
                className="w-full flex items-center justify-between bg-gradient-to-br from-[#114B36] to-[#0D3D2B] text-white p-5 rounded-2xl shadow-lg"
              >
                <div className="text-left">
                  <p className="text-sm opacity-80 font-medium">Combined Balance</p>
                  <p className="text-3xl font-bold mt-1 font-['League_Spartan'] tracking-tight">
                    {loading ? "..." : maskAmount(data?.combinedBalance || 0)}
                  </p>
                  {data && data.combinedBalance > 0 && (
                    <p className="text-xs opacity-60 mt-1">
                      Total owed across {data.accounts.length} hotel{data.accounts.length !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
                <div className="p-2 bg-white/15 rounded-full">
                  {showAmounts ? <EyeOff size={22} /> : <Eye size={22} />}
                </div>
              </motion.button>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-[#6B7280] uppercase tracking-wider px-1">
                  Per-Hotel Accounts
                </h3>
                {data.accounts.map((account, index) => (
                  <motion.button
                    key={account.hotelId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onSelectHotel(account.hotelId, account.hotelName)}
                    className="w-full flex items-center justify-between bg-white p-4 rounded-xl border border-[#E5E7EB] shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-full bg-[#EBF5F0]">
                        <Landmark size={20} className="text-[#114B36]" />
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-[#1F2937] text-sm">{account.hotelName}</p>
                        <p className="text-xs text-[#6B7280] mt-0.5">
                          {account.status === "SETTLED" ? (
                            <span className="text-[#22C55E] font-medium">All settled</span>
                          ) : account.status === "DUE" ? (
                            `Owes ${formatKsh(account.balance)}`
                          ) : (
                            `${formatKsh(Math.abs(account.balance))} in credit`
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold text-sm ${account.status === "DUE" ? "text-[#D64045]" : "text-[#22C55E]"}`}>
                        {maskAmount(account.balance)}
                      </span>
                      <ChevronRight size={16} className="text-[#9CA3AF]" />
                    </div>
                  </motion.button>
                ))}
              </div>

              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={onOpenActivity}
                className="w-full flex items-center justify-between bg-white p-4 rounded-xl border border-[#E5E7EB] shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-full bg-[#EBF5F0]">
                    <Bell size={20} className="text-[#114B36]" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-[#1F2937] text-sm">Recent Activity</p>
                    <p className="text-xs text-[#6B7280] mt-0.5">Payments, charges, refunds & adjustments</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-[#D64045] text-white text-xs font-bold flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                  <ChevronRight size={16} className="text-[#9CA3AF]" />
                </div>
              </motion.button>

              {data.accounts.some((a) => a.balance > 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-start gap-2.5">
                    <CreditCard size={18} className="text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-800 leading-relaxed">
                      Outstanding balances represent amounts due for orders placed on credit.
                      Pay at the hotel to clear your balance.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </PageTransition>
    </div>
  );
};
