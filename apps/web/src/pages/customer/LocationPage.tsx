import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "../../context/CartContext";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { apiPost } from "../../lib/api";
import { useWebSocket } from "../../lib/websocket";
import { Header } from "../../components/ui/Header";
import { Button } from "../../components/ui/Button";
import { Input, Textarea } from "../../components/ui/Input";
import { PageTransition } from "../../components/ui/PageTransition";
import { Lock, CheckCircle2 } from "lucide-react";
import { SecureCodeInput } from "../../components/ui/SecureCodeInput";

const formatPhone = (raw: string): string => {
  const cleaned = raw.replace(/\D/g, "");
  if (cleaned.startsWith("0") && cleaned.length === 10) return `254${cleaned.slice(1)}`;
  if ((cleaned.startsWith("7") || cleaned.startsWith("1")) && cleaned.length === 9) return `254${cleaned}`;
  if (cleaned.startsWith("254") && cleaned.length === 12) return cleaned;
  return cleaned;
};
const isValidPhone = (v: string): boolean => /^254\d{9}$/.test(v);

interface LocationPageProps {
  onBackToCart: () => void;
  onOrderPlaced: (orderData: any) => void;
}

export const LocationPage: React.FC<LocationPageProps> = ({ onBackToCart, onOrderPlaced }) => {
  const { cart, totalAmount, clearCart, closedHotelIds, setClosedHotelIds } = useCart();
  const { customer, isLoggedIn } = useCustomerAuth();

  const [marketSection, setMarketSection] = useState(isLoggedIn && customer?.marketSection ? customer.marketSection : "");
  const [locationDescription, setLocationDescription] = useState(isLoggedIn && customer?.locationDescription ? customer.locationDescription : "");
  const [stallNumber, setStallNumber] = useState(isLoggedIn && customer?.stallNumber ? customer.stallNumber : "");
  const [firstName, setFirstName] = useState(isLoggedIn && customer?.firstName ? customer.firstName : "");
  const [lastName, setLastName] = useState(isLoggedIn && customer?.lastName ? customer.lastName : "");
  const [knownName, setKnownName] = useState("");
  const [phone, setPhone] = useState(isLoggedIn && customer?.phone ? customer.phone : "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [orderError, setOrderError] = useState("");

  useEffect(() => {
    if (isLoggedIn && customer) {
      if (!firstName && customer.firstName) setFirstName(customer.firstName);
      if (!lastName && customer.lastName) setLastName(customer.lastName);
      if (!knownName && customer.knownName) setKnownName(customer.knownName);
      if (!phone && customer.phone) setPhone(customer.phone);
      if (!marketSection && customer.marketSection) setMarketSection(customer.marketSection);
      if (!locationDescription && customer.locationDescription) setLocationDescription(customer.locationDescription);
      if (!stallNumber && customer.stallNumber) setStallNumber(customer.stallNumber);
    }
  }, [isLoggedIn, customer]);

  useWebSocket("customer", undefined, (event) => {
    if (event.type === "HOTEL_CLOSING") {
      const data = event.payload as { hotelId?: string };
      if (data.hotelId) setClosedHotelIds((prev) => prev.includes(data.hotelId!) ? prev : [...prev, data.hotelId!]);
    } else if (event.type === "HOTEL_STATUS_UPDATED") {
      const status = event.payload as { isOpen: boolean; hotelId?: string };
      if (status.hotelId) setClosedHotelIds((prev) => status.isOpen ? prev.filter((id) => id !== status.hotelId) : prev.includes(status.hotelId!) ? prev : [...prev, status.hotelId!]);
    }
  });

  useEffect(() => {
    if (!isLoggedIn && (firstName || phone || stallNumber || locationDescription || marketSection)) {
      localStorage.setItem("ladha_guest_delivery", JSON.stringify({ firstName, lastName, knownName, phone, stallNumber, marketSection, locationDescription }));
    }
  }, [firstName, lastName, knownName, phone, stallNumber, marketSection, locationDescription, isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) {
      try {
        const saved = localStorage.getItem("ladha_guest_delivery");
        if (saved) {
          const d = JSON.parse(saved);
          if (d.firstName) setFirstName(d.firstName);
          if (d.lastName) setLastName(d.lastName);
          if (d.knownName) setKnownName(d.knownName);
          if (d.phone) setPhone(d.phone);
          if (d.stallNumber) setStallNumber(d.stallNumber);
          if (d.marketSection) setMarketSection(d.marketSection);
          if (d.locationDescription) setLocationDescription(d.locationDescription);
        }
      } catch { /* ignore */ }
    }
  }, []);

  const handlePlaceOrder = () => {
    setOrderError("");
    if (!firstName.trim()) {
      setOrderError("Please enter your first name before placing the order."); return;
    }
    if (!isValidPhone(phone.trim())) {
      setOrderError("Please enter a valid phone number (e.g. 0712345678)."); return;
    }
    setShowConfirmModal(true);
  };

  const handleConfirmOrder = () => {
    setShowConfirmModal(false);
    if (isLoggedIn) {
      setPin("");
      setPinError("");
      setShowPinModal(true);
    } else {
      submitOrder();
    }
  };

  const handlePinSubmit = async (pinOverride = pin) => {
    if (pinOverride.length < 4) { setPinError("Please enter your full 4-digit PIN."); return; }
    setPinLoading(true);
    setPinError("");
    const res = await apiPost<{ token: string }>("/customers/login", { phone: customer?.phone, pin: pinOverride });
    setPinLoading(false);
    if (res.success) {
      setShowPinModal(false);
      submitOrder();
    } else {
      setPinError("Incorrect PIN. Please try again.");
      setPin("");
    }
  };

  const submitOrder = async () => {
    setIsSubmitting(true);
    const payload = {
      firstName: firstName.trim(), lastName: lastName.trim() || undefined,
      phone: phone.trim(), knownName: knownName.trim() || undefined,
      stallNumber: stallNumber.trim() || undefined, marketSection, locationDescription,
      items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })),
    };
    const res = await apiPost<any>("/orders", payload);
    setIsSubmitting(false);
    if (res.success && res.data) {
      localStorage.setItem("ladha_last_order", JSON.stringify(res.data));
      clearCart();
      onOrderPlaced(res.data);
    } else {
      setOrderError(res.error || "Failed to place order. Please try again.");
    }
  };

  const anyHotelClosed = cart.some((item) => item.hotelId && closedHotelIds.includes(item.hotelId));

  return (
    <div className="app-container">
      <Header title="Delivery Location" onBack={onBackToCart} />

      <PageTransition>
        <div className="px-4 py-5">
          {isLoggedIn && customer && (
            <div className="bg-[#DCFCE7] border border-[#BBF7D0] rounded-2xl p-3.5 mb-5 flex items-center gap-2.5">
              <CheckCircle2 size={16} className="text-[#15803D]" />
              <span className="text-sm font-semibold text-[#15803D]">
                Details pre-filled from your saved account — {customer.firstName}{customer.lastName ? ` ${customer.lastName}` : ""}
              </span>
            </div>
          )}

          <h2 className="text-lg font-bold text-[#1F2937] mb-4">How would you like to set your location?</h2>

          <div onClick={() => setOrderError("Market mapping is coming soon! For now, please enter your stall number and location description below.")}
            className="border-2 border-dashed border-[#D1D5DB] rounded-2xl p-4 bg-[#F9FAFB] cursor-pointer opacity-70 hover:opacity-100 transition-opacity flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">📍</span>
              <div>
                <p className="font-bold text-sm text-[#6B7280]">Market Map <span className="font-normal text-xs">(Coming Soon)</span></p>
                <p className="text-xs text-[#9CA3AF]">Tap to learn more</p>
              </div>
            </div>
            <span className="text-[#9CA3AF] text-lg">›</span>
          </div>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[#E5E7EB]" />
            <span className="text-xs font-semibold text-[#9CA3AF]">OR</span>
            <div className="flex-1 h-px bg-[#E5E7EB]" />
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input label="First Name *" placeholder="e.g. Mary" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              <Input label="Last Name" placeholder="e.g. Wanjiku" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <Input label="Known As (optional)" placeholder="e.g. Wa Alex, Mama Jane" value={knownName} onChange={(e) => setKnownName(e.target.value)} hint="How the hotel staff knows you" />
            <Input label="Phone Number *" placeholder="07XXXXXXXX" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} maxLength={14} />
            <Input label="Stall Number / Shop Name" placeholder="e.g. Stall 42" value={stallNumber} onChange={(e) => setStallNumber(e.target.value)} />
            <Textarea label="Describe your location" placeholder="e.g. Near Mama Jane's stall, Food section" value={locationDescription} onChange={(e) => setLocationDescription(e.target.value)} rows={3} />
          </div>

          {orderError && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="mt-4 bg-[#FEE2E2] text-[#DC2626] rounded-xl px-4 py-3 text-sm font-semibold"
            >{orderError}</motion.div>
          )}

          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between py-3 px-4 bg-white rounded-2xl border border-[#E5E7EB]">
              <span className="text-sm text-[#6B7280]">Total</span>
              <span className="text-xl font-extrabold text-[#114B36]">KSh {totalAmount}</span>
            </div>
            {anyHotelClosed && (
              <div className="bg-[#FEF2F2] border border-[#FCA5A5] rounded-2xl p-4 text-center">
                <p className="font-bold text-sm text-[#DC2626]">Hotel is Currently Closed</p>
                <p className="text-xs text-[#991B1B] mt-1">Not accepting orders right now.</p>
              </div>
            )}
            <Button onClick={handlePlaceOrder} disabled={isSubmitting || !firstName.trim() || !isValidPhone(phone.trim()) || (!marketSection && !locationDescription.trim() && !stallNumber.trim()) || anyHotelClosed} loading={isSubmitting} fullWidth size="lg">
              {anyHotelClosed ? "Hotel Closed" : "Place Order"}
            </Button>
          </div>
        </div>
      </PageTransition>

      {/* Confirm Order Modal */}
      <AnimatePresence>
        {showConfirmModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-sm"
            onClick={() => setShowConfirmModal(false)}
          >
            <motion.div initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white rounded-3xl rounded-b-none sm:rounded-3xl w-full max-w-md p-6 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] sm:mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-14 h-14 rounded-2xl bg-[#EBF5F0] text-[#114B36] flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={28} />
              </div>
              <h3 className="text-lg font-bold text-[#1F2937] text-center mb-2">Confirm Your Order</h3>
              <p className="text-sm text-[#6B7280] text-center leading-relaxed mb-6">
                By placing this order, you agree that your selected meals will be prepared and delivered to your location. <strong>Total: KSh {totalAmount}</strong>
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" fullWidth onClick={() => setShowConfirmModal(false)}>Cancel</Button>
                <Button fullWidth onClick={handleConfirmOrder}>Yes, Place Order</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PIN Verification Modal */}
      <AnimatePresence>
        {showPinModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-sm"
            onClick={() => { setShowPinModal(false); setPin(""); setPinError(""); }}
          >
            <motion.div initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white rounded-3xl rounded-b-none sm:rounded-3xl w-full max-w-md p-6 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] sm:mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-14 h-14 rounded-2xl bg-[#FEF3C7] text-[#D97706] flex items-center justify-center mx-auto mb-4">
                <Lock size={24} />
              </div>
              <h3 className="text-lg font-bold text-[#1F2937] text-center mb-1">Confirm with PIN</h3>
              <p className="text-sm text-[#6B7280] text-center mb-5">
                Enter your 4-digit PIN to confirm this order.
              </p>
              <SecureCodeInput value={pin} onChange={(v) => { setPin(v); setPinError(""); }} onComplete={(pinValue) => void handlePinSubmit(pinValue)} error={Boolean(pinError)} autoFocus label="Order confirmation PIN" />
              <div className="flex gap-3 mt-5">
                <Button variant="secondary" fullWidth onClick={() => { setShowPinModal(false); setPin(""); setPinError(""); }}>Cancel</Button>
              <Button fullWidth onClick={() => void handlePinSubmit()} disabled={pin.length < 4 || pinLoading} loading={pinLoading}>
                  Confirm
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
