import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "../../context/CartContext";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { apiGet, apiPost, apiPatch } from "../../lib/api";
import { Header } from "../../components/ui/Header";
import { Button } from "../../components/ui/Button";
import { Input, Textarea } from "../../components/ui/Input";
import { PageTransition } from "../../components/ui/PageTransition";
import { Lock, CheckCircle2, Phone, Wallet, CreditCard, Users, UserRound, Info, ShieldCheck } from "lucide-react";
import { SecureCodeInput } from "../../components/ui/SecureCodeInput";

// TODO - the location data should be auto saved upon first entering since I saw that a user was complaining too much about re-entering the data everytime... I thought that was fixed...
// also, the stall number should only be the main reference if in the market...

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
  onNavigateToVerify?: () => void;
}

interface DeliveryRegion {
  id: string;
  name: string;
  isFallback?: boolean;
  note?: string | null;
  displayOrder?: number;
}

interface DeliveryZone {
  id: string;
  name: string;
  locationLabel: string;
  locationPlaceholder: string;
  megaRegion?: { id: string; name: string };
  deliveryRegions?: DeliveryRegion[];
}

export const LocationPage: React.FC<LocationPageProps> = ({ onBackToCart, onOrderPlaced, onNavigateToVerify }) => {
  const { cart, totalAmount, clearCart, closedHotelIds, setClosedHotelIds } = useCart();
  const { customer, isLoggedIn, login, token } = useCustomerAuth();

   const [marketSection, setMarketSection] = useState("");
   const [locationDescription, setLocationDescription] = useState("");
   const [stallNumber, setStallNumber] = useState("");
   const [firstName, setFirstName] = useState("");
   const [lastName, setLastName] = useState("");
   const [knownName, setKnownName] = useState("");
   const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [showGuestIdentityModal, setShowGuestIdentityModal] = useState(false);
  const [guestOtp, setGuestOtp] = useState("");
  const [guestOtpState, setGuestOtpState] = useState<"sending" | "sent" | "verified">("sending");
  const [guestOtpError, setGuestOtpError] = useState("");
  const [guestAccount, setGuestAccount] = useState<{ hasPin: boolean; firstName?: string; lastName?: string | null } | null>(null);
  const [guestLoginPin, setGuestLoginPin] = useState("");
  const [guestLoginError, setGuestLoginError] = useState("");
  const [guestLoginLoading, setGuestLoginLoading] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [showVerifyPrompt, setShowVerifyPrompt] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"PAY_LATER" | "PAY_ON_DELIVERY">("PAY_ON_DELIVERY");
  const [deliveryZone, setDeliveryZone] = useState<DeliveryZone | null>(null);
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [selectedTownRegionId, setSelectedTownRegionId] = useState<string>("");
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [deliveryFeeLoading, setDeliveryFeeLoading] = useState(false);

  // ── Ordering on behalf of someone else ──
  const [orderingForOther, setOrderingForOther] = useState(false);
  const [recipient, setRecipient] = useState<{ id: string; firstName: string; lastName?: string | null; knownName?: string | null; isVerified: boolean; hasPin?: boolean } | null>(null);
  const [recipientLookupState, setRecipientLookupState] = useState<"idle" | "checking" | "found" | "guest">("idle");

   // The recipient's number must be OTP-verified before an on-behalf order can be
   // placed, so orders can't be attributed to a number its owner never confirmed.
   const [recipientVerified, setRecipientVerified] = useState(false);
   const [recipientVerifyState, setRecipientVerifyState] = useState<"idle" | "sent" | "verified">("idle");
   const [recipientOtp, setRecipientOtp] = useState("");
   const [verifyLoading, setVerifyLoading] = useState(false);
   const [verifyError, setVerifyError] = useState("");
   const [verifySuccess, setVerifySuccess] = useState("");

   // ── Own phone verification ──
   // Account details (name, address, stall) are only surfaced after the
   // orderer confirms they hold the phone number. This prevents ghost
   // histories from appearing when someone uses another person's browser.
   const [phoneVerified, setPhoneVerified] = useState(false);
   const [ownPhone, setOwnPhone] = useState("");
   const [ownPhoneVerifyState, setOwnPhoneVerifyState] = useState<"idle" | "sent" | "verified">("idle");
   const [ownPhoneOtp, setOwnPhoneOtp] = useState("");
   const [ownVerifyLoading, setOwnVerifyLoading] = useState(false);
   const [ownVerifyError, setOwnVerifyError] = useState("");
   const [ownVerifySuccess, setOwnVerifySuccess] = useState("");

  const isVerified = isLoggedIn && customer?.isVerified === true;
  // Pay Later is credit against the recipient's account, so in on-behalf mode
  // it is gated on the recipient being a verified Ladha customer.
  const canPayLater = orderingForOther ? recipient?.isVerified === true : isVerified;
  const lockName = orderingForOther && recipientLookupState === "found";
  const lockPhone = orderingForOther && (recipientLookupState === "found" || recipientLookupState === "guest");

  useEffect(() => {
    void apiGet<DeliveryZone[]>("/discovery/zones").then((result) => {
      if (!result.success || !result.data?.length) return;
      setDeliveryZones(result.data);
      const savedZoneId = localStorage.getItem("ladha_zone_id");
      const savedRegionId = localStorage.getItem("ladha_town_region_id");
      const zone = result.data.find((item) => item.id === savedZoneId) ?? result.data[0];
      setDeliveryZone(zone);
      localStorage.setItem("ladha_zone_id", zone.id);

      const activeRegion = zone.deliveryRegions?.find((r) => r.id === savedRegionId) ?? zone.deliveryRegions?.[0];
      if (activeRegion) {
        setSelectedTownRegionId(activeRegion.id);
        localStorage.setItem("ladha_town_region_id", activeRegion.id);
        localStorage.setItem("ladha_town_region_name", activeRegion.name);
      }
    });
  }, []);

  const changeDeliveryTown = (zoneId: string) => {
    const zone = deliveryZones.find((item) => item.id === zoneId);
    if (!zone) return;
    setDeliveryZone(zone);
    localStorage.setItem("ladha_zone_id", zone.id);
    const firstRegion = zone.deliveryRegions?.[0];
    if (firstRegion) {
      setSelectedTownRegionId(firstRegion.id);
      localStorage.setItem("ladha_town_region_id", firstRegion.id);
      localStorage.setItem("ladha_town_region_name", firstRegion.name);
      if (isLoggedIn && token) {
        void apiPatch("/customers/me", { townRegionId: firstRegion.id }, token).catch(() => {});
      }
    }
  };

  const changeDeliverySubRegion = (regionId: string) => {
    setSelectedTownRegionId(regionId);
    const region = deliveryZone?.deliveryRegions?.find((r) => r.id === regionId);
    if (region) {
      localStorage.setItem("ladha_town_region_id", region.id);
      localStorage.setItem("ladha_town_region_name", region.name);
    }
    if (isLoggedIn && token) {
      void apiPatch("/customers/me", { townRegionId: regionId }, token).catch(() => {});
    }
  };

  const cartHotelIds = [...new Set(cart.map((item) => item.hotelId).filter((id): id is string => Boolean(id)))];
  useEffect(() => {
    if (!cartHotelIds.length) { setDeliveryFee(0); return; }
    setDeliveryFeeLoading(true);
    const query = new URLSearchParams({ hotelIds: cartHotelIds.join(",") });
    // Use the selected TownRegion sub-area ID so the backend looks up the
    // per-area fee rather than the generic zone fee.
    if (selectedTownRegionId) query.set("zoneId", selectedTownRegionId);
    void apiGet<Array<{ hotelId: string; deliveryFee: number }>>(`/orders/delivery-fees?${query.toString()}`)
      .then((result) => { if (result.success && result.data) setDeliveryFee(result.data.reduce((sum, row) => sum + Number(row.deliveryFee), 0)); })
      .finally(() => setDeliveryFeeLoading(false));
  }, [selectedTownRegionId, cartHotelIds.join(",")]);

  useEffect(() => {
    if (isLoggedIn && customer && !orderingForOther) {
      setFirstName(customer.firstName || "");
      setLastName(customer.lastName || "");
      setKnownName(customer.knownName || "");
      setPhone(customer.phone || "");
      setMarketSection(customer.marketSection || "");
      setLocationDescription(customer.locationDescription || "");
      setStallNumber(customer.stallNumber || "");
    }
  }, [customer?.id, isLoggedIn, orderingForOther]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail.type === "HOTEL_CLOSING") {
        const data = detail.payload as { hotelId?: string };
        if (data.hotelId) setClosedHotelIds((prev) => prev.includes(data.hotelId!) ? prev : [...prev, data.hotelId!]);
      } else if (detail.type === "HOTEL_STATUS_UPDATED") {
        const status = detail.payload as { isOpen: boolean; hotelId?: string };
        if (status.hotelId) setClosedHotelIds((prev) => status.isOpen ? prev.filter((id) => id !== status.hotelId) : prev.includes(status.hotelId!) ? prev : [...prev, status.hotelId!]);
      }
    };
    window.addEventListener("ladha:realtime", handler);
    return () => window.removeEventListener("ladha:realtime", handler);
  }, [setClosedHotelIds]);

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

  // In on-behalf mode, resolving the recipient's phone drives the form: known
  // customers auto-fill and lock their details; unknown numbers are flagged as
  // guests (payment on delivery).
  useEffect(() => {
    // A changed number (or exiting on-behalf mode) invalidates any prior verification.
    setRecipientVerified(false);
    setRecipientVerifyState("idle");
    setRecipientOtp("");
    setVerifyError("");
    setVerifySuccess("");
    if (!orderingForOther) {
      setRecipient(null);
      setRecipientLookupState("idle");
      return;
    }
    if (!isValidPhone(phone.trim())) {
      setRecipient(null);
      setRecipientLookupState("idle");
      return;
    }
    setRecipientLookupState("checking");
    const timer = setTimeout(async () => {
      const res = await apiGet<{ found: boolean; customer?: { id: string; firstName: string; lastName?: string | null; knownName?: string | null; isVerified: boolean; hasPin?: boolean } }>(
        `/customers/lookup?phone=${encodeURIComponent(phone.trim())}`
      );
      if (res.success && res.data?.found && res.data.customer) {
        const c = res.data.customer;
        setRecipient(c);
        setRecipientLookupState("found");
        setFirstName(c.firstName || "");
        setLastName(c.lastName || "");
        setKnownName(c.knownName || "");
        setShowVerifyPrompt(false);
      } else if (res.success && res.data && !res.data.found) {
        setRecipient(null);
        setRecipientLookupState("guest");
        // A guest recipient carries no account — credit isn't possible.
        setPaymentMethod("PAY_ON_DELIVERY");
        setShowVerifyPrompt(false);
      } else {
        setRecipient(null);
        setRecipientLookupState("idle");
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [phone, orderingForOther]);

  const toggleOnBehalf = () => {
    setOrderingForOther((prev) => {
      const next = !prev;
      if (next) {
        // Recipient details start fresh — this phone identifies a different person.
        setFirstName(""); setLastName(""); setKnownName(""); setPhone("");
        setRecipient(null); setRecipientLookupState("idle");
        setPaymentMethod("PAY_ON_DELIVERY"); setShowVerifyPrompt(false);
      } else if (isLoggedIn && customer) {
        setFirstName(customer.firstName || "");
        setLastName(customer.lastName || "");
        setKnownName(customer.knownName || "");
        setPhone(customer.phone || "");
        setRecipient(null); setRecipientLookupState("idle");
      }
      return next;
    });
  };

  const recipientDisplayName = (r: { firstName: string; lastName?: string | null; knownName?: string | null }) =>
    r.knownName || [r.firstName, r.lastName].filter(Boolean).join(" ") || r.firstName;

  const sendRecipientCode = async () => {
    setVerifyError("");
    setVerifySuccess("");
    setVerifyLoading(true);
    const res = await apiPost<{ message: string }>("/customers/recipient-verify/send", { phone: phone.trim() });
    setVerifyLoading(false);
    if (res.success) {
      setRecipientVerifyState("sent");
      setVerifySuccess("A verification code has been sent to this number via SMS.");
    } else {
      setVerifyError(res.error ?? "Failed to send the verification code.");
    }
  };

   const confirmRecipientCode = async (otpOverride = recipientOtp) => {
     if (otpOverride.length < 4) { setVerifyError("Enter the full code."); return; }
     setVerifyError("");
     setVerifyLoading(true);
     const res = await apiPost<{ message: string }>("/customers/recipient-verify/confirm", {
       phone: phone.trim(),
       otp: otpOverride,
     });
     setVerifyLoading(false);
     if (res.success) {
       setRecipientVerified(true);
       setRecipientVerifyState("verified");
       setVerifySuccess("");
       setRecipientOtp("");
     } else {
       setVerifyError(res.error ?? "Verification failed.");
     }
   };

   const sendOwnPhoneCode = async () => {
     setOwnVerifyError("");
     setOwnVerifySuccess("");
     setOwnVerifyLoading(true);
     const res = await apiPost<{ message: string }>("/customers/phone-otp/send", { phone: ownPhone.trim() });
     setOwnVerifyLoading(false);
     if (res.success) {
       setOwnPhoneVerifyState("sent");
       setOwnVerifySuccess("A verification code has been sent to this number.");
     } else {
       setOwnVerifyError(res.error ?? "Failed to send the verification code.");
     }
   };

   const confirmOwnPhoneCode = async (otpOverride = ownPhoneOtp) => {
     if (otpOverride.length < 4) { setOwnVerifyError("Enter the full code."); return; }
     setOwnVerifyError("");
     setOwnVerifyLoading(true);
     const res = await apiPost<{ message: string; phoneConfirmedAt: string }>("/customers/phone-otp/confirm", {
       phone: ownPhone.trim(),
       otp: otpOverride,
     });
     setOwnVerifyLoading(false);
     if (res.success) {
       setPhoneVerified(true);
       setOwnPhoneVerifyState("verified");
       setOwnVerifySuccess("");
       setOwnPhoneOtp("");
       if (isLoggedIn && customer) {
         setFirstName(customer.firstName || "");
         setLastName(customer.lastName || "");
         setKnownName(customer.knownName || "");
         setPhone(customer.phone || "");
         setMarketSection(customer.marketSection || "");
         setLocationDescription(customer.locationDescription || "");
         setStallNumber(customer.stallNumber || "");
       }
     } else {
       setOwnVerifyError(res.error ?? "Verification failed.");
     }
   };

   const handlePlaceOrder = () => {
    setOrderError("");
    if (!firstName.trim()) {
      setOrderError("Please enter your first name before placing the order."); return;
    }
    if (!isValidPhone(phone.trim())) {
      setOrderError("Please enter a valid phone number (e.g. 0712345678)."); return;
    }
    if (orderingForOther && recipientLookupState !== "found" && !lockPhone) {
      setOrderError("Wait for the recipient's phone number to be checked before placing the order."); return;
    }
    if (orderingForOther && !recipientVerified) {
      setOrderError("Verify the recipient's phone number before placing the order."); return;
    }
    if (paymentMethod === "PAY_LATER" && !canPayLater) {
      setOrderError(
        orderingForOther
          ? "Pay Later isn't available — the recipient isn't a verified Ladha customer. Payment will be on delivery."
          : !isLoggedIn
            ? "Sign in to use Pay Later. Guests can pay on delivery."
            : "Pay Later requires a verified account (PIN + OTP verification)."
      );
      return;
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
      setGuestOtp("");
      setGuestOtpError("");
      setGuestAccount(null);
      setGuestLoginPin("");
      setGuestLoginError("");
      setShowGuestIdentityModal(true);
      setGuestOtpState("sending");
      void sendGuestIdentityCode();
    }
  };

  const sendGuestIdentityCode = async () => {
    const res = await apiPost<{ message: string }>("/customers/phone-otp/send", { phone: phone.trim() });
    if (res.success) setGuestOtpState("sent");
    else setGuestOtpError(res.error || "We could not send a verification code.");
  };

  const confirmGuestIdentity = async (otpOverride = guestOtp) => {
    if (otpOverride.length < 4) { setGuestOtpError("Enter the full 4-digit code."); return; }
    setGuestOtpError("");
    const confirmation = await apiPost<{ message: string }>("/customers/phone-otp/confirm", { phone: phone.trim(), otp: otpOverride });
    if (!confirmation.success) { setGuestOtpError(confirmation.error || "The verification code is incorrect."); return; }

    const lookup = await apiGet<{ found: boolean; customer?: { hasPin?: boolean; firstName?: string; lastName?: string | null } }>(`/customers/lookup?phone=${encodeURIComponent(phone.trim())}`);
    if (!lookup.success) { setGuestOtpError(lookup.error || "We could not check this phone number."); return; }
    setGuestOtpState("verified");
    if (lookup.data?.found && lookup.data.customer?.hasPin) {
      setGuestAccount({ ...(lookup.data.customer!), hasPin: Boolean(lookup.data.customer!.hasPin) });
      return;
    }
    setShowGuestIdentityModal(false);
    submitOrder();
  };

  const signInGuestAccountAndPlaceOrder = async () => {
    if (guestLoginPin.length !== 4) { setGuestLoginError("Enter the 4-digit account PIN."); return; }
    setGuestLoginError("");
    setGuestLoginLoading(true);
    const result = await login(phone.trim(), guestLoginPin);
    setGuestLoginLoading(false);
    if (!result.success) { setGuestLoginError(result.error || "Unable to sign in to this account."); return; }
    setShowGuestIdentityModal(false);
    submitOrder();
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
      deliveryZoneId: selectedTownRegionId || undefined,
      items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })),
      paymentMethod,
      orderingForOther: orderingForOther || undefined,
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
          {isLoggedIn && customer && !orderingForOther && (
            <div className="bg-[#DCFCE7] border border-[#BBF7D0] rounded-2xl p-3.5 mb-5 flex items-center gap-2.5">
              <CheckCircle2 size={16} className="text-[#15803D]" />
              <span className="text-sm font-semibold text-[#15803D]">
                Details pre-filled from your saved account — {customer.firstName}{customer.lastName ? ` ${customer.lastName}` : ""}
              </span>
            </div>
          )}

          {/* Ordering on behalf of someone else */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4 mb-5">
            <button
              type="button"
              onClick={toggleOnBehalf}
              className={`w-full flex items-center justify-between text-left cursor-pointer bg-none border-none transition-colors ${orderingForOther ? "text-[#114B36]" : "text-[#1F2937]"}`}
            >
              <span className="flex items-center gap-2.5 text-sm font-bold">
                <Users size={18} className={orderingForOther ? "text-[#114B36]" : "text-[#6B7280]"} />
                {orderingForOther ? "Ordering for someone else" : "Ordering for someone else?"}
              </span>
              <span className={`w-10 h-6 rounded-full relative transition-colors ${orderingForOther ? "bg-[#114B36]" : "bg-[#D1D5DB]"}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${orderingForOther ? "left-[1.125rem]" : "left-0.5"}`} />
              </span>
            </button>
            {orderingForOther && (
              <p className="text-xs text-[#6B7280] mt-3 leading-relaxed">
                Enter the recipient's phone number below. Their account (or a guest profile against that number) will be
                linked to this order and delivery.
              </p>
            )}
          </div>

          {orderingForOther && (
            <div
              className={`rounded-2xl p-3.5 mb-5 flex items-start gap-2.5 border ${
                recipientLookupState === "found"
                  ? recipient?.isVerified
                    ? "bg-[#EBF5F0] border-[#114B36]/25 text-[#114B36]"
                    : "bg-[#FEF3C7] border-[#FCD34D] text-[#92400E]"
                  : recipientLookupState === "guest"
                    ? "bg-[#FEF3C7] border-[#FCD34D] text-[#92400E]"
                    : "bg-[#F3F4F6] border-[#E5E7EB] text-[#6B7280]"
              }`}
            >
              {recipientLookupState === "checking" ? (
                <>
                  <Info size={16} className="shrink-0 mt-0.5" />
                  <p className="text-xs font-semibold leading-relaxed">Checking this number…</p>
                </>
              ) : recipientLookupState === "found" && recipient ? (
                <>
                  <UserRound size={16} className="shrink-0 mt-0.5" />
                  <p className="text-xs font-semibold leading-relaxed">
                    You're ordering on behalf of <strong>{recipientDisplayName(recipient)}</strong>.
                    {recipient.isVerified
                      ? " Their verified account will be charged."
                      : " Their account isn't verified yet — payment will be on delivery."}
                  </p>
                </>
              ) : recipientLookupState === "guest" ? (
                <>
                  <Info size={16} className="shrink-0 mt-0.5" />
                  <p className="text-xs font-semibold leading-relaxed">
                    This number isn't registered with Ladha yet. The recipient will be treated as a guest — payment must be
                    on delivery.
                  </p>
                </>
              ) : (
                <>
                  <Info size={16} className="shrink-0 mt-0.5" />
                  <p className="text-xs font-semibold leading-relaxed">Enter a valid recipient phone number to check their account.</p>
                </>
              )}
            </div>
          )}

          {/* Recipient phone verification — required before placing the order */}
          {(recipientLookupState === "found" || recipientLookupState === "guest") && (
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4 mb-5">
              {recipientVerified ? (
                <div className="flex items-center gap-2.5 text-[#15803D]">
                  <ShieldCheck size={18} className="shrink-0" />
                  <div>
                    <p className="text-sm font-bold">Recipient's number verified</p>
                    <p className="text-xs text-[#6B7280]">This number confirmed the verification code sent to it.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1.5">
                    <ShieldCheck size={16} className="text-[#114B36] shrink-0" />
                    <p className="text-sm font-bold text-[#1F2937]">Verify the recipient's number</p>
                  </div>
                  <p className="text-xs text-[#6B7280] leading-relaxed mb-3">
                    To keep orders from being placed against a number without its owner's consent, a verification code will
                    be sent to <strong>{phone}</strong>. Confirm it below to continue.
                  </p>
                  {recipientVerifyState === "idle" ? (
                    <Button onClick={() => void sendRecipientCode()} loading={verifyLoading} fullWidth size="sm">
                      Send Verification Code
                    </Button>
                  ) : (
                    <>
                      {verifySuccess && (
                        <p className="text-sm font-semibold text-[#15803D] bg-[#DCFCE7] rounded-xl px-3 py-2 mb-2.5">{verifySuccess}</p>
                      )}
                      <SecureCodeInput
                        value={recipientOtp}
                        onChange={setRecipientOtp}
                        onComplete={(code) => void confirmRecipientCode(code)}
                        masked={false}
                        autoFocus
                        autoComplete="one-time-code"
                        label="Verification code"
                      />
                      {verifyError && (
                        <p className="text-sm font-semibold text-[#DC2626] bg-[#FEE2E2] rounded-xl px-3 py-2 mt-2.5">{verifyError}</p>
                      )}
                      <div className="flex gap-3 mt-3">
                        <Button variant="secondary" onClick={() => { setRecipientVerifyState("idle"); setVerifyError(""); setVerifySuccess(""); }} fullWidth size="sm">Back</Button>
                        <Button onClick={() => void confirmRecipientCode()} disabled={recipientOtp.length < 4 || verifyLoading} loading={verifyLoading} fullWidth size="sm">Verify</Button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

           {/* Own phone verification — delays surfacing of account details
               until the orderer confirms they hold the phone number.
               This prevents ghost data from appearing on shared browsers. */}
           {false && !phoneVerified && (
             <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4 mb-5">
               {ownPhoneVerifyState === "verified" ? (
                 <div className="flex items-center gap-2.5 text-[#15803D]">
                   <ShieldCheck size={18} className="shrink-0" />
                   <div>
                     <p className="text-sm font-bold">Phone verified</p>
                     <p className="text-xs text-[#6B7280]">Your delivery details are now available.</p>
                   </div>
                 </div>
               ) : (
                 <>
                   <div className="flex items-center gap-2 mb-1.5">
                     <ShieldCheck size={16} className="text-[#114B36] shrink-0" />
                     <p className="text-sm font-bold text-[#1F2937]">Verify your phone number</p>
                   </div>
                   <p className="text-xs text-[#6B7280] leading-relaxed mb-3">
                     Confirm your number before your saved delivery details appear. This prevents anyone else who
                     uses this browser from seeing your account information.
                   </p>
                   {ownPhoneVerifyState === "idle" ? (
                     <>
                       <Input
                         label="Phone number"
                         placeholder="e.g. 0712345678"
                         value={ownPhone}
                         onChange={(e) => setOwnPhone(e.target.value)}
                         icon={<Phone size={16} />}
                       />
                       <Button
                         onClick={() => { if (ownPhone.trim().length >= 9) void sendOwnPhoneCode(); }}
                         disabled={ownPhone.trim().length < 9 || ownVerifyLoading}
                         loading={ownVerifyLoading}
                         fullWidth
                         size="sm"
                         className="mt-2"
                       >
                         Send Code
                       </Button>
                     </>
                   ) : (
                     <>
                       {ownVerifySuccess && (
                         <p className="text-sm font-semibold text-[#15803D] bg-[#DCFCE7] rounded-xl px-3 py-2 mb-2.5">{ownVerifySuccess}</p>
                       )}
                       <SecureCodeInput
                         value={ownPhoneOtp}
                         onChange={setOwnPhoneOtp}
                         onComplete={(code) => void confirmOwnPhoneCode(code)}
                         masked={false}
                         autoFocus
                         autoComplete="one-time-code"
                         label="Verification code"
                       />
                       {ownVerifyError && (
                         <p className="text-sm font-semibold text-[#DC2626] bg-[#FEE2E2] rounded-xl px-3 py-2 mt-2.5">{ownVerifyError}</p>
                       )}
                       <div className="flex gap-3 mt-3">
                         <Button variant="secondary" onClick={() => { setOwnPhoneVerifyState("idle"); setOwnVerifyError(""); setOwnVerifySuccess(""); }} fullWidth size="sm">Back</Button>
                         <Button onClick={() => void confirmOwnPhoneCode()} disabled={ownPhoneOtp.length < 4 || ownVerifyLoading} loading={ownVerifyLoading} fullWidth size="sm">Verify</Button>
                       </div>
                     </>
                   )}
                 </>
               )}
             </div>
           )}

           <h2 className="text-lg font-bold text-[#1F2937] mb-4">Delivery Details</h2>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[#374151]">Delivery town</label>
              <select value={deliveryZone?.id ?? ""} onChange={(event) => changeDeliveryTown(event.target.value)} className="w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-3 text-sm text-[#1F2937] outline-none focus:border-[#114B36]" disabled={deliveryZones.length === 0}>
                {deliveryZones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}{zone.megaRegion ? ` · ${zone.megaRegion.name}` : ""}</option>)}
              </select>
              <p className="mt-1 text-xs text-[#6B7280]">Changing town updates the delivery fee. Hotels from other towns are not shown.</p>
            </div>

            {deliveryZone && deliveryZone.deliveryRegions && deliveryZone.deliveryRegions.length > 0 && (
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#374151]">Delivery Zone / Area in {deliveryZone.name}</label>
                <select value={selectedTownRegionId} onChange={(e) => changeDeliverySubRegion(e.target.value)} className="w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-3 text-sm text-[#1F2937] outline-none focus:border-[#114B36]">
                  {deliveryZone.deliveryRegions.map((region) => (
                    <option key={region.id} value={region.id}>{region.name}{region.isFallback ? " (General Area)" : ""}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-[#6B7280]">Select your specific local zone (e.g. Sokoni Modern Market, Bus Stage, General Delivery Area).</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="First Name *"
                placeholder={orderingForOther ? "Recipient's first name" : "e.g. Mary"}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={lockName}
              />
              <Input
                label="Last Name"
                placeholder={orderingForOther ? "Recipient's last name" : "e.g. Wanjiku"}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={lockName}
              />
            </div>
            <Input
              label="Known As (optional)"
              placeholder="e.g. Wa Alex, Mama Jane"
              value={knownName}
              onChange={(e) => setKnownName(e.target.value)}
              hint={orderingForOther ? "The recipient's public display name (auto-filled if known)" : "How the hotel staff knows you"}
              disabled={lockName}
            />
            <Input
              label={orderingForOther ? "Recipient Phone Number *" : "Phone Number *"}
              placeholder="07XXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              maxLength={14}
              disabled={lockPhone || (isLoggedIn && !orderingForOther)}
              hint={lockPhone ? "This phone number was used to identify the recipient." : isLoggedIn && !orderingForOther ? "Your account phone number identifies this order." : undefined}
            />
            <Input label={deliveryZone?.locationLabel ?? "Delivery point"} placeholder={deliveryZone?.locationPlaceholder ?? "e.g. building, landmark, market stall number e.g stall 93 or shop name"} value={stallNumber} onChange={(e) => setStallNumber(e.target.value)} />
            <Textarea label="Add directions" placeholder="e.g. near the main entrance or reception" value={locationDescription} onChange={(e) => setLocationDescription(e.target.value)} rows={3} />
          </div>

          {orderError && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="mt-4 bg-[#FEE2E2] text-[#DC2626] rounded-xl px-4 py-3 text-sm font-semibold"
            >{orderError}</motion.div>
          )}

          <div className="mt-6 space-y-3">
              <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-[#6B7280] mb-3">Payment Method</p>
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => { setPaymentMethod("PAY_ON_DELIVERY"); setShowVerifyPrompt(false); }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-colors cursor-pointer ${paymentMethod === "PAY_ON_DELIVERY" ? "bg-[#FEF3C7] text-[#D97706] border-[#D97706]" : "bg-white text-[#6B7280] border-[#E5E7EB] hover:border-[#D97706]"}`}
                  >
                    <span className="flex items-center gap-2"><CreditCard size={18} /> Pay on Delivery</span>
                    {paymentMethod === "PAY_ON_DELIVERY" && <CheckCircle2 size={16} />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (canPayLater) { setPaymentMethod("PAY_LATER"); setShowVerifyPrompt(false); }
                      else setShowVerifyPrompt(true);
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-colors ${canPayLater ? "cursor-pointer" : "cursor-not-allowed"} ${paymentMethod === "PAY_LATER" ? "bg-[#EBF5F0] text-[#114B36] border-[#114B36]" : "bg-white text-[#6B7280] border-[#E5E7EB] hover:border-[#114B36]"}`}
                  >
                    <span className="flex items-center gap-2"><Wallet size={18} /> Pay Later</span>
                    {!canPayLater && <span className="text-[0.6rem] font-bold px-2 py-0.5 rounded-full bg-[#F3F4F6] text-[#6B7280]">{orderingForOther ? "GUEST / UNVERIFIED" : "VERIFIED ACCOUNTS ONLY"}</span>}
                    {paymentMethod === "PAY_LATER" && <CheckCircle2 size={16} />}
                  </button>
                </div>

                {showVerifyPrompt && (
                  <div className="mt-3 bg-[#EBF5F0] border border-[#114B36]/20 rounded-xl p-3.5">
                    {orderingForOther ? (
                      <p className="text-xs font-semibold text-[#114B36] leading-relaxed">
                        Pay Later is credit against the recipient's account, so it requires the recipient to be a verified
                        Ladha customer. Since they aren't, payment will be on delivery.
                      </p>
                    ) : (
                      <>
                        <p className="text-xs font-semibold text-[#114B36] leading-relaxed">
                          Pay Later lets you settle after delivery, so it requires a verified account (PIN + OTP verification).
                        </p>
                        {onNavigateToVerify && (
                          <button
                            type="button"
                            onClick={onNavigateToVerify}
                            className="mt-2.5 px-4 py-2 bg-[#114B36] text-white rounded-lg text-xs font-bold hover:bg-[#0D3D2B] transition-colors cursor-pointer bg-none border-none"
                          >
                            Verify My Account →
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            <div className="flex items-center justify-between py-3 px-4 bg-white rounded-2xl border border-[#E5E7EB]">
              <span className="text-sm text-[#6B7280]">Food subtotal</span>
              <span className="text-sm font-bold text-[#1F2937]">KSh {totalAmount}</span>
            </div>
            <div className="flex items-center justify-between py-3 px-4 bg-white rounded-2xl border border-[#E5E7EB]">
              <span className="text-sm text-[#6B7280]">Delivery {deliveryFeeLoading ? "(calculating…)" : ""}</span>
              <span className="text-sm font-bold text-[#1F2937]">KSh {deliveryFee.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between py-3 px-4 bg-[#EBF5F0] rounded-2xl border border-[#BDD9CB]">
              <span className="text-sm font-bold text-[#114B36]">Order total</span>
              <span className="text-xl font-extrabold text-[#114B36]">KSh {(totalAmount + deliveryFee).toFixed(2)}</span>
            </div>
            {anyHotelClosed && (
              <div className="bg-[#FEF2F2] border border-[#FCA5A5] rounded-2xl p-4 text-center">
                <p className="font-bold text-sm text-[#DC2626]">Hotel is Currently Closed</p>
                <p className="text-xs text-[#991B1B] mt-1">Not accepting orders right now.</p>
              </div>
            )}
            <Button onClick={handlePlaceOrder} disabled={isSubmitting || deliveryFeeLoading || !firstName.trim() || !isValidPhone(phone.trim()) || (!marketSection && !locationDescription.trim() && !stallNumber.trim()) || anyHotelClosed} loading={isSubmitting || deliveryFeeLoading} fullWidth size="lg">
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
                {orderingForOther && recipient
                  ? <>By placing this order, you agree that the selected meals will be prepared and delivered to <strong>{recipientDisplayName(recipient)}</strong>. </>
                  : "By placing this order, you agree that your selected meals will be prepared and delivered to your location. "}
                <strong>Total: KSh {(totalAmount + deliveryFee).toFixed(2)}</strong>
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" fullWidth onClick={() => setShowConfirmModal(false)}>Cancel</Button>
                <Button fullWidth onClick={handleConfirmOrder}>Yes, Place Order</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Guest identity confirmation */}
      <AnimatePresence>
        {showGuestIdentityModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-sm"
            onClick={() => setShowGuestIdentityModal(false)}
          >
            <motion.div initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white rounded-3xl rounded-b-none sm:rounded-3xl w-full max-w-md p-6 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] sm:mx-4"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="w-14 h-14 rounded-2xl bg-[#EBF5F0] text-[#114B36] flex items-center justify-center mx-auto mb-4">
                <Phone size={24} />
              </div>
              {guestAccount ? (
                <>
                  <h3 className="text-lg font-bold text-[#1F2937] text-center mb-2">Account found</h3>
                  <p className="text-sm text-[#6B7280] text-center leading-relaxed mb-5">
                    A Ladha account registered to <strong>{phone}</strong> already exists. Sign in to link this order to that account.
                  </p>
                  <SecureCodeInput value={guestLoginPin} onChange={(value) => { setGuestLoginPin(value); setGuestLoginError(""); }} masked autoFocus label="Account PIN" error={Boolean(guestLoginError)} />
                  {guestLoginError && <p className="text-sm font-semibold text-[#DC2626] bg-[#FEE2E2] rounded-xl px-3 py-2 mt-2.5">{guestLoginError}</p>}
                  <div className="flex gap-3 mt-5">
                    <Button variant="secondary" fullWidth onClick={() => setShowGuestIdentityModal(false)}>Cancel</Button>
                    <Button fullWidth onClick={() => void signInGuestAccountAndPlaceOrder()} disabled={guestLoginPin.length < 4 || guestLoginLoading} loading={guestLoginLoading}>Sign in &amp; place order</Button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-[#1F2937] text-center mb-2">Confirm your phone number</h3>
                  <p className="text-sm text-[#6B7280] text-center leading-relaxed mb-5">
                    We sent a 4-digit code to <strong>{phone}</strong>. This confirms the phone identity that will own this order.
                  </p>
                  {guestOtpState === "sending" && !guestOtpError && <p className="text-sm text-center text-[#6B7280] mb-4">Sending verification code…</p>}
                  {guestOtpState === "sent" && <SecureCodeInput value={guestOtp} onChange={(value) => { setGuestOtp(value); setGuestOtpError(""); }} masked={false} autoFocus autoComplete="one-time-code" label="Phone verification code" error={Boolean(guestOtpError)} />}
                  {guestOtpError && <p className="text-sm font-semibold text-[#DC2626] bg-[#FEE2E2] rounded-xl px-3 py-2 mt-2.5">{guestOtpError}</p>}
                  <div className="flex gap-3 mt-5">
                    <Button variant="secondary" fullWidth onClick={() => setShowGuestIdentityModal(false)}>Cancel</Button>
                    {guestOtpState === "sending" && guestOtpError ? <Button fullWidth onClick={() => { setGuestOtpError(""); void sendGuestIdentityCode(); }}>Retry</Button> : <Button fullWidth onClick={() => void confirmGuestIdentity()} disabled={guestOtp.length < 4 || guestOtpState !== "sent"}>Verify number</Button>}
                  </div>
                </>
              )}
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
