import React from "react";
import { Star } from "lucide-react";

interface RatingStarsProps {
  rating?: number | null;
  count?: number;
  size?: number;
  className?: string;
}

export const RatingStars: React.FC<RatingStarsProps> = ({ rating, count = 0, size = 12, className = "" }) => {
  const rounded = rating ? Math.round(rating) : 0;
  return <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={rating ? `${rating.toFixed(1)} out of 5 stars from ${count} ratings` : "No ratings yet"}>{[1, 2, 3, 4, 5].map((value) => <Star key={value} size={size} fill={value <= rounded ? "currentColor" : "none"} className={value <= rounded ? "text-[#C58A1A]" : "text-[#D1D5DB]"} />)}<span className="ml-1 text-[0.62rem] font-bold text-[#A16207]">{rating ? `${rating.toFixed(1)}${count ? ` (${count})` : ""}` : "No ratings yet"}</span></span>;
};
