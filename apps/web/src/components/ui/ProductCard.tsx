import React, { useState } from "react";
import { motion } from "framer-motion";
import { QuantitySelector, AddToCartButton } from "./QuantitySelector";
import { Badge } from "./Badge";

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
}

interface ProductCardProps {
  item: ProductCardItem;
  quantity: number;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  onQuantityChange: (quantity: number) => void;
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
      className={`
        relative flex gap-4 items-center p-4 bg-white rounded-2xl
        transition-shadow duration-200
        ${isOutOfStock ? "opacity-55 bg-[#FAFAFA]" : "shadow-[0_2px_8px_rgba(17,75,54,0.06)] hover:shadow-[0_8px_24px_rgba(17,75,54,0.1)]"}
      `}
    >
      <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-[#F3F4F6]">
        {item.imageUrl && !imgError ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#9CA3AF] text-2xl">
            🍽
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className={`font-semibold text-sm ${isOutOfStock ? "text-[#6B7280]" : "text-[#1F2937]"}`}>
          {item.name}
        </h3>
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

      <div className="shrink-0">
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
