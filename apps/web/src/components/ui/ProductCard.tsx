import React, { useState } from "react";
import { motion } from "framer-motion";
import { Expand } from "lucide-react";
import { QuantitySelector, AddToCartButton } from "./QuantitySelector";
import { Badge } from "./Badge";
import { RatingStars } from "./RatingStars";

export interface ProductCardItem {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
  price: number;
  available: boolean;
  stockQty: number;
  lastRestockedAt?: string | null;
  outOfStockSince?: string | null;
  rating?: number | null;
  ratingCount?: number;
}

interface ProductCardProps {
  item: ProductCardItem;
  quantity: number;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  onQuantityChange: (quantity: number) => void;
  onPreview?: () => void;
  disabled?: boolean;
}

const getStockInfo = (item: ProductCardItem) => {
  if (!item.available || item.stockQty === 0) return null;
  if (item.stockQty <= 2) return { text: `Only ${item.stockQty} left!`, variant: "danger" as const };
  if (item.stockQty <= 5) return { text: `${item.stockQty} left`, variant: "warning" as const };
  return { text: `${item.stockQty} available`, variant: "success" as const };
};

const getFreshnessText = (item: ProductCardItem) => {
  if (!item.outOfStockSince) return null;
  const diffMs = Date.now() - new Date(item.outOfStockSince).getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  const diffM = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return diffH > 0 ? `Out for ${diffH}h ${diffM}m` : `Out for ${diffM}m`;
};

export const ProductCard: React.FC<ProductCardProps> = ({
  item,
  quantity,
  onAdd,
  onIncrement,
  onDecrement,
  onQuantityChange,
  onPreview,
  disabled = false,
}) => {
  const [imgError, setImgError] = useState(false);
  const stockInfo = getStockInfo(item);
  const isOutOfStock = !item.available || item.stockQty <= 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => { if (item.imageUrl && !imgError) onPreview?.(); }}
      className={`
        glass-surface relative grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-3 p-3.5 rounded-2xl cursor-pointer sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:gap-x-4 sm:p-4
        transition-shadow duration-200
        ${isOutOfStock ? "opacity-55 bg-[#FAFAFA]" : "shadow-[0_2px_8px_rgba(17,75,54,0.06)] hover:shadow-[0_8px_24px_rgba(17,75,54,0.1)]"}
      `}
    >
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); if (item.imageUrl && !imgError) onPreview?.(); }}
        disabled={!item.imageUrl || imgError}
        className="group/image relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-2xl border-none bg-[#F3F4F6] p-0 text-left disabled:cursor-default sm:h-24 sm:w-24"
        aria-label={item.imageUrl && !imgError ? `View ${item.name} photo` : undefined}
      >
        {item.imageUrl && !imgError ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition duration-500 group-hover/image:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#9CA3AF] text-2xl">
            🍽
          </div>
        )}
        {item.imageUrl && !imgError && <span className="absolute inset-0 grid place-items-center bg-[#10271E]/0 text-white opacity-0 transition group-hover/image:bg-[#10271E]/35 group-hover/image:opacity-100"><span className="rounded-full bg-black/30 p-2 backdrop-blur-sm"><Expand size={16} /></span></span>}
      </button>

      <div className="min-w-0 self-center">
        <h3 className={`line-clamp-2 font-semibold text-sm leading-snug ${isOutOfStock ? "text-[#6B7280]" : "text-[#1F2937]"}`}>
          {item.name}
        </h3>
        <RatingStars rating={item.rating} count={item.ratingCount} className="mt-0.5" />
        <p className={`font-bold text-base mt-0.5 ${isOutOfStock ? "text-[#6B7280]" : "text-[#114B36]"}`}>
          KSh {item.price}
        </p>
        {stockInfo && !isOutOfStock && (
          <div className="mt-1">
            <Badge variant={stockInfo.variant} size="sm">
              {stockInfo.text}
            </Badge>
          </div>
        )}
        {isOutOfStock && getFreshnessText(item) && (
          <p className="text-[0.65rem] text-[#DC2626] font-semibold mt-1">
            {getFreshnessText(item)}
          </p>
        )}
      </div>

      <div className="col-span-2 flex min-w-0 justify-end border-t border-[#E7EEE9] pt-3 sm:col-span-1 sm:border-0 sm:pt-0" onClick={(event) => event.stopPropagation()}>
        {isOutOfStock ? (
          <span className="text-[0.65rem] font-bold text-[#DC2626] bg-[#FEE2E2] px-3 py-1.5 rounded-lg uppercase tracking-wide">
            Sold Out
          </span>
        ) : quantity === 0 ? (
          <AddToCartButton onClick={onAdd} disabled={disabled} />
        ) : (
          <QuantitySelector
            quantity={quantity}
            onIncrement={onIncrement}
            onDecrement={onDecrement}
            onQuantityChange={onQuantityChange}
            max={item.stockQty}
            disabled={disabled}
          />
        )}
      </div>

    </motion.div>
  );
};
