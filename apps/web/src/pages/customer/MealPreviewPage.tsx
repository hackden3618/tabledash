import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ShoppingBag, Utensils } from "lucide-react";
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
  const { cart, addToCart } = useCart();
  const [hotel, setHotel] = useState<PreviewHotel | null>(null);
  const [meal, setMeal] = useState<PreviewMeal | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <div className="min-h-dvh animate-pulse bg-[#10271E]" />;
  if (!meal || !hotel) return <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#10271E] px-6 text-center text-white"><Utensils size={38} className="text-white/60" /><h1 className="text-xl font-black">This meal is unavailable</h1><button onClick={onBack} className="rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-white backdrop-blur-xl">Back to menu</button></div>;

  return (
    <main className="fixed inset-0 z-[80] overflow-hidden bg-[#10271E] text-white">
      {meal.imageUrl ? <img src={meal.imageUrl} alt={meal.name} fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 grid place-items-center text-white/35"><Utensils size={80} /></div>}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/70 to-transparent" />
      <motion.button initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} onClick={onBack} className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] inline-flex h-11 items-center gap-2 rounded-full border border-white/20 bg-black/25 px-3.5 text-sm font-bold text-white shadow-lg backdrop-blur-xl"><ArrowLeft size={18} /> Back to menu</motion.button>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#03120C]/95 via-[#03120C]/65 to-transparent px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-28">
        <motion.section initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .08, type: "spring", stiffness: 260, damping: 25 }} className="mx-auto max-w-lg rounded-[1.5rem] border border-white/20 bg-white/15 p-4 shadow-[0_16px_44px_rgba(0,0,0,.25)] backdrop-blur-2xl">
          <div className="flex items-end justify-between gap-4"><div className="min-w-0"><p className="text-[.62rem] font-black uppercase tracking-[.16em] text-white/65">{hotel.name} · {meal.category}</p><h1 className="mt-1 truncate text-2xl font-black tracking-tight">{meal.name}</h1></div><p className="shrink-0 text-lg font-black">KSh {meal.price}</p></div>
          {canOrder ? <button onClick={() => addToCart({ id: meal.id, name: meal.name, price: meal.price, imageUrl: meal.imageUrl, hotelId: hotel.id, hotelName: hotel.name, stockQty: meal.stockQty })} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/25 bg-white px-4 text-sm font-black text-[#114B36] shadow-lg transition hover:bg-[#F3FBF6]"><ShoppingBag size={18} />{quantity ? `Add another · ${quantity} in cart` : "Add to order"}</button> : <div className="mt-4 rounded-xl bg-[#7D1711]/55 px-4 py-3 text-center text-xs font-black">{hotel.isOpen ? "This meal is currently sold out" : `${hotel.name} is currently closed`}</div>}
          {quantity > 0 && <button onClick={onOpenCart} className="mt-3 w-full border-none bg-transparent text-xs font-bold text-white/80 underline underline-offset-4">View order · {quantity} item{quantity === 1 ? "" : "s"}</button>}
        </motion.section>
      </div>
    </main>
  );
};
