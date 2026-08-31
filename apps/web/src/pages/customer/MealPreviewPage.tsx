import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ShoppingBag, Utensils, Star, Plus, Minus, Check } from "lucide-react";
import { apiGet } from "../../lib/api";
import { useCart } from "../../context/CartContext";

interface PreviewMeal {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
  price: number;
  available: boolean;
  stockQty: number;
  rating?: number | null;
  ratingCount?: number;
}

interface PreviewHotel {
  id: string;
  name: string;
  slug: string;
  isOpen: boolean;
}

export const MealPreviewPage: React.FC<{
  hotelSlug: string;
  productId: string;
  onBack: () => void;
  onOpenCart: () => void;
}> = ({ hotelSlug, productId, onBack, onOpenCart }) => {
  const { cart, addToCart, updateQuantity } = useCart();
  const [hotel, setHotel] = useState<PreviewHotel | null>(null);
  const [meal, setMeal] = useState<PreviewMeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [addedAnimation, setAddedAnimation] = useState(false);

  useEffect(() => {
    let active = true;
    void apiGet<{ hotel: PreviewHotel; products: PreviewMeal[] }>(`/hotels/by-slug/${encodeURIComponent(hotelSlug)}`).then((res) => {
      if (!active) return;
      if (res.success && res.data) {
        setHotel(res.data.hotel);
        setMeal(res.data.products.find((product) => product.id === productId) ?? null);
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [hotelSlug, productId]);

  const quantity = cart.find((item) => item.id === meal?.id)?.quantity ?? 0;
  const canOrder = Boolean(meal?.available && meal.stockQty > 0 && hotel?.isOpen);

  const handleAdd = () => {
    if (!meal || !hotel || !canOrder) return;
    addToCart({
      id: meal.id,
      name: meal.name,
      price: meal.price,
      imageUrl: meal.imageUrl,
      hotelId: hotel.id,
      hotelName: hotel.name,
      stockQty: meal.stockQty,
    });
    setAddedAnimation(true);
    setTimeout(() => setAddedAnimation(false), 1200);
  };

  if (loading) return <div className="min-h-dvh animate-pulse bg-[#10271E]" />;
  if (!meal || !hotel) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#10271E] px-6 text-center text-white">
        <Utensils size={38} className="text-white/60" />
        <h1 className="text-xl font-black">This meal is unavailable</h1>
        <button onClick={onBack} className="rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-white backdrop-blur-xl cursor-pointer">
          Back to menu
        </button>
      </div>
    );
  }

  return (
    <main className="fixed inset-0 z-[80] overflow-hidden bg-[#10271E] text-white">
      {meal.imageUrl ? (
        <img
          src={meal.imageUrl}
          alt={meal.name}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-white/35">
          <Utensils size={80} />
        </div>
      )}

      {/* Top Header bar with back button */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/80 via-black/40 to-transparent" />
      <div className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] right-4 flex items-center justify-between z-10">
        <motion.button
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={onBack}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-white/25 bg-black/40 px-4 text-sm font-bold text-white shadow-xl backdrop-blur-xl cursor-pointer"
        >
          <ArrowLeft size={18} /> Back
        </motion.button>
        <span className="rounded-full border border-white/20 bg-black/35 px-3 py-1.5 text-xs font-bold text-white/90 backdrop-blur-xl">
          {hotel.name}
        </span>
      </div>

      {/* Bottom Food Detail Card */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#03120C] via-[#03120C]/80 to-transparent px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-24">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="mx-auto max-w-lg rounded-[1.75rem] border border-white/20 bg-white/15 p-5 shadow-[0_20px_50px_rgba(0,0,0,.45)] backdrop-blur-2xl"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[0.62rem] font-black uppercase tracking-[0.14em] text-white/90">
                  {meal.category}
                </span>
                {meal.rating && (
                  <span className="inline-flex items-center gap-1 text-[0.68rem] font-bold text-[#FCD34D]">
                    <Star size={13} fill="currentColor" /> {meal.rating.toFixed(1)} {meal.ratingCount ? `(${meal.ratingCount})` : ""}
                  </span>
                )}
              </div>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-white">{meal.name}</h1>
              <p className="mt-1 text-xs text-white/75">Prepared fresh to order by {hotel.name}</p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-xs text-white/60 block">Price</span>
              <p className="text-xl font-black text-white">KSh {meal.price}</p>
            </div>
          </div>

          {canOrder ? (
            <div className="mt-5 space-y-3">
              {quantity === 0 ? (
                <button
                  onClick={handleAdd}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/30 bg-white px-5 text-sm font-black text-[#114B36] shadow-xl transition hover:bg-[#F3FBF6] active:scale-[0.98] cursor-pointer"
                >
                  <ShoppingBag size={18} /> Add to order · KSh {meal.price}
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex items-center rounded-2xl border border-white/30 bg-black/30 p-1 backdrop-blur-md">
                    <button
                      onClick={() => updateQuantity(meal.id, quantity - 1)}
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/20 border-none cursor-pointer"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="w-12 text-center text-sm font-black text-white">{quantity}</span>
                    <button
                      onClick={() => { if (quantity < meal.stockQty) updateQuantity(meal.id, quantity + 1); }}
                      disabled={quantity >= meal.stockQty}
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-40 border-none cursor-pointer"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <button
                    onClick={onOpenCart}
                    className="flex-1 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#114B36] border border-[#22C55E]/40 px-4 text-sm font-black text-white shadow-lg transition hover:bg-[#0D3B2A] cursor-pointer"
                  >
                    {addedAnimation ? (
                      <span className="flex items-center gap-1.5 text-[#86EFAC]"><Check size={16} strokeWidth={3} /> Added!</span>
                    ) : (
                      <span>View Cart (KSh {quantity * meal.price})</span>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl bg-[#7D1711]/60 border border-white/10 px-4 py-3 text-center text-xs font-black text-white">
              {hotel.isOpen ? "This meal is currently sold out" : `${hotel.name} is currently closed`}
            </div>
          )}

          {quantity > 0 && (
            <button
              onClick={onOpenCart}
              className="mt-3 w-full border-none bg-transparent text-center text-xs font-bold text-white/80 hover:text-white underline underline-offset-4 cursor-pointer"
            >
              Go to checkout →
            </button>
          )}
        </motion.section>
      </div>
    </main>
  );
};
