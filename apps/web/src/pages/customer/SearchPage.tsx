import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { apiGet } from "../../lib/api";
import { Search, Clock, Flame, X, MapPin } from "lucide-react";
import { Header } from "../../components/ui/Header";
import { PageTransition } from "../../components/ui/PageTransition";

interface SearchResult {
  id: string;
  name: string;
  hotelId: string;
  hotelName: string;
  hotelSlug: string;
  hotelIsOpen: boolean;
  hotelImageUrl: string | null;
  category: string;
  imageUrl: string;
  price: number;
  available: boolean;
  stockQty: number;
  relevance: number;
}

const POPULAR_SEARCHES = ["Chapati", "Nyama Choma", "Pilau", "Samosa", "Tea", "Coffee"];
const MAX_RECENT = 8;
const DEBOUNCE_MS = 250;

export const SearchPage: React.FC<{ onBack: () => void; onNavigateToMenu: () => void }> = ({
  onBack,
  onNavigateToMenu,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [showRecent, setShowRecent] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ladha_recent_searches");
      if (saved) setRecentSearches(JSON.parse(saved));
    } catch { /* ignore */ }
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const saveRecent = useCallback((term: string) => {
    if (!term.trim()) return;
    setRecentSearches((prev) => {
      const next = [term, ...prev.filter((s) => s !== term)].slice(0, MAX_RECENT);
      try { localStorage.setItem("ladha_recent_searches", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setShowRecent(true);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setShowRecent(false);
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
        const res = await apiGet<SearchResult[]>(`/hotels/search?q=${encodeURIComponent(query.trim())}`);
        if (res.success && res.data) setResults(res.data);
        else setResults([]);
      setIsSearching(false);
    }, DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const handleSelectResult = (result: SearchResult) => {
    saveRecent(result.name);
    onNavigateToMenu();
  };

  const handleRecentClick = (term: string) => {
    setQuery(term);
    saveRecent(term);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((p) => p + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((p) => Math.max(0, p - 1));
    } else if (e.key === "Enter") {
      const allItems = showRecent ? [...recentSearches, ...POPULAR_SEARCHES] : results;
      const idx = highlightedIndex;
      if (idx < allItems.length && typeof allItems[idx] === "string") {
        handleRecentClick(allItems[idx] as string);
      }
    } else if (e.key === "Escape") {
      onBack();
    }
  };

  return (
    <div className="app-container">
      <Header title="Search" onBack={onBack} />
      <PageTransition>
        <div className="px-4 py-5">
          <div className="relative mb-5">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setHighlightedIndex(0); }}
              onKeyDown={handleKeyDown}
              placeholder="Search meals, hotels, categories..."
              className="w-full bg-[#F3F4F6] rounded-2xl py-4 pl-12 pr-10 text-sm text-[#1F2937] placeholder:text-[#9CA3AF] outline-none focus:bg-white focus:ring-2 focus:ring-[#114B36]/20 transition-all"
              autoFocus
            />
            {query && (
              <button onClick={() => { setQuery(""); setShowRecent(true); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#6B7280] transition-colors bg-none border-none cursor-pointer">
                <X size={16} />
              </button>
            )}
          </div>

          {showRecent && !query && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Flame size={14} className="text-[#D97706]" />
                  <h3 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Popular Searches</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {POPULAR_SEARCHES.map((term) => (
                    <button key={term} onClick={() => handleRecentClick(term)}
                      className="px-4 py-2 rounded-full bg-[#FFF8F0] border border-[#FDE68A] text-xs font-semibold text-[#92400E] hover:bg-[#FDE68A] transition-colors bg-none cursor-pointer"
                    >{term}</button>
                  ))}
                </div>
              </div>
              {recentSearches.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Clock size={14} className="text-[#6B7280]" />
                    <h3 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Recent Searches</h3>
                  </div>
                  <div className="space-y-1.5">
                    {recentSearches.map((term) => (
                      <button key={term} onClick={() => handleRecentClick(term)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white hover:bg-[#FFF8F0] transition-colors text-left border border-[#F3F4F6] cursor-pointer"
                      >
                        <Search size={14} className="text-[#9CA3AF]" />
                        <span className="text-sm font-medium text-[#1F2937]">{term}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {isSearching && (
            <div className="flex flex-col items-center py-16">
              <div className="w-8 h-8 border-3 border-[#E5E7EB] border-t-[#114B36] rounded-full animate-spin" />
              <p className="text-sm text-[#9CA3AF] mt-4">Finding meals...</p>
            </div>
          )}

          {!isSearching && query && results.length === 0 && (
            <div className="flex flex-col items-center py-16 text-center">
              <Search size={40} className="text-[#D1D5DB] mb-3" />
              <p className="font-semibold text-[#6B7280]">No results for "{query}"</p>
              <p className="text-sm text-[#9CA3AF] mt-1">Try a different keyword or browse the menu</p>
            </div>
          )}

          {!isSearching && query && results.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#9CA3AF] mb-3">{results.length} result{results.length > 1 ? "s" : ""} for "{query}"</p>
              <div className="space-y-3">
                {results.map((result, idx) => (
                  <motion.div
                    key={result.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    className="flex gap-3 items-center p-3 bg-white rounded-2xl shadow-[0_1px_4px_rgba(17,75,54,0.04)] hover:shadow-[0_4px_12px_rgba(17,75,54,0.08)] transition-shadow cursor-pointer border border-transparent hover:border-[#E5E7EB]"
                    onClick={() => handleSelectResult(result)}
                  >
                    <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-[#F3F4F6]">
                      {result.imageUrl ? (
                        <img src={result.imageUrl} alt={result.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#9CA3AF] text-lg">🍽</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-sm text-[#1F2937] truncate">{result.name}</h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <MapPin size={10} className="text-[#9CA3AF]" />
                        <span className="text-[0.65rem] text-[#6B7280] font-medium">{result.hotelName}</span>
                        <span className="text-[0.6rem] text-[#D1D5DB]">•</span>
                        <span className="text-[0.65rem] text-[#9CA3AF]">{result.category}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-sm text-[#114B36]">KSh {result.price}</p>
                      {!result.available && (
                        <span className="text-[0.6rem] font-bold text-[#DC2626] bg-[#FEE2E2] px-2 py-0.5 rounded-full">Sold Out</span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      </PageTransition>
    </div>
  );
};