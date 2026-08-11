import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bell, Trash2 } from "lucide-react";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { apiGet, apiPatch, apiDelete } from "../../lib/api";
import { Header } from "../../components/ui/Header";
import { PageTransition } from "../../components/ui/PageTransition";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

interface WalletActivityPageProps {
  onBack: () => void;
}

export const WalletActivityPage: React.FC<WalletActivityPageProps> = ({ onBack }) => {
  const { token } = useCustomerAuth();
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchActivity = async () => {
    const res = await apiGet<ActivityItem[]>("/finance/notifications", token || undefined);
    if (res.success && res.data) setActivity(res.data);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchActivity();
      setLoading(false);
    };
    void load();
  }, [token]);

  // Live refresh over the single WS connection — new financial movements arrive
  // without a reload. The DB write is the source of truth; this only updates the view.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as { type: string; payload: any };
      if (detail.type === "WALLET_UPDATED") {
        const notification = detail.payload?.notification;
        if (notification?.id) {
          setActivity((prev) => [
            {
              id: notification.id,
              type: notification.type,
              title: notification.title,
              body: notification.body,
              read: false,
              createdAt: new Date().toISOString(),
            },
            ...prev.filter((a) => a.id !== notification.id),
          ]);
        }
      }
    };
    window.addEventListener("ladha:realtime", handler);
    return () => window.removeEventListener("ladha:realtime", handler);
  }, []);

  const markRead = async (id: string) => {
    setActivity((prev) => prev.map((a) => (a.id === id ? { ...a, read: true } : a)));
    await apiPatch(`/finance/notifications/${id}/read`, {}, token || undefined);
  };

  const clearAll = async () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      confirmTimer.current = setTimeout(() => setConfirmingClear(false), 2500);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmingClear(false);
    setClearing(true);
    const res = await apiDelete<{ cleared: number }>("/finance/notifications", token || undefined);
    if (res.success) setActivity([]);
    setClearing(false);
  };

  const unreadCount = activity.filter((a) => !a.read).length;

  return (
    <div className="app-container">
      <Header title="Recent Activity" subtitle="Financial notifications across your accounts" onBack={onBack} />

      <PageTransition>
        <div className="px-4 py-5 space-y-4">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ) : activity.length === 0 ? (
            <EmptyState
              icon={<Bell size={48} className="text-[#6B7280]" />}
              title="No activity yet"
              description="Payments, charges, refunds and adjustments will appear here."
            />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-[#6B7280]">
                  {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
                </p>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={clearAll}
                  disabled={clearing}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    confirmingClear
                      ? "bg-[#D64045] text-white"
                      : "bg-white border border-[#E5E7EB] text-[#6B7280] hover:border-[#D64045] hover:text-[#D64045]"
                  }`}
                >
                  <Trash2 size={14} />
                  {clearing ? "Clearing…" : confirmingClear ? "Tap again to confirm" : "Clear all"}
                </motion.button>
              </div>

              <div className="space-y-2">
                {activity.map((item) => (
                  <motion.button
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => !item.read && void markRead(item.id)}
                    className={`w-full flex items-start gap-3 bg-white p-3.5 rounded-xl border text-left cursor-pointer transition-colors ${
                      item.read ? "border-[#E5E7EB]" : "border-[#114B36]/30"
                    }`}
                  >
                    <div className={`p-2 rounded-full shrink-0 ${item.read ? "bg-gray-50" : "bg-[#EBF5F0]"}`}>
                      <Bell size={16} className={item.read ? "text-[#9CA3AF]" : "text-[#114B36]"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1F2937]">{item.title}</p>
                      <p className="text-xs text-[#6B7280] mt-0.5 leading-relaxed">{item.body}</p>
                      <p className="text-[0.65rem] text-[#9CA3AF] mt-1">
                        {new Date(item.createdAt).toLocaleString("en-KE", {
                          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </div>
                    {!item.read && <span className="w-2 h-2 rounded-full bg-[#22C55E] mt-1.5 shrink-0" />}
                  </motion.button>
                ))}
              </div>
            </>
          )}
        </div>
      </PageTransition>
    </div>
  );
};
